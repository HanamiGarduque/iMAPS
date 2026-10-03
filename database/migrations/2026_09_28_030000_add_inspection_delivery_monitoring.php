<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Loop 9A: inspection delivery monitoring schema foundation.
 *
 * Bridge DELIVERY state is a NEW business fact that is deliberately separate
 * from the FieldSync task lifecycle:
 *
 *   delivery lifecycle: pending_delivery -> delivered
 *                        pending_delivery -> delivery_failed
 *   task lifecycle:     assigned -> in_progress -> completed
 *
 * The task lifecycle is stored in `site_inspections.status` and mirrored into
 * `field_jobs.status` on the remote side. Neither is modified by this migration.
 * There is no "retrying" business state: a retry is an attempt row, not a
 * distinct business condition.
 *
 * This migration is ADDITIVE and IDEMPOTENT. It performs NO historical backfill:
 * every pre-existing `site_inspections` row keeps `delivery_status = NULL`,
 * because a delivery state that the business flow never recorded must never be
 * invented. Specifically:
 *
 *   - inspections 3-21 and 24 are pre-bridge historical records and are
 *     permanently excluded from delivery monitoring;
 *   - inspections 25-30 are proven post-bridge delivery failures whose
 *     NULL -> delivery_failed reconciliation is a separately authorized
 *     execution step, not part of schema creation.
 *
 * Laravel `failed_jobs` remains generic queue infrastructure. It is NOT used as
 * a business delivery record: it has no foreign key to the inspection round and
 * would couple delivery business state to unrelated queued work.
 *
 * No column stores a raw exception dump, credential, token, header, or signed
 * URL. `safe_message` is a short normalized user-facing explanation only.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ------------------------------------------------------------------
        // 1. CURRENT delivery summary on site_inspections (all nullable).
        // ------------------------------------------------------------------
        if (! Schema::hasColumn('site_inspections', 'delivery_status')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->string('delivery_status', 32)->nullable()->after('status')
                    ->comment('CURRENT bridge delivery state: pending_delivery | delivered | delivery_failed. NULL means never established; never backfilled speculatively.');
            });
        }

        if (! Schema::hasColumn('site_inspections', 'last_delivery_attempt_at')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->timestamp('last_delivery_attempt_at')->nullable()->after('delivery_status')
                    ->comment('Timestamp of the most recent delivery attempt.');
            });
        }

        if (! Schema::hasColumn('site_inspections', 'delivered_at')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->timestamp('delivered_at')->nullable()->after('last_delivery_attempt_at')
                    ->comment('Timestamp of the most recent CONFIRMED successful delivery. Retained as history; never erased by a later state change.');
            });
        }

        if (! Schema::hasColumn('site_inspections', 'last_delivery_failure_category')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->string('last_delivery_failure_category', 48)->nullable()->after('delivered_at')
                    ->comment('Normalized category of the most recent failed attempt.');
            });
        }

        // ------------------------------------------------------------------
        // 2. Append-only delivery attempt history.
        //
        // ON DELETE CASCADE matches the established contract for operational
        // history owned by one inspection round (site_inspection_assignments).
        // Business decision records (technical_reviews) intentionally differ.
        // ------------------------------------------------------------------
        if (! Schema::hasTable('inspection_delivery_attempts')) {
            Schema::create('inspection_delivery_attempts', function (Blueprint $table) {
                $table->id();
                $table->unsignedBigInteger('site_inspection_id');
                $table->unsignedInteger('attempt_number');
                $table->string('source', 32);
                $table->string('outcome', 16);
                $table->string('failure_category', 48)->nullable();
                $table->text('safe_message')->nullable();
                $table->timestamp('attempted_at')->useCurrent();
                $table->timestamp('completed_at')->nullable();
                $table->timestamp('created_at')->useCurrent();

                $table->unique(
                    ['site_inspection_id', 'attempt_number'],
                    'inspection_delivery_attempts_inspection_attempt_unique'
                );

                $table->index(
                    ['site_inspection_id', 'attempted_at'],
                    'inspection_delivery_attempts_inspection_attempted_index'
                );

                $table->foreign('site_inspection_id', 'inspection_delivery_attempts_inspection_foreign')
                    ->references('id')
                    ->on('site_inspections')
                    ->cascadeOnDelete();
            });
        }

        // Partial index matching the forward SQL exactly. Every historical row
        // is delivery_status NULL, so an unfiltered index would be almost
        // entirely empty; the partial form stays tiny and matches the Loop 9C
        // and 9D predicates precisely.
        if (! $this->indexExists('site_inspections', 'site_inspections_delivery_status_index')) {
            DB::statement(
                'CREATE INDEX IF NOT EXISTS site_inspections_delivery_status_index'
                . ' ON site_inspections (delivery_status)'
                . ' WHERE delivery_status IS NOT NULL'
            );
        }

        $this->addCheckConstraints();
    }

    public function down(): void
    {
        $this->dropCheckConstraints();

        if (Schema::hasTable('inspection_delivery_attempts')) {
            Schema::drop('inspection_delivery_attempts');
        }

        foreach ([
            'last_delivery_failure_category',
            'delivered_at',
            'last_delivery_attempt_at',
            'delivery_status',
        ] as $column) {
            if (Schema::hasColumn('site_inspections', $column)) {
                Schema::table('site_inspections', function (Blueprint $table) use ($column) {
                    $table->dropColumn($column);
                });
            }
        }
    }

    /**
     * Closed vocabularies. These mirror database/sql/2026_09_28_add_inspection_delivery_monitoring.sql
     * exactly so a fresh install and the 0921 forward path agree.
     */
    private function addCheckConstraints(): void
    {
        $this->addCheck(
            'site_inspections',
            'site_inspections_delivery_status_check',
            "delivery_status IS NULL OR delivery_status IN ('pending_delivery', 'delivered', 'delivery_failed')"
        );

        $this->addCheck(
            'site_inspections',
            'site_inspections_delivery_failure_category_check',
            $this->vocabularyCheck('last_delivery_failure_category', $this->failureCategories())
        );

        // One-directional: a confirmed delivery always has its timestamp. The
        // reverse is deliberately unconstrained so a later retry returning the
        // row to pending_delivery never has to erase a historical delivered_at.
        $this->addCheck(
            'site_inspections',
            'site_inspections_delivered_at_present_check',
            "delivery_status IS DISTINCT FROM 'delivered' OR delivered_at IS NOT NULL"
        );

        $this->addCheck(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_source_check',
            "source IN ('initial_dispatch', 'automatic_retry', 'planning_officer_retry', 'legacy_reconciliation')"
        );

        $this->addCheck(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_outcome_check',
            "outcome IN ('pending', 'delivered', 'failed')"
        );

        // Both directions of the NULL rule, written NULL-safely so that NULL can
        // never slip through an IN (...) membership test.
        $this->addCheck(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_failure_category_check',
            "(outcome = 'failed' AND failure_category IS NOT NULL AND failure_category IN ("
                . $this->quoteList($this->failureCategories())
            . ")) OR (outcome IN ('pending', 'delivered') AND failure_category IS NULL)"
        );

        $this->addCheck(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_attempt_number_check',
            'attempt_number >= 1'
        );

        $this->addCheck(
            'inspection_delivery_attempts',
            'inspection_delivery_attempts_completed_at_check',
            "outcome = 'pending' OR completed_at IS NOT NULL"
        );
    }

    private function dropCheckConstraints(): void
    {
        foreach ([
            'site_inspections_delivery_status_check',
            'site_inspections_delivery_failure_category_check',
            'site_inspections_delivered_at_present_check',
        ] as $name) {
            DB::statement("ALTER TABLE {$this->q('site_inspections')} DROP CONSTRAINT IF EXISTS {$this->q($name)}");
        }

        foreach ([
            'inspection_delivery_attempts_source_check',
            'inspection_delivery_attempts_outcome_check',
            'inspection_delivery_attempts_failure_category_check',
            'inspection_delivery_attempts_attempt_number_check',
            'inspection_delivery_attempts_completed_at_check',
        ] as $name) {
            DB::statement("ALTER TABLE {$this->q('inspection_delivery_attempts')} DROP CONSTRAINT IF EXISTS {$this->q($name)}");
        }
    }

    /** @return list<string> */
    private function failureCategories(): array
    {
        return [
            'inspector_mapping_unresolved',
            'supabase_unreachable',
            'authentication_failure',
            'remote_constraint_failure',
            'remote_validation_failure',
            'configuration_failure',
            'unknown',
        ];
    }

    private function vocabularyCheck(string $column, array $values): string
    {
        return $column . ' IS NULL OR ' . $column . ' IN (' . $this->quoteList($values) . ')';
    }

    private function quoteList(array $values): string
    {
        return implode(', ', array_map(fn (string $v) => "'" . $v . "'", $values));
    }

    private function addCheck(string $table, string $name, string $expression): void
    {
        DB::statement(sprintf(
            'ALTER TABLE %s ADD CONSTRAINT %s CHECK (%s)',
            $this->q($table),
            $this->q($name),
            $expression
        ));
    }

    private function q(string $identifier): string
    {
        return '"' . str_replace('"', '""', $identifier) . '"';
    }

    private function indexExists(string $table, string $index): bool
    {
        return DB::selectOne(
            'SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND tablename = ? AND indexname = ?',
            [$table, $index]
        ) !== null;
    }
};
