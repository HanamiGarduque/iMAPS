<?php

namespace Tests\Unit;

use App\Http\Middleware\RoleMiddleware;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

/**
 * Loop 6 — Site Inspector iMAPS web access contract tests (Leader-approved).
 *
 * Proves the approved access contract at source / route-collection level:
 *
 *  1. RoleMiddleware accepts multiple roles (variadic signature).
 *  2. Admin matches Admin.
 *  3. Planning Officer matches Planning Officer.
 *  4. Site Inspector does not match Admin + Planning Officer.
 *  5. Exact canonical role strings remain in use (no aliases, no normalization).
 *  6. POST /applications/update-status is Planning Officer-only (no Admin).
 *  7. GET/POST /applications/encode are Planning Officer-only (no Admin).
 *  8. Admin-only route declarations remain Admin-only.
 *  9. Internal shared routes use role:Admin,Planning Officer.
 * 10. Site Inspector login gate rejects BEFORE session establishment (a
 *     pre-login attemptWhen callback) with FieldSync guidance.
 * 11. Installed SessionGuard source proves the callback runs after credential
 *     validation and before rehash/login, and that logout() would rotate a
 *     populated remember_token (why the old teardown was removed).
 *
 * All proofs are database-free: middleware behavior is exercised directly and
 * route declarations are read from the booted router's route collection.
 * No Supabase, FieldSync, or live data mutation of any kind.
 */
class Loop6SiteInspectorAccessContractTest extends TestCase
{
    // ───────────────────────────── helpers ─────────────────────────────

    private function rootPath(string $relative = ''): string
    {
        return dirname(__DIR__, 2).($relative !== '' ? '/'.$relative : '');
    }

    private function source(string $relative): string
    {
        $contents = file_get_contents($this->rootPath($relative));
        $this->assertNotFalse($contents, "Could not read {$relative}");

        return $contents;
    }

    private function userWithRole(string $role): User
    {
        $user = new User();
        $user->forceFill([
            'id'    => 1,
            'name'  => 'Loop 6 Contract Tester',
            'email' => 'loop6.contract@example.test',
            'role'  => $role,
        ]);

        return $user;
    }

    /**
     * Run the role middleware with the supplied roles and report whether the
     * pipeline continued (i.e. authorization passed).
     */
    private function passes(string ...$roles): bool
    {
        $continued = false;

        (new RoleMiddleware())->handle(
            Request::create('/dashboard', 'GET'),
            function () use (&$continued) {
                $continued = true;

                return new Response('next');
            },
            ...$roles
        );

        return $continued;
    }

    /**
     * Assert the role middleware aborts with HTTP 403 (and never continues).
     */
    private function assertDenied403(string ...$roles): void
    {
        try {
            (new RoleMiddleware())->handle(
                Request::create('/dashboard', 'GET'),
                function () {
                    $this->fail('Pipeline continued for an unauthorized role.');
                },
                ...$roles
            );

            $this->fail('Expected HTTP 403 for unauthorized role, but the middleware passed.');
        } catch (HttpException $e) {
            $this->assertSame(403, $e->getStatusCode());
        }
    }

    /**
     * Return the exact role: middleware strings declared on the matched route.
     */
    private function roleParamsFor(string $method, string $uri): array
    {
        $route = Route::getRoutes()->match(Request::create($uri, $method));

        $params = [];
        foreach ($route->gatherMiddleware() as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'role:')) {
                $params[] = $middleware;
            }
        }

        return $params;
    }

    private function assertRouteHasAuth(string $method, string $uri): void
    {
        $route = Route::getRoutes()->match(Request::create($uri, $method));
        $this->assertContains(
            'auth',
            $route->gatherMiddleware(),
            "Route {$method} {$uri} must be behind the auth middleware."
        );
    }

    // ─────────── 1. RoleMiddleware accepts multiple roles ───────────

    public function test_role_middleware_accepts_multiple_roles(): void
    {
        $source = $this->source('app/Http/Middleware/RoleMiddleware.php');

        $this->assertStringContainsString(
            'string ...$roles',
            $source,
            'RoleMiddleware must declare a variadic `string ...$roles` parameter.',
        );
        $this->assertStringNotContainsString(
            'string $role)',
            $source,
            'The legacy single-role `string $role` parameter must be gone.',
        );

        // Behavioral: two supplied roles are all received by the middleware.
        $this->be($this->userWithRole('Admin'));
        $this->assertTrue(
            $this->passes('Admin', 'Planning Officer'),
            'The middleware must accept a multi-role call (both parameters received).',
        );
    }

    // ───────────────── 2. Admin matches Admin ─────────────────

    public function test_admin_matches_admin(): void
    {
        $this->be($this->userWithRole('Admin'));

        $this->assertTrue($this->passes('Admin'), 'Admin must match a single-role Admin gate.');
        $this->assertTrue(
            $this->passes('Admin', 'Planning Officer'),
            'Admin must match the shared Admin+Planning Officer gate.',
        );
    }

    // ─────────── 3. Planning Officer matches Planning Officer ───────────

    public function test_planning_officer_matches_planning_officer(): void
    {
        $this->be($this->userWithRole('Planning Officer'));

        $this->assertTrue(
            $this->passes('Planning Officer'),
            'Planning Officer must match a single-role Planning Officer gate.',
        );
        $this->assertTrue(
            $this->passes('Admin', 'Planning Officer'),
            'Planning Officer must match the shared Admin+Planning Officer gate.',
        );
    }

    // ───── 4. Site Inspector does not match Admin+Planning Officer ─────

    public function test_site_inspector_does_not_match_admin_or_planning_officer(): void
    {
        $this->be($this->userWithRole('Site Inspector'));

        $this->assertDenied403('Admin', 'Planning Officer');
        $this->assertDenied403('Planning Officer');
        $this->assertDenied403('Admin');
    }

    public function test_unauthenticated_requests_follow_normal_login_redirect(): void
    {
        // Fresh application instance per test: no user is authenticated.
        $response = (new RoleMiddleware())->handle(
            Request::create('/dashboard', 'GET'),
            function () {
                $this->fail('A guest request must not pass the role gate.');
            },
            'Admin',
            'Planning Officer',
        );

        $this->assertTrue($response->isRedirect(), 'Unauthenticated requests must redirect (normal Laravel auth behavior).');
        $this->assertStringEndsWith('/login', (string) $response->headers->get('Location'));
    }

    // ───── 5. Exact canonical role strings remain in use ─────

    public function test_exact_canonical_role_strings_remain_in_use(): void
    {
        // Registration still validates exactly the three canonical strings.
        $registration = $this->source('app/Http/Controllers/Auth/RegisteredUserController.php');
        $this->assertStringContainsString(
            'in:Admin,Planning Officer,Site Inspector',
            $registration,
            'The canonical role vocabulary must remain exact.',
        );

        // Middleware compares exact strings: strict, no aliasing, no normalization.
        $middleware = $this->source('app/Http/Middleware/RoleMiddleware.php');
        $this->assertStringContainsString('in_array(Auth::user()->role, $roles, true)', $middleware);
        foreach (['strtolower', 'strcasecmp', 'str_ireplace', 'strtoupper'] as $normalizer) {
            $this->assertStringNotContainsString(
                $normalizer,
                $middleware,
                "RoleMiddleware must not normalize role values (found {$normalizer}).",
            );
        }

        // Every role: middleware parameter on every route is canonical, and
        // Site Inspector is never granted an iMAPS web route.
        $seen = [];
        foreach (Route::getRoutes()->getRoutes() as $route) {
            foreach ($route->gatherMiddleware() as $middlewareString) {
                if (! is_string($middlewareString) || ! str_starts_with($middlewareString, 'role:')) {
                    continue;
                }
                foreach (explode(',', substr($middlewareString, 5)) as $param) {
                    $seen[] = $param;
                    $this->assertContains(
                        $param,
                        ['Admin', 'Planning Officer'],
                        "Route [{$route->uri()}] uses a non-canonical role parameter [{$param}].",
                    );
                }
            }
        }

        $this->assertNotEmpty($seen, 'Expected role middleware declarations across the internal routes.');
        $this->assertNotContains(
            'Site Inspector',
            $seen,
            'Site Inspector must never be granted an iMAPS web route.',
        );
    }

    // ───── 6. Application status update is Planning Officer-only ─────

    public function test_application_update_status_route_is_planning_officer_only(): void
    {
        $this->assertSame(
            ['role:Planning Officer'],
            $this->roleParamsFor('POST', '/applications/update-status'),
            'Leader correction: POST /applications/update-status must be Planning Officer-only — Admin must NOT retain status-update access.',
        );
    }

    // ───── 7. Application encode GET/POST are Planning Officer-only ─────

    public function test_application_encode_get_and_post_are_planning_officer_only(): void
    {
        $this->assertSame(
            ['role:Planning Officer'],
            $this->roleParamsFor('GET', '/applications/encode'),
            'GET /applications/encode must be Planning Officer-only (the old Planning Officer,Admin declaration is not the contract).',
        );
        $this->assertSame(
            ['role:Planning Officer'],
            $this->roleParamsFor('POST', '/applications/encode'),
            'POST /applications/encode must be Planning Officer-only.',
        );
    }

    // ───── 8. Admin-only route declarations remain Admin-only ─────

    public function test_admin_only_routes_remain_admin_only(): void
    {
        // Upstream replaced /analytics with the Reports module and /audit-log
        // with the per-user Activity Log endpoint. The Loop 6 rule is unchanged:
        // these surfaces stay Admin-only and are never broadened to Planning
        // Officer.
        $adminOnlyRoutes = [
            ['GET', '/register-new-account'],
            ['POST', '/register-new-account'],
            ['GET', '/reports'],
            ['POST', '/api/analytics/report'],
            ['GET', '/users/1/logs'],
            ['GET', '/settings'],
            ['POST', '/settings/upload-shapefile'],
            ['GET', '/users'],
            ['POST', '/users/sensitive-data'],
            ['POST', '/users/1/update'],
        ];

        foreach ($adminOnlyRoutes as [$method, $uri]) {
            $this->assertSame(
                ['role:Admin'],
                $this->roleParamsFor($method, $uri),
                "{$method} {$uri} must remain Admin-only (not broadened to Planning Officer).",
            );
        }
    }

    // ───── 9. Internal shared routes use Admin + Planning Officer ─────

    public function test_internal_shared_routes_use_admin_and_planning_officer(): void
    {
        $sharedRoutes = [
            ['GET', '/dashboard'],
            ['GET', '/applications'],
            ['GET', '/applications/1'],
            ['GET', '/technical-review'],
            ['GET', '/api/global-search'],
            ['GET', '/api/map/zoning-lookup'],
            ['GET', '/api/map/zoning-area-lookup'],
            ['GET', '/api/map/land_use'],
            ['GET', '/api/inspections/1/supabase-data'],
            ['GET', '/api/tax-map/lookup/12345'],
        ];

        foreach ($sharedRoutes as [$method, $uri]) {
            $this->assertSame(
                ['role:Admin,Planning Officer'],
                $this->roleParamsFor($method, $uri),
                "{$method} {$uri} must be protected with role:Admin,Planning Officer.",
            );
            $this->assertRouteHasAuth($method, $uri);
        }
    }

    public function test_planning_officer_workflow_routes_are_planning_officer_only(): void
    {
        $planningOfficerRoutes = [
            ['GET', '/applications/drafts'],
            ['POST', '/applications/drafts/save'],
            ['DELETE', '/applications/drafts/1'],
            ['POST', '/applications/update-status'],
            ['POST', '/technical-review/update-status'],
            ['POST', '/technical-review/submit-batch'],
            ['POST', '/technical-review/assign-inspector'],
        ];

        foreach ($planningOfficerRoutes as [$method, $uri]) {
            $this->assertSame(
                ['role:Planning Officer'],
                $this->roleParamsFor($method, $uri),
                "{$method} {$uri} must be Planning Officer-only.",
            );
        }
    }

    // The public portal is a separate project now, so only the landing page is served from here.
    public function test_landing_page_stays_public(): void
    {
        foreach ([['GET', '/']] as [$method, $uri]) {
            $this->assertSame(
                [],
                $this->roleParamsFor($method, $uri),
                "Public route {$uri} must not gain a role gate.",
            );

            $route = Route::getRoutes()->match(Request::create($uri, $method));
            $this->assertNotContains(
                'auth',
                $route->gatherMiddleware(),
                "Public route {$uri} must remain reachable without authentication.",
            );
        }
    }

    public function test_tax_map_lookup_moved_out_of_the_stateless_api_routes_file(): void
    {
        $apiRoutes = $this->source('routes/api.php');
        $this->assertDoesNotMatchRegularExpression(
            "#Route::[a-zA-Z]+\(\s*['\"][^'\"]*tax-map#",
            $apiRoutes,
            'The tax-map lookup must no longer be declared in the session-less routes/api.php file.',
        );
        $this->assertStringNotContainsString(
            'TaxMapLookupController',
            $apiRoutes,
            'The tax-map controller must no longer be referenced from routes/api.php.',
        );

        $webRoutes = $this->source('routes/web.php');
        $this->assertStringContainsString(
            '/api/tax-map/lookup/{pin}',
            $webRoutes,
            'The tax-map lookup URL must be declared once, inside the session-backed web routes file.',
        );
    }

    // ───── 10. SI login gate rejects BEFORE session establishment ─────

    public function test_site_inspector_login_gate_rejects_before_session_establishment(): void
    {
        $controller = $this->source('app/Http/Controllers/Auth/AuthenticatedSessionController.php');

        // Scope strictly to store(): destroy() is the ordinary user-initiated
        // logout route and legitimately contains logout()/invalidate().
        $storeAt   = strpos($controller, 'public function store(');
        $destroyAt = strpos($controller, 'public function destroy(');
        $this->assertNotFalse($storeAt, 'store() could not be located.');
        $this->assertNotFalse($destroyAt, 'destroy() could not be located.');
        $store = substr($controller, $storeAt, $destroyAt - $storeAt);

        // The pre-login callback mechanism is used — never attempt() + logout().
        $this->assertStringContainsString(
            'Auth::attemptWhen(',
            $store,
            'The gate must use attemptWhen() so the role callback runs after credential validation and before rehash/login.',
        );
        $this->assertStringNotContainsString(
            'Auth::attempt(',
            $store,
            'Plain Auth::attempt() would rehash (when needed) and establish the session before the role gate could reject.',
        );
        $this->assertStringNotContainsString(
            '->logout()',
            $store,
            'No logout may run for a rejected Site Inspector: no authenticated session is ever established to log out of.',
        );
        $this->assertStringNotContainsString(
            'session()->invalidate()',
            $store,
            'No session teardown is needed: nothing was established, so nothing may be torn down.',
        );

        $this->assertStringContainsString(
            "role === 'Site Inspector'",
            $store,
            'The login flow must gate on the exact canonical Site Inspector role.',
        );
        $this->assertStringContainsString(
            'Site Inspectors use FieldSync for site inspection activities.',
            $store,
            'The rejection must carry the user-facing FieldSync guidance message.',
        );

        $attemptWhenAt = strpos($store, 'Auth::attemptWhen(');
        $regenerateAt  = strpos($store, 'session()->regenerate()');
        $lastLoginAt   = strpos($store, '->last_login');
        $this->assertNotFalse($regenerateAt, 'Session regeneration for allowed roles must remain in place.');
        $this->assertNotFalse($lastLoginAt, 'last_login update for allowed roles must remain in place.');

        $this->assertLessThan(
            $regenerateAt,
            $attemptWhenAt,
            'The SI gate must run BEFORE session regeneration so no usable SI web session is established.',
        );
        $this->assertLessThan(
            $lastLoginAt,
            $attemptWhenAt,
            'The SI gate must run BEFORE the last_login update so a rejected SI login never updates last_login.',
        );

        // A credential-valid role rejection still clears the rate limiter —
        // exactly as any credential-valid attempt always has — and only then
        // throws the FieldSync guidance.
        $clearAt = strpos($store, 'RateLimiter::clear($throttleKey)');
        $fieldAt = strpos($store, 'Site Inspectors use FieldSync');
        $this->assertNotFalse($clearAt, 'Rate-limiter clearing must be preserved.');
        $this->assertNotFalse($fieldAt, 'FieldSync guidance position could not be located.');
        $this->assertLessThan(
            $fieldAt,
            $clearAt,
            'The credential-valid SI rejection must clear the rate limiter before throwing the guidance.',
        );

        // Preserved login behavior for allowed roles / lockout / rate limiting.
        $this->assertStringContainsString('RateLimiter::hit($throttleKey, 900)', $store, 'Rate limiting must be preserved.');
        $this->assertStringContainsString('RateLimiter::clear($throttleKey)', $store, 'Rate limiter clearing must be preserved.');
        $this->assertStringContainsString('attempts >= 5', $store, 'Lockout behavior must be preserved.');
        $this->assertStringContainsString('$request->session()->regenerate()', $store, 'Allowed-role session regeneration must remain intact.');
        $this->assertStringContainsString('$authUser->last_login = now()', $store, 'Allowed-role last_login update must remain intact.');
    }

    // ───── 11. Installed SessionGuard proves pre-login rejection semantics ─────

    public function test_installed_session_guard_proves_pre_login_rejection_semantics(): void
    {
        $guard = $this->source('vendor/laravel/framework/src/Illuminate/Auth/SessionGuard.php');

        // attemptWhen() exists and validates credentials BEFORE the callback.
        $attemptWhenAt = strpos($guard, 'function attemptWhen(');
        $this->assertNotFalse($attemptWhenAt, 'The installed SessionGuard must provide attemptWhen().');

        $nextPublic = strpos($guard, 'public function', $attemptWhenAt + 10);
        $this->assertNotFalse($nextPublic, 'Could not bound the attemptWhen() body.');
        $body = substr($guard, $attemptWhenAt, $nextPublic - $attemptWhenAt);

        $checkAt = strpos($body, 'hasValidCredentials($user, $credentials) && $this->shouldLogin($callbacks, $user)');
        $this->assertNotFalse(
            $checkAt,
            'attemptWhen() must validate credentials first, then run the role callback (framework source proof).',
        );

        $rehashAt = strpos($body, 'rehashPasswordIfRequired($user, $credentials)');
        $loginAt  = strpos($body, '$this->login($user, $remember)');
        $this->assertNotFalse($rehashAt, 'attemptWhen() must contain the rehash step.');
        $this->assertNotFalse($loginAt, 'attemptWhen() must contain the login step.');

        $this->assertLessThan(
            $rehashAt,
            $checkAt,
            'The role callback must run BEFORE any password rehash.',
        );
        $this->assertLessThan(
            $loginAt,
            $checkAt,
            'The role callback must run BEFORE session establishment (login()).',
        );

        // Why the previous logout()-based teardown was removed: logout()
        // rotates and persists a populated remember_token.
        $logoutAt = strpos($guard, 'public function logout()');
        $this->assertNotFalse($logoutAt, 'logout() could not be located.');
        $nextAfterLogout = strpos($guard, 'public function', $logoutAt + 10);
        $this->assertNotFalse($nextAfterLogout, 'Could not bound the logout() body.');
        $logoutBody = substr($guard, $logoutAt, $nextAfterLogout - $logoutAt);
        $this->assertStringContainsString(
            'cycleRememberToken($user)',
            $logoutBody,
            'logout() cycles a populated remember_token — a rejected login must never call it (framework source proof).',
        );

        // rehash-on-login is ENABLED by default in this installation
        // (no config/hashing.php exists to override hashing.rehash_on_login),
        // so the old Auth::attempt() path could write the users row before the
        // gate rejected — confirming the correction was required.
        $authManager = $this->source('vendor/laravel/framework/src/Illuminate/Auth/AuthManager.php');
        $this->assertStringContainsString(
            "config']->get('hashing.rehash_on_login', true)",
            $authManager,
            'rehash_on_login defaults to true — Auth::attempt() can rehash the users row before any controller gate.',
        );
    }
}
