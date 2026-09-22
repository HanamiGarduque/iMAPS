<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PullCompletedInspectionsContractTest extends TestCase
{
    private string $source;

    protected function setUp(): void
    {
        parent::setUp();
        $this->source = file_get_contents(
            dirname(__DIR__, 2).'/app/Console/Commands/PullCompletedInspections.php'
        );
    }

    public function test_command_keeps_completed_filter_and_supports_a_bounded_local_id(): void
    {
        $this->assertStringContainsString('{--local-inspection-id=', $this->source);
        $this->assertStringContainsString("['status' => 'eq.completed']", $this->source);
        $this->assertStringContainsString("['local_inspection_id'] = 'eq.'.(int) \$localInspectionId", $this->source);
    }

    public function test_non_positive_or_non_integer_local_id_is_rejected_before_fetch(): void
    {
        $guard = strpos($this->source, 'ctype_digit((string) $localInspectionId)');
        $fetch = strpos($this->source, "\$supabase->select('field_jobs'");

        $this->assertNotFalse($guard);
        $this->assertNotFalse($fetch);
        $this->assertLessThan($fetch, $guard);
        $this->assertStringContainsString('(int) $localInspectionId <= 0', $this->source);
        $this->assertStringContainsString('return self::INVALID;', $this->source);
    }
}
