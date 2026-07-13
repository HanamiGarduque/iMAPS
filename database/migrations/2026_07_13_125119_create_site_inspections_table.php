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
        Schema::create('site_inspections', function (Blueprint $table) {
            $table->id();
            
            // Relationships
            $table->foreignId('zoning_application_id')->constrained()->cascadeOnDelete();
            // Assuming your personnel are stored in the standard users table.
            $table->foreignId('inspector_id')->nullable()->constrained('users')->nullOnDelete();
            
            // Scheduling & Status
            $table->string('status')->default('Pending'); // e.g., Pending, In Progress, Completed, Cancelled
            $table->date('scheduled_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            
            // Field Data / Results
            $table->boolean('is_compliant')->nullable();
            $table->text('findings')->nullable();
            $table->string('recommendation')->nullable(); // e.g., 'Approve', 'Decline', 'Require Adjustments'
            $table->text('remarks')->nullable(); // Any external notes or issues encountered
            
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('site_inspections');
    }
};