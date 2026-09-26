<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('historical_data', function (Blueprint $table) {
            $table->id();
            $table->date('encoding_date')->nullable();
            $table->string('form_number')->nullable();
            $table->string('name')->nullable();
            $table->string('barangay')->nullable();
            $table->string('zoning_code')->nullable();
            $table->decimal('lot_area_sqm', 12, 2)->nullable();
            $table->string('application_type')->nullable();
            $table->text('purpose')->nullable();
            $table->decimal('assessment_fee', 12, 2)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('historical_data');
    }
};