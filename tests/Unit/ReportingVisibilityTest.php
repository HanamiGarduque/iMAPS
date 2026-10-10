<?php

namespace Tests\Unit;

use App\Services\DiagnosticReportReader;
use App\Support\ReportingVisibility;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\ReportingTestCase;

class ReportingVisibilityTest extends ReportingTestCase
{
    public function test_scoped_inspection_summary_excludes_other_apps_technical_and_unresolved(): void
    {
        $this->remote['diagnostic_reports'][] = $this->support(['id' => '30000000-0000-4000-8000-000000000002', 'supabase_application_id' => self::REPORT]);
        $this->remote['diagnostic_reports'][] = $this->support(['id' => '30000000-0000-4000-8000-000000000003', 'bridge_source_id' => 'source-b']);
        $summary = app(ReportingVisibility::class)->applicationSummary($this->admin, 1);
        $this->assertSame(1, $summary['total']);
        $this->assertSame('Clarification Needed', $summary['latest']['support_category_label']);
        $this->assertSame('/diagnostics?type=application_support&status=all&application='.self::APP, $summary['url']);
        $this->assertNull($summary['latest']['context']['origin']);
        foreach ($this->calls as [$table, $params]) {
            if ($table === 'diagnostic_reports') {
                $this->assertSame('eq.application_support', $params['report_type']);
                $this->assertSame('eq.'.self::APP, $params['supabase_application_id']);
            }
        }
        $this->remote['diagnostic_reports'] = [$this->technical()];
        $this->assertSame(0, app(ReportingVisibility::class)->applicationSummary($this->admin, 1)['total']);
        $this->assertSame(0, app(ReportingVisibility::class)->applicationSummary($this->po, 999)['total']);
    }

    public function test_current_owner_scope_is_shared_by_counts_filters_and_summary(): void
    {
        $visibility = app(ReportingVisibility::class);
        $this->assertSame(['application_support' => 1], $visibility->scopeVisibleReports($this->po)['counts']);
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->other->id]);
        $this->assertSame(['application_support' => 0], $visibility->scopeVisibleReports($this->po)['counts']);
        $this->assertSame(0, $visibility->applicationSummary($this->po, 1)['total']);
        $this->assertSame(['application_support' => 1], $visibility->scopeVisibleReports($this->other)['counts']);
        foreach ($this->calls as [$table, $params]) {
            if ($table === 'diagnostic_reports') {
                $this->assertSame('eq.application_support', $params['report_type']);
            }
        }
    }

    public function test_batch_resolution_does_not_grow_per_report_and_scan_respects_server_cap(): void
    {
        $this->remote['diagnostic_reports'] = [];
        for ($i = 1; $i <= 125; $i++) {
            $this->remote['diagnostic_reports'][] = $this->support(['id' => sprintf('30000000-0000-4000-8000-%012d', $i)]);
        }
        DB::enableQueryLog(); DB::flushQueryLog();
        $result = app(ReportingVisibility::class)->scopeVisibleReports($this->po);
        $this->assertCount(125, $result['reports']);
        $this->assertSame(125, $result['counts']['application_support']);
        $this->assertCount(4, DB::getQueryLog(), 'Two batch credential reads + one applications read + one eager owner read, not per report.');
        DB::disableQueryLog();
        $reportCalls = array_values(array_filter($this->calls, fn ($c) => $c[0] === 'diagnostic_reports'));
        // The server's own row cap is learned from the FIRST response (100 rows
        // here, despite a larger limit being requested). The scan therefore
        // continues once, and the 25-row short page correctly ends it: 125 rows
        // in total, with no wasted third round trip and no early truncation.
        $this->assertSame([0, 100], array_map(fn ($c) => (int) ($c[1]['offset'] ?? 0), $reportCalls));
        $this->assertSame(['profiles' => 1, 'field_jobs' => 1, 'supabase_zoning_applications' => 1], array_count_values(array_diff(array_column($this->calls, 0), ['diagnostic_reports'])));
        // 'profiles' is the reporter-identity batch read added in Phase 1: ONE
        // read for the whole 125-report page, proving reporter resolution does
        // not grow per report either. It is one call for 125 reports, not 125.
        $profileCalls = array_values(array_filter($this->calls, fn ($c) => $c[0] === 'profiles'));
        $this->assertCount(1, $profileCalls);
        $this->assertCount(1, array_unique(array_column($profileCalls, 0)));
    }

    public function test_reader_sanitizes_every_new_free_text_field_and_allowlists_output(): void
    {
        foreach (['summary', 'title', 'affected_file', 'affected_field', 'requested_change', 'expected_behavior', 'repro_steps', 'technical_description', 'recommended_action'] as $key) {
            $this->remote['diagnostic_reports'][0][$key] = 'Bearer do-not-disclose';
        }
        $this->remote['diagnostic_reports'][0]['secret_future_column'] = 'never forward';
        $result = app(DiagnosticReportReader::class)->find(self::REPORT);
        $this->assertTrue($result['ok']);
        $this->assertStringNotContainsString('do-not-disclose', json_encode($result));
        $this->assertArrayNotHasKey('secret_future_column', $result['report']);
        $this->assertStringNotContainsString('*', $this->calls[0][1]['select']);
    }

    public function test_list_rows_carry_only_a_sanitized_one_line_summary_preview(): void
    {
        $this->remote['diagnostic_reports'][0]['summary'] = "  Token Bearer do-not-disclose  leaked\nsecond line stays private";
        $this->remote['diagnostic_reports'][] = $this->support(['id' => '30000000-0000-4000-8000-000000000002', 'summary' => str_repeat('a', 300)]);
        $this->remote['diagnostic_reports'][] = $this->support(['id' => '30000000-0000-4000-8000-000000000003', 'summary' => null]);
        $rows = collect(app(DiagnosticReportReader::class)->all()['reports'])->keyBy('id');

        $first = $rows[self::REPORT];
        $this->assertArrayNotHasKey('summary', $first, 'The full summary stays on the detail page.');
        $this->assertStringNotContainsString('do-not-disclose', json_encode($rows->all()));
        $this->assertStringNotContainsString('second line', $first['preview']);
        $this->assertStringStartsWith('Token ', $first['preview']);
        $this->assertSame(140, mb_strwidth($rows['30000000-0000-4000-8000-000000000002']['preview']));
        $this->assertNull($rows['30000000-0000-4000-8000-000000000003']['preview']);
    }

    public function test_remote_failure_is_not_a_successful_empty_state(): void
    {
        $this->remoteFails = true;
        $result = app(ReportingVisibility::class)->scopeVisibleReports($this->po);
        $this->assertFalse($result['ok']);
        $this->assertNotEmpty($result['message']);
        $this->assertSame([], $result['reports']);
    }
}
