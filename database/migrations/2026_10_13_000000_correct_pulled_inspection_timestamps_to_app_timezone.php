<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * sync:pull-inspections stored FieldSync's UTC instants as UTC wall-clock in
 * `timestamp without time zone` columns that the app reads in its own timezone,
 * so every pulled submitted_at / gps_confirmed_at shows 8 hours early.
 *
 * That command is the only writer of these two columns, so every non-null value
 * carries the same shift. The command now converts before saving; this corrects
 * the rows it wrote before that. start.sh runs migrations before the scheduler
 * starts, so no corrected-at-source value can be shifted twice.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->shift('UTC', config('app.timezone'));
    }

    public function down(): void
    {
        $this->shift(config('app.timezone'), 'UTC');
    }

    private function shift(string $from, string $to): void
    {
        DB::update(
            "UPDATE site_inspections SET
                submitted_at     = (submitted_at     AT TIME ZONE ?) AT TIME ZONE ?,
                gps_confirmed_at = (gps_confirmed_at AT TIME ZONE ?) AT TIME ZONE ?
             WHERE submitted_at IS NOT NULL OR gps_confirmed_at IS NOT NULL",
            [$from, $to, $from, $to]
        );
    }
};
