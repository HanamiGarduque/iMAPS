<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    
    public function up(): void
    {
        Schema::create('audit_trail', function (Blueprint $table) {
            $table->id(); 
            $table->foreignId('application_id')->constrained();
            $table->string('action', 60);
            $table->foreignId('performed_by')->constrained('users');
            $table->text('note')->nullable();
            $table->timestamp('performed_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_trail');
    }
};
