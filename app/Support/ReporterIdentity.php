<?php

namespace App\Support;

use App\Services\SupabaseService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Throwable;

/**
 * Resolve the FieldSync reporter of a diagnostic report to a local iMAPS user.
 *
 * THE CHAIN, EXACTLY, WITH NO TEXT MATCHING ANYWHERE:
 *
 *   diagnostic_reports.inspector_id   (Supabase Auth user UUID)
 *   -> remote public.profiles.id      (exact, primary key)
 *   -> remote public.profiles.handshake_key
 *   -> local  public.users.handshake_key
 *   -> local  public.users.id / name / role
 *
 * This is the SAME `handshake_key` bridge the bridge already uses in the FORWARD
 * direction, in `PushInspectionToSupabase::resolveSupabaseUserId` (local user ->
 * remote profile -> Auth UUID). It is read here in reverse, so nothing new is
 * introduced and no mapping has to be created or backfilled.
 *
 * WHY NOT THE REMOTE PROFILE NAME
 * -------------------------------
 * `profiles.full_name` is FieldSync-authored text and is NOT authoritative. The
 * live deployment proves it: profile `ddcebeac-...` carries the full name
 * "My Hubbie" while the local iMAPS account it belongs to is
 * "#6 Renato Dimaculangan". The local `users.name` is the display authority.
 *
 * WHY NOT `is_active`
 * -------------------
 * Resolution deliberately does NOT filter on `users.is_active`. A report is a
 * historical fact: an inspector who was deactivated after filing must still be
 * shown as the reporter of that report. `User::scopeActiveSiteInspectors()`
 * answers "who may receive work RIGHT NOW" and must not be reused here - doing
 * so would silently erase historical attribution the first time an account was
 * suspended. Only the ROLE is an identity-integrity check.
 *
 * FAIL CLOSED
 * -----------
 * Every one of these keeps the safe "Unresolved inspector" fallback rather than
 * guessing: a missing profile, a profile with no handshake key, a handshake key
 * with no local user, a handshake key claimed by MORE THAN ONE local user, and
 * a local user whose role is not Site Inspector.
 */
class ReporterIdentity
{
    /**
     * Mirrors SupportReportResolution's chunk size. Kept as its own small read
     * rather than refactoring that class, because the application-identity
     * chain there is already locked and verified and this phase must not touch it.
     */
    private const CHUNK = 100;

    private const READ_TIMEOUT_SECONDS = 12;

    /** The one role a report author may hold. */
    public const INSPECTOR_ROLE = 'Site Inspector';

    public function __construct(private SupabaseService $supabase) {}

    /**
     * Batch resolution for ONE already-fetched page of reports.
     *
     * Two reads for a whole page regardless of row count: at most
     * ceil(distinct_ids / 100) remote profile reads plus exactly ONE local
     * `users` read. Never one query per report.
     *
     * @param  array<int, array>  $reports  raw remote rows, pre-shaping
     * @return array<string, array> auth UUID => presentation payload
     */
    public function mapFor(array $reports): array
    {
        $ids = [];
        foreach ($reports as $report) {
            $uuid = $report['inspector_id'] ?? null;
            if (is_string($uuid) && Str::isUuid($uuid)) {
                $ids[$uuid] = true;
            }
        }
        $ids = array_keys($ids);
        if ($ids === []) {
            return [];
        }

        try {
            $keys = $this->handshakeKeysFor($ids);
            $people = $keys === [] ? [] : $this->localInspectorsByKey($keys);
        } catch (Throwable) {
            // A reporter-identity hiccup must never take the reports page down
            // with it, and must never be papered over with a guess. Every
            // affected report simply keeps the existing safe fallback. This
            // mirrors DiagnosticTextSanitizer::knownCredentialValues, which
            // likewise degrades instead of failing a read.
            return [];
        }

        $out = [];
        foreach ($ids as $id) {
            $key = $keys[$id] ?? null;
            $person = $key === null ? null : ($people[$key] ?? null);
            // Ambiguous keys were dropped during the local read, so a missing
            // entry here means unresolved for any reason at all.
            if ($person === null) {
                continue;
            }
            $out[$id] = [
                'resolved' => true,
                'name' => $person['name'],
                'role' => $person['role'],
                // ReportUi renders `inspector.label`; keeping the name there is
                // what makes the card read "Reported by: <name>" with no
                // frontend change at all.
                'label' => $person['name'],
            ];
        }
        return $out;
    }

    /**
     * Auth UUID => handshake key, one chunked remote read.
     *
     * Only `id` and `handshake_key` are requested. `full_name` is deliberately
     * not read: it is not authoritative and there is no reason to pull it into
     * a trusted process at all.
     *
     * @param  array<int, string>  $ids
     * @return array<string, string>
     */
    private function handshakeKeysFor(array $ids): array
    {
        $keys = [];
        foreach (array_chunk($ids, self::CHUNK) as $chunk) {
            $response = $this->supabase->select('profiles', 'id,handshake_key', [
                'id' => 'in.('.implode(',', $chunk).')',
            ], self::READ_TIMEOUT_SECONDS);
            if (! $response->successful() || ! is_array($rows = $response->json())) {
                throw new \RuntimeException('Reporter profile read failed.');
            }
            foreach ($rows as $row) {
                if (! is_array($row) || ! Str::isUuid($row['id'] ?? '')) {
                    throw new \RuntimeException('Invalid reporter profile response.');
                }
                $key = $row['handshake_key'] ?? null;
                // A profile with no handshake key is simply not bridged to a
                // local account. It stays unresolved; nothing is inferred.
                if (is_string($key) && trim($key) !== '') {
                    $keys[$row['id']] = trim($key);
                }
            }
        }
        return $keys;
    }

    /**
     * Handshake key => ['name', 'role'], from ONE local read.
     *
     * Two guards, both fail-closed:
     *   - a key matched by more than one local user is AMBIGUOUS and is dropped,
     *     never resolved to the first row;
     *   - only a Site Inspector may be a report author, so any other role is
     *     treated as an incompatible record rather than displayed.
     *
     * @param  array<int, string>  $keys
     * @return array<string, array{name: string, role: string}>
     */
    private function localInspectorsByKey(array $keys): array
    {
        if (! Schema::hasTable('users')) {
            return [];
        }
        $rows = DB::table('users')
            ->whereIn('handshake_key', $keys)
            ->get(['id', 'name', 'role', 'handshake_key']);

        $grouped = [];
        foreach ($rows as $row) {
            $key = $row->handshake_key;
            if (! is_string($key) || trim($key) === '') {
                continue;
            }
            $grouped[$key][] = $row;
        }

        $out = [];
        foreach ($grouped as $key => $matches) {
            if (count($matches) !== 1) {
                // Ambiguous: two local accounts claim the same bridge key.
                // Choosing either one would be a guess, so neither resolves.
                continue;
            }
            $user = $matches[0];
            $name = trim((string) ($user->name ?? ''));
            $role = trim((string) ($user->role ?? ''));
            if ($name === '' || $role !== self::INSPECTOR_ROLE) {
                continue;
            }
            $out[$key] = ['name' => $name, 'role' => $role];
        }
        return $out;
    }
}