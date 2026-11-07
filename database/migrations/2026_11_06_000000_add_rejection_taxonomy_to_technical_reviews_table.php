<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('technical_reviews', function (Blueprint $table) {
            if (!Schema::hasColumn('technical_reviews', 'rejection_category')) {
                $table->string('rejection_category', 100)->nullable()->after('decision_reason');
            }
            if (!Schema::hasColumn('technical_reviews', 'rejection_code')) {
                $table->string('rejection_code', 100)->nullable()->after('rejection_category');
            }
        });
    }

    public function down(): void
    {
        Schema::table('technical_reviews', function (Blueprint $table) {
            if (Schema::hasColumn('technical_reviews', 'rejection_code')) {
                $table->dropColumn('rejection_code');
            }
            if (Schema::hasColumn('technical_reviews', 'rejection_category')) {
                $table->dropColumn('rejection_category');
            }
        });
    }
};
