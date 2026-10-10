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
 *  - a CLOSED episode renders BOTH labelled blocks when both exist;
 *  - each block is gated on its own field, so an absent one renders nothing and no
 *    placeholder text is fabricated;
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

    public function test_history_renders_a_labelled_recommendation_block(): void
    {
        $code = $this->code($this->panelSource());
        $this->assertMatchesRegularExpression(
            '/\{episode\.recommendation\s*&&.*>Advice<.*episode\.recommendation/s',
            $code,
            'A closed episode with a recommendation must render a labelled Recommendation block.'
        );
    }

    public function test_history_renders_a_labelled_closure_note_block(): void
    {
        $code = $this->code($this->panelSource());
        $this->assertMatchesRegularExpression(
            '/\{episode\.closure_note\s*&&.*>Note<.*episode\.closure_note/s',
            $code,
            'A closed episode closed WITHOUT a recommendation is explained only by its closure note, '
            .'so the note must be rendered under its own label.'
        );
    }

    public function test_each_history_block_is_gated_on_its_own_field(): void
    {
        $code = $this->code($this->panelSource());
        // Independent guards: neither block may be conditioned on the other field,
        // otherwise one present value could suppress the other.
        $this->assertStringContainsString('{episode.recommendation &&', $code);
        $this->assertStringContainsString('{episode.closure_note &&', $code);
        $this->assertDoesNotMatchRegularExpression(
            '/\{episode\.recommendation\s*&&\s*episode\.closure_note/',
            $code,
            'The two history blocks must be gated independently, never as a conjunction.'
        );
    }

    public function test_history_does_not_fabricate_content_for_absent_fields(): void
    {
        $code = $this->code($this->panelSource());
        // No placeholder words may stand in for a value that was never recorded.
        foreach (['No recommendation', 'No closure note', 'N/A', 'None recorded'] as $placeholder) {
            $this->assertStringNotContainsString(
                $placeholder,
                $code,
                "The history must render nothing for an absent field, never a '{$placeholder}' placeholder."
            );
        }
    }

    public function test_history_text_is_plain_and_never_raw_html(): void
    {
        $view = $this->panelSource();
        $code = $this->code($view);
        $this->assertStringNotContainsString('dangerouslySetInnerHTML', $code);
        $this->assertStringNotContainsString('innerHTML', $code);
        $this->assertStringNotContainsString('html-react-parser', $code);
        // Both history values are plain JSX children, so React escapes them.
        $this->assertStringContainsString('{episode.recommendation}</p>', $code);
        $this->assertStringContainsString('{episode.closure_note}</p>', $code);
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