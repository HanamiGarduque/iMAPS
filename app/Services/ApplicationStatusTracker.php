<?php

namespace App\Services;

use App\Models\ApplicationStatusTrack;
use App\Models\ZoningApplication;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Log;
use Throwable;

class ApplicationStatusTracker
{
    public const STATUS_ORDER = [
        'Received'                  => 1,
        'Technical Review'          => 2,
        'Site Inspection Scheduled' => 3,
        'Under Sangguniang Bayan'   => 4,
        'For Release'               => 5,
        'Approved'                  => 6,
        'Released'                  => 7,
        'Denied'                    => 8,
    ];

    public static function log(
        string|ZoningApplication $applicationOrRef,
        ?string $applicantName = null,
        ?string $status = null,
        ?string $formNumber = null,
        ?string $contactNumber = null,
        ?string $applicationType = null,
        ?string $businessName = null,
        ?string $note = null,
        ?string $scheduledDate = null,
        ?int $stageOrder = null
    ): ApplicationStatusTrack {
        if ($applicationOrRef instanceof ZoningApplication) {
            $referenceNumber = $applicationOrRef->reference_number;
            $formNumber      = $formNumber ?? $applicationOrRef->form_number;
            $contactNumber   = $contactNumber ?? $applicationOrRef->contact_number;
            $applicantName   = $applicantName ?? $applicationOrRef->applicant_name;
            $applicationType = $applicationType ?? $applicationOrRef->application_type;
            $businessName    = $businessName ?? ($applicationOrRef->business_name ?? $applicationOrRef->project_type_business_name ?? null);
            $status          = $status ?? $applicationOrRef->status;
        } else {
            $referenceNumber = (string) $applicationOrRef;

            if ($formNumber === null || $contactNumber === null || $applicationType === null || $businessName === null) {
                $app = ZoningApplication::where('reference_number', $referenceNumber)->first();
                if ($app) {
                    $formNumber      = $formNumber ?? $app->form_number;
                    $contactNumber   = $contactNumber ?? $app->contact_number;
                    $applicantName   = $applicantName ?? $app->applicant_name;
                    $applicationType = $applicationType ?? $app->application_type;
                    $businessName    = $businessName ?? ($app->business_name ?? $app->project_type_business_name ?? null);
                }
            }
        }

        $maskedName = self::maskName((string) ($applicantName ?? ''));
        $resolvedStageOrder = $stageOrder ?? self::STATUS_ORDER[$status ?? ''] ?? 1;

        $recordData = [
            'reference_number'      => $referenceNumber,
            'form_number'           => $formNumber,
            'contact_number'        => $contactNumber,
            'masked_applicant_name' => $maskedName,
            'application_type'      => $applicationType,
            'business_name'         => $businessName,
            'status'                => $status ?? 'Received',
            'stage_order'           => $resolvedStageOrder,
            'note'                  => $note,
            'scheduled_date'        => $scheduledDate,
            'created_at'            => now(),
        ];

        // 1. Insert into local DB
        $track = ApplicationStatusTrack::create($recordData);

        // 2. Sync to Supabase
        try {
            if (config('services.supabase.url') && config('services.supabase.service_key')) {
                /** @var SupabaseService $supabase */
                $supabase = app(SupabaseService::class);
                $supabase->pushStatusTrack([
                    'reference_number'      => $recordData['reference_number'],
                    'form_number'           => $recordData['form_number'],
                    'contact_number'        => $recordData['contact_number'],
                    'masked_applicant_name' => $recordData['masked_applicant_name'],
                    'application_type'      => $recordData['application_type'],
                    'business_name'         => $recordData['business_name'],
                    'status'                => $recordData['status'],
                    'stage_order'           => $recordData['stage_order'],
                    'note'                  => $recordData['note'],
                    'scheduled_date'        => $recordData['scheduled_date'] ? Carbon::parse($recordData['scheduled_date'])->toIso8601String() : null,
                ]);
            }
        } catch (Throwable $e) {
            Log::warning('Failed to sync application status track to Supabase', [
                'reference_number' => $referenceNumber,
                'status'           => $status,
                'error'            => $e->getMessage(),
            ]);
        }

        return $track;
    }

    /**
     * Juan Dela Cruz -> J*** D*** C***
     */
    public static function maskName(string $name): string
    {
        return collect(preg_split('/\s+/', trim($name), -1, PREG_SPLIT_NO_EMPTY))
            ->map(fn ($part) => strtoupper(mb_substr($part, 0, 1)) . '***')
            ->implode(' ');
    }
}
