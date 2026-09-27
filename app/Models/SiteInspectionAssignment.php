<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One immutable row in the Site Inspector ownership history of a single
 * inspection ROUND.
 *
 * Round-scoped on purpose. A reinspection creates a brand new round, so an
 * inspector change on Round 1 can never be confused with a change on Round 2.
 * The exact round is recorded through a real foreign key rather than a
 * polymorphic target, so a history row can never point at a guessed round.
 *
 * This table is APPEND-ONLY history. The CURRENT inspector lives on
 * `site_inspections.inspector_id`.
 */
class SiteInspectionAssignment extends Model
{
    protected $table = 'site_inspection_assignments';

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
        'site_inspection_id',
        'assignment_type',
        'from_inspector_id',
        'to_inspector_id',
        'reason',
        'reason_note',
        'reassigned_by',
        'reassigned_at',
    ];

    protected $casts = [
        'site_inspection_id'   => 'integer',
        'from_inspector_id'    => 'integer',
        'to_inspector_id'      => 'integer',
        'reassigned_by'        => 'integer',
        'reassigned_at'        => 'datetime',
    ];

    public function inspection(): BelongsTo
    {
        return $this->belongsTo(SiteInspection::class, 'site_inspection_id');
    }

    public function fromInspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'from_inspector_id');
    }

    public function toInspector(): BelongsTo
    {
        return $this->belongsTo(User::class, 'to_inspector_id');
    }

    public function actor(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reassigned_by');
    }
}
