<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('site_inspections', 'deadline_date')) {
            Schema::table('site_inspections', function (Blueprint $table) {
                $table->date('deadline_date')->nullable()->after('scheduled_date');
            });
        }
    }

    public function down(): void
    {
        // Intentionally non-destructive because the column may predate this migration.
    }
};