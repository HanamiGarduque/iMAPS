<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PushInspectionToSupabaseStatusContractTest extends TestCase
{
    public function test_new_remote_job_uses_assigned_as_its_initial_status(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression(
            "/'status'\s*=>\s*'assigned'/",
            $source,
        );
        $this->assertStringNotContainsString(
            "'status'                  => \$existingJob['status'] ?? 'Pending'",
            $source,
        );
    }

    public function test_existing_remote_status_is_omitted_instead_of_echoed(): void
    {
        // The real-writer lifecycle matrix now lives in InspectionVisitDeliveryTest;
        // computing $existingJob['status'] inside a test never tested the writer.
        $source = $this->jobSource();
        $this->assertStringContainsString("unset(\$metadata['scheduled_date'], \$metadata['is_self_scheduled'], \$metadata['status'], \$metadata['deadline_date'])", $source);
        $this->assertStringNotContainsString("\$existingJob['status'] ??", $source);
    }

    private function jobSource(): string
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Jobs/PushInspectionToSupabase.php');

        $this->assertNotFalse($source);

        return $source;
    }
}
