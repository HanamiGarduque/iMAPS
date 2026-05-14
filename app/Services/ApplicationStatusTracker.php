<?php

namespace App\Services;

use App\Models\ApplicationStatusTrack;
use App\Services\SMSNotifier;

class ApplicationStatusTracker
{
    public static function log(
        string $referenceNumber,
        string $applicantName,
        string $status
    ): void {
        ApplicationStatusTrack::create([
            'reference_number'       => $referenceNumber,
            'masked_applicant_name'  => SMSNotifier::maskName($applicantName),
            'status'                 => $status,
            'created_at'             => now(),
        ]);
    }
}