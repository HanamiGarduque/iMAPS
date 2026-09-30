<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * POST-LOOP-9 SMOKE FIX - the four bounded corrections made on
 * `fix/post-loop9-smoke-diagnostics`.
 *
 * SCOPE
 * -----
 *   A. PARCEL PIN. "PIN" was overloaded to mean both the cadastral property
 *      index number and the parcel's own latitude/longitude, and the field
 *      labelled "Parcel PIN" read only the former from a prop that was never
 *      passed. The result was "N/A" on parcels that have valid stored
 *      coordinates. The pin must come from parcels.latitude/longitude, and the
 *      inspector-confirmed FieldSync point must stay a separate fact.
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
     * The bug: the Applications Detail mount never passed `localParcel`, so the
     * prop defaulted to null, both PIN fallbacks resolved to nothing, and the
     * field rendered "N/A" for parcels that have valid stored coordinates.
     *
     * Asserting the PROP IS PASSED is the whole point - the display logic was
     * already correct in shape, it just had no data to read.
     */
    public function test_the_applications_detail_mount_passes_the_local_parcel(): void
    {
        $show = $this->code('resources/js/Pages/Applications/Show.jsx');

        $this->assertMatchesRegularExpression(
            '/<ParcelInspectionStatus\b[^>]*\blocalParcel=\{p\}/s',
            $show,
            'The parcel must be passed down, or the Parcel PIN field can never resolve.'
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
     * The Parcel PIN must read the PARCEL's coordinates, not the inspection's
     * confirmed coordinates. These are different facts and conflating them was
     * the original defect.
     */
    public function test_parcel_pin_is_read_from_the_parcel_coordinates(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*localParcel\?\.latitude\s*,\s*-90\s*,\s*90\s*\)/',
            $component,
            'The parcel pin latitude must come from the local parcel.'
        );
        $this->assertMatchesRegularExpression(
            '/toValidCoordinate\(\s*localParcel\?\.longitude\s*,\s*-180\s*,\s*180\s*\)/',
            $component,
            'The parcel pin longitude must come from the local parcel.'
        );

        // The pin must NOT be derived from confirmed FieldSync evidence.
        $this->assertDoesNotMatchRegularExpression(
            '/displayParcelPin\s*=\s*[^;]*confirmed_latitude/',
            $component,
            'The parcel pin must never be sourced from the confirmed inspection coordinates.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/displayParcelPin\s*=\s*[^;]*confirmed_longitude/',
            $component,
            'The parcel pin must never be sourced from the confirmed inspection coordinates.'
        );
    }

    /**
     * "N/A" must mean "the parcel genuinely has no stored coordinates" and
     * nothing else. In particular it must not be reachable merely because the
     * inspection has not happened yet.
     */
    public function test_parcel_pin_shows_na_only_when_the_parcel_lacks_coordinates(): void
    {
        $component = $this->code('resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertMatchesRegularExpression(
            '/const hasParcelPin = parcelPinLatitude !== null && parcelPinLongitude !== null;/',
            $component,
            'Availability of the parcel pin must depend on BOTH parcel coordinates being valid.'
        );

        $this->assertMatchesRegularExpression(
            '/const displayParcelPin = hasParcelPin\s*\?/s',
            $component,
            'The displayed pin must be gated on the parcel coordinates, not on the inspection.'
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

        // Both concepts must be visibly distinct on the page.
        $this->assertStringContainsString('Parcel PIN', $component);
        $this->assertStringContainsString('Confirmed Inspection Point', $component);

        // A missing confirmed point must be explained, not silently blank, and
        // must never fall back to the parcel pin.
        $this->assertMatchesRegularExpression(
            '/Not yet confirmed/',
            $component,
            'An unconfirmed inspection must say so explicitly.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/displayConfirmedPoint\s*=\s*[^;]*displayParcelPin/',
            $component,
            'The confirmed point must never fall back to the parcel pin.'
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
        $this->assertMatchesRegularExpression(
            '/const displayPropertyIndexNumber = localParcel\?\.property_index_number \|\| remotePropertyIndexNumber/',
            $component,
            'The property index number must still resolve from the local parcel, then the matched remote row.'
        );
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

        foreach (['post', 'put', 'patch', 'delete'] as $verb) {
            $this->assertDoesNotMatchRegularExpression(
                "#Route::{$verb}\('/diagnostics#i",
                $web,
                "No {$verb} route may exist; the report is immutable in iMAPS for Admin and Planning Officer alike."
            );
        }

        $controller = $this->code('app/Http/Controllers/DiagnosticReportController.php');
        $this->assertDoesNotMatchRegularExpression(
            '/public function (store|update|destroy)\s*\(/',
            $controller,
            'The controller must expose no mutation method.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/\b(DB::|->update\(|->create\(|->delete\(|->insert\()/',
            $controller,
            'The controller must not write to any table.'
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // C. NOTIFICATION - deliberately NOT implemented
    // ─────────────────────────────────────────────────────────────────────

    /**
     * The notify action is blocked on a database object canonical does not
     * have, so nothing half-built may ship on this branch.
     *
     * If a future change adds the action, these assertions fail on purpose: the
     * missing `notifications` table is a real blocker, and shipping a button
     * that cannot work is worse than shipping none.
     */
    public function test_no_diagnostic_notify_action_shipped_without_the_notifications_table(): void
    {
        $web = $this->code('routes/web.php');

        $this->assertDoesNotMatchRegularExpression(
            "#Route::post\('/diagnostics#i",
            $web,
            'No diagnostics POST route may exist: the notification action is blocked on the missing notifications table.'
        );

        $index = $this->code('resources/js/Pages/Diagnostics/Index.jsx');
        $show = $this->code('resources/js/Pages/Diagnostics/Show.jsx');

        foreach (['Notify Planning Officers', 'notifyPlanningOfficers'] as $needle) {
            $this->assertStringNotContainsString($needle, $index);
            $this->assertStringNotContainsString($needle, $show);
        }

        // No diagnostic page may post anywhere.
        foreach ([$index, $show] as $page) {
            $this->assertDoesNotMatchRegularExpression(
                '/router\.post\s*\(\s*[`"\'](?:\/diagnostics|.*notify)/i',
                $page,
                'A diagnostic page must not post; the report is read-only and the notify action is blocked.'
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
