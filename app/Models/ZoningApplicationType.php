<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * One application type of a zoning application (an application can be filed
 * for several). zoning_applications.application_type is only the display label.
 */
class ZoningApplicationType extends Model
{
    protected $table = 'zoning_application_types';

    public $timestamps = false;

    protected $fillable = [
        'zoning_application_id',
        'application_type',
    ];

    public function application(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }
}
