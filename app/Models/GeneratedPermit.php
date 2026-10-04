<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class GeneratedPermit extends Model
{
    use HasFactory;

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

    protected $appends = ['public_url', 'formatted_file_size'];

    public function zoningApplication(): BelongsTo
    {
        return $this->belongsTo(ZoningApplication::class, 'zoning_application_id');
    }

    public function generatedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'generated_by');
    }

    public function getPublicUrlAttribute(): string
    {
        return Storage::disk('public')->url($this->file_path);
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
