<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_permits', function (Blueprint $table) {
            $table->id();
            $table->foreignId('zoning_application_id')->constrained('zoning_applications')->onDelete('cascade');
            $table->string('permit_type', 50); // 'ze', 'lc', 'zc', 'dp'
            $table->string('permit_name', 150);
            $table->string('file_name', 255);
            $table->string('file_path', 255);
            $table->string('file_format', 20)->default('pdf'); // 'pdf', 'xlsx'
            $table->unsignedBigInteger('file_size')->default(0);
            $table->json('input_data')->nullable();
            $table->foreignId('generated_by')->nullable()->constrained('users')->onDelete('set null');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('generated_permits');
    }
};
