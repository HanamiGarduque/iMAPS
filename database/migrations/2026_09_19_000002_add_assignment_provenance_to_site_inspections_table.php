<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Record the most recent Planning Officer who assigned or reassigned this
     * inspection. This is a snapshot used for the current remote field_job row,
     * not a historical ledger or a one-time assignment record.
     */
    public function up(): void
    {
        if (!Schema::hasColumn('site_inspections', 'assigned_by_imaps_user_id')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->unsignedBigInteger('assigned_by_imaps_user_id')->nullable()->after('assigned_notes');
            });
        }

        if (!Schema::hasColumn('site_inspections', 'assigned_by_name')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->string('assigned_by_name', 255)->nullable()->after('assigned_by_imaps_user_id');
            });
        }
    }

    /**
     * Intentionally non-destructive: this is an additive provenance column only.
     */
    public function down(): void
    {
        // Intentionally left blank: this migration is forward-safe and additive.
    }
};
