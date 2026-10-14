<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Reassignment history notes said "inspection round 48", which was the
    // inspection ID, not the visit number. Rewrite them to the round's position
    // in its parcel's chain (same rule as InspectionRoundNumbering). Rows with no
    // parcel have no provable round and are left as they are.
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            UPDATE audit_trail a
            SET note = regexp_replace(a.note, '^Inspector for inspection round [0-9]+ moved', 'Inspector for inspection round ' || r.round_number || ' moved')
            FROM (
                SELECT id, ROW_NUMBER() OVER (PARTITION BY zoning_application_id, parcel_id ORDER BY id) AS round_number
                FROM site_inspections
                WHERE parcel_id IS NOT NULL
            ) r
            WHERE a.action IN ('SITE_INSPECTOR_ASSIGNED', 'SITE_INSPECTOR_REASSIGNED')
              AND a.note ~ '^Inspector for inspection round [0-9]+ moved'
              AND r.id = substring(a.note from '^Inspector for inspection round ([0-9]+) moved')::int
        ");
    }

    public function down(): void
    {
        // The original text only held the inspection id; it cannot be restored.
    }
};
