<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Admin/PO priority closure — HTTP-level feature coverage.
 *
 * Complements AdminPoPriorityClosureContractTest, which asserts the same rules
 * against the runtime route table and the source. This suite exercises the
 * actual request/response path so the behaviour is proven end to end where a
 * database is available.
 *
 * ENVIRONMENT NOTE (reported exactly, never faked green): this suite uses
 * RefreshDatabase against sqlite :memory: per phpunit.xml. The local PHP build
 * exposes pdo_pgsql but NOT pdo_sqlite, so on this machine the suite cannot
 * execute. That limitation is a property of the environment, not of the tests;
 * it is not worked around, and no result is reported for it here.
 *
 * Guards: HTTP and the queue are faked so no test can reach Supabase, FieldSync,
 * or any external service. Vite is disabled because frontend asset builds are
 * irrelevant to these contracts.
 */
class AdminPoPriorityClosureTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();
    }

    private function makeUser(string $role): User
    {
        return User::factory()->create(['role' => $role]);
    }

    /** Inertia props as the browser receives them. */
    private function props($response): array
    {
        return $response->viewData('page')['props'];
    }

    private function makeApplication(): ZoningApplication
    {
        return ZoningApplication::factory()->create([
            'status' => 'Technical Review',
            'reference_number' => 'APP-2026-90001',
        ]);
    }

    // ── Test 2: the Planning Officer can actually reach the queue ──

    // ── Test 6: an unknown application id is an ordinary 404 ──

    public function test_unknown_application_returns_404_instead_of_a_sample_dossier(): void
    {
        $po = $this->makeUser('Planning Officer');

        $this->actingAs($po)->get('/applications/999999')->assertNotFound();
    }

    // ── Test 11: the detail page exposes the inspector's name ──

    public function test_application_detail_includes_the_inspector_name(): void
    {
        $po = $this->makeUser('Planning Officer');
        $inspector = $this->makeUser('Site Inspector');
        $application = $this->makeApplication();
        $parcel = Parcel::factory()->create(['zoning_application_id' => $application->id]);

        SiteInspection::factory()->create([
            'zoning_application_id' => $application->id,
            'parcel_id' => $parcel->id,
            'inspector_id' => $inspector->id,
            'status' => 'assigned',
        ]);

        $response = $this->actingAs($po)->get("/applications/{$application->id}")->assertOk();

        $parcels = $this->props($response)['parcels'];
        $this->assertSame(
            $inspector->name,
            $parcels[0]['site_inspection']['inspector']['name'],
            'The detail payload must carry the human-readable inspector name.'
        );
    }

    // ── Test 9: the list summary uses only locally provable state ──

    public function test_application_list_carries_a_local_only_inspection_summary(): void
    {
        $po = $this->makeUser('Planning Officer');
        $inspector = $this->makeUser('Site Inspector');
        $application = $this->makeApplication();
        $parcel = Parcel::factory()->create(['zoning_application_id' => $application->id]);

        SiteInspection::factory()->create([
            'zoning_application_id' => $application->id,
            'parcel_id' => $parcel->id,
            'inspector_id' => $inspector->id,
            'status' => 'assigned',
        ]);

        $response = $this->actingAs($po)->get('/applications')->assertOk();
        $row = collect($this->props($response)['applications']['data'])->firstWhere('id', $application->id);

        $this->assertNotNull($row);
        $this->assertStringContainsString($inspector->name, (string) $row['inspection_summary']);
        $this->assertStringNotContainsStringIgnoringCase('ongoing', (string) $row['inspection_summary']);
        $this->assertStringNotContainsStringIgnoringCase('in progress', (string) $row['inspection_summary']);
    }

    public function test_application_without_inspection_has_no_summary_line(): void
    {
        $po = $this->makeUser('Planning Officer');
        $application = $this->makeApplication();
        Parcel::factory()->create(['zoning_application_id' => $application->id]);

        $response = $this->actingAs($po)->get('/applications')->assertOk();
        $row = collect($this->props($response)['applications']['data'])->firstWhere('id', $application->id);

        $this->assertNull($row['inspection_summary']);
    }

    public function test_reinspection_round_is_reported_with_its_round_number(): void
    {
        $po = $this->makeUser('Planning Officer');
        $inspector = $this->makeUser('Site Inspector');
        $application = $this->makeApplication();
        $parcel = Parcel::factory()->create(['zoning_application_id' => $application->id]);

        // Round 1 completed, round 2 a new reinspection task: two separate rows.
        SiteInspection::factory()->create([
            'zoning_application_id' => $application->id, 'parcel_id' => $parcel->id,
            'inspector_id' => $inspector->id, 'status' => 'completed',
        ]);
        SiteInspection::factory()->create([
            'zoning_application_id' => $application->id, 'parcel_id' => $parcel->id,
            'inspector_id' => $inspector->id, 'status' => 'assigned',
        ]);

        $response = $this->actingAs($po)->get('/applications')->assertOk();
        $row = collect($this->props($response)['applications']['data'])->firstWhere('id', $application->id);

        $this->assertStringContainsString('Reinspection (Round 2)', (string) $row['inspection_summary']);
        $this->assertStringContainsString($inspector->name, (string) $row['inspection_summary']);
    }

    // ── Tests 14 + 15 + 16: report endpoint authorization over HTTP ──

    public function test_guest_cannot_generate_reports(): void
    {
        $this->post('/api/analytics/report/preview', [])->assertRedirect();
        $this->post('/api/analytics/report', [])->assertRedirect();
    }

    public function test_planning_officer_is_allowed_to_generate_reports(): void
    {
        $po = $this->makeUser('Planning Officer');
        $this->makeApplication();

        // Same access as Admin: the page and the preview both reach the controller.
        $this->actingAs($po)->get('/reports')->assertOk();
        $this->actingAs($po)->post('/api/analytics/report/preview', [])->assertOk();
    }

    public function test_admin_is_allowed_to_generate_reports(): void
    {
        $admin = $this->makeUser('Admin');
        $this->makeApplication();

        // Every field on these endpoints is nullable, so an Admin request is
        // authorized AND valid: it must reach the controller and succeed. The
        // only data it can return is this in-memory test database's own fixture.
        $this->actingAs($admin)->post('/api/analytics/report/preview', [])->assertOk();
    }
}
