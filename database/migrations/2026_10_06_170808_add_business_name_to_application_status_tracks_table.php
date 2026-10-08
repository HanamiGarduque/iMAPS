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
        Schema::table('application_status_tracks', function (Blueprint $table) {
            if (!Schema::hasColumn('application_status_tracks', 'business_name')) {
                $table->string('business_name', 255)->nullable()->after('application_type');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('application_status_tracks', function (Blueprint $table) {
            if (Schema::hasColumn('application_status_tracks', 'business_name')) {
                $table->dropColumn('business_name');
            }
        });
    }
};
