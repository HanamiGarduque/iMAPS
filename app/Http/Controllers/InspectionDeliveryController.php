<?php

namespace App\Http\Controllers;

use App\Models\SiteInspection;
use App\Models\ZoningApplication;
use App\Support\InspectionDeliveryStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Collection;

/**
 * Loop 9C-1 - Planning Officer / Admin delivery-state READER.
 *
 * APPROVED SCOPE. Team Leader approved Loop 9C using the audited narrow scope.
 * This phase is a READ CONTRACT ONLY and is deliberately inert:
 *
 *   - it dispatches nothing
 *   - it writes nothing: no delivery_status, no delivery attempt, no audit
 *     trail row, no application status, no inspection status, no assignment
 *   - it does not read Supabase or FieldSync
 *
 * ADDITIVE BYTE. Loop 9 delivery state is observability, not a second task
 * lifecycle. Nothing here may create, infer, or imply an ownership relationship.
 *
 * ACCESS BOUNDARY - deliberately identical to `applications.show`.
 * `ApplicationController::show()` performs NO per-application authorization at
 * all: the entire boundary is the route middleware `auth` +
 * `role:Admin,Planning Officer`. Verified against that method - zero
 * `authorize`, zero `Gate::`, zero `can(`, zero `abort(403`.
 *
 * This reader therefore applies the SAME boundary and must never be stricter.
 * An ownership filter on the READ would be actively harmful today: all 70 live
 * applications have `assigned_planning_officer_id = NULL`, so it would hide
 * delivery state from Admin and Planning Officer alike and return 404 to
 * everyone. Delivery state is not ownership.
 *
 * `can_retry` is a server-computed authorization FACT for a later phase. It is
 * reported so a future browser can never offer a control the server would
 * refuse. This phase performs no retry and exposes no retry route.
 */
class InspectionDeliveryController extends Controller
{
    /**
     * Per-round Loop 9 delivery state for one application.
     *
     * Returns EVERY round. `Parcel::siteInspection()` is deliberately NOT used:
     * it is a `latestOfMany()` singular relation and would collapse an original
     * inspection and its reinspection into a single badge.
     */
    public function status(int $id): JsonResponse
    {
        // Same read boundary as applications.show, so a 404 here means only
        // that the application does not exist - never that the caller lacks
        // authority.
        $application = ZoningApplication::query()->findOrFail($id);

        // ONE query for all rounds, ONE eager load for inspector display
        // identity, and ONE aggregate COUNT for the attempt totals. Attempt
        // rows are never loaded, so there is no per-round N+1 and no
        // queue-correlation exposure.
        $rounds = $application->siteInspections()
            ->with(['inspector' => fn ($query) => $query->select('id', 'name')])
            ->withCount('deliveryAttempts')
            // Deterministic and canonical. `site_inspections` stores no round
            // number, so the primary key IS the round chronology - the same one
            // the existing `latestOfMany()` relation already relies on. Ordering
            // by it therefore agrees with the rest of the codebase about which
            // round is newest.
            ->orderBy('id')
            ->get();

        // Ownership is read ONCE, and only to compute retry availability. It
        // never filters which rounds are returned.
        $ownerId = $application->assigned_planning_officer_id === null
            ? null
            : (int) $application->assigned_planning_officer_id;

        $viewer = request()->user();
        $viewerId = $viewer !== null ? (int) $viewer->id : null;
        $viewerRole = $viewer?->role;

        $retryAvailable = $this->isRetryableFor($ownerId, $viewerId, $viewerRole);

        return response()->json([
            'application_id' => (int) $application->id,

            // Provenance, so a future UI can explain itself. Retry availability
            // is application-level because Planning Officer ownership is an
            // application-level fact, not a per-round one.
            'assigned_planning_officer_id' => $ownerId,
            'is_retry_available'           => $retryAvailable,
            'retry_unavailable_reason'     => InspectionDeliveryStatus::retryUnavailableReason($viewerRole, $ownerId, $viewerId),

            'inspections' => $this->shapeRounds($rounds, $retryAvailable),
        ]);
    }

    /**
     * Shape every round into the read contract.
     *
     * @param  Collection<int, SiteInspection>  $rounds
     * @return list<array<string, mixed>>
     */
    private function shapeRounds(Collection $rounds, bool $retryAvailable): array
    {
        $index = 0;

        return $rounds->map(function (SiteInspection $round) use ($retryAvailable, &$index): array {
            $index++;

            return [
                // Stable identity first. A later round never replaces an
                // earlier one; both are always returned.
                'inspection_id'     => (int) $round->getKey(),
                // Derived 1-based display position within this application,
                // following the canonical id chronology. This is NOT a stored
                // value - `site_inspections` has no round_number column - so
                // `inspection_id` remains the only stable round identity.
                'round'             => $index,
                'parcel_id'         => $round->parcel_id === null ? null : (int) $round->parcel_id,
                'inspection_status' => $round->status,
                'created_at'        => $round->created_at?->toIso8601String(),
                'inspector'         => $round->inspector === null
                    ? null
                    : ['id' => (int) $round->inspector->getKey(), 'name' => $round->inspector->name],

                'delivery' => $this->shapeDelivery($round, $retryAvailable),
            ];
        })->all();
    }

    /**
     * Shape one round's delivery block.
     *
     * @return array<string, mixed>>
     */
    private function shapeDelivery(SiteInspection $round, bool $retryAvailable): array
    {
        $state = InspectionDeliveryStatus::state($round->delivery_status);
        $isFailed = $state === InspectionDeliveryStatus::STATE_FAILED;

        return [
            'state'   => $state,
            'label'   => InspectionDeliveryStatus::label($state),
            'message' => InspectionDeliveryStatus::message($state),

            // Laravel's existing JSON datetime convention, matching the
            // TechnicalReviewController responses. NULL is returned as NULL; no
            // timestamp is ever fabricated.
            'last_attempt_at' => $round->last_delivery_attempt_at?->toIso8601String(),
            'delivered_at'    => $round->delivered_at?->toIso8601String(),

            // Aggregate only. Raw attempt rows, attempt_number, source and
            // queue_job_uuid are intentionally never exposed here; the full
            // operational history belongs to 9D Admin monitoring.
            'attempt_count' => (int) $round->delivery_attempts_count,

            // Present only for a recorded failure.
            'failure_category' => $isFailed
                ? InspectionDeliveryStatus::failureCategory($round->last_delivery_failure_category)
                : null,
            'failure_message' => $isFailed
                ? InspectionDeliveryStatus::failureMessage($round->last_delivery_failure_category)
                : null,

            // Server-computed only, and never true unless this round is itself
            // a recorded failure. This phase performs no retry.
            'can_retry' => $isFailed && $retryAvailable,
        ];
    }

    /**
     * Is this viewer the Planning Officer who currently owns the application?
     *
     * Ownership is the SINGLE stored pointer `assigned_planning_officer_id` and
     * nothing else. `encoded_by`, `technical_reviews.reviewed_by` and
     * `audit_trail.performed_by` are deliberately NOT consulted: none of them
     * records current ownership, and all 70 live applications happen to have
     * `encoded_by` pointing at a Planning Officer who does not own them, so
     * inferring ownership from it would hand retry authority to the wrong
     * person on every single application.
     */
    private function isRetryableFor(?int $ownerId, ?int $viewerId, ?string $viewerRole): bool
    {
        if ($viewerRole !== 'Planning Officer') {
            return false;
        }

        if ($ownerId === null || $viewerId === null) {
            return false;
        }

        return $ownerId === $viewerId;
    }
}
