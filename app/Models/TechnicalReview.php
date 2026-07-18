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
        'site_inspection_task_id',
        'reviewed_at',
        'parcel_id',
    ];

    protected $casts = [
        'reviewed_at'        => 'datetime',
    ];

    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}