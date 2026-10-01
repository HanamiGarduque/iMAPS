<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class Loop7SecurePhotoReaderTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();

        config([
            'services.supabase.url' => 'https://example.supabase.co',
            'services.supabase.anon_key' => 'anon-test-key',
            'services.supabase.service_key' => 'service-test-key',
            'services.supabase.inspection_photo_signed_url_ttl' => 300,
            // The reader resolves its job by (bridge_source_id,
            // local_inspection_id) and FAILS CLOSED without a configured
            // namespace, so an unconfigured deployment cannot fall back to an
            // unscoped lookup that could return another environment's job.
            'bridge.source_id' => 'imaps-test-namespace',
        ]);
    }

    private function fakeInspection(array $photos, ?array $parcel = null): void
    {
        $job = [
            'id' => 'job-1',
            'local_inspection_id' => 36,
            'status' => 'completed',
            'inspection_result' => 'Compliant',
        ];
        if ($parcel !== null) {
            $job['supabase_parcel_id'] = 'parcel-uuid-1';
        }

        Http::fake([
            'https://example.supabase.co/rest/v1/field_jobs*' => Http::response([$job], 200),
            'https://example.supabase.co/rest/v1/supabase_parcels*' => Http::response(
                $parcel === null ? [] : [$parcel],
                200,
            ),
            'https://example.supabase.co/rest/v1/field_job_photos*' => Http::response($photos, 200),
            'https://example.supabase.co/storage/v1/object/sign/*' => Http::response([
                'signedURL' => 'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo-1.jpg?token=short-lived',
            ], 200),
        ]);
    }

    public function test_admin_can_read_signed_private_photo_evidence(): void
    {
        $this->fakeInspection([[
            'id' => 'photo-1',
            'field_job_id' => 'job-1',
            'photo_url' => 'https://example.supabase.co/storage/v1/object/public/inspection-photos/inspections/job-1/photo-1.jpg',
            'notes' => 'Loop 7 reader test note',
            'latitude' => 13.8,
            'longitude' => 121.2,
            'captured_at' => '2026-09-25T00:00:00Z',
        ]]);

        $response = $this->actingAs($this->user('Admin'))->get('/api/inspections/36/supabase-data');

        $response->assertOk()
            ->assertJsonPath('field_job_photos.0.id', 'photo-1')
            ->assertJsonPath('field_job_photos.0.field_job_id', 'job-1')
            ->assertJsonPath('field_job_photos.0.notes', 'Loop 7 reader test note')
            ->assertJsonPath('field_job_photos.0.photo_path', 'inspections/job-1/photo-1.jpg')
            ->assertJsonPath('field_job_photos.0.signed_url', 'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo-1.jpg?token=short-lived');

        $body = $response->getContent();
        $this->assertStringNotContainsString('service-test-key', $body);
        $this->assertStringNotContainsString('photo_url', $body);
    }

    public function test_authorized_inspection_response_includes_matching_remote_parcel_pin_context(): void
    {
        $this->fakeInspection([], [
            'id' => 'parcel-uuid-1',
            'local_parcel_id' => 26,
            'property_index_number' => '041021-008-02-006-0750',
            'latitude' => 13.956744,
            'longitude' => 121.163356,
        ]);

        $this->actingAs($this->user('Planning Officer'))
            ->get('/api/inspections/36/supabase-data')
            ->assertOk()
            ->assertJsonPath('supabase_parcels.local_parcel_id', 26)
            ->assertJsonPath('supabase_parcels.property_index_number', '041021-008-02-006-0750')
            ->assertJsonPath('supabase_parcels.latitude', 13.956744)
            ->assertJsonPath('supabase_parcels.longitude', 121.163356);
    }

    public function test_four_metadata_rows_produce_four_signed_photo_entries(): void
    {
        $photos = [];
        for ($index = 1; $index <= 4; $index++) {
            $photos[] = [
                'id' => "photo-{$index}",
                'field_job_id' => 'job-1',
                'photo_url' => "inspections/job-1/photo-{$index}.jpg",
                'notes' => null,
                'latitude' => 13.8,
                'longitude' => 121.2,
                'captured_at' => '2026-09-25T00:00:00Z',
            ];
        }
        $this->fakeInspection($photos);

        $response = $this->actingAs($this->user('Planning Officer'))
            ->get('/api/inspections/36/supabase-data');

        $response->assertOk()
            ->assertJsonCount(4, 'field_job_photos')
            ->assertJsonPath('field_job_photos.0.photo_path', 'inspections/job-1/photo-1.jpg')
            ->assertJsonPath('field_job_photos.3.photo_path', 'inspections/job-1/photo-4.jpg');
    }

    public function test_planning_officer_can_read_the_same_authorized_photo_endpoint(): void
    {
        $this->fakeInspection([[
            'id' => 'photo-1',
            'field_job_id' => 'job-1',
            'photo_url' => 'https://example.supabase.co/storage/v1/object/public/inspection-photos/inspections/job-1/photo-1.jpg',
            'notes' => 'Loop 7 reader test note',
            'latitude' => 13.8,
            'longitude' => 121.2,
            'captured_at' => '2026-09-25T00:00:00Z',
        ]]);

        $this->actingAs($this->user('Planning Officer'))
            ->get('/api/inspections/36/supabase-data')
            ->assertOk()
            ->assertJsonPath('field_job_photos.0.signed_url', 'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo-1.jpg?token=short-lived');
    }

    public function test_site_inspector_and_guest_are_denied_before_the_reader_runs(): void
    {
        $this->actingAs($this->user('Site Inspector'))
            ->get('/api/inspections/36/supabase-data')
            ->assertForbidden();

        $this->post('/logout');
        $this->get('/api/inspections/36/supabase-data')->assertRedirect(route('login'));
    }

    public function test_mismatched_metadata_job_is_not_returned_as_authorized_evidence(): void
    {
        $this->fakeInspection([[
            'id' => 'photo-from-other-job',
            'field_job_id' => 'job-2',
            'photo_url' => 'https://example.supabase.co/storage/v1/object/public/inspection-photos/inspections/job-1/photo-1.jpg',
            'notes' => 'must not be returned',
        ]]);

        $this->actingAs($this->user('Admin'))
            ->get('/api/inspections/36/supabase-data')
            ->assertOk()
            ->assertJsonPath('field_job_photos', []);
    }

    public function test_no_photo_state_returns_a_valid_empty_photo_list(): void
    {
        $this->fakeInspection([]);

        $this->actingAs($this->user('Admin'))
            ->get('/api/inspections/36/supabase-data')
            ->assertOk()
            ->assertJsonPath('field_job_photos', []);
    }

    public function test_the_job_read_is_scoped_to_this_environments_bridge_namespace(): void
    {
        $this->fakeInspection([]);

        $this->actingAs($this->user('Admin'))
            ->get('/api/inspections/36/supabase-data')
            ->assertOk();

        $jobRead = Http::recorded()
            ->filter(fn ($pair) => str_contains($pair[0]->url(), '/rest/v1/field_jobs'))
            ->first();

        $this->assertNotNull($jobRead, 'The reader must read field_jobs.');

        parse_str((string) parse_url($jobRead[0]->url(), PHP_URL_QUERY), $query);

        $this->assertSame(
            'eq.imaps-test-namespace',
            $query['bridge_source_id'] ?? null,
            'A bare local_inspection_id lookup could return another environment\'s job and its signed photos.',
        );
        $this->assertSame('eq.36', $query['local_inspection_id'] ?? null);
    }

    public function test_an_unconfigured_namespace_refuses_the_read_instead_of_scanning_unscoped(): void
    {
        config(['bridge.source_id' => null]);
        $this->fakeInspection([]);

        $this->actingAs($this->user('Admin'))
            ->get('/api/inspections/36/supabase-data')
            ->assertStatus(503);

        Http::assertNothingSent();
    }

    private function user(string $role): User
    {
        $user = new User();
        $user->forceFill([
            'id' => $role === 'Admin' ? 1001 : ($role === 'Planning Officer' ? 1002 : 1003),
            'name' => "Loop 7 {$role}",
            'email' => strtolower(str_replace(' ', '.', $role)) . '@example.test',
            'role' => $role,
        ]);

        return $user;
    }
}
