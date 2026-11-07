<?php

namespace Tests\Feature;

use App\Models\TechnicalReview;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Support\RejectionReasons;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class RejectionReportsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private ZoningApplication $deniedApp1;
    private ZoningApplication $deniedApp2;
    private ZoningApplication $approvedApp;

    protected function setUp(): void
    {
        parent::setUp();

        $this->admin = User::factory()->create([
            'role' => 'Admin',
            'is_active' => true,
        ]);

        // 1. Create a denied application with Waterway Easement rejection
        $this->deniedApp1 = ZoningApplication::forceCreate([
            'reference_number' => 'ZC-2026-DENIED-1',
            'form_number' => 'F-001',
            'applicant_name' => 'Maria Santos',
            'contact_number' => '09171234567',
            'application_stream' => 'permit',
            'application_type' => 'Locational Clearance',
            'status' => 'Denied',
            'purpose' => 'Residential Construction',
            'barangay' => 'Alupay',
        ]);

        TechnicalReview::create([
            'zoning_application_id' => $this->deniedApp1->id,
            'reviewed_by' => $this->admin->id,
            'review_round' => 1,
            'decision' => 'Declined',
            'rejection_category' => RejectionReasons::CATEGORY_EASEMENT,
            'rejection_code' => RejectionReasons::EASEMENT_WATERWAY_VIOLATION,
            'decision_reason' => '[Environmental & Waterway Legal Easements - Waterway legal easement violation] Within 3m easement',
        ]);

        // 2. Create a denied application with Building Setback rejection
        $this->deniedApp2 = ZoningApplication::forceCreate([
            'reference_number' => 'ZC-2026-DENIED-2',
            'form_number' => 'F-002',
            'applicant_name' => 'Pedro Reyes',
            'contact_number' => '09179876543',
            'application_stream' => 'permit',
            'application_type' => 'Locational Clearance',
            'status' => 'Denied',
            'purpose' => 'Commercial Building',
            'barangay' => 'Namunga',
        ]);

        TechnicalReview::create([
            'zoning_application_id' => $this->deniedApp2->id,
            'reviewed_by' => $this->admin->id,
            'review_round' => 1,
            'decision' => 'Declined',
            'rejection_category' => RejectionReasons::CATEGORY_BUILDING,
            'rejection_code' => RejectionReasons::BUILDING_SETBACK_VIOLATION,
            'decision_reason' => '[Building Code & Spatial Standards - National Building Code setback non-compliance] Zero front yard',
        ]);

        // 3. Create an approved application
        $this->approvedApp = ZoningApplication::forceCreate([
            'reference_number' => 'ZC-2026-APPROVED-1',
            'form_number' => 'F-003',
            'applicant_name' => 'Ana Cruz',
            'contact_number' => '09181112222',
            'application_stream' => 'permit',
            'application_type' => 'Locational Clearance',
            'status' => 'For Release',
            'purpose' => 'Residential Fence',
            'barangay' => 'Alupay',
        ]);
    }

    /** @test */
    public function it_previews_rejections_grouped_by_rejection_category(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/analytics/report/preview', [
            'presentation_style' => 'horizontal_bar_chart',
            'group_by' => 'rejection_category',
            'aggregation' => 'count',
            'status' => 'Denied',
        ]);

        $response->assertOk()
            ->assertJsonPath('chartData.datasetLabel', 'Total Applications')
            ->assertJsonStructure([
                'headers',
                'rows',
                'chartData' => ['labels', 'data', 'datasetLabel'],
                'total_rows',
            ]);

        $labels = $response->json('chartData.labels');
        $this->assertContains(RejectionReasons::CATEGORY_EASEMENT, $labels);
        $this->assertContains(RejectionReasons::CATEGORY_BUILDING, $labels);
    }

    /** @test */
    public function it_previews_rejections_grouped_by_rejection_code(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/analytics/report/preview', [
            'presentation_style' => 'pie_chart',
            'group_by' => 'rejection_code',
            'aggregation' => 'count',
            'status' => 'Denied',
        ]);

        $response->assertOk();
        $labels = $response->json('chartData.labels');
        $this->assertContains('Waterway legal easement violation', $labels);
        $this->assertContains('National Building Code setback non-compliance', $labels);
    }

    /** @test */
    public function it_filters_applications_by_rejection_category(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/analytics/report/preview', [
            'presentation_style' => 'table',
            'variables' => ['reference_number', 'status', 'rejection_category', 'rejection_code'],
            'rejection_category' => RejectionReasons::CATEGORY_EASEMENT,
        ]);

        $response->assertOk();
        $rows = $response->json('rows');
        $this->assertCount(1, $rows);
        $this->assertSame('ZC-2026-DENIED-1', $rows[0][0]);
        $this->assertSame(RejectionReasons::CATEGORY_EASEMENT, $rows[0][3]);
    }

    /** @test */
    public function it_exports_csv_report_including_rejection_columns(): void
    {
        $response = $this->actingAs($this->admin)->postJson('/api/analytics/report', [
            'format' => 'csv',
            'status' => 'Denied',
            'variables' => ['reference_number', 'name', 'status', 'rejection_category', 'rejection_code', 'decision_reason'],
        ]);

        $response->assertOk();
        $csv = $response->streamedContent();

        $this->assertStringContainsString('Rejection Category', $csv);
        $this->assertStringContainsString('Rejection Reason', $csv);
        $this->assertStringContainsString('Decision Reason', $csv);
        $this->assertStringContainsString(RejectionReasons::CATEGORY_EASEMENT, $csv);
        $this->assertStringContainsString('Waterway legal easement violation', $csv);
        $this->assertStringContainsString('ZC-2026-DENIED-1', $csv);
    }

    /** @test */
    public function reports_index_page_supplies_rejection_categories_prop(): void
    {
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/reports'));

        $response = $this->actingAs($this->admin)->get('/reports', [
            'X-Inertia' => 'true',
            'X-Inertia-Version' => $version ?? '',
        ]);

        $response->assertOk();
        $this->assertSame('Reports/Index', $response->json('component'));
        $this->assertNotEmpty($response->json('props.barangays'));
        $this->assertContains(RejectionReasons::CATEGORY_EASEMENT, $response->json('props.rejectionCategories'));
    }
}
