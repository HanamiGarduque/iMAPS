<?php

namespace Tests\Unit;

use App\Jobs\PushInspectionToSupabase;
use App\Models\InspectionDeliveryAttempt;
use App\Services\InspectionDeliveryRecorder;
use Illuminate\Http\Client\Request;
use Tests\TestCase;
use Throwable;

/**
 * Loop 9B â€” delivery writer instrumentation.
 *
 * UNIT coverage for the recorder's pure decisions (failure normalization,
 * source derivation) and CONTRACT coverage proving the established Loops 1-8
 * remote bridge behaviour is unchanged.
 *
 * Environment limitation, unchanged from 9A: DB-backed Feature tests cannot
 * run locally (pdo_sqlite absent), so the transactional behaviour of the
 * recorder is proven separately against real PostgreSQL with rollback-only
 * probes rather than by weakening any production constraint.
 */
class Loop9bDeliveryWriterContractTest extends TestCase
{
    private function recorder(): InspectionDeliveryRecorder
    {
        return new InspectionDeliveryRecorder();
    }

    private function jobSource(): string
    {
        return (string) file_get_contents(base_path('app/Jobs/PushInspectionToSupabase.php'));
    }

    private function recorderSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'));
    }

    /**
     * Executable statements only: the files legitimately *name* forbidden values
     * in their documentation, so an "absent" assertion is evaluated on code.
     */
    private function statements(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*\/\/.*$/m', '', $text);
        $text = (string) preg_replace('/\/\*\*.*?\*\//s', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ==================================================================
    // 1. All seven normalized failure categories.
    // ==================================================================

    public function test_all_seven_failure_categories_are_covered(): void
    {
        $expected = [
            InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED,
            InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE,
            InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE,
            InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE,
            InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE,
            InspectionDeliveryAttempt::FAILURE_CONFIGURATION_FAILURE,
            InspectionDeliveryAttempt::FAILURE_UNKNOWN,
        ];

        $this->assertSame($expected, InspectionDeliveryAttempt::failureCategories());

        foreach ($expected as $category) {
            $this->assertArrayHasKey($category, InspectionDeliveryRecorder::MESSAGES);
            $this->assertNotSame('', InspectionDeliveryRecorder::MESSAGES[$category]);
        }
    }

    public function test_configuration_failure_is_detected_from_the_writer_guard(): void
    {
        $failure = $this->recorder()->normalize(
            new \Exception("Supabase credentials are missing. Check your .env file and run 'php artisan config:clear'.")
        );

        $this->assertSame('configuration_failure', $failure['category']);
        $this->assertSame('iMAPS bridge configuration is incomplete.', $failure['message']);
    }

    public function test_inspector_mapping_failure_is_detected_before_any_http_call(): void
    {
        $failure = $this->recorder()->normalize(
            new \Exception('Local User ID 25 does not have a mapped Supabase profile via handshake_key.')
        );

        $this->assertSame('inspector_mapping_unresolved', $failure['category']);
        $this->assertSame(
            'The assigned inspector does not have a mapped FieldSync profile.',
            $failure['message']
        );
    }

    public function test_matched_empty_profile_uses_its_own_message(): void
    {
        $failure = $this->recorder()->normalize(
            new \Exception('No Supabase profile found for local user 25. Expected a profile with a matching handshake_key.')
        );

        $this->assertSame('inspector_mapping_unresolved', $failure['category']);
        $this->assertSame(
            "The assigned inspector's FieldSync profile could not be matched.",
            $failure['message']
        );
    }

    public function test_unreachable_is_detected_from_the_exception_class(): void
    {
        $failure = $this->recorder()->normalize(
            new \Illuminate\Http\Client\ConnectionException('cURL error 7: Failed to connect')
        );

        $this->assertSame('supabase_unreachable', $failure['category']);
    }

    public function test_remote_constraint_failure_is_detected_from_postgrest_code(): void
    {
        $response = $this->fakeResponse(['code' => '23505', 'message' => 'duplicate key value'], 409);
        $this->assertSame(
            'remote_constraint_failure',
            $this->recorder()->classifyFromResponse($response)
        );
    }

    public function test_remote_validation_failure_is_detected_from_postgrest_code(): void
    {
        $this->assertSame(
            'remote_validation_failure',
            $this->recorder()->classifyFromResponse($this->fakeResponse(['code' => '22P02'], 400))
        );

        $this->assertSame(
            'remote_validation_failure',
            $this->recorder()->classifyFromResponse($this->fakeResponse(['code' => 'PGRST200'], 400))
        );
    }

    public function test_authentication_failure_is_detected_from_http_status(): void
    {
        $this->assertSame(
            'authentication_failure',
            $this->recorder()->classifyFromResponse($this->fakeResponse(['message' => 'no'], 401))
        );

        $this->assertSame(
            'authentication_failure',
            $this->recorder()->classifyFromResponse($this->fakeResponse(['message' => 'no'], 403))
        );
    }

    public function test_unknown_is_the_fallback(): void
    {
        $failure = $this->recorder()->normalize(new \Exception('something entirely unexpected'));
        $this->assertSame('unknown', $failure['category']);
    }

    public function test_a_successful_response_has_no_typed_category(): void
    {
        $this->assertNull($this->recorder()->classifyFromResponse($this->fakeResponse([], 200)));
        $this->assertNull($this->recorder()->classifyFromResponse(null));
    }

    // ==================================================================
    // 2. Safe messages never leak raw bodies or secrets.
    // ==================================================================

    public function test_safe_messages_contain_no_raw_response_or_secret_material(): void
    {
        $secretBearing = new \Exception(
            'Field Job Sync Failed: {"hint":"key eyJhbGciOiJIUzI1NiJ9","apikey":"abc123"} at /home/x/app.php:151'
        );

        $failure = $this->recorder()->normalize($secretBearing);

        foreach (['eyJ', 'apikey', 'abc123', '/home/', 'Field Job Sync Failed'] as $leak) {
            $this->assertStringNotContainsString($leak, $failure['message']);
        }

        foreach (InspectionDeliveryRecorder::MESSAGES as $message) {
            foreach (['eyJ', 'Bearer', 'apikey', 'http', '/home/', '{', 'Exception'] as $leak) {
                $this->assertStringNotContainsString($leak, $message);
            }
        }
    }

    // ==================================================================
    // 4. Attempt source derivation.
    // ==================================================================

    public function test_first_execution_is_initial_dispatch(): void
    {
        $this->assertSame(
            'initial_dispatch',
            $this->recorder()->resolveSource(null, 1)
        );
    }

    public function test_later_execution_is_automatic_retry(): void
    {
        $this->assertSame(
            'automatic_retry',
            $this->recorder()->resolveSource(null, 2)
        );
    }

    public function test_explicit_source_wins_for_future_po_retry(): void
    {
        $this->assertSame(
            'planning_officer_retry',
            $this->recorder()->resolveSource('planning_officer_retry', 1)
        );
    }

    public function test_an_unknown_explicit_source_falls_back_to_the_derived_value(): void
    {
        $this->assertSame(
            'initial_dispatch',
            $this->recorder()->resolveSource('not_a_real_source', 1)
        );
    }

    public function test_legacy_reconciliation_is_never_produced_by_the_writer(): void
    {
        $source = $this->jobSource();

        // It must be documented as out of scope for the writer and must not be
        // used as a source value anywhere in executable code.
        $this->assertStringContainsString('legacy_reconciliation', $source);
        $this->assertStringNotContainsString("'legacy_reconciliation'", $this->statements($source));
    }

    // ==================================================================
    // 5/6/7/8. Ordering, idempotency and concurrency, asserted at source level.
    //    The behavioural half is proven by the rollback-only Postgres probes.
    // ==================================================================

    public function test_allocation_uses_a_parent_row_lock_not_naked_max(): void
    {
        $src = $this->recorderSource();

        $this->assertStringContainsString('lockForUpdate()', $src);
        $this->assertStringContainsString('max(\'attempt_number\')', $src);

        // The unique backstop must be retried, never silently reused.
        $this->assertStringContainsString('ALLOCATION_RETRIES', $src);
        $this->assertStringContainsString('isAttemptNumberConflict', $src);
    }

    public function test_handle_does_not_mark_the_summary_terminally(): void
    {
        // Isolate handle() from the RAW source, then strip comments, so the
        // docblock mention of the terminal state is not mistaken for code.
        preg_match('/public function handle\(.*?\n    \}\n/s', $this->jobSource(), $m);
        $this->assertNotEmpty($m, 'handle() could not be isolated.');

        $handle = $this->statements($m[0]);
        $this->assertStringContainsString('markAttemptFailed', $handle);
        $this->assertStringNotContainsString('delivery_failed', $handle);
        $this->assertStringNotContainsString('reconcileTerminalFailure', $handle);
    }

    public function test_terminal_state_is_owned_by_the_failed_hook(): void
    {
        $src = $this->recorderSource();

        $this->assertStringContainsString('reconcileTerminalFailure', $src);
        $this->assertStringContainsString("'delivery_status' => 'delivery_failed'", $src);
    }

    public function test_terminal_reconciliation_defers_to_the_latest_attempt(): void
    {
        $src = $this->recorderSource();

        $this->assertStringContainsString('orderByDesc(\'attempt_number\')', $src);
        $this->assertStringContainsString('OUTCOME_DELIVERED', $src);
        $this->assertStringContainsString('OUTCOME_PENDING', $src);
    }

    public function test_terminal_failure_never_depends_on_a_handle_mutated_property(): void
    {
        $src = $this->recorderSource();

        // Loop 9B correlation correction: the reconciliation additionally takes
        // the durable queue uuid. It must still never read a transient in-memory
        // attempt, because failed() may run against a reconstructed command.
        $this->assertStringContainsString(
            'public function reconcileTerminalFailure(SiteInspection $inspection, ?string $queueJobUuid, array $failure)',
            $this->statements($src)
        );
        // The transient attempt parameter is forbidden on the reconciliation
        // itself. (markAttemptFailed legitimately takes one: it is called from
        // inside handle(), where the in-memory attempt genuinely is the one
        // that just failed.)
        preg_match(
            '/public function reconcileTerminalFailure.*?\n    \}\n/s',
            $src,
            $m
        );
        $this->assertNotEmpty($m, 'reconcileTerminalFailure() could not be isolated.');

        $this->assertStringNotContainsString('$this->attempt', $m[0]);
        $this->assertStringNotContainsString('InspectionDeliveryAttempt $', $m[0]);
    }

    public function test_delivered_at_is_only_written_when_null(): void
    {
        $src = $this->statements($this->recorderSource());

        $this->assertStringContainsString('if ($parent->delivered_at === null)', $src);
        $this->assertStringContainsString("\$attributes['delivered_at'] = now()", $src);
    }

    public function test_pending_does_not_clear_a_previous_delivered_at(): void
    {
        $src = $this->recorderSource();

        $begin = (string) preg_replace('/(?s).*public function beginAttempt.*?\n    \}/', '', $src);
        $this->assertStringNotContainsString("'delivered_at' => null", $begin);
        $this->assertStringNotContainsString('delivered_at = null', $begin);
    }

    // ==================================================================
    // CONTRACT: Loops 1-8 remote bridge behaviour must be unchanged.
    // ==================================================================

    public function test_all_three_conflict_keys_are_unchanged(): void
    {
        $src = $this->jobSource();

        $this->assertStringContainsString('on_conflict=local_application_id', $src);
        $this->assertStringContainsString('on_conflict=local_parcel_id', $src);
        $this->assertStringContainsString('on_conflict=local_inspection_id', $src);
    }

    public function test_remote_operation_order_is_preserved(): void
    {
        $src = $this->jobSource();

        $app = strpos($src, 'supabase_zoning_applications?on_conflict');
        $geom = strpos($src, 'ST_AsText');
        $parcel = strpos($src, 'supabase_parcels?on_conflict');
        $lookup = strpos($src, "/rest/v1/field_jobs\", [");
        $upsert = strpos($src, 'field_jobs?on_conflict');

        foreach (['app' => $app, 'geom' => $geom, 'parcel' => $parcel, 'lookup' => $lookup, 'upsert' => $upsert] as $k => $pos) {
            $this->assertNotFalse($pos, "missing step: {$k}");
        }

        $this->assertLessThan($geom, $app, 'application mirror must precede geometry');
        $this->assertLessThan($parcel, $geom, 'geometry must precede parcel mirror');
        $this->assertLessThan($lookup, $parcel, 'parcel mirror must precede status lookup');
        $this->assertLessThan($upsert, $lookup, 'status lookup must precede the job upsert');
    }

    public function test_remote_lifecycle_status_is_still_preserved(): void
    {
        $src = $this->jobSource();

        $this->assertStringContainsString("'status'                  => \$existingJob['status'] ?? 'assigned'", $src);
    }

    public function test_inspector_owned_and_evidence_columns_are_still_absent(): void
    {
        $src = $this->jobSource();

        foreach ([
            'inspector_notes',
            'field_job_photos',
            'field_job_reviews',
            'current_step',
            'checklist_data',
            'photo_count',
            'findings',
            'gps_confirmed_at',
        ] as $forbidden) {
            $this->assertStringNotContainsString("'{$forbidden}'", $src);
        }
    }

    public function test_no_compensating_remote_delete_was_introduced(): void
    {
        $src = $this->jobSource();

        $this->assertStringNotContainsString('->delete(', $src);
        $this->assertStringNotContainsString('Http::delete', $src);
    }

    public function test_queue_retry_configuration_was_not_hardened(): void
    {
        $src = $this->jobSource();

        // 9B must not pin retry behaviour; the design stays correct either way.
        $this->assertStringNotContainsString('public $tries', $src);
        $this->assertStringNotContainsString('public $backoff', $src);
        $this->assertStringNotContainsString('public $timeout', $src);
        $this->assertStringNotContainsString('function retryUntil', $src);
    }

    public function test_configuration_validation_is_now_inside_the_guarded_lifecycle(): void
    {
        $src = $this->jobSource();

        $tryPos = strpos($src, 'try {');
        $configThrow = strpos($src, 'Supabase credentials are missing. Check');

        $this->assertNotFalse($tryPos);
        $this->assertNotFalse($configThrow);
        $this->assertGreaterThan($tryPos, $configThrow, 'The configuration guard must sit inside the try block.');
    }

    public function test_failed_hook_is_declared(): void
    {
        $this->assertStringContainsString('public function failed(', $this->jobSource());
    }

    public function test_job_still_implements_should_queue_with_no_new_dependency(): void
    {
        $this->assertStringContainsString('implements ShouldQueue', $this->jobSource());
    }

    public function test_source_parameter_is_optional_and_backward_compatible(): void
    {
        $src = $this->jobSource();

        $this->assertStringContainsString(
            'public function __construct(SiteInspection $inspection, ?string $deliverySource = null)',
            $src
        );
    }

    // ==================================================================
    // Bounded file-set assertions.
    // ==================================================================

    public function test_no_controller_route_or_frontend_change_is_present(): void
    {
        foreach ([
            'app/Http/Controllers/ApplicationController.php',
            'app/Http/Controllers/TechnicalReviewController.php',
            'app/Http/Controllers/WorkReassignmentController.php',
            'app/Http/Controllers/SiteInspectionController.php',
            'routes/web.php',
        ] as $file) {
            $this->assertFileDoesNotExist(
                base_path($file . '.9b-staged'),
                '9B must not ship a modified copy of ' . $file
            );
        }
    }

    public function test_no_new_migration_or_sql_artifact_was_added(): void
    {
        $this->assertFileDoesNotExist(
            base_path('database/migrations/2026_09_28_040000_add_delivery_writer_instrumentation.php')
        );
        $this->assertFileDoesNotExist(
            base_path('database/sql/2026_09_28_add_delivery_writer_instrumentation.sql')
        );
    }

    public function test_historical_reconciliation_artifact_is_untouched(): void
    {
        $src = (string) file_get_contents(
            base_path('database/sql/2026_09_28_reconcile_legacy_delivery_failures_25_30.sql')
        );

        $this->assertStringContainsString('legacy_reconciliation', $src);
    }

    private function fakeResponse(array $json, int $status): \Illuminate\Http\Client\Response
    {
        // Obtained through the framework's own faked pipeline so the response is
        // a fully-formed client Response rather than a hand-built PSR wrapper.
        \Illuminate\Support\Facades\Http::fake([
            '*' => \Illuminate\Support\Facades\Http::response($json, $status),
        ]);

        return \Illuminate\Support\Facades\Http::post('https://example.invalid/probe');
    }
}
