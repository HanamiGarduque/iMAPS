<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 0 = the original permit; 1, 2, ... = its amendments (each one is a new stored copy)
        Schema::table('generated_permits', function (Blueprint $table) {
            $table->unsignedSmallInteger('amendment_number')->default(0)->after('permit_name');
        });
    }

    public function down(): void
    {
        Schema::table('generated_permits', function (Blueprint $table) {
            $table->dropColumn('amendment_number');
        });
    }
};
