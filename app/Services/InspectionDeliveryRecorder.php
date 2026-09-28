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
     * Returns null only when the attempt cannot be allocated after bounded
     * retries. A null return must never abort the bridge: the remote delivery is
     * still correct without observability, and losing an attempt record is
     * strictly better than losing a task.
     */
    public function beginAttempt(SiteInspection $inspection, ?string $explicitSource = null, int $queueAttempts = 1): ?InspectionDeliveryAttempt
    {
        $source = $this->resolveSource($explicitSource, $queueAttempts);

        for ($try = 1; $try <= self::ALLOCATION_RETRIES; $try++) {
            try {
                return DB::transaction(function () use ($inspection, $source) {
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
                    'updated_at' => now(),
                ]);
        });
    }

    /**
     * Reconcile the CURRENT summary after Laravel declared the job terminal.
     *
     * The decision is derived only from durable state, never from a property
     * mutated inside handle(), because failed() may run against a reconstructed
     * command. Latest attempt wins:
     *
     *   latest delivered  -> summary stays delivered
     *   latest pending    -> summary stays pending_delivery (a newer run is live)
     *   latest failed     -> summary becomes delivery_failed
     *
     * An older failure can therefore never overwrite a newer pending or
     * delivered execution. Idempotent: a second call is a no-op.
     */
    public function reconcileTerminalFailure(SiteInspection $inspection, array $failure): void
    {
        DB::transaction(function () use ($inspection, $failure) {
            $parent = SiteInspection::query()
                ->whereKey($inspection->getKey())
                ->lockForUpdate()
                ->first();

            if ($parent === null) {
                return;
            }

            $latest = InspectionDeliveryAttempt::query()
                ->where('site_inspection_id', $parent->getKey())
                ->orderByDesc('attempt_number')
                ->first();

            // No attempt history yet: fall back to recording the terminal state
            // directly so the failure is never lost.
            if ($latest === null) {
                $parent->forceFill([
                    'delivery_status' => 'delivery_failed',
                    'last_delivery_attempt_at' => now(),
                    'last_delivery_failure_category' => $failure['category'],
                ])->save();

                return;
            }

            if ($latest->outcome === InspectionDeliveryAttempt::OUTCOME_DELIVERED
                || $latest->outcome === InspectionDeliveryAttempt::OUTCOME_PENDING) {
                // A newer execution succeeded or is still in flight. Respect it.
                return;
            }

            $parent->forceFill([
                'delivery_status' => 'delivery_failed',
                'last_delivery_attempt_at' => $latest->attempted_at,
                'last_delivery_failure_category' => $failure['category'],
            ])->save();
        });
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
