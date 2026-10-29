<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            if (!Schema::hasColumn('zoning_applications', 'applicant_municipality')) {
                $table->string('applicant_municipality', 255)->nullable()->after('applicant_barangay');
            }
        });
    }

    public function down(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            if (Schema::hasColumn('zoning_applications', 'applicant_municipality')) {
                $table->dropColumn('applicant_municipality');
            }
        });
    }
};
