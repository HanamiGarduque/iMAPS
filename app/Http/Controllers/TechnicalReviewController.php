<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Http\Request;
use Inertia\Inertia;

class TechnicalReviewController extends Controller
{
    public function index(Request $request)
    {
        // 1. Fetch only applications in "Technical Review"
        $query = ZoningApplication::query()
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.application_type',
                'zoning_applications.land_use_class',
                'zoning_applications.status',
                'zoning_applications.applicant_name',
                'zoning_applications.barangay',
                'zoning_applications.created_at'
            )
            ->with(['parcels' => function($q) {
                // Fetch coordinates so the Leaflet map can plot them
                $q->select('zoning_application_id', 'latitude', 'longitude');
            }])
            ->where('zoning_applications.status', 'Technical Review');

        // 2. Apply filters specific to the Technical Review page
        if ($request->filled('application_type')) {
            $query->where('zoning_applications.application_type', $request->application_type);
        }

        if ($request->filled('search')) {
            $query->where(function ($q) use ($request) {
                $q->whereILike('zoning_applications.applicant_name', '%' . $request->search . '%')
                  ->orWhereILike('zoning_applications.reference_number', '%' . $request->search . '%');
            });
        }

        $applications = $query
            ->orderByDesc('zoning_applications.created_at')
            ->orderByDesc('zoning_applications.id')
            ->paginate(25)
            ->withQueryString();

        // 3. Transform the collection so the frontend map receives top-level latitude/longitude
        $applications->getCollection()->transform(function ($app) {
            // Find the first parcel that has valid coordinates
            $parcel = $app->parcels->firstWhere(function($p) {
                return !is_null($p->latitude) && !is_null($p->longitude);
            });
            
            $app->latitude = $parcel ? $parcel->latitude : null;
            $app->longitude = $parcel ? $parcel->longitude : null;
            
            // Remove the parcels array to keep the payload clean
            unset($app->parcels);
            
            return $app;
        });

        // 4. Render the specific TechnicalReview.jsx file
        return Inertia::render('Applications/TechnicalReview', [
            'applications' => $applications,
            'filters'      => $request->only(['application_type', 'search']),
        ]);
    }
}