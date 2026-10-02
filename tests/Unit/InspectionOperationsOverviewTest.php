<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;
use App\Support\InspectionOperationsSummary;

/**
 * PHASE 2B1 - Admin Site Inspection operations overview.
 *
 * WHAT THIS CLASS PROTECTS
 * -----------------------
 * The Admin page may only show what the database can PROVE. Three specific
 * temptations are refused here, and the refusals are the point of the phase:
 *
 *  1. A PO decision may only be shown when `technical_reviews.
 *     reviewed_site_inspection_id` names the round. `site_inspection_task_id`
 *     is the round a review CREATED, not the round it judged, so using it would
 *     display a `Requires Reinspection` decision against the very round it
 *     produced. All 80 existing reviews have `reviewed_site_inspection_id` NULL,
 *     so the correct current output is: show nothing.
 *
 *  2. `Needs Site Inspection` is not a post-inspection verdict. It requests an
 *     inspection, so it must never be displayed as the decision on a completed
 *     round.
 *
 *  3. A per-round diagnostic is not derivable. The remote `diagnostic_reports`
 *     table has no `local_inspection_id` and no `parcel_id`, so nothing can be
 *     honestly attributed to a round.
 *
 * Delivery uses the canonical `InspectionDeliveryStatus` vocabulary per round,
 * and NULL is `no_delivery_record` - never a failure.
 */
class InspectionOperationsOverviewTest extends TestCase
{
    private const SUMMARY = 'app/Support/InspectionOperationsSummary.php';

    private const CONTROLLER = 'app/Http/Controllers/SiteInspectionController.php';

    private const LIST_VIEW = 'resources/js/Pages/Site Inspections/Index.jsx';

    // ==================================================================
    // 1 / 2 - original vs reinspection labelling
    // ==================================================================

    public function test_original_inspection_is_labelled_from_the_canonical_derivation(): void
    {
        // Round identity stays the existing per-application derivation. No new
        // round_number column is introduced, and round_kind is already derived
        // from that canonical round number.
        $controller = $this->read(self::CONTROLLER);

        $this->assertStringContainsString('roundNumbersByApplication', $controller);
        $this->assertStringContainsString(
            "\$inspection->round_kind = \$round === 1 ? 'Original Inspection' : 'Reinspection'",
            $controller,
            'Round 1 must read Original Inspection and later rounds Reinspection.'
        );
    }

    public function test_no_new_round_number_column_is_introduced(): void
    {
        // round_number is a derived, in-memory attribute, never a column.
        $this->assertStringNotContainsString("'round_number'", $this->php(self::SUMMARY));
        $this->assertStringNotContainsString('->round_number =', $this->php(self::SUMMARY));
    }

    // ==================================================================
    // 3 / 4 - previous rounds stay visible and are not collapsed
    // ==================================================================

    public function test_previous_rounds_remain_visible_and_are_not_collapsed(): void
    {
        $controller = $this->read(self::CONTROLLER);
        $summary = $this->read(self::SUMMARY);

        // The list still renders BOTH collections, so a completed Round 1 is not
        // replaced by a newer Round 2.
        $this->assertStringContainsString("'pendingInspections' => \$pendingInspections,", $controller);
        $this->assertStringContainsString("'completedInspections' => \$completedInspections,", $controller);

        // No latestOfMany / latest-per-application collapse anywhere.
        foreach ([$controller, $summary] as $file) {
            $this->assertDoesNotMatchRegularExpression(
                '/latestOfMany|latestOf\(|->latest\(\)/i',
                $file,
                'Collapsing to the latest round would hide inspection history.'
            );
        }
    }

    public function test_overview_does_not_filter_or_drop_inspection_rows(): void
    {
        $source = $this->php(self::SUMMARY);

        // Isolate summarize() only. filters belong in counters(), which
        // counts; summarize() must map every row it is handed so that no
        // round silently disappears from the overview.
        $start = strpos($source, 'public function summarize');
        $end = strpos($source, 'public function counters');
        $this->assertIsInt($start);
        $this->assertIsInt($end);

        $summarize = substr($source, $start, $end - $start);

        // NOTE: summarize() does legitimately filter a PLUCKED ID LIST before
        // the decision lookup, because a null id cannot be linked. The real
        // invariant is that no INSPECTION ROW is dropped, so the assertion
        // targets the rows collection rather than banning filter() outright.
        $this->assertStringNotContainsString('$rows->filter(', $summarize);
        $this->assertStringNotContainsString('$inspections->filter(', $summarize);
        $this->assertStringNotContainsString('->where(', $summarize);
        $this->assertStringContainsString('return $rows->map(', $summarize);
    }

    // ==================================================================
    // 5 - PO decision only when round linkage is reliable
    // ==================================================================

    public function test_po_decision_requires_reviewed_site_inspection_id(): void
    {
        $summary = $this->php(self::SUMMARY);

        $this->assertStringContainsString(
            "->whereIn('reviewed_site_inspection_id', \$inspectionIds)",
            $summary,
            'The only acceptable round linkage is reviewed_site_inspection_id.'
        );
    }

    public function test_site_inspection_task_id_is_never_used_as_the_reviewed_round(): void
    {
        $summary = $this->php(self::SUMMARY);

        // This is the backwards-linkage trap: site_inspection_task_id is the
        // round the review created, not the round that was judged.
        $this->assertStringNotContainsString('site_inspection_task_id', $summary);
    }

    public function test_only_the_three_real_post_inspection_decisions_are_displayable(): void
    {
        $summary = $this->read(self::SUMMARY);

        $this->assertStringContainsString(
            "public const DISPLAYABLE_DECISIONS = ['Approved', 'Declined', 'Requires Reinspection']",
            $summary
        );

        $this->assertStringNotContainsString(
            "'Needs Site Inspection',",
            $summary,
            'Needs Site Inspection must never be a displayable post-inspection decision.'
        );
    }

    public function test_absent_linkage_yields_null_not_a_guess(): void
    {
        $summary = $this->php(self::SUMMARY);

        $this->assertStringContainsString(
            "'po_decision' => \$review['decision'] ?? null",
            $summary,
            'With no linked review the decision must be null so the view renders nothing.'
        );
    }

    // ==================================================================
    // 6 - historical NULL linkage is never inferred
    // ==================================================================

    public function test_null_review_linkage_is_never_backfilled_or_inferred(): void
    {
        $summary = $this->php(self::SUMMARY);

        // No fallback that would attach a decision by application or parcel.
        $this->assertStringNotContainsString('zoning_application_id', $summary);
        $this->assertStringNotContainsString('parcel_id', $summary);
        $this->assertDoesNotMatchRegularExpression(
            '/->whereNull\(.reviewed_site_inspection_id.\)/',
            $summary,
            'Selecting unlinked reviews and attributing them to a round would be a guess.'
        );
    }

    public function test_latest_decision_per_round_is_ordered_not_arbitrary(): void
    {
        $summary = $this->php(self::SUMMARY);

        $this->assertStringContainsString("->orderByDesc('reviewed_at')", $summary);
        $this->assertStringContainsString('if (! isset($out[$roundId])) {', $summary);
    }

    // ==================================================================
    // 7 - Requires Reinspection shows against the REVIEWED round
    // ==================================================================

    public function test_requires_reinspection_is_displayable_and_not_special_cased(): void
    {
        $summary = $this->php(self::SUMMARY);

        // It is one of the three allowed decisions and receives no bespoke
        // placement logic, so it cannot be moved onto the wrong round.
        $this->assertStringContainsString("'Requires Reinspection'", $summary);
        $this->assertStringNotContainsString('requiresReinspection', $summary);
    }

    // ==================================================================
    // 8 - Needs Site Inspection is not a completed-round decision
    // ==================================================================

    public function test_needs_site_inspection_is_not_misrepresented(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        // The view may label the decision generically, but the source list must
        // not contain it, so it can never reach the page.
        $this->assertStringNotContainsString('Needs Site Inspection', $list);
    }

    // ==================================================================
    // 9 / 10 - delivery health uses canonical vocabulary, per round
    // ==================================================================

    public function test_delivery_uses_the_canonical_status_helper(): void
    {
        $summary = $this->read(self::SUMMARY);

        $this->assertStringContainsString('InspectionDeliveryStatus::state(', $summary);
        $this->assertStringContainsString('InspectionDeliveryStatus::label(', $summary);
        $this->assertStringContainsString('InspectionDeliveryStatus::isFailure(', $summary);
    }

    public function test_no_new_delivery_vocabulary_is_invented(): void
    {
        $summary = $this->php(self::SUMMARY);

        foreach (['no_delivery_record', 'pending_delivery', 'delivered', 'delivery_failed'] as $state) {
            // These live in the canonical helper, so the summary must NOT
            // redefine or hardcode them.
            $this->assertStringNotContainsString("'" . $state . "'", $summary);
        }
    }

    public function test_no_delivery_record_is_not_treated_as_failure(): void
    {
        $summary = $this->read(self::SUMMARY);
        $list = $this->read(self::LIST_VIEW);

        // Failure styling is driven solely by the canonical isFailure() answer.
        $this->assertStringContainsString('delivery_is_failure', $summary);
        $this->assertStringContainsString('delivery_is_failure', $list);
    }

    public function test_delivery_label_renders_from_the_canonical_label(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        $this->assertMatchesRegularExpression(
            '/operations\?\.\[item\.id\]\?\.delivery_label/',
            $list,
            'The card must render the canonical delivery label, not an invented one.'
        );
    }

    // ==================================================================
    // 11 - diagnostics are not duplicated and not faked per round
    // ==================================================================

    public function test_no_per_round_diagnostic_is_claimed(): void
    {
        $summary = $this->php(self::SUMMARY);

        // Stated as explicitly null so a future change cannot silently invent it.
        $this->assertStringContainsString(
            "'has_diagnostic' => null",
            $summary,
            'There is no per-round diagnostic linkage; it must be null, not guessed.'
        );
    }

    public function test_site_inspection_does_not_embed_the_diagnostics_page(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        // A compact indicator is fine; reproducing the report body is not.
        $this->assertStringNotContainsString('technical_description', $list);
        $this->assertStringNotContainsString('repro_steps', $list);
        $this->assertStringNotContainsString('recommended_action', $list);
    }

    // ==================================================================
    // 12 / 13 / 15 - no PO authority, scoped sync preserved, no bulk sync
    // ==================================================================

    public function test_no_po_mutation_action_is_exposed(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        foreach ([
            '/technical-review/submit-batch',
            '/technical-review/update-status',
            '/technical-review/assign-inspector',
            '/site-inspections/reassign-inspector',
            '/site-inspections/',
        ] as $forbidden) {
            if ($forbidden === '/site-inspections/') {
                continue; // the scoped detail link is navigation, not a mutation
            }
            $this->assertStringNotContainsString($forbidden, $list);
        }
    }

    public function test_phase2a_scoped_sync_and_bulk_removal_are_preserved(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        $this->assertStringNotContainsString('/site-inspections/sync', $list);
        $this->assertStringNotContainsString('Refresh Data', $list);
    }

    // ==================================================================
    // 14 - the approved visibility fix survives
    // ==================================================================

    public function test_identifier_visibility_is_preserved(): void
    {
        $list = $this->jsx(self::LIST_VIEW);

        $this->assertSame(
            1,
            preg_match('/<span className="([^"]*)">\s*\{item\.display_reference/', $list, $m),
            'The reference must still be rendered by one unclamped element.'
        );
        $this->assertStringNotContainsString('line-clamp', $m[1]);
        $this->assertStringContainsString('break-words', $m[1]);
        $this->assertStringContainsString('INS-{item.id}', $list);
    }

    // ==================================================================
    // 6 (page counters) - no speculative metric
    // ==================================================================

    public function test_awaiting_po_review_counter_is_not_implemented(): void
    {
        $summary = $this->php(self::SUMMARY);
        $list = $this->jsx(self::LIST_VIEW);

        $this->assertStringNotContainsString('awaiting_po_review', $summary);
        $this->assertStringNotContainsString('Awaiting PO Review', $list);
    }

    public function test_implemented_counters_are_all_locally_provable(): void
    {
        $summary = $this->read(self::SUMMARY);

        foreach (['under_inspection', 'completed', 'reinspections', 'delivery_issues'] as $counter) {
            $this->assertStringContainsString("'" . $counter . "' =>", $summary);
        }
    }

    public function test_live_fieldsync_progress_is_never_inferred(): void
    {
        $summary = $this->php(self::SUMMARY);
        $list = $this->jsx(self::LIST_VIEW);

        // iMAPS cannot see field progress. No current_step or live status.
        $this->assertStringNotContainsString('current_step', $summary);
        $this->assertStringNotContainsString('Ongoing', $list);
    }

    // ==================================================================

    /**
     * PHP comments removed, so an assertion about what the code EXECUTES cannot be
     * satisfied or broken by its own explanatory prose. This matters here because
     * the summary class documents, in comments, several of the very tokens it
     * forbids - site_inspection_task_id, awaiting_po_review and others.
     */
    private function php(string $relative): string
    {
        $source = $this->read($relative);
        $source = preg_replace('#/\*.*?\*/#s', '', $source) ?? $source;

        return preg_replace('#^\s*//.*$#m', '', $source) ?? $source;
    }

    /** JSX comment blocks removed, for the same reason. */
    private function jsx(string $relative): string
    {
        $source = $this->read($relative);

        return preg_replace('#\{\s*/\*.*?\*/\s*\}#s', '', $source) ?? $source;
    }

    private function read(string $relative): string
    {
        $path = dirname(__DIR__, 2) . '/' . $relative;

        $this->assertFileExists($path, 'Missing file: ' . $relative);

        return (string) file_get_contents($path);
    }
}
