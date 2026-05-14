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
        Schema::create('zoning_applications', function (Blueprint $table) {
            $table->id();

            $table->string('reference_number', 30)->unique();

            $table->date('date_of_application');

            $table->enum('application_type', [
                'Locational Clearance',
                'Development Permit',
                'Zoning Certification',
                 'Special Land Use Permit',
            ]);

            $table->enum('status', [
                'Received',
                'Technical Review',
                'Under Sangguniang Bayan',
                'For Release',
                'Released',
                'Denied',
            ])->default('Received');

            $table->text('purpose');

            $table->string('applicant_name', 255);

            $table->string('contact_number', 15);

            $table->string('email', 255)->nullable();

            $table->string('representative_name', 255)->nullable();

            $table->string('barangay', 100);

            $table->string('street_address', 500);

            $table->string('lot_number', 100)->nullable();

            $table->string('tct_number', 100)->nullable();

            $table->decimal('area_sqm', 12, 4)->nullable();

            $table->decimal('latitude', 10, 7)->nullable();

            $table->decimal('longitude', 10, 7)->nullable();

            $table->decimal('assessment_fee', 12, 2)->nullable();

            $table->string('or_number', 50)->nullable();

            $table->text('remarks')->nullable();

            // Foreign key to users table
            $table->foreignId('encoded_by')
                ->nullable()
                ->constrained('users')
                ->nullOnDelete();

            $table->timestamps();

            $table->string('land_use_class', 100)->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('zoning_applications');
    }
};
