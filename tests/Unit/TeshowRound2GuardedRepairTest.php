<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * The Teshow Round 2 guarded mapping repair (prepared 2026-10-02).
 *
 * WHAT IS BEING REPAIRED
 * ----------------------
 * Job `a761b17a-3fad-44ed-b451-7f0af0e41183` is APP-2026-00026 / local
 * application 132 / parcel 64 (Mavalor) Round 2. A second iMAPS environment
 * pushed its OWN local_inspection_id = 37 through ON CONFLICT
 * (local_inspection_id), resolved to this same remote row, and overwrote the six
 * writer-owned mapping columns with its own site's values.
 *
 * FieldSync-owned lifecycle survived, because FieldSync owns those columns and
 * the colliding writer does not write them: `status = in_progress`,
 * `current_step = 1`, `started_at`, `step_timestamps`, and an `activity_log`
 * row proving Renato / `ddcebeac` completed Step 1 at Mavalor.
 *
 * That is what made the corruption so quiet: the task existed, the inspector's
 * real work existed, and only the mapping pointed somewhere else.
 *
 * WHY THESE TESTS EXIST
 * ---------------------
 * This artifact will be applied by hand, once, to a live shared database. A
 * single wrong SET list entry would rewrite a real assignment, and a single
 * wrong guard would let a stale audit through. So the contract is pinned from
 * both ends: the values it must write, and the values it must refuse to touch.
 *
 * The assertions deliberately run against EXECUTABLE SQL, with `--` prose
 * stripped. An earlier revision of this artifact carried explanatory comments
 * naming every column it must not assign; a comment-driven check would have
 * passed on the very text it was meant to detect as wrong.
 */
class TeshowRound2GuardedRepairTest extends TestCase
{
    private const REPAIR = 'database/sql/2026_10_02_repair_teshow_round2_after_bridge_namespace.sql';

    private const TARGET = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    private const LOOP10 = '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999';

    private const SOURCE = 'rosario-imaps-local-0921-a';

    /**
     * The exact single-row UPDATE, isolated so a claim about its SET list
     * cannot be satisfied by a column mentioned anywhere else in the script.
     */
    private function updateStatement(): string
    {
        $sql = $this->executableSql($this->read());

        $this->assertSame(
            1,
            preg_match('/UPDATE\s+public\.field_jobs\s+SET(.*?)WHERE\s+id\s*=\s*\'' . self::TARGET . '\'\s*;/is', $sql, $m),
            'The artifact must contain exactly one UPDATE against the target primary key.'
        );

        return $m[1];
    }

    // ==================================================================
    // TASK 1 - exact target
    // ==================================================================

    public function test_targets_exactly_one_uuid(): void
    {
        $sql = $this->executableSql($this->read());

        $ids = [];
        if (preg_match_all("/(?<![A-Za-z0-9_])id\s*=\s*'([0-9a-f-]{36})'/i", $sql, $m)) {
            $ids = array_values(array_unique($m[1]));
        }

        $this->assertContains(self::TARGET, $ids, 'The repair must address the Teshow job uuid.');
        $this->assertContains(self::LOOP10, $ids, 'The Loop 10 guard must address its own job uuid.');

        // Nothing may target any other job row. A stray uuid in a WHERE clause
        // is how a one-row repair silently becomes a two-row repair.
        $stray = array_values(array_diff($ids, [self::TARGET, self::LOOP10]));
        $this->assertSame([], $stray, 'No uuid other than the target and the Loop 10 guard may appear in a WHERE clause.');
    }

    public function test_local_inspection_id_37_is_required_not_assumed(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('local_inspection_id', $sql);
        $this->assertStringContainsString('r.local_inspection_id <> 37', $sql, 'local_inspection_id 37 must be asserted.');
        $this->assertStringNotContainsString(
            'local_inspection_id = 37',
            $this->updateStatement(),
            'The UPDATE must key on the uuid alone; re-asserting the id in WHERE would be redundant with the precondition.'
        );
    }

    // ==================================================================
    // TASK 2 - exact BEFORE mapping, asserted not assumed
    // ==================================================================

    /**
     * @dataProvider corruptMappingProvider
     */
    public function test_before_mapping_is_asserted_exactly(string $column, string $corrupt): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            $corrupt,
            $sql,
            "The audited corrupt value for {$column} must be asserted as a precondition."
        );
    }

    public static function corruptMappingProvider(): array
    {
        return [
            'supabase_application_id' => ['supabase_application_id', '7a87a08d-6e8a-4943-8f4b-0a2ae242e09f'],
            'supabase_parcel_id'      => ['supabase_parcel_id', '2676c039-3a3a-4ad5-8ed9-c44208e0b9d7'],
            'assigned_inspector_id'   => ['assigned_inspector_id', 'c4e22f50-d3c3-4495-b3be-bd264da2e735'],
            'scheduled_date'          => ['scheduled_date', "date '2026-10-01'"],
            'deadline_date'           => ['deadline_date', "date '2026-10-03'"],
            'assignment_instructions' => ['assignment_instructions', "'ddd'"],
        ];
    }

    public function test_row_is_required_to_be_unclaimed_before_repair(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            'r.bridge_source_id IS NOT NULL',
            $sql,
            'An already-claimed row must be refused, so a re-run cannot silently re-map it.'
        );
    }

    public function test_hijack_timestamp_is_pinned_so_a_second_hijack_is_refused(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            "timestamptz '2026-10-01T02:45:13.120729+00:00'",
            $sql,
            'The audited updated_at must be pinned, so a row written again after the audit is refused.'
        );
    }

    public function test_original_assignment_provenance_is_asserted(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('r.assigned_by_imaps_user_id <> 4', $sql);
        $this->assertStringContainsString("r.assigned_by_name <> 'Jyerine Desunia'", $sql);
    }

    // ==================================================================
    // TASK 3 - exact AFTER mapping, and only that mapping
    // ==================================================================

    /**
     * @dataProvider repairedMappingProvider
     */
    public function test_after_mapping_is_written_exactly(string $column, string $expected): void
    {
        $set = $this->updateStatement();

        $this->assertMatchesRegularExpression(
            '/' . preg_quote($column, '/') . '\s*=\s*' . preg_quote($expected, '/') . '/i',
            $set,
            "{$column} must be written as {$expected}."
        );
    }

    public static function repairedMappingProvider(): array
    {
        return [
            'bridge_source_id'       => ['bridge_source_id', "'" . self::SOURCE . "'"],
            'supabase_application_id' => ['supabase_application_id', "'eaf432ea-8f26-4266-bf4b-ca88887ac470'"],
            'supabase_parcel_id'      => ['supabase_parcel_id', "'69bfaafb-a5e2-4871-b9d0-830ea0599b3f'"],
            'assigned_inspector_id'   => ['assigned_inspector_id', "'ddcebeac-2217-41c5-a6e2-d7f873db9af2'"],
            'scheduled_date'          => ['scheduled_date', "date '2026-09-23'"],
            'deadline_date'           => ['deadline_date', "date '2026-10-23'"],
            'assignment_instructions' => ['assignment_instructions', "'Loop 4 Round 2 reinspection E2E.'"],
        ];
    }

    public function test_exactly_seven_columns_are_written(): void
    {
        $set = $this->updateStatement();

        $assigned = [];
        if (preg_match_all('/^\s*([a-z_]+)\s*=/mi', $set, $m)) {
            $assigned = $m[1];
        }

        $this->assertCount(
            7,
            $assigned,
            'Exactly seven mapping columns may be written. Assigned: ' . implode(', ', $assigned)
        );

        $expected = [
            'bridge_source_id',
            'supabase_application_id',
            'supabase_parcel_id',
            'assigned_inspector_id',
            'scheduled_date',
            'deadline_date',
            'assignment_instructions',
        ];

        sort($expected);
        sort($assigned);
        $this->assertSame($expected, $assigned);
    }

    // ==================================================================
    // TASK 4 - forbidden assignments are absent from the SET list
    // ==================================================================

    /**
     * @dataProvider forbiddenAssignmentProvider
     */
    public function test_forbidden_columns_are_never_assigned(string $column, string $why): void
    {
        $set = $this->updateStatement();

        $this->assertDoesNotMatchRegularExpression(
            '/^\s*' . preg_quote($column, '/') . '\s*=/mi',
            $set,
            "{$column} must never be assigned by the repair: {$why}"
        );
    }

    public static function forbiddenAssignmentProvider(): array
    {
        $lifecycle = 'FieldSync owns the inspector progress; this repair must not move it.';

        return [
            'id'                       => ['id', 'the row identity must not change.'],
            'local_inspection_id'      => ['local_inspection_id', 'the bridge identity must not change.'],
            'created_at'               => ['created_at', $lifecycle],
            'status'                   => ['status', $lifecycle],
            'current_step'             => ['current_step', $lifecycle],
            'started_at'               => ['started_at', $lifecycle],
            'submitted_at'             => ['submitted_at', $lifecycle],
            'rework_started_at'        => ['rework_started_at', $lifecycle],
            'step_timestamps'          => ['step_timestamps', 'the real step evidence.'],
            'confirmed_latitude'       => ['confirmed_latitude', 'GPS is FieldSync-confirmed only; never written by a repair.'],
            'confirmed_longitude'      => ['confirmed_longitude', 'GPS is FieldSync-confirmed only; never written by a repair.'],
            'gps_accuracy_m'           => ['gps_accuracy_m', 'GPS is FieldSync-confirmed only; never written by a repair.'],
            'gps_confirmed_at'         => ['gps_confirmed_at', 'GPS is FieldSync-confirmed only; never written by a repair.'],
            'checklist_completed_count' => ['checklist_completed_count', 'the inspector progress, which may never be manufactured.'],
            'checklist_total_count'    => ['checklist_total_count', 'the inspector progress, which may never be manufactured.'],
            'checklist_data'           => ['checklist_data', 'the inspector progress, which may never be manufactured.'],
            'photo_count'              => ['photo_count', 'photo evidence.'],
            'photo_paths'              => ['photo_paths', 'photo evidence.'],
            'inspection_result'        => ['inspection_result', 'the inspector outcome.'],
            'is_compliant'             => ['is_compliant', 'the inspector outcome.'],
            'findings'                 => ['findings', 'the inspector outcome.'],
            'observations'             => ['observations', 'the inspector outcome.'],
            'discrepancies'            => ['discrepancies', 'the inspector outcome.'],
            'recommendations'          => ['recommendations', 'the inspector outcome.'],
            'inspector_notes'          => ['inspector_notes', 'the inspector outcome.'],
            'assigned_by_imaps_user_id' => ['assigned_by_imaps_user_id', 'the original assignment provenance is already correct.'],
            'assigned_by_name'         => ['assigned_by_name', 'the original assignment provenance is already correct.'],
        ];
    }

    // ==================================================================
    // TASK 5 - updated_at is never assigned by hand
    // ==================================================================

    public function test_updated_at_is_not_manually_assigned(): void
    {
        $this->assertDoesNotMatchRegularExpression(
            '/^\s*updated_at\s*=/mi',
            $this->updateStatement(),
            'updated_at must be left to trg_field_jobs_set_updated_at. Assigning it would forge the provenance of the repair.'
        );
    }

    public function test_updated_at_must_actually_advance(): void
    {
        $sql = $this->executableSql($this->read());

        // Not assigning it is only half the contract: the enabled trigger has
        // to move it, or the repair would be invisible in the row's history.
        $this->assertStringContainsString(
            'IF v_new <= v_old THEN',
            $sql,
            'The repair must assert that updated_at advanced.'
        );
        $this->assertStringContainsString('updated_at did not advance', $sql);
    }

    public function test_the_updated_at_trigger_is_never_disabled(): void
    {
        $sql = $this->executableSql($this->read());

        // The namespace backfill legitimately suspends the trigger because it
        // writes one column and nothing else. This repair is a real data change,
        // so touching the trigger here would destroy the repair's own audit trail.
        $this->assertDoesNotMatchRegularExpression(
            '/(DISABLE|ENABLE)\s+TRIGGER/i',
            $sql,
            'This repair must not enable or disable any trigger.'
        );
    }

    // ==================================================================
    // TASK 6 - whole-row preservation assertion
    // ==================================================================

    public function test_whole_row_preservation_assertion_is_present(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('to_jsonb(t) - ARRAY[', $sql, 'The before-row must be projected for comparison.');
        $this->assertStringContainsString('to_jsonb(j) - ARRAY[', $sql, 'The after-row must be projected for comparison.');
        $this->assertStringContainsString('PRESERVATION FAILED', $sql, 'A preservation difference must abort the transaction.');
    }

    public function test_preservation_projection_excludes_exactly_the_allowed_columns(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertSame(
            2,
            preg_match_all("/to_jsonb\([tj]\) - ARRAY\[(.*?)\]::text\[\]/is", $sql, $m),
            'Both the before and after projections must be built the same way.'
        );

        foreach ($m[1] as $projection) {
            $excluded = [];
            if (preg_match_all("/'([a-z_]+)'/i", $projection, $cm)) {
                $excluded = $cm[1];
            }

            sort($excluded);

            $this->assertSame([
                'assigned_inspector_id',
                'assignment_instructions',
                'bridge_source_id',
                'deadline_date',
                'scheduled_date',
                'supabase_application_id',
                'supabase_parcel_id',
                'updated_at',
            ], $excluded, 'The projection must exclude exactly the seven mapping columns plus updated_at.');
        }
    }

    public function test_preservation_comparison_uses_the_aliased_jsonb_columns(): void
    {
        $sql = $this->executableSql($this->read());

        // jsonb_each yields (key, value); the column-list alias AS b(k, v)
        // renames them. USING (key) raises
        // 'column "key" specified in USING clause does not exist in left table',
        // which aborted the artifact at the preservation check on the first
        // behavioural run. The join must name the aliased columns.
        $this->assertStringNotContainsString('USING (key)', $sql);
        $this->assertStringContainsString('ON b.k = a.k', $sql);
    }

    public function test_preservation_also_compares_the_whole_document(): void
    {
        $sql = $this->executableSql($this->read());

        // A per-key join only compares keys present on BOTH sides, so a column
        // that vanished from one snapshot would be compared against nothing.
        $this->assertStringContainsString('jsonb_object_keys', $sql, 'The two key sets must be proven identical.');
        $this->assertStringContainsString(
            'v_before::text IS DISTINCT FROM v_after::text',
            $sql,
            'The projected documents must be equal as text, not merely per key.'
        );
    }

    // ==================================================================
    // TASK 7 - dependent evidence guards
    // ==================================================================

    /**
     * @dataProvider evidenceTableProvider
     */
    public function test_dependent_evidence_is_snapshotted_and_recompared(string $table, string $alias, string $md5): void
    {
        $sql = $this->executableSql($this->read());

        $split = (int) strpos($sql, 'UPDATE public.field_jobs');
        $this->assertNotFalse($split, 'The UPDATE must be locatable so the script can be split around it.');

        $before = substr($sql, 0, $split);
        $after = substr($sql, $split);

        // Counted before the write...
        $this->assertStringContainsString($table, $before, "{$table} must be snapshotted before the UPDATE.");

        // ...and counted, and hashed, again after it.
        $this->assertStringContainsString($table, $after, "{$table} must be re-read after the UPDATE.");
        $this->assertStringContainsString(
            $md5,
            $after,
            "{$table} must be compared by content hash ({$md5}), not by count alone."
        );

        // The audited precondition count must still be pinned.
        $this->assertStringContainsString(
            "r.{$alias} <> ",
            $before,
            "The audited {$table} row count must be a precondition."
        );
    }

    public static function evidenceTableProvider(): array
    {
        return [
            'field_job_photos'  => ['field_job_photos', 'photos', 'photos_md5'],
            'field_job_reviews' => ['field_job_reviews', 'reviews', 'reviews_md5'],
            'activity_log'      => ['activity_log', 'activity', 'activity_md5'],
        ];
    }

    public function test_evidence_content_is_hashed_with_a_deterministic_order(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            "md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))",
            $sql,
            'Evidence must be hashed in a deterministic order, or the comparison is meaningless.'
        );
    }

    // ==================================================================
    // TASK 8 - Loop 10 guard, before and after
    // ==================================================================

    public function test_loop10_job_is_guarded_before_and_after(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('loop10_before', $sql, 'The Loop 10 row must be snapshotted before the repair.');
        $this->assertStringContainsString('LOOP 10 GUARD FAILED', $sql, 'A Loop 10 change must abort the repair.');

        // The guard is real only if it also checks the Loop 10 job's own identity
        // and step, not merely that the row exists.
        $this->assertStringContainsString("r.bridge_source_id <> '" . self::SOURCE . "'", $sql);
        $this->assertStringContainsString("r.status <> 'in_progress'", $sql);
        $this->assertStringContainsString('r.current_step <> 1', $sql);

        $this->assertStringContainsString(
            "(to_jsonb(b))::text IS DISTINCT FROM (to_jsonb(r))::text",
            $sql,
            'The Loop 10 row must be compared byte-for-byte, updated_at included.'
        );
    }

    public function test_loop10_resolution_count_is_asserted_afterwards(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            "bridge_source_id = '" . self::SOURCE . "' AND local_inspection_id = 37",
            $sql,
            'Exactly one row must resolve for the repaired bridge identity.'
        );
    }

    // ==================================================================
    // TASK 9 - transaction and rollback guards
    // ==================================================================

    public function test_the_whole_repair_is_one_transaction(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('BEGIN;', $sql);
        $this->assertStringContainsString('COMMIT;', $sql);
        $this->assertSame(
            1,
            substr_count($sql, 'BEGIN;'),
            'One transaction only: a second BEGIN would commit the mapping and the claim separately.'
        );
    }

    public function test_errors_stop_the_script(): void
    {
        $sql = $this->read();

        $this->assertStringContainsString(
            '\set ON_ERROR_STOP on',
            $sql,
            'Without ON_ERROR_STOP a failed guard would be reported as a clean run.'
        );
    }

    public function test_every_conditional_guard_raises_an_exception(): void
    {
        $sql = $this->executableSql($this->read());

        // Progress reporting with RAISE NOTICE is legitimate and is not what
        // this test forbids. What must never happen is a conditional guard that
        // only announces a bad state: under ON_ERROR_STOP the transaction would
        // sail on to COMMIT with the fault unreported.
        $this->assertGreaterThan(
            0,
            preg_match_all('/\bIF\b.*?\bTHEN\s+RAISE\s+(EXCEPTION|NOTICE|WARNING|INFO|DEBUG)/is', $sql, $m),
            'The artifact must contain conditional guards.'
        );

        foreach ($m[1] as $level) {
            $this->assertSame(
                'EXCEPTION',
                strtoupper($level),
                'A conditional guard must RAISE EXCEPTION so the transaction aborts.'
            );
        }
    }

    public function test_no_destructive_statement_is_present(): void
    {
        $sql = $this->executableSql($this->read());

        foreach (['DELETE', 'TRUNCATE', 'DROP TABLE', 'DROP COLUMN', 'INSERT INTO public.field_jobs'] as $forbidden) {
            $this->assertDoesNotMatchRegularExpression(
                '/^\s*' . preg_quote($forbidden, '/') . '\b/im',
                $sql,
                "The repair must never contain {$forbidden}."
            );
        }
    }

    public function test_no_row_count_is_hardcoded(): void
    {
        $sql = $this->executableSql($this->read());

        // An earlier revision asserted field_jobs held exactly 16 rows. That
        // would abort a correct repair if an unrelated job were created between
        // the audit and the apply, which teaches the operator to re-audit for no
        // reason. The count must come from this run's own snapshot.
        $this->assertStringContainsString('teshow_total_before', $sql, 'The row count must be snapshotted, not hardcoded.');
        $this->assertStringNotContainsString('expected 16', $sql);
    }

    public function test_row_count_claim_is_checked_against_the_snapshot(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString(
            'FROM teshow_total_before',
            $sql,
            'The no-rows-created-or-deleted postcondition must compare against the snapshot.'
        );
    }

    // ==================================================================
    // TASK 10 - every RAISE carries a matching placeholder
    // ==================================================================

    /**
     * PL/pgSQL raises "too many parameters specified for RAISE" when a format
     * string has fewer `%` placeholders than arguments. Under ON_ERROR_STOP that
     * aborts the transaction. It aborted this artifact at a progress message,
     * immediately after a successful write, on the first behavioural run.
     */
    public function test_raise_placeholders_match_argument_count(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertGreaterThan(
            0,
            preg_match_all('/RAISE\s+(EXCEPTION|NOTICE|WARNING|INFO|DEBUG)/i', $sql),
            'Expected RAISE statements in the artifact.'
        );

        // '' is an escaped quote inside a SQL literal, so a format may legitimately
        // contain quote pairs. A naive [^\']* would cut the string at the first
        // half of a pair and mis-count every argument behind it.
        $pattern = '/RAISE\s+(EXCEPTION|NOTICE|WARNING|INFO|DEBUG)\s+\'((?:[^\']|\'\')*)\'((?:\s*,\s*[a-z_][a-z0-9_.]*\s*)*)\s*;/is';

        $this->assertGreaterThan(0, preg_match_all($pattern, $sql, $matches, PREG_SET_ORDER));

        foreach ($matches as $m) {
            $format = $m[2];
            $args = trim($m[3] ?? '');

            // %% is an escaped literal percent, not a placeholder.
            $escaped = substr_count($format, '%%');
            $placeholders = (preg_match_all('/%/', $format) ?: 0) - $escaped;

            $argCount = $args === '' ? 0 : count(array_filter(
                array_map('trim', explode(',', $args)),
                fn ($a) => $a !== ''
            ));

            $this->assertSame(
                $placeholders,
                $argCount,
                "RAISE format '{$format}' has {$placeholders} placeholder(s) but {$argCount} argument(s). PL/pgSQL would abort the transaction."
            );
        }
    }

    public function test_update_row_count_is_read_in_the_same_block_that_issued_it(): void
    {
        $sql = $this->executableSql($this->read());

        // GET DIAGNOSTICS ROW_COUNT is scoped to the statement's own context, so
        // a DO block separate from the UPDATE always reads 0. The first
        // behavioural run reported 'the UPDATE affected 0 row(s)' and rolled back
        // a correct repair. The UPDATE must live inside the same DO block.
        $this->assertMatchesRegularExpression(
            '/DO\s+\$\$\s*(?:DECLARE[^;]*;)?\s*BEGIN\s+UPDATE\s+public\.field_jobs\s+SET.*?GET\s+DIAGNOSTICS\s+v_n\s*=\s*ROW_COUNT/is',
            $sql,
            'The UPDATE and its GET DIAGNOSTICS ROW_COUNT must be in the same DO block.'
        );
    }

    public function test_row_count_must_be_exactly_one(): void
    {
        $sql = $this->executableSql($this->read());

        $this->assertStringContainsString('IF v_n <> 1 THEN', $sql, 'The affected row count must be exactly one.');
    }

    // ==================================================================
    // TASK 11 - the repair is not yet applied
    // ==================================================================

    public function test_artifact_is_marked_not_yet_applied(): void
    {
        $sql = $this->read();

        $this->assertStringContainsString(
            'NOT YET APPLIED',
            $sql,
            'The artifact must still declare itself unapplied. Applying it by hand does not change this file.'
        );
    }

    public function test_artifact_does_not_claim_device_acceptance(): void
    {
        $sql = strtoupper($this->read());

        $this->assertStringNotContainsString('FIELD ACCEPTANCE COMPLETE', $sql);
        $this->assertStringNotContainsString('LOOP 10 CLOSED', $sql);
    }

    // ==================================================================
    // helpers
    // ==================================================================

    private function read(): string
    {
        $path = dirname(__DIR__, 2) . '/' . self::REPAIR;

        $this->assertFileExists($path, 'Missing artifact: ' . self::REPAIR);

        $contents = (string) file_get_contents($path);
        $this->assertNotSame('', $contents, 'Empty artifact: ' . self::REPAIR);

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
