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
            if (Schema::hasColumn('zoning_applications', 'project_type_business_name') && !Schema::hasColumn('zoning_applications', 'business_name')) {
                $table->renameColumn('project_type_business_name', 'business_name');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            if (Schema::hasColumn('zoning_applications', 'business_name') && !Schema::hasColumn('zoning_applications', 'project_type_business_name')) {
                $table->renameColumn('business_name', 'project_type_business_name');
            }
        });
    }
};
