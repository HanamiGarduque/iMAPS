<?php

namespace App\Jobs;

use App\Models\SiteInspection;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PushInspectionToSupabase implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $inspection;

    /**
     * Create a new job instance.
     */
    public function __construct(SiteInspection $inspection)
    {
        $this->inspection = $inspection;
    }

    /**
     * Execute the job.
     */
    public function handle(): void
    {
        // 1. Eager load the required relationships
        $this->inspection->load(['zoningApplication', 'zoningApplication.parcels' => function($query) {
            $query->where('id', $this->inspection->parcel_id);
        }]);

        $application = $this->inspection->zoningApplication;
        $parcel = $application->parcels->first();

        // 2. Setup Supabase API Config
        // Fallback to env() directly if config() is cached incorrectly
        $supabaseUrl = config('services.supabase.url') ?? env('SUPABASE_URL');
        $supabaseKey = config('services.supabase.key') ?? env('SUPABASE_SERVICE_KEY');

        // Fail loudly if keys are missing so the worker logs a helpful error
        if (empty($supabaseUrl) || empty($supabaseKey)) {
            throw new \Exception("Supabase credentials are missing. Check your .env file and run 'php artisan config:clear'.");
        }

        // We use 'Prefer: return=representation, resolution=merge-duplicates' to perform an UPSERT
        $http = Http::withHeaders([
            'apikey'        => $supabaseKey,
            'Authorization' => 'Bearer ' . $supabaseKey,
            'Content-Type'  => 'application/json',
            'Prefer'        => 'return=representation, resolution=merge-duplicates',
        ]);

        try {
            // ==========================================
            // 3. Push to supabase_zoning_applications
            // ==========================================
            // ADDED: ?on_conflict=local_application_id
            $appResponse = $http->post("{$supabaseUrl}/rest/v1/supabase_zoning_applications?on_conflict=local_application_id", [
                'local_application_id' => $application->id,
                'reference_number'     => $application->reference_number,
                'application_type'     => $application->application_type,
                'land_use_class'       => $application->land_use_class,
                'applicant_name'       => $application->applicant_name,
                'representative_name'  => $application->representative_name,
                'contact_number'       => $application->contact_number,
                'email'                => $application->email,
                'purpose'              => $application->purpose,
                'barangay'             => $application->barangay,
            ]);
            
            if (!$appResponse->successful()) throw new \Exception("App Sync Failed: " . $appResponse->body());
            $supabaseAppId = $appResponse->json()[0]['id'];

            // ==========================================
            // 4. Push to supabase_parcels
            // ==========================================
            $geom = ($parcel->longitude && $parcel->latitude) 
                ? "POINT({$parcel->longitude} {$parcel->latitude})" 
                : null; 

            // ADDED: ?on_conflict=local_parcel_id
            $parcelResponse = $http->post("{$supabaseUrl}/rest/v1/supabase_parcels?on_conflict=local_parcel_id", [
                'local_parcel_id'         => $parcel->id,
                'supabase_application_id' => $supabaseAppId,
                'parcel_code'             => $parcel->parcel_code,
                'location_address'        => $parcel->location_address,
                'barangay'                => $parcel->barangay,
                'owner_name'              => $parcel->owner_name,
                'lot_number'              => $parcel->lot_number,
                'tct_number'              => $parcel->tct_number,
                'tax_dec_number'          => $parcel->tax_dec_number,
                'lot_area_sqm'            => $parcel->lot_area_sqm,
                'land_use_class'          => $parcel->land_use_class,
                'property_index_number'   => $parcel->property_index_number,
                'arp_number'              => $parcel->arp_number,
                'survey_number'           => $parcel->survey_number,
                'latitude'                => $parcel->latitude,
                'longitude'               => $parcel->longitude,
                'geom'                    => $geom,
            ]);

            if (!$parcelResponse->successful()) throw new \Exception("Parcel Sync Failed: " . $parcelResponse->body());
            $supabaseParcelId = $parcelResponse->json()[0]['id'];

            // ==========================================
            // 5. Push to field_jobs
            // ==========================================
            // ADDED: ?on_conflict=local_inspection_id
            $jobResponse = $http->post("{$supabaseUrl}/rest/v1/field_jobs?on_conflict=local_inspection_id", [
                'local_inspection_id'     => $this->inspection->id,
                'supabase_application_id' => $supabaseAppId,
                'supabase_parcel_id'      => $supabaseParcelId,
                'status'                  => 'Pending',
                'scheduled_date'          => $this->inspection->scheduled_date->format('Y-m-d'),
                'deadline_date'           => $this->inspection->deadline_date ? $this->inspection->deadline_date->format('Y-m-d') : null,
                'assigned_inspector_id'   => $this->resolveSupabaseUserId($this->inspection->inspector_id), 
                'inspector_notes'         => $this->inspection->assigned_notes,
            ]);

            if (!$jobResponse->successful()) throw new \Exception("Field Job Sync Failed: " . $jobResponse->body());

            Log::info("Successfully pushed Site Inspection {$this->inspection->id} to Supabase.");

        } catch (\Exception $e) {
            Log::error("Supabase Sync Error: " . $e->getMessage());
            throw $e; 
        }
    }

    /**
     * Helper to map local integer User IDs to Supabase Auth UUIDs.
     */
    private function resolveSupabaseUserId($localUserId)
    {
        $user = \App\Models\User::find($localUserId);

        // Fail loudly if the user doesn't exist or hasn't been linked to Supabase yet
        if (!$user || !$user->supabase_uuid) {
            throw new \Exception("Local User ID {$localUserId} does not have a mapped Supabase UUID.");
        }
        
        return $user->supabase_uuid; 
    }
}