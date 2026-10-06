<?php

namespace App\Support;

use App\Models\SiteInspection;

/**
 * PHASE 2B2C - honest Planning Officer review visibility.
 *
 * THERE ARE TWO DIFFERENT THINGS, AND CONFLATING THEM WOULD BE A LIE
 * -----------------------------------------------------------
 * A. ROUND-SPECIFIC DECISION.
 *    A `technical_reviews` row whose `reviewed_site_inspection_id` names THIS
 *    EXACT `site_inspections.id`. That is the only column that means "this round
 *    was the one judged", so it is the only thing that may be called a decision
 *    *for this round*.
 *
 * B. LATEST PARCEL REVIEW.
 *    The most recent review recorded for the SAME (zoning_application_id,
 *    parcel_id). This is parcel-level CONTEXT. It is not a verdict on any round,
 *    and must never be presented as one.
 *
 * Today every one of the 80 historical reviews has
 * `reviewed_site_inspection_id IS NULL`. So on current data there is no
 * round-specific decision anywhere, and that is the correct, honest result - not
 * a gap to be filled by inference.
 *
 * WHAT IS DELIBERATELY NOT DONE
 * ----------------------------
 * - `site_inspection_task_id` is NEVER read as the reviewed round. It is the
 *   round a review CREATED or is attached to, not the round that was judged.
 *   Reading it backwards is how a `Requires Reinspection` on Round 1 would end up
 *   displayed against the Round 2 it produced.
 * - No review is ever attributed to an inspection by application alone, by
 *   ordering, by date, by applicant or by similarity.
 * - A parcel-unknown inspection receives NO parcel-level review. It has no
 *   parcel, so "the latest review for this parcel" is not a question that can be
 *   asked of it. Inferring one would attach an unrelated lot's review to it.
 *
 * `Needs Site Inspection` is treated as a REQUEST, not a verdict: it asks for an
 * inspection rather than judging a finished one, so it is presented as
 * "Site Inspection Requested" and never as a post-inspection decision. The
 * stored value is never renamed.
 *
 * READ ONLY. Nothing here mutates a review, backfills a link, or grants any
 * authority: this decides what may be *said*, never what may be *done*.
 */
final class InspectionReviewVisibility
{
    /**
     * Decisions that may be displayed as a verdict ON AN INSPECTION ROUND.
     *
     * `Needs Site Inspection` is absent by design: it requests an inspection
     * rather than judging a completed one.
     */
    public const ROUND_DECISIONS = ['Approved', 'Declined', 'Requires Reinspection'];

    /** A review that asks for an inspection. Presented as a request. */
    public const REQUEST_DECISION = 'Needs Site Inspection';

    /** Presentation wording for a request. The stored value is untouched. */
    public const REQUEST_LABEL = 'Site Inspection Requested';

    /** Supporting line under a request, so it cannot read as a verdict. */
    public const REQUEST_CONTEXT = 'Planning Officer requested a site inspection.';

    /** Supporting line for parcel-level context. */
    public const PARCEL_CONTEXT = 'Parcel-level review, not linked to a specific inspection round.';

    /**
     * Resolve review visibility for a set of inspections.
     *
     * A FIXED number of queries for any number of inspections - never one per
     * card.
     *
     * @param  iterable<SiteInspection>  $inspections
     * @param  (callable(array<int,SiteInspection>): array{linked: array, parcel: array, heads: array})|null  $fetch
     *        seam for tests. Production passes none and therefore always reads the
     *        database; injecting it lets the RESOLUTION contract be proved
     *        executably in a suite whose database driver is unavailable, without
     *        weakening the production path.
     * @return array<int, array<string, mixed>> keyed by inspection id
     */
    public static function summarize($inspections, ?callable $fetch = null, ?callable $chainReader = null): array
    {
        $rows = [];

        foreach ($inspections as $inspection) {
            $id = (int) $inspection->getKey();

            if ($id > 0) {
                $rows[$id] = $inspection;
            }
        }

        if ($rows === []) {
            return [];
        }

        // Canonical round identity, so "the latest round of this parcel" can be
        // decided once here rather than re-derived by every caller.
        $rounds = InspectionRoundNumbering::forInspections($rows, $chainReader);

        if ($fetch === null) {
            $data = self::fetchAll($rows, $chainReader);
        } else {
            $data = $fetch($rows);
        }

        $roundLinked = $data['linked'] ?? [];
        $parcelLatest = $data['parcel'] ?? [];
        $chainHeads = $data['heads'] ?? [];

        $out = [];

        foreach ($rows as $id => $inspection) {
            $round = $rounds[$id] ?? null;
            $parcelId = $inspection->parcel_id === null ? null : (int) $inspection->parcel_id;

            $out[$id] = self::build(
                $id,
                $round,
                $parcelId,
                $roundLinked[$id] ?? null,
                $parcelId === null ? null : ($parcelLatest[$parcelId] ?? null),
                $chainHeads
            );
        }

        return $out;
    }

    /**
     * The production data source: one pass for each of the three datasets.
     *
     * @param  array<int, SiteInspection>  $rows
     * @return array{linked: array, parcel: array, heads: array}
     */
    private static function fetchAll(array $rows, ?callable $chainReader = null): array
    {
        return [
            'linked' => self::roundLinkedReviews(array_keys($rows)),
            'parcel' => self::latestParcelReviews($rows),
            'heads' => InspectionRoundNumbering::latestInspectionIdsByChain($rows, $chainReader),
        ];
    }

    // ------------------------------------------------------------------

    /**
     * Build one inspection's review payload.
     *
     * @param  array{round_number: ?int, round_kind: string, is_reinspection: bool}|null  $round
     */
    private static function build(
        int $id,
        ?array $round,
        ?int $parcelId,
        ?array $linked,
        ?array $parcelLatest,
        array $chainHeads = []
    ): array {
        // ---- A. round-specific, ONLY when explicitly linked -----------------
        $roundDecision = null;
        $roundLabel = null;
        $roundReviewer = null;
        $roundDate = null;
        $anomaly = null;

        if ($linked !== null) {
            $stored = (string) $linked['decision'];
            $reviewer = self::reviewerName($linked);
            $date = self::normaliseDate($linked['reviewed_at'] ?? null);

            if (in_array($stored, self::ROUND_DECISIONS, true)) {
                $roundDecision = $stored;
                $roundLabel = $stored;
                $roundReviewer = $reviewer;
                $roundDate = $date;
            } else {
                // Explicitly linked, but NOT a post-inspection verdict. Reported
                // as an anomaly rather than forced into the verdict vocabulary -
                // silently rendering it as a decision would misstate the record.
                $anomaly = [
                    'stored_decision' => $stored,
                    'message' => $stored === self::REQUEST_DECISION
                        ? 'This inspection round is linked to a review that requested an '
                            .'inspection rather than judging one.'
                        : 'This inspection round is linked to an unrecognised review decision.',
                    'review_id' => (int) $linked['id'],
                    'reviewer' => $reviewer,
                    'reviewed_at' => $date,
                ];
            }
        }

        // ---- B. parcel-level context ----------------------------------------
        // Refused outright for a parcel-unknown inspection: there is no parcel
        // to scope a review to.
        $parcel = null;

        if ($parcelId !== null && $parcelLatest !== null) {
            $stored = (string) $parcelLatest['decision'];

            $parcel = [
                'review_id' => (int) $parcelLatest['id'],
                'stored_decision' => $stored,
                'review_round' => $parcelLatest['review_round'] === null
                    ? null
                    : (int) $parcelLatest['review_round'],
                'is_request' => $stored === self::REQUEST_DECISION,
                'label' => $stored === self::REQUEST_DECISION
                    ? self::REQUEST_LABEL
                    : $stored,
                'context' => $stored === self::REQUEST_DECISION
                    ? self::REQUEST_CONTEXT
                    : self::PARCEL_CONTEXT,
                'reviewer' => self::reviewerName($parcelLatest),
                'reviewed_at' => self::normaliseDate($parcelLatest['reviewed_at'] ?? null),
                // Whether this review names a round. It does not today, and that
                // is exactly why it stays parcel-level.
                'is_explicitly_linked' => $parcelLatest['reviewed_site_inspection_id'] !== null,
                'linked_round_id' => $parcelLatest['reviewed_site_inspection_id'] === null
                    ? null
                    : (int) $parcelLatest['reviewed_site_inspection_id'],
            ];
        }

        return [
            'inspection_id' => $id,

            // Round-specific. Null unless proven by an explicit link.
            'po_decision' => $roundDecision,
            'po_decision_label' => $roundLabel,
            'po_decision_reviewer' => $roundReviewer,
            'po_decision_date' => $roundDate,
            'has_round_decision' => $roundDecision !== null,
            // Reported, never rendered as a verdict.
            'round_decision_anomaly' => $anomaly,

            // Parcel-level context. Null for a parcel-unknown inspection.
            'parcel_review' => $parcel,
            'has_parcel_review' => $parcel !== null,
            'is_parcel_unknown' => $parcelId === null,

            // True only for the LAST round of this parcel's chain, so the list
            // can show compact parcel context once per chain rather than
            // repeating it on every historical card.
            'is_current_round' => self::isCurrentRound($id, $parcelId, $chainHeads),
        ];
    }

    /**
     * Is this the newest round of its own parcel chain?
     *
     * Decided by the canonical chain head, NOT by the rows on screen: a page
     * showing only an older round must still recognise it as historical. False
     * for a parcel-unknown row, which belongs to no chain and therefore has no
     * current position at all.
     *
     * @param  array<string, int>  $chainHeads
     */
    private static function isCurrentRound(int $id, ?int $parcelId, array $chainHeads): bool
    {
        if ($parcelId === null) {
            return false;
        }

        foreach ($chainHeads as $key => $headId) {
            if ((int) $headId !== $id) {
                continue;
            }

            $parts = explode(':', (string) $key, 2);
            $headParcel = (int) ($parts[1] ?? 0);

            return $headParcel === $parcelId;
        }

        return false;
    }

    /**
     * Reviews that EXPLICITLY name a round, for the given inspections.
     *
     * @param  array<int, int>  $inspectionIds
     * @return array<int, array<string, mixed>> inspection id => newest linked review
     */
    private static function roundLinkedReviews(array $inspectionIds): array
    {
        if ($inspectionIds === []) {
            return [];
        }

        $rows = \Illuminate\Support\Facades\DB::table('technical_reviews')
            ->leftJoin('users', 'users.id', '=', 'technical_reviews.reviewed_by')
            ->whereIn('technical_reviews.reviewed_site_inspection_id', $inspectionIds)
            // Newest wins if more than one row names the same round.
            ->orderBy('technical_reviews.review_round')
            ->orderBy('technical_reviews.id')
            ->get([
                'technical_reviews.id',
                'technical_reviews.reviewed_site_inspection_id',
                'technical_reviews.decision',
                'technical_reviews.review_round',
                'technical_reviews.reviewed_by',
                'technical_reviews.reviewed_at',
                'users.name as reviewer_name',
            ]);

        $out = [];

        foreach ($rows as $row) {
            $roundId = (int) $row->reviewed_site_inspection_id;

            // Ascending order means the last one seen is the newest.
            $out[$roundId] = [
                'id' => (int) $row->id,
                'decision' => (string) $row->decision,
                'review_round' => $row->review_round,
                'reviewer_name' => $row->reviewer_name,
                'reviewed_at' => self::dateOf($row),
            ];
        }

        return $out;
    }

    /**
     * The latest review per parcel, for the parcels present on these inspections.
     *
     * ONE query for every parcel, not one per inspection.
     *
     * @param  array<int, SiteInspection>  $inspections
     * @return array<int, array<string, mixed>> parcel id => newest review
     */
    private static function latestParcelReviews(array $inspections): array
    {
        $applicationIds = [];

        foreach ($inspections as $inspection) {
            if ($inspection->parcel_id === null) {
                // No parcel, no parcel-level lookup. Not even attempted.
                continue;
            }

            $applicationId = $inspection->zoning_application_id;

            if ($applicationId !== null) {
                $applicationIds[(int) $applicationId] = true;
            }
        }

        if ($applicationIds === []) {
            return [];
        }

        // Scoped by application AND parcel. Two parcels of one application never
        // see each other's reviews.
        $rows = \Illuminate\Support\Facades\DB::table('technical_reviews')
            ->leftJoin('users', 'users.id', '=', 'technical_reviews.reviewed_by')
            ->whereIn('technical_reviews.zoning_application_id', array_keys($applicationIds))
            ->whereNotNull('technical_reviews.parcel_id')
            // LOCKED ORDERING: review_round DESC, then id DESC.
            ->orderByDesc('technical_reviews.review_round')
            ->orderByDesc('technical_reviews.id')
            ->get([
                'technical_reviews.id',
                'technical_reviews.parcel_id',
                'technical_reviews.zoning_application_id',
                'technical_reviews.decision',
                'technical_reviews.review_round',
                'technical_reviews.reviewed_by',
                'technical_reviews.reviewed_at',
                'technical_reviews.reviewed_site_inspection_id',
                'users.name as reviewer_name',
            ]);

        $out = [];

        foreach ($rows as $row) {
            $parcelId = (int) $row->parcel_id;
            $applicationId = (int) $row->zoning_application_id;

            // Belt and braces: the query already scopes by application, and the
            // key is application+parcel so two applications sharing a parcel id
            // could never collide.
            $key = $applicationId . ':' . $parcelId;

            if (isset($out[$key])) {
                continue; // Already have the newest for this chain.
            }

            $out[$key] = [
                'id' => (int) $row->id,
                'decision' => (string) $row->decision,
                'review_round' => $row->review_round,
                'reviewer_name' => $row->reviewer_name,
                'reviewed_at' => self::dateOf($row),
                'reviewed_site_inspection_id' => $row->reviewed_site_inspection_id,
                'parcel_id' => $parcelId,
                'zoning_application_id' => $applicationId,
            ];
        }

        // Re-key by parcel id for the caller, now that application scope is baked
        // into which row was chosen.
        $byParcel = [];

        foreach ($out as $entry) {
            $byParcel[$entry['parcel_id']] ??= $entry;
        }

        return $byParcel;
    }

    private static function reviewerName(array $review): ?string
    {
        $name = trim((string) ($review['reviewer_name'] ?? ''));

        return $name === '' ? null : $name;
    }

    /**
     * Normalise a review timestamp to a plain Y-m-d string.
     *
     * Applied where the payload is BUILT rather than only in the reader, so the
     * exposed date format is a property of this class and cannot depend on what
     * happened to be supplied. A timestamp the reader did not produce is still
     * normalised here.
     */
    private static function normaliseDate($value): ?string
    {
        if ($value === null) {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        $text = trim((string) $value);

        if ($text === '') {
            return null;
        }

        // Already normalised, or a full timestamp to shorten.
        return substr($text, 0, 10);
    }

    /**
     * The review's own timestamp, from the field that actually records it.
     * `reviewed_at` is the canonical one; `created_at` is not consulted, because
     * a creation time is not a decision time.
     */
    private static function dateOf(object $row): ?string
    {
        $value = $row->reviewed_at ?? null;

        if ($value === null) {
            return null;
        }

        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }

        $text = trim((string) $value);

        return $text === '' ? null : substr($text, 0, 10);
    }
}