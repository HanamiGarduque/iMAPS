<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\SupabaseService;
use Illuminate\Support\Facades\DB;
use Mockery;
use Tests\Support\PlanningEvaluationMemoryDatabase;
use Tests\TestCase;

/**
 * PO-PHOTO-203. Runtime authorization of the exact private-photo read route.
 *
 * Uses the established isolated in-memory SQLite test harness: fictional rows,
 * fake Supabase responses, no project .env or live database, no migrations.
 * A denial must happen BEFORE the server-side signing/reader service is called.
 */
class PoPrivatePhotoScopeTest extends TestCase
{
    use PlanningEvaluationMemoryDatabase;

    private User $officerA;
    private User $officerB;
    private User $admin;
    private User $inspector;
    private SiteInspection $roundA;
    private SiteInspection $roundB;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName(), 'TEST MUST BE SQLITE ONLY');
        $this->assertSame(':memory:', DB::connection()->getDatabaseName(), 'TEST MUST NOT USE A PERSISTENT DB');
        $this->withoutVite();
        $this->createMemoryTables();

        $this->officerA = User::forceCreate([
            'name' => 'Fictional Officer A', 'email' => 'po-a@po-photo.test',
            'password' => 'fixture-only', 'role' => 'Planning Officer', 'is_active' => true,
        ]);
        $this->officerB = User::forceCreate([
            'name' => 'Fictional Officer B', 'email' => 'po-b@po-photo.test',
            'password' => 'fixture-only', 'role' => 'Planning Officer', 'is_active' => true,
        ]);
        $this->admin = User::forceCreate([
            'name' => 'Fictional Admin', 'email' => 'admin@po-photo.test',
            'password' => 'fixture-only', 'role' => 'Admin', 'is_active' => true,
        ]);
        $this->inspector = User::forceCreate([
            'name' => 'Fictional Inspector', 'email' => 'inspector@po-photo.test',
            'password' => 'fixture-only', 'role' => 'Site Inspector', 'is_active' => true,
        ]);
        $application = ZoningApplication::create([
            'reference_number' => 'APP-PO-PHOTO-FICTIONAL',
            'application_type' => 'Zoning Certificate', 'status' => 'Technical Review',
            'applicant_name' => 'Fictional Applicant', 'contact_number' => '09000000000',
            'encoded_by' => $this->officerA->id,
            'assigned_planning_officer_id' => $this->officerA->id,
        ]);
        $parcel = Parcel::create([
            'zoning_application_id' => $application->id,
            'parcel_code' => 'P-01', 'latitude' => 13.8, 'longitude' => 121.2,
        ]);
        // Different POs assign separate rounds within the SAME application/parcel.
        // Application ownership alone must never authorize someone else's photos.
        $this->roundA = SiteInspection::create([
            'zoning_application_id' => $application->id,
            'parcel_id' => $parcel->id,
            'inspector_id' => $this->inspector->id,
            'assigned_by_imaps_user_id' => $this->officerA->id,
            'assigned_by_name' => $this->officerA->name,
            'status' => 'completed',
        ]);
        $this->roundB = SiteInspection::create([
            'zoning_application_id' => $application->id,
            'parcel_id' => $parcel->id,
            'inspector_id' => $this->inspector->id,
            'assigned_by_imaps_user_id' => $this->officerB->id,
            'assigned_by_name' => $this->officerB->name,
            'status' => 'completed',
        ]);
    }

    private function url(int|string $roundId): string
    {
        return '/api/inspections/'.$roundId.'/supabase-data';
    }

    private function expectNoPrivateRead(): void
    {
        $reader = Mockery::mock(SupabaseService::class);
        $reader->shouldNotReceive('getInspectionWithSignedPhotos');
        $this->app->instance(SupabaseService::class, $reader);
    }

    private function expectOnlyRound(int $roundId): void
    {
        $reader = Mockery::mock(SupabaseService::class);
        $reader->shouldReceive('getInspectionWithSignedPhotos')
            ->once()->with($roundId)->andReturn([
                'local_inspection_id' => $roundId,
                'field_job_photos' => [
                    ['id' => 'synthetic-photo', 'signed_url' => 'https://fictional.invalid/photo'],
                ],
            ]);
        $this->app->instance(SupabaseService::class, $reader);
    }

    public function test_assigned_planning_officer_can_read_exact_round_only(): void
    {
        $this->expectOnlyRound($this->roundA->id);
        $this->actingAs($this->officerA)->getJson($this->url($this->roundA->id))
            ->assertOk()->assertJsonPath('local_inspection_id', $this->roundA->id);
    }

    public function test_unrelated_planning_officer_is_hidden_from_round_and_private_signer(): void
    {
        $this->expectNoPrivateRead();
        $this->actingAs($this->officerB)->getJson($this->url($this->roundA->id))
            ->assertNotFound();
    }

    public function test_original_officer_cannot_read_another_officers_later_round(): void
    {
        $this->expectNoPrivateRead();
        $this->actingAs($this->officerA)->getJson($this->url($this->roundB->id))
            ->assertNotFound();
    }

    public function test_second_officer_can_read_only_the_second_round(): void
    {
        $this->expectOnlyRound($this->roundB->id);
        $this->actingAs($this->officerB)->getJson($this->url($this->roundB->id))
            ->assertOk()->assertJsonPath('local_inspection_id', $this->roundB->id);
    }

    public function test_admin_existing_read_authority_is_preserved(): void
    {
        $this->expectOnlyRound($this->roundB->id);
        $this->actingAs($this->admin)->getJson($this->url($this->roundB->id))
            ->assertOk()->assertJsonPath('local_inspection_id', $this->roundB->id);
    }

    public function test_site_inspector_is_refused_before_private_signer(): void
    {
        $this->expectNoPrivateRead();
        $this->actingAs($this->inspector)->getJson($this->url($this->roundA->id))
            ->assertForbidden();
    }

    public function test_missing_round_cannot_reach_private_signer(): void
    {
        $this->expectNoPrivateRead();
        $this->actingAs($this->officerA)->getJson($this->url(999999999))
            ->assertNotFound();
    }

    public function test_nonpositive_id_retains_existing_validation(): void
    {
        $this->expectNoPrivateRead();
        $this->actingAs($this->officerA)->getJson($this->url(0))
            ->assertStatus(422);
    }

    public function test_unauthenticated_request_cannot_reach_private_signer(): void
    {
        $this->expectNoPrivateRead();
        $this->getJson($this->url($this->roundA->id))->assertUnauthorized();
    }
}
