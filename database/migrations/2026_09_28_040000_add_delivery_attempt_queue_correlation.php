<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Loop 9B safety revision: queue-dispatch correlation for delivery attempts.
 *
 * The 9B safety review found, before push, that a terminal Laravel queued
 * command could not be correlated with its own durable attempt rows. The only
 * available rule was "the globally latest attempt", which becomes ambiguous as
 * soon as queue tries exceed 1 and a newer dispatch from a different job has
 * failed but is still retryable.
 *
 * This migration adds exactly one nullable correlation column and the index
 * that serves the terminal-correlation lookup. It mirrors
 * database/sql/2026_09_28_add_delivery_attempt_queue_correlation.sql exactly.
 *
 * TYPE: native `uuid`, not a length-guessed varchar. Laravel 12.58.0 sets the
 * payload uuid with `Str::uuid()`, and `Illuminate\Queue\Jobs\Job::uuid()` is a
 * concrete accessor, so the value is always a canonical UUID on the database
 * driver too.
 *
 * NOT UNIQUE on purpose: the retries of one dispatch share one UUID and each
 * create a new attempt_number.
 *
 * No backfill. The existing legacy_reconciliation attempts stay NULL, because
 * 9A-R deliberately recorded no queue correlation and deriving one now would
 * fabricate business history.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('inspection_delivery_attempts', 'queue_job_uuid')) {
            Schema::table('inspection_delivery_attempts', function (Blueprint $table) {
                $table->uuid('queue_job_uuid')->nullable()->after('site_inspection_id')
                    ->comment('Stable Laravel queue payload UUID of the queued dispatch that produced this attempt. Automatic retries share it; NULL for legacy reconciliation or a synchronous execution with no queue job.');
            });
        }

        // Partial correlation index. Not unique: retries of one dispatch share a
        // UUID. Partial because every historical and legacy row is NULL.
        if (! $this->indexExists(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_queue_correlation_index'
        )) {
            DB::statement(
                'CREATE INDEX IF NOT EXISTS inspection_delivery_attempts_queue_correlation_index'
                . ' ON inspection_delivery_attempts (site_inspection_id, queue_job_uuid, attempt_number DESC)'
                . ' WHERE queue_job_uuid IS NOT NULL'
            );
        }
    }

    public function down(): void
    {
        DB::statement(
            'DROP INDEX IF EXISTS inspection_delivery_attempts_queue_correlation_index'
        );

        if (Schema::hasColumn('inspection_delivery_attempts', 'queue_job_uuid')) {
            Schema::table('inspection_delivery_attempts', function (Blueprint $table) {
                $table->dropColumn('queue_job_uuid');
            });
        }
    }

    private function indexExists(string $table, string $index): bool
    {
        return DB::selectOne(
            'SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?',
            [$table, $index]
        ) !== null;
    }
};
