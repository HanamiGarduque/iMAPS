<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class InspectorSupabaseAccountSyncTest extends TestCase
{
    use RefreshDatabase;

    private const UUID = '11111111-1111-4111-8111-111111111111';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.supabase.url' => 'https://sb.test', 'services.supabase.service_key' => 'svc']);
    }

    private function inspector(): User
    {
        return User::factory()->create(['role' => 'Site Inspector', 'handshake_key' => 'hk-1', 'is_active' => true]);
    }

    private function fakeSupabase(int $authStatus = 200): void
    {
        Http::fake([
            'sb.test/rest/v1/profiles?select=*' => Http::response([['id' => self::UUID]]),
            'sb.test/rest/v1/profiles*' => Http::response([['id' => self::UUID]]),
            'sb.test/auth/v1/admin/users/*' => Http::response([], $authStatus),
        ]);
    }

    public function test_profile_edit_updates_supabase_auth_and_profile(): void
    {
        $this->fakeSupabase();
        $admin = User::factory()->create(['role' => 'Admin']);
        $inspector = $this->inspector();

        $this->actingAs($admin)->postJson("/users/{$inspector->id}/update", [
            'name' => 'New Name', 'email' => 'new@example.com', 'is_active' => false,
        ])->assertOk();

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT'
            && str_ends_with($r->url(), '/auth/v1/admin/users/' . self::UUID)
            && $r['email'] === 'new@example.com' && $r['ban_duration'] === '876000h');
        Http::assertSent(fn (Request $r) => $r->method() === 'PATCH' && $r['full_name'] === 'New Name');
        $this->assertSame('New Name', $inspector->fresh()->name);
    }

    public function test_supabase_failure_leaves_local_row_unchanged(): void
    {
        $this->fakeSupabase(500);
        $admin = User::factory()->create(['role' => 'Admin']);
        $inspector = $this->inspector();
        $oldName = $inspector->name;

        $this->actingAs($admin)->postJson("/users/{$inspector->id}/update", [
            'name' => 'New Name', 'email' => $inspector->email, 'is_active' => true,
        ])->assertStatus(502);

        $this->assertSame($oldName, $inspector->fresh()->name);
    }

    public function test_password_reset_updates_supabase_password(): void
    {
        $this->fakeSupabase();
        $admin = User::factory()->create(['role' => 'Admin', 'password' => bcrypt('admin-pass-1')]);
        $inspector = $this->inspector();
        $old = $inspector->password;

        $this->actingAs($admin)->postJson('/users/reset-password', [
            'target_user_id' => $inspector->id, 'new_password' => 'brand-new-pass', 'admin_password' => 'admin-pass-1',
        ])->assertOk();

        Http::assertSent(fn (Request $r) => $r->method() === 'PUT' && $r['password'] === 'brand-new-pass');
        $this->assertNotSame($old, $inspector->fresh()->password);
    }

    public function test_non_inspector_edits_never_touch_supabase(): void
    {
        Http::fake();
        $admin = User::factory()->create(['role' => 'Admin']);
        $po = User::factory()->create(['role' => 'Planning Officer']);

        $this->actingAs($admin)->postJson("/users/{$po->id}/update", [
            'name' => 'X', 'email' => $po->email, 'is_active' => true,
        ])->assertOk();

        Http::assertNothingSent();
    }
}
