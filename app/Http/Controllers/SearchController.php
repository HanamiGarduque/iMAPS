<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\ZoningApplication;

class SearchController extends Controller
{
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