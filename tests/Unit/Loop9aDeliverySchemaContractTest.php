<?php

namespace Tests\Unit;

use App\Models\InspectionDeliveryAttempt;
use Tests\TestCase;

/**
 * Loop 9A — delivery monitoring schema contract.
 *
 * ENVIRONMENT LIMITATION (reported, not worked around):
 * this project cannot execute DB-backed Feature tests locally because the local
 * PHP build has `pdo_pgsql` but not `pdo_sqlite`, so `RefreshDatabase` against
 * an in-memory SQLite database fails with "could not find driver". Rather than
 * weaken the production constraints to make SQLite happy, these tests assert
 * the SCHEMA CONTRACT AT SOURCE LEVEL: the canonical vocabulary, the constraint
 * rules, the migration/SQL parity, and the deliberate absence of any bridge
 * behaviour change.
 *
 * The live behavioural proof was performed separately against the real
 * PostgreSQL database inside a single transaction that was rolled back, so no
 * constraint here is unverified against a real engine. That evidence covers all
 * nineteen rules this file encodes.
 */
class Loop9aDeliverySchemaContractTest extends TestCase
{
    private const FORWARD_SQL = 'database/sql/2026_09_28_add_inspection_delivery_monitoring.sql';

    private const MIGRATION = 'database/migrations/2026_09_28_030000_add_inspection_delivery_monitoring.php';

    private function sql(): string
    {
        return (string) file_get_contents(base_path(self::FORWARD_SQL));
    }

    /**
     * Collapse all whitespace so an assertion describes the CONTRACT rather
     * than the line wrapping chosen when the file was written.
     */
    private function flat(string $text): string
    {
        return (string) preg_replace('/\s+/', ' ', $text);
    }

    /**
     * Strip SQL line and block comments, so a keyword asserted as "absent" is
     * genuinely absent as executable SQL and not merely mentioned in the
     * explanatory header.
     */
    private function withoutComments(string $sql): string
    {
        $sql = (string) preg_replace('/--[^\n]*/', '', $sql);

        return (string) preg_replace('/\/\*.*?\*\//s', '', $sql);
    }

    private function migration(): string
    {
        return (string) file_get_contents(base_path(self::MIGRATION));
    }

    // ------------------------------------------------------------------
    // 1/2. delivery_status vocabulary.
    // ------------------------------------------------------------------

    public function test_delivery_status_vocabulary_is_the_closed_loop9_contract(): void
    {
        $expected = ['pending_delivery', 'delivered', 'delivery_failed'];

        foreach ($expected as $value) {
            $this->assertStringContainsString("'{$value}'", $this->sql());
        }
    }

    public function test_no_retrying_business_state_exists(): void
    {
        $this->assertStringNotContainsString("'retrying'", $this->sql());
        $this->assertStringNotContainsString('retrying', (string) json_encode(
            array_keys(get_class_vars(InspectionDeliveryAttempt::class))
        ));
    }

    public function test_delivery_state_never_reuses_field_sync_task_lifecycle_values(): void
    {
        $sql = $this->sql();

        // The task lifecycle vocabulary must never appear inside the delivery
        // status CHECK constraint.
        $this->assertMatchesRegularExpression(
            '/delivery_status IS NULL\s*\r?\n?\s*OR delivery_status IN \([^)]*pending_delivery[^)]*\)/',
            $sql
        );

        foreach (['assigned', 'in_progress', 'completed'] as $lifecycle) {
            $this->assertStringNotContainsString(
                "delivery_status IN ('{$lifecycle}')",
                $sql,
                "Delivery status must never reuse the FieldSync lifecycle value '{$lifecycle}'."
            );
        }
    }

    // ------------------------------------------------------------------
    // 3/4/5/6. Attempt vocabularies.
    // ------------------------------------------------------------------

    public function test_source_vocabulary_is_closed(): void
    {
        foreach ([
            'initial_dispatch',
            'automatic_retry',
            'planning_officer_retry',
            'legacy_reconciliation',
        ] as $value) {
            $this->assertStringContainsString("'{$value}'", $this->sql());
            $this->assertContains($value, InspectionDeliveryAttempt::sources());
        }
    }

    public function test_outcome_vocabulary_is_closed_and_three_valued(): void
    {
        foreach (['pending', 'delivered', 'failed'] as $value) {
            $this->assertStringContainsString("outcome IN ('pending', 'delivered', 'failed')", $this->sql());
            $this->assertContains($value, InspectionDeliveryAttempt::outcomes());
        }

        $this->assertCount(3, InspectionDeliveryAttempt::outcomes());
    }

    public function test_failure_category_vocabulary_is_closed_and_matches_the_model(): void
    {
        $expected = [
            'inspector_mapping_unresolved',
            'supabase_unreachable',
            'authentication_failure',
            'remote_constraint_failure',
            'remote_validation_failure',
            'configuration_failure',
            'unknown',
        ];

        foreach ($expected as $value) {
            $this->assertStringContainsString("'{$value}'", $this->sql());
        }

        $this->assertSame($expected, InspectionDeliveryAttempt::failureCategories());
    }

    // ------------------------------------------------------------------
    // 7. failure_category NULL rules, in BOTH directions.
    // ------------------------------------------------------------------

    public function test_failed_outcome_requires_a_failure_category(): void
    {
        $this->assertStringContainsString(
            "outcome = 'failed' AND failure_category IS NOT NULL",
            $this->flat($this->sql())
        );
    }

    public function test_non_failed_outcomes_must_not_carry_a_failure_category(): void
    {
        $this->assertStringContainsString(
            "outcome IN ('pending', 'delivered') AND failure_category IS NULL",
            $this->flat($this->sql())
        );
    }

    public function test_failure_category_null_rules_are_written_null_safely(): void
    {
        // `NULL IN (...)` evaluates to NULL, and a CHECK passes on NULL, so a
        // plain membership test would silently admit a NULL category. Both
        // branches must therefore use explicit IS NULL / IS NOT NULL.
        $constraint = $this->sql();

        $this->assertStringContainsString('failure_category IS NOT NULL', $constraint);
        $this->assertStringContainsString('failure_category IS NULL', $constraint);
    }

    // ------------------------------------------------------------------
    // 8. Attempt numbering is scoped per inspection round.
    // ------------------------------------------------------------------

    public function test_attempt_number_is_unique_per_inspection_not_globally(): void
    {
        $this->assertStringContainsString(
            'UNIQUE (site_inspection_id, attempt_number)',
            $this->sql()
        );
        $this->assertStringContainsString(
            "['site_inspection_id', 'attempt_number']",
            $this->migration()
        );
    }

    public function test_attempt_number_must_be_a_positive_sequence_value(): void
    {
        $this->assertStringContainsString('CHECK (attempt_number >= 1)', $this->sql());
    }

    // ------------------------------------------------------------------
    // 9. Current-summary constraints.
    // ------------------------------------------------------------------

    public function test_delivered_state_requires_a_delivered_at_timestamp(): void
    {
        $this->assertStringContainsString(
            "delivery_status IS DISTINCT FROM 'delivered' OR delivered_at IS NOT NULL",
            $this->sql()
        );
    }

    public function test_delivered_at_is_never_forced_to_null_when_state_changes(): void
    {
        // The reverse implication must NOT exist: a retry returning the row to
        // pending_delivery must not have to erase the historical delivered_at.
        $sql = $this->sql();

        $this->assertStringNotContainsString(
            "delivery_status = 'delivered' AND delivered_at IS NULL",
            $sql
        );
    }

    public function test_all_four_summary_columns_are_nullable(): void
    {
        $sql = $this->sql();

        foreach ([
            'delivery_status character varying(32) NULL',
            'last_delivery_attempt_at timestamp NULL',
            'delivered_at timestamp NULL',
            'last_delivery_failure_category character varying(48) NULL',
        ] as $definition) {
            $this->assertStringContainsString($definition, $sql);
        }
    }

    // ------------------------------------------------------------------
    // 10. Foreign key with the correct ON DELETE behaviour.
    // ------------------------------------------------------------------

    public function test_attempt_history_has_a_real_foreign_key_with_cascade(): void
    {
        $this->assertStringContainsString(
            'REFERENCES public.site_inspections (id) ON DELETE CASCADE',
            $this->flat($this->sql())
        );
        $this->assertStringContainsString('cascadeOnDelete()', $this->migration());
    }

    public function test_attempt_table_is_not_polymorphic(): void
    {
        // A (type, id) shape cannot be constrained. The contract requires a
        // real FK to the exact round.
        $this->assertStringNotContainsString('entity_type', $this->sql());
        $this->assertStringNotContainsString('entity_id', $this->sql());
    }

    // ------------------------------------------------------------------
    // 11/12. Indexes are justified and minimal.
    // ------------------------------------------------------------------

    public function test_only_justified_indexes_are_created(): void
    {
        $sql = $this->sql();

        $this->assertStringContainsString('site_inspections_delivery_status_index', $sql);
        $this->assertStringContainsString('WHERE delivery_status IS NOT NULL', $sql);
        $this->assertStringContainsString('inspection_delivery_attempts_inspection_attempted_index', $sql);
        $this->assertStringContainsString('(site_inspection_id, attempted_at)', $sql);

        // A low-selectivity three-value outcome index was deliberately omitted.
        $this->assertStringNotContainsString('ON public.inspection_delivery_attempts (outcome)', $sql);
    }

    // ------------------------------------------------------------------
    // 13/14. No historical backfill, and no destructive statement.
    // ------------------------------------------------------------------

    public function test_script_performs_no_historical_backfill(): void
    {
        $sql = $this->sql();

        $this->assertStringNotContainsString('UPDATE public.site_inspections', $sql);
        $this->assertStringNotContainsString('UPDATE site_inspections', $sql);
        $this->assertStringContainsString('NO historical backfill', $sql);
    }

    public function test_script_contains_no_destructive_statement(): void
    {
        // Asserted against executable SQL only: the file's own header
        // legitimately *names* the statements it refuses to perform.
        $sql = $this->withoutComments($this->sql());

        foreach (['DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'DELETE FROM'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $sql);
        }
    }

    public function test_no_delivery_column_may_store_sensitive_material(): void
    {
        $sql = $this->sql();

        foreach ([
            'service_key',
            'api_key',
            'authorization',
            'bearer',
            'handshake',
            'signed_url',
            'connection_string',
            'exception_dump',
            'raw_payload',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, strtolower($sql));
        }
    }

    public function test_failed_jobs_is_never_used_as_business_delivery_state(): void
    {
        // Both files legitimately *name* failed_jobs in prose to record that it
        // is deliberately rejected. What must not exist is any executable
        // reference to it.
        foreach ([self::FORWARD_SQL, self::MIGRATION] as $file) {
            $content = (string) file_get_contents(base_path($file));
            $this->assertStringNotContainsString(
                'failed_jobs',
                $this->withoutComments($content)
            );
        }
    }

    // ------------------------------------------------------------------
    // 15. Migration and forward SQL agree.
    // ------------------------------------------------------------------

    public function test_migration_and_forward_sql_declare_the_same_vocabularies(): void
    {
        $sql = $this->sql();
        $migration = $this->migration();

        foreach (['pending_delivery', 'delivered', 'delivery_failed'] as $value) {
            $this->assertStringContainsString("'{$value}'", $migration);
        }

        foreach (['initial_dispatch', 'legacy_reconciliation'] as $value) {
            $this->assertStringContainsString($value, $migration);
        }

        $this->assertStringContainsString('cascadeOnDelete', $migration);
        $this->assertStringContainsString('delivery_status', $sql);
    }

    public function test_migration_is_additive_and_idempotent(): void
    {
        $migration = $this->migration();

        $this->assertStringContainsString('Schema::hasColumn', $migration);
        $this->assertStringContainsString('Schema::hasTable', $migration);
    }

    public function test_fresh_install_migration_reproduces_the_full_contract(): void
    {
        $migration = $this->migration();

        foreach ([
            'delivery_status',
            'last_delivery_attempt_at',
            'delivered_at',
            'last_delivery_failure_category',
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_inspection_attempt_unique',
            'inspection_delivery_attempts_inspection_attempted_index',
            // The partial summary index must exist on a fresh install too: the
            // forward SQL and the live 0921 database both carry it, and the
            // Loop 9D aggregate depends on it.
            'site_inspections_delivery_status_index',
            'WHERE delivery_status IS NOT NULL',
            'cascadeOnDelete',
        ] as $token) {
            $this->assertStringContainsString($token, $migration);
        }
    }

    public function test_every_check_constraint_exists_in_all_three_records(): void
    {
        // A count alone is not proof of parity, so the exact named set is
        // compared. This is the rule that the 9A report miscounted.
        $expected = [
            'site_inspections_delivery_status_check',
            'site_inspections_delivery_failure_category_check',
            'site_inspections_delivered_at_present_check',
            'inspection_delivery_attempts_source_check',
            'inspection_delivery_attempts_outcome_check',
            'inspection_delivery_attempts_failure_category_check',
            'inspection_delivery_attempts_attempt_number_check',
            'inspection_delivery_attempts_completed_at_check',
        ];

        $sql = $this->flat($this->sql());
        $migration = $this->migration();

        // 3 summary + 5 attempt CHECKs = 8 Loop 9A CHECK constraints.
        $this->assertCount(8, $expected);

        foreach ($expected as $name) {
            $this->assertStringContainsString($name, $sql, "Forward SQL is missing {$name}.");
            $this->assertStringContainsString($name, $migration, "Fresh migration is missing {$name}.");
        }
    }

    public function test_fresh_install_creates_both_indexes_not_just_the_attempt_one(): void
    {
        $migration = $this->migration();

        $this->assertStringContainsString('inspection_delivery_attempts_inspection_attempted_index', $migration);
        $this->assertStringContainsString('site_inspections_delivery_status_index', $migration);
    }

    // ------------------------------------------------------------------
    // Model layer.
    // ------------------------------------------------------------------

    public function test_site_inspection_exposes_only_the_delivery_relation(): void
    {
        $source = (string) file_get_contents(base_path('app/Models/SiteInspection.php'));

        $this->assertStringContainsString('function deliveryAttempts(): HasMany', $source);
        $this->assertStringContainsString("hasMany(InspectionDeliveryAttempt::class, 'site_inspection_id')", $source);
    }

    public function test_delivery_fields_are_not_mass_assignable(): void
    {
        // Delivery state is writer-controlled, never request-driven. It must not
        // be reachable through mass assignment before an explicit writer exists.
        $fillable = (string) preg_replace(
            '/(?s).*protected \$fillable = \[(.*?)\];.*/s',
            '$1',
            (string) file_get_contents(base_path('app/Models/SiteInspection.php'))
        );

        $this->assertStringNotContainsString('delivery_status', $fillable);
        $this->assertStringNotContainsString('delivered_at', $fillable);
        $this->assertStringNotContainsString('last_delivery_failure_category', $fillable);
    }

    public function test_attempt_model_casts_its_timestamps(): void
    {
        $casts = (string) preg_replace(
            '/(?s).*protected \$casts = \[(.*?)\];.*/s',
            '$1',
            (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'))
        );

        $this->assertStringContainsString("'attempted_at' => 'datetime'", $casts);
        $this->assertStringContainsString("'completed_at' => 'datetime'", $casts);
        $this->assertStringContainsString("'attempt_number' => 'integer'", $casts);
    }

    public function test_attempt_model_links_back_to_the_exact_round(): void
    {
        $source = (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'));

        $this->assertStringContainsString('function siteInspection(): BelongsTo', $source);
        $this->assertStringContainsString("belongsTo(SiteInspection::class, 'site_inspection_id')", $source);
    }

    // ------------------------------------------------------------------
    // Bridge stability: 9A must not touch delivery execution.
    // ------------------------------------------------------------------

    /**
     * The 9A invariant is that delivery state stays LOCAL: it must never become
     * a FieldSync field. Loop 9B later instrumented the writer to record local
     * attempts, so the writer now legitimately names the model. What must
     * remain true is that no delivery field is ever written to the remote
     * payload, and that the remote call sequence is untouched.
     */
    public function test_bridge_writer_never_ships_local_delivery_state_to_fieldsync(): void
    {
        $job = (string) file_get_contents(base_path('app/Jobs/PushInspectionToSupabase.php'));

        foreach ([
            'delivery_status',
            'deliveryAttempts',
            'delivery_attempt_number',
            'delivery_failure',
            'last_delivery',
        ] as $fieldSyncField) {
            $this->assertStringNotContainsString(
                "'{$fieldSyncField}'",
                $job,
                "Local delivery state '{$fieldSyncField}' must never be pushed to FieldSync."
            );
        }
    }

    public function test_no_delivery_controller_or_ui_was_introduced(): void
    {
        $this->assertFileDoesNotExist(base_path('app/Http/Controllers/DeliveryMonitoringController.php'));
        $this->assertFileDoesNotExist(base_path('app/Http/Controllers/DiagnosticReportController.php'));

        foreach ([
            'app/Http/Controllers/ApplicationController.php',
            'app/Http/Controllers/TechnicalReviewController.php',
            'app/Http/Controllers/WorkReassignmentController.php',
        ] as $controller) {
            $this->assertStringNotContainsString(
                'InspectionDeliveryAttempt',
                (string) file_get_contents(base_path($controller))
            );
        }
    }

    public function test_field_sync_lifecycle_columns_are_untouched(): void
    {
        $sql = $this->sql();

        // The new columns are additive; no existing lifecycle column is altered.
        $this->assertStringNotContainsString('ALTER COLUMN status', $sql);
        $this->assertStringNotContainsString('ALTER COLUMN inspector_id', $sql);
        $this->assertStringNotContainsString('ALTER COLUMN zoning_application_id', $sql);
    }
}
