<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Str;

class ApplicationDraft extends Model
{
    use HasFactory;

    /**
     * The attributes that are mass assignable.
     *
     * @var array<int, string>
     */
    protected $fillable = [
        'user_id',
        'temp_reference_number',
        'applicant_name',
        'application_type',
        'barangay',
        'status',
        'form_payload',
    ];

    /**
     * The attributes that should be cast.
     *
     * @var array<string, string>
     */
    protected $casts = [
        'form_payload' => 'array',
    ];

    /**
     * Default attribute values.
     *
     * @var array<string, mixed>
     */
    protected $attributes = [
        'status' => 'Auto-saved',
    ];

    /**
     * Auto-generate a unique temp reference number when creating a draft,
     * if one wasn't already provided.
     */
    protected static function booted(): void
    {
        static::creating(function (ApplicationDraft $draft) {
            if (empty($draft->temp_reference_number)) {
                $draft->temp_reference_number = static::generateTempReferenceNumber();
            }
        });
    }

    /**
     * Generate a unique temp reference number, e.g. DRAFT-20260719-4F3A9B.
     */
    public static function generateTempReferenceNumber(): string
    {
        do {
            $candidate = 'DRAFT-' . now()->format('Ymd') . '-' . strtoupper(Str::random(6));
        } while (static::where('temp_reference_number', $candidate)->exists());

        return $candidate;
    }

    /**
     * The user who owns this draft.
     */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}