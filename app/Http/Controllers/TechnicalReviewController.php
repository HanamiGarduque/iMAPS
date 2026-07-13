<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Models\User;
use App\Models\TechnicalReview;
use App\Models\SiteInspection; // Ensure this is imported if used

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class TechnicalReviewController extends Controller
{
    public function index(Request $request)
    {
        $query = ZoningApplication::query()
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.application_type',
                'zoning_applications.land_use_class',
                'zoning_applications.status',
                'zoning_applications.applicant_name',
                'zoning_applications.barangay',
                'zoning_applications.created_at',
            )
            ->with(['parcels' => function($q) {
                $q->select(
                    'zoning_application_id', 
                    'latitude', 
                    'longitude',
                    'property_index_number',
                    'lot_number',
                    'tct_number',
                    'tax_dec_number',
                    'lot_area_sqm'
                );
            }])
            ->where('zoning_applications.status', 'Technical Review');

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

        $applications->getCollection()->transform(function ($app) {
            $firstParcel = $app->parcels->first();
            $mappedParcel = $app->parcels->firstWhere(function($p) {
                return !is_null($p->latitude) && !is_null($p->longitude);
            }) ?? $firstParcel;
            
            $app->latitude = $mappedParcel ? $mappedParcel->latitude : null;
            $app->longitude = $mappedParcel ? $mappedParcel->longitude : null;
            
            $app->property_index_number = $firstParcel ? $firstParcel->property_index_number : null;
            $app->lot_number = $firstParcel ? $firstParcel->lot_number : null;
            $app->tct_number = $firstParcel ? $firstParcel->tct_number : null;
            $app->tax_dec_number = $firstParcel ? $firstParcel->tax_dec_number : null;
            $app->lot_area_sqm = $firstParcel ? $firstParcel->lot_area_sqm : null;
            
            unset($app->parcels);
            return $app;
        });

        // Fetch specifically Site Inspectors
        $inspectors = User::where('role', 'Site Inspector')
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return Inertia::render('TechnicalReview/Index', [
            'applications' => $applications,
            'filters'      => $request->only(['application_type', 'search']),
            'inspectors'   => $inspectors,
        ]);
    }

    /**
     * Handle the submission of the Technical Review Action Drawer.
     */
    public function updateStatus(Request $request)
    {
        $validated = $request->validate([
            'id'                 => 'required|exists:zoning_applications,id',
            'decision'           => 'required|string',
            'zoning_compliant'   => 'boolean',
            'documents_complete' => 'boolean',
            'land_use_compliant' => 'boolean',
            'findings'           => 'nullable|string',
            'decision_reason'    => 'required_if:decision,Declined|nullable|string',
            
            // Validation for Site Inspection assignment
            'inspector_id'       => 'required_if:decision,Needs Site Inspection|nullable|exists:users,id',
            'scheduled_date'     => 'required_if:decision,Needs Site Inspection|nullable|date|after_or_equal:today',
        ]);

        DB::transaction(function () use ($validated) {
            $application = ZoningApplication::findOrFail($validated['id']);
            
            // 1. Update main application status
            $application->status = $validated['decision'];
            $application->save();

            // 2. Handle Site Inspection generation
            $siteInspectionId = null;
            if ($validated['decision'] === 'Needs Site Inspection') {
                $inspection = $application->siteInspections()->create([
                    'inspector_id'   => $validated['inspector_id'],
                    'scheduled_date' => $validated['scheduled_date'],
                    'status'         => 'Pending',
                ]);
                $siteInspectionId = $inspection->id;
            }

            // 3. Determine the review round (auto-increment based on previous reviews)
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;

            // 4. Log the Technical Review using the provided model
            TechnicalReview::create([
                'zoning_application_id'   => $application->id,
                'reviewed_by'             => auth()->id(),
                'review_round'            => $currentRound + 1,
                'decision'                => $validated['decision'],
                'zoning_compliant'        => $validated['zoning_compliant'] ?? false,
                'documents_complete'      => $validated['documents_complete'] ?? false,
                'land_use_compliant'      => $validated['land_use_compliant'] ?? false,
                'findings'                => $validated['findings'],
                'decision_reason'         => $validated['decision_reason'],
                'site_inspection_task_id' => $siteInspectionId,
                'reviewed_at'             => now(),
            ]);
        });

        return redirect()->back()->with('success', 'Review processed successfully.');
    }
}