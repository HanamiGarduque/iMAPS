<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\ReportingTestCase;

class ReportsAndSupportTest extends ReportingTestCase
{
    private function page(string $url)
    {
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create($url));
        return $this->get($url, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version ?? '']);
    }

    public function test_admin_both_types_legacy_links_and_counts(): void
    {
        $this->actingAs($this->admin);
        $this->page('/diagnostics')->assertOk()->assertJsonPath('props.counts.technical_issue', 1)
            ->assertJsonPath('props.counts.application_support', 1)->assertJsonPath('props.reports.0.reference_code', 'DR-2026-0001');
        $this->page('/diagnostics?type=application_support')->assertOk()->assertJsonPath('props.reports.0.context.owner.name', 'Current PO');
        $this->page('/diagnostics/'.self::LEGACY)->assertOk()->assertJsonPath('props.report.report_type', 'technical_issue')->assertJsonPath('props.canNotify', false);
        $this->page('/diagnostics/'.self::REPORT)->assertOk()->assertJsonPath('props.canNotify', true);
        $this->page('/diagnostics/not-a-uuid')->assertNotFound();
    }

    public function test_po_never_receives_technical_metadata_and_foreign_support_is_forbidden(): void
    {
        $this->actingAs($this->po);
        $response = $this->page('/diagnostics')->assertOk()->assertJsonPath('props.allowedTypes', ['application_support'])
            ->assertJsonPath('props.counts', ['application_support' => 1])->assertJsonCount(1, 'props.reports');
        $this->assertStringNotContainsString('Legacy GPS issue', $response->getContent());
        $this->assertStringNotContainsString('technical_issue', $response->getContent());
        $this->page('/diagnostics?type=technical_issue')->assertForbidden();
        $this->page('/diagnostics/'.self::LEGACY)->assertForbidden();
        $this->page('/diagnostics/'.self::REPORT)->assertOk()->assertJsonPath('props.canNotify', false)->assertJsonPath('props.escalation', null);
        DB::table('zoning_applications')->where('id', 1)->update(['assigned_planning_officer_id' => $this->other->id]);
        $this->page('/diagnostics/'.self::REPORT)->assertForbidden();
        $this->page('/diagnostics?type=application_support&application='.self::APP.'&page=99')->assertOk()
            ->assertJsonCount(0, 'props.reports')->assertJsonPath('props.counts.application_support', 0)->assertJsonPath('props.pagination.total', 0);
    }

    public function test_inspector_web_routes_are_denied(): void
    {
        $this->actingAs($this->user('Site Inspector', 'Inspector'));
        $this->page('/diagnostics')->assertForbidden();
        $this->page('/diagnostics/'.self::REPORT)->assertForbidden();
        $this->post('/diagnostics/'.self::REPORT.'/notify-planning-officers')->assertForbidden();
    }

    public function test_unresolved_support_is_admin_visible_but_not_notifiable_or_po_visible(): void
    {
        $this->remote['field_jobs'] = [];
        $this->actingAs($this->admin);
        $this->page('/diagnostics/'.self::REPORT)->assertOk()->assertJsonPath('props.context.resolved', false)
            ->assertJsonPath('props.context.message', 'Application context unavailable')->assertJsonPath('props.canNotify', false);
        $this->actingAs($this->po);
        $this->page('/diagnostics/'.self::REPORT)->assertForbidden();
    }

    public function test_retained_support_and_unowned_support(): void
    {
        $this->remote['diagnostic_reports'][0]['field_job_id'] = null;
        $this->actingAs($this->po);
        $this->page('/diagnostics/'.self::REPORT)->assertOk()->assertJsonPath('props.context.origin.id', null);
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => null]);
        $this->actingAs($this->admin);
        $this->page('/diagnostics/'.self::REPORT)->assertOk()->assertJsonPath('props.context.owner', null)->assertJsonPath('props.canNotify', false);
    }

    public function test_notification_post_re_resolves_owner_and_rejects_technical_and_po(): void
    {
        $url = '/diagnostics/'.self::REPORT.'/notify-planning-officers';
        $this->actingAs($this->po)->post($url)->assertForbidden();
        $this->actingAs($this->admin)->post('/diagnostics/'.self::LEGACY.'/notify-planning-officers')->assertForbidden();
        $this->page('/diagnostics/'.self::REPORT)->assertJsonPath('props.context.owner.name', 'Current PO');
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->other->id]);
        $this->post($url, ['recipient_id' => $this->po->id])->assertRedirect()->assertSessionHas('success', 'Notified Next PO.');
        $this->assertSame([$this->other->id], DB::table('notifications')->pluck('user_id')->all());
    }

    public function test_pagination_and_status_filters_apply_after_ownership_scope(): void
    {
        $this->remote['diagnostic_reports'] = [$this->technical()];
        for ($i = 1; $i <= 25; $i++) {
            $this->remote['diagnostic_reports'][] = $this->support(['id' => sprintf('30000000-0000-4000-8000-%012d', $i)]);
        }
        $this->remote['diagnostic_reports'][] = $this->support(['id' => '30000000-0000-4000-8000-000000000099', 'bridge_source_id' => 'source-b']);
        $this->actingAs($this->po);
        $this->page('/diagnostics?page=2')->assertOk()->assertJsonCount(5, 'props.reports')
            ->assertJsonPath('props.pagination.total', 25)->assertJsonPath('props.counts', ['application_support' => 25]);
        $this->page('/diagnostics?status=resolved')->assertOk()->assertJsonCount(0, 'props.reports')->assertJsonPath('props.pagination.total', 0);
    }

    public function test_search_and_sort_apply_after_ownership_scope(): void
    {
        $this->remote['diagnostic_reports'] = [
            $this->support(['id' => '30000000-0000-4000-8000-000000000001', 'reference_code' => 'DR-2026-0002', 'title' => 'Boundary unclear']),
            $this->support(['id' => '30000000-0000-4000-8000-000000000002', 'reference_code' => 'DR-2026-0010', 'title' => 'Missing lot number', 'status' => 'resolved']),
            $this->support(['id' => '30000000-0000-4000-8000-000000000003', 'reference_code' => 'DR-2026-0003', 'title' => 'Boundary hidden', 'bridge_source_id' => 'source-b']),
        ];
        $this->actingAs($this->po);
        $this->page('/diagnostics?q=boundary')->assertOk()->assertJsonCount(1, 'props.reports')
            ->assertJsonPath('props.reports.0.title', 'Boundary unclear')->assertJsonPath('props.pagination.total', 1);
        $this->page('/diagnostics?status=all&sort=reference&dir=desc')->assertOk()->assertJsonPath('props.reports.0.reference_code', 'DR-2026-0010');
        $this->page('/diagnostics?sort=status&dir=asc')->assertOk()->assertJsonPath('props.reports.0.status', 'submitted');
        $this->page('/diagnostics?sort=bogus')->assertRedirect();
    }

    public function test_inbox_opens_on_all_reports_and_counts_only_open_ones(): void
    {
        $this->remote['diagnostic_reports'] = [
            $this->support(['id' => '30000000-0000-4000-8000-000000000001', 'reference_code' => 'DR-2026-0001']),
            $this->support(['id' => '30000000-0000-4000-8000-000000000002', 'reference_code' => 'DR-2026-0002', 'status' => 'in_review']),
            $this->support(['id' => '30000000-0000-4000-8000-000000000003', 'reference_code' => 'DR-2026-0003', 'status' => 'resolved']),
            $this->support(['id' => '30000000-0000-4000-8000-000000000004', 'reference_code' => 'DR-2026-0004', 'status' => 'wont_fix']),
        ];
        $this->actingAs($this->po);
        // Default: every report, and the filter says so.
        $this->page('/diagnostics')->assertOk()->assertJsonPath('props.filters.status', 'all')->assertJsonPath('props.pagination.total', 4)
            ->assertJsonPath('props.counts', ['application_support' => 2]);
        // "Open": only what still needs an answer.
        $this->page('/diagnostics?status=open')->assertOk()->assertJsonPath('props.pagination.total', 2);
        // The count stays "open reports" whatever status is being shown.
        $this->page('/diagnostics?status=all')->assertOk()->assertJsonPath('props.pagination.total', 4)
            ->assertJsonPath('props.counts', ['application_support' => 2]);
        $this->page('/diagnostics?status=resolved')->assertOk()->assertJsonPath('props.pagination.total', 1)
            ->assertJsonPath('props.reports.0.reference_code', 'DR-2026-0003')->assertJsonPath('props.counts', ['application_support' => 2]);
        // "Done": everything that no longer needs an answer.
        $this->page('/diagnostics?status=closed')->assertOk()->assertJsonPath('props.pagination.total', 2)
            ->assertJsonPath('props.counts', ['application_support' => 2]);
        $this->page('/diagnostics?status=done')->assertRedirect();
    }
}
