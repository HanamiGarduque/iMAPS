<?php

namespace Tests\Unit;

use Illuminate\Routing\Route as RoutingRoute;
use Illuminate\Routing\Router;
use Tests\TestCase;

/**
 * POST-LOOP-9: the Planning Officer diagnostics 403.
 *
 * THE BUG
 * -------
 * A Planning Officer could see "Diagnostic Reports" in the navigation and
 * receive the Admin's notification, but every click returned 403 - while an
 * Admin worked fine.
 *
 * THE ROOT CAUSE
 * --------------
 * Group middleware is INHERITED and COMBINED with a route's own middleware. It
 * is NOT replaced by it. The diagnostics routes were declared INSIDE
 *
 *     Route::middleware(['auth', 'role:Admin'])->group(function () { ... })
 *
 * so each one resolved to TWO RoleMiddleware entries, in this order:
 *
 *     RoleMiddleware:Admin                     <- inherited from the group
 *     RoleMiddleware:Admin,Planning Officer     <- added on the route
 *
 * Laravel runs them in order, so the inherited `role:Admin` was evaluated
 * first and aborted 403 for a Planning Officer. The widened list on the route
 * was never reached. The route source, the sidebar entry and the notification
 * link all said the Planning Officer was allowed, so the visible behaviour and
 * the enforced behaviour disagreed.
 *
 * THE FIX
 * -------
 * The two GET routes moved out of the Admin-only group into their own
 * `['auth', 'role:Admin,Planning Officer']` group, so exactly ONE authority
 * applies. The Admin-only POST lives in its own `['auth', 'role:Admin']` group.
 *
 * WHY THIS SUITE IS SHAPED THIS WAY
 * ---------------------------------
 * Asserting the SOURCE of routes/web.php is what let this ship: the source
 * read `role:Admin,Planning Officer` and looked correct, while the group
 * silently added a second, stricter authority. So the assertions here are made
 * against the RESOLVED runtime chain, and the duplicate is also reproduced
 * explicitly, so the bug cannot return unnoticed.
 *
 * These run without a database. The end-to-end verdict per role is proven by
 * the committed live matrix against canonical; see the commit message.
 */
class DiagnosticsRouteAuthorityTest extends TestCase
{
    /** The authority each route must resolve to, exactly. */
    private const EXPECTED = [
        'diagnostics.index' => 'Admin,Planning Officer',
        'diagnostics.show' => 'Admin,Planning Officer',
        'diagnostics.notify-planning-officers' => 'Admin',
    ];

    /**
     * The resolved RoleMiddleware entries on a route, via the framework's own
     * resolver so an INHERITED group entry cannot hide.
     *
     * @return list<string>
     */
    private function roleChain(string $routeName): array
    {
        $route = $this->app->make(Router::class)->getRoutes()->getByName($routeName);
        $this->assertNotNull($route, "Route {$routeName} must be registered.");

        return array_values(array_filter(
            $this->app->make(Router::class)->gatherRouteMiddleware($route),
            fn ($p) => str_contains((string) $p, 'RoleMiddleware')
        ));
    }

    /**
     * THE REGRESSION GUARD.
     *
     * Exactly one authority per route. Before the fix this was 2 on both GET
     * routes, and asserting only on the source is what allowed the bug to ship.
     */
    public function test_each_diagnostics_route_has_exactly_one_authority(): void
    {
        foreach (self::EXPECTED as $name => $expected) {
            $chain = $this->roleChain($name);

            $this->assertCount(
                1,
                $chain,
                "Route {$name} must resolve to exactly ONE RoleMiddleware. A second entry means a "
                .'stricter authority is being inherited from an enclosing group and will run FIRST, '
                .'denying a role the route claims to allow. Resolved chain: ['.implode(' | ', $chain).']'
            );

            $this->assertSame(
                $expected,
                substr((string) $chain[0], strrpos((string) $chain[0], ':') + 1),
                "Route {$name} must authorize exactly '{$expected}'."
            );
        }
    }

    /**
     * Reproduce the original defect with the framework's own resolver, so the
     * diagnosis is proven rather than asserted from a diff.
     *
     * The broken route carries the inherited entry FIRST, which is the whole
     * mechanism: a stricter group authority silently precedes the route's own.
     */
    public function test_a_stricter_inherited_group_authority_denial_is_reproduced_and_then_the_fix_holds(): void
    {
        $router = $this->app->make(Router::class);
        $registry = $router->getMiddleware();
        $this->assertArrayHasKey('role', $registry);
        $this->assertStringContainsString('RoleMiddleware', (string) $registry['role']);

        $broken = new RoutingRoute(['GET'], 'diagnostics', fn () => null);
        // Exactly what the group + route produced, in that order.
        $broken->middleware('role:Admin', 'role:Admin,Planning Officer');

        $brokenChain = array_values(array_filter(
            $router->gatherRouteMiddleware($broken),
            fn ($p) => str_contains((string) $p, 'RoleMiddleware')
        ));

        $this->assertCount(2, $brokenChain, 'The broken shape must produce two authorities.');
        $this->assertStringEndsWith(
            ':Admin',
            (string) $brokenChain[0],
            'The inherited stricter authority must come FIRST, which is why it decides the outcome.'
        );

        $fixed = new RoutingRoute(['GET'], 'diagnostics', fn () => null);
        $fixed->middleware('role:Admin,Planning Officer');

        $fixedChain = array_values(array_filter(
            $router->gatherRouteMiddleware($fixed),
            fn ($p) => str_contains((string) $p, 'RoleMiddleware')
        ));

        $this->assertCount(1, $fixedChain, 'The fixed shape must produce exactly one authority.');
    }

    /**
     * The group placement itself, asserted on source, so a future edit that
     * moves the routes back inside the Admin-only group is caught immediately
     * rather than at the next click.
     */
    public function test_the_diagnostics_routes_are_not_inside_the_admin_only_group(): void
    {
        $web = (string) file_get_contents(base_path('routes/web.php'));

        // Locate the Admin-only group and confirm the diagnostics routes are
        // declared after it closes, not within it.
        $this->assertMatchesRegularExpression(
            "#Route::middleware\(\['auth',\s*'role:Admin'\]\)->group\(function \(\) \{#",
            $web,
            'The Admin-only group is expected to exist for the other Admin pages.'
        );

        $groupOpen = strpos($web, "Route::middleware(['auth', 'role:Admin'])->group(function () {");
        $this->assertNotFalse($groupOpen);

        // The diagnostics registrations must be OUTSIDE that group.
        $diagnosticsGet = strpos($web, "Route::get('/diagnostics'");
        $this->assertNotFalse($diagnosticsGet);

        $adminGroupSegment = substr($web, $groupOpen, $diagnosticsGet - $groupOpen);
        $this->assertStringNotContainsString(
            "Route::get('/diagnostics'",
            $adminGroupSegment,
            'The diagnostics routes must not be declared inside the role:Admin group.'
        );

        // And they must each be inside a group that grants them the right role.
        $this->assertMatchesRegularExpression(
            "#Route::middleware\(\['auth',\s*'role:Admin,Planning Officer'\]\)->group\(function \(\) \{[^}]*"
            ."Route::get\('/diagnostics'[^}]*Route::get\('/diagnostics/\{report\}'#s",
            $web,
            'Both GET routes must live in one Admin + Planning Officer group.'
        );

        $this->assertMatchesRegularExpression(
            "#Route::middleware\(\['auth',\s*'role:Admin'\]\)->group\(function \(\) \{[^}]*"
            ."Route::post\('/diagnostics/\{report\}/notify-planning-officers'#s",
            $web,
            'The notify POST must live in its own Admin-only group.'
        );
    }

    /**
     * A Site Inspector is never authorized on any diagnostics route.
     */
    public function test_a_site_inspector_is_never_authorized(): void
    {
        foreach (self::EXPECTED as $name => $expected) {
            $this->assertStringNotContainsString(
                'Site Inspector',
                $expected,
                "No diagnostics route may authorize a Site Inspector. Found it on {$name}."
            );
        }

        // The middleware compares role strings exactly and strictly, so an
        // unlisted role cannot slip through a prefix or casing match.
        $middleware = (string) file_get_contents(base_path('app/Http/Middleware/RoleMiddleware.php'));
        $this->assertMatchesRegularExpression(
            '/in_array\(Auth::user\(\)->role, \$roles, true\)/',
            $middleware,
            'The role check must be an exact, strict comparison.'
        );
    }

    /**
     * The notify action is Admin-only, and only Admin-only. It must never be
     * widened along with the read routes.
     */
    public function test_the_notify_action_stays_admin_only(): void
    {
        $this->assertSame(
            'Admin',
            self::EXPECTED['diagnostics.notify-planning-officers'],
            'The notify action must remain Admin-only.'
        );

        $web = (string) file_get_contents(base_path('routes/web.php'));

        // Exactly one POST under diagnostics, and it is the notice action.
        $this->assertSame(
            1,
            preg_match_all("#Route::post\('/diagnostics#i", $web),
            'Exactly one diagnostics POST may exist.'
        );

        // No report write verb, for anybody.
        foreach (['put', 'patch', 'delete'] as $verb) {
            $this->assertDoesNotMatchRegularExpression(
                "#Route::{$verb}\('/diagnostics#i",
                $web,
                "No {$verb} route may ever exist for diagnostics."
            );
        }

        // The controller re-reads the role, so it stays safe if reached another way.
        $controller = (string) file_get_contents(base_path('app/Http/Controllers/DiagnosticReportController.php'));
        $this->assertMatchesRegularExpression(
            "/\\\$request->user\(\)\?->role \?\? null\) === 'Admin'/",
            $controller,
            'The controller must re-check the role before notifying.'
        );
    }

    /**
     * The notification link must open the SAME public detail route, not an
     * Admin-only alias, so a Planning Officer can act on what they were told.
     */
    public function test_the_notification_link_opens_the_shared_detail_route(): void
    {
        $notice = \App\Support\DiagnosticNotice::compose([
            'id' => '0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d',
            'reference_code' => 'DR-2026-0001',
            'title' => 'link contract',
            'module' => 'sync center',
        ]);

        $this->assertSame(
            '/diagnostics/0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d',
            $notice['action_url'],
            'The link must be the plain in-app detail path.'
        );

        // It must resolve to the very route a Planning Officer is authorized on.
        $resolved = $this->app->make(Router::class)->getRoutes()
            ->match(\Illuminate\Http\Request::create($notice['action_url'], 'GET'));

        $this->assertSame(
            'diagnostics.show',
            $resolved->getName(),
            'The link must resolve to diagnostics.show, the route shared with a Planning Officer.'
        );

        $chain = array_values(array_filter(
            $this->app->make(Router::class)->gatherRouteMiddleware($resolved),
            fn ($p) => str_contains((string) $p, 'RoleMiddleware')
        ));
        $this->assertStringEndsWith(
            ':Admin,Planning Officer',
            (string) $chain[0],
            'The link target must authorize a Planning Officer.'
        );
    }

    /**
     * REPORTS & SUPPORT: the development/support contact section is no longer
     * part of the locked hierarchy and is REMOVED, not gated.
     *
     * This assertion therefore pins its absence in BOTH the rendered view and
     * the controller that used to produce the prop. Gating it would have left a
     * permanently empty Admin-only block, which is the state the browser
     * acceptance rejected.
     */
    public function test_the_development_support_contact_section_is_removed_entirely(): void
    {
        $show = (string) file_get_contents(base_path('resources/js/Pages/Diagnostics/Show.jsx'));
        $this->assertStringNotContainsString(
            'Development / support contact',
            $show,
            'The section must be gone from the detail page.'
        );

        // Executable code only: this controller deliberately NAMES the removed
        // block in a comment to record why it is gone, so raw-text matching
        // would invert the meaning of the rule.
        $controller = (string) preg_replace(
            ['#/\*.*?\*/#s', '#^\s*(//|\*).*$#m'],
            '',
            (string) file_get_contents(base_path('app/Http/Controllers/DiagnosticReportController.php'))
        );
        $this->assertStringNotContainsString(
            'escalation',
            $controller,
            'No escalation prop may be produced. A removed section must not still be assembled server-side.'
        );
    }
}
