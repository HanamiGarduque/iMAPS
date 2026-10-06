<?php

namespace App\Support;

use App\Models\SiteInspection;
use App\Models\ZoningApplication;
use App\Services\BridgeSourceIdentity;
use App\Services\SupabaseService;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/** Resolve remote identity before touching local integer identities. No persistent cache. */
class SupportReportResolution
{
    public function __construct(private SupabaseService $supabase) {}

    public static function unavailable(): array
    {
        return ['resolved' => false, 'message' => 'Application context unavailable',
            'application' => null, 'owner' => null, 'origin' => null];
    }

    public function resolve(array $report, bool $lock = false): array
    {
        return $this->resolveMany([$report], true, $lock)[$report['id']] ?? self::unavailable();
    }

    public function resolveMany(array $reports, bool $withOrigin = false, bool $lock = false): array
    {
        $out = [];
        foreach ($reports as $r) {
            $out[$r['id']] = self::unavailable();
        }
        try {
            $source = BridgeSourceIdentity::id();
            $eligible = array_filter($reports, fn ($r) =>
                ($r['report_type'] ?? null) === 'application_support'
                && ($r['bridge_source_id'] ?? null) === $source
                && Str::isUuid($r['supabase_application_id'] ?? '')
                && (($r['field_job_id'] ?? null) === null || Str::isUuid($r['field_job_id'])));
            if (! $eligible) {
                return $out;
            }
            $jobs = $this->remoteByIds('field_jobs', 'id,bridge_source_id,supabase_application_id,local_inspection_id', array_column($eligible, 'field_job_id'));
            $eligible = array_filter($eligible, function ($r) use ($jobs, $source) {
                if ($r['field_job_id'] === null) {
                    return true;
                }
                $job = $jobs[$r['field_job_id']] ?? null;
                return $job && $job['id'] === $r['field_job_id'] && $job['bridge_source_id'] === $source
                    && $job['supabase_application_id'] === $r['supabase_application_id'];
            });
            // For live jobs the application UUID has now been proven equal to the
            // exact job's UUID. Only that validated set may fetch application mirrors.
            $mirrors = $this->remoteByIds('supabase_zoning_applications', 'id,bridge_source_id,local_application_id', array_column($eligible, 'supabase_application_id'));
            $validated = [];
            foreach ($eligible as $r) {
                $mirror = $mirrors[$r['supabase_application_id']] ?? null;
                if (! $mirror || $mirror['id'] !== $r['supabase_application_id'] || $mirror['bridge_source_id'] !== $source) {
                    continue;
                }
                $job = null;
                if ($r['field_job_id'] !== null) {
                    $job = $jobs[$r['field_job_id']] ?? null;
                    if (! $job || $job['id'] !== $r['field_job_id'] || $job['bridge_source_id'] !== $source
                        || $job['supabase_application_id'] !== $r['supabase_application_id']) {
                        continue; // A missing non-NULL job never becomes retained support.
                    }
                }
                if (filter_var($mirror['local_application_id'], FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]) === false) {
                    continue;
                }
                $validated[$r['id']] = ['local_id' => (int) $mirror['local_application_id'], 'job' => $job];
            }
            if (! $validated) {
                return $out;
            }
            // All namespace / exact UUID checks above precede these local reads.
            $query = ZoningApplication::query()->select('id', 'reference_number', 'applicant_name', 'barangay', 'assigned_planning_officer_id')
                ->with('assignedPlanningOfficer:id,name,role')->whereIn('id', array_column($validated, 'local_id'));
            if ($lock) {
                $query->lockForUpdate();
            }
            $applications = $query->get()->keyBy('id');
            $inspections = collect();
            $rounds = [];
            if ($withOrigin) {
                $ids = array_filter(array_map(fn ($v) => $v['job']['local_inspection_id'] ?? null, $validated));
                $inspections = SiteInspection::query()->whereIn('id', $ids)->get()->keyBy('id');
                $rounds = InspectionRoundNumbering::forInspections($inspections);
            }
            foreach ($validated as $id => $v) {
                $app = $applications->get($v['local_id']);
                if (! $app) {
                    continue;
                }
                $owner = $app->assignedPlanningOfficer;
                $origin = null;
                if ($v['job'] === null) {
                    $origin = ['label' => 'Unavailable — originating FieldSync job no longer exists.', 'id' => null, 'round_number' => null];
                } elseif ($withOrigin) {
                    $inspection = $inspections->get($v['job']['local_inspection_id']);
                    if ($inspection && (int) $inspection->zoning_application_id === (int) $app->id) {
                        $round = $rounds[$inspection->id];
                        $origin = ['id' => $inspection->id, 'round_number' => $round['round_number'],
                            'label' => 'INS-'.$inspection->id.' · '.($round['round_number'] ? 'Round '.$round['round_number'] : $round['round_kind'])];
                    } else {
                        $origin = ['id' => null, 'round_number' => null, 'label' => 'Unavailable — originating inspection could not be verified.'];
                    }
                }
                $out[$id] = ['resolved' => true, 'message' => null,
                    'application' => ['id' => $app->id, 'reference_number' => $app->reference_number,
                        'applicant_name' => $app->applicant_name, 'barangay' => $app->barangay,
                        'assigned_planning_officer_id' => $app->assigned_planning_officer_id],
                    'owner' => $owner && $owner->role === 'Planning Officer' ? ['id' => $owner->id, 'name' => $owner->name] : null,
                    'origin' => $origin];
            }
        } catch (Throwable) {
            // Remote failures and malformed identity never authorize a local lookup fallback.
        }
        return $out;
    }

    public function mirrorForApplication(int $localId): ?string
    {
        $source = BridgeSourceIdentity::id();
        $response = $this->supabase->select('supabase_zoning_applications', 'id,bridge_source_id,local_application_id', [
            'bridge_source_id' => 'eq.'.$source, 'local_application_id' => 'eq.'.$localId, 'limit' => '2',
        ]);
        if (! $response->successful() || ! is_array($rows = $response->json())) {
            throw new RuntimeException('Application support could not be loaded.');
        }
        if (count($rows) !== 1) {
            if (count($rows) > 1) {
                throw new RuntimeException('Application context unavailable');
            }
            return null;
        }
        $r = $rows[0];
        if (($r['bridge_source_id'] ?? null) !== $source || (int) ($r['local_application_id'] ?? 0) !== $localId || ! Str::isUuid($r['id'] ?? '')) {
            throw new RuntimeException('Application context unavailable');
        }
        return $r['id'];
    }

    private function remoteByIds(string $table, string $columns, array $ids): array
    {
        $out = [];
        foreach (array_chunk(array_values(array_unique(array_filter($ids))), 100) as $chunk) {
            $response = $this->supabase->select($table, $columns, ['id' => 'in.('.implode(',', $chunk).')']);
            if (! $response->successful() || ! is_array($rows = $response->json())) {
                throw new RuntimeException('Support identity lookup failed.');
            }
            foreach ($rows as $row) {
                $out[$row['id']] = $row;
            }
        }
        return $out;
    }
}
