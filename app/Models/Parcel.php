<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasOne;

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
        'latitude'      => 'decimal:7',
        'longitude'     => 'decimal:7',
    ];

    /**
     * Get the application that owns the parcel.
     */
    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    /**
     * Get the most recent site inspection for this parcel.
     * Renamed from 'fieldJob' to match the Controller's eager loading.
     */
    public function siteInspection(): HasOne
    {
        return $this->hasOne(SiteInspection::class, 'parcel_id')->latestOfMany();
    }
}