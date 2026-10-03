<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Loop 9A-R â€” exact legacy delivery failure reconciliation (inspections 25-30).
 *
 * This is a DATA-ONLY reconciliation of the existing 0921 database. It is
 * deliberately NOT a migration and must never appear in fresh-install
 * behaviour: a fresh database has no historical inspections 25-30.
 *
 * These tests assert the safety properties of the patch artifact itself, so the
 * reconciliation cannot silently widen into a range delete, a resend, an
 * ownership inference, or a fresh seed step.
 */
class Loop9arLegacyDeliveryReconciliationContractTest extends TestCase
{
    private const PATCH = 'database/sql/2026_09_28_reconcile_legacy_delivery_failures_25_30.sql';

    private function patchSql(): string
    {
        return (string) file_get_contents(base_path(self::PATCH));
    }

    private function flat(string $text): string
    {
        return (string) preg_replace('/\s+/', ' ', $text);
    }

    /**
     * Executable SQL only. The patch's own header legitimately *names* every
     * mechanism it refuses to use, so an "absent" assertion must be evaluated
     * against statements rather than prose.
     */
    private function statements(string $text): string
    {
        $text = (string) preg_replace('/--[^\n]*/', '', $text);

        return $this->flat((string) preg_replace('/\/\*.*?\*\//s', '', $text));
    }

    // ------------------------------------------------------------------
    // Exact-target safety.
    // ------------------------------------------------------------------

    public function test_targets_are_exactly_the_six_named_ids(): void
    {
        $flat = $this->flat($this->patchSql());

        $this->assertStringContainsString('id IN (25, 26, 27, 28, 29, 30)', $flat);
    }

    public function test_no_broad_or_range_predicate_is_used(): void
    {
        $sql = $this->statements($this->patchSql());

        // The MUTATION must name exact ids only. The read-only guards may
        // legitimately use BETWEEN to prove the protected 3-21/24 group is
        // untouched, so the rule is scoped to the two mutating statements.
        preg_match('/INSERT INTO public\.inspection_delivery_attempts.*?;/s', $sql, $ins);
        preg_match('/UPDATE public\.site_inspections\s+SET.*?;/s', $sql, $upd);
        $mutation = trim(($ins[0] ?? '') . ' ' . ($upd[0] ?? ''));
        $update = $upd[0] ?? '';

        $this->assertNotSame('', $mutation, 'Failed to locate the mutating statements.');

        $this->assertStringNotContainsString('BETWEEN', $mutation);
        $this->assertStringNotContainsString('id >=', $mutation);
        $this->assertStringNotContainsString('id <=', $mutation);
        $this->assertStringNotContainsString('created_at <', $mutation);
        $this->assertStringNotContainsString('failed_at <', $mutation);
        $this->assertStringNotContainsString('inspector_id = 25', $mutation);
        // `delivery_status =` legitimately contains "status =", so the lifecycle
        // column is matched in the form it would actually be written.
        $this->assertStringNotContainsString('SET status', $mutation);
        $this->assertStringNotContainsString('SET inspector_id', $mutation);
        $this->assertStringNotContainsString('SET parcel_id', $mutation);
        $this->assertStringNotContainsString('SET assigned_notes', $mutation);
        $this->assertStringNotContainsString('SET zoning_application_id', $mutation);

        // The exact six-id predicate is the only target selector used.
        $this->assertStringContainsString('WHERE id IN (25, 26, 27, 28, 29, 30)', $update);
    }

    public function test_patch_is_not_a_fresh_install_migration(): void
    {
        $this->assertFileDoesNotExist(
            base_path('database/migrations/2026_09_28_reconcile_legacy_delivery_failures_25_30.php')
        );

        $flat = $this->flat($this->patchSql());
        $this->assertStringContainsString('NOT a migration', $flat);
        $this->assertStringContainsString('NEVER be added to seed/migration behaviour', $flat);
    }

    public function test_patch_contains_no_schema_change(): void
    {
        $flat = $this->flat($this->patchSql());

        foreach (['CREATE TABLE', 'ALTER TABLE', 'ADD COLUMN', 'DROP ', 'TRUNCATE', 'CREATE INDEX'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $flat);
        }
    }

    // ------------------------------------------------------------------
    // No resend / no dispatch / no ownership inference.
    // ------------------------------------------------------------------

    public function test_patch_contains_no_resend_or_dispatch_mechanism(): void
    {
        $sql = $this->statements($this->patchSql());

        foreach ([
            'PushInspectionToSupabase',
            'dispatch(',
            'Http::',
            'curl',
            'supabase.co',
            'rest/v1',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $sql);
        }
    }

    public function test_patch_never_writes_planning_officer_ownership(): void
    {
        $sql = $this->statements($this->patchSql());

        $this->assertStringNotContainsString('assigned_planning_officer_id', $sql);
        $this->assertStringNotContainsString('encoded_by', $sql);
        $this->assertStringNotContainsString('application_po_assignments', $sql);
        $this->assertStringNotContainsString('zoning_applications', $sql);
    }

    public function test_patch_never_touches_failed_jobs(): void
    {
        $flat = $this->flat($this->patchSql());

        $this->assertStringNotContainsString('DELETE FROM failed_jobs', $flat);
        $this->assertStringNotContainsString('UPDATE failed_jobs', $flat);
        $this->assertStringNotContainsString('TRUNCATE failed_jobs', $flat);
    }

    public function test_patch_does_not_modify_inspection_lifecycle_columns(): void
    {
        $flat = $this->flat($this->patchSql());

        // Only the four Loop 9A delivery columns may appear in the SET clause.
        $this->assertStringContainsString('SET delivery_status', $flat);
        $this->assertStringContainsString('last_delivery_attempt_at', $flat);
        $this->assertStringContainsString('last_delivery_failure_category =', $flat);
        $this->assertStringNotContainsString('SET status', $flat);
        $this->assertStringNotContainsString('SET inspector_id', $flat);
        $this->assertStringNotContainsString('SET parcel_id', $flat);
        $this->assertStringNotContainsString('SET assigned_notes', $flat);
    }

    // ------------------------------------------------------------------
    // Recorded values.
    // ------------------------------------------------------------------

    public function test_every_attempt_row_uses_the_approved_vocabulary(): void
    {
        $flat = $this->flat($this->patchSql());

        // Six explicit attempt rows.
        $this->assertSame(6, substr_count($flat, "'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved'"));

        $this->assertStringContainsString("'legacy_reconciliation'", $flat);
        $this->assertStringContainsString("'inspector_mapping_unresolved'", $flat);
    }

    public function test_delivered_at_is_explicitly_left_null(): void
    {
        $this->assertStringContainsString('delivered_at                   = NULL', $this->patchSql());
    }

    public function test_historical_timestamps_are_explicit_not_computed(): void
    {
        $flat = $this->flat($this->patchSql());

        // The six mapped failed_at values must be literal, so a reconciliation
        // run can never stamp "now" into a historical record.
        foreach ([
            '2026-09-11 00:51:31',
            '2026-09-11 18:24:56',
            '2026-09-11 18:29:47',
            '2026-09-11 19:17:36',
            '2026-09-11 19:25:40',
            '2026-09-11 19:29:48',
        ] as $stamp) {
            $this->assertStringContainsString($stamp, $flat);
        }

        $this->assertStringNotContainsString('now()', $flat);
        $this->assertStringNotContainsString('CURRENT_TIMESTAMP', $flat);
    }

    public function test_created_at_is_not_backdated(): void
    {
        $flat = $this->flat($this->patchSql());

        // created_at is intentionally absent from the INSERT column list so the
        // schema default records the real insertion time.
        $this->assertStringNotContainsString("'created_at'", $flat);
        $this->assertStringContainsString('created_at keeps', $flat);
    }

    public function test_safe_message_is_normalized_and_leaks_nothing(): void
    {
        $patch = $this->patchSql();
        $sql = $this->statements($patch);

        $this->assertStringContainsString(
            'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile',
            $patch
        );

        // Nothing sensitive may appear in the executable statements, which is
        // where the stored safe_message literal lives.
        foreach ([
            '/home/nami',
            'handshake_key',
            'Bearer',
            'apikey',
            'eyJ',
            'supabase.co',
            'Stack trace',
            'Exception:',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $sql);
        }
    }

    // ------------------------------------------------------------------
    // Guards and post-assertions.
    // ------------------------------------------------------------------

    public function test_preconditions_are_guarded_and_abort_the_transaction(): void
    {
        $flat = $this->flat($this->patchSql());

        $this->assertStringContainsString('BEGIN;', $flat);
        $this->assertStringContainsString('COMMIT;', $flat);

        // Five pre-guards: existence, no existing state, no existing attempts,
        // protected rows clean, attempt number free.
        $this->assertSame(5, substr_count($flat, 'GUARD FAIL'));

        // Post-assertions, including the protected and matched groups.
        $this->assertStringContainsString('POST FAIL', $flat);
        $this->assertStringContainsString('pre-bridge inspections (3-21,24) were modified', $flat);
        $this->assertStringContainsString('already-matched inspections were given fabricated delivery history', $flat);
    }

    public function test_history_limitation_is_documented_in_the_artifact(): void
    {
        $flat = $this->flat($this->patchSql());

        // attempt_number = 1 must not be read as "Laravel tried once".
        $this->assertStringContainsString('ONE reconstructed business-level terminal delivery', $flat);
        $this->assertStringContainsString('does NOT mean Laravel', $flat);
        $this->assertStringContainsString('automatic-retry', $flat);
        $this->assertStringContainsString('inferred or fabricated', $flat);
    }

    public function test_supabase_and_fieldsync_are_declared_untouched(): void
    {
        $flat = $this->flat($this->patchSql());

        $this->assertStringContainsString('No Supabase, Storage, RLS, or FieldSync mutation', $flat);
    }
}
