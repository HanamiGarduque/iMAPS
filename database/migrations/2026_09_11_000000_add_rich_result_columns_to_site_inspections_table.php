<?php

use Illuminate\Database\Migrations\Migration;

/**
 * SUPERSEDED - retained as a no-op compatibility migration.
 *
 * This filename is kept because deployed databases already recorded it in the
 * `migrations` ledger, so deleting or renaming it would orphan those historical
 * rows and leave `migrate:rollback` unable to resolve them.
 *
 * It must not mutate schema. Its timestamp sorts BEFORE
 * 2026_09_19_000000_create_initial_schema, so on a fresh database it would ALTER
 * `site_inspections` before that table exists. The canonical, correctly ordered
 * migration that actually creates these columns is:
 *
 *   2026_09_19_000001_add_rich_result_columns_to_site_inspections_table
 */
return new class extends Migration
{
    public function up(): void
    {
        // Intentionally no schema mutation. Superseded by ..._000001.
    }

    public function down(): void
    {
        // Intentionally no schema mutation. A superseded migration must never
        // reverse columns it did not create.
    }
};
