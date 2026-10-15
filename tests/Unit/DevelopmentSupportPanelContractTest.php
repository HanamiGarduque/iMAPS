<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * DEVELOPMENT SUPPORT PANEL RENDERING CONTRACT.
 *
 * This repository has no JavaScript test runner - no jest, vitest or testing-library
 * in `package.json`, and no test script - so the established convention for asserting
 * JSX behaviour is a PHP contract test over the view source. That convention is
 * weaker than a real render test and is recorded as such; the strongest available
 * evidence for the DATA half of this feature is behavioural and lives in
 * tests/Feature/ReportEscalationTest.php, which drives the real controller and asserts
 * the projected `closure_note` actually reaches the page.
 *
 * What is pinned here:
 *  - the panel is titled "Contact Developer" and offers only the contact and the
 *    Compose Email draft link: no new escalation and no past-request history;
 *  - rendered text is a plain JSX child (React escapes it), never raw HTML;
 *  - the unconfigured-contact notice uses the exact approved user-facing copy;
 *  - no configuration-variable name reaches the rendered Admin view.
 */
class DevelopmentSupportPanelContractTest extends TestCase
{
    private function panelSource(): string
    {
        return (string) file_get_contents(base_path('resources/js/Pages/Diagnostics/DevelopmentSupport.jsx'));
    }

    private function code(string $source): string
    {
        // Strip comments so a name mentioned only in prose cannot satisfy a rule.
        return (string) preg_replace(['#/\*.*?\*/#s', '#//[^\n]*#'], '', $source);
    }

    public function test_panel_is_titled_contact_developer(): void
    {
        $code = $this->code($this->panelSource());
        $this->assertStringContainsString('>Contact Developer</h2>', $code);
        $this->assertStringNotContainsString('Developer escalation', $code);
    }

    public function test_panel_offers_no_new_escalation_or_history(): void
    {
        $code = $this->code($this->panelSource());
        // The panel is reduced to the developer contact and the email draft link.
        $this->assertStringNotContainsString('Open Developer Escalation', $code);
        $this->assertStringNotContainsString('post(base,', $code);
        $this->assertStringNotContainsString('panel.closed', $code);
        $this->assertStringNotContainsString('Past requests', $code);
        $this->assertStringContainsString('Compose Email', $code);
        $this->assertStringContainsString('panel.contact.email', $code);
    }

    public function test_panel_text_is_plain_and_never_raw_html(): void
    {
        $code = $this->code($this->panelSource());
        $this->assertStringNotContainsString('dangerouslySetInnerHTML', $code);
        $this->assertStringNotContainsString('innerHTML', $code);
        $this->assertStringNotContainsString('html-react-parser', $code);
    }

    public function test_unconfigured_contact_notice_uses_the_exact_approved_copy(): void
    {
        $view = $this->panelSource();
        $this->assertStringContainsString(
            'No dev team contact set. Ask your system admin.',
            $view,
            'The Admin-facing notice must use the exact approved user-facing copy.'
        );
    }

    public function test_no_configuration_variable_name_reaches_the_rendered_admin_view(): void
    {
        $view = $this->panelSource();
        foreach (['IMAPS_SUPPORT_CONTACT_', 'IMAPS_SUPPORT_INSTRUCTIONS', 'config(', 'env('] as $leak) {
            $this->assertStringNotContainsString(
                $leak,
                $view,
                "A configuration variable name ('{$leak}') must never appear in the Admin UI."
            );
        }
    }

    public function test_unconfigured_contact_notice_does_not_claim_escalation_is_blocked(): void
    {
        $code = $this->code($this->panelSource());
        $this->assertStringNotContainsString(
            'before opening an escalation',
            $code,
            'v1 allows opening an escalation with no configured contact, so the notice must not imply otherwise.'
        );
    }

    public function test_open_episode_behaviour_is_unchanged(): void
    {
        $code = $this->code($this->panelSource());
        // The open-episode surface must be untouched by the history change.
        $this->assertStringContainsString('{open.recommendation', $code);
        $this->assertStringContainsString('Save advice', $code);
        $this->assertStringContainsString('Close request', $code);
        $this->assertStringContainsString('Send to dev team', $code);
        // Its recommendation block keeps its own recorded-at stamp.
        $this->assertStringContainsString('Recorded {stamp(open.recommendation_at)}', $code);
    }
}