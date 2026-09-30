<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Parcel extends Model
{
    protected $fillable = [
        'zoning_application_id',
        'parcel_code',
        'location_address',
        'barangay',
        'owner_name',
        'lot_number',
        'tct_number',
        'tax_dec_number',
        'lot_area_sqm',
        'latitude',
        'longitude',
        'land_use_class',
        'property_index_number',
        'arp_number',
        'survey_number',
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
     *
     * NOTE (Admin/PO audit): `latestOfMany()` deliberately exposes ONLY the
     * newest round. Earlier completed rounds are real, separate business
     * records and are still present in the database — they are simply not part
     * of this relation. Use {@see siteInspections()} (or a withCount on it) to
     * know how many rounds exist; never conclude from this relation that a
     * previous round did not happen.
     */
    public function siteInspection(): HasOne
    {
        return $this->hasOne(SiteInspection::class, 'parcel_id')->latestOfMany();
    }

    /**
     * Every site inspection round recorded for this parcel.
     *
     * One row per round. A second row is a NEW reinspection task; it does not
     * reopen or overwrite the earlier round. Used to derive the round count that
     * the Planning Officer inspection summary reports.
     */
    public function siteInspections(): HasMany
    {
        return $this->hasMany(SiteInspection::class, 'parcel_id');
    }
}