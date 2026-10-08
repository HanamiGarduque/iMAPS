<?php

namespace Tests\Unit;

use App\Support\InspectorTransferGuard;
use App\Support\ReassignmentReasons;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Phase 1 work-reassignment contracts.
 *
 * The business rule under test: work is handed to another employee, and the
 * receiving employee always works on their OWN account. Nobody signs in as
 * somebody else, and no role silently inherits another's authority.
 *
 * THREE KINDS OF ASSERTION, and the distinction matters:
 *
 *  1. PURE LOGIC for the mid-flight safety rule. The rule lives in
 *     InspectorTransferGuard, which is an array in / decision out function, so
 *     the single most dangerous behaviour in this feature — refusing to move a
 *     round that has already been started in the field — is provable with no
 *     database, no network and no Supabase credentials.
 *
 *  2. RUNTIME ROUTE contracts. Route::getRoutes()->match() performs the same
 *     resolution the HTTP kernel does, so who is allowed to reassign what is
 *     asserted against the real registered route table.
 *
 *  3. SOURCE contracts for React rendering and for the paths that used to
 *     overwrite an owner silently. There is no JavaScript test runner in this
 *     project, so those guarantees are asserted against comment-stripped source
 *     and backed by `npm run build`.
 *
 * Source assertions run against COMMENT-STRIPPED source on purpose. This change
 * deliberately documents the old behaviour in comments (for example the exact
 * `$latestInspection->fill(...)` call that was removed), and a naive substring
 * check would match that explanation and fail a correct implementation.
 */
class WorkReassignmentContractTest extends TestCase
{
    private function source(string $relativePath): string
    {
        $path = base_path($relativePath);
        $this->assertFileExists($path, "Expected source file {$relativePath} to exist.");

        return (string) file_get_contents($path);
    }

    /**
     * Strip whole-line comments. Block comments go first; inline comments are
     * left alone because stripping "//" naively would corrupt URLs in strings.
     */
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
    // MID-FLIGHT SAFETY: the rule that must never be wrong
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The one state a reassignment is allowed in: the round exists, FieldSync
     * still reports it as unstarted, and there is no evidence of any kind.
     */
    public function test_an_untouched_assigned_job_may_be_reassigned(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'assigned',
            'remote_readable'           => true,
            'remote_status'             => 'assigned',
            'gps_confirmed_at'          => null,
            'checklist_completed_count' => 0,
            'photo_count'               => 0,
        ]);

        $this->assertTrue($decision['allowed']);
        $this->assertNull($decision['reason']);
        $this->assertSame([], $decision['blockers']);
    }

    /**
     * A round in progress in the field is refused — even though LOCAL state still
     * says "assigned", because local status has no in-progress value. This is the
     * exact live condition that makes local state untrustworthy here.
     */
    public function test_remote_in_progress_is_blocked_even_though_local_says_assigned(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'assigned',
            'remote_readable'           => true,
            'remote_status'             => 'in_progress',
            'gps_confirmed_at'          => null,
            'checklist_completed_count' => 0,
            'photo_count'               => 0,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertContains('remote_in_progress', $decision['blockers']);
        $this->assertSame(InspectorTransferGuard::BLOCKED_MESSAGE, $decision['reason']);
    }

    public function test_a_confirmed_gps_position_blocks_reassignment(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'assigned',
            'remote_readable'           => true,
            'remote_status'             => 'assigned',
            'gps_confirmed_at'          => '2026-09-27 08:15:00+00',
            'checklist_completed_count' => 0,
            'photo_count'               => 0,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertContains('gps_confirmed', $decision['blockers']);
    }

    public function test_any_checklist_progress_blocks_reassignment(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'assigned',
            'remote_readable'           => true,
            'remote_status'             => 'assigned',
            'gps_confirmed_at'          => null,
            'checklist_completed_count' => 1,
            'photo_count'               => 0,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertContains('checklist_progress', $decision['blockers']);
    }

    public function test_any_photo_blocks_reassignment(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'assigned',
            'remote_readable'           => true,
            'remote_status'             => 'assigned',
            'gps_confirmed_at'          => null,
            'checklist_completed_count' => 0,
            'photo_count'               => 1,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertContains('photos_present', $decision['blockers']);
    }

    public function test_a_completed_round_is_blocked_with_its_own_message(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'              => 'completed',
            'remote_readable'           => true,
            'remote_status'             => 'completed',
            'gps_confirmed_at'          => '2026-09-27 08:15:00+00',
            'checklist_completed_count' => 5,
            'photo_count'               => 3,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertSame(InspectorTransferGuard::COMPLETED_MESSAGE, $decision['reason']);
    }

    /**
     * Fail CLOSED. If FieldSync cannot be consulted, the round is not proven
     * unstarted, and "cannot prove" must never be read as "allowed".
     */
    public function test_an_unreadable_remote_job_blocks_rather_than_allows(): void
    {
        $decision = InspectorTransferGuard::evaluate([
            'local_status'    => 'assigned',
            'remote_readable' => false,
        ]);

        $this->assertFalse($decision['allowed']);
        $this->assertContains('remote_unreadable', $decision['blockers']);
        $this->assertSame(InspectorTransferGuard::UNVERIFIABLE_MESSAGE, $decision['reason']);
    }

    /**
     * FieldSync has used several spellings of the same lifecycle state over its
     * history. They must fold together, or an old row would read as "unknown"
     * and be treated as a different state from the one it actually is.
     */
    public function test_lifecycle_spellings_are_folded_before_comparison(): void
    {
        foreach (['in_progress', 'in-progress', 'in progress', 'IN_PROGRESS'] as $spelling) {
            $decision = InspectorTransferGuard::evaluate([
                'local_status'    => 'assigned',
                'remote_readable' => true,
                'remote_status'   => $spelling,
            ]);

            $this->assertFalse($decision['allowed'], "Expected '{$spelling}' to be treated as in progress.");
        }

        // A cancelled job is not an untouched assigned job either.
        $cancelled = InspectorTransferGuard::evaluate([
            'local_status'    => 'assigned',
            'remote_readable' => true,
            'remote_status'   => 'cancelled',
        ]);

        $this->assertFalse($cancelled['allowed']);
    }

    /**
     * The blocked message is shown to a Planning Officer, so it must be plain
     * language with no schema or transport vocabulary in it.
     */
    public function test_the_blocked_message_is_plain_language(): void
    {
        foreach ([
            InspectorTransferGuard::BLOCKED_MESSAGE,
            InspectorTransferGuard::UNVERIFIABLE_MESSAGE,
            InspectorTransferGuard::COMPLETED_MESSAGE,
        ] as $message) {
            $this->assertStringNotContainsStringIgnoringCase('field_jobs', $message);
            $this->assertStringNotContainsStringIgnoringCase('supabase', $message);
            $this->assertStringNotContainsStringIgnoringCase('rls', $message);
            $this->assertStringNotContainsStringIgnoringCase('null', $message);
            $this->assertStringNotContainsStringIgnoringCase('column', $message);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // REASON VOCABULARY
    // ══════════════════════════════════════════════════════════════════════

    public function test_the_reason_vocabulary_is_closed_and_ordered(): void
    {
        $this->assertSame(
            ['Absent', 'On Leave', 'Workload Transfer', 'Unavailable', 'Other'],
            ReassignmentReasons::all(),
        );

        $this->assertTrue(ReassignmentReasons::isValid('On Leave'));
        $this->assertFalse(ReassignmentReasons::isValid('on leave'));
        $this->assertFalse(ReassignmentReasons::isValid(''));
        $this->assertFalse(ReassignmentReasons::isValid('Because'));
    }

    public function test_only_other_requires_a_note(): void
    {
        $this->assertTrue(ReassignmentReasons::noteIsRequired(ReassignmentReasons::OTHER));

        foreach ([ReassignmentReasons::ABSENT, ReassignmentReasons::ON_LEAVE, ReassignmentReasons::WORKLOAD_TRANSFER, ReassignmentReasons::UNAVAILABLE] as $reason) {
            $this->assertFalse(ReassignmentReasons::noteIsRequired($reason));
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // AUTHORITY BOUNDARY: runtime route resolution
    // ══════════════════════════════════════════════════════════════════════

    public function test_application_ownership_reassignment_is_an_admin_route(): void
    {
        $route = Route::getRoutes()->match(
            Request::create('/applications/reassign-planning-officer', 'POST')
        );

        $this->assertSame('applications.reassign-planning-officer', $route->getName());
        $this->assertStringContainsString('role:Admin', $this->middlewareFor($route));
    }

    /**
     * Inspector reassignment is Planning-Officer-initiated. Admin does NOT do
     * this in Phase 1, so the Admin role must not be on the route.
     */
    public function test_inspector_reassignment_is_a_planning_officer_route_and_not_admin(): void
    {
        $route = Route::getRoutes()->match(
            Request::create('/site-inspections/reassign-inspector', 'POST')
        );

        $this->assertSame('site-inspections.reassign-inspector', $route->getName());

        $middleware = $this->middlewareFor($route);
        $this->assertStringContainsString('role:Planning Officer', $middleware);
        $this->assertStringNotContainsString('role:Admin', $middleware);
    }

    /**
     * The two responsibilities must not be reachable through each other's route.
     * A Planning Officer cannot reassign application ownership, and an Admin
     * cannot reassign an inspector. This is the whole point of keeping them
     * separate, so it is asserted against real resolution.
     */
    public function test_neither_role_can_reach_the_other_roles_reassignment_route(): void
    {
        $poRoute = Route::getRoutes()->match(
            Request::create('/applications/reassign-planning-officer', 'POST')
        );
        $siRoute = Route::getRoutes()->match(
            Request::create('/site-inspections/reassign-inspector', 'POST')
        );

        $this->assertStringNotContainsString('role:Planning Officer', $this->middlewareFor($poRoute));
        $this->assertStringNotContainsString('role:Admin', $this->middlewareFor($siRoute));
    }

    public function test_the_reassignment_controller_asserts_roles_defensively(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');

        // Redundant with the middleware on purpose: a future route edit cannot
        // silently widen who may reassign.
        $this->assertStringContainsString("\$this->assertRole('Admin'", $controller);
        $this->assertStringContainsString("\$this->assertRole('Planning Officer'", $controller);
        $this->assertStringContainsString('abort(403', $controller);
    }

    /**
     * No impersonation, "act as", or login-substitution path may exist anywhere
     * in the feature. This is the rule the whole feature exists to protect.
     */
    public function test_there_is_no_impersonation_or_account_substitution_path(): void
    {
        $paths = [
            'app/Http/Controllers/WorkReassignmentController.php',
            'app/Services/WorkAssignmentService.php',
            'app/Support/InspectorTransferGuard.php',
            'resources/js/Components/WorkAssignment.jsx',
        ];

        foreach ($paths as $path) {
            $code = strtolower($this->codeOf($path));

            foreach (['impersonat', 'login_as', 'log_in_as', 'act_as', 'act as ', 'on behalf of the absent'] as $forbidden) {
                $this->assertStringNotContainsString(
                    $forbidden,
                    $code,
                    "{$path} must not contain an account-substitution concept ('{$forbidden}')."
                );
            }
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // CURRENT OWNERSHIP IS A NEW, SEPARATE FACT
    // ══════════════════════════════════════════════════════════════════════

    /**
     * `assigned_planning_officer_id` is current ownership. `encoded_by` is who
     * typed the application up and `reviewed_by` is who decided in a round.
     * Reusing either as ownership would silently rewrite a fact that is already
     * displayed and already used for reporting.
     */
    public function test_current_po_ownership_is_a_distinct_column_from_encoder_and_reviewer(): void
    {
        $model = $this->codeOf('app/Models/ZoningApplication.php');

        $this->assertStringContainsString('assignedPlanningOfficer', $model);
        $this->assertStringContainsString("belongsTo(User::class, 'assigned_planning_officer_id')", $model);
        $this->assertStringContainsString("belongsTo(User::class, 'encoded_by')", $model);

        // The pointer is only ever written by the guarded service.
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');
        $this->assertStringContainsString('$application->assigned_planning_officer_id = $target->id;', $service);
    }

    /**
     * No historical backfill. The current workflow has no step that assigns an
     * application to an officer, so inventing ownership for old rows would put a
     * false accountability fact into the record.
     */
    public function test_no_speculative_historical_backfill_is_performed(): void
    {
        $migration = $this->codeOf('database/migrations/2026_09_27_010000_add_work_reassignment_contract.php');

        $this->assertStringNotContainsString('DB::table(\'zoning_applications\')->update', $migration);
        $this->assertStringNotContainsString('->update([', $migration);

        // The column must be nullable so pre-existing rows are honestly unowned.
        $this->assertStringContainsString('assigned_planning_officer_id', $migration);
        $this->assertStringContainsString('nullable()', $migration);
    }

    // ══════════════════════════════════════════════════════════════════════
    // HISTORY IS APPEND-ONLY AND EXACT
    // ══════════════════════════════════════════════════════════════════════

    /**
     * History must identify the EXACT target with a real foreign key. A
     * polymorphic (type, id) pair could never be constrained, so the exact round
     * or application could not be guaranteed — which the contract requires.
     */
    public function test_history_tables_carry_real_foreign_keys_to_the_exact_target(): void
    {
        $migration = $this->codeOf('database/migrations/2026_09_27_010000_add_work_reassignment_contract.php');

        $this->assertStringContainsString("references('id')", $migration);
        $this->assertStringContainsString("'site_inspection_id'", $migration);
        $this->assertStringContainsString("'zoning_application_id'", $migration);
        $this->assertStringContainsString('site_insp_assignments_inspection_foreign', $migration);
        $this->assertStringContainsString('app_po_assignments_application_foreign', $migration);

        // A generic polymorphic target must not be used.
        $this->assertStringNotContainsString('target_type', $migration);
        $this->assertStringNotContainsString('target_id', $migration);
    }

    /**
     * Every history row records who, from whom, to whom, why, which actor and
     * when. A handover without all six is not an auditable handover.
     */
    public function test_history_rows_capture_actor_reason_and_timestamp(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        foreach ([
            "'from_planning_officer_id' => \$fromId",
            "'to_planning_officer_id'   => \$target->id",
            "'from_inspector_id'  => \$fromId",
            "'to_inspector_id'    => \$target->id",
            "'reassigned_by'",
            "'reassigned_at'",
            "'reason'",
            "'reason_note'",
        ] as $fragment) {
            $this->assertStringContainsString($fragment, $service, "Missing history fragment: {$fragment}");
        }
    }

    /**
     * Both reassignment types must reach the system-wide audit log, so an
     * auditor looking at the activity log — not just the application — sees them.
     */
    public function test_both_reassignment_types_write_an_audit_trail_event(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString("'PLANNING_OFFICER_REASSIGNED'", $service);
        $this->assertStringContainsString("'SITE_INSPECTOR_REASSIGNED'", $service);
        $this->assertStringContainsString("DB::table('audit_trail')->insert", $service);
    }

    /**
     * The audit row must be written inside the same transaction as the change, so
     * a handover can never commit without its accountability record. The generic
     * AuditLogger swallows write failures, which is right for general logging and
     * wrong here, so this path must not use it.
     */
    public function test_the_audit_write_is_atomic_rather_than_best_effort(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString('DB::transaction', $service);
        $this->assertStringNotContainsString('AuditLogger::log', $service);
    }

    // ══════════════════════════════════════════════════════════════════════
    // NOTHING ELSE MOVES
    // ══════════════════════════════════════════════════════════════════════

    /**
     * A handover is a continuity action, not a business decision. The application
     * status, the encoder and the technical review history must be untouched.
     */
    public function test_a_reassignment_does_not_change_status_encoder_or_review_history(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringNotContainsString('$application->status', $service);
        $this->assertStringNotContainsString('TechnicalReview::', $service);

        // Assert that encoded_by is not WRITTEN, not merely unmentioned. The
        // service names it in an audit note to record that it was left alone,
        // which is the honest thing to do and must not be mistaken for a write.
        $this->assertStringNotContainsString('encoded_by=', $service);
        $this->assertStringNotContainsString("'encoded_by' =>", $service);
        $this->assertStringNotContainsString('$application->encoded_by', $service);

        // There are two legitimate write paths in the service — an Admin or PO
        // transfer, and the creation-time initialisation — so a bare save count
        // would be brittle. What matters is the SHAPE: every application write
        // must be the ownership pointer and nothing else.
        $saves = substr_count($service, '$application->save();');

        $this->assertSame(
            $saves,
            preg_match_all('/\$application->assigned_planning_officer_id = [^;]+;\s*\$application->save\(\);/', $service),
            'Every application write must be the ownership pointer immediately before the save.'
        );
        $this->assertGreaterThan(0, $saves, 'The service must write the ownership pointer at all.');

        $this->assertStringNotContainsString('$application->fill(', $service);
        $this->assertStringNotContainsString('$application->forceFill(', $service);
    }

    /**
     * Reassigning an inspector must not reset the lifecycle or touch evidence.
     * Forcing a reset is precisely the silent overwrite this feature removes.
     *
     * These assert on WRITES (`'key' =>`) rather than on bare substrings. The
     * service deliberately names `submitted_at` and `findings` in an inline
     * comment to explain that they are left alone, and a bare substring check
     * would match that explanation instead of the behaviour under test.
     */
    public function test_inspector_reassignment_never_resets_status_or_evidence(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        foreach ([
            'status',
            'submitted_at',
            'findings',
            'checklist_data',
            'confirmed_latitude',
            'confirmed_longitude',
            'gps_confirmed_at',
            'photo_paths',
        ] as $column) {
            $this->assertStringNotContainsString(
                "'{$column}' =>",
                $service,
                "Reassigning an inspector must not write site_inspections.{$column}."
            );
        }

        // Nor via a spread payload that could carry any of them in.
        $this->assertStringNotContainsString(
            '->fill([...',
            $service,
            'Reassigning an inspector must not spread an assignment payload over the round.'
        );

        // The one and only inspection write is the owner pointer.
        $this->assertStringContainsString('$inspection->inspector_id = $target->id;', $service);
        $this->assertSame(
            1,
            substr_count($service, '$inspection->save()'),
            'The inspection row must be saved exactly once, for the inspector pointer.'
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // THE SILENT OVERWRITE IS GONE
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The old in-place path did exactly this: it overwrote inspector_id with no
     * history, forced status back to "assigned" even if work had begun, and kept
     * any submitted_at/findings already on the row. It must not come back.
     */
    public function test_the_silent_in_place_inspector_overwrite_is_removed(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringNotContainsString("\$latestInspection->fill([...\$assignmentData", $controller);
        $this->assertStringNotContainsString("\$latestInspection->fill([... \$assignmentData", $controller);

        // A different inspector on an open round is now refused, not absorbed.
        $this->assertStringContainsString('already assigned to another Site Inspector', $controller);
    }

    /**
     * A completed round must keep its existing refusal.
     */
    public function test_a_completed_round_still_cannot_be_reassigned(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringContainsString(
            'A completed inspection cannot be reassigned',
            $controller
        );
    }

    /**
     * A second open round for the same application and parcel would produce a
     * duplicate field job, because the remote job is keyed one-per-round. An
     * existing open round must be routed to the reassignment path instead.
     */
    public function test_a_duplicate_open_round_cannot_be_created_for_one_parcel(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringContainsString('already has an open inspection round', $controller);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ACTIVE-ACCOUNT ENFORCEMENT
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Every inspector picker and every inspector validation rule must go through
     * the one scope that enforces role + active + FieldSync account. A suspended
     * inspector must not be offered anywhere, and must not be accepted anywhere.
     */
    public function test_all_inspector_pickers_and_rules_enforce_the_active_account(): void
    {
        $model = $this->codeOf('app/Models/User.php');

        $this->assertStringContainsString('scopeActiveSiteInspectors', $model);
        $this->assertStringContainsString("->where('is_active', true)", $model);
        $this->assertStringContainsString("->whereNotNull('handshake_key')", $model);

        foreach ([
            'app/Http/Controllers/TechnicalReviewController.php',
            'app/Http/Controllers/ApplicationController.php',
        ] as $path) {
            $code = $this->codeOf($path);

            // No ad-hoc picker may bypass the shared scope.
            $this->assertStringNotContainsString(
                "User::where('role', 'Site Inspector')",
                $code,
                "{$path} must use the active-inspector scope instead of a raw role query."
            );

            // And no hand-rolled rule may skip the active check either.
            $this->assertStringNotContainsString(
                "Rule::exists('users', 'id')",
                $code,
                "{$path} must use User::activeSiteInspectorRule() so the picker and the rule cannot disagree."
            );
        }
    }

    /**
     * The old message claimed an inspector must have an "active FieldSync
     * account" while only role and handshake were enforced. Now that the active
     * check is real, the message must state exactly what is enforced.
     */
    public function test_the_validation_message_states_only_what_is_enforced(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/TechnicalReviewController.php');

        $this->assertStringNotContainsString(
            'must be a Site Inspector with an active FieldSync account',
            $controller,
            'The message must not claim more than the validation enforces.'
        );

        $this->assertStringContainsString(
            'must be an active Site Inspector with a FieldSync account',
            $controller
        );
    }

    // ══════════════════════════════════════════════════════════════════════
    // RECEIVER ELIGIBILITY
    // ══════════════════════════════════════════════════════════════════════

    public function test_a_suspended_or_wrong_role_receiver_is_refused(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        // Planning Officer receiver: role then active.
        $this->assertStringContainsString('must be a Planning Officer', $service);
        // Site Inspector receiver: role, active, and a FieldSync account.
        $this->assertStringContainsString('must be a Site Inspector', $service);
        $this->assertStringContainsString('account is suspended and cannot receive work', $service);
        $this->assertStringContainsString('has no FieldSync account', $service);
    }

    /**
     * A receiver must never be the person who already owns the work, or the
     * accountability record would gain a fabricated handover that changed nothing.
     */
    public function test_a_no_op_transfer_is_refused(): void
    {
        $service = $this->codeOf('app/Services/WorkAssignmentService.php');

        $this->assertStringContainsString('already owns this application', $service);
        $this->assertStringContainsString('already holds this inspection round', $service);
    }

    /**
     * The round being reassigned must belong to the application in the request,
     * so a Planning Officer cannot name an arbitrary round id.
     */
    public function test_the_round_must_belong_to_the_application_in_the_request(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');

        $this->assertStringContainsString('does not belong to this application', $controller);
    }

    // ══════════════════════════════════════════════════════════════════════
    // THE REMOTE GUARD IS ACTUALLY WIRED
    // ══════════════════════════════════════════════════════════════════════

    /**
     * The guard must be fed the REMOTE FieldSync state, not the local column.
     */
    public function test_the_guard_reads_the_remote_fieldsync_job(): void
    {
        $service = $this->codeOf('app/Services/SupabaseService.php');
        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');

        $this->assertStringContainsString('function fieldJobTransferStates', $service);
        $this->assertStringContainsString('gps_confirmed_at', $service);
        $this->assertStringContainsString('checklist_completed_count', $service);
        $this->assertStringContainsString('photo_count', $service);

        $this->assertStringContainsString('fieldJobTransferStates', $controller);
    }

    /**
     * A failed remote read must return nothing, so the caller treats it as
     * unproven rather than as an untouched round.
     */
    public function test_a_failed_remote_read_yields_no_state(): void
    {
        $service = $this->codeOf('app/Services/SupabaseService.php');

        $this->assertMatchesRegularExpression(
            '/if \(\$response->failed\(\)\) \{.*?return \[\];/s',
            $service,
            'A failed FieldSync read must return an empty state, never a permissive default.'
        );
    }

    /**
     * Reassignment reuses the existing bridge, which upserts one field job per
     * inspection round. That is what makes the handover move the SAME job instead
     * of creating a second one.
     */
    public function test_the_handover_reuses_the_existing_single_job_per_round_bridge(): void
    {
        $controller = $this->codeOf('app/Http/Controllers/WorkReassignmentController.php');
        $job = $this->codeOf('app/Jobs/PushInspectionToSupabase.php');

        $this->assertStringContainsString('PushInspectionToSupabase::dispatch', $controller);

        // Keyed on THIS environment's round, so a re-push converges on one job
        // row. The namespace is what makes "the same job" mean this
        // environment's job rather than another environment's row that shares
        // the local id.
        $this->assertStringContainsString('on_conflict=bridge_source_id,local_inspection_id', $job);
        $this->assertStringContainsString('assigned_inspector_id', $job);
    }

    /**
     * Phase 1 does not implement mid-flight transfer or recovery, and must not
     * invent one. Nothing may clear remote progress to force a handover through.
     */
    public function test_no_forced_reset_of_remote_progress_exists(): void
    {
        foreach ([
            'app/Http/Controllers/WorkReassignmentController.php',
            'app/Services/WorkAssignmentService.php',
        ] as $path) {
            $code = $this->codeOf($path);

            $this->assertStringNotContainsString("->update(['status'", $code);
            $this->assertStringNotContainsString("'checklist_data' => []", $code);
            $this->assertStringNotContainsString("'photo_paths' => []", $code);
            $this->assertStringNotContainsString("'gps_confirmed_at' => null", $code);
        }
    }

    // ══════════════════════════════════════════════════════════════════════
    // UI PLACEMENT
    // ══════════════════════════════════════════════════════════════════════

    /**
     * Application ownership belongs on the application, not in User Management
     * and not inside Technical Review decision controls.
     */
    public function test_the_po_assignment_ui_sits_on_the_application_detail(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString('PlanningOfficerAssignment', $page);
        $this->assertStringContainsString('Assigned Planning Officer', $this->codeOf('resources/js/Components/WorkAssignment.jsx'));

        // It must not be routed through the PO-only Technical Review endpoints.
        $this->assertStringNotContainsString('technical-review/assign-inspector', $page);
    }

    /**
     * Inspector ownership belongs with the ROUND, not with application ownership
     * and not in User Management.
     */
    public function test_the_inspector_assignment_ui_sits_with_the_round(): void
    {
        $page = $this->codeOf('resources/js/Pages/Applications/Show.jsx');

        $this->assertStringContainsString('InspectorRoundAssignment', $page);
        $this->assertStringContainsString('/site-inspections/reassign-inspector', $this->codeOf('resources/js/Components/WorkAssignment.jsx'));
    }

    /**
     * Current assignment stays prominent; history is secondary and collapsed.
     */
    public function test_current_assignment_is_prominent_and_history_is_secondary(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('Assigned Planning Officer', $component);
        $this->assertStringContainsString('Assigned Inspector', $component);
        $this->assertStringContainsString('useState(false)', $component);
        $this->assertStringContainsString('Assignment History', $component);
        $this->assertStringContainsString('Inspector History', $component);
    }

    /**
     * An ineligible round must be visibly disabled AND explained, not silently
     * missing — a Planning Officer has to know why the action is unavailable.
     */
    public function test_an_ineligible_round_is_disabled_with_a_plain_explanation(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('disabled', $component);
        $this->assertStringContainsString('blocked_reason', $component);
    }

    /**
     * The form must ask for a reason, and must require a note when the reason is
     * "Other", or the record would carry an unexplained handover.
     */
    public function test_the_form_requires_a_reason_and_a_note_for_other(): void
    {
        $component = $this->codeOf('resources/js/Components/WorkAssignment.jsx');

        $this->assertStringContainsString('const noteRequired = reason === "Other";', $component);
        $this->assertStringContainsString('(!noteRequired || note.trim())', $component);
    }

    // ══════════════════════════════════════════════════════════════════════
    // DOCUMENTATION
    // ══════════════════════════════════════════════════════════════════════

    public function test_the_documentation_records_the_implemented_contract(): void
    {
        $architecture = $this->source('docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md');
        $schema = $this->source('docs/CANONICAL_DATABASE_SCHEMA.md');
        $changelog = $this->source('docs/FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md');

        // The plain-language business rule.
        foreach (['never share accounts', 'own account'] as $phrase) {
            $this->assertStringContainsStringIgnoringCase($phrase, $architecture);
        }

        // Phase 1 authority split.
        $this->assertStringContainsString('Admin reassigns application ownership', $architecture);
        $this->assertStringContainsString('PO reassigns inspector ownership', $architecture);
        $this->assertStringContainsString('mid-flight', strtolower($architecture));

        // The schema and the forward SQL are both recorded.
        $this->assertStringContainsString('assigned_planning_officer_id', $schema);
        $this->assertStringContainsString('application_po_assignments', $schema);
        $this->assertStringContainsString('site_inspection_assignments', $schema);

        $this->assertStringContainsString('assigned_planning_officer_id', $changelog);
        $this->assertStringContainsString('application_po_assignments', $changelog);
        $this->assertStringContainsString('site_inspection_assignments', $changelog);
    }

    // ── helpers ────────────────────────────────────────────────────────────

    /**
     * @return string the route's middleware, including aliased groups
     */
    private function middlewareFor(\Illuminate\Routing\Route $route): string
    {
        return implode('|', array_merge(
            $route->gatherMiddleware(),
            $route->middleware()
        ));
    }
}
