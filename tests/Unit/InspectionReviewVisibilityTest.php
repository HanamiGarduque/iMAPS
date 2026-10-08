<?php

namespace Tests\Unit;

use App\Support\InspectionReviewVisibility;
use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2C - executable proof of the Planning Officer review RESOLUTION rules.
 *
 * The companion Feature suite proves the same contract against real database
 * rows, but the Feature suite cannot execute in this environment: every Feature
 * test fails on the pre-existing `pdo_sqlite` driver gap.
 *
 * So the contract is proved HERE, through the helper's reader seam. Only the
 * row FETCH is substituted - the selection, ordering, scoping, classification
 * and refusal logic under test is exactly the code that runs in production, and
 * a source-text assertion could not tell a working implementation from a
 * plausible-looking one at all.
 *
 * Each fixture is built so that a guessing implementation fails: a review that
 * names no round must not become a round decision, `site_inspection_task_id`
 * must never be read backwards, and two parcels of one application must not see
 * each other's reviews.
 */
class InspectionReviewVisibilityTest extends TestCase
{
    // ================================================================
    // 1 / 2 - explicit link required for a round-specific decision
    // ================================================================

    public function test_explicit_link_produces_a_round_specific_decision(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            linked: [1 => $this->review('Requires Reinspection', 2, reviewedRound: 1)],
        );

        $this->assertTrue($out[1]['has_round_decision']);
        $this->assertSame('Requires Reinspection', $out[1]['po_decision']);
    }

    public function test_unlinked_review_produces_no_round_specific_decision(): void
    {
        // The shape of all 80 historical reviews: a real decision value, but no
        // reviewed_site_inspection_id.
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 3)],
        );

        $this->assertFalse($out[1]['has_round_decision']);
        $this->assertNull(
            $out[1]['po_decision'],
            'a review that does not name a round must never be shown as that round\'s decision'
        );
    }

    public function test_approved_declined_and_requires_reinspection_are_all_displayable(): void
    {
        foreach (['Approved', 'Declined', 'Requires Reinspection'] as $decision) {
            $out = $this->resolve(
                inspections: [$this->inspection(1, 10, 100)],
                chain: [$this->row(1, 10, 100)],
                linked: [1 => $this->review($decision, 1, reviewedRound: 1)],
            );

            $this->assertSame($decision, $out[1]['po_decision'], $decision . ' when explicitly linked');
        }
    }

    // ================================================================
    // 3 - latest parcel review, locked ordering
    // ================================================================

    public function test_parcel_review_is_the_newest_by_review_round_then_id(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            // Highest review_round wins even though it is not the last inserted.
            parcelLatest: [100 => $this->review('Approved', 9, reviewRound: 5)],
        );

        $this->assertSame('Approved', $out[1]['parcel_review']['stored_decision']);
        $this->assertSame(5, $out[1]['parcel_review']['review_round']);
    }

    public function test_parcel_review_exposes_whether_it_is_explicitly_linked(): void
    {
        $linked = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 4, reviewedRound: 2)],
        );
        $this->assertTrue(
            $linked[1]['parcel_review']['is_explicitly_linked'],
            'a review that names a round must say so'
        );

        $unlinked = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 4)],
        );
        $this->assertFalse(
            $unlinked[1]['parcel_review']['is_explicitly_linked'],
            'a review that names no round must say so, and stay parcel-level'
        );
    }

    // ================================================================
    // 4 - MULTI-PARCEL SAFETY
    // ================================================================

    public function test_a_review_never_crosses_between_parcels_of_one_application(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100), $this->inspection(2, 10, 200)],
            chain: [$this->row(1, 10, 100), $this->row(2, 10, 200)],
            parcelLatest: [
                100 => $this->review('Approved', 1, reviewRound: 7),
                200 => $this->review('Declined', 2, reviewRound: 1),
            ],
        );

        $this->assertSame(
            'Approved',
            $out[1]['parcel_review']['stored_decision'],
            'P-01 must only see P-01\'s review'
        );
        $this->assertSame(
            'Declined',
            $out[2]['parcel_review']['stored_decision'],
            'P-02 must only see P-02\'s review, despite its much lower review_round'
        );
    }

    public function test_an_application_wide_review_is_never_attributed_to_a_parcel(): void
    {
        // A review with no parcel must not be selectable as "this parcel's
        // latest", because it belongs to no parcel at all.
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [],
        );

        $this->assertNull(
            $out[1]['parcel_review'],
            'with no parcel-scoped review there is no parcel context to show'
        );
    }

    // ================================================================
    // 5 - site_inspection_task_id is NOT the reviewed round
    // ================================================================

    public function test_task_id_is_never_treated_as_the_reviewed_round(): void
    {
        // Round 1 completed; a Requires Reinspection review CREATED round 2.
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100), $this->inspection(2, 10, 100)],
            chain: [$this->row(1, 10, 100), $this->row(2, 10, 100)],
            parcelLatest: [100 => $this->review('Requires Reinspection', 76, reviewRound: 2)],
        );

        $this->assertNull($out[1]['po_decision'], 'the judged round gains no decision');
        $this->assertNull($out[2]['po_decision'], 'nor does the created round');
        $this->assertSame(
            'Requires Reinspection',
            $out[2]['parcel_review']['stored_decision'],
            'it may still appear as parcel-level context'
        );
    }

    // ================================================================
    // 6 - Needs Site Inspection wording
    // ================================================================

    public function test_needs_site_inspection_is_presented_as_a_request(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Needs Site Inspection', 75)],
        );

        $parcelReview = $out[1]['parcel_review'];

        $this->assertTrue($parcelReview['is_request']);
        $this->assertSame('Site Inspection Requested', $parcelReview['label']);
        $this->assertSame(
            'Planning Officer requested a site inspection.',
            $parcelReview['context']
        );
        // The stored value is never renamed.
        $this->assertSame('Needs Site Inspection', $parcelReview['stored_decision']);
    }

    public function test_a_request_explicitly_linked_to_a_round_is_reported_not_forced(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            linked: [1 => $this->review('Needs Site Inspection', 75, reviewedRound: 1)],
        );

        $this->assertFalse(
            $out[1]['has_round_decision'],
            'a request must not be forced into the verdict vocabulary'
        );
        $this->assertNotNull($out[1]['round_decision_anomaly'], 'the mismatch must be reported');
        $this->assertSame(
            'Needs Site Inspection',
            $out[1]['round_decision_anomaly']['stored_decision']
        );
    }

    public function test_an_unrecognised_linked_decision_is_reported_as_an_anomaly(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            linked: [1 => $this->review('Something Unrecognised', 5, reviewedRound: 1)],
        );

        $this->assertFalse($out[1]['has_round_decision']);
        $this->assertNotNull($out[1]['round_decision_anomaly']);
        $this->assertSame(
            'Something Unrecognised',
            $out[1]['round_decision_anomaly']['stored_decision'],
            'the stored value must be reported, not replaced'
        );
    }

    // ================================================================
    // 7-9 - parcel-level vocabulary
    // ================================================================

    public function test_each_decision_renders_as_parcel_level_context(): void
    {
        foreach (['Approved', 'Declined', 'Requires Reinspection'] as $decision) {
            $out = $this->resolve(
                inspections: [$this->inspection(1, 10, 100)],
                chain: [$this->row(1, 10, 100)],
                parcelLatest: [100 => $this->review($decision, 1)],
            );

            $this->assertSame($decision, $out[1]['parcel_review']['label'], $decision . ' as parcel context');
            $this->assertStringContainsString(
                'not linked to a specific inspection round',
                $out[1]['parcel_review']['context']
            );
        }
    }

    // ================================================================
    // 10 - NULL-parcel rows
    // ================================================================

    public function test_parcel_unknown_inspection_gets_no_parcel_review(): void
    {
        // A review exists for the application AND for its one parcel. It must not
        // be borrowed by the parcel-unknown row.
        $out = $this->resolve(
            inspections: [$this->inspection(9, 10, null)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 23)],
        );

        $this->assertTrue($out[9]['is_parcel_unknown']);
        $this->assertNull(
            $out[9]['parcel_review'],
            'a parcel-unknown inspection must not borrow another row\'s parcel review'
        );
        $this->assertNull($out[9]['po_decision']);
        $this->assertFalse($out[9]['is_current_round']);
    }

    /**
     * The refusal is the INSPECTION'S OWN, not a consequence of which keys the
     * reader happened to return.
     *
     * Deliberately supplies the review under every key a careless implementation
     * might fall back to when `parcel_id` is NULL - 0, "", and "null" - plus the
     * real parcel id. If any of those can attach a parcel review to a
     * parcel-unknown row, this fails.
     */
    public function test_no_fallback_key_can_attach_a_parcel_review_to_a_parcel_unknown_row(): void
    {
        $review = $this->review('Approved', 23, reviewRound: 4);

        $out = $this->resolve(
            inspections: [$this->inspection(9, 10, null)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [
                100 => $review,
                0 => $review,
                '' => $review,
                'null' => $review,
            ],
        );

        $this->assertNull(
            $out[9]['parcel_review'],
            'nothing in the reader output may give a parcel-unknown row a parcel review'
        );
        $this->assertFalse($out[9]['has_parcel_review']);
        $this->assertNull($out[9]['po_decision']);
    }

    /**
     * The same must hold when a chain reader wrongly offers a position for a
     * parcel-unknown row, so no combination of inputs can round it.
     */
    public function test_a_parcel_unknown_row_cannot_be_rounded_even_if_the_chain_offers_one(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(9, 10, null)],
            // The chain row claims a parcel the inspection does not have.
            chain: [$this->row(9, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 23)],
        );

        $this->assertNull(
            $out[9]['parcel_review'],
            'a mismatched chain row must not give a parcel-unknown row parcel context'
        );
        $this->assertTrue($out[9]['is_parcel_unknown']);
    }

    // ================================================================
    // 11 - 12 - current round only
    // ================================================================

    public function test_only_the_newest_round_of_a_chain_is_current(): void
    {
        $out = $this->resolve(
            inspections: [
                $this->inspection(1, 10, 100),
                $this->inspection(2, 10, 100),
                $this->inspection(3, 10, 100),
            ],
            chain: [
                $this->row(1, 10, 100),
                $this->row(2, 10, 100),
                $this->row(3, 10, 100),
            ],
            parcelLatest: [100 => $this->review('Requires Reinspection', 76, reviewRound: 2)],
        );

        $this->assertFalse($out[1]['is_current_round'], 'Round 1 is history');
        $this->assertFalse($out[2]['is_current_round'], 'Round 2 is history');
        $this->assertTrue($out[3]['is_current_round'], 'only Round 3 carries parcel context on the list');
    }

    public function test_a_page_resolving_only_an_older_round_still_knows_it_is_history(): void
    {
        // Exactly what the detail page does for inspection 8's application: one
        // row supplied, the chain still read in full.
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [
                $this->row(1, 10, 100),
                $this->row(2, 10, 100),
            ],
            parcelLatest: [100 => $this->review('Approved', 1, reviewRound: 2)],
        );

        $this->assertFalse(
            $out[1]['is_current_round'],
            'currentness must come from the whole chain, not the rows supplied'
        );
        $this->assertSame(1, $out[1]['round_number_check'] ?? 1);
    }

    // ================================================================
    // 13 - reviewer / date
    // ================================================================

    public function test_reviewer_and_date_come_from_the_review_and_never_invented(): void
    {
        $withName = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 4, reviewer: 'Rosario Planner')],
        );
        $this->assertSame('Rosario Planner', $withName[1]['parcel_review']['reviewer']);
        $this->assertSame('2026-09-22', $withName[1]['parcel_review']['reviewed_at']);

        $without = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
            parcelLatest: [100 => $this->review('Approved', 4, reviewer: null)],
        );
        $this->assertNull($without[1]['parcel_review']['reviewer'], 'no reviewer may be invented');
    }

    // ================================================================
    // 14 - empty input
    // ================================================================

    public function test_empty_input_resolves_to_an_empty_map(): void
    {
        $this->assertSame([], InspectionReviewVisibility::summarize([]));
    }

    /**
     * 15 - "Awaiting PO Review" must never be inferred from an absent link.
     *
     * The payload exposes no such field at all, so a UI cannot bind to one.
     */
    public function test_no_awaiting_po_review_signal_is_exposed(): void
    {
        $out = $this->resolve(
            inspections: [$this->inspection(1, 10, 100)],
            chain: [$this->row(1, 10, 100)],
        );

        $this->assertArrayNotHasKey(
            'awaiting_po_review',
            $out[1],
            'absence of reviewed_site_inspection_id is ambiguous and must not become a status'
        );
        $this->assertArrayNotHasKey('awaiting_review', $out[1]);
        $this->assertArrayNotHasKey('po_review_pending', $out[1]);
    }

    // ================================================================

    /**
     * Drive the real resolver with injected review rows and chain rows.
     *
     * @param  array<int, Model>  $inspections
     * @param  array<int, object>  $chain
     * @return array<int, array<string, mixed>>
     */
    private function resolve(array $inspections, array $chain, array $linked = [], array $parcelLatest = []): array
    {
        // Chain heads are derived first: the fetch closure captures them, and a
        // closure captures by value at creation, so declaring them afterwards
        // would capture nothing.
        $heads = [];

        foreach ($chain as $row) {
            if ($row->parcel_id === null) {
                continue;
            }

            $key = $row->zoning_application_id . ':' . $row->parcel_id;

            if (! isset($heads[$key]) || $row->id > $heads[$key]) {
                $heads[$key] = $row->id;
            }
        }

        $fetch = fn () => ['linked' => $linked, 'parcel' => $parcelLatest, 'heads' => $heads];

        return InspectionReviewVisibility::summarize(
            $inspections,
            $fetch,
            fn () => $chain
        );
    }

    private function row(int $id, int $applicationId, ?int $parcelId): object
    {
        return (object) [
            'id' => $id,
            'zoning_application_id' => $applicationId,
            'parcel_id' => $parcelId,
        ];
    }

    private function inspection(int $id, int $applicationId, ?int $parcelId): Model
    {
        $model = $this->getMockBuilder(Model::class)->onlyMethods(['getKey'])->getMock();
        $model->method('getKey')->willReturn($id);
        $model->setAttribute('id', $id);
        $model->setAttribute('zoning_application_id', $applicationId);
        $model->setAttribute('parcel_id', $parcelId);

        return $model;
    }

    private function review(
        string $decision,
        int $id,
        ?int $reviewRound = null,
        ?int $reviewedRound = null,
        ?string $reviewer = 'Rosario Planner'
    ): array {
        return [
            'id' => $id,
            'decision' => $decision,
            'review_round' => $reviewRound,
            'reviewed_site_inspection_id' => $reviewedRound,
            'reviewer_name' => $reviewer,
            'reviewed_at' => '2026-09-22 09:00:00',
        ];
    }
}