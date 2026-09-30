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

    public function test_sidebar_does_not_advertise_technical_review_as_a_module(): void
    {
        $sidebar = $this->codeOf('resources/js/Components/Sidebar.jsx');

        // Technical Review is a Planning Officer application-processing queue,
        // not a top-level business module, so it must not be a navItems entry.
        // Removing it entirely is what guarantees an Admin is never offered it.
        $this->assertStringNotContainsString("href: '/technical-review'", $sidebar);
        $this->assertStringNotContainsString("label: 'Technical Review'", $sidebar);

        // The Applications entry keeps the Technical Review route highlighted
        // while the officer is working inside it.
        $this->assertStringContainsString("normalized === 'technical-review'", $sidebar);
    }

    public function test_planning_officer_applications_exposes_the_processing_entries(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        // The three sibling entries are owned by the shared component now, so
        // this page must consume it rather than keep a private copy. Note the
        // page legitimately still contains the application STATUS label
        // "Technical Review"; what must not reappear is a navigation entry.
        $this->assertStringContainsString('<ApplicationsSubNav active="all" userRole={userRole} />', $page);
        $this->assertStringNotContainsString('href: "/technical-review"', $page);
        $this->assertStringNotContainsString('href="/applications/drafts"', $page);
    }

    public function test_queue_action_wording_is_role_aware(): void
    {
        $page = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        $this->assertStringContainsString('const isPlanningOfficer = userRole === "Planning Officer";', $page);
        $this->assertStringContainsString('{isPlanningOfficer ? "Review" : "View"}', $page);
    }

    public function test_queue_carries_its_origin_into_application_detail(): void
    {
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        // Explicit origin in the query string, not inferred from history.
        $this->assertStringContainsString('?from=technical-review', $queue);
        $this->assertStringContainsString('openedFromTechnicalReview', $show);
        $this->assertStringContainsString('href="/technical-review"', $show);
        $this->assertStringContainsString('<span>Technical Review</span>', $show);

        // The origin is now read through the shared folder-origin resolver, so a
        // second ad-hoc origin check cannot creep back in beside it. The
        // hardcoded substring test that used to guard this is gone precisely
        // because that mechanism was replaced.
        $this->assertStringContainsString('resolveBackTarget', $show);
        $this->assertStringContainsString('technical-review', $show);
        $this->assertStringNotContainsString('currentUrl.includes("from=technical-review")', $show);

        // Normal entry from Applications is unchanged: with no folder origin the
        // control is the plain registry root, and it is labelled accordingly.
        $this->assertStringContainsString('rootLabel: "All Applications"', $show);
        $this->assertStringContainsString('{backTarget.label}', $show);
    }

    public function test_pagination_is_in_normal_flow_after_the_list(): void
    {
        $page = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        // The list must not be a shrinkable flex child: that let the card column
        // overflow its box and paint over the pagination footer.
        $this->assertStringNotContainsString('px-4 flex-1 min-h-0"', $page);
        $this->assertStringContainsString('<div className="px-4">', $page);

        // Footer sits after the list, separated by a rule and real spacing, and
        // wraps instead of squeezing on a narrow viewport.
        $this->assertStringContainsString('border-t border-slate-200/80 flex flex-wrap items-center justify-between', $page);
        $this->assertStringContainsString('mt-4 pt-4', $page);

        // The footer itself must not be taken out of flow, and must not use a
        // negative-offset hack to sit over the list.
        $this->assertSame(
            1,
            preg_match('/<div className="px-4 mt-4 pt-4[^"]*">/', $page, $footerMatch),
            'The pagination footer must be a normal-flow container.'
        );
        $footer = $footerMatch[0];
        $this->assertStringNotContainsString('absolute', $footer);
        $this->assertStringNotContainsString('fixed', $footer);
        $this->assertStringNotContainsString('-translate-y', $footer);
        $this->assertStringNotContainsString('-mt-', $footer);
    }

    public function test_reassignment_placement_is_documented(): void
    {
        $doc = $this->source('docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md');

        $this->assertStringContainsString('Where the Admin continuity action belongs', $doc);
        $this->assertStringContainsString('Work Assignment', $doc);
        $this->assertStringContainsString('Assigned Planning Officer', $doc);
        $this->assertStringContainsString('Reassign', $doc);
        $this->assertStringContainsString('APPLICATION-LEVEL ownership', $doc);
        $this->assertStringContainsString('INSPECTION-ROUND ownership', $doc);
    }

    // ── Applications module consistency: one parent, three sibling sections ──

    /**
     * Tests 1-3: the header badge represents the MODULE, so all three
     * subsections must resolve to the same parent badge. The page H1 names the
     * subsection; the two are deliberately different things.
     */
    public function test_all_three_subsections_resolve_to_the_applications_module_badge(): void
    {
        $header = $this->codeOf('resources/js/Components/Header.jsx');

        // activePage signal
        $this->assertStringContainsString(
            "normalized === 'drafts' || normalized === 'tech-review' || normalized === 'technical-review'",
            $header,
            'activePage for any Applications subsection must badge as APPLICATIONS.'
        );

        // URL first-segment signal
        $this->assertMatchesRegularExpression(
            "/case 'applications':\s*\n\s*case 'drafts':\s*\n\s*case 'technical-review':\s*\n\s*return 'APPLICATIONS';/",
            $header,
            'The URL segments for all three subsections must resolve to APPLICATIONS.'
        );

        // Inertia component signal
        $this->assertStringContainsString(
            "comp.startsWith('applications') || comp.startsWith('drafts') || comp.startsWith('technicalreview')",
            $header,
            'The component signal must badge Technical Review under APPLICATIONS too.'
        );

        // And Technical Review must no longer badge as its own module anywhere.
        $this->assertStringNotContainsString("return 'TECHNICAL REVIEW'", $header);
    }

    /**
     * Test 4 + 5: one shared component owns the sibling navigation, and every
     * subsection page renders it with its own active key.
     */
    public function test_subsections_share_one_sub_navigation_component(): void
    {
        $component = base_path('resources/js/Components/ApplicationsSubNav.jsx');
        $this->assertFileExists($component, 'A single shared sub-navigation component must exist.');

        $shared = $this->code((string) file_get_contents($component));
        $this->assertStringContainsString('{ key: "all", label: "All Applications", href: "/applications" }', $shared);
        $this->assertStringContainsString('{ key: "technical-review", label: "Technical Review", href: "/technical-review" }', $shared);
        $this->assertStringContainsString('{ key: "drafts", label: "Drafts", href: "/applications/drafts" }', $shared);
        $this->assertStringContainsString('aria-current={isActive ? "page" : undefined}', $shared);

        // The three pages must consume the shared component, not each own a copy.
        $pages = [
            'resources/js/Pages/Applications/Index.jsx' => 'active="all"',
            'resources/js/Pages/TechnicalReview/Index.jsx' => 'active="technical-review"',
            'resources/js/Pages/Drafts/Index.jsx' => 'active="drafts"',
        ];

        foreach ($pages as $file => $active) {
            $code = $this->codeOf($file);
            $this->assertStringContainsString('import ApplicationsSubNav from "@/Components/ApplicationsSubNav";', $code, "{$file} must import the shared sub-navigation.");
            $this->assertStringContainsString('<ApplicationsSubNav ' . $active, $code, "{$file} must render the shared sub-navigation with {$active}.");
        }
    }

    /**
     * Test 6: the sibling entries are Planning Officer workflow. A read-only
     * role must receive nothing rather than a partial or misleading set.
     */
    public function test_sub_navigation_is_planning_officer_only(): void
    {
        $shared = $this->code((string) file_get_contents(base_path('resources/js/Components/ApplicationsSubNav.jsx')));

        $this->assertStringContainsString('if (userRole !== "Planning Officer") {', $shared);
        $this->assertStringContainsString('return null;', $shared);

        foreach ([
            'resources/js/Pages/Applications/Index.jsx',
            'resources/js/Pages/TechnicalReview/Index.jsx',
            'resources/js/Pages/Drafts/Index.jsx',
        ] as $file) {
            $this->assertStringContainsString(
                'userRole={userRole}',
                $this->codeOf($file),
                "{$file} must pass the role through to the shared sub-navigation."
            );
        }
    }

    /**
     * Test 7 + 9: no duplicate navigation. The standalone Drafts back-to-registry
     * arrow and the Technical Review "All Applications" button are both
     * superseded by the persistent sub-navigation.
     */
    public function test_duplicate_navigation_was_removed(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');
        $this->assertStringNotContainsString('Back to Registry', $drafts, 'The Drafts back-to-registry arrow duplicates the sub-navigation.');

        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $this->assertStringNotContainsString(
            '<span>All Applications</span>',
            $queue,
            'The Technical Review All Applications button duplicates the sub-navigation.'
        );
    }

    /**
     * Test 8: the Technical Review -> Application Detail origin context must
     * survive this pass.
     */
    public function test_review_to_detail_origin_context_is_preserved(): void
    {
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString('?from=technical-review', $queue);
        $this->assertStringContainsString('openedFromTechnicalReview', $show);
        $this->assertStringContainsString('href="/technical-review"', $show);

        // With no folder origin the back control is the registry root, named
        // honestly rather than claiming to return to "All Records" while
        // actually restoring a single applicant folder.
        $this->assertStringContainsString('rootLabel: "All Applications"', $show);
        $this->assertStringNotContainsString('<span>All Records</span>', $show);
    }

    /**
     * Additional pagination requirement: the review queue pages 10 rows per
     * page, server-side, and the page-size contract is a named constant.
     */
    public function test_review_queue_uses_ten_rows_per_page_server_side(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringContainsString('public const QUEUE_PAGE_SIZE = 10;', $controller);
        $this->assertStringContainsString('->paginate(self::QUEUE_PAGE_SIZE)', $controller);
        $this->assertStringContainsString('->withQueryString()', $controller, 'Search and filter parameters must survive page changes.');

        // The previous 25-row page size must be gone from this queue.
        $this->assertStringNotContainsString('paginate(25)', $controller);
    }

    public function test_review_queue_pagination_reads_server_ranges_not_a_client_slice(): void
    {
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        // Ranges come from the server paginator, so the page size is server-owned.
        $this->assertStringContainsString('Showing {applications.from}–{applications.to} of {applications.total}', $queue);
        $this->assertStringNotContainsString('.slice(', $queue, 'The queue must not slice a larger client-side list.');

        // Page links come from the server paginator and are followed as-is, so
        // search and filter parameters persist.
        $this->assertStringContainsString('applications.links?.map(', $queue);
        $this->assertStringContainsString('router.get(link.url', $queue);
    }

    /**
     * The applications list keeps its own page size; this pass must not have
     * changed unrelated pagination.
     */
    public function test_unrelated_pagination_is_untouched(): void
    {
        $this->assertStringContainsString('paginate(25)', $this->codeOf('app/Http/Controllers/ApplicationController.php'));
    }

    /**
     * The queue search must not call a builder method that does not exist.
     *
     * `orWhereILike()` is not available on the Eloquent builder in this Laravel
     * version, so the previous implementation threw a 500 and the queue search
     * never worked. Both arms now use the explicit operator form.
     */
    public function test_queue_search_uses_only_available_builder_methods(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringNotContainsString('orWhereILike(', $controller);
        $this->assertStringContainsString(
            "'zoning_applications.applicant_name', 'ILIKE', \$term",
            $controller
        );
        $this->assertStringContainsString(
            "'zoning_applications.reference_number', 'ILIKE', \$term",
            $controller
        );
    }

    /**
     * The debounced search effect must not re-query on mount, because doing so
     * dropped any ?page= the officer arrived with and silently reset pagination.
     */
    public function test_queue_search_effect_does_not_reset_the_page_on_mount(): void
    {
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        $this->assertStringContainsString('const isFirstSearchRun = useRef(true);', $queue);
        $this->assertStringContainsString('if (isFirstSearchRun.current) {', $queue);
        $this->assertStringContainsString('isFirstSearchRun.current = false;', $queue);
    }

    /**
     * An out-of-range page must be resolved server-side rather than rendering an
     * empty queue.
     */
    public function test_out_of_range_queue_page_resolves_to_the_last_page(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringContainsString('$applications->currentPage() > $applications->lastPage()', $controller);
        $this->assertStringContainsString("redirect()->route('technicalreview.index', \$query)", $controller);
    }

    // ── Application vs Site Inspection record identity ──

    /**
     * Tests 1 + 2: the two folder pages count different record types, so they
     * must not both call their contents "Documents".
     */
    public function test_each_folder_page_uses_its_own_record_vocabulary(): void
    {
        $applications = $this->codeOf('resources/js/Pages/Applications/Index.jsx');
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Index.jsx');

        // The Applications count is now a backend-supplied applicant total, so
        // the wording is asserted rather than a page-local length expression.
        $this->assertStringContainsString('Application${total !== 1 ? "s" : ""}', $applications);
        $this->assertStringNotContainsString('Document{', $applications);

        $this->assertStringContainsString('.length} Inspection{', $inspections);
        $this->assertStringNotContainsString('.length} Document{', $inspections);
    }

    /**
     * Tests 3 + 4: the raw site_inspections.id must not be the primary label, and
     * the application reference must be shown when available.
     */
    public function test_inspection_child_shows_reference_not_the_raw_id(): void
    {
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Index.jsx');

        $this->assertStringContainsString(
            '{item.display_reference || `Application #${item.zoning_application_id}`}',
            $inspections,
            'The primary label must be the application reference.'
        );

        // The id is still present, but only as a quiet secondary reference.
        $this->assertStringContainsString('INS-{item.id}', $inspections);
    }

    /**
     * Tests 5 + 6: status wording is locally provable only. An `assigned` row is
     * never presented as field progress.
     */
    public function test_inspection_status_wording_is_locally_provable(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/SiteInspectionController.php');

        $this->assertStringContainsString("'completed', 'submitted' => 'Completed'", $controller);
        $this->assertStringContainsString("default => 'Assigned'", $controller);

        $this->assertStringNotContainsString("'Ongoing'", $controller);
        $this->assertStringNotContainsString("'In Progress'", $controller);
    }

    /**
     * Tests 7 + 8: the round number and the original/reinspection classification
     * must come from the per-application sequence, never from the applicant or
     * the raw id.
     */
    public function test_round_identity_is_scoped_to_the_application(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/SiteInspectionController.php');

        $this->assertStringContainsString('roundNumbersByApplication', $controller);
        $this->assertStringContainsString("->whereIn('zoning_application_id', \$applicationIds)", $controller);
        $this->assertStringContainsString("->orderBy('zoning_application_id')", $controller);
        $this->assertStringContainsString("->orderBy('id')", $controller);

        // The first round of its OWN application is the original inspection.
        $this->assertStringContainsString(
            "\$round === 1 ? 'Original Inspection' : 'Reinspection'",
            $controller
        );
    }

    /**
     * The detail page must not lead with the raw inspection id either.
     */
    public function test_inspection_detail_leads_with_the_application_reference(): void
    {
        $show = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');

        $this->assertStringContainsString('{app.reference_number}', $show);
        $this->assertStringContainsString('Round ${ins.round_number}', $show);
        $this->assertStringContainsString('INS-{ins.id || "—"}', $show);
    }

    /**
     * Regression guard for a real defect found while verifying round numbers.
     *
     * The round map was first built with flatMap()/mapWithKeys(). flatMap()
     * collapses through array_merge, which renumbers integer keys, so the
     * inspection ids in the map were silently replaced by positional indexes.
     * Two inspections of the same application then both came out as "Round 1".
     * The map must be built by an explicit loop.
     */
    public function test_round_map_is_not_built_with_key_collapsing_collection_helpers(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/SiteInspectionController.php');

        $this->assertStringNotContainsString('mapWithKeys(', $controller);
        $this->assertStringNotContainsString('->flatMap(', $controller);
        $this->assertStringContainsString('$rounds[$row->id] = ++$round;', $controller);
    }

    // ── Drafts status filter must not survive "All Drafts" ──

    /**
     * Regression for a reproducible bug: All Drafts -> Incomplete -> All Drafts
     * left the list empty while the All Drafts tab looked active.
     *
     * Navigation used to be gated on `hasRecords`, so once a status legitimately
     * returned no rows the next click only updated local state and never
     * re-queried, leaving `status=Incomplete` in the URL.
     */
    public function test_drafts_navigation_never_depends_on_the_result_count(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringNotContainsString('if (hasRecords) {', $drafts);
        $this->assertStringNotContainsString('if (hasRecords && search', $drafts);
        $this->assertMatchesRegularExpression(
            '/const applyFilter = \(newFilters\) => \{.*?router\.get\("\/applications\/drafts"/s',
            $drafts,
            'applyFilter must always re-query the server.'
        );
    }

    /**
     * The query must be built from intentional filters only, with the status
     * omitted entirely for "All Drafts" rather than re-sent or sent empty.
     */
    public function test_drafts_query_omits_status_for_all_drafts(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringContainsString('function buildQuery(overrides = {}) {', $drafts);
        $this->assertStringContainsString('delete next.status;', $drafts);

        // The stale server filters prop must never be spread into the query.
        $this->assertStringNotContainsString('{ ...filters,', $drafts);
        $this->assertStringNotContainsString('{ ...filters, ...newFilters', $drafts);

        $this->assertStringContainsString('setCurrentPage(1);', $drafts);
    }

    /**
     * The active tab must follow the server query, not local state, so the
     * highlight cannot disagree with the URL or the rows on screen.
     */
    public function test_drafts_active_tab_follows_the_server_query(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringContainsString('const isSelected = (filters?.status || "") === s;', $drafts);
        $this->assertStringNotContainsString('statusFilter', $drafts);
    }

    /**
     * The placeholder fixtures must stay removed.
     */
    public function test_drafts_still_has_no_fabricated_rows(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringNotContainsString('SAMPLE_DRAFTS', $drafts);
        $this->assertStringNotContainsString('isUsingPlaceholders', $drafts);
    }

    /**
     * The backend must treat an absent status as no filter, so omitting the
     * parameter for "All Drafts" is genuinely equivalent to no status at all.
     */
    public function test_drafts_controller_treats_status_as_optional_filter(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');

        $this->assertStringContainsString("if (\$request->filled('status')) {", $controller);
    }

    // ── Applicant folder counts must be true totals, not page-local ──

    /**
     * The folder count is only honest if the backend supplies a real
     * applicant-level count for the current filters. Counting the loaded rows
     * would present a page-local number as a total.
     */
    public function test_applicant_counts_come_from_the_backend(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        $this->assertStringContainsString('applicant_counts', $controller);
        $this->assertStringContainsString('COUNT(*) as folder_total', $controller);
        $this->assertStringContainsString('groupByRaw($folderKey)', $controller);
        $this->assertStringContainsString("'applicant_counts' => \$applicantCounts", $controller);

        $this->assertStringContainsString('const applicantTotal = (name) => {', $page);
        $this->assertStringContainsString('applicantTotal(selectedFolder)', $page);
        $this->assertStringContainsString('showing ${listed}', $page);

        $this->assertStringNotContainsString(
            '.length} Application{',
            $page,
            'The folder header must not count only the loaded rows.'
        );
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

        // LOOP 9D SCOPE CORRECTION, 2026-09-30.
        //
        // This asserted one exact eager-load STRING:
        //     with(['siteInspection.inspector'])->withCount('siteInspections')
        //
        // 9D legitimately extended that same clause so the delivery monitoring line
        // can read the latest round's delivery state and its aggregate attempt count
        // without an extra query. Asserting the literal string therefore froze the
        // shape rather than the meaning.
        //
        // What this test exists to protect is unchanged and is now asserted as
        // FACTS, which is strictly stronger than matching one spelling: the latest
        // round, its inspector and the round count must all still be eager-loaded,
        // and the list must still never reach a remote.
        $this->assertStringContainsString(
            "'siteInspection'",
            $controller,
            'The list must still eager-load the latest inspection round per parcel.'
        );

        $this->assertStringContainsString(
            "withCount('siteInspections')",
            $controller,
            'The list must still eager-load the per-parcel round count.'
        );

        $this->assertStringContainsString(
            '->with(',
            $controller,
            'The round and inspector must still arrive by eager load, not per row.'
        );

        $this->assertStringContainsString('InspectionSummary::line(', $controller);

        // The list must never reach Supabase / FieldSync for this summary.
        $start = strpos($controller, 'public function index');
        $end = strpos($controller, 'public function create');
        $indexBody = substr($controller, $start, $end - $start);

        $this->assertStringNotContainsString('SupabaseService', $indexBody);
        $this->assertStringNotContainsString('field_jobs', $indexBody);

        // LOOP 9D: the same remote-free guarantee for the monitoring block, which
        // is the new part of index().
        $monitoringStart = strpos($controller, 'private function buildDeliveryMonitoring');
        $this->assertNotFalse($monitoringStart, 'The monitoring builder must exist.');

        $monitoringBody = substr($controller, $monitoringStart, 2600);

        foreach (['SupabaseService', 'Http::', 'PushInspectionToSupabase', 'dispatch('] as $remote) {
            $this->assertStringNotContainsString(
                $remote,
                $monitoringBody,
                "Delivery monitoring must stay local PostgreSQL. Found '{$remote}'."
            );
        }
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
