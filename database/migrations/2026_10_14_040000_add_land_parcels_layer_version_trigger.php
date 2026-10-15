<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // The map serves land_parcels from a cache keyed by a version. Rows added or
    // edited with raw SQL (psql, pgAdmin, imports) never went through Laravel, so
    // the map kept serving the old lots. A statement-level trigger bumps the
    // version on any change, whoever makes it, which retires the cached layer.
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE TABLE IF NOT EXISTS public.map_layer_versions (
            layer text PRIMARY KEY,
            version bigint NOT NULL DEFAULT 1
        )');

        DB::statement("INSERT INTO public.map_layer_versions (layer) VALUES ('land_parcels') ON CONFLICT DO NOTHING");

        DB::statement("CREATE OR REPLACE FUNCTION public.bump_land_parcels_layer_version() RETURNS trigger AS \$\$
            BEGIN
                UPDATE public.map_layer_versions SET version = version + 1 WHERE layer = 'land_parcels';
                RETURN NULL;
            END;
            \$\$ LANGUAGE plpgsql");

        DB::statement('DROP TRIGGER IF EXISTS land_parcels_bump_layer_version ON public.land_parcels');
        DB::statement('CREATE TRIGGER land_parcels_bump_layer_version
            AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON public.land_parcels
            FOR EACH STATEMENT EXECUTE FUNCTION public.bump_land_parcels_layer_version()');
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP TRIGGER IF EXISTS land_parcels_bump_layer_version ON public.land_parcels');
        DB::statement('DROP FUNCTION IF EXISTS public.bump_land_parcels_layer_version()');
        DB::statement('DROP TABLE IF EXISTS public.map_layer_versions');
    }
};
