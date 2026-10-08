<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class LoginForgotPasswordTest extends TestCase
{
    public function test_login_has_no_dead_forgot_password_link_and_points_users_to_their_administrator(): void
    {
        $source = file_get_contents(__DIR__ . '/../../resources/js/Pages/Auth/Login.jsx');

        $this->assertStringNotContainsString('href="#"', $source, 'A dead href="#" link makes the page look broken.');
        $this->assertStringNotContainsString('Forgot password?', $source);
        $this->assertStringContainsString('Contact your administrator to reset it', $source);
    }
}
