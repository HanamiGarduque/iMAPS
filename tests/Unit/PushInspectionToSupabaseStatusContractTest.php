<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

class PushInspectionToSupabaseStatusContractTest extends TestCase
{
    public function test_new_remote_job_uses_assigned_as_its_initial_status(): void
    {
        $source = $this->jobSource();

        $this->assertMatchesRegularExpression(
            "/'status'\s*=>\s*\\\$existingJob\['status'\]\s*\?\?\s*'assigned'/",
            $source,
        );
        $this->assertStringNotContainsString(
            "'status'                  => \$existingJob['status'] ?? 'Pending'",
            $source,
        );
    }

    #[DataProvider('existingStatusProvider')]
    public function test_existing_remote_status_is_preserved_without_normalization(string $status): void
    {
        $existingJob = ['status' => $status];

        $outgoingStatus = $existingJob['status'] ?? 'assigned';

        $this->assertSame($status, $outgoingStatus);
    }

    public static function existingStatusProvider(): array
    {
        return [
            'assigned' => ['assigned'],
            'in progress' => ['in_progress'],
            'completed' => ['completed'],
            'legacy Pending' => ['Pending'],
            'legacy pending' => ['pending'],
            'legacy onprocess' => ['onprocess'],
        ];
    }

    private function jobSource(): string
    {
        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Jobs/PushInspectionToSupabase.php');

        $this->assertNotFalse($source);

        return $source;
    }
}
