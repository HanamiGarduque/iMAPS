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
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;

class TechnicalReviewController extends Controller
{
    /**
     * Handle the submission of the Technical Review Action Drawer.
     */
    public function updateStatus(Request $request)
    {
        $validated = $request->validate([
            'id'                 => 'required|exists:zoning_applications,id',
            'decision'           => 'required|string',
            'findings'           => 'nullable|string',
            'decision_reason'    => 'required_if:decision,Declined,Requires Reinspection|nullable|string',

            // Validation for Site Inspection assignment
            'inspector_id'       => [
                'exclude_unless:decision,Needs Site Inspection,Requires Reinspection',
                'required_if:decision,Needs Site Inspection,Requires Reinspection',
                'nullable',
                User::activeSiteInspectorRule(),
            ],
            'scheduled_date'     => 'exclude_unless:decision,Needs Site Inspection,Requires Reinspection|required_if:decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:today',
            'deadline_date'      => 'exclude_unless:decision,Needs Site Inspection,Requires Reinspection|required_if:decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:scheduled_date',
            'assigned_notes'     => 'exclude_unless:decision,Needs Site Inspection,Requires Reinspection|required_if:decision,Requires Reinspection|nullable|string',

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

        if (in_array($validated['decision'], PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS, true)) {
            $this->pullPendingInspectionResults(
                (int) $validated['id'],
                !empty($validated['parcel_id'])
                    ? [(int) $validated['parcel_id']]
                    : Parcel::where('zoning_application_id', $validated['id'])->pluck('id')->all(),
            );
        }

        DB::transaction(function () use ($validated) {
            $queue = PushInspectionToSupabase::atomicQueue();
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
                    $queue->push((new PushInspectionToSupabase($inspection))->beforeCommit());

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
                    $queue->push($this->buildReviewTransport($technicalReview)->beforeCommit());
                }
            }

            // 3. Audit Logs, Trackers, and SMS
            $adminIds = User::where('role', 'Admin')->pluck('id')->all();
            $recipientIds = array_merge($adminIds, array_filter([auth()->id(), $application->assigned_planning_officer_id, $application->encoded_by]));

            if (in_array($validated['decision'], ['Approved', 'Declined'])) {
                $parcelNote = !empty($validated['parcel_id']) && ($p = $application->parcels->firstWhere('id', $validated['parcel_id']))
                    ? " (Parcel {$p->parcel_code})"
                    : "";

                $note = "Technical review completed: {$validated['decision']}{$parcelNote}. Status changed from \"{$oldStatus}\" to \"{$application->status}\".";
                if (!empty($validated['findings'])) {
                    $note .= " Findings: {$validated['findings']}";
                }

                if ($validated['decision'] === 'Approved') {
                    ApplicationStatusTracker::log(
                        applicationOrRef: $application,
                        status: 'Approved',
                        note: "Parcel{$parcelNote} approved upon technical review." . (!empty($validated['findings']) ? " Findings: {$validated['findings']}" : "")
                    );
                }

                ApplicationStatusTracker::log(
                    applicationOrRef: $application,
                    status: $application->status,
                    note: $note
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'TECHNICAL_REVIEW_' . strtoupper(str_replace(' ', '_', $validated['decision'])),
                    performedBy: auth()->id(),
                    note: $note
                );

                AppNotification::notifyUsers(
                    $recipientIds,
                    'Technical Review Decision: ' . $validated['decision'],
                    "Application {$application->reference_number}{$parcelNote} status updated to \"{$application->status}\".",
                    'status_updated',
                    "/applications/{$application->id}"
                );

                // Placeholder SMS notification
                Log::info("PLACEHOLDER SMS - To: {$application->contact_number} | Message: Good day! Your application {$application->reference_number} has completed Technical Review and is now '{$application->status}'.");
            } elseif (in_array($validated['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                $isReinspection = $validated['decision'] === 'Requires Reinspection';
                $actionName = $isReinspection ? 'TECHNICAL_REVIEW_REQUIRES_REINSPECTION' : 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION';
                $label = $isReinspection ? 'reinspection' : 'site inspection';
                $parcelNote = !empty($validated['parcel_id']) && ($p = $application->parcels->firstWhere('id', $validated['parcel_id']))
                    ? " for parcel {$p->parcel_code}"
                    : "";

                $note = "Technical review requires {$label}{$parcelNote} scheduled on {$validated['scheduled_date']}.";
                if (!empty($validated['findings'])) {
                    $note .= " Findings: {$validated['findings']}";
                }
                if (!empty($validated['assigned_notes'])) {
                    $note .= " Instructions: {$validated['assigned_notes']}";
                }

                ApplicationStatusTracker::log(
                    applicationOrRef: $application,
                    status: 'Site Inspection Scheduled',
                    note: $note,
                    scheduledDate: $validated['scheduled_date']
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: $actionName,
                    performedBy: auth()->id(),
                    note: $note
                );

                AppNotification::notifyUsers(
                    $recipientIds,
                    $isReinspection ? 'Reinspection Scheduled' : 'Site Inspection Flagged',
                    "Application {$application->reference_number}{$parcelNote} requires {$label} on {$validated['scheduled_date']}.",
                    'inspection_assigned',
                    "/applications/{$application->id}"
                );

                // Placeholder SMS notification for Site Inspection
                Log::info("PLACEHOLDER SMS - To: {$application->contact_number} | Message: Good day! Your application {$application->reference_number} requires a {$label} scheduled on {$validated['scheduled_date']}.");
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
            'reviews.*.decision'                 => 'required|string|in:Approved,Needs Site Inspection,Requires Reinspection,Declined',
            'reviews.*.findings'                 => 'nullable|string',
            'reviews.*.decision_reason'          => 'required_if:reviews.*.decision,Requires Reinspection|nullable|string',
            'reviews.*.inspector_id'             => [
                'exclude_unless:reviews.*.decision,Needs Site Inspection,Requires Reinspection',
                'nullable',
                User::activeSiteInspectorRule(),
            ],
            'reviews.*.scheduled_date'           => 'exclude_unless:reviews.*.decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:today',
            'reviews.*.deadline_date'            => 'exclude_unless:reviews.*.decision,Needs Site Inspection,Requires Reinspection|nullable|date|after_or_equal:reviews.*.scheduled_date',
            'reviews.*.assigned_notes'           => 'exclude_unless:reviews.*.decision,Needs Site Inspection,Requires Reinspection|nullable|string',
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

        $this->pullPendingInspectionResults(
            $application->id,
            array_keys(array_filter(
                $validated['reviews'],
                fn (array $review) => in_array($review['decision'], PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS, true),
            )),
        );

        DB::transaction(function () use ($application, $validated) {
            $queue = PushInspectionToSupabase::atomicQueue();
            $reviews = $validated['reviews'];
            $assigningOfficer = $this->currentPlanningOfficerAssignmentActor();

            // Shared review round across all parcels for this single submission.
            $currentRound = TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0;
            $nextRound = $currentRound + 1;

            $decisionsSeen = [];

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
                    $queue->push((new PushInspectionToSupabase($inspection))->beforeCommit());

                    $isReinspection = $review['decision'] === 'Requires Reinspection';
                    $parcelCode = $parcel?->parcel_code ?? "Parcel #{$parcelId}";

                    AppNotification::notifyUser(
                        $review['inspector_id'],
                        $isReinspection ? 'Reinspection Assigned' : 'Site Inspection Assigned',
                        "You have been assigned to inspect Application {$application->reference_number} ({$parcelCode}) scheduled on {$review['scheduled_date']}.",
                        'inspection_assigned',
                        '/site-inspections'
                    );
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
                    $queue->push($this->buildReviewTransport($technicalReview)->beforeCommit());
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

            $approvedParcels = [];
            $inspectionParcels = [];
            $declinedParcels = [];

            foreach ($reviews as $parcelId => $review) {
                $parcel = $application->parcels->firstWhere('id', (int) $parcelId);
                $code = $parcel?->parcel_code ?? "Parcel #{$parcelId}";

                if ($review['decision'] === 'Approved') {
                    $approvedParcels[] = $code;
                } elseif (in_array($review['decision'], ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                    $inspectionParcels[] = [
                        'code'           => $code,
                        'decision'       => $review['decision'],
                        'scheduled_date' => $review['scheduled_date'] ?? null,
                    ];
                } elseif ($review['decision'] === 'Declined') {
                    $declinedParcels[] = $code;
                }
            }

            $adminIds = User::where('role', 'Admin')->pluck('id')->all();
            $recipientIds = array_merge($adminIds, array_filter([auth()->id(), $application->assigned_planning_officer_id, $application->encoded_by]));

            if (!empty($inspectionParcels)) {
                $earliestDate = collect($inspectionParcels)->pluck('scheduled_date')->filter()->sort()->first();
                $inspectionCodes = collect($inspectionParcels)->pluck('code')->implode(', ');

                $note = "Site inspection scheduled for parcel(s) [{$inspectionCodes}] on {$earliestDate}.";
                if (!empty($approvedParcels)) {
                    $note .= " Approved parcel(s): [" . implode(', ', $approvedParcels) . "].";
                }

                ApplicationStatusTracker::log(
                    applicationOrRef: $application,
                    status: 'Site Inspection Scheduled',
                    note: $note,
                    scheduledDate: $earliestDate
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION',
                    performedBy: auth()->id(),
                    note: $note
                );

                if (!empty($approvedParcels)) {
                    ApplicationStatusTracker::log(
                        applicationOrRef: $application,
                        status: 'Approved',
                        note: "Parcel(s) [" . implode(', ', $approvedParcels) . "] approved upon technical review."
                    );

                    AuditLogger::log(
                        applicationId: $application->id,
                        action: 'TECHNICAL_REVIEW_APPROVED',
                        performedBy: auth()->id(),
                        note: "Parcel(s) [" . implode(', ', $approvedParcels) . "] approved upon technical review."
                    );
                }

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'BATCH_TECHNICAL_REVIEW_UPDATED',
                    performedBy: auth()->id(),
                    note: "Batch review processed. Application requires Site Inspection for certain parcels."
                );

                AppNotification::notifyUsers(
                    $recipientIds,
                    'Site Inspection Scheduled',
                    "Application {$application->reference_number} parcel(s) [{$inspectionCodes}] require Site Inspection scheduled on {$earliestDate}." . (!empty($approvedParcels) ? " Approved parcel(s): [" . implode(', ', $approvedParcels) . "]." : ""),
                    'inspection_assigned',
                    "/applications/{$application->id}"
                );
            } else {
                if (!empty($approvedParcels)) {
                    ApplicationStatusTracker::log(
                        applicationOrRef: $application,
                        status: 'Approved',
                        note: "Parcel(s) [" . implode(', ', $approvedParcels) . "] approved upon technical review."
                    );
                }

                ApplicationStatusTracker::log(
                    applicationOrRef: $application,
                    status: $application->status,
                    note: !empty($approvedParcels)
                        ? "Technical review completed: parcel(s) [" . implode(', ', $approvedParcels) . "] approved. Overall status updated to {$application->status}."
                        : null
                );

                if (!empty($approvedParcels) && empty($declinedParcels)) {
                    AuditLogger::log(
                        applicationId: $application->id,
                        action: 'TECHNICAL_REVIEW_APPROVED',
                        performedBy: auth()->id(),
                        note: "All parcel(s) [" . implode(', ', $approvedParcels) . "] approved upon technical review. Status moved to {$application->status}."
                    );

                    AppNotification::notifyUsers(
                        $recipientIds,
                        'Technical Review Decision: Approved',
                        "Application {$application->reference_number} parcel(s) approved upon technical review. Status updated to \"{$application->status}\".",
                        'status_updated',
                        "/applications/{$application->id}"
                    );
                } elseif (!empty($declinedParcels)) {
                    AuditLogger::log(
                        applicationId: $application->id,
                        action: 'TECHNICAL_REVIEW_DECLINED',
                        performedBy: auth()->id(),
                        note: "Parcel(s) [" . implode(', ', $declinedParcels) . "] declined upon technical review. Status moved to Denied."
                    );

                    AppNotification::notifyUsers(
                        $recipientIds,
                        'Technical Review Decision: Declined',
                        "Application {$application->reference_number} declined upon technical review.",
                        'status_updated',
                        "/applications/{$application->id}"
                    );
                }

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'BATCH_TECHNICAL_REVIEW_COMPLETED',
                    performedBy: auth()->id(),
                    note: "Batch review finalized. Overall application status updated to {$application->status}."
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

        $application = ZoningApplication::findOrFail($validated['zoning_application_id']);
        $inspector = User::find($validated['inspector_id']);
        $parcelCode = $parcel->parcel_code ?? "Parcel #{$parcel->id}";

        ApplicationStatusTracker::log(
            applicationOrRef: $application,
            status: 'Site Inspection Scheduled',
            note: "Site inspection scheduled for {$parcelCode} on {$validated['scheduled_date']}. Assigned inspector: {$inspector?->name}.",
            scheduledDate: $validated['scheduled_date']
        );

        AuditLogger::log(
            applicationId: $application->id,
            action: 'SITE_INSPECTION_ASSIGNED',
            performedBy: $request->user()->id,
            note: "Site inspection assigned to {$inspector?->name} for {$parcelCode} scheduled on {$validated['scheduled_date']}."
        );

        AppNotification::notifyUser(
            $validated['inspector_id'],
            'Site Inspection Assigned',
            "You have been assigned to inspect Application {$application->reference_number} ({$parcelCode}) scheduled on {$validated['scheduled_date']}.",
            'inspection_assigned',
            '/site-inspections'
        );

        $adminIds = User::where('role', 'Admin')->pluck('id')->all();
        $recipientIds = array_merge($adminIds, array_filter([$request->user()->id, $application->assigned_planning_officer_id, $application->encoded_by]));

        AppNotification::notifyUsers(
            $recipientIds,
            'Site Inspection Assigned',
            "Application {$application->reference_number} ({$parcelCode}) assigned to {$inspector?->name} for inspection on {$validated['scheduled_date']}.",
            'inspection_assigned',
            "/applications/{$application->id}"
        );

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
     * Import any FieldSync result the scheduled pull hasn't brought back yet.
     *
     * The Planning Officer sees an inspector's submission through the remote
     * evidence view as soon as it lands, but the local round only becomes
     * `completed` on the next `sync:pull-inspections` run. A decision saved in
     * that gap resolved no reviewed round, so it was stored unlinked and never
     * reached FieldSync. Pulling the open rounds under review first closes the
     * gap; a round FieldSync hasn't completed is left exactly as it is.
     */
    private function pullPendingInspectionResults(int $applicationId, array $parcelIds): void
    {
        $openRoundIds = SiteInspection::query()
            ->where('zoning_application_id', $applicationId)
            ->whereIn('parcel_id', $parcelIds)
            ->where('status', '!=', 'completed')
            ->pluck('id');

        foreach ($openRoundIds as $id) {
            try {
                $exitCode = Artisan::call('sync:pull-inspections', ['--local-inspection-id' => $id]);
            } catch (\Throwable $e) {
                report($e);
                $exitCode = 1;
            }

            // Saving anyway would store the same unlinked decision this guards against.
            if ($exitCode !== 0) {
                throw ValidationException::withMessages([
                    'decision' => "Couldn't check FieldSync for Inspection {$id}'s result, so the decision was not saved. Please try again.",
                ]);
            }
        }
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
            decisionReason: $technicalReview->decision_reason,
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
