<?php

namespace Tests\Feature;

use App\Models\ReportEscalation;
use App\Services\ReportLifecycleLock;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\ReportingTestCase;

/**
 * Real routes, real authorization, real remote fake, real local tables.
 *
 * The PostgreSQL-only CHECK constraints and the advisory lock cannot run on the
 * SQLite harness, so the portable subset of the schema is built here exactly as
 * the migration builds it, and the real migration, real constraints and real
 * concurrency are proven against a disposable PostgreSQL cluster in
 * tests/Integration/ReportEscalationsPostgresTest.php.
 */
class ReportEscalationTest extends ReportingTestCase
{
    private array $patches = [];

    protected function setUp(): void
    {
        parent::setUp();
        // Escalation and terminal handling are POST routes exercised by one suite,
        // so CSRF is disabled once here rather than per test.
        $this->withoutMiddleware(\App\Http\Middleware\VerifyCsrfToken::class);
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        // The terminal-gate tests drive a real report transition, which needs the
        // same authoritative audit table ReportHandlingTest builds.
        Schema::create('report_action_audit', function ($t) {
            $t->id(); $t->uuid('report_id'); $t->string('action', 60);
            $t->string('from_status', 20); $t->string('to_status', 20);
            $t->foreignId('performed_by')->constrained('users')->restrictOnDelete();
            $t->string('performed_by_name'); $t->timestamp('performed_at')->useCurrent();
            $t->unique(['report_id', 'action']);
        });
        $this->remoteWrite = function ($request) {
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/activity_log') {
                return Http::response([$request->data()], 201);
            }
            $this->assertSame('PATCH', $request->method());
            $this->assertSame('/rest/v1/diagnostic_reports', parse_url($request->url(), PHP_URL_PATH));
            parse_str(parse_url($request->url(), PHP_URL_QUERY), $params);
            $this->patches[] = $params;
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

    private function open(string $report = self::LEGACY): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/diagnostics/{$report}/escalations", []);
    }

    /** Every escalation route in this suite is an authenticated Admin action. */
    private function actingAsAdmin($user = null): static
    {
        $this->withoutMiddleware(\App\Http\Middleware\VerifyCsrfToken::class);
        $this->actingAs($user ?? $this->admin);

        return $this;
    }

    /**
     * Open one episode and return its id.
     *
     * Written as an explicit helper rather than a bare `$this->episode()` call in
     * each test, because an unopened episode must fail loudly here instead of
     * surfacing later as a confusing ModelNotFoundException.
     */
    private function openEpisode(string $report = self::LEGACY): int
    {
        $this->open($report)->assertCreated();

        // Resolve the NEWEST OPEN episode, not simply the first row: a report may
        // hold several historical episodes, and returning an already-closed one
        // would make the caller's next mutation look like a lifecycle conflict
        // instead of the real bug.
        $id = ReportEscalation::query()
            ->where('report_id', strtolower($report))
            ->where('status', ReportEscalation::OPEN)
            ->orderByDesc('id')
            ->value('id');
        $this->assertNotNull($id, 'An open episode must exist after a successful open.');

        return (int) $id;
    }

    private function recommend(int $id, mixed $text): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/diagnostics/".self::LEGACY."/escalations/{$id}/recommendation", ['recommendation' => $text]);
    }

    private function close(int $id, ?string $note = null): \Illuminate\Testing\TestResponse
    {
        return $this->postJson("/diagnostics/".self::LEGACY."/escalations/{$id}/close", ['closure_note' => $note]);
    }

    private function episode(): ReportEscalation
    {
        return ReportEscalation::query()->firstOrFail();
    }

    // --- AUTHORITY ---

    public function test_admin_may_open_a_technical_issue_escalation(): void
    {
        $this->actingAsAdmin();
        $this->open()->assertCreated()->assertJsonPath('outcome', 'opened');
        $this->assertSame(1, DB::table('report_escalations')->count());
        $this->assertDatabaseHas('report_escalations', ['report_id' => self::LEGACY, 'status' => 'open',
            'created_by' => $this->admin->id]);
        // The remote report is never touched by escalation work.
        $this->assertSame([], $this->patches);
    }

    #[DataProvider('forbiddenActors')]
    public function test_only_admin_reaches_the_escalation_routes(string $role): void
    {
        $this->actingAsAdmin($role === 'Site Inspector' ? $this->user('Site Inspector', 'Inspector') : ($role === 'other' ? $this->other : $this->po));
        foreach ([['/escalations', []], ['/escalations/1/recommendation', ['recommendation' => 'x']], ['/escalations/1/close', []]] as [$suffix, $body]) {
            $this->postJson('/diagnostics/'.self::LEGACY.$suffix, $body)->assertForbidden();
        }
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public static function forbiddenActors(): array
    {
        return [['current PO'], ['other'], ['Site Inspector']];
    }

    public function test_site_inspector_has_no_diagnostics_authority_at_all(): void
    {
        $this->actingAsAdmin($this->user('Site Inspector', 'Inspector'));
        $this->postJson('/diagnostics/'.self::LEGACY.'/escalations', [])->assertForbidden();
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public function test_application_support_is_never_escalatable(): void
    {
        $this->actingAsAdmin();
        $this->open(self::REPORT)->assertForbidden()->assertJsonPath('outcome', 'denied');
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    // --- REMOTE CONTRACT ---

    public function test_open_ignores_and_never_persists_a_closure_note(): void
    {
        // An episode that has just been opened has not ended, so it has nothing
        // to describe. The field must not be accepted, and must never be stored
        // even if a caller sends one.
        $this->actingAsAdmin();
        $this->postJson('/diagnostics/'.self::LEGACY.'/escalations', ['closure_note' => 'Already closed.'])
            ->assertCreated();
        $row = $this->episode()->fresh();
        $this->assertNull($row->closure_note);
        $this->assertSame('open', $row->status);
        $this->assertNull($row->closed_by);
        $this->assertNull($row->closed_at);
    }

    public function test_history_projects_recommendation_and_closure_note_for_a_closed_episode(): void
    {
        // An episode can close WITH a recommendation, WITHOUT one, or with both.
        // The history must carry whichever fields exist, because the panel renders
        // exactly what it receives: an omitted field is invisible there.
        $this->actingAsAdmin();
        $both = $this->openEpisode();
        $this->recommend($both, 'Roll back the sync batch.')->assertOk();
        $this->close($both, 'Consultation concluded after the fix landed.')->assertOk();

        $noteOnly = $this->openEpisode();
        $this->close($noteOnly, 'Acceptance test - escalation closed without recommendation.')->assertOk();

        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/diagnostics/'.self::LEGACY));
        $props = $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport.open', null);

        $closed = $props->json('props.developmentSupport.closed');
        $this->assertCount(2, $closed);

        $withBoth = collect($closed)->firstWhere('id', $both);
        $this->assertSame('Roll back the sync batch.', $withBoth['recommendation']);
        $this->assertSame('Consultation concluded after the fix landed.', $withBoth['closure_note']);

        $withNoteOnly = collect($closed)->firstWhere('id', $noteOnly);
        $this->assertNull($withNoteOnly['recommendation'], 'No recommendation was recorded, so none may be projected.');
        $this->assertSame('Acceptance test - escalation closed without recommendation.', $withNoteOnly['closure_note']);

        foreach ($closed as $episode) {
            $this->assertArrayHasKey('closure_note', $episode);
        }
    }

    public function test_opening_remains_possible_while_the_support_contact_is_unconfigured(): void
    {
        // The v1 contract is Admin-mediated internal support through an EXTERNAL
        // channel. An unset contact must never block opening an episode: the Admin
        // may still consult out of band and record the outcome, closing with a
        // closure note if no recommendation comes back.
        config(['imaps.contact' => ['name' => null, 'email' => null, 'channel' => null, 'instructions' => null]]);
        $this->actingAsAdmin();
        $this->assertFalse(config('imaps.contact.name') !== null);

        $this->open()->assertCreated()->assertJsonPath('outcome', 'opened');
        $id = $this->episode()->id;
        $this->close($id, 'Support channel unavailable; escalation cancelled.')->assertOk();

        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/diagnostics/'.self::LEGACY));
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport.contactConfigured', false);
    }

    public function test_absent_remote_report_is_not_found_and_writes_nothing(): void
    {
        // A successful read that proves no such report exists must be a 404, not a
        // 503 that invites a pointless retry.
        $this->remote['diagnostic_reports'] = [];
        $this->actingAsAdmin();
        $this->open()->assertNotFound()->assertJsonPath('outcome', 'not_found');
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public function test_unavailable_remote_report_is_503_and_writes_nothing(): void
    {
        $this->remoteTableFails = ['diagnostic_reports'];
        $this->actingAsAdmin();
        $this->open()->assertStatus(503)->assertJsonPath('outcome', 'unavailable');
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public function test_unknown_report_uuid_is_not_found(): void
    {
        $this->actingAsAdmin();
        $this->open('00000000-0000-4000-8000-000000000000')->assertNotFound();
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    #[DataProvider('terminalStatuses')]
    public function test_terminal_report_cannot_start_or_extend_an_escalation(string $terminal): void
    {
        $this->remote['diagnostic_reports'][1]['status'] = $terminal;
        $this->actingAsAdmin();
        $this->open()->assertConflict()->assertJsonPath('outcome', 'conflict');
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public static function terminalStatuses(): array
    {
        return [['resolved'], ['wont_fix']];
    }

    #[DataProvider('nonterminalStatuses')]
    public function test_either_nonterminal_status_may_open_an_episode(string $status): void
    {
        $this->remote['diagnostic_reports'][1]['status'] = $status;
        $this->actingAsAdmin();
        $this->open()->assertCreated();
        $this->assertSame(1, DB::table('report_escalations')->count());
    }

    public static function nonterminalStatuses(): array
    {
        return [['submitted'], ['in_review']];
    }

    public function test_escalation_is_keyed_by_the_exact_uuid_never_a_reference_code(): void
    {
        $this->remote['diagnostic_reports'][1]['reference_code'] = 'DR-2026-9999';
        $this->actingAsAdmin();
        $this->open()->assertCreated();
        $this->assertSame(self::LEGACY, $this->episode()->report_id);
        // The same reference on a different report is a different escalation.
        $this->remote['diagnostic_reports'][0]['reference_code'] = 'DR-2026-9999';
        $this->postJson('/diagnostics/'.self::REPORT.'/escalations', [])->assertForbidden();
    }

    // --- LIFECYCLE ---

    public function test_a_second_open_episode_is_refused_by_the_partial_unique_index(): void
    {
        $this->actingAsAdmin();
        $this->open()->assertCreated();
        $this->open()->assertConflict()->assertJsonPath('outcome', 'conflict');
        $this->assertSame(1, DB::table('report_escalations')->where('status', 'open')->count());
    }

    public function test_real_duplicate_open_violation_is_absorbed_as_a_conflict(): void
    {
        // Two genuinely concurrent opens both pass the gate lookup before either
        // commits, so the partial unique index is the only thing standing between
        // them. A gate that reports "no open episode" isolates exactly that path.
        $gate = \Mockery::mock(\App\Support\ReportEscalationGate::class);
        $gate->shouldReceive('hasOpen')->andReturn(false);
        $this->app->instance(\App\Support\ReportEscalationGate::class, $gate);
        DB::table('report_escalations')->insert(['report_id' => self::LEGACY, 'status' => 'open',
            'created_by' => $this->admin->id, 'created_at' => now()]);

        $result = app(\App\Services\ReportEscalationService::class)->open($this->admin, self::LEGACY, []);
        $this->assertSame('conflict', $result['outcome']);
        $this->assertSame(409, $result['http_status']);
        $this->assertSame(1, DB::table('report_escalations')->where('status', 'open')->count());
    }

    public function test_recommendation_is_recorded_once_and_never_overwritten(): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->recommend($id, 'First answer.')->assertOk()->assertJsonPath('outcome', 'recommended');
        $this->recommend($id, 'Second answer.')->assertConflict();
        $row = $this->episode()->fresh();
        $this->assertSame('First answer.', $row->recommendation);
        $this->assertSame($this->admin->id, (int) $row->recommendation_recorded_by);
        $this->assertNotNull($row->recommendation_at);
    }

    public static function badText(): array
    {
        return [[null], [''], ["  \t\n "], ['<p>HTML</p>'], ["bad\0null"], [str_repeat('x', 2001)]];
    }

    #[DataProvider('badText')]
    public function test_recommendation_rejects_blank_markup_and_oversized_text(mixed $text): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->recommend($id, $text)->assertStatus(422)->assertJsonValidationErrors('recommendation');
        $this->assertNull($this->episode()->fresh()->recommendation);
    }

    public function test_close_with_recommendation_needs_no_closure_note(): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->recommend($id, 'Fixed in 3.2.1.')->assertOk();
        $this->close($id)->assertOk()->assertJsonPath('outcome', 'closed');
        $row = $this->episode()->fresh();
        $this->assertSame('closed', $row->status);
        $this->assertSame($this->admin->id, (int) $row->closed_by);
        $this->assertNotNull($row->closed_at);
        $this->assertNull($row->closure_note);
    }

    public function test_close_without_recommendation_requires_an_explainable_note(): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->close($id)->assertStatus(422)->assertJsonPath('outcome', 'invalid');
        $this->close($id, "   ")->assertStatus(422);
        $this->assertSame('open', $this->episode()->fresh()->status);
        $this->close($id, 'Support channel unavailable; escalation cancelled.')->assertOk();
        $this->assertSame('Support channel unavailable; escalation cancelled.', $this->episode()->fresh()->closure_note);
    }

    public function test_closed_rows_are_immutable_and_a_later_episode_is_a_new_row(): void
    {
        $this->actingAsAdmin();
        $first = $this->openEpisode();
        $this->recommend($first, 'Guidance.')->assertOk();
        $this->close($first)->assertOk();
        // No edit, no reopen, no recommendation on a closed row.
        $this->recommend($first, 'Changed my mind.')->assertConflict();
        $this->close($first)->assertConflict();
        $this->assertSame('closed', $this->episode()->fresh()->status);
        $this->assertSame('Guidance.', $this->episode()->fresh()->recommendation);

        $second = $this->open()->assertCreated();
        $this->assertSame(2, DB::table('report_escalations')->count());
        $this->assertSame(1, DB::table('report_escalations')->where('status', 'open')->count());
        $this->assertSame($first, $this->episode()->where('status', 'closed')->value('id'));
        $this->assertNotSame($first, $second->json('escalation_id') ?? $second->json('message') ? $this->episode()->where('status', 'open')->value('id') : $first);
    }

    public function test_an_episode_of_another_report_is_never_addressed(): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->recommend($id, 'Answer.')->assertOk();
        // Same escalation id, different report in the URL.
        $this->postJson('/diagnostics/'.self::REPORT."/escalations/{$id}/recommendation", ['recommendation' => 'x'])->assertForbidden();
        $this->postJson('/diagnostics/'.self::REPORT."/escalations/{$id}/close", [])->assertForbidden();
        $this->assertSame('Answer.', $this->episode()->fresh()->recommendation);
    }

    // --- TERMINAL GATE ---

    public function test_open_escalation_removes_only_the_terminal_actions(): void
    {
        $this->actingAsAdmin();
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/diagnostics/'.self::LEGACY));
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.handlingActions', ['in_review', 'resolved', 'wont_fix']);

        $this->openEpisode();
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.handlingActions', ['in_review']);

        $this->remote['diagnostic_reports'][1]['status'] = 'in_review';
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.handlingActions', []);
    }

    #[DataProvider('terminalStatuses')]
    public function test_forged_terminal_post_while_escalation_is_open_is_refused_with_409(string $terminal): void
    {
        $this->actingAsAdmin();
        $this->openEpisode();
        $this->postJson('/diagnostics/'.self::LEGACY.'/handle', ['status' => $terminal, 'response_message' => 'Forged'])
            ->assertStatus(409)->assertJsonPath('outcome', 'conflict');
        // No remote CAS was attempted and no audit row exists.
        $this->assertSame([], $this->patches);
        $this->assertSame(0, DB::table('report_action_audit')->count());
        $this->assertSame('submitted', $this->remote['diagnostic_reports'][1]['status']);
    }

    public function test_mark_in_review_still_works_while_an_escalation_is_open(): void
    {
        $this->actingAsAdmin();
        $this->openEpisode();
        $this->postJson('/diagnostics/'.self::LEGACY.'/handle', ['status' => 'in_review'])->assertOk();
        $this->assertCount(1, $this->patches);
        $this->assertSame('in_review', $this->remote['diagnostic_reports'][1]['status']);
    }

    public function test_terminal_handling_returns_after_an_explicit_close_and_notifies_the_inspector(): void
    {
        $this->actingAsAdmin();
        $id = $this->openEpisode();
        $this->recommend($id, 'Roll back the sync batch.')->assertOk();
        $this->close($id)->assertOk();
        $this->postJson('/diagnostics/'.self::LEGACY.'/handle', ['status' => 'resolved', 'response_message' => 'Fixed.'])
            ->assertOk()->assertJsonPath('outcome', 'success')->assertJsonPath('notification_status', 'delivered');
        $this->assertSame('resolved', $this->remote['diagnostic_reports'][1]['status']);
    }

    public function test_terminal_handling_refuses_once_the_report_is_already_final_even_with_no_escalation(): void
    {
        $this->remote['diagnostic_reports'][1]['status'] = 'resolved';
        $this->actingAsAdmin();
        $this->postJson('/diagnostics/'.self::LEGACY.'/handle', ['status' => 'wont_fix', 'response_message' => 'x'])
            ->assertConflict();
        $this->assertSame([], $this->patches);
    }

    // --- CONCURRENCY PRIMITIVE ---

    public function test_lifecycle_lock_keys_are_deterministic_and_report_specific(): void
    {
        $uuid = '0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d';
        $this->assertSame(ReportLifecycleLock::keys($uuid), ReportLifecycleLock::keys(strtoupper($uuid)));
        $this->assertSame(ReportLifecycleLock::keys($uuid), ReportLifecycleLock::keys($uuid));
        $this->assertNotSame(ReportLifecycleLock::keys($uuid), ReportLifecycleLock::keys('b30569b6-e126-447e-a24f-d375b0782529'));
        $this->assertCount(2, ReportLifecycleLock::keys($uuid));
        // A transaction-scoped advisory lock is released by commit; a no-op on
        // SQLite, where there is no second concurrent connection to serialize.
        DB::beginTransaction();
        app(ReportLifecycleLock::class)->acquire($uuid);
        $this->assertSame(1, DB::transactionLevel());
        DB::rollBack();
        $this->expectException(\InvalidArgumentException::class);
        app(ReportLifecycleLock::class)->acquire('not-a-uuid');
    }

    // --- PAGE PROP SCOPE ---

    public function test_development_support_prop_is_produced_only_for_an_admin_technical_issue(): void
    {
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/diagnostics/'.self::LEGACY));
        $this->actingAsAdmin();
        $props = fn () => $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])->assertOk();

        $props()->assertJsonPath('props.developmentSupport.escalatable', true)
            ->assertJsonPath('props.developmentSupport.open', null)
            ->assertJsonPath('props.developmentSupport.contactConfigured', false)
            ->assertJsonPath('props.developmentSupport.contact', ['name' => null, 'email' => null, 'channel' => null, 'instructions' => null]);

        $this->openEpisode();
        $props()->assertJsonPath('props.developmentSupport.open.recommendation', null);

        // A Planning Officer never receives the prop at all.
        $this->actingAs($this->po);
        $this->get('/diagnostics/'.self::REPORT, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport', null);
        // Nor does an Admin see it on an Application Support report.
        $this->actingAsAdmin();
        $this->get('/diagnostics/'.self::REPORT, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport', null);
    }

    public function test_configured_contact_is_exposed_and_a_terminal_report_is_not_escalatable(): void
    {
        config(['imaps.contact' => ['name' => 'Dev Team', 'email' => 'dev@example.test',
            'channel' => 'Ext 12', 'instructions' => 'Call during office hours.', 'api_key' => 'must-never-appear']]);
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/diagnostics/'.self::LEGACY));
        $this->actingAsAdmin();
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport.contactConfigured', true)
            ->assertJsonPath('props.developmentSupport.contact.name', 'Dev Team')
            // Only the four documented safe fields are ever read.
            ->assertJsonMissingPath('props.developmentSupport.contact.api_key');

        $this->remote['diagnostic_reports'][1]['status'] = 'resolved';
        $this->get('/diagnostics/'.self::LEGACY, ['X-Inertia' => 'true', 'X-Inertia-Version' => $version])
            ->assertOk()->assertJsonPath('props.developmentSupport.escalatable', false)
            ->assertJsonPath('props.developmentSupport.closed', []);
    }
}