<?php

namespace App\Support;

use App\Models\AppNotification;
use App\Models\User;
use Illuminate\Support\Facades\Log;

/**
 * The "Notify Planning Officers" notice for a FieldSync diagnostic report.
 *
 * WHY A SEPARATE CLASS
 * --------------------
 * The notice text is a SECURITY-SENSITIVE string that ends up in a table the
 * header bell renders. It must never be assembled at a call site, where one
 * future edit could quietly interpolate a raw remote field. Keeping the whole
 * message construction here means the sanitizer is the only way text enters it,
 * and the sanitizer is the only thing that decides what is safe.
 *
 * WHAT THE NOTICE MAY CONTAIN
 * ---------------------------
 * Only these four facts, and only from the ALREADY-SANITIZED report shape that
 * {@see \App\Services\DiagnosticReportReader} produces:
 *
 *   - the diagnostic reference code
 *   - the module
 *   - a short safe summary (the report TITLE, which is sanitized)
 *   - a link to the diagnostic detail
 *
 * The report's free-text body (`summary`, `technical_description`, `repro_steps`,
 * `recommended_action`) is NEVER included. The live report's `summary` contains a
 * signed Supabase Storage URL - a bearer capability on a private inspection
 * photo - which `DiagnosticTextSanitizer` redacts. A notice that echoed free
 * text would be a second, less protected copy of remote content in a table that
 * is polled on every page, so free text is excluded outright rather than
 * sanitized and included.
 *
 * NO CREDENTIAL OF ANY KIND IS READ HERE. No service key, anon key, token,
 * handshake key, password or raw remote payload is touched.
 *
 * DUPLICATE-SEND SUPPRESSION
 * --------------------------
 * The notice is a reminder, so repeating it adds no information. An identical
 * notice already sent for the same report is suppressed within a cooldown
 * window, which stops a double-click or a re-submitted request from spamming
 * every Planning Officer's bell. The suppression is by CONTENT, not by state:
 * nothing about the report is mutated, because the report is remote, immutable
 * and read-only from iMAPS.
 */
final class DiagnosticNotice
{
    /**
     * Re-notify cooldown. A reminder does not become more useful by arriving
     * twice in a minute.
     */
    public const COOLDOWN_MINUTES = 30;

    /**
     * A short, safe headline. Deliberately the report TITLE and nothing else.
     *
     * Public so the truncation bound is asserted rather than guessed at.
     */
    public const SUMMARY_MAX_CHARS = 120;

    public const TYPE = 'diagnostic_report';

    /**
     * Active Planning Officers, which is the entire audience for this notice.
     *
     * An Admin is NOT a target: an Admin raised this, so telling them would be
     * noise. A Site Inspector is NOT a target and must never be: they submitted
     * the report from FieldSync and have no iMAPS web diagnostics access at all,
     * so a link would send them to a 403.
     *
     * @return \Illuminate\Database\Eloquent\Collection<int, User>
     */
    public static function audience()
    {
        return User::query()
            ->where('role', 'Planning Officer')
            ->where('is_active', true)
            ->orderBy('id')
            ->get();
    }

    /**
     * Build the notice title/message/link for a sanitized report shape.
     *
     * @param  array<string, mixed>  $report  as returned by DiagnosticReportReader
     * @return array{title: string, message: string, action_url: string}
     */
    public static function compose(array $report): array
    {
        $reference = self::safeScalar($report['reference_code'] ?? null) ?? 'Unreferenced';
        $module = self::safeScalar($report['module'] ?? null) ?? 'unknown module';

        $headline = DiagnosticTextSanitizer::sanitize($report['title'] ?? null);
        $headline = self::safeScalar($headline);
        if ($headline === null || $headline === '') {
            $headline = '(no title)';
        }
        if (mb_strlen($headline) > self::SUMMARY_MAX_CHARS) {
            $headline = mb_substr($headline, 0, self::SUMMARY_MAX_CHARS - 1).'…';
        }

        $message = sprintf(
            'FieldSync diagnostic %s (%s) was reported and needs review within MPDO. %s',
            $reference,
            $module,
            $headline
        );

        return [
            'title' => 'Diagnostic Report '. $reference,
            // Re-sanitized on the way out so a value that somehow reached the
            // sanitizer differently cannot ride along in a table that the bell
            // renders on every page.
            'message' => DiagnosticTextSanitizer::sanitize($message),
            'action_url' => self::detailUrl($report['id'] ?? null),
        ];
    }

    /**
     * The in-app link to the report detail, or the list when there is no
     * usable id.
     *
     * WHY THE ID IS SHAPE-CHECKED RATHER THAN JUST ENCODED
     * ----------------------------------------------------
     * `rawurlencode` does NOT encode dots, so an id of `..` would survive
     * encoding and produce `/diagnostics/..`, which a browser resolves as a
     * traversal out of the diagnostics section. Refusing any id that is not a
     * canonical UUID removes the whole class: there is no value that can
     * introduce a path segment, because only hex digits and dashes are allowed
     * through. A report with an unusable id falls back to the list, which is
     * always safe and always reachable.
     */
    private static function detailUrl(mixed $id): string
    {
        if (! is_string($id) || ! preg_match('/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/', $id)) {
            return '/diagnostics';
        }

        return '/diagnostics/'.$id;
    }

    /**
     * Send the notice, skipping recipients who already have an identical
     * unread notice for the same report inside the cooldown window.
     *
     * Returns the recipients actually notified, so the caller can report an
     * honest count rather than assuming a send happened.
     *
     * @param  array<string, mixed>  $report
     * @return array{notified: int, suppressed: int, audience: int, message: string}
     */
    public static function send(array $report): array
    {
        $notice = self::compose($report);
        $recipients = self::audience();

        $notified = 0;
        $suppressed = 0;
        $since = now()->subMinutes(self::COOLDOWN_MINUTES);

        foreach ($recipients as $user) {
            $duplicate = AppNotification::query()
                ->where('user_id', $user->id)
                ->where('type', self::TYPE)
                ->where('action_url', $notice['action_url'])
                ->where('title', $notice['title'])
                ->where('is_read', false)
                ->where('created_at', '>=', $since)
                ->exists();

            if ($duplicate) {
                $suppressed++;

                continue;
            }

            AppNotification::notifyUser(
                $user->id,
                $notice['title'],
                $notice['message'],
                self::TYPE,
                $notice['action_url']
            );
            $notified++;
        }

        Log::info('[Diagnostics] Planning Officer notice sent.', [
            'report_id' => $report['id'] ?? null,
            'reference_code' => $report['reference_code'] ?? null,
            'audience' => $recipients->count(),
            'notified' => $notified,
            'suppressed' => $suppressed,
        ]);

        return [
            'notified' => $notified,
            'suppressed' => $suppressed,
            'audience' => $recipients->count(),
            'message' => $suppressed > 0
                ? sprintf(
                    'Notified %d of %d active Planning Officer(s). %d already had this notice and were skipped.',
                    $notified,
                    $recipients->count(),
                    $suppressed
                )
                : sprintf('Notified %d active Planning Officer(s).', $notified),
        ];
    }

    /**
     * Keep a value to a short, single-line, printable string.
     *
     * Whitespace is collapsed so a multi-line remote value cannot reshape a
     * notification, and control characters are dropped.
     */
    private static function safeScalar(mixed $value): ?string
    {
        if (! is_string($value) && ! is_numeric($value)) {
            return null;
        }

        $clean = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $value) ?? '';
        $clean = preg_replace('/\s+/u', ' ', $clean) ?? '';

        return trim($clean);
    }
}
