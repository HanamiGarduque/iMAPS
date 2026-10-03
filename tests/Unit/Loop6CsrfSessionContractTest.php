<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class Loop6CsrfSessionContractTest extends TestCase
{
    public function test_frontend_uses_laravel_xsrf_cookie_lifecycle(): void
    {
        $bootstrap = file_get_contents(dirname(__DIR__, 2) . '/resources/js/bootstrap.js');
        $blade = file_get_contents(dirname(__DIR__, 2) . '/resources/views/app.blade.php');
        $users = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Pages/Users/Index.jsx');

        $this->assertIsString($bootstrap);
        $this->assertIsString($blade);
        $this->assertIsString($users);

        $this->assertStringContainsString('window.axios = axios', $bootstrap);
        $this->assertStringContainsString('X-Requested-With', $bootstrap);
        $this->assertStringNotContainsString('csrfTokenMeta', $bootstrap);
        $this->assertStringNotContainsString('X-CSRF-TOKEN', $bootstrap);
        $this->assertStringNotContainsString('X-XSRF-TOKEN', $bootstrap);
        $this->assertStringNotContainsString('csrf-token', $blade);
        $this->assertStringNotContainsString('X-CSRF-TOKEN', $users);
        $this->assertStringNotContainsString('meta[name="csrf-token"]', $users);

        // ── MASTER MERGE CORRECTION: SCOPED 419 RECOVERY ────────────────────
        // This test used to ban `location.reload` outright, as a stand-in for
        // "the frontend hardcodes or caches a CSRF token". That ban was always
        // over-broad: an HTTP 419 means the session/token expired, and reloading
        // is the correct, minimal recovery.
        //
        // origin/master added exactly that in 1307db8 (session lifetime
        // 30 -> 120 min) to make 419 self-healing. The real Loop 6 invariant is
        // NO MANUALLY MANAGED TOKEN, and it is asserted in full above: no
        // X-CSRF-TOKEN, no X-XSRF-TOKEN default, no csrfTokenMeta, no meta tag,
        // and now additionally no localStorage/sessionStorage/cookie token
        // writes anywhere in the boot layer.
        //
        // What is asserted instead is that a reload may ONLY exist on the
        // explicit 419 branch, so it cannot become a generic success or error
        // path, and never a way to dodge the session lifecycle.
        $reloads = preg_match_all('/location\.reload/', $bootstrap);
        $this->assertLessThanOrEqual(
            1,
            $reloads,
            'bootstrap.js may contain at most one recovery reload; extra reloads would mask the real session lifecycle.'
        );

        if ($reloads === 1) {
            $this->assertMatchesRegularExpression(
                '/if\s*\([^)]*status\s*===\s*419[^)]*\)\s*\{\s*window\.location\.reload\(\)/s',
                $bootstrap,
                'The reload must be inside the explicit HTTP 419 branch, not a normal success or generic error path.'
            );
        }

        // A reload is never an acceptable way to clear a session: that would
        // destroy state rather than let the framework re-mint a token.
        $this->assertStringNotContainsString('Clear-SiteData', $bootstrap);
        $this->assertStringNotContainsString('Clear-SiteData', $users);
        $this->assertStringNotContainsString('location.reload', $users);
    }

    /**
     * MASTER MERGE CORRECTION - the substantive half of the Loop 6 contract.
     *
     * Split out so the "no manually managed token" rule is asserted in its own
     * right, across the whole boot layer, rather than only as a side effect of
     * the reload check above.
     */
    public function test_no_csrf_token_is_ever_persisted_or_manually_managed(): void
    {
        $root = dirname(__DIR__, 2);
        $bootstrap = (string) file_get_contents($root . '/resources/js/bootstrap.js');
        $blade = (string) file_get_contents($root . '/resources/views/app.blade.php');
        $users = (string) file_get_contents($root . '/resources/js/Pages/Users/Index.jsx');

        // Storage MAY legitimately hold a view preference or a dismissed-welcome
        // flag. What must never happen is a TOKEN being placed in storage, so the
        // ban is on token-shaped keys, not on storage itself.
        foreach ([$bootstrap, $blade, $users] as $layer) {
            foreach (['csrf', 'token', 'xsrf', 'session_id', 'authorization'] as $tokenish) {
                foreach (preg_split('/\R/', $layer) ?: [] as $line) {
                    if (!preg_match('/(local|session)Storage/i', $line)) {
                        continue;
                    }
                    $this->assertStringNotContainsStringIgnoringCase(
                        $tokenish,
                        $line,
                        "A {$tokenish} value must never be persisted in browser storage; the framework owns the token lifecycle."
                    );
                }
            }
            $this->assertStringNotContainsString('document.cookie', $layer);
        }

        // A manually supplied token header is the defect Loop 6 actually fixed.
        foreach ([$bootstrap, $users] as $layer) {
            $this->assertStringNotContainsString('X-CSRF-TOKEN', $layer);
            $this->assertStringNotContainsString('X-XSRF-TOKEN', $layer);
        }

        $this->assertStringNotContainsString('csrf-token', $blade);
        $this->assertStringNotContainsString('csrfTokenMeta', $bootstrap);

        // The framework's own cookie lifecycle must still be the active path.
        $this->assertStringContainsString('X-Requested-With', $bootstrap);
    }

    public function test_auth_routes_remain_post_and_web_protected(): void
    {
        // Laravel registers both the GET login form and the POST login
        // endpoint under the same route name. getByName() returns only one of
        // them, so select the POST contract explicitly instead of assuming
        // the named lookup resolves to the credential-processing route.
        $routes = collect(Route::getRoutes()->getRoutes());
        $login = $routes->first(
            fn ($route) => $route->uri() === 'login'
                && in_array('POST', $route->methods(), true),
        );
        $logout = $routes->first(
            fn ($route) => $route->uri() === 'logout'
                && in_array('POST', $route->methods(), true),
        );

        $this->assertNotNull($login);
        $this->assertNotNull($logout);
        $this->assertContains('POST', $login->methods());
        $this->assertContains('POST', $logout->methods());
        $this->assertContains('web', $login->gatherMiddleware());
        $this->assertContains('web', $logout->gatherMiddleware());
        $this->assertStringNotContainsString('csrf', file_get_contents(dirname(__DIR__, 2) . '/bootstrap/app.php'));
    }
}
