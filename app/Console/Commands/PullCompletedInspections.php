<?php
// app/Console/Commands/PullCompletedInspections.php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
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

        if (! $response->successful()) {
            $this->error("Failed to connect to Supabase.");
            $this->line('SYNC_RESULT=FAILED');
            return self::FAILURE;
        }

        // Validate the whole batch before any write; decode objects distinctly from lists.
        try {
            $payload = json_decode($response->body(), false, 512, JSON_THROW_ON_ERROR);
            if (! is_array($payload)) {
                throw new \UnexpectedValueException();
            }

            $seenIds = [];
            foreach ($payload as $job) {
                if (! $job instanceof \stdClass) {
                    throw new \UnexpectedValueException();
                }

                $id = $job->local_inspection_id ?? null;
                // Round-trip canonical integer/string IDs without coercion or overflow.
                if ((! is_int($id) && ! is_string($id))
                    || (int) $id <= 0
                    || (string) (int) $id !== (string) $id
                    || ($job->status ?? null) !== 'completed'
                    || isset($seenIds[(int) $id])) {
                    throw new \UnexpectedValueException();
                }

                $seenIds[(int) $id] = true;
            }
        } catch (\JsonException | \UnexpectedValueException $e) {
            $this->error('Invalid completed inspections response from Supabase.');
            $this->line('SYNC_RESULT=FAILED');
            return self::FAILURE;
        }

        // Keep the existing associative decoding of optional result fields.
        $completedJobs = $response->json();

        if ($completedJobs === []) {
            $this->info("No new completed inspections found.");
            // Distinguishes "the bridge has no completed result for this round" from
            // "the round was already current". A support action must be able to
            // tell the operator which of the two actually happened.
            $this->line('SYNC_RESULT=NO_REMOTE_RESULT');
            return self::SUCCESS;
        }

        $syncedCount = 0;
        $scannedCount = 0;

        foreach ($completedJobs as $job) {
            $localInspectionId = (int) $job['local_inspection_id'];

            // 2. Wrap local database updates in a transaction to prevent partial saves.
            DB::transaction(function () use ($job, $localInspectionId, &$syncedCount, &$scannedCount) {
                $localInspection = SiteInspection::query()->lockForUpdate()->find($localInspectionId);

                if ($localInspection) {
                    // Preserve the local value only when a selected key is unexpectedly absent.
                    // An explicit remote null remains authoritative and clears the local copy.
                    $remoteOrExisting = static fn (string $key, mixed $existing): mixed =>
                        array_key_exists($key, $job) ? $job[$key] : $existing;

                    // Supabase returns UTC instants ("...+00:00") but the local
                    // columns are `timestamp without time zone` read in the app
                    // timezone. Eloquent stores a parsed string's wall-clock as-is,
                    // so convert first or the value lands 8 hours early.
                    $remoteTime = static fn (string $key, mixed $existing): mixed =>
                        is_string($value = $remoteOrExisting($key, $existing)) && $value !== ''
                            ? Carbon::parse($value)->setTimezone(config('app.timezone'))
                            : $value;

                    // Notify only on the first transition, so re-pulling a finished round never re-alerts.
                    $justCompleted = $localInspection->status !== 'completed';

                    $submittedAt = $localInspection->submitted_at
                        ?? $remoteTime('submitted_at', $localInspection->submitted_at);

                    $localInspection->fill([
                        'status'              => 'completed',
                        'submitted_at'        => $submittedAt,
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
                        'gps_confirmed_at'    => $remoteTime('gps_confirmed_at', $localInspection->gps_confirmed_at),
                        // When the inspector finished, not when this pull ran: a
                        // late pull must not move the round's completion date.
                        'completed_at'        => $localInspection->completed_at ?? $submittedAt ?? now(),
                    ]);

                    $scannedCount++;

                    // HONESTY FIX: the old code incremented the synced count for every
                    // row it merely SCANNED, whether or not anything was written, and
                    // then reported "Successfully synced N inspections". A support
                    // action that reports a change it did not make is worse than no
                    // report at all. The count now reflects real writes only, and a
                    // scan that changed nothing is reported as NO_CHANGE.
                    if ($localInspection->isDirty()) {
                        $localInspection->save();
                        $syncedCount++;

                        if ($justCompleted) {
                            $localInspection->notifyCompleted();
                        }
                    }
                } else {
                    Log::warning("Supabase sync issue: Local inspection ID {$localInspectionId} not found.");
                }
            });
        }

        $this->info("Successfully synced {$syncedCount} inspection(s) back to local database.");

        $this->line(
            $syncedCount > 0 ? 'SYNC_RESULT=CHANGED' : 'SYNC_RESULT=NO_CHANGE'
        );

        return self::SUCCESS;
    }
}
