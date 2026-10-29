<?php

namespace Tests\Feature;

use Tests\TestCase;

class SecurityHeadersTest extends TestCase
{
    public function test_baseline_headers_are_sent(): void
    {
        $response = $this->get('/ping');

        $response->assertOk();
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
        $response->assertHeader('X-Frame-Options', 'SAMEORIGIN');
        $response->assertHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        $this->assertStringContainsString('camera=()', $response->headers->get('Permissions-Policy'));
    }

    public function test_headers_are_sent_even_when_a_guard_refuses_the_request(): void
    {
        config(['app.origin_secret' => 's3cret']);

        $response = $this->get('/login');

        $response->assertForbidden();
        $response->assertHeader('X-Content-Type-Options', 'nosniff');
    }

    public function test_hsts_only_over_https(): void
    {
        $this->get('/ping')->assertHeaderMissing('Strict-Transport-Security');

        $this->get('https://localhost/ping')
            ->assertHeader('Strict-Transport-Security', 'max-age=31536000');
    }

    public function test_hsts_can_be_disabled(): void
    {
        config(['app.hsts_max_age' => 0]);

        $this->get('https://localhost/ping')->assertHeaderMissing('Strict-Transport-Security');
    }

    public function test_csp_is_report_only_by_default(): void
    {
        config(['app.csp_mode' => 'report-only']);

        $response = $this->get('/ping');

        $response->assertHeaderMissing('Content-Security-Policy');
        $csp = $response->headers->get('Content-Security-Policy-Report-Only');
        $this->assertStringContainsString("default-src 'self'", $csp);
        $this->assertStringContainsString('https://challenges.cloudflare.com', $csp);
        $this->assertStringContainsString("frame-ancestors 'self'", $csp);
    }

    public function test_csp_can_be_enforced(): void
    {
        config(['app.csp_mode' => 'enforce']);

        $response = $this->get('/ping');

        $response->assertHeader('Content-Security-Policy');
        $response->assertHeaderMissing('Content-Security-Policy-Report-Only');
    }

    public function test_csp_can_be_turned_off(): void
    {
        config(['app.csp_mode' => 'off']);

        $response = $this->get('/ping');

        $response->assertHeaderMissing('Content-Security-Policy');
        $response->assertHeaderMissing('Content-Security-Policy-Report-Only');
    }

    public function test_supabase_origin_is_allowed_for_images_and_connections(): void
    {
        config([
            'app.csp_mode' => 'enforce',
            'services.supabase.url' => 'https://abc.supabase.co',
        ]);

        $csp = $this->get('/ping')->headers->get('Content-Security-Policy');

        $this->assertStringContainsString('https://abc.supabase.co', $csp);
        $this->assertStringContainsString('wss://abc.supabase.co', $csp);
    }
}
