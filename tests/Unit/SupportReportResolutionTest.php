<?php

namespace Tests\Unit;

use App\Support\SupportReportResolution;
use Illuminate\Support\Facades\DB;
use Tests\ReportingTestCase;

class SupportReportResolutionTest extends ReportingTestCase
{
    public function test_live_job_resolves_exact_application_and_canonical_round(): void
    {
        $r = app(SupportReportResolution::class)->resolve($this->support());
        $this->assertTrue($r['resolved']);
        $this->assertSame(1, $r['application']['id']);
        $this->assertSame($this->po->id, $r['owner']['id']);
        $this->assertSame(2, $r['origin']['round_number']);
        $this->assertSame(11, $r['origin']['id']);
    }

    public function test_retained_report_keeps_current_owner_but_never_an_inspection(): void
    {
        DB::table('zoning_applications')->where('id', 1)->update(['assigned_planning_officer_id' => $this->other->id]);
        $r = app(SupportReportResolution::class)->resolve($this->support(['field_job_id' => null]));
        $this->assertTrue($r['resolved']);
        $this->assertSame($this->other->id, $r['owner']['id']);
        $this->assertNull($r['origin']['id']);
        $this->assertNull($r['origin']['round_number']);
        $this->assertSame('Unavailable — originating FieldSync job no longer exists.', $r['origin']['label']);
        $this->assertNotContains('field_jobs', array_column($this->calls, 0));
    }

    public function test_every_remote_identity_mismatch_fails_before_local_queries(): void
    {
        $baseline = $this->remote;
        foreach (['foreign_report', 'null_report', 'foreign_job', 'wrong_app', 'foreign_mirror', 'null_mirror', 'missing_job', 'missing_mirror'] as $case) {
            $this->remote = $baseline;
            $report = $this->support();
            match ($case) {
                'foreign_report' => $report['bridge_source_id'] = 'source-b',
                'null_report' => $report['bridge_source_id'] = null,
                'foreign_job' => $this->remote['field_jobs'][0]['bridge_source_id'] = 'source-b',
                'wrong_app' => $this->remote['field_jobs'][0]['supabase_application_id'] = self::REPORT,
                'foreign_mirror' => $this->remote['supabase_zoning_applications'][0]['bridge_source_id'] = 'source-b',
                'null_mirror' => $this->remote['supabase_zoning_applications'][0]['bridge_source_id'] = null,
                'missing_job' => $this->remote['field_jobs'] = [],
                'missing_mirror' => $this->remote['supabase_zoning_applications'] = [],
            };
            DB::enableQueryLog(); DB::flushQueryLog();
            $r = app(SupportReportResolution::class)->resolve($report);
            $this->assertFalse($r['resolved'], $case);
            $this->assertSame([], DB::getQueryLog(), $case.' must not reach a local lookup');
            DB::disableQueryLog();
        }
        foreach ($this->calls as [, $params]) {
            $this->assertArrayNotHasKey('reference_number', $params);
        }
    }

    public function test_missing_local_application_is_unresolved_and_inspection_mismatch_is_not_claimed(): void
    {
        DB::table('site_inspections')->where('id', 11)->update(['zoning_application_id' => 88]);
        $r = app(SupportReportResolution::class)->resolve($this->support());
        $this->assertTrue($r['resolved']);
        $this->assertNull($r['origin']['id']);
        DB::table('zoning_applications')->delete();
        $this->assertFalse(app(SupportReportResolution::class)->resolve($this->support())['resolved']);
    }
}
