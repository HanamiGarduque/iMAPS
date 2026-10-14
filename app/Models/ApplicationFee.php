<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One charged fee of an application's assessment. The total stays on
 * zoning_applications.assessment_fee (the amount recorded with the OR).
 */
class ApplicationFee extends Model
{
    protected $table = 'application_fees';

    /**
     * fee_type => the field name the encoding form, the pages and the permit
     * templates use for that amount. Keep in sync with the
     * move_fee_breakdown_to_application_fees migration.
     */
    public const COLUMN_BY_TYPE = [
        'zoning_certificate'   => 'zoning_certificate_fee',
        'locational_clearance' => 'locational_clearance_fee',
        'development_permit'   => 'development_permit_fee',
        'other'                => 'other_fees',
        'penalty'              => 'penalty_fee',
    ];

    protected $fillable = [
        'zoning_application_id',
        'fee_type',
        'amount',
    ];

    protected $casts = [
        'amount' => 'float',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }
}
