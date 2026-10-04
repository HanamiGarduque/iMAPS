<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One internal Development Support consultation episode for a Technical Issue.
 *
 * The row IS the authoritative episode record. There is no second audit table:
 * every provenance field (who opened / when, who recorded the recommendation /
 * when, what was recommended, who closed / when, why) is on this row, so no
 * edit path may destroy or overwrite one of them. A recommendation is written
 * once and is then immutable; a closed row is immutable in full.
 */
class ReportEscalation extends Model
{
    public const OPEN = 'open';
    public const CLOSED = 'closed';

    /** Plain-text limits, mirroring the DB CHECK constraints. */
    public const MAX_RECOMMENDATION = 2000;
    public const MAX_CLOSURE_NOTE = 2000;

    protected $table = 'report_escalations';

    /**
     * No updated_at, deliberately.
     *
     * An escalation episode has no editable lifecycle: it is opened once, may
     * receive one recommendation, and is closed once. There is no legitimate
     * mutation that would deserve an "updated" stamp, and adding one would let a
     * later edit quietly rewrite the record's history. `created_at` is written
     * explicitly by the service instead of being auto-managed.
     */
    public $timestamps = false;

    protected $fillable = [
        'report_id', 'status', 'created_by', 'created_at', 'recommendation',
        'recommendation_recorded_by', 'recommendation_at', 'closed_by', 'closed_at', 'closure_note',
    ];

    protected $casts = [
        'created_at' => 'datetime',
        'recommendation_at' => 'datetime',
        'closed_at' => 'datetime',
    ];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function recommendationRecorder()
    {
        return $this->belongsTo(User::class, 'recommendation_recorded_by');
    }

    public function closer()
    {
        return $this->belongsTo(User::class, 'closed_by');
    }

    public function isOpen(): bool
    {
        return $this->status === self::OPEN;
    }
}