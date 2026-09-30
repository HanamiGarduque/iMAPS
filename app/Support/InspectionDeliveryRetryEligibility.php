<?php

namespace App\Support;

use App\Models\User;

/**
 * Loop 9C-3 - THE ONE canonical server-side retry eligibility contract.
 *
 * WHY ONE CLASS
 * --------------
 * A Planning Officer retry is the first user-triggered Loop 9 mutation, so two
 * independent rule sets are no longer acceptable: a read-side `can_retry` and a
 * write-side eligibility check that disagree produce a control the server
 * refuses, or worse, a mutation the UI never offered. Both the Loop 9C-1 reader
 * and the Loop 9C-3 retry service therefore evaluate their rules HERE, and
 * nowhere else.
 *
 * This class is a PURE evaluator. It reads no database, calls no Supabase or
 * FieldSync service and holds no state, which is what makes every rule below
 * directly testable with no database, no network and no credentials.
 *
 * THE FIVE RULES
 * --------------
 *   A. the actor's role is exactly 'Planning Officer'
 *   B. `zoning_applications.assigned_planning_officer_id` is NOT NULL and is
 *      exactly the authenticated local iMAPS user id
 *   C. the round's `delivery_status` is exactly 'delivery_failed'
 *   D. the round is not superseded by a newer round
 *   E. the round's assigned inspector satisfies the repository's canonical
 *      LOCAL FieldSync eligibility rule
 *
 * AUTHORITY IS A SINGLE STORED POINTER
 * ------------------------------------
 * Ownership is `assigned_planning_officer_id` and nothing else. `encoded_by`,
 * `technical_reviews.reviewed_by`, `audit_trail.performed_by` and the application
 * creator are deliberately NOT consulted: none of them records current
 * ownership. Every live application happens to carry an `encoded_by` pointing at
 * a Planning Officer who does not own it, so inferring ownership from it would
 * hand retry authority to the wrong person on every single application.
 *
 * SUPERSESSION SCOPE IS COMPOSITE
 * -------------------------------
 * A round is superseded when another `site_inspections` row exists with the SAME
 * `zoning_application_id` AND the SAME `parcel_id` AND a HIGHER `id`. That is
 * exactly the scope `TechnicalReviewController::createInspectionRound()` and
 * `TechnicalReviewController::resolveReviewedInspectionId()` already use, so
 * "current round" means the same thing here as it does to the technical review
 * that can create a superseding round. Neither `parcel_id` alone nor application
 * alone is used, and neither is array position, the 9C-1 display round number,
 * or `Parcel::siteInspection()->latestOfMany()` on its own.
 *
 * A NULL `parcel_id` FAILS CLOSED. The composite scope cannot be evaluated
 * without one, so such a round is never reported as non-superseded. Eight live
 * rounds have a NULL parcel, and none of them is a recorded delivery failure,
 * but the rule is stated rather than assumed.
 *
 * LOCAL INSPECTOR ELIGIBILITY IS NOT REMOTE VALIDATION
 * -----------------------------------------------------
 * `handshake_key` is a LOCAL column: its presence proves the local account has a
 * FieldSync account to deliver to. It does NOT prove the remote `profiles` row
 * exists, that Supabase is reachable, or that the remote field job can be
 * written. Those are exclusively owned by
 * `PushInspectionToSupabase::resolveSupabaseUserId()`, and a failure there
 * becomes a durable 9B delivery attempt. This class must never grow a remote
 * check: doing so would fork the single bridge authority and could pre-empt a
 * durable failure record with a synchronous request error.
 */
final class InspectionDeliveryRetryEligibility
{
    /** The actor is not the Planning Officer currently assigned to the application. */
    public const BLOCKER_NOT_AUTHORIZED = 'actor_not_authorized';

    /** The round has no recorded delivery failure. */
    public const BLOCKER_WRONG_DELIVERY_STATE = 'wrong_delivery_state';

    /** A newer round exists for the same application and parcel. */
    public const BLOCKER_SUPERSEDED = 'superseded_round';

    /** `parcel_id` is NULL, so non-supersession cannot be proven. */
    public const BLOCKER_PARCEL_UNKNOWN = 'parcel_unknown';

    /** The assigned inspector is not locally eligible for FieldSync work. */
    public const BLOCKER_INSPECTOR_INVALID = 'inspector_invalid';

    /**
     * Rule A + B: the application-level actor and ownership gate.
     *
     * This is deliberately ONLY the actor gate. It says nothing about any
     * round's delivery state, because "may this person act on this application"
     * and "can a retry happen right now" are different questions, and merging
     * them is what made an earlier top-level `is_retry_available` boolean
     * misleading at runtime.
     */
    public static function actorAuthorized(?string $actorRole, ?int $ownerId, ?int $actorId): bool
    {
        if ($actorRole !== 'Planning Officer') {
            return false;
        }

        if ($ownerId === null || $actorId === null) {
            return false;
        }

        return $ownerId === $actorId;
    }

    /**
     * The canonical application-level actor explanation.
     *
     * Delegates to the shipped Loop 9C-1 presenter so the read side and the
     * write side can never word the same refusal differently. States only
     * locally provable facts, and never implies that some other officer could
     * recover the application or names an owner inferred from a
     * non-ownership column.
     */
    public static function actorUnavailableReason(?string $actorRole, ?int $ownerId, ?int $actorId): ?string
    {
        return InspectionDeliveryStatus::retryUnavailableReason($actorRole, $ownerId, $actorId);
    }

    /**
     * Rule D support: reduce a set of rounds to parcel_id => highest round id.
     *
     * The reader already holds every round of the application, so it builds this
     * map from rows it has already loaded and pays NO extra query. The retry
     * service, which holds only one locked row, supplies the same map from one
     * grouped query. Both then ask {@see self::isSuperseded()}, so "current
     * round" is one definition with two sources rather than two definitions.
     *
     * @param  iterable<mixed>  $rounds  Anything exposing `parcel_id` and `getKey()`.
     * @return array<int, int> parcel_id => highest site_inspections.id
     */
    public static function latestRoundIdsByParcel(iterable $rounds): array
    {
        $latest = [];

        foreach ($rounds as $round) {
            $parcelId = $round->parcel_id === null ? null : (int) $round->parcel_id;

            if ($parcelId === null) {
                continue;
            }

            $id = (int) $round->getKey();
            $latest[$parcelId] = max($latest[$parcelId] ?? 0, $id);
        }

        return $latest;
    }

    /**
     * Rule D: is this round superseded by a newer round of the same parcel?
     *
     * A parcel that is absent from the map means no OTHER round exists for it,
     * so this round is trivially the newest for that parcel and is NOT
     * superseded. Both callers guarantee the map is complete for the
     * application: the reader derives it from the rounds it has already loaded,
     * and the service builds it from one grouped query over the application.
     *
     * A NULL parcel is reported as superseded here, so an unevaluatable scope
     * is never presented as safe to retry.
     *
     * @param  array<int, int>  $latestRoundIdsByParcel
     */
    public static function isSuperseded(int $roundId, ?int $parcelId, array $latestRoundIdsByParcel): bool
    {
        if ($parcelId === null) {
            return true;
        }

        $latest = $latestRoundIdsByParcel[$parcelId] ?? $roundId;

        return $latest > $roundId;
    }

    /**
     * Rule E: the repository's canonical LOCAL Site Inspector eligibility.
     *
     * Three conditions, all required, matching `User::activeSiteInspectorRule()`
     * and `WorkAssignmentService::resolveActiveSiteInspector()`:
     *   - role 'Site Inspector', so nobody is handed work outside their remit;
     *   - an active account, because a suspended employee cannot log in and the
     *     work would simply be stranded;
     *   - a FieldSync handshake key, because that key is what resolves a
     *     Supabase profile to deliver the job to. Without it there is nowhere
     *     to send the task.
     *
     * The RETRY SERVICE does not use this: it reuses
     * `WorkAssignmentService::resolveActiveSiteInspector()` directly, so no
     * condition is re-implemented there. This method exists for the READER,
     * which must decide a boolean for many rounds in one bounded query budget
     * and cannot afford a throwing service call per round. Both sides then feed
     * their own canonical answer into {@see self::evaluateRound()}, so the rule
     * ORDER and the blocker vocabulary stay shared while neither side forks the
     * conditions. `Loop9c3InspectorValidityAlignmentTest` proves the two agree.
     *
     * REMOTE VALIDATION IS EXPLICITLY NOT HERE. Whether the `profiles` row
     * actually exists is the writer's business.
     */
    public static function inspectorIsLocallyEligible(?User $inspector): bool
    {
        if ($inspector === null) {
            return false;
        }

        if ($inspector->role !== 'Site Inspector') {
            return false;
        }

        if (! $inspector->is_active) {
            return false;
        }

        return ! blank($inspector->handshake_key);
    }

    /**
     * Rules C, D and E: the round-level half of eligibility.
     *
     * Deliberately EXCLUDES the actor gate. A caller that must distinguish
     * "you are not the owner" from "this round cannot be retried" needs the two
     * levels apart; the reader and the service both apply the actor gate
     * themselves, so the two refusals are never reported as one.
     *
     * `inspector_eligible` is PASSED IN rather than derived here, because each
     * caller has a different canonical source for that one fact and neither may
     * invent a third: the reader passes the result of
     * {@see self::inspectorIsLocallyEligible()}, and the retry service passes
     * the result of
     * `WorkAssignmentService::resolveActiveSiteInspector()`. Everything else -
     * which rules exist, in what order, and what each refusal is called - is
     * decided here and only here.
     *
     * @param  array{round_id: int, parcel_id: ?int, delivery_status: ?string, inspector_eligible: bool}  $round
     * @param  array<int, int>  $latestRoundIdsByParcel
     * @return array{eligible: bool, blockers: list<string>}
     */
    public static function evaluateRound(array $round, array $latestRoundIdsByParcel): array
    {
        $blockers = [];

        if (! InspectionDeliveryStatus::isFailure($round['delivery_status'] ?? null)) {
            $blockers[] = self::BLOCKER_WRONG_DELIVERY_STATE;
        }

        $parcelId = $round['parcel_id'] ?? null;

        if ($parcelId === null) {
            $blockers[] = self::BLOCKER_PARCEL_UNKNOWN;
        } elseif (self::isSuperseded((int) $round['round_id'], (int) $parcelId, $latestRoundIdsByParcel)) {
            $blockers[] = self::BLOCKER_SUPERSEDED;
        }

        if (! ($round['inspector_eligible'] ?? false)) {
            $blockers[] = self::BLOCKER_INSPECTOR_INVALID;
        }

        return [
            'eligible' => $blockers === [],
            'blockers' => $blockers,
        ];
    }

    /**
     * The single authoritative retry decision: rules A through E together.
     *
     * The Loop 9C-1 reader exposes exactly this value as `delivery.can_retry`,
     * so a browser can never offer a control the future POST would refuse.
     *
     * @param  array{round_id: int, parcel_id: ?int, delivery_status: ?string, inspector_eligible: bool}  $round
     * @param  array<int, int>  $latestRoundIdsByParcel
     */
    public static function canRetry(array $round, array $latestRoundIdsByParcel, ?string $actorRole, ?int $ownerId, ?int $actorId): bool
    {
        if (! self::actorAuthorized($actorRole, $ownerId, $actorId)) {
            return false;
        }

        return self::evaluateRound($round, $latestRoundIdsByParcel)['eligible'];
    }
}
