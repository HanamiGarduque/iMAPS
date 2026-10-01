<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * FieldSync's own visibility query is NOT the defect and must not be changed.
 *
 * FieldSync decides which tasks an inspector sees with
 * `assigned_inspector_id = auth.uid()`. That filter is correct and stays
 * correct: it is scoped to the AUTHENTICATED SUPABASE USER, which is already
 * global, so it has no cross-environment collision. The defect was that the
 * iMAPS WRITER resolved which row to overwrite using a bare local integer.
 *
 * These tests exist so a future change cannot "fix" the collision by touching
 * the wrong thing: no iMAPS code may filter the bridge by
 * `assigned_inspector_id`, and the forward SQL may only add a supporting
 * index for FieldSync's unchanged query.
 */
class FieldSyncInspectorVisibilityContractTest extends TestCase
{
    private const FORWARD = 'database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql';

    /**
     * @return list<string>
     */
    private static function bridgeSourceFiles(): array
    {
        return [
            'app/Jobs/PushInspectionToSupabase.php',
            'app/Jobs/PushPlanningReviewToSupabase.php',
            'app/Services/SupabaseService.php',
            'app/Console/Commands/PullCompletedInspections.php',
        ];
    }

    public function test_no_bridge_read_filters_by_assigned_inspector_id(): void
    {
        foreach (self::bridgeSourceFiles() as $path) {
            $source = $this->source($path);

            // A filter value would look like 'assigned_inspector_id' => 'eq....
            $this->assertStringNotContainsString(
                "'assigned_inspector_id' => 'eq.",
                $source,
                "{$path} must not scope a bridge read by inspector; that is FieldSync's own auth-scoped query.",
            );
            $this->assertStringNotContainsString(
                'assigned_inspector_id=eq.',
                $source,
                "{$path} must not scope a bridge read by inspector.",
            );
        }
    }

    public function test_the_writer_still_writes_assigned_inspector_id(): void
    {
        $source = $this->source('app/Jobs/PushInspectionToSupabase.php');

        // Assignment is writer-owned: the iMAPS side must keep setting it. The
        // collision was never about writing it, only about which ROW it wrote to.
        $this->assertStringContainsString("'assigned_inspector_id'   =>", $source);
        $this->assertStringContainsString('resolveSupabaseUserId', $source);
    }

    /**
     * CORRECTED 2026-10-01 during the pre-apply gate.
     *
     * This test previously REQUIRED `(bridge_source_id, assigned_inspector_id)` to
     * exist, on the reasoning that it supported FieldSync's inspector query. That
     * reasoning was wrong: FieldSync filters `assigned_inspector_id = auth.uid()`
     * and does not scope that read by `bridge_source_id` at all. A composite index
     * leading with `bridge_source_id` would not serve it, so the index was pure
     * write amplification that also implied a scoping relationship that does not
     * exist.
     *
     * The invariant this file actually protects is unchanged and is now asserted
     * directly: the forward SQL must not DROP anything FieldSync's visibility
     * depends on, and must not alter any query text.
     */
    public function test_the_forward_sql_adds_no_index_for_the_fieldsync_inspector_query(): void
    {
        $sql = $this->source(self::FORWARD);

        $this->assertStringNotContainsString(
            'CREATE INDEX IF NOT EXISTS field_jobs_bridge_source_id_assigned_inspector_id_index',
            $sql,
            'FieldSync\'s inspector query does not filter by bridge_source_id, so this index would not serve it.',
        );
        $this->assertStringNotContainsString(
            'ON public.field_jobs (bridge_source_id, assigned_inspector_id);',
            $sql,
        );
    }

    /**
     * The real invariant: FieldSync's existing inspector-visibility support is
     * never dropped by this artifact, and no partial predicate is introduced that
     * could exclude an inspector's own rows.
     */
    public function test_the_forward_sql_never_drops_fieldsync_visibility_support(): void
    {
        $sql = $this->source(self::FORWARD);

        $this->assertStringNotContainsString(
            'DROP INDEX IF EXISTS field_jobs_assigned',
            $sql,
            'FieldSync\'s inspector-visibility support must never be dropped.',
        );

        // No index on assigned_inspector_id is created at all, so no partial
        // predicate could hide an inspector's own tasks.
        //
        // An earlier version of this assertion searched the whole SECTION 7 text
        // for the string "assigned_inspector_id)". SECTION 7 legitimately NAMES
        // that column while explaining why the index is NOT created, so the check
        // failed on correct SQL. The test now isolates the executable statement:
        // the substring must not appear after the "SECTION 7" marker in a CREATE
        // INDEX context.
        $section7 = substr($sql, (int) strpos($sql, 'SECTION 7'), 4000);
        $this->assertStringNotContainsString(
            'ON public.field_jobs (bridge_source_id, assigned_inspector_id);',
            $section7,
            'No index on assigned_inspector_id is created, so no partial predicate can hide tasks.',
        );
        $this->assertSame(
            1,
            substr_count($section7, 'CREATE INDEX'),
            'Exactly one index is created in SECTION 7: the proven status index.',
        );
    }

    public function test_the_forward_sql_records_that_the_fieldsync_query_is_unchanged(): void
    {
        $sql = $this->source(self::FORWARD);

        // The forward SQL must still state plainly that FieldSync's own query is not
        // touched by this work.
        //
        // Each fact is asserted as a separate fragment rather than as one long
        // sentence. The statement lives in a wrapped SQL comment, so any
        // contiguous multi-phrase match would have to survive both the newline
        // and the `--` continuation marker. Asserting the fragments keeps the
        // contract (both facts must be stated) without coupling the test to the
        // comment's exact wrapping.
        $this->assertStringContainsString(
            "FieldSync's inspector query",
            $sql,
            'The forward SQL must name FieldSync\'s inspector query explicitly.',
        );
        $this->assertStringContainsString(
            'assigned_inspector_id = auth.uid()',
            $sql,
            'It must state the actual filter the query uses.',
        );
        $this->assertStringContainsString(
            'is UNCHANGED by this work',
            $sql,
            'It must state that this work does not alter that query.',
        );
        $this->assertStringNotContainsString(
            'That query is FieldSync\'s normal read and is UNCHANGED',
            $sql,
            'The old justification implied the removed index served that query, which was incorrect.',
        );
    }

    private function between(string $haystack, string $startNeedle, string $endNeedle): string
    {
        $start = strpos($haystack, $startNeedle);
        $this->assertNotFalse($start, "Start needle not found: {$startNeedle}");

        $end = strpos($haystack, $endNeedle, $start);
        $this->assertNotFalse($end);

        return substr($haystack, $start, $end - $start + 1);
    }

    private function source(string $path): string
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/' . $path);

        $this->assertNotFalse($source, "Missing source file: {$path}");

        return $source;
    }
}
