<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Jobs\PushInspectionToSupabase;
use App\Jobs\PushPlanningReviewToSupabase;
use App\Models\User;
use App\Models\TechnicalReview;
use App\Models\SiteInspection;
use App\Services\AuditLogger;
use App\Services\ApplicationStatusTracker;
// Master integration (Loop 9 merge): BOTH import sets required. Master owns
// AppNotification for its notification calls; Loop 9 owns the Supabase reader
// and the work-assignment service. Neither replaces the other.
use App\Models\AppNotification;
use App\Services\SupabaseService;
use App\Services\WorkAssignmentService;

use Illuminate\Support\Facades\Log; // For placeholder SMS logic
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class TechnicalReviewController extends Controller
{
    /**
     * Rows per page for the Technical Review work queue.
     *
     * Declared as a named constant so the page-size contract for this queue is
     * explicit and testable rather than a bare literal. It applies to the
     * review queue ONLY; no other page's pagination is affected.
     */
    public const QUEUE_PAGE_SIZE = 10;

    public function index(Request $request)
    {
        $query = ZoningApplication::query()
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.application_type',
                'zoning_applications.target_land_use_class',
                'zoning_applications.status',
                'zoning_applications.applicant_name',
                'zoning_applications.barangay',
                'zoning_applications.created_at',
            )
            ->with(['parcels' => function ($q) {
                $q->select(
                    'zoning_application_id',
                    'location_address',
                    'barangay',
                    'owner_name',
                    'latitude',
                    'longitude',
                    'property_index_number',
                    'lot_number',
                    'tct_number',
                    'tax_dec_number',
                    'lot_area_sqm',
                    'arp_number'
                    ,'survey_number'
                );
            }])
            ->where('zoning_applications.status', 'Technical Review');

        if ($request->filled('application_type')) {
            $query->where('zoning_applications.application_type', $request->application_type);
        }

        if ($request->filled('search')) {
            // NOTE: this previously called orWhereILike(), which does not exist
            // on the Eloquent builder in this Laravel version, so searching the
            // queue threw a 500 and the filter never applied. The explicit
            // operator form is used for both arms instead.
            $term = '%' . $request->input('search') . '%';

            $query->where(function ($q) use ($term) {
                $q->where('zoning_applications.applicant_name', 'ILIKE', $term)
                    ->orWhere('zoning_applications.reference_number', 'ILIKE', $term);
            });
        }

        $applications = $query
            ->orderByDesc('zoning_applications.created_at')
            ->orderByDesc('zoning_applications.id')
            // Server-side page size for the review work queue: 10 rows per page.
            // This is a page-size choice for THIS queue only, so an officer can
            // see the whole queue position at a glance without scrolling a long
            // list. It is not a global pagination change, and no other page's
            // page size is affected.
            ->paginate(self::QUEUE_PAGE_SIZE)
            ->withQueryString();

        // If the officer landed on a page that no longer exists - for example a
        // bookmarked or shared ?page= that the queue has since shrunk past, or a
        // page number left over from a wider result set - resolve it to the last
        // available page instead of showing an empty list. Search and filter
        // parameters are preserved so the officer keeps their context.
        if ($applications->total() > 0 && $applications->currentPage() > $applications->lastPage()) {
            $query = $request->query();
            $query['page'] = $applications->lastPage();

            return redirect()->route('technicalreview.index', $query);
        }

        $applications->getCollection()->transform(function ($app) {
            $firstParcel = $app->parcels->first();
            $mappedParcel = $app->parcels->firstWhere(function ($p) {
                return !is_null($p->latitude) && !is_null($p->longitude);
            }) ?? $firstParcel;

            $app->latitude = $mappedParcel ? $mappedParcel->latitude : null;
            $app->longitude = $mappedParcel ? $mappedParcel->longitude : null;

            $app->property_index_number = $firstParcel ? $firstParcel->property_index_number : null;
            $app->location_address = $firstParcel ? $firstParcel->location_address : null;
            $app->parcel_barangay = $firstParcel ? $firstParcel->barangay : null;
            $app->owner_name = $firstParcel ? $firstParcel->owner_name : null;
            $app->lot_number = $firstParcel ? $firstParcel->lot_number : null;
            $app->tct_number = $firstParcel ? $firstParcel->tct_number : null;
            $app->tax_dec_number = $firstParcel ? $firstParcel->tax_dec_number : null;
            $app->lot_area_sqm = $firstParcel ? $firstParcel->lot_area_sqm : null;
            $app->arp_number = $firstParcel ? $firstParcel->arp_number : null;
            $app->survey_number = $firstParcel ? $firstParcel->survey_number : null;

            return $app;
        });

        // Fetch specifically Site Inspectors.
        // Active-account enforcement: a suspended inspector is never offered, so
        // the queue cannot hand a task to somebody who cannot log in. The scope
        // is shared with the validation rule below, so the options and the
        // acceptance test can never disagree.
        $inspectors = User::activeSiteInspectors()
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
            'inspector_id'       => [
                'required_if:decision,Needs Site Inspection,Requires Reinspection',
                'nullable',
                User::activeSiteInspectorRule(),
            ],
            'scheduled_date'     => 'required_if:decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:today',
            'deadline_date'      => 'required_if:decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:scheduled_date',
            'assigned_notes'     => 'nullable|string',

            'parcel_id'          => 'required_if:decision,Needs Site Inspection,Requires Reinspection|nullable|exists:parcels,id',
        ], [
            'inspector_id.exists' => 'The selected inspector must be an active Site Inspector with a FieldSync account.',
        ]);

        if (in_array($validated['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
            $parcel = Parcel::whereKey($validated['parcel_id'])
                ->where('zoning_application_id', $validated['id'])
                ->first();

            if (!$parcel) {
                throw ValidationException::withMessages([
                    'parcel_id' => 'The selected parcel does not belong to the specified application.',
                ]);
            }

            $this->validateFieldSyncParcelCoordinates($parcel);
        }

        DB::transaction(function () use ($validated) {
            // Eager load parcels so we can extract the parcel_id
            $application = ZoningApplication::with('parcels')->findOrFail($validated['id']);
            $oldStatus = $application->status;
            $assigningOfficer = $this->currentPlanningOfficerAssignmentActor();

            // 1. Update main application status ONLY if it's a final decision
            if ($validated['decision'] === 'Approved') {
                $application->status = ($application->status === 'Under Sangguniang Bayan' || $application->application_stream === 'amendment')
                    ? 'Under Sangguniang Bayan'
                    : 'For Release';
            } elseif ($validated['decision'] === 'Declined') {
                $application->status = 'Denied';
            }

            if ($application->isDirty('status')) {
                $application->save();
            }

            // 2. Process Technical Reviews & Site Inspections while ensuring PARCEL_ID is stored
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;
            $nextRound = $currentRound + 1;

            // Loop 8: transport rows are collected inside the transaction and only
            // dispatched after it commits, so the review row identity is durable
            // before any remote write is attempted.
            $pendingReviewTransports = [];

            // If a specific parcel_id was sent from the frontend, use it. 
            // Otherwise, apply this decision to ALL parcels in the application.
            $parcelsToProcess = !empty($validated['parcel_id'])
                ? $application->parcels->where('id', $validated['parcel_id'])
                : $application->parcels;

            foreach ($parcelsToProcess as $parcel) {
                $siteInspectionId = null;

                // Loop 8: capture the EXISTING round under review BEFORE any new
                // round is created, so a "Requires Reinspection" decision records
                // the round it reviewed and not the round it just created.
                $reviewedSiteInspectionId = $this->resolveReviewedInspectionId(
                    $application,
                    $parcel,
                    $validated['decision'],
                );

                if (in_array($validated['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                    $inspection = $this->createInspectionRound(
                        $application,
                        $parcel,
                        $validated,
                        $assigningOfficer,
                    );
                    $siteInspectionId = $inspection->id;
                    PushInspectionToSupabase::dispatch($inspection);

                    AppNotification::notifyUser(
                        $validated['inspector_id'],
                        'Site Inspection Assigned',
                        "You have been assigned to inspect Application {$application->reference_number} scheduled on {$validated['scheduled_date']}.",
                        'inspection_assigned',
                        '/site-inspections'
                    );
                }

                // Create the technical review row for the parcel
                $technicalReview = TechnicalReview::create([
                    'zoning_application_id'      => $application->id,
                    'parcel_id'                  => $parcel->id,
                    'reviewed_by'                => auth()->id(),
                    'review_round'               => $nextRound,
                    'decision'                   => $validated['decision'],
                    'findings'                   => $validated['findings'] ?? null,
                    'decision_reason'            => $validated['decision_reason'] ?? null,
                    'site_inspection_task_id'    => $siteInspectionId,
                    'reviewed_site_inspection_id' => $reviewedSiteInspectionId,
                    'reviewed_at'                => now(),
                ]);

                if ($reviewedSiteInspectionId !== null) {
                    $pendingReviewTransports[] = $this->buildReviewTransport($technicalReview);
                }
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

                AppNotification::notifyRoles(
                    ['Admin', 'Planning Officer'],
                    'Technical Review Decision: ' . $validated['decision'],
                    "Application {$application->reference_number} status updated to \"{$application->status}\".",
                    'status_updated',
                    "/applications/{$application->id}"
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

                AppNotification::notifyRoles(
                    ['Admin', 'Planning Officer'],
                    'Site Inspection Flagged',
                    "Application {$application->reference_number} requires Site Inspection on {$validated['scheduled_date']}.",
                    'inspection_assigned',
                    "/applications/{$application->id}"
                );

                // Placeholder SMS notification for Site Inspection
                Log::info("PLACEHOLDER SMS - To: {$application->contact_number} | Message: Good day! Your application {$application->reference_number} requires a Site Inspection scheduled on {$validated['scheduled_date']}.");
            }
        });

        // Loop 8: transport Planning Review metadata only after the review rows
        // are committed. This never reopens or mutates the reviewed task.
        foreach ($pendingReviewTransports as $transport) {
            PushPlanningReviewToSupabase::dispatch($transport);
        }

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
            'reviews.*.decision'                 => 'required|string|in:Approved,Needs Site Inspection,Requires Reinspection,Declined',
            'reviews.*.findings'                 => 'nullable|string',
            'reviews.*.decision_reason'          => 'nullable|string',
            'reviews.*.inspector_id'             => [
                'nullable',
                User::activeSiteInspectorRule(),
            ],
            'reviews.*.scheduled_date'           => 'nullable|date|after_or_equal:today',
            'reviews.*.deadline_date'            => 'nullable|date|after_or_equal:reviews.*.scheduled_date', 
            'reviews.*.assigned_notes'           => 'nullable|string',
        ], [
            'reviews.*.inspector_id.exists' => 'The selected inspector must be an active Site Inspector with a FieldSync account.',
        ]);

        $application = ZoningApplication::with('parcels:id,zoning_application_id,latitude,longitude')
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
                in_array($review['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)
                && (empty($review['inspector_id']) || empty($review['scheduled_date']) || empty($review['deadline_date']))
            ) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId.inspector_id" => 'Inspector, scheduled date, and deadline are required when a site inspection round is requested.',
                ]);
            }

            if ($review['decision'] === 'Requires Reinspection' && empty(trim((string) ($review['assigned_notes'] ?? '')))) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId.assigned_notes" => 'Assignment instructions are required when scheduling a reinspection round.',
                ]);
            }

            if (in_array($review['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                $this->validateFieldSyncParcelCoordinates(
                    $application->parcels->firstWhere('id', (int) $parcelId),
                    "reviews.$parcelId.parcel_id"
                );
            }

            if ($review['decision'] === 'Declined' && empty($review['decision_reason'])) {
                throw ValidationException::withMessages([
                    "reviews.$parcelId.decision_reason" => 'A decision reason is required when the decision is "Declined".',
                ]);
            }
        }

        DB::transaction(function () use ($application, $validated) {
            $reviews = $validated['reviews'];
            $assigningOfficer = $this->currentPlanningOfficerAssignmentActor();

            // Shared review round across all parcels for this single submission.
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;
            $nextRound = $currentRound + 1;

            $decisionsSeen = [];
            $pendingReviewTransports = [];

            foreach ($reviews as $parcelId => $review) {
                $decisionsSeen[] = $review['decision'];

                $siteInspectionId = null;
                $parcel = $application->parcels->firstWhere('id', (int) $parcelId);

                // Loop 8: capture the EXISTING round under review BEFORE the new
                // round is created. An initial "Needs Site Inspection" decision
                // has no prior round, so this stays NULL.
                $reviewedSiteInspectionId = $this->resolveReviewedInspectionId(
                    $application,
                    $parcel,
                    $review['decision'],
                );

                if (in_array($review['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                    $inspection = $this->createInspectionRound(
                        $application,
                        $parcel,
                        $review,
                        $assigningOfficer,
                    );

                    $siteInspectionId = $inspection->id;
                    PushInspectionToSupabase::dispatch($inspection);
                }

                $technicalReview = TechnicalReview::create([
                    'zoning_application_id'      => $application->id,
                    'parcel_id'                  => $parcelId,
                    'reviewed_by'                => auth()->id(),
                    'review_round'               => $nextRound,
                    'decision'                   => $review['decision'],
                    'findings'                   => $review['findings'] ?? null,
                    'decision_reason'            => $review['decision_reason'] ?? null,
                    'site_inspection_task_id'    => $siteInspectionId,
                    'reviewed_site_inspection_id' => $reviewedSiteInspectionId,
                    'reviewed_at'                => now(),
                ]);

                if ($reviewedSiteInspectionId !== null) {
                    $pendingReviewTransports[] = $this->buildReviewTransport($technicalReview);
                }
            }
            
            if (in_array('Declined', $decisionsSeen, true)) {
                $application->status = 'Denied';
            } elseif (array_intersect(['Needs Site Inspection', 'Requires Reinspection'], $decisionsSeen)) {
                $application->status = 'Technical Review';
            } else {
                // If no inspections are needed and nothing is declined (all approved),
                // check if the application was routed to Sangguniang Bayan or is an amendment stream.
                if ($application->status === 'Under Sangguniang Bayan' || $application->application_stream === 'amendment') {
                    $application->status = 'Under Sangguniang Bayan';
                } else {
                    $application->status = 'For Release';
                }
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

        // Loop 8: dispatch review transports only after the review rows commit.
        foreach ($pendingReviewTransports as $transport) {
            PushPlanningReviewToSupabase::dispatch($transport);
        }

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
            'parcel_id'             => 'required|exists:parcels,id',
            'inspector_id'          => [
                'required',
                User::activeSiteInspectorRule(),
            ],
            'scheduled_date'        => 'required|date|after_or_equal:today',
            'deadline_date'         => 'required|date|after_or_equal:scheduled_date',
            'assigned_notes'        => 'nullable|string',
        ], [
            'inspector_id.exists' => 'The selected inspector must be an active Site Inspector with a FieldSync account.',
        ]);

        $parcel = Parcel::whereKey($validated['parcel_id'])
            ->where('zoning_application_id', $validated['zoning_application_id'])
            ->first();

        if (!$parcel) {
            throw ValidationException::withMessages([
                'parcel_id' => 'The selected parcel does not belong to the specified application.',
            ]);
        }

        $this->validateFieldSyncParcelCoordinates($parcel);
        $assigningOfficer = $this->currentPlanningOfficerAssignmentActor();

        // A round is one field job. Creating a second round for the same
        // application and parcel while an earlier one is still open would produce
        // a duplicate field job and a duplicate round number, and the inspector
        // who was dropped would never find out. An open round is changed through
        // the guarded Reassign Inspector path instead, which keeps the previous
        // inspector, records the reason and refuses once the field app has begun.
        $openRound = SiteInspection::where('zoning_application_id', $validated['zoning_application_id'])
            ->where('parcel_id', $validated['parcel_id'])
            ->where('status', '!=', 'completed')
            ->latest('id')
            ->lockForUpdate()
            ->first();

        if ($openRound) {
            throw ValidationException::withMessages([
                'inspector_id' => 'This parcel already has an open inspection round. Use Reassign Inspector on that round to hand it to a different Site Inspector.',
            ]);
        }

        $inspection = SiteInspection::create([
            'zoning_application_id'      => $validated['zoning_application_id'],
            'parcel_id'                  => $validated['parcel_id'],
            'inspector_id'               => $validated['inspector_id'],
            'scheduled_date'             => $validated['scheduled_date'],
            'deadline_date'              => $validated['deadline_date'],
            'assigned_notes'             => $validated['assigned_notes'] ?? null,
            'assigned_by_imaps_user_id'  => $assigningOfficer['id'],
            'assigned_by_name'           => $assigningOfficer['name'],
            'status'                     => 'assigned',
        ]);

        // Start the round's ownership history from its very first entry, so the
        // story of who held it is complete from the beginning rather than
        // beginning at the first handover.
        app(WorkAssignmentService::class)->recordInitialInspectorAssignment(
            $inspection,
            $request->user(),
        );

        PushInspectionToSupabase::dispatch($inspection);

        return redirect()->back()->with('success', 'Site Inspector assigned successfully.');
    }

    private function createInspectionRound(
        ZoningApplication $application,
        Parcel $parcel,
        array $assignment,
        array $assigningOfficer,
    ): SiteInspection {
        $latestInspection = SiteInspection::query()
            ->where('zoning_application_id', $application->id)
            ->where('parcel_id', $parcel->id)
            ->latest('id')
            ->lockForUpdate()
            ->first();

        $assignmentData = [
            'inspector_id'              => $assignment['inspector_id'],
            'scheduled_date'            => $assignment['scheduled_date'],
            'deadline_date'             => $assignment['deadline_date'],
            'assigned_notes'            => $assignment['assigned_notes'] ?? null,
            'assigned_by_imaps_user_id' => $assigningOfficer['id'],
            'assigned_by_name'          => $assigningOfficer['name'],
        ];

        if (($assignment['decision'] ?? null) === 'Requires Reinspection') {
            if (!$latestInspection || $latestInspection->status !== 'completed') {
                throw ValidationException::withMessages([
                    'decision' => 'Requires Reinspection needs a completed inspection round for this parcel.',
                ]);
            }

            $inspection = $latestInspection->newRound($assignmentData);
            $inspection->save();

            // A reinspection is a brand new round with its own inspector, so it
            // starts its own ownership history rather than inheriting Round 1's.
            $this->recordRoundHistoryOpening($inspection, $assigningOfficer);

            return $inspection;
        }

        if ($latestInspection) {
            if ($latestInspection->status === 'completed') {
                throw ValidationException::withMessages([
                    'decision' => 'A completed inspection cannot be reassigned. Use Requires Reinspection to create a new round.',
                ]);
            }

            // A round that already exists and is not completed must NOT have its
            // inspector silently rewritten. Changing who holds a round is a
            // continuity event that has to keep the previous owner, the reason,
            // the actor and a timestamp, and it has to be refused once the field
            // app has started working on it. That can only happen on the guarded
            // path (WorkReassignmentController), which owns the FieldSync safety
            // check and the history write.
            //
            // Previously this branch did:
            //   $latestInspection->fill([...$assignmentData, 'status' => 'assigned']);
            // which overwrote inspector_id with no history, forced the lifecycle
            // back to "assigned" even if work had begun, and kept any
            // submitted_at / findings already on the row.
            if ((int) $latestInspection->inspector_id !== (int) $assignmentData['inspector_id']) {
                throw ValidationException::withMessages([
                    'inspector_id' => 'This round is already assigned to another Site Inspector. Use Reassign Inspector on the round to hand it over safely.',
                ]);
            }

            // Same inspector: this is a reschedule, not a handover. Only the
            // schedule moves. The lifecycle status is left exactly as it is, and
            // the assigning officer is left as recorded, because neither a
            // reschedule nor this method is an assignment event.
            $latestInspection->fill([
                'scheduled_date' => $assignmentData['scheduled_date'],
                'deadline_date'  => $assignmentData['deadline_date'],
                'assigned_notes' => $assignmentData['assigned_notes'],
            ]);
            $latestInspection->save();

            return $latestInspection;
        }

        $created = SiteInspection::create([
            'zoning_application_id' => $application->id,
            'parcel_id'             => $parcel->id,
            ...$assignmentData,
            'status'                => 'assigned',
        ]);

        $this->recordRoundHistoryOpening($created, $assigningOfficer);

        return $created;
    }

    /**
     * Open a new round's inspector-ownership history with its first entry.
     *
     * Every round that gets an inspector now begins with a recorded assignment,
     * so "who was this round given to, and by whom" is answerable for the whole
     * life of the round rather than only from its first handover onwards.
     */
    private function recordRoundHistoryOpening(SiteInspection $inspection, array $assigningOfficer): void
    {
        $actor = User::find($assigningOfficer['id']);

        if (! $actor) {
            return;
        }

        app(WorkAssignmentService::class)->recordInitialInspectorAssignment($inspection, $actor);
    }

    /**
     * Loop 8 — resolve the inspection round this review is reviewing.
     *
     * Returns the EXISTING round id only when:
     *  - the decision is an inspection-result review (Approved / Declined /
     *    Requires Reinspection). "Needs Site Inspection" is the initial
     *    scheduling decision and never has a reviewed round;
     *  - the parcel's latest existing round is a COMPLETED round.
     *
     * It is resolved from the same application + parcel pair as the review row
     * and is deliberately captured BEFORE any new round is created, so a
     * "Requires Reinspection" decision records the round it reviewed (36) and
     * not the round it just created (37). A NULL result is the honest answer
     * when no completed round exists — no link is invented, and no historical
     * row is backfilled.
     */
    private function resolveReviewedInspectionId(
        ZoningApplication $application,
        ?Parcel $parcel,
        string $decision,
    ): ?int {
        if ($parcel === null) {
            return null;
        }

        if (! in_array($decision, PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS, true)) {
            return null;
        }

        $latestInspection = SiteInspection::query()
            ->where('zoning_application_id', $application->id)
            ->where('parcel_id', $parcel->id)
            ->orderByDesc('id')
            ->first();

        if ($latestInspection === null || $latestInspection->status !== 'completed') {
            return null;
        }

        return (int) $latestInspection->id;
    }

    /**
     * Build the read-only Planning Review transport for one persisted review.
     */
    private function buildReviewTransport(TechnicalReview $technicalReview): PushPlanningReviewToSupabase
    {
        $reviewer = $technicalReview->reviewedBy !== null
            ? User::whereKey($technicalReview->reviewedBy)->first()
            : null;

        return new PushPlanningReviewToSupabase(
            technicalReviewId: (int) $technicalReview->id,
            reviewedSiteInspectionId: (int) $technicalReview->reviewed_site_inspection_id,
            decision: (string) $technicalReview->decision,
            reviewedBy: (int) $technicalReview->reviewed_by,
            reviewedByName: $reviewer?->name,
            reviewedAt: $technicalReview->reviewed_at?->toIso8601String(),
        );
    }

    private function currentPlanningOfficerAssignmentActor(): array
    {
        $user = auth()->user();

        if (!$user || $user->role !== 'Planning Officer') {
            throw ValidationException::withMessages([
                'inspector_id' => 'Only an authenticated Planning Officer can assign or reassign a site inspection.',
            ]);
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
        ];
    }

    private function validateFieldSyncParcelCoordinates(?Parcel $parcel, string $errorKey = 'parcel_id'): void
    {
        if (
            !$parcel
            || is_null($parcel->latitude)
            || is_null($parcel->longitude)
            || !is_numeric($parcel->latitude)
            || !is_numeric($parcel->longitude)
        ) {
            throw ValidationException::withMessages([
                $errorKey => 'The selected parcel has no valid GPS target. Verify or select the parcel location before assigning a site inspection.',
            ]);
        }
    }

    /**
     * Fetch authorized inspection and signed private-photo data through the
     * server-side Supabase service. Route middleware remains the authorization
     * boundary for this endpoint.
     */
    public function getSupabaseInspectionData($localInspectionId)
    {
        if (!is_numeric($localInspectionId) || (int) $localInspectionId < 1) {
            return response()->json(['error' => 'A valid inspection ID is required.'], 422);
        }

        try {
            $inspection = app(SupabaseService::class)
                ->getInspectionWithSignedPhotos((int) $localInspectionId);

            return response()->json($inspection);
        } catch (\Throwable $exception) {
            Log::warning('Inspection photo reader unavailable', [
                'local_inspection_id' => (int) $localInspectionId,
            ]);

            return response()->json([
                'error' => 'Inspection evidence is temporarily unavailable.',
            ], 503);
        }
    }
}   