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
    protected $signature = 'sync:pull-inspections {--local-inspection-id= : Only pull the completed job for this local inspection ID}';
    protected $description = 'Pulls completed site inspections from Supabase and syncs them locally';

    public function handle(SupabaseService $supabase)
    {
        $localInspectionId = $this->option('local-inspection-id');
        if ($localInspectionId !== null && (! ctype_digit((string) $localInspectionId) || (int) $localInspectionId <= 0)) {
            $this->error('The --local-inspection-id option must be a positive integer.');

            return self::INVALID;
        }

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
            'inspector_notes',
            'checklist_data',
            'confirmed_latitude',
            'confirmed_longitude',
            'gps_accuracy_m',
            'gps_confirmed_at',
        ]);

        // NAMESPACED READ. This command matches remote jobs to local
        // site_inspections by the bare `local_inspection_id` integer. That
        // integer is unique only inside one iMAPS database, while this Supabase
        // project is shared, so an unscoped pull can copy another
        // environment's completion, findings, checklist and GPS onto a local
        // row that merely shares the number. The scope is this deployment's
        // configured bridge source identity, and it fails closed without one.
        $filters = $supabase->scopedFilters(['status' => 'eq.completed']);
        if ($localInspectionId !== null) {
            $filters['local_inspection_id'] = 'eq.'.(int) $localInspectionId;
        }

        $response = $supabase->select('field_jobs', $fields, $filters);

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
                        'status'              => 'completed',
                        'submitted_at'        => $localInspection->submitted_at
                            ?? $remoteOrExisting('submitted_at', $localInspection->submitted_at),
                        'inspection_result'   => $remoteOrExisting('inspection_result', $localInspection->inspection_result),
                        'is_compliant'        => $remoteOrExisting('is_compliant', $localInspection->is_compliant),
                        'findings'            => $remoteOrExisting('findings', $localInspection->findings),
                        'observations'        => $remoteOrExisting('observations', $localInspection->observations),
                        'discrepancies'       => $remoteOrExisting('discrepancies', $localInspection->discrepancies),
                        'recommendations'     => $remoteOrExisting('recommendations', $localInspection->recommendations),
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