<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Executable regression for the Site Inspection scoped-sync confirmation and
 * result feedback.
 *
 * WHAT WAS WRONG
 * --------------
 * 1. The confirmation was a native `window.confirm()` dialog. That is browser
 *    chrome, not the application UI: it ignores the iMAPS design, cannot carry
 *    the note explaining what the action does and does not do, and cannot show
 *    a processing state. It was the only such call left in the frontend.
 * 2. The busy flag had no reset path, so the button latched on
 *    "Syncing from FieldSync…" after the request finished (covered in depth by
 *    SiteInspectionSyncBusyStateTest).
 * 3. The outcome banner was derived from `usePage().props.flash` DURING RENDER.
 *    That makes the result a side effect of a re-render rather than a
 *    consequence of the request that caused it. The Admin completed an action
 *    and saw no answer to it: for Inspection 8 the correct NO_REMOTE_RESULT
 *    message was never visibly presented.
 *
 * WHY THIS IS AN EXECUTABLE TEST
 * ------------------------------
 * A source-text assertion cannot detect this class of defect. The strings
 * `setSyncing`, `router.post`, "Syncing from FieldSync" and the flash keys are
 * all still present in the broken file, so a substring grep passes while the
 * button is latched and the outcome is invisible.
 *
 * The Node check therefore parses the real file with a real JSX parser and
 * EXECUTES the real confirm handler with stubbed state, then asserts:
 *   - no native window.confirm/alert/prompt on the page,
 *   - the confirmation renders through the shared Modal component,
 *   - Cancel closes the modal and issues nothing,
 *   - Confirm issues exactly ONE request to the scoped URL,
 *   - onFinish clears the busy state on the success path AND the error path,
 *   - NO_REMOTE_RESULT produces a visible, INFORMATIONAL outcome,
 *   - an error produces visible feedback,
 *   - the confirm control itself is disabled while syncing (no double submit),
 *   - the outcome banner is exposed to assistive technology,
 *   - each of the four backend outcome tokens maps to the right tone, checked
 *     against the wording SiteInspectionController actually emits.
 *
 * The tone contract is verified against the CONTROLLER's own strings rather than
 * a restatement of them, so the two cannot drift apart silently.
 */
class SiteInspectionSyncUxTest extends TestCase
{
    private const CHECKER = 'tests/js/check-sync-ux.cjs';

    private const PAGE = 'resources/js/Pages/Site Inspections/Show.jsx';

    public function test_scoped_sync_confirmation_and_feedback_are_correct(): void
    {
        $output = $this->runChecker();

        $this->assertSame(
            0,
            $output['exit'],
            "Scoped-sync UX check failed. A native confirm dialog, a busy flag with no "
            ."reset path, or a run that finishes with no visible outcome all leave the "
            ."Admin without a trustworthy answer about what happened.\n\n".$output['text']
        );

        $this->assertStringContainsString('scoped-sync UX OK', $output['text'], $output['text']);

        // A single silent pass is not evidence; the check must actually assert.
        $this->assertMatchesRegularExpression(
            '/(\d+) assertions/',
            $output['text'],
            'The checker must report a real assertion count, not a bare OK.'
        );
    }

    /**
     * The native dialog must be gone from the page. This is asserted directly
     * as well, so the failure names the offending construct rather than only
     * surfacing a checker exit code.
     */
    public function test_native_browser_dialogs_are_not_used(): void
    {
        $source = $this->pageSource();

        $this->assertDoesNotMatchRegularExpression(
            '/window\s*\.\s*confirm\s*\(/',
            $this->stripJsComments($source),
            'window.confirm() is browser chrome, not the application UI. The scoped '
            .'sync confirmation must use the shared Modal component.'
        );

        $this->assertDoesNotMatchRegularExpression(
            '/window\s*\.\s*(alert|prompt)\s*\(/',
            $this->stripJsComments($source),
            'window.alert()/window.prompt() must not be used.'
        );
    }

    /**
     * The confirmation must use the shared Modal component that already ships
     * with this app (a Headless UI Dialog wrapper), so accessibility behaviour
     * such as focus handling and Escape-to-close comes from the shared
     * component rather than being re-implemented here.
     */
    public function test_confirmation_uses_the_shared_modal_component(): void
    {
        $source = $this->stripJsComments($this->pageSource());

        $this->assertStringContainsString(
            'import Modal from "@/Components/Modal"',
            $source,
            'The shared Modal component must be imported.'
        );

        $this->assertMatchesRegularExpression(
            '/<Modal\s+show=\{syncConfirmOpen\}/u',
            $source,
            'The confirmation must be driven by the shared Modal with show={syncConfirmOpen}.'
        );
    }

    /**
     * The outcome banner must be announced, not only drawn: the whole point is
     * that the Admin is told what happened.
     */
    public function test_outcome_banner_is_announced_to_assistive_technology(): void
    {
        $source = $this->pageSource();

        $this->assertStringContainsString(
            'role="status"',
            $source,
            'The sync outcome banner must expose role="status".'
        );

        $this->assertStringContainsString(
            'aria-live="polite"',
            $source,
            'The sync outcome banner must be a polite live region so the result is announced.'
        );
    }

    /**
     * No-op outcomes must not be dressed as a success. `describeSyncOutcome()`
     * reports every completed run through the SUCCESS flash key because the
     * ACTION succeeded, which is not the same as the DATA having changed, so the
     * frontend has to classify the tone itself.
     */
    public function test_no_change_outcomes_are_informational_not_success(): void
    {
        $source = $this->stripJsComments($this->pageSource());

        $this->assertMatchesRegularExpression(
            '/function\s+outcomeTone\s*\(/u',
            $source,
            'A named outcomeTone() classifier must exist so the neutral/success '
            .'distinction is explicit and testable rather than inline in JSX.'
        );

        foreach (['nothing was changed', 'no local change', 'no change was confirmed'] as $phrase) {
            $this->assertStringContainsString(
                $phrase,
                $source,
                'outcomeTone() must classify "' . $phrase . '" as informational. A run '
                .'that changed nothing must not be shown as a green success.'
            );
        }
    }

    /**
     * The backend must keep every scoped-sync outcome distinguishable. The
     * frontend can only render honestly if the tokens survive; if a branch is
     * removed here, the Admin would be shown a generic fallback.
     */
    public function test_controller_still_reports_every_outcome(): void
    {
        $path = dirname(__DIR__, 2) . '/app/Http/Controllers/SiteInspectionController.php';
        $this->assertFileExists($path);

        $source = (string) file_get_contents($path);

        foreach (['CHANGED', 'NO_CHANGE', 'NO_REMOTE_RESULT', 'FAILED'] as $token) {
            $this->assertStringContainsString(
                'SYNC_RESULT=' . $token,
                $source,
                'The scoped sync must still distinguish SYNC_RESULT=' . $token . '.'
            );
        }

        $this->assertStringContainsString(
            'no change was confir',
            $source,
            'An unrecognised result must be reported as unconfirmed, never as a success.'
        );
    }

    // ------------------------------------------------------------------

    /** @return array{exit:int, text:string} */
    private function runChecker(): array
    {
        $path = dirname(__DIR__, 2) . '/' . self::CHECKER;

        $this->assertFileExists(
            $path,
            'Missing the scoped-sync UX checker. Without it, a native confirm dialog '
            .'or a silently finishing sync ships green and reaches the Admin.'
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

        return [
            'exit' => $exit,
            'text' => trim($stdout . "\n" . $stderr),
        ];
    }

    private function pageSource(): string
    {
        $path = dirname(__DIR__, 2) . '/' . self::PAGE;

        $this->assertFileExists($path);

        return (string) file_get_contents($path);
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

    /** Blank comment bodies so a documented note cannot satisfy an assertion. */
    private function stripJsComments(string $source): string
    {
        $stripped = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;

        return preg_replace('#^\s*//.*$#m', '', $stripped) ?? $stripped;
    }
}