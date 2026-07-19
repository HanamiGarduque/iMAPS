<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('application_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained('users')->onDelete('cascade');
            $table->string('temp_reference_number', 50)->unique();
            $table->string('applicant_name', 255)->nullable();
            $table->string('application_type', 100)->nullable();
            $table->string('barangay', 100)->nullable();
            $table->string('status', 50)->default('Auto-saved');
            $table->json('form_payload'); // Captures entire state dynamically
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_drafts');
    }
};