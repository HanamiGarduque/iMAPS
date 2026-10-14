<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Four link columns were created as plain integers, so the database accepted
     * ids of parcels, rounds and users that do not exist. Constrain them.
     *
     * All four are nullable and every one becomes null when its target goes:
     * the same rule as technical_reviews.reviewed_site_inspection_id and
     * site_inspections.inspector_id. Parcels and rounds are only removed together
     * with their application today, so nothing changes for the app; the rule only
     * decides what a manual delete does. audit_trail.application_id stays
     * unconstrained on purpose so audit history outlives the application.
     */
    private const LINKS = [
        // [table, column, referenced table, constraint name]
        ['site_inspections', 'parcel_id', 'parcels', 'site_inspections_parcel_id_foreign'],
        ['site_inspections', 'assigned_by_imaps_user_id', 'users', 'site_inspections_assigned_by_user_foreign'],
        ['technical_reviews', 'parcel_id', 'parcels', 'technical_reviews_parcel_id_foreign'],
        ['technical_reviews', 'site_inspection_task_id', 'site_inspections', 'technical_reviews_task_inspection_foreign'],
    ];

    public function up(): void
    {
        foreach (self::LINKS as [$table, $column, $parent, $constraint]) {
            // A dangling id already points at nothing; clear it so the constraint can be added.
            DB::update(
                "UPDATE {$table} SET {$column} = NULL
                 WHERE {$column} IS NOT NULL
                   AND NOT EXISTS (SELECT 1 FROM {$parent} WHERE {$parent}.id = {$table}.{$column})"
            );

            // Postgres does not index foreign-key columns on its own.
            $index = "{$table}_{$column}_index";
            if (! $this->indexExists($index)) {
                Schema::table($table, fn (Blueprint $t) => $t->index($column, $index));
            }

            if (! $this->foreignKeyExists($table, $constraint)) {
                Schema::table($table, fn (Blueprint $t) => $t->foreign($column, $constraint)
                    ->references('id')
                    ->on($parent)
                    ->nullOnDelete());
            }
        }
    }

    public function down(): void
    {
        foreach (self::LINKS as [$table, $column, , $constraint]) {
            if ($this->foreignKeyExists($table, $constraint)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropForeign($constraint));
            }

            $index = "{$table}_{$column}_index";
            if ($this->indexExists($index)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropIndex($index));
            }
        }
    }

    private function foreignKeyExists(string $table, string $constraint): bool
    {
        $exists = DB::selectOne(
            'SELECT 1 AS present FROM pg_constraint WHERE conname = ? AND conrelid = ?::regclass',
            [$constraint, $table]
        );

        return $exists !== null;
    }

    private function indexExists(string $index): bool
    {
        $exists = DB::selectOne(
            "SELECT 1 AS present FROM pg_indexes WHERE schemaname = 'public' AND indexname = ?",
            [$index]
        );

        return $exists !== null;
    }
};
