<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SiteInspection extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'zoning_application_id',
        'inspector_id',
        'status',
        'scheduled_date',
        'deadline_date',
        'completed_at',
        'assigned_notes',
        'parcel_id',
        'findings',
        'recommendation',
        'remarks',
        'is_compliant',
        'submitted_at',
        'inspection_result',
        'observations',
        'discrepancies',
        'recommendations',
        'inspector_notes',
        'checklist_data',
        'confirmed_latitude',
        'confirmed_longitude',
        'gps_accuracy_m',
        'gps_confirmed_at',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'scheduled_date'      => 'date',
        'deadline_date'       => 'date',
        'completed_at'        => 'datetime',
        'submitted_at'        => 'datetime',
        'checklist_data'      => 'array',
        'confirmed_latitude'  => 'float',
        'confirmed_longitude' => 'float',
        'gps_accuracy_m'      => 'float',
        'gps_confirmed_at'    => 'datetime',
    ];

    /**
     * Get the application associated with the inspection.
     */
    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class);
    }

    /**
     * Get the personnel/user assigned to this inspection.
     */
    public function inspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inspector_id');
    }
}
