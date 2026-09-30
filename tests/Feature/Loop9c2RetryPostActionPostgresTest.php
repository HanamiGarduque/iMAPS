<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\InspectionDeliveryRetryService;
use Illuminate\Database\QueryException;
use Illuminate\Queue\DatabaseQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;
use Throwable;

/**
 * Loop 9C-2 - the retry POST, proven against REAL PostgreSQL over HTTP.
 *
 * WHY THIS FILE NEEDS A SPECIFIC ENVIRONMENT
 * ------------------------------------------
 * `phpunit.xml` pins `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:` and
 * `QUEUE_CONNECTION=sync`. This PHP build has no `pdo_sqlite`, so no DB-backed
 * test runs under the default environment, and `sync` would EXECUTE the bridge
 * writer inline instead of enqueuing it, which would invalidate the entire
 * queue contract this phase is about. Both are overridden from the shell:
 *
 *   DB_CONNECTION=pgsql  QUEUE_CONNECTION=database
 *
 * `phpunit.xml` is NOT modified, and this test refuses to run rather than
 * report a false pass if the environment is wrong.
 *
 * CSRF
 * ----
 * Laravel's `VerifyCsrfToken` deliberately short-circuits under
 * `runningUnitTests()`, so a live 419 cannot be observed here. CSRF is proven
 * STRUCTURALLY instead, in `Loop9c2RetryActionContractTest`: the route carries
 * the `web` group and no `withoutMiddleware`, exception or exclusion was added
 * anywhere.
 *
 * NOTHING PERSISTS
 * ----------------
 * Every test runs inside one outer transaction that is ALWAYS rolled back, and
 * every fixture is created inside it. No production row is modified:
 * inspections 25-30, application ownership, the reconciled delivery state and
 * the audit ledger are exactly as they were before the run.
 */
class Loop9c2RetryPostActionPostgresTest extends TestCase
{
    private const URI = '/site-inspections/%d/retry-delivery';

    private int $parcelSequence = 0;

    private int $applicationSequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        $this->assertSame('pgsql', config('database.default'), 'This test requires real PostgreSQL.');
        $this->assertSame('database', config('queue.default'), 'This test requires the real database queue.');
    }

    // ==================================================================
    // Fixtures. Everything they create lives inside the outer transaction.
    // ==================================================================

    private function planningOfficer(): User
    {
        return User::query()
            ->where('role', 'Planning Officer')
            ->where('is_active', true)
            ->orderBy('id')
            ->firstOrFail();
    }

    private function otherPlanningOfficer(): User
    {
        return User::query()
            ->where('role', 'Planning Officer')
            ->where('is_active', true)
            ->where('id', '!=', $this->planningOfficer()->getKey())
            ->orderBy('id')
            ->firstOrFail();
    }

    private function activeSiteInspector(): User
    {
        return User::query()->activeSiteInspectors()->orderBy('id')->firstOrFail();
    }

    private function makeApplication(?User $owner): int
    {
        $template = (array) DB::table('zoning_applications')->orderBy('id')->first();
        unset($template['id'], $template['created_at'], $template['updated_at']);

        $template['reference_number'] = 'ZZ-9C32-' . $this->applicationSequence++;
        $template['assigned_planning_officer_id'] = $owner?->getKey();
        $template['created_at'] = now();
        $template['updated_at'] = now();

        $applicationId = (int) DB::table('zoning_applications')->insertGetId($template);

        return $applicationId;
    }

    private function makeParcel(int $applicationId): int
    {
        $template = (array) DB::table('parcels')->orderBy('id')->first();
        unset($template['id'], $template['created_at'], $template['updated_at']);

        $template['zoning_application_id'] = $applicationId;
        $template['parcel_code'] = 'ZZ-9C32-P' . $this->parcelSequence++;
        $template['created_at'] = now();
        $template['updated_at'] = now();

        return (int) DB::table('parcels')->insertGetId($template);
    }

    /**
     * A delivery-failed round on a given parcel.
     *
     * `$inspectorId` defaults to a real, locally eligible Site Inspector. A
     * caller that wants NO inspector uses {@see makeUnassignedRound()}, because
     * `?? null` cannot distinguish "omitted" from "explicitly none".
     */
    private function makeRound(
        int $applicationId,
        int $parcelId,
        ?int $inspectorId = null,
        ?string $deliveryStatus = 'delivery_failed'
    ): int {
        return $this->insertRound($applicationId, $parcelId, $inspectorId ?? $this->activeSiteInspector()->getKey(), $deliveryStatus);
    }

    /** A round with NO inspector assigned at all. */
    private function makeUnassignedRound(int $applicationId, int $parcelId, ?string $deliveryStatus = 'delivery_failed'): int
    {
        return $this->insertRound($applicationId, $parcelId, null, $deliveryStatus);
    }

    private function insertRound(int $applicationId, int $parcelId, ?int $inspectorId, ?string $deliveryStatus): int
    {
        return (int) DB::table('site_inspections')->insertGetId([
            'zoning_application_id' => $applicationId,
            'parcel_id' => $parcelId,
            'inspector_id' => $inspectorId,
            'status' => 'assigned',
            'delivery_status' => $deliveryStatus,
            // Populated on purpose: a POST must preserve all of it.
            'last_delivery_attempt_at' => '2026-01-02 03:04:05',
            'last_delivery_failure_category' => 'supabase_unreachable',
            'delivered_at' => '2025-12-01 00:00:00',
            'submitted_at' => '2025-12-01 00:00:00',
            'findings' => 'existing field findings',
            'recommendations' => 'existing recommendations',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    private function withinRollbackOnly(callable $body): void
    {
        DB::beginTransaction();

        try {
            $body();
        } finally {
            DB::rollBack();
        }
    }

    private function uri(int $roundId): string
    {
        return sprintf(self::URI, $roundId);
    }

    /** Aggregate counts only, for a case with no single round under test. */
    private function counts(): array
    {
        return [
            'jobs' => DB::table('jobs')->count(),
            'attempts' => DB::table('inspection_delivery_attempts')->count(),
            'retry_audit' => DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count(),
        ];
    }

    /**
     * The state of the world BEFORE a request, so "nothing happened" can be
     * asserted as genuine equality rather than as an assumption.
     *
     * @return array{state: ?string, jobs: int, attempts: int, retry_audit: int}
     */
    private function snapshot(int $roundId): array
    {
        return [
            'state' => DB::table('site_inspections')->where('id', $roundId)->value('delivery_status'),
            'jobs' => DB::table('jobs')->count(),
            'attempts' => DB::table('inspection_delivery_attempts')->count(),
            'retry_audit' => DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count(),
        ];
    }

    // ==================================================================
    // 1. The success path.
    // ==================================================================

    public function test_the_assigned_owner_can_queue_a_retry_and_gets_the_exact_success_flash(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId);
            $roundId = $this->makeRound($applicationId, $parcelId);

            $before = $this->counts();

            $response = $this->actingAs($owner)
                ->from("/applications/{$applicationId}")
                ->post($this->uri($roundId));

            $response->assertRedirect();
            $response->assertSessionHas('success', 'Delivery retry has been queued.');

            // The state the success message claims, and only that.
            $this->assertSame(
                'pending_delivery',
                DB::table('site_inspections')->where('id', $roundId)->value('delivery_status')
            );
            $this->assertSame($before['jobs'] + 1, DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'] + 1, DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
            $this->assertSame(
                $before['attempts'],
                DB::table('inspection_delivery_attempts')->count(),
                'A POST must not fabricate attempt history; 9B creates it.'
            );

            $audit = DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)
                ->orderByDesc('id')->first();
            $this->assertSame($applicationId, (int) $audit->application_id);
            $this->assertSame($owner->getKey(), (int) $audit->performed_by);
        });
    }

    public function test_the_success_message_never_claims_the_delivery_happened(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));

            $response = $this->actingAs($owner)->post($this->uri($roundId));

            $flash = (string) session('success');
            $this->assertSame('Delivery retry has been queued.', $flash);

            foreach ([
                'Delivered successfully',
                'Sent to FieldSync',
                'successfully delivered',
                'restarted',
                'Restarted',
            ] as $forbidden) {
                $this->assertStringNotContainsStringIgnoringCase($forbidden, $flash);
            }

            // And the redirect body must not smuggle one either.
            $this->assertStringNotContainsStringIgnoringCase('delivered successfully', $response->getContent() ?: '');
        });
    }

    public function test_a_successful_post_changes_no_lifecycle_field(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $inspector = $this->activeSiteInspector();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId), $inspector->getKey());

            $beforeRound = (array) DB::table('site_inspections')->where('id', $roundId)->first();
            $beforeApp = (array) DB::table('zoning_applications')->where('id', $applicationId)->first();

            $this->actingAs($owner)->post($this->uri($roundId))->assertRedirect();

            $afterRound = (array) DB::table('site_inspections')->where('id', $roundId)->first();
            $afterApp = (array) DB::table('zoning_applications')->where('id', $applicationId)->first();

            $changed = [];
            foreach ($afterRound as $column => $value) {
                if ($column === 'updated_at') {
                    continue;
                }
                if (($beforeRound[$column] ?? null) !== $value) {
                    $changed[] = $column;
                }
            }
            $this->assertSame(['delivery_status'], $changed, 'Only delivery_status may change.');

            $this->assertSame($beforeRound['status'], $afterRound['status'], 'inspection.status');
            $this->assertSame($beforeRound['inspector_id'], $afterRound['inspector_id'], 'inspector_id');
            $this->assertSame($beforeRound['last_delivery_failure_category'], $afterRound['last_delivery_failure_category']);
            $this->assertSame($beforeRound['last_delivery_attempt_at'], $afterRound['last_delivery_attempt_at']);
            $this->assertSame($beforeRound['delivered_at'], $afterRound['delivered_at'], 'delivered_at');
            $this->assertSame($beforeRound['submitted_at'], $afterRound['submitted_at']);
            $this->assertSame($beforeRound['findings'], $afterRound['findings'], 'photos/evidence untouched');
            $this->assertSame($beforeApp['status'], $afterApp['status'], 'application.status');
            $this->assertSame($beforeApp['assigned_planning_officer_id'], $afterApp['assigned_planning_officer_id'], 'PO owner');
        });
    }

    // ==================================================================
    // 2. Authority: refused before any write.
    // ==================================================================

    public function test_a_different_planning_officer_gets_403_and_writes_nothing(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($roundId);

            $this->actingAs($this->otherPlanningOfficer())
                ->post($this->uri($roundId))
                ->assertForbidden();

            $this->assertNothingHappened($roundId, $before);
        });
    }

    public function test_an_application_with_no_recorded_owner_gets_403(): void
    {
        $this->withinRollbackOnly(function () {
            $applicationId = $this->makeApplication(null);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($roundId);

            // A valid Planning Officer on a NULL-owner application. Ownership is
            // never auto-assigned and never inferred during a retry.
            $this->actingAs($this->planningOfficer())
                ->post($this->uri($roundId))
                ->assertForbidden();

            $this->assertNull(
                DB::table('zoning_applications')->where('id', $applicationId)->value('assigned_planning_officer_id'),
                'A refused retry must never assign ownership.'
            );
            $this->assertNothingHappened($roundId, $before);
        });
    }

    public function test_an_admin_gets_403_and_writes_nothing(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($roundId);

            $admin = User::query()->where('role', 'Admin')->firstOrFail();

            $this->actingAs($admin)
                ->post($this->uri($roundId))
                ->assertForbidden();

            $this->assertNothingHappened($roundId, $before);
        });
    }

    public function test_a_site_inspector_gets_403_even_with_a_valid_session(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($roundId);

            $this->actingAs($this->activeSiteInspector())
                ->post($this->uri($roundId))
                ->assertForbidden();

            $this->assertNothingHappened($roundId, $before);
        });
    }

    public function test_a_guest_is_redirected_to_login_and_writes_nothing(): void
    {
        $this->withinRollbackOnly(function () {
            $before = $this->counts();

            $this->post('/site-inspections/1/retry-delivery')
                ->assertRedirect(route('login'));

            $this->assertSame($before['jobs'], DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'], DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
        });
    }

    // ==================================================================
    // 3. State conflicts -> 409.
    // ==================================================================

    public function test_a_round_that_is_not_a_recorded_failure_gets_409(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();

            foreach ([null, 'pending_delivery', 'delivered'] as $state) {
                $applicationId = $this->makeApplication($owner);
                $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId), null, $state);
                $before = $this->snapshot($roundId);

                $this->actingAs($owner)
                    ->post($this->uri($roundId))
                    ->assertStatus(409);

                $this->assertNothingHappened($roundId, $before, 'State ' . var_export($state, true));
            }
        });
    }

    public function test_a_superseded_round_gets_409(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId);

            $older = $this->makeRound($applicationId, $parcelId);
            $this->makeRound($applicationId, $parcelId);

            $before = $this->snapshot($older);

            $response = $this->actingAs($owner)->post($this->uri($older));
            $response->assertStatus(409);

            $this->assertNothingHappened($older, $before);
        });
    }

    public function test_an_ineligible_inspector_gets_409(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();

            $suspended = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ Suspended', 'email' => 'zz.susp@example.test', 'password' => 'x',
                'role' => 'Site Inspector', 'is_active' => false, 'handshake_key' => 'k',
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $noKey = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ NoKey', 'email' => 'zz.nokey@example.test', 'password' => 'x',
                'role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => null,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $wrongRole = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ WrongRole', 'email' => 'zz.wrongrole@example.test', 'password' => 'x',
                'role' => 'Planning Officer', 'is_active' => true, 'handshake_key' => 'k',
                'created_at' => now(), 'updated_at' => now(),
            ]);

            foreach ([$suspended, $noKey, $wrongRole] as $inspectorId) {
                $applicationId = $this->makeApplication($owner);
                $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId), $inspectorId);
                $before = $this->snapshot($roundId);

                $this->actingAs($owner)
                    ->post($this->uri($roundId))
                    ->assertStatus(409);

                $this->assertNothingHappened($roundId, $before, 'Inspector ' . var_export($inspectorId, true));
            }

            // A round with NO inspector at all. There is nobody to deliver the
            // task to, so a retry is refused rather than queued into a certain
            // `inspector_mapping_unresolved` failure.
            $applicationId = $this->makeApplication($owner);
            $unassigned = $this->makeUnassignedRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($unassigned);

            $this->actingAs($owner)
                ->post($this->uri($unassigned))
                ->assertStatus(409);

            $this->assertNothingHappened($unassigned, $before, 'no inspector');
        });
    }

    public function test_a_missing_inspection_gets_404(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $before = $this->counts();

            $this->actingAs($owner)
                ->post($this->uri(999999997))
                ->assertNotFound();

            $this->assertSame($before['jobs'], DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'], DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
        });
    }

    /**
     * A refusal must say WHY in authored prose, and must never leak the
     * internal blocker token, a field name, an id or an SQL predicate.
     *
     * `app.debug` is switched OFF here on purpose. Under the test environment
     * Collision renders a full diagnostic page containing the request, the
     * routing, the exception trace and the ENTIRE query log, which is a test
     * harness artefact and not what a Planning Officer or a deployed
     * application would ever receive. Asserting against that page would prove
     * nothing about the shipped response, so this observes the real one.
     */
    public function test_a_refusal_response_carries_no_internal_token(): void
    {
        $this->withinRollbackOnly(function () {
            config(['app.debug' => false]);

            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId);

            $older = $this->makeRound($applicationId, $parcelId);
            $this->makeRound($applicationId, $parcelId);

            $content = (string) $this->actingAs($owner)
                ->post($this->uri($older))
                ->assertStatus(409)
                ->getContent();

            foreach ([
                'wrong_delivery_state',
                'superseded_round',
                'inspector_invalid',
                'not_authorized',
                'parcel_unknown',
                'application_mismatch',
                'delivery_failed',
                'parcel_id',
                'zoning_application_id',
                'assigned_planning_officer_id',
                'handshake',
                'NOT EXISTS',
                'MAX(id)',
                'site_inspections',
                'zoning_applications',
                'select ',
                'insert into',
            ] as $forbidden) {
                $this->assertStringNotContainsString(
                    $forbidden,
                    $content,
                    "A 409 must not disclose '{$forbidden}'."
                );
            }
        });
    }

    // ==================================================================
    // 4. Double submit.
    // ==================================================================

    public function test_a_second_post_is_a_conflict_and_creates_nothing(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->snapshot($roundId);

            $this->actingAs($owner)
                ->post($this->uri($roundId))
                ->assertRedirect();

            $this->actingAs($owner)
                ->post($this->uri($roundId))
                ->assertStatus(409);

            // Exactly one job and one audit row: never two successes.
            $this->assertSame($before['jobs'] + 1, DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'] + 1, DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
            $this->assertSame($before['attempts'], DB::table('inspection_delivery_attempts')->count());
        });
    }

    // ==================================================================
    // 5. No remote work during the request.
    // ==================================================================

    public function test_the_post_queues_the_existing_writer_and_touches_nothing_remote(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));

            $this->actingAs($owner)->post($this->uri($roundId))->assertRedirect();

            $row = DB::table('jobs')->orderByDesc('id')->first();
            $payload = (string) $row->payload;

            // The one existing bridge writer, for this exact round, and no
            // second writer and no review transport.
            $this->assertStringContainsString('PushInspectionToSupabase', $payload);
            $this->assertStringContainsString((string) $roundId, $payload);
            $this->assertStringNotContainsString('PushPlanningReviewToSupabase', $payload);

            // Nothing remote was contacted, so no remote identifier or key can
            // possibly appear in what the request wrote.
            $audit = DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)
                ->orderByDesc('id')->first();

            foreach (['rest/v1', 'profiles', 'field_jobs', 'handshake', 'apikey', 'Bearer'] as $forbidden) {
                $this->assertStringNotContainsString($forbidden, (string) $audit->note);
            }

            $this->assertStringNotContainsString(
                json_decode($payload, true)['uuid'],
                (string) $audit->note,
                'The audit note must not carry the queue uuid.'
            );
        });
    }

    // ==================================================================
    // 6. An unexpected failure is a safe 503.
    // ==================================================================

    public function test_an_unexpected_failure_is_a_503_that_leaks_nothing(): void
    {
        $this->withinRollbackOnly(function () {
            // See the note on the 409 leak test: `app.debug` is off so the real
            // response is observed, not the Collision diagnostic page.
            config(['app.debug' => false]);

            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));
            $before = $this->counts();

            // Test-only injection: a real Connector building a real
            // DatabaseQueue on a table that does not exist, so the failure
            // lands after the pending transition and the strict audit insert.
            Queue::extend('database', fn () => new class
            {
                public function connect(array $config): DatabaseQueue
                {
                    return new DatabaseQueue(
                        DB::connection($config['connection'] ?? config('database.default')),
                        'zz_loop9c32_absent_jobs_table',
                        $config['queue'] ?? 'default',
                        $config['retry_after'] ?? 90,
                        $config['after_commit'] ?? false,
                    );
                }
            });

            $response = $this->actingAs($owner)->post($this->uri($roundId));
            $response->assertStatus(503);

            $content = (string) $response->getContent();
            foreach ([
                'zz_loop9c32_absent_jobs_table',
                'SQLSTATE',
                '42P01',
                'Undefined table',
                'pgsql:host',
                'postgres',
                'InspectionDeliveryRetryService.php',
                '#0 ',
                'vendor/laravel',
            ] as $forbidden) {
                $this->assertStringNotContainsString(
                    $forbidden,
                    $content,
                    "A 503 must not disclose '{$forbidden}'."
                );
            }

            // The transaction unwound all three writes.
            $this->assertSame('delivery_failed', DB::table('site_inspections')->where('id', $roundId)->value('delivery_status'));
            $this->assertSame($before['jobs'], DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'], DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
            $this->assertSame($before['attempts'], DB::table('inspection_delivery_attempts')->count());
        });
    }

    public function test_an_unexpected_failure_propagates_as_a_throwable_not_a_refusal(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $roundId = $this->makeRound($applicationId, $this->makeParcel($applicationId));

            Queue::extend('database', fn () => new class
            {
                public function connect(array $config): DatabaseQueue
                {
                    return new DatabaseQueue(
                        DB::connection($config['connection'] ?? config('database.default')),
                        'zz_loop9c32_absent_jobs_table',
                        $config['queue'] ?? 'default',
                        $config['retry_after'] ?? 90,
                        $config['after_commit'] ?? false,
                    );
                }
            });

            $threw = null;
            try {
                app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);
            } catch (Throwable $e) {
                $threw = $e;
            }

            $this->assertInstanceOf(QueryException::class, $threw);
        });
    }

    // ==================================================================
    // 7. The protected baseline is never written to.
    // ==================================================================

    public function test_the_protected_failed_rounds_are_never_retryable_over_http(): void
    {
        $this->withinRollbackOnly(function () {
            $protected = DB::table('site_inspections')
                ->where('delivery_status', 'delivery_failed')
                ->orderBy('id')
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();

            $this->assertNotEmpty($protected);
            $before = $this->counts();

            foreach ($protected as $row) {
                // No live application has a recorded owner, so every protected
                // round is refused at the ownership gate.
                $this->actingAs($this->planningOfficer())
                    ->post($this->uri((int) $row['id']))
                    ->assertForbidden();
            }

            $this->assertSame($before['jobs'], DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'], DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());

            foreach ($protected as $row) {
                $this->assertSame(
                    $row,
                    (array) DB::table('site_inspections')->where('id', $row['id'])->first(),
                    'A protected round was modified.'
                );
            }
        });
    }

    public function test_the_readers_can_retry_flag_still_predicts_what_the_post_accepts(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();

            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId);
            $older = $this->makeRound($applicationId, $parcelId);
            $newer = $this->makeRound($applicationId, $parcelId);

            $response = $this->actingAs($owner)
                ->getJson("/applications/{$applicationId}/delivery-status");
            $response->assertOk();

            $flags = [];
            foreach ($response->json('inspections') as $row) {
                $flags[$row['inspection_id']] = $row['delivery']['can_retry'];
            }

            $this->assertFalse($flags[$older], 'A superseded round must not be offered.');
            $this->assertTrue($flags[$newer], 'The current round must be offered.');

            // And the POST agrees with the reader, in both directions.
            $this->actingAs($owner)->post($this->uri($older))->assertStatus(409);

            $this->actingAs($owner)
                ->post($this->uri($newer))
                ->assertRedirect()
                ->assertSessionHas('success', 'Delivery retry has been queued.');
        });
    }

    // ==================================================================
    // Helper.
    // ==================================================================

    /**
     * A refused POST must have changed nothing at all.
     *
     * The round's delivery state is compared against the snapshot taken BEFORE
     * the request rather than against a hard-coded value, because a refusal is
     * also exercised against rounds whose state is NULL, `pending_delivery` or
     * `delivered`. Those must be left exactly as they were found, and a round
     * that already started `pending_delivery` must not be mistaken for one this
     * request moved there.
     *
     * @param  array{state: ?string, jobs: int, attempts: int, retry_audit: int}  $before
     */
    private function assertNothingHappened(int $roundId, array $before, string $context = ''): void
    {
        $suffix = $context === '' ? '' : " [{$context}]";

        $this->assertSame(
            $before['state'],
            DB::table('site_inspections')->where('id', $roundId)->value('delivery_status'),
            "The round's delivery state must be untouched{$suffix}."
        );
        $this->assertSame($before['jobs'], DB::table('jobs')->count(), "No job{$suffix}.");
        $this->assertSame($before['retry_audit'], DB::table('audit_trail')
            ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count(), "No retry audit{$suffix}.");
        $this->assertSame($before['attempts'], DB::table('inspection_delivery_attempts')->count(), "No attempt{$suffix}.");
    }
}
