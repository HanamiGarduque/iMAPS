<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PreLoop3CleanupContractTest extends TestCase
{
    public function test_application_assignment_starts_as_assigned(): void
    {
        $source = $this->source('app/Http/Controllers/ApplicationController.php');
        $this->assertSame(1, preg_match_all("/'status'\s*=>\s*'assigned'/", $source));
        $this->assertDoesNotMatchRegularExpression("/'status'\s*=>\s*'Pending'/", $source);
    }

    public function test_all_technical_review_assignment_paths_start_as_assigned(): void
    {
        $source = $this->source('app/Http/Controllers/TechnicalReviewController.php');
        $this->assertSame(3, preg_match_all("/'status'\s*=>\s*'assigned'/", $source));
        $this->assertDoesNotMatchRegularExpression("/'status'\s*=>\s*'Pending'/", $source);
    }

    public function test_remote_reassignment_preserves_existing_lifecycle(): void
    {
        $source = $this->source('app/Jobs/PushInspectionToSupabase.php');
        $this->assertStringContainsString(
            "'status'                  => \$existingJob['status'] ?? 'assigned'",
            $source,
        );
    }

    public function test_user_management_ongoing_statistics_use_canonical_status(): void
    {
        $source = $this->source('app/Http/Controllers/UserManagementController.php');
        $this->assertStringContainsString("'in_progress' => \$jobs->where('status', 'in_progress')->count()", $source);
        $this->assertStringNotContainsString("\$jobs->where('status', 'in-progress')", $source);
    }

    public function test_parcel_inspection_status_uses_presentation_mapping(): void
    {
        $source = $this->source('resources/js/Components/ParcelInspectionStatus.jsx');
        foreach ([
            'assigned: "Pending"',
            'Pending: "Pending"',
            'in_progress: "Ongoing"',
            'completed: "Completed"',
        ] as $mapping) {
            $this->assertStringContainsString($mapping, $source);
        }
        $this->assertStringContainsString('getInspectionStatusLabel(inspection.status)', $source);
        $this->assertStringNotContainsString('<StatusBadge label={inspection.status}', $source);
    }

    public function test_site_inspection_remarks_are_absent_from_pull_model_api_and_ui(): void
    {
        $pull = $this->source('app/Console/Commands/PullCompletedInspections.php');
        $model = $this->source('app/Models/SiteInspection.php');
        $controller = $this->source('app/Http/Controllers/TechnicalReviewController.php');
        $component = $this->source('resources/js/Components/ParcelInspectionStatus.jsx');
        $api = $this->source('resources/js/utils/supabaseApi.js');

        foreach ([$pull, $model, $controller, $component, $api] as $source) {
            $this->assertStringNotContainsString("'remarks'", $source);
            $this->assertStringNotContainsString('inspection.remarks', $source);
            $this->assertStringNotContainsString('inspector_notes,remarks', $source);
        }
    }

    public function test_zoning_application_remarks_contract_remains_present(): void
    {
        $model = $this->source('app/Models/ZoningApplication.php');
        $controller = $this->source('app/Http/Controllers/ApplicationController.php');
        $this->assertStringContainsString("'remarks'", $model);
        $this->assertStringContainsString("'remarks'    => 'nullable|string'", $controller);
    }

    private function source(string $relativePath): string
    {
        $path = dirname(__DIR__, 2) . '/' . $relativePath;
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read {$path}");
        return $source;
    }
}
