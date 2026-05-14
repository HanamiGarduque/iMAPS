<?php

namespace App\Models;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ZoningApplication extends Model
{
    use HasFactory; 

    protected $table = 'zoning_applications';

    protected $fillable = [
        'reference_number',
        'date_of_application',
        'application_type',
        'land_use_class',
        'status',
        'purpose',
        'applicant_name',
        'contact_number',
        'email',
        'representative_name',
        'barangay',
        'street_address',
        'lot_number',
        'tct_number',
        'area_sqm',
        'latitude',
        'longitude',
        'assessment_fee',
        'or_number',
        'remarks',
        'encoded_by',
    ];

    protected $casts = [
        'date_of_application' => 'date',
        'area_sqm'            => 'float',
        'assessment_fee'      => 'float',
        'latitude'            => 'float',
        'longitude'           => 'float',
    ];

    public function encodedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'encoded_by');
    }
}