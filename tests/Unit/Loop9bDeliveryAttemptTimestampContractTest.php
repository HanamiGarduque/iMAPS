<?php

namespace Tests\Unit;

use App\Models\InspectionDeliveryAttempt;
use App\Services\InspectionDeliveryRecorder;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;
use Throwable;

/**
 * Loop 9B HOTFIX - `inspection_delivery_attempts` timestamp contract.
 *
 * THE DEFECT
 * ----------
 * Migration `2026_09_28_030000_add_inspection_delivery_monitoring.php` creates
 * this table with `created_at` and deliberately WITHOUT `updated_at`. The model
 * left Eloquent's `$timestamps` at its default and cast `updated_at`, so every
 * Eloquent write emitted a column the table does not have:
 *
 *   SQLSTATE[42703]: column "updated_at" of relation
 *   "inspection_delivery_attempts" does not exist
 *
 * The writer catches that failure on purpose ("observability must never break
 * delivery"), so the symptom was SILENT: the bridge still pushed successfully,
 * the log said "Successfully pushed", and the round was delivered with no
 * attempt evidence and no `delivery_status` summary at all. The first proof was
 * the live APP-2026-00028 / inspection 39 re-dispatch on 2026-09-30, which
 * logged "Delivery attempt could not be opened" immediately before succeeding.
 *
 * THE CONTRACT
 * ------------ * `created_at` exists and stays Eloquent-owned.
 * * `updated_at` does not exist, on purpose.
 *
 * An attempt row is created once, then transitioned AT MOST ONCE from `pending`
 * to `delivered` or `failed`. Both meaningful instants are already stored with
 * their own names: `attempted_at` when the dispatch began, `completed_at` when
 * the outcome was finalized. An `updated_at` could only ever duplicate
 * `completed_at`, so no column is added to satisfy Eloquent.
 *
 * THE FIX (two edits, both proven necessary)
 * ------------------------------------------
 * 1. `InspectionDeliveryAttempt::UPDATED_AT = null` - the model-native Laravel
 *    way to keep `created_at` automatic while never emitting `updated_at`.
 *    Chosen over `public $timestamps = false`, which would ALSO stop Eloquent
 *    populating `created_at` and silently move that job onto the column default.
 * 2. `InspectionDeliveryRecorder::markAttemptFailed()` no longer passes an
 *    explicit `'updated_at' => now()`. This is required and NOT redundant with
 *    (1): it is a query-builder `update()`, and Eloquent's
 *    `Builder::addUpdatedAtColumn()` returns the caller's array untouched when
 *    `UPDATED_AT` is null, so the explicit key would still reach PostgreSQL and
 *    fail. The audit proved the model-only fix insufficient, which is why this
 *    one recorder line is in scope.
 *
 * No migration, no SQL, no schema change.
 *
 * The live portion is rollback-only and hard-guarded: it refuses to run against
 * anything except `imaps_db_test`, so it can never mutate canonical
 * `imaps_db_0921`.
 */
class Loop9bDeliveryAttemptTimestampContractTest extends TestCase
{
    /** The ONLY database the live probe may ever touch. */
    private const SAFE_DATABASE = 'imaps_db_test';

    private function modelSource(): string
    {
        return (string) file_get_contents(base_path('app/Models/InspectionDeliveryAttempt.php'));
    }

    private function recorderSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRecorder.php'));
    }

    private function migrationSource(): string
    {
        return (string) file_get_contents(
            base_path('database/migrations/2026_09_28_030000_add_inspection_delivery_monitoring.php')
        );
    }

    /**
     * Executable statements only. These files legitimately NAME `updated_at` in
     * their documentation, so an "absent" assertion must ignore comments.
     */
    private function statements(string $text): string
    {
        $stripped = preg_replace('#/\*.*?\*/#s', '', $text);
        $stripped = preg_replace('#^\s*(//|\*).*$#m', '', (string) $stripped);

        return trim((string) $stripped);
    }

    // ------------------------------------------------------------------
    // 1. Model metadata, no database required
    // ------------------------------------------------------------------

    public function test_model_declares_no_updated_at_column(): void
    {
        $this->assertNull(
            InspectionDeliveryAttempt::UPDATED_AT,
            'The table has no updated_at, so the model must declare UPDATED_AT = null.'
        );

        $model = new InspectionDeliveryAttempt();

        $this->assertNull(
            $model->getUpdatedAtColumn(),
            'Eloquent must resolve no updated_at column name.'
        );

        $this->assertSame(
            'created_at',
            $model->getCreatedAtColumn(),
            'created_at must remain the Eloquent-owned insert timestamp.'
        );

        $this->assertTrue(
            $model->usesTimestamps(),
            'Timestamps stay enabled so created_at is still populated automatically.'
        );
    }

    public function test_model_does_not_cast_a_nonexistent_column(): void
    {
        $casts = (new InspectionDeliveryAttempt())->getCasts();

        $this->assertArrayNotHasKey(
            'updated_at',
            $casts,
            'Casting a column that does not exist leaves model metadata describing nothing.'
        );

        $this->assertSame('datetime', $casts['created_at'] ?? null);
        $this->assertSame('datetime', $casts['attempted_at'] ?? null);
        $this->assertSame('datetime', $casts['completed_at'] ?? null);
        $this->assertSame('integer', $casts['attempt_number'] ?? null);
    }

    public function test_migration_creates_created_at_and_never_updated_at(): void
    {
        $source = $this->statements($this->migrationSource());

        $this->assertStringContainsString(
            "timestamp('created_at')",
            $source,
            'The migration must keep declaring created_at.'
        );

        $this->assertStringNotContainsString(
            "timestamp('updated_at')",
            $source,
            'updated_at must never be introduced by this append-only table.'
        );
    }

    public function test_no_production_writer_emits_updated_at_for_attempts(): void
    {
        $this->assertStringNotContainsString(
            "'updated_at'",
            $this->statements($this->recorderSource()),
            'markAttemptFailed() wrote updated_at explicitly, which no column backs.'
        );

        $this->assertStringNotContainsString(
            "'updated_at'",
            $this->statements($this->modelSource()),
            'The model must not reference updated_at in executable code.'
        );
    }

    public function test_transition_timestamps_are_named_not_generic(): void
    {
        $source = $this->statements($this->recorderSource());

        $this->assertStringContainsString(
            "'attempted_at'",
            $source,
            'attempted_at records when the dispatch began.'
        );

        $this->assertStringContainsString(
            "'completed_at' => now()",
            $source,
            'completed_at records when the outcome was finalized, replacing updated_at.'
        );
    }

    // ------------------------------------------------------------------
    // 2. Live proof against the real table shape, rollback only
    // ------------------------------------------------------------------

    /**
     * Point the default connection at the test database and refuse to continue
     * unless we are provably NOT on canonical.
     */
    private function useSafeDatabase(): void
    {
        config([
            'database.connections.pgsql.database' => self::SAFE_DATABASE,
            'database.default' => 'pgsql',
        ]);

        DB::purge('pgsql');

        $resolved = DB::connection('pgsql')->getDatabaseName();

        $this->assertSame(
            self::SAFE_DATABASE,
            $resolved,
            'Refusing to run: the live probe must never touch canonical imaps_db_0921.'
        );
    }

    private function pgsqlAvailable(): bool
    {
        try {
            $this->useSafeDatabase();
            DB::connection('pgsql')->select('select 1');

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    public function test_insert_populates_created_at_and_never_writes_updated_at(): void
    {
        if (! $this->pgsqlAvailable()) {
            $this->markTestSkipped('PostgreSQL test database unavailable; metadata contract still asserted above.');
        }

        $this->useSafeDatabase();

        $schema = DB::connection('pgsql')->selectOne(
            "select count(*) filter (where column_name = 'created_at') as has_created,
                    count(*) filter (where column_name = 'updated_at') as has_updated
             from information_schema.columns
             where table_name = 'inspection_delivery_attempts'"
        );

        $this->assertSame(1, (int) $schema->has_created, 'Fixture precondition: created_at exists.');
        $this->assertSame(0, (int) $schema->has_updated, 'Fixture precondition: updated_at is absent.');

        DB::connection('pgsql')->beginTransaction();

        try {
            $applicationId = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                'reference_number' => 'PHPUNIT-9B-TIMESTAMP',
                'application_type' => 'Hotfix Probe',
                'purpose' => 'timestamp contract probe',
                'applicant_name' => 'Probe',
                'contact_number' => '0000',
                'barangay' => 'Alupay',
            ]);

            $inspectionId = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                'zoning_application_id' => $applicationId,
                'status' => 'assigned',
            ]);

            // The exact call the writer makes. Before the hotfix this threw
            // SQLSTATE 42703 on the missing updated_at column.
            $attempt = InspectionDeliveryAttempt::create([
                'site_inspection_id' => $inspectionId,
                'attempt_number' => 1,
                'source' => InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH,
                'outcome' => InspectionDeliveryAttempt::OUTCOME_PENDING,
                'failure_category' => null,
                'safe_message' => null,
                'attempted_at' => now(),
                'completed_at' => null,
            ]);

            $this->assertTrue($attempt->exists, 'The insert must persist.');
            $this->assertNotNull(
                $attempt->created_at,
                'created_at must still be populated by Eloquent.'
            );

            $row = (array) DB::connection('pgsql')->table('inspection_delivery_attempts')
                ->where('id', $attempt->getKey())
                ->first();

            $this->assertArrayNotHasKey(
                'updated_at',
                $row,
                'The persisted row must not carry an updated_at column.'
            );
            $this->assertNotEmpty($row['created_at']);
        } finally {
            DB::connection('pgsql')->rollBack();
        }
    }

    public function test_both_outcome_transitions_succeed_without_updated_at(): void
    {
        if (! $this->pgsqlAvailable()) {
            $this->markTestSkipped('PostgreSQL test database unavailable.');
        }

        $this->useSafeDatabase();

        DB::connection('pgsql')->beginTransaction();

        try {
            $recorder = new InspectionDeliveryRecorder();

            foreach ([
                [InspectionDeliveryAttempt::OUTCOME_DELIVERED, 'markDelivered'],
                [InspectionDeliveryAttempt::OUTCOME_FAILED, 'markAttemptFailed'],
            ] as [$outcome, $method]) {
                $applicationId = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                    'reference_number' => 'PHPUNIT-9B-' . strtoupper($method),
                    'application_type' => 'Hotfix Probe',
                    'purpose' => 'timestamp contract probe',
                    'applicant_name' => 'Probe',
                    'contact_number' => '0000',
                    'barangay' => 'Alupay',
                ]);

                $inspectionId = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                    'zoning_application_id' => $applicationId,
                    'status' => 'assigned',
                ]);

                $attempt = InspectionDeliveryAttempt::create([
                    'site_inspection_id' => $inspectionId,
                    'attempt_number' => 1,
                    'source' => InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY,
                    'outcome' => InspectionDeliveryAttempt::OUTCOME_PENDING,
                    'failure_category' => null,
                    'safe_message' => null,
                    'attempted_at' => now(),
                    'completed_at' => null,
                ]);

                if ($method === 'markDelivered') {
                    $recorder->markDelivered($attempt);
                } else {
                    $recorder->markAttemptFailed($attempt, [
                        'category' => InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE,
                        'message' => 'probe',
                    ]);
                }

                $fresh = InspectionDeliveryAttempt::query()->whereKey($attempt->getKey())->firstOrFail();

                $this->assertSame($outcome, $fresh->outcome, "{$method} must finalize the outcome.");
                $this->assertNotNull($fresh->completed_at, "{$method} must stamp completed_at.");
                $this->assertNotNull($fresh->created_at, "{$method} must leave created_at intact.");
            }
        } finally {
            DB::connection('pgsql')->rollBack();
        }
    }

    /**
     * Negative control. Reinstates the pre-hotfix model contract in memory only
     * and proves the probes above genuinely detect the defect, so a green run is
     * evidence and not a vacuous pass.
     *
     * A class constant cannot be reassigned at runtime, so the legacy model is
     * expressed as a subclass that overrides UPDATED_AT exactly the way the
     * unfixed model behaved. It writes the same table, so the PostgreSQL error
     * is the real one.
     */
    public function test_probes_would_catch_the_pre_hotfix_model(): void
    {
        if (! $this->pgsqlAvailable()) {
            $this->markTestSkipped('PostgreSQL test database unavailable.');
        }

        $this->useSafeDatabase();

        $legacy = new class extends InspectionDeliveryAttempt
        {
            /** The pre-hotfix model: timestamps on, updated_at named again. */
            public const UPDATED_AT = 'updated_at';
        };

        $this->assertSame(
            'updated_at',
            $legacy->getUpdatedAtColumn(),
            'The legacy stand-in must reproduce the old timestamp behaviour.'
        );

        DB::connection('pgsql')->beginTransaction();

        try {
            $applicationId = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                'reference_number' => 'PHPUNIT-9B-NEGATIVE',
                'application_type' => 'Hotfix Probe',
                'purpose' => 'negative control',
                'applicant_name' => 'Probe',
                'contact_number' => '0000',
                'barangay' => 'Alupay',
            ]);

            $inspectionId = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                'zoning_application_id' => $applicationId,
                'status' => 'assigned',
            ]);

            $threw = false;
            $message = '';

            try {
                $legacy->newQuery()->create([
                    'site_inspection_id' => $inspectionId,
                    'attempt_number' => 1,
                    'source' => InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH,
                    'outcome' => InspectionDeliveryAttempt::OUTCOME_PENDING,
                    'failure_category' => null,
                    'safe_message' => null,
                    'attempted_at' => now(),
                    'completed_at' => null,
                ]);
            } catch (QueryException $e) {
                $threw = true;
                $message = $e->getMessage();
            }

            $this->assertTrue(
                $threw,
                'With updated_at restored the insert MUST fail, otherwise this suite proves nothing.'
            );

            $this->assertStringContainsString(
                'updated_at',
                $message,
                'The pre-hotfix failure is the missing updated_at column.'
            );
        } finally {
            DB::connection('pgsql')->rollBack();
        }

        // The real model is untouched by the control.
        $this->assertNull(InspectionDeliveryAttempt::UPDATED_AT);
    }
}
