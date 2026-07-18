<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up()
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            // Make fields nullable to allow partial saves
            $table->string('application_type')->nullable()->change();
            $table->string('form_number')->nullable()->change();
            $table->string('land_use_class')->nullable()->change();
            $table->text('purpose')->nullable()->change();
            $table->string('applicant_name')->nullable()->change();
            $table->string('contact_number')->nullable()->change();
            $table->string('barangay')->nullable()->change();
            $table->decimal('assessment_fee', 10, 2)->nullable()->change();
            
            // If status is an ENUM, you may need to update the ENUM options. 
            // If it's a string, this just ensures the default can be Draft.
            $table->string('status')->default('Draft')->change();
        });
    }

    public function down()
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            // Revert fields back to required (ensure no drafts exist before rolling back)
            $table->string('application_type')->nullable(false)->change();
            $table->string('form_number')->nullable(false)->change();
            $table->string('land_use_class')->nullable(false)->change();
            $table->text('purpose')->nullable(false)->change();
            $table->string('applicant_name')->nullable(false)->change();
            $table->string('contact_number')->nullable(false)->change();
            $table->string('barangay')->nullable(false)->change();
            $table->decimal('assessment_fee', 10, 2)->nullable(false)->change();
        });
    }
};