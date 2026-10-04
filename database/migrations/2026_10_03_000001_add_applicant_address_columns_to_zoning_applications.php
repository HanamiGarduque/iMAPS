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
        Schema::table('zoning_applications', function (Blueprint $table) {
            if (!Schema::hasColumn('zoning_applications', 'applicant_street')) {
                $table->string('applicant_street', 255)->nullable()->after('applicant_name');
            }
            if (!Schema::hasColumn('zoning_applications', 'applicant_barangay')) {
                $table->string('applicant_barangay', 255)->nullable()->after('applicant_street');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            if (Schema::hasColumn('zoning_applications', 'applicant_street')) {
                $table->dropColumn('applicant_street');
            }
            if (Schema::hasColumn('zoning_applications', 'applicant_barangay')) {
                $table->dropColumn('applicant_barangay');
            }
        });
    }
};
