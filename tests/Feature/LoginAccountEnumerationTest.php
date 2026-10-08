<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LoginAccountEnumerationTest extends TestCase
{
    use RefreshDatabase;

    private function loginError(string $email, string $password): string
    {
        $this->post('/login', ['email' => $email, 'password' => $password])->assertSessionHasErrors('email');
        $this->assertGuest();

        return session('errors')->first('email');
    }

    public function test_wrong_password_looks_identical_for_deactivated_active_and_unknown_emails(): void
    {
        $deactivated = User::factory()->create(['role' => 'Admin', 'is_active' => false]);
        $active = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $forDeactivated = $this->loginError($deactivated->email, 'wrong');
        $forActive = $this->loginError($active->email, 'wrong');
        $forUnknown = $this->loginError('nobody@example.com', 'wrong');

        // The hint mentions deactivation as a possibility, but identically for every email.
        $this->assertStringContainsString('may be deactivated; contact an administrator', $forDeactivated);
        $this->assertStringNotContainsString('Your account has been deactivated', $forDeactivated);
        $this->assertSame($forActive, $forDeactivated);
        $this->assertSame($forActive, $forUnknown);
    }

    public function test_deactivated_message_is_shown_only_after_the_password_is_verified(): void
    {
        $deactivated = User::factory()->create(['role' => 'Admin', 'is_active' => false]);

        $this->assertStringContainsString('deactivated', $this->loginError($deactivated->email, 'password'));
    }

    public function test_deactivated_account_with_correct_password_cannot_log_in_even_after_failed_attempts(): void
    {
        $deactivated = User::factory()->create(['role' => 'Planning Officer', 'is_active' => false]);

        $this->loginError($deactivated->email, 'wrong');
        $this->loginError($deactivated->email, 'password');

        $this->assertGuest();
        $this->assertFalse((bool) $deactivated->fresh()->is_active);
    }

    public function test_block_is_keyed_by_email_and_ip_so_the_real_user_is_unaffected(): void
    {
        $user = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        for ($i = 0; $i < 5; $i++) {
            $this->loginError($user->email, 'wrong');
        }
        $this->assertStringContainsString('Too many failed login attempts', $this->loginError($user->email, 'password'));

        // The real user, on another IP, is not blocked and the account is still active.
        $this->withServerVariables(['REMOTE_ADDR' => '10.9.8.7'])
            ->post('/login', ['email' => $user->email, 'password' => 'password']);
        $this->assertAuthenticatedAs($user);
    }

    public function test_remember_option_is_ignored_so_no_long_lived_login_is_created(): void
    {
        $user = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $response = $this->post('/login', ['email' => $user->email, 'password' => 'password', 'remember' => true]);

        $this->assertAuthenticatedAs($user);
        $response->assertCookieMissing(\Auth::guard('web')->getRecallerName());
        $this->assertNull($user->fresh()->remember_token);
    }
}
