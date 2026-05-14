<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    
    public function up(): void
    {
        Schema::create('application_sequences', function (Blueprint $table) {
            $table->string('type_code', 4);
            $table->integer('year');
            $table->integer('last_seq');

            $table->primary(['type_code', 'year']);
        });
    }


    public function down(): void
    {
        Schema::dropIfExists('application_sequences');
    }
};