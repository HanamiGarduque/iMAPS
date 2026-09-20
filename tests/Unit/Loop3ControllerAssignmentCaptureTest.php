<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class Loop3ControllerAssignmentCaptureTest extends TestCase
{
    public function test_application_store_persists_assignment_instructions_and_provenance_for_site_inspection_assignments(): void
    {
        $source = $this->applicationControllerSource();

        $this->assertMatchesRegularExpression(
            "/'parcels\\.\\*\\.assigned_notes'\\s*=>\\s*'nullable\\|string'/",
            $source,
            'ApplicationController store must validate the per-parcel assignment instructions field.'
        );

        $this->assertMatchesRegularExpression(
            '/\'assigned_notes\'\s*=>\s*\$parcelData\[\'assigned_notes\'\]\s*\?\?\s*null/',
            $source,
            'ApplicationController store must persist assignment_instructions to the SiteInspection assignment notes field.'
        );

        $this->assertMatchesRegularExpression(
            '/\'assigned_by_imaps_user_id\'\s*=>\s*\$assigningOfficer\[\'id\'\]/',
            $source,
            'ApplicationController store must persist the authenticated Planning Officer user ID as the assigning actor.'
        );

        $this->assertMatchesRegularExpression(
            '/\'assigned_by_name\'\s*=>\s*\$assigningOfficer\[\'name\'\]/',
            $source,
            'ApplicationController store must persist the authenticated Planning Officer display name as the assigning actor.'
        );
    }

    public function test_technical_review_assignment_paths_persist_both_provenance_fields_before_dispatch(): void
    {
        $source = $this->technicalReviewControllerSource();

        $this->assertMatchesRegularExpression(
            '/\'assigned_by_imaps_user_id\'\s*=>\s*\$assigningOfficer\[\'id\'\]/',
            $source,
            'TechnicalReviewController assignment paths must persist the assigning officer user ID before dispatch.'
        );

        $this->assertMatchesRegularExpression(
            '/\'assigned_by_name\'\s*=>\s*\$assigningOfficer\[\'name\'\]/',
            $source,
            'TechnicalReviewController assignment paths must persist the assigning officer name before dispatch.'
        );

        $this->assertMatchesRegularExpression(
            '/PushInspectionToSupabase::dispatch\(\$inspection\);/',
            $source,
            'TechnicalReviewController assignment flows must dispatch after provenance has been persisted.'
        );
    }

    private function applicationControllerSource(): string
    {
        $path = dirname(__DIR__, 2) . '/app/Http/Controllers/ApplicationController.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");

        return $source;
    }

    private function technicalReviewControllerSource(): string
    {
        $path = dirname(__DIR__, 2) . '/app/Http/Controllers/TechnicalReviewController.php';
        $source = file_get_contents($path);
        $this->assertNotFalse($source, "Could not read $path");

        return $source;
    }
}
