<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Parcel extends Model
{
    protected $fillable = [
        'zoning_application_id',
        'parcel_code',
        'lot_number',
        'tct_number',
        'tax_dec_number',
        'lot_area_sqm',
        'latitude',
        'longitude',
        'land_use_class',
        'property_index_number',
    ];

    protected $casts = [
        'lot_area_sqm'  => 'decimal:4',
        'latitude'  => 'decimal:7',
        'longitude' => 'decimal:7',
    ];

    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }
}