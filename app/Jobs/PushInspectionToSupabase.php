<?php

namespace App\Jobs;

use App\Models\SiteInspection;
use App\Services\InspectionDeliveryRecorder;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

class PushInspectionToSupabase implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public $inspection;

    /**
     * Optional explicit Loop 9 delivery source.
     *
     * NULL means "derive from the queue attempt count". 9C will pass
     * `planning_officer_retry` here rather than introducing a second bridge
     * writer. `legacy_reconciliation` is never produced here; it belongs to the
     * recorded 9A-R data patch.
     */
    public ?string $deliverySource;

    /**
     * Create a new job instance.
     */
    public function __construct(SiteInspection $inspection, ?string $deliverySource = null)
    {
        $this->inspection = $inspection;
        $this->deliverySource = $deliverySource;
    }

    /**
     * Execute the job.
     */
    public function handle(InspectionDeliveryRecorder $recorder): void
    {
        // ---------------------------------------------------------------
        // Loop 9B: open the delivery attempt BEFORE anything else, so a
        // configuration failure is recorded through the same lifecycle as a
        // remote failure. Previously the credential guard threw above the
        // try block and escaped both logging and any classification.
        // ---------------------------------------------------------------
        $attempt = null;
        try {
            $attempt = $recorder->beginAttempt($this->inspection, $this->deliverySource, $this->attempts());
        } catch (Throwable $e) {
            // Observability must never break delivery. A failed attempt record
            // is strictly better than a lost FieldSync task.
            Log::warning('Delivery attempt could not be opened; continuing without it.', [
                'site_inspection_id' => $this->inspection->getKey(),
            ]);
        }

        // Typed classification captured from a non-2xx response BEFORE the body
        // is folded into an exception message. Null means "no typed evidence".
        $typedCategory = null;

        try {
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

            // Fail loudly if keys are missing so the worker logs a helpful
            // error. This now sits INSIDE the guarded lifecycle (Loop 9B).
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

            // ==========================================
            // 3. Push to supabase_zoning_applications
            // ==========================================
            // ADDED: ?on_conflict=local_application_id
            $appResponse = $http->post("{$supabaseUrl}/rest/v1/supabase_zoning_applications?on_conflict=local_application_id", [
                'local_application_id' => $application->id,
                'reference_number'     => $application->reference_number,
                'application_type'     => $application->application_type,
                'land_use_class'       => $application->target_land_use_class ?? $application->land_use_class,
                'applicant_name'       => $application->applicant_name,
                'representative_name'  => $application->representative_name ?: 'Self-represented',
                'contact_number'       => $application->contact_number,
                'email'                => $application->email,
                'purpose'              => $application->purpose,
                'barangay'             => $application->barangay,
            ]);

            if (!$appResponse->successful()) {
                // Typed classification is captured from the response BEFORE the
                // body is folded into an exception message, so the normalized
                // category never depends on parsing English text.
                $typedCategory = $recorder->classifyFromResponse($appResponse);
                throw new \Exception("App Sync Failed: " . $appResponse->body());
            }
            $supabaseAppId = $appResponse->json()[0]['id'];

            // ==========================================
            // 4. Push to supabase_parcels
            // ==========================================
            $landParcel = null;
            if (!empty($parcel->property_index_number)) {
                $landParcel = \Illuminate\Support\Facades\DB::table('land_parcels')
                    ->selectRaw('ST_AsText(geom) as wkt_geom')
                    ->where('property_index_number', $parcel->property_index_number)
                    ->first();
            }

            $geom = ($landParcel && $landParcel->wkt_geom) 
                ? $landParcel->wkt_geom 
                : (($parcel->longitude && $parcel->latitude) ? "POINT({$parcel->longitude} {$parcel->latitude})" : null); 

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

            if (!$parcelResponse->successful()) {
                $typedCategory = $recorder->classifyFromResponse($parcelResponse);
                throw new \Exception("Parcel Sync Failed: " . $parcelResponse->body());
            }
            $supabaseParcelId = $parcelResponse->json()[0]['id'];

            // ==========================================
            // 5. Push to field_jobs
            // ==========================================
            // Preserve the current FieldSync lifecycle state when this job is retried.
            $existingJobResponse = $http->get("{$supabaseUrl}/rest/v1/field_jobs", [
                'local_inspection_id' => "eq.{$this->inspection->id}",
                'select' => 'status',
                'limit' => 1,
            ]);

            if (!$existingJobResponse->successful()) {
                $typedCategory = $recorder->classifyFromResponse($existingJobResponse);
                throw new \Exception("Field Job Lookup Failed: " . $existingJobResponse->body());
            }

            $existingJob = $existingJobResponse->json()[0] ?? null;

            // ADDED: ?on_conflict=local_inspection_id
            $jobPayload = self::withAssigningOfficerProvenance(
                [
                    'local_inspection_id'     => $this->inspection->id,
                    'supabase_application_id' => $supabaseAppId,
                    'supabase_parcel_id'      => $supabaseParcelId,
                    'status'                  => $existingJob['status'] ?? 'assigned',
                    'scheduled_date'          => $this->inspection->scheduled_date->format('Y-m-d'),
                    'deadline_date'           => $this->inspection->deadline_date ? $this->inspection->deadline_date->format('Y-m-d') : null,
                    'assigned_inspector_id'   => $this->resolveSupabaseUserId($this->inspection->inspector_id),
                    'assignment_instructions' => $this->inspection->assigned_notes,
                ],
                $this->inspection->assigned_by_imaps_user_id,
                $this->inspection->assigned_by_name,
            );

            $jobResponse = $http->post("{$supabaseUrl}/rest/v1/field_jobs?on_conflict=local_inspection_id", $jobPayload);

            if (!$jobResponse->successful()) {
                $typedCategory = $recorder->classifyFromResponse($jobResponse);
                throw new \Exception("Field Job Sync Failed: " . $jobResponse->body());
            }

            Log::info("Successfully pushed Site Inspection {$this->inspection->id} to Supabase.");

            // ---------------------------------------------------------------
            // Loop 9B: every required remote upsert succeeded, so the round is
            // delivered. Idempotent, and it never touches task lifecycle state.
            // ---------------------------------------------------------------
            if ($attempt !== null) {
                $recorder->markDelivered($attempt);
                $recorder->logOutcome($this->inspection->getKey(), 'delivered', 'none');
            }

        } catch (Throwable $e) {
            $failure = $typedCategory !== null
                ? ['category' => $typedCategory, 'message' => InspectionDeliveryRecorder::MESSAGES[$typedCategory]]
                : $recorder->normalize($e);

            // Record THIS attempt as failed, but do NOT mark the round
            // terminally: the queue may still retry, and a retryable failure is
            // not a terminal delivery failure. `failed()` owns that decision.
            if ($attempt !== null) {
                $recorder->markAttemptFailed($attempt, $failure);
            }

            $recorder->logOutcome(
                $this->inspection->getKey(),
                'attempt_failed',
                $failure['category'],
                $this->inspection->getKey() . ':' . ($attempt?->attempt_number)
            );

            Log::error("Supabase Sync Error: " . $e->getMessage());

            throw $e;
        }
    }

    /**
     * Terminal delivery failure.
     *
     * Laravel calls this when the queued job is permanently failed. It is the
     * AUTHORITY for the terminal `delivery_failed` summary; the handle() catch
     * deliberately does not set it, so the design stays correct if queue tries
     * are ever increased.
     *
     * This method may run against a RECONSTRUCTED command, so it must not rely
     * on any property mutated inside handle(). The reconciliation derives its
     * decision purely from durable database state, and it is idempotent.
     */
    public function failed(?Throwable $exception): void
    {
        $inspection = SiteInspection::query()->find($this->inspection->getKey());

        if ($inspection === null) {
            return;
        }

        $recorder = app(InspectionDeliveryRecorder::class);

        $failure = $exception !== null
            ? $recorder->normalize($exception)
            : ['category' => 'unknown', 'message' => InspectionDeliveryRecorder::MESSAGES['unknown']];

        $recorder->reconcileTerminalFailure($inspection, $failure);

        $recorder->logOutcome(
            $inspection->getKey(),
            'terminal_failure',
            $failure['category'],
            $inspection->getKey()
        );
    }

    /**
     * Forward only the persisted assigning officer provenance. The queued job
     * must never infer or resolve an actor from the active session context; it
     * only sends the latest stored planning-officer snapshot from the
     * inspection row.
     */
    public static function withAssigningOfficerProvenance(array $payload, $assignedByImapsUserId = null, $assignedByName = null): array
    {
        $userId = $assignedByImapsUserId ?? null;
        $name = $assignedByName ?? null;

        if ($userId === null && $name === null) {
            return $payload;
        }

        if (self::isUnusableAssigningOfficerProvenance($userId, $name)) {
            if (($userId !== null && $userId !== '') || ($name !== null && trim((string) $name) !== '')) {
                if (function_exists('app') && app() !== null && app()->bound('log')) {
                    Log::warning('Skipping unusable assigning-officer provenance payload values.', [
                        'user_id' => $userId,
                        'name' => $name,
                    ]);
                }
            }
            return $payload;
        }

        $normalizedUserId = self::normalizeAssigningOfficerUserId($userId);
        $normalizedName = self::normalizeAssigningOfficerName($name);

        $payload['assigned_by_imaps_user_id'] = $normalizedUserId;
        $payload['assigned_by_name'] = $normalizedName;

        return $payload;
    }

    public static function isUnusableAssigningOfficerProvenance($assignedByImapsUserId, $assignedByName): bool
    {
        $hasUserId = $assignedByImapsUserId !== null && trim((string) $assignedByImapsUserId) !== '';
        $hasName = is_string($assignedByName) ? trim($assignedByName) !== '' : ($assignedByName !== null && trim((string) $assignedByName) !== '');

        if (!$hasUserId && !$hasName) {
            return false;
        }

        if (!$hasUserId || !$hasName) {
            return true;
        }

        $normalizedUserId = self::normalizeAssigningOfficerUserId($assignedByImapsUserId);
        $normalizedName = self::normalizeAssigningOfficerName($assignedByName);

        return $normalizedUserId === null || $normalizedName === null;
    }

    private static function normalizeAssigningOfficerUserId($value): ?int
    {
        if ($value === null || $value === '') {
            return null;
        }

        $normalized = trim((string) $value);
        if ($normalized === '' || !preg_match('/^\d+$/', $normalized)) {
            return null;
        }

        $intValue = (int) $normalized;
        return $intValue >= 0 ? $intValue : null;
    }

    private static function normalizeAssigningOfficerName($value): ?string
    {
        if ($value === null) {
            return null;
        }

        $normalized = trim((string) $value);
        return $normalized === '' ? null : $normalized;
    }

    /**
     * Helper to map local integer User IDs to Supabase Auth UUIDs.
     */
    private function resolveSupabaseUserId($localUserId)
    {
        $user = \App\Models\User::find($localUserId);

        if (!$user || !$user->handshake_key) {
            throw new \Exception("Local User ID {$localUserId} does not have a mapped Supabase profile via handshake_key.");
        }

        $supabaseUrl = config('services.supabase.url') ?? env('SUPABASE_URL');
        $supabaseKey = config('services.supabase.service_key') ?? config('services.supabase.key') ?? env('SUPABASE_SERVICE_KEY');

        if (empty($supabaseUrl) || empty($supabaseKey)) {
            throw new \Exception('Supabase credentials are missing while resolving the inspector profile.');
        }

        $response = Http::withHeaders([
            'apikey' => $supabaseKey,
            'Authorization' => 'Bearer ' . $supabaseKey,
            'Content-Type' => 'application/json',
        ])->get("{$supabaseUrl}/rest/v1/profiles", [
            'select' => 'id',
            'handshake_key' => 'eq.' . $user->handshake_key,
            'limit' => 1,
        ]);

        if (!$response->successful()) {
            throw new \Exception("Failed to resolve Supabase profile for local user {$localUserId}: " . $response->body());
        }

        $profile = $response->json()[0] ?? null;

        if (!$profile || empty($profile['id'])) {
            throw new \Exception("No Supabase profile found for local user {$localUserId}. Expected a profile where handshake_key = {$user->handshake_key}.");
        }

        return $profile['id'];
    }
}