<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TechnicalReview extends Model
{
    protected $fillable = [
        'zoning_application_id',
        'reviewed_by',
        'review_round',
        'decision',
        'findings',
        'decision_reason',
        // The NEW inspection round created by this decision, when applicable.
        'site_inspection_task_id',
        // Loop 8: the EXISTING inspection round whose result this review is
        // reviewing. NOT a synonym of site_inspection_task_id.
        'reviewed_site_inspection_id',
        'reviewed_at',
        'parcel_id',
    ];

    protected $casts = [
        'reviewed_at'                => 'datetime',
        'reviewed_site_inspection_id' => 'integer',
    ];

    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    /**
     * Loop 8: the inspection round this review is reviewing. This is the
     * completed round whose result the Planning Officer is acting on, which is
     * deliberately distinct from `site_inspection_task_id` (the new round that
     * a "Requires Reinspection" decision may have just created).
     */
    public function reviewedInspection(): BelongsTo
    {
        return $this->belongsTo(SiteInspection::class, 'reviewed_site_inspection_id');
    }

    /**
     * The new inspection round created by this review decision, if any.
     */
    public function createdInspection(): BelongsTo
    {
        return $this->belongsTo(SiteInspection::class, 'site_inspection_task_id');
    }
}