<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2C - wrapper for the Planning Officer review visibility UI check.
 *
 * The check extracts the real label/binding expressions from the real pages and
 * evaluates them, so it proves what the Admin READS rather than what a file
 * happens to contain. It also asserts the absence of any review mutation control,
 * because this phase grants read visibility and nothing else.
 */
class InspectionReviewVisibilityUiTest extends TestCase
{
    private const CHECKER = 'tests/js/check-po-review-visibility.cjs';

    private const SERVER = 'app/Support/InspectionReviewVisibility.php';

    public function test_po_review_visibility_ui_is_correct(): void
    {
        $output = $this->runChecker();

        $this->assertSame(
            0,
            $output['exit'],
            "PO review visibility check failed. Rendering parcel-level review as a "
            ."decision for a specific round, or repeating one review across every "
            ."historical card, would tell the Admin something the database does not "
            ."prove.\n\n".$output['text']
        );

        $this->assertStringContainsString('PO review visibility OK', $output['text'], $output['text']);
        $this->assertMatchesRegularExpression('/(\d+) assertions/', $output['text'], $output['text']);
    }

    /**
     * Read visibility only: this phase must not add a way to act on a review.
     *
     * A Unit test has no booted application, so the route table cannot be read
     * here. Instead the route file is inspected directly: this phase must not
     * have introduced any site-inspections endpoint that mutates a review.
     */
    public function test_no_review_mutation_route_was_added(): void
    {
        $path = dirname(__DIR__, 2) . '/routes/web.php';
        $this->assertFileExists($path);

        $source = (string) file_get_contents($path);

        // Every site-inspections route this phase may rely on.
        preg_match_all(
            "/Route::(get|post|put|patch|delete)\(\s*'([^']*site-inspections[^']*)'/i",
            $source,
            $matches,
            PREG_SET_ORDER
        );

        $mutating = [];

        foreach ($matches as $m) {
            $method = strtolower($m[1]);
            $uri = $m[2];

            if (in_array($method, ['get', 'head'], true)) {
                continue;
            }

            if (preg_match('/review|decision/i', $uri)) {
                $mutating[] = strtoupper($method) . ' ' . $uri;
            }
        }

        $this->assertSame(
            [],
            $mutating,
            'Phase 2B2C is READ visibility only; no review mutation route may exist on '
            .'site-inspections. Found: ' . implode(', ', $mutating)
        );

        // The scoped sync POST must still be the only non-GET site-inspections
        // action this phase depends on.
        $this->assertStringContainsString(
            'site-inspections/{inspection}/sync-from-fieldsync',
            $source,
            'the scoped sync route must be unchanged'
        );
    }

    /**
     * The server vocabulary must exclude the request from the verdict list, and
     * must never read `site_inspection_task_id` as the judged round.
     */
    public function test_server_vocabulary_and_identity_rules(): void
    {
        $source = (string) file_get_contents(dirname(__DIR__, 2) . '/' . self::SERVER);
        $code = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;
        $code = preg_replace('#^\s*//.*$#m', '', $code) ?? $code;

        $this->assertMatchesRegularExpression(
            "/const ROUND_DECISIONS = \['Approved', 'Declined', 'Requires Reinspection'\];/",
            $code,
            'Needs Site Inspection must NOT be in the round-decision vocabulary. It requests '
            .'an inspection; it does not judge a finished one.'
        );

        $this->assertStringContainsString(
            "const REQUEST_LABEL = 'Site Inspection Requested';",
            $code,
            'A request must have its own presentation wording.'
        );

        // The judged round is read from exactly one column.
        $this->assertStringContainsString(
            'reviewed_site_inspection_id',
            $code,
            'Round identity must come from reviewed_site_inspection_id.'
        );

        // `site_inspection_task_id` must never appear in an executable position.
        $this->assertDoesNotMatchRegularExpression(
            '/site_inspection_task_id/',
            $code,
            'site_inspection_task_id must not be read at all: it is the round a review '
            .'CREATED, not the round it judged.'
        );
    }

    /**
     * The resolver must not expose anything that could be bound to an
     * "Awaiting PO Review" indicator.
     */
    public function test_no_awaiting_review_signal_is_exposed(): void
    {
        $source = (string) file_get_contents(dirname(__DIR__, 2) . '/' . self::SERVER);
        $code = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;
        $code = preg_replace('#^\s*//.*$#m', '', $code) ?? $code;

        $this->assertDoesNotMatchRegularExpression(
            '/[\'"]awaiting/i',
            $code,
            'Absence of reviewed_site_inspection_id is ambiguous in historical data, so '
            .'no awaiting-review signal may be exposed.'
        );
    }

    /** @return array{exit:int, text:string} */
    private function runChecker(): array
    {
        $path = dirname(__DIR__, 2) . '/' . self::CHECKER;

        $this->assertFileExists($path, 'Missing the PO review visibility checker.');

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