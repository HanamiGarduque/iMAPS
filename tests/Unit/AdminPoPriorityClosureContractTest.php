<?php

namespace Tests\Unit;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Admin/PO priority closure — runtime and source contracts.
 *
 * Two kinds of assertion live here, and the distinction matters:
 *
 *  1. RUNTIME route contracts. `Route::getRoutes()->match()` performs the same
 *     resolution the HTTP kernel does, so these assertions run against the real
 *     registered route table rather than reasoning about file order. They need
 *     no database, so they are executable in this environment.
 *
 *  2. SOURCE contracts for React rendering. This project has no JavaScript test
 *     runner, so JSX-level guarantees are asserted against the source and
 *     backed by `npm run build` for parse/compile correctness. They are
 *     deliberately narrow: they check that a guard exists, not that a pixel is
 *     correct.
 *
 * Assertions run against COMMENT-STRIPPED source. The change itself documents
 * the old behaviour in comments (for example "this used to fall back to
 * SAMPLE_APPLICATIONS"), and a naive substring check would match that
 * explanation and fail a correct implementation.
 *
 * The report-endpoint assertions exist because the audit claimed, from static
 * reading, that the duplicate definitions in routes/api.php shadowed the
 * role:Admin routes in routes/web.php and exposed report generation without
 * authentication. Runtime resolution disproves that: the web.php role:Admin
 * routes are the ones that answer. These tests lock in the verified behaviour
 * so a future refactor cannot silently regress it.
 */
class AdminPoPriorityClosureContractTest extends TestCase
{
    private function source(string $relativePath): string
    {
        $path = base_path($relativePath);
        $this->assertFileExists($path, "Expected source file {$relativePath} to exist.");

        return (string) file_get_contents($path);
    }

    /**
     * Strip whole-line comments so explanatory prose about a change is never
     * mistaken for the code it describes. Inline comments are intentionally
     * left alone: stripping "//" naively would corrupt URLs inside strings.
     */
    private function code(string $source): string
    {
        $source = (string) preg_replace('#/\*.*?\*/#s', '', $source);

        $kept = [];
        foreach (preg_split('/\R/', $source) as $line) {
            if (preg_match('#^\s*(//|\*|/\*)#', $line)) {
                continue;
            }
            $kept[] = $line;
        }

        return implode("\n", $kept);
    }

    private function codeOf(string $relativePath): string
    {
        return $this->code($this->source($relativePath));
    }

    private function matchRoute(string $method, string $uri)
    {
        return Route::getRoutes()->match(Request::create($uri, $method));
    }

    // ── Test 1: the Technical Review route renders a component that exists ──

    public function test_technical_review_route_is_registered_for_planning_officer(): void
    {
        $route = $this->matchRoute('GET', '/technical-review');

        $this->assertStringContainsString('TechnicalReviewController', $route->getActionName());
        $this->assertStringContainsString('role:Admin,Planning Officer', implode(',', $route->gatherMiddleware()));
    }

    public function test_technical_review_renders_a_component_that_exists_on_disk(): void
    {
        $this->assertMatchesRegularExpression(
            "/Inertia::render\(\s*'TechnicalReview\/Index'/",
            $this->codeOf('app/Http/Controllers/TechnicalReviewController.php'),
            'TechnicalReviewController@index must render TechnicalReview/Index.'
        );

        // This was the P0: the render target had no file behind it.
        $this->assertFileExists(
            base_path('resources/js/Pages/TechnicalReview/Index.jsx'),
            'The rendered page component must exist; this was the P0 defect.'
        );
    }

    public function test_every_inertia_page_named_by_a_routed_controller_exists_on_disk(): void
    {
        $missing = [];

        foreach (Route::getRoutes() as $route) {
            $action = $route->getActionName();

            if (! str_contains($action, '@') || ! str_contains($action, 'Controller')) {
                continue;
            }

            $controllerFile = base_path('app/Http/Controllers/' . Str::before($action, '@') . '.php');
            if (! is_file($controllerFile)) {
                continue;
            }

            $contents = $this->code((string) file_get_contents($controllerFile));

            if (! preg_match_all("/Inertia::render\(\s*'([^']+)'/", $contents, $matches)) {
                continue;
            }

            foreach ($matches[1] as $page) {
                if (! is_file(base_path('resources/js/Pages/' . $page . '.jsx'))) {
                    $missing[] = $page;
                }
            }
        }

        $this->assertSame(
            [],
            array_values(array_unique($missing)),
            'Every page rendered by a routed controller must exist under resources/js/Pages.'
        );
    }

    // ── Test 3: the queue navigates to the existing Application Detail workflow ──

    public function test_queue_navigates_to_application_detail_and_has_no_decision_controls(): void
    {
        $page = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        $this->assertStringContainsString('/applications/${application.id}', $page);

        // Navigation only: the queue must not post a decision.
        foreach (['technical-review/update-status', 'technical-review/submit-batch', 'technical-review/assign-inspector'] as $endpoint) {
            $this->assertStringNotContainsString($endpoint, $page);
        }

        $this->assertStringNotContainsString('Schedule Reinspection', $page);
    }

    public function test_sidebar_exposes_the_technical_review_entry(): void
    {
        $sidebar = $this->codeOf('resources/js/Components/Sidebar.jsx');

        $this->assertStringContainsString("href: '/technical-review'", $sidebar);
        $this->assertStringContainsString("label: 'Technical Review'", $sidebar);
    }

    // ── Tests 4 + 5: decision controls are PO-only in the UI, PO keeps them ──

    public function test_planning_officer_decision_controls_are_role_gated(): void
    {
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString(
            'const canRecordPlanningDecision = userRole === "Planning Officer";',
            $show,
            'A single explicit role flag must drive decision-control visibility.'
        );

        // Decision buttons, assignment form, batch submit and status update are
        // all Planning-Officer-only actions and must each be guarded.
        $this->assertStringContainsString('canRecordPlanningDecision && showDecisionButtons', $show);
        $this->assertStringContainsString('canRecordPlanningDecision && isBatchSubmitAllowed', $show);
        $this->assertStringContainsString('canRecordPlanningDecision && ["Needs Site Inspection", "Requires Reinspection"]', $show);
        $this->assertGreaterThanOrEqual(2, substr_count($show, 'canRecordPlanningDecision &&'), 'Every PO-only block must be guarded.');

        // A read-only role is told why, rather than silently losing the controls.
        $this->assertStringContainsString('Read-only view', $show);
    }

    public function test_role_middleware_remains_the_backend_boundary(): void
    {
        $routes = $this->codeOf('routes/web.php');

        foreach ([
            '/applications/update-status',
            '/technical-review/update-status',
            '/technical-review/submit-batch',
            '/technical-review/assign-inspector',
        ] as $endpoint) {
            $this->assertMatchesRegularExpression(
                '/Route::post\(\s*\'' . preg_quote($endpoint, '/') . '\'.*?role:Planning Officer/s',
                $routes,
                "{$endpoint} must remain role:Planning Officer."
            );
        }
    }

    // ── Test 6: unknown application id is a 404, never a sample dossier ──

    public function test_unknown_application_returns_404_and_no_sample_dossier(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');

        $this->assertStringContainsString('abort_if($application === null, 404)', $controller);
        $this->assertStringNotContainsString('getSampleApplicationData', $controller);
    }

    // ── Tests 7 + 8: no fabricated records in operational screens ──

    public function test_applications_list_has_no_sample_data_fallback(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        $this->assertStringNotContainsString('SAMPLE_APPLICATIONS', $page);
        $this->assertStringNotContainsString('isUsingPlaceholders', $page);
        $this->assertStringContainsString('No applications found.', $page);
    }

    public function test_drafts_list_has_no_sample_data_fallback(): void
    {
        $page = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringNotContainsString('SAMPLE_DRAFTS', $page);
        $this->assertStringNotContainsString('isUsingPlaceholders', $page);
        $this->assertStringNotContainsString('Preview', $page);
        $this->assertStringContainsString('No saved drafts.', $page);
    }

    // ── Tests 9 + 11: the Applications list line is local-only and named ──

    public function test_applications_list_renders_the_inspection_line_in_both_views(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        $this->assertStringContainsString('{card.inspection_summary && (', $page, 'Kanban card must render the line.');
        $this->assertStringContainsString('{item.inspection_summary && (', $page, 'Folder tile must render the line.');

        // Rendered directly, not hidden behind a tooltip or hover affordance.
        $this->assertStringNotContainsString('title={card.inspection_summary}', $page);
    }

    public function test_applications_controller_eager_loads_only_local_relations(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');

        $this->assertStringContainsString("with(['siteInspection.inspector'])->withCount('siteInspections')", $controller);
        $this->assertStringContainsString('InspectionSummary::line(', $controller);

        // The list must never reach Supabase / FieldSync for this summary.
        $start = strpos($controller, 'public function index');
        $end = strpos($controller, 'public function create');
        $indexBody = substr($controller, $start, $end - $start);

        $this->assertStringNotContainsString('SupabaseService', $indexBody);
        $this->assertStringNotContainsString('field_jobs', $indexBody);
    }

    public function test_parcel_exposes_all_rounds_without_changing_the_primary_relation(): void
    {
        $model = $this->codeOf('app/Models/Parcel.php');

        $this->assertStringContainsString('public function siteInspections(): HasMany', $model);
        $this->assertStringContainsString("hasOne(SiteInspection::class, 'parcel_id')->latestOfMany()", $model);
    }

    public function test_application_detail_renders_the_inspector_name(): void
    {
        $status = $this->codeOf('resources/js/Components/ParcelInspectionStatus.jsx');
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');

        $this->assertStringContainsString('Assigned Inspector', $status);
        $this->assertStringContainsString('inspection.inspector?.name', $status);

        // Read from the existing relation, never duplicated into a new column.
        $this->assertStringContainsString("->with(['siteInspection.inspector'])", $controller);
    }

    // ── Test 13: Requires Reinspection gets an explicit UI state ──

    public function test_requires_reinspection_has_an_explicit_indicator_state(): void
    {
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString(
            'if (decision === "Requires Reinspection") return "bg-violet-500";',
            $show,
            'Requires Reinspection must have its own indicator, not the neutral default.'
        );

        // No new colour token: violet is already this app's accent for the
        // Under Sangguniang Bayan stage in the Dashboard status map.
        $this->assertStringContainsString('bg-violet-50', $this->codeOf('resources/js/Pages/Dashboard.jsx'));
        $this->assertStringContainsString('text-violet-700', $this->codeOf('resources/js/Pages/Dashboard.jsx'));
    }

    // ── Tests 14 + 15 + 16: report endpoint authorization, verified at runtime ──

    /**
     * @dataProvider reportEndpointProvider
     */
    public function test_report_endpoints_are_admin_only_at_runtime(string $method, string $uri): void
    {
        $middleware = $this->matchRoute($method, $uri)->gatherMiddleware();

        $this->assertContains('web', $middleware, 'The endpoint must run in the session/CSRF group.');
        $this->assertContains('auth', $middleware, 'The endpoint must require authentication (guest denied).');
        $this->assertContains('role:Admin', $middleware, 'The endpoint must be restricted to Admin.');

        foreach ($middleware as $entry) {
            $this->assertStringNotContainsString(
                'Planning Officer',
                $entry,
                'A Planning Officer must not be authorized for report generation.'
            );
        }
    }

    public static function reportEndpointProvider(): array
    {
        return [
            'preview' => ['POST', '/api/analytics/report/preview'],
            'generate' => ['POST', '/api/analytics/report'],
        ];
    }

    public function test_unauthenticated_report_copies_are_not_the_registered_handler(): void
    {
        // Runtime resolution picks ONE handler per method+URI. The audit claimed
        // the unauthenticated AnalyticsController copies win; they do not.
        foreach (['/api/analytics/report/preview', '/api/analytics/report'] as $uri) {
            $action = $this->matchRoute('POST', $uri)->getActionName();
            $this->assertStringContainsString('ReportController', $action);
            $this->assertStringNotContainsString('AnalyticsController', $action);
        }
    }

    public function test_role_middleware_is_a_strict_exact_match(): void
    {
        $middleware = $this->codeOf('app/Http/Middleware/RoleMiddleware.php');

        $this->assertStringContainsString('in_array(Auth::user()->role, $roles, true)', $middleware);
        $this->assertStringContainsString('abort(403)', $middleware);
    }

    // ── Dashboard wording: labels must not claim more than the query proves ──

    public function test_dashboard_labels_do_not_claim_field_progress(): void
    {
        $dashboard = $this->codeOf('resources/js/Pages/Dashboard.jsx');

        $this->assertStringNotContainsString('"Active schedule"', $dashboard);
        $this->assertStringContainsString('Inspection Assignments', $dashboard);

        // "Released" also counted For Release, so "Approved & issued" was wrong.
        $this->assertStringNotContainsString('Approved & issued', $dashboard);
        $this->assertStringContainsString('For Release / Released', $dashboard);

        // "Pending Review" summed three different queues.
        $this->assertStringNotContainsString('"Awaiting action"', $dashboard);
        $this->assertStringContainsString('Open Cases', $dashboard);
    }
}
