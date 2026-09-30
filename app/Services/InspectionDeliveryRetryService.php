<?php

namespace App\Services;

use App\Jobs\PushInspectionToSupabase;
use App\Models\InspectionDeliveryAttempt;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Support\InspectionDeliveryRetryEligibility;
use App\Support\InspectionDeliveryRetryResult;
use App\Support\InspectionDeliveryStatus;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Loop 9C-3 - atomic Planning Officer technical delivery retry.
 *
 * WHAT THIS IS
 * ------------
 * The technical retry of one EXISTING inspection round's FieldSync delivery. It
 * is not a new inspection, not a reinspection, not an inspector reassignment,
 * not a Planning Officer reassignment, not an application status transition, not
 * an inspection lifecycle transition, and not a second bridge writer. It
 * re-queues the ONE existing writer, `PushInspectionToSupabase`, with an
 * explicit source, so the 9B recorder remains the only creator of delivery
 * attempts and the only authority on remote validity.
 *
 * ONE TRANSACTION, THREE FACTS
 * ----------------------------
 * The accepted path writes exactly three things inside a single PostgreSQL
 * transaction and then commits:
 *
 *   1. `site_inspections.delivery_status = 'pending_delivery'`
 *   2. one strict `audit_trail` row
 *   3. one `jobs` row, from the database queue INSERT
 *
 * The queue connection is `env('DB_QUEUE_CONNECTION')`, which is UNSET, so the
 * database queue resolves to the same default `pgsql` connection object the
 * transaction runs on. `DatabaseQueue::pushToDatabase()` is a plain
 * `insertGetId` on that connection, so the `jobs` row is part of the same
 * transaction and a rollback removes it. That property has been proved against
 * the real queue with a rollback-only probe: the transaction saw the row, a
 * separate connection saw nothing, and ROLLBACK returned the count to baseline.
 *
 * Because all three commit together, there is NO compensation logic anywhere in
 * this class. There is no "revert pending on dispatch failure" path, and there
 * cannot be: by the time a failure is observed the transaction is already
 * unwound, so no stale revert can ever overwrite a newer execution.
 *
 * FIXED LOCK ORDER: APPLICATION THEN INSPECTION
 * ---------------------------------------------
 * Planning Officer ownership lives on `zoning_applications`, not on
 * `site_inspections`. Locking only the inspection therefore cannot stop an
 * Admin from transferring ownership between the authorization check and the
 * commit, and the audit row would then name an officer who had already ceased to
 * be the current owner. So the application row is locked FIRST, always, and the
 * inspection row second, always. The order is fixed so the two locks can never
 * be taken in opposite orders by two callers.
 *
 * This order also removes the only plausible deadlock here. A superseding round
 * is created by `TechnicalReviewController::createInspectionRound()`, which
 * takes `lockForUpdate()` on the LATEST round of that application and parcel.
 * For an accepted retry the target round IS that latest round, so the two paths
 * contend for the same row and one waits for the other. No cycle exists, so no
 * deadlock-retry loop is added: the lock order is the guarantee.
 *
 * PRESERVED, NEVER TOUCHED
 * -------------------------
 * `pending_delivery` is the only column this service writes on an inspection.
 * In particular it does NOT touch `status`, `inspector_id`, `assigned_notes`,
 * `scheduled_date`, `deadline_date`, `submitted_at`, `findings` or any other
 * evidence or progress field.
 *
 *   * `last_delivery_failure_category` is PRESERVED. `beginAttempt()` does not
 *     clear it either; only `markDelivered()` does. It is the last recorded
 *     historical failure and stays visible until a delivery actually succeeds.
 *   * `last_delivery_attempt_at` is PRESERVED. It records when a 9B attempt
 *     actually began. No attempt has begun yet, so writing it now would record
 *     a false fact.
 *   * `delivered_at` is PRESERVED and is write-once: the first successful
 *     delivery, which survives a later failed re-push.
 *
 * NO ATTEMPT ROW
 * --------------
 * This service never inserts `inspection_delivery_attempts`. An accepted retry
 * means QUEUED and nothing more. The 9B worker opens the attempt, with its own
 * `attempt_number` and `queue_job_uuid`, when execution actually begins.
 *
 * NO REMOTE PREVALIDATION
 * -----------------------
 * Nothing here touches Supabase, `profiles`, `field_jobs` or Storage. Local
 * authority only. A remote problem must surface as a durable 9B attempt and a
 * `delivery_failed` summary, never as a synchronous request error.
 */
final class InspectionDeliveryRetryService
{
    /**
     * The accountable action recorded for an accepted retry.
     *
     * `QUEUED` rather than `REQUESTED` because the pending state, the audit row
     * and the `jobs` row all commit together: by the time this row exists, the
     * delivery is genuinely queued. The wording also stops this row from ever
     * being read as proof that FieldSync accepted anything, which it is not.
     *
     * `audit_trail.action` is a free `varchar(60)` with no CHECK or enum, so no
     * schema change is required.
     */
    public const AUDIT_ACTION = 'DELIVERY_RETRY_QUEUED';

    /**
     * The dispatch source.
     *
     * LOCKED INTERPRETATION: the source records the ORIGIN of a delivery
     * dispatch, not the mechanism of a particular queue execution. Every
     * execution belonging to this same queued command - including the ones
     * Laravel's own worker performs when it retries that command - therefore
     * keeps `planning_officer_retry`, because they all originate from this
     * Planning Officer's retry. `InspectionDeliveryRecorder::resolveSource()`
     * already implements exactly this, by preferring an explicit valid source
     * over the queue-attempt count, and is deliberately NOT changed here.
     * `automatic_retry` stays meaningful for jobs that were not created from an
     * explicit Planning Officer retry source.
     */
    public const DELIVERY_SOURCE = InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY;

    public function __construct(
        private readonly WorkAssignmentService $assignments,
    ) {
    }

    /**
     * Queue a technical delivery retry for one inspection round.
     *
     * Takes a stable inspection ID and the authenticated actor rather than an
     * Eloquent model, so no decision is ever made from a possibly stale
     * instance loaded before the transaction began.
     */
    public function queueRetry(int $siteInspectionId, User $actor): InspectionDeliveryRetryResult
    {
        // The only pre-lock read in this class. It exists solely to learn WHICH
        // application row must be locked first, because ownership lives there.
        // `zoning_application_id` is a non-nullable column, and the value is
        // revalidated against the locked application below before any decision
        // is made from it.
        $applicationId = SiteInspection::query()
            ->whereKey($siteInspectionId)
            ->value('zoning_application_id');

        if ($applicationId === null) {
            return InspectionDeliveryRetryResult::refused(
                InspectionDeliveryRetryResult::INSPECTION_NOT_FOUND,
                $siteInspectionId,
            );
        }

        return DB::transaction(function () use ($siteInspectionId, $applicationId, $actor) {
            // ---------------------------------------------------------------
            // LOCK 1 of 2: the application. Never skipped, never second.
            // ---------------------------------------------------------------
            $application = ZoningApplication::query()
                ->whereKey($applicationId)
                ->lockForUpdate()
                ->first();

            if ($application === null) {
                return InspectionDeliveryRetryResult::refused(
                    InspectionDeliveryRetryResult::APPLICATION_NOT_FOUND,
                    $siteInspectionId,
                );
            }

            // ---------------------------------------------------------------
            // LOCK 2 of 2: the inspection round.
            // ---------------------------------------------------------------
            $inspection = SiteInspection::query()
                ->whereKey($siteInspectionId)
                ->lockForUpdate()
                ->first();

            if ($inspection === null) {
                return InspectionDeliveryRetryResult::refused(
                    InspectionDeliveryRetryResult::INSPECTION_NOT_FOUND,
                    $siteInspectionId,
                    (int) $application->getKey(),
                );
            }

            // The pointer read before any lock existed is only trusted once it
            // matches the application actually locked.
            if ((int) $inspection->zoning_application_id !== (int) $application->getKey()) {
                return InspectionDeliveryRetryResult::refused(
                    InspectionDeliveryRetryResult::APPLICATION_MISMATCH,
                    $siteInspectionId,
                    (int) $application->getKey(),
                );
            }

            // ---------------------------------------------------------------
            // Authority, re-read UNDER the application lock. No ownership state
            // loaded earlier is used anywhere.
            // ---------------------------------------------------------------
            $ownerId = $application->assigned_planning_officer_id === null
                ? null
                : (int) $application->assigned_planning_officer_id;

            if (! InspectionDeliveryRetryEligibility::actorAuthorized($actor->role, $ownerId, (int) $actor->getKey())) {
                return InspectionDeliveryRetryResult::refused(
                    InspectionDeliveryRetryResult::NOT_AUTHORIZED,
                    $siteInspectionId,
                    (int) $application->getKey(),
                );
            }

            // ---------------------------------------------------------------
            // Rule C, D and E, evaluated inside the transaction.
            //
            // Rule E is answered by the repository's own canonical logic, not by
            // a second copy of its conditions.
            // ---------------------------------------------------------------
            $decision = InspectionDeliveryRetryEligibility::evaluateRound(
                [
                    'round_id' => (int) $inspection->getKey(),
                    'parcel_id' => $inspection->parcel_id === null ? null : (int) $inspection->parcel_id,
                    'delivery_status' => $inspection->delivery_status,
                    'inspector_eligible' => $this->inspectorIsEligible(
                        $inspection->inspector_id === null ? null : (int) $inspection->inspector_id,
                    ),
                ],
                $this->latestRoundIdsByParcelFor($application),
            );

            if (! $decision['eligible']) {
                return InspectionDeliveryRetryResult::refused(
                    $this->outcomeForBlocker($decision['blockers']),
                    $siteInspectionId,
                    (int) $application->getKey(),
                );
            }

            // ---------------------------------------------------------------
            // 1. The pending transition. ONE column, and nothing else.
            // ---------------------------------------------------------------
            $inspection->forceFill([
                'delivery_status' => InspectionDeliveryStatus::STATE_PENDING,
            ])->save();

            // ---------------------------------------------------------------
            // 2. The STRICT audit insert.
            //
            // Deliberately NOT `AuditLogger::log()`, which wraps its insert in a
            // try/catch and only logs. A retry that committed without its
            // accountability row would be an unaccountable mutation of delivery
            // state, which is the one thing Loop 9 exists to prevent. A bare
            // insert in the caller's transaction makes a failure unwind the
            // pending state and the queue row with it, exactly as
            // `WorkAssignmentService::writeAuditTrail()` does.
            //
            // Shared `AuditLogger` semantics are NOT changed.
            // ---------------------------------------------------------------
            DB::table('audit_trail')->insert([
                'application_id' => (int) $application->getKey(),
                'action'         => self::AUDIT_ACTION,
                'performed_by'   => (int) $actor->getKey(),
                'note'           => sprintf(
                    'Queued FieldSync delivery retry for inspection round %d. The round status, its assigned inspector, its evidence and its delivery history were not changed.',
                    (int) $inspection->getKey(),
                ),
                'performed_at'   => now(),
            ]);

            // ---------------------------------------------------------------
            // 3. Re-queue the ONE existing bridge writer. Inside this
            //    transaction, so the `jobs` row commits with 1 and 2.
            // ---------------------------------------------------------------
            PushInspectionToSupabase::dispatch($inspection, self::DELIVERY_SOURCE);

            // COMMIT happens here, atomically with all three writes. An
            // infrastructure failure - queue insert, serialization, lost
            // connection - leaves this closure by exception, the transaction
            // unwinds all three, and the failure propagates rather than being
            // reported as a business refusal.
            return InspectionDeliveryRetryResult::queued(
                (int) $inspection->getKey(),
                (int) $application->getKey(),
            );
        });
    }

    /**
     * parcel_id => highest round id for this application, in ONE grouped query.
     *
     * Bounded: it is a single aggregate for the whole application, never one
     * query per round, so the retry path has a constant query count regardless
     * of how many rounds the application has. The reader never calls this: it
     * already holds every round and derives the same map in memory.
     *
     * Runs inside the caller's transaction and under the application lock.
     *
     * @return array<int, int>
     */
    private function latestRoundIdsByParcelFor(ZoningApplication $application): array
    {
        return SiteInspection::query()
            ->selectRaw('parcel_id, MAX(id) AS latest_round_id')
            ->where('zoning_application_id', $application->getKey())
            ->whereNotNull('parcel_id')
            ->groupBy('parcel_id')
            ->pluck('latest_round_id', 'parcel_id')
            ->map(fn ($id) => (int) $id)
            ->all();
    }

    /**
     * Map round-level blockers onto the transport-independent outcomes 9C-3-2
     * will translate. The order is the order the rules are evaluated in, so the
     * FIRST blocker is the one reported.
     *
     * @param  list<string>  $blockers
     */
    private function outcomeForBlocker(array $blockers): string
    {
        return match (true) {
            in_array(InspectionDeliveryRetryEligibility::BLOCKER_WRONG_DELIVERY_STATE, $blockers, true)
                => InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
            in_array(InspectionDeliveryRetryEligibility::BLOCKER_PARCEL_UNKNOWN, $blockers, true)
                => InspectionDeliveryRetryResult::PARCEL_UNKNOWN,
            in_array(InspectionDeliveryRetryEligibility::BLOCKER_SUPERSEDED, $blockers, true)
                => InspectionDeliveryRetryResult::SUPERSEDED_ROUND,
            in_array(InspectionDeliveryRetryEligibility::BLOCKER_INSPECTOR_INVALID, $blockers, true)
                => InspectionDeliveryRetryResult::INSPECTOR_INVALID,
            default => InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
        };
    }

    /**
     * Rule E for the retry path, using the repository's canonical reusable logic
     * rather than a second copy of the conditions.
     *
     * `WorkAssignmentService::resolveActiveSiteInspector()` is already public,
     * so no visibility is changed for convenience. It raises the same four
     * messages the inspector picker and the reassignment form already show.
     *
     * Its `ValidationException` is a WEB-shaped refusal being reused inside a
     * transport-independent service, so it is translated here into the
     * transport-independent outcome rather than being allowed to escape.
     */
    public function inspectorIsEligible(?int $inspectorId): bool
    {
        if ($inspectorId === null) {
            return false;
        }

        try {
            $this->assignments->resolveActiveSiteInspector($inspectorId);
        } catch (ValidationException) {
            return false;
        }

        return true;
    }
}
