<?php

namespace App\Services;

use App\Support\DiagnosticTextSanitizer;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * LOOP 9E/9F - READ-ONLY reader for FieldSync inspector diagnostic reports.
 *
 * WHAT THIS IS
 * ------------
 * The missing iMAPS half of a support path that already exists end to end
 * elsewhere: a FieldSync Site Inspector submits an issue into the REMOTE
 * Supabase `diagnostic_reports` table, and an MPDO Admin triages it here.
 *
 * This service exists only to fetch and shape that data for an Admin reader.
 * There is deliberately no write, no status transition and no delete: the loop
 * contract is read-only, and `SupabaseService` is used through its existing
 * `select()` helper so no new access pattern is invented.
 *
 * WHY AN EXPLICIT ALLOWLIST
 * -------------------------
 * The remote table is outside this repository. Selecting `*` and forwarding the
 * result would make every future remote column automatically browser-visible,
 * which is precisely how a secret ends up in an Inertia prop. Only the columns
 * named in {@see self::SAFE_COLUMNS} are ever requested, and only the keys in
 * {@see self::shape()} are ever returned.
 *
 * WHY FREE TEXT IS SANITIZED HERE
 * -------------------------------
 * `summary`, `technical_description`, `repro_steps` and `recommended_action` are
 * typed by a person on a phone. The audit found a signed Supabase Storage URL -
 * a bearer capability - in the one live report. Sanitization happens in this
 * service, before the value can become a prop, and the raw value is never stored,
 * returned alongside the safe one, or logged.
 */
class DiagnosticReportReader
{
    /**
     * The only remote columns ever requested.
     *
     * A narrower select also means a remote column added later cannot leak by
     * default; it has to be added here deliberately, and reviewed.
     */
    private const SAFE_COLUMNS = [
        'id',
        'reference_code',
        'title',
        'module',
        'status',
        'created_at',
        'updated_at',
        'inspector_id',
    ];

    /** Free-text columns, sanitized before they can reach a browser. */
    private const FREE_TEXT_COLUMNS = [
        'summary',
        'technical_description',
        'repro_steps',
        'recommended_action',
    ];

    /** Authored fallback when a remote identity cannot be resolved to a person. */
    public const UNRESOLVED_INSPECTOR_LABEL = 'Unresolved inspector';

    public function __construct(private SupabaseService $supabase)
    {
    }

    /**
     * Every report, newest first, for the Admin triage list.
     *
     * @return array{ok: bool, reports: list<array<string, mixed>>, message: ?string}
     */
    public function all(int $limit = 100): array
    {
        try {
            $response = $this->supabase->select(
                'diagnostic_reports',
                implode(',', self::SAFE_COLUMNS),
                [
                    'order' => 'created_at.desc',
                    'limit' => (string) $limit,
                ]
            );
        } catch (Throwable $e) {
            return $this->failed('Diagnostic reports could not be loaded.');
        }

        if (! $response->successful()) {
            // The status code is recorded because it is operational evidence an
            // Admin needs. The response BODY is never logged: it is remote
            // content and could itself contain something sensitive.
            Log::warning('[Diagnostics] diagnostic_reports list read failed.', [
                'http_status' => $response->status(),
            ]);

            return $this->failed('Diagnostic reports could not be loaded.');
        }

        $rows = $response->json();

        if (! is_array($rows)) {
            return $this->failed('Diagnostic reports could not be loaded.');
        }

        $reports = [];

        foreach ($rows as $row) {
            if (is_array($row)) {
                $reports[] = $this->shape($row, false);
            }
        }

        return ['ok' => true, 'reports' => $reports, 'message' => null];
    }

    /**
     * One report, or null when it does not exist.
     *
     * @return array{ok: bool, report: ?array<string, mixed>, message: ?string}
     */
    public function find(string $uuid): array
    {
        if (! $this->looksLikeUuid($uuid)) {
            // Refused before it ever reaches a remote query string.
            return ['ok' => true, 'report' => null, 'message' => null];
        }

        $columns = array_merge(self::SAFE_COLUMNS, self::FREE_TEXT_COLUMNS);

        try {
            $response = $this->supabase->select(
                'diagnostic_reports',
                implode(',', $columns),
                ['id' => 'eq.' . $uuid]
            );
        } catch (Throwable) {
            return ['ok' => false, 'report' => null, 'message' => 'Diagnostic report could not be loaded.'];
        }

        if (! $response->successful()) {
            Log::warning('[Diagnostics] diagnostic_reports detail read failed.', [
                'http_status' => $response->status(),
            ]);

            return ['ok' => false, 'report' => null, 'message' => 'Diagnostic report could not be loaded.'];
        }

        $rows = $response->json();

        if (! is_array($rows) || $rows === []) {
            return ['ok' => true, 'report' => null, 'message' => null];
        }

        $row = $rows[0];

        return is_array($row)
            ? ['ok' => true, 'report' => $this->shape($row, true), 'message' => null]
            : ['ok' => true, 'report' => null, 'message' => null];
    }

    /**
     * Build the exact payload a browser may receive.
     *
     * Nothing from the remote row is forwarded by default. Every key is written
     * here, so a new remote column has to be added deliberately to be visible.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function shape(array $row, bool $withFreeText): array
    {
        $payload = [
            'id' => isset($row['id']) ? (string) $row['id'] : null,
            'reference_code' => $this->plainText($row['reference_code'] ?? null),
            'title' => DiagnosticTextSanitizer::sanitize($row['title'] ?? null),
            'module' => $this->plainText($row['module'] ?? null),
            'status' => $this->plainText($row['status'] ?? null),
            'created_at' => $this->timestamp($row['created_at'] ?? null),
            'updated_at' => $this->timestamp($row['updated_at'] ?? null),
            'inspector' => $this->shapeInspector($row['inspector_id'] ?? null),
        ];

        if ($withFreeText) {
            foreach (self::FREE_TEXT_COLUMNS as $column) {
                $payload[$column] = array_key_exists($column, $row) && $row[$column] !== null
                    ? DiagnosticTextSanitizer::sanitize($row[$column])
                    : null;
            }
        }

        return $payload;
    }

    /**
     * Inspector identity, or an honest unresolved marker.
     *
     * The remote value is a Supabase Auth UUID. Resolving it to a person would
     * require a verified local handshake mapping, and the audit proved the one
     * live report points at a profile whose local identity is an OPEN question.
     * Guessing a name here would be inventing business history, so this returns
     * the UUID plus a neutral label and nothing more. Resolving identity drift is
     * a separate, explicitly frozen issue.
     */
    private function shapeInspector(mixed $inspectorId): array
    {
        $uuid = is_string($inspectorId) && $this->looksLikeUuid($inspectorId)
            ? $inspectorId
            : null;

        return [
            'resolved' => false,
            'label' => self::UNRESOLVED_INSPECTOR_LABEL,
            'uuid' => $uuid,
            'short_uuid' => $uuid === null ? null : substr($uuid, 0, 8),
        ];
    }

    /**
     * A short, closed-value field. Sanitized anyway.
     *
     * `status` and `module` are expected to be short controlled strings, but they
     * are remote input and cost nothing to treat as untrusted. A remote value
     * this class has never seen is still passed through the sanitizer, so a
     * status that was edited to contain a URL cannot smuggle one through.
     */
    private function plainText(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $safe = DiagnosticTextSanitizer::sanitize($value);

        return $safe === '' ? null : $safe;
    }

    private function timestamp(mixed $value): ?string
    {
        if (! is_string($value) || trim($value) === '') {
            return null;
        }

        try {
            return \Illuminate\Support\Carbon::parse($value)->toIso8601String();
        } catch (Throwable) {
            // An unparseable remote timestamp is dropped rather than shown raw:
            // it is still untrusted input.
            return null;
        }
    }

    private function looksLikeUuid(mixed $value): bool
    {
        return is_string($value)
            && preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $value) === 1;
    }

    /**
     * @return array{ok: bool, reports: list<array<string, mixed>>, message: ?string}
     */
    private function failed(string $message): array
    {
        return ['ok' => false, 'reports' => [], 'message' => $message];
    }
}
