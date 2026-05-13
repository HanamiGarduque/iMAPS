<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;

class SMSNotifier
{
    
    private static bool $enabled = false;

    /**
     * Send SMS.
     */
    public static function send(string $mobile, string $message): void
{
    // sanitize number
    $mobile = preg_replace('/\D/', '', $mobile);

    // remove leading 0 if exists
    if (str_starts_with($mobile, '0')) {
        $mobile = substr($mobile, 1);
    }

    // SMS disabled
    if (!config('app.sms_enabled')) {

        Log::info('[iMAPS SMS STUB]', [
            'to' => '+63' . $mobile,
            'message' => $message,
        ]);

        return;
    }

    // REAL API CALL HERE LATER
}

    /**
     * Mask applicant name.
     * Example:
     * Juan Dela Cruz -> J*** D*** C***
     */
    public static function maskName(string $name): string
    {
        $parts = explode(' ', trim($name));

        return collect($parts)
            ->map(function ($part) {
                return strtoupper(substr($part, 0, 1)) . '***';
            })
            ->implode(' ');
    }

    /**
     * Application created notification.
     */
    public static function applicationCreated(
        string $mobile,
        string $referenceNumber,
        string $applicantName
    ): void {

        $maskedName = self::maskName($applicantName);

        $portalUrl = config('app.url');

        $message =
            "iMAPS Rosario\n" .
            "Reference Number: {$referenceNumber}\n" .
            "Applicant: {$maskedName}\n" .
            "Track Status: {$portalUrl}";

        self::send($mobile, $message);
    }
}