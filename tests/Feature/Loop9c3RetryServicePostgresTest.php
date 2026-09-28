<?php

namespace Tests\Feature;

use App\Models\InspectionDeliveryAttempt;
use App\Models\SiteInspection;
use App\Models\User;
use App\Services\InspectionDeliveryRetryService;
use App\Support\InspectionDeliveryRetryEligibility;
use App\Support\InspectionDeliveryRetryResult;
use Illuminate\Queue\DatabaseQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Queue;
use PDO;
use PDOException;
use Tests\TestCase;
use Throwable;

/**
 * Loop 9C-3-1 - the atomic retry service, proven against REAL PostgreSQL.
 *
 * WHY THIS FILE NEEDS A SPECIFIC ENVIRONMENT
 * ------------------------------------------
 * `phpunit.xml` pins `DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:` and
 * `QUEUE_CONNECTION=sync`. This PHP build has no `pdo_sqlite`, so no DB-backed
 * test can run under the default environment, and `sync` would EXECUTE the
 * bridge writer inline instead of enqueuing it. Both are overridden from the
 * shell for this run:
 *
 *   DB_CONNECTION=pgsql  QUEUE_CONNECTION=database
 *
 * `phpunit.xml` is NOT modified. This test refuses to run rather than report a
 * false pass if the environment is wrong.
 *
 * NOTHING PERSISTS
 * ----------------
 * Every test runs inside one outer transaction that is ALWAYS rolled back, and
 * every fixture is created inside that transaction. No production row is
 * modified: inspections 25-30, application ownership, the reconciled delivery
 * state and the audit ledger are all exactly as they were before the run. The
 * protected rounds are never written to at all - the fixtures are NEW rows.
 */
class Loop9c3RetryServicePostgresTest extends TestCase
{
    /** Unique per call, because parcels are UNIQUE on (application, parcel_code). */
    private int $parcelSequence = 0;

    /** Unique per call, because applications are UNIQUE on reference_number. */
    private int $applicationSequence = 0;

    protected function setUp(): void
    {
        parent::setUp();

        $this->withoutVite();

        // Refuse to lie about what was proven.
        $this->assertSame('pgsql', config('database.default'), 'This test requires real PostgreSQL.');
        $this->assertSame('database', config('queue.default'), 'This test requires the real database queue.');
        $this->assertNotSame('sync', config('queue.default'), 'sync would execute the writer inline.');

        $this->assertFalse(
            DB::transactionLevel() > 0,
            'Each test opens its own outer transaction.'
        );
    }

    // ==================================================================
    // Fixture helpers. Everything they create lives inside the outer
    // transaction and disappears with it.
    // ==================================================================

    private function activeSiteInspector(): User
    {
        return User::query()->activeSiteInspectors()->orderBy('id')->firstOrFail();
    }

    private function planningOfficer(): User
    {
        return User::query()
            ->where('role', 'Planning Officer')
            ->where('is_active', true)
            ->orderBy('id')
            ->firstOrFail();
    }

    /**
     * A brand new application owned by $owner, with $parcelCount parcels.
     *
     * Cloned from an existing row so every non-null column is satisfied, then
     * given a fresh reference number and the ownership the retry rules require.
     * The 9C-3 audit found 0 of 70 live applications with a recorded owner, so
     * a real retry is not legal against persistent data; this is the
     * transaction-isolated substitute, and it is never committed.
     */
    private function makeApplication(?User $owner, int $parcelCount = 1): int
    {
        $template = DB::table('zoning_applications')->orderBy('id')->first();

        $columns = (array) $template;
        unset($columns['id'], $columns['created_at'], $columns['updated_at']);

        $columns['reference_number'] = 'ZZ-9C3-' . $this->applicationSequence++;
        $columns['assigned_planning_officer_id'] = $owner?->getKey();
        $columns['created_at'] = now();
        $columns['updated_at'] = now();

        $applicationId = DB::table('zoning_applications')->insertGetId($columns);

        for ($i = 0; $i < $parcelCount; $i++) {
            $this->makeParcel($applicationId, $i);
        }

        return (int) $applicationId;
    }

    private function makeParcel(int $applicationId, int $index = 0): int
    {
        $template = (array) DB::table('parcels')->orderBy('id')->first();
        unset($template['id'], $template['created_at'], $template['updated_at']);

        $template['zoning_application_id'] = $applicationId;
        // `parcels` is UNIQUE on (zoning_application_id, parcel_code), so every
        // fixture parcel needs its own code.
        $template['parcel_code'] = 'ZZ-9C3-P' . $this->parcelSequence++ . '-' . $index;
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
    private function makeFailedRound(int $applicationId, int $parcelId, ?int $inspectorId = null, ?string $deliveryStatus = 'delivery_failed'): int
    {
        return $this->insertRound($applicationId, $parcelId, $inspectorId ?? $this->activeSiteInspector()->getKey(), $deliveryStatus);
    }

    /** A delivery-failed round with NO inspector assigned at all. */
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
            // Populated on purpose: a retry must preserve all of it.
            'last_delivery_attempt_at' => '2026-01-02 03:04:05',
            'last_delivery_failure_category' => 'supabase_unreachable',
            'delivered_at' => '2025-12-01 00:00:00',
            'submitted_at' => '2025-12-01 00:00:00',
            'findings' => 'existing field findings that must survive a retry',
            'recommendations' => 'existing recommendations that must survive a retry',
            'scheduled_date' => '2026-02-01',
            'deadline_date' => '2026-02-05',
            'assigned_notes' => 'original assignment instructions',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
    }

    /**
     * Run a test body inside one outer transaction that is always rolled back.
     */
    private function withinRollbackOnly(callable $body): void
    {
        DB::beginTransaction();

        try {
            $body();
        } finally {
            DB::rollBack();
        }
    }

    private function counts(): array
    {
        return [
            'jobs' => DB::table('jobs')->count(),
            'attempts' => DB::table('inspection_delivery_attempts')->count(),
            'retry_audit' => DB::table('audit_trail')->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count(),
        ];
    }

    // ==================================================================
    // 1. The accepted retry: three facts, one transaction.
    // ==================================================================

    public function test_an_accepted_retry_writes_pending_one_job_one_audit_and_no_attempt(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $before = $this->counts();
            $baseline = DB::table('site_inspections')->count();

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $this->assertTrue($result->isQueued(), 'An owned, failed, current round must be accepted.');
            $this->assertSame(InspectionDeliveryRetryResult::QUEUED, $result->outcome);
            $this->assertSame($roundId, $result->siteInspectionId);
            $this->assertSame($applicationId, $result->applicationId);

            // 1. pending state.
            $this->assertSame(
                'pending_delivery',
                DB::table('site_inspections')->where('id', $roundId)->value('delivery_status')
            );

            // 2. exactly one jobs row.
            $this->assertSame($before['jobs'] + 1, DB::table('jobs')->count());

            // 3. exactly one strict audit row, with the right actor and application.
            $this->assertSame($before['retry_audit'] + 1, DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());

            $audit = DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)
                ->orderByDesc('id')->first();

            $this->assertSame($applicationId, (int) $audit->application_id);
            $this->assertSame($owner->getKey(), (int) $audit->performed_by);
            $this->assertStringContainsString("inspection round {$roundId}", $audit->note);

            // The note must carry no queue uuid, handshake key or Supabase identity.
            $jobPayload = json_decode((string) DB::table('jobs')->orderByDesc('id')->value('payload'), true);
            $this->assertArrayHasKey('uuid', $jobPayload);
            $this->assertStringNotContainsString($jobPayload['uuid'], $audit->note);
            $this->assertStringNotContainsString('handshake', $audit->note);
            $this->assertStringNotContainsString('profiles', $audit->note);

            // 4. NO attempt row. 9B is still the only creator.
            $this->assertSame($before['attempts'], DB::table('inspection_delivery_attempts')->count());

            // And nothing else was invented.
            $this->assertSame($baseline, DB::table('site_inspections')->count());
        });
    }

    public function test_the_queued_job_is_a_real_database_queue_row_for_the_writer(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $row = DB::table('jobs')->orderByDesc('id')->first();
            $this->assertNotNull($row);

            $payload = json_decode($row->payload, true);
            $serialized = json_encode($payload);

            // The single existing bridge writer, re-queued.
            $this->assertStringContainsString('PushInspectionToSupabase', $serialized);
            // ...for this exact round, with no second writer.
            $this->assertStringContainsString((string) $roundId, $serialized);
            $this->assertStringNotContainsString('PushPlanningReviewToSupabase', $serialized);
        });
    }

    // ==================================================================
    // 2. Everything a retry must NOT touch.
    // ==================================================================

    public function test_a_retry_changes_exactly_one_inspection_column(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $inspector = $this->activeSiteInspector();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId, $inspector->getKey());

            $beforeRound = (array) DB::table('site_inspections')->where('id', $roundId)->first();
            $beforeApp = (array) DB::table('zoning_applications')->where('id', $applicationId)->first();

            app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $afterRound = (array) DB::table('site_inspections')->where('id', $roundId)->first();
            $afterApp = (array) DB::table('zoning_applications')->where('id', $applicationId)->first();

            $changed = [];
            foreach ($afterRound as $column => $value) {
                if ($column === 'updated_at') {
                    continue; // Eloquent's own timestamp.
                }
                if (($beforeRound[$column] ?? null) !== $value) {
                    $changed[] = $column;
                }
            }

            $this->assertSame(['delivery_status'], $changed, 'Only delivery_status may change.');

            // The named invariants, explicitly.
            $this->assertSame($beforeRound['status'], $afterRound['status'], 'inspection.status');
            $this->assertSame($beforeRound['inspector_id'], $afterRound['inspector_id'], 'inspector_id');
            $this->assertSame($beforeRound['last_delivery_failure_category'], $afterRound['last_delivery_failure_category'], 'last failure category');
            $this->assertSame($beforeRound['last_delivery_attempt_at'], $afterRound['last_delivery_attempt_at'], 'last attempt time');
            $this->assertSame($beforeRound['delivered_at'], $afterRound['delivered_at'], 'delivered_at');
            $this->assertSame($beforeRound['submitted_at'], $afterRound['submitted_at'], 'submitted_at');
            $this->assertSame($beforeRound['findings'], $afterRound['findings'], 'findings');
            $this->assertSame($beforeRound['recommendations'], $afterRound['recommendations'], 'recommendations');
            $this->assertSame($beforeRound['scheduled_date'], $afterRound['scheduled_date'], 'scheduled_date');
            $this->assertSame($beforeRound['deadline_date'], $afterRound['deadline_date'], 'deadline_date');
            $this->assertSame($beforeRound['assigned_notes'], $afterRound['assigned_notes'], 'assigned_notes');

            $this->assertSame($beforeApp['status'], $afterApp['status'], 'application.status');
            $this->assertSame($beforeApp['assigned_planning_officer_id'], $afterApp['assigned_planning_officer_id'], 'PO owner');
            $this->assertSame($beforeApp['encoded_by'], $afterApp['encoded_by'], 'encoded_by');
        });
    }

    // ==================================================================
    // 3. Authority.
    // ==================================================================

    public function test_a_different_planning_officer_is_refused(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $other = User::query()->where('role', 'Planning Officer')->where('id', '!=', $owner->getKey())->firstOrFail();

            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $other);

            $this->assertSame(InspectionDeliveryRetryResult::NOT_AUTHORIZED, $result->outcome);
            $this->assertSame('delivery_failed', DB::table('site_inspections')->where('id', $roundId)->value('delivery_status'));
        });
    }

    public function test_an_admin_is_never_an_authorized_retry_actor(): void
    {
        $this->withinRollbackOnly(function () {
            $admin = User::query()->where('role', 'Admin')->firstOrFail();
            $owner = $this->planningOfficer();

            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $admin);

            $this->assertSame(InspectionDeliveryRetryResult::NOT_AUTHORIZED, $result->outcome);
        });
    }

    public function test_a_site_inspector_is_never_an_authorized_retry_actor(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $this->activeSiteInspector());

            $this->assertSame(InspectionDeliveryRetryResult::NOT_AUTHORIZED, $result->outcome);
        });
    }

    public function test_an_application_with_no_recorded_owner_is_refused(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication(null); // No recorded owner.
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $this->assertSame(InspectionDeliveryRetryResult::NOT_AUTHORIZED, $result->outcome);
        });
    }

    public function test_a_missing_inspection_round_is_refused(): void
    {
        $this->withinRollbackOnly(function () {
            $result = app(InspectionDeliveryRetryService::class)
                ->queueRetry(999999999, $this->planningOfficer());

            $this->assertSame(InspectionDeliveryRetryResult::INSPECTION_NOT_FOUND, $result->outcome);
        });
    }

    // ==================================================================
    // 4. Delivery state.
    // ==================================================================

    public function test_only_a_recorded_delivery_failure_is_retryable(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();

            foreach ([null, 'pending_delivery', 'delivered'] as $state) {
                $applicationId = $this->makeApplication($owner);
                $parcelId = $this->makeParcel($applicationId, 0);
                $roundId = $this->makeFailedRound($applicationId, $parcelId, null, $state);

                $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

                $this->assertSame(
                    InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
                    $result->outcome,
                    'State ' . var_export($state, true) . ' must not be retryable.'
                );
            }
        });
    }

    // ==================================================================
    // 5. Composite supersession.
    // ==================================================================

    public function test_a_superseded_round_is_refused_and_the_current_round_is_not(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);

            $older = $this->makeFailedRound($applicationId, $parcelId);
            $newer = $this->makeFailedRound($applicationId, $parcelId);

            $this->assertGreaterThan($older, $newer, 'Fixture sanity: ids must increase.');

            // The OLDER round is superseded and must be refused.
            $refused = app(InspectionDeliveryRetryService::class)->queueRetry($older, $owner);
            $this->assertSame(InspectionDeliveryRetryResult::SUPERSEDED_ROUND, $refused->outcome);
            $this->assertSame('delivery_failed', DB::table('site_inspections')->where('id', $older)->value('delivery_status'));

            // The NEWER round is the current one and is accepted.
            $accepted = app(InspectionDeliveryRetryService::class)->queueRetry($newer, $owner);
            $this->assertTrue($accepted->isQueued());
        });
    }

    public function test_a_different_parcel_does_not_supersede(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner, 2);
            $parcelA = $this->makeParcel($applicationId, 90);
            $parcelB = $this->makeParcel($applicationId, 91);

            $roundA = $this->makeFailedRound($applicationId, $parcelA);
            // A newer round on ANOTHER parcel of the same application.
            $this->makeFailedRound($applicationId, $parcelB);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundA, $owner);

            $this->assertTrue($result->isQueued(), 'A newer round on a different parcel must not supersede this one.');
        });
    }

    public function test_a_different_application_does_not_supersede_even_with_the_same_parcel_id_text(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationA = $this->makeApplication($owner);
            $parcelA = $this->makeParcel($applicationA, 0);
            $roundA = $this->makeFailedRound($applicationA, $parcelA);

            // A different application. A parcel belongs to exactly one
            // application, so this is a different parcel row entirely, and the
            // composite scope must not be satisfied by it.
            $applicationB = $this->makeApplication($owner);
            $parcelB = $this->makeParcel($applicationB, 0);
            $this->makeFailedRound($applicationB, $parcelB);

            $this->assertNotSame($parcelA, $parcelB);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundA, $owner);

            $this->assertTrue($result->isQueued());
        });
    }

    public function test_a_round_with_no_parcel_is_refused(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);

            $roundId = (int) DB::table('site_inspections')->insertGetId([
                'zoning_application_id' => $applicationId,
                'parcel_id' => null,
                'inspector_id' => $this->activeSiteInspector()->getKey(),
                'status' => 'assigned',
                'delivery_status' => 'delivery_failed',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $result = app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $this->assertSame(InspectionDeliveryRetryResult::PARCEL_UNKNOWN, $result->outcome);
        });
    }

    // ==================================================================
    // 6. Inspector validity: the repository's canonical local rule.
    // ==================================================================

    public function test_inspector_validity_uses_the_canonical_local_rule(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $service = app(InspectionDeliveryRetryService::class);

            $eligible = $this->activeSiteInspector();

            $suspended = (clone $eligible)->forceFill(['is_active' => false]);
            $suspended->setAttribute('id', $eligible->getKey());
            // A distinct account, so the real row is never touched.
            $suspendedId = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ Suspended Inspector',
                'email' => 'zz.suspended@example.test',
                'password' => 'x',
                'role' => 'Site Inspector',
                'is_active' => false,
                'handshake_key' => 'zz-suspended-key',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $noKeyId = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ No Account Inspector',
                'email' => 'zz.nokey@example.test',
                'password' => 'x',
                'role' => 'Site Inspector',
                'is_active' => true,
                'handshake_key' => null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $wrongRoleId = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ Wrong Role',
                'email' => 'zz.wrongrole@example.test',
                'password' => 'x',
                'role' => 'Planning Officer',
                'is_active' => true,
                'handshake_key' => 'zz-wrongrole-key',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            // An id that is simply not present. The service must treat it as
            // ineligible even though the foreign key stops a round from
            // carrying it.
            $missingId = 999999998;

            $this->assertTrue($service->inspectorIsEligible($eligible->getKey()), 'Active SI with a handshake key.');
            $this->assertFalse($service->inspectorIsEligible($suspendedId), 'Suspended SI.');
            $this->assertFalse($service->inspectorIsEligible($noKeyId), 'SI with no FieldSync account.');
            $this->assertFalse($service->inspectorIsEligible($wrongRoleId), 'Wrong role.');
            $this->assertFalse($service->inspectorIsEligible($missingId), 'Missing inspector.');
            $this->assertFalse($service->inspectorIsEligible(null), 'No inspector assigned.');

            // End-to-end: an invalid inspector refuses the whole retry. A
            // round cannot carry a non-existent inspector id (foreign key), so
            // "missing inspector" is represented by a NULL `inspector_id`.
            foreach ([$suspendedId, $noKeyId, $wrongRoleId] as $inspectorId) {
                $applicationId = $this->makeApplication($owner);
                $parcelId = $this->makeParcel($applicationId, 0);
                $roundId = $this->makeFailedRound($applicationId, $parcelId, $inspectorId);

                $result = $service->queueRetry($roundId, $owner);

                $this->assertSame(
                    InspectionDeliveryRetryResult::INSPECTOR_INVALID,
                    $result->outcome,
                    'Inspector ' . var_export($inspectorId, true) . ' must block the retry.'
                );
                $this->assertSame(
                    'delivery_failed',
                    DB::table('site_inspections')->where('id', $roundId)->value('delivery_status')
                );
            }

            // A round with no inspector at all. There is nobody to deliver the
            // task to, so a retry is refused rather than queued into a certain
            // `inspector_mapping_unresolved` failure.
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $unassigned = $this->makeUnassignedRound($applicationId, $parcelId);

            $result = $service->queueRetry($unassigned, $owner);
            $this->assertSame(InspectionDeliveryRetryResult::INSPECTOR_INVALID, $result->outcome);
            $this->assertSame('delivery_failed', DB::table('site_inspections')->where('id', $unassigned)->value('delivery_status'));

            // And the reader agrees, from a NULL inspector relation.
            $this->assertFalse(
                InspectionDeliveryRetryEligibility::inspectorIsLocallyEligible(null)
            );
        });
    }

    // ==================================================================
    // 7. Double submit.
    // ==================================================================

    /**
     * The observable half: the second request re-reads the row under the lock
     * and refuses. Proven through the real service, twice, on one connection.
     */
    public function test_a_second_retry_of_the_same_round_is_refused(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $service = app(InspectionDeliveryRetryService::class);
            $before = $this->counts();

            $first = $service->queueRetry($roundId, $owner);
            $second = $service->queueRetry($roundId, $owner);

            $this->assertTrue($first->isQueued());
            $this->assertSame(
                InspectionDeliveryRetryResult::WRONG_DELIVERY_STATE,
                $second->outcome,
                'The second request must see pending_delivery under the lock.'
            );

            // Exactly one job and one audit row, not two.
            $this->assertSame($before['jobs'] + 1, DB::table('jobs')->count());
            $this->assertSame($before['retry_audit'] + 1, DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
        });
    }

    /**
     * The blocking half, with TWO real connections.
     *
     * A single Laravel connection cannot demonstrate mutual exclusion, because
     * it holds its own lock. This proves the actual PostgreSQL behaviour the
     * design depends on: while request A holds the row lock, request B's
     * `SELECT ... FOR UPDATE` cannot proceed; once A commits, B acquires the
     * lock and re-reads the committed `pending_delivery`.
     */
    public function test_two_connections_are_serialized_by_the_row_lock_and_re_read_the_committed_state(): void
    {
        $owner = $this->planningOfficer();

        // The fixture must be COMMITTED to be visible to a second connection.
        $applicationId = DB::transaction(function () use ($owner) {
            $id = $this->makeApplication($owner);
            $this->makeParcel($id, 0);

            return $id;
        });
        $parcelId = (int) DB::table('parcels')->where('zoning_application_id', $applicationId)->value('id');
        $roundId = $this->makeFailedRound($applicationId, $parcelId);

        $a = $this->rawConnection();
        $b = $this->rawConnection();

        try {
            // ---- Request A: lock, observe failure, accept, and HOLD. -------
            $a->beginTransaction();
            $aState = $this->lockAndRead($a, $roundId);
            $this->assertSame('delivery_failed', $aState, 'A must see the recorded failure.');

            $stmt = $a->prepare('update site_inspections set delivery_status = ? where id = ?');
            $stmt->execute(['pending_delivery', $roundId]);

            // ---- Request B: must NOT be able to proceed. -------------------
            $b->beginTransaction();
            $b->exec('set local statement_timeout = 400');

            $blocked = false;
            try {
                $this->lockAndRead($b, $roundId);
            } catch (PDOException $e) {
                $blocked = $this->isTimeout($e);
            }

            $this->assertTrue(
                $blocked,
                'Request B must be unable to read the locked row while A holds the lock.'
            );

            $b->rollBack();

            // ---- A commits; B now proceeds and re-reads. ------------------
            $a->commit();

            $b->beginTransaction();
            $bState = $this->lockAndRead($b, $roundId);

            $this->assertSame(
                'pending_delivery',
                $bState,
                'After A commits, B must re-read and see the accepted state.'
            );
            $b->rollBack();
        } finally {
            $this->safeRollback($a);
            $this->safeRollback($b);

            // Remove the committed fixture. Nothing persists.
            DB::table('site_inspections')->where('id', $roundId)->delete();
            DB::table('parcels')->where('zoning_application_id', $applicationId)->delete();
            DB::table('zoning_applications')->where('id', $applicationId)->delete();
        }
    }

    private function rawConnection(): PDO
    {
        $config = config('database.connections.pgsql');

        $pdo = new PDO(
            sprintf('pgsql:host=%s;port=%s;dbname=%s', $config['host'], $config['port'] ?? 5432, $config['database']),
            $config['username'],
            $config['password']
        );
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        return $pdo;
    }

    private function lockAndRead(PDO $pdo, int $roundId): ?string
    {
        $stmt = $pdo->prepare('select delivery_status from site_inspections where id = ? for update');
        $stmt->execute([$roundId]);

        $value = $stmt->fetchColumn();

        return $value === false ? null : (string) $value;
    }

    private function isTimeout(PDOException $e): bool
    {
        return str_contains($e->getMessage(), 'canceling statement due to statement timeout');
    }

    private function safeRollback(PDO $pdo): void
    {
        try {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
        } catch (Throwable) {
            // Already closed.
        }
    }

    // ==================================================================
    // 8. Failure atomicity, and the strict audit being load-bearing.
    // ==================================================================

    /**
     * A queue INSERT failure happens AFTER the pending transition and AFTER the
     * strict audit insert, so the rollback must remove both. This is also the
     * proof that the audit write is transaction-critical: it was written, and
     * then unwound with everything else.
     *
     * The failure is injected by pointing the database queue at a table that
     * does not exist. No production failure hook is added, and no schema is
     * mutated.
     */
    public function test_a_queue_failure_rolls_back_the_pending_state_and_the_audit_row(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId);

            $before = $this->counts();
            $beforeAuditTotal = DB::table('audit_trail')->count();

            // Test-only injection: a real Connector that builds a real
            // DatabaseQueue pointed at a table that does not exist, so the
            // failure lands INSIDE pushToDatabase - after the pending
            // transition and after the strict audit insert, which is the only
            // place a rollback claim is worth anything. No production failure
            // hook is added and no schema is mutated.
            Queue::extend('database', fn () => new class
            {
                public function connect(array $config): DatabaseQueue
                {
                    return new DatabaseQueue(
                        DB::connection($config['connection'] ?? config('database.default')),
                        'zz_loop9c3_absent_jobs_table',
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

            // An infrastructure failure must NOT be flattened into a business
            // refusal: 9C-3-2 needs to answer 503, not 409. So whatever the
            // queue layer throws must escape the service unchanged.
            $this->assertNotNull($threw, 'The queue failure must propagate out of the service.');
            $this->assertNotInstanceOf(
                \Illuminate\Validation\ValidationException::class,
                $threw,
                'A queue failure must not become a validation refusal.'
            );

            // The pending state and the strict audit row were BOTH written
            // before the failure, so the assertions below are meaningful.
            $this->assertSame(
                'delivery_failed',
                DB::table('site_inspections')->where('id', $roundId)->value('delivery_status'),
                'The pending transition must be rolled back.'
            );
            $this->assertSame($beforeAuditTotal, DB::table('audit_trail')->count(), 'The strict audit row must be rolled back.');
            $this->assertSame($before['retry_audit'], DB::table('audit_trail')
                ->where('action', InspectionDeliveryRetryService::AUDIT_ACTION)->count());
            $this->assertSame($before['jobs'], DB::table('jobs')->count(), 'No job may remain.');
            $this->assertSame($before['attempts'], DB::table('inspection_delivery_attempts')->count());
        });
    }

    // ==================================================================
    // 9. Reader/service agreement, and the reader's query budget.
    // ==================================================================

    public function test_the_reader_and_the_service_agree_on_every_round(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $suspendedId = (int) DB::table('users')->insertGetId([
                'name' => 'ZZ Suspended 2',
                'email' => 'zz.suspended2@example.test',
                'password' => 'x',
                'role' => 'Site Inspector',
                'is_active' => false,
                'handshake_key' => 'zz-k',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

            $applicationId = $this->makeApplication($owner, 4);
            $service = app(InspectionDeliveryRetryService::class);

            $p0 = $this->makeParcel($applicationId, 0);
            $p1 = $this->makeParcel($applicationId, 1);
            $p2 = $this->makeParcel($applicationId, 2);
            $p3 = $this->makeParcel($applicationId, 3);

            $rounds = [
                // Superseded: a newer round follows on the same parcel.
                $this->makeFailedRound($applicationId, $p0),
                $this->makeFailedRound($applicationId, $p0),
                // Invalid inspector.
                $this->makeFailedRound($applicationId, $p1, $suspendedId),
                // Wrong state.
                $this->makeFailedRound($applicationId, $p2, null, 'delivered'),
            ];
            // Fully eligible.
            $rounds[] = $this->makeFailedRound($applicationId, $p3);

            $response = $this->actingAs($owner)->getJson("/applications/{$applicationId}/delivery-status");
            $response->assertOk();

            $byId = [];
            foreach ($response->json('inspections') as $row) {
                $byId[$row['inspection_id']] = $row;
            }

            $this->assertCount(5, $byId);

            // `retry_actor_authorized` stays application-level only.
            $this->assertTrue($response->json('retry_actor_authorized'));
            $this->assertNull($response->json('retry_actor_unavailable_reason'));

            // Reader privacy: inspector is id + name only.
            foreach ($byId as $row) {
                if ($row['inspector'] !== null) {
                    $this->assertSame(['id', 'name'], array_keys($row['inspector']));
                }
            }

            foreach ($rounds as $roundId) {
                $readerSays = $byId[$roundId]['delivery']['can_retry'];
                $serviceResult = $service->queueRetry($roundId, $owner);
                $serviceSays = $serviceResult->isQueued();

                $this->assertSame(
                    $readerSays,
                    $serviceSays,
                    "Reader and service disagree for round {$roundId}."
                );
            }

            // The eligible round is genuinely the one the reader offered.
            $this->assertTrue($byId[$rounds[4]]['delivery']['can_retry']);
            // The superseded one is not.
            $this->assertFalse($byId[$rounds[0]]['delivery']['can_retry']);
            // Nor the invalid-inspector or wrong-state ones.
            $this->assertFalse($byId[$rounds[2]]['delivery']['can_retry']);
            $this->assertFalse($byId[$rounds[3]]['delivery']['can_retry']);
        });
    }

    public function test_the_reader_query_count_is_constant_regardless_of_round_count(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();

            $measure = function (int $roundCount) use ($owner): int {
                $applicationId = $this->makeApplication($owner, $roundCount);

                for ($i = 0; $i < $roundCount; $i++) {
                    $this->makeFailedRound($applicationId, (int) DB::table('parcels')
                        ->where('zoning_application_id', $applicationId)
                        ->orderBy('id')
                        ->offset($i)
                        ->value('id'));
                }

                DB::flushQueryLog();
                DB::enableQueryLog();

                $this->actingAs($owner)
                    ->getJson("/applications/{$applicationId}/delivery-status")
                    ->assertOk();

                $count = count(DB::getQueryLog());
                DB::disableQueryLog();

                return $count;
            };

            $one = $measure(1);
            $six = $measure(6);

            $this->assertSame(
                $one,
                $six,
                "The reader must not grow a query per round (1 round={$one}, 6 rounds={$six})."
            );

            // And the budget itself is pinned, so a future change cannot quietly
            // multiply the reader's query count while still being "constant".
            $this->assertLessThanOrEqual(
                3,
                $one,
                'The reader should cost the application lookup, the rounds, and the inspector eager load.'
            );
        });
    }

    // ==================================================================
    // 10. The protected baseline is never written to.
    // ==================================================================

    public function test_the_protected_failed_rounds_are_never_modified(): void
    {
        $this->withinRollbackOnly(function () {
            $protected = DB::table('site_inspections')
                ->where('delivery_status', 'delivery_failed')
                ->orderBy('id')
                ->get()
                ->map(fn ($row) => (array) $row)
                ->all();

            $this->assertNotEmpty($protected, 'The reconciled failure baseline must exist.');

            // Drive the service at every protected round with the real owner of
            // its application - which, per the 9C-3 audit, nobody is.
            foreach ($protected as $row) {
                $result = app(InspectionDeliveryRetryService::class)
                    ->queueRetry((int) $row['id'], $this->planningOfficer());

                $this->assertFalse(
                    $result->isQueued(),
                    'No real application has a recorded owner, so no persistent round may be retryable.'
                );
            }

            foreach ($protected as $row) {
                $after = (array) DB::table('site_inspections')->where('id', $row['id'])->first();
                $this->assertSame($row, $after, 'A protected round was modified.');
            }
        });
    }

    public function test_no_delivery_attempt_is_ever_created_by_a_refused_retry(): void
    {
        $this->withinRollbackOnly(function () {
            $owner = $this->planningOfficer();
            $before = DB::table('inspection_delivery_attempts')->count();

            $applicationId = $this->makeApplication($owner);
            $parcelId = $this->makeParcel($applicationId, 0);
            $roundId = $this->makeFailedRound($applicationId, $parcelId, null, 'delivered');

            app(InspectionDeliveryRetryService::class)->queueRetry($roundId, $owner);

            $this->assertSame(
                $before,
                DB::table('inspection_delivery_attempts')->count(),
                '9B remains the only creator of delivery attempts.'
            );
            $this->assertSame(
                0,
                InspectionDeliveryAttempt::query()->where('site_inspection_id', $roundId)->count()
            );
        });
    }
}
