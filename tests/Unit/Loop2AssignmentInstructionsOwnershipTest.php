<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Loop 2 Part 1 — Phase C contract tests.
 *
 * Proves:
 *   1. assigned_notes maps to assignment_instructions in the upsert payload.
 *   2. The upsert payload does NOT contain inspector_notes.
 *   3. Remote inspector_notes is never overwritten on retry
 *      (iMAPS omits the field entirely from its payload).
 *   4. Remote status preservation (Loop 1 contract) remains intact.
 *
 * All assertions are pure source-text / data-logic checks.
 * No live Supabase mutation.
 */
class Loop2AssignmentInstructionsOwnershipTest extends TestCase
{
    // ── 1. assigned_notes maps to assignment_instructions ─────────────────────

    public function test_assigned_notes_maps_to_assignment_instructions_in_payload(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression(
            "/'assignment_instructions'\s*=>\s*\\\$this->inspection->assigned_notes/",
            $source,
            'assignment_instructions must be populated from inspection->assigned_notes',
        );
    }

    // ── 2. Payload does NOT write inspector_notes ──────────────────────────────

    public function test_payload_does_not_contain_inspector_notes_key(): void
    {
        $source = $this->jobSource();

        // The key must not appear in the $jobPayload array literal.
        // We allow it in comments and in PullCompletedInspections, but
        // PushInspectionToSupabase must not include 'inspector_notes' as a
        // payload key.
        $payloadPattern = "/'inspector_notes'\s*=>/";
        $this->assertDoesNotMatchRegularExpression(
            $payloadPattern,
            $source,
            'PushInspectionToSupabase must not write inspector_notes in the upsert payload',
        );
    }

    // ── 3. Inspector notes field is entirely absent from the iMAPS upsert ─────
    //     (absence == safe retry: Supabase upsert only touches supplied keys)

    public function test_inspector_notes_is_absent_from_push_job_so_remote_value_is_preserved_on_retry(): void
    {
        $source = $this->jobSource();

        // Confirm iMAPS does not set inspector_notes to null or any value.
        $nullPattern = "/'inspector_notes'\s*=>\s*null/";
        $this->assertDoesNotMatchRegularExpression(
            $nullPattern,
            $source,
            'PushInspectionToSupabase must not explicitly null out inspector_notes',
        );
    }

    // ── 4. Remote status preservation (Loop 1 regression guard) ───────────────

    public function test_existing_remote_status_is_preserved_not_reset_on_retry(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression(
            "/'status'\s*=>\s*\\\$existingJob\['status'\]\s*\?\?\s*'assigned'/",
            $source,
            'Status must fall back to assigned only when no remote row exists',
        );
    }

    public function test_status_does_not_default_to_Pending_casing(): void
    {
        $source = $this->jobSource();

        $this->assertStringNotContainsString(
            "'status'                  => \$existingJob['status'] ?? 'Pending'",
            $source,
        );
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private function jobSource(): string
    {
        $path = dirname(__DIR__, 2) . '/app/Jobs/PushInspectionToSupabase.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");
        return $source;
    }
}
