<?php

namespace App\Support;

/**
 * Decides whether a Site Inspector may be changed on an inspection round.
 *
 * WHY THIS EXISTS
 *
 * A field job is not just a database row. The inspector's phone caches it for
 * offline use, and the cache deliberately KEEPS a job the inspector has already
 * started working on. Handing that job to a different inspector therefore does
 * not cleanly hand it over: the previous phone keeps a working copy, and any
 * work it has not yet uploaded becomes stranded.
 *
 * Because of that, an inspector may only be changed while the round is
 * PROVABLY untouched in the field. "Provably" is the important word. Local
 * iMAPS state cannot prove it: a round that FieldSync reports as in progress is
 * still recorded locally as "assigned", because local status has no in-progress
 * value. So the decision is made from the REMOTE FieldSync job, and it fails
 * CLOSED — if the remote state cannot be read, the answer is no.
 *
 * This class is deliberately pure: an array in, a decision out. The safety
 * rule is then provable in a plain unit test with no database, no network and
 * no Supabase credentials.
 */
final class InspectorTransferGuard
{
    /**
     * Shown whenever a reassignment is refused. Deliberately one plain sentence
     * with no schema language, because it is shown to a Planning Officer who
     * only needs to know what to do next.
     */
    public const BLOCKED_MESSAGE = 'This inspection has already started in FieldSync and cannot be reassigned safely.';

    /**
     * Shown when the remote state could not be read. The round is not proven
     * untouched, so it is treated the same as already started.
     */
    public const UNVERIFIABLE_MESSAGE = 'This inspection could not be verified as unstarted in FieldSync, so it cannot be reassigned safely.';

    /**
     * Shown when the round already has a completed local record.
     */
    public const COMPLETED_MESSAGE = 'A completed inspection round cannot be reassigned. Use Requires Reinspection to open a new round.';

    /**
     * Evaluate a round for reassignment eligibility.
     *
     * @param  array{local_status?: string|null, remote_status?: string|null, gps_confirmed_at?: mixed, checklist_completed_count?: mixed, photo_count?: mixed, remote_readable?: bool}  $state
     * @return array{allowed: bool, reason: string|null, blockers: array<int, string>}
     */
    public static function evaluate(array $state): array
    {
        $blockers = [];

        // ── The round must not already be a finished record ──
        // Checked locally because this is the one fact iMAPS owns outright.
        if (self::isCompleted($state['local_status'] ?? null)) {
            $blockers[] = 'local_completed';
        }

        // ── The remote job must be readable ──
        // Fail closed. If FieldSync cannot be consulted we cannot prove the
        // round is untouched, and "cannot prove" must never mean "allowed".
        if (($state['remote_readable'] ?? false) !== true) {
            $blockers[] = 'remote_unreadable';
        } else {
            // ── Remote lifecycle must still be unstarted ──
            $remoteStatus = self::normaliseStatus($state['remote_status'] ?? null);

            if ($remoteStatus !== 'assigned') {
                $blockers[] = 'remote_' . ($remoteStatus ?: 'unknown');
            }

            // ── No confirmed location ──
            if (($state['gps_confirmed_at'] ?? null) !== null && ($state['gps_confirmed_at'] ?? null) !== '') {
                $blockers[] = 'gps_confirmed';
            }

            // ── No checklist progress ──
            if (self::toInt($state['checklist_completed_count'] ?? 0) > 0) {
                $blockers[] = 'checklist_progress';
            }

            // ── No photos ──
            if (self::toInt($state['photo_count'] ?? 0) > 0) {
                $blockers[] = 'photos_present';
            }
        }

        if ($blockers === []) {
            return ['allowed' => true, 'reason' => null, 'blockers' => []];
        }

        return [
            'allowed' => false,
            'reason' => self::messageFor($blockers),
            'blockers' => $blockers,
        ];
    }

    /**
     * Convenience wrapper for callers that only need the yes/no plus a message.
     *
     * @param  array<string, mixed>  $state
     * @return array{allowed: bool, reason: string|null, blockers: array<int, string>}
     */
    public static function decide(array $state): array
    {
        return self::evaluate($state);
    }

    /**
     * The plain-language explanation for a blocked reassignment.
     *
     * @param  array<int, string>  $blockers
     */
    private static function messageFor(array $blockers): string
    {
        if (in_array('local_completed', $blockers, true)) {
            return self::COMPLETED_MESSAGE;
        }

        if (in_array('remote_unreadable', $blockers, true)) {
            return self::UNVERIFIABLE_MESSAGE;
        }

        return self::BLOCKED_MESSAGE;
    }

    /**
     * A round is terminal once it is completed. "Submitted" is accepted because
     * the field app has used both words across its lifecycle history.
     */
    private static function isCompleted(?string $status): bool
    {
        return in_array(self::normaliseStatus($status), ['completed', 'submitted'], true);
    }

    /**
     * FieldSync has used several spellings of the same lifecycle state over
     * time, so they are folded together before comparison rather than being
     * treated as different states.
     */
    private static function normaliseStatus(?string $status): string
    {
        $normalised = strtolower(trim((string) $status));

        return str_replace(['-', ' '], '_', $normalised);
    }

    private static function toInt(mixed $value): int
    {
        if (is_numeric($value)) {
            return (int) $value;
        }

        return 0;
    }
}
