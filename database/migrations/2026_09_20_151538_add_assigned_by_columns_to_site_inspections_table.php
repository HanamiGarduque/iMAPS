<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('site_inspections', function (Blueprint $table) {
            if (!Schema::hasColumn('site_inspections', 'assigned_by_imaps_user_id')) {
                $table->unsignedBigInteger('assigned_by_imaps_user_id')->nullable();
            }
            if (!Schema::hasColumn('site_inspections', 'assigned_by_name')) {
                $table->string('assigned_by_name')->nullable();
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('site_inspections', function (Blueprint $table) {
            if (Schema::hasColumn('site_inspections', 'assigned_by_imaps_user_id')) {
                $table->dropColumn('assigned_by_imaps_user_id');
            }
            if (Schema::hasColumn('site_inspections', 'assigned_by_name')) {
                $table->dropColumn('assigned_by_name');
            }
        });
    }
};
