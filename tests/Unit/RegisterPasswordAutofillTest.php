<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class RegisterPasswordAutofillTest extends TestCase
{
    public function test_staff_password_fields_ask_the_browser_for_a_new_password_not_a_saved_one(): void
    {
        $source = file_get_contents(__DIR__ . '/../../resources/js/Pages/Auth/Register.jsx');

        // Both password inputs spread maskedInput(); its autoComplete is what the browser reads.
        $this->assertSame(2, substr_count($source, '{...maskedInput('));
        $this->assertMatchesRegularExpression(
            "/const maskedInput = .*?autoComplete: 'new-password'/s",
            $source,
            'Chrome ignores autoComplete="off" on password fields and can fill the admin\'s saved login into the new account.',
        );
    }
}
