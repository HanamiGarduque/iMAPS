<?php

namespace App\Services;

use App\Support\DiagnosticTextSanitizer;
use Illuminate\Support\Str;
use Throwable;

/** Read-only transport and sanitized report projection. Visibility belongs to ReportingVisibility. */
class DiagnosticReportReader
{
    private const SAFE_COLUMNS = [
        'id', 'reference_code', 'title', 'module', 'status', 'created_at', 'updated_at', 'inspector_id',
        'report_type', 'field_job_id', 'supabase_application_id', 'bridge_source_id', 'support_category',
        'blocks_field_work', 'occurred_at', 'connectivity_state', 'app_version', 'os_version',
    ];
    private const FREE_TEXT_COLUMNS = ['summary', 'technical_description', 'repro_steps', 'affected_file',
        'recommended_action', 'affected_field', 'requested_change', 'expected_behavior'];
    public const UNRESOLVED_INSPECTOR_LABEL = 'Unresolved inspector';
    public const CATEGORIES = [
        'incorrect_information' => 'Incorrect Information', 'missing_information' => 'Missing Information',
        'additional_site_information' => 'Additional Site Information', 'clarification_request' => 'Clarification Needed',
        'correction_request' => 'Correction Request', 'other' => 'Other',
    ];

    public function __construct(private SupabaseService $supabase) {}

    /**
     * The ordered page size REQUESTED from the remote.
     *
     * This is a request, not a promise. The project applies its own row cap and
     * has been observed answering 100 rows to a request for 500, so the loop
     * below follows the size the server actually used instead of this number.
     */
    private const PAGE_SIZE = 500;

    /**
     * Bounded remote read timeout, in seconds.
     *
     * The framework default is 30s, during which the browser sits on a request
     * that cannot succeed and the honest error state is delayed by half a minute.
     * A stalled upstream should surface the real failure quickly and let the
     * operator retry; it must never be answered by making the wait longer.
     */
    private const READ_TIMEOUT_SECONDS = 12;

    /** Complete ordered scan, one remote page per iteration. */
    public function all(array $filters = []): array
    {
        $params = ['order' => 'created_at.desc,id.desc', 'limit' => (string) self::PAGE_SIZE];
        foreach (['report_type', 'supabase_application_id', 'status'] as $key) {
            if (isset($filters[$key])) {
                $params[$key] = 'eq.'.$filters[$key];
            }
        }
        try {
            $reports = [];
            $sanitize = DiagnosticTextSanitizer::forBatch();
            $offset = 0;
            // The page size the server ACTUALLY returned, learned from the first
            // response. Guessing it from the requested limit would stop the scan
            // early against a lower server row cap and silently truncate the
            // list, which is the same class of defect as reporting a count the
            // data does not support.
            $pageSize = null;
            do {
                $response = $this->supabase->select(
                    'diagnostic_reports',
                    implode(',', self::SAFE_COLUMNS),
                    $params + ['offset' => (string) $offset],
                    self::READ_TIMEOUT_SECONDS
                );
                if (! $response->successful() || ! is_array($rows = $response->json())) {
                    throw new \RuntimeException('Report read failed.');
                }
                foreach ($rows as $row) {
                    if (! is_array($row) || ! Str::isUuid($row['id'] ?? '')) {
                        throw new \RuntimeException('Invalid report response.');
                    }
                    $reports[] = $this->shape($row, false, $sanitize);
                }
                $pageSize ??= count($rows);
                $offset += count($rows);
                // A page shorter than the established page size is the last
                // page. Continuing past it buys an extra remote round trip that
                // returns nothing.
            } while ($pageSize > 0 && count($rows) === $pageSize);
            return ['ok' => true, 'reports' => $reports, 'message' => null];
        } catch (Throwable) {
            return ['ok' => false, 'reports' => [], 'message' => 'Reports & Support could not be loaded. Please try again.'];
        }
    }

    public function find(string $uuid): array
    {
        $empty = ['ok' => true, 'report' => null, 'message' => null];
        if (! Str::isUuid($uuid)) {
            return $empty;
        }
        try {
            $response = $this->supabase->select('diagnostic_reports', implode(',', array_merge(self::SAFE_COLUMNS, self::FREE_TEXT_COLUMNS)), ['id' => 'eq.'.$uuid]);
            if (! $response->successful() || ! is_array($rows = $response->json())) {
                throw new \RuntimeException('Report read failed.');
            }
            if (! $rows) {
                return $empty;
            }
            if (($rows[0]['id'] ?? null) !== $uuid) {
                throw new \RuntimeException('Invalid report response.');
            }
            return ['ok' => true, 'report' => $this->shape($rows[0], true, DiagnosticTextSanitizer::forBatch()), 'message' => null];
        } catch (Throwable) {
            return ['ok' => false, 'report' => null, 'message' => 'The report could not be loaded. Please try again.'];
        }
    }

    /** Summary of an already authorized collection, never an unscoped global query. */
    public function summary(array $visibleReports): array
    {
        return ['total' => count($visibleReports), 'latest' => $visibleReports[0] ?? null];
    }

    private function shape(array $row, bool $detail, \Closure $sanitize): array
    {
        $payload = [];
        foreach (array_merge(self::SAFE_COLUMNS, $detail ? self::FREE_TEXT_COLUMNS : []) as $key) {
            $value = $row[$key] ?? null;
            $payload[$key] = $value === null ? null : ($key === 'blocks_field_work' ? (is_bool($value) ? $value : null) : $sanitize($value));
        }
        foreach (['created_at', 'updated_at', 'occurred_at'] as $key) {
            try {
                $payload[$key] = empty($row[$key]) ? null : \Illuminate\Support\Carbon::parse($row[$key])->toIso8601String();
            } catch (Throwable) {
                $payload[$key] = null;
            }
        }
        $payload['support_category_label'] = self::CATEGORIES[$row['support_category'] ?? ''] ?? 'Not provided';
        $uuid = Str::isUuid($row['inspector_id'] ?? '') ? $row['inspector_id'] : null;
        // Do not guess a local person from an unresolved remote Auth UUID.
        $payload['inspector'] = ['resolved' => false, 'label' => self::UNRESOLVED_INSPECTOR_LABEL,
            'uuid' => $uuid, 'short_uuid' => $uuid ? substr($uuid, 0, 8) : null];
        unset($payload['inspector_id']);
        return $payload;
    }
}
