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
        'assigned_by_imaps_user_id',
        'assigned_by_name',
        'parcel_id',
        'findings',
        'recommendation',
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
    public function setStatusAttribute(?string $value): void
    {
        $existing = $this->attributes['status'] ?? null;
        $this->attributes['status'] = $existing === 'completed'
            ? 'completed'
            : $value;
    }

    public function setSubmittedAtAttribute(mixed $value): void
    {
        $existing = $this->attributes['submitted_at'] ?? null;
        $this->attributes['submitted_at'] = $existing ?? $value;
    }

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
     * Build a clean inspection round for the same application and parcel.
     *
     * Deliberately returns a new, unsaved model: completed-round evidence and
     * identity are never copied or updated. The caller owns persistence and
     * dispatch after its surrounding transaction succeeds.
     */
    public function newRound(array $assignment): self
    {
        return new self([
            'zoning_application_id'     => $this->zoning_application_id,
            'parcel_id'                 => $this->parcel_id,
            'inspector_id'              => $assignment['inspector_id'],
            'scheduled_date'            => $assignment['scheduled_date'],
            'deadline_date'             => $assignment['deadline_date'],
            'assigned_notes'            => $assignment['assigned_notes'] ?? null,
            'assigned_by_imaps_user_id' => $assignment['assigned_by_imaps_user_id'],
            'assigned_by_name'          => $assignment['assigned_by_name'],
            'status'                    => 'assigned',
        ]);
    }

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
