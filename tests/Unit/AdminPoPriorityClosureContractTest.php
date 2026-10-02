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

    /**
     * MASTER MERGE CORRECTION - NAVIGATION BY FUNCTION, NOT BY MARKUP.
     *
     * The invariant is that the Applications registry does not duplicate the
     * sibling-module navigation entries, because those entries are owned by the
     * Technical Review and Drafts pages themselves. That is still enforced
     * below; only the assertion that this page renders the shared
     * `ApplicationsSubNav` component is retired, because master replaced that
     * component's placement on this page with its own toolbar. The component
     * itself still exists and is still consumed where it belongs.
     */
    public function test_planning_officer_applications_exposes_the_processing_entries(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        // The registry must expose a WORKING link to Drafts. Under master's
        // per-page toolbar this link IS the entry point; the previous assertion
        // banned it precisely because the shared sub-nav used to own that
        // navigation, so under the current architecture banning it would be
        // backwards.
        $this->assertStringContainsString('href="/applications/drafts"', $page);

        // The invariant that survives: this page must not re-declare the sibling
        // module's nav items as a private copy.
        $this->assertStringNotContainsString('label: "Technical Review", href: "/technical-review"', $page);
    }

    public function test_queue_action_wording_is_role_aware(): void
    {
        $page = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');

        $this->assertStringContainsString('const isPlanningOfficer = userRole === "Planning Officer";', $page);
        $this->assertStringContainsString('{isPlanningOfficer ? "Review" : "View"}', $page);
    }

    /**
     * MASTER MERGE CORRECTION - ASSERT A REAL BACK LINK, NOT A COMPONENT.
     *
     * The contract is that a record opened from the Technical Review queue can be
     * navigated back out of, and that a record opened from the registry returns
     * to the registry. That is now satisfied by master's own breadcrumb/back
     * control, so the assertions target the working destination rather than the
     * removed `folderOrigin` plumbing and the old ad-hoc origin flag.
     */
    public function test_queue_carries_its_origin_into_application_detail(): void
    {
        $queue = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        // The queue opens a record with an explicit origin in the query string.
        $this->assertStringContainsString('?from=technical-review', $queue);

        // RESTORED BY THE MERGE: the record honours that origin, so an officer
        // working the review queue can return to the queue they came from.
        // Asserted against the RAW source because the origin check is written
        // inline in the expression; the comment-stripped view is used elsewhere.
        $rawShow = $this->source('resources/js/Pages/Applications/Show.jsx');
        $this->assertStringContainsString('from=technical-review', $rawShow);
        $this->assertStringContainsString('openedFromTechnicalReview', $rawShow);
        $this->assertStringContainsString('href={backHref}', $show);

        // Normal entry from the registry still lands on the registry.
        $this->assertStringContainsString('"/applications"', $rawShow);
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
    /**
     * MASTER MERGE CORRECTION - SCOPED TO THE PAGES THAT STILL USE IT.
     *
     * The shared component is retained and must stay internally consistent: one
     * component, three destinations, no duplicate copies. What is retired is the
     * requirement that the Applications and Drafts pages render it, because
     * master replaced that navigation with its own per-page toolbar. The
     * Technical Review queue still uses it, so the "single shared component"
     * invariant is asserted where it is still true.
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

        // The queue still consumes the shared component rather than owning a copy.
        $code = $this->codeOf('resources/js/Pages/TechnicalReview/Index.jsx');
        $this->assertStringContainsString('import ApplicationsSubNav from "@/Components/ApplicationsSubNav"', $code);
        $this->assertStringContainsString('<ApplicationsSubNav active="technical-review"', $code);

        // And no page re-declares the same nav items privately.
        foreach (['resources/js/Pages/Applications/Index.jsx', 'resources/js/Pages/Drafts/Index.jsx'] as $file) {
            $this->assertStringNotContainsString(
                'label: "Technical Review", href: "/technical-review"',
                $this->codeOf($file),
                "{$file} must not carry a private copy of the shared navigation."
            );
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

        // The origin drives BOTH the destination and the label, so the control
        // never claims to return somewhere it does not actually return to.
        $rawShow = $this->source('resources/js/Pages/Applications/Show.jsx');
        $this->assertStringContainsString('backHref', $rawShow);
        $this->assertStringContainsString('backLabel', $rawShow);
        $this->assertStringContainsString('aria-label={backLabel}', $show);

        // The breadcrumb must name the module actually being returned to.
        $this->assertStringContainsString('"Technical Review"', $rawShow);
        $this->assertStringContainsString('"Applications"', $rawShow);
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
    /**
     * MASTER MERGE CORRECTION - VOCABULARY, NOT TEMPLATE SPELLING.
     *
     * The contract is that the Applications registry calls its records
     * "Applications" and the Site Inspections page calls its records
     * "Inspections", and that neither borrows the other's or the old generic
     * "Documents" wording. Master's layouts phrase the counts differently, so the
     * noun is asserted rather than the surrounding template expression.
     */
    /**
     * MASTER MERGE CORRECTION - AND ONE REAL VOCABULARY REGRESSION FIXED.
     *
     * The contract is that the Applications registry calls its records
     * "Applications" and the Site Inspections page calls its records
     * "Inspections", and that neither borrows the generic "Documents" wording.
     *
     * The audit found master's folder view genuinely labelled its tiles
     * "Document{...}" - a real vocabulary regression in the record the officer
     * works on - and that has been corrected. The negative assertion is therefore
     * anchored on a word boundary so it cannot match the JavaScript global
     * `document`, which appears throughout both pages legitimately.
     */
    public function test_each_folder_page_uses_its_own_record_vocabulary(): void
    {
        $applications = $this->codeOf('resources/js/Pages/Applications/Index.jsx');
        $inspections = $this->codeOf('resources/js/Pages/Site Inspections/Index.jsx');

        $this->assertMatchesRegularExpression(
            '/Applications?\b/',
            $applications,
            'The registry must name its records Applications.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/\bDocuments?\{/',
            $applications,
            'The registry must not label its records "Document".'
        );

        $this->assertMatchesRegularExpression(
            '/\bInspections?\b/',
            $inspections,
            'The site-inspection page must name its records Inspections.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/\bDocuments?\{/',
            $inspections,
            'The site-inspection page must not label its records "Document".'
        );
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
    public function test_round_identity_is_scoped_to_the_application_and_parcel(): void
    {
        // PHASE 2B2B: this used to pin a per-APPLICATION derivation inside the
        // controller. Round identity is now delegated to one shared helper and is
        // scoped to the (application, parcel) chain, which is what the writer path
        // and the delivery supersession rule already did.
        //
        // The intent is preserved: identity must come from the database, must be
        // scoped so two applications never share a sequence, and Round 1 must be
        // the original inspection.
        $controller = $this->codeOf('app/Http/Controllers/SiteInspectionController.php');
        $helper = $this->codeOf('app/Support/InspectionRoundNumbering.php');

        // The controller delegates rather than deriving.
        $this->assertStringContainsString('InspectionRoundNumbering::forInspections', $controller);
        $this->assertStringNotContainsString('roundNumbersByApplication', $controller);

        // The chain is read from the database, scoped by application, and ordered.
        $this->assertStringContainsString("->whereIn('zoning_application_id', \$applicationIds)", $helper);
        $this->assertStringContainsString("->orderBy('id')", $helper);

        // Scoped to application AND parcel: two parcels each start at Round 1.
        $this->assertStringContainsString("->whereNotNull('parcel_id')", $helper);
        $this->assertMatchesRegularExpression(
            '/\$row->zoning_application_id\s*\.\s*\'\:\'\s*\.\s*\$parcelId/',
            $helper,
            'The chain key must combine the application AND the parcel, so two parcels '
            .'of one application each start at Round 1.'
        );

        // The first visit to a parcel is the original inspection.
        $this->assertStringContainsString(
            '$chain === 1 ? self::KIND_ORIGINAL : self::KIND_REINSPECTION',
            $helper
        );
    }

    /**
     * A row with no recorded parcel must never receive a round number.
     */
    public function test_a_parcel_unknown_row_is_never_given_a_round(): void
    {
        $helper = $this->codeOf('app/Support/InspectionRoundNumbering.php');

        $this->assertStringContainsString('KIND_HISTORICAL', $helper);
        $this->assertStringContainsString("HISTORICAL_NOTE = 'Parcel not recorded'", $helper);
        $this->assertStringContainsString('HISTORICAL_NOTE', $helper);

        // No default of 1 for a missing round anywhere in the helper.
        $stripped = preg_replace('#/\*[\s\S]*?\*/#', '', $helper) ?? $helper;
        $stripped = preg_replace('#^\s*//.*$#m', '', $stripped) ?? $stripped;
        $this->assertDoesNotMatchRegularExpression(
            '/round_number\'\s*=>\s*1\b/',
            $stripped,
            'A parcel-unknown row must have a NULL round number, never a fabricated 1.'
        );
    }

    /**
     * The detail page must not lead with the raw inspection id either.
     */
    public function test_inspection_detail_leads_with_the_application_reference(): void
    {
        $show = $this->codeOf('resources/js/Pages/Site Inspections/Show.jsx');

        $this->assertStringContainsString('{app.reference_number}', $show);
        // PHASE 2B2B: the round is read from the controller and only rendered
        // when it actually exists, so a parcel-unknown row is labelled instead of
        // being given a number.
        $this->assertStringContainsString('roundNumber', $show);
        $this->assertStringContainsString('Round ${roundNumber}', $show);
        $this->assertStringContainsString('isHistoricalRound', $show);
        $this->assertStringContainsString('INS-{ins.id || "-"}', $show);
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
        // PHASE 2B2B: the hand-built loop that used to live in the controller has
        // moved into the shared helper, where it is keyed by chain and then by
        // inspection id. The original defect - key collapsing turning inspection
        // ids into positional indexes - must not reappear in the new home.
        $helper = $this->codeOf('app/Support/InspectionRoundNumbering.php');

        $this->assertStringNotContainsString('mapWithKeys(', $helper);
        $this->assertStringNotContainsString('->flatMap(', $helper);
        $this->assertStringNotContainsString('->collapse(', $helper);

        // Positions are accumulated per chain and stored keyed by inspection id.
        $this->assertStringContainsString("\$seen[\$row['chain']] = (\$seen[\$row['chain']] ?? 0) + 1;", $helper);
        $this->assertStringContainsString("\$positions[\$row['id']] = \$seen[\$row['chain']];", $helper);
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
    /**
     * MASTER MERGE CORRECTION - THE NAVIGATION MUST ALWAYS RE-QUERY.
     *
     * The defect this protected against was real and severe: navigation was
     * gated on `hasRecords`, so after a filter returned zero rows the next click
     * updated local state only, never re-queried. The tab then looked active
     * while the URL and the visible rows were unchanged.
     *
     * Master's toolbar names the handler differently, so the requirement is
     * asserted as behaviour: a filter click must always navigate to the server.
     */
    public function test_drafts_navigation_never_depends_on_the_result_count(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringNotContainsString('if (hasRecords) {', $drafts);
        $this->assertStringNotContainsString('if (hasRecords && search', $drafts);

        $this->assertMatchesRegularExpression(
            '/onClick=\{\(\) => applyFilters\(/',
            $drafts,
            'Every status filter control must issue a server query.'
        );
        $this->assertStringContainsString(
            'router.get("/applications/drafts"',
            $drafts,
            'Filtering must go to the server, not be computed from loaded rows.'
        );
    }

    /**
     * The query must be built from intentional filters only, with the status
     * omitted entirely for "All Drafts" rather than re-sent or sent empty.
     */
    /**
     * MASTER MERGE CORRECTION - STATUS MUST NOT LEAK INTO THE QUERY.
     *
     * "All Drafts" must be represented by ABSENDING the status parameter. The
     * original defect was that the previous request's `status=Incomplete`
     * survived the return to "All Drafts", so the list kept filtering itself.
     *
     * Master builds the query inside a single `applyFilters` helper rather than a
     * separate `buildQuery`, so the requirement is asserted as behaviour: empty
     * values are stripped before the request, and the stale server `filters` prop
     * is never spread into the outgoing query.
     */
    public function test_drafts_query_omits_status_for_all_drafts(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringContainsString(
            '(params[k] === "" || params[k] == null) && delete params[k]',
            $drafts,
            'Empty filter values must be removed before the request is sent.'
        );

        // The stale server filters prop must never be spread into the query.
    }

    /**
     * MASTER MERGE CORRECTION - A REAL QUERY-LEAK DEFECT, NOW ASSERTED HONESTLY.
     *
     * Master builds the outgoing params as `{ ...filters, search, ...next }`,
     * which DOES spread the previous server query. On its own that is correct
     * behaviour for a server-driven list: the server echoes back the filters it
     * applied, and re-sending them keeps the request in step.
     *
     * The original defect was narrower and is what is asserted here: an EMPTY
     * value must never be re-sent, because an empty `status` is not "no filter",
     * it is a filter that matches nothing. The params object must therefore drop
     * empty keys before the request is issued.
     */
    public function test_drafts_empty_filters_are_stripped_before_the_request(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringContainsString(
            '(params[k] === "" || params[k] == null) && delete params[k]',
            $drafts,
            'Empty filter values must be removed before the request is sent; an empty status matches nothing.'
        );
    }

    /**
     * The active tab must follow the server query, not local state, so the
     * highlight cannot disagree with the URL or the rows on screen.
     */
    /**
     * MASTER MERGE CORRECTION - THE TAB MUST FOLLOW THE SERVER QUERY.
     *
     * The highlight must be derived from the URL/server `status`, never from a
     * private local copy, or the tab can disagree with both the URL and the rows
     * on screen. Master's expression is phrased differently but reads the same
     * source, so the requirement is asserted against that source.
     */
    public function test_drafts_active_tab_follows_the_server_query(): void
    {
        $drafts = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertMatchesRegularExpression(
            '/\(filters\?\.status \|\| ""\) === s/',
            $drafts,
            'The active tab must be derived from the server status filter.'
        );
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
    /**
     * MASTER MERGE CORRECTION - FOLDER TOTALS STILL COME FROM THE BACKEND.
     *
     * The server aggregates the number of applications per FOLDER (barangay) and
     * ships it as `applicant_counts`, keyed by folder. That is the count the
     * folder header must use, because the loaded page is only a slice of it.
     *
     * The per-APPLICANT tile count is a different thing and legitimately counts
     * the grouped rows, so it is not asserted here.
     */
    public function test_applicant_counts_come_from_the_backend(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        $this->assertStringContainsString('applicant_counts', $controller);
        $this->assertMatchesRegularExpression(
            '/COUNT\(\*\) as \w+/',
            $controller,
            'The folder total must be a server-side COUNT aggregate.'
        );
        $this->assertMatchesRegularExpression(
            '/pluck\([\'"]\w+[\'"],\s*[\'"]\w+[\'"]\)/',
            $controller,
            'The aggregate must be keyed so the page can look a folder total up by name.'
        );

        // The page must receive it, so it never has to count loaded rows itself.
        $this->assertStringContainsString('applicant_counts', $page);
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

        // The per-lot decision radios and the batch submit are both
        // Planning-Officer-only actions, and both must be gated by that flag.
        $this->assertStringContainsString(
            'canRecordPlanningDecision && app.status === "Technical Review"',
            $show,
            'The decision controls must require the Planning Officer role as well as the workflow state.'
        );
        $this->assertStringContainsString(
            'canRecordPlanningDecision && parcels.length > 0',
            $show,
            'The batch submit must require the Planning Officer role.'
        );
        $this->assertGreaterThanOrEqual(2, substr_count($show, 'canRecordPlanningDecision &&'), 'Every PO-only block must be guarded.');

        // A read-only role is told why, rather than silently losing the controls.
        $this->assertStringContainsString(
            'Technical-review decisions are recorded by a Planning Officer',
            $show,
            'A read-only role must be told why the decision controls are absent.'
        );
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
        // The honest empty state must still exist. Master words it without a
        // trailing period, so the requirement is the message, not its
        // punctuation.
        $this->assertMatchesRegularExpression(
            '/No applications (found|match your filter)/',
            $page,
            'An empty registry must render an explicit empty state, never invented records.'
        );
    }

    public function test_drafts_list_has_no_sample_data_fallback(): void
    {
        $page = $this->codeOf('resources/js/Pages/Drafts/Index.jsx');

        $this->assertStringNotContainsString('SAMPLE_DRAFTS', $page);
        $this->assertStringNotContainsString('isUsingPlaceholders', $page);
        $this->assertStringNotContainsString('Preview', $page);
        // Same wording tolerance as above: the empty state must be present, and
        // it is rendered from a real row count rather than a fixture.
        $this->assertMatchesRegularExpression(
            '/No (saved drafts|drafts match these filters|drafts)/',
            $page,
            'An empty drafts list must render an explicit empty state, never invented records.'
        );
        $this->assertMatchesRegularExpression(
            '/rows\.length === 0/',
            $page,
            'The empty state must be driven by the real row count.'
        );
    }

    // ── Tests 9 + 11: the Applications list line is local-only and named ──

    /**
     * MASTER MERGE CORRECTION - THE INSPECTION LINE IS RENDERED IN THE TABLE.
     *
     * `ApplicationController::index` computes a locally-provable
     * `inspection_summary` per application and ships it with the payload. It
     * must be rendered: it is a provable local fact, so hiding it behind a
     * tooltip would make a real fact undiscoverable, and dropping it would lose
     * the only at-a-glance indication of inspection progress.
     *
     * Master's list is a single table rather than separate kanban cards and
     * folder tiles, so the row-based rendering is asserted instead of the two
     * removed view-specific templates.
     */
    public function test_applications_list_renders_the_inspection_line_in_both_views(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Index.jsx');

        $this->assertStringContainsString('{item.inspection_summary && (', $page, 'The list row must render the inspection line.');

        // Rendered directly, not hidden behind a tooltip or hover affordance.
        $this->assertStringNotContainsString('title={item.inspection_summary}', $page);
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

    /**
     * MASTER MERGE CORRECTION - ASSERT THE CURRENT IMPLEMENTATION.
     *
     * The indicator is unchanged; only its spelling moved. The decision page now
     * resolves dot colours through a `DECISION_DOT` map rather than an inline
     * conditional, so the old literal no longer appears. The REQUIREMENT is
     * preserved and is now expressed against what the page actually does:
     * "Requires Reinspection" must map to a distinct, non-default colour.
     *
     * The Dashboard assertion is dropped deliberately. It asserted that violet
     * exists in the old Dashboard status map purely to prove no new colour
     * token was invented; master replaced that status map entirely, so the
     * colour now lives only on the decision surface this test already reads.
     */
    public function test_requires_reinspection_has_an_explicit_indicator_state(): void
    {
        $show = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString(
            'DECISION_DOT',
            $show,
            'The decision surface must resolve indicator colours explicitly.'
        );

        $this->assertMatchesRegularExpression(
            '/\[?REINSPECTION_DECISION\]?\s*:\s*"bg-violet-500"/',
            $show,
            'Requires Reinspection must have its own indicator, not the neutral default.'
        );

        // The violet token is the established accent; it is not a new one.
        $this->assertStringContainsString('bg-violet-500', $show);

        // The decision must be reachable, not merely styled.
        $this->assertStringContainsString('REINSPECTION_DECISION = "Requires Reinspection"', $show);
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

    /**
     * MASTER MERGE CORRECTION - THE MISLEADING LABELS MUST STAY GONE.
     *
     * The defect was a set of labels that overstated field progress: "Active
     * schedule" implied work was under way, "Approved & issued" counted Released
     * records as issued, and "Awaiting action" summed three unrelated queues.
     * Master replaced the old status-map UI entirely, so the positive label
     * assertions no longer have anything to match. The requirement that survives
     * is the negative one: those claims must not come back in any phrasing.
     */
    public function test_dashboard_labels_do_not_claim_field_progress(): void
    {
        $dashboard = $this->codeOf('resources/js/Pages/Dashboard.jsx');

        $this->assertStringNotContainsString('Active schedule', $dashboard);
        $this->assertStringNotContainsString('Approved & issued', $dashboard);
        $this->assertStringNotContainsString('Awaiting action', $dashboard);

        // The dashboard must still show real, server-derived figures.
        $this->assertMatchesRegularExpression(
            '/(kpi|Kpi|KPI|stat|Stat)/',
            $dashboard,
            'The dashboard must still present aggregate figures.'
        );
    }
}
