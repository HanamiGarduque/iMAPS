<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Blueprint;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Loop 6 — Role matrix feature coverage (Leader-approved contract).
 *
 * ADMIN:               login, dashboard, applications index/show allowed;
 *                      encode / drafts / status update / Technical Review
 *                      mutations denied; admin modules allowed (as applicable).
 * PLANNING OFFICER:    login, dashboard, applications, encode, drafts, status
 *                      update and Technical Review mutations allowed;
 *                      Admin-only modules denied.
 * SITE INSPECTOR:      web login rejected with FieldSync guidance and no
 *                      session; no last_login/role/is_active/password/
 *                      handshake_key/remember_token change; an invalid SI
 *                      password follows the ordinary invalid-credentials
 *                      path (no role guidance leaked).
 * PUBLIC:              covered in Loop6AccessBoundaryTest (portal + tracking).
 *
 * Environment note: this suite is structured normally for eventual execution
 * and uses RefreshDatabase (sqlite :memory: per phpunit.xml). Where the local
 * environment lacks pdo_sqlite it cannot run — that limitation is reported
 * exactly, never faked green. Guard rails: HTTP is faked and the queue is
 * faked so no test can reach Supabase, FieldSync, or any external service.
 */
class Loop6RoleMatrixTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Loop 6 boundary: no test may perform a real external call.
        Http::fake(['*' => Http::response(['ok' => true], 200)]);
        Queue::fake();

        // Frontend asset builds are irrelevant to the role contract.
        $this->withoutVite();

        $this->createGisFixtureTables();
    }

    /**
     * The dashboard reads the PostGIS land_use_plan layer, which only exists
     * in the production PostgreSQL database (GIS layers are loaded via
     * shapefile upload, not migrations). Provide a minimal fixture so the
     * dashboard's role-allowed rendering can be asserted honestly on any driver.
     */
    private function createGisFixtureTables(): void
    {
        if (! Schema::hasTable('land_use_plan')) {
            Schema::create('land_use_plan', function (Blueprint $table) {
                $table->string('location')->nullable();
                $table->string('lup_2030')->nullable();
                $table->double('shape_area')->nullable();
            });
        }
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Admin']);
    }

    private function planningOfficer(): User
    {
        return User::factory()->create(['role' => 'Planning Officer']);
    }

    /**
     * Role-gate allowance proof: the request was not denied by the role
     * middleware (403) and was not bounced to the login page. The final
     * status may be a validation/business outcome (302 with errors) because
     * these mutation tests deliberately send empty payloads so no workflow
     * state, Supabase row, or FieldSync job can be touched.
     */
    private function assertRoleAllows($response, string $uri): void
    {
        $status   = $response->getStatusCode();
        $location = (string) $response->headers->get('Location');
        $path     = parse_url($location, PHP_URL_PATH) ?: '';

        $this->assertNotSame(403, $status, "Role gate unexpectedly denied {$uri}.");
        $this->assertStringNotContainsString(
            '/login',
            $path,
            "Role gate unexpectedly bounced an authorized user from {$uri} to the login page.",
        );
    }

    // ───────────────────────────── LOGIN ─────────────────────────────

    public function test_admin_can_login(): void
    {
        $admin = $this->admin();

        $response = $this->post('/login', [
            'email'    => $admin->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    public function test_planning_officer_can_login(): void
    {
        $officer = $this->planningOfficer();

        $response = $this->post('/login', [
            'email'    => $officer->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $response->assertRedirect(route('dashboard', absolute: false));
    }

    public function test_site_inspector_web_login_is_rejected_with_fieldsync_guidance(): void
    {
        $inspector = User::factory()->create(['role' => 'Site Inspector']);

        // Pre-populate identity/remember state so any write during the
        // rejected attempt (rehash, remember-token rotation, handshake or
        // role change) is observable as an exact-value difference.
        $inspector->forceFill([
            'handshake_key'  => 'loop6-si-handshake-proof',
            'remember_token' => 'Loop6SiRememberTokenBeforeAttemptMustRemainExactlyUnchanged',
        ])->save();
        $passwordBefore = $inspector->password;
        $rememberBefore = $inspector->remember_token;

        $response = $this->from('/login')->post('/login', [
            'email'    => $inspector->email,
            'password' => 'password',
        ]);

        // Rejected: no usable session, no operational landing page — the
        // user is sent back to the login screen with the FieldSync message.
        $this->assertGuest();
        $response->assertRedirect('/login');
        $response->assertSessionHasErrors('email');

        $messages = session('errors')->get('email');
        $this->assertStringContainsString(
            'Site Inspectors use FieldSync for site inspection activities.',
            implode(' ', $messages),
            'The rejection must carry the FieldSync guidance message.',
        );

        // No account-state changes for the rejected login.
        $inspector->refresh();
        $this->assertNull($inspector->last_login, 'A rejected SI web login must not update last_login.');
        $this->assertSame('Site Inspector', $inspector->role, 'The account role must remain unchanged.');
        $this->assertTrue((bool) $inspector->is_active, 'The account must not be deactivated by a rejected web login.');
        $this->assertSame(
            'loop6-si-handshake-proof',
            $inspector->handshake_key,
            'The handshake identity must remain unchanged by a rejected web login.',
        );
        $this->assertSame(
            $passwordBefore,
            $inspector->password,
            'The password hash must remain unchanged (no rehash write) for a rejected web login.',
        );
        $this->assertSame(
            $rememberBefore,
            $inspector->remember_token,
            'A pre-populated remember_token must NOT be rotated by a rejected web login.',
        );

        // The credential-valid rejection cleared the failure counter exactly
        // as any credential-valid attempt always has (lockout history for
        // this address is reset by valid credentials, not extended).
        $this->assertSame(
            0,
            RateLimiter::attempts(Str::transliterate(Str::lower($inspector->email).'|127.0.0.1')),
            'A credential-valid role rejection must clear the rate limiter.',
        );
    }

    public function test_invalid_site_inspector_password_follows_ordinary_invalid_credentials_path(): void
    {
        $inspector = User::factory()->create(['role' => 'Site Inspector']);

        $response = $this->from('/login')->post('/login', [
            'email'    => $inspector->email,
            'password' => 'definitely-not-the-password',
        ]);

        $this->assertGuest();
        $response->assertRedirect('/login');
        $response->assertSessionHasErrors('email');

        $combined = implode(' ', session('errors')->get('email'));
        $this->assertStringContainsString(
            trans('auth.failed'),
            $combined,
            'Invalid credentials must follow the ordinary invalid-credentials response.',
        );
        $this->assertStringNotContainsString(
            'Site Inspectors use FieldSync',
            $combined,
            'Invalid credentials must never reveal the FieldSync role guidance.',
        );

        // The failed attempt is still counted by the rate limiter.
        $this->assertSame(
            1,
            RateLimiter::attempts(Str::transliterate(Str::lower($inspector->email).'|127.0.0.1')),
            'Rate limiting must count invalid credential attempts exactly as before.',
        );
    }

    public function test_allowed_role_login_still_regenerates_the_session(): void
    {
        $admin = $this->admin();

        $sessionStore = $this->app['session.store'];
        $beforeId     = $sessionStore->getId();

        $this->post('/login', [
            'email'    => $admin->email,
            'password' => 'password',
        ]);

        $this->assertAuthenticated();
        $this->assertNotSame(
            $beforeId,
            $sessionStore->getId(),
            'Allowed-role login must regenerate the session ID (session fixation protection intact).',
        );
    }

    public function test_failed_login_attempts_still_count_and_lock_out(): void
    {
        $admin = $this->admin();
        $key   = Str::transliterate(Str::lower($admin->email).'|127.0.0.1');

        for ($attempt = 1; $attempt <= 5; $attempt++) {
            $response = $this->post('/login', [
                'email'    => $admin->email,
                'password' => 'wrong-password',
            ]);

            $this->assertGuest();
            $response->assertSessionHasErrors('email');
        }

        $combined = implode(' ', session('errors')->get('email'));
        $this->assertStringContainsString(
            'Security Alert',
            $combined,
            'The pre-existing 5-attempt lockout policy must remain intact.',
        );
        $this->assertStringNotContainsString(
            'Site Inspectors use FieldSync',
            $combined,
            'Lockout responses must never reveal FieldSync role guidance.',
        );

        $admin->refresh();
        $this->assertFalse(
            (bool) $admin->is_active,
            'The pre-existing account-lock behavior (is_active = false on the 5th failure) must remain intact.',
        );
        $this->assertSame(0, RateLimiter::attempts($key), 'The limiter must be cleared when the lockout fires.');
    }

    // ───────────────────────────── ADMIN ─────────────────────────────

    public function test_admin_can_view_dashboard_and_applications(): void
    {
        $admin = $this->admin();
        $application = ZoningApplication::factory()->create(['encoded_by' => $admin->id]);

        $this->actingAs($admin)->get('/dashboard')->assertOk();
        $this->actingAs($admin)->get('/applications')->assertOk();
        $this->actingAs($admin)->get('/applications/'.$application->id)->assertOk();
    }

    public function test_admin_cannot_encode_applications(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->get('/applications/encode')->assertForbidden();
        $this->actingAs($admin)->post('/applications/encode', [])->assertForbidden();
    }

    public function test_admin_cannot_use_application_drafts(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->get('/applications/drafts')->assertForbidden();
        $this->actingAs($admin)->post('/applications/drafts/save', [])->assertForbidden();
        $this->actingAs($admin)->delete('/applications/drafts/1')->assertForbidden();
    }

    public function test_admin_cannot_update_application_status(): void
    {
        $admin = $this->admin();

        // Leader correction: Admin must NOT retain status-update access.
        $this->actingAs($admin)->post('/applications/update-status', [])->assertForbidden();
    }

    public function test_admin_cannot_perform_technical_review_mutations(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)->post('/technical-review/update-status', [])->assertForbidden();
        $this->actingAs($admin)->post('/technical-review/submit-batch', [])->assertForbidden();
        $this->actingAs($admin)->post('/technical-review/assign-inspector', [])->assertForbidden();
    }

    public function test_admin_retains_access_to_admin_modules(): void
    {
        $admin = $this->admin();

        // Static pages: exact render.
        $this->actingAs($admin)->get('/settings')->assertOk();
        $this->actingAs($admin)->get('/register-new-account')->assertOk();

        // Modules with pre-existing environment/data dependencies (PostgreSQL
        // dialect, GIS/analytics datasets): Loop 6 contract is role access —
        // assert the role gate lets Admin through (not 403 / not bounced).
        $this->assertRoleAllows($this->actingAs($admin)->get('/audit-log'), '/audit-log');
        $this->assertRoleAllows($this->actingAs($admin)->get('/users'), '/users');
        $this->assertRoleAllows($this->actingAs($admin)->get('/analytics'), '/analytics');
    }

    // ─────────────────────── PLANNING OFFICER ───────────────────────

    public function test_planning_officer_can_view_dashboard_and_applications(): void
    {
        $officer = $this->planningOfficer();
        $application = ZoningApplication::factory()->create(['encoded_by' => $officer->id]);

        $this->actingAs($officer)->get('/dashboard')->assertOk();
        $this->actingAs($officer)->get('/applications')->assertOk();
        $this->actingAs($officer)->get('/applications/'.$application->id)->assertOk();
    }

    public function test_planning_officer_can_encode_applications(): void
    {
        $officer = $this->planningOfficer();

        $this->actingAs($officer)->get('/applications/encode')->assertOk();

        // Empty payload → validation redirect (never a role denial), so no
        // application row can be created by this test.
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/applications/encode', []),
            '/applications/encode',
        );
    }

    public function test_planning_officer_can_use_application_drafts(): void
    {
        $officer = $this->planningOfficer();

        $this->actingAs($officer)->get('/applications/drafts')->assertOk();
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/applications/drafts/save', []),
            '/applications/drafts/save',
        );
    }

    public function test_planning_officer_can_update_application_status(): void
    {
        $officer = $this->planningOfficer();

        // Empty payload stops at validation (id/new_status required) inside
        // the controller — the role gate must let the request through.
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/applications/update-status', []),
            '/applications/update-status',
        );
    }

    public function test_planning_officer_can_perform_technical_review_mutations(): void
    {
        $officer = $this->planningOfficer();

        // Each controller validates required fields before any transaction,
        // notification, Supabase call, or FieldSync dispatch — empty payloads
        // prove role access only, with zero workflow side effects.
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/technical-review/update-status', []),
            '/technical-review/update-status',
        );
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/technical-review/submit-batch', []),
            '/technical-review/submit-batch',
        );
        $this->assertRoleAllows(
            $this->actingAs($officer)->post('/technical-review/assign-inspector', []),
            '/technical-review/assign-inspector',
        );
    }

    public function test_planning_officer_cannot_access_admin_modules(): void
    {
        $officer = $this->planningOfficer();

        foreach ([
            '/register-new-account',
            '/analytics',
            '/audit-log',
            '/settings',
            '/users',
        ] as $uri) {
            $this->actingAs($officer)->get($uri)->assertForbidden("{$uri} must remain Admin-only.");
        }

        $this->actingAs($officer)->post('/analytics/rerun', [])->assertForbidden('/analytics/rerun must remain Admin-only.');
        $this->actingAs($officer)->post('/users/sensitive-data', [])->assertForbidden('/users/sensitive-data must remain Admin-only.');
    }
}
