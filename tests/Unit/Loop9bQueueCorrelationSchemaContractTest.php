<?php

namespace Tests\Unit;

use App\Models\InspectionDeliveryAttempt;
use Tests\TestCase;

/**
 * Loop 9B safety revision — queue-dispatch correlation schema.
 *
 * The 9B safety review found, BEFORE push, that a terminal Laravel queued
 * command could not be correlated with its own durable delivery attempts. The
 * only available rule was "the globally latest attempt", which is ambiguous
 * once queue tries exceed 1 and a newer dispatch from a different job has
 * failed but is still retryable (Scenario E).
 *
 * These tests lock the schema and the correlation contract that fixes it. The
 * behavioural proof is carried separately by rollback-only PostgreSQL probes;
 * production constraints are not weakened to make anything easier to test.
 */
class Loop9bQueueCorrelationSchemaContractTest extends TestCase
{
    private const FORWARD_SQL = 'database/sql/2026_09_28_add_delivery_attempt_queue_correlation.sql';

    private const MIGRATION = 'database/migrations/2026_09_28_040000_add_delivery_attempt_queue_correlation.php';

    private function sql(): string
    {
        return (string) file_get_contents(base_path(self::FORWARD_SQL));
    }

    private function migration(): string
    {
        return (string) file_get_contents(base_path(self::MIGRATION));
    }

    private function flat(string $text): string
    {
        return (string) preg_replace('/\s+/', ' ', $text);
    }

    private function statements(string $text): string
    {
        $text = (string) preg_replace('/--[^\n]*/', '', $text);

        return $this->flat((string) preg_replace('/\/\*.*?\*\//s', '', $text));
    }

    // ------------------------------------------------------------------
    // 1/2/3. Column exists in both records with the SAME type.
    // ------------------------------------------------------------------

    public function test_correlation_column_exists_in_forward_sql_and_migration(): void
    {
        $this->assertStringContainsString('queue_job_uuid', $this->sql());
        $this->assertStringContainsString('queue_job_uuid', $this->migration());
    }

    public function test_type_parity_is_native_uuid_in_both_records(): void
    {
        // Native `uuid`, not a length-guessed varchar. Laravel 12.58.0 sets the
        // payload uuid via Str::uuid(), and Job::uuid() is a concrete accessor.
        $this->assertStringContainsString('queue_job_uuid uuid NULL', $this->sql());
        $this->assertStringContainsString("->uuid('queue_job_uuid')->nullable()", $this->migration());
    }

    public function test_column_is_nullable_in_both_records(): void
    {
        $this->assertStringContainsString('uuid NULL', $this->sql());
        $this->assertStringContainsString('->nullable()', $this->migration());
    }

    public function test_no_default_is_declared(): void
    {
        $this->assertStringNotContainsString('queue_job_uuid uuid NOT NULL', $this->sql());
        $this->assertStringNotContainsString('DEFAULT', $this->statements($this->sql()));
    }

    // ------------------------------------------------------------------
    // 5. No uniqueness on the correlation column.
    // ------------------------------------------------------------------

    public function test_correlation_is_not_unique_because_retries_share_one_uuid(): void
    {
        $sql = $this->statements($this->sql());
        $migration = $this->statements($this->migration());

        // Automatic retries of one dispatch legitimately share a UUID, so a
        // UNIQUE constraint would be wrong, not merely unnecessary.
        $this->assertStringNotContainsString('UNIQUE (queue_job_uuid)', $sql);
        $this->assertStringNotContainsString('UNIQUE (queue_job_uuid)', $migration);
        $this->assertStringNotContainsString("unique(['queue_job_uuid']", $migration);
        $this->assertStringNotContainsString("unique(['site_inspection_id', 'queue_job_uuid']", $migration);
    }

    // ------------------------------------------------------------------
    // 6. The correlation index.
    // ------------------------------------------------------------------

    public function test_correlation_index_exists_with_the_intended_shape(): void
    {
        $expected = '(site_inspection_id, queue_job_uuid, attempt_number DESC)';

        $this->assertStringContainsString($expected, $this->flat($this->sql()));
        $this->assertStringContainsString($expected, $this->flat($this->migration()));
    }

    public function test_correlation_index_is_partial_on_non_null(): void
    {
        $this->assertStringContainsString('WHERE queue_job_uuid IS NOT NULL', $this->sql());
        $this->assertStringContainsString('WHERE queue_job_uuid IS NOT NULL', $this->migration());
    }

    public function test_no_speculative_index_was_added(): void
    {
        preg_match_all('/CREATE INDEX(?: IF NOT EXISTS)? (\w+)/', $this->sql(), $m);

        $this->assertSame(
            ['inspection_delivery_attempts_queue_correlation_index'],
            $m[1],
            'Exactly one index may be created by this revision.'
        );
    }

    // ------------------------------------------------------------------
    // 4/11. Historical NULL contract and absence of any data mutation.
    // ------------------------------------------------------------------

    public function test_no_uuid_backfill_or_business_data_mutation(): void
    {
        $sql = $this->statements($this->sql());

        foreach ([
            'UPDATE public.inspection_delivery_attempts',
            'UPDATE public.site_inspections',
            'DELETE FROM',
            'TRUNCATE',
            'DROP ',
            'INSERT INTO',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $sql);
        }
    }

    public function test_legacy_reconciliation_null_behaviour_is_documented(): void
    {
        $flat = $this->flat($this->sql());

        $this->assertStringContainsString('legacy_reconciliation', $flat);
        $this->assertStringContainsString('stay NULL', $flat);
        $this->assertStringContainsString('No UUID is derived or', $flat);
    }

    public function test_no_check_forces_uuid_on_prospective_sources(): void
    {
        // Deliberately NOT added. A NULL can only come from legacy
        // reconciliation or a synchronous execution, and a synchronous
        // execution can never reach failed(), so it can never terminalize a
        // summary. A hard NOT NULL would add fragility for no safety gain.
        $flat = $this->flat($this->sql());

        $this->assertStringNotContainsString('ADD CONSTRAINT', $flat);
        $this->assertStringContainsString('NO CHECK ON PROSPECTIVE SOURCES', $flat);
    }

    // ------------------------------------------------------------------
    // Model contract.
    // ------------------------------------------------------------------

    public function test_model_exposes_the_correlation_constant(): void
    {
        $this->assertSame('queue_job_uuid', InspectionDeliveryAttempt::CORRELATION_COLUMN);
    }

    public function test_correlation_is_not_mass_assignable(): void
    {
        // Recorder-controlled, never request-driven.
        $fillable = (string) preg_replace(
            '/(?s).*protected \$fillable = \[(.*?)\];.*/s',
            '$1',
            (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'))
        );

        $this->assertStringNotContainsString('queue_job_uuid', $fillable);
    }

    public function test_model_contains_no_terminal_business_logic_yet(): void
    {
        // The writer correction is a SEPARATE follow-up task. This revision is
        // schema + model foundation only.
        $source = (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'));

        $this->assertStringNotContainsString('reconcileTerminalFailure', $source);
        $this->assertStringNotContainsString('delivery_failed', $source);
    }

    // ------------------------------------------------------------------
    // 15. Scenario E contract: correlation ALONE is not enough.
    // ------------------------------------------------------------------

    public function test_scenario_e_requires_correlation_and_global_latest_protection(): void
    {
        // Scenario E: Job A terminal while Job B has a newer attempt that has
        // failed once but is still retryable. Scoping failed() to its own UUID
        // alone would be wrong if it then overwrote the summary; the global
        // latest attempt must also be checked.
        $sql = $this->flat($this->sql());

        $this->assertStringContainsString('the globally latest attempt', $sql);
        $this->assertStringContainsString('ambiguous', $sql);
    }

    public function test_revision_documents_the_scenario_e_root_cause(): void
    {
        $sql = $this->flat($this->sql());

        $this->assertStringContainsString('cannot', $sql);
        $this->assertStringContainsString('correlate', $sql);
        $this->assertStringContainsString('still retryable', $sql);
    }

    // ------------------------------------------------------------------
    // Bounded scope.
    // ------------------------------------------------------------------

    public function test_revision_adds_exactly_one_column(): void
    {
        $this->assertSame(
            1,
            substr_count($this->statements($this->sql()), 'ADD COLUMN IF NOT EXISTS')
        );
    }

    public function test_migration_ledger_is_not_touched_by_this_artifact(): void
    {
        // The forward SQL must not insert a ledger row by hand.
        $this->assertStringNotContainsString('INSERT INTO public.migrations', $this->statements($this->sql()));
        $this->assertStringNotContainsString('INSERT INTO migrations', $this->statements($this->sql()));
    }

    public function test_no_supabase_fieldsync_or_controller_change_is_declared(): void
    {
        foreach ([self::FORWARD_SQL, self::MIGRATION] as $file) {
            $content = (string) file_get_contents(base_path($file));
            $this->assertStringNotContainsString('field_jobs', $content);
            $this->assertStringNotContainsString('supabase.co', $content);
        }
    }

    public function test_prior_9a_schema_artifacts_are_untouched(): void
    {
        // The correlation revision is additive on top of 9A, never a rewrite.
        $this->assertFileExists(base_path('database/sql/2026_09_28_add_inspection_delivery_monitoring.sql'));
        $this->assertFileExists(
            base_path('database/migrations/2026_09_28_030000_add_inspection_delivery_monitoring.php')
        );
        $this->assertFileExists(
            base_path('database/sql/2026_09_28_reconcile_legacy_delivery_failures_25_30.sql')
        );
    }
}
