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
}
