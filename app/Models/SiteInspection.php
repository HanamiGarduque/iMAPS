<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

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
        // Canonical database reconciliation: the two retired entries below are
        // NOT part of the site_inspections contract and must stay absent here.
        // The first was zoning-application context, never inspection data. The
        // second (singular form) was a dead $fillable entry with no writer. The
        // live result field is the plural form, which is retained below.
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
        // Loop 9A delivery summary. Nullable by contract: NULL means the
        // delivery state was never established, which is the correct value for
        // every pre-existing row. Never inferred from task `status`.
        'last_delivery_attempt_at' => 'datetime',
        'delivered_at'             => 'datetime',
    ];

    /**
     * Append-only bridge delivery attempt history for this exact round.
     *
     * Delivery state is a separate business fact from the FieldSync task
     * lifecycle in `status` (assigned -> in_progress -> completed). These
     * attempts record what happened on the bridge only, and may never be used to
     * derive, infer, or alter task lifecycle.
     *
     * Loop 9A is schema foundation only: no writer populates these rows yet.
     */
    public function deliveryAttempts(): HasMany
    {
        return $this->hasMany(InspectionDeliveryAttempt::class, 'site_inspection_id');
    }

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

    /**
     * Get the parcel associated with this inspection.
     */
    public function parcel(): BelongsTo
    {
        return $this->belongsTo(Parcel::class, 'parcel_id');
    }

    /**
     * Append-only inspector ownership history for THIS round.
     *
     * Scoped to the round, because a reinspection is a separate row and must
     * never inherit or overwrite the previous round's ownership story.
     */
    public function assignmentHistory(): HasMany
    {
        return $this->hasMany(SiteInspectionAssignment::class, 'site_inspection_id')
            ->orderBy('reassigned_at')
            ->orderBy('id');
    }
}
