<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class CloudflareClientIpAndThrottleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Route::middleware('web')->get('/_ip', fn (\Illuminate\Http\Request $r) => $r->ip());
    }

    public function test_client_ip_comes_from_cloudflare_header_not_forged_forwarded_for(): void
    {
        config(['app.origin_secret' => 's3cret']);

        $this->withHeaders([
            'X-Origin-Secret' => 's3cret',
            'CF-Connecting-IP' => '203.0.113.9',
            'X-Forwarded-For' => '198.51.100.1, 203.0.113.9',
        ])->get('/_ip')->assertSee('203.0.113.9');
    }

    public function test_without_origin_secret_configured_header_is_ignored(): void
    {
        config(['app.origin_secret' => '']);

        $this->withHeaders(['CF-Connecting-IP' => '203.0.113.9'])
            ->get('/_ip')->assertDontSee('203.0.113.9');
    }

    public function test_wrong_origin_secret_is_refused(): void
    {
        config(['app.origin_secret' => 's3cret']);

        $this->withHeaders(['X-Origin-Secret' => 'nope', 'CF-Connecting-IP' => '203.0.113.9'])
            ->get('/_ip')->assertForbidden();
    }

    public function test_allowlist_behind_cloudflare_checks_the_visitor_not_the_edge_server(): void
    {
        config(['app.origin_secret' => 's3cret', 'app.allowed_ips' => ['203.0.113.0/24']]);

        // Railway appends the Cloudflare edge address on the right of X-Forwarded-For.
        $this->withHeaders([
            'X-Origin-Secret' => 's3cret',
            'CF-Connecting-IP' => '203.0.113.9',
            'X-Forwarded-For' => '203.0.113.9, 172.68.1.1',
        ])->get('/_ip')->assertOk()->assertSee('203.0.113.9');
    }

    public function test_allowlist_behind_cloudflare_blocks_other_visitors_even_with_forged_forwarded_for(): void
    {
        config(['app.origin_secret' => 's3cret', 'app.allowed_ips' => ['203.0.113.0/24']]);

        $this->withHeaders([
            'X-Origin-Secret' => 's3cret',
            'CF-Connecting-IP' => '198.51.100.7',
            'X-Forwarded-For' => '203.0.113.9, 198.51.100.7, 172.68.1.1',
        ])->get('/_ip')->assertForbidden();
    }

    public function test_guests_are_limited_per_ip_and_users_get_a_higher_ceiling(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->get('/_ip')->assertOk();
        }
        $this->get('/_ip')->assertStatus(429);

        $user = User::factory()->create(['role' => 'Admin']);
        $this->actingAs($user)->get('/_ip')->assertOk();
    }
}
