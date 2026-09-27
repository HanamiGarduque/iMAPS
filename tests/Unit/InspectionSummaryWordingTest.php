<?php

namespace Tests\Unit;

use App\Support\InspectionSummary;
use Tests\TestCase;

/**
 * Admin/PO audit closure — Planning Officer inspection wording.
 *
 * These tests are the enforcement point for the documented business rule that
 * iMAPS can prove an inspection was ASSIGNED but cannot prove field progress.
 * They run without a database on purpose: the wording is a pure function of
 * locally provable state, so it must be testable without any live service.
 */
class InspectionSummaryWordingTest extends TestCase
{
    /**
     * The approved wording uses an em dash. It is written as an explicit Unicode
     * escape so this test file stays pure ASCII, matching the production class.
     */
    private const DASH = " \u{2014} ";

    private function inspection(string $status): object
    {
        return (object) ['status' => $status];
    }

    public function test_no_inspection_renders_no_line_at_all(): void
    {
        $this->assertNull(InspectionSummary::line(null));
        $this->assertNull(InspectionSummary::line(null, 'Renato Dimaculangan', 0));
    }

    public function test_single_assigned_round_names_the_inspector(): void
    {
        $this->assertSame(
            'Site inspection: Assigned to Renato Dimaculangan',
            InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 1)
        );
    }

    public function test_single_completed_round_is_reported_completed(): void
    {
        $this->assertSame(
            'Site inspection: Completed' . self::DASH . 'Renato Dimaculangan',
            InspectionSummary::line($this->inspection('completed'), 'Renato Dimaculangan', 1)
        );
    }

    /**
     * Test 9 + 10: the line may only use locally provable facts, and a local
     * assignment must NEVER be presented as field progress.
     */
    public function test_local_assignment_is_never_described_as_progress(): void
    {
        $forbidden = ['ongoing', 'in progress', 'in-progress', 'started', 'active', 'current step', 'gps', 'offline', 'queued'];

        foreach (['assigned', 'pending', 'in-progress', 'in_progress', 'ongoing', 'unknown-state'] as $status) {
            $line = strtolower((string) InspectionSummary::line($this->inspection($status), 'Renato Dimaculangan', 1));

            foreach ($forbidden as $word) {
                $this->assertStringNotContainsString(
                    $word,
                    $line,
                    "A locally '{$status}' inspection must not be described as '{$word}'."
                );
            }
        }
    }

    /**
     * Test 12: a second inspection row is a distinct REINSPECTION round, and the
     * round number is real business meaning rather than a technical detail.
     */
    public function test_multiple_rounds_are_reported_as_reinspection_with_round_number(): void
    {
        $this->assertSame(
            'Reinspection (Round 2): Assigned to Renato Dimaculangan',
            InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 2)
        );

        $this->assertSame(
            'Reinspection (Round 3): Completed' . self::DASH . 'Renato Dimaculangan',
            InspectionSummary::line($this->inspection('completed'), 'Renato Dimaculangan', 3)
        );
    }

    /**
     * A single row is never labelled a reinspection: Round 1 is the first
     * inspection, not a re-inspection of anything.
     */
    public function test_single_round_is_never_labelled_reinspection(): void
    {
        $this->assertStringNotContainsString(
            'Reinspection',
            (string) InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 1)
        );
    }

    /**
     * Test 11: the inspector name is displayed when the relation is loaded, and
     * its absence must not produce a dangling "to " fragment.
     */
    public function test_inspector_name_is_used_when_present_and_omitted_cleanly_when_not(): void
    {
        $this->assertStringContainsString(
            'Renato Dimaculangan',
            (string) InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 1)
        );

        $this->assertStringContainsString(
            'Renato Dimaculangan',
            (string) InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 2)
        );

        foreach ([null, '', '   '] as $missing) {
            $single = (string) InspectionSummary::line($this->inspection('assigned'), $missing, 1);
            $this->assertSame('Site inspection: Assigned', $single);
            $this->assertStringNotContainsString('to  ', $single);
            $this->assertStringEndsWith('Assigned', $single);

            $reinspection = (string) InspectionSummary::line($this->inspection('assigned'), $missing, 2);
            $this->assertSame('Reinspection (Round 2): Assigned', $reinspection);
            $this->assertStringEndsWith('Assigned', $reinspection);
        }
    }

    /**
     * The separator follows the state, not the round count: an open round reads
     * "Assigned to <Inspector>" and a completed one "Completed - <Inspector>".
     * Round count must not leak into the separator.
     */
    public function test_separator_follows_state_not_round_count(): void
    {
        $this->assertStringContainsString(
            'Assigned to Renato',
            (string) InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 1)
        );
        $this->assertStringContainsString(
            'Assigned to Renato',
            (string) InspectionSummary::line($this->inspection('assigned'), 'Renato Dimaculangan', 2)
        );
        $this->assertStringContainsString(
            'Completed' . self::DASH . 'Renato',
            (string) InspectionSummary::line($this->inspection('completed'), 'Renato Dimaculangan', 1)
        );
        $this->assertStringContainsString(
            'Completed' . self::DASH . 'Renato',
            (string) InspectionSummary::line($this->inspection('completed'), 'Renato Dimaculangan', 2)
        );
    }

    public function test_status_matching_is_case_and_whitespace_tolerant(): void
    {
        $this->assertSame(
            'Site inspection: Completed — Renato Dimaculangan',
            InspectionSummary::line($this->inspection('  COMPLETED '), 'Renato Dimaculangan', 1)
        );
    }

    public function test_missing_status_is_treated_conservatively_as_assigned(): void
    {
        $inspection = (object) [];
        $this->assertSame(
            'Site inspection: Assigned to Renato Dimaculangan',
            InspectionSummary::line($inspection, 'Renato Dimaculangan', 1)
        );
    }
}
