<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2B - executable guard on the round LABELS the Admin reads.
 *
 * Round identity is now decided on the server by
 * {@see \App\Support\InspectionRoundNumbering}. This suite proves the browser
 * renders exactly that, and never manufactures a number the server refused to
 * give.
 *
 * WHY EXECUTABLE RATHER THAN SOURCE-TEXT
 * -------------------------------------
 * The defect this protects against is a rendered string, not a code shape.
 * `{item.round_number}` in a page that no longer guarantees the field would still
 * pass every substring check while printing "Round undefined" to the user, and
 * `round_number ?? 1` would look entirely reasonable in a diff.
 *
 * So the checker EXTRACTS the real label expressions from the real files and
 * EVALUATES them against each case: a Round 2, a Round 1, and a parcel-unknown
 * historical row. It asserts on what is actually produced, including that no
 * null/undefined/NaN leaks into the UI.
 */
class InspectionRoundLabelTest extends TestCase
{
    private const CHECKER = 'tests/js/check-round-labels.cjs';

    public function test_round_labels_render_the_canonical_contract(): void
    {
        $output = $this->runChecker();

        $this->assertSame(
            0,
            $output['exit'],
            "Canonical round label check failed. A page that renders a round the server "
            ."declined to assign would tell the Admin a parcel's visit sequence that the "
            ."database cannot support.\n\n".$output['text']
        );

        $this->assertStringContainsString('canonical round labels OK', $output['text'], $output['text']);

        $this->assertMatchesRegularExpression(
            '/(\d+) assertions/',
            $output['text'],
            'The checker must report a real assertion count, not a bare OK.'
        );
    }

    /**
     * The historical wording is the user-visible contract for the 8 parcel-unknown
     * rows, so it is pinned independently of the checker.
     */
    public function test_historical_round_wording_is_present_on_both_site_inspection_pages(): void
    {
        foreach (['Index.jsx', 'Show.jsx'] as $file) {
            $path = dirname(__DIR__, 2) . '/resources/js/Pages/Site Inspections/' . $file;
            $this->assertFileExists($path);

            $source = (string) file_get_contents($path);

            $this->assertStringContainsString(
                'Parcel not recorded',
                $source,
                $file . ' must state that the parcel was not recorded, rather than showing '
                .'a blank or an invented round.'
            );

            $this->assertStringContainsString(
                'Historical Inspection',
                $source,
                $file . ' must classify a parcel-unknown row as a Historical Inspection.'
            );
        }
    }

    /**
     * A null round must never be coerced to 1 on the server side either: that was
     * how an unrelated row came to be presented as a parcel's first visit.
     */
    public function test_no_backend_defaults_a_missing_round_to_one(): void
    {
        $root = dirname(__DIR__, 2);

        $files = [
            '/app/Http/Controllers/SiteInspectionController.php',
            '/app/Http/Controllers/ApplicationController.php',
            '/app/Http/Controllers/InspectionDeliveryController.php',
            '/app/Support/InspectionOperationsSummary.php',
        ];

        foreach ($files as $file) {
            $source = (string) file_get_contents($root . $file);
            // Strip comments so an explanatory note cannot fail this.
            $stripped = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;
            $stripped = preg_replace('#^\s*//.*$#m', '', $stripped) ?? $stripped;

            $this->assertDoesNotMatchRegularExpression(
                '/round_number\s*\}\s*\?\?\s*1\b/',
                $stripped,
                basename($file) . ' must not default a missing round to 1. A parcel-unknown '
                .'row has to stay unrounded.'
            );
        }
    }

    /** @return array{exit:int, text:string} */
    private function runChecker(): array
    {
        $path = dirname(__DIR__, 2) . '/' . self::CHECKER;

        $this->assertFileExists(
            $path,
            'Missing the canonical round label checker. Without it, a page can render a '
            .'round the server never assigned and nothing would notice.'
        );

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