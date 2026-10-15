<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Old reassignment notes said "moved from officer 4" / "from 32". Name the
    // previous holder like the new one is named. Users that no longer exist keep
    // the old wording.
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement("
            UPDATE audit_trail a
            SET note = regexp_replace(a.note, 'moved from officer [0-9]+ to', 'moved from ' || u.name || ' (' || u.id || ') to')
            FROM users u
            WHERE a.note ~ 'moved from officer [0-9]+ to'
              AND u.id = substring(a.note from 'moved from officer ([0-9]+) to')::int
        ");

        DB::statement("
            UPDATE audit_trail a
            SET note = regexp_replace(a.note, '^(Inspector for .+? moved from) [0-9]+ to', '\\1 ' || u.name || ' (' || u.id || ') to')
            FROM users u
            WHERE a.action = 'SITE_INSPECTOR_REASSIGNED'
              AND a.note ~ '^Inspector for .+? moved from [0-9]+ to'
              AND u.id = substring(a.note from '^Inspector for .+? moved from ([0-9]+) to')::int
        ");
    }

    public function down(): void
    {
        // The old text only held the id; it is not restored.
    }
};
