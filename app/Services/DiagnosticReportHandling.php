<?php

namespace App\Services;

use App\Models\User;
use App\Support\DiagnosticTextSanitizer;
use App\Support\InspectorReportNotice;
use App\Support\ReportingVisibility;
use App\Support\SupportReportResolution;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\ValidationException;
use Throwable;

class DiagnosticReportHandling
{
    public function __construct(private DiagnosticReportReader $reader, private SupabaseService $supabase,
        private ReportingVisibility $visibility, private SupportReportResolution $resolution, private ReportActionAudit $audit,
        private InspectorReportNotice $notice) {}

    public function handle(User $viewer, string $id, array $input): array
    {
        $event = null;
        $notificationReport = [];
        try {
            // One attempt only: automatic transaction retries would replay the remote side effect.
            $result = DB::transaction(function () use ($viewer, $id, $input, &$event, &$notificationReport) {
                $read = $this->reader->find($id);
                abort_unless($read['ok'], 503, 'The report could not be loaded. Please refresh.');
                abort_if($read['report'] === null, 404);
                $report = $read['report'];
                $actor = $viewer->fresh();
                abort_unless($actor && $actor->is_active, 403);
                $context = $report['report_type'] === 'application_support' ? $this->resolution->resolve($report, true) : null;
                $allowed = $this->visibility->handlingStatuses($actor, $report, $context);
                abort_unless($allowed, 403);
                $status = Validator::make($input, ['status' => 'required|string|in:in_review,resolved,wont_fix'])->validate()['status'];
                abort_unless(in_array($status, $allowed, true), 403);
                $from = $report['status'];
                if (! in_array($status, $this->visibility->handlingActions($actor, $report, $context), true)) {
                    return $this->outcome('conflict', 409, 'The report has changed or is already final. Refresh to see its current state.', false, false, $from);
                }
                $data = ['status' => $status];
                $name = (string) $actor->name;
                if (mb_strlen($name) > 255 || ! preg_match('/\S/u', $name)) {
                    throw ValidationException::withMessages(['status' => 'Your account needs a valid display name before handling reports.']);
                }
                if ($status === 'in_review') {
                    Validator::make($input, ['response_message' => 'prohibited'])->validate();
                } else {
                    $raw = $input['response_message'] ?? null;
                    $raw = is_string($raw) ? trim($raw) : $raw;
                    Validator::make(['response_message' => $raw], ['response_message' => 'required|string|max:2000'])->validate();
                    $text = trim(DiagnosticTextSanitizer::sanitize($raw));
                    Validator::make(['response_message' => $text], ['response_message' => ['required', 'string', 'max:2000', 'regex:/\S/u']])->validate();
                    // MARKUP SHAPE, NOT THE CHARACTER. A plain measurement like
                    // "width <10m" is legitimate inspector prose, so only a real
                    // tag opener is refused; strip_tags() cannot tell them apart
                    // because it treats " <10m and depth >" as a tag.
                    if (preg_match('/<\s*[a-z!\/?]/i', $text) || str_contains($text, "\0")) {
                        throw ValidationException::withMessages(['response_message' => 'Write the official response as plain text, without HTML.']);
                    }
                    $data += ['response_message' => $text, 'responded_by_name' => $name, 'responded_at' => now()->toIso8601String()];
                }
                try {
                    $response = $this->supabase->updateDiagnosticReportById($id, $from, $data);
                } catch (ConnectionException) {
                    // ONLY a lost connection is an unknown remote outcome: the
                    // request may have been applied. A precondition refusal is
                    // not caught here, so it cannot be misreported as unconfirmed.
                    return $this->uncertain($id, $actor->id);
                }
                if (! $response->successful()) {
                    return $this->uncertain($id, $actor->id);
                }
                $rows = $response->json();
                if ($rows === []) {
                    $current = $this->reader->find($id);
                    return $this->outcome('conflict', 409, 'The report changed while you were handling it. Refresh to see its current state.',
                        false, false, $current['report']['status'] ?? null);
                }
                if (! is_array($rows) || ! array_is_list($rows) || count($rows) !== 1
                    || ($rows[0]['id'] ?? null) !== $id || ($rows[0]['status'] ?? null) !== $status) {
                    return $this->uncertain($id, $actor->id);
                }
                // The reader removes inspector_id from browser props. Use the proven CAS row,
                // never browser input, local reporter attribution, or application ownership.
                $notificationReport = array_intersect_key($rows[0], array_flip(['id', 'status', 'inspector_id', 'reference_code']));
                // $from is the fresh status in the successful CAS predicate, never browser state.
                $event = ['report_id' => $id, 'action' => match ($status) {
                    'in_review' => 'report_review_started', 'resolved' => 'report_resolved', 'wont_fix' => 'report_wont_fix',
                }, 'from_status' => $from, 'to_status' => $status, 'performed_by' => (int) $actor->id,
                    'performed_by_name' => $name, 'performed_at' => now()];
                return null;
            }, 1);
        } catch (Throwable $e) {
            if ($event === null) {
                throw $e;
            }
            // Even an ownership-transaction commit failure cannot undo the remote CAS.
            Log::critical('Report updated remotely; local transaction failed.', [
                'report_id' => $id, 'action' => $event['action'], 'actor_id' => $event['performed_by'],
                'time' => now()->toIso8601String(), 'classification' => 'local_transaction_failed_after_cas',
            ]);
            return $this->partial('partial_success', 207, $event['to_status']);
        }
        if ($event === null) {
            return $result;
        }
        $recorded = $this->audit->record($event);
        if ($recorded['outcome'] === 'conflict') {
            return $this->partial('audit_conflict', 409, $event['to_status']);
        }
        if ($recorded['outcome'] === 'failed') {
            return $this->partial('partial_success', 207, $event['to_status']);
        }
        try {
            $notification = $this->notice->send($notificationReport);
        } catch (Throwable) {
            $notification = 'delivery_unconfirmed';
        }
        if (! in_array($notification, ['delivered', 'already_present', 'not_applicable'], true)) {
            Log::warning('Report and audit saved; inspector notification not confirmed.', [
                'report_id' => $id, 'status' => $event['to_status'], 'classification' => $notification,
                'time' => now()->toIso8601String(),
            ]);
            return $this->outcome('notification_failed', 207,
                'Report updated and audit recorded, but inspector notification delivery could not be confirmed. Do not submit the report action again. Contact an administrator.',
                true, true, $event['to_status']) + ['notification_status' => $notification];
        }
        return $this->outcome('success', 200, 'Report updated and audit recorded.', true, true, $event['to_status'])
            + ['notification_status' => $notification];
    }

    private function partial(string $outcome, int $http, string $status): array
    {
        return $this->outcome($outcome, $http,
            'The report update already succeeded, but local audit recording needs reconciliation. Do not submit the action again. Contact an administrator.',
            true, false, $status);
    }

    private function uncertain(string $id, int $actorId): array
    {
        Log::critical('Report update outcome could not be confirmed.', ['report_id' => $id, 'actor_id' => $actorId,
            'time' => now()->toIso8601String(), 'classification' => 'remote_outcome_unconfirmed']);
        return $this->outcome('remote_unconfirmed', 503,
            'The report update could not be confirmed. Refresh to check its current state before taking any further action.', false, false, null);
    }

    private function outcome(string $outcome, int $http, string $message, bool $remoteUpdated, bool $auditRecorded, ?string $status): array
    {
        return ['outcome' => $outcome, 'http_status' => $http, 'message' => $message, 'remote_updated' => $remoteUpdated,
            'audit_recorded' => $auditRecorded, 'current_status' => $status];
    }
}
