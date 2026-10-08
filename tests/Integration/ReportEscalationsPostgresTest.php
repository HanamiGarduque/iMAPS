<?php

namespace Tests\Integration;

use App\Models\ReportEscalation;
use App\Services\ReportLifecycleLock;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Run with tests/run-report-escalations-postgres.ps1: fresh loopback-only
 * PostgreSQL cluster, torn down afterwards.
 *
 * This is the only place the REAL schema, the REAL CHECK constraints, the REAL
 * partial unique index and the REAL advisory transaction lock are exercised. The
 * SQLite suite cannot prove any of them: it has no second concurrent connection,
 * and it accepts neither `ALTER TABLE ... ADD CONSTRAINT` nor
 * `pg_advisory_xact_lock`.
 */
class ReportEscalationsPostgresTest extends TestCase
{
    private const MIGRATION = 'database/migrations/2026_10_05_000000_create_report_escalations_table.php';
    private const REPORT = '0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d';
    private const OTHER = 'b30569b6-e126-447e-a24f-d375b0782529';
    private object $migration;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertNotFalse(getenv('REPORTS_TEST_PG_PORT'), 'Use the disposable cluster runner.');
        $this->assertNotFalse(getenv('REPORTS_TEST_PG_DATA'), 'Disposable ownership evidence is required.');
        config(['database.default' => 'report_escalation_disposable', 'database.connections.report_escalation_disposable' => [
            'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => (int) getenv('REPORTS_TEST_PG_PORT'),
            'database' => 'reports_support_escalation_test', 'username' => 'postgres', 'password' => '',
            'charset' => 'utf8', 'prefix' => '', 'search_path' => 'public', 'sslmode' => 'disable',
        ]]);
        $actual = DB::selectOne('SELECT current_database() AS db, current_setting(\'data_directory\') AS dir');
        $this->assertSame('reports_support_escalation_test', $actual->db);
        $this->assertSame(str_replace('\\', '/', getenv('REPORTS_TEST_PG_DATA')), str_replace('\\', '/', $actual->dir));
        $this->assertStringContainsString('/reports-escalation-pg-', str_replace('\\', '/', $actual->dir));
        // Destructive fixture setup is reachable only after proving this is our disposable cluster.
        Schema::dropAllTables();
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); });
        DB::table('users')->insert([['id' => 1, 'name' => 'Admin'], ['id' => 2, 'name' => 'Other']]);
        $this->migration = require base_path(self::MIGRATION);
        $this->runMigration('up');
    }

    private function runMigration(string $direction): void
    {
        // Exercise Laravel's real transaction wrapper, including rollback on refusal.
        $method = new \ReflectionMethod(app('migrator'), 'runMigration');
        $method->invoke(app('migrator'), $this->migration, $direction);
    }

    private function episode(array $changes = []): array
    {
        return array_replace([
            'report_id' => self::REPORT, 'status' => 'open', 'created_by' => 1, 'created_at' => '2026-10-05 09:00:00',
        ], $changes);
    }

    private function insert(array $changes = []): void
    {
        DB::table('report_escalations')->insert($this->episode($changes));
    }

    /** Whether the DB refused this row, proven by a real constraint violation. */
    private function refuses(array $changes = []): bool
    {
        try {
            $this->insert($changes);

            return false;
        } catch (QueryException) {
            return true;
        }
    }

    // ── SCHEMA ───────────────────────────────────────────────────────────────

    public function test_applied_schema_has_exact_columns_constraints_and_indexes(): void
    {
        $this->assertSame(['id', 'report_id', 'status', 'created_by', 'created_at', 'recommendation',
            'recommendation_recorded_by', 'recommendation_at', 'closed_by', 'closed_at', 'closure_note'],
            Schema::getColumnListing('report_escalations'));
        $this->assertCount(7, DB::select("SELECT conname FROM pg_constraint WHERE conrelid='report_escalations'::regclass AND contype='c'"));
        $names = array_column(DB::select("SELECT conname FROM pg_constraint WHERE conrelid='report_escalations'::regclass AND contype='f'"), 'conname');
        sort($names);
        $this->assertSame(['report_escalations_closed_by_foreign', 'report_escalations_created_by_foreign',
            'report_escalations_recommendation_recorded_by_foreign'], $names);
        $indexes = array_column(DB::select("SELECT indexname FROM pg_indexes WHERE tablename='report_escalations'"), 'indexname');
        sort($indexes);
        $this->assertSame(['report_escalations_one_open_per_report', 'report_escalations_pkey',
            'report_escalations_report_created_idx'], $indexes);
    }

    public function test_report_id_has_no_local_foreign_key_and_actor_columns_restrict(): void
    {
        $fks = DB::select("SELECT conname, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='report_escalations'::regclass AND contype='f'");
        foreach ($fks as $fk) {
            $this->assertStringContainsString('ON DELETE RESTRICT', $fk->def);
            $this->assertStringContainsString('REFERENCES users(id)', $fk->def);
        }
        // A fabricated local "report" row must remain provable: no FK target exists.
        $this->assertStringNotContainsString('report_id', implode(' ', array_column($fks, 'def')));
        // And a deleted actor cannot silently erase provenance.
        DB::table('users')->where('id', 2)->delete();
        $this->insert();
        $this->expectException(QueryException::class);
        DB::table('report_escalations')->insert($this->episode(['created_by' => 2, 'closed_by' => 2, 'closed_at' => now(), 'status' => 'closed']));
    }

    public function test_status_vocabulary_is_exactly_open_or_closed(): void
    {
        $this->assertTrue($this->refuses(['status' => 'pending']));
        $this->assertTrue($this->refuses(['status' => 'OPEN']));
        $this->insert(['status' => 'open']);
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'closure_note' => 'Concluded without a recommendation.']);
        $this->assertSame(2, DB::table('report_escalations')->count());
    }

    public function test_only_one_open_episode_per_report_but_many_closed_ones_are_allowed(): void
    {
        $this->insert();
        $this->assertTrue($this->refuses(), 'A second OPEN episode for the same report is refused.');

        // Close the standing episode, then prove repeated consult/close cycles
        // accumulate as history rather than colliding.
        DB::table('report_escalations')->where('status', 'open')->update(['status' => 'closed',
            'closed_by' => 1, 'closed_at' => now(), 'closure_note' => 'First episode concluded.']);
        foreach ([1, 2, 3] as $n) {
            $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
                'recommendation' => "Answer {$n}", 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]);
            $this->insert();
            DB::table('report_escalations')->where('status', 'open')->update(['status' => 'closed',
                'closed_by' => 1, 'closed_at' => now(), 'closure_note' => "Episode {$n} concluded."]);
        }
        // The cycle ends with every episode closed, and all four are retained.
        $this->assertSame(0, DB::table('report_escalations')->where('report_id', self::REPORT)->where('status', 'open')->count());
        $this->assertSame(7, DB::table('report_escalations')->where('status', 'closed')->count());
        // A DIFFERENT report may hold its own open episode alongside nothing.
        $this->insert(['report_id' => self::OTHER]);
        $this->assertSame(1, DB::table('report_escalations')->where('status', 'open')->count());
    }

    public function test_open_row_cannot_carry_any_closure_provenance_and_closed_row_cannot_omit_it(): void
    {
        $this->assertTrue($this->refuses(['closed_by' => 1]), 'An open episode may not name a closer.');
        $this->assertTrue($this->refuses(['closed_at' => now()]), 'An open episode may not carry a close time.');
        $this->assertTrue($this->refuses(['closure_note' => 'Closed early.']),
            'An open episode may not carry a closure note; it has not ended yet.');
        $this->assertTrue($this->refuses(['status' => 'closed']), 'A closed episode must name who closed it.');
        $this->assertTrue($this->refuses(['status' => 'closed', 'closed_by' => 1]), 'A closed episode must be timestamped.');
        $this->insert();
        $this->assertSame(1, DB::table('report_escalations')->count());
    }

    public function test_closure_note_presence_is_exactly_what_the_state_allows(): void
    {
        // CLOSED with a recommendation and NO closure note: allowed.
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'recommendation' => 'Roll back batch 3.', 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]);
        // CLOSED with no recommendation and a non-blank note: allowed.
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'closure_note' => 'Support channel unavailable; escalation cancelled.']);
        // CLOSED with neither: refused.
        $this->assertTrue($this->refuses(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now()]),
            'A closure must be explainable by a recommendation or a note.');
        // OPEN with a closure note: refused, even with a recommendation.
        $this->assertTrue($this->refuses([
            'recommendation' => 'Answer.', 'recommendation_recorded_by' => 1, 'recommendation_at' => now(),
            'closure_note' => 'Premature.',
        ]), 'An open episode must never carry closure provenance.');
        $this->assertSame(2, DB::table('report_escalations')->count());
        $this->assertSame(0, DB::table('report_escalations')->whereNotNull('closure_note')
            ->where('status', 'open')->count());
    }

    #[DataProvider('incoherentRecommendations')]
    public function test_recommendation_actor_and_time_must_move_together(array $changes): void
    {
        $this->assertTrue($this->refuses($changes));
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public static function incoherentRecommendations(): array
    {
        return [
            'text without actor' => [['recommendation' => 'Fix it.']],
            'text with actor but no time' => [['recommendation' => 'Fix it.', 'recommendation_recorded_by' => 1]],
            'time without text' => [['recommendation_at' => '2026-10-05 10:00:00']],
            'actor and time without text' => [['recommendation_recorded_by' => 1, 'recommendation_at' => '2026-10-05 10:00:00']],
        ];
    }

    #[DataProvider('unusableText')]
    public function test_blank_or_oversized_text_is_unrepresentable(array $changes): void
    {
        $this->assertTrue($this->refuses($changes));
        $this->assertSame(0, DB::table('report_escalations')->count());
    }

    public static function unusableText(): array
    {
        return [
            'whitespace recommendation' => [['recommendation' => "  \t\n ", 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]],
            'oversized recommendation' => [['recommendation' => str_repeat('x', 2001), 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]],
            'whitespace closure note' => [['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(), 'closure_note' => '   ']],
            'oversized closure note' => [['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(), 'closure_note' => str_repeat('y', 2001)]],
            'closure note on an open episode' => [['closure_note' => 'Closed early.']],
            'closure note on an open episode with a recommendation' => [['recommendation' => 'Answer.', 'recommendation_recorded_by' => 1, 'recommendation_at' => now(), 'closure_note' => 'Premature.']],
        ];
    }

    public function test_closure_must_always_be_explainable(): void
    {
        // No recommendation AND no closure note: unrepresentable.
        $this->assertTrue($this->refuses(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now()]));
        // Recommendation present, closure note optional.
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'recommendation' => 'Roll back batch 3.', 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]);
        // No recommendation, closure note required.
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'closure_note' => 'Support channel unavailable; escalation cancelled.']);
        // An OPEN episode needs neither: it is not closed yet.
        $this->insert();
        $this->assertSame(3, DB::table('report_escalations')->count());
    }

    public function test_exact_limits_are_accepted_not_merely_rejected(): void
    {
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'recommendation' => str_repeat('x', 2000), 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]);
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'closure_note' => str_repeat('y', 2000)]);
        $this->assertSame(2, DB::table('report_escalations')->count());
    }

    // ── SAFE DOWN ────────────────────────────────────────────────────────────

    public function test_empty_table_rolls_back_and_absent_table_is_a_noop(): void
    {
        $this->runMigration('down');
        $this->assertFalse(Schema::hasTable('report_escalations'));
        $this->runMigration('down');
        $this->assertFalse(Schema::hasTable('report_escalations'));
    }

    public function test_populated_rollback_refuses_and_preserves_every_row_and_constraint(): void
    {
        $this->insert();
        $before = DB::table('report_escalations')->get()->all();
        $indexes = DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='report_escalations' ORDER BY indexname");
        try {
            $this->runMigration('down');
            $this->fail('Populated rollback must refuse.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('Refusing to destroy', $e->getMessage());
        }
        $this->assertTrue(Schema::hasTable('report_escalations'));
        $this->assertEquals($before, DB::table('report_escalations')->get()->all());
        $this->assertEquals($indexes, DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='report_escalations' ORDER BY indexname"));
        $this->assertSame(0, DB::transactionLevel());
    }

    // ── CONCURRENCY ──────────────────────────────────────────────────────────

    public function test_advisory_lock_keys_are_deterministic_report_specific_and_signed(): void
    {
        $keys = ReportLifecycleLock::keys(self::REPORT);
        $this->assertSame($keys, ReportLifecycleLock::keys(self::REPORT));
        $this->assertSame($keys, ReportLifecycleLock::keys(strtoupper(self::REPORT)));
        $this->assertNotSame($keys, ReportLifecycleLock::keys(self::OTHER));
        foreach ($keys as $key) {
            $this->assertGreaterThanOrEqual(PHP_INT_MIN, $key);
            $this->assertLessThanOrEqual(PHP_INT_MAX, $key);
        }
        // A UUID whose leading 32 bits exceed the signed range must still produce a
        // valid negative int32 rather than overflowing into the positive range.
        $this->assertLessThan(0, ReportLifecycleLock::keys('ffffffff-ffff-4fff-8fff-ffffffffffff')[0]);
    }

    public function test_a_racing_escalation_insert_blocks_until_the_holder_rolls_back(): void
    {
        $second = $this->secondConnection();
        $second->exec("SET lock_timeout = '250ms'");
        $sql = "INSERT INTO report_escalations (report_id, status, created_by, created_at)
                VALUES ('".self::REPORT."','open',1,'2026-10-05 09:00:00')";

        DB::beginTransaction();
        try {
            DB::statement('LOCK TABLE public.report_escalations IN ACCESS EXCLUSIVE MODE');
            try {
                $second->exec($sql);
                $this->fail('A racing insert must be blocked, not silently accepted.');
            } catch (\PDOException $e) {
                $this->assertSame('55P03', $e->errorInfo[0]);
            }
        } finally {
            DB::rollBack();
        }
        $this->assertSame(1, $second->exec($sql));
        $this->assertSame(1, DB::table('report_escalations')->count());
    }

    /**
     * The load-bearing concurrency proof.
     *
     * One connection holds the report lifecycle lock and creates the open
     * escalation. A second connection, holding the SAME advisory lock in its own
     * transaction, must therefore block - which is exactly what stops a terminal
     * CAS from committing while an escalation is open. When the holder commits,
     * the waiter proceeds and is stopped by the partial unique index instead, so
     * the only reachable end state is one open episode.
     */
    public function test_escalation_open_and_a_competing_writer_cannot_both_succeed(): void
    {
        $keys = ReportLifecycleLock::keys(self::REPORT);
        $this->insert();

        DB::beginTransaction();
        try {
            app(ReportLifecycleLock::class)->acquire(self::REPORT);
            $this->assertSame(1, DB::transactionLevel());

            $waiter = $this->secondConnection();
            $waiter->exec("SET lock_timeout = '250ms'");
            $blocked = false;
            try {
                $waiter->exec('SELECT pg_advisory_xact_lock('.$keys[0].','.$keys[1].')');
            } catch (\PDOException $e) {
                $blocked = '55P03' === $e->errorInfo[0];
            }
            $this->assertTrue($blocked, 'The same report UUID must serialize a second lifecycle writer.');
        } finally {
            DB::commit();
        }
        $this->assertSame(0, DB::transactionLevel());

        // After the lock is released, the partial index is the backstop.
        $this->assertTrue($this->refuses(), 'A competing open episode is refused even once the lock is free.');
        $this->assertSame(1, DB::table('report_escalations')->where('status', 'open')->count());
    }

    public function test_a_different_report_uuid_does_not_block(): void
    {
        DB::beginTransaction();
        try {
            app(ReportLifecycleLock::class)->acquire(self::REPORT);
            $this->insert(['report_id' => self::OTHER]);
            $this->assertSame(1, DB::table('report_escalations')->count(), 'Unrelated reports must not serialize against each other.');
        } finally {
            DB::commit();
        }
    }

    public function test_model_reflects_the_real_schema_without_timestamps(): void
    {
        $this->insert(['status' => 'closed', 'closed_by' => 1, 'closed_at' => now(),
            'recommendation' => 'Answer.', 'recommendation_recorded_by' => 1, 'recommendation_at' => now()]);
        $row = ReportEscalation::query()->firstOrFail();
        $this->assertFalse((new ReportEscalation)->usesTimestamps());
        $this->assertFalse($row->isOpen());
        $this->assertSame('Answer.', $row->recommendation);
        $this->assertSame(1, $row->closer->id);
        $this->assertInstanceOf(\Illuminate\Support\Carbon::class, $row->closed_at);
    }

    private function secondConnection(): \PDO
    {
        return new \PDO('pgsql:host=127.0.0.1;port='.getenv('REPORTS_TEST_PG_PORT').';dbname=reports_support_escalation_test',
            'postgres', '', [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
    }
}