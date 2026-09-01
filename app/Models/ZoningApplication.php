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
        'form_number',
        'application_type',
        'land_use_class',
        'status',
        'purpose',
        'applicant_name',
        'contact_number',
        'email',
        'representative_name',
        'barangay',
        'assessment_fee',
        'or_number',
        'remarks',
        'encoded_by',
    ];

    protected $casts = [
        'assessment_fee' => 'float',
    ];

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