<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('site_inspections', 'parcel_id')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->foreignId('parcel_id')->nullable()->after('zoning_application_id');
            });
        }

        $hasParcelForeignKey = DB::table('information_schema.table_constraints as constraints')
            ->join('information_schema.key_column_usage as columns', function ($join) {
                $join->on('constraints.constraint_name', '=', 'columns.constraint_name')
                    ->on('constraints.constraint_schema', '=', 'columns.constraint_schema');
            })
            ->where('constraints.constraint_type', 'FOREIGN KEY')
            ->where('constraints.table_schema', 'public')
            ->where('constraints.table_name', 'site_inspections')
            ->where('columns.column_name', 'parcel_id')
            ->exists();

        if (!$hasParcelForeignKey) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->foreign('parcel_id')
                    ->references('id')
                    ->on('parcels')
                    ->cascadeOnDelete();
            });
        }

        if (!Schema::hasColumn('site_inspections', 'deadline_date')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->date('deadline_date')->nullable()->after('scheduled_date');
            });
        }

        if (!Schema::hasColumn('site_inspections', 'assigned_notes')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->text('assigned_notes')->nullable()->after('deadline_date');
            });
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive: any of these columns may have existed before
        // this repair migration was deployed, so rollback must not remove live data.
    }
};
