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
        'zoning_compliant',
        'land_use_compliant',
        'findings',
        'decision_reason',
        'site_inspection_task_id',
        'reviewed_at',
    ];

    protected $casts = [
        'zoning_compliant'   => 'boolean',
        'documents_complete' => 'boolean',
        'land_use_compliant' => 'boolean',
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