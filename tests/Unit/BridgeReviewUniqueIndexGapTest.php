<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The standalone-bare-UNIQUE survivor (live defect, found 2026-10-02).
 *
 * WHAT HAPPENED
 * -------------
 * `2026_10_01_bridge_source_namespace_collision_fix_forward.sql` added
 * UNIQUE (bridge_source_id, technical_review_id) to `field_job_reviews` but did
 * not remove the pre-existing bare UNIQUE (technical_review_id).
 *
 * The cause is an object-type assumption. Section 6 dropped every survivor with
 *
 *     ALTER TABLE public.field_job_reviews DROP CONSTRAINT IF EXISTS <name>
 *
 * A PostgreSQL UNIQUE may be EITHER a constraint-backed object (present in
 * pg_constraint, dropped by DROP CONSTRAINT) OR a STANDALONE unique index
 * (absent from pg_constraint, dropped only by DROP INDEX). On this table it was
 * the second shape, and `IF EXISTS` suppressed the error, so the drop silently
 * did nothing.
 *
 * The composite therefore could never admit a second row for the same
 * technical_review_id - the bare index forbade it first - so the namespacing
 * was only half effective on this table. The table holds 0 rows, so the defect
 * is latent rather than active.
 *
 * These tests pin both halves of the fix: the future artifact must detect the
 * object type, and the live survivor must have a guarded corrective script.
 */
class BridgeReviewUniqueIndexGapTest extends TestCase
{
    private const FORWARD = 'database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql';

    private const CORRECTIVE = 'database/sql/2026_10_02_drop_field_job_reviews_bare_unique_index_after_namespace.sql';

    private const DRYRUN = 'database/sql/2026_10_01_bridge_source_namespace_dryrun.sql';

    // ==================================================================
    // TASK A - the future artifact detects the object type
    // ==================================================================

    public function test_the_forward_sql_no_longer_drops_everything_as_a_constraint(): void
    {
        $sql = $this->forward();

        // The defective form: DROP CONSTRAINT IF EXISTS can silently no-op
        // against a standalone index, which is exactly what shipped.
        $this->assertStringNotContainsString(
            'DROP CONSTRAINT IF EXISTS %I',
            $sql,
            'IF EXISTS silently swallows the miss against a standalone index. The object type '
            .'must be detected, so a drop is only issued when the object actually exists.',
        );
    }

    public function test_the_forward_sql_catalog_detects_the_object_type(): void
    {
        $sql = $this->forward();

        // pg_constraint is joined with a LEFT JOIN so a standalone index yields NULL.
        $this->assertStringContainsString(
            'LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname',
            $sql,
            'Object type must be detected from pg_constraint membership, not assumed from the name.',
        );
        $this->assertStringContainsString(
            '(k.oid IS NOT NULL)',
            $sql,
            'is_constraint must be derived from whether pg_constraint owns the object.',
        );
    }

    public function test_the_forward_sql_drops_each_shape_correctly(): void
    {
        $sql = $this->forward();

        $this->assertStringContainsString(
            'ALTER TABLE public.%I DROP CONSTRAINT %I',
            $sql,
            'A constraint-owned UNIQUE must be dropped with DROP CONSTRAINT.',
        );
        $this->assertStringContainsString(
            "EXECUTE format('DROP INDEX public.%I', v_idx);",
            $sql,
            'A standalone unique index must be dropped with DROP INDEX.',
        );
        $this->assertStringContainsString(
            'IF v_is_constraint THEN',
            $sql,
        );
    }

    public function test_the_forward_sql_verifies_each_survivor_is_gone(): void
    {
        $sql = $this->forward();

        // A drop that silently no-ops must be a HARD failure, not a notice.
        $this->assertStringContainsString(
            'still exists after the drop. The namespacing would be incomplete.',
            $sql,
            'A survivor that survives its drop must abort the whole apply.',
        );
        $this->assertStringContainsString(
            'v_still_there',
            $sql,
        );
    }

    public function test_the_forward_sql_still_excludes_primary_keys_from_the_drop(): void
    {
        $sql = $this->forward();

        // Detecting by object type must not broaden the target set: only a
        // single-column unique on the audited local-id column, never the PK.
        $this->assertStringContainsString('NOT i.indisprimary', $sql);
        $this->assertStringNotContainsString('DROP INDEX public.field_job_reviews_pkey', $sql);
    }

    // ==================================================================
    // The corrected forward SQL preserves every other contract
    // ==================================================================

    public function test_the_correction_did_not_disturb_the_other_contracts(): void
    {
        $sql = $this->forward();

        // Composite identities unchanged.
        foreach ([
            'field_jobs_bridge_source_id_local_inspection_id_key',
            'supabase_zoning_applications_bridge_local_application_id_key',
            'supabase_parcels_bridge_source_id_local_parcel_id_key',
            'field_job_reviews_bridge_source_id_technical_review_id_key',
        ] as $constraint) {
            $this->assertStringContainsString($constraint, $sql, "The composite {$constraint} must remain.");
        }

        // Source-id handling, backfill lists and transaction contract unchanged.
        $this->assertStringContainsString(":'bridge_source_id'", $sql);
        $this->assertStringContainsString('REFUSING TO RUN: psql variable bridge_source_id was not supplied', $sql);
        $this->assertStringContainsString('bridge_ns_field_jobs_a', $sql);
        $this->assertStringContainsString('bridge_ns_sza_a', $sql);
        $this->assertStringContainsString('bridge_ns_parcels_a', $sql);
        $this->assertStringContainsString("\set ON_ERROR_STOP on", $sql);
        $this->assertStringContainsString('BEGIN;', $sql);
        $this->assertStringContainsString('COMMIT;', $sql);

        // Trigger handling and preservation assertions unchanged.
        $this->assertStringContainsString('DISABLE TRIGGER trg_field_jobs_set_updated_at', $sql);
        $this->assertStringContainsString("v_ten IS NOT TRUE THEN", $sql);
        $this->assertStringContainsString('bridge_ns_field_jobs_before', $sql);
        $this->assertStringContainsString('failed the post-backfill preservation check', $sql);
    }

    // ==================================================================
    // The dry run reproduces BOTH shapes
    // ==================================================================

    public function test_the_dry_run_creates_the_standalone_index_shape(): void
    {
        $sql = $this->dryRun();

        // A UNIQUE (...) inside CREATE TABLE would be a CONSTRAINT and would not
        // exercise object-type detection at all. The standalone shape is the
        // whole point of this regression.
        $this->assertStringContainsString(
            'CREATE UNIQUE INDEX field_job_reviews_technical_review_id_key',
            $sql,
            'field_job_reviews must reproduce the live standalone-index shape.',
        );
        $this->assertStringNotContainsString(
            'UNIQUE (technical_review_id)   --',
            $sql,
            'The bare unique must be created as a standalone index, not inline in CREATE TABLE.',
        );
    }

    public function test_the_dry_run_drops_both_shapes_with_detection(): void
    {
        $sql = $this->dryRun();

        $this->assertStringContainsString('LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname', $sql);
        $this->assertStringContainsString("EXECUTE format('DROP INDEX %I.%I', 'bridge_ns_dryrun', v_idx);", $sql);
        $this->assertStringContainsString("EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', 'bridge_ns_dryrun', v_table, v_idx);", $sql);
        $this->assertStringContainsString('DRY RUN FAIL: % still exists on % after the drop', $sql);

        // Executable statements only: the dry run NAMES "DROP CONSTRAINT IF
        // EXISTS" in prose to explain why it is not used.
        $this->assertStringNotContainsString('DROP CONSTRAINT IF EXISTS', $this->executableSql($sql));
    }

    // ==================================================================
    // TASK B - the corrective artifact
    // ==================================================================

    public function test_the_corrective_artifact_exists_and_is_prepared_not_applied(): void
    {
        $sql = $this->corrective();

        $this->assertStringContainsString('PREPARED - NOT YET APPLIED', $sql);
        $this->assertStringContainsString('AWAITING EXPLICIT USER APPROVAL', $sql);
        $this->assertStringContainsString("\set ON_ERROR_STOP on", $sql);
        $this->assertStringContainsString('BEGIN;', $sql);
        $this->assertStringContainsString('COMMIT;', $sql);
    }

    public function test_the_corrective_asserts_every_required_precondition(): void
    {
        $sql = $this->corrective();

        $this->assertStringContainsString(
            'public.field_job_reviews does not exist',
            $sql,
            'The table must be asserted to exist.',
        );
        $this->assertStringContainsString(
            'bridge_source_id is absent or not text',
            $sql,
            'The namespace column must be asserted, proving the apply ran first.',
        );
        $this->assertStringContainsString(
            'has % row(s), expected 0',
            $sql,
            'Row count must be asserted 0; dropping uniqueness over live rows is a different decision.',
        );
        $this->assertStringContainsString(
            'composite UNIQUE (bridge_source_id, technical_review_id) is missing, not unique, or invalid',
            $sql,
            'The composite must be asserted present and valid BEFORE the bare index is removed.',
        );
        $this->assertStringContainsString(
            'the survivor is not the expected object',
            $sql,
        );
        $this->assertStringContainsString(
            'CREATE UNIQUE INDEX field_job_reviews_technical_review_id_key ON public.field_job_reviews USING btree (technical_review_id)',
            $sql,
            'The survivor must be matched against its exact definition.',
        );
        $this->assertStringContainsString(
            'IS a constraint, not a standalone index',
            $sql,
            'The standalone shape must be asserted, since that is the fact that made DROP CONSTRAINT a no-op.',
        );
        $this->assertStringContainsString(
            'the survivor is the PRIMARY KEY',
            $sql,
        );
    }

    public function test_the_corrective_mutates_exactly_one_object(): void
    {
        $sql = $this->corrective();

        $this->assertStringContainsString(
            'DROP INDEX public.field_job_reviews_technical_review_id_key;',
            $sql,
        );

        // Exactly one object, and nothing else is mutated. Scanned on executable
        // statements only, so the rollback comment cannot satisfy or break it.
        $code = $this->executableSql($sql);

        $this->assertSame(
            1,
            preg_match_all('/^\s*DROP INDEX public\./mi', $code),
            'Exactly one index may be dropped.',
        );
        $this->assertStringNotContainsString('DROP INDEX public.field_jobs', $code);
        $this->assertStringNotContainsString('DROP INDEX public.supabase_', $code);
        $this->assertStringNotContainsString('INSERT INTO', $code);
        $this->assertStringNotContainsString('DELETE FROM', $code);
        $this->assertStringNotContainsString('UPDATE ', $code);
        $this->assertStringNotContainsString('ALTER TABLE', $code);
    }

    public function test_the_corrective_verifies_every_postcondition(): void
    {
        $sql = $this->corrective();

        $this->assertStringContainsString('the survivor index still exists', $sql);
        $this->assertStringContainsString(
            'a bare UNIQUE on technical_review_id still exists',
            $sql,
            'No bare unique on the column may remain under ANY name.',
        );
        $this->assertStringContainsString('the composite UNIQUE was disturbed', $sql);
        $this->assertStringContainsString('field_job_reviews lost its primary key', $sql);
        $this->assertStringContainsString('field_job_reviews lost its foreign key', $sql);
        $this->assertStringContainsString('This script must never write', $sql);
    }

    public function test_the_corrective_will_not_silently_reintroduce_the_vulnerability(): void
    {
        $sql = $this->corrective();

        // Recreating the bare index must remain a documented, commented-out option
        // only. Matched at STATEMENT position, because the string also appears
        // inside a precondition as the exact pg_get_indexdef value being
        // compared against - which is a comparison, never an execution.
        $code = $this->executableSql($sql);

        $this->assertSame(
            0,
            preg_match_all('/^\s*CREATE\s+UNIQUE\s+INDEX/im', $code),
            'Recreating the bare index must remain a documented, commented-out option only.',
        );
        $this->assertStringContainsString(
            'REINTRODUCE the collision',
            $sql,
            'The rollback comment must state that restoring it reinstates the defect.',
        );
    }

    // ==================================================================
    // Helpers
    // ==================================================================

    private function forward(): string
    {
        return $this->read(self::FORWARD);
    }

    private function corrective(): string
    {
        return $this->read(self::CORRECTIVE);
    }

    private function dryRun(): string
    {
        return $this->read(self::DRYRUN);
    }

    private function read(string $relative): string
    {
        $path = dirname(__DIR__, 2) . '/' . $relative;

        $this->assertFileExists($path, "Missing artifact: {$relative}");

        $contents = (string) file_get_contents($path);
        $this->assertNotSame('', $contents, "Empty artifact: {$relative}");

        return $contents;
    }

    /**
     * `--` comment lines removed, so an assertion about what the script EXECUTES
     * cannot be satisfied or broken by its own explanatory prose.
     */
    private function executableSql(string $sql): string
    {
        return preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
    }
}