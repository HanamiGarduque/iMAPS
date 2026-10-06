<?php

namespace App\Support;

use App\Services\SupabaseService;
use Illuminate\Support\Str;
use Ramsey\Uuid\Uuid;
use Throwable;

/** Called only after terminal CAS and authoritative local audit confirmation. */
class InspectorReportNotice
{
    public function __construct(private SupabaseService $supabase) {}

    public function send(array $report): string
    {
        $status = $report['status'] ?? null;
        if (! in_array($status, ['resolved', 'wont_fix'], true)) {
            return 'not_applicable';
        }
        if (! Str::isUuid($report['id'] ?? '') || ! Str::isUuid($report['inspector_id'] ?? '')
            || ! is_string($report['reference_code'] ?? null) || trim($report['reference_code']) === '') {
            return 'invalid_report_identity';
        }
        $identity = [
            'id' => Uuid::uuid5(Uuid::NAMESPACE_URL, 'imaps:inspector-report-terminal:'.strtolower($report['id']).':'.$status)->toString(),
            'inspector_id' => strtolower($report['inspector_id']),
            'event_type' => 'report_'.$status,
        ];
        $reference = Str::limit(DiagnosticTextSanitizer::sanitize($report['reference_code']), 64);
        $payload = $identity + [
            'title' => $status === 'resolved' ? 'Report resolved' : "Report closed — Won't fix",
            'subtitle' => 'MPDO responded to '.$reference.'. View the official response in My Reports.',
        ];
        $failure = 'delivery_unconfirmed';
        try {
            // Ignore conflicts, never merge: a replay must not reset is_read or timestamps.
            $response = $this->supabase->insertInspectorReportActivity($payload);
            $rows = $response->json();
            if ($response->successful() && is_array($rows) && array_is_list($rows) && count($rows) === 1) {
                return $this->matches($rows[0], $identity) ? 'delivered' : 'identity_conflict';
            }
            if ($response->clientError()) {
                $failure = 'rejected';
            }
        } catch (Throwable) {
            // A lost acknowledgement can mean delivery succeeded. Read back once, never POST again.
        }
        try {
            $response = $this->supabase->select('activity_log', 'id,inspector_id,event_type', ['id' => 'eq.'.$identity['id']], 8);
            $rows = $response->json();
            if ($response->successful() && is_array($rows) && array_is_list($rows) && count($rows) === 1) {
                return $this->matches($rows[0], $identity) ? 'already_present' : 'identity_conflict';
            }
        } catch (Throwable) {
            // No remote body, exception text, or official response is logged or returned.
        }
        // ponytail: no durable redelivery; user-deletable activity rows need a separate ledger before adding recovery.
        return $failure;
    }

    private function matches(mixed $row, array $identity): bool
    {
        return is_array($row) && ($row['id'] ?? null) === $identity['id']
            && ($row['inspector_id'] ?? null) === $identity['inspector_id']
            && ($row['event_type'] ?? null) === $identity['event_type'];
    }
}
