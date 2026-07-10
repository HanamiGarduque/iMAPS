<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;


return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
{
    Schema::create('tax_map_parcels', function (Blueprint $table) {
        $table->id();
        $table->string('property_index_number', 50)->unique();
        $table->string('barangay', 100)->nullable();
        $table->string('tct_number', 100)->nullable();
        $table->string('tax_dec_number', 100)->nullable();
        $table->decimal('lot_area_sqm', 12, 4)->nullable();
        $table->string('land_use_class', 100)->nullable();
        $table->boolean('is_dummy_data')->default(false); // flag so real data can't be confused with test data
        $table->timestamps();
    });

    DB::statement('ALTER TABLE tax_map_parcels ADD COLUMN boundary geometry(Polygon, 4326)');
    DB::statement('ALTER TABLE tax_map_parcels ADD COLUMN centroid geometry(Point, 4326)');
    DB::statement('CREATE INDEX tax_map_parcels_boundary_gist ON tax_map_parcels USING gist (boundary)');
    DB::statement('CREATE INDEX tax_map_parcels_pin_index ON tax_map_parcels (property_index_number)');
}

public function down(): void
{
    Schema::dropIfExists('tax_map_parcels');
}
};
