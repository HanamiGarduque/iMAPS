<?php

namespace Tests\Unit;

use App\Models\SiteInspection;
use Tests\TestCase;

class Loop5CompletedInspectionImmutabilityTest extends TestCase
{
    public function test_completed_status_and_original_submission_time_are_terminal(): void
    {
        $inspection = new SiteInspection([
            'status' => 'completed',
            'submitted_at' => '2026-09-23 01:02:03',
        ]);
        $originalSubmittedAt = $inspection->getAttributes()['submitted_at'];

        $inspection->fill([
            'status' => 'in_progress',
            'submitted_at' => null,
            'findings' => 'Corrected evidence',
        ]);

        $this->assertSame('completed', $inspection->status);
        $this->assertSame($originalSubmittedAt, $inspection->getAttributes()['submitted_at']);
        $this->assertSame('Corrected evidence', $inspection->findings);
    }

    public function test_new_round_remains_independent_from_completed_round(): void
    {
        $roundOne = new SiteInspection([
            'zoning_application_id' => 132,
            'parcel_id' => 64,
            'status' => 'completed',
            'submitted_at' => '2026-09-23 01:02:03',
            'assigned_by_imaps_user_id' => 4,
            'assigned_by_name' => 'Jyerine Desunia',
            'findings' => 'Round 1 evidence',
        ]);
        $roundOne->id = 36;

        $roundTwo = $roundOne->newRound([
            'inspector_id' => 9,
            'scheduled_date' => '2026-09-25',
            'deadline_date' => '2026-09-27',
            'assigned_notes' => 'Loop 5 isolated round',
            'assigned_by_imaps_user_id' => 4,
            'assigned_by_name' => 'Jyerine Desunia',
        ]);

        $this->assertSame('completed', $roundOne->status);
        $this->assertSame('Round 1 evidence', $roundOne->findings);
        $this->assertSame('assigned', $roundTwo->status);
        $this->assertNull($roundTwo->submitted_at);
        $this->assertNull($roundTwo->findings);
        $this->assertNull($roundTwo->getKey());
    }

    public function test_pull_is_completed_only_round_specific_and_timestamp_preserving(): void
    {
        $source = file_get_contents(
            dirname(__DIR__, 2).'/app/Console/Commands/PullCompletedInspections.php'
        );

        $this->assertStringContainsString("['status' => 'eq.completed']", $source);
        $this->assertStringContainsString("SiteInspection::find(\$localInspectionId)", $source);
        $this->assertStringContainsString("'status'              => 'completed'", $source);
        $this->assertStringContainsString("\$localInspection->submitted_at", $source);
        $this->assertStringNotContainsString('whereHas', $source);
    }
}
