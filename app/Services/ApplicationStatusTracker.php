<?php

namespace App\Services;

use App\Models\ApplicationStatusTrack;

class ApplicationStatusTracker
{
    public static function log(
        string $referenceNumber,
        string $applicantName,
        string $status
    ): void {
        ApplicationStatusTrack::create([
            'reference_number'       => $referenceNumber,
            'masked_applicant_name'  => self::maskName($applicantName),
            'status'                 => $status,
            'created_at'             => now(),
        ]);
    }

    /**
     * Juan Dela Cruz -> J*** D*** C***
     */
    public static function maskName(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name)))
            ->map(fn ($part) => strtoupper(substr($part, 0, 1)) . '***')
            ->implode(' ');
    }
}
