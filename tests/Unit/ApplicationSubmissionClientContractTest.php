<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

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
        $this->assertStringContainsString('const ref = page.props.flash?.reference_number;', $this->createSource);
        $this->assertStringContainsString('const successMessage = page.props.flash?.success;', $this->createSource);
        $this->assertStringContainsString('if (!ref || !successMessage)', $this->createSource);
        $this->assertStringNotContainsString('Math.floor(100 + Math.random() * 900)', $this->createSource);
    }

    public function test_failure_preserves_form_and_draft_without_success_navigation(): void
    {
        $this->assertStringContainsString('preserveState: true', $this->createSource);
        $this->assertMatchesRegularExpression('/onError:\s*\(errs\).*?setErrors\(errs\).*?setCurrentStep\(targetStep\)/s', $this->createSource);
        $this->assertMatchesRegularExpression('/if \(!ref \|\| !successMessage\).*?return;.*?setSubmissionSucceeded\(true\)/s', $this->createSource);
        $this->assertMatchesRegularExpression('/if \(submissionSucceeded\)\s*\{\s*router\.visit\("\/applications"\)/s', $this->createSource);
        $this->assertStringNotContainsString('if (workflowProgress === 100)', $this->createSource);
    }

    public function test_csrf_and_server_failures_are_actionable(): void
    {
        $this->assertStringContainsString('router.on("invalid"', $this->createSource);
        $this->assertStringContainsString('status !== 419 && status < 500', $this->createSource);
        $this->assertStringContainsString('event.preventDefault()', $this->createSource);
        $this->assertStringContainsString('router.on("exception"', $this->createSource);
        $this->assertStringContainsString('session or CSRF token expired', $this->createSource);
        $this->assertStringContainsString('server failed before confirming', $this->createSource);
        $this->assertStringContainsString('could not reach the server', $this->createSource);
    }

    public function test_synchronous_submitting_guard_prevents_duplicate_clicks(): void
    {
        $this->assertMatchesRegularExpression('/if \(submittingRef\.current\) return;.*?submittingRef\.current = true;.*?router\.post/s', $this->createSource);
        $this->assertMatchesRegularExpression('/onFinish: \(\) => \{\s*submittingRef\.current = false;\s*setSubmitting\(false\);/s', $this->createSource);
        $this->assertStringContainsString('disabled={submitting}', $this->createSource);
    }

    public function test_autosave_is_cancelled_and_ignored_during_final_submission(): void
    {
        $this->assertStringContainsString('autosaveControllerRef.current?.abort();', $this->createSource);
        $this->assertStringContainsString('if (submittingRef.current || submissionSucceeded) return;', $this->createSource);
        $this->assertStringContainsString('signal: controller.signal', $this->createSource);
        $this->assertStringContainsString('if (axios.isCancel(error)) return;', $this->createSource);
    }

    public function test_transport_errors_are_scoped_to_final_submission_and_success_clears_stale_errors(): void
    {
        $this->assertMatchesRegularExpression('/router\.on\("invalid".*?if \(!submittingRef\.current\) return;/s', $this->createSource);
        $this->assertMatchesRegularExpression('/router\.on\("exception".*?if \(!submittingRef\.current\) return;/s', $this->createSource);
        $this->assertMatchesRegularExpression('/setSubmissionSucceeded\(true\);\s*setErrors\(\{\}\);\s*setFlash\(null\);/s', $this->createSource);
    }

    public function test_drafts_persist_and_restore_the_current_wizard_step(): void
    {
        $this->assertStringContainsString('const DRAFT_STEP_KEY = "_wizard_step";', $this->createSource);
        $this->assertStringContainsString('loadLocalDraftPayload()', $this->createSource);
        $this->assertStringContainsString('cloudDraftRef || loadLocalDraftId()', $this->createSource);
        $this->assertStringContainsString('useState(() => draftStep(initialDraftPayload))', $this->createSource);
        $this->assertStringContainsString('draftPayload(form, currentStep)', $this->createSource);
        $this->assertStringContainsString('[form, tempDraftId, currentStep, submissionSucceeded]', $this->createSource);
    }
}
