<?php

namespace Tests\Unit;

use App\Models\SiteInspection;
use App\Models\User;
use App\Services\InspectionDeliveryRetryService;
use App\Services\WorkAssignmentService;
use App\Support\InspectionDeliveryRetryEligibility;
use App\Support\InspectionDeliveryRetryResult;
use App\Support\InspectionDeliveryStatus;
use Tests\TestCase;

/**
 * Loop 9C-3-1 - the shared retry eligibility contract and the retry service.
 *
 * UNIT + SOURCE-CONTRACT coverage only. It needs no database and no network,
 * because the whole point of the 9C-3 correction is that the retry rules were
 * extracted into ONE pure evaluator. Anything that can be decided without a
 * database is decided here; the transactional behaviour is proven separately
 * against real PostgreSQL with rollback-only probes in
 * `Tests\Feature\Loop9c3RetryServicePostgresTest`.
 *
 * Environment limitation, unchanged from 9A/9B: DB-backed tests cannot run
 * under `phpunit.xml` (sqlite pinned, `pdo_sqlite` absent in this PHP), so no
 * production constraint is weakened to accommodate them.
 */
class Loop9c3RetryEligibilityContractTest extends TestCase
{
    private function serviceSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRetryService.php'));
    }

    private function controllerSource(): string
    {
        return (string) file_get_contents(base_path('app/Http/Controllers/InspectionDeliveryController.php'));
    }

    /**
     * Executable statements only. These files legitimately NAME forbidden
     * values in their documentation, so every "absent" assertion is evaluated
     * on code rather than on prose.
     */
    private function statements(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/\/\*\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*\/\/.*$/m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    private function round(int $id, ?int $parcelId, ?string $deliveryStatus = 'delivery_failed', bool $inspectorEligible = true): array
    {
        return [
            'round_id' => $id,
            'parcel_id' => $parcelId,
            'delivery_status' => $deliveryStatus,
            'inspector_eligible' => $inspectorEligible,
        ];
    }

    /** A map saying parcel 7's newest round is id 30. */
    private function map(int $parcelId, int $latestId): array
    {
        return [$parcelId => $latestId];
    }

    // ==================================================================
    // 1. Rule A + B: the actor gate.
    // ==================================================================

    public function test_actor_gate_requires_planning_officer_role(): void
    {
        $this->assertTrue(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', 7, 7));
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized('Admin', 7, 7));
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized('Site Inspector', 7, 7));
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized(null, 7, 7));
    }

    public function test_actor_gate_requires_a_recorded_owner_equal_to_the_actor(): void
    {
        // Recorded owner.
        $this->assertTrue(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', 7, 7));
        // A different Planning Officer.
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', 7, 8));
        // No recorded owner at all.
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', null, 7));
        // No authenticated actor.
        $this->assertFalse(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', 7, null));
    }

    public function test_actor_gate_never_consults_encoded_by_or_any_other_column(): void
    {
        $code = $this->statements($this->serviceSource()) . ' '
            . $this->statements($this->controllerSource());

        // Ownership comes from one stored pointer. `encoded_by`, the technical
        // reviewer and the application creator are never read.
        foreach (['encoded_by', 'reviewed_by', 'created_by'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "Retry authority must never be inferred from {$forbidden}."
            );
        }

        // `performed_by` legitimately appears, but ONLY as the audit row's
        // actor column. It must never be read as an ownership source.
        $this->assertMatchesRegularExpression(
            "/'performed_by'\s*=>\s*\(int\) \\\$actor->getKey\(\)/",
            $code
        );
        $this->assertStringNotContainsString(
            "performed_by =",
            $code,
            'The audit actor column must never be read.'
        );
    }

    public function test_actor_unavailable_reason_is_delegated_to_the_shipped_presenter(): void
    {
        // One wording for both sides. The retry service and the reader can never
        // describe the same actor-level refusal differently.
        $this->assertSame(
            InspectionDeliveryStatus::retryUnavailableReason('Planning Officer', null, 7),
            InspectionDeliveryRetryEligibility::actorUnavailableReason('Planning Officer', null, 7)
        );
        $this->assertSame(
            InspectionDeliveryStatus::retryUnavailableReason('Planning Officer', 9, 7),
            InspectionDeliveryRetryEligibility::actorUnavailableReason('Planning Officer', 9, 7)
        );
        // Admin is told nothing: the reason would be noise for a role that is
        // never offered retry.
        $this->assertNull(InspectionDeliveryRetryEligibility::actorUnavailableReason('Admin', null, 1));
    }

    // ==================================================================
    // 2. Rule C: the delivery state.
    // ==================================================================

    public function test_only_a_recorded_delivery_failure_is_eligible(): void
    {
        $this->assertTrue(
            InspectionDeliveryRetryEligibility::evaluateRound($this->round(30, 7), $this->map(7, 30))['eligible']
        );

        foreach ([null, 'pending_delivery', 'delivered'] as $notAFailure) {
            $decision = InspectionDeliveryRetryEligibility::evaluateRound(
                $this->round(30, 7, $notAFailure),
                $this->map(7, 30)
            );

            $this->assertFalse($decision['eligible'], var_export($notAFailure, true) . ' must not be retryable.');
            $this->assertContains(
                InspectionDeliveryRetryEligibility::BLOCKER_WRONG_DELIVERY_STATE,
                $decision['blockers']
            );
        }
    }

    public function test_an_unknown_stored_delivery_state_is_not_treated_as_a_failure(): void
    {
        // The presenter degrades an unrecognized value to the neutral no-record
        // state rather than guessing. Guessing would invent a failure.
        $this->assertFalse(InspectionDeliveryRetryEligibility::evaluateRound(
            $this->round(30, 7, 'some_future_state'),
            $this->map(7, 30)
        )['eligible']);
    }

    // ==================================================================
    // 3. Rule D: composite supersession.
    // ==================================================================

    public function test_a_higher_round_id_for_the_same_parcel_supersedes(): void
    {
        $this->assertTrue(InspectionDeliveryRetryEligibility::isSuperseded(25, 7, $this->map(7, 30)));
        $this->assertFalse(InspectionDeliveryRetryEligibility::isSuperseded(30, 7, $this->map(7, 30)));
    }

    public function test_a_different_parcel_never_supersedes(): void
    {
        // Parcel 7's newest round is 30. A round on parcel 8 is unaffected.
        $this->assertFalse(InspectionDeliveryRetryEligibility::isSuperseded(25, 8, $this->map(7, 30)));
        // A parcel with no other round is trivially current.
        $this->assertFalse(InspectionDeliveryRetryEligibility::isSuperseded(25, 8, []));
    }

    public function test_a_null_parcel_fails_closed_as_superseded(): void
    {
        // Non-supersession cannot be proven without a parcel, so an
        // unevaluatable scope is never presented as safe to retry.
        $this->assertTrue(InspectionDeliveryRetryEligibility::isSuperseded(30, null, $this->map(7, 30)));
    }

    public function test_a_null_parcel_round_is_never_eligible(): void
    {
        $decision = InspectionDeliveryRetryEligibility::evaluateRound(
            $this->round(30, null),
            $this->map(7, 30)
        );

        $this->assertFalse($decision['eligible']);
        $this->assertContains(InspectionDeliveryRetryEligibility::BLOCKER_PARCEL_UNKNOWN, $decision['blockers']);
    }

    public function test_supersession_uses_the_composite_scope_and_never_a_loose_one(): void
    {
        $code = $this->statements($this->serviceSource())
            . ' ' . $this->statements(
                (string) file_get_contents(base_path('app/Support/InspectionDeliveryRetryEligibility.php'))
            );

        // The grouped query must scope on the application AND take MAX(id).
        $this->assertStringContainsString('where(\'zoning_application_id\'', $code);
        $this->assertStringContainsString('MAX(id)', $code);
        $this->assertStringContainsString('groupBy(\'parcel_id\')', $code);
    }

    public function test_supersession_never_falls_back_to_latest_of_many_or_a_display_round(): void
    {
        $code = $this->statements($this->serviceSource())
            . ' ' . $this->statements(
                (string) file_get_contents(base_path('app/Support/InspectionDeliveryRetryEligibility.php'))
            );

        $this->assertStringNotContainsString('latestOfMany', $code);
        $this->assertStringNotContainsString('->siteInspection()', $code);
    }

    public function test_latest_round_ids_by_parcel_takes_the_highest_id_and_ignores_null_parcels(): void
    {
        $make = fn (int $id, ?int $parcelId) => (new SiteInspection())->forceFill([
            'parcel_id' => $parcelId,
        ])->setAttribute('id', $id);

        $map = InspectionDeliveryRetryEligibility::latestRoundIdsByParcel([
            $make(25, 7),
            $make(30, 7),
            $make(31, 8),
            $make(99, null),
        ]);

        $this->assertSame([7 => 30, 8 => 31], $map);
    }

    // ==================================================================
    // 4. Rule E: canonical LOCAL Site Inspector eligibility.
    // ==================================================================

    public function test_local_inspector_eligibility_requires_role_active_and_handshake_key(): void
    {
        $eligible = fn () => (new User())->forceFill([
            'role' => 'Site Inspector',
            'is_active' => true,
            'handshake_key' => 'hk-abc',
        ]);

        $this->assertTrue(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible($eligible()));

        // Wrong role.
        $this->assertFalse(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(
            $eligible()->forceFill(['role' => 'Planning Officer'])
        ));
        // Suspended account.
        $this->assertFalse(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(
            $eligible()->forceFill(['is_active' => false])
        ));
        // No FieldSync account: there is nowhere to deliver the task.
        $this->assertFalse(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(
            $eligible()->forceFill(['handshake_key' => null])
        ));
        $this->assertFalse(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(
            $eligible()->forceFill(['handshake_key' => ''])
        ));
        // Missing inspector entirely.
        $this->assertFalse(InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(null));
    }

    public function test_an_invalid_inspector_blocks_an_otherwise_retryable_round(): void
    {
        $decision = InspectionDeliveryRetryEligibility::evaluateRound(
            $this->round(30, 7, 'delivery_failed', false),
            $this->map(7, 30)
        );

        $this->assertFalse($decision['eligible']);
        $this->assertContains(InspectionDeliveryRetryEligibility::BLOCKER_INSPECTOR_INVALID, $decision['blockers']);
    }

    /**
     * §7: the reader's local inspector check must stay aligned with the
     * repository's canonical rule. The SERVICE reuses
     * `resolveActiveSiteInspector()` outright, so the only duplicated copy of
     * the conditions is the reader's - this test is what proves it never drifts.
     */
    public function test_reader_inspector_check_stays_aligned_with_the_canonical_rule(): void
    {
        $fixtures = [
            ['role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => 'hk', 'canonical' => true, 'local' => true],
            ['role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => null, 'canonical' => false, 'local' => false],
            ['role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => '', 'canonical' => false, 'local' => false],
            ['role' => 'Site Inspector', 'is_active' => false, 'handshake_key' => 'hk', 'canonical' => false, 'local' => false],
            ['role' => 'Planning Officer', 'is_active' => true, 'handshake_key' => 'hk', 'canonical' => false, 'local' => false],
            ['role' => 'Admin', 'is_active' => true, 'handshake_key' => 'hk', 'canonical' => false, 'local' => false],
        ];

        foreach ($fixtures as $i => $fixture) {
            $user = (new User())->forceFill([
                'role' => $fixture['role'],
                'is_active' => $fixture['is_active'],
                'handshake_key' => $fixture['handshake_key'],
            ]);

            $this->assertSame(
                $fixture['local'],
                InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible($user),
                "Fixture {$i} disagreed with the expected local verdict."
            );
        }

        // And the canonical rule itself must still be exactly these three
        // conditions, so the alignment target cannot be weakened unnoticed.
        $canonical = (string) file_get_contents(base_path('app/Models/User.php'));
        $this->assertStringContainsString("->where('role', 'Site Inspector')", $canonical);
        $this->assertStringContainsString("->where('is_active', true)", $canonical);
        $this->assertStringContainsString('->whereNotNull(\'handshake_key\')', $canonical);
    }

    public function test_the_retry_service_does_not_fork_the_inspector_conditions(): void
    {
        $code = $this->statements($this->serviceSource());

        // It reuses the canonical public service method...
        $this->assertStringContainsString('resolveActiveSiteInspector', $code);
        // ...and does not re-implement any of the four conditions itself.
        $this->assertStringNotContainsString("'Site Inspector'", $code);
        $this->assertStringNotContainsString('handshake_key', $code);
        $this->assertStringNotContainsString('is_active', $code);
    }

    public function test_resolve_active_site_inspector_is_public_so_no_visibility_changed_for_convenience(): void
    {
        $reflection = new \ReflectionMethod(WorkAssignmentService::class, 'resolveActiveSiteInspector');

        $this->assertTrue(
            $reflection->isPublic(),
            'The retry service reuses this method; making it non-public would be a silent coupling break.'
        );
    }

    // ==================================================================
    // 5. Combined decision + reader/service agreement.
    // ==================================================================

    public function test_can_retry_is_false_for_every_rule_failure(): void
    {
        $map = $this->map(7, 30);

        // The fully eligible combination.
        $this->assertTrue(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7), $map, 'Planning Officer', 7, 7
        ));

        // Not the assigned Planning Officer.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7), $map, 'Planning Officer', 7, 8
        ));
        // No recorded owner.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7), $map, 'Planning Officer', null, 7
        ));
        // Admin is never an authorized retry actor.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7), $map, 'Admin', 7, 7
        ));
        // Not a delivery failure.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7, 'delivered'), $map, 'Planning Officer', 7, 7
        ));
        // Superseded.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(25, 7), $map, 'Planning Officer', 7, 7
        ));
        // Inspector not locally eligible.
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7, 'delivery_failed', false), $map, 'Planning Officer', 7, 7
        ));
    }

    public function test_reader_and_service_ask_the_same_evaluator(): void
    {
        // §5: one canonical contract. The reader must call `canRetry()` and the
        // service must call `evaluateRound()`, so neither can invent its own
        // rules and drift from the other.
        $this->assertStringContainsString(
            'InspectionDeliveryRetryEligibility::canRetry(',
            $this->statements($this->controllerSource())
        );
        $this->assertStringContainsString(
            'InspectionDeliveryRetryEligibility::evaluateRound(',
            $this->statements($this->serviceSource())
        );
        $this->assertStringContainsString(
            'InspectionDeliveryRetryEligibility::actorAuthorized(',
            $this->statements($this->serviceSource())
        );
    }

    public function test_actor_authorized_remains_application_level_only(): void
    {
        // The application-level flag must NOT consider any round state: an
        // application owned by the viewer whose rounds are all delivered still
        // reports the actor as authorized, with no round retryable.
        $this->assertTrue(InspectionDeliveryRetryEligibility::actorAuthorized('Planning Officer', 7, 7));
        $this->assertFalse(InspectionDeliveryRetryEligibility::canRetry(
            $this->round(30, 7, 'delivered'), $this->map(7, 30), 'Planning Officer', 7, 7
        ));

        $this->assertStringContainsString(
            "'retry_actor_authorized' => \$retryActorAuthorized",
            $this->statements($this->controllerSource()),
            'The application-level flag must stay the raw actor gate.'
        );
    }

    // ==================================================================
    // 6. Reader privacy: eligibility needs attributes it must not expose.
    // ==================================================================

    public function test_reader_selects_inspector_attributes_for_eligibility_but_exposes_only_id_and_name(): void
    {
        $code = $this->statements($this->controllerSource());

        $this->assertStringContainsString(
            "select('id', 'name', 'role', 'is_active', 'handshake_key')",
            $code
        );
        $this->assertStringContainsString(
            "['id' => (int) \$round->inspector->getKey(), 'name' => \$round->inspector->name]",
            $code
        );

        // The response must never carry the internal eligibility inputs.
        foreach (['handshake_key', 'is_active', 'queue_job_uuid', 'superseded'] as $forbidden) {
            $this->assertStringNotContainsString(
                "'" . $forbidden . "' =>",
                $code,
                "The reader must not expose {$forbidden} as a response field."
            );
        }
    }

    public function test_reader_does_not_add_a_per_round_query(): void
    {
        $reader = $this->statements($this->controllerSource());

        // Supersession is reduced ONCE, outside the per-round map closure, from
        // rounds that are already loaded. It costs no query at all.
        $this->assertStringContainsString(
            'InspectionDeliveryRetryEligibility::latestRoundIdsByParcel($rounds)',
            $reader
        );
        $this->assertSame(
            1,
            substr_count($reader, 'latestRoundIdsByParcel($rounds)'),
            'The map must be built exactly once per request.'
        );

        // The service builds the same map with ONE grouped query, never one
        // query per round.
        $service = $this->statements($this->serviceSource());
        $this->assertStringContainsString("->selectRaw('parcel_id, MAX(id) AS latest_round_id')", $service);
        $this->assertStringContainsString("->whereNotNull('parcel_id')", $service);
        $this->assertStringContainsString("->groupBy('parcel_id')", $service);
        $this->assertSame(
            1,
            substr_count($service, 'selectRaw('),
            'The retry path must aggregate supersession in exactly one query.'
        );
    }

    // ==================================================================
    // 7. The service contract: lock order, writes, and boundaries.
    // ==================================================================

    public function test_lock_order_is_application_then_inspection(): void
    {
        $code = $this->statements($this->serviceSource());

        $locks = [];
        $offset = 0;
        while (($at = strpos($code, 'lockForUpdate()', $offset)) !== false) {
            $locks[] = $at;
            $offset = $at + 1;
        }

        $this->assertCount(2, $locks, 'Exactly two row locks, and no others.');

        // Everything before lock 1: the application read and its row lock.
        // (The one inspection query that may appear earlier is the non-locking
        // discovery `value()` read, asserted separately below.)
        $before = substr($code, 0, $locks[0]);
        $this->assertStringContainsString('ZoningApplication::query()', $before);
        $this->assertStringContainsString('->whereKey($applicationId)', $before);

        // Between lock 1 and lock 2: the inspection read and its row lock. The
        // inspection lock is therefore provably AFTER the application lock.
        $between = substr($code, $locks[0], $locks[1] - $locks[0]);
        $this->assertStringContainsString('SiteInspection::query()', $between);
        $this->assertStringContainsString('->whereKey($siteInspectionId)', $between);
        $this->assertStringContainsString('lockForUpdate()', $between);

        // After lock 2: no third lock, so the order can never be extended or
        // reversed later without this test failing.
        $after = substr($code, $locks[1] + strlen('lockForUpdate()'));
        $this->assertStringNotContainsString('lockForUpdate()', $after);

        // The pre-lock discovery read is the ONLY inspection query outside both
        // lock blocks, and it is a value() read, never a lock.
        $this->assertSame(
            1,
            substr_count($code, "->value('zoning_application_id')"),
            'Exactly one non-locking discovery read.'
        );
    }

    public function test_the_pre_lock_read_is_never_used_for_an_authorization_decision(): void
    {
        $code = $this->statements($this->serviceSource());

        $this->assertMatchesRegularExpression(
            "/->value\('zoning_application_id'\)/",
            $code
        );
        // It is revalidated against the LOCKED application before anything is decided.
        $this->assertStringContainsString(
            '(int) $inspection->zoning_application_id !== (int) $application->getKey()',
            $code
        );
    }

    public function test_ownership_is_reread_from_the_locked_application_and_never_written(): void
    {
        $code = $this->statements($this->serviceSource());

        // The only ownership read is from the locked model, never from a
        // previously loaded instance.
        $this->assertMatchesRegularExpression(
            '/\$application->assigned_planning_officer_id === null/',
            $code
        );

        // An assignment would be `= ` or `=;`, never the `===` comparison.
        $this->assertDoesNotMatchRegularExpression(
            '/assigned_planning_officer_id\s*=[^=]/',
            $code,
            'The service must never WRITE application ownership.'
        );
        $this->assertStringNotContainsString(
            'WorkAssignmentService->reassignPlanningOfficer',
            $code
        );
    }

    public function test_the_pending_transition_writes_exactly_one_column(): void
    {
        $code = $this->statements($this->serviceSource());

        $this->assertStringContainsString("'delivery_status' => InspectionDeliveryStatus::STATE_PENDING", $code);

        // Nothing else on the inspection may be written by a retry.
        foreach ([
            "'status' =>",
            "'inspector_id' =>",
            "'assigned_notes' =>",
            "'scheduled_date' =>",
            "'deadline_date' =>",
            "'submitted_at' =>",
            "'findings' =>",
            "'recommendations' =>",
            "'last_delivery_failure_category' =>",
            "'last_delivery_attempt_at' =>",
            "'delivered_at' =>",
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "A retry must not write {$forbidden}"
            );
        }
    }

    public function test_audit_is_strict_and_in_transaction_and_never_the_swallowing_logger(): void
    {
        $code = $this->statements($this->serviceSource());

        $this->assertStringContainsString("DB::table('audit_trail')->insert([", $code);
        $this->assertStringContainsString('self::AUDIT_ACTION', $code);
        $this->assertStringNotContainsString(
            'AuditLogger',
            $code,
            'AuditLogger swallows failures; a retry must not use it.'
        );
        // The insert must sit inside the one DB::transaction, and the shared
        // logger's semantics must not be changed.
        $this->assertStringContainsString('DB::transaction(function ()', $code);
        $this->assertStringNotContainsString('DB::beginTransaction(', $code);
    }

    public function test_audit_action_and_note_carry_no_forbidden_material(): void
    {
        $this->assertSame('DELIVERY_RETRY_QUEUED', InspectionDeliveryRetryService::AUDIT_ACTION);

        // varchar(60) with no CHECK: the new action needs no schema change.
        $this->assertLessThanOrEqual(60, strlen(InspectionDeliveryRetryService::AUDIT_ACTION));

        $code = $this->statements($this->serviceSource());
        foreach (['queueJobUuid', 'handshake', 'profile', 'response->body', 'getMessage()'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $code);
        }

        // The note is authored prose carrying only the local round id.
        $this->assertMatchesRegularExpression(
            "/'note'\s*=>\s*sprintf\(/",
            $code
        );
        $this->assertMatchesRegularExpression(
            "/'note'\s*=>\s*sprintf\(\s*'Queued FieldSync delivery retry for inspection round %d\./",
            $code
        );
    }

    public function test_dispatch_source_is_planning_officer_retry_and_the_resolver_is_untouched(): void
    {
        $this->assertSame('planning_officer_retry', InspectionDeliveryRetryService::DELIVERY_SOURCE);

        $code = $this->statements($this->serviceSource());
        $this->assertStringContainsString(
            'PushInspectionToSupabase::dispatch($inspection, self::DELIVERY_SOURCE)',
            $code
        );

        // §16: the source is the ORIGIN of the dispatch, so the 9B resolver must
        // keep preferring an explicit valid source over the queue-attempt count.
        $resolver = $this->statements(
            (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'))
        );
        $this->assertStringContainsString(
            '$explicitSource !== null && in_array($explicitSource',
            $resolver
        );
    }

    public function test_the_service_never_creates_a_delivery_attempt(): void
    {
        $code = $this->statements($this->serviceSource());

        $this->assertStringNotContainsString(
            'inspection_delivery_attempts',
            $code,
            '9B remains the only creator of delivery attempts.'
        );
        $this->assertStringNotContainsString('InspectionDeliveryAttempt::create', $code);
        $this->assertStringNotContainsString('beginAttempt', $code);
    }

    public function test_the_service_makes_no_remote_call(): void
    {
        $code = $this->statements($this->serviceSource());

        // Every remote capability, named. "FieldSync" is deliberately NOT in
        // this list: it legitimately appears inside the authored audit note
        // ("Queued FieldSync delivery retry...").
        foreach ([
            'SupabaseService',
            'Http::',
            '->post(',
            '->get(',
            "'profiles'",
            "'field_jobs'",
            'storage/v1',
            'services.supabase',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "Retry eligibility is LOCAL only; the service must not reference {$forbidden}."
            );
        }
    }

    public function test_the_service_is_transport_independent(): void
    {
        $code = $this->statements($this->serviceSource());

        foreach (['abort(', 'redirect(', 'back()', 'response()', 'Inertia::', 'JsonResponse'] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The service must not speak HTTP; found {$forbidden}."
            );
        }
    }

    public function test_the_service_writes_no_compensation_logic(): void
    {
        $code = $this->statements($this->serviceSource());

        // One transaction, one commit path. There is no "revert pending on
        // dispatch failure" path, because by the time a failure is observed the
        // transaction has already unwound all three writes. The single `catch`
        // in this class only translates a reused ValidationException into a
        // transport-independent refusal; it never writes.
        $this->assertSame(1, substr_count($code, 'DB::transaction('));
        $this->assertSame(0, substr_count($code, 'DB::rollBack'));
        $this->assertSame(0, substr_count($code, 'DB::beginTransaction'));
        $this->assertSame(1, substr_count($code, 'catch (ValidationException)'));
        $this->assertSame(0, substr_count($code, 'catch (\\Throwable'));
        $this->assertSame(0, substr_count($code, 'catch (\\Exception'));
    }

    public function test_ownership_and_reassignment_remain_other_services_concerns(): void
    {
        $code = $this->statements($this->serviceSource());

        foreach ([
            'WorkReassignmentController',
            'newRound(',
            'requires_reinspection',
            '$application->status',
            'technical_reviews',
            'InspectorTransferGuard',
        ] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $code);
        }

        // No ownership write of any form.
        $this->assertDoesNotMatchRegularExpression(
            '/assigned_planning_officer_id\s*=[^=]/',
            $code
        );
    }

    // ==================================================================
    // 8. The result object: distinct outcomes, authored prose only.
    // ==================================================================

    public function test_every_refusal_outcome_has_distinct_authored_prose(): void
    {
        $outcomes = [
            InspectionDeliveryRetryResult::INSPECTION_NOT_FOUND,
            InspectionDeliveryRetryResult::APPLICATION_NOT_FOUND,
            InspectionDeliveryRetryResult::APPLICATION_MISMATCH,
            InspectionDeliveryRetryResult::NOT_AUTHORIZED,
            InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
            InspectionDeliveryRetryResult::SUPERSEDED_ROUND,
            InspectionDeliveryRetryResult::PARCEL_UNKNOWN,
            InspectionDeliveryRetryResult::INSPECTOR_INVALID,
        ];

        $messages = [];

        foreach ($outcomes as $outcome) {
            $message = InspectionDeliveryRetryResult::refused($outcome)->message();
            $this->assertNotSame('', $message, "Outcome {$outcome} must have prose.");
            $messages[] = $message;
        }

        $this->assertCount(
            count($outcomes),
            array_unique($messages),
            'Each refusal must be distinguishable by 9C-3-2 without a default.'
        );
    }

    public function test_a_queued_result_never_claims_delivery_happened(): void
    {
        $result = InspectionDeliveryRetryResult::queued(30, 104);

        $this->assertTrue($result->isQueued());
        $this->assertSame(InspectionDeliveryRetryResult::QUEUED, $result->outcome);
        $this->assertSame(30, $result->siteInspectionId);
        $this->assertSame(104, $result->applicationId);

        $refusal = InspectionDeliveryRetryResult::refused(InspectionDeliveryRetryResult::NOT_AUTHORIZED);
        $this->assertFalse($refusal->isQueued());
    }

    public function test_an_unknown_outcome_degrades_to_a_neutral_refusal(): void
    {
        $result = InspectionDeliveryRetryResult::refused('something_invented_later');

        $this->assertFalse($result->isQueued());
        $this->assertNotSame('', $result->message());
    }
}
