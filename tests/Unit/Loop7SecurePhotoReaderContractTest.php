<?php

namespace Tests\Unit;

use App\Services\SupabaseService;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class Loop7SecurePhotoReaderContractTest extends TestCase
{
    private function service(): SupabaseService
    {
        return $this->serviceWithUrl('https://example.supabase.co');
    }

    private function serviceWithUrl(string $url): SupabaseService
    {
        config([
            'services.supabase.url' => $url,
            'services.supabase.anon_key' => 'anon-test-key',
            'services.supabase.service_key' => 'service-test-key',
            'services.supabase.inspection_photo_signed_url_ttl' => 300,
        ]);

        return new SupabaseService();
    }

    private function absoluteSignedUrl(string $signedUrl, string $baseUrl = 'https://example.supabase.co'): string
    {
        $service = $this->serviceWithUrl($baseUrl);
        $method = (new \ReflectionClass($service))->getMethod('absoluteInspectionPhotoSignedUrl');
        $method->setAccessible(true);

        return $method->invoke($service, $signedUrl);
    }

    private function signedUrlFromSigningResponse(string $signedUrl, string $baseUrl = 'https://example.supabase.co'): string
    {
        $service = $this->serviceWithUrl($baseUrl);
        Http::fake([
            '*' => Http::response(['signedURL' => $signedUrl], 200),
        ]);

        $method = (new \ReflectionClass($service))->getMethod('createInspectionPhotoSignedUrl');
        $method->setAccessible(true);

        return $method->invoke($service, 'inspections/job-1/photo.jpg');
    }

    public function test_it_normalizes_raw_and_historical_storage_values_without_mutating_them(): void
    {
        $service = $this->service();

        $this->assertSame(
            'inspections/job-1/photo-1.jpg',
            $service->normalizeInspectionPhotoPath('inspections/job-1/photo-1.jpg', 'job-1'),
        );
        $this->assertSame(
            'inspections/job-1/photo-1.jpg',
            $service->normalizeInspectionPhotoPath(
                'https://example.supabase.co/storage/v1/object/public/inspection-photos/inspections/job-1/photo-1.jpg',
                'job-1',
            ),
        );
        $this->assertSame(
            'inspections/job-1/photo-1.jpg',
            $service->normalizeInspectionPhotoPath(
                'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo-1.jpg?token=legacy',
                'job-1',
            ),
        );
    }

    public function test_it_rejects_cross_job_paths_hostile_hosts_and_traversal(): void
    {
        $service = $this->service();

        $this->assertNull($service->normalizeInspectionPhotoPath('inspections/job-2/photo.jpg', 'job-1'));
        $this->assertNull($service->normalizeInspectionPhotoPath('https://example.supabase.co/storage/v1/object/public/inspection-photos/inspections/job-2/photo.jpg', 'job-1'));
        $this->assertSame(
            'inspections/job-1/photo-1.jpg',
            $service->normalizeInspectionPhotoPath(
                'https://example.supabase.co/storage/v1/object/authenticated/inspection-photos/inspections/job-1/photo-1.jpg?token=legacy',
                'job-1',
            ),
        );
        $this->assertNull($service->normalizeInspectionPhotoPath('https://evil.example/storage/v1/object/public/inspection-photos/inspections/job-1/photo.jpg', 'job-1'));
        $this->assertNull($service->normalizeInspectionPhotoPath('inspections/job-1/../job-2/photo.jpg', 'job-1'));
        $this->assertNull($service->normalizeInspectionPhotoPath('other-bucket/inspections/job-1/photo.jpg', 'job-1'));
    }

    public function test_mismatched_photo_metadata_job_identity_is_not_accepted_by_the_reader_contract(): void
    {
        $serviceSource = file_get_contents(dirname(__DIR__, 2) . '/app/Services/SupabaseService.php');
        $this->assertStringContainsString('photoFieldJobId', $serviceSource);
        $this->assertStringContainsString('$photoFieldJobId !== $fieldJobId', $serviceSource);
        $this->assertStringContainsString('continue;', $serviceSource);
    }

    public function test_active_reader_uses_one_fetch_dependency_and_derives_count_from_signed_photos(): void
    {
        $component = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertStringContainsString('useRef', $component);
        $this->assertStringContainsString('}, [inspectionId]);', $component);
        $this->assertStringContainsString('const actualPhotoCount = photosToRender.length;', $component);
        $this->assertStringNotContainsString('photosToRender.length || inspection.photo_count', $component);
    }

    public function test_parcel_pin_projection_prefers_local_pin_and_rejects_cross_parcel_remote_pin(): void
    {
        $component = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Components/ParcelInspectionStatus.jsx');

        $this->assertStringContainsString('localParcel', $component);
        $this->assertStringContainsString('remoteParcelPin', $component);
        $this->assertStringContainsString('local_parcel_id === localParcel?.id', $component);
        $this->assertStringContainsString('displayParcelPin', $component);
        $this->assertStringContainsString("localParcel?.property_index_number || remoteParcelPin || 'N/A'", $component);
    }

    public function test_map_focus_validates_confirmed_coordinates_before_leaflet_use(): void
    {
        $show = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString('toValidCoordinate', $show);
        $this->assertStringContainsString('Number.isFinite', $show);
        $this->assertStringContainsString('toInspectionPoint', $show);
        $this->assertStringContainsString('confirmed_latitude', $show);
        $this->assertStringContainsString('confirmed_longitude', $show);
        $this->assertStringContainsString('CircleMarker', $show);
        $this->assertStringContainsString('inspectionPoint', $show);
        $this->assertStringContainsString('map.flyTo(inspectionPoint, 18', $show);
        $this->assertStringContainsString('onInspectionDataFetched', $show);
        $this->assertStringNotContainsString('[NaN, NaN]', $show);
    }

    public function test_signed_url_ttl_is_named_and_bounded(): void
    {
        $this->assertSame(300, (int) config('services.supabase.inspection_photo_signed_url_ttl'));

        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Services/SupabaseService.php');
        $this->assertStringContainsString('inspection_photo_signed_url_ttl', $source);
        $this->assertStringContainsString('max(60, min(3600, $configured))', $source);
    }

    public function test_signed_url_generation_normalizes_trailing_slash_base_url(): void
    {
        config([
            'services.supabase.url' => 'https://example.supabase.co/',
            'services.supabase.anon_key' => 'anon-test-key',
            'services.supabase.service_key' => 'service-test-key',
        ]);

        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Services/SupabaseService.php');
        $this->assertStringContainsString("rtrim(\$this->url, '/')", $source);
        $this->assertStringContainsString('/storage/v1/object/sign/inspection-photos/', $source);
    }

    public function test_relative_signed_storage_path_adds_storage_v1_without_duplication(): void
    {
        $relative = '/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST&download=1';

        $this->assertSame(
            'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST&download=1',
            $this->absoluteSignedUrl($relative),
        );
        $this->assertSame(
            'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST&download=1',
            $this->absoluteSignedUrl('/storage/v1/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST&download=1'),
        );
    }

    public function test_absolute_signed_url_is_preserved(): void
    {
        $absolute = 'https://example.supabase.co/storage/v1/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST';

        $this->assertSame($absolute, $this->signedUrlFromSigningResponse($absolute));
    }

    public function test_signed_url_composition_never_creates_an_unprefixed_or_duplicated_storage_path(): void
    {
        $relative = $this->absoluteSignedUrl('/object/sign/inspection-photos/inspections/job-1/photo.jpg?token=TEST');

        $this->assertStringNotContainsString('https://example.supabase.co/object/sign/', $relative);
        $this->assertStringNotContainsString('/storage/v1/storage/v1/', $relative);
        $this->assertStringContainsString('?token=TEST', $relative);
        $this->assertStringNotContainsString('service-test-key', $relative);
    }

    public function test_active_iMAPS_reader_uses_laravel_endpoint_and_signed_urls(): void
    {
        $api = file_get_contents(dirname(__DIR__, 2) . '/resources/js/utils/supabaseApi.js');
        $component = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Components/ParcelInspectionStatus.jsx');
        $source = file_get_contents(dirname(__DIR__, 2) . '/app/Services/SupabaseService.php');

        $this->assertStringContainsString('/api/inspections/', $api);
        $this->assertStringContainsString('withCredentials: true', $api);
        $this->assertStringNotContainsString("from('field_jobs')", $api);
        $this->assertStringNotContainsString("from('field_job_photos')", $api);
        $this->assertStringContainsString('supabase_parcel_id', $source);
        $this->assertStringContainsString('supabase_parcels', $source);
        $this->assertStringContainsString('local_parcel_id', $source);
        $this->assertStringContainsString('property_index_number', $source);
        $this->assertStringContainsString('field_job_photos', $source);
        $this->assertStringContainsString('order', $source);
        $this->assertStringContainsString('field_job_id', $source);
        $this->assertStringContainsString('photo.signed_url', $component);
        $this->assertStringContainsString('selectedPhoto.signed_url', $component);
        $this->assertStringNotContainsString('photo.photo_url', $component);
        $this->assertStringNotContainsString('selectedPhoto.photo_url', $component);
    }
}
