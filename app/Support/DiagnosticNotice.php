<?php

namespace App\Support;

use App\Models\AppNotification;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/** Admin reminder for ONE current owner. Historical diagnostic links remain valid. */
class DiagnosticNotice
{
    public const COOLDOWN_MINUTES = 30;
    public const SUMMARY_MAX_CHARS = 120;
    public const TYPE = 'application_support';

    public function __construct(private SupportReportResolution $resolution, private ReportingVisibility $visibility) {}

    public static function compose(array $report): array
    {
        $reference = DiagnosticTextSanitizer::sanitize($report['reference_code'] ?? 'Unreferenced');
        $headline = Str::limit(DiagnosticTextSanitizer::sanitize($report['title'] ?? ''), self::SUMMARY_MAX_CHARS);
        return ['title' => 'Application Support '.$reference,
            'message' => DiagnosticTextSanitizer::sanitize('FieldSync support '.$reference.' needs your review. '.$headline),
            'action_url' => Str::isUuid($report['id'] ?? '') ? '/diagnostics/'.$report['id'] : '/diagnostics'];
    }

    public function send($viewer, array $report): array
    {
        abort_unless($viewer?->role === 'Admin' && ($report['report_type'] ?? null) === 'application_support', 403);
        return DB::transaction(function () use ($viewer, $report) {
            // Resolve again on POST, locking the validated application before reading its
            // CURRENT owner. Reassignment and concurrent notices serialize on this row.
            $context = $this->resolution->resolve($report, true);
            if (! $this->visibility->canNotify($viewer, $report, $context)) {
                return ['notified' => 0, 'suppressed' => 0, 'message' => $context['resolved']
                    ? 'No current Planning Officer assigned. No notification sent.'
                    : 'Application context unavailable. No notification sent.'];
            }
            $owner = $context['owner'];
            $notice = self::compose($report);
            $duplicate = AppNotification::query()->where('user_id', $owner['id'])->where('type', self::TYPE)
                ->where('action_url', $notice['action_url'])->where('created_at', '>=', now()->subMinutes(self::COOLDOWN_MINUTES))->exists();
            if (! $duplicate) {
                AppNotification::notifyUser($owner['id'], $notice['title'], $notice['message'], self::TYPE, $notice['action_url']);
            }
            return ['notified' => $duplicate ? 0 : 1, 'suppressed' => $duplicate ? 1 : 0,
                'recipient' => $owner, 'message' => $duplicate
                    ? $owner['name'].' already received this support notice recently.' : 'Notified '.$owner['name'].'.'];
        });
    }
}
