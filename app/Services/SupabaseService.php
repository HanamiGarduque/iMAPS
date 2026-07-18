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

    // ── Headers ──────────────────────────────────────────

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

    // ── Generic helpers ───────────────────────────────────

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

    // ── Domain methods ────────────────────────────────────

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
     */
    public function pushZoningApplication(array $payload): ?string
    {
        // Must request 'return=representation' to catch the newly assigned primary key UUID
        $response = $this->insert('supabase_zoning_applications', $payload, [
            'Prefer' => 'return=representation'
        ]);

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
     */
    public function pushParcel(array $payload): bool
    {
        $response = $this->insert('supabase_parcels', $payload);

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
     */
    public function createFieldJob(array $payload): bool
    {
        $response = $this->insert('field_jobs', $payload);

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

    public function clientCredentials(): array
    {
        return [
            'supabaseUrl' => $this->url,
            'supabaseKey' => $this->anonKey,
        ];
    }
}