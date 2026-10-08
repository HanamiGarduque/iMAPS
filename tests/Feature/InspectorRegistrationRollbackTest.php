<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class InspectorRegistrationRollbackTest extends TestCase
{
    use RefreshDatabase;

    private const REMOTE_ID = '3f1c2b8e-6a4d-4e0b-9d57-1a2b3c4d5e6f';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.supabase.url' => 'http://supabase.test', 'services.supabase.service_key' => 'k']);
    }

    private function fakeSupabase(callable $profile, int $deleteStatus = 200): void
    {
        Http::fake([
            // Order matters: the first matching pattern wins.
            '*/auth/v1/admin/users/*' => Http::response('', $deleteStatus),
            '*/auth/v1/admin/users' => Http::response(['id' => self::REMOTE_ID], 200),
            '*/rest/v1/profiles*' => $profile,
        ]);
    }

    private function validProfile(): \Closure
    {
        return fn (Request $r) => Http::response([[
            'id' => self::REMOTE_ID,
            'role' => 'inspector',
            'handshake_key' => $r['handshake_key'],
            'full_name' => $r['full_name'],
        ]], 200);
    }

    private function register()
    {
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        return $this->actingAs($admin)->post('/register-new-account', [
            'name' => 'Field Inspector',
            'email' => 'inspector@example.com',
            'role' => 'Site Inspector',
            'password' => 'Str0ng-Passw0rd!x',
            'password_confirmation' => 'Str0ng-Passw0rd!x',
        ]);
    }

    private function assertRemoteDeleted(bool $expected): void
    {
        $deleted = Http::recorded(fn (Request $r) => $r->method() === 'DELETE' && str_contains($r->url(), self::REMOTE_ID))->isNotEmpty();
        $this->assertSame($expected, $deleted);
    }

    public function test_failed_profile_verification_removes_the_remote_account_so_a_retry_works(): void
    {
        $this->fakeSupabase(fn () => Http::response([], 200));

        $this->register()->assertSessionHasErrors(['email' => 'The inspector account could not be completed and the partial remote account was removed. You can try again.']);

        $this->assertRemoteDeleted(true);
        $this->assertDatabaseMissing('users', ['email' => 'inspector@example.com']);
        $this->assertDatabaseMissing('audit_trail', ['action' => 'User Account Created']);
    }

    public function test_failed_local_insert_removes_the_remote_account(): void
    {
        $this->fakeSupabase($this->validProfile());
        User::creating(function (User $user) {
            if ($user->email === 'inspector@example.com') {
                throw new \RuntimeException('db down');
            }
        });

        $this->register()->assertSessionHasErrors(['email' => 'The local account could not be completed and the remote inspector account was removed. You can try again.']);

        $this->assertRemoteDeleted(true);
    }

    public function test_when_cleanup_itself_fails_the_admin_is_told_to_contact_the_administrator(): void
    {
        $this->fakeSupabase(fn () => Http::response([], 200), deleteStatus: 500);

        $this->register()->assertSessionHasErrors('email');

        $this->assertStringContainsString('could not be removed. Contact the administrator', session('errors')->first('email'));
    }

    public function test_profile_that_appears_late_is_retried_without_deleting_anything(): void
    {
        $calls = 0;
        $valid = $this->validProfile();
        $this->fakeSupabase(function (Request $r) use (&$calls, $valid) {
            return ++$calls < 3 ? Http::response([], 200) : $valid($r);
        });

        $this->register()->assertSessionHasNoErrors();

        $this->assertSame(3, $calls);
        $this->assertRemoteDeleted(false);
        $this->assertDatabaseHas('users', ['email' => 'inspector@example.com', 'role' => 'Site Inspector']);
        $this->assertSame(1, DB::table('audit_trail')->where('action', 'User Account Created')->count());
    }
}
