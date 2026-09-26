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
        Schema::create('forecast_runs', function (Blueprint $table) {
            $table->id();
            $table->string('application_type')->nullable();
            $table->integer('forecast_periods')->default(6);
            $table->json('model_metrics')->nullable();
            $table->json('historical_data')->nullable();
            $table->string('triggered_by')->nullable();
            $table->timestamp('executed_at');
            $table->string('status');
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('forecast_runs');
    }
};
