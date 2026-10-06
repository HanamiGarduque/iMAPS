<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2D - wrapper for the detail-page operations section check.
 *
 * This phase is READ visibility only. The check therefore asserts as much about
 * what must NOT appear as about what must: no retry/re-deliver POST, no mounted
 * delivery panel (it carries the Planning Officer retry), no PO decision control,
 * no duplicated Notify Planning Officers action, and no deep diagnostic content.
 */
class InspectionDetailOperationsUiTest extends TestCase
{
    private const CHECKER = 'tests/js/check-detail-operations.cjs';

    private const CONTROLLER = 'app/Http/Controllers/SiteInspectionController.php';

    public function test_detail_operations_sections_are_correct(): void
    {
        $output = $this->runChecker();

        $this->assertSame(
            0,
            $output['exit'],
            "Detail operations check failed. Showing delivery health without retry, a "
            ."server-resolved round history, or a GLOBAL diagnostics count with its "
            ."non-attribution disclosure would each mislead the Admin.\n\n".$output['text']
        );

        $this->assertStringContainsString('detail operations sections OK', $output['text'], $output['text']);
        $this->assertMatchesRegularExpression('/(\d+) assertions/', $output['text'], $output['text']);
    }

    /**
     * The detail payload must carry exactly the three read-only blocks this phase
     * adds, and nothing that implies a new authority.
     * The detail payload must carry exactly the read-only blocks this page owns -
     * and must NOT carry a diagnostics block.
     */
    public function test_controller_sends_only_the_blocks_this_page_owns(): void
    {
        $source = (string) file_get_contents(dirname(__DIR__, 2) . '/' . self::CONTROLLER);

        foreach (['delivery', 'roundHistory'] as $key) {
            $this->assertMatchesRegularExpression(
                "/'" . $key . "' =>/u",
                $source,
                "The detail payload must include '{$key}'."
            );
        }

        // REPORTS & SUPPORT V2: this page performs ZERO diagnostic reads.
        //
        // `diagnostic_reports` carries no application, inspection or parcel
        // identity - only `inspector_id` - so a global Technical Issue count has no
        // application-specific meaning on one lot's record. PHASE 2B2D shipped one
        // anyway, and it cost a remote round trip on every page view to compute a
        // number the page must not display.
        //
        // Asserted STRUCTURALLY on purpose: a returning payload would be invisible
        // in a browser, because the count would simply not render. Only the source
        // can catch it.
        $this->assertStringNotContainsString(
            'diagnosticsSummary',
            $source,
            'the Site Inspection request path must NOT read diagnostic_reports, and a '
            .'global diagnostic count must never appear on this page'
        );

        $this->assertStringNotContainsString(
            'DiagnosticReportReader',
            $source,
            'the Site Inspection controller must not touch the diagnostic reader at all'
        );
    }

    /**
     * No new mutating route, and the delivery attempt history must be eager
     * loaded rather than read per attempt.
     */
    public function test_no_new_route_and_no_attempt_n_plus_one(): void
    {
        $root = dirname(__DIR__, 2);

        $routes = (string) file_get_contents($root . '/routes/web.php');
        $this->assertStringNotContainsString(
            "Route::post('/site-inspections/{id}",
            $routes,
            'no new POST may be introduced for delivery, history or diagnostics'
        );

        $controller = (string) file_get_contents($root . '/' . self::CONTROLLER);

        $this->assertStringContainsString(
            "'deliveryAttempts'",
            $controller,
            'delivery attempts must be EAGER loaded in show(); reading them per attempt '
            .'would be an N+1 on every inspection detail view'
        );
    }

    /**
     * The delivery panel carries the Planning Officer retry POST and must not be
     * mounted on this page.
     */
    public function test_delivery_panel_is_not_mounted_on_the_site_inspection_detail(): void
    {
        $show = (string) file_get_contents(
            dirname(__DIR__, 2) . '/resources/js/Pages/Site Inspections/Show.jsx'
        );
        $code = preg_replace('#/\*[\s\S]*?\*/#', '', $show) ?? $show;
        $code = preg_replace('#^\s*//.*$#m', '', $code) ?? $code;

        $this->assertStringNotContainsString(
            'InspectionDeliveryStatusPanel',
            $code,
            'InspectionDeliveryStatusPanel mounts the Planning Officer retry-delivery POST. '
            .'Mounting it here would hand the Admin a PO action.'
        );
    }

    /** @return array{exit:int, text:string} */
    private function runChecker(): array
    {
        $path = dirname(__DIR__, 2) . '/' . self::CHECKER;

        $this->assertFileExists($path, 'Missing the detail operations checker.');

        $descriptors = [1 => ['pipe', 'w'], 2 => ['pipe', 'w']];
        $process = proc_open(
            escapeshellarg($this->nodeBinary()) . ' ' . escapeshellarg($path),
            $descriptors,
            $pipes,
            dirname(__DIR__, 2)
        );

        $this->assertIsResource($process, 'Could not start the node checker.');

        $stdout = stream_get_contents($pipes[1]);
        $stderr = stream_get_contents($pipes[2]);
        fclose($pipes[1]);
        fclose($pipes[2]);
        $exit = proc_close($process);

        return ['exit' => $exit, 'text' => trim($stdout . "\n" . $stderr)];
    }

    private function nodeBinary(): string
    {
        foreach (['node', 'node.exe'] as $candidate) {
            $which = @shell_exec('where ' . $candidate . ' 2>nul');
            if (is_string($which) && trim($which) !== '') {
                return trim(explode("\n", trim($which))[0]);
            }
        }

        $this->markTestSkipped('node executable not found on PATH.');
    }
}