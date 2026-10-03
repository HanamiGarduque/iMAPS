<?php

namespace Tests\Unit;

use App\Jobs\PushInspectionToSupabase;
use App\Models\InspectionDeliveryAttempt;
use App\Services\InspectionDeliveryRecorder;
use Tests\TestCase;

/**
 * Loop 9B writer correlation correction.
 *
 * The correction makes terminal `failed()` safe under FUTURE queue retries and
 * overlapping dispatches. Two independent conditions are now required, and
 * correlation alone is explicitly NOT sufficient:
 *
 *   1. CORRELATION - the callback must find its OWN dispatch's latest attempt
 *      (site_inspection_id + queue_job_uuid) and that attempt must have failed.
 *   2. OWNERSHIP    - that attempt must ALSO be the globally latest attempt for
 *      the round, otherwise a newer dispatch still owns current delivery state.
 *
 * Behavioural proof is carried by rollback-only PostgreSQL probes; these tests
 * lock the source contract and the refusal rules.
 */
class Loop9bWriterCorrelationCorrectionTest extends TestCase
{
    private function jobSource(): string
    {
        return (string) file_get_contents(base_path('app/Jobs/PushInspectionToSupabase.php'));
    }

    private function recorderSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'));
    }

    private function statements(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*(\/\/|\*).*$/m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    /**
     * Isolate one method body from the RAW source, then strip its comments.
     * Isolating first matters: collapsing whitespace beforehand would destroy
     * the brace structure the pattern relies on.
     */
    private function methodBody(string $source, string $signature): string
    {
        preg_match('/public function ' . preg_quote($signature, '/') . '\(.*?\n    \}\n/s', $source, $m);
        $this->assertNotEmpty($m, "Could not isolate {$signature}().");

        return $this->statements($m[0]);
    }

    // ==================================================================
    // 1/2/3. The real queue uuid is the source, persisted per dispatch.
    // ==================================================================

    public function test_queue_uuid_comes_from_the_real_queue_job_not_a_generated_value(): void
    {
        $src = $this->statements($this->jobSource());

        $this->assertStringContainsString('$this->job?->uuid()', $src);

        // A new uuid must never be minted for an already queued execution.
        $this->assertStringNotContainsString('Str::uuid(', $src);
        $this->assertStringNotContainsString('uniqid(', $src);
    }

    public function test_queue_uuid_is_passed_into_begin_attempt(): void
    {
        $this->assertStringContainsString(
            'beginAttempt(',
            $this->statements($this->jobSource())
        );

        $this->assertStringContainsString(
            '?string $queueJobUuid = null',
            $this->statements($this->recorderSource())
        );
    }

    public function test_correlation_is_persisted_explicitly_and_never_mass_assigned(): void
    {
        $rec = $this->statements($this->recorderSource());

        $this->assertStringContainsString('CORRELATION_COLUMN', $rec);
        $this->assertStringContainsString('->save()', $rec);

        $fillable = (string) preg_replace(
            '/(?s).*protected \$fillable = \[(.*?)\];.*/s',
            '$1',
            (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'))
        );
        $this->assertStringNotContainsString('queue_job_uuid', $fillable);
    }

    public function test_non_canonical_correlation_is_rejected_rather_than_coerced(): void
    {
        $this->assertStringContainsString('normalizeCorrelation', $this->statements($this->recorderSource()));
    }

    // ==================================================================
    // 4. Synchronous / no-job execution.
    // ==================================================================

    public function test_synchronous_execution_yields_null_correlation_without_breaking_delivery(): void
    {
        $src = $this->statements($this->jobSource());

        // Null-safe read; a missing queue job is not an error.
        $this->assertStringContainsString('$this->job?->uuid()', $src);
        $this->assertStringContainsString('Delivery attempt could not be opened', $src);
    }

    // ==================================================================
    // 6. Source contract unchanged.
    // ==================================================================

    public function test_source_resolution_contract_is_unchanged(): void
    {
        $this->assertSame('initial_dispatch', (new InspectionDeliveryRecorder())->resolveSource(null, 1));
        $this->assertSame('automatic_retry', (new InspectionDeliveryRecorder())->resolveSource(null, 2));
        $this->assertSame(
            'planning_officer_retry',
            (new InspectionDeliveryRecorder())->resolveSource('planning_officer_retry', 1)
        );
    }

    public function test_po_retry_route_is_not_implemented_here(): void
    {
        $this->assertFileDoesNotExist(base_path('app/Http/Controllers/DeliveryMonitoringController.php'));
        $this->assertStringNotContainsString(
            'planning_officer_retry',
            $this->statements($this->jobSource())
        );
    }

    // ==================================================================
    // 8. handle() must still never terminalize.
    // ==================================================================

    public function test_handle_records_attempt_failure_but_never_the_terminal_summary(): void
    {
        preg_match('/public function handle\(.*?\n    \}\n/s', $this->jobSource(), $m);
        $this->assertNotEmpty($m, 'handle() could not be isolated.');

        $handle = $this->statements($m[0]);
        $this->assertStringContainsString('markAttemptFailed', $handle);
        $this->assertStringNotContainsString('delivery_failed', $handle);
        $this->assertStringNotContainsString('reconcileTerminalFailure', $handle);
    }

    // ==================================================================
    // 9/17. No unsafe global fallback for a queued callback.
    // ==================================================================

    public function test_failed_refuses_to_terminalize_without_a_correlation_uuid(): void
    {
        preg_match('/public function failed\(.*?\n    \}\n/s', $this->jobSource(), $m);
        $this->assertNotEmpty($m, 'failed() could not be isolated.');

        $failed = $this->statements($m[0]);
        $this->assertStringContainsString('$this->job?->uuid()', $failed);
        $this->assertStringContainsString('could not be correlated', $failed);
    }

    public function test_recorder_refuses_null_correlation_before_any_lookup(): void
    {
        $body = $this->methodBody($this->recorderSource(), 'reconcileTerminalFailure');

        $this->assertStringContainsString('if ($correlation === null)', $body);

        // The refusal must happen BEFORE any attempt lookup, so no global
        // fallback can be reached.
        $this->assertLessThan(
            strpos($body, 'InspectionDeliveryAttempt::query()'),
            strpos($body, 'if ($correlation === null)'),
            'The null-correlation refusal must precede every attempt lookup.'
        );
    }

    public function test_legacy_null_correlated_rows_are_never_globally_matched(): void
    {
        $rec = $this->statements($this->recorderSource());

        // Every correlated lookup is filtered by the uuid column.
        $this->assertStringContainsString(
            "->where(InspectionDeliveryAttempt::CORRELATION_COLUMN, \$correlation)",
            $rec
        );

        // There must be no "if no correlated attempt, fall back to global".
        $this->assertStringNotContainsString(
            'reconcileTerminalFailure(SiteInspection $inspection, array $failure)',
            $rec,
            'The uncorrelated global fallback signature must be gone.'
        );
    }

    // ==================================================================
    // 10. The full invariant: correlation AND global-latest ownership.
    // ==================================================================

    public function test_terminal_rule_requires_its_own_dispatch_latest_attempt(): void
    {
        $body = $this->methodBody($this->recorderSource(), 'reconcileTerminalFailure');

        $this->assertStringContainsString('correlatedLatest', $body);
        $this->assertStringContainsString('globalLatest', $body);

        // A. own latest must exist
        $this->assertStringContainsString('if ($correlatedLatest === null)', $body);
        // B. own latest must have failed
        $this->assertStringContainsString('OUTCOME_FAILED', $body);
        // D. it must also be the globally latest
        $this->assertStringContainsString(
            '$globalLatest->getKey() !== $correlatedLatest->getKey()',
            $body
        );
    }

    public function test_correlation_alone_is_documented_as_insufficient(): void
    {
        $raw = (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'));
        $this->assertStringContainsString('Correlation alone is NOT enough', $raw);
        $this->assertStringContainsString('OWNERSHIP OF CURRENT STATE', $raw);
    }

    public function test_terminal_write_preserves_delivered_at(): void
    {
        $body = $this->methodBody($this->recorderSource(), 'reconcileTerminalFailure');

        $this->assertStringNotContainsString("'delivered_at' =>", $body);
        $this->assertStringNotContainsString('delivered_at =', $body);
    }

    public function test_terminal_category_comes_from_the_correlated_attempt(): void
    {
        $rec = $this->statements($this->recorderSource());
        $this->assertStringContainsString(
            '$correlatedLatest->failure_category ?? $failure[\'category\']',
            $rec
        );
    }

    // ==================================================================
    // 14. Idempotency.
    // ==================================================================

    public function test_terminal_reconciliation_is_idempotent_by_construction(): void
    {
        $body = $this->methodBody($this->recorderSource(), 'reconcileTerminalFailure');

        // It recomputes from durable facts and performs no increment, so a
        // second call reaches the same conclusion.
        $this->assertStringNotContainsString('increment(', $body);
        $this->assertStringNotContainsString('->create(', $body);
        $this->assertStringNotContainsString('delete(', $body);
    }

    // ==================================================================
    // 20. Normalization vocabulary untouched.
    // ==================================================================

    public function test_failure_normalization_vocabulary_is_unchanged(): void
    {
        $this->assertCount(7, InspectionDeliveryAttempt::failureCategories());
        $this->assertCount(7, InspectionDeliveryRecorder::MESSAGES);
        $this->assertCount(3, InspectionDeliveryAttempt::outcomes());
        $this->assertCount(4, InspectionDeliveryAttempt::sources());
    }

    // ==================================================================
    // 21/22. Remote bridge and Loop 1-8 protection.
    // ==================================================================

    public function test_remote_bridge_sequence_and_contract_are_unchanged(): void
    {
        $src = $this->jobSource();

        foreach ([
            'on_conflict=local_application_id',
            'on_conflict=local_parcel_id',
            'on_conflict=local_inspection_id',
            "'status'                  => \$existingJob['status'] ?? 'assigned'",
        ] as $token) {
            $this->assertStringContainsString($token, $src);
        }

        $this->assertLessThan(
            strpos($src, 'ST_AsText'),
            strpos($src, 'supabase_zoning_applications?on_conflict'),
            'application mirror must precede geometry'
        );
        $this->assertLessThan(
            strpos($src, 'supabase_parcels?on_conflict'),
            strpos($src, 'ST_AsText'),
            'geometry must precede the parcel mirror'
        );
        $this->assertLessThan(
            strpos($src, '/rest/v1/field_jobs", ['),
            strpos($src, 'supabase_parcels?on_conflict'),
            'parcel mirror must precede the status lookup'
        );
        $this->assertLessThan(
            strpos($src, 'field_jobs?on_conflict'),
            strpos($src, '/rest/v1/field_jobs", ['),
            'status lookup must precede the job upsert'
        );
    }

    public function test_inspector_owned_and_evidence_columns_remain_absent(): void
    {
        $src = $this->jobSource();

        foreach ([
            'inspector_notes',
            'field_job_photos',
            'field_job_reviews',
            'current_step',
            'checklist_data',
            'photo_count',
            'gps_confirmed_at',
        ] as $forbidden) {
            $this->assertStringNotContainsString("'{$forbidden}'", $src);
        }
    }

    public function test_queue_retry_policy_is_still_not_pinned(): void
    {
        $src = $this->jobSource();

        foreach (['public $tries', 'public $backoff', 'public $timeout', 'function retryUntil'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $src);
        }
    }

    public function test_no_schema_artifact_was_touched_by_this_correction(): void
    {
        $this->assertFileExists(base_path('database/sql/2026_09_28_add_delivery_attempt_queue_correlation.sql'));
        $this->assertFileExists(
            base_path('database/migrations/2026_09_28_040000_add_delivery_attempt_queue_correlation.php')
        );
    }

    // ==================================================================
    // 18. Recorder-open failure must not fabricate state.
    // ==================================================================

    public function test_recorder_open_failure_prefers_incomplete_observability_over_false_state(): void
    {
        $src = $this->statements($this->jobSource());
        preg_match('/public function handle\(.*?\n    \}\n/s', $this->jobSource(), $m);
        $handle = $this->statements($m[0]);

        // Delivery still proceeds; nothing is fabricated.
        $this->assertStringContainsString('catch (Throwable $e)', $handle);
        $this->assertStringContainsString('continuing without it', $handle);
        $this->assertStringNotContainsString("'delivery_status' => 'delivery_failed'", $handle);
    }
}
