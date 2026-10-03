<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable row in the Planning Officer ownership history of an application.
 *
 * Append-only. A row is written when ownership is first established and again on
 * every later change, so the officer who originally held the application is
 * never overwritten and never lost.
 *
 * This table is APPEND-ONLY history. The CURRENT owner lives on
 * `zoning_applications.assigned_planning_officer_id`; this table explains how it
 * got there. The two are deliberately separate so that a corrupted or deleted
 * history row can never change who currently owns an application.
 */
class ApplicationPoAssignment extends Model
{
    protected $table = 'application_po_assignments';

    public const TYPE_INITIAL = 'initial';
    public const TYPE_REASSIGNMENT = 'reassignment';

    /**
     * This table is append-only and records its own moment in
     * `reassigned_at`. Eloquent's created_at/updated_at pair is deliberately
     * absent: a history row is never updated, so an updated_at column would
     * only ever be misleading.
     */
    public $timestamps = false;

    protected $fillable = [
        'zoning_application_id',
        'assignment_type',
        'from_planning_officer_id',
        'to_planning_officer_id',
        'reason',
        'reason_note',
        'reassigned_by',
        'reassigned_at',
    ];

    protected $casts = [
        'zoning_application_id'      => 'integer',
        'from_planning_officer_id'   => 'integer',
        'to_planning_officer_id'     => 'integer',
        'reassigned_by'              => 'integer',
        'reassigned_at'              => 'datetime',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    public function fromPlanningOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_planning_officer_id');
    }

    public function toPlanningOfficer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_planning_officer_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reassigned_by');
    }
}
