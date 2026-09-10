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

        // 1. Fetch only jobs marked 'completed' using our generic select method
        // We append ?status=eq.completed to the table name effectively filtering at the database level
        $response = $supabase->select('field_jobs', '*', ['status' => 'eq.completed']);

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
            // 2. Wrap local database updates in a transaction to prevent partial saves
            DB::transaction(function () use ($job, &$syncedCount) {
                
                $localInspection = SiteInspection::find($job['local_inspection_id']);

                if ($localInspection) {
                    // 3. Update the local site inspection with the field findings
                    $localInspection->update([
                        'status'       => 'completed',
                        'findings'     => $job['findings'] ?? $localInspection->findings,
                        'remarks'      => $job['remarks'] ?? $localInspection->remarks,
                        'is_compliant' => $job['is_compliant'] ?? $localInspection->is_compliant,
                        'completed_at' => now(), // Or use $job['updated_at']
                    ]);

                    // Retain the completed Supabase records for FieldSync history and safe retries.
                    $syncedCount++;
                } else {
                    Log::warning("Supabase sync issue: Local inspection ID {$job['local_inspection_id']} not found.");
                }
            });
        }

        $this->info("Successfully synced {$syncedCount} inspections back to local database.");
    }
}