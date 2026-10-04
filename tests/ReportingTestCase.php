<?php

namespace Tests;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Schema;

/** Disposable local tables + strict fake remote transport; never touches deployed data. */
abstract class ReportingTestCase extends TestCase
{
    protected array $remote = [];
    protected array $calls = [];
    protected bool $remoteFails = false;
    /** Only handling tests opt into a controlled write transport; reads stay strict. */
    protected ?\Closure $remoteWrite = null;
    /**
     * Optional per-table remote failure, e.g. ['profiles'].
     *
     * Additive and inert by default, so a suite that wants ONE remote table to
     * answer 503 can ask for it without a second Http::fake - which Laravel
     * would place BEHIND the setUp fake, making it unreachable.
     */
    protected array $remoteTableFails = [];
    protected User $admin;
    protected User $po;
    protected User $other;
    protected const APP = '10000000-0000-4000-8000-000000000001';
    protected const JOB = '20000000-0000-4000-8000-000000000001';
    protected const REPORT = '30000000-0000-4000-8000-000000000001';
    protected const LEGACY = '0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d';

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', config('database.default'));
        $this->assertSame(':memory:', config('database.connections.sqlite.database'));
        config(['bridge.source_id' => 'source-a', 'services.supabase.url' => 'https://reporting.test',
            'services.supabase.anon_key' => 'test-public', 'services.supabase.service_key' => 'test-server']);
        Schema::create('users', function ($t) {
            $t->id(); $t->string('name'); $t->string('email'); $t->string('password'); $t->string('role');
            $t->boolean('is_active')->default(true); $t->string('handshake_key')->nullable(); $t->timestamps();
        });
        Schema::create('zoning_applications', function ($t) {
            $t->id(); $t->string('reference_number'); $t->string('applicant_name'); $t->string('barangay')->nullable();
            $t->unsignedBigInteger('assigned_planning_officer_id')->nullable();
        });
        Schema::create('site_inspections', function ($t) {
            $t->id(); $t->unsignedBigInteger('zoning_application_id'); $t->unsignedBigInteger('parcel_id')->nullable();
        });
        Schema::create('notifications', function ($t) {
            $t->id(); $t->unsignedBigInteger('user_id')->nullable(); $t->string('title'); $t->text('message');
            $t->string('type'); $t->string('action_url')->nullable(); $t->boolean('is_read')->default(false);
            $t->timestamp('read_at')->nullable(); $t->timestamps();
        });
        // Development Support escalation episodes. Created here, empty, because
        // ReportingVisibility consults ReportEscalationGate on EVERY report, so
        // every reporting suite needs the table to exist before it can assert
        // anything about handling authority. The real CHECK constraints and the
        // advisory lock live in tests/Integration/ReportEscalationsPostgresTest.php.
        Schema::create('report_escalations', function ($t) {
            $t->id(); $t->uuid('report_id'); $t->string('status', 20)->default('open');
            $t->unsignedBigInteger('created_by'); $t->timestamp('created_at')->useCurrent();
            $t->text('recommendation')->nullable(); $t->unsignedBigInteger('recommendation_recorded_by')->nullable();
            $t->timestamp('recommendation_at')->nullable(); $t->unsignedBigInteger('closed_by')->nullable();
            $t->timestamp('closed_at')->nullable(); $t->text('closure_note')->nullable();
            $t->index(['report_id', 'created_at'], 'report_escalations_report_created_idx');
        });
        DB::statement('CREATE UNIQUE INDEX report_escalations_one_open_per_report ON report_escalations (report_id) WHERE status = \'open\'');
        $this->admin = $this->user('Admin', 'Admin');
        $this->po = $this->user('Planning Officer', 'Current PO');
        $this->other = $this->user('Planning Officer', 'Next PO');
        DB::table('zoning_applications')->insert(['id' => 1, 'reference_number' => 'APP-TEST-001', 'applicant_name' => 'Test Applicant', 'barangay' => 'Test Barangay', 'assigned_planning_officer_id' => $this->po->id]);
        DB::table('site_inspections')->insert([['id' => 9, 'zoning_application_id' => 1, 'parcel_id' => 3], ['id' => 11, 'zoning_application_id' => 1, 'parcel_id' => 3]]);
        $this->remote = [
            'diagnostic_reports' => [$this->support(), $this->technical()],
            'field_jobs' => [['id' => self::JOB, 'bridge_source_id' => 'source-a', 'supabase_application_id' => self::APP, 'local_inspection_id' => 11]],
            'supabase_zoning_applications' => [['id' => self::APP, 'bridge_source_id' => 'source-a', 'local_application_id' => 1]],
        ];
        Http::preventStrayRequests();
        Http::fake(function ($request) {
            if ($request->method() !== 'GET' && $this->remoteWrite !== null) {
                return ($this->remoteWrite)($request);
            }
            $this->assertSame('GET', $request->method(), 'Reporting must never write remotely.');
            if ($this->remoteFails) {
                return Http::response([], 503);
            }
            $table = basename(parse_url($request->url(), PHP_URL_PATH));
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $params);
            $this->calls[] = [$table, $params];
            if (in_array($table, $this->remoteTableFails, true)) {
                return Http::response([], 503);
            }
            $rows = $this->remote[$table] ?? [];
            foreach ($params as $key => $value) {
                if (str_starts_with($value, 'eq.')) {
                    $rows = array_values(array_filter($rows, fn ($r) => (string) ($r[$key] ?? '') === substr($value, 3)));
                } elseif (str_starts_with($value, 'in.(')) {
                    $ids = explode(',', substr($value, 4, -1));
                    $rows = array_values(array_filter($rows, fn ($r) => in_array($r[$key] ?? null, $ids, true)));
                }
            }
            $rows = array_slice($rows, (int) ($params['offset'] ?? 0), min(100, (int) ($params['limit'] ?? 100)));
            return Http::response($rows);
        });
        $this->withoutVite();
    }

    protected function user(string $role, string $name): User
    {
        return User::forceCreate(['name' => $name, 'email' => uniqid().'@test.local', 'password' => 'test', 'role' => $role, 'is_active' => true]);
    }

    protected function support(array $changes = []): array
    {
        return array_replace(['id' => self::REPORT, 'reference_code' => 'DR-TEST-0002', 'title' => 'Please clarify',
            'report_type' => 'application_support', 'field_job_id' => self::JOB, 'supabase_application_id' => self::APP,
            'bridge_source_id' => 'source-a', 'support_category' => 'clarification_request', 'status' => 'submitted',
            'summary' => 'Inspector concern', 'inspector_id' => '40000000-0000-4000-8000-000000000001',
            'created_at' => '2026-10-03T00:00:00Z'], $changes);
    }

    protected function technical(): array
    {
        return $this->support(['id' => self::LEGACY, 'reference_code' => 'DR-2026-0001', 'title' => 'Legacy GPS issue',
            'report_type' => 'technical_issue', 'field_job_id' => null, 'supabase_application_id' => null,
            'bridge_source_id' => null, 'support_category' => null]);
    }
}
