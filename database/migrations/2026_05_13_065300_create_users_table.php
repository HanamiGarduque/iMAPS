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
        Schema::create('users', function (Blueprint $table) {
            $table->id();

            $table->string('email', 80)->unique();
            $table->string('password_hash', 255);
            $table->string('name', 255);

            // PostgreSQL ENUM equivalent
            $table->enum('role', [
                'Planning Officer',
                'Zoning Administrator',
                'Admin',
            ])->default('Planning Officer');

            $table->boolean('is_active')->default(true);

            $table->timestamp('last_login')->nullable();

            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('users');
    }
};