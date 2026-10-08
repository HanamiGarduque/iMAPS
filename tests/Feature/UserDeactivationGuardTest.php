<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class UserDeactivationGuardTest extends TestCase
{
    use RefreshDatabase;

    private function update(User $actor, User $target, array $override = [])
    {
        return $this->actingAs($actor)->postJson("/users/{$target->id}/update", $override + [
            'name' => $target->name,
            'email' => $target->email,
            'is_active' => true,
        ]);
    }

    public function test_admin_cannot_deactivate_self(): void
    {
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->update($admin, $admin, ['is_active' => false])->assertStatus(422);
        $this->assertTrue((bool) $admin->fresh()->is_active);
    }

    public function test_can_deactivate_another_admin_when_one_remains_and_audits(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $other = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->update($actor, $other, ['is_active' => false, 'name' => 'Renamed'])->assertOk();

        $this->assertFalse((bool) $other->fresh()->is_active);
        $this->assertDatabaseHas('audit_trail', [
            'action' => 'User Profile Updated',
            'performed_by' => $actor->id,
        ]);
        $this->assertStringContainsString('Renamed', DB::table('audit_trail')->value('note'));
    }

    public function test_no_audit_when_nothing_changed(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->update($actor, $actor)->assertOk();
        $this->assertDatabaseCount('audit_trail', 0);
    }

    public function test_unknown_or_non_numeric_id_is_not_found_and_email_rule_is_not_injectable(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $payload = ['name' => 'X', 'email' => 'x@example.com', 'is_active' => true];

        $this->actingAs($actor)->postJson('/users/999999/update', $payload)->assertStatus(404);
        // Previously this string was concatenated into the unique rule; now it never reaches validation.
        $this->actingAs($actor)->postJson('/users/1,id,role,Admin/update', $payload)->assertStatus(404);
    }

    public function test_email_must_stay_unique_but_own_email_is_allowed(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $other = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);

        $this->update($actor, $actor)->assertOk();
        $this->update($actor, $other, ['email' => $actor->email])->assertStatus(422)->assertJsonValidationErrors('email');
    }

    public function test_logs_route_only_accepts_numeric_ids(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->actingAs($actor)->getJson("/users/{$actor->id}/logs")->assertOk();
        $this->actingAs($actor)->getJson('/users/abc/logs')->assertStatus(404);
    }
}
