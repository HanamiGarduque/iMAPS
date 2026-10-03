<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repair a partially applied work-assignment schema.
     *
     * In a live deployment, the app can be reached before the assignment-history
     * tables are present or after a failed/manual rollback left them missing.
     * This migration is intentionally additive and idempotent: it restores the
     * tables without rewriting existing ownership data or dropping anything.
     */
    public function up(): void
    {
        $this->ensureZoningApplicationOwnershipColumn();
        $this->ensureApplicationPoAssignmentsTable();
        $this->ensureSiteInspectionAssignmentsTable();
    }

    public function down(): void
    {
        // No destructive rollback. Repairing a damaged schema is safer than
        // deleting rows that may already exist in a partially migrated database.
    }

    private function ensureZoningApplicationOwnershipColumn(): void
    {
        if (Schema::hasColumn('zoning_applications', 'assigned_planning_officer_id')) {
            return;
        }

        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->unsignedBigInteger('assigned_planning_officer_id')
                ->nullable()
                ->after('encoded_by')
                ->comment('CURRENT responsible Planning Officer. Null means not yet established; never backfilled speculatively.');
        });

        if (! $this->foreignKeyExists('zoning_applications', 'zoning_applications_assigned_po_foreign')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->foreign('assigned_planning_officer_id', 'zoning_applications_assigned_po_foreign')
                    ->references('id')
                    ->on('users')
                    ->nullOnDelete();
            });
        }
    }

    private function ensureApplicationPoAssignmentsTable(): void
    {
        if (Schema::hasTable('application_po_assignments')) {
            return;
        }

        Schema::create('application_po_assignments', function (Blueprint $table) {
            $table->id();
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

            $table->string('reason', 30)->nullable();
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

    private function ensureSiteInspectionAssignmentsTable(): void
    {
        if (Schema::hasTable('site_inspection_assignments')) {
            return;
        }

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

            $table->string('reason', 30)->nullable();
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

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        $exists = DB::selectOne(
            'SELECT 1 AS present FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass',
            [$constraint, $table]
        );

        return $exists !== null;
    }
};
