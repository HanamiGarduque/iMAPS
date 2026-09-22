<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE technical_reviews DROP CONSTRAINT IF EXISTS technical_reviews_decision_check');
        DB::statement("ALTER TABLE technical_reviews ADD CONSTRAINT technical_reviews_decision_check CHECK (decision IN ('Approved', 'Needs Site Inspection', 'Requires Reinspection', 'Declined'))");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE technical_reviews DROP CONSTRAINT IF EXISTS technical_reviews_decision_check');
        DB::statement("ALTER TABLE technical_reviews ADD CONSTRAINT technical_reviews_decision_check CHECK (decision IN ('Approved', 'Needs Site Inspection', 'Declined'))");
    }
};
