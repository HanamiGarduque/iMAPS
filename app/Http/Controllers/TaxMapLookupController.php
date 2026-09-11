<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class TaxMapLookupController extends Controller
{
    private function resolveLandUseClassFromPlan($parcelId): ?string
    {
        if ($parcelId === null || $parcelId === '') {
            return null;
        }

        $match = DB::selectOne(
            "
            SELECT lup.lup_2030 AS land_use_class
            FROM public.land_use_plan AS lup
            JOIN public.land_parcels AS lp ON lp.id = :parcel_id
            WHERE lup.geom IS NOT NULL
              AND lp.geom IS NOT NULL
              AND ST_Intersects(lup.geom, lp.geom)
            LIMIT 1
            ",
            ['parcel_id' => $parcelId]
        );

        return $match->land_use_class ?? null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LOOKUP — GET /api/tax-map/lookup/{pin}
    // Queries the municipal parcel data directly from the database, matching the
    // same pattern used for the barangay and municipal boundary layers.
    // ─────────────────────────────────────────────────────────────────────────
    public function lookup(string $pin): JsonResponse
    {
        $pin = trim((string) $pin);

        if ($pin === '') {
            return response()->json([
                'found'   => false,
                'message' => 'Property Index Number is required.',
            ], 422);
        }

        $normalizedPin = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $pin));

        if ($normalizedPin === '') {
            return response()->json([
                'found'   => false,
                'message' => 'Property Index Number is required.',
            ], 422);
        }

        $parcel = DB::table('public.land_parcels')
            ->where(function ($query) use ($pin, $normalizedPin) {
                $query->whereRaw('UPPER(REPLACE(REPLACE(REPLACE(property_index_number, ?, ""), ?, ""), ?, "")) = ?', ['-', ' ', '.', $normalizedPin])
                    ->orWhere('property_index_number', $pin)
                    ->orWhere('property_index_number', trim($pin));
            })
            ->first();

        if (!$parcel) {
            return response()->json([
                'found'   => false,
                'message' => "No parcel found for PIN \"{$pin}\".",
            ], 404);
        }

        $recordedLandUseClass = $parcel->land_use_class ?? null;
        $zoningPlanClass = $this->resolveLandUseClassFromPlan($parcel->id ?? null);
        $landUseClass = $recordedLandUseClass ?? $zoningPlanClass;

        return response()->json([
            'found' => true,
            'data'  => [
                'property_index_number' => $parcel->property_index_number ?? null,
                'barangay' => $parcel->barangay ?? null,
                'tct_number' => $parcel->tct_number ?? null,
                'tax_dec_number' => $parcel->tax_dec_number ?? null,
                'lot_area_sqm' => $parcel->lot_area_sqm ?? null,
                'land_use_class' => $landUseClass,
                'recorded_land_use_class' => $recordedLandUseClass,
                'zoning_plan_class' => $zoningPlanClass,
                'lot_number' => $parcel->lot_number ?? null,
                'location_address' => $parcel->location_address ?? null,
                'owner_name' => $parcel->owner_name ?? null,
                'arp_number' => $parcel->arp_number ?? null,
                'survey_number' => $parcel->survey_number ?? null,
                'coordinates' => null,
            ],
        ]);
    }
}