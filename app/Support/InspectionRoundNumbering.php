<?php

namespace App\Support;

use Illuminate\Database\Eloquent\Model;

/**
 * PHASE 2B2B - the single source of truth for INSPECTION ROUND IDENTITY.
 *
 * WHAT "ROUND N" MEANS
 * --------------------
 * A round is one parcel's visit sequence. The canonical grouping is
 * (zoning_application_id, parcel_id), ordered by site_inspections.id ASC, and
 * the round number is the 1-based position within that chain.
 *
 * So for one application holding two parcels:
 *
 *     parcel P-01, inspection id 11  -> Round 1 (Original Inspection)
 *     parcel P-02, inspection id 18  -> Round 1 (Original Inspection)
 *     parcel P-01, inspection id 12  -> Round 2 (Reinspection)
 *
 * An application therefore legitimately holds SEVERAL Round 1 rows. That is not
 * a duplicate: each is the first visit to a different lot. Sequencing them
 * 1,2,3 would claim P-02's first visit was a re-visit to P-01.
 *
 * WHY THIS MATCHES THE WRITERS
 * ----------------------------
 * This is not a display preference; it is what the write path already does:
 *
 *   - `ApplicationController` creates an inspection inside a per-parcel loop
 *     with an explicit `parcel_id`.
 *   - `TechnicalReviewController::createInspectionRound()` looks the prior round
 *     up with `where('zoning_application_id')->where('parcel_id')` and refuses a
 *     `Requires Reinspection` unless THAT PARCEL has a completed round.
 *   - `SiteInspection::newRound()` copies `parcel_id` from the prior round, so a
 *     re-inspection can only ever continue its own parcel's chain.
 *   - `InspectionDeliveryRetryEligibility` supersedes a round only against a
 *     newer round of the SAME parcel.
 *
 * The previous per-application numbering disagreed with all four of them, and
 * disagreed with itself between two display sites.
 *
 * LEGACY ROWS WITH NO PARCEL
 * --------------------------
 * `site_inspections.parcel_id IS NULL` for 8 historical rows (all created
 * before 2026-07-16; no current writer produces one). Their parcel cannot be
 * proven: `site_inspections.parcel_id` is the only column on the table that
 * references `parcels`, no review or delivery row carries a parcel for them,
 * and application 48 - which owns two of them - has two candidate parcels.
 *
 * They are therefore given NO round number at all. They are classified as
 * `Historical Inspection` and labelled `Parcel not recorded`. A fabricated
 * "Round N" for these rows would assert a visit sequence the database cannot
 * support, and backfilling their parcel would be inventing a business fact.
 *
 * THEY ARE NOT HIDDEN. Every other real attribute - INS-##, application
 * reference, status, inspector, dates, delivery state - stays visible. The
 * absence of parcel identity narrows only the round label, never the record.
 *
 * NO PERSISTENCE, NO HIDDEN STATE
 * -------------------------------
 * Round numbers are derived on read and returned as plain data. Nothing is
 * written to the database, and no caller is expected to have injected an
 * attribute on a model beforehand: a caller that forgets cannot silently change
 * the answer. `site_inspections` has no round_number column and this class does
 * not introduce one.
 */
final class InspectionRoundNumbering
{
    /** First visit to a parcel. */
    public const KIND_ORIGINAL = 'Original Inspection';

    /** A later visit to the SAME parcel. */
    public const KIND_REINSPECTION = 'Reinspection';

    /**
     * A row with no recorded parcel. Deliberately neither "Original" nor
     * "Reinspection": neither claim is provable, because the parcel - and
     * therefore the chain the row belongs to - is unknown.
     */
    public const KIND_HISTORICAL = 'Historical Inspection';

    /** Supporting label for a row whose parcel was never recorded. */
    public const HISTORICAL_NOTE = 'Parcel not recorded';

    /**
     * Resolve canonical round identity for a set of inspections.
     *
     * The chain is read for every application named by the given rows, never
     * from the rows that happen to be on screen. A round number can therefore
     * never be derived from an unrelated list, from the applicant, or from the
     * inspection id alone.
     *
     * @param  iterable<Model>  $inspections  anything exposing id,
     *                                           zoning_application_id, parcel_id
     * @param  (callable(array<int,int>): iterable)|null  $chainReader  seam for
     *         tests; production always reads the database. Injecting it is how
     *         the numbering contract is proved executably in a suite whose
     *         database driver is unavailable, without weakening the production
     *         path, which passes no reader and therefore always queries.
     * @return array<int, array{
     *     round_number: ?int,
     *     round_kind: string,
     *     note: ?string,
     *     is_historical: bool,
     *     is_reinspection: bool
     * }> keyed by inspection id
     */
    public static function forInspections(iterable $inspections, ?callable $chainReader = null): array
    {
        $ids = [];
        $applicationIds = [];
        // Materialised because the rows are walked twice: once to scope the
        // query, once to classify. A generator would be exhausted by the first.
        $rows = [];

        foreach ($inspections as $inspection) {
            $id = (int) $inspection->getKey();

            if ($id > 0) {
                $ids[$id] = true;
                $rows[$id] = $inspection;
            }

            $applicationId = $inspection->zoning_application_id ?? null;

            if ($applicationId !== null) {
                $applicationIds[(int) $applicationId] = true;
            }
        }

        if ($ids === []) {
            return [];
        }

        $reader = $chainReader ?? self::readChainFromDatabase(...);
        $positions = self::chainPositions($reader(array_keys($applicationIds)));

        $out = [];

        foreach ($rows as $id => $inspection) {
            // The row's OWN parcel identity is authoritative. A chain position
            // alone is not enough: if the row carries no parcel it belongs to no
            // chain, and reporting a round would re-create the exact defect this
            // class exists to remove. Production cannot disagree here - the query
            // filters on the same column - so this is a guard, not a fallback.
            $chain = ($inspection->parcel_id === null)
                ? null
                : ($positions[$id] ?? null);

            // No chain position means no provable visit sequence. This is the
            // honest answer, not a placeholder.
            if ($chain === null) {
                $out[$id] = [
                    'round_number' => null,
                    'round_kind' => self::KIND_HISTORICAL,
                    'note' => self::HISTORICAL_NOTE,
                    'is_historical' => true,
                    'is_reinspection' => false,
                ];

                continue;
            }

            $out[$id] = [
                'round_number' => $chain,
                'round_kind' => $chain === 1 ? self::KIND_ORIGINAL : self::KIND_REINSPECTION,
                'note' => null,
                'is_historical' => false,
                'is_reinspection' => $chain > 1,
            ];
        }

        return $out;
    }

    /**
     * The canonical position of ONE inspection within its own
     * (application, parcel) chain.
     *
     * @return array{round_number: ?int, round_kind: string, note: ?string,
     *               is_historical: bool, is_reinspection: bool}
     */
    public static function forInspection(Model $inspection, ?callable $chainReader = null): array
    {
        $resolved = self::forInspections([$inspection], $chainReader);

        $id = (int) $inspection->getKey();

        return $resolved[$id] ?? [
            'round_number' => null,
            'round_kind' => self::KIND_HISTORICAL,
            'note' => self::HISTORICAL_NOTE,
            'is_historical' => true,
            'is_reinspection' => false,
        ];
    }

    /**
     * Is this row a re-inspection under the canonical contract?
     *
     * Only a parcel-bearing row whose position in its own chain exceeds 1. A
     * historical parcel-unknown row is NEVER a re-inspection: it belongs to no
     * chain, so it cannot be shown to be a repeat visit.
     */
    public static function isReinspection(array $round): bool
    {
        return ($round['round_number'] ?? null) !== null && (int) $round['round_number'] > 1;
    }

    /**
     * The newest inspection id in each (application, parcel) chain, as
     * `"{application}:{parcel}" => inspection id`.
     *
     * An inspection is the CURRENT round of its parcel exactly when it is that
     * chain's head. This is what lets a page show compact per-parcel context
     * once, on the newest card, instead of repeating it on every historical
     * round of the same lot - repetition would read as though one decision
     * applied to all of them.
     *
     * Reads the same chain as {@see forInspections()} and never includes a
     * parcel-unknown row, because such a row belongs to no chain.
     *
     * @param  iterable<Model>  $inspections
     * @param  (callable(array<int,int>): iterable)|null  $chainReader
     * @return array<string, int>
     */
    public static function latestInspectionIdsByChain(
        iterable $inspections,
        ?callable $chainReader = null
    ): array {
        $applicationIds = [];

        foreach ($inspections as $inspection) {
            $applicationId = $inspection->zoning_application_id ?? null;

            if ($applicationId !== null) {
                $applicationIds[(int) $applicationId] = true;
            }
        }

        if ($applicationIds === []) {
            return [];
        }

        $reader = $chainReader ?? self::readChainFromDatabase(...);
        $heads = [];

        foreach ($reader(array_keys($applicationIds)) as $row) {
            $parcelId = $row->parcel_id ?? null;

            if ($parcelId === null) {
                continue;
            }

            $key = $row->zoning_application_id . ':' . $parcelId;
            $id = (int) $row->id;

            if (! isset($heads[$key]) || $id > $heads[$key]) {
                $heads[$key] = $id;
            }
        }

        return $heads;
    }

    /**
     * Read every chain row for the given applications.
     *
     * NULL-parcel rows are excluded by the query itself, so the database - not
     * this class - is what decides they are unsequenceable.
     *
     * @param  array<int, int>  $applicationIds
     * @return iterable<object{id:int, zoning_application_id:int|string|null, parcel_id:int|string|null}>
     */
    private static function readChainFromDatabase(array $applicationIds): iterable
    {
        if ($applicationIds === []) {
            return [];
        }

        return \Illuminate\Support\Facades\DB::table('site_inspections')
            ->select('id', 'zoning_application_id', 'parcel_id')
            ->whereIn('zoning_application_id', $applicationIds)
            ->whereNotNull('parcel_id')
            ->orderBy('zoning_application_id')
            ->orderBy('parcel_id')
            ->orderBy('id')
            ->get();
    }

    /**
     * 1-based position per inspection, per (application, parcel) chain.
     *
     * Rows with a NULL parcel_id are EXCLUDED entirely - there is no chain to
     * position them in, and grouping them under a synthetic key would
     * manufacture a sequence out of unrelated rows.
     *
     * @param  iterable<object>  $rows
     * @return array<int, int> inspection id => position
     */
    private static function chainPositions(iterable $rows): array
    {
        $sorted = [];

        foreach ($rows as $row) {
            $parcelId = $row->parcel_id ?? null;

            if ($parcelId === null) {
                // No parcel, therefore no chain. Not positionable.
                continue;
            }

            $sorted[] = [
                'id' => (int) $row->id,
                'chain' => $row->zoning_application_id.':'.$parcelId,
            ];
        }

        // Ordering is defined HERE, not relied upon from the caller, so a
        // different caller cannot produce different round numbers.
        usort($sorted, fn (array $a, array $b) => [$a['chain'], $a['id']] <=> [$b['chain'], $b['id']]);

        $positions = [];
        $seen = [];

        foreach ($sorted as $row) {
            $seen[$row['chain']] = ($seen[$row['chain']] ?? 0) + 1;
            $positions[$row['id']] = $seen[$row['chain']];
        }

        return $positions;
    }
}