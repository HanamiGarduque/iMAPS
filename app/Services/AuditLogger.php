<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

class AuditLogger
{
    public static function log(
        int    $applicationId,
        string $action,
        ?int   $performedBy,
        string $note = ''
    ): void {
        try {
            DB::table('audit_trail')->insert([
                'application_id' => $applicationId,
                'action'         => $action,
                'performed_by'   => $performedBy,
                'note'           => $note,
                'performed_at'   => now(),
            ]);
        } catch (\Exception $e) {
            Log::error('[AuditLogger] Failed: ' . $e->getMessage());
        }
    }
}