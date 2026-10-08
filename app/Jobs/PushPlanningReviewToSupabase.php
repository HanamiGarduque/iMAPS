<?php

namespace App\Jobs;

use App\Services\SupabaseService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

/**
 * Loop 8 — Planning Review Metadata transport (iMAPS -> Supabase).
 *
 * Writes ONE read-only `field_job_reviews` record for the exact inspection
 * round that was reviewed.
 *
 * Hard boundaries:
 *  - the remote target is resolved ONLY by `reviewed_site_inspection_id`
 *    (canonical inspection/job bridge identity), never by application, parcel
 *    or reference number;
 *  - it never writes `field_jobs` — status, current_step, progress, completed
 *    state, reinspection state, photo evidence and sync ACK state are untouched;
 *  - failure is explicit and auditable: an unresolvable round or a failed write
 *    is logged with the review identity and is never retried silently as a
 *    different target.
 *
 * Cross-environment namespace (this writer resolves mirror rows through local
 * ids, so both its lookup and its write are namespaced):
 *  - the job is resolved as (bridge_source_id, local_inspection_id), so a
 *    review cannot attach to another environment's round that shares the
 *    integer;
 *  - `field_job_reviews` is upserted on (bridge_source_id,
 *    technical_review_id), so two environments holding the same local review id
 *    cannot overwrite each other's review;
 *  - both fail closed when IMAPS_BRIDGE_SOURCE_ID is unset.
 */
class PushPlanningReviewToSupabase implements ShouldQueue
{
    use Dispatchable;
    use InteractsWithQueue;
    use Queueable;
    use SerializesModels;

    /**
     * Planning Review decisions that are transports to FieldSync.
     *
     * "Needs Site Inspection" is deliberately excluded: it is the INITIAL
     * scheduling decision, it has no reviewed round, and its reviewed round id
     * is NULL by contract, so no transport row is created for it.
     */
    public const TRANSPORTABLE_DECISIONS = [
        'Approved',
        'Declined',
        'Requires Reinspection',
    ];

    public function __construct(
        public int $technicalReviewId,
        public int $reviewedSiteInspectionId,
        public string $decision,
        public int $reviewedBy,
        public ?string $reviewedByName = null,
        public ?string $reviewedAt = null,
        public ?string $decisionReason = null,
    ) {
    }

    public function handle(SupabaseService $supabase): void
    {
        if (! in_array($this->decision, self::TRANSPORTABLE_DECISIONS, true)) {
            Log::warning('Loop 8 planning review transport skipped: non-result decision', [
                'technical_review_id' => $this->technicalReviewId,
                'decision'            => $this->decision,
            ]);

            return;
        }

        $fieldJobId = $supabase->findFieldJobIdByLocalInspectionId($this->reviewedSiteInspectionId);

        if ($fieldJobId === null) {
            Log::warning('Loop 8 planning review transport skipped: no field job for reviewed round', [
                'technical_review_id'         => $this->technicalReviewId,
                'reviewed_site_inspection_id' => $this->reviewedSiteInspectionId,
                'decision'                    => $this->decision,
            ]);

            return;
        }

        $ok = $supabase->upsertFieldJobReview([
            'field_job_id'                => $fieldJobId,
            'technical_review_id'         => $this->technicalReviewId,
            'reviewed_site_inspection_id' => $this->reviewedSiteInspectionId,
            'decision'                    => $this->decision,
            'reviewed_by'                 => $this->reviewedBy,
            'reviewed_by_name'            => $this->reviewedByName,
            'reviewed_at'                 => $this->reviewedAt,
            'decision_reason'             => $this->decisionReason,
        ]);

        if (! $ok) {
            Log::error('Loop 8 planning review transport failed', [
                'technical_review_id'         => $this->technicalReviewId,
                'reviewed_site_inspection_id' => $this->reviewedSiteInspectionId,
                'field_job_id'                => $fieldJobId,
            ]);
        }
    }
}
