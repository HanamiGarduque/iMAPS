<?php

namespace Tests\Unit;

use App\Services\DiagnosticReportReader;
use App\Support\ReportingVisibility;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\ReportingTestCase;

/**
 * PHASE 1 - reporter identity resolution.
 *
 * The chain under test is exact and contains no text matching anywhere:
 *   diagnostic_reports.inspector_id -> remote profiles.id
 *   -> remote profiles.handshake_key -> local users.handshake_key
 *   -> local users.name / role
 *
 * Every negative case asserts the SAME safe fallback the earlier checkpoint
 * shipped, because failing closed is the entire point of this phase.
 */
class ReporterIdentityResolutionTest extends ReportingTestCase
{
    private const INSPECTOR_UUID = '40000000-0000-4000-8000-000000000001';
    private const KEY = 'handshake-key-renato-0001';
    private const LOCAL_NAME = 'Renato Dimaculangan';

    /** Bridge one remote Auth UUID to one local Site Inspector account. */
    private function bridge(string $uuid = self::INSPECTOR_UUID, string $key = self::KEY): int
    {
        $user = $this->user('Site Inspector', self::LOCAL_NAME);
        DB::table('users')->where('id', $user->id)->update(['handshake_key' => $key]);
        // full_name deliberately disagrees with the local name: the live
        // deployment proves the remote name is not authoritative.
        $this->remote['profiles'] = [['id' => $uuid, 'handshake_key' => $key, 'full_name' => 'My Hubbie']];
        return $user->id;
    }

    private function reporter(array $report): array
    {
        return $report['inspector'];
    }

    private function resolved(string $reportId = self::REPORT): array
    {
        $result = app(DiagnosticReportReader::class)->find($reportId);
        $this->assertTrue($result['ok']);
        return $this->reporter($result['report']);
    }

    // ── 1. the exact chain ────────────────────────────────────────────────

    public function test_exact_remote_uuid_resolves_through_profile_to_the_local_user(): void
    {
        $id = $this->bridge();
        $reporter = $this->resolved();

        $this->assertTrue($reporter['resolved']);
        $this->assertSame(self::LOCAL_NAME, $reporter['name']);
        $this->assertSame('Site Inspector', $reporter['role']);
        // It resolved to a real local row, not to a plausible-looking string.
        $this->assertTrue(DB::table('users')->where('id', $id)->where('name', self::LOCAL_NAME)->exists());
    }

    // ── 2. the local name is the only display authority ───────────────────

    public function test_local_name_is_authoritative_and_remote_full_name_is_never_used(): void
    {
        $this->bridge();
        $reporter = $this->resolved();

        $this->assertSame(self::LOCAL_NAME, $reporter['name']);
        $this->assertStringNotContainsString('My Hubbie', json_encode($reporter));

        $profileReads = array_values(array_filter($this->calls, fn ($c) => $c[0] === 'profiles'));
        $this->assertNotEmpty($profileReads);
        foreach ($profileReads as [, $params]) {
            $this->assertSame('id,handshake_key', $params['select']);
        }
    }

    // ── 3. duplicate human names are irrelevant ───────────────────────────

    public function test_duplicate_human_names_do_not_affect_resolution(): void
    {
        $this->bridge();
        // A second, unrelated account that happens to share the human name.
        $twin = $this->user('Site Inspector', self::LOCAL_NAME);
        DB::table('users')->where('id', $twin->id)->update(['handshake_key' => 'a-completely-different-key']);

        $reporter = $this->resolved();
        $this->assertTrue($reporter['resolved']);
        $this->assertSame(self::LOCAL_NAME, $reporter['name']);
    }

    // ── 4-7. fail closed on every broken link ─────────────────────────────

    public function test_missing_remote_profile_keeps_the_safe_fallback(): void
    {
        $this->bridge();
        $this->remote['profiles'] = [];
        $reporter = $this->resolved();
        $this->assertFalse($reporter['resolved']);
        $this->assertSame('Unresolved inspector', $reporter['label']);
    }

    public function test_profile_without_a_handshake_key_keeps_the_safe_fallback(): void
    {
        $this->bridge();
        foreach ([null, '', '   '] as $broken) {
            $this->remote['profiles'] = [['id' => self::INSPECTOR_UUID, 'handshake_key' => $broken]];
            $reporter = $this->resolved();
            $this->assertFalse($reporter['resolved'], 'handshake_key '.var_export($broken, true));
            $this->assertSame('Unresolved inspector', $reporter['label']);
        }
    }

    public function test_no_matching_local_user_keeps_the_safe_fallback(): void
    {
        $this->bridge();
        DB::table('users')->update(['handshake_key' => 'a-different-key']);
        $reporter = $this->resolved();
        $this->assertFalse($reporter['resolved']);
        $this->assertSame('Unresolved inspector', $reporter['label']);
    }

    public function test_ambiguous_duplicate_local_handshake_match_never_guesses_first_row(): void
    {
        $this->bridge();
        $twin = $this->user('Site Inspector', 'Impostor Second Account');
        DB::table('users')->where('id', $twin->id)->update(['handshake_key' => self::KEY]);

        $reporter = $this->resolved();
        $this->assertFalse($reporter['resolved'], 'two local users claim one bridge key');
        $this->assertSame('Unresolved inspector', $reporter['label']);
        $this->assertStringNotContainsString('Impostor', json_encode($reporter));
        $this->assertStringNotContainsString(self::LOCAL_NAME, json_encode($reporter));
    }

    public function test_local_user_with_an_incompatible_role_is_never_shown_as_the_reporter(): void
    {
        $this->bridge();
        DB::table('users')->where('handshake_key', self::KEY)->update(['role' => 'Planning Officer']);

        $reporter = $this->resolved();
        $this->assertFalse($reporter['resolved']);
        $this->assertSame('Unresolved inspector', $reporter['label']);
    }

    // ── historical identity ───────────────────────────────────────────────

    public function test_a_deactivated_inspector_keeps_their_historical_attribution(): void
    {
        $this->bridge();
        DB::table('users')->where('handshake_key', self::KEY)->update(['is_active' => false]);

        $reporter = $this->resolved();
        $this->assertTrue($reporter['resolved'], 'a filed report is a historical fact, not live work');
        $this->assertSame(self::LOCAL_NAME, $reporter['name']);
    }

    // ── both report types ─────────────────────────────────────────────────

    public function test_technical_issue_resolves_without_any_job_or_application(): void
    {
        $this->bridge();
        $this->assertNull($this->technical()['field_job_id']);
        $this->assertNull($this->technical()['supabase_application_id']);

        $reporter = $this->resolved(self::LEGACY);
        $this->assertTrue($reporter['resolved']);
        $this->assertSame(self::LOCAL_NAME, $reporter['name']);
    }

    public function test_application_support_resolves_independently_of_current_ownership(): void
    {
        $this->bridge();
        // No Planning Officer at all: the reporter is unaffected by ownership.
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => null]);
        $unowned = $this->resolved();
        $this->assertTrue($unowned['resolved']);
        $this->assertSame(self::LOCAL_NAME, $unowned['name']);

        // And the owned case resolves to the same reporter and a real owner.
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->po->id]);
        $scoped = app(ReportingVisibility::class)->scopeVisibleReports($this->admin, ['type' => 'application_support'])['reports'][0];
        $this->assertTrue($this->reporter($scoped)['resolved']);
        $this->assertSame(self::LOCAL_NAME, $this->reporter($scoped)['name']);
        $this->assertSame('Current PO', $scoped['context']['owner']['name'], 'ownership resolution is untouched');
    }

    // ── 10/11. the resolved payload stays minimal ─────────────────────────

    public function test_resolved_payload_exposes_no_handshake_key_and_no_raw_uuid(): void
    {
        $this->bridge();
        $result = app(DiagnosticReportReader::class)->find(self::REPORT);
        $payload = json_encode($result['report']);

        $this->assertStringNotContainsString(self::KEY, $payload);
        $this->assertStringNotContainsString('handshake', strtolower($payload));
        $this->assertStringNotContainsString(self::INSPECTOR_UUID, $payload);
        $this->assertStringNotContainsString('test-server', $payload);
        $this->assertArrayNotHasKey('inspector_id', $result['report']);

        // Exactly the safe presentation keys, nothing internal.
        $this->assertSame(['resolved', 'name', 'role', 'label'], array_keys($this->reporter($result['report'])));
    }

    // ── 12. the fallback renders exactly as before ────────────────────────

    public function test_fallback_renders_only_the_short_uuid(): void
    {
        $this->remote['profiles'] = [];
        $report = app(DiagnosticReportReader::class)->find(self::REPORT)['report'];

        $this->assertFalse($report['inspector']['resolved']);
        $this->assertSame(substr(self::INSPECTOR_UUID, 0, 8), $report['inspector']['short_uuid']);

        // Byte-for-byte what ReportUi renders today: label + short prefix.
        $rendered = $report['inspector']['label']
            .($report['inspector']['short_uuid'] ? ' ('.$report['inspector']['short_uuid'].'…)' : '');
        $this->assertSame('Unresolved inspector ('.substr(self::INSPECTOR_UUID, 0, 8).'…)', $rendered);
    }

    public function test_a_malformed_inspector_uuid_stays_unresolved(): void
    {
        $this->bridge();
        $this->remote['diagnostic_reports'][0]['inspector_id'] = 'not-a-uuid';
        $report = app(DiagnosticReportReader::class)->find(self::REPORT)['report'];

        $this->assertFalse($report['inspector']['resolved']);
        $this->assertNull($report['inspector']['short_uuid']);
        $this->assertArrayNotHasKey('inspector_id', $report);
    }

    // ── 13. batching ──────────────────────────────────────────────────────

    public function test_reporter_identity_is_batched_and_never_queries_per_report(): void
    {
        $this->bridge();
        $this->remote['diagnostic_reports'] = [];
        for ($i = 1; $i <= 125; $i++) {
            $this->remote['diagnostic_reports'][] = $this->support(
                ['id' => sprintf('30000000-0000-4000-8000-%012d', $i)]
            );
        }

        DB::flushQueryLog();
        DB::enableQueryLog();
        $result = app(ReportingVisibility::class)->scopeVisibleReports(
            $this->admin, ['type' => 'application_support']);
        $log = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertCount(125, $result['reports']);
        foreach ($result['reports'] as $report) {
            $this->assertTrue($this->reporter($report)['resolved']);
            $this->assertSame(self::LOCAL_NAME, $this->reporter($report)['name']);
        }

        // ONE remote profile read for all 125 rows (a single distinct id, so a
        // single chunk) - not 125.
        $profileCalls = array_values(array_filter($this->calls, fn ($c) => $c[0] === 'profiles'));
        $this->assertCount(1, $profileCalls);
        $this->assertSame('in.('.self::INSPECTOR_UUID.')', $profileCalls[0][1]['id']);

        // Exactly ONE local `users ... whereIn(handshake_key)` read, and a total
        // query count that stays flat rather than tracking the report count.
        $userInReads = array_values(array_filter($log, fn ($q) =>
            str_contains($q['query'], '"users"') && str_contains($q['query'], '"handshake_key" in')));
        $this->assertCount(1, $userInReads);
        $this->assertLessThanOrEqual(6, count($log), 'queries stay bounded, not proportional to reports');
    }

    public function test_many_distinct_reporters_chunk_the_remote_profile_read(): void
    {
        $profiles = [];
        $this->remote['diagnostic_reports'] = [];
        for ($i = 1; $i <= 120; $i++) {
            $uuid = sprintf('40000000-0000-4000-8000-%012d', $i);
            $key = 'batch-key-'.$i;
            $user = $this->user('Site Inspector', 'Inspector '.$i);
            DB::table('users')->where('id', $user->id)->update(['handshake_key' => $key]);
            $profiles[] = ['id' => $uuid, 'handshake_key' => $key];
            $this->remote['diagnostic_reports'][] = $this->support([
                'id' => sprintf('30000000-0000-4000-8000-%012d', $i),
                'inspector_id' => $uuid,
            ]);
        }
        $this->remote['profiles'] = $profiles;

        $result = app(ReportingVisibility::class)->scopeVisibleReports($this->admin, ['type' => 'application_support']);
        $this->assertCount(120, $result['reports']);
        foreach ($result['reports'] as $report) {
            $this->assertTrue($this->reporter($report)['resolved']);
        }

        $profileCalls = array_values(array_filter($this->calls, fn ($c) => $c[0] === 'profiles'));
        $this->assertCount(2, $profileCalls, '120 distinct ids read in chunks of 100, not 120 single reads');
    }

    public function test_a_reporter_profile_read_failure_never_breaks_the_report_list(): void
    {
        $this->bridge();
        // Fail ONLY the profiles read. The reports page must still load, and the
        // reporter must stay unresolved rather than being guessed or invented.
        $this->remoteTableFails = ['profiles'];

        $result = app(ReportingVisibility::class)->scopeVisibleReports($this->admin, ['type' => 'application_support']);
        $this->assertTrue($result['ok'], 'a reporter-identity failure must not fail the page');
        $this->assertCount(1, $result['reports']);
        $this->assertFalse($this->reporter($result['reports'][0])['resolved']);
        $this->assertSame('Unresolved inspector', $this->reporter($result['reports'][0])['label']);
    }

    // ── 14. the pages still render ────────────────────────────────────────

    public function test_both_report_pages_render_a_resolved_reporter(): void
    {
        $this->bridge();
        $this->actingAs($this->admin);
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(
            \Illuminate\Http\Request::create('/diagnostics'));

        foreach (['/diagnostics?type=technical_issue', '/diagnostics?type=application_support'] as $url) {
            $page = $this->get($url, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version ?? '']);
            $page->assertOk()->assertJsonPath('props.reports.0.inspector.resolved', true)
                ->assertJsonPath('props.reports.0.inspector.name', self::LOCAL_NAME)
                ->assertJsonPath('props.reports.0.inspector.label', self::LOCAL_NAME);
            $this->assertStringNotContainsString(self::KEY, $page->getContent());
            $this->assertStringNotContainsString('Unresolved inspector', $page->getContent());
        }

        $detail = $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version ?? '']);
        $detail->assertOk()->assertJsonPath('props.report.inspector.name', self::LOCAL_NAME);
        $this->assertStringNotContainsString(self::KEY, $detail->getContent());
    }
}