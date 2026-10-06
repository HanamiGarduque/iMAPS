<?php

namespace App\Support;

use App\Models\SiteInspection;
use Illuminate\Support\Facades\DB;

/**
 * PHASE 2B2D - read-only operations context for the inspection-round detail page.
 *
 * Delivers exactly three things the Admin operations view needs and could not
 * previously see without leaving the page:
 *
 *   1. DELIVERY HEALTH - the canonical, read-only condition of this round's
 *      FieldSync delivery, plus what the existing attempt records can prove.
 *   2. ROUND HISTORY - the other rounds of THIS PARCEL, as a navigable chain.
 *   3. Nothing else. No retry, no re-deliver, no assignment, no review action.
 *
 * WHY NOT THE DELIVERY PANEL
 * --------------------------
 * `InspectionDeliveryStatusPanel` mounts the Planning Officer's retry-delivery
 * control. Mounting it here would hand the Admin a PO action, so the panel is
 * deliberately NOT reused. Only the canonical vocabulary from
 * {@see InspectionDeliveryStatus} is used - the wording comes from the same class
 * that the delivery panel and the retry service use, so there is exactly one
 * definition of every delivery state.
 *
 * `no_delivery_record` is neutral and is never presented as a failure: most
 * historical rounds were simply never pushed to FieldSync, and calling that a
 * fault would invent one.
 *
 * ROUND HISTORY SCOPE
 * -------------------
 * A chain is (zoning_application_id, parcel_id) - the same identity
 * {@see InspectionRoundNumbering} uses everywhere else. A parcel-unknown
 * inspection therefore has NO history: the other rounds of the same application
 * are different lots, or cannot be shown to be the same lot at all. Grouping them
 * together would be exactly the cross-parcel leak the round contract forbids.
 *
 * TWO QUERIES TOTAL, regardless of how many rounds a parcel has.
 */
final class InspectionOperationsContext
{
    /**
     * Delivery condition for ONE inspection round, with attempt evidence.
     *
     * @return array{
     *     state: string,
     *     label: string,
     *     message: string,
     *     is_failure: bool,
     *     attempt_count: int,
     *     last_attempt_at: ?string,
     *     last_outcome: ?string,
     *     failure_category: ?string,
     *     failure_message: ?string,
     *     delivered_at: ?string
     * }
     */
    public static function delivery(SiteInspection $inspection): array
    {
        $state = InspectionDeliveryStatus::state($inspection->delivery_status);
        $delivery = $inspection->deliveryAttempts;

        $attempts = $delivery->isEmpty() ? null : $delivery->sortByDesc('attempt_number')->first();

        $failureCategory = null;
        $failureMessage = null;

        if ($attempts !== null && $attempts->failure_category !== null && $attempts->failure_category !== '') {
            $failureCategory = (string) $attempts->failure_category;

            // safe_message is already a server-authored, sanitised string; it is
            // surfaced only on a failing round, and only because it exists.
            $failureMessage = $attempts->safe_message !== null && $attempts->safe_message !== ''
                ? (string) $attempts->safe_message
                : InspectionDeliveryStatus::failureMessage($failureCategory);
        }

        return [
            // Canonical vocabulary. Never a new status.
            'state' => $state,
            'label' => InspectionDeliveryStatus::label($state),
            'message' => InspectionDeliveryStatus::message($state),
            'is_failure' => InspectionDeliveryStatus::isFailure($inspection->delivery_status),

            'attempt_count' => $delivery->count(),
            'last_attempt_at' => $attempts?->attempted_at?->toDateString()
                ?? $attempts?->created_at?->toDateString(),
            'last_outcome' => $attempts?->outcome,
            'failure_category' => $failureCategory,
            'failure_message' => $failureMessage,
            'delivered_at' => $inspection->delivered_at?->toDateString(),
        ];
    }

    /**
     * The canonical (application, parcel) chain this inspection belongs to,
     * as a navigable list.
     *
     * Round numbers come from {@see InspectionRoundNumbering}; nothing is
     * re-derived here, and nothing is recomputed in the browser.
     *
     * @param  (callable(SiteInspection): iterable)|null  $siblingReader  seam for
     *         tests. Production passes none and therefore always queries.
     * @param  (callable(array<int,int>): iterable)|null  $chainReader
     * @return array{
     *     available: bool,
     *     unavailable_reason: ?string,
     *     rounds: list<array<string, mixed>>,
     *     current_round_id: ?int
     * }
     */
    public static function roundHistory(
        SiteInspection $inspection,
        ?callable $siblingReader = null,
        ?callable $chainReader = null
    ): array {
        if ($inspection->parcel_id === null) {
            // No parcel, therefore no chain. The other rounds of this
            // application cannot be shown to be the same lot, so none are listed.
            return [
                'available' => false,
                'unavailable_reason' => 'Parcel was not recorded for this historical inspection, '
                    .'so its inspection rounds cannot be identified.',
                'rounds' => [],
                'current_round_id' => null,
            ];
        }

        return self::resolveHistory(
            $inspection,
            collect(($siblingReader ?? self::readSiblings(...))($inspection)),
            $chainReader ?? self::readChainFromDatabase(...)
        );
    }

    /**
     * THE history body.
     *
     * The production path and the test seam both run THIS, so there is exactly
     * one implementation of the rules and a test cannot pass against a copy that
     * production does not use. An earlier revision carried two near-identical
     * bodies, which let a real defect sit in the production one while the tests
     * exercised the other.
     *
     * @param  \Illuminate\Support\Collection<int, SiteInspection>  $siblings
     * @param  callable(array<int,int>): iterable  $chainReader
     */
    private static function resolveHistory(
        SiteInspection $inspection,
        \Illuminate\Support\Collection $siblings,
        callable $chainReader
    ): array {
        if ($inspection->parcel_id === null) {
            // No parcel, therefore no chain. The other rounds of this
            // application cannot be shown to be the same lot, so none are listed.
            return [
                'available' => false,
                'unavailable_reason' => 'Parcel was not recorded for this historical inspection, '
                    .'so its inspection rounds cannot be identified.',
                'rounds' => [],
                'current_round_id' => null,
            ];
        }

        $currentId = (int) $inspection->getKey();

        if ($siblings->count() <= 1) {
            return [
                'available' => true,
                'unavailable_reason' => null,
                'rounds' => [],
                'current_round_id' => $currentId,
            ];
        }

        // Every sibling's round comes from the canonical per-parcel chain, never
        // from its position in this list.
        $identities = InspectionRoundNumbering::forInspections($siblings, $chainReader);

        $rounds = [];

        foreach ($siblings as $sibling) {
            $id = (int) $sibling->getKey();
            $identity = $identities[$id] ?? null;

            // A sibling whose round cannot be resolved is still listed by id and
            // status, never with an invented round number.
            $rounds[] = [
                'inspection_id' => $id,
                'round_number' => $identity['round_number'] ?? null,
                'round_kind' => $identity['round_kind'] ?? InspectionRoundNumbering::KIND_HISTORICAL,
                'round_note' => $identity['note'] ?? InspectionRoundNumbering::HISTORICAL_NOTE,
                'is_current' => $id === $currentId,
                'status' => $sibling->status,
                'display_status' => self::displayStatus((string) $sibling->status),
                'inspector_id' => $sibling->inspector_id,
                'scheduled_date' => $sibling->scheduled_date?->toDateString(),
                'completed_at' => $sibling->completed_at?->toDateString(),
                'submitted_at' => $sibling->submitted_at?->toDateString(),
                'delivery_state' => InspectionDeliveryStatus::state($sibling->delivery_status),
            ];
        }

        return [
            'available' => true,
            'unavailable_reason' => null,
            'rounds' => $rounds,
            'current_round_id' => $currentId,
        ];
    }

    /**
     * The production chain read. One query, scoped by application AND parcel.
     *
     * @param  array<int,int>  $applicationIds
     * @return iterable<object>
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
     * The production sibling read: ONE query for the whole chain, scoped by
     * application AND parcel so another lot's rounds can never appear.
     *
     * @return \Illuminate\Support\Collection<int, SiteInspection>
     */
    private static function readSiblings(SiteInspection $inspection)
    {
        return SiteInspection::query()
            ->where('zoning_application_id', $inspection->zoning_application_id)
            ->where('parcel_id', $inspection->parcel_id)
            ->orderBy('id')
            ->get(['id', 'zoning_application_id', 'parcel_id', 'status', 'inspector_id',
                'scheduled_date', 'completed_at', 'submitted_at', 'delivery_status']);
    }

    /**
     * Test seam: resolve history against a fixed set of sibling models.
     *
     * Exists so the RESOLUTION rules - per-parcel scoping, canonical round
     * numbers, current-round marking, and the refusal to invent a chain - can be
     * proved executably without a database. It runs the SAME body as
     * {@see roundHistory()}, with only the row SOURCE substituted.
     *
     * Production never calls this; it uses {@see roundHistory()}, which queries.
     *
     * @param  iterable<SiteInspection>  $siblings
     */
    public static function roundHistoryWithChain(SiteInspection $inspection, $siblings, array $chainRows): array
    {
        return self::resolveHistory($inspection, collect($siblings), fn () => $chainRows);
    }

    /**
     * Locally provable status wording. A local `assigned` round is "Assigned",
     * never "Ongoing": an assignment records that an inspector owns the task, not
     * that field work has started.
     */
    private static function displayStatus(string $status): string
    {
        return match (strtolower($status)) {
            'completed', 'submitted' => 'Completed',
            default => 'Assigned',
        };
    }
}