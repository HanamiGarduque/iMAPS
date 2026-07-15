<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class TaxMapParcel extends Model
{
    protected $fillable = [
        'property_index_number',
        'barangay',
        'tct_number',
        'tax_dec_number',
        'lot_area_sqm',
        'is_dummy_data',
    ];

    protected $casts = [
        'lot_area_sqm'  => 'decimal:4',
        'is_dummy_data' => 'boolean',
    ];

    /**
     * boundary and centroid are PostGIS geometry columns — not plain
     * scalar attributes, so they're excluded from $fillable/$casts and
     * instead pulled out as GeoJSON/lat-lng via raw SQL in the query
     * scope below. Eloquent has no native geometry cast.
     */

    /**
     * Find a tax map parcel by PIN, returning boundary as GeoJSON and
     * centroid as separate lat/lng floats, ready for API/JSON output.
     */
    public static function findByPin(string $pin): ?array
    {
        $row = static::query()
            ->selectRaw('
                id,
                property_index_number,
                barangay,
                tct_number,
                tax_dec_number,
                lot_area_sqm,
                land_use_class,
                is_dummy_data,
                ST_AsGeoJSON(boundary) as boundary_geojson,
                ST_Y(centroid) as latitude,
                ST_X(centroid) as longitude
            ')
            ->where('property_index_number', $pin)
            ->first();

        if (!$row) {
            return null;
        }

        return [
            'id'                     => $row->id,
            'property_index_number'  => $row->property_index_number,
            'barangay'               => $row->barangay,
            'tct_number'             => $row->tct_number,
            'tax_dec_number'         => $row->tax_dec_number,
            'lot_area_sqm'           => $row->lot_area_sqm !== null ? (float) $row->lot_area_sqm : null,
            'land_use_class'         => $row->land_use_class,
            'is_dummy_data'          => (bool) $row->is_dummy_data,
            'latitude'               => $row->latitude !== null ? (float) $row->latitude : null,
            'longitude'              => $row->longitude !== null ? (float) $row->longitude : null,
            'boundary'               => $row->boundary_geojson ? json_decode($row->boundary_geojson) : null,
        ];
    }
}