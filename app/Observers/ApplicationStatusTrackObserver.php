<?php

namespace App\Observers;

use App\Models\ApplicationStatusTrack;
use App\Services\SupabaseService;

class ApplicationStatusTrackObserver
{
    public function __construct(private SupabaseService $supabase) {}

    public function created(ApplicationStatusTrack $track): void
    {
        $this->supabase->syncStatusTrack([
            'reference_number'      => $track->reference_number,
            'masked_applicant_name' => $track->masked_applicant_name,
            'status'                => $track->status,
            'created_at'            => $track->created_at,
        ]);
    }
}