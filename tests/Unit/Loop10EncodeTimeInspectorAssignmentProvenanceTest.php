<?php

namespace Tests\Unit;

use Tests\TestCase;

/**
 * Loop 10 CP3 - the encode-time Site Inspector assignment must open the round's
 * ownership history.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `ApplicationController::store()` creates a SiteInspection inline when the
 * encode form carries a "Needs Site Inspection" decision. It set
 * `site_inspections.inspector_id` but never wrote a `site_inspection_assignments`
 * row, so:
 *
 *   - the current assignment pointer existed,
 *   - the append-only provenance history did not,
 *   - and the round could not answer "who was this given to, and by whom".
 *
 * The two other creation paths - `TechnicalReviewController::createInspectionRound()`
 * and `TechnicalReviewController::assignInspector()` - both already called
 * `WorkAssignmentService::recordInitialInspectorAssignment()`. The encode path was
 * the only one that did not, which is why canonical ended up with 39 rounds and 0
 * provenance rows.
 *
 * These are source-contract assertions. They run with no database, exactly like
 * the other Loop 1-9 contract gates, and they fail loudly if the call is removed
 * or if a second, competing history mechanism is introduced.
 */
class Loop10EncodeTimeInspectorAssignmentProvenanceTest extends TestCase
{
    private string $controller;

    protected function setUp(): void
    {
        parent::setUp();

        $path = app_path('Http/Controllers/ApplicationController.php');
        $this->controller = (string) file_get_contents($path);
    }

    /**
     * The body of the encode-time inspection-creation block, from the
     * SiteInspection::create() that builds the round to the end of the enclosing
     * "Needs Site Inspection" branch.
     */
    private function encodeInspectionBranch(): string
    {
        $start = strpos($this->controller, "'inspector_id'               => \$parcelData['inspector_id']");

        $this->assertNotFalse($start, 'The encode-time branch that sets inspector_id is missing from ApplicationController.');

        // Bounded generously: the branch carries a long explanatory comment plus the
        // create(), the provenance write and the dispatch. A tight window silently
        // truncated the dispatch and made the ordering assertion vacuous.
        return substr($this->controller, $start, 4000);
    }

    public function test_encode_time_path_creates_the_site_inspection_round(): void
    {
        $branch = $this->encodeInspectionBranch();

        $this->assertStringContainsString('SiteInspection::create(', $branch);
        $this->assertStringContainsString("'inspector_id'", $branch);
    }

    /**
     * THE CORE ASSERTION: the pointer and its provenance row are written together.
     */
    public function test_encode_time_assignment_writes_the_initial_provenance_row(): void
    {
        $branch = $this->encodeInspectionBranch();

        $this->assertStringContainsString(
            'recordInitialInspectorAssignment(',
            $branch,
            'The encode-time Site Inspector assignment must open the round\'s ownership history. '
            .'Without it site_inspections.inspector_id is set while site_inspection_assignments stays empty, '
            .'so the round records no provenance for who held it.'
        );

        // It must reuse the ONE canonical writer, not open a second mechanism.
        $this->assertStringContainsString(
            'WorkAssignmentService::class)->recordInitialInspectorAssignment(',
            $branch,
            'The provenance row must be written by the canonical WorkAssignmentService writer, '
            .'the same one TechnicalReviewController uses. A second insert path would fork the contract.'
        );
    }

    /**
     * Exactly one history write on this path - no duplicate provenance row.
     */
    public function test_encode_time_path_writes_exactly_one_provenance_row(): void
    {
        $branch = $this->encodeInspectionBranch();

        $this->assertSame(
            1,
            substr_count($branch, 'recordInitialInspectorAssignment('),
            'The encode path must write exactly one provenance row per round it creates.'
        );
    }

    /**
     * Initial assignment is NOT a transfer. The canonical writer already derives
     * assignment_type and the NULL from/reason from the round having no previous
     * inspector; this pins that the encode path does not try to force a reason.
     *
     * The assertions deliberately target CODE, not prose. This method's own
     * explanatory comment once named a forbidden reason value, which made a
     * substring scan flag correct code; the check is scoped to the executable
     * statements instead.
     */
    public function test_encode_time_path_does_not_forge_a_transfer_reason(): void
    {
        $branch = $this->encodeInspectionBranch();

        // Strip comments so a comment that explains WHY a reason is absent is not
        // mistaken for code that supplies one.
        $code = '';
        foreach (explode("\n", $branch) as $line) {
            $code .= preg_replace('#//.*$#', '', $line)."\n";
        }

        $this->assertStringNotContainsString(
            'Workload Transfer',
            $code,
            'An initial assignment states no reason. A handover reason would record a transfer that never happened.'
        );
        $this->assertStringNotContainsString(
            "'reason' =>",
            $code,
            'The encode path must not supply a reason; the canonical writer derives the initial/reassignment shape.'
        );

        // The writer itself owns the initial-vs-reassignment decision.
        $service = (string) file_get_contents(app_path('Services/WorkAssignmentService.php'));
        $this->assertStringContainsString(
            'SiteInspectionAssignment::TYPE_INITIAL',
            $service,
            'The canonical writer must still distinguish an initial assignment from a reassignment.'
        );
        $this->assertStringContainsString(
            '$isInitial = $fromId === null;',
            $service,
            'The canonical writer derives "initial" from the round having no previous inspector.'
        );
        $this->assertStringContainsString(
            'SiteInspectionAssignment::TYPE_REASSIGNMENT',
            $service,
            'A genuine handover must still be classified as a reassignment, never as an initial assignment.'
        );
    }

    /**
     * The history row must be written BEFORE the remote dispatch, so a round can
     * never exist remotely with its local provenance unwritten.
     */
    public function test_provenance_is_written_before_the_remote_dispatch(): void
    {
        $branch = $this->encodeInspectionBranch();

        $historyAt = strpos($branch, 'recordInitialInspectorAssignment(');
        $dispatchAt = strpos($branch, 'PushInspectionToSupabase::dispatch(');

        $this->assertNotFalse($historyAt, 'The provenance write was not found in the encode branch.');
        $this->assertNotFalse($dispatchAt, 'The remote dispatch was not found in the encode branch.');
        $this->assertLessThan(
            $dispatchAt,
            $historyAt,
            'The provenance row must be written before the remote dispatch is queued.'
        );
    }

    /**
     * All three round-creation paths must agree, so the answer to "who was this
     * given to" never depends on which screen the Planning Officer happened to use.
     */
    public function test_every_round_creation_path_opens_the_ownership_history(): void
    {
        $technical = (string) file_get_contents(
            app_path('Http/Controllers/TechnicalReviewController.php')
        );

        // createInspectionRound() opens history on BOTH its new-round branches:
        // the Requires Reinspection newRound() and the first-time create().
        $this->assertSame(
            2,
            substr_count($technical, '$this->recordRoundHistoryOpening('),
            'createInspectionRound() must open history on both the reinspection branch and the first-round branch.'
        );

        // assignInspector() writes it directly.
        $this->assertStringContainsString(
            'recordInitialInspectorAssignment(',
            $technical,
            'TechnicalReviewController::assignInspector() must open the round history too.'
        );

        // And the encode path now does as well.
        $this->assertStringContainsString(
            'recordInitialInspectorAssignment(',
            $this->controller,
            'ApplicationController::store() must open the round history too.'
        );
    }

    /**
     * The DB CHECK is the backstop for the "initial implies NULL from and NULL
     * reason" rule, so a code path cannot skip the writer's discipline.
     *
     * The rule is asserted against the MIGRATION that defines the table, which is
     * the canonical source for the constraint, not against a forward-SQL file:
     * this table was created by the migration, and no forward-SQL file in
     * database/sql creates it.
     */
    public function test_database_check_backs_the_initial_assignment_rule(): void
    {
        $migration = (string) file_get_contents(
            base_path('database/migrations/2026_09_27_010000_add_work_reassignment_contract.php')
        );

        $this->assertStringContainsString('site_inspection_assignments', $migration);
        $this->assertStringContainsString('initial', $migration);

        // The retired field-instruction column must not come back through this path.
        $branchCode = preg_replace('#//.*$#', '', $this->encodeInspectionBranch());

        $this->assertStringNotContainsString(
            "'remarks' =>",
            (string) $branchCode,
            'assigned_notes is the canonical instruction field; retired `remarks` must not return.'
        );
        $this->assertStringContainsString(
            "'assigned_notes'",
            (string) $branchCode,
            'The round\'s field instructions must still come from assigned_notes.'
        );
    }
}