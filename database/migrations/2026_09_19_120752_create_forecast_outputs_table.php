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
        Schema::create('forecast_outputs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('forecast_run_id')->constrained()->onDelete('cascade');
            $table->date('forecast_date');
            $table->decimal('mean_value', 10, 2);
            $table->decimal('lower_ci', 10, 2)->nullable();
            $table->decimal('upper_ci', 10, 2)->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('forecast_outputs');
    }
};
