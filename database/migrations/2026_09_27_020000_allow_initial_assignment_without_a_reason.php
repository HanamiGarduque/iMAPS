<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Allow an INITIAL ownership assignment to carry no reason.
 *
 * Why this correction is needed
 *
 * The reassignment reason vocabulary (Absent, On Leave, Workload Transfer,
 * Unavailable, Other) describes why somebody is GIVING WORK AWAY. It has no
 * meaning for the very first time work is given to somebody, so requiring one
 * forces a first assignment to state a reason that is not true. The result was
 * two false facts: an application created by a Planning Officer was recorded as
 * a "Workload Transfer", and every brand-new inspection round was recorded as
 * one too.
 *
 * So the rule becomes:
 *
 *   initial      -> reason MAY be NULL. Nothing is being taken away from anyone.
 *   reassignment -> reason MUST be one of the five allowed values.
 *   reason 'Other' -> reason_note MUST be a non-empty string, in both cases.
 *
 * Additive and idempotent. No data is rewritten: existing rows keep the reason
 * they were written with, and no row is created, deleted or backfilled.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->relaxReasonColumns();

        $this->replaceCheck(
            'application_po_assignments',
            'app_po_assignments_reason_check',
            $this->reasonExpression('assignment_type', 'reason')
        );

        $this->replaceCheck(
            'site_inspection_assignments',
            'site_insp_assignments_reason_check',
            $this->reasonExpression('assignment_type', 'reason')
        );

        // A NULL reason must not be treated as "Other", so the note rule has to
        // use IS DISTINCT FROM rather than <>. With `<>`, a NULL reason makes
        // the whole expression NULL, which a CHECK accepts for the wrong reason.
        $this->replaceCheck(
            'application_po_assignments',
            'app_po_assignments_other_note_check',
            "(reason IS DISTINCT FROM 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> ''))"
        );

        $this->replaceCheck(
            'site_inspection_assignments',
            'site_insp_assignments_other_note_check',
            "(reason IS DISTINCT FROM 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> ''))"
        );
    }

    public function down(): void
    {
        // Only safe while no initial row has a NULL reason. Rows that already
        // exist are never rewritten, so a rollback that would need to invent a
        // reason is refused rather than performed.
        foreach (['application_po_assignments', 'site_inspection_assignments'] as $table) {
            $nullReasons = DB::table($table)->whereNull('reason')->count();

            if ($nullReasons > 0) {
                throw new RuntimeException(
                    "Cannot restore NOT NULL on {$table}.reason while {$nullReasons} initial assignment row(s) correctly have no reason."
                );
            }
        }

        $this->restoreReasonNotNull();

        $this->replaceCheck(
            'application_po_assignments',
            'app_po_assignments_reason_check',
            "reason IN ('Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other')"
        );

        $this->replaceCheck(
            'site_inspection_assignments',
            'site_insp_assignments_reason_check',
            "reason IN ('Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other')"
        );

        $this->replaceCheck(
            'application_po_assignments',
            'app_po_assignments_other_note_check',
            "(reason <> 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> ''))"
        );

        $this->replaceCheck(
            'site_inspection_assignments',
            'site_insp_assignments_other_note_check',
            "(reason <> 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> ''))"
        );
    }

    /**
     * The reason rule, stated once and applied to both tables.
     *
     * The two branches are written with explicit IS NULL / IS NOT NULL guards
     * rather than relying on the IN comparison alone. That matters more than it
     * looks: in SQL, `NULL IN (...)` evaluates to NULL, not to false, and a CHECK
     * constraint PASSES when its expression is null. So a rule written only as
     * `reassignment AND reason IN (...)` would quietly ACCEPT a reassignment
     * with no reason at all. The guards close that hole, and they also make the
     * rule exact: an initial row carries no reason at all, because a reason
     * describes a handover and there has not been one.
     */
    private function reasonExpression(string $typeColumn, string $reasonColumn): string
    {
        $allowed = "'Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other'";

        return "(
            ({$typeColumn} = 'initial' AND {$reasonColumn} IS NULL)
            OR
            ({$typeColumn} = 'reassignment' AND {$reasonColumn} IS NOT NULL AND {$reasonColumn} IN ({$allowed}))
        )";
    }

    private function relaxReasonColumns(): void
    {
        foreach (['application_po_assignments', 'site_inspection_assignments'] as $table) {
            if (! Schema::hasTable($table)) {
                continue;
            }

            $column = DB::selectOne(
                'SELECT is_nullable FROM information_schema.columns
                 WHERE table_schema = current_schema() AND table_name = ? AND column_name = ?',
                [$table, 'reason']
            );

            if ($column === null || $column->is_nullable === 'YES') {
                continue;
            }

            // The reason CHECK must be relaxed BEFORE the column can hold NULL,
            // otherwise the ALTER would be rejected by the existing constraint.
            DB::statement("ALTER TABLE {$table} ALTER COLUMN reason DROP NOT NULL");
        }
    }

    private function restoreReasonNotNull(): void
    {
        foreach (['application_po_assignments', 'site_inspection_assignments'] as $table) {
            if (Schema::hasTable($table)) {
                DB::statement("ALTER TABLE {$table} ALTER COLUMN reason SET NOT NULL");
            }
        }
    }

    /**
     * Drop and recreate a CHECK constraint, doing nothing when the definition
     * already matches so a re-run is a no-op rather than a rewrite.
     */
    private function replaceCheck(string $table, string $name, string $expression): void
    {
        if (! Schema::hasTable($table)) {
            return;
        }

        $existing = DB::selectOne(
            'SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
             WHERE conname = ? AND conrelid = ?::regclass',
            [$name, $table]
        );

        if ($existing === null) {
            DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");

            return;
        }

        if ($this->normalise($existing->definition) === $this->normalise("CHECK ({$expression})")) {
            return;
        }

        DB::statement("ALTER TABLE {$table} DROP CONSTRAINT {$name}");
        DB::statement("ALTER TABLE {$table} ADD CONSTRAINT {$name} CHECK ({$expression})");
    }

    /**
     * Compare constraint definitions ignoring the type casts PostgreSQL adds, so
     * an unchanged rule is recognised as unchanged.
     */
    private function normalise(string $definition): string
    {
        $definition = str_replace(['::text', '::character varying'], '', $definition);
        $definition = preg_replace('/\s+/', ' ', $definition) ?? $definition;

        return strtolower(trim($definition));
    }
};
