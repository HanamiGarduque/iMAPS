<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('application_status_tracks', function (Blueprint $table) {
            $table->id();

            $table->string('reference_number')->index();
            $table->string('masked_applicant_name');
            $table->string('status');

            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('application_status_tracks');
    }
};