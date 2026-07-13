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
        'completed_at',
        'is_compliant',
        'findings',
        'recommendation',
        'remarks',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'scheduled_date' => 'date',
        'completed_at'   => 'datetime',
        'is_compliant'   => 'boolean',
    ];

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