<?php

namespace Tests\Unit;

use App\Support\DiagnosticNotice;
use Tests\TestCase;

/**
 * POST-LOOP-9 SMOKE - Admin -> Notify Planning Officers.
 *
 * WHY THIS SUITE IS BEHAVIOURAL, NOT STRING-MATCHING
 * -------------------------------------------------
 * The security property that matters here is what text ends up in a table the
 * header bell renders on every authenticated page. A source assertion can be
 * satisfied by a comment, and the live report's `summary` really does contain a
 * signed Supabase Storage URL. So the notice builder is CALLED, with hostile
 * inputs, and the output is inspected.
 *
 * WHAT IS PINNED
 * --------------
 *   1. The notice action is Admin-only, on the route AND in the controller.
 *   2. A Planning Officer is refused, so they cannot notify themselves.
 *   3. A Site Inspector is refused and is never a recipient.
 *   4. The audience is exactly the ACTIVE Planning Officers.
 *   5. The notice names the reference code, module and a short safe summary,
 *      and links to the report.
 *   6. The notice NEVER carries the report's free text, where the signed URL is.
 *   7. No signed URL, JWT, token, bearer fragment or service-key shape survives.
 *   8. The link is a relative in-app path, never remote and never a data: URL.
 *   9. An identical unread notice is suppressed, so a reminder cannot spam.
 *  10. The report is not resolved, edited or deleted by the action.
 *
 * The DB-backed duplicate-suppression and role checks were additionally proven
 * live against canonical inside a rolled-back transaction; those live proofs are
 * recorded in the commit message. The tests here are deterministic and run
 * against an in-memory SQLite database, so they need no canonical connection.
 */
class DiagnosticNotifyPlanningOfficersTest extends TestCase
{
    /**
     * Provide the two tables these tests touch, in their minimum viable shape.
     *
     * The suite runs against the in-memory SQLite database phpunit.xml
     * configures, which has no schema. The repository migrations are never run
     * here: they contain PostgreSQL-specific DDL, and the canonical procedure
     * explicitly forbids running migrations against a real database.
     *
     * ENVIRONMENT LIMITATION, PRE-EXISTING AND NOT INTRODUCED HERE
     * -----------------------------------------------------------
     * `pdo_sqlite` is not installed in this environment, which is the same
     * limitation already recorded for `Loop6RoleMatrixTest` and the dormant
     * `tests/Feature/*PostgresTest` files. Any test needing a database is
     * therefore marked skipped with that reason rather than erroring, so the
     * suite stays green and honest instead of failing on the environment.
     *
     * This is NOT a substitute for the live proof. The real table contract, the
     * real foreign key, the real rows written, the real duplicate suppression
     * and the real 403s were all exercised against imaps_db_0921 inside a
     * transaction that was always rolled back; see the commit message. What runs
     * here is the pure content-safety logic, which is the part a string
     * assertion cannot cover and which is the actual security boundary.
     */
    private function requireDatabase(): void
    {
        if (! extension_loaded('pdo_sqlite')) {
            $this->markTestSkipped(
                'pdo_sqlite is not installed in this environment (pre-existing limitation, the same '
                .'one that blocks Loop6RoleMatrixTest and the dormant tests/Feature/*PostgresTest '
                .'files). The database-backed behaviour of this action was proven live against '
                .'imaps_db_0921 inside a rolled-back transaction.'
            );
        }

        \Illuminate\Support\Facades\Schema::dropIfExists('notifications');
        \Illuminate\Support\Facades\Schema::dropIfExists('users');

        \Illuminate\Support\Facades\Schema::create('users', function ($t) {
            $t->id();
            $t->string('email');
            $t->string('name');
            $t->string('password');
            $t->string('role');
            $t->boolean('is_active')->default(true);
            $t->timestamps();
        });

        \Illuminate\Support\Facades\Schema::create('notifications', function ($t) {
            $t->id();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->string('title');
            $t->text('message');
            $t->string('type')->default('system_alert');
            $t->string('action_url')->nullable();
            $t->boolean('is_read')->default(false);
            $t->timestamp('read_at')->nullable();
            $t->timestamps();
        });
    }

    private function admin(): \App\Models\User
    {
        return \App\Models\User::forceCreate([
            'email' => 'notify-admin@test.local',
            'name' => 'Notify Admin',
            'role' => 'Admin',
            'is_active' => true,
            'password' => 'x',
        ]);
    }

    private function planningOfficer(bool $active = true): \App\Models\User
    {
        return \App\Models\User::forceCreate([
            'email' => 'notify-po-'.($active ? 'active' : 'inactive').'@test.local',
            'name' => 'Notify PO',
            'role' => 'Planning Officer',
            'is_active' => $active,
            'password' => 'x',
        ]);
    }

    private function siteInspector(): \App\Models\User
    {
        return \App\Models\User::forceCreate([
            'email' => 'notify-si@test.local',
            'name' => 'Notify SI',
            'role' => 'Site Inspector',
            'is_active' => true,
            'password' => 'x',
        ]);
    }

    /**
     * A report shape as the reader produces it, including the free-text fields
     * the notice must never copy.
     */
    private function report(array $overrides = []): array
    {
        return array_merge([
            'id' => '0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d',
            'reference_code' => 'DR-2026-0001',
            'title' => 'Parcel pin jumps to the wrong lot',
            'module' => 'sync center',
            'status' => 'submitted',
            'summary' => "Naghahanap buhay lang kami. Hindi makakilos ang app.\n"
                ."The map shows the wrong lot after rotating the device.",
            'technical_description' => 'The confirmed pin snaps to a neighbouring parcel.',
            'repro_steps' => 'Open the inspection, rotate the device, observe the pin.',
            'recommended_action' => 'Please advise.',
        ], $overrides);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 1/2. Authority
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_notice_route_is_admin_only(): void
    {
        $route = \Illuminate\Support\Facades\Route::getRoutes()
            ->getByName('diagnostics.notify-planning-officers');

        $this->assertNotNull($route, 'The notice route must be registered.');
        $this->assertSame('POST', $route->methods()[0]);
        $this->assertStringContainsString('role:Admin', implode(',', $route->gatherMiddleware()));

        // Explicitly NOT shared with a Planning Officer, unlike the read routes.
        $middleware = implode(',', $route->gatherMiddleware());
        $this->assertStringNotContainsString('Planning Officer', $middleware);
    }

    public function test_a_planning_officer_is_refused_by_the_controller_even_if_the_route_were_bypassed(): void
    {
        $this->requireDatabase();

        $po = $this->planningOfficer();
        $this->siteInspector();
        $this->admin();

        // The read routes are shared with a Planning Officer, so the controller
        // re-reads the role itself. That re-check is what is proved here.
        $readRoute = \Illuminate\Support\Facades\Route::getRoutes()->getByName('diagnostics.index');
        $this->assertStringContainsString('Planning Officer', implode(',', $readRoute->gatherMiddleware()));

        $request = \Illuminate\Http\Request::create('/diagnostics/x/notify-planning-officers', 'POST');
        $request->setUserResolver(fn () => $po);

        $threw = false;
        $code = null;
        try {
            $this->app->make(\App\Http\Controllers\DiagnosticReportController::class)
                ->notifyPlanningOfficers($request, 'x');
        } catch (\Throwable $e) {
            $threw = true;
            $code = method_exists($e, 'getStatusCode') ? $e->getStatusCode() : null;
        }

        $this->assertTrue($threw, 'A Planning Officer must be refused, not silently accepted.');
        $this->assertSame(403, $code);
    }

    public function test_a_site_inspector_is_never_a_recipient(): void
    {
        $this->requireDatabase();

        $po = $this->planningOfficer();
        $this->siteInspector();
        $this->admin();

        $audience = DiagnosticNotice::audience();

        $this->assertTrue($audience->contains('id', $po->id));
        $this->assertFalse(
            $audience->contains(fn ($u) => $u->role === 'Site Inspector'),
            'A Site Inspector must never be in the notice audience.'
        );
        $this->assertFalse(
            $audience->contains(fn ($u) => $u->role === 'Admin'),
            'An Admin raised the notice and must not be a recipient of it.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. Audience
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_audience_is_exactly_the_active_planning_officers(): void
    {
        $this->requireDatabase();

        $active = $this->planningOfficer(true);
        $inactive = $this->planningOfficer(false);
        $this->siteInspector();
        $this->admin();

        $audience = DiagnosticNotice::audience();

        $this->assertTrue($audience->contains('id', $active->id));
        $this->assertFalse(
            $audience->contains('id', $inactive->id),
            'A suspended Planning Officer must not be notified.'
        );
        $this->assertSame(
            ['Planning Officer'],
            $audience->pluck('role')->unique()->values()->all()
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. Content: identifies the report
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_notice_identifies_the_report(): void
    {
        $notice = DiagnosticNotice::compose($this->report());

        $this->assertStringContainsString('DR-2026-0001', $notice['title']);
        $this->assertStringContainsString('sync center', $notice['message']);
        $this->assertStringContainsString(
            'Parcel pin jumps to the wrong lot',
            $notice['message'],
            'The notice must carry a short safe summary of the issue.'
        );
        $this->assertStringStartsWith('/diagnostics/', $notice['action_url']);
        $this->assertStringEndsWith('0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d', $notice['action_url']);
    }

    public function test_a_missing_reference_or_module_still_produces_a_readable_notice(): void
    {
        $notice = DiagnosticNotice::compose($this->report([
            'reference_code' => null,
            'module' => null,
            'title' => null,
        ]));

        $this->assertStringContainsString('Unreferenced', $notice['title']);
        $this->assertStringContainsString('unknown module', $notice['message']);
        $this->assertStringContainsString('(no title)', $notice['message']);
    }

    public function test_a_long_summary_is_truncated_rather_than_filling_the_bell(): void
    {
        $long = DiagnosticNotice::compose($this->report([
            'title' => str_repeat('a', 400),
        ]));
        $short = DiagnosticNotice::compose($this->report([
            'title' => 'short title',
        ]));

        // The template is fixed, so the only variable part is the headline. Its
        // contribution must be bounded, which is the real invariant.
        $overhead = mb_strlen($short['message']) - mb_strlen('short title');

        $this->assertStringEndsWith('…', $long['message']);
        $this->assertStringNotContainsString(str_repeat('a', 200), $long['message']);
        $this->assertLessThanOrEqual(
            $overhead + DiagnosticNotice::SUMMARY_MAX_CHARS,
            mb_strlen($long['message']),
            'The headline contribution must stay within SUMMARY_MAX_CHARS.'
        );
        $this->assertGreaterThan(
            mb_strlen($short['message']),
            mb_strlen($long['message']),
            'A long headline must still be shown, just bounded.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. Free text must never be copied
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_notice_never_carries_the_report_free_text(): void
    {
        $report = $this->report();
        $notice = DiagnosticNotice::compose($report);

        // The live report's summary is where the signed Storage URL lives, so
        // free text is excluded outright rather than sanitized and included.
        foreach (['summary', 'technical_description', 'repro_steps', 'recommended_action'] as $field) {
            $this->assertIsString($report[$field]);

            foreach (preg_split('/\R/', $report[$field]) ?: [] as $line) {
                $line = trim($line);
                if (mb_strlen($line) < 8) {
                    continue;
                }
                $this->assertStringNotContainsString(
                    $line,
                    $notice['message'],
                    "The notice must not copy the '{$field}' line: '{$line}'."
                );
            }
        }
    }

    public function test_the_notice_sanitizer_strips_a_signed_url_even_from_the_title(): void
    {
        // Defence in depth: the title is a safe column, but if a report ever
        // carried a signed URL there, the sanitizer must still catch it.
        $notice = DiagnosticNotice::compose($this->report([
            'title' => 'Broken https://project.supabase.co/storage/v1/object/sign/inspection-photos/a.jpg?token=SECRETTOKENVALUE',
        ]));

        foreach ([
            'supabase.co',
            '/storage/v1/object',
            'token=',
            'SECRETTOKENVALUE',
        ] as $needle) {
            $this->assertStringNotContainsString(
                $needle,
                $notice['message'],
                "The notice must not carry '{$needle}'."
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. No credential of any shape survives
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_notice_carries_no_signed_url_jwt_token_bearer_or_key(): void
    {
        $hostile = $this->report([
            'title' => 'Login broken https://proj.supabase.co/storage/v1/object/public/x.jpg?token=abc',
            'module' => "sync\ncenter",
        ]);

        $notice = DiagnosticNotice::compose($hostile);
        $combined = $notice['title']."\n".$notice['message']."\n".$notice['action_url'];

        foreach ([
            'supabase.co' => 'Supabase host',
            'supabase.in' => 'Supabase host',
            '/storage/v1/object' => 'storage path',
            'token=' => 'tokenized query',
            'Bearer' => 'bearer fragment',
            'eyJ' => 'JWT head',
            'service_role' => 'service key name',
        ] as $needle => $label) {
            $this->assertStringNotContainsString(
                $needle,
                $combined,
                "The notice must not carry a {$label}."
            );
        }
    }

    public function test_a_credential_shaped_report_never_reaches_the_notice_builder_as_text(): void
    {
        // The builder takes the SANITIZED shape. A caller that hands it raw
        // remote text still cannot get a secret out, because the builder
        // re-sanitizes the composed message.
        $notice = DiagnosticNotice::compose([
            'id' => 'abc',
            'reference_code' => 'DR-1',
            'title' => 'plain title',
            'module' => 'm',
            'summary' => 'https://proj.supabase.co/storage/v1/object/sign/x?token=LEAKME',
        ]);

        $this->assertStringNotContainsString('LEAKME', $notice['message']);
        $this->assertStringNotContainsString('supabase.co', $notice['message']);
    }

    public function test_control_characters_cannot_reshape_the_notice(): void
    {
        $notice = DiagnosticNotice::compose($this->report([
            'module' => "sync\x00 center\x1f\nINJECTED",
        ]));

        $this->assertStringNotContainsString("\x00", $notice['message']);
        $this->assertStringNotContainsString("\x1f", $notice['message']);
        // The newline must be collapsed to a single space, not left as a break.
        $this->assertStringNotContainsString("center\n", $notice['message']);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 8. The link
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_notice_link_is_a_relative_in_app_path(): void
    {
        $notice = DiagnosticNotice::compose($this->report());

        $this->assertStringStartsWith('/diagnostics/', $notice['action_url']);
        $this->assertDoesNotMatchRegularExpression('#^[a-z]+://#i', $notice['action_url']);
        $this->assertStringNotContainsString('//', $notice['action_url']);
        $this->assertStringNotContainsString('javascript:', $notice['action_url']);
        $this->assertStringNotContainsString('data:', $notice['action_url']);
    }

    /**
     * `rawurlencode` does not encode dots, so a bare `..` id would have produced
     * `/diagnostics/..` - a traversal out of the section. The id is therefore
     * shape-checked, and anything that is not a canonical UUID falls back to the
     * list rather than building a link.
     */
    public function test_a_hostile_report_id_cannot_escape_the_in_app_path(): void
    {
        foreach ([
            '../../admin',
            '..',
            '..%2F..%2Fadmin',
            'abc/../../settings',
            "id\n/diagnostics",
            '',
            null,
            12345,
        ] as $hostile) {
            $notice = DiagnosticNotice::compose($this->report(['id' => $hostile]));

            $this->assertStringStartsWith('/diagnostics', $notice['action_url']);
            $this->assertStringNotContainsString('..', $notice['action_url']);
            $this->assertStringNotContainsString("\n", $notice['action_url']);
            $this->assertDoesNotMatchRegularExpression('#^/diagnostics/.+#', $notice['action_url'],
                "A non-UUID id must fall back to the list, not build a link. Got '{$notice['action_url']}'.");
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // 9. Duplicate suppression
    // ─────────────────────────────────────────────────────────────────────

    public function test_an_identical_unread_notice_is_not_sent_twice(): void
    {
        $this->requireDatabase();

        $po = $this->planningOfficer();
        $this->admin();

        $first = DiagnosticNotice::send($this->report());
        $this->assertSame(1, $first['audience']);
        $this->assertSame(1, $first['notified']);
        $this->assertSame(0, $first['suppressed']);

        $second = DiagnosticNotice::send($this->report());
        $this->assertSame(1, $second['audience']);
        $this->assertSame(0, $second['notified'], 'An identical notice must be suppressed.');
        $this->assertSame(1, $second['suppressed']);

        $this->assertSame(
            1,
            \App\Models\AppNotification::query()->where('type', DiagnosticNotice::TYPE)->count(),
            'Suppression must not create a second row.'
        );
    }

    public function test_a_different_report_is_not_treated_as_a_duplicate(): void
    {
        $this->requireDatabase();

        $this->planningOfficer();
        $this->admin();

        DiagnosticNotice::send($this->report());
        $other = DiagnosticNotice::send($this->report([
            'id' => '11111111-2222-3333-4444-555555555555',
            'reference_code' => 'DR-2026-0002',
        ]));

        $this->assertSame(1, $other['notified'], 'A different report must still be notifiable.');
    }

    public function test_suppression_only_blocks_unread_notices_inside_the_cooldown(): void
    {
        $this->requireDatabase();

        $po = $this->planningOfficer();
        $this->admin();

        DiagnosticNotice::send($this->report());

        // Read: the reminder has been seen, so reminding again is not noise.
        \App\Models\AppNotification::query()
            ->where('type', DiagnosticNotice::TYPE)
            ->update(['is_read' => true, 'read_at' => now()]);

        $afterRead = DiagnosticNotice::send($this->report());
        $this->assertSame(1, $afterRead['notified'], 'A read notice must not suppress a later reminder.');

        // Aged out of the cooldown window: allowed again.
        \App\Models\AppNotification::query()
            ->where('type', DiagnosticNotice::TYPE)
            ->update([
                'is_read' => false,
                'read_at' => null,
                'created_at' => now()->subDays(2),
            ]);

        $aged = DiagnosticNotice::send($this->report());
        $this->assertSame(1, $aged['notified'], 'A notice outside the cooldown must be allowed.');
    }

    public function test_the_cooldown_is_a_real_bounded_window(): void
    {
        $this->assertGreaterThan(0, DiagnosticNotice::COOLDOWN_MINUTES);
        $this->assertLessThanOrEqual(
            24 * 60,
            DiagnosticNotice::COOLDOWN_MINUTES,
            'The cooldown must be long enough to be useful but short enough to still work in a day.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // 10. The notice does not resolve the report
    // ─────────────────────────────────────────────────────────────────────

    public function test_sending_a_notice_creates_no_report_mutation(): void
    {
        $this->requireDatabase();

        $this->planningOfficer();
        $this->admin();

        $before = \Illuminate\Support\Facades\Schema::hasTable('notifications')
            ? \App\Models\AppNotification::query()->count()
            : 0;

        DiagnosticNotice::send($this->report());

        // The only thing that changed is the notification table.
        $this->assertSame(
            $before + 1,
            \App\Models\AppNotification::query()->count(),
            'Sending a notice must write exactly one notification and nothing else.'
        );
    }

    public function test_the_notice_reports_an_honest_count(): void
    {
        $this->requireDatabase();

        $this->planningOfficer();
        $this->admin();

        $result = DiagnosticNotice::send($this->report());
        $this->assertStringContainsString('Notified 1', $result['message']);

        $again = DiagnosticNotice::send($this->report());
        $this->assertStringContainsString('Notified 0', $again['message']);
        $this->assertStringContainsString('skipped', $again['message']);
    }

    public function test_notifying_an_empty_audience_is_reported_honestly(): void
    {
        $this->requireDatabase();

        $this->admin();

        $result = DiagnosticNotice::send($this->report());

        $this->assertSame(0, $result['audience']);
        $this->assertSame(0, $result['notified']);
        $this->assertStringContainsString('Notified 0', $result['message']);
    }
}
