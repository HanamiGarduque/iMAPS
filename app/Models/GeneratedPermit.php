<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class GeneratedPermit extends Model
{
    use HasFactory;

    // Removing a saved permit hides it but keeps the row and the stored file:
    // it may already have been issued, and permits fall under MPDO's retention.
    use SoftDeletes;

    protected $table = 'generated_permits';

    protected $fillable = [
        'zoning_application_id',
        'permit_type',
        'permit_name',
        'file_name',
        'file_path',
        'file_format',
        'file_size',
        'input_data',
        'generated_by',
    ];

    protected $casts = [
        'input_data' => 'array',
        'file_size'  => 'integer',
    ];

    protected $appends = ['formatted_file_size'];

    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function getFormattedFileSizeAttribute(): string
    {
        $bytes = (int) $this->file_size;
        if ($bytes >= 1048576) {
            return number_format($bytes / 1048576, 1) . ' MB';
        }
        if ($bytes >= 1024) {
            return number_format($bytes / 1024, 0) . ' KB';
        }
        return $bytes . ' bytes';
    }
}
