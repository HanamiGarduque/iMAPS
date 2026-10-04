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
        'diagnostics.handle' => 'Admin,Planning Officer',
        'diagnostics.notify-planning-officers' => 'Admin',
        // Development Support escalation is Admin-mediated internal workflow.
        // It is asserted here alongside every other diagnostics route because the
        // inherited-group defect this suite exists to catch applies to it exactly
        // the same way: a second, stricter entry would run first and silently
        // decide the outcome.
        'diagnostics.escalations.store' => 'Admin',
        'diagnostics.escalations.recommendation' => 'Admin',
        'diagnostics.escalations.close' => 'Admin',
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

        // The scoped handling action, the unchanged notice, and the three
        // Admin-only escalation actions. Listed exhaustively on purpose: a sixth
        // diagnostics POST must fail this assertion rather than appear unnoticed.
        $posts = collect($this->app->make(Router::class)->getRoutes()->getRoutes())
            ->filter(fn ($route) => str_starts_with($route->uri(), 'diagnostics') && in_array('POST', $route->methods()))
            ->map(fn ($route) => $route->uri())->sort()->values()->all();
        $this->assertSame([
            'diagnostics/{report}/escalations',
            'diagnostics/{report}/escalations/{escalation}/close',
            'diagnostics/{report}/escalations/{escalation}/recommendation',
            'diagnostics/{report}/handle',
            'diagnostics/{report}/notify-planning-officers',
        ], $posts);

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
     * REPORTS & SUPPORT: the ORIGINAL development/support contact block is gone.
     *
     * What this pins is that the specific historical block is absent - the
     * "Development / support contact" heading and the four contact fields that
     * used to be rendered for every viewer of a report detail page.
     *
     * Development Support escalation was subsequently authorized as
     * Admin-mediated INTERNAL workflow. That is a different thing and is scoped
     * far more tightly than the block this assertion removed: the prop is
     * produced only for an Admin viewing a Technical Issue, it is null - not
     * merely hidden - for a Planning Officer and for an Application Support
     * report, and it sits outside the inspector-facing official response. Its
     * scope is proven by tests/Feature/ReportEscalationTest.php, which asserts
     * `props.developmentSupport` is null in every forbidden case.
     *
     * What must never come back is the un-gated contact block that caused the
     * original browser-acceptance rejection.
     */
    public function test_the_unscoped_development_support_contact_block_does_not_return(): void
    {
        $show = (string) file_get_contents(base_path('resources/js/Pages/Diagnostics/Show.jsx'));
        $this->assertStringNotContainsString(
            'Development / support contact',
            $show,
            'The original unscoped contact block must stay gone from the detail page.'
        );

        // The escalation panel must be reached only through the scoped prop, and
        // never rendered unconditionally for every viewer of every report.
        $this->assertMatchesRegularExpression(
            '/\{developmentSupport\s*&&\s*<DevelopmentSupport/',
            $show,
            'The escalation panel must render only when the prop exists. An unconditional'
            .' <DevelopmentSupport element is the defect this assertion exists to prevent.'
        );

        // The contact fields may only ever be read through the four documented
        // safe keys. A new key in this loop is a new exposed field, so the loop
        // itself is the contract.
        $controller = (string) file_get_contents(base_path('app/Http/Controllers/DiagnosticReportController.php'));
        $this->assertMatchesRegularExpression(
            "/foreach \(\['name', 'email', 'channel', 'instructions'\] as \\\$key\)/",
            $controller,
            'Only the four documented safe contact fields may be read.'
        );
    }
}
