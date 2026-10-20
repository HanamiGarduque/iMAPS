<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

// The Cloudflare check runs before credentials are touched, so these need no database.
class LoginTurnstileTest extends TestCase
{
    private function enableTurnstile(): void
    {
        config(['services.turnstile.site_key' => 'site', 'services.turnstile.secret_key' => 'secret']);
    }

    public function test_login_without_a_token_is_rejected_when_turnstile_is_on(): void
    {
        $this->enableTurnstile();
        Http::fake();

        $this->post('/login', ['email' => 'a@example.com', 'password' => 'x'])->assertSessionHasErrors('email');

        $this->assertStringContainsString('security check', session('errors')->first('email'));
        Http::assertNothingSent();
    }

    public function test_login_with_a_token_cloudflare_rejects_is_refused(): void
    {
        $this->enableTurnstile();
        Http::fake(['challenges.cloudflare.com/*' => Http::response(['success' => false])]);

        $this->post('/login', ['email' => 'a@example.com', 'password' => 'x', 'cf-turnstile-response' => 'bad'])
            ->assertSessionHasErrors('email');

        $this->assertStringContainsString('security check', session('errors')->first('email'));
    }

    public function test_login_page_only_gets_the_site_key_when_both_keys_are_set(): void
    {
        config(['services.turnstile.site_key' => 'site', 'services.turnstile.secret_key' => null]);

        $this->get('/login')->assertInertia(fn ($page) => $page->where('turnstileSiteKey', null));

        $this->enableTurnstile();

        $this->get('/login')->assertInertia(fn ($page) => $page->where('turnstileSiteKey', 'site'));
    }
}
