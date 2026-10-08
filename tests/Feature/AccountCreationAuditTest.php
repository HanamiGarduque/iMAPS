<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AccountCreationAuditTest extends TestCase
{
    use RefreshDatabase;

    private function register(User $admin, string $role, string $email)
    {
        return $this->actingAs($admin)->post('/register-new-account', [
            'name' => 'New Person',
            'email' => $email,
            'role' => $role,
            'password' => 'Str0ng-Passw0rd!x',
            'password_confirmation' => 'Str0ng-Passw0rd!x',
        ]);
    }

    public function test_creating_admin_and_planning_officer_accounts_is_audited(): void
    {
        Http::fake(); // no test may reach Supabase
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->register($admin, 'Admin', 'new.admin@example.com')->assertSessionHasNoErrors();
        $this->register($admin, 'Planning Officer', 'new.po@example.com')->assertSessionHasNoErrors();

        $rows = DB::table('audit_trail')->where('action', 'User Account Created')->orderBy('id')->get();
        $this->assertCount(2, $rows);
        $this->assertSame($admin->id, (int) $rows[0]->performed_by);
        $this->assertStringContainsString('Created Admin account', $rows[0]->note);
        $this->assertStringContainsString('new.admin@example.com', $rows[0]->note);
        $this->assertStringContainsString('Created Planning Officer account', $rows[1]->note);
        // The password must never end up in the audit trail.
        $this->assertStringNotContainsString('Passw0rd', $rows[0]->note . $rows[1]->note);
    }

    public function test_rejected_registration_leaves_no_audit_row(): void
    {
        Http::fake();
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->register($admin, 'Admin', 'not-an-email')->assertSessionHasErrors('email');

        $this->assertDatabaseCount('audit_trail', 0);
    }
}
