<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Jobs\PushInspectionToSupabase;
use App\Models\User;
use App\Models\TechnicalReview;
use App\Models\SiteInspection;
use App\Services\AuditLogger;
use App\Services\ApplicationStatusTracker;

use Illuminate\Support\Facades\Log; // For placeholder SMS logic
use Illuminate\Support\Facades\Http;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
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
            ->with(['parcels' => function ($q) {
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
            $mappedParcel = $app->parcels->firstWhere(function ($p) {
                return !is_null($p->latitude) && !is_null($p->longitude);
            }) ?? $firstParcel;

            $app->latitude = $mappedParcel ? $mappedParcel->latitude : null;
            $app->longitude = $mappedParcel ? $mappedParcel->longitude : null;

            $app->property_index_number = $firstParcel ? $firstParcel->property_index_number : null;
            $app->lot_number = $firstParcel ? $firstParcel->lot_number : null;
            $app->tct_number = $firstParcel ? $firstParcel->tct_number : null;
            $app->tax_dec_number = $firstParcel ? $firstParcel->tax_dec_number : null;
            $app->lot_area_sqm = $firstParcel ? $firstParcel->lot_area_sqm : null;

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
            'findings'           => 'nullable|string',
            'decision_reason'    => 'required_if:decision,Declined|nullable|string',

            // Validation for Site Inspection assignment
            'inspector_id'       => 'required_if:decision,Needs Site Inspection|nullable|exists:users,id',
            'scheduled_date'     => 'required_if:decision,Needs Site Inspection|nullable|date|after_or_equal:today',
            'deadline_date'      => 'required_if:decision,Needs Site Inspection|nullable|date|after_or_equal:scheduled_date',
            'assigned_notes'     => 'nullable|string',

            // Allow an optional parcel_id in case this is called for a single specific parcel
            'parcel_id'          => 'nullable|exists:parcels,id',
        ]);

        DB::transaction(function () use ($validated) {
            // Eager load parcels so we can extract the parcel_id
            $application = ZoningApplication::with('parcels')->findOrFail($validated['id']);
            $oldStatus = $application->status;

            // 1. Update main application status ONLY if it's a final decision
            if ($validated['decision'] === 'Approved') {
                $application->status = 'Under Sangguniang Bayan';
            } elseif ($validated['decision'] === 'Declined') {
                $application->status = 'Denied';
            }

            if ($application->isDirty('status')) {
                $application->save();
            }

            // 2. Process Technical Reviews & Site Inspections while ensuring PARCEL_ID is stored
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;
            $nextRound = $currentRound + 1;

            // If a specific parcel_id was sent from the frontend, use it. 
            // Otherwise, apply this decision to ALL parcels in the application.
            $parcelsToProcess = !empty($validated['parcel_id'])
                ? $application->parcels->where('id', $validated['parcel_id'])
                : $application->parcels;

            foreach ($parcelsToProcess as $parcel) {
                $siteInspectionId = null;

                if ($validated['decision'] === 'Needs Site Inspection') {
                    // Prevent duplicate parcel site inspections by using updateOrCreate
                    $inspection = SiteInspection::updateOrCreate(
                        [
                            'zoning_application_id' => $application->id,
                            'parcel_id'             => $parcel->id, 
                        ],
                        [
                            'inspector_id'          => $validated['inspector_id'],
                            'scheduled_date'        => $validated['scheduled_date'],
                            'deadline_date'         => $validated['deadline_date'],
                            'assigned_notes'        => $validated['assigned_notes'] ?? null,
                            'status'                => 'Pending',
                        ]
                    );
                    $siteInspectionId = $inspection->id;
                    // Dispatch the Sync Job
    PushInspectionToSupabase::dispatch($inspection);
                }

                // Create the technical review row for the parcel
                TechnicalReview::create([
                    'zoning_application_id'   => $application->id,
                    'parcel_id'               => $parcel->id,
                    'reviewed_by'             => auth()->id(),
                    'review_round'            => $nextRound,
                    'decision'                => $validated['decision'],
                    'findings'                => $validated['findings'] ?? null,
                    'decision_reason'         => $validated['decision_reason'] ?? null,
                    'site_inspection_task_id' => $siteInspectionId,
                    'reviewed_at'             => now(),
                ]);
            }

            // 3. Audit Logs, Trackers, and SMS
            if (in_array($validated['decision'], ['Approved', 'Declined'])) {
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    $application->status
                );

                $note = "Technical review completed: {$validated['decision']}. Status changed from \"{$oldStatus}\" to \"{$application->status}\".";
                if (!empty($validated['findings'])) {
                    $note .= " Findings: {$validated['findings']}";
                }

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'TECHNICAL_REVIEW_' . strtoupper(str_replace(' ', '_', $validated['decision'])),
                    performedBy: auth()->id(),
                    note: $note
                );

                // Placeholder SMS notification
                Log::info("PLACEHOLDER SMS - To: {$application->contact_number} | Message: Good day! Your application {$application->reference_number} has completed Technical Review and is now '{$application->status}'.");
            } elseif ($validated['decision'] === 'Needs Site Inspection') {
                $note = "Technical review requires site inspection.";
                if (!empty($validated['findings'])) {
                    $note .= " Findings: {$validated['findings']}";
                }

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION',
                    performedBy: auth()->id(),
                    note: $note
                );

                // Placeholder SMS notification for Site Inspection
                Log::info("PLACEHOLDER SMS - To: {$application->contact_number} | Message: Good day! Your application {$application->reference_number} requires a Site Inspection scheduled on {$validated['scheduled_date']}.");
            }
        });

        return redirect('/applications')->with('success', 'Technical review processed successfully.');
    }

    /**
     * Handle the submission of the per-parcel Technical Review batch form
     * (Applications/Show.jsx — used only while status === 'Technical Review').
     *
     * Each parcel gets its own TechnicalReview row (and its own SiteInspection
     * row if flagged). The application's overall status is then rolled up
     * from all parcel decisions using a "most restrictive wins" precedence:
     *   Declined > Needs Site Inspection > Approved
     */
    public function submitBatch(Request $request)
    {
        $validated = $request->validate([
            'application_id'                     => 'required|exists:zoning_applications,id',
            'reviews'                            => 'required|array|min:1',
            'reviews.*.decision'                 => 'required|string|in:Approved,Needs Site Inspection,Declined',
            'reviews.*.findings'                 => 'nullable|string',
            'reviews.*.decision_reason'          => 'nullable|string',
            'reviews.*.inspector_id'             => 'nullable|exists:users,id',
            'reviews.*.scheduled_date'           => 'nullable|date|after_or_equal:today',
            'reviews.*.deadline_date'            => 'nullable|date|after_or_equal:reviews.*.scheduled_date', 
            'reviews.*.assigned_notes'           => 'nullable|string',
        ]);

        $application = ZoningApplication::with('parcels:id,zoning_application_id')
            ->findOrFail($validated['application_id']);
        $validParcelIds = $application->parcels->pluck('id')->all();

        // Manual per-decision validation (conditional requirements differ per row,
        // which Laravel's required_if can't express cleanly across wildcard arrays).
        foreach ($validated['reviews'] as $parcelId => $review) {
            if (!in_array((int) $parcelId, $validParcelIds, true)) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId" => 'This parcel does not belong to the specified application.',
                ]);
            }

            if (
                $review['decision'] === 'Needs Site Inspection'
                && (empty($review['inspector_id']) || empty($review['scheduled_date']) || empty($review['deadline_date']))
            ) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId.inspector_id" => 'Inspector, scheduled date, and deadline are required when the decision is "Needs Site Inspection".',
                ]);
            }

            if ($review['decision'] === 'Declined' && empty($review['decision_reason'])) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId.decision_reason" => 'A decision reason is required when the decision is "Declined".',
                ]);
            }
        }

        DB::transaction(function () use ($application, $validated) {
            $reviews = $validated['reviews'];

            // Shared review round across all parcels for this single submission.
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;
            $nextRound = $currentRound + 1;

            $decisionsSeen = [];

            foreach ($reviews as $parcelId => $review) {
                $decisionsSeen[] = $review['decision'];

                $siteInspectionId = null;
                if ($review['decision'] === 'Needs Site Inspection') {
                    // Prevent duplicate parcel site inspections by using updateOrCreate
                    $inspection = SiteInspection::updateOrCreate(
                        [
                            'zoning_application_id' => $application->id,
                            'parcel_id'             => $parcelId,
                        ],
                        [
                            'inspector_id'          => $review['inspector_id'],
                            'scheduled_date'        => $review['scheduled_date'],
                            'deadline_date'         => $review['deadline_date'], 
                            'assigned_notes'        => $review['assigned_notes'] ?? null,
                            'status'                => 'Pending',
                        ]
                    );

                    $siteInspectionId = $inspection->id;
                    
                    // --- NEW LINE ADDED HERE ---
                    // Dispatch the Sync Job to Supabase
                    PushInspectionToSupabase::dispatch($inspection);
                }

                TechnicalReview::create([
                    'zoning_application_id'   => $application->id,
                    'parcel_id'               => $parcelId,
                    'reviewed_by'             => auth()->id(),
                    'review_round'            => $nextRound,
                    'decision'                => $review['decision'],
                    'findings'                => $review['findings'] ?? null,
                    'decision_reason'         => $review['decision_reason'] ?? null,
                    'site_inspection_task_id' => $siteInspectionId,
                    'reviewed_at'             => now(),
                ]);
            }
            
            if (in_array('Declined', $decisionsSeen, true)) {
                $application->status = 'Denied';
            } elseif (!in_array('Needs Site Inspection', $decisionsSeen, true)) {
                // If no inspections are needed and nothing is declined, 
                // we can advance to the next logical step.
                $application->status = 'Under Sangguniang Bayan';
            }

            $application->save(); // Save the status change immediately

            if ($application->status !== 'Technical Review') {
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    $application->status
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'BATCH_TECHNICAL_REVIEW_COMPLETED',
                    performedBy: auth()->id(),
                    note: "Batch review finalized. Overall application status updated to {$application->status}."
                );
            } else {
                // If it stayed in 'Technical Review' due to pending inspections
                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'BATCH_TECHNICAL_REVIEW_UPDATED',
                    performedBy: auth()->id(),
                    note: "Batch review processed. Application requires Site Inspection for certain parcels."
                );
            }
        }); // <-- Closes DB::transaction

        // Updates redirect strictly to /applications
        return redirect('/applications')->with('success', 'Technical review processed for all parcels.');
    }

    /**
     * Assign a site inspector without changing the application status.
     * Use this ONLY if you don't want to log a Technical Review.
     */
    public function assignInspector(Request $request)
    {
        $validated = $request->validate([
            'zoning_application_id' => 'required|exists:zoning_applications,id',
            'inspector_id'          => 'required|exists:users,id',
            'scheduled_date'        => 'required|date|after_or_equal:today',
            'assigned_notes'        => 'nullable|string',
        ]);

        SiteInspection::create([
            'zoning_application_id' => $validated['zoning_application_id'],
            'inspector_id'          => $validated['inspector_id'],
            'scheduled_date'        => $validated['scheduled_date'],
            'assigned_notes'        => $validated['assigned_notes'] ?? null,
            'status'                => 'Pending',
        ]);

        return redirect()->back()->with('success', 'Site Inspector assigned successfully.');
    }

    /**
     * Fetch inspection and photo data directly from Supabase REST API.
     */
    public function getSupabaseInspectionData($localInspectionId)
    {
        // Ensure you have these defined in your .env file
        $supabaseUrl = env('SUPABASE_URL'); // e.g., https://laapipjyprmmaylunxib.supabase.co
        $supabaseKey = env('SUPABASE_SERVICE_ROLE_KEY'); // Use service role for backend operations

        if (!$supabaseUrl || !$supabaseKey) {
            return response()->json(['error' => 'Supabase credentials missing.'], 500);
        }

        try {
            $response = Http::withHeaders([
                'apikey'        => $supabaseKey,
                'Authorization' => "Bearer {$supabaseKey}",
                'Range'         => '0-9' // Limit results just in case
            ])->get("{$supabaseUrl}/rest/v1/field_jobs", [
                'local_inspection_id' => "eq.{$localInspectionId}",
                // The 'select' param mimics your frontend's nested query
                'select' => 'id,local_inspection_id,status,scheduled_date,deadline_date,submitted_at,inspection_result,is_compliant,findings,observations,discrepancies,recommendations,inspector_notes,remarks,checklist_completed_count,checklist_total_count,checklist_data,photo_count,photo_paths,field_job_photos(id,photo_url,latitude,longitude,captured_at)'
            ]);

            if ($response->failed()) {
                return response()->json(['error' => 'Failed to fetch inspection data from Supabase.'], $response->status());
            }

            $data = $response->json();

            // Return the single record if it exists
            return response()->json($data[0] ?? null);

        } catch (\Exception $e) {
            return response()->json(['error' => 'Backend error: ' . $e->getMessage()], 500);
        }
    }
}   