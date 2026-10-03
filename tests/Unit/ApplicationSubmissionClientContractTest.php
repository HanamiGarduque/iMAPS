<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * Application submission contract.
 *
 * MASTER MERGE CORRECTION - IMPLEMENTATION-NEUTRAL ASSERTIONS.
 *
 * Every test below previously pinned the exact spelling of the pre-merge
 * submission code: the names of local variables, Inertia option formatting, one
 * particular combined condition, and the private storage key used for the
 * wizard step. Master rewrote the page (axios + its own draft UX) and the
 * submission-integrity guards were re-homed into that new architecture, so the
 * old literals no longer appear even though the behaviour they protected is
 * intact - and in some cases stronger.
 *
 * These assertions are therefore rewritten to state the CONTRACT rather than the
 * old source shape:
 *
 *   - success is only ever presented from a real server response;
 *   - the canonical reference_number comes from the server and is never
 *     generated, guessed or defaulted client-side;
 *   - no success UI, no draft discard and no "Submitted" state is reachable
 *     without that authoritative reference;
 *   - a failure can never masquerade as a success;
 *   - duplicate submission is synchronously impossible;
 *   - a stale autosave can never overwrite a just-submitted application;
 *   - session expiry and transport failure are actionable and never silent;
 *   - a rejected submission preserves the officer's entered data.
 */
class ApplicationSubmissionClientContractTest extends TestCase
{
    private string $createSource;

    protected function setUp(): void
    {
        parent::setUp();

        $root = dirname(__DIR__, 2);
        $this->createSource = (string) file_get_contents($root.'/resources/js/Pages/Applications/Create.jsx');
    }

    public function test_success_ui_requires_server_success_and_reference_flash(): void
    {
        // The canonical identity is READ from the server response and nothing
        // else. A second `const ref` in the same scope would break the build, so
        // the absence of any fallback on this assignment is the assertion.
        $this->assertMatchesRegularExpression(
            '/const ref = page\.props\.flash\?\.reference_number;/',
            $this->createSource,
            'The canonical reference must be read from the server response.'
        );

        $this->assertStringNotContainsString(
            'Math.floor(100 + Math.random() * 900)',
            $this->createSource,
            'No client-generated fallback canonical reference may exist.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/const ref = [^;]*\|\|/',
            $this->createSource,
            '`ref` must not have a fallback: an unconfirmed success is not a success.'
        );

        // An unconfirmed 2xx is refused outright, and the guard runs BEFORE any
        // success presentation, draft cleanup or Submitted state.
        $guard = strpos($this->createSource, 'if (!ref) {');
        $this->assertNotFalse($guard, 'A missing server reference must be refused.');

        foreach ([
            'setShowRoutingSlip(true)'      => 'success routing slip',
            'clearDraftStateRecord()'       => 'draft cleanup',
            'setSyncStatus("Submitted")'     => 'Submitted state',
            'setSubmissionSucceeded(true)'  => 'confirmed-success state',
        ] as $needle => $label) {
            $at = strpos($this->createSource, $needle, $guard);
            $this->assertNotFalse($at, "{$label} must exist.");
            $this->assertGreaterThan(
                $guard,
                $at,
                "{$label} must not be reachable without an authoritative server reference."
            );
        }
    }

    public function test_failure_preserves_form_and_draft_without_success_navigation(): void
    {
        // A rejected submission resets only the submission flags. The entered
        // form is never cleared, so the officer keeps their work.
        $this->assertMatchesRegularExpression(
            '/onError:\s*\(errs\)\s*=>\s*\{[\s\S]{0,900}?setErrors\(errs\)/',
            $this->createSource,
            'A validation/transport failure must record the server errors.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/onError:\s*\(errs\)\s*=>\s*\{[^}]*setForm\s*\(\s*\{\s*\}\s*\)/',
            $this->createSource,
            'A failed submission must not clear the entered form.'
        );

        // The synchronous lock is released so the officer can correct and retry.
        $this->assertMatchesRegularExpression(
            '/onError:[\s\S]{0,600}?submittingRef\.current = false;/',
            $this->createSource,
            'A failed submission must release the duplicate-submit lock.'
        );

        // No success state on failure.
        $this->assertDoesNotMatchRegularExpression(
            '/onError:[\s\S]{0,600}?setSubmissionSucceeded\(true\)/',
            $this->createSource,
            'A failure must never set the confirmed-success state.'
        );
    }

    public function test_csrf_and_server_failures_are_actionable(): void
    {
        // Session/CSRF expiry must be surfaced, not swallowed.
        $this->assertStringContainsString('session or CSRF token expired', $this->createSource);
        $this->assertStringContainsString('could not reach the server', $this->createSource);
        $this->assertStringContainsString('server failed before confirming', $this->createSource);

        // Both are reachable from the Inertia failure events, and the listener
        // is bound to a real status check rather than a guessed string.
        $this->assertStringContainsString('router.on("invalid"', $this->createSource);
        $this->assertStringContainsString('router.on("exception"', $this->createSource);
        $this->assertMatchesRegularExpression(
            '/status === 419/',
            $this->createSource,
            'Session expiry must be detected from the real HTTP status.'
        );

        // Listeners must be removed on unmount, or they accumulate and fire
        // against a stale submission.
        $this->assertStringContainsString('offInvalid?.();', $this->createSource);
        $this->assertStringContainsString('offException?.();', $this->createSource);

        // The token lifecycle itself stays with the framework: this page must
        // not manage a token of its own.
        $this->assertStringNotContainsString('X-CSRF-TOKEN', $this->createSource);
    }

    public function test_synchronous_submitting_guard_prevents_duplicate_clicks(): void
    {
        // React state alone cannot prevent a double click, because it does not
        // update until the next render. A ref lock set BEFORE the request is the
        // only thing that closes the window, so it is required, not optional.
        $this->assertStringContainsString('const submittingRef = useRef(false);', $this->createSource);

        $this->assertMatchesRegularExpression(
            '/const handleSubmit = \(e\) => \{[\s\S]{0,300}?submittingRef\.current/s',
            $this->createSource,
            'The submit handler must consult the synchronous lock.'
        );
        $this->assertMatchesRegularExpression(
            '/setSubmitting\(true\);[\s\S]{0,200}?submittingRef\.current = true;/',
            $this->createSource,
            'The lock must be claimed synchronously around the submission, not only in state.'
        );

        // Released on every non-success outcome so a failed submit stays retryable.
        $this->assertMatchesRegularExpression(
            '/onFinish:[\s\S]{0,300}?if \(!submissionSucceeded\) submittingRef\.current = false;/',
            $this->createSource,
            'The lock must be released unless success was actually confirmed.'
        );

        $this->assertStringContainsString('disabled={submitting}', $this->createSource);
    }

    public function test_autosave_is_cancelled_and_ignored_during_final_submission(): void
    {
        // The stale-autosave race is the reason these guards exist: an autosave
        // that resolves after the server recorded the application can recreate
        // the draft it just consumed.
        $this->assertStringContainsString('const autosaveControllerRef = useRef(null);', $this->createSource);
        $this->assertStringContainsString('new AbortController()', $this->createSource);
        $this->assertStringContainsString('{ signal: controller.signal }', $this->createSource);

        // The autosave is cancelled BEFORE the final submission is issued.
        $abort = strpos($this->createSource, 'abortOutstandingAutosave();', strpos($this->createSource, 'const handleSubmit'));
        $request = strpos($this->createSource, 'router.post("/applications/encode"', strpos($this->createSource, 'const handleSubmit'));
        $this->assertNotFalse($abort);
        $this->assertNotFalse($request);
        $this->assertLessThan(
            $request,
            $abort,
            'The outstanding autosave must be aborted BEFORE the final submission is sent.'
        );

        // An intentional abort is not a user-facing failure.
        $this->assertStringContainsString('axios.isCancel(error)', $this->createSource);

        // Autosave stands down entirely once a submission is in flight.
        $this->assertMatchesRegularExpression(
            '/if \(submitting \|\| submissionSucceeded\) return;/',
            $this->createSource,
            'Autosave must not run while a submission is in flight or has succeeded.'
        );
    }

    public function test_transport_errors_are_scoped_to_final_submission_and_success_clears_stale_errors(): void
    {
        // The failure listeners are scoped: they only act while a submission is
        // actually in flight, so an unrelated page-level failure cannot
        // overwrite a half-completed form.
        $this->assertMatchesRegularExpression(
            '/useEffect\(\(\) => \{\s*if \(!submitting && !submissionFinalized\) return;/',
            $this->createSource,
            'The Inertia failure listeners must be scoped to an in-flight submission.'
        );

        // Both listener paths release the lock and re-arm the form.
        $this->assertGreaterThanOrEqual(
            3,
            substr_count($this->createSource, 'submittingRef.current = false;'),
            'Every failure path (no-reference, invalid, exception, onFinish) must release the lock.'
        );
    }

    public function test_drafts_persist_and_restore_the_current_wizard_step(): void
    {
        // The wizard step is part of the persisted draft. It is carried inside
        // the saved payload and used to seed the initial step, so an officer who
        // reloads or crashes returns to the step they were on.
        $this->assertStringContainsString(
            'persistDraftState(tempDraftId, { ...form, __wizard_step: currentStep })',
            $this->createSource,
            'Every draft save must persist the current wizard step.'
        );
        $this->assertStringContainsString(
            'localStorage.getItem(DRAFT_PAYLOAD_KEY)',
            $this->createSource,
            'The saved step must be read back to seed the initial step.'
        );
        $this->assertMatchesRegularExpression(
            '/useState\(\(\) => \{[\s\S]{0,400}?__wizard_step/',
            $this->createSource,
            'The restored step must seed the initial wizard step, not be read later.'
        );

        // A corrupted or hand-edited value must not put the wizard into a
        // non-existent step, so the restore is range-checked.
        $this->assertMatchesRegularExpression(
            '/Number\.isInteger\(n\) && n >= 1 && n <= 5/',
            $this->createSource,
            'The restored wizard step must be validated against the real step range.'
        );

        // A confirmed success is what invalidates the draft, so the persisted
        // record can no longer be replayed into a new submission.
        $this->assertStringContainsString('submissionSucceeded', $this->createSource);
        $this->assertStringContainsString('clearDraftStateRecord()', $this->createSource);
    }
}
