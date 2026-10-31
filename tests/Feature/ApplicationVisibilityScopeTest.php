<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Application visibility is role-based: an Admin works with every application,
 * a Planning Officer only with those they encoded or currently own. The
 * registry and the Application Tracking map share this one scope.
 */
class ApplicationVisibilityScopeTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role, string $email): User
    {
        return User::create([
            'name' => $role . ' ' . $email, 'email' => $email, 'password' => bcrypt('password'),
            'role' => $role, 'is_active' => true,
        ]);
    }

    private function application(?User $encodedBy, ?User $owner): ZoningApplication
    {
        $application = ZoningApplication::factory()->create();
        $application->forceFill([
            'encoded_by' => $encodedBy?->id,
            'assigned_planning_officer_id' => $owner?->id,
        ])->save();

        return $application;
    }

    public function test_an_admin_sees_every_application(): void
    {
        $admin = $this->user('Admin', 'admin@example.test');
        $po = $this->user('Planning Officer', 'po@example.test');
        $this->application($po, $po);
        $this->application(null, null);

        $this->assertSame(2, ZoningApplication::query()->visibleTo($admin)->count());
    }

    public function test_a_planning_officer_sees_only_what_they_encoded_or_own(): void
    {
        $admin = $this->user('Admin', 'admin@example.test');
        $first = $this->user('Planning Officer', 'first@example.test');
        $second = $this->user('Planning Officer', 'second@example.test');

        $mine = $this->application($first, $first);
        $reassignedToMe = $this->application($second, $first);
        $reassignedAway = $this->application($first, $second);
        $theirs = $this->application($second, $second);
        $this->application($admin, $admin);

        $this->assertEqualsCanonicalizing(
            [$mine->id, $reassignedToMe->id, $reassignedAway->id],
            ZoningApplication::query()->visibleTo($first)->pluck('id')->all(),
        );
        $this->assertEqualsCanonicalizing(
            [$theirs->id, $reassignedToMe->id, $reassignedAway->id],
            ZoningApplication::query()->visibleTo($second)->pluck('id')->all(),
        );
    }

    public function test_no_user_sees_nothing(): void
    {
        $po = $this->user('Planning Officer', 'po@example.test');
        $this->application($po, $po);

        $this->assertSame(0, ZoningApplication::query()->visibleTo(null)->count());
    }
}
