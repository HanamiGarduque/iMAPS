<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Collection;

class ZoningApplication extends Model
{
    use HasFactory;

    protected $table = 'zoning_applications';

    protected $fillable = [
        'reference_number',
        'application_stream',
        'sb_ordinance_number',
        'dar_clearance_ref',
        'form_number',
        'application_type',
        'land_use_class',
        'target_land_use_class',
        'status',
        'purpose',
        'applicant_name',
        'contact_number',
        'email',
        'representative_name',
        'representative_address',
        'representative_contact',
        'corporation_name',
        'corporation_contact',
        'corporation_address',
        'barangay',
        'building_area',
        'area_to_develop',
        'number_of_saleable_lots',
        'project_type_business_name',
        'project_cost',
        'right_over_land',
        'project_tenure',
        'preferred_release_mode',
        'assessment_fee',
        'or_number',
        'remarks',
        'encoded_by',
        'zoning_certificate_fee',
        'locational_clearance_fee',
        'development_permit_fee',
        'other_fees',
        'penalty_fee',
        'date_of_receipt',
    ];

    protected $casts = [
        'assessment_fee'          => 'float',
        'building_area'           => 'float',
        'area_to_develop'         => 'float',
        'project_cost'            => 'float',
        'zoning_certificate_fee'   => 'float',
        'locational_clearance_fee' => 'float',
        'development_permit_fee'   => 'float',
        'other_fees'               => 'float',
        'penalty_fee' => 'float',
        'date_of_receipt' => 'date',
        'number_of_saleable_lots' => 'integer',
        
    ];

    protected $appends = ['land_use_class'];

    public function getLandUseClassAttribute(): ?string
    {
        return $this->attributes['target_land_use_class']
            ?? $this->attributes['land_use_class']
            ?? null;
    }

    public function setLandUseClassAttribute($value): void
    {
        $this->attributes['target_land_use_class'] = $value;
    }

    public function parcels(): HasMany
    {
        return $this->hasMany(Parcel::class, 'zoning_application_id');
    }

    public function technicalReviews(): HasMany
    {
        return $this->hasMany(TechnicalReview::class, 'zoning_application_id');
    }

    public function siteInspections(): HasMany
    {
        return $this->hasMany(SiteInspection::class);
    }

    public function encodedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'encoded_by');
    }

    public static function countThisMonth(): int
    {
        return static::whereYear('created_at', now()->year)
            ->whereMonth('created_at', now()->month)
            ->count();
    }

    public static function byStatus(): Collection
    {
        return static::select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->get()
            ->pluck('cnt', 'status');
    }

    public static function recentApplications(int $limit = 5): Collection
    {
        return static::select(
            'id',
            'reference_number',
            'applicant_name',
            'application_type',
            'status'
        )
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get();
    }

    public static function barangayStats(): array
    {
        $rows = static::select('barangay', 'status', DB::raw('COUNT(*) as cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay', 'status')
            ->get();

        $stats = [];
        foreach ($rows as $row) {
            $b = trim($row->barangay);
            $stats[$b] ??= ['Total' => 0, 'Technical Review' => 0, 'Released' => 0];

            if (stripos($row->status, 'Review') !== false) {
                $stats[$b]['Technical Review'] += (int) $row->cnt;
            } elseif (stripos($row->status, 'Released') !== false) {
                $stats[$b]['Released'] += (int) $row->cnt;
            }

            $stats[$b]['Total'] += (int) $row->cnt;
        }

        return $stats;
    }
}