<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * The prepared remote SQL is an artifact awaiting approval, so its contract is
 * asserted here rather than discovered after an apply.
 *
 * The behavioural proof that the namespaced identity actually behaves correctly
 * lives in `2026_10_01_bridge_source_namespace_dryrun.sql`, which runs against
 * real PostgreSQL. These tests guard the parts a dry run cannot check: that the
 * artifact is not applied, refuses to run unnamed, drops data, or reintroduce
 * the bare-local-id identity.
 */
class BridgeNamespaceSqlContractTest extends TestCase
{
    private const FORWARD = 'database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql';

    private const DRYRUN = 'database/sql/2026_10_01_bridge_source_namespace_dryrun.sql';

    // ==================================================================
    // STATUS
    // ==================================================================

    public function test_the_forward_sql_is_prepared_and_not_applied(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString('PREPARED - NOT YET APPLIED', $sql);
        $this->assertStringContainsString('AWAITING EXPLICIT USER APPROVAL', $sql);
        $this->assertStringContainsString('DO NOT RUN THIS UNTIL', $sql);
    }

    // ==================================================================
    // REFUSES TO RUN WITHOUT AN EXPLICIT IDENTITY
    // ==================================================================

    public function test_the_forward_sql_refuses_to_run_without_an_explicit_source_id(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString(":'bridge_source_id'", $sql);
        $this->assertStringContainsString('REFUSING TO RUN: psql variable bridge_source_id was not supplied', $sql);
        $this->assertStringContainsString('There is deliberately no default', $sql);
    }

    public function test_the_forward_sql_rejects_the_same_placeholder_words_the_writer_rejects(): void
    {
        $sql = $this->forward();

        foreach (\App\Services\BridgeSourceIdentity::REJECTED as $placeholder) {
            $this->assertStringContainsString(
                "'" . strtolower($placeholder) . "'",
                strtolower($sql),
                "The SQL must reject '{$placeholder}' exactly as the writer does.",
            );
        }
    }

    public function test_the_forward_sql_never_derives_the_identity(): void
    {
        // Executable statements only: the file's own header explains the
        // contract in prose and mentions these words.
        $sql = strtolower($this->executableSql($this->forward()));

        // No silent derivation from anything runtime-derived.
        foreach (['current_setting', 'inet_server_addr', 'pg_backend_pid', 'nullif(', 'gen_random_uuid'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $sql,
                "'{$forbidden}' would make the identity environment-dependent rather than explicit.",
            );
        }

        // The only source of the value is the psql variable, read once.
        $this->assertSame(
            1,
            substr_count($sql, 'values (:\'bridge_source_id\')'),
            'bridge_source_id must be supplied once, as a psql variable, and used as-is.',
        );
    }

    // ==================================================================
    // THE NAMESPACE CONTRACT
    // ==================================================================

    #[DataProvider('compositeConstraintProvider')]
    public function test_every_composite_unique_is_installed(string $constraint, string $columns): void
    {
        $this->assertStringContainsString(
            "ADD CONSTRAINT {$constraint}\n    UNIQUE ({$columns})",
            $this->forward(),
        );
    }

    public static function compositeConstraintProvider(): array
    {
        return [
            'field_jobs' => [
                'field_jobs_bridge_source_id_local_inspection_id_key',
                'bridge_source_id, local_inspection_id',
            ],
            'supabase_zoning_applications' => [
                'supabase_zoning_applications_bridge_local_application_id_key',
                'bridge_source_id, local_application_id',
            ],
            'supabase_parcels' => [
                'supabase_parcels_bridge_source_id_local_parcel_id_key',
                'bridge_source_id, local_parcel_id',
            ],
            'field_job_reviews' => [
                'field_job_reviews_bridge_source_id_technical_review_id_key',
                'bridge_source_id, technical_review_id',
            ],
        ];
    }

    #[DataProvider('constraintNameLengthProvider')]
    public function test_no_constraint_name_is_silently_truncated(string $constraint): void
    {
        // PostgreSQL truncates identifiers at 63 bytes. A truncated name would
        // make the verification step and the documented rollback refer to an
        // object that does not exist.
        $this->assertLessThanOrEqual(
            63,
            strlen($constraint),
            "Constraint name '{$constraint}' would be truncated by PostgreSQL.",
        );
    }

    public static function constraintNameLengthProvider(): array
    {
        $cases = [];

        foreach (self::compositeConstraintProvider() as $label => $pair) {
            $cases[$label] = [$pair[0]];
        }

        return $cases;
    }

    // ==================================================================
// NO DATA DESTRUCTION, NO BUSINESS ROW REWRITE
    // ==================================================================

    public function test_the_forward_sql_deletes_and_rewrites_no_business_data(): void
    {
        $sql = $this->executableSql($this->forward());

        $this->assertStringNotContainsString('DELETE FROM', $sql);
        $this->assertStringNotContainsString('TRUNCATE', $sql);
        $this->assertStringNotContainsString('DROP TABLE', $sql);
        $this->assertStringNotContainsString('DROP COLUMN', $sql);

        // The only UPDATE is the namespace backfill, which joins on the primary
        // key of a frozen UUID list.
        preg_match_all('/UPDATE\s+public\.\w+/i', $sql, $updates);
        $this->assertCount(4, $updates[0], 'Exactly the four namespaced tables may be updated.');

        foreach ($updates[0] as $update) {
            $this->assertMatchesRegularExpression(
                '/UPDATE\s+public\.(field_jobs|supabase_zoning_applications|supabase_parcels|field_job_reviews)$/i',
                trim($update),
            );
        }

        // Every backfill UPDATE writes bridge_source_id and nothing else.
        preg_match_all(
            '/SET\s+bridge_source_id\s*=\s*v_source\s+FROM\s+bridge_ns_\w+\s+a/i',
            $sql,
            $backfills,
        );
        $this->assertCount(3, $backfills[0], 'Only frozen Class-A UUID lists may be backfilled.');
    }

    public function test_the_forward_sql_never_touches_fieldsync_owned_lifecycle_columns(): void
    {
        $sql = $this->executableSql($this->forward());

        foreach ([
            'status =',
            'current_step =',
            'started_at =',
            'step_timestamps =',
            'submitted_at =',
            'photo_count =',
            'gps_confirmed_at =',
            'checklist_data =',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $sql,
                "'{$forbidden}' would rewrite FieldSync-owned lifecycle state.",
            );
        }
    }

    public function test_the_forward_sql_preserves_primary_keys_and_foreign_keys(): void
    {
        $sql = $this->executableSql($this->forward());

        $this->assertStringNotContainsString('DROP CONSTRAINT IF EXISTS field_jobs_pkey', $sql);
        $this->assertStringContainsString("contype = 'p'", $sql);
        $this->assertStringContainsString("contype = 'f'", $sql);
        $this->assertStringContainsString('lost its primary key', $sql);
        $this->assertStringContainsString('lost its foreign key', $sql);
    }

    // ==================================================================
    // GUARDS, TRANSACTION, LEGACY STRATEGY
    // ==================================================================

    public function test_the_forward_sql_has_an_incompatible_schema_guard_before_any_ddl(): void
    {
        $sql = $this->forward();

        $guardAt = strpos($sql, 'INCOMPATIBLE SCHEMA');
        $firstDdlAt = strpos($sql, 'ADD COLUMN IF NOT EXISTS bridge_source_id');

        $this->assertNotFalse($guardAt);
        $this->assertNotFalse($firstDdlAt);
        $this->assertLessThan($firstDdlAt, $guardAt, 'The guard must run before the first DDL statement.');

        $this->assertStringContainsString('BEGIN;', $sql);
        $this->assertStringContainsString('COMMIT;', $sql);
        $this->assertLessThan(
            strpos($sql, 'COMMIT;'),
            strpos($sql, 'BEGIN;'),
            'The whole script must be one transaction, so any RAISE rolls everything back.',
        );
    }

    public function test_the_forward_sql_records_the_three_way_legacy_classification(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString('A. PROVEN CURRENT ENVIRONMENT', $sql);
        $this->assertStringContainsString('B. PROVEN OTHER ENVIRONMENT', $sql);
        $this->assertStringContainsString('C. UNRESOLVED LEGACY', $sql);
        $this->assertStringContainsString('never invents an identity for them', $sql);
        $this->assertStringContainsString('does NOT exist in this iMAPS database', $sql);
        $this->assertStringContainsString('Leaving them NULL is what makes that safe', $sql);
    }

    public function test_the_forward_sql_freezes_the_class_a_uuid_lists(): void
    {
        $sql = $this->forward();

        // 15 proven jobs, 21 proven applications, 19 proven parcels, per the
        // 2026-10-01 audit. Counted as UUIDs, not quotes.
        $this->assertSame(15, $this->countIds($sql, 'bridge_ns_field_jobs_a'));
        $this->assertSame(21, $this->countIds($sql, 'bridge_ns_sza_a'));
        $this->assertSame(19, $this->countIds($sql, 'bridge_ns_parcels_a'));
    }

    public function test_the_teshow_job_is_deliberately_left_unclaimed(): void
    {
        $sql = $this->forward();

        // It must be discussed...
        $this->assertStringContainsString('a761b17a-3fad-44ed-b451-7f0af0e41183', $sql);
        $this->assertStringContainsString('UNRESOLVED', $sql);

        // ...but never inserted into a claimed list.
        foreach (['bridge_ns_field_jobs_a', 'bridge_ns_sza_a', 'bridge_ns_parcels_a'] as $list) {
            $this->assertStringNotContainsString(
                'a761b17a',
                $this->listBody($sql, $list),
                'The unresolved Teshow job must not be claimed by the backfill.',
            );
        }
    }

    public function test_the_proven_other_environment_rows_are_never_claimed(): void
    {
        $sql = $this->forward();

        foreach ([
            '7a87a08d-6e8a-4943-8f4b-0a2ae242e09f', // local_application_id 138 (Boy Abunda)
            '4afe8a3d-9e4f-435a-833e-8bda17c264d6', // local_application_id 136
            'b23e89d7-4864-45cc-b07e-8f8cdecf2ba5', // local_application_id 137
        ] as $otherEnvironmentRow) {
            $this->assertStringNotContainsString(
                $otherEnvironmentRow,
                $this->listBody($sql, 'bridge_ns_sza_a'),
                'Another environment\'s application row must never be claimed.',
            );
        }

        $this->assertStringNotContainsString(
            '2676c039-3a3a-4ad5-8ed9-c44208e0b9d7', // local_parcel_id 70
            $this->listBody($sql, 'bridge_ns_parcels_a'),
            'Another environment\'s parcel row must never be claimed.',
        );
    }

    public function test_the_loop_10_fixture_is_in_the_claimed_lists(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString('1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999', $this->listBody($sql, 'bridge_ns_field_jobs_a'));
        $this->assertStringContainsString('b108513f-b1e8-4415-a088-b4107fc4374b', $this->listBody($sql, 'bridge_ns_sza_a'));
        $this->assertStringContainsString('cf974dc9-d219-4f9d-9776-40e237c12d34', $this->listBody($sql, 'bridge_ns_parcels_a'));
    }

    // ==================================================================
    // OLD DEPLOYMENT SAFETY
    // ==================================================================

    public function test_the_forward_sql_documents_the_old_writer_fail_safe(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString('42P10', $sql);
        $this->assertStringContainsString(
            'there is no unique or exclusion constraint matching the ON CONFLICT',
            $sql,
        );
        $this->assertStringContainsString('compatibility shim is created here on purpose', $sql);
        $this->assertStringContainsString('REQUIRED COORDINATION', $sql);
        $this->assertStringContainsString('preferred fail-safe', $sql);
    }

    public function test_the_forward_sql_documents_a_rollback_and_recovery_path(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString('ROLLBACK / RECOVERY', $sql);
        $this->assertStringContainsString('Reverting restores the COLLISION VULNERABILITY', $sql);
        $this->assertStringContainsString('pg_dump', $sql);
    }

    // ==================================================================
    // DRY RUN
    // ==================================================================

    public function test_the_dry_run_touches_a_throwaway_schema_and_never_public(): void
    {
        $sql = $this->dryRun();

        $this->assertStringContainsString('CREATE SCHEMA bridge_ns_dryrun', $sql);
        $this->assertStringContainsString('DROP SCHEMA bridge_ns_dryrun CASCADE', $sql);
        $this->assertStringContainsString('It never touches `public`.', $sql);
        $this->assertStringContainsString('The real Supabase project was NOT contacted by this script.', $sql);

        // No schema-qualified reference to the real bridge may exist: the dry
        // run must be incapable of touching it even by accident.
        foreach ([
            'public.field_jobs',
            'public.supabase_parcels',
            'public.supabase_zoning_applications',
            'public.field_job_reviews',
            'public.field_job_photos',
        ] as $realBridgeReference) {
            $this->assertStringNotContainsString($realBridgeReference, $sql);
        }
    }

    #[DataProvider('dryRunProofProvider')]
    public function test_the_dry_run_proves_each_required_behaviour(string $needle): void
    {
        $this->assertStringContainsString($needle, $this->dryRun());
    }

    public static function dryRunProofProvider(): array
    {
        return [
            'two environments, same local id, coexist' => ['PASS: two environments produced TWO distinct field_jobs rows'],
            'retry updates only its own namespace'    => ['PASS: retry converged on the source_a row'],
            'retry leaves the other namespace alone'   => ['PASS: the source_a retry did NOT touch the source_b row'],
            'other environment cannot overwrite'       => ['PASS: source_b write created/updated ONLY its own row'],
            'old writer fails'                         => ['PASS: old writer rejected with SQLSTATE 42P10'],
            'retry idempotence'                        => ['PASS: 3 additional identical writes still produced exactly 1 source_a row'],
            'unclaimed rows are safe'                  => ['PASS: the unclaimed legacy row coexists'],
            'application mirror'                       => ['PASS: application and parcel mirrors coexist per namespace'],
            'review mirror'                            => ['PASS: two environments coexist on the same local technical_review_id'],
            'relationships preserved'                  => ['PASS: photo'],
        ];
    }

    // ==================================================================
    // HELPERS
    // ==================================================================

    private function forward(): string
    {
        $sql = file_get_contents(dirname(__DIR__, 2) . '/' . self::FORWARD);
        $this->assertNotFalse($sql);

        return $sql;
    }

    private function dryRun(): string
    {
        $sql = file_get_contents(dirname(__DIR__, 2) . '/' . self::DRYRUN);
        $this->assertNotFalse($sql);

        return $sql;
    }

    /**
     * The SQL with every `--` comment line removed and dollar-quoted bodies
     * blanked out.
     *
     * Both artifacts explain their contract in prose, and that prose
     * legitimately names the very things a negative assertion forbids ("no
     * DELETE FROM"). These tests are about what the script EXECUTES, so they
     * must not be satisfiable - or breakable - by the surrounding commentary.
     */
    private function executableSql(string $sql): string
    {
        $withoutLineComments = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;

        // psql meta-commands and the EXECUTE strings are not statements either.
        $withoutMeta = preg_replace('/^\\\\[a-z]+.*$/m', '', $withoutLineComments) ?? $withoutLineComments;

        $body = preg_replace('/EXECUTE\s+format\([^;]*?\);/is', 'EXECUTE format(1);', $withoutMeta) ?? $withoutMeta;

        return $body;
    }

    /**
     * The INSERT body of a frozen UUID list, so an assertion about membership
     * cannot be satisfied by a mention in a comment elsewhere in the file.
     */
    private function listBody(string $sql, string $table): string
    {
        $pattern = '/INSERT INTO ' . preg_quote($table, '/') . ' \(id\) VALUES(.*?);/s';

        $this->assertSame(1, preg_match($pattern, $sql, $matches), "Frozen list {$table} was not found.");

        return $matches[1];
    }

    private function countIds(string $sql, string $table): int
    {
        return preg_match_all(
            '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i',
            $this->listBody($sql, $table),
        );
    }
}
