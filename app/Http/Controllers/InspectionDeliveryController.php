<?php

namespace App\Http\Controllers;

use App\Models\InspectionDeliveryAttempt;
use App\Models\SiteInspection;
use App\Models\ZoningApplication;
use App\Services\InspectionDeliveryRetryService;
use App\Support\InspectionDeliveryRetryEligibility;
use App\Support\InspectionDeliveryRetryResult;
use App\Support\InspectionDeliveryStatus;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use Throwable;

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
    public function status(Request $request, int $id): JsonResponse
    {
        // Same read boundary as applications.show, so a 404 here means only
        // that the application does not exist - never that the caller lacks
        // authority.
        $application = ZoningApplication::query()->findOrFail($id);

        // ONE query for all rounds, ONE eager load for inspector display
        // identity, and ONE aggregate COUNT for the attempt totals. Attempt
        // rows are never loaded, so there is no per-round N+1 and no
        // queue-correlation exposure.
        //
        // LOOP 9C-3: the inspector eager load additionally selects `role`,
        // `is_active` and `handshake_key` so retry eligibility can be decided
        // from rows that are ALREADY loaded. Those attributes are used only to
        // compute `can_retry` and are NEVER serialized: `shapeRounds()` still
        // emits an explicit `['id' => ..., 'name' => ...]` object, so no
        // handshake key, role, active flag, queue uuid, supersession internal or
        // remote profile data can reach a browser. The query count is unchanged.
        //
        // LOOP 9D: `include_attempts` opts ONE named round into its full attempt
        // history. It is off by default, so the ordinary read stays exactly the
        // three queries it has always been. Only an Admin may ask for it; a
        // Planning Officer is refused rather than silently served a different
        // payload, because attempt history is 9D Admin monitoring material.
        $attemptRoundId = $this->resolveAttemptHistoryRequest($request);
        $includeAttempts = $attemptRoundId !== null;

        $rounds = $application->siteInspections()
            ->with(['inspector' => fn ($query) => $query->select('id', 'name', 'role', 'is_active', 'handshake_key')])
            ->when(Schema::hasTable('inspection_delivery_attempts'), function ($query) {
                $query->withCount('deliveryAttempts');
            })
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

        $retryActorAuthorized = $this->isRetryableFor($ownerId, $viewerId, $viewerRole);

        // LOOP 9C-3: supersession is reduced ONCE, from the rounds already in
        // memory, into parcel_id => highest round id. This is what keeps the
        // reader at a constant query count: it is not one supersession query per
        // round, and it is not a query at all. `InspectionDeliveryRetryService`
        // builds the same map from ONE grouped query and then asks the SAME
        // predicate, so "current round" means one thing on both sides.
        $latestRoundIdsByParcel = InspectionDeliveryRetryEligibility::latestRoundIdsByParcel($rounds);

        // LOOP 9D: at most ONE extra query, and only when an Admin asked for one
        // named round's history. Loading it here rather than per round is what
        // keeps the disclosure on-demand instead of an N+1.
        $attemptsByRound = $this->loadAttemptHistory($application, $attemptRoundId);

        return response()->json([
            'application_id' => (int) $application->id,

            // Provenance, so a future UI can explain itself.
            'assigned_planning_officer_id' => $ownerId,

            // ACTOR GATE, NOT AN ACTION FLAG.
            //
            // `retry_actor_authorized` answers exactly one question: does the
            // current viewer satisfy the application-level role and ownership
            // gate? It says NOTHING about whether a retry can actually happen,
            // and it is deliberately NOT named `is_retry_available` - that name
            // was proven misleading at runtime. An application owned by the
            // viewer whose rounds are all delivered, NULL or pending returns
            // `retry_actor_authorized = true` while NO round is retryable, and
            // a UI reading `is_retry_available` would have offered a control
            // with nothing behind it.
            //
            // IT IS STILL APPLICATION-LEVEL ONLY. Loop 9C-3 did NOT fold any
            // round state into it.
            'retry_actor_authorized' => $retryActorAuthorized,

            // Application-level ACTOR reason only: why this viewer is not an
            // authorized actor. Round-level reasons ("no delivery record",
            // "pending", "already delivered") are deliberately NOT mixed in
            // here; a round's own state explains itself through its state,
            // label and message.
            'retry_actor_unavailable_reason' => InspectionDeliveryStatus::retryUnavailableReason($viewerRole, $ownerId, $viewerId),

            'inspections' => $this->shapeRounds($rounds, $ownerId, $viewerId, $viewerRole, $latestRoundIdsByParcel, $attemptsByRound),
        ]);
    }

    /**
     * LOOP 9D: resolve an on-demand attempt-history request.
     *
     * Returns the requested round id, or NULL when no history was asked for.
     * Throws 403 for a non-Admin viewer and 422 for a malformed value, so this
     * can never widen the read boundary or become a client-controlled query.
     */
    private function resolveAttemptHistoryRequest(Request $request): ?int
    {
        if (! $request->filled('include_attempts')) {
            return null;
        }

        // Attempt history is 9D Admin monitoring material. The Planning Officer
        // surface stays exactly as 9C-1 shipped it.
        abort_unless($request->user()?->role === 'Admin', 403);

        $raw = $request->query('include_attempts');

        abort_unless(is_numeric($raw) && (int) $raw > 0, 422, 'include_attempts must be a positive inspection id.');

        return (int) $raw;
    }

    /**
     * LOOP 9D: full attempt history for ONE round, oldest attempt first.
     *
     * Local PostgreSQL only. No Supabase call, no FieldSync call, so monitoring
     * never depends on a device being online.
     *
     * Every column is selected explicitly. `safe_message` is omitted on purpose
     * even though the recorder stores authored prose in it: the 9D contract
     * authorizes the closed category vocabulary, and a free-text column is the
     * one field on this table that could ever carry wording authored outside
     * this codebase. The category, which is a CHECK-constrained token with a
     * fixed label map, is the safe diagnostic signal.
     *
     * @return array<int, list<array<string, mixed>>> keyed by round id
     */
    private function loadAttemptHistory(ZoningApplication $application, ?int $roundId): array
    {
        if ($roundId === null) {
            return [];
        }

        $belongsToApplication = $application->siteInspections()
            ->whereKey($roundId)
            ->exists();

        // A round id belonging to another application must not read that
        // application's history, and must not be distinguishable from a round
        // that simply has no attempts.
        abort_unless($belongsToApplication, 404);

        $attempts = InspectionDeliveryAttempt::query()
            ->where('site_inspection_id', $roundId)
            ->orderBy('attempt_number')
            ->get([
                'id',
                'site_inspection_id',
                'attempt_number',
                'source',
                'outcome',
                'failure_category',
                'attempted_at',
                'completed_at',
                'created_at',
                'queue_job_uuid',
            ])
            ->map(fn (InspectionDeliveryAttempt $attempt): array => [
                'attempt_id'       => (int) $attempt->getKey(),
                'attempt_number'   => (int) $attempt->attempt_number,
                'source'           => (string) $attempt->source,
                'source_label'     => InspectionDeliveryStatus::sourceLabel($attempt->source),
                'outcome'          => (string) $attempt->outcome,
                'outcome_label'    => InspectionDeliveryStatus::outcomeLabel($attempt->outcome),
                'failure_category' => InspectionDeliveryStatus::failureCategory($attempt->failure_category),
                'failure_label'    => InspectionDeliveryStatus::failureCategoryLabel($attempt->failure_category),
                'attempted_at'     => $attempt->attempted_at?->toIso8601String(),
                'completed_at'     => $attempt->completed_at?->toIso8601String(),
                'created_at'       => $attempt->created_at?->toIso8601String(),
                // Operational detail only. An opaque queue payload UUID, never a
                // credential, and never a primary list column.
                'queue_job_uuid'   => $attempt->queue_job_uuid,
            ])
            ->all();

        // Keyed by round id so `shapeRounds()` attaches history to exactly the
        // round that was requested. A round with zero attempts still gets an
        // empty array, which is how the UI can say "no attempts recorded"
        // instead of leaving the viewer guessing.
        return [$roundId => $attempts];
    }

    /**
     * Shape every round into the read contract.
     *
     * @param  Collection<int, SiteInspection>  $rounds
     * @param  array<int, int>  $latestRoundIdsByParcel
     * @return list<array<string, mixed>>
     */
    private function shapeRounds(
        Collection $rounds,
        ?int $ownerId,
        ?int $viewerId,
        ?string $viewerRole,
        array $latestRoundIdsByParcel,
        array $attempts = []
    ): array {
        $index = 0;

        return $rounds->map(function (SiteInspection $round) use ($ownerId, $viewerId, $viewerRole, $latestRoundIdsByParcel, &$index, $attempts): array {
            $index++;
            $roundId = (int) $round->getKey();

            // LOOP 9D: server-computed supersession. This asks the SAME
            // predicate `InspectionDeliveryRetryService` enforces, from the SAME
            // already-built latest-round map, so "non-actionable because
            // superseded" means exactly one thing in the reader and in the retry
            // refusal. It is deliberately NOT derived in React: a browser
            // inference here would be a second, disagreeable definition of which
            // round is current.
            $isSuperseded = InspectionDeliveryRetryEligibility::isSuperseded(
                $roundId,
                $round->parcel_id === null ? null : (int) $round->parcel_id,
                $latestRoundIdsByParcel,
            );

            $row = [
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

                // Explicitly shaped, never a raw User model dump: only the
                // display identity Application Detail already shows. No email,
                // no role, no is_active, no handshake_key, no Supabase profile
                // correlation, no session or account metadata.
                'inspector'         => $round->inspector === null
                    ? null
                    : ['id' => (int) $round->inspector->getKey(), 'name' => $round->inspector->name],

                'delivery' => $this->shapeDelivery(
                    $round,
                    $ownerId,
                    $viewerId,
                    $viewerRole,
                    $latestRoundIdsByParcel,
                ),

                // LOOP 9D. A superseded round stays VISIBLE and is never hidden:
                // it is historical monitoring evidence. It is marked here so an
                // Admin can tell "current, actionable" from "history" without
                // opening anything, and so the marker can never be a client-side
                // guess. Retry authority is unaffected and still refuses it.
                'is_superseded' => $isSuperseded,
            ];

            // LOOP 9D: present ONLY for the single round an Admin explicitly
            // asked about. Absent (not null) for every other round, so a client
            // cannot mistake "not requested" for "no history".
            if (array_key_exists($roundId, $attempts)) {
                $row['attempts'] = $attempts[$roundId];
            }

            return $row;
        })->all();
    }

    /**
     * Shape one round's delivery block.
     *
     * @param  array<int, int>  $latestRoundIdsByParcel
     * @return array<string, mixed>>
     */
    private function shapeDelivery(
        SiteInspection $round,
        ?int $ownerId,
        ?int $viewerId,
        ?string $viewerRole,
        array $latestRoundIdsByParcel
    ): array
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
            // LOOP 9D: the closed category token with a server-authored human
            // name, so an Admin can read the category without the browser
            // inventing a label map. Deliberately named `failure_label` and not
            // `failure_category_label`: the raw token is never sent here, only
            // its readable name, and the field name says so.
            //
            // Never a raw exception: the category is CHECK-constrained to seven
            // values and both the token and the name come from fixed authored
            // tables.
            'failure_label' => $isFailed
                ? InspectionDeliveryStatus::failureCategoryLabel($round->last_delivery_failure_category)
                : null,
            'failure_message' => $isFailed
                ? InspectionDeliveryStatus::failureMessage($round->last_delivery_failure_category)
                : null,

            // THE AUTHORITATIVE RETRY DECISION. Server-computed, and now the
            // output of the ONE shared eligibility contract that
            // `InspectionDeliveryRetryService` will also enforce, so a future
            // browser can never offer a control the POST would refuse.
            //
            // It is false when the viewer is not the assigned Planning Officer,
            // when the round is not a recorded delivery failure, when a newer
            // round has superseded this one, or when the assigned Site Inspector
            // is not currently locally eligible for FieldSync work.
            // A future UI must gate every retry control on THIS value,
            // never on the application-level `retry_actor_authorized` flag.
            // This phase performs no retry.
            //
            // The inspector's local eligibility is computed from attributes
            // already loaded above and is deliberately not exposed: this block
            // still reports only `id` and `name` for the inspector.
            'can_retry' => InspectionDeliveryRetryEligibility::canRetry(
                [
                    'round_id' => (int) $round->getKey(),
                    'parcel_id' => $round->parcel_id === null ? null : (int) $round->parcel_id,
                    'delivery_status' => $round->delivery_status,
                    'inspector_eligible' => InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible($round->inspector),
                ],
                $latestRoundIdsByParcel,
                $viewerRole,
                $ownerId,
                $viewerId,
            ),
        ];
    }

    /**
     * Is this viewer an authorized RETRY ACTOR for the application?
     *
     * This is the application-level gate only. It deliberately does NOT consider
     * any round's delivery state, because a role and ownership answer is a
     * different question from "can a retry happen right now". Combining them
     * here is what made the earlier top-level boolean misleading.
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

    // ══════════════════════════════════════════════════════════════
    // LOOP 9C-2  THE RETRY POST
    // ══════════════════════════════════════════════════════════════

    /**
     * Queue a Planning Officer technical delivery retry for one round.
     *
     * THE HTTP LAYER IS THIN ON PURPOSE. This action does four things and
     * nothing else:
     *
     *   1. takes the authenticated local user as the actor,
     *   2. takes the target round's identity from the route,
     *   3. hands both to `InspectionDeliveryRetryService`,
     *   4. translates a known domain outcome into a response.
     *
     * It does NOT decide anything. There is no `if delivery_status === ...`,
     * no ownership comparison, no supersession arithmetic, no inspector check
     * and no handshake-key test anywhere in this method, because every one of
     * those rules lives in `InspectionDeliveryRetryService` and
     * `InspectionDeliveryRetryEligibility`. Duplicating a rule here is how a
     * read side and a write side drift apart, and then the browser offers a
     * control the server refuses.
     *
     * The actor is NEVER taken from the request. There is no request body at
     * all: the target is the route parameter and the actor is the session, so
     * a client cannot assert an owner, a delivery state, an inspector, a
     * source or an application.
     *
     * `QUEUED` IS THE ONLY TRUTH THIS RESPONSE CAN STATE. The success flash
     * says the retry has been queued, because that is exactly what committed:
     * a pending delivery state, an audit row and a database queue job. FieldSync
     * has not been contacted, and whether the delivery will ever succeed is not
     * known here. The 9B worker owns that.
     *
     * A DOMAIN REFUSAL IS NOT AN ERROR. Wrong actor, wrong state, superseded
     * round, ineligible inspector and not-found are all decisions the service
     * made on purpose, and each maps to its own status so a client can tell
     * "you may not" from "not now" from "never again". An INFRASTRUCTURE
     * failure is different: the service lets it throw, the transaction has
     * already unwound all three writes, and it becomes a 503 with no internal
     * detail in the response.
     */
    public function retry(Request $request, int $inspection): RedirectResponse
    {
        $actor = $request->user();

        // The `auth` + `role:Planning Officer` middleware already guarantees a
        // Planning Officer here. This guard exists so a future refactor that
        // loosens the route cannot turn a missing actor into a type error
        // inside the service.
        if ($actor === null) {
            abort(403, 'Delivery retry requires an authenticated Planning Officer.');
        }

        try {
            $result = app(InspectionDeliveryRetryService::class)
                ->queueRetry($inspection, $actor);
        } catch (Throwable $exception) {
            // The service's transaction has already rolled back the pending
            // state, the audit row and the queue insert by the time anything
            // reaches this catch. Log the cause server-side; return nothing
            // about it. The response deliberately carries no exception message,
            // SQLSTATE, table name, connection detail or stack trace.
            Log::error('[DeliveryRetry] Retry transaction failed and was rolled back.', [
                'site_inspection_id' => $inspection,
                'actor_id'           => $actor->getKey(),
                'exception_class'    => $exception::class,
                'exception_message'  => $exception->getMessage(),
            ]);

            abort(503, 'Delivery retry could not be queued.');
        }

        if ($result->isQueued()) {
            return back()->with('success', 'Delivery retry has been queued.');
        }

        return $this->translateRefusal($result);
    }

    /**
     * Translate one known domain refusal into its HTTP status and message.
     *
     * The message is the AUTHORED PROSE from the 9C-3-1 result object, never
     * the internal outcome token, so no blocker enum reaches a browser and no
     * field name, id or SQL predicate is disclosed.
     *
     * The split is deliberate:
     *
     *   403  the caller may not act on this application at all
     *   404  the target does not exist
     *   409  the request was well formed but conflicts with the round's
     *        current state, which is exactly what 409 means
     *
     * @return never
     */
    private function translateRefusal(InspectionDeliveryRetryResult $result)
    {
        abort(
            match ($result->outcome) {
                InspectionDeliveryRetryResult::INSPECTION_NOT_FOUND,
                InspectionDeliveryRetryResult::APPLICATION_NOT_FOUND => 404,

                // Wrong officer, or an application with no recorded owner.
                InspectionDeliveryRetryResult::NOT_AUTHORIZED => 403,

                // Not a recorded failure, a superseded round, a round whose
                // parcel cannot confirm its position, a round whose application
                // moved out from under it, or an inspector who cannot currently
                // receive field work.
                InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
                InspectionDeliveryRetryResult::SUPERSEDED_ROUND,
                InspectionDeliveryRetryResult::PARCEL_UNKNOWN,
                InspectionDeliveryRetryResult::APPLICATION_MISMATCH,
                InspectionDeliveryRetryResult::INSPECTOR_INVALID => 409,

                // Unreachable: a non-queued result always carries a refusal
                // outcome. Fail closed rather than fall through to a success.
                default => 409,
            },
            $result->message()
        );
    }
}
