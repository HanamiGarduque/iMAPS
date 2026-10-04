<?php

namespace Tests\Unit;

use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Route as RouteFacade;
use Tests\TestCase;

/**
 * POST-LOOP-9 SMOKE FIX - the four bounded corrections made on
 * `fix/post-loop9-smoke-diagnostics`.
 *
 * SCOPE
 * -----
 *   A. PARCEL PIN. Corrected contract: the report's pin is confirmed FieldSync
 *      GPS evidence. Local parcel coordinates are application location only;
 *      property_index_number is separately labelled cadastral identity.
 *   B. DIAGNOSTIC ACCESS. Read access widened to Admin + Planning Officer, with
 *      a Site Inspector still refused, and no write path for anybody.
 *   C. NOTIFICATION. Intentionally NOT implemented: the existing notification
 *      mechanism persists to a `notifications` table that canonical does not
 *      have. These tests pin that no half-built notify action shipped.
 *   D. DIAGNOSTIC SHELL. Both pages must use the shared authenticated shell, and
 *      the detail page must offer back-to-list navigation.
 *
 * These are contract assertions over source and configuration, matching the
 * established style in this suite. They are deliberately written against
 * BEHAVIOUR and DATA PROVENANCE rather than one exact string, so a restyle does
 * not silently void them.
 *
 * NOTE ON THE BASE CLASS. This suite now extends `Tests\TestCase` (the
 * application-booting base) rather than PHPUnit's plain `TestCase`, because the
 * diagnostics AUTHORITY assertions must read the live route table and resolve
 * the middleware chain through the real router. Asserting authority from source
 * text is what allowed a Planning Officer 403 to ship: the source said
 * `role:Admin,Planning Officer` while an inherited `role:Admin` from the
 * enclosing group ran first. `DiagnosticsRouteAuthorityTest` carries the
 * detailed regression proof.
 */
class PostLoop9SmokeDiagnosticsContractTest extends TestCase
{
    /**
     * Paths are resolved from the suite location rather than through
     * `base_path()`. The Laravel helper only resolves once some other test has
     * booted the application, so depending on it would make these assertions
     * silently order-dependent: they would pass in a full suite run and error
     * when this file is run on its own.
     */
    private function source(string $relativePath): string
    {
        $path = dirname(__DIR__, 2).'/'.$relativePath;
        $this->assertFileExists($path, "Expected source file {$relativePath} to exist.");

        return (string) file_get_contents($path);
    }

    /** Strip whole-line comments so prose about a change is never read as the change. */
    private function code(string $relativePath): string
    {
        $source = $this->source($relativePath);

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

    // ─────────────────────────────────────────────────────────────────────
    // A. PARCEL PIN
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Local parcel data supplies Property Index No.; the relevant inspection
     * supplies confirmed GPS. Both records must reach the report component.
     */
    public function test_the_applications_detail_mount_passes_the_local_parcel(): void
    {
        $show = $this->code('resources/js/Pages/Applications/Show.jsx');

        $this->assertMatchesRegularExpression(
            '/<ParcelInspectionStatus\b[^>]*\blocalParcel=\{p\}/s',
            $show,
            'The parcel must be passed down so its cadastral identity can be displayed.'
        );

        // The local inspection row carries the confirmed-GPS fields, so passing
        // it is what makes the confirmed point separable at all.
        $this->assertMatchesRegularExpression(
            '/<ParcelInspectionStatus\b[^>]*\blocalInspection=\{p\.site_inspection\}/s',
            $show,
            'The local inspection must be passed down so confirmed GPS is available locally.'
        );

        // Reassure that no other mount was left unwired.
        $this->assertSame(
            1,
            preg_match_all('/<ParcelInspectionStatus\b/s', $show),
            'There must be exactly one mount of the inspection status component.'
        );
    }

    /**
     * Local application location must never be presented as GPS-verification evidence.
     */
    public function test_parcel_pin_is_read_only_from_confirmed_inspection_coordinates(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*inspection\?\.confirmed_latitude\s*,\s*-90\s*,\s*90\s*\)/',
            $component,
            'GPS-verification latitude must come from the relevant inspection.'
        );
        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*inspection\?\.confirmed_longitude\s*,\s*-180\s*,\s*180\s*\)/',
            $component,
            'GPS-verification longitude must come from the relevant inspection.'
        );

        $this->assertStringContainsString("const displayParcelPin = displayConfirmedPoint ?? 'N/A';", $component);
        $this->assertStringContainsString('{displayParcelPin}', $component);
        $this->assertDoesNotMatchRegularExpression(
            '/localParcel(?:\?\.|\.)(latitude|longitude)/',
            $component,
            'The report must never substitute application location for confirmed GPS.'
        );
    }

    /**
     * Missing, partial or invalid confirmed GPS must render N/A regardless of
     * stored parcel location. Completion status is not a prerequisite.
     */
    public function test_parcel_pin_requires_both_valid_confirmed_coordinates(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertMatchesRegularExpression(
            '/const hasConfirmedPoint = confirmedLatitude !== null && confirmedLongitude !== null;/',
            $component,
            'Availability must depend on BOTH confirmed coordinates being valid.'
        );

        $this->assertMatchesRegularExpression(
            '/const displayConfirmedPoint = hasConfirmedPoint\s*\?/s',
            $component,
            'Only the validated confirmed pair may be displayed.'
        );

        // A half-valid pair must yield no pin at all, rather than a bogus one.
        $this->assertMatchesRegularExpression(
            "/toValidCoordinate = \(value, min, max\) => \{.*?Number\.isFinite\(n\) && n >= min && n <= max \? n : null;/s",
            $component,
            'Coordinate validation must reject partial, non-numeric and out-of-range values.'
        );
    }

    /**
     * The confirmed inspection point stays a separate concept, sourced from
     * FieldSync evidence, and is never labelled as if a parcel coordinate were
     * an inspector-confirmed GPS fix.
     */
    public function test_confirmed_inspection_point_remains_a_separate_concept(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*inspection\?\.confirmed_latitude\s*,\s*-90\s*,\s*90\s*\)/',
            $component,
            'The confirmed point must read the FieldSync confirmed latitude.'
        );
        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*inspection\?\.confirmed_longitude\s*,\s*-180\s*,\s*180\s*\)/',
            $component,
            'The confirmed point must read the FieldSync confirmed longitude.'
        );

        // Separate UI purposes share the same confirmed GPS source.
        $this->assertStringContainsString('Parcel PIN', $component);
        $this->assertStringContainsString('Confirmed Inspection Point', $component);

        // Explain missing GPS evidence without substituting application location.
        $this->assertMatchesRegularExpression(
            '/Not yet captured/',
            $component,
            'An unconfirmed inspection must say so explicitly.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/displayConfirmedPoint\s*=\s*[^;]*displayParcelPin/',
            $component,
            'The confirmed point must be validated before being used for Parcel Pin.'
        );
    }

    /**
     * The cadastral property index number is a different fact from the
     * coordinate. It gets its own label so "PIN" stops meaning two things.
     */
    public function test_the_cadastral_number_is_labelled_separately_from_the_pin(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertStringContainsString('Property Index No.', $component);
        $this->assertStringContainsString('{displayPropertyIndexNumber}', $component);
        $this->assertMatchesRegularExpression(
            '/const displayPropertyIndexNumber = localParcel\?\.property_index_number \|\| remotePropertyIndexNumber/',
            $component,
            'The property index number must still resolve from the local parcel, then the matched remote row.'
        );
    }

    /** Execute the component's actual display calculations, not a PHP reimplementation. */
    private function evaluatePinCases(array $cases): array
    {
        $source = $this->source('resources/js/Components/ParcelInspectionStatus.jsx');
        $start = strpos($source, 'const toValidCoordinate =');
        $end = strpos($source, 'const actualPhotoCount =');
        $this->assertNotFalse($start);
        $this->assertNotFalse($end);
        $this->assertGreaterThan($start, $end);

        $calculations = substr($source, $start, $end - $start);
        $script = 'const cases = '.json_encode($cases, JSON_THROW_ON_ERROR).';'
            .'process.stdout.write(JSON.stringify(cases.map(({inspection, localParcel}) => {'
            .$calculations
            .'return {displayParcelPin, displayConfirmedPoint, displayPropertyIndexNumber};'
            .'})));';
        $process = proc_open(
            [getenv('NODE_BINARY') ?: 'node'],
            [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']],
            $pipes,
            dirname(__DIR__, 2),
        );
        $this->assertIsResource($process, 'Node is required to execute the shipped GPS display logic.');
        fwrite($pipes[0], $script);
        fclose($pipes[0]);
        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $this->assertSame(0, proc_close($process), 'GPS display calculation failed: '.$stderr);

        return json_decode($stdout, true, 512, JSON_THROW_ON_ERROR);
    }

    private function parcelLocationFixture(): array
    {
        return [
            'id' => 76,
            'latitude' => '13.8419970',
            'longitude' => '121.2801310',
            'property_index_number' => '04-01-021-001-15-511',
        ];
    }

    public function test_app_144_location_without_confirmed_gps_displays_na(): void
    {
        $result = $this->evaluatePinCases([[
            'localParcel' => $this->parcelLocationFixture(),
            'inspection' => ['status' => 'assigned', 'confirmed_latitude' => null, 'confirmed_longitude' => null],
        ]])[0];

        $this->assertSame('N/A', $result['displayParcelPin']);
        $this->assertNull($result['displayConfirmedPoint']);
        $this->assertSame('04-01-021-001-15-511', $result['displayPropertyIndexNumber']);
    }

    public function test_valid_confirmed_gps_is_displayed_before_inspection_completion(): void
    {
        $cases = [];
        foreach (['assigned', 'in_progress', 'completed'] as $status) {
            $cases[] = [
                'localParcel' => $this->parcelLocationFixture(),
                'inspection' => ['status' => $status, 'confirmed_latitude' => '13.842111', 'confirmed_longitude' => '121.280222'],
            ];
        }
        foreach ($this->evaluatePinCases($cases) as $result) {
            $this->assertSame('13.842111, 121.280222', $result['displayParcelPin']);
            $this->assertSame($result['displayParcelPin'], $result['displayConfirmedPoint']);
        }
    }

    public function test_a_partial_confirmed_pair_never_uses_local_coordinates(): void
    {
        $cases = [];
        foreach ([[], ['confirmed_latitude' => '13.842111'], ['confirmed_longitude' => '121.280222']] as $inspection) {
            $cases[] = ['localParcel' => $this->parcelLocationFixture(), 'inspection' => $inspection];
        }
        foreach ($this->evaluatePinCases($cases) as $result) {
            $this->assertSame('N/A', $result['displayParcelPin']);
            $this->assertNull($result['displayConfirmedPoint']);
        }
    }

    public function test_invalid_confirmed_values_never_use_local_coordinates(): void
    {
        $cases = [];
        $invalidValues = [null, '', ' ', "\t", 'not a coordinate', 'NaN', 'Infinity', '-Infinity', '1e999', true, false, [], [13], new \stdClass()];
        foreach (['confirmed_latitude', 'confirmed_longitude'] as $field) {
            $outOfRange = $field === 'confirmed_latitude' ? [90.000001, -90.000001] : [180.000001, -180.000001];
            foreach (array_merge($invalidValues, $outOfRange) as $invalid) {
                $inspection = ['confirmed_latitude' => '13.842111', 'confirmed_longitude' => '121.280222'];
                $inspection[$field] = $invalid;
                $cases[] = ['localParcel' => $this->parcelLocationFixture(), 'inspection' => $inspection];
            }
        }
        foreach ($this->evaluatePinCases($cases) as $index => $result) {
            $this->assertSame('N/A', $result['displayParcelPin'], 'Invalid pair case '.$index);
            $this->assertNull($result['displayConfirmedPoint'], 'Invalid pair case '.$index);
        }
    }

    public function test_confirmed_gps_does_not_require_a_local_parcel_location(): void
    {
        $cases = [];
        foreach ([null, [], $this->parcelLocationFixture()] as $parcel) {
            $cases[] = [
                'localParcel' => $parcel,
                'inspection' => ['confirmed_latitude' => 0, 'confirmed_longitude' => 0],
            ];
        }
        foreach ($this->evaluatePinCases($cases) as $result) {
            $this->assertSame('0.000000, 0.000000', $result['displayParcelPin']);
            $this->assertSame($result['displayParcelPin'], $result['displayConfirmedPoint']);
        }
    }

    public function test_cross_parcel_remote_cadastral_identity_is_rejected(): void
    {
        $cases = [];
        foreach ([76, 77] as $remoteParcelId) {
            foreach (['04-01-021-001-15-511', null] as $localNumber) {
                $parcel = $this->parcelLocationFixture();
                $parcel['property_index_number'] = $localNumber;
                $cases[] = [
                    'localParcel' => $parcel,
                    'inspection' => ['supabase_parcels' => [
                        'local_parcel_id' => $remoteParcelId,
                        'property_index_number' => 'remote-cadastral-number',
                        'latitude' => '13.842111',
                        'longitude' => '121.280222',
                    ]],
                ];
            }
        }
        $results = $this->evaluatePinCases($cases);
        $this->assertSame(
            ['04-01-021-001-15-511', 'remote-cadastral-number', '04-01-021-001-15-511', 'N/A'],
            array_column($results, 'displayPropertyIndexNumber'),
        );
        $this->assertSame(['N/A', 'N/A', 'N/A', 'N/A'], array_column($results, 'displayParcelPin'));
    }

    // ─────────────────────────────────────────────────────────────────────
    // B. DIAGNOSTIC ACCESS
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Authority is now asserted against the RESOLVED runtime chain, not the
     * source text.
     *
     * This test previously read routes/web.php and looked for
     * `role:Admin,Planning Officer` next to each route declaration. That passed
     * while the routes 403'd for a Planning Officer, because the routes were
     * declared INSIDE `Route::middleware(['auth', 'role:Admin'])`, and group
     * middleware is inherited and COMBINED with a route's own rather than
     * replaced by it. The resolved chain therefore contained a stricter
     * inherited `role:Admin` that ran FIRST.
     *
     * The group placement is still asserted, but as a separate, explicit
     * structural check in `DiagnosticsRouteAuthorityTest`, which also asserts
     * against the resolved chain. Asserting only on the source is precisely
     * what let the defect ship.
     */
    public function test_admin_and_planning_officer_can_access_diagnostics(): void
    {
        foreach (['diagnostics.index', 'diagnostics.show'] as $name) {
            $route = RouteFacade::getRoutes()->getByName($name);
            $this->assertNotNull($route, "Route {$name} must be registered.");

            $chain = array_values(array_filter(
                app(Router::class)->gatherRouteMiddleware($route),
                fn ($p) => str_contains((string) $p, 'RoleMiddleware')
            ));

            $this->assertCount(
                1,
                $chain,
                "{$name} must resolve to exactly ONE authority; a second entry is inherited from a group and runs first."
            );
            $this->assertStringEndsWith(
                ':Admin,Planning Officer',
                (string) $chain[0],
                "{$name} must be readable by Admin and Planning Officer."
            );
        }
    }

    public function test_site_inspector_is_denied_diagnostics(): void
    {
        $web = $this->code('routes/web.php');

        foreach (["/diagnostics'", "/diagnostics/\{report}'"] as $path) {
            $this->assertDoesNotMatchRegularExpression(
                '#'.$path.".*?role:[^']*Site Inspector#s",
                $web,
                "{$path} must not authorize a Site Inspector."
            );
        }

        // And the middleware itself is strict: an exact role comparison, so an
        // unlisted role cannot slip through a prefix or casing match.
        $middleware = $this->code('app/Http/Middleware/RoleMiddleware.php');
        $this->assertMatchesRegularExpression(
            '/in_array\(Auth::user\(\)->role, \$roles, true\)/',
            $middleware,
            'The role check must be an exact, strict comparison.'
        );

        // A Site Inspector receives no internal navigation at all.
        $sidebar = $this->code('resources/js/Components/Sidebar.jsx');
        $this->assertMatchesRegularExpression(
            '/const visibleItems = isSiteInspector\s*\?\s*\[\s*\]/',
            $sidebar,
            'A Site Inspector must receive an empty navigation set.'
        );
    }

    public function test_filed_report_content_remains_read_only_with_only_scoped_handling(): void
    {
        $web = $this->code('routes/web.php');

        // The report itself has NO write verb, for any role. The single
        // authorized POST creates a local notification and is scoped to that
        // one path, so no verb can address the report's own fields.
        foreach (['put', 'patch', 'delete'] as $verb) {
            $this->assertDoesNotMatchRegularExpression(
                "#Route::{$verb}\('/diagnostics#i",
                $web,
                "No {$verb} route may ever exist for diagnostics; the report is immutable in iMAPS."
            );
        }

        // No POST may target a report's own data. Three authorized families exist and
        // each is excluded BY NAME: the handling action (writes the remote
        // lifecycle through the scoped CAS), the Admin notice (writes a local
        // notification), and the three escalation actions (write only the LOCAL
        // `report_escalations` episode record). Nothing else may exist.
        $this->assertDoesNotMatchRegularExpression(
            "#Route::post\('/diagnostics(?!/\{report\}/(?:notify-planning-officers|handle|escalations(?:/\{escalation\}/(?:recommendation|close))?))#i",
            $web,
            'Only the exact handling, Admin notice and escalation POSTs may exist.'
        );

        $controller = $this->code('app/Http/Controllers/DiagnosticReportController.php');
        $this->assertDoesNotMatchRegularExpression(
            '/public function (store|update|destroy)\s*\(/',
            $controller,
            'The controller must expose no report mutation method.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/\b(DB::|->update\(|->create\(|->delete\(|->insert\()/',
            $controller,
            'The controller must not write to any table directly; the notice goes through DiagnosticNotice.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // C. NOTIFICATION - deliberately NOT implemented
    // ─────────────────────────────────────────────────────────────────────

    /**
     * THE NOTIFICATIONS TABLE NOW EXISTS IN CANONICAL, so the notify action is
     * AUTHORIZED and this test has flipped from "ship nothing" to "ship exactly
     * this much, and nothing more".
     *
     * It was previously a deliberate refusal: the action was blocked on a
     * `notifications` table canonical did not have, and shipping a button that
     * cannot work is worse than shipping none. `2026_10_01_create_notifications_table_for_0921_forward.sql`
     * was applied on 2026-10-01 with explicit approval (ledger untouched at 16
     * rows, all business data verified unchanged), so the blocker is gone.
     *
     * The bound is now narrower and stricter than a blanket ban: exactly one
     * diagnostics POST may exist, it must be the Admin notice action, and no
     * other page may post to it.
     */
    public function test_scoped_handling_is_the_only_addition_to_the_admin_notice_post(): void
    {
        $web = $this->code('routes/web.php');

        // Widened deliberately by the Development Support batch, which adds three
        // Admin-only escalation POSTs. The invariant is not relaxed: each is
        // asserted individually elsewhere in this file, against the RESOLVED
        // authority chain, and none may name a Planning Officer.
        $this->assertSame(
            5,
            preg_match_all("#Route::post\('/diagnostics#i", $web),
            'Exactly the scoped handling, Admin notice and three escalation POSTs may exist.'
        );

        // The authority is read from the RESOLVED chain, because that is what
        // actually runs. A source-level "there is a role:Admin nearby" check is
        // exactly the assertion that let the Planning Officer 403 ship: the
        // source said `role:Admin,Planning Officer` while an inherited
        // `role:Admin` from the enclosing group ran first.
        $notifyRoute = RouteFacade::getRoutes()->getByName('diagnostics.notify-planning-officers');
        $this->assertNotNull($notifyRoute, 'The notice action must be registered.');

        $notifyChain = array_values(array_filter(
            app(Router::class)->gatherRouteMiddleware($notifyRoute),
            fn ($p) => str_contains((string) $p, 'RoleMiddleware')
        ));

        $this->assertCount(1, $notifyChain, 'The notice action must resolve to exactly ONE authority.');
        $this->assertStringEndsWith(
            ':Admin',
            (string) $notifyChain[0],
            'The one POST must be the Admin notice action, and it must be Admin-only.'
        );
        $this->assertStringNotContainsString(
            'Planning Officer',
            (string) $notifyChain[0],
            'A Planning Officer must not be able to trigger the notice action.'
        );

        // The list page never gains the action: the notice is raised from the
        // report detail, where the report is actually being read.
        $index = $this->code('resources/js/Pages/Diagnostics/Index.jsx');
        $this->assertStringNotContainsString('Notify Planning Officers', $index);
        $this->assertStringNotContainsString('notify-planning-officers', $index);

        // The detail page offers it, and only behind an Admin check.
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');
        $this->assertStringContainsString('Notify ${context.owner.name}', $show);
        $this->assertMatchesRegularExpression(
            '/\{isAdmin && canNotify && context\.owner && /',
            $show,
            'The notice button must be rendered only for an Admin.'
        );

        // No other diagnostics page may post to it.
        foreach (['resources/js/Pages/Diagnostics/Index.jsx'] as $page) {
            $this->assertDoesNotMatchRegularExpression(
                '#/diagnostics/\$\{[^}]+\}/notify-planning-officers#',
                $this->code($page),
                "{$page} must not trigger the notice action."
            );
        }
    }

    // ─────────────────────────────────────────────────────────────────────
    // D. DIAGNOSTIC SHELL
    // ─────────────────────────────────────────────────────────────────────

    public function test_diagnostics_index_uses_the_shared_authenticated_shell(): void
    {
        $this->assertStringContainsString('<ReportShell>', $this->code('resources/js/Pages/Diagnostics/Index.jsx'));
        $index = $this->code('resources/js/Pages/Diagnostics/ReportUi.jsx');

        $this->assertStringContainsString('import Header from "@/Components/Header";', $index);
        $this->assertStringContainsString('import Sidebar from "@/Components/Sidebar";', $index);
        $this->assertMatchesRegularExpression('/<Header\b/', $index, 'The shared header must be rendered.');
        $this->assertMatchesRegularExpression('/<Sidebar\b/', $index, 'The shared sidebar must be rendered.');

        // It must reuse the app shell, not a second navigation system.
        $this->assertStringNotContainsString('Layouts/AuthenticatedLayout', $index);
        // Both Header and Sidebar take activePage, so it must be marked on BOTH
        // components exactly once each. Marking only one would leave the shell
        // half-highlighted.
        $this->assertStringContainsString('activePage: "diagnostics"', $index);
        $this->assertStringContainsString('<Header {...shell}', $index);
        $this->assertStringContainsString('<Sidebar {...shell}', $index);
        // The server supplies allowedTypes; React never grants read authority.
        $this->assertStringContainsString('allowedTypes.length > 1', $this->code('resources/js/Pages/Diagnostics/Index.jsx'));
    }

    public function test_diagnostic_show_uses_the_shared_authenticated_shell(): void
    {
        $this->assertStringContainsString('<ReportShell', $this->code('resources/js/Pages/Diagnostics/Show.jsx'));
        $show = $this->code('resources/js/Pages/Diagnostics/ReportUi.jsx');
        $this->assertStringContainsString('import Header from "@/Components/Header";', $show);
        $this->assertStringContainsString('import Sidebar from "@/Components/Sidebar";', $show);
        $this->assertMatchesRegularExpression('/<Header\b/', $show);
        $this->assertMatchesRegularExpression('/<Sidebar\b/', $show);
        $this->assertStringNotContainsString('Layouts/AuthenticatedLayout', $show);
    }

    public function test_diagnostic_show_has_back_to_list_navigation(): void
    {
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');

        $this->assertMatchesRegularExpression(
            '/<Link\s+href=\{`\/diagnostics\?type=/',
            $show,
            'The detail page must link back to the report list.'
        );
        $this->assertStringContainsString(
            'Back to Reports &amp; Support',
            $show,
            'The back control must be labelled so its destination is unambiguous.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // ESCALATION — REMOVED under the Reports & Support contract.
    //
    // These three tests previously pinned an Admin-only "Development / support
    // contact" section. Browser acceptance rejected it: it was not part of the
    // locked product hierarchy and, in a deployment with no contact configured,
    // it rendered a permanently empty block. The section is now removed, so the
    // contract is inverted: the section and its prop must both be ABSENT.
    //
    // `config/imaps.php` is deliberately left in place. It is environment-backed
    // and harmless, and deleting an unrelated config file is out of scope for
    // this repair.
    // ─────────────────────────────────────────────────────────────────────

    /**
     * The ORIGINAL unscoped escalation/contact area stays gone.
     *
     * Development Support escalation has since been authorized as Admin-mediated
     * INTERNAL workflow, which is a different and far more tightly scoped thing.
     * This assertion still pins the specific defect that browser acceptance
     * rejected: an un-gated contact block rendered on the report page.
     *
     * The authorized panel's own scope - Admin only, Technical Issue only, prop
     * absent rather than hidden everywhere else - is proven in
     * tests/Feature/ReportEscalationTest.php.
     */
    public function test_the_unscoped_escalation_area_does_not_return(): void
    {
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');

        $this->assertStringNotContainsString(
            'Development / support contact',
            $show,
            'The original unscoped section must stay removed.'
        );
        $this->assertStringNotContainsString(
            'has not been configured',
            $show,
            'The original placeholder text must stay removed with it.'
        );
        $this->assertMatchesRegularExpression(
            '/\{developmentSupport\s*&&\s*<DevelopmentSupport/',
            $show,
            'Any escalation UI must be gated on the server-produced prop.'
        );
    }

    public function test_the_escalation_prop_is_scoped_and_reads_only_safe_contact_fields(): void
    {
        $controller = $this->code('app/Http/Controllers/DiagnosticReportController.php');

        // Only the four documented safe contact keys may ever be read, and only
        // for an Admin viewing a Technical Issue. Anything else - especially a
        // credential - must never reach the report path.
        $this->assertMatchesRegularExpression(
            "/foreach \(\['name', 'email', 'channel', 'instructions'\] as \\\$key\)/",
            $controller,
            'Only the four documented safe contact fields may be read.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/(service_key|anon_key|api_key|password|token)/i',
            $controller,
            'The report controller must never carry a credential field.'
        );

        // The panel is Admin + Technical Issue only, and null otherwise.
        $this->assertStringContainsString(
            "'Admin'",
            $controller,
            'The escalation prop must require an Admin.'
        );
        $this->assertStringContainsString(
            "'technical_issue'",
            $controller,
            'The escalation prop must require a Technical Issue.'
        );
    }
}
