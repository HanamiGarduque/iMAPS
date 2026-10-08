<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Brings the official IMAPS_DB up to date with the NEW additions from the
 * IMAPS_1006 copy. Intentionally NOT applied (IMAPS_DB is the source of truth):
 *   - zoning_applications business_name rename
 *   - site_inspections.status default ('Pending' stays)
 *   - timestamp precision / default changes on delivery columns
 *   - notif_sqlcheck.users scratch table
 *   - application_status_tracks (IMAPS_DB already has the extra columns)
 *
 * Optional: set ADD_PARCEL_FK to true to also add the foreign key
 * site_inspections.parcel_id -> parcels.id (IMAPS_1006 has this).
 *
 * CAVEATS
 *  1. Orphans: the migration checks for site_inspections rows whose parcel_id
 *     has no matching parcels.id and aborts BEFORE touching the schema if any
 *     are found. Fix or null them out, then re-run. Manual check:
 *       SELECT id, parcel_id FROM site_inspections si
 *       WHERE parcel_id IS NOT NULL
 *         AND NOT EXISTS (SELECT 1 FROM parcels p WHERE p.id = si.parcel_id);
 *  2. Cascade: IMAPS_1006 uses ON DELETE CASCADE, so deleting a parcel also
 *     deletes its site_inspections and (through their own cascade) their
 *     inspection_delivery_attempts. If inspections must be kept, set
 *     PARCEL_FK_ON_DELETE to 'set null' (parcel_id is nullable) or 'restrict'.
 */
return new class extends Migration
{
    private const ADD_PARCEL_FK = false;

    /** 'cascade' (as in IMAPS_1006) | 'set null' | 'restrict' */
    private const PARCEL_FK_ON_DELETE = 'cascade';

    public function up(): void
    {
        // ---- New tables -------------------------------------------------

        if (! Schema::hasTable('application_sequences')) {
            Schema::create('application_sequences', function (Blueprint $table) {
                $table->string('type_code', 4);
                $table->integer('year');
                $table->integer('last_seq');

                $table->primary(['type_code', 'year']);
            });
        }

        if (! Schema::hasTable('report_action_audit')) {
            Schema::create('report_action_audit', function (Blueprint $table) {
                $table->id();
                $table->uuid('report_id');
                $table->string('action', 60);
                $table->string('from_status', 20);
                $table->string('to_status', 20);
                $table->foreignId('performed_by')->constrained('users')->restrictOnDelete();
                $table->string('performed_by_name', 255);
                $table->timestamp('performed_at', 0)->useCurrent();

                // Each action can be recorded only once per report
                $table->unique(['report_id', 'action']);
            });
        }

        if (! Schema::hasTable('report_escalations')) {
            Schema::create('report_escalations', function (Blueprint $table) {
                $table->id();
                $table->uuid('report_id');
                $table->string('status', 20)->default('open');
                $table->foreignId('created_by')->constrained('users')->restrictOnDelete();
                $table->timestamp('created_at', 0)->useCurrent();

                $table->text('recommendation')->nullable();
                $table->foreignId('recommendation_recorded_by')->nullable()
                    ->constrained('users')->restrictOnDelete();
                $table->timestamp('recommendation_at', 0)->nullable();

                $table->foreignId('closed_by')->nullable()
                    ->constrained('users')->restrictOnDelete();
                $table->timestamp('closed_at', 0)->nullable();
                $table->text('closure_note')->nullable();
            });
        }

        // ---- New columns ------------------------------------------------

        Schema::table('site_inspections', function (Blueprint $table) {
            if (! Schema::hasColumn('site_inspections', 'is_compliant')) {
                $table->boolean('is_compliant')->nullable();
            }
            if (! Schema::hasColumn('site_inspections', 'findings')) {
                $table->text('findings')->nullable();
            }
        });

        // ---- New indexes ------------------------------------------------

        Schema::table('site_inspections', function (Blueprint $table) {
            $table->index('inspector_id');            // site_inspections_inspector_id_index
            $table->index('zoning_application_id');   // site_inspections_zoning_application_id_index
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->index('user_id', 'notifications_broadcast_index');
        });

        Schema::table('technical_reviews', function (Blueprint $table) {
            $table->index('reviewed_site_inspection_id'); // technical_reviews_reviewed_site_inspection_id_index
            $table->index('zoning_application_id');       // technical_reviews_zoning_application_id_index
        });

        // ---- Optional foreign key --------------------------------------

        if (self::ADD_PARCEL_FK) {
            $this->assertNoOrphanedParcelIds();

            Schema::table('site_inspections', function (Blueprint $table) {
                $table->foreign('parcel_id')
                    ->references('id')->on('parcels')
                    ->onDelete(self::PARCEL_FK_ON_DELETE);
            });
        }

        // ---- Comments (documentation only) ------------------------------

        foreach ($this->comments() as [$table, $column, $new, $old]) {
            $this->comment($table, $column, $new);
        }
    }

    public function down(): void
    {
        foreach ($this->comments() as [$table, $column, $new, $old]) {
            $this->comment($table, $column, $old);
        }

        if (self::ADD_PARCEL_FK) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->dropForeign('site_inspections_parcel_id_foreign');
            });
        }

        Schema::table('technical_reviews', function (Blueprint $table) {
            $table->dropIndex('technical_reviews_zoning_application_id_index');
            $table->dropIndex('technical_reviews_reviewed_site_inspection_id_index');
        });

        Schema::table('notifications', function (Blueprint $table) {
            $table->dropIndex('notifications_broadcast_index');
        });

        Schema::table('site_inspections', function (Blueprint $table) {
            $table->dropIndex('site_inspections_zoning_application_id_index');
            $table->dropIndex('site_inspections_inspector_id_index');
            $table->dropColumn(['is_compliant', 'findings']);
        });

        Schema::dropIfExists('report_escalations');
        Schema::dropIfExists('report_action_audit');
        Schema::dropIfExists('application_sequences');
    }

    /**
     * [table, column|null, new comment, previous comment (restored on down)|null]
     */
    private function comments(): array
    {
        return [
            // inspection_delivery_attempts
            ['inspection_delivery_attempts', null,
                'Append-only history of iMAPS -> FieldSync bridge delivery attempts for one exact inspection round. Not the source of truth for current state; site_inspections.delivery_status is.',
                null],
            ['inspection_delivery_attempts', 'attempt_number',
                'Per-inspection sequence starting at 1. Scoped to site_inspection_id, never global.',
                null],
            ['inspection_delivery_attempts', 'source',
                'Who initiated the attempt: initial_dispatch | automatic_retry | planning_officer_retry | legacy_reconciliation.',
                null],
            ['inspection_delivery_attempts', 'outcome',
                'Attempt result: pending | delivered | failed.',
                null],
            ['inspection_delivery_attempts', 'failure_category',
                'Required when outcome = failed; must be NULL when outcome is pending or delivered.',
                null],
            ['inspection_delivery_attempts', 'safe_message',
                'Short normalized user-facing explanation. Never a raw exception dump, credential, token, header, or signed URL.',
                null],
            ['inspection_delivery_attempts', 'queue_job_uuid',
                'Stable Laravel queue payload UUID of the queued PushInspectionToSupabase dispatch that produced this attempt. Automatic retries of one dispatch share this UUID and each create a new attempt_number. NULL for legacy_reconciliation rows and for any synchronous execution that has no queue job.',
                'Stable Laravel queue payload UUID of the queued dispatch that produced this attempt. Automatic retries share it; NULL for legacy reconciliation or a synchronous execution with no queue job.'],

            // site_inspections
            ['site_inspections', 'delivery_status',
                'CURRENT bridge delivery state: pending_delivery | delivered | delivery_failed. NULL means never established (historical pre-bridge row or not yet reconciled). Never backfilled speculatively.',
                'CURRENT bridge delivery state: pending_delivery | delivered | delivery_failed. NULL means never established; never backfilled speculatively.'],
            ['site_inspections', 'last_delivery_attempt_at',
                'Timestamp of the most recent delivery attempt. NULL when no attempt has been recorded.',
                'Timestamp of the most recent delivery attempt.'],
            ['site_inspections', 'delivered_at',
                'Timestamp of the most recent CONFIRMED successful delivery. Retained as history and never erased by a later state change.',
                'Timestamp of the most recent CONFIRMED successful delivery. Retained as history; never erased by a later state change.'],
            ['site_inspections', 'last_delivery_failure_category',
                'Normalized category of the most recent failed attempt. NULL unless the most recent attempt failed.',
                'Normalized category of the most recent failed attempt.'],

            // notifications
            ['notifications', null,
                'In-app notifications. user_id NULL = broadcast to every user (AppNotification::notifyAll). Rows are written by App\Models\AppNotification; created_at/updated_at are nullable with no default, matching the shipped migration.',
                null],
            ['notifications', 'user_id',
                'Receiving user. NULL means broadcast to all users; scopeForUser() matches both the user id and NULL.',
                null],
            ['notifications', 'type',
                'Free-form category chosen by the writer, e.g. application_created, status_updated, inspection_assigned, inspection_completed, forecast_generated, user_registered. No CHECK constraint: the shipped model accepts any string.',
                null],
            ['notifications', 'action_url',
                'In-app path the notification links to, e.g. /applications/144. A relative path only; never an external or signed URL.',
                null],
            ['notifications', 'is_read',
                'Unread until marked. The header bell polls the unread count every 30 seconds.',
                null],
            ['notifications', 'read_at',
                'Set when the notification is first marked read. NULL while unread.',
                null],
        ];
    }

    private function assertNoOrphanedParcelIds(): void
    {
        $orphans = DB::table('site_inspections as si')
            ->whereNotNull('si.parcel_id')
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('parcels as p')
                    ->whereColumn('p.id', 'si.parcel_id');
            })
            ->limit(20)
            ->pluck('si.id');

        if ($orphans->isNotEmpty()) {
            throw new \RuntimeException(
                'Cannot add site_inspections.parcel_id foreign key: these site_inspections.id '
                . 'values reference a missing parcel (showing up to 20): '
                . $orphans->implode(', ')
                . '. Fix or NULL their parcel_id, then re-run.'
            );
        }
    }

    private function comment(string $table, ?string $column, ?string $text): void
    {
        $target = $column ? "COLUMN {$table}.{$column}" : "TABLE {$table}";
        $value = $text === null ? 'NULL' : DB::getPdo()->quote($text);
        DB::statement("COMMENT ON {$target} IS {$value}");
    }
};
