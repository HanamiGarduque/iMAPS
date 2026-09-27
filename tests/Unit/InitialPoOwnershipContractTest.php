<?php

namespace Tests\Unit;

use App\Services\WorkAssignmentService;
use App\Support\ReassignmentReasons;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Initial Planning Officer ownership.
 *
 * The approved rule: when a NEW application is created by an ACTIVE Planning
 * Officer, that officer becomes the initial owner of the application's pending
 * Planning Officer work, recorded as an explicit INITIAL assignment.
 *
 * Three things this rule must NOT become, and each has its own assertion:
 *
 *  - it must not REDEFINE `encoded_by`. The two may hold the same user id at
 *    creation and still mean different things;
 *  - it must not require a reassignment reason. A reason describes work being
 *    taken away from somebody, and at first assignment nothing is;
 *  - it must not become a BACKFILL. Existing applications whose real owner is
 *    unknown stay honestly unassigned.
 *
 * The eligibility matrix and the assignment-type rule are proved with PURE
 * functions, so they are executable in this environment with no database. The
 * wiring is asserted against comment-stripped source and the database-level
 * guarantees are asserted against the migration that implements them, backed by
 * the live constraint matrix recorded in the change log.
 */
class InitialPoOwnershipContractTest extends TestCase
{
    private function source(string $relativePath): string
    {
        $path = base_path($relativePath);
        $this->assertFileExists($path, "Expected source file {$relativePath} to exist.");

        return (string) file_get_contents($path);
    }

    private function code(string $source): string
    {
        $source = (string) preg_replace('#/\*.*?\*/#s', '', $source);

        $kept = [];
        foreach (preg_split('/\R/', $source) as $line) {
            if (preg_match('#^\s*(//|\*|/\*)#', $line)) {
                continue;
            }

            $kept[] = $line;
        }

        return implode("\n", $kept);
    }

    private function codeOf(string $relativePath): string
    {
        return $this->code($this->source($relativePath));
    }

    // ══════════════════════════════════════════════════════════════════════
    // ELIGIBILITY MATRIX (tests 1 and 6)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Only an active Planning Officer may be recorded as the first owner of an
     * application. An Admin is not eligible even though an Admin performs later
     * handovers, and a Site Inspector is never eligible.
     */
    public function test_only_an_active_planning_officer_may_receive_initial_ownership(): void
    {
        $this->assertTrue(
            WorkAssignmentService::canReceiveInitialOwnership('Planning Officer', true),
            'An active Planning Officer creates an application and therefore owns it initially.'
        );
    }

    public function test_a_suspended_planning_officer_is_not_eligible(): void
    {
        $this->assertFalse(
            WorkAssignmentService::canReceiveInitialOwnership('Planning Officer', false),
            'Ownership of work a suspended officer cannot act on is worse than no ownership.'
        );
    }

    public function test_a_non_planning_officer_is_never_eligible(): void
    {
        foreach (['Admin', 'Site Inspector'] as $role) {
            $this->assertFalse(
                WorkAssignmentService::canReceiveInitialOwnership($role, true),
                "A {$role} must never be recorded as the initial Planning Officer owner."
            );
        }
    }

    /**
     * Eligibility is exact-string, case-sensitive and alias-free, matching the
     * role middleware. A near-miss spelling must not slip through.
     */
    public function test_eligibility_is_exact_and_case_sensitive(): void
    {
        foreach (['planning officer', 'PLANNING OFFICER', 'PlanningOfficer', ' Planning Officer', 'Admin'] as $role) {
            $this->assertFalse(
                WorkAssignmentService::canReceiveInitialOwnership($role, true),
                "'{$role}' must not be accepted as the Planning Officer role."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // THE CREATION PATH (tests 1, 2, 3, 4, 5)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The creation path must call the initializer, and must do so with the
     * authenticated user so eligibility is evaluated on the real creator.
     */
    public function test_the_creation_path_initializes_ownership(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');

        $this->assertStringContainsString(
            'initializePoOwnershipForNewApplication($application, Auth::user())',
            $controller
        );
    }

    /**
     * The initializer writes the explicit initial-assignment record: no previous
     * owner, the creator as the new owner, the creator as the actor, and NO
     * reason.
     */
    public function test_the_initial_assignment_record_is_written_correctly(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString('public function initializePoOwnershipForNewApplication', $service);
        $this->assertStringContainsString('ApplicationPoAssignment::TYPE_INITIAL', $service);

        // from = NULL, to = creator, actor = creator.
        $this->assertStringContainsString("'from_planning_officer_id' => null,", $service);
        $this->assertStringContainsString("'to_planning_officer_id'   => \$creator->id,", $service);
        $this->assertStringContainsString("'reassigned_by'            => \$creator->id,", $service);

        // The pointer is set to the creator.
        $this->assertStringContainsString('$application->assigned_planning_officer_id = $creator->id;', $service);
    }

    /**
     * Test 5: an initial assignment must NOT be forced to state a reason.
     * The row is written with a NULL reason, and the initializer no longer
     * accepts one as a parameter at all.
     */
    public function test_an_initial_assignment_states_no_reason(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertMatchesRegularExpression(
            '/public function initializePoOwnershipForNewApplication\(\s*ZoningApplication \$application,\s*\?User \$creator,?\s*\): bool/s',
            $service,
            'The initializer must not accept a reason parameter.'
        );

        $this->assertStringContainsString("'reason'                   => null,", $service);
        $this->assertStringContainsString("'reason_note'              => null,", $service);
    }

    /**
     * A first assignment of an INSPECTION round follows the same rule. This
     * previously defaulted to "Workload Transfer", which recorded a false fact
     * on every brand new round: opening a round is not moving work away from
     * anybody.
     */
    public function test_a_new_inspection_round_states_no_reason(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringNotContainsString(
            'ReassignmentReasons::WORKLOAD_TRANSFER',
            $service,
            'No initial assignment may default to a reassignment reason.'
        );

        $this->assertMatchesRegularExpression(
            '/public function recordInitialInspectorAssignment\(\s*SiteInspection \$inspection,\s*User \$actor,?\s*\): void/s',
            $service,
            'The initial inspector record must not accept a reason parameter.'
        );

        $this->assertStringContainsString("'reason'            => null,", $service);
    }

    /**
     * Test 2: `encoded_by` keeps its own meaning and is never written by the
     * assignment service. The initializer names it in an audit note, which is
     * the opposite of redefining it, so the assertion is about writes.
     */
    public function test_encoded_by_is_not_redefined(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        foreach (["'encoded_by' =>", 'encoded_by =', '$application->encoded_by ='] as $write) {
            $this->assertStringNotContainsString(
                $write,
                $service,
                "The assignment service must never write encoded_by ({$write})."
            );
        }

        // It is still written once, by the creation path, as the encoder.
        $controller = $this->codeOf('app/Http/Controllers/ApplicationController.php');
        $this->assertStringContainsString("'encoded_by'                 => Auth::id(),", $controller);
    }

    // ══════════════════════════════════════════════════════════════════════
    // NO BACKFILL (test 7)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Test 7: existing applications must NOT be given an owner by copying
     * `encoded_by`. The audit rejected that on purpose — proving who encoded a
     * record is not proving who currently owns its unfinished work.
     */
    public function test_existing_applications_are_never_backfilled_from_the_encoder(): void
    {
        foreach ([
            'database/migrations/2026_09_27_010000_add_work_reassignment_contract.php',
            'database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php',
        ] as $path) {
            $migration = $this->codeOf($path);

            // The column is positioned with ->after('encoded_by'), which is a
            // statement about column ORDER and not a read of the encoder's
            // value. What must never appear is anything that copies it, or any
            // write to an application row at all.
            $this->assertStringNotContainsString('encoded_by)', $migration, "{$path} must not read encoded_by's value.");
            $this->assertStringNotContainsString('= encoded_by', $migration, "{$path} must not copy encoded_by.");
            $this->assertStringNotContainsString('UPDATE zoning_applications', $migration, "{$path} must not update any application row.");
            $this->assertStringNotContainsString('->update(', $migration, "{$path} must not write data.");
            $this->assertStringNotContainsString('->insert(', $migration, "{$path} must not insert data.");
        }

        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        // No bulk ownership backfill exists anywhere in the service either.
        $this->assertStringNotContainsString('ZoningApplication::where', $service);
        $this->assertStringNotContainsString('->update([', $service);
    }

    /**
     * The initializer is only ever called from the creation path, on the model
     * that was just created. It has no bulk or update-everything behaviour.
     */
    public function test_initialization_only_ever_runs_for_an_application_being_created(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString('$application->id,', $service);
        $this->assertStringNotContainsString('::all()', $service);
        $this->assertStringNotContainsString('->each(', $service);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ADMIN FIRST ASSIGNMENT vs REASSIGNMENT (tests 8, 9, 10, 11, 12)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Tests 8 and 9: an application with no current owner is ASSIGNED. The
     * history row records type=initial, from=NULL, and the Admin as the actor,
     * with no reason.
     */
    public function test_an_admin_first_assignment_is_recorded_as_initial(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString(
            '$isInitial = $fromId === null;',
            $service,
            'The assignment type must be derived from whether there is a previous owner.'
        );

        $this->assertStringContainsString(
            '$effectiveReason = $isInitial ? null : $reason;',
            $service,
            'A first assignment must drop the reason rather than store a fabricated one.'
        );

        $this->assertStringContainsString("'PLANNING_OFFICER_ASSIGNED'", $service);
    }

    /**
     * Test 10: once an owner exists, a later transfer is a reassignment that
     * records both the previous and the new officer.
     */
    public function test_a_later_transfer_is_recorded_as_a_reassignment(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString('ApplicationPoAssignment::TYPE_REASSIGNMENT', $service);
        $this->assertStringContainsString("'from_planning_officer_id' => \$fromId,", $service);
        $this->assertStringContainsString("'PLANNING_OFFICER_REASSIGNED'", $service);
    }

    /**
     * Test 11: a reason is required only when there is an owner to replace. A
     * first assignment is not asked for one, because asking would force a false
     * answer.
     */
    public function test_a_reason_is_required_only_when_replacing_an_owner(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');

        $this->assertStringContainsString(
            '$isReplacingAnOwner = $application->assigned_planning_officer_id !== null;',
            $controller
        );

        $this->assertMatchesRegularExpression(
            '/if \(\$isReplacingAnOwner && blank\(\$validated\[\'reason\'\] \?\? null\)\) \{.*?\'reason\' =>/s',
            $controller,
            'A reason must be demanded only when an existing owner is being replaced.'
        );

        // The same rule on the inspector route.
        $this->assertStringContainsString(
            '$isReplacingAnInspector = $inspection->inspector_id !== null;',
            $controller
        );
    }

    /**
     * Test 12: "Other" always requires a written explanation, in both the form
     * and the database.
     */
    public function test_other_always_requires_a_written_explanation(): void
    {
        $this->assertTrue(ReassignmentReasons::noteIsRequired(ReassignmentReasons::OTHER));

        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');
        $migration = $this->codeOf('database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php');

        $this->assertStringContainsString("'required_if:reason,' . ReassignmentReasons::OTHER", $controller);
        $this->assertStringContainsString("reason IS DISTINCT FROM 'Other'", $migration);
        $this->assertStringContainsString("btrim(reason_note) <> ''", $migration);
    }

    /**
     * A first assignment must NOT be able to smuggle in a reason. The service
     * discards it, and the database refuses it outright.
     */
    public function test_an_initial_assignment_cannot_carry_a_reason_anywhere(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');
        $migration = $this->codeOf('database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php');

        // Application layer: the value is overwritten with null.
        $this->assertStringContainsString('$effectiveReason = $isInitial ? null : $reason;', $service);

        // Database layer: an initial row with any reason is refused outright.
        $this->assertStringContainsString(
            "({\$typeColumn} = 'initial' AND {\$reasonColumn} IS NULL)",
            $migration
        );
    }

    /**
     * The reason check must not have a NULL hole. `NULL IN (...)` is NULL, not
     * false, and a CHECK constraint PASSES on NULL — so a rule written only as
     * `reassignment AND reason IN (...)` would silently accept a reassignment
     * with no reason at all. That bug was found and fixed during verification.
     */
    public function test_the_reason_check_has_no_null_hole(): void
    {
        $migration = $this->codeOf('database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php');

        $this->assertStringContainsString(
            "{\$typeColumn} = 'reassignment' AND {\$reasonColumn} IS NOT NULL AND {\$reasonColumn} IN ({\$allowed})",
            $migration,
            'The reassignment branch must guard against NULL explicitly.'
        );

        $this->assertStringNotContainsString(
            "{\$reasonColumn} IS NULL OR",
            $migration,
            'The initial branch must not permit a reason at all.'
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // NOTHING ELSE MOVES (tests 13, 14)
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Tests 13 and 14: initializing ownership at creation must not change the
     * application status, the encoder value, or create any technical review.
     */
    public function test_initializing_ownership_changes_nothing_else(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringNotContainsString('$application->status', $service);
        $this->assertStringNotContainsString('TechnicalReview::', $service);
        $this->assertStringNotContainsString("'encoded_by' =>", $service);

        // Exactly one application write: the ownership pointer.
        $this->assertSame(
            2,
            substr_count($service, '$application->save()'),
            'The application row is saved once per write path, and only ever for the ownership pointer.'
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // UI WORDING
    // ══════════════════════════════════════════════════════════════════════

    /**
     * A first assignment must not be called a reassignment anywhere the user can
     * read it.
     */
    public function test_the_ui_distinguishes_assign_from_reassign(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        // Assign wording for a first assignment, Reassign only for a replacement.
        $this->assertStringContainsString('Assign Planning Officer', $component);
        $this->assertStringContainsString('title={current ? "Reassign Application Ownership" : "Assign Planning Officer"}', $component);
        $this->assertStringContainsString('confirmLabel={current ? "Confirm Transfer" : "Assign Planning Officer"}', $component);

        // The reason field is hidden on a first assignment.
        $this->assertStringContainsString('{!isInitial && (', $component);
        $this->assertStringContainsString('isInitial={!current}', $component);
    }

    /**
     * A first assignment must send NO reason parameter. Sending an empty string
     * instead of null would be rejected by the closed vocabulary, and sending a
     * real reason would be a false record.
     */
    public function test_a_first_assignment_submits_no_reason_parameter(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('reason: current ? reason : null,', $component);
        $this->assertStringContainsString('reason: isInitial ? null : reason,', $component);
    }

    /**
     * The history line must not render a bare "Reason:" label with nothing after
     * it. A first assignment correctly has no reason, and a dangling label reads
     * as a missing value rather than as the honest answer it is. This was found
     * by reading a real history entry in the browser, not by reading the JSX.
     */
    public function test_a_reasonless_history_line_does_not_dangle_the_label(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('{entry.reason ? (', $component);
        $this->assertStringContainsString('First assignment', $component);

        // The label is legitimate INSIDE the guard, so the rule is about position,
        // not mere presence: there must be exactly one label, and it must come
        // after the guard opens. An unguarded label renders as "Reason:" followed
        // by nothing, which reads as a missing value rather than as the honest
        // answer it is.
        $guardAt = strpos($component, '{entry.reason ? (');
        $labelCount = substr_count($component, 'Reason: {entry.reason}');

        $this->assertSame(1, $labelCount, 'There must be exactly one reason label in the history line.');
        $this->assertNotFalse(
            strpos($component, 'Reason: {entry.reason}') > $guardAt,
            'The reason label must be rendered only inside the reason guard.'
        );
        $this->assertStringContainsString(
            ") : (",
            substr($component, (int) $guardAt, 400),
            'The reason guard must have an explicit fallback branch.'
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // AUTHORITY BOUNDARY (unchanged, and re-verified)
    // ══════════════════════════════════════════════════════════════════════

    public function test_the_authority_split_is_unchanged(): void
    {
        $poRoute = Route::getRoutes()->match(
            Request::create('/applications/reassign-planning-officer', 'POST')
        );
        $siRoute = Route::getRoutes()->match(
            Request::create('/site-inspections/reassign-inspector', 'POST')
        );

        $poMiddleware = implode('|', array_merge($poRoute->gatherMiddleware(), $poRoute->middleware()));
        $siMiddleware = implode('|', array_merge($siRoute->gatherMiddleware(), $siRoute->middleware()));

        $this->assertStringContainsString('role:Admin', $poMiddleware);
        $this->assertStringContainsString('role:Planning Officer', $siMiddleware);
        $this->assertStringNotContainsString('role:Planning Officer', $poMiddleware);
        $this->assertStringNotContainsString('role:Admin', $siMiddleware);
    }

    /**
     * Initializing ownership must not have turned the creation path into a
     * cross-role path. Application creation stays Planning-Officer-only.
     */
    public function test_application_creation_stays_planning_officer_only(): void
    {
        $route = Route::getRoutes()->match(Request::create('/applications/encode', 'POST'));

        $this->assertSame('applications.store', $route->getName());
        $this->assertStringContainsString(
            'role:Planning Officer',
            implode('|', array_merge($route->gatherMiddleware(), $route->middleware()))
        );
    }

    // ── documentation ────────────────────────────────────────────────────

    public function test_the_initialization_rule_is_documented(): void
    {
        $architecture = $this->source('docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md');
        $schema = $this->source('docs/CANONICAL_DATABASE_SCHEMA.md');
        $changelog = $this->source('docs/FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md');

        $this->assertStringContainsStringIgnoringCase('initial assignment', $architecture);
        $this->assertStringContainsStringIgnoringCase('not a reassignment', $architecture);
        $this->assertStringContainsString('canReceiveInitialOwnership', $architecture);
        $this->assertStringContainsString('NOT backfilled', $schema);
        $this->assertStringContainsString('canReceiveInitialOwnership', $changelog);
    }
}
