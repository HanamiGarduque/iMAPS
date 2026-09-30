<?php

namespace App\Services;

use App\Models\InspectionDeliveryAttempt;
use App\Models\SiteInspection;
use Illuminate\Database\QueryException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Loop 9B — local delivery-state recording for the iMAPS -> FieldSync bridge.
 *
 * SCOPE. This service records LOCAL delivery state only. It never calls
 * Supabase, never dispatches a job, never changes an inspector assignment, an
 * application, an inspection's task lifecycle status, or Planning Officer
 * ownership. Bridge delivery state is additive observability and is NOT a
 * second task lifecycle: `field_jobs.status` (assigned / in_progress /
 * completed) and `site_inspections.status` remain owned by the FieldSync
 * lifecycle and are never written here.
 *
 * TRANSACTIONS. Network calls must never run inside a local transaction. Every
 * method here therefore owns one SHORT local transaction that contains only
 * local row locks and writes.
 *
 * CONCURRENCY. Attempt numbers are allocated while holding a row lock on the
 * parent `site_inspections` row, which serializes concurrent or duplicated
 * dispatches for the same round. The 9A unique constraint
 * (site_inspection_id, attempt_number) is a backstop, and a unique violation is
 * retried boundedly rather than silently reusing a sequence number.
 *
 * TERMINAL STATE. `handle()` records an ATTEMPT failure but never sets the
 * terminal summary, because the queue may still retry. `reconcileTerminalFailure()`
 * is invoked from the job's `failed()` hook and derives its decision purely from
 * durable database state, so it is correct even when Laravel reconstructs the
 * command from the queue payload and no runtime-mutated property survives.
 */
class InspectionDeliveryRecorder
{
    /** How many times allocation is retried if the unique backstop trips. */
    private const ALLOCATION_RETRIES = 3;

    /**
     * Closed failure vocabulary, with the user-facing prose that may be stored.
     *
     * These strings are safe by construction: they never embed a response body,
     * an exception message, a URL, a key, or a header.
     */
    public const MESSAGES = [
        InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED
            => 'The assigned inspector does not have a mapped FieldSync profile.',
        InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE
            => 'FieldSync could not be reached.',
        InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE
            => 'FieldSync rejected the iMAPS bridge credentials.',
        InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE
            => 'FieldSync rejected the record because it conflicts with existing data.',
        InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE
            => 'FieldSync rejected the delivery data as invalid.',
        InspectionDeliveryAttempt::FAILURE_CONFIGURATION_FAILURE
            => 'iMAPS bridge configuration is incomplete.',
        InspectionDeliveryAttempt::FAILURE_UNKNOWN
            => 'Delivery failed for an unclassified reason.',
    ];

    /** Matched-empty variant of the inspector-mapping message. */
    private const MESSAGE_PROFILE_UNMATCHED
        = 'The assigned inspector\'s FieldSync profile could not be matched.';

    /**
     * Open a delivery attempt and mark the round as awaiting delivery.
     *
     * $queueJobUuid is the REAL Laravel queue payload UUID of the dispatch that
     * is executing right now, obtained from the queue job itself. It is stored
     * verbatim: automatic retries of one dispatch reuse the same UUID and each
     * create a new attempt_number, while a separately dispatched job (including
     * a future Planning Officer technical retry) gets its own.
     *
     * A synchronous or direct invocation has no queue job, so the value is
     * NULL. That is safe: such an execution can never reach the queue's
     * failed() hook, so it can never terminalize a summary.
     *
     * Returns null only when the attempt cannot be allocated after bounded
     * retries. A null return must never abort the bridge: the remote delivery is
     * still correct without observability, and losing an attempt record is
     * strictly better than losing a task. See the DEGRADED OBSERVABILITY contract
     * in docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md.
     */
    public function beginAttempt(
        SiteInspection $inspection,
        ?string $explicitSource = null,
        int $queueAttempts = 1,
        ?string $queueJobUuid = null
    ): ?InspectionDeliveryAttempt {
        $source = $this->resolveSource($explicitSource, $queueAttempts);
        $correlation = $this->normalizeCorrelation($queueJobUuid);

        for ($try = 1; $try <= self::ALLOCATION_RETRIES; $try++) {
            try {
                return DB::transaction(function () use ($inspection, $source, $correlation) {
                    // Serialize allocation for this exact round. Concurrent or
                    // duplicated dispatches queue behind this lock.
                    $parent = SiteInspection::query()
                        ->whereKey($inspection->getKey())
                        ->lockForUpdate()
                        ->first();

                    if ($parent === null) {
                        return null;
                    }

                    $next = (int) InspectionDeliveryAttempt::query()
                        ->where('site_inspection_id', $parent->getKey())
                        ->max('attempt_number') + 1;

                    $attemptedAt = now();

                    $attempt = InspectionDeliveryAttempt::create([
                        'site_inspection_id' => $parent->getKey(),
                        'attempt_number' => $next,
                        'source' => $source,
                        'outcome' => InspectionDeliveryAttempt::OUTCOME_PENDING,
                        'failure_category' => null,
                        'safe_message' => null,
                        'attempted_at' => $attemptedAt,
                        'completed_at' => null,
                    ]);

                    // Recorder-controlled correlation. Written explicitly and
                    // never mass-assigned, so it cannot come from a request.
                    $attempt->forceFill([
                        InspectionDeliveryAttempt::CORRELATION_COLUMN => $correlation,
                    ])->save();

                    // Current summary. delivered_at is deliberately NOT cleared:
                    // it is the first successful delivery and survives a re-push.
                    $parent->forceFill([
                        'delivery_status' => 'pending_delivery',
                        'last_delivery_attempt_at' => $attemptedAt,
                    ])->save();

                    return $attempt;
                });
            } catch (QueryException $e) {
                // Unique backstop tripped: another allocation won the race.
                // Retry boundedly; never reuse the rejected number.
                if (! $this->isAttemptNumberConflict($e) || $try === self::ALLOCATION_RETRIES) {
                    throw $e;
                }
            }
        }

        return null;
    }

    /**
     * Close an attempt as successfully delivered and finalize the summary.
     *
     * Idempotent: running it twice changes nothing and adds no history.
     */
    public function markDelivered(InspectionDeliveryAttempt $attempt): void
    {
        DB::transaction(function () use ($attempt) {
            $parent = SiteInspection::query()
                ->whereKey($attempt->site_inspection_id)
                ->lockForUpdate()
                ->first();

            if ($parent === null) {
                return;
            }

            $fresh = InspectionDeliveryAttempt::query()->whereKey($attempt->getKey())->first();

            if ($fresh !== null && $fresh->outcome !== InspectionDeliveryAttempt::OUTCOME_DELIVERED) {
                $fresh->forceFill([
                    'outcome' => InspectionDeliveryAttempt::OUTCOME_DELIVERED,
                    'failure_category' => null,
                    'safe_message' => null,
                    'completed_at' => now(),
                ])->save();
            }

            // delivered_at records the FIRST successful delivery only. A later
            // re-delivery keeps the original value and is visible in history.
            $attributes = [
                'delivery_status' => 'delivered',
                'last_delivery_attempt_at' => $fresh?->attempted_at ?? $attempt->attempted_at,
                'last_delivery_failure_category' => null,
            ];

            if ($parent->delivered_at === null) {
                $attributes['delivered_at'] = now();
            }

            $parent->forceFill($attributes)->save();
        });
    }

    /**
     * Record that THIS attempt failed. The terminal summary is deliberately NOT
     * written here: the queue may still retry, and a retryable failure is not a
     * terminal delivery failure.
     */
    public function markAttemptFailed(InspectionDeliveryAttempt $attempt, array $failure): void
    {
        DB::transaction(function () use ($attempt, $failure) {
            InspectionDeliveryAttempt::query()
                ->whereKey($attempt->getKey())
                ->where('outcome', '!=', InspectionDeliveryAttempt::OUTCOME_DELIVERED)
                ->update([
                    'outcome' => InspectionDeliveryAttempt::OUTCOME_FAILED,
                    'failure_category' => $failure['category'],
                    'safe_message' => $failure['message'],
                    'completed_at' => now(),
                ]);
        });
    }

    /**
     * Reconcile the CURRENT summary after Laravel declared a queued job terminal.
     *
     * TWO independent conditions are required. Correlation alone is NOT enough.
     *
     *  1. CORRELATION - the callback must find its OWN dispatch's latest attempt
     *     (site_inspection_id + queue_job_uuid), and that attempt must have
     *     failed. A queued callback with no usable correlation uuid is refused
     *     outright rather than falling back to the globally latest attempt: that
     *     fallback is exactly the race this schema revision exists to prevent.
     *
     *  2. OWNERSHIP OF CURRENT STATE - that correlated attempt must ALSO be the
     *     globally latest attempt for the round. If a newer dispatch exists, it
     *     is the current delivery execution, whether it is pending, delivered,
     *     or a newer dispatch that is still retryable, and this older terminal
     *     callback must not overwrite it.
     *
     * The decision is derived only from durable state, never from a property
     * mutated inside handle(), because failed() may run against a reconstructed
     * command. Idempotent: a second call re-evaluates the same durable facts and
     * therefore changes nothing.
     */
    public function reconcileTerminalFailure(SiteInspection $inspection, ?string $queueJobUuid, array $failure): void
    {
        $correlation = $this->normalizeCorrelation($queueJobUuid);

        if ($correlation === null) {
            // A queued terminal callback must always carry its dispatch uuid.
            // Refusing here is deliberate: never guess from global state.
            $this->logOutcome(
                $inspection->getKey(),
                'terminal_failure_uncorrelated',
                $failure['category'],
                null
            );

            return;
        }

        DB::transaction(function () use ($inspection, $correlation, $failure) {
            $parent = SiteInspection::query()
                ->whereKey($inspection->getKey())
                ->lockForUpdate()
                ->first();

            if ($parent === null) {
                return;
            }

            // A. This dispatch's own latest attempt.
            $correlatedLatest = InspectionDeliveryAttempt::query()
                ->where('site_inspection_id', $parent->getKey())
                ->where(InspectionDeliveryAttempt::CORRELATION_COLUMN, $correlation)
                ->orderByDesc('attempt_number')
                ->first();

            // No attempt for this dispatch: nothing of ours to terminalize.
            if ($correlatedLatest === null) {
                $this->logOutcome($parent->getKey(), 'terminal_no_correlated_attempt', $failure['category'], $correlation);

                return;
            }

            // B. Our own latest attempt must actually have failed.
            if ($correlatedLatest->outcome !== InspectionDeliveryAttempt::OUTCOME_FAILED) {
                $this->logOutcome($parent->getKey(), 'terminal_not_a_failed_attempt', $failure['category'], $correlation);

                return;
            }

            // C. The globally latest attempt for the round.
            $globalLatest = InspectionDeliveryAttempt::query()
                ->where('site_inspection_id', $parent->getKey())
                ->orderByDesc('attempt_number')
                ->first();

            // D. A newer dispatch owns the current delivery execution. This is
            //    the guard that makes Scenario E safe: Job B's attempt is newer
            //    and still retryable, so Job A must not terminalize.
            if ($globalLatest === null || $globalLatest->getKey() !== $correlatedLatest->getKey()) {
                $this->logOutcome($parent->getKey(), 'terminal_superseded_by_newer_dispatch', $failure['category'], $correlation);

                return;
            }

            $parent->forceFill([
                'delivery_status' => 'delivery_failed',
                'last_delivery_attempt_at' => $correlatedLatest->attempted_at,
                // The category is taken from OUR OWN attempt row so the summary
                // always matches the attempt that produced it.
                'last_delivery_failure_category' => $correlatedLatest->failure_category ?? $failure['category'],
            ])->save();
        });
    }

    /**
     * Accept only a canonical queue uuid. Anything unexpected is treated as
     * "no correlation" rather than being coerced into the column.
     */
    private function normalizeCorrelation(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        if (preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $trimmed) !== 1) {
            return null;
        }

        return strtolower($trimmed);
    }

    /**
     * Derive the attempt source.
     *
     * `initial_dispatch` means "the first queue execution of that dispatched
     * bridge job". It does NOT claim the application or inspection is new: the
     * reassignment controller dispatches this same job for an existing round.
     */
    public function resolveSource(?string $explicitSource, int $queueAttempts): string
    {
        if ($explicitSource !== null && in_array($explicitSource, InspectionDeliveryAttempt::sources(), true)) {
            return $explicitSource;
        }

        return $queueAttempts > 1
            ? InspectionDeliveryAttempt::SOURCE_AUTOMATIC_RETRY
            : InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH;
    }

    /**
     * Normalize a bridge failure into the closed Loop 9 vocabulary.
     *
     * Typed evidence is preferred: HTTP status, PostgREST error code, and
     * exception class. Human message matching is used only where the codebase
     * already throws a bare \Exception with no status information.
     *
     * Returns ['category' => string, 'message' => string]. The message is always
     * taken from the fixed table above and never from the thrown exception.
     */
    public function normalize(Throwable $e): array
    {
        $category = $this->classify($e);

        return [
            'category' => $category,
            'message' => $category === InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED
                && str_contains($e->getMessage(), 'No Supabase profile found')
                    ? self::MESSAGE_PROFILE_UNMATCHED
                    : (self::MESSAGES[$category] ?? self::MESSAGES[InspectionDeliveryAttempt::FAILURE_UNKNOWN]),
        ];
    }

    /**
     * Classify an exception, or a non-2xx response captured before it was
     * stringified into a thrown message.
     */
    public function classifyFromResponse(?Response $response): ?string
    {
        if ($response === null) {
            return null;
        }

        $status = $response->status();

        if ($status === 401 || $status === 403) {
            return InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE;
        }

        $code = $this->postgrestCode($response);

        if ($code === '23505' || $code === '23503' || $code === '23514') {
            return InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE;
        }

        if ($code !== null && (str_starts_with($code, '22') || str_starts_with($code, 'PGRST'))) {
            return InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE;
        }

        if ($status >= 500) {
            return InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE;
        }

        if ($status >= 400) {
            return InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE;
        }

        return null;
    }

    private function classify(Throwable $e): string
    {
        if ($e instanceof ConnectionException) {
            return InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE;
        }

        $message = $e->getMessage();

        // Configuration: the writer's own guards throw for a missing URL/key.
        if (str_contains($message, 'Supabase credentials are missing')) {
            return InspectionDeliveryAttempt::FAILURE_CONFIGURATION_FAILURE;
        }

        // Inspector mapping: thrown before any HTTP call by resolveSupabaseUserId().
        if (str_contains($message, 'does not have a mapped Supabase profile')
            || str_contains($message, 'No Supabase profile found')) {
            return InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED;
        }

        // PostgREST payloads were folded into these messages by the existing
        // writer, so a code is still recoverable from the text.
        if (str_contains($message, '23505')) {
            return InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE;
        }

        if (preg_match('/\bPGRST\d+\b|\b22\d{3}\b/', $message) === 1) {
            return InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE;
        }

        if (str_contains($message, 'No API key found')
            || str_contains($message, 'Invalid API key')
            || str_contains($message, 'JWT')
            || str_contains($message, '401')
            || str_contains($message, '403')) {
            return InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE;
        }

        if (str_contains($message, 'Connection refused')
            || str_contains($message, 'timed out')
            || str_contains($message, 'cURL error')
            || str_contains($message, 'Could not resolve host')) {
            return InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE;
        }

        return InspectionDeliveryAttempt::FAILURE_UNKNOWN;
    }

    private function postgrestCode(Response $response): ?string
    {
        $json = $response->json();

        return is_array($json) && isset($json['code']) ? (string) $json['code'] : null;
    }

    private function isAttemptNumberConflict(QueryException $e): bool
    {
        return str_contains($e->getMessage(), 'inspection_delivery_attempts_inspection_attempt_unique')
            || in_array($e->getCode(), ['23505'], true);
    }

    /**
     * Log a delivery outcome without ever emitting a response body, key, token,
     * handshake key, password, signed URL, or database credential.
     */
    public function logOutcome(int $siteInspectionId, string $event, string $category, ?string $reference = null): void
    {
        Log::info('iMAPS bridge delivery state recorded', [
            'site_inspection_id' => $siteInspectionId,
            'event' => $event,
            'failure_category' => $category,
            'reference' => $reference,
        ]);
    }
}
