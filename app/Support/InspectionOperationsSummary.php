<?php

namespace App\Support;

use App\Models\SiteInspection;
use App\Models\TechnicalReview;

/**
 * PHASE 2B1 - read-only enrichment for the Admin Site Inspection page.
 *
 * This class exists to make ONE thing impossible: showing a Planning Officer
 * decision, a delivery state or a diagnostic on an inspection round when the
 * database cannot actually prove it.
 *
 * THE HONESTY RULES THIS ENFORCES
 * ------------------------------
 * 1. PO DECISION is shown only when a `technical_reviews` row carries
 *    `reviewed_site_inspection_id = <that inspection id>`. That is the only
 *    column that means "this round was the one reviewed".
 *
 *    `site_inspection_task_id` is deliberately NOT used. It is the round the
 *    review CREATED or is attached to, not the round that was judged. Using it
 *    would be exactly backwards: a `Requires Reinspection` decision on Round 1
 *    would be displayed against Round 2, the round it produced. Every one of
 *    the 80 historical reviews has `reviewed_site_inspection_id IS NULL`, so
 *    today this shows nothing - which is the correct, honest result.
 *
 * 2. `Needs Site Inspection` is NEVER shown as a post-inspection decision. It
 *    creates/requests an inspection; it is not a verdict on a finished one.
 *
 * 3. A diagnostic report is NEVER attached to a round. The remote
 *    `diagnostic_reports` table has no `local_inspection_id` and no
 *    `parcel_id`, so no per-round diagnostic health is derivable. This class
 *    therefore does not pretend to produce one.
 *
 * 4. Delivery uses the canonical `InspectionDeliveryStatus` vocabulary, per
 *    round, and NULL is `no_delivery_record` - never a failure.
 */
class InspectionOperationsSummary
{
    /**
     * Decisions that may be displayed as a post-inspection verdict.
     *
     * `Needs Site Inspection` is absent by design: it requests an inspection
     * rather than judging a completed one.
     */
    public const DISPLAYABLE_DECISIONS = ['Approved', 'Declined', 'Requires Reinspection'];

    /**
     * Enrich a collection of inspection rounds for the Admin overview.
     *
     * @param  \Illuminate\Support\Collection<int, SiteInspection>  $inspections
     * @return array<int, array<string, mixed>>
     */
    public function summarize($inspections): array
    {
        $rows = $inspections->values();

        // One query for every decision that is honestly linkable, keyed by the
        // reviewed round. Rows without a link are simply absent, which is the
        // point: absence is real information, not a gap to be filled in.
        $decisions = $this->linkableDecisions($rows->pluck('id')->filter()->all());

        return $rows->map(function (SiteInspection $inspection) use ($decisions) {
            $deliveryState = \App\Support\InspectionDeliveryStatus::state(
                $inspection->delivery_status
            );

            $review = $decisions[$inspection->id] ?? null;

            return [
                'id' => $inspection->id,
                'applicant_name' => $inspection->zoningApplication?->applicant_name,
                'parcel_label' => $this->parcelLabel($inspection),
                'inspector_name' => $inspection->inspector?->name,
                'scheduled_date' => $inspection->scheduled_date?->toDateString(),
                'deadline_date' => $inspection->deadline_date?->toDateString(),
                'delivery_state' => $deliveryState,
                'delivery_label' => \App\Support\InspectionDeliveryStatus::label($deliveryState),
                'delivery_is_failure' => \App\Support\InspectionDeliveryStatus::isFailure(
                    $inspection->delivery_status
                ),
                // Null whenever the database cannot prove a decision for THIS
                // round. The view must render nothing in that case.
                'po_decision' => $review['decision'] ?? null,
                'po_decision_date' => $review['reviewed_at'] ?? null,
                // There is no per-round diagnostic linkage. Stated explicitly so
                // the view cannot accidentally imply one.
                'has_diagnostic' => null,
            ];
        })->all();
    }

    /**
     * Page-level counters, each derived only from locally provable state.
     *
     * `awaiting_po_review` is deliberately NOT provided. Proving it would
     * require linking a completed round to the absence of a post-inspection
     * review, and with `reviewed_site_inspection_id` NULL everywhere that
     * absence is indistinguishable from "never linked", so any count would be a
     * guess.
     *
     * @return array<string, int>
     */
    public function counters($inspections): array
    {
        $rows = $inspections->values();

        return [
            'total' => $rows->count(),
            'under_inspection' => $rows->filter(
                fn ($i) => in_array($i->status, ['assigned', 'pending', 'in-progress'], true)
            )->count(),
            'completed' => $rows->filter(fn ($i) => $i->status === 'completed')->count(),
            'reinspections' => $rows->filter(fn ($i) => ((int) ($i->round_number ?? 1)) > 1)->count(),
            'delivery_issues' => $rows->filter(
                fn ($i) => \App\Support\InspectionDeliveryStatus::isFailure($i->delivery_status)
            )->count(),
        ];
    }

    /**
     * The latest displayable decision per reviewed round, and only for rows that
     * actually name the round they reviewed.
     *
     * @param  array<int, int>  $inspectionIds
     * @return array<int, array{decision: string, reviewed_at: ?string}>
     */
    private function linkableDecisions(array $inspectionIds): array
    {
        if ($inspectionIds === []) {
            return [];
        }

        $reviews = TechnicalReview::query()
            ->whereIn('reviewed_site_inspection_id', $inspectionIds)
            ->whereIn('decision', self::DISPLAYABLE_DECISIONS)
            ->orderByDesc('reviewed_at')
            ->orderByDesc('id')
            ->get(['reviewed_site_inspection_id', 'decision', 'reviewed_at']);

        $out = [];

        foreach ($reviews as $review) {
            $roundId = (int) $review->reviewed_site_inspection_id;

            // orderByDesc guarantees the newest is seen first, so the first hit
            // per round is the latest decision. No round is ever collapsed away.
            if (! isset($out[$roundId])) {
                $out[$roundId] = [
                    'decision' => (string) $review->decision,
                    'reviewed_at' => $review->reviewed_at?->toDateString(),
                ];
            }
        }

        return $out;
    }

    private function parcelLabel(SiteInspection $inspection): ?string
    {
        $parcel = $inspection->parcel;

        if (! $parcel) {
            return null;
        }

        $parts = array_filter([
            $parcel->barangay,
            $parcel->lot_number ? 'Lot '.$parcel->lot_number : null,
        ]);

        return $parts === [] ? null : implode(', ', $parts);
    }
}
