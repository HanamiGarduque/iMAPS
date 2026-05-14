<?php

namespace App\Observers;

use App\Models\ApplicationStatusTrack;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ApplicationStatusTrackObserver
{
    public function created(ApplicationStatusTrack $track): void
    {
        $response = Http::withHeaders([
            'apikey'        => config('services.supabase.anon_key'),
            'Authorization' => 'Bearer ' . config('services.supabase.service_key'),
            'Content-Type'  => 'application/json',
            'Prefer'        => 'return=minimal',
        ])->post(config('services.supabase.url') . '/rest/v1/application_status_tracks', [
            'reference_number'      => $track->reference_number,
            'masked_applicant_name' => $track->masked_applicant_name,
            'status'                => $track->status,
            'created_at'            => $track->created_at,
        ]);

        if ($response->failed()) {
            Log::error('Supabase sync failed', [
                'reference_number' => $track->reference_number,
                'status'           => $response->status(),
                'body'             => $response->body(),
            ]);
        }
    }
}














