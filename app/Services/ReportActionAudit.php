<?php

namespace App\Services;

use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/** Local-only append after proven remote CAS. This class never calls Supabase. */
class ReportActionAudit
{
    public function record(array $event): array
    {
        for ($attempt = 0; $attempt < 2; $attempt++) {
            try {
                // A separate transaction lets PostgreSQL recover from 23505 before re-reading.
                DB::transaction(fn () => DB::table('report_action_audit')->insert($event), 1);
                return ['outcome' => 'recorded'];
            } catch (Throwable $e) {
                $state = $e instanceof QueryException ? ($e->errorInfo[0] ?? null) : null;
                $constraint = null;
                if ($state === '23505') {
                    preg_match('/unique constraint "([^"]+)"/', $e->errorInfo[2] ?? '', $match);
                    $constraint = $match[1] ?? null;
                }
                // Never absorb an opposite terminal, even if a same-action row also exists.
                if ($constraint === 'report_action_audit_one_terminal_unique') {
                    return $this->failed($event, 'opposite_terminal', true);
                }
                if ($constraint === 'report_action_audit_report_id_action_unique') {
                    try {
                        $row = DB::table('report_action_audit')->where('report_id', $event['report_id'])
                            ->where('action', $event['action'])->first();
                        if ($row !== null) {
                            $stored = (array) $row;
                            $stored['performed_by'] = (int) $stored['performed_by'];
                            $same = true;
                            foreach (['report_id', 'action', 'from_status', 'to_status', 'performed_by', 'performed_by_name'] as $key) {
                                $same = $same && $stored[$key] === $event[$key];
                            }
                            if ($same) {
                                return ['outcome' => 'already_recorded'];
                            }
                        }
                        return $this->failed($event, 'same_action_mismatch', true);
                    } catch (Throwable) {
                        return $this->failed($event, 'duplicate_read_failed');
                    }
                }
                // Only transient local failures are retryable; the remote PATCH is never in this loop.
                $transient = in_array($state, ['40001', '40P01', '55P03'], true)
                    || (is_string($state) && str_starts_with($state, '08'));
                if ($attempt === 0 && $transient) {
                    continue;
                }
                return $this->failed($event, $state === '23505' ? 'unrecognized_unique_constraint' : 'audit_write_failed');
            }
        }
    }

    private function failed(array $event, string $classification, bool $conflict = false): array
    {
        Log::critical('Report updated remotely; local audit requires reconciliation.', [
            'report_id' => $event['report_id'], 'action' => $event['action'], 'actor_id' => $event['performed_by'],
            'time' => now()->toIso8601String(), 'classification' => $classification,
        ]);
        return ['outcome' => $conflict ? 'conflict' : 'failed', 'classification' => $classification];
    }
}
