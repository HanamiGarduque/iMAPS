<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Phase 1 work-reassignment contract.
 *
 * Business continuity rule (no account sharing):
 *   - If a Planning Officer or Site Inspector is unavailable, the work may be
 *     handed to ANOTHER qualified employee.
 *   - The receiving employee always works on their OWN account. Nobody ever
 *     logs in as somebody else, and no "acting as" substitution exists.
 *   - Admin reassigns APPLICATION ownership only. A Planning Officer reassigns
 *     INSPECTION-ROUND ownership only. The two responsibilities never merge,
 *     and neither role inherits the other's decision authority.
 *
 * This migration is ADDITIVE and IDEMPOTENT. It is safe to run against the
 * existing 0921 database and against a database that already has some of these
 * objects. It performs NO historical backfill: ownership that the current
 * business flow never established is deliberately left NULL rather than
 * invented.
 */
return new class extends Migration
{
    public function up(): void
    {
        // ------------------------------------------------------------------
        // 1. CURRENT Planning Officer ownership of an application.
        //
        // This is a NEW, separate fact. It is NOT `encoded_by` (who typed the
        // application up) and NOT `technical_reviews.reviewed_by` (who made a
        // decision in a given round). Those keep their original meanings.
        // ------------------------------------------------------------------
        if (! Schema::hasColumn('zoning_applications', 'assigned_planning_officer_id')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->unsignedBigInteger('assigned_planning_officer_id')
                    ->nullable()
                    ->after('encoded_by')
                    ->comment('CURRENT responsible Planning Officer. Null means not yet established; never backfilled speculatively.');
            });
        }

        if (! $this->foreignKeyExists('zoning_applications', 'zoning_applications_assigned_po_foreign')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->foreign('assigned_planning_officer_id', 'zoning_applications_assigned_po_foreign')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
            });
        }

        // ------------------------------------------------------------------
        // 2. Immutable history: Planning Officer ownership changes.
        //
        // Append-only. A row is written for the first assignment and again for
        // every reassignment, so the original owner is never lost. The reason
        // is a controlled vocabulary, not free text, so it can be reported on
        // without parsing sentences.
        // ------------------------------------------------------------------
        if (! Schema::hasTable('application_po_assignments')) {
            Schema::create('application_po_assignments', function (Blueprint $table) {
                $table->id();

                // Exact application identity. A real foreign key, so a history
                // row can never point at a guessed or polymorphic target.
                $table->unsignedBigInteger('zoning_application_id');
                $table->foreign('zoning_application_id', 'app_po_assignments_application_foreign')
                    ->references('id')
                    ->on('zoning_applications')
                    ->cascadeOnDelete();

                $table->string('assignment_type', 20);
                $table->unsignedBigInteger('from_planning_officer_id')->nullable();
                $table->unsignedBigInteger('to_planning_officer_id');

                $table->foreign('from_planning_officer_id', 'app_po_assignments_from_po_foreign')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
                $table->foreign('to_planning_officer_id', 'app_po_assignments_to_po_foreign')
                    ->references('id')
                    ->on('users')
                    ->restrictOnDelete();

                $table->string('reason', 30);
                $table->text('reason_note')->nullable();

                $table->unsignedBigInteger('reassigned_by');
                $table->foreign('reassigned_by', 'app_po_assignments_actor_foreign')
                    ->references('id')
                    ->on('users')
                    ->restrictOnDelete();

                $table->timestamp('reassigned_at');

                $table->index(['zoning_application_id', 'reassigned_at'], 'app_po_assignments_lookup_idx');
            });
        }

        // ------------------------------------------------------------------
        // 3. Immutable history: Site Inspector ownership of ONE round.
        //
        // Round-scoped on purpose. A reinspection is a NEW row, so history is
        // keyed to the exact round and never bleeds across rounds.
        // ------------------------------------------------------------------
        if (! Schema::hasTable('site_inspection_assignments')) {
            Schema::create('site_inspection_assignments', function (Blueprint $table) {
                $table->id();

                $table->unsignedBigInteger('site_inspection_id');
                $table->foreign('site_inspection_id', 'site_insp_assignments_inspection_foreign')
                    ->references('id')
                    ->on('site_inspections')
                    ->cascadeOnDelete();

                $table->string('assignment_type', 20);
                $table->unsignedBigInteger('from_inspector_id')->nullable();
                $table->unsignedBigInteger('to_inspector_id');

                $table->foreign('from_inspector_id', 'site_insp_assignments_from_si_foreign')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
                $table->foreign('to_inspector_id', 'site_insp_assignments_to_si_foreign')
                    ->references('id')
                    ->on('users')
                    ->restrictOnDelete();

                $table->string('reason', 30);
                $table->text('reason_note')->nullable();

                $table->unsignedBigInteger('reassigned_by');
                $table->foreign('reassigned_by', 'site_insp_assignments_actor_foreign')
                    ->references('id')
                    ->on('users')
                    ->restrictOnDelete();

                $table->timestamp('reassigned_at');

                $table->index(['site_inspection_id', 'reassigned_at'], 'site_insp_assignments_lookup_idx');
            });
        }

        // ------------------------------------------------------------------
        // 4. Controlled vocabularies.
        //
        // The reason and assignment_type vocabularies are enforced in the
        // database as well as in PHP, so a future writer cannot introduce a
        // value the reporting layer does not understand.
        // ------------------------------------------------------------------
        $this->addCheckConstraints();
    }

    public function down(): void
    {
        $this->dropCheckConstraints();

        Schema::dropIfExists('site_inspection_assignments');
        Schema::dropIfExists('application_po_assignments');

        if (Schema::hasColumn('zoning_applications', 'assigned_planning_officer_id')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->dropForeign('zoning_applications_assigned_po_foreign');
                $table->dropColumn('assigned_planning_officer_id');
            });
        }
    }

    /**
     * A constraint is added only when absent, so re-running the migration on a
     * partially upgraded database cannot fail.
     */
    private function addCheckConstraints(): void
    {
        $this->addCheck(
            'application_po_assignments',
            'app_po_assignments_type_check',
            "assignment_type IN ('initial', 'reassignment')"
        );

        $this->addCheck(
            'application_po_assignments',
            'app_po_assignments_reason_check',
            "reason IN ('Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other')"
        );

        // "Other" is only honest with an explanation.
        $this->addCheck(
            'application_po_assignments',
            'app_po_assignments_other_note_check',
            "reason <> 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> '')"
        );

        $this->addCheck(
            'site_inspection_assignments',
            'site_insp_assignments_type_check',
            "assignment_type IN ('initial', 'reassignment')"
        );

        $this->addCheck(
            'site_inspection_assignments',
            'site_insp_assignments_reason_check',
            "reason IN ('Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other')"
        );

        $this->addCheck(
            'site_inspection_assignments',
            'site_insp_assignments_other_note_check',
            "reason <> 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> '')"
        );

        // A reassignment must actually change hands; an "initial" row has no
        // previous owner to record.
        $this->addCheck(
            'application_po_assignments',
            'app_po_assignments_from_check',
            "(assignment_type = 'initial' AND from_planning_officer_id IS NULL)
             OR (assignment_type = 'reassignment' AND from_planning_officer_id IS NOT NULL)"
        );

        $this->addCheck(
            'site_inspection_assignments',
            'site_insp_assignments_from_check',
            "(assignment_type = 'initial' AND from_inspector_id IS NULL)
             OR (assignment_type = 'reassignment' AND from_inspector_id IS NOT NULL)"
        );
    }

    private function dropCheckConstraints(): void
    {
        foreach ([
            'application_po_assignments' => [
                'app_po_assignments_type_check',
                'app_po_assignments_reason_check',
                'app_po_assignments_other_note_check',
                'app_po_assignments_from_check',
            ],
            'site_inspection_assignments' => [
                'site_insp_assignments_type_check',
                'site_insp_assignments_reason_check',
                'site_insp_assignments_other_note_check',
                'site_insp_assignments_from_check',
            ],
        ] as $table => $names) {
            foreach ($names as $name) {
                DB::statement("ALTER TABLE {$table} DROP CONSTRAINT IF EXISTS {$name}");
            }
        }
    }

    private function addCheck(string $table, string $name, string $expression): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }

        $exists = DB::selectOne(
            'SELECT 1 AS present FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass',
            [$name, $table]
        );

        if ($exists) {
            return;
        }

        DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
    }

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        $exists = DB::selectOne(
            'SELECT 1 AS present FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass',
            [$constraint, $table]
        );

        return $exists !== null;
    }
};
