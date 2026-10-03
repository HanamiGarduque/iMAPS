<?php

namespace App\Support;

/**
 * Planning Officer inspection visibility — presentation-safe summary.
 *
 * Audit finding (Admin/PO page audit, Loop 8 batch): a Planning Officer could
 * not tell from the Applications list whether an application had a field
 * inspection, who the inspector was, or whether a reinspection round was
 * active. This class produces the single compact line that answers those
 * three questions.
 *
 * DATA-SOURCING RULE (deliberate, enforced by the wording below)
 * ------------------------------------------------------------
 * Every value here comes from the LOCAL iMAPS database only:
 *   - `site_inspections` rows (existence, local status, count = rounds)
 *   - `users.name` via the existing `inspector` belongsTo relation
 *
 * Nothing here reads Supabase / FieldSync. iMAPS therefore CANNOT prove field
 * progression, so this class must never emit progress wording. In particular a
 * locally `assigned` inspection is NOT "Ongoing" and NOT "In Progress": an
 * assignment only records that a task was handed to an inspector, and the
 * inspector may not have started it. Claiming otherwise is exactly the label /
 * query mismatch the audit flagged on the Dashboard.
 *
 * Therefore the only two completion claims available locally are:
 *   - an inspection exists and is assigned  -> "Assigned to <Inspector>"
 *   - an inspection exists and is completed -> "Completed - <Inspector>"
 *
 * Live FieldSync progression (step, GPS, queued/offline, last device activity)
 * stays a separate concept and is not surfaced here. See
 * docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md for the documented business rule.
 *
 * Multiple `site_inspections` rows for one parcel are SEPARATE ROUNDS, not a
 * reopened inspection: a second row is a new reinspection task, and the first
 * round remains its own completed record. The round count is therefore real
 * business meaning ("Reinspection (Round 2)"), not a technical detail.
 */
final class InspectionSummary
{
    /**
     * Local statuses that mean "an inspection task exists and is not finished".
     *
     * Anything not listed here is still never described as in-progress; the
     * fallback in {@see line()} stays on the conservative assigned wording so a
     * legacy or unexpected value can never produce a progress claim.
     */
    private const ASSIGNED_STATUSES = ['assigned', 'pending'];

    private const COMPLETED_STATUS = 'completed';

    /**
     * Separator used before the inspector name on a completed round.
     *
     * Written as an explicit Unicode escape on purpose: the approved wording is
     * an em dash, and encoding it literally would make this source file
     * depend on the byte encoding of whatever tool writes it. Keeping the file
     * pure ASCII while emitting the exact approved character avoids that.
     */
    private const COMPLETED_SEPARATOR = " \u{2014} "; // em dash

    /**
     * Build the compact secondary line, or null when there is nothing to say.
     *
     * Null (render no line at all) is the correct output for "no inspection
     * exists": the audit asked for the line to be omitted rather than showing an
     * empty or negative placeholder on every application.
     *
     * @param  object|null  $inspection   Latest local SiteInspection (or an
     *                                     equivalent object exposing
     *                                     `status`).
     * @param  string|null  $inspectorName Human-readable name from the users
     *                                     relation, when it is loaded.
     * @param  int          $roundCount   Number of local inspection rows for
     *                                     the parcel (1 = first round only).
     */
    public static function line(?object $inspection, ?string $inspectorName = null, int $roundCount = 0): ?string
    {
        if ($inspection === null) {
            return null;
        }

        $rounds = max(1, $roundCount);
        $status = strtolower(trim((string) ($inspection->status ?? '')));
        $completed = $status === self::COMPLETED_STATUS;

        $name = trim((string) $inspectorName);

        // The separator follows the STATE, not the round count: a completed
        // round reads "Completed - <Inspector>", an open one reads
        // "Assigned to <Inspector>". Using one separator for both produced
        // "Assigned - <Inspector>" and "Completed to <Inspector>".
        $separator = $completed ? self::COMPLETED_SEPARATOR : ' to ';

        if ($rounds > 1) {
            // More than one row = a distinct reinspection round. The earlier
            // round is a separate completed record, not a reopened one.
            $label = $completed
                ? sprintf('Reinspection (Round %d): Completed', $rounds)
                : sprintf('Reinspection (Round %d): Assigned', $rounds);

            return $name === '' ? $label : $label . $separator . $name;
        }

        $label = $completed ? 'Site inspection: Completed' : 'Site inspection: Assigned';

        return $name === '' ? $label : $label . $separator . $name;
    }
}
