<?php
// app/Console/Commands/PullCompletedInspections.php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\SiteInspection;
use App\Services\SupabaseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

class PullCompletedInspections extends Command
{
    protected $signature = 'sync:pull-inspections';
    protected $description = 'Pulls completed site inspections from Supabase and syncs them locally';

    public function handle(SupabaseService $supabase)
    {
        $this->info("Fetching completed jobs from Supabase...");

        // 1. Fetch only the completed-result fields persisted by the Phase 5A contract.
        $fields = implode(',', [
            'local_inspection_id',
            'status',
            'submitted_at',
            'inspection_result',
            'is_compliant',
            'findings',
            'observations',
            'discrepancies',
            'recommendations',
            'remarks',
            'inspector_notes',
            'checklist_data',
            'confirmed_latitude',
            'confirmed_longitude',
            'gps_accuracy_m',
            'gps_confirmed_at',
        ]);

        $response = $supabase->select('field_jobs', $fields, ['status' => 'eq.completed']);

        if ($response->failed()) {
            $this->error("Failed to connect to Supabase.");
            return;
        }

        $completedJobs = $response->json();
        
        if (empty($completedJobs)) {
            $this->info("No new completed inspections found.");
            return;
        }

        $syncedCount = 0;

        foreach ($completedJobs as $job) {
            $localInspectionId = $job['local_inspection_id'] ?? null;

            if ($localInspectionId === null) {
                Log::warning('Supabase sync issue: Completed field job has no local inspection ID.');
                continue;
            }

            // 2. Wrap local database updates in a transaction to prevent partial saves.
            DB::transaction(function () use ($job, $localInspectionId, &$syncedCount) {
                $localInspection = SiteInspection::find($localInspectionId);

                if ($localInspection) {
                    // Preserve the local value only when a selected key is unexpectedly absent.
                    // An explicit remote null remains authoritative and clears the local copy.
                    $remoteOrExisting = static fn (string $key, mixed $existing): mixed =>
                        array_key_exists($key, $job) ? $job[$key] : $existing;

                    $localInspection->fill([
                        'status'              => $remoteOrExisting('status', $localInspection->status),
                        'submitted_at'        => $remoteOrExisting('submitted_at', $localInspection->submitted_at),
                        'inspection_result'   => $remoteOrExisting('inspection_result', $localInspection->inspection_result),
                        'is_compliant'        => $remoteOrExisting('is_compliant', $localInspection->is_compliant),
                        'findings'            => $remoteOrExisting('findings', $localInspection->findings),
                        'observations'        => $remoteOrExisting('observations', $localInspection->observations),
                        'discrepancies'       => $remoteOrExisting('discrepancies', $localInspection->discrepancies),
                        'recommendations'     => $remoteOrExisting('recommendations', $localInspection->recommendations),
                        'remarks'             => $remoteOrExisting('remarks', $localInspection->remarks),
                        'inspector_notes'     => $remoteOrExisting('inspector_notes', $localInspection->inspector_notes),
                        'checklist_data'      => $remoteOrExisting('checklist_data', $localInspection->checklist_data),
                        'confirmed_latitude'  => $remoteOrExisting('confirmed_latitude', $localInspection->confirmed_latitude),
                        'confirmed_longitude' => $remoteOrExisting('confirmed_longitude', $localInspection->confirmed_longitude),
                        'gps_accuracy_m'      => $remoteOrExisting('gps_accuracy_m', $localInspection->gps_accuracy_m),
                        'gps_confirmed_at'    => $remoteOrExisting('gps_confirmed_at', $localInspection->gps_confirmed_at),
                        'completed_at'        => $localInspection->completed_at ?? now(),
                    ]);

                    if ($localInspection->isDirty()) {
                        $localInspection->save();
                    }

                    // Retain the completed Supabase records for FieldSync history and safe retries.
                    $syncedCount++;
                } else {
                    Log::warning("Supabase sync issue: Local inspection ID {$localInspectionId} not found.");
                }
            });
        }

        $this->info("Successfully synced {$syncedCount} inspections back to local database.");
    }
}