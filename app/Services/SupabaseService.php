<?php
// app/Services/SupabaseService.php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Http\Client\Response;

class SupabaseService
{
    private string $url;
    private string $anonKey;
    private string $serviceKey;

    public function __construct()
    {
        $this->url        = config('services.supabase.url');
        $this->anonKey    = config('services.supabase.anon_key');
        $this->serviceKey = config('services.supabase.service_key');
    }

    // ── Cross-environment bridge namespace ────────────────────────────────────
    //
    // Every lookup below means "MY environment's row". A bare local integer id
    // is not that, because local ids are only unique inside one iMAPS database
    // and this Supabase project is shared by several of them. Each such lookup
    // therefore resolves the namespace first (fail closed) and filters on it.

    /**
     * This environment's bridge source identity. Fails closed when unset.
     */
    public function bridgeSourceId(): string
    {
        return BridgeSourceIdentity::id();
    }

    /**
     * Namespace the given mirror payload for this environment.
     */
    public function namespaced(array $payload): array
    {
        $payload[BridgeSourceIdentity::COLUMN] = $this->bridgeSourceId();

        return $payload;
    }

    /**
     * PostgREST filters that restrict a row set to this environment.
     */
    public function scopedFilters(array $filters = []): array
    {
        return array_merge(
            [BridgeSourceIdentity::COLUMN => 'eq.' . $this->bridgeSourceId()],
            $filters,
        );
    }

    /**
     * Composite `on_conflict` target for a mirror table's local-id identity.
     */
    public function localIdConflictTarget(string $localColumn): string
    {
        return BridgeSourceIdentity::COLUMN . ',' . $localColumn;
    }

    // â”€â”€ Headers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    private function publicHeaders(): array
    {
        return [
            'apikey'        => $this->anonKey,
            'Authorization' => 'Bearer ' . $this->anonKey,
            'Content-Type'  => 'application/json',
        ];
    }

    private function serviceHeaders(array $extra = []): array
    {
        return array_merge([
            'apikey'        => $this->anonKey,
            'Authorization' => 'Bearer ' . $this->serviceKey,
            'Content-Type'  => 'application/json',
        ], $extra);
    }

    // â”€â”€ Generic helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    /**
     * Insert data into a Supabase table.
     * Allows overriding the 'Prefer' header to get inserted representations back.
     */
    public function insert(string $table, array $data, array $extraHeaders = []): Response
    {
        $headers = array_merge(['Prefer' => 'return=minimal'], $extraHeaders);
        
        return Http::withHeaders($this->serviceHeaders($headers))
            ->post("{$this->url}/rest/v1/{$table}", $data);
    }

    /**
     * Fetch records matching specific PostgREST criteria.
     */
    public function select(string $table, string $query = '*', array $params = []): Response
    {
        return Http::withHeaders($this->serviceHeaders())
            ->get("{$this->url}/rest/v1/{$table}?select={$query}", $params);
    }

    /**
     * Update records matching specific conditions (e.g., column = value).
     */
    public function update(string $table, array $data, string $column, $value): Response
    {
        return Http::withHeaders($this->serviceHeaders(['Prefer' => 'return=representation']))
            ->patch("{$this->url}/rest/v1/{$table}?{$column}=eq.{$value}", $data);
    }

    /**
     * Delete records matching specific conditions.
     */
    public function delete(string $table, string $column, $value): Response
    {
        return Http::withHeaders($this->serviceHeaders())
            ->delete("{$this->url}/rest/v1/{$table}?{$column}=eq.{$value}");
    }

    // â”€â”€ Domain methods â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    public function syncStatusTrack(array $payload): bool
    {
        $response = $this->insert('application_status_tracks', $payload);

        if ($response->failed()) {
            Log::error('Supabase sync failed', [
                'reference_number' => $payload['reference_number'] ?? null,
                'status'           => $response->status(),
                'body'             => $response->body(),
            ]);

            return false;
        }

        return true;
    }

    public function getApplicationByReference(string $ref)
    {
        $response = Http::withHeaders($this->publicHeaders())
            ->get("{$this->url}/rest/v1/zoning_applications", [
                'reference_number' => "eq.$ref",
                'select' => '*'
            ]);

        if ($response->failed()) {
            Log::error('Supabase fetch failed', [
                'reference_number' => $ref,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return null;
        }

        return $response->json()[0] ?? null;
    }

    /**
     * Push full Zoning Application and returns the newly generated Supabase Application UUID.
     *
     * Namespaced: the identity is (bridge_source_id, local_application_id).
     */
    public function pushZoningApplication(array $payload): ?string
    {
        $payload = $this->namespaced($payload);

        $response = $this->upsert(
            'supabase_zoning_applications',
            $payload,
            $this->localIdConflictTarget('local_application_id'),
        );

        if ($response->failed()) {
            Log::error('Failed to push zoning application to Supabase', [
                'local_id' => $payload['local_application_id'] ?? null,
                'status'   => $response->status(),
                'body'     => $response->body(),
            ]);
            return null;
        }

        return $response->json()[0]['id'] ?? null;
    }

    /**
     * Push associated Parcel records to Supabase.
     *
     * Namespaced: the identity is (bridge_source_id, local_parcel_id).
     */
    public function pushParcel(array $payload): bool
    {
        $response = $this->upsert(
            'supabase_parcels',
            $this->namespaced($payload),
            $this->localIdConflictTarget('local_parcel_id'),
        );

        if ($response->failed()) {
            Log::error('Failed to push parcel to Supabase', [
                'local_parcel_id' => $payload['local_parcel_id'] ?? null,
                'status'          => $response->status(),
                'body'            => $response->body(),
            ]);
            return false;
        }

        return true;
    }

    /**
     * Create/Assign a field job in Supabase.
     *
     * Namespaced: the identity is (bridge_source_id, local_inspection_id).
     */
    public function createFieldJob(array $payload): bool
    {
        $response = $this->upsert(
            'field_jobs',
            $this->namespaced($payload),
            $this->localIdConflictTarget('local_inspection_id'),
        );

        if ($response->failed()) {
            Log::error('Failed to create field job in Supabase', [
                'local_inspection_id' => $payload['local_inspection_id'] ?? null,
                'status'              => $response->status(),
                'body'                => $response->body(),
            ]);
            return false;
        }

        return true;
    }

    /**
     * Upsert one mirror row on a composite (bridge_source_id, local_*_id) key.
     *
     * A bare local-id conflict target is deliberately NOT offered: it is the
     * cross-environment collision defect this whole contract exists to close.
     */
    private function upsert(string $table, array $payload, string $onConflict): Response
    {
        return Http::withHeaders($this->serviceHeaders([
            'Prefer' => 'resolution=merge-duplicates,return=representation',
        ]))->post(
            "{$this->url}/rest/v1/{$table}?on_conflict=" . $onConflict,
            $payload,
        );
    }

    /**
     * Resolve the exact remote field job for a local inspection round.
     *
     * Loop 8 uses this as the ONLY way to map a reviewed inspection round to a
     * remote job. It never guesses by application or parcel, because a
     * Planning Review must attach to the exact round that was reviewed.
     *
     * NAMESPACED: `local_inspection_id` alone is not "my round". A second
     * environment holding the same integer must never receive this
     * environment's Planning Review, so the lookup is scoped to this
     * deployment's bridge source identity and fails closed without one.
     */
    public function findFieldJobIdByLocalInspectionId(int $localInspectionId): ?string
    {
        $response = $this->select('field_jobs', 'id', $this->scopedFilters([
            'local_inspection_id' => "eq.{$localInspectionId}",
            'limit'               => 1,
        ]));

        if ($response->failed()) {
            Log::error('Failed to resolve field job for reviewed inspection round', [
                'local_inspection_id' => $localInspectionId,
                'status'              => $response->status(),
                'body'                => $response->body(),
            ]);

            return null;
        }

        $rows = $response->json();

        if (! is_array($rows) || $rows === []) {
            return null;
        }

        $fieldJobId = $rows[0]['id'] ?? null;

        return is_string($fieldJobId) && $fieldJobId !== '' ? $fieldJobId : null;
    }

    /**
     * Read the REMOTE lifecycle state of one or more field jobs.
     *
     * This is the authority for "has this round actually been started in the
     * field?", because local iMAPS state CANNOT answer it. Local
     * `site_inspections.status` has no in-progress value, so a round that
     * FieldSync reports as in progress still reads locally as "assigned".
     * Reassigning an inspector on that false premise would hand a half-finished
     * job to somebody else while the previous inspector's phone keeps a working
     * offline copy.
     *
     * Returns a map keyed by local_inspection_id. An id that is absent from the
     * result was NOT proven unstarted, and every caller must treat absence as a
     * refusal rather than as permission.
     *
     * @param  array<int, int>  $localInspectionIds
     * @return array<int, array<string, mixed>>
     */
    public function fieldJobTransferStates(array $localInspectionIds): array
    {
        $ids = array_values(array_unique(array_filter(
            array_map('intval', $localInspectionIds),
            static fn (int $id): bool => $id > 0
        )));

        if ($ids === []) {
            return [];
        }

        $response = $this->select(
            'field_jobs',
            'local_inspection_id,status,gps_confirmed_at,checklist_completed_count,photo_count',
            $this->scopedFilters([
                'local_inspection_id' => 'in.(' . implode(',', $ids) . ')',
                'limit'               => (string) count($ids),
            ])
        );

        if ($response->failed()) {
            Log::error('Failed to read FieldSync job state for reassignment guard', [
                'local_inspection_ids' => $ids,
                'status'               => $response->status(),
                'body'                 => $response->body(),
            ]);

            return [];
        }

        $rows = $response->json();

        if (! is_array($rows)) {
            return [];
        }

        $states = [];

        foreach ($rows as $row) {
            $localId = $row['local_inspection_id'] ?? null;

            if ($localId === null) {
                continue;
            }

            $states[(int) $localId] = [
                'status'                   => $row['status'] ?? null,
                'gps_confirmed_at'         => $row['gps_confirmed_at'] ?? null,
                'checklist_completed_count' => $row['checklist_completed_count'] ?? 0,
                'photo_count'              => $row['photo_count'] ?? 0,
            ];
        }

        return $states;
    }

    /**
     * Upsert one read-only Planning Review record for a reviewed inspection round.
     *
     * Loop 8 contract:
     *  - `field_job_id` is the exact reviewed round's remote job, never the new
     *    round created by a reinspection decision;
     *  - this writes ONLY `field_job_reviews`. It never touches field_jobs
     *    status, current_step, progress, completed state or photo evidence;
     *  - the conflict target is NAMESPACED, so re-running a review transport
     *    converges on one row per (environment, review) instead of
     *    duplicating - and two environments holding the same local
     *    `technical_review_id` cannot overwrite each other's review. A bare
     *    `on_conflict=technical_review_id` is the same collision defect as the
     *    job mirror: `technical_review_id` is an iMAPS-local integer.
     */
    public function upsertFieldJobReview(array $payload): bool
    {
        $response = Http::withHeaders($this->serviceHeaders([
            'Prefer' => 'resolution=merge-duplicates,return=minimal',
        ]))
            ->post(
                "{$this->url}/rest/v1/field_job_reviews?on_conflict=" . $this->localIdConflictTarget('technical_review_id'),
                $this->namespaced($payload)
            );

        if ($response->failed()) {
            Log::error('Failed to upsert planning review metadata', [
                'technical_review_id'        => $payload['technical_review_id'] ?? null,
                'reviewed_site_inspection_id' => $payload['reviewed_site_inspection_id'] ?? null,
                'field_job_id'               => $payload['field_job_id'] ?? null,
                'status'                     => $response->status(),
                'body'                       => $response->body(),
            ]);

            return false;
        }

        return true;
    }

    /**
     * Fetch one FieldSync inspection by local inspection id and attach
     * short-lived private Storage URLs to its photo metadata.
     *
     * The durable identity returned to iMAPS is `photo_path`; the generated
     * `signed_url` is intentionally transient and is never written back to
     * field_job_photos. A malformed or cross-job path is omitted rather than
     * exposed or signed.
     *
     * NAMESPACED: the job is resolved as (bridge_source_id,
     * local_inspection_id). Without the namespace this endpoint can display
     * ANOTHER environment's inspection, checklist, findings and signed photos
     * to a Planning Officer, which is a confidentiality defect as well as a
     * correlation defect.
     *
     * @throws \RuntimeException when the inspection or one of its signed URLs
     *                           cannot be read from Supabase.
     */
    public function getInspectionWithSignedPhotos(int $localInspectionId): ?array
    {
        if (!$this->url || !$this->serviceKey) {
            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        // Fail closed before any remote read: an unconfigured deployment must
        // not fall back to an unscoped lookup.
        $bridgeSourceId = $this->bridgeSourceId();

        $response = $this->select(
            'field_jobs',
            'id,local_inspection_id,supabase_parcel_id,status,scheduled_date,deadline_date,submitted_at,inspection_result,is_compliant,findings,observations,discrepancies,recommendations,inspector_notes,checklist_completed_count,checklist_total_count,checklist_data,photo_count,confirmed_latitude,confirmed_longitude,gps_accuracy_m,gps_confirmed_at',
            [
                BridgeSourceIdentity::COLUMN => "eq.{$bridgeSourceId}",
                'local_inspection_id' => "eq.{$localInspectionId}",
                'limit' => 1,
            ],
        );

        if ($response->failed()) {
            Log::warning('Supabase inspection photo reader fetch failed', [
                'local_inspection_id' => $localInspectionId,
                'status' => $response->status(),
            ]);

            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        $rows = $response->json();
        if (!is_array($rows) || $rows === []) {
            return null;
        }

        $inspection = $rows[0] ?? null;
        if (!is_array($inspection)) {
            return null;
        }

        $fieldJobId = is_string($inspection['id'] ?? null) ? $inspection['id'] : null;
        if ($fieldJobId === null || $fieldJobId === '') {
            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        $supabaseParcelId = is_string($inspection['supabase_parcel_id'] ?? null)
            ? $inspection['supabase_parcel_id']
            : null;
        $inspection['supabase_parcels'] = null;

        if ($supabaseParcelId !== null && $supabaseParcelId !== '') {
            $parcelResponse = $this->select(
                'supabase_parcels',
                'id,local_parcel_id,property_index_number,latitude,longitude',
                [
                    'id' => "eq.{$supabaseParcelId}",
                    'limit' => 1,
                ],
            );

            if ($parcelResponse->failed()) {
                Log::warning('Supabase inspection parcel context fetch failed', [
                    'field_job_id' => $fieldJobId,
                    'status' => $parcelResponse->status(),
                ]);
            } else {
                $parcelRows = is_array($parcelResponse->json()) ? $parcelResponse->json() : [];
                $inspection['supabase_parcels'] = $parcelRows[0] ?? null;
            }
        }

        // Fetch photo metadata as an exact second read. The live PostgREST
        // response can omit the nested relation even when the rows exist.
        $photoResponse = $this->select(
            'field_job_photos',
            'id,field_job_id,photo_url,notes,latitude,longitude,captured_at',
            [
                'field_job_id' => "eq.{$fieldJobId}",
                'order' => 'created_at.asc',
            ],
        );

        if ($photoResponse->failed()) {
            Log::warning('Supabase inspection photo metadata fetch failed', [
                'field_job_id' => $fieldJobId,
                'status' => $photoResponse->status(),
            ]);

            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        $photoRows = is_array($photoResponse->json()) ? $photoResponse->json() : [];

        $photos = [];

        foreach ($photoRows as $photo) {
            if (!is_array($photo)) {
                continue;
            }

            $storedValue = is_string($photo['photo_url'] ?? null) ? $photo['photo_url'] : null;
            $fieldJobId = is_string($inspection['id'] ?? null) ? $inspection['id'] : null;
            $photoFieldJobId = is_string($photo['field_job_id'] ?? null) ? $photo['field_job_id'] : null;
            if ($photoFieldJobId !== null && $photoFieldJobId !== $fieldJobId) {
                continue;
            }

            $photoPath = $this->normalizeInspectionPhotoPath($storedValue, $fieldJobId);
            if ($photoPath === null) {
                continue;
            }

            $photos[] = [
                'id' => $photo['id'] ?? null,
                'field_job_id' => $photo['field_job_id'] ?? null,
                'notes' => $photo['notes'] ?? null,
                'latitude' => $photo['latitude'] ?? null,
                'longitude' => $photo['longitude'] ?? null,
                'captured_at' => $photo['captured_at'] ?? null,
                'photo_path' => $photoPath,
                'signed_url' => $photoPath ? $this->createInspectionPhotoSignedUrl($photoPath) : null,
            ];
        }

        $inspection['field_job_photos'] = $photos;
        // Do not expose legacy raw paths or stored public URLs to the browser.
        unset($inspection['photo_paths'], $inspection['photo_url']);

        return $inspection;
    }

    /**
     * Normalize current raw paths and historical Supabase Storage URLs to a
     * bucket-relative object path. The path is accepted for a new signed URL,
     * but is never trusted as an authorization mechanism.
     */
    public function normalizeInspectionPhotoPath(?string $storedValue, ?string $expectedFieldJobId = null): ?string
    {
        if ($storedValue === null) {
            return null;
        }

        $value = trim($storedValue);
        if ($value === '' || str_contains($value, "\0") || str_contains($value, '\\')) {
            return null;
        }

        if (preg_match('/^[a-z][a-z0-9+.-]*:\/\//i', $value)) {
            $parsed = parse_url($value);
            if ($parsed === false || empty($parsed['path'])) {
                return null;
            }

            $configuredHost = parse_url((string) $this->url, PHP_URL_HOST);
            $storedHost = $parsed['host'] ?? null;
            if (!is_string($configuredHost) || !is_string($storedHost) || strcasecmp($configuredHost, $storedHost) !== 0) {
                return null;
            }

            $path = $parsed['path'];
        } else {
            $path = $value;
        }

        $path = rawurldecode($path);
        $bucketMarker = '/inspection-photos/';

        if (str_starts_with($path, 'inspection-photos/')) {
            $path = substr($path, strlen('inspection-photos/'));
        } elseif (str_contains($path, $bucketMarker)) {
            $path = substr($path, strpos($path, $bucketMarker) + strlen($bucketMarker));
        } elseif (!str_starts_with($path, 'inspections/')) {
            return null;
        }

        $path = ltrim($path, '/');
        if (!str_starts_with($path, 'inspections/')) {
            return null;
        }

        foreach (explode('/', $path) as $segment) {
            if ($segment === '' || $segment === '.' || $segment === '..') {
                return null;
            }
        }

        if ($expectedFieldJobId !== null && !str_starts_with($path, "inspections/{$expectedFieldJobId}/")) {
            return null;
        }

        return $path;
    }

    private function createInspectionPhotoSignedUrl(string $photoPath): string
    {
        $encodedPath = implode('/', array_map('rawurlencode', explode('/', $photoPath)));
        $response = Http::withHeaders($this->serviceHeaders())
            ->post(rtrim($this->url, '/')."/storage/v1/object/sign/inspection-photos/{$encodedPath}", [
                'expiresIn' => $this->inspectionPhotoSignedUrlTtl(),
            ]);

        if ($response->failed()) {
            Log::warning('Supabase inspection photo signed URL failed', [
                'status' => $response->status(),
            ]);

            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        $payload = $response->json();
        $signedUrl = $payload['signedURL'] ?? $payload['signedUrl'] ?? $payload['signed_url'] ?? null;
        if (!is_string($signedUrl) || $signedUrl === '') {
            throw new \RuntimeException('Inspection evidence is temporarily unavailable.');
        }

        if (str_starts_with($signedUrl, '/')) {
            return $this->absoluteInspectionPhotoSignedUrl($signedUrl);
        }

        return $signedUrl;
    }

    private function absoluteInspectionPhotoSignedUrl(string $signedUrl): string
    {
        $baseUrl = rtrim($this->url, '/');

        if (str_starts_with($signedUrl, '/object/sign/')) {
            return $baseUrl . '/storage/v1' . $signedUrl;
        }

        return $baseUrl . $signedUrl;
    }

    private function inspectionPhotoSignedUrlTtl(): int
    {
        $configured = (int) config('services.supabase.inspection_photo_signed_url_ttl', 300);

        return max(60, min(3600, $configured));
    }

    public function clientCredentials(): array
    {
        return [
            'supabaseUrl' => $this->url,
            'supabaseKey' => $this->anonKey,
        ];
    }
}
