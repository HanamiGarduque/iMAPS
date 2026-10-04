<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Serializes every operation that can change a report's lifecycle outcome,
 * keyed by the report UUID, so a terminal transition and an escalation
 * episode can never interleave into "terminal report + open escalation".
 *
 * WHY AN ADVISORY LOCK AND NOT lockForUpdate()
 * --------------------------------------------
 * `lockForUpdate()` is the project convention (SupportReportResolution,
 * InspectionDeliveryRecorder, InspectionDeliveryRetryService,
 * TechnicalReviewController) but it needs a LOCAL ROW to lock. An
 * Application Support report has one - `zoning_applications` - which is why
 * DiagnosticReportHandling can already hold a row lock across its remote CAS.
 * A TECHNICAL ISSUE report has no local row at all: it exists only in remote
 * Supabase. There is nothing local to lock, so no existing row-lock primitive
 * can serialize a Technical Issue terminal transition against an escalation.
 *
 * WHY THIS IS SAFE TO ABSTRACT
 * ----------------------------
 * The raw `pg_advisory_xact_lock` call exists in exactly one place, here.
 * Controllers and services call {@see acquire()} and never see SQL. The key is
 * deterministic - two int32 values taken from the fixed-width UUID hex - so both
 * operations derive the identical key from the identical report UUID and cannot
 * disagree.
 *
 * It is a TRANSACTION-scoped lock, so it is released by COMMIT or ROLLBACK
 * automatically. There is no unlock path that could be skipped on an error, and
 * no lock can outlive its transaction to block a later request.
 *
 * DRIVER BOUNDARY
 * ---------------
 * The lock is a PostgreSQL primitive. On any other driver it is deliberately a
 * no-op rather than a silent failure, because the SQLite harness has no
 * concurrent connections. The real behaviour - including the blocking and the
 * race outcome - is proven against a disposable PostgreSQL cluster in
 * tests/Integration/ReportEscalationsPostgresTest.php.
 */
class ReportLifecycleLock
{
    /** Advisory locks are meaningless outside one transaction. */
    public function acquire(string $reportUuid): void
    {
        if (! Str::isUuid($reportUuid)) {
            throw new \InvalidArgumentException('Report lifecycle lock requires an exact report UUID.');
        }
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }
        [$key1, $key2] = self::keys($reportUuid);
        DB::select('SELECT pg_advisory_xact_lock(?, ?)', [$key1, $key2]);
    }

    /**
     * Deterministic int32 pair from the 32 hex digits of a UUID.
     *
     * Fixed width means the split is never ambiguous: the same UUID always yields
     * the same two keys, and two different UUIDs differing anywhere in the hex
     * differ in at least one key.
     *
     * @return array{int, int}
     */
    public static function keys(string $reportUuid): array
    {
        $hex = str_replace('-', '', strtolower($reportUuid));
        if (strlen($hex) !== 32 || ! ctype_xdigit($hex)) {
            throw new \InvalidArgumentException('Report lifecycle lock requires an exact report UUID.');
        }
        $unsigned = static fn (string $chunk): int => (int) hexdec($chunk);
        $toSigned = static fn (int $value): int => $value >= 0x80000000 ? $value - 0x100000000 : $value;

        return [$toSigned($unsigned(substr($hex, 0, 8))), $toSigned($unsigned(substr($hex, 8, 8)))];
    }
}