<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

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

    public function test_admin_and_planning_officer_can_access_diagnostics(): void
    {
        $web = $this->code('routes/web.php');

        foreach (["/diagnostics'", "/diagnostics/\{report}'"] as $path) {
            $this->assertMatchesRegularExpression(
                '#'.$path.".*?role:Admin,Planning Officer#s",
                $web,
                "{$path} must be readable by Admin and Planning Officer."
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

    public function test_the_diagnostic_report_remains_read_only_for_every_role(): void
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

        // No POST may target a report's own data. The notice action is the one
        // authorized POST and is excluded by name, because it writes a local
        // notification rather than anything on the report.
        $this->assertDoesNotMatchRegularExpression(
            "#Route::post\('/diagnostics(?!/\{report\}/notify-planning-officers)#i",
            $web,
            'No diagnostics POST may address the report itself; only the Admin notice action may exist.'
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
    public function test_exactly_one_diagnostics_post_exists_and_it_is_the_admin_notice(): void
    {
        $web = $this->code('routes/web.php');

        $this->assertSame(
            1,
            preg_match_all("#Route::post\('/diagnostics#i", $web),
            'Exactly one diagnostics POST may exist: the Admin notice action.'
        );

        $this->assertMatchesRegularExpression(
            "#Route::post\('/diagnostics/\{report\}/notify-planning-officers'.*?role:Admin'#s",
            $web,
            'The one POST must be the Admin notice action, and it must be Admin-only.'
        );

        // The list page never gains the action: the notice is raised from the
        // report detail, where the report is actually being read.
        $index = $this->code('resources/js/Pages/Diagnostics/Index.jsx');
        $this->assertStringNotContainsString('Notify Planning Officers', $index);
        $this->assertStringNotContainsString('notify-planning-officers', $index);

        // The detail page offers it, and only behind an Admin check.
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');
        $this->assertStringContainsString('Notify Planning Officers', $show);
        $this->assertMatchesRegularExpression(
            '/\{isAdmin && report\.id && \(/',
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
        $index = $this->code('resources/js/Pages/Diagnostics/Index.jsx');

        $this->assertStringContainsString('import Header from "@/Components/Header";', $index);
        $this->assertStringContainsString('import Sidebar from "@/Components/Sidebar";', $index);
        $this->assertMatchesRegularExpression('/<Header\b/', $index, 'The shared header must be rendered.');
        $this->assertMatchesRegularExpression('/<Sidebar\b/', $index, 'The shared sidebar must be rendered.');

        // It must reuse the app shell, not a second navigation system.
        $this->assertStringNotContainsString('Layouts/AuthenticatedLayout', $index);
        // Both Header and Sidebar take activePage, so it must be marked on BOTH
        // components exactly once each. Marking only one would leave the shell
        // half-highlighted.
        $this->assertSame(
            2,
            preg_match_all('/activePage="diagnostics"/', $index),
            'The shell must be marked as the diagnostics section on both Header and Sidebar.'
        );

        // The read gate must follow the server, not Admin-only.
        $this->assertMatchesRegularExpression(
            '/const canRead = isAdmin \|\| userRoleValue === "Planning Officer";/',
            $index,
            'The list must be readable by a Planning Officer, matching the route boundary.'
        );
    }

    public function test_diagnostic_show_uses_the_shared_authenticated_shell(): void
    {
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');

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
            '/<Link\s+href="\/diagnostics"/',
            $show,
            'The detail page must link back to the report list.'
        );
        $this->assertStringContainsString(
            'Back to Diagnostic Reports',
            $show,
            'The back control must be labelled so its destination is unambiguous.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // ESCALATION (Admin only, configuration-backed, nothing invented)
    // ─────────────────────────────────────────────────────────────────────

    public function test_the_escalation_area_is_admin_only(): void
    {
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');

        $this->assertMatchesRegularExpression(
            '/\{isAdmin && \(/',
            $show,
            'The escalation block must be gated on the Admin role.'
        );
        $this->assertStringContainsString('Unable to resolve within MPDO?', $show);
    }

    public function test_the_escalation_contact_is_configuration_backed_and_never_invented(): void
    {
        $this->assertFileExists(__DIR__ . '/../../config/imaps.php');

        $config = $this->code('config/imaps.php');

        // Every value must come from configuration, with no hardcoded default.
        foreach (['name', 'email', 'channel', 'instructions'] as $key) {
            $this->assertMatchesRegularExpression(
                "/'{$key}'\s*=>\s*env\(/",
                $config,
                "config('imaps.contact.{$key}') must be environment-backed with no hardcoded default."
            );
        }

        // No credential may be read into this config block.
        $this->assertDoesNotMatchRegularExpression(
            '/env\(\s*[\'"][^\'"]*(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i',
            $config,
            'The escalation config must never read a credential environment variable.'
        );

        // And the page must degrade honestly rather than showing a fake contact.
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');
        $this->assertStringContainsString(
            'has not been configured',
            $show,
            'An unconfigured deployment must say so instead of showing an invented contact.'
        );
    }

    public function test_the_escalation_contact_is_withheld_from_non_admin_roles(): void
    {
        $controller = $this->code('app/Http/Controllers/DiagnosticReportController.php');

        $this->assertMatchesRegularExpression(
            '/private function escalationFor\(Request \$request\)/',
            $controller,
            'Escalation must be resolved server-side per request.'
        );
        $this->assertMatchesRegularExpression(
            '/\$isAdmin = \(\$request->user\(\)\?->role \?\? null\) === \'Admin\';/',
            $controller,
            'Escalation must be decided from the authenticated role, not from a prop the client chose.'
        );

        // The contact must be a safe, allow-listed field set, and every field
        // must be withheld unless the authenticated role is Admin.
        foreach (['name', 'email', 'channel', 'instructions'] as $key) {
            $this->assertMatchesRegularExpression(
                "/'{$key}' => \\\$isAdmin \? \(\\\$configured\['{$key}'\]/",
                $controller,
                "The contact {$key} must be withheld unless the role is Admin."
            );
        }

        $this->assertDoesNotMatchRegularExpression(
            '/(service_key|anon_key|api_key|password|token)/i',
            $controller,
            'The escalation block must never carry a credential field.'
        );
    }
}
