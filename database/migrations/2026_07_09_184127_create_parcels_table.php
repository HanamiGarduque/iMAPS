<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
{
    Schema::create('parcels', function (Blueprint $table) {
        $table->id();
        $table->foreignId('zoning_application_id')
            ->constrained('zoning_applications')
            ->onDelete('cascade');
        $table->string('parcel_code', 20);
        $table->string('lot_number', 100)->nullable();
        $table->string('tct_number', 100)->nullable();
        $table->string('tax_dec_number', 100)->nullable();
        $table->decimal('lot_area_sqm', 12, 4)->nullable();
        $table->decimal('latitude', 10, 7)->nullable();
        $table->decimal('longitude', 10, 7)->nullable();
        $table->string('land_use_class', 100)->nullable();
        $table->timestamps();

        $table->unique(['zoning_application_id', 'parcel_code']);
    });

    // PostGIS boundary column + spatial index — raw SQL since Blueprint
    // has no native geometry column type.
    DB::statement('ALTER TABLE parcels ADD COLUMN boundary geometry(Polygon, 4326)');
    DB::statement('CREATE INDEX parcels_boundary_gist ON parcels USING gist (boundary)');
}

public function down(): void
{
    Schema::dropIfExists('parcels');
}
};
