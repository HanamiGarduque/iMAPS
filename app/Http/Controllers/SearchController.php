<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\ZoningApplication;
use App\Models\Parcel;

class SearchController extends Controller
{
    /**
     * Point-in-polygon lookup against the official CLUP plan (land_use_plan.geom)
     * for the parcel's own coordinates — the ground truth for "is this TCT
     * actually sitting in the zone it's being checked against", independent of
     * whatever land_use_class happens to be recorded on the parcel row.
     *
     * land_use_plan.geom is declared SRID 4326 but many rows still hold raw
     * Philippines Zone III eastings/northings (values in the 500,000s/
     * 1,500,000s) — ST_SRID() alone won't catch that since the column
     * metadata itself claims 4326. Same bounding-box detection MapController
     * already uses for this table: real lon/lat never exceeds 180/90.
     */
    private function resolveClupZoneAt(?float $lat, ?float $lng): ?string
    {
        if ($lat === null || $lng === null) {
            return null;
        }

        $match = DB::selectOne(
            "SELECT lup_2030 FROM land_use_plan
             WHERE geom IS NOT NULL
               AND ST_Intersects(
                     ST_MakeValid(ST_Force2D(
                         CASE
                             WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                             WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                             WHEN ST_SRID(geom) != 4326 THEN ST_Transform(geom, 4326)
                             ELSE geom
                         END
                     )),
                     ST_SetSRID(ST_MakePoint(?, ?), 4326)
                   )
             LIMIT 1",
            [$lng, $lat]
        );

        return $match->lup_2030 ?? null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // VERIFY PARCEL — GET /api/parcels/verify?code=...
    // Looks up a parcel by TCT number or Tax Declaration number so the Permits
    // & Status map layer can confirm a parcel exists and check its linked
    // application (if any) before an applicant starts a new filing.
    // ─────────────────────────────────────────────────────────────────────────
    public function verifyParcel(Request $request)
    {
        $code = trim((string) $request->query('code', ''));

        if ($code === '') {
            return response()->json([
                'found' => false,
                'message' => 'A TCT or Tax Declaration number is required.',
            ], 422);
        }

        $normalized = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));

        $parcel = Parcel::with('zoningApplication')
            ->whereRaw("UPPER(REGEXP_REPLACE(tct_number, '[^A-Za-z0-9]', '', 'g')) = ?", [$normalized])
            ->orWhereRaw("UPPER(REGEXP_REPLACE(tax_dec_number, '[^A-Za-z0-9]', '', 'g')) = ?", [$normalized])
            ->latest('id')
            ->first();

        if (!$parcel) {
            return response()->json([
                'found' => false,
                'message' => "No parcel found for \"{$code}\".",
            ], 404);
        }

        $application = $parcel->zoningApplication;
        $clupZoneCode = $this->resolveClupZoneAt(
            $parcel->latitude !== null ? (float) $parcel->latitude : null,
            $parcel->longitude !== null ? (float) $parcel->longitude : null
        );

        return response()->json([
            'found' => true,
            'parcel' => [
                'id' => $parcel->id,
                'parcel_code' => $parcel->parcel_code,
                'tct_number' => $parcel->tct_number,
                'tax_dec_number' => $parcel->tax_dec_number,
                'lot_number' => $parcel->lot_number,
                'barangay' => $parcel->barangay,
                'land_use_class' => $parcel->land_use_class,
                'clup_zone_code' => $clupZoneCode,
                'lot_area_sqm' => $parcel->lot_area_sqm,
                'latitude' => $parcel->latitude,
                'longitude' => $parcel->longitude,
                'owner_name' => $parcel->owner_name,
                'location_address' => $parcel->location_address,
                'property_index_number' => $parcel->property_index_number,
            ],
            'application' => $application ? [
                'id' => $application->id,
                'reference_number' => $application->reference_number,
                'status' => $application->status,
                'application_type' => $application->application_type,
                'applicant_name' => $application->applicant_name,
                'target_land_use_class' => $application->target_land_use_class,
                'barangay' => $application->barangay,
            ] : null,
        ]);
    }

    public function globalSearch(Request $request)
    {
        $q = $request->query('q');

        if (empty($q)) {
            return response()->json([]);
        }

        $searchTerm = '%' . strtolower($q) . '%';
        $results = [];

        // 1. Dynamic Barangay Search from PostGIS Table
        $barangays = DB::table('barangay_boundary')
            ->select('location')
            ->whereRaw('LOWER(location) LIKE ?', [$searchTerm])
            ->limit(5)
            ->get();

        foreach ($barangays as $bgy) {
            if (!empty($bgy->location)) {
                $results[] = [
                    'label' => $bgy->location,
                    'fullName' => $bgy->location . ' Barangay',
                    'type' => 'Barangay',
                    'path' => null 
                ];
            }
        }

        // 2. Comprehensive Database Application & Parcel Search
        $applications = ZoningApplication::where(function ($query) use ($searchTerm) {
            // Search ZoningApplication textual columns
            $query->whereRaw('LOWER(reference_number) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(form_number) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(applicant_name) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(contact_number) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(email) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(representative_name) LIKE ?', [$searchTerm])
                  ->orWhereRaw('LOWER(or_number) LIKE ?', [$searchTerm])
                  
                  // Search related Parcel columns
                  ->orWhereHas('parcels', function ($parcelQuery) use ($searchTerm) {
                      $parcelQuery->whereRaw('LOWER(parcel_code) LIKE ?', [$searchTerm])
                                  ->orWhereRaw('LOWER(lot_number) LIKE ?', [$searchTerm])
                                  ->orWhereRaw('LOWER(tct_number) LIKE ?', [$searchTerm])
                                  ->orWhereRaw('LOWER(tax_dec_number) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(property_index_number) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(arp_number) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(survey_number) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(location_address) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(barangay) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(owner_name) LIKE ?', [$searchTerm])
                                              ->orWhereRaw('LOWER(land_use_class) LIKE ?', [$searchTerm]);
                  });
        })->limit(10)->get();

        foreach ($applications as $app) {
            $results[] = [
                'label' => $app->applicant_name,
                'fullName' => $app->reference_number . ' • ' . $app->application_type,
                'type' => 'Application',
                'path' => '/applications/' . $app->id
            ];
        }

        return response()->json($results);
    }
}