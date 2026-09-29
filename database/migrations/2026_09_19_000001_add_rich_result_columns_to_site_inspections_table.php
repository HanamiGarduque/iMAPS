<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('site_inspections', 'submitted_at')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->timestamp('submitted_at')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'inspection_result')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->string('inspection_result')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'observations')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->text('observations')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'discrepancies')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->text('discrepancies')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'recommendations')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->text('recommendations')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'inspector_notes')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->text('inspector_notes')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'checklist_data')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->json('checklist_data')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'confirmed_latitude')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->double('confirmed_latitude')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'confirmed_longitude')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->double('confirmed_longitude')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'gps_accuracy_m')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->double('gps_accuracy_m')->nullable();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'gps_confirmed_at')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->timestamp('gps_confirmed_at')->nullable();
            });
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive because any of these columns may predate this repair.
    }
};
