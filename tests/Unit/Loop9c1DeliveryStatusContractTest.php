<?php

namespace Tests\Unit;

use App\Http\Controllers\InspectionDeliveryController;
use App\Models\InspectionDeliveryAttempt;
use App\Support\InspectionDeliveryStatus;
use Tests\TestCase;

/**
 * Loop 9C-1 delivery status READ contract.
 *
 * 9C-1 exposes canonical Loop 9 delivery state per inspection round to the same
 * Admin / Planning Officer viewers that Application Detail already admits. It is
 * a READ CONTRACT ONLY: no dispatch, no write, no audit row, no UI, no retry.
 *
 * WHAT IS PROVEN HERE
 * -------------------
 * The presentation layer is a pure presenter, so the entire safety-critical
 * surface - NULL neutrality, the three real states, all seven failure
 * categories, defensive handling of an unknown value, and retry authority - is
 * verified exhaustively and deterministically, with no database.
 *
 * The controller's structural guarantees are pinned by source contract: it is
 * inert, it loads EVERY round rather than the `latestOfMany()` singular
 * relation, it orders deterministically, it uses one aggregate COUNT instead of
 * a per-round N+1, and it exposes no correlation or diagnostic material.
 *
 * Behavioural proof against real PostgreSQL is carried separately by
 * rollback-only probes.
 */
class Loop9c1DeliveryStatusContractTest extends TestCase
{
    private function controllerSource(): string
    {
        return (string) file_get_contents(base_path('app/Http/Controllers/InspectionDeliveryController.php'));
    }

    private function presenterSource(): string
    {
        return (string) file_get_contents(base_path('app/Support/InspectionDeliveryStatus.php'));
    }

    /** Strip comments, then collapse whitespace, so assertions match CODE only. */
    private function code(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*(\/\/|\*).*$/m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ══════════════════════════════════════════════════════════════
    // §8 / §22  NULL SEMANTICS - THE CRITICAL ONE
    // ══════════════════════════════════════════════════════════════

    public function test_null_maps_to_the_delivery_history_unavailable_state(): void
    {
        $this->assertSame(InspectionDeliveryStatus::STATE_NO_RECORD, InspectionDeliveryStatus::state(null));
        // ISSUE C: "No Delivery Record" was retired. A missing row is an absence
        // of history, and reading it as certainty about the delivery itself is
        // what misinformed Planning Officers.
        $this->assertSame('Delivery History Unavailable', InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_NO_RECORD));
    }

    public function test_null_is_never_rendered_as_a_problem(): void
    {
        $label = InspectionDeliveryStatus::label(InspectionDeliveryStatus::state(null));
        $message = InspectionDeliveryStatus::message(InspectionDeliveryStatus::state(null));

        // Every wording a Planning Officer could misread as a defect.
        foreach (['fail', 'error', 'problem', 'missing', 'not delivered', 'undelivered', 'lost', 'lost delivery'] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase(
                $forbidden,
                $label,
                "NULL label must not read as a defect; found '{$forbidden}'."
            );
            $this->assertStringNotContainsStringIgnoringCase(
                $forbidden,
                $message,
                "NULL message must not read as a defect; found '{$forbidden}'."
            );
        }

        // Nor may it read as "waiting", which is a real business state we do
        // not have: pending is its own explicit label.
        $this->assertStringNotContainsStringIgnoringCase('pending', $message);
        $this->assertStringNotContainsStringIgnoringCase('waiting', $message);
    }

    public function test_null_is_neutral_for_both_historical_populations(): void
    {
        // Two very different populations share NULL: pre-bridge rounds, and
        // genuinely delivered FieldSync jobs with no fabricated local history.
        // The reader must present them identically and must NOT reach for
        // Supabase to tell them apart - that is not a delivery state.
        $controller = $this->code($this->controllerSource());

        foreach (['SupabaseService', 'Http::', 'getInspectionWithSignedPhotos', 'on_conflict', 'rest/v1'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $controller,
                "The delivery reader must never call out to a remote service; found '{$forbidden}'."
            );
        }

        // LOOP 9C-3-1 CORRECTION. The blanket `handshake` token is no longer
        // forbidden here. The reader now SELECTs the local `handshake_key`
        // column so it can decide `can_retry` without a second query, and that
        // is a LOCAL eligibility fact, not a remote handshake lookup. What is
        // still forbidden is the REMOTE resolution, which belongs to the writer.
        $this->assertStringNotContainsString('rest/v1/profiles', $controller);
        $this->assertStringNotContainsString('resolveSupabaseUserId', $controller);

        // And the shape depends only on the stored status, nothing else.
        $this->assertSame(
            InspectionDeliveryStatus::state(null),
            InspectionDeliveryStatus::state(null),
            'NULL must be a pure function of the stored NULL status.'
        );
    }

    public function test_null_produces_no_failure_prose(): void
    {
        $this->assertNull(InspectionDeliveryStatus::failureCategory(null));
        $this->assertNull(InspectionDeliveryStatus::failureMessage(null));
        $this->assertFalse(InspectionDeliveryStatus::isFailure(null));
    }

    // ══════════════════════════════════════════════════════════════
    // §8 / §11 / §12  THE THREE REAL STATES MAP 1:1
    // ══════════════════════════════════════════════════════════════

    public function test_the_three_stored_states_map_one_to_one(): void
    {
        $this->assertSame('pending_delivery', InspectionDeliveryStatus::state('pending_delivery'));
        $this->assertSame('delivered', InspectionDeliveryStatus::state('delivered'));
        $this->assertSame('delivery_failed', InspectionDeliveryStatus::state('delivery_failed'));
    }

    public function test_no_fourth_state_is_introduced(): void
    {
        // The 9A CHECK-constrained vocabulary has exactly three values, and
        // 9C-1 adds only the neutral no-record presentation for NULL - which is
        // deliberately NOT a database state.
        $apiStates = [
            InspectionDeliveryStatus::STATE_PENDING,
            InspectionDeliveryStatus::STATE_DELIVERED,
            InspectionDeliveryStatus::STATE_FAILED,
            InspectionDeliveryStatus::STATE_NO_RECORD,
        ];

        $this->assertCount(4, $apiStates);
        $this->assertCount(4, array_unique($apiStates));

        // Exactly three of them are stored database states.
        $stored = array_values(array_diff($apiStates, [InspectionDeliveryStatus::STATE_NO_RECORD]));
        $this->assertCount(3, $stored);
    }

    public function test_pending_label_and_meaning(): void
    {
        $state = InspectionDeliveryStatus::state('pending_delivery');

        $this->assertSame('Pending Delivery', InspectionDeliveryStatus::label($state));
        $this->assertStringContainsStringIgnoringCase('awaiting', InspectionDeliveryStatus::message($state));

        // A delivery in flight is never a failure and never retryable.
        $this->assertFalse(InspectionDeliveryStatus::isFailure('pending_delivery'));
    }

    public function test_delivered_label_and_task_lifecycle_separation(): void
    {
        $state = InspectionDeliveryStatus::state('delivered');

        // ISSUE C: the business state is DELIVERED. Naming the destination inside the
        // state name duplicated the panel title and invited the reader to treat the
        // label as a delivery-system fact.
        $this->assertSame('Delivered', InspectionDeliveryStatus::label($state));
        $this->assertFalse(InspectionDeliveryStatus::isFailure('delivered'));
    }

    public function test_fieldsync_task_lifecycle_values_are_never_used_as_a_delivery_label(): void
    {
        // assigned / in_progress / completed are FieldSync task lifecycle values.
        // Delivery state must never present itself as one of them, and must
        // never infer remote field progression.
        $labels = [
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_NO_RECORD),
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_PENDING),
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_DELIVERED),
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_FAILED),
        ];

        foreach ($labels as $label) {
            foreach (['Assigned', 'In Progress', 'Completed'] as $lifecycle) {
                $this->assertNotSame(
                    $lifecycle,
                    $label,
                    "A delivery label must never impersonate the FieldSync task lifecycle '{$lifecycle}'."
                );
            }
        }
    }

    public function test_failed_label(): void
    {
        $state = InspectionDeliveryStatus::state('delivery_failed');

        $this->assertSame('Delivery Failed', InspectionDeliveryStatus::label($state));
        $this->assertTrue(InspectionDeliveryStatus::isFailure('delivery_failed'));
    }

    public function test_unexpected_stored_state_degrades_to_neutral_not_to_a_guess(): void
    {
        // A value introduced by a future migration this phase has never seen
        // must NOT be guessed at. Guessing is the one way this reader could
        // invent a delivery failure that never happened.
        foreach (['', 'retrying', 'DELIVERED', 'failed', 'unknown_state', 'delivery-failed'] as $bogus) {
            $this->assertSame(
                InspectionDeliveryStatus::STATE_NO_RECORD,
                InspectionDeliveryStatus::state($bogus),
                "Unexpected stored state '{$bogus}' must degrade to the neutral presentation."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // §13 / §26  FAILURE CATEGORY MAPPING - ALL SEVEN, NO LEAKS
    // ══════════════════════════════════════════════════════════════

    public function test_all_seven_categories_map_to_their_approved_prose(): void
    {
        $expected = [
            'inspector_mapping_unresolved' => 'The assigned inspector is not linked to a FieldSync account.',
            'supabase_unreachable'          => 'FieldSync could not be reached.',
            'authentication_failure'        => 'FieldSync rejected the iMAPS bridge credentials.',
            'remote_constraint_failure'     => 'FieldSync found a conflict with existing data.',
            'remote_validation_failure'     => 'FieldSync rejected the delivery data.',
            'configuration_failure'         => 'The iMAPS bridge configuration is incomplete.',
            'unknown'                       => 'Delivery failed for an unclassified reason.',
        ];

        $this->assertCount(7, InspectionDeliveryAttempt::failureCategories());
        $this->assertCount(7, $expected, 'The 9A/9B closed vocabulary has exactly seven categories.');

        foreach ($expected as $category => $prose) {
            $this->assertSame($category, InspectionDeliveryStatus::failureCategory($category));
            $this->assertSame($prose, InspectionDeliveryStatus::failureMessage($category), "Prose drift for '{$category}'.");
        }
    }

    public function test_unexpected_category_normalizes_to_unknown(): void
    {
        foreach (['something_new', '', 'PG_EXCEPTION', 'fatal error: stack trace'] as $bogus) {
            $this->assertSame(
                InspectionDeliveryAttempt::FAILURE_UNKNOWN,
                InspectionDeliveryStatus::failureCategory($bogus),
                "Unexpected category '{$bogus}' must normalize to unknown."
            );
            $this->assertSame(
                'Delivery failed for an unclassified reason.',
                InspectionDeliveryStatus::failureMessage($bogus),
                'An unexpected category must still resolve to authored prose.'
            );
        }
    }

    public function test_failure_prose_cannot_leak_diagnostic_material(): void
    {
        $categories = InspectionDeliveryAttempt::failureCategories();

        foreach ($categories as $category) {
            $prose = (string) InspectionDeliveryStatus::failureMessage($category);

            foreach ([
                'http://', 'https://', 'eyJ', 'Bearer', 'apikey',
                'handshake', 'token=', 'supabase.co',
                'SQLSTATE', 'SELECT ', 'INSERT ', 'PDOException',
                'C:\\', '/var/www', '.php', '.env',
                'stack trace', '#0 ', 'at Illuminate',
            ] as $forbidden) {
                $this->assertStringNotContainsStringIgnoringCase(
                    $forbidden,
                    $prose,
                    "Failure prose for '{$category}' must not contain '{$forbidden}'."
                );
            }
        }
    }

    public function test_presenter_holds_no_state_and_no_remote_dependency(): void
    {
        $presenter = $this->code($this->presenterSource());

        $this->assertStringNotContainsString('DB::', $presenter);
        $this->assertStringNotContainsString('Http::', $presenter);
        $this->assertStringNotContainsString('Supabase', $presenter);
        $this->assertStringNotContainsString('public function __construct', $presenter);
    }

    // ══════════════════════════════════════════════════════════════
    // §14  can_retry - SERVER-COMPUTED OWNERSHIP ONLY
    // ══════════════════════════════════════════════════════════════

    public function test_retry_unavailable_reason_is_offered_only_to_a_planning_officer(): void
    {
        $this->assertNull(
            InspectionDeliveryStatus::retryUnavailableReason('Admin', null, 1),
            'Admin is never offered retry, so no officer-facing reason is shown.'
        );
        $this->assertNull(
            InspectionDeliveryStatus::retryUnavailableReason('Site Inspector', 2, 25),
            'A Site Inspector is refused at the middleware and never sees this.'
        );
    }

    public function test_null_owner_explains_the_real_blocker_without_naming_a_person(): void
    {
        $reason = InspectionDeliveryStatus::retryUnavailableReason('Planning Officer', null, 2);

        $this->assertNotNull($reason);
        $this->assertStringContainsStringIgnoringCase('has not been assigned', $reason);

        // It must not suggest that any officer can just recover the delivery.
        $this->assertStringNotContainsStringIgnoringCase('contact an admin', $reason);
        $this->assertStringNotContainsStringIgnoringCase('ask another', $reason);
    }

    public function test_a_different_officer_is_told_the_rule_not_the_owners_identity(): void
    {
        $reason = InspectionDeliveryStatus::retryUnavailableReason('Planning Officer', 4, 2);

        $this->assertNotNull($reason);
        $this->assertStringContainsStringIgnoringCase('only available to the Planning Officer', $reason);

        // The response must not leak WHO owns it.
        $this->assertStringNotContainsStringIgnoringCase('jyerine', $reason);
    }

    public function test_the_current_owner_is_told_nothing_because_nothing_blocks_them(): void
    {
        $this->assertNull(
            InspectionDeliveryStatus::retryUnavailableReason('Planning Officer', 2, 2),
            'The assigned officer is the intended caller; no blocker applies.'
        );
    }

    public function test_ownership_never_uses_a_non_ownership_column(): void
    {
        $controller = $this->code($this->controllerSource());

        $this->assertStringContainsString('assigned_planning_officer_id', $controller);

        // These columns exist in the schema and MUST NOT appear in the reader.
        foreach (['encoded_by', 'reviewed_by', 'performed_by'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $controller,
                "Ownership must never be inferred from '{$forbidden}'."
            );
        }
    }

    public function test_can_retry_requires_a_recorded_failure_as_well_as_ownership(): void
    {
        $controller = $this->code($this->controllerSource());

        // can_retry is true only when BOTH the viewer owns the application AND
        // this specific round is a recorded failure.
        // LOOP 9C-3-1 CORRECTION. The 9C-1 formula was literally
        // `$isFailed && $retryActorAuthorized`, which was proven incomplete: it
        // knew nothing about a superseding round and nothing about the assigned
        // inspector, so it would have offered a control the 9C-3 POST refuses.
        // `can_retry` is now the output of the ONE shared eligibility contract,
        // and the reader must ask that contract rather than re-deriving rules.
        $this->assertStringContainsString('InspectionDeliveryRetryEligibility::canRetry(', $controller);
        $this->assertStringContainsString('InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(', $controller);
        $this->assertStringContainsString('InspectionDeliveryRetryEligibility::latestRoundIdsByParcel($rounds)', $controller);

        // It must STILL require both the ownership gate and a recorded failure:
        // the actor gate is passed in, and the state rule lives in the shared
        // evaluator, so neither can be dropped from the call.
        $this->assertStringContainsString("'delivery_status' => \$round->delivery_status", $controller);
        $this->assertStringContainsString('$viewerRole,', $controller);
        $this->assertStringContainsString('$ownerId,', $controller);
        $this->assertStringContainsString('$viewerId,', $controller);

        // And the superseded formula must be gone, not merely supplemented.
        $this->assertStringNotContainsString("'can_retry' => \$isFailed && \$retryActorAuthorized", $controller);
    }

    // ══════════════════════════════════════════════════════════════
    // §3  THE TOP-LEVEL FLAG MUST NOT BE MISLEADING
    // ══════════════════════════════════════════════════════════════

    public function test_the_application_level_retry_flag_is_named_as_an_actor_gate(): void
    {
        $controller = $this->code($this->controllerSource());

        // Proven misleading at runtime: an application owned by the viewer whose
        // rounds are all delivered / NULL / pending returned
        // `is_retry_available = true` while NO round was retryable. The name
        // promised an action that did not exist.
        $this->assertStringNotContainsString(
            'is_retry_available',
            $controller,
            'The ambiguous name must not come back.'
        );
        $this->assertStringNotContainsString(
            'retry_unavailable_reason',
            $controller,
            'The ambiguous reason name must not come back.'
        );

        $this->assertStringContainsString("'retry_actor_authorized'", $controller);
        $this->assertStringContainsString("'retry_actor_unavailable_reason'", $controller);
    }

    public function test_the_actor_gate_is_explicitly_not_an_action_flag(): void
    {
        // These assertions read the RAW source, comments included: the whole
        // point is that 9C-2, the consumer most likely to get this wrong, can
        // read the distinction from the code itself.
        $controller = $this->controllerSource();

        $this->assertStringContainsString('ACTOR GATE, NOT AN ACTION FLAG', $controller);
        $this->assertStringContainsString('AUTHORITATIVE RETRY DECISION', $controller);

        // LOOP 9C-3-1: the guidance a consumer reads now points at the
        // application-level flag by name, and states explicitly that 9C-3 did
        // NOT fold round state into it.
        $this->assertStringContainsString(
            'must gate every retry control on THIS value',
            $controller
        );
        $this->assertStringContainsString(
            'never on the application-level `retry_actor_authorized` flag',
            $controller
        );
        $this->assertStringContainsString('STILL APPLICATION-LEVEL ONLY', $controller);
    }

    public function test_the_round_level_reason_is_not_mixed_into_the_actor_reason(): void
    {
        // Prose is asserted on the RAW presenter; the leakage check runs on the
        // comment-stripped code, so documentation cannot mask a real leak.
        $this->assertStringContainsString(
            'APPLICATION-LEVEL ACTOR reason',
            $this->presenterSource()
        );

        $presenter = $this->code($this->presenterSource());

        // Isolate ONLY the actor-reason method. A whole-class scan would false-
        // positive on the legitimate `unknown` prose "Delivery failed for an
        // unclassified reason.", which is a failure explanation, not an actor
        // excuse.
        preg_match(
            '/public static function retryUnavailableReason.*?\n    \}/s',
            $this->presenterSource(),
            $m
        );
        $this->assertNotEmpty($m, 'retryUnavailableReason() could not be isolated.');

        $actorReason = $this->code($m[0]);

        // The actor reason is about role and ownership ONLY. It must never carry
        // a round-level excuse, or a UI would show "already delivered" to
        // explain why someone who is not the owner cannot act.
        foreach ([
            'already delivered', 'no delivery record',
            'pending delivery', 'delivery failed',
        ] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase(
                $forbidden,
                $actorReason,
                "The actor reason must not carry the round-level wording '{$forbidden}'."
            );
        }

        // And it must actually carry the two actor-level facts it exists for.
        $this->assertStringContainsString('has not been assigned', $actorReason);
        $this->assertStringContainsString('currently assigned to this application', $actorReason);
    }

    public function test_role_check_is_exact_and_not_prefix_matched(): void
    {
        $controller = $this->code($this->controllerSource());

        $this->assertStringContainsString("\$viewerRole !== 'Planning Officer'", $controller);
    }

    // ══════════════════════════════════════════════════════════════
    // §2  THE READER IS INERT
    // ══════════════════════════════════════════════════════════════

    public function test_the_reader_dispatches_and_writes_nothing(): void
    {
        $controller = $this->code($this->controllerSource());

        foreach ([
            'dispatch(', '::create(', '->save(', '->update(',
            'AuditLogger', 'DB::transaction', '->delete(',
            'Queue::', 'forceFill',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $controller,
                "9C-1 is read-only; '{$forbidden}' must not appear in executable code."
            );
        }
    }

    public function test_the_reader_never_writes_delivery_or_business_state(): void
    {
        $controller = $this->code($this->controllerSource());

        // `inspection_status` and `parcel_id` are legitimate READ outputs of the
        // contract. What must never appear is a WRITE: an assignment to any
        // delivery or business-state column, as opposed to reading one.
        //
        // LOOP 9C-3-1 CORRECTION. The old forbidden token was the literal
        // `'delivery_status' =>`, which cannot distinguish a write from a read:
        // the eligibility contract legitimately READS
        // `'delivery_status' => $round->delivery_status`. The guarantee is
        // expressed the way it actually holds - the reader performs no write of
        // any kind, and never sets a delivery state literal.
        foreach ([
            '->update(',
            '->save()',
            '->create(',
            '->delete()',
            'forceFill',
            'DB::table(',
            'delivery_status =',
            "'pending_delivery'",
            "'delivery_failed'",
            "'delivered'",
            'inspector_id =',
            '->status =',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $controller,
                "9C-1 must not write business or delivery state; found '{$forbidden}'."
            );
        }

        // A strict single = is a WRITE. `=== null` is a READ, and is exactly
        // what the controller must do to derive the null-owner case.
        $this->assertSame(
            0,
            preg_match('/assigned_planning_officer_id\s*=(?!=)/', $controller),
            'assigned_planning_officer_id must never be assigned.'
        );
        $this->assertStringContainsString(
            '$application->assigned_planning_officer_id === null',
            $controller,
            'Ownership must be read null-safely, never written.'
        );

        // LOOP 9C-3-1 CORRECTION. There are now THREE occurrences, and all
        // three are reads. The count is pinned rather than loosened so a
        // future WRITE of delivery state still breaks this test:
        //   1. the null-safe read the state mapping consumes
        //   2. the eligibility array KEY  ('delivery_status' => ...)
        //   3. the eligibility array VALUE ($round->delivery_status)
        $this->assertStringContainsString('$round->delivery_status', $controller);
        $this->assertSame(
            3,
            substr_count($controller, 'delivery_status'),
            'delivery_status must appear exactly three times, all as reads.'
        );
    }

    /**
     * LOOP 9C-2 CORRECTION.
     *
     * This test asserted that no retry action existed yet, which was the true
     * 9C-1 contract. Loop 9C-2 then added exactly that action, so the
     * assertion became false the moment the next phase landed.
     *
     * The RETAINED contract is the one that still matters and is still
     * enforced: the READER does not retry. A read endpoint that mutated
     * delivery state, dispatched the writer or wrote an audit row would be a
     * second business path, and no later phase may quietly give it one.
     *
     * The retry action itself, its route and its authorization boundary are
     * covered by `Loop9c2RetryActionContractTest`.
     */
    public function test_the_reader_itself_never_retries(): void
    {
        // Comments are stripped: the reader's prose legitimately NAMES the
        // retry service while explaining that the two share one eligibility
        // contract. What must be absent is the reader CALLING it.
        $status = $this->code($this->methodSource(InspectionDeliveryController::class, 'status'));

        // The read path dispatches nothing, writes nothing and creates nothing.
        $this->assertStringNotContainsString('PushInspectionToSupabase', $status);
        $this->assertStringNotContainsString('InspectionDeliveryRetryService', $status);
        $this->assertStringNotContainsString('queueRetry', $status);
        $this->assertStringNotContainsString('DB::table(', $status);
        $this->assertStringNotContainsString('forceFill', $status);
        $this->assertStringNotContainsString('->update(', $status);
        $this->assertStringNotContainsString('->save(', $status);
        $this->assertStringNotContainsString('abort(', $status);
        $this->assertStringNotContainsString('back()', $status);

        // And the reader still exposes no retry route of its own.
        $this->assertFalse(
            method_exists(InspectionDeliveryController::class, 'retryDelivery'),
            'The action is named retry(), not retryDelivery().'
        );
    }

    /**
     * The source of ONE method, by reflection line range.
     */
    private function methodSource(string $class, string $method): string
    {
        $reflection = new \ReflectionMethod($class, $method);
        $lines = file((string) $reflection->getFileName(), FILE_IGNORE_NEW_LINES) ?: [];

        return implode("\n", array_slice(
            $lines,
            $reflection->getStartLine() - 1,
            $reflection->getEndLine() - $reflection->getStartLine() + 1
        ));
    }

    // ══════════════════════════════════════════════════════════════
    // §5 / §6 / §7 / §18  ALL ROUNDS, CORRECTLY ORDERED
    // ══════════════════════════════════════════════════════════════

    public function test_every_round_is_loaded_and_the_latest_only_relation_is_avoided(): void
    {
        $controller = $this->code($this->controllerSource());

        // The hasMany loads every round.
        $this->assertStringContainsString('siteInspections()', $controller);

        // The singular latestOfMany() relation must NOT be read: it would
        // collapse an original inspection and its reinspection into one badge.
        $this->assertStringNotContainsString('latestOfMany', $controller);
        $this->assertSame(
            0,
            preg_match('/->siteInspection(?![s(])/', $controller),
            'The latestOfMany() singular relation must never be read.'
        );

        // The plural hasMany call IS the correct accessor.
        $this->assertSame(
            1,
            preg_match('/->siteInspections\(\)/', $controller),
            'Rounds must be loaded through the hasMany relation.'
        );
    }

    public function test_round_ordering_is_deterministic_and_canonical(): void
    {
        $controller = $this->code($this->controllerSource());

        // `site_inspections` stores no round number, so the primary key IS the
        // round chronology - the same one latestOfMany() already relies on.
        $this->assertStringContainsString("->orderBy('id')", $controller);

        // An explicit, single, ordered terminal read - never an unordered get.
        $this->assertSame(
            1,
            substr_count($controller, '->get()'),
            'Exactly one terminal read, so rounds cannot arrive unordered.'
        );
        $this->assertStringContainsString("->orderBy('id') ->get()", $controller);
    }

    public function test_round_index_is_derived_and_stable_identity_is_the_inspection_id(): void
    {
        // PHASE 2B2B: `round` is no longer a positional counter over whatever set
        // of rounds the caller passed in. It is the canonical position in the
        // round's own (application, parcel) chain, which makes the same round read
        // the same however the list was loaded.
        $controller = $this->code($this->controllerSource());

        $this->assertStringContainsString("'inspection_id'", $controller);
        $this->assertStringContainsString('InspectionRoundNumbering::forInspections($rounds)', $controller);
        $this->assertMatchesRegularExpression(
            "/'round'\s*=>\s*\\\$identity === null \? null : \\\$identity\['round_number'\]/",
            $controller,
            'the displayed round must come from the canonical helper, and be null when the '
            .'row has no recorded parcel rather than a fabricated number'
        );

        // The caller-dependent positional counter is gone.
        $this->assertStringNotContainsString('$index++;', $controller);
    }

    // ══════════════════════════════════════════════════════════════
    // §16 / §19 / §27  ATTEMPT COUNT, NO N+1, NO HISTORY LEAK
    // ══════════════════════════════════════════════════════════════

    public function test_attempt_count_is_an_aggregate_and_no_attempt_rows_are_loaded(): void
    {
        $controller = $this->code($this->controllerSource());

        $this->assertStringContainsString("withCount('deliveryAttempts')", $controller);

        // Loading the relation would be both an N+1 and a history leak.
        $this->assertStringNotContainsString("with(['deliveryAttempts'", $controller);
        $this->assertStringNotContainsString("->deliveryAttempts()", $controller);
    }

    public function test_no_queue_correlation_or_diagnostic_material_is_exposed(): void
    {
        // Queue correlation, raw attempt detail, and remote failures are 9D
        // Admin monitoring material, not 9C-1 Planning Officer material.
        //
        // LOOP 9C-3-1 CORRECTION. `handshake_key` moved out of this list. The
        // reader SELECTS the local column to compute `can_retry`; what must
        // never happen is it becoming a RESPONSE FIELD, which is asserted
        // separately below as an array key.
        //
        // SCOPE CORRECTED 2026-09-30 (Loop 9D).
        //
        // This inspected the LIVE controller source, so it silently became a
        // freeze on all future authorized work - the same defect class already
        // corrected in Loop9c1DeliveryStatusReaderTest and again in
        // Loop9c4RetryUiContractTest. It broke on 9D, which is the phase these
        // fields were always reserved FOR: the comment directly above says so.
        //
        // The assertion is therefore made against the 9C-1 COMMIT's own
        // controller, so it states exactly what it always meant: at 9C-1, no
        // queue correlation and no raw attempt detail existed anywhere in the
        // reader.
        //
        // The invariant that must survive is now asserted where it is actually
        // meaningful, against live behavior, in
        // Loop9dAdminDeliveryMonitoringContractTest: the DEFAULT reader response
        // still carries no attempt history, no queue uuid and no free text for
        // ANY viewer, and a Planning Officer can never obtain it.
        $controller = $this->code(
            (string) shell_exec('git show c52ad8d:app/Http/Controllers/InspectionDeliveryController.php')
        );

        foreach ([
            'queue_job_uuid', 'attempt_number', 'safe_message',
            'failed_jobs', 'inspector_notes', 'signed_url',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $controller,
                "'{$forbidden}' must never be exposed by the 9C-1 reader."
            );
        }

        // As a response field it is still absolutely forbidden. This one is
        // asserted on the LIVE controller, because it is a response-SHAPE
        // invariant rather than a 9C-1-era fact, and 9D had no reason to relax
        // it.
        $live = $this->code($this->controllerSource());

        foreach (['handshake_key', 'role', 'is_active', 'email'] as $notAField) {
            $this->assertStringNotContainsString(
                "'" . $notAField . "' =>",
                $live,
                "'{$notAField}' must never be a response field of the reader."
            );
        }
    }

    public function test_eager_loads_are_bounded_to_what_the_contract_needs(): void
    {
        $controller = $this->code($this->controllerSource());

        // LOOP 9C-3-1 CORRECTION. The eager load legitimately grew from
        // `select('id', 'name')` to include the three LOCAL attributes the
        // shared eligibility contract needs. It is still ONE query, still
        // bounded, and the response still exposes only id and name.
        $this->assertStringContainsString(
            "select('id', 'name', 'role', 'is_active', 'handshake_key')",
            $controller
        );

        // Display identity is still exactly id + name, and the load is still a
        // single relation with no attempt rows pulled in.
        $this->assertStringContainsString(
            "['id' => (int) \$round->inspector->getKey(), 'name' => \$round->inspector->name]",
            $controller
        );
        $this->assertStringNotContainsString('password', $controller);
        $this->assertStringNotContainsString('remember_token', $controller);
    }

    // ══════════════════════════════════════════════════════════════
    // §17  TIMESTAMPS
    // ══════════════════════════════════════════════════════════════

    public function test_timestamps_use_the_existing_iso8601_convention_and_are_never_fabricated(): void
    {
        $controller = $this->code($this->controllerSource());

        foreach (['last_delivery_attempt_at', 'delivered_at'] as $column) {
            $this->assertStringContainsString(
                "\$round->{$column}?->toIso8601String()",
                $controller,
                "'{$column}' must serialize with the existing toIso8601String() convention."
            );
        }

        // NULL-safe reads only: no now(), no defaults, no fabricated instants.
        $this->assertStringNotContainsString('now()', $controller);
        $this->assertStringNotContainsString('Carbon::now', $controller);
    }

    // ══════════════════════════════════════════════════════════════
    // §28  NO DATABASE IMPACT
    // ══════════════════════════════════════════════════════════════

    public function test_no_schema_or_runtime_write_artifacts_were_added(): void
    {
        // SCOPE CORRECTED 2026-09-30 (9C-5 blocker fix).
        //
        // This previously read the LIVE WORKING TREE. That only ever proved
        // "9C-1 added no files", and it silently became a freeze on the 9B
        // writer for the whole life of the branch: a later, separately
        // authorized phase could not correct the writer at all without failing
        // a 9C-1 test.
        //
        // The real property is about the 9C-1 COMMIT, so it is now asserted
        // against that commit's own diff. The 9C-5 bridge correction touches
        // `PushInspectionToSupabase` in a later commit and is unaffected,
        // which is precisely the distinction this test was trying to make.
        $phaseDiff = (string) shell_exec(
            'git show --name-only --format= c52ad8d'
        );

        foreach (explode("\n", $phaseDiff) as $path) {
            $path = trim($path);
            if ($path === '') {
                continue;
            }

            foreach (['database/sql/', 'database/migrations/'] as $forbidden) {
                $this->assertStringStartsNotWith(
                    $forbidden,
                    $path,
                    "9C-1 must not touch database artifacts; found '{$path}'."
                );
            }
        }

        // And the 9C-1 commit did not modify the recorder or the writer, so no
        // attempt row, summary column, or queue correlation could have changed
        // from the reader phase.
        foreach ([
            'app/Jobs/PushInspectionToSupabase.php',
            'app/Services/InspectionDeliveryRecorder.php',
        ] as $untouched) {
            $this->assertStringNotContainsString(
                $untouched,
                $phaseDiff,
                "The 9C-1 reader phase must not have modified {$untouched}."
            );
        }
    }
}
