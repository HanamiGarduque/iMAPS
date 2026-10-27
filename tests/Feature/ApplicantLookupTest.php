<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The encode form offers a returning applicant's or corporation's details for
 * auto-fill, taken from their latest application, and can start from one of
 * their previous applications with its lots.
 */
class ApplicantLookupTest extends TestCase
{
    use RefreshDatabase;

    private User $po;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();

        $this->po = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);
    }

    public function test_applicant_lookup_returns_the_latest_address_and_representative(): void
    {
        ZoningApplication::factory()->create([
            'applicant_name' => 'Juan Reyes',
            'contact_number' => '09171234567',
            'applicant_street' => 'Old Street',
            'created_at' => now()->subYear(),
        ]);
        ZoningApplication::factory()->create([
            'applicant_name' => 'Juan Reyes',
            'contact_number' => '09171234567',
            'applicant_street' => '123 Main St.',
            'applicant_barangay' => 'Alupay',
            'representative_name' => 'Maria Cruz',
            'representative_contact' => '09181234567',
            'representative_address' => 'Poblacion A',
        ]);

        $rows = $this->actingAs($this->po)
            ->getJson('/applications/applicant-lookup?q=reyes')
            ->assertOk()
            ->json();

        $this->assertCount(1, $rows);
        $this->assertSame('123 Main St.', $rows[0]['applicant_street']);
        $this->assertSame('Alupay', $rows[0]['applicant_barangay']);
        $this->assertSame('Maria Cruz', $rows[0]['representative_name']);
        $this->assertSame('09181234567', $rows[0]['representative_contact']);
        $this->assertSame('Poblacion A', $rows[0]['representative_address']);
    }

    public function test_corporation_lookup_returns_each_corporation_once_with_its_latest_details(): void
    {
        ZoningApplication::factory()->create([
            'corporation_name' => 'Rosario Realty Corp.',
            'corporation_address' => 'Old Office',
            'created_at' => now()->subYear(),
        ]);
        ZoningApplication::factory()->create([
            'corporation_name' => 'Rosario Realty Corp.',
            'corporation_contact' => '0437741234',
            'corporation_address' => 'Poblacion B, Rosario',
        ]);
        ZoningApplication::factory()->create(['corporation_name' => 'Other Holdings Inc.']);

        $rows = $this->actingAs($this->po)
            ->getJson('/applications/corporation-lookup?q=realty')
            ->assertOk()
            ->json();

        $this->assertSame([[
            'corporation_name' => 'Rosario Realty Corp.',
            'corporation_contact' => '0437741234',
            'corporation_address' => 'Poblacion B, Rosario',
        ]], $rows);
    }

    public function test_corporation_lookup_needs_three_characters(): void
    {
        ZoningApplication::factory()->create(['corporation_name' => 'Rosario Realty Corp.']);

        $this->actingAs($this->po)
            ->getJson('/applications/corporation-lookup?q=ro')
            ->assertOk()
            ->assertExactJson([]);
    }

    public function test_previous_records_return_each_application_with_its_lots(): void
    {
        $older = ZoningApplication::factory()->create([
            'applicant_name' => 'Ana Santos',
            'corporation_name' => 'Rosario Realty Corp.',
            'created_at' => now()->subYear(),
        ]);
        Parcel::factory()->create([
            'zoning_application_id' => $older->id,
            'parcel_code' => 'P-01',
            'property_index_number' => '041-23-0001',
            'lot_number' => '12',
        ]);
        $latest = ZoningApplication::factory()->create(['applicant_name' => 'Ana Santos']);
        Parcel::factory()->create(['zoning_application_id' => $latest->id, 'parcel_code' => 'P-02', 'property_index_number' => '041-23-0003']);
        Parcel::factory()->create(['zoning_application_id' => $latest->id, 'parcel_code' => 'P-01', 'property_index_number' => '041-23-0002']);
        ZoningApplication::factory()->create(['applicant_name' => 'Someone Else']);

        $rows = $this->actingAs($this->po)
            ->getJson('/applications/previous-records?q=santos')
            ->assertOk()
            ->json();

        $this->assertSame([$latest->id, $older->id], array_column($rows, 'id'));
        $this->assertSame(['041-23-0002', '041-23-0003'], array_column($rows[0]['parcels'], 'property_index_number'));
        $this->assertSame('Rosario Realty Corp.', $rows[1]['corporation_name']);
        $this->assertSame('12', $rows[1]['parcels'][0]['lot_number']);
    }

    public function test_previous_records_match_a_corporation_name(): void
    {
        $application = ZoningApplication::factory()->create(['applicant_name' => 'Ana Santos', 'corporation_name' => 'Rosario Realty Corp.']);

        $this->actingAs($this->po)
            ->getJson('/applications/previous-records?q=realty')
            ->assertOk()
            ->assertJsonPath('0.id', $application->id)
            ->assertJsonPath('0.applicant_name', 'Ana Santos');
    }

    public function test_previous_records_are_planning_officer_only(): void
    {
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->actingAs($admin)
            ->getJson('/applications/previous-records?q=santos')
            ->assertForbidden();
    }

    public function test_corporation_lookup_is_planning_officer_only(): void
    {
        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);

        $this->actingAs($admin)
            ->getJson('/applications/corporation-lookup?q=realty')
            ->assertForbidden();
    }
}
