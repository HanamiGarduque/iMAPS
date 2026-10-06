<?php

namespace Tests\Feature;

use App\Services\DiagnosticReportReader;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ReportingTestCase;

/** Real routes/authorization/reader/audit; only the remote HTTP boundary is fake. */
class ReportHandlingTest extends ReportingTestCase
{
    private array $patches = [];
    private ?\Closure $beforePatch = null;
    private mixed $patchResult = null;
    private int $patchStatus = 200;
    private int $auditAttempts = 0;
    private int $auditFailures = 0;
    private string $auditSqlstate = '40001';
    private string $auditConstraint = '';
    private array $activityPosts = [];
    private string $activityFailure = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 10, 4)->setTime(9, 30));
        Schema::create('report_action_audit', function ($t) {
            $t->id(); $t->uuid('report_id'); $t->string('action', 60);
            $t->string('from_status', 20); $t->string('to_status', 20);
            $t->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            $t->string('performed_by_name'); $t->timestamp('performed_at')->useCurrent();
            $t->unique(['report_id', 'action']);
        });
        DB::connection()->beforeExecuting(function ($sql, $bindings, $connection) {
            if (! str_starts_with($sql, 'insert into "report_action_audit"')) {
                return;
            }
            $this->auditAttempts++;
            if ($this->auditFailures-- > 0) {
                $error = new \PDOException('duplicate key value violates unique constraint "'.$this->auditConstraint.'"');
                $error->errorInfo = [$this->auditSqlstate, 7, $error->getMessage()];
                throw new QueryException($connection->getName(), $sql, $bindings, $error);
            }
        });
        $this->remoteWrite = function ($request) {
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/activity_log') {
                $this->assertSame('POST', $request->method());
                $this->assertTrue($request->hasHeader('Authorization', 'Bearer test-server'));
                $this->assertTrue($request->hasHeader('Prefer', 'resolution=ignore-duplicates,return=representation'));
                $this->assertStringContainsString('on_conflict=id', $request->url());
                $this->assertSame(0, DB::transactionLevel(), 'Notify only after local commit.');
                $this->assertGreaterThan(0, DB::table('report_action_audit')->whereIn('to_status', ['resolved', 'wont_fix'])->count());
                $data = $request->data();
                $this->activityPosts[] = $data;
                if ($this->activityFailure === 'rejected') {
                    return Http::response(['message' => 'Private transport details'], 403);
                }
                if ($this->activityFailure === 'lost_before_insert') {
                    throw new \Illuminate\Http\Client\ConnectionException('Private transport details');
                }
                foreach ($this->remote['activity_log'] ?? [] as $row) {
                    if ($row['id'] === $data['id']) {
                        return Http::response([], 201);
                    }
                }
                $row = $data + ['is_read' => false, 'occurred_at' => now()->toIso8601String(), 'created_at' => now()->toIso8601String()];
                $this->remote['activity_log'][] = $row;
                if ($this->activityFailure === 'lost_after_insert') {
                    throw new \Illuminate\Http\Client\ConnectionException('Private transport details');
                }
                if ($this->activityFailure === 'reordered_keys') {
                    $row = array_reverse($row, true);
                }
                return Http::response([$row], 201);
            }
            $this->assertSame('PATCH', $request->method());
            $this->assertSame('/rest/v1/diagnostic_reports', parse_url($request->url(), PHP_URL_PATH));
            $this->assertTrue($request->hasHeader('Authorization', 'Bearer test-server'));
            $this->assertTrue($request->hasHeader('Prefer', 'return=representation'));
            parse_str(parse_url($request->url(), PHP_URL_QUERY), $params);
            $this->patches[] = ['params' => $params, 'data' => $request->data()];
            if ($this->beforePatch) {
                ($this->beforePatch)();
            }
            if ($this->patchResult !== null || $this->patchStatus !== 200) {
                return Http::response($this->patchResult ?? [], $this->patchStatus);
            }
            $out = [];
            foreach ($this->remote['diagnostic_reports'] as &$row) {
                if ('eq.'.$row['id'] === ($params['id'] ?? null) && 'eq.'.$row['status'] === ($params['status'] ?? null)) {
                    $row = array_replace($row, $request->data());
                    $out[] = $row;
                }
            }
            return Http::response($out);
        };
    }

    private function handle(string $id, string $status, array $extra = [])
    {
        return $this->postJson('/diagnostics/'.$id.'/handle', ['status' => $status] + $extra);
    }

    private function page(string $id)
    {
        $url = '/diagnostics/'.$id;
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create($url));
        return $this->get($url, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version ?? '']);
    }

    public static function transitions(): array
    {
        return [
            ['submitted', 'in_review', 'report_review_started'],
            ['submitted', 'resolved', 'report_resolved'],
            ['submitted', 'wont_fix', 'report_wont_fix'],
            ['in_review', 'resolved', 'report_resolved'],
            ['in_review', 'wont_fix', 'report_wont_fix'],
        ];
    }

    #[DataProvider('transitions')]
    public function test_admin_technical_transition_is_one_cas_then_an_exact_audit(string $from, string $to, string $action): void
    {
        $this->remote['diagnostic_reports'][1]['status'] = $from;
        $this->beforePatch = fn () => $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, $to, ['response_message' => $to === 'in_review' ? null : "  Reviewed.\nFixed.  "])
            ->assertOk()->assertJsonPath('outcome', 'success')->assertJsonPath('remote_updated', true)->assertJsonPath('audit_recorded', true);
        $this->assertCount(1, $this->patches);
        $this->assertSame(['id' => 'eq.'.self::LEGACY, 'status' => 'eq.'.$from], $this->patches[0]['params']);
        $this->assertDatabaseHas('report_action_audit', ['report_id' => self::LEGACY, 'action' => $action,
            'from_status' => $from, 'to_status' => $to, 'performed_by' => $this->admin->id, 'performed_by_name' => 'Admin']);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        if ($to === 'in_review') {
            $this->assertSame(['status' => 'in_review'], $this->patches[0]['data']);
            $this->assertSame([], $this->activityPosts);
        } else {
            $this->assertSame(['status', 'response_message', 'responded_by_name', 'responded_at'], array_keys($this->patches[0]['data']));
            $this->assertSame("Reviewed.\nFixed.", $this->patches[0]['data']['response_message']);
            $this->assertTerminalActivity($action, 'DR-2026-0001', "Reviewed.\nFixed.");
        }
        $this->assertSame(0, DB::table('notifications')->count());
    }

    #[DataProvider('transitions')]
    public function test_current_po_owned_support_transitions(string $from, string $to, string $action): void
    {
        $this->remote['diagnostic_reports'][0]['status'] = $from;
        $this->actingAs($this->po);
        $this->beforePatch = fn () => $this->assertGreaterThan(0, DB::transactionLevel(), 'Ownership lock must span the remote CAS.');
        $this->handle(self::REPORT, $to, ['response_message' => $to === 'in_review' ? null : 'Clarified.'])->assertOk();
        $this->assertDatabaseHas('report_action_audit', ['action' => $action, 'from_status' => $from, 'performed_by' => $this->po->id]);
        $this->assertSame($this->po->id, DB::table('zoning_applications')->value('assigned_planning_officer_id'));
        if ($to === 'in_review') {
            $this->assertSame([], $this->activityPosts);
        } else {
            $this->assertTerminalActivity($action, 'DR-TEST-0002', 'Clarified.');
        }
    }

    public function test_role_denials_create_no_remote_write_or_audit(): void
    {
        foreach (['in_review', 'resolved', 'wont_fix'] as $status) {
            $this->actingAs($this->po);
            $this->handle(self::LEGACY, $status, ['response_message' => 'No.'])->assertForbidden();
            $this->actingAs($this->other);
            $this->handle(self::REPORT, $status, ['response_message' => 'No.'])->assertForbidden();
            $this->actingAs($this->admin);
            $this->handle(self::REPORT, $status, ['response_message' => 'No.'])->assertForbidden();
        }
        $this->assertSame([], $this->patches);
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertSame([], $this->activityPosts);
    }

    public function test_post_re_resolves_owner_instead_of_page_or_browser_owner(): void
    {
        $this->actingAs($this->po);
        $this->page(self::REPORT)->assertOk()->assertJsonPath('props.handlingActions', ['in_review', 'resolved', 'wont_fix']);
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->other->id]);
        $this->handle(self::REPORT, 'resolved', ['owner_id' => $this->po->id, 'response_message' => 'Old owner'])->assertForbidden();
        $this->actingAs($this->other);
        $this->handle(self::REPORT, 'resolved', ['owner_id' => $this->po->id, 'response_message' => 'Current owner'])->assertOk();
        $this->assertDatabaseHas('report_action_audit', ['performed_by' => $this->other->id, 'performed_by_name' => 'Next PO']);
    }

    public function test_unowned_admin_is_review_only_without_assignment_side_effect(): void
    {
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => null]);
        $this->actingAs($this->admin);
        $this->page(self::REPORT)->assertJsonPath('props.handlingActions', ['in_review'])->assertJsonPath('props.canNotify', false);
        foreach (['resolved', 'wont_fix'] as $to) {
            $this->handle(self::REPORT, $to, ['response_message' => 'Not allowed'])->assertForbidden();
        }
        $this->actingAs($this->po);
        foreach (['in_review', 'resolved', 'wont_fix'] as $to) {
            $this->handle(self::REPORT, $to, ['response_message' => 'Not allowed'])->assertForbidden();
        }
        $this->actingAs($this->admin);
        $this->handle(self::REPORT, 'in_review')->assertOk();
        $this->page(self::REPORT)->assertJsonPath('props.handlingActions', []);
        $this->assertNull(DB::table('zoning_applications')->value('assigned_planning_officer_id'));
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->po->id]);
        $this->actingAs($this->po);
        $this->handle(self::REPORT, 'resolved', ['response_message' => 'Now assigned.'])->assertOk();
        $this->assertSame(['submitted', 'in_review'], DB::table('report_action_audit')->orderBy('id')->pluck('from_status')->all());
    }

    public function test_broken_exact_identity_chain_never_authorizes_a_mutation(): void
    {
        $baseline = $this->remote;
        foreach (['null_job', 'missing_job', 'wrong_job_app', 'foreign_job', 'foreign_report', 'foreign_mirror', 'missing_mirror', 'missing_local'] as $case) {
            $this->remote = $baseline;
            match ($case) {
                'null_job' => $this->remote['diagnostic_reports'][0]['field_job_id'] = null,
                'missing_job' => $this->remote['field_jobs'] = [],
                'wrong_job_app' => $this->remote['field_jobs'][0]['supabase_application_id'] = self::LEGACY,
                'foreign_job' => $this->remote['field_jobs'][0]['bridge_source_id'] = 'foreign',
                'foreign_report' => $this->remote['diagnostic_reports'][0]['bridge_source_id'] = 'foreign',
                'foreign_mirror' => $this->remote['supabase_zoning_applications'][0]['bridge_source_id'] = 'foreign',
                'missing_mirror' => $this->remote['supabase_zoning_applications'] = [],
                'missing_local' => $this->remote['supabase_zoning_applications'][0]['local_application_id'] = 999,
            };
            $this->actingAs($this->po);
            $this->handle(self::REPORT, 'resolved', ['response_message' => 'Cannot prove owner'])->assertForbidden();
            $this->actingAs($this->admin);
            $this->handle(self::REPORT, 'in_review')->assertForbidden();
        }
        $this->assertSame([], $this->patches);
    }

    public static function invalidTransitions(): array
    {
        return [['in_review', 'submitted'], ['in_review', 'in_review'], ['resolved', 'in_review'], ['resolved', 'resolved'],
            ['resolved', 'wont_fix'], ['wont_fix', 'in_review'], ['wont_fix', 'resolved'], ['wont_fix', 'wont_fix']];
    }

    #[DataProvider('invalidTransitions')]
    public function test_forbidden_transitions_never_patch(string $from, string $to): void
    {
        $this->remote['diagnostic_reports'][1]['status'] = $from;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, $to, ['response_message' => 'Replacement'])->assertStatus($to === 'submitted' ? 422 : 409);
        $this->assertSame([], $this->patches);
    }

    public static function badResponses(): array
    {
        return [[null], [''], [" \t\n\r\v\f "], [str_repeat('x', 2001)], [['nested']], ['<p>HTML</p>'], ['\\n\\t']];
    }

    #[DataProvider('badResponses')]
    public function test_invalid_terminal_response_is_rejected_before_write(mixed $text): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => $text])->assertUnprocessable()->assertJsonValidationErrors('response_message');
        $this->assertSame([], $this->patches);
        $this->assertSame(0, DB::table('report_action_audit')->count());
    }

    public function test_response_redaction_and_server_identity_ignore_forged_fields(): void
    {
        $this->actingAs($this->admin);
        DB::table('users')->where('id', $this->admin->id)->update(['name' => 'Current Admin Name']);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => " Reviewed.\nhttps://example.test/file?token=private  ",
            'inspector_id' => '99999999-0000-4000-8000-000000000099', 'recipient_id' => $this->po->id,
            'responded_by_name' => 'Forged', 'responded_at' => '1900-01-01', 'performed_by' => $this->po->id,
            'performed_by_name' => 'Forged', 'expected_status' => 'in_review'])->assertOk();
        $data = $this->patches[0]['data'];
        $this->assertSame("Reviewed.\n[redacted sensitive link]", $data['response_message']);
        $this->assertSame('Current Admin Name', $data['responded_by_name']);
        $this->assertSame(now()->toIso8601String(), $data['responded_at']);
        $this->assertDatabaseHas('report_action_audit', ['from_status' => 'submitted', 'performed_by' => $this->admin->id,
            'performed_by_name' => 'Current Admin Name']);
        $this->assertSame(0, DB::table('notifications')->count());
        $this->assertTerminalActivity('report_resolved', 'DR-2026-0001', 'Reviewed.');
    }

    public function test_review_rejects_response_content(): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'in_review', ['response_message' => 'Not an official response yet'])->assertUnprocessable();
        $this->assertSame([], $this->patches);
    }

    public function test_exact_2000_character_multibyte_response_and_encoded_text_remain_plain(): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => str_repeat('é', 2000)])->assertOk();
        $this->assertSame(2000, mb_strlen($this->patches[0]['data']['response_message']));
        $this->actingAs($this->po);
        $this->handle(self::REPORT, 'resolved', ['response_message' => '\\u003cp\\u003eHTML\\u003c/p\\u003e'])->assertOk();
        $this->assertStringNotContainsString('<', $this->patches[1]['data']['response_message']);
    }

    public function test_angle_brackets_that_are_not_markup_are_accepted(): void
    {
        $this->actingAs($this->admin);
        $text = 'Parcel width <10m and depth >5m; setback < 3 m verified.';
        $this->handle(self::LEGACY, 'resolved', ['response_message' => $text])->assertOk();
        $this->assertSame($text, $this->patches[0]['data']['response_message']);
    }

    public function test_zero_row_cas_re_reads_current_state_without_retry_or_audit(): void
    {
        $this->actingAs($this->admin);
        $this->beforePatch = function () { $this->remote['diagnostic_reports'][1]['status'] = 'wont_fix'; };
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Stale response'])->assertConflict()
            ->assertJsonPath('outcome', 'conflict')->assertJsonPath('current_status', 'wont_fix');
        $this->assertCount(1, $this->patches);
        $reads = array_filter($this->calls, fn ($c) => $c[0] === 'diagnostic_reports');
        $this->assertCount(2, $reads);
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertSame([], $this->activityPosts);
    }

    public function test_remote_error_creates_no_audit_or_retry(): void
    {
        $this->actingAs($this->admin);
        $this->patchStatus = 503;
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Remote failure'])->assertStatus(503);
        $this->assertCount(1, $this->patches);
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertSame([], $this->activityPosts);
    }

    public function test_unproven_remote_representation_cannot_fabricate_audit(): void
    {
        $this->actingAs($this->admin);
        foreach ([[$this->support()], [$this->technical(), $this->technical()], ['status' => 'resolved']] as $body) {
            $this->patchResult = $body;
            $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Ambiguous'])->assertStatus(503);
        }
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertCount(3, $this->patches);
        $this->assertSame([], $this->activityPosts);
    }

    public function test_bounded_local_retry_never_repeats_remote_patch(): void
    {
        $this->auditFailures = 1;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Fixed'])->assertOk()->assertJsonPath('outcome', 'success');
        $this->assertCount(1, $this->patches);
        $this->assertSame(2, $this->auditAttempts);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        $this->assertCount(1, $this->activityPosts);
    }

    public function test_exhausted_local_retry_returns_explicit_partial_success_and_safe_critical_log(): void
    {
        Log::spy();
        $this->auditFailures = 5;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Private official prose'])->assertStatus(207)
            ->assertJsonPath('outcome', 'partial_success')->assertJsonPath('remote_updated', true)->assertJsonPath('audit_recorded', false);
        $this->assertCount(1, $this->patches);
        $this->assertSame(2, $this->auditAttempts);
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertSame([], $this->activityPosts);
        Log::shouldHaveReceived('critical')->once()->withArgs(fn ($message, $context) =>
            $context['report_id'] === self::LEGACY && $context['action'] === 'report_resolved'
            && $context['actor_id'] === $this->admin->id && isset($context['time'], $context['classification'])
            && ! str_contains(json_encode($context), 'Private official prose'));
    }

    public static function auditDuplicates(): array
    {
        return [['report_action_audit_report_id_action_unique', false, 200, 'success'],
            ['report_action_audit_report_id_action_unique', true, 409, 'audit_conflict'],
            ['report_action_audit_one_terminal_unique', false, 409, 'audit_conflict'],
            ['unrelated_unique', false, 207, 'partial_success']];
    }

    #[DataProvider('auditDuplicates')]
    public function test_unique_violations_are_constraint_specific(string $constraint, bool $mismatch, int $status, string $outcome): void
    {
        Log::spy();
        DB::table('report_action_audit')->insert(['report_id' => self::LEGACY, 'action' => 'report_resolved',
            'from_status' => 'submitted', 'to_status' => 'resolved', 'performed_by' => $mismatch ? $this->po->id : $this->admin->id,
            'performed_by_name' => 'Admin', 'performed_at' => '2000-01-01 00:00:00']);
        $this->auditAttempts = 0;
        $this->auditSqlstate = '23505';
        $this->auditConstraint = $constraint;
        $this->auditFailures = 5;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Fixed'])->assertStatus($status)->assertJsonPath('outcome', $outcome);
        $this->assertSame(1, $this->auditAttempts);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        $this->assertSame('2000-01-01 00:00:00', DB::table('report_action_audit')->value('performed_at'));
        $this->assertCount(1, $this->patches);
        if ($status !== 200) {
            Log::shouldHaveReceived('critical')->once();
            $this->assertSame([], $this->activityPosts);
        } else {
            Log::shouldNotHaveReceived('critical');
            $this->assertCount(1, $this->activityPosts);
        }
    }

    private function assertTerminalActivity(string $event, string $reference, string $privateResponse): void
    {
        $this->assertCount(1, $this->activityPosts);
        $row = $this->activityPosts[0];
        $this->assertSame('40000000-0000-4000-8000-000000000001', $row['inspector_id']);
        $this->assertSame($event, $row['event_type']);
        $this->assertTrue(\Illuminate\Support\Str::isUuid($row['id']));
        $this->assertStringContainsString('MPDO responded to '.$reference, $row['subtitle']);
        $this->assertStringContainsString('My Reports', $row['subtitle']);
        $this->assertStringNotContainsString($privateResponse, json_encode($row));
        $this->assertEqualsCanonicalizing(['id', 'inspector_id', 'event_type', 'title', 'subtitle'], array_keys($row));
    }

    public function test_terminal_replay_and_opposite_outcome_never_notify_again_even_after_user_deletes_activity(): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Fixed'])->assertOk();
        $this->assertCount(1, $this->activityPosts);
        $this->remote['activity_log'] = [];
        foreach (['resolved', 'wont_fix'] as $status) {
            $this->handle(self::LEGACY, $status, ['response_message' => 'Replay'])->assertConflict();
        }
        $this->assertCount(1, $this->activityPosts);
        $this->assertCount(1, $this->patches);
    }

    public function test_same_event_is_deduped_without_resetting_read_state(): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Fixed'])->assertOk();
        $this->assertCount(1, $this->activityPosts);
        $this->remote['activity_log'][0]['is_read'] = true;
        $original = $this->remote['activity_log'][0];
        $result = app(\App\Support\InspectorReportNotice::class)->send($this->remote['diagnostic_reports'][1]);
        $this->assertSame('already_present', $result);
        $this->assertSame([$original], $this->remote['activity_log']);
        $this->assertSame($this->activityPosts[0]['id'], $this->activityPosts[1]['id']);
    }

    public function test_lost_notification_acknowledgement_is_read_back_without_reposting(): void
    {
        $this->activityFailure = 'lost_after_insert';
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Private response'])->assertOk()
            ->assertJsonPath('notification_status', 'already_present');
        $this->assertCount(1, $this->activityPosts);
        $this->assertCount(1, $this->remote['activity_log']);
        $this->assertCount(1, $this->patches);
    }

    public static function notificationFailures(): array
    {
        return [['rejected', 'rejected'], ['lost_before_insert', 'delivery_unconfirmed']];
    }

    public function test_notification_confirmation_ignores_json_key_order(): void
    {
        $this->activityFailure = 'reordered_keys';
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'wont_fix', ['response_message' => 'Reviewed'])->assertOk()
            ->assertJsonPath('notification_status', 'delivered');
    }

    public function test_existing_event_for_different_recipient_is_not_confirmed_or_overwritten(): void
    {
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Reviewed'])->assertOk();
        $this->assertCount(1, $this->activityPosts);
        $original = $this->remote['activity_log'];
        $report = $this->remote['diagnostic_reports'][1];
        $report['inspector_id'] = '99999999-0000-4000-8000-000000000099';
        $this->assertSame('identity_conflict', app(\App\Support\InspectorReportNotice::class)->send($report));
        $this->assertSame($original, $this->remote['activity_log']);
    }

    public function test_missing_recipient_fails_closed_after_preserving_report_and_audit(): void
    {
        $this->remote['diagnostic_reports'][1]['inspector_id'] = null;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Reviewed'])->assertStatus(207)
            ->assertJsonPath('notification_status', 'invalid_report_identity')->assertJsonPath('audit_recorded', true);
        $this->assertSame([], $this->activityPosts);
    }

    public function test_unexpected_notification_failure_cannot_erase_successful_business_result(): void
    {
        $notice = \Mockery::mock(\App\Support\InspectorReportNotice::class);
        $notice->shouldReceive('send')->once()->andThrow(new \RuntimeException('Private exception'));
        $this->app->instance(\App\Support\InspectorReportNotice::class, $notice);
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Reviewed'])->assertStatus(207)
            ->assertJsonPath('outcome', 'notification_failed')->assertJsonPath('audit_recorded', true);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        $this->assertCount(1, $this->patches);
    }

    public function test_unknown_delivery_and_failed_readback_never_reposts(): void
    {
        $this->activityFailure = 'lost_after_insert';
        $this->remoteTableFails = ['activity_log'];
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'wont_fix', ['response_message' => 'Reviewed'])->assertStatus(207)
            ->assertJsonPath('notification_status', 'delivery_unconfirmed');
        $this->assertCount(1, $this->activityPosts);
        $this->assertCount(1, $this->patches);
    }

    #[DataProvider('notificationFailures')]
    public function test_notification_failure_preserves_response_and_audit_with_explicit_safe_result(string $failure, string $classification): void
    {
        Log::spy();
        $this->activityFailure = $failure;
        $this->actingAs($this->admin);
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Private response'])->assertStatus(207)
            ->assertJsonPath('outcome', 'notification_failed')->assertJsonPath('remote_updated', true)
            ->assertJsonPath('audit_recorded', true)->assertJsonPath('notification_status', $classification);
        $this->assertCount(1, $this->patches);
        $this->assertCount(1, $this->activityPosts);
        $this->assertSame('resolved', $this->remote['diagnostic_reports'][1]['status']);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        Log::shouldHaveReceived('warning')->once()->withArgs(fn ($message, $context) =>
            $context['report_id'] === self::LEGACY && $context['classification'] === $classification
            && ! str_contains(json_encode($context), 'Private'));
        $this->handle(self::LEGACY, 'resolved', ['response_message' => 'Do not retry'])->assertConflict();
        $this->assertCount(1, $this->activityPosts);
    }

    public function test_safe_response_projection_and_role_specific_controls(): void
    {
        $this->remote['diagnostic_reports'][1] += ['response_message' => 'https://example.test/?token=private',
            'responded_by_name' => 'Admin', 'responded_at' => '2026-10-04T09:30:00Z',
            'performed_by' => 99, 'audit_id' => 4, 'escalation_state' => 'private'];
        $this->actingAs($this->admin);
        $this->page(self::LEGACY)->assertJsonPath('props.handlingActions', ['in_review', 'resolved', 'wont_fix']);
        $this->page(self::REPORT)->assertJsonPath('props.handlingActions', [])->assertJsonPath('props.canNotify', true);
        $this->remote['diagnostic_reports'][1]['status'] = 'resolved';
        $this->page(self::LEGACY)->assertJsonPath('props.handlingActions', [])
            ->assertJsonPath('props.report.response_message', '[redacted sensitive link]')
            ->assertJsonPath('props.report.responded_by_name', 'Admin')->assertJsonMissingPath('props.report.performed_by')
            ->assertJsonMissingPath('props.report.audit_id')->assertJsonMissingPath('props.report.escalation_state');
        $projection = app(DiagnosticReportReader::class)->all()['reports'];
        $this->assertArrayHasKey('response_message', $projection[1]);
        $this->assertArrayHasKey('responded_at', $projection[1]);
    }

    public function test_invalid_uuid_and_inspector_or_guest_never_write(): void
    {
        $this->postJson('/diagnostics/'.self::LEGACY.'/handle', ['status' => 'in_review'])->assertUnauthorized();
        $this->actingAs($this->user('Site Inspector', 'Inspector'));
        $this->handle(self::LEGACY, 'in_review')->assertForbidden();
        $this->actingAs($this->admin);
        $this->handle('not-a-uuid', 'in_review')->assertNotFound();
        $this->handle(self::LEGACY.'?status=neq.resolved', 'in_review')->assertStatus(405);
        $this->assertSame([], $this->patches);
    }
}
