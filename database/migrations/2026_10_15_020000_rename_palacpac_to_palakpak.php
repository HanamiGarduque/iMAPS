<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// The barangay is Palakpak. The boundary, CLUP 2030 and land parcel layers
// were imported as "Palacpac", while every recorded filing says "Palakpak",
// so the two never lined up on the map. One spelling everywhere.
return new class extends Migration
{
    private const COLUMNS = [
        'barangay_boundary' => 'location',
        'land_use_plan'     => 'location',
        'land_parcels'      => 'barangay',
    ];

    public function up(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            DB::table($table)->where($column, 'Palacpac')->update([$column => 'Palakpak']);
        }
    }

    public function down(): void
    {
        foreach (self::COLUMNS as $table => $column) {
            DB::table($table)->where($column, 'Palakpak')->update([$column => 'Palacpac']);
        }
    }
};
