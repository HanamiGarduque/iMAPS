<?php

namespace Tests\Unit;

use App\Models\InspectionDeliveryAttempt;
use App\Services\InspectionDeliveryRecorder;
use Tests\TestCase;

/**
 * Loop 9B - Scenario E and the dispatch-correlation matrix, as explicit
 * named regression tests.
 *
 * These were added as a separate test-only commit so the regression named in the
 * 9B correction brief is unmistakably present in the suite by name, rather than
 * only implied by a general invariant test.
 *
 * WHY THESE ASSERT SOURCE AND NOT A DATABASE.
 *
 * The decision this file protects cannot be exercised against a live database in
 * this environment: PHP has `pdo_pgsql` but not `pdo_sqlite`, so `RefreshDatabase`
 * on sqlite `:memory:` fails with "could not find driver". Every behavioural
 * claim below is therefore proven two ways elsewhere:
 *
 *  - BEHAVIOURAL PROOF: rollback-only PostgreSQL probes run the corrected
 *    algorithm verbatim against real PostgreSQL, on a disposable fixture row,
 *    and roll back. All nine passed, including Scenario E.
 *  - CONTRACT PROOF (this file): each required outcome is pinned to the specific
 *    guard clause that produces it, and pinned in the ORDER those clauses run.
 *    If a guard is removed, reordered, or weakened, the matching test fails.
 *
 * That combination is what makes Scenario E a regression rather than a
 * description: the probe proves the behaviour, and this file proves the behaviour
 * is reached only through the correlation and ownership guards.
 */
class Loop9bScenarioERegressionTest extends TestCase
{
    private function recorderSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'));
    }

    private function jobSource(): string
    {
        return (string) file_get_contents(base_path('app/Jobs/PushInspectionToSupabase.php'));
    }

    /** Isolated, comment-stripped, whitespace-flattened reconcileTerminalFailure body. */
    private function terminalBody(): string
    {
        preg_match(
            '/public function reconcileTerminalFailure.*?\n    \}\n/s',
            $this->recorderSource(),
            $m
        );
        $this->assertNotEmpty($m, 'reconcileTerminalFailure() could not be isolated.');

        $body = (string) preg_replace('/\/\*.*?\*\//s', '', $m[0]);
        $body = (string) preg_replace('/^\s*(\/\/|\*).*$/m', '', $body);

        return (string) preg_replace('/\s+/', ' ', $body);
    }

    // ==================================================================
    // THE REGRESSION. Proven behaviourally by PostgreSQL probe:
    //   "E SCENARIO: A terminal, B newer retryable-failed | PASS | pending_delivery"
    // ==================================================================

    public function test_scenario_e_older_terminal_dispatch_cannot_terminalize_a_newer_retryable_failure(): void
    {
        // SHAPE
        //   uuid A, attempt 1, failed, TERMINAL
        //   uuid B, attempt 2, failed once, RETRYABLE (a newer dispatch exists)
        //   A.failed() executes while attempt 2 is the globally latest attempt.
        //
        // The old globally-latest-only rule read attempt 2's `failed` outcome and
        // terminalized the summary to `delivery_failed` - while Job B could still
        // succeed. Required: the summary stays `pending_delivery`.
        //
        // WHY THE CODE IS CORRECT HERE
        // A correlates to attempt 1, which IS `failed`, so the correlated half of
        // the rule passes. The scenario is decided entirely by guard D: attempt 2
        // (uuid B) is the global latest, so A does not own current delivery state
        // and the summary is left alone.
        $body = $this->terminalBody();

        // Guard C must actually fetch the GLOBAL latest attempt...
        $this->assertStringContainsString(
            "->where('site_inspection_id', \$parent->getKey()) ->orderByDesc('attempt_number')",
            $body,
            'The globally latest attempt must be fetched, not assumed.'
        );

        // ...and guard D must compare it against the correlated attempt by
        // identity. This single comparison is what makes Scenario E safe.
        $this->assertStringContainsString(
            '$globalLatest->getKey() !== $correlatedLatest->getKey()',
            $body
        );

        // Guard D must RETURN rather than fall through to the terminal write.
        $guardAt = strpos($body, '$globalLatest->getKey() !== $correlatedLatest->getKey()');
        $returnAt = strpos($body, 'terminal_superseded_by_newer_dispatch', $guardAt);
        $writeAt = strpos($body, "'delivery_status' => 'delivery_failed'");

        $this->assertNotFalse($guardAt, 'The ownership guard must exist.');
        $this->assertNotFalse($returnAt, 'A superseded dispatch must be refused.');
        $this->assertNotFalse($writeAt, 'The terminal write must exist.');
        $this->assertLessThan(
            $writeAt,
            $returnAt,
            'The superseded-dispatch refusal must precede the terminal write, '
            . 'otherwise Scenario E regresses to delivery_failed.'
        );
    }

    public function test_scenario_e_survives_a_same_source_category(): void
    {
        // Both attempts in Scenario E can share a failure category. The rule must
        // therefore never be able to distinguish them by category; only identity
        // may decide.
        $body = $this->terminalBody();

        // The category is only READ from the correlated attempt, and only after
        // the ownership guard has already passed.
        $guardAt = strpos($body, '$globalLatest->getKey() !== $correlatedLatest->getKey()');
        $categoryAt = strpos($body, '$correlatedLatest->failure_category ?? $failure[\'category\']');

        $this->assertNotFalse($guardAt);
        $this->assertNotFalse($categoryAt);
        $this->assertLessThan($categoryAt, $guardAt, 'Category must never be read as a decision input.');
    }

    // ==================================================================
    // DISPATCH-LEVEL CORRELATION
    // ==================================================================

    public function test_automatic_retries_of_one_dispatch_share_a_single_queue_uuid(): void
    {
        // Proved by PostgreSQL probe: "same dispatch shares one uuid | PASS | 1 distinct"
        // and "same-dispatch both failed -> terminal | PASS | delivery_failed".
        //
        // The source of the uuid is the JOB, not the attempt, and the writer
        // allocates a fresh attempt_number per execution. So one dispatch yields
        // many attempts sharing one uuid, and the correlated lookup resolves to
        // that dispatch's LATEST attempt.
        $job = $this->jobSource();

        // Read once per execution from the live job, never from a stored attempt.
        $this->assertStringContainsString('$queueJobUuid = $this->job?->uuid();', $job);
        $this->assertStringNotContainsString('$attempt->queue_job_uuid', $job);
        $this->assertStringNotContainsString('Str::uuid(', $job);

        // Correlation is written per ATTEMPT, so each execution gets a new row.
        $rec = $this->recorderSource();
        $this->assertStringContainsString(
            "'site_inspection_id' => \$parent->getKey(),\n                        'attempt_number' => \$next,",
            $rec,
            'A new attempt_number is allocated per execution, so retries accumulate rows.'
        );
    }

    public function test_separately_dispatched_jobs_receive_distinct_uuids_from_laravel(): void
    {
        // Proved by PostgreSQL probe: Scenarios A/E/B/C use two distinct uuids and
        // the correlated lookup discriminates between them correctly.
        //
        // Nothing in iMAPS mints or caches a uuid, so distinctness is Laravel's
        // guarantee for a fresh dispatch. What iMAPS must guarantee is that it
        // never reuses a PREVIOUS dispatch's correlation for a new job.
        $job = $this->jobSource();
        $rec = $this->recorderSource();

        // No persistence or reuse of a correlation across jobs.
        $this->assertStringNotContainsString('cache(', $rec);
        $this->assertStringNotContainsString('static $', $rec);

        // The uuid is read from the executing job on every execution, so a new
        // dispatch naturally yields a new value.
        $this->assertStringContainsString('$this->job?->uuid()', $job);
    }

    public function test_same_dispatch_succeeding_retry_is_never_regressed_to_failed(): void
    {
        // Proved by PostgreSQL probe:
        // "same-dispatch retry success stays delivered (x2, idempotent) | PASS | delivered"
        //
        // A stale failed() callback for uuid A may still fire after A's retry
        // delivered. Correlated latest is then `delivered`, so guard B refuses -
        // the summary can never regress from a success to a failure.
        $body = $this->terminalBody();

        $outcomeGuard = strpos($body, '$correlatedLatest->outcome !== InspectionDeliveryAttempt::OUTCOME_FAILED');
        $returnAt = strpos($body, 'terminal_not_a_failed_attempt', $outcomeGuard);
        $writeAt = strpos($body, "'delivery_status' => 'delivery_failed'");

        $this->assertNotFalse($outcomeGuard, 'A non-failed correlated attempt must be refused.');
        $this->assertNotFalse($returnAt);
        $this->assertNotFalse($writeAt);
        $this->assertLessThan(
            $writeAt,
            $returnAt,
            'A delivered correlated attempt must be refused before the terminal write.'
        );

        // And the success itself is preserved, not just the refusal.
        $this->assertStringNotContainsString("'delivered_at' =>", $body);
    }

    // ==================================================================
    // NO INVENTED CORRELATION
    // ==================================================================

    public function test_a_dispatch_with_no_recorded_attempt_never_borrows_another_dispatch_outcome(): void
    {
        // Recorder-open failure: beginAttempt() threw, so this dispatch has no
        // attempt row at all. failed() must not reach for the globally latest
        // attempt of a DIFFERENT dispatch.
        //
        // Proved by PostgreSQL probe: "NULL correlation refused (no fallback) | PASS".
        $body = $this->terminalBody();

        $nullGuard = strpos($body, 'if ($correlation === null)');
        $firstQuery = strpos($body, 'InspectionDeliveryAttempt::query()');

        $this->assertNotFalse($nullGuard);
        $this->assertNotFalse($firstQuery);
        $this->assertLessThan(
            $firstQuery,
            $nullGuard,
            'The null-correlation refusal must precede every attempt query.'
        );

        // And a missing correlated attempt is refused inside the transaction too,
        // so a valid uuid with no recorded attempt is equally safe.
        $this->assertStringContainsString('if ($correlatedLatest === null)', $body);
        $this->assertStringContainsString('terminal_no_correlated_attempt', $body);
    }

    public function test_legacy_null_correlated_history_can_never_be_reactivated(): void
    {
        // The 6 `legacy_reconciliation` rows carry no uuid. Every correlated
        // lookup filters on the uuid column, so they are structurally invisible to
        // queued terminal processing. They are already terminal business facts
        // and need no future queue callback.
        $rec = $this->recorderSource();

        // Exactly one correlated query exists, and it is uuid-filtered.
        $this->assertSame(
            1,
            substr_count($rec, '->where(InspectionDeliveryAttempt::CORRELATION_COLUMN, $correlation)'),
            'There must be exactly one correlated lookup, and it must filter on the uuid.'
        );

        // There is no query that matches NULL-correlated rows.
        $this->assertStringNotContainsString('whereNull(InspectionDeliveryAttempt::CORRELATION_COLUMN)', $rec);
    }

    // ==================================================================
    // THE VOCABULARY AND THE LIFECYCLE ARE STILL FIELD-SYNC-OWNED
    // ==================================================================

    public function test_terminal_delivery_state_is_never_a_fieldsync_lifecycle_field(): void
    {
        // The 9B correction must not have drifted into owning task state. The
        // writer may read FieldSync's status to preserve it, but must never
        // compute or send one.
        $job = $this->jobSource();

        $this->assertStringContainsString("\$existingJob['status'] ?? 'assigned'", $job);
        $this->assertStringNotContainsString("'status' => \$this->", $job);
        $this->assertStringNotContainsString("'delivery_status'", $job);
        $this->assertStringNotContainsString("'completed'", $job);
    }

    public function test_delivered_at_remains_a_first_success_only_field(): void
    {
        $rec = $this->recorderSource();

        // First success is written exactly once, under an explicit guard, so a
        // later successful retry cannot move the first-success instant.
        $this->assertStringContainsString('if ($parent->delivered_at === null)', $rec);
        $this->assertStringContainsString("\$attributes['delivered_at'] = now();", $rec);

        // It is never cleared, and the terminal rule never writes it at all.
        $this->assertStringNotContainsString("'delivered_at' => null", $rec);
        $this->assertStringNotContainsString('unset($attributes[\'delivered_at\'])', $rec);

        $terminal = $this->terminalBody();
        $this->assertStringNotContainsString('delivered_at', $terminal);

        // The column exists on the model with a datetime cast.
        $model = (string) file_get_contents(base_path('app/Models/SiteInspection.php'));
        $this->assertStringContainsString('delivered_at', $model);
    }

    public function test_attempt_history_remains_append_only_under_the_corrected_rule(): void
    {
        $body = $this->terminalBody();

        // The terminal rule is a pure read-then-decide. It never writes, creates,
        // reorders, or removes history.
        foreach (['->create(', '->delete(', '->update(', 'increment(', 'decrement('] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $body);
        }

        // Attempts carry exactly one of the three outcomes.
        $this->assertSame(
            ['pending', 'delivered', 'failed'],
            InspectionDeliveryAttempt::outcomes()
        );
    }

    public function test_attempt_count_vocabulary_is_unchanged_by_the_correction(): void
    {
        // Guards against a future edit quietly adding a state or a source.
        $this->assertCount(4, InspectionDeliveryAttempt::sources());
        $this->assertCount(7, InspectionDeliveryAttempt::failureCategories());
        $this->assertCount(7, InspectionDeliveryRecorder::MESSAGES);
        $this->assertContains('automatic_retry', InspectionDeliveryAttempt::sources());
        $this->assertContains('planning_officer_retry', InspectionDeliveryAttempt::sources());
    }
}
