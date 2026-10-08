<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\RateLimiter;
use Tests\TestCase;

class SensitiveDataAccessTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Admin', 'is_active' => true]);
    }

    private function reveal(User $admin, $targetId, string $password = 'password')
    {
        return $this->actingAs($admin)->postJson('/users/sensitive-data', [
            'admin_password' => $password,
            'target_user_id' => $targetId,
        ]);
    }

    public function test_unknown_user_id_is_a_validation_error_not_a_500(): void
    {
        $this->reveal($this->admin(), 999999)->assertStatus(422)->assertJsonValidationErrors('target_user_id');
    }

    public function test_reveal_returns_key_and_is_audited(): void
    {
        $admin = $this->admin();
        $inspector = User::factory()->create(['role' => 'Site Inspector', 'handshake_key' => 'key-123']);

        $this->reveal($admin, $inspector->id)->assertOk()->assertJson(['handshake_key' => 'key-123']);

        $this->assertDatabaseHas('audit_trail', [
            'action' => 'Handshake Key Revealed',
            'performed_by' => $admin->id,
            'note' => "Revealed handshake key for user #{$inspector->id}",
        ]);
    }

    public function test_wrong_password_is_denied_unaudited_and_throttled_after_five_failures(): void
    {
        $admin = $this->admin();
        $inspector = User::factory()->create(['role' => 'Site Inspector', 'handshake_key' => 'key-123']);
        RateLimiter::clear('sensitive-data:' . $admin->id);

        for ($i = 0; $i < 5; $i++) {
            $this->reveal($admin, $inspector->id, 'wrong')->assertStatus(403);
        }
        // Locked out: even the correct password is refused now.
        $this->reveal($admin, $inspector->id)->assertStatus(429);

        $this->assertDatabaseCount('audit_trail', 0);
    }
}
