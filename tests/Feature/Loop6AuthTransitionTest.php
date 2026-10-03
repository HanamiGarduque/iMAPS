<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Loop6AuthTransitionTest extends TestCase
{
    use RefreshDatabase;

    public function test_allowed_roles_can_repeat_login_and_logout_transitions(): void
    {
        $planningOfficer = User::factory()->create(['role' => 'Planning Officer']);
        $admin = User::factory()->create(['role' => 'Admin']);

        $this->get('/login')->assertOk();

        $this->post('/login', [
            'email' => $planningOfficer->email,
            'password' => 'password',
        ])->assertRedirect(route('dashboard', absolute: false));
        $this->assertAuthenticatedAs($planningOfficer);
        $this->assertNotNull($planningOfficer->fresh()->last_login);

        $this->post('/logout')->assertRedirect(route('login', absolute: false));
        $this->assertGuest();
        $this->get('/login')->assertOk();

        $this->post('/login', [
            'email' => $admin->email,
            'password' => 'password',
        ])->assertRedirect(route('dashboard', absolute: false));
        $this->assertAuthenticatedAs($admin);

        $this->post('/logout')->assertRedirect(route('login', absolute: false));
        $this->assertGuest();
        $this->get('/login')->assertOk();

        $this->post('/login', [
            'email' => $planningOfficer->email,
            'password' => 'password',
        ])->assertRedirect(route('dashboard', absolute: false));
        $this->assertAuthenticatedAs($planningOfficer);
        $this->assertNotNull($planningOfficer->fresh()->last_login);

        $this->post('/logout')->assertRedirect(route('login', absolute: false));
        $this->assertGuest();
    }

    public function test_site_inspector_remains_rejected_and_invalid_credentials_remain_guest(): void
    {
        $inspector = User::factory()->create(['role' => 'Site Inspector']);

        $this->from('/login')->post('/login', [
            'email' => $inspector->email,
            'password' => 'password',
        ])->assertRedirect(route('login', absolute: false));
        $this->assertGuest();

        $this->from('/login')->post('/login', [
            'email' => $inspector->email,
            'password' => 'wrong-password',
        ])->assertRedirect(route('login', absolute: false));
        $this->assertGuest();
    }
}
