<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Dashboard matches application parcels to the tax map by normalized
    // PIN/TCT; without these it full-scans land_parcels on every load.
    public function up(): void
    {
        DB::statement("CREATE INDEX IF NOT EXISTS land_parcels_pin_norm_idx ON public.land_parcels (UPPER(REGEXP_REPLACE(property_index_number, '[^A-Za-z0-9]', '', 'g')))");
        DB::statement("CREATE INDEX IF NOT EXISTS land_parcels_tct_norm_idx ON public.land_parcels (UPPER(REGEXP_REPLACE(tct_number, '[^A-Za-z0-9]', '', 'g')))");
    }

    public function down(): void
    {
        DB::statement('DROP INDEX IF EXISTS public.land_parcels_pin_norm_idx');
        DB::statement('DROP INDEX IF EXISTS public.land_parcels_tct_norm_idx');
    }
};
