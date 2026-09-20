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
            $table->unsignedBigInteger('assigned_by_imaps_user_id')->nullable();
            $table->string('assigned_by_name')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('site_inspections', function (Blueprint $table) {
            $table->dropColumn(['assigned_by_imaps_user_id', 'assigned_by_name']);
        });
    }
};
