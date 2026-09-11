<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('zoning_applications', 'target_land_use_class')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->string('target_land_use_class', 100)->nullable();
            });
        }

        DB::table('zoning_applications')
            ->whereNull('target_land_use_class')
            ->whereNotNull('land_use_class')
            ->update(['target_land_use_class' => DB::raw('land_use_class')]);

        if (Schema::hasColumn('zoning_applications', 'land_use_class')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->dropColumn('land_use_class');
            });
        }
    }

    public function down(): void
    {
        if (!Schema::hasColumn('zoning_applications', 'land_use_class')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->string('land_use_class', 100)->nullable();
            });
        }

        DB::table('zoning_applications')
            ->whereNull('land_use_class')
            ->whereNotNull('target_land_use_class')
            ->update(['land_use_class' => DB::raw('target_land_use_class')]);

        if (Schema::hasColumn('zoning_applications', 'target_land_use_class')) {
            Schema::table('zoning_applications', function (Blueprint $table) {
                $table->dropColumn('target_land_use_class');
            });
        }
    }
};
