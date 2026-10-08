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

    public const PERMIT_LABELS = [
        'ze' => 'Zoning Evaluation',
        'lc' => 'Locational Clearance',
        'zc' => 'Zoning Certificate',
        'dp' => 'Development Permit',
    ];

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
        'applicant_street',
        'applicant_barangay',
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
        'business_name',
        'project_cost',
        'right_over_land',
        'project_tenure',
        'preferred_release_mode',
        'assessment_fee',
        'or_number',
        'remarks',
        'encoded_by',
        // CURRENT responsible Planning Officer. This is NOT `encoded_by`
        // (who typed the application up) and NOT `technical_reviews.reviewed_by`
        // (who decided in a given round). Those keep their own meanings.
        'assigned_planning_officer_id',
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

    public function hasSbRouting(): bool
    {
        if (strtolower((string) $this->application_stream) === 'amendment') {
            return true;
        }
        if ($this->status === 'Under Sangguniang Bayan') {
            return true;
        }
        if (!empty(trim((string) $this->sb_ordinance_number))) {
            return true;
        }
        return DB::table('application_status_tracks')
            ->where('reference_number', $this->reference_number)
            ->where('status', 'Under Sangguniang Bayan')
            ->exists();
    }

    public function parcels(): HasMany
    {
        return $this->hasMany(Parcel::class, 'zoning_application_id');
    }

    public function generatedPermits(): HasMany
    {
        return $this->hasMany(GeneratedPermit::class, 'zoning_application_id')->latest();
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

    /**
     * The Planning Officer CURRENTLY responsible for this application.
     *
     * Returns null when ownership has never been established. That is the
     * honest answer: the current business flow has no step that assigns an
     * application to an officer, so historical rows are left unowned rather
     * than backfilled with a guess.
     */
    public function assignedPlanningOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'assigned_planning_officer_id');
    }

    /**
     * Append-only ownership history. Oldest first, so a "changed by" line reads
     * in the order the changes actually happened.
     */
    public function poAssignmentHistory(): HasMany
    {
        return $this->hasMany(ApplicationPoAssignment::class, 'zoning_application_id')
            ->orderBy('reassigned_at')
            ->orderBy('id');
    }

    /**
     * Get permit types recommended to be issued for this application based on its application_type and stream.
     * Note: 'ze' (Zoning Evaluation) is an internal review worksheet and not an issued permit.
     *
     * @return string[] Array of permit codes (e.g. ['lc'], ['lc', 'zc'])
     */
    public function getRecommendedPermitTypes(): array
    {
        $types = array_filter(array_map('trim', explode(',', $this->application_type ?? '')));
        $recommended = [];

        foreach ($types as $type) {
            $lower = strtolower($type);

            if (str_contains($lower, 'palc')) {
                $recommended[] = 'dp';
            } elseif (str_contains($lower, 'development')) {
                $recommended[] = 'dp';
            } elseif (str_contains($lower, 'zoning cert')) {
                $recommended[] = 'zc';
            } elseif (str_contains($lower, 'locational') || str_contains($lower, 'clearance')) {
                $recommended[] = 'lc';
            } elseif (str_contains($lower, 'rezoning') || str_contains($lower, 'reclassification')) {
                // In amendment stream or petitions, approved petition culminates in Locational Clearance citing SB ordinance
                $recommended[] = 'lc';
            }
        }

        // If none matched individual tokens, check the whole string
        if (empty($recommended)) {
            $lower = strtolower($this->application_type ?? '');
            if (str_contains($lower, 'palc') || str_contains($lower, 'development')) {
                $recommended[] = 'dp';
            } elseif (str_contains($lower, 'zoning cert')) {
                $recommended[] = 'zc';
            } elseif (str_contains($lower, 'rezoning') || str_contains($lower, 'reclassification')) {
                $recommended[] = 'lc';
            } else {
                $recommended[] = 'lc';
            }
        }

        return array_values(array_unique($recommended));
    }

    /**
     * Get recommended permit types that have NOT been generated yet for this application.
     *
     * @return string[] Array of missing permit codes (e.g. ['zc'])
     */
    public function getMissingRecommendedPermitTypes(): array
    {
        $recommended = $this->getRecommendedPermitTypes();
        if (empty($recommended)) {
            return [];
        }

        $generatedTypes = ($this->relationLoaded('generatedPermits') ? $this->generatedPermits : $this->generatedPermits())
            ->pluck('permit_type')
            ->filter()
            ->unique()
            ->all();

        $missing = [];
        $lowerAppType = strtolower($this->application_type ?? '');
        $hasPalc = str_contains($lowerAppType, 'palc');

        foreach ($recommended as $code) {
            // For PALC, generating either 'dp' or 'lc' satisfies PALC unless 'lc' is explicitly in recommended
            if ($code === 'dp' && $hasPalc && in_array('lc', $generatedTypes, true) && !in_array('lc', $recommended, true)) {
                continue;
            }

            if (!in_array($code, $generatedTypes, true)) {
                $missing[] = $code;
            }
        }

        return array_values(array_unique($missing));
    }

    /**
     * Get missing recommended permit names in human-readable form.
     *
     * @return string[] Array of missing permit names (e.g. ['Locational Clearance', 'Zoning Certificate'])
     */
    public function getMissingRecommendedPermitNames(): array
    {
        $missing = $this->getMissingRecommendedPermitTypes();
        return array_map(fn($code) => self::PERMIT_LABELS[$code] ?? strtoupper($code), $missing);
    }

    /**
     * Check if all recommended permit documents have been generated.
     */
    public function hasAllRecommendedPermitsGenerated(): bool
    {
        return empty($this->getMissingRecommendedPermitTypes());
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