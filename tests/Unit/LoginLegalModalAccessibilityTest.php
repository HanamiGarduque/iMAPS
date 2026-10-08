<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

// No JS test runner or browser in this repo, so this guards the wiring in the source; the behaviour itself
// is checked by hand (Escape closes, Tab/Shift+Tab wrap inside, focus returns to the opening link).
class LoginLegalModalAccessibilityTest extends TestCase
{
    private string $source;

    protected function setUp(): void
    {
        $this->source = file_get_contents(__DIR__ . '/../../resources/js/Pages/Auth/Login.jsx');
    }

    public function test_escape_closes_the_modal(): void
    {
        $this->assertStringContainsString("e.key === 'Escape'", $this->source);
        $this->assertStringContainsString("addEventListener('keydown', onKeyDown)", $this->source);
        $this->assertStringContainsString("removeEventListener('keydown', onKeyDown)", $this->source);
    }

    public function test_tab_is_trapped_inside_the_dialog(): void
    {
        $this->assertStringContainsString('ref={termsDialog}', $this->source);
        $this->assertStringContainsString("e.key !== 'Tab'", $this->source);
        $this->assertStringContainsString('e.shiftKey && document.activeElement === first', $this->source);
        $this->assertStringContainsString('last.focus()', $this->source);
    }

    public function test_focus_moves_in_on_open_and_returns_to_the_link_on_close(): void
    {
        $this->assertStringContainsString('termsOpener.current = document.activeElement', $this->source);
        $this->assertStringContainsString('termsOpener.current?.focus()', $this->source);
        // Both links must go through openTerms so the opener is remembered.
        $this->assertStringNotContainsString("onClick={() => setShowTerms('terms')}", $this->source);
        $this->assertStringNotContainsString("onClick={() => setShowTerms('privacy')}", $this->source);
    }
}
