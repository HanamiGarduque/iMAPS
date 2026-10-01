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

    public function test_the_forward_sql_only_adds_a_supporting_index_for_the_fieldsync_query(): void
    {
        $sql = $this->source(self::FORWARD);

        $this->assertStringContainsString(
            'CREATE INDEX IF NOT EXISTS field_jobs_bridge_source_id_assigned_inspector_id_index',
            $sql,
        );
        $this->assertStringContainsString('ON public.field_jobs (bridge_source_id, assigned_inspector_id);', $sql);

        // The index must not REPLACE anything FieldSync depends on, and must not
        // carry a partial predicate that would exclude an inspector's own rows.
        $this->assertStringNotContainsString(
            'DROP INDEX IF EXISTS field_jobs_assigned',
            $sql,
            'FieldSync\'s inspector-visibility support must never be dropped.',
        );

        $indexDefinition = $this->between(
            $sql,
            'CREATE INDEX IF NOT EXISTS field_jobs_bridge_source_id_assigned_inspector_id_index',
            ';',
        );
        $this->assertStringNotContainsString('WHERE', $indexDefinition);
    }

    public function test_the_forward_sql_records_that_the_fieldsync_query_is_unchanged(): void
    {
        $sql = $this->source(self::FORWARD);

        $this->assertStringContainsString(
            'That query is FieldSync\'s normal read and is UNCHANGED',
            $sql,
        );
        $this->assertStringContainsString('No query text is altered', $sql);
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
