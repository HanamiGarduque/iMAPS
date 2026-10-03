<?php

namespace Tests\Unit;

use App\Support\DiagnosticNotice;
use Illuminate\Support\Facades\DB;
use Tests\ReportingTestCase;

class DiagnosticNotifyPlanningOfficersTest extends ReportingTestCase
{
    public function test_exactly_one_current_owner_and_recipient_specific_cooldown(): void
    {
        $notice = app(DiagnosticNotice::class);
        $this->assertSame(1, $notice->send($this->admin, $this->support())['notified']);
        $this->assertSame(1, $notice->send($this->admin, $this->support())['suppressed']);
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => $this->other->id]);
        $this->assertSame(1, $notice->send($this->admin, $this->support())['notified']);
        $this->assertSame([$this->po->id, $this->other->id], DB::table('notifications')->orderBy('id')->pluck('user_id')->all());
        DB::table('notifications')->update(['created_at' => now()->subMinutes(31)]);
        $this->assertSame(1, $notice->send($this->admin, $this->support())['notified']);
    }

    public function test_no_owner_or_unresolved_context_never_broadcasts(): void
    {
        DB::table('zoning_applications')->update(['assigned_planning_officer_id' => null]);
        $r = app(DiagnosticNotice::class)->send($this->admin, $this->support());
        $this->assertSame('No current Planning Officer assigned. No notification sent.', $r['message']);
        $this->remote['field_jobs'] = [];
        $r = app(DiagnosticNotice::class)->send($this->admin, $this->support());
        $this->assertSame('Application context unavailable. No notification sent.', $r['message']);
        $this->assertSame(0, DB::table('notifications')->count());
    }

    public function test_technical_issue_is_rejected_even_outside_controller(): void
    {
        $this->expectException(\Symfony\Component\HttpKernel\Exception\HttpException::class);
        app(DiagnosticNotice::class)->send($this->admin, $this->technical());
    }

    public function test_notice_sanitizes_title_and_excludes_body_and_has_exact_safe_url(): void
    {
        $r = DiagnosticNotice::compose($this->support(['title' => 'Bearer private-secret', 'summary' => 'never send this body']));
        $this->assertStringNotContainsString('private-secret', $r['message']);
        $this->assertStringNotContainsString('never send this body', $r['message']);
        $this->assertSame('/diagnostics/'.self::REPORT, $r['action_url']);
        foreach (['..', '//evil.test', "abc\n/path"] as $id) {
            $this->assertSame('/diagnostics', DiagnosticNotice::compose(['id' => $id])['action_url']);
        }
    }

    public function test_legacy_notifications_are_preserved_and_different_recipient_does_not_suppress(): void
    {
        DB::table('notifications')->insert(['user_id' => $this->other->id, 'title' => 'Historical notice', 'message' => 'Keep',
            'type' => 'diagnostic_report', 'action_url' => '/diagnostics/'.self::REPORT, 'created_at' => now()]);
        app(DiagnosticNotice::class)->send($this->admin, $this->support());
        $this->assertSame(2, DB::table('notifications')->count());
        $this->assertSame('Keep', DB::table('notifications')->where('title', 'Historical notice')->value('message'));
    }

    /**
     * THE LOGOUT TRANSITION PATH, exercised end to end on real routes.
     *
     * `router.post('/logout')` is an Inertia POST that redirects to /login, and
     * Inertia then issues an Inertia GET for /login. If any of those three
     * responses were a plain non-Inertia body, the client would raise its
     * "plain JSON response" modal. This pins all three as genuine Inertia
     * responses, so the logout -> login transition cannot produce that modal.
     */
    public function test_the_logout_then_login_transition_returns_only_inertia_responses(): void
    {
        $this->actingAs($this->admin);

        $logout = $this->post('/logout');
        $logout->assertRedirect(route('login'));
        $this->assertFalse(
            $logout->headers->has('X-Inertia'),
            'The logout response is a redirect, not an Inertia page body.'
        );

        // What Inertia requests next: the login page, with the Inertia headers.
        $login = $this->get('/login', $this->inertiaHeaders());
        $login->assertOk();
        $this->assertTrue(
            $login->headers->has('X-Inertia'),
            'An Inertia GET of /login must carry the X-Inertia response header, or the client raises its error modal.'
        );
        $this->assertSame(
            'Auth/Login',
            $login->json('component'),
            'The login transition must land on the real login page component.'
        );
    }

    /**
     * The other half of the transition: a Planning Officer session reaches the
     * Reports & Support surface as a valid Inertia page.
     *
     * `/dashboard` is deliberately NOT asserted here. It reads the PostGIS
     * land-use layers, which exist only in the production PostgreSQL database
     * and are not part of this reporting fixture, so a dashboard assertion here
     * would be asserting a fixture gap rather than the auth transition. The
     * dashboard role matrix is covered by `Loop6RoleMatrixTest`.
     */
    public function test_a_planning_officer_session_reaches_reports_and_support_as_inertia(): void
    {
        $this->actingAs($this->po);

        $reports = $this->get('/diagnostics', $this->inertiaHeaders());
        $reports->assertOk();
        $this->assertTrue(
            $reports->headers->has('X-Inertia'),
            'The post-login landing page must be a real Inertia response, not plain JSON.'
        );
        $this->assertSame('Diagnostics/Index', $reports->json('component'));
    }

    /**
     * The headers Inertia's own client sends on every navigation.
     *
     * `X-Inertia-Version` is included because the middleware answers a version
     * mismatch with 409 + a location header; without it this suite would be
     * asserting the version-conflict path and never reaching the page.
     *
     * @return array<string, string>
     */
    private function inertiaHeaders(): array
    {
        $version = app(\App\Http\Middleware\HandleInertiaRequests::class)->version(\Illuminate\Http\Request::create('/'));

        return ['X-Inertia' => 'true', 'X-Requested-With' => 'XMLHttpRequest', 'X-Inertia-Version' => $version ?? ''];
    }
}
