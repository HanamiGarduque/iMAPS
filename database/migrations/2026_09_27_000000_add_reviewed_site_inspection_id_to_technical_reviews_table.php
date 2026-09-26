<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Loop 8 — Planning Review Metadata.
 *
 * Adds the round-specific reviewed inspection identity used to transport
 * read-only Planning Review metadata for the exact inspection round that was
 * reviewed. This column is NOT the "new round" pointer: `site_inspection_task_id`
 * remains the inspection round created by the review decision.
 *
 * Additive and guarded. No historical backfill is performed, so existing rows
 * keep NULL until a round is explicitly reviewed again.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('technical_reviews', 'reviewed_site_inspection_id')) {
            Schema::table('technical_reviews', function (Blueprint $table) {
                $table->unsignedBigInteger('reviewed_site_inspection_id')->nullable()->after('site_inspection_task_id');
            });
        }

        if (DB::getDriverName() === 'pgsql') {
            $hasForeignKey = DB::selectOne("
                SELECT 1 AS present
                FROM pg_catalog.pg_constraint
                WHERE conname = 'technical_reviews_reviewed_site_inspection_id_foreign'
                  AND conrelid = 'public.technical_reviews'::regclass
            ");

            if (! $hasForeignKey) {
                DB::statement('
                    ALTER TABLE public.technical_reviews
                    ADD CONSTRAINT technical_reviews_reviewed_site_inspection_id_foreign
                    FOREIGN KEY (reviewed_site_inspection_id)
                    REFERENCES public.site_inspections (id)
                    ON DELETE SET NULL
                ');
            }
        }
    }

    /**
     * Non-destructive rollback: the pointer constraint and index are removed,
     * but the column is intentionally preserved because dropping it would
     * discard review identity for already-transported reviews.
     */
    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('
                ALTER TABLE public.technical_reviews
                DROP CONSTRAINT IF EXISTS technical_reviews_reviewed_site_inspection_id_foreign
            ');
            DB::statement('
                DROP INDEX IF EXISTS technical_reviews_reviewed_site_inspection_id_index
            ');
        }
    }
};
