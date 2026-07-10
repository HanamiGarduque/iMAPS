<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
{
    Schema::create('technical_reviews', function (Blueprint $table) {
        $table->id();
        $table->foreignId('zoning_application_id')
            ->constrained('zoning_applications')
            ->onDelete('cascade');
        $table->foreignId('reviewed_by')
            ->constrained('users')
            ->onDelete('restrict');
        $table->smallInteger('review_round')->default(1);
        $table->string('decision', 30);
        $table->boolean('zoning_compliant')->nullable();
        $table->boolean('documents_complete')->nullable();
        $table->boolean('land_use_compliant')->nullable();
        $table->text('findings')->nullable();
        $table->text('decision_reason')->nullable();
        $table->unsignedBigInteger('site_inspection_task_id')->nullable();
        $table->timestamp('reviewed_at')->useCurrent();
        $table->timestamps();
    });

    DB::statement("ALTER TABLE technical_reviews ADD CONSTRAINT technical_reviews_decision_check CHECK (decision IN ('Approved', 'Needs Site Inspection', 'Declined'))");
}

public function down(): void
{
    Schema::dropIfExists('technical_reviews');
}
};
