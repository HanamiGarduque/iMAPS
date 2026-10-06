<?php

namespace Tests\Integration;

use App\Services\ReportActionAudit;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/** Run with tests/run-report-action-postgres.ps1: fresh loopback-only PostgreSQL cluster. */
class ReportActionAuditPostgresTest extends TestCase
{
    private const MIGRATION = 'database/migrations/2026_10_04_000000_create_report_action_audit_table.php';
    private object $migration;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertNotFalse(getenv('REPORTS_TEST_PG_PORT'), 'Use the disposable cluster runner.');
        $this->assertNotFalse(getenv('REPORTS_TEST_PG_DATA'), 'Disposable ownership evidence is required.');
        config(['database.default' => 'report_action_disposable', 'database.connections.report_action_disposable' => [
            'driver' => 'pgsql', 'host' => '127.0.0.1', 'port' => (int) getenv('REPORTS_TEST_PG_PORT'),
            'database' => 'reports_support_phase2b_test', 'username' => 'postgres', 'password' => '',
            'charset' => 'utf8', 'prefix' => '', 'search_path' => 'public', 'sslmode' => 'disable',
        ]]);
        $actual = DB::selectOne('SELECT current_database() AS db, current_setting(\'data_directory\') AS dir');
        $this->assertSame('reports_support_phase2b_test', $actual->db);
        $this->assertSame(str_replace('\\', '/', getenv('REPORTS_TEST_PG_DATA')), str_replace('\\', '/', $actual->dir));
        $this->assertStringContainsString('/reports-phase2b-pg-', str_replace('\\', '/', $actual->dir));
        // Destructive fixture setup is reachable only after proving this is our disposable cluster.
        Schema::dropAllTables();
        Schema::create('users', function ($t) { $t->id(); $t->string('name'); });
        DB::table('users')->insert([['id' => 1, 'name' => 'Actor'], ['id' => 2, 'name' => 'Other actor']]);
        $this->migration = require base_path(self::MIGRATION);
        $this->runMigration('up');
    }

    private function runMigration(string $direction): void
    {
        // Exercise Laravel's real transaction wrapper, including rollback on refusal.
        $method = new \ReflectionMethod(app('migrator'), 'runMigration');
        $method->invoke(app('migrator'), $this->migration, $direction);
    }

    private function event(array $changes = []): array
    {
        return array_replace(['report_id' => '30000000-0000-4000-8000-000000000001', 'action' => 'report_resolved',
            'from_status' => 'submitted', 'to_status' => 'resolved', 'performed_by' => 1, 'performed_by_name' => 'Actor',
            'performed_at' => '2026-10-04 09:30:00'], $changes);
    }

    public function test_74_empty_table_can_roll_back_and_absent_table_is_a_noop(): void
    {
        $this->runMigration('down');
        $this->assertFalse(Schema::hasTable('report_action_audit'));
        $this->runMigration('down');
        $this->assertFalse(Schema::hasTable('report_action_audit'));
    }

    public function test_75_76_77_populated_rollback_refuses_and_preserves_all_rows_and_constraints(): void
    {
        DB::table('report_action_audit')->insert($this->event());
        $before = DB::table('report_action_audit')->get()->all();
        $indexes = DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='report_action_audit' ORDER BY indexname");
        try {
            $this->runMigration('down');
            $this->fail('Populated rollback must refuse.');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('refusing to destroy', $e->getMessage());
        }
        $this->assertTrue(Schema::hasTable('report_action_audit'));
        $this->assertEquals($before, DB::table('report_action_audit')->get()->all());
        $this->assertEquals($indexes, DB::select("SELECT indexname, indexdef FROM pg_indexes WHERE tablename='report_action_audit' ORDER BY indexname"));
        $this->assertSame(0, DB::transactionLevel());
    }

    public function test_79_racing_insert_blocks_until_rollback_then_succeeds_without_drop(): void
    {
        $second = new \PDO('pgsql:host=127.0.0.1;port='.getenv('REPORTS_TEST_PG_PORT').';dbname=reports_support_phase2b_test', 'postgres', '', [\PDO::ATTR_ERRMODE => \PDO::ERRMODE_EXCEPTION]);
        $second->exec("SET lock_timeout = '250ms'");
        $sql = "INSERT INTO report_action_audit (report_id, action, from_status, to_status, performed_by, performed_by_name)
            VALUES ('30000000-0000-4000-8000-000000000001','report_review_started','submitted','in_review',1,'Actor')";
        DB::beginTransaction();
        try {
            DB::statement('LOCK TABLE public.report_action_audit IN ACCESS EXCLUSIVE MODE');
            $this->assertSame(0, DB::table('report_action_audit')->count());
            try {
                $second->exec($sql);
                $this->fail('Racing insert must be blocked.');
            } catch (\PDOException $e) {
                $this->assertSame('55P03', $e->errorInfo[0]);
            }
        } finally {
            DB::rollBack();
        }
        $this->assertSame(1, $second->exec($sql));
        $this->assertSame(1, DB::table('report_action_audit')->count());
    }

    public function test_same_action_real_23505_is_absorbed_only_for_identical_event_excluding_time(): void
    {
        $recorder = app(ReportActionAudit::class);
        $this->assertSame('recorded', $recorder->record($this->event())['outcome']);
        $this->assertSame('already_recorded', $recorder->record($this->event(['performed_at' => '2026-10-05 00:00:00']))['outcome']);
        $this->assertSame(1, DB::table('report_action_audit')->count());
        $this->assertSame('2026-10-04 09:30:00', DB::table('report_action_audit')->value('performed_at'));
    }

    public static function mismatches(): array
    {
        return [[['from_status' => 'in_review']], [['performed_by' => 2]], [['performed_by_name' => 'Renamed actor']]];
    }

    #[DataProvider('mismatches')]
    public function test_same_action_real_23505_mismatch_preserves_original_and_logs_critical(array $change): void
    {
        Log::spy();
        $recorder = app(ReportActionAudit::class);
        $recorder->record($this->event());
        $before = DB::table('report_action_audit')->first();
        $this->assertSame('conflict', $recorder->record($this->event($change))['outcome']);
        $this->assertEquals($before, DB::table('report_action_audit')->first());
        Log::shouldHaveReceived('critical')->once();
    }

    public function test_opposite_terminal_real_partial_index_23505_never_absorbed(): void
    {
        Log::spy();
        $recorder = app(ReportActionAudit::class);
        $recorder->record($this->event());
        $result = $recorder->record($this->event(['action' => 'report_wont_fix', 'to_status' => 'wont_fix']));
        $this->assertSame(['outcome' => 'conflict', 'classification' => 'opposite_terminal'], $result);
        $this->assertSame('report_resolved', DB::table('report_action_audit')->value('action'));
        Log::shouldHaveReceived('critical')->once();
    }

    public function test_applied_schema_has_exact_columns_checks_indexes_and_two_event_ceiling(): void
    {
        $this->assertSame(['id', 'report_id', 'action', 'from_status', 'to_status', 'performed_by', 'performed_by_name', 'performed_at'], Schema::getColumnListing('report_action_audit'));
        $this->assertCount(4, DB::select("SELECT conname FROM pg_constraint WHERE conrelid='report_action_audit'::regclass AND contype='c'"));
        $this->assertCount(4, DB::select("SELECT indexname FROM pg_indexes WHERE tablename='report_action_audit'"));
        $recorder = app(ReportActionAudit::class);
        $this->assertSame('recorded', $recorder->record($this->event(['action' => 'report_review_started', 'to_status' => 'in_review']))['outcome']);
        $this->assertSame('recorded', $recorder->record($this->event(['from_status' => 'in_review']))['outcome']);
        $this->assertSame('conflict', $recorder->record($this->event(['action' => 'report_wont_fix', 'from_status' => 'in_review', 'to_status' => 'wont_fix']))['outcome']);
        $this->assertSame(2, DB::table('report_action_audit')->count());
    }
}
