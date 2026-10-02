<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\TechnicalReview;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Support\InspectionReviewVisibility;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * PHASE 2B2C - Planning Officer review visibility.
 *
 * The whole point of this phase is NOT to invent a relationship that the
 * database does not record. Every test here is arranged so that an implementation
 * which guesses - by application alone, by ordering, or by reading
 * `site_inspection_task_id` backwards - fails.
 *
 * Two distinct things are covered and never conflated:
 *
 *   ROUND-SPECIFIC   proven only by `reviewed_site_inspection_id = <round id>`
 *   PARCEL-LEVEL     the newest review for the same (application, parcel)
 *
 * Currently every one of the 80 historical reviews has
 * `reviewed_site_inspection_id IS NULL`, so on real data no round-specific
 * decision exists anywhere. That is the correct result, and these tests pin it.
 */
class InspectionReviewVisibilityTest extends TestCase
{
    use RefreshDatabase;

    // ================================================================
    // 1. an EXPLICIT link produces a round-specific decision
    // ================================================================

    public function test_explicit_reviewed_site_inspection_id_produces_a_round_specific_decision(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round1 = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, [
            'decision' => 'Requires Reinspection',
            'reviewed_site_inspection_id' => $round1->id,
        ]);

        $out = InspectionReviewVisibility::summarize([$round1->fresh()]);

        $this->assertTrue($out[$round1->id]['has_round_decision']);
        $this->assertSame('Requires Reinspection', $out[$round1->id]['po_decision']);
    }

    public function test_each_post_inspection_decision_is_displayable_round_specifically(): void
    {
        foreach (['Approved', 'Declined', 'Requires Reinspection'] as $decision) {
            $app = $this->makeApplication();
            $parcel = $this->makeParcel($app);
            $round = $this->makeInspection($app, $parcel, 'completed');

            $this->makeReview($app, $parcel, [
                'decision' => $decision,
                'reviewed_site_inspection_id' => $round->id,
            ]);

            $out = InspectionReviewVisibility::summarize([$round->fresh()]);

            $this->assertSame(
                $decision,
                $out[$round->id]['po_decision'],
                $decision . ' must be displayable when explicitly linked.'
            );
        }
    }

    // ================================================================
    // 2. an UNLINKED review must NOT become a round-specific decision
    // ================================================================

    public function test_unlinked_review_produces_no_round_specific_decision(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, [
            'decision' => 'Approved',
            'reviewed_site_inspection_id' => null,
        ]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);

        $this->assertFalse($out[$round->id]['has_round_decision']);
        $this->assertNull(
            $out[$round->id]['po_decision'],
            'a review that does not name a round must never be shown as that round\'s decision'
        );
    }

    // ================================================================
    // 3. latest parcel review resolves by application + parcel
    // ================================================================

    public function test_latest_parcel_review_is_the_newest_by_review_round_then_id(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, ['decision' => 'Needs Site Inspection', 'review_round' => 1]);
        $newest = $this->makeReview($app, $parcel, ['decision' => 'Approved', 'review_round' => 3]);
        $this->makeReview($app, $parcel, ['decision' => 'Declined', 'review_round' => 2]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);
        $parcelReview = $out[$round->id]['parcel_review'];

        $this->assertNotNull($parcelReview);
        $this->assertSame(
            $newest->id,
            $parcelReview['review_id'],
            'the highest review_round must win, not the first or the last inserted'
        );
        $this->assertSame('Approved', $parcelReview['stored_decision']);
    }

    // ================================================================
    // 4. MULTI-PARCEL SAFETY
    // ================================================================

    public function test_a_review_never_crosses_from_one_parcel_to_another(): void
    {
        $app = $this->makeApplication();
        $p1 = $this->makeParcel($app);
        $p2 = $this->makeParcel($app);

        $round1 = $this->makeInspection($app, $p1, 'completed');
        $round2 = $this->makeInspection($app, $p2, 'completed');

        $this->makeReview($app, $p1, ['decision' => 'Approved', 'review_round' => 5]);
        $this->makeReview($app, $p2, ['decision' => 'Declined', 'review_round' => 1]);

        $out = InspectionReviewVisibility::summarize([
            $round1->fresh(),
            $round2->fresh(),
        ]);

        $this->assertSame(
            'Approved',
            $out[$round1->id]['parcel_review']['stored_decision'],
            'P-01 must only ever see P-01\'s review'
        );
        $this->assertSame(
            'Declined',
            $out[$round2->id]['parcel_review']['stored_decision'],
            'P-02 must only ever see P-02\'s review, even though its review_round is lower'
        );
    }

    public function test_a_review_never_crosses_between_applications_sharing_a_parcel_id_shape(): void
    {
        $appA = $this->makeApplication();
        $appB = $this->makeApplication();
        $parcelA = $this->makeParcel($appA);
        $parcelB = $this->makeParcel($appB);

        $roundA = $this->makeInspection($appA, $parcelA, 'completed');
        $roundB = $this->makeInspection($appB, $parcelB, 'completed');

        $this->makeReview($appA, $parcelA, ['decision' => 'Approved']);
        $this->makeReview($appB, $parcelB, ['decision' => 'Declined']);

        $out = InspectionReviewVisibility::summarize([$roundA->fresh(), $roundB->fresh()]);

        $this->assertSame('Approved', $out[$roundA->id]['parcel_review']['stored_decision']);
        $this->assertSame('Declined', $out[$roundB->id]['parcel_review']['stored_decision']);
    }

    // ================================================================
    // 5. site_inspection_task_id is NOT the reviewed round
    // ================================================================

    public function test_site_inspection_task_id_is_never_treated_as_the_reviewed_round(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);

        $round1 = $this->makeInspection($app, $parcel, 'completed');
        $round2 = $this->makeInspection($app, $parcel, 'assigned');

        // The review CREATED round 2. It did not judge round 1.
        $this->makeReview($app, $parcel, [
            'decision' => 'Requires Reinspection',
            'site_inspection_task_id' => $round2->id,
            'reviewed_site_inspection_id' => null,
        ]);

        $out = InspectionReviewVisibility::summarize([
            $round1->fresh(),
            $round2->fresh(),
        ]);

        $this->assertNull(
            $out[$round1->id]['po_decision'],
            'a review whose task_id names round 2 must not become round 1\'s decision'
        );
        $this->assertNull(
            $out[$round2->id]['po_decision'],
            'nor may it become the created round\'s own decision'
        );

        // It may still appear as parcel-level context.
        $this->assertSame(
            'Requires Reinspection',
            $out[$round2->id]['parcel_review']['stored_decision']
        );
    }

    // ================================================================
    // 6. Needs Site Inspection uses REQUEST wording
    // ================================================================

    public function test_needs_site_inspection_is_presented_as_a_request_not_a_verdict(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, ['decision' => 'Needs Site Inspection']);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);
        $parcelReview = $out[$round->id]['parcel_review'];

        $this->assertTrue($parcelReview['is_request']);
        $this->assertSame(
            'Site Inspection Requested',
            $parcelReview['label'],
            'a request must never be worded as a post-inspection decision'
        );
        $this->assertSame(
            'Planning Officer requested a site inspection.',
            $parcelReview['context']
        );

        // The stored value is preserved untouched.
        $this->assertSame('Needs Site Inspection', $parcelReview['stored_decision']);
    }

    public function test_needs_site_inspection_linked_to_a_round_is_reported_as_an_anomaly(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, [
            'decision' => 'Needs Site Inspection',
            'reviewed_site_inspection_id' => $round->id,
        ]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);

        $this->assertFalse(
            $out[$round->id]['has_round_decision'],
            'a request must not be forced into the verdict vocabulary'
        );
        $this->assertNotNull(
            $out[$round->id]['round_decision_anomaly'],
            'the mismatch must be reported rather than silently rendered'
        );
        $this->assertSame(
            'Needs Site Inspection',
            $out[$round->id]['round_decision_anomaly']['stored_decision']
        );
    }

    // ================================================================
    // 7-9. Approved / Declined / Requires Reinspection as parcel context
    // ================================================================

    public function test_each_decision_appears_correctly_as_parcel_level_context(): void
    {
        foreach (['Approved', 'Declined', 'Requires Reinspection'] as $decision) {
            $app = $this->makeApplication();
            $parcel = $this->makeParcel($app);
            $round = $this->makeInspection($app, $parcel, 'assigned');

            $this->makeReview($app, $parcel, ['decision' => $decision]);

            $out = InspectionReviewVisibility::summarize([$round->fresh()]);
            $parcelReview = $out[$round->id]['parcel_review'];

            $this->assertSame($decision, $parcelReview['label'], $decision . ' parcel context');
            $this->assertFalse($parcelReview['is_explicitly_linked']);
            $this->assertStringContainsString(
                'not linked to a specific inspection round',
                $parcelReview['context'],
                'parcel-level context must say it is not a round decision'
            );
        }
    }

    // ================================================================
    // 10. NULL-parcel inspections get NO parcel review
    // ================================================================

    public function test_parcel_unknown_inspection_receives_no_parcel_review(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $legacy = SiteInspection::factory()->create([
            'zoning_application_id' => $app->id,
            'parcel_id' => null,
            'status' => 'assigned',
        ]);

        // A review exists for the application and for its one parcel. It must NOT
        // be attached to the parcel-unknown row.
        $this->makeReview($app, $parcel, ['decision' => 'Approved']);

        $out = InspectionReviewVisibility::summarize([$legacy->fresh()]);

        $this->assertTrue($out[$legacy->id]['is_parcel_unknown']);
        $this->assertNull(
            $out[$legacy->id]['parcel_review'],
            'a parcel-unknown inspection must not borrow another row\'s parcel review'
        );
        $this->assertNull($out[$legacy->id]['po_decision']);
    }

    // ================================================================
    // 11-12. current round only, on the list
    // ================================================================

    public function test_only_the_current_round_of_a_chain_is_marked_current(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);

        $round1 = $this->makeInspection($app, $parcel, 'completed');
        $round2 = $this->makeInspection($app, $parcel, 'assigned');
        $round3 = $this->makeInspection($app, $parcel, 'assigned');

        $this->makeReview($app, $parcel, ['decision' => 'Requires Reinspection']);

        $out = InspectionReviewVisibility::summarize([
            $round1->fresh(), $round2->fresh(), $round3->fresh(),
        ]);

        $this->assertFalse($out[$round1->id]['is_current_round'], 'Round 1 is history');
        $this->assertFalse($out[$round2->id]['is_current_round'], 'Round 2 is history');
        $this->assertTrue(
            $out[$round3->id]['is_current_round'],
            'only the newest round carries compact parcel context'
        );
    }

    public function test_a_page_showing_only_an_older_round_still_knows_it_is_history(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);

        $round1 = $this->makeInspection($app, $parcel, 'completed');
        $this->makeInspection($app, $parcel, 'assigned');

        // Resolve ONLY round 1, as the detail page does. The chain is read from
        // the database, so this must not be mistaken for the current round.
        $out = InspectionReviewVisibility::summarize([$round1->fresh()]);

        $this->assertFalse(
            $out[$round1->id]['is_current_round'],
            'currentness must come from the whole chain, not the rows supplied'
        );
    }

    // ================================================================
    // 13. reviewer / date come from real review data only
    // ================================================================

    public function test_reviewer_and_date_are_taken_from_the_actual_review(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $reviewer = User::factory()->create(['name' => 'Rosario Planner']);

        $review = $this->makeReview($app, $parcel, [
            'decision' => 'Approved',
            'reviewed_by' => $reviewer->id,
            'reviewed_at' => '2026-09-22 09:00:00',
        ]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);
        $parcelReview = $out[$round->id]['parcel_review'];

        $this->assertSame('Rosario Planner', $parcelReview['reviewer']);
        $this->assertSame('2026-09-22', $parcelReview['reviewed_at']);
        $this->assertSame($review->id, $parcelReview['review_id']);
    }

    public function test_reviewer_is_null_when_the_review_records_nobody(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, ['decision' => 'Approved', 'reviewed_by' => null]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);

        $this->assertNull(
            $out[$round->id]['parcel_review']['reviewer'],
            'no reviewer may be invented when the review records none'
        );
    }

    // ================================================================
    // 14. multiple linked rows: newest wins
    // ================================================================

    public function test_the_newest_of_several_linked_reviews_wins(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $round = $this->makeInspection($app, $parcel, 'completed');

        $this->makeReview($app, $parcel, [
            'decision' => 'Approved', 'review_round' => 1, 'reviewed_site_inspection_id' => $round->id,
        ]);
        $this->makeReview($app, $parcel, [
            'decision' => 'Requires Reinspection', 'review_round' => 2, 'reviewed_site_inspection_id' => $round->id,
        ]);

        $out = InspectionReviewVisibility::summarize([$round->fresh()]);

        $this->assertSame(
            'Requires Reinspection',
            $out[$round->id]['po_decision'],
            'the highest review_round must win when several rows name the same round'
        );
    }

    // ================================================================
    // 16. NO N+1
    // ================================================================

    public function test_review_resolution_does_not_issue_a_query_per_inspection(): void
    {
        $app = $this->makeApplication();

        // 12 rounds across 3 parcels: a per-card implementation would run at
        // least 12 review queries here.
        foreach ([1 => 3, 2 => 5, 3 => 4] as $unused => $count) {
            $parcel = $this->makeParcel($app);
            $this->makeReview($app, $parcel, ['decision' => 'Approved']);

            for ($i = 0; $i < $count; $i++) {
                $this->makeInspection($app, $parcel, 'assigned');
            }
        }

        $inspections = SiteInspection::where('zoning_application_id', $app->id)->get();
        $this->assertCount(12, $inspections);

        DB::enableQueryLog();
        InspectionReviewVisibility::summarize($inspections);
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();

        // Constant, not proportional: chain, chain heads, linked reviews, parcel
        // reviews. Anything near the inspection count would be an N+1.
        $this->assertLessThanOrEqual(
            6,
            $queries,
            'review resolution must use a fixed number of queries, not one per inspection. '
            .'Ran ' . $queries . ' for 12 inspections.'
        );
    }

    public function test_empty_input_resolves_to_an_empty_map(): void
    {
        $this->assertSame([], InspectionReviewVisibility::summarize([]));
    }

    // ================================================================
    // 15. historical-data honesty: nothing to infer
    // ================================================================

    public function test_a_review_with_a_task_id_but_no_reviewed_id_yields_no_round_decision(): void
    {
        // This is EXACTLY the shape of all 80 historical reviews, including
        // Teshow's review 76. It must produce parcel context and nothing more.
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);

        $round1 = $this->makeInspection($app, $parcel, 'completed');
        $round2 = $this->makeInspection($app, $parcel, 'assigned');

        $this->makeReview($app, $parcel, [
            'decision' => 'Needs Site Inspection', 'review_round' => 1, 'site_inspection_task_id' => $round1->id,
        ]);
        $this->makeReview($app, $parcel, [
            'decision' => 'Requires Reinspection', 'review_round' => 2, 'site_inspection_task_id' => $round2->id,
        ]);

        $out = InspectionReviewVisibility::summarize([
            $round1->fresh(), $round2->fresh(),
        ]);

        $this->assertNull($out[$round1->id]['po_decision']);
        $this->assertNull($out[$round2->id]['po_decision']);

        $this->assertSame(
            'Requires Reinspection',
            $out[$round1->id]['parcel_review']['stored_decision'],
            'round 1 sees the latest parcel review as context'
        );
        $this->assertFalse(
            $out[$round1->id]['parcel_review']['is_explicitly_linked'],
            'and knows it is not linked to a round'
        );
    }

    // ================================================================

    private function makeApplication(): ZoningApplication
    {
        return ZoningApplication::factory()->create(['created_by' => User::factory()->create()->id]);
    }

    private function makeParcel(ZoningApplication $app): Parcel
    {
        return Parcel::factory()->create(['zoning_application_id' => $app->id]);
    }

    private function makeInspection(ZoningApplication $app, Parcel $parcel, string $status): SiteInspection
    {
        return SiteInspection::factory()->create([
            'zoning_application_id' => $app->id,
            'parcel_id' => $parcel->id,
            'status' => $status,
        ]);
    }

    private function makeReview(ZoningApplication $app, Parcel $parcel, array $overrides = []): TechnicalReview
    {
        return TechnicalReview::create(array_merge([
            'zoning_application_id' => $app->id,
            'parcel_id' => $parcel->id,
            'reviewed_by' => User::factory()->create()->id,
            'review_round' => 1,
            'decision' => 'Approved',
            'reviewed_at' => now(),
        ], $overrides));
    }
}