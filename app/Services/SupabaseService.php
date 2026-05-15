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

    public function insert(string $table, array $data, array $extraHeaders = []): Response
    {
        return Http::withHeaders(
            $this->serviceHeaders(array_merge(['Prefer' => 'return=minimal'], $extraHeaders))
        )->post("{$this->url}/rest/v1/{$table}", $data);
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

    public function clientCredentials(): array
    {
        return [
            'supabaseUrl' => $this->url,
            'supabaseKey' => $this->anonKey,
        ];
    }
}
