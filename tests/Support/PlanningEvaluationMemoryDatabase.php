<?php

namespace Tests\Support;

use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Bootstrap\BootProviders;
use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Queue\Jobs\DatabaseJob;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;

/** Shared isolated D8 fixture: no credentials, persistent database or migrations. */
trait PlanningEvaluationMemoryDatabase
{
    public function createApplication()
    {
        $app = require dirname(__DIR__, 2).'/bootstrap/app.php';
        $this->traitsUsedByTest = array_flip(class_uses_recursive(static::class));
        // Never load local credentials, and remove every external DB connection
        // before providers or the test lifecycle can resolve a connection.
        $app->loadEnvironmentFrom('.env.planning-evaluation-unused');
        $app->afterBootstrapping(LoadConfiguration::class, function ($app) {
            $app->detectEnvironment(fn () => 'testing');
            $app['config']->set([
                'app.env' => 'testing', 'app.key' => str_repeat('x', 32),
                'database.default' => 'sqlite',
                'database.connections' => ['sqlite' => [
                    'driver' => 'sqlite', 'database' => ':memory:', 'url' => null,
                    'prefix' => '', 'foreign_key_constraints' => true,
                ]],
                'cache.default' => 'array', 'session.driver' => 'array', 'hashing.bcrypt.rounds' => 4,
                'queue.default' => 'database', 'logging.default' => 'null',
                'queue.connections.database.connection' => 'sqlite',
                'queue.connections.database.table' => 'jobs',
                'queue.connections.database.after_commit' => false,
                'app.origin_secret' => '', 'app.allowed_ips' => [],
                'bridge.source_id' => 'planning-evaluation-test',
                'services.supabase.url' => 'https://evaluation.test',
                'services.supabase.key' => 'test-only',
                'services.supabase.anon_key' => 'test-only',
                'services.supabase.service_key' => 'test-only',
            ]);
        });
        $app->beforeBootstrapping(BootProviders::class, function () {
            Http::preventStrayRequests();
            Http::fake(['https://evaluation.test/*' => Http::response([], 201)]);
        });
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function queuedJobs(string $class)
    {
        return DB::table('jobs')->orderBy('id')->get()->map(fn ($row) => json_decode($row->payload, true))
            ->filter(fn ($payload) => $payload['data']['commandName'] === $class)
            ->map(fn ($payload) => unserialize($payload['data']['command']));
    }

    protected function runNextJob(): DatabaseJob
    {
        // Native reservation/handler/ack, bounded manually; never start a worker.
        $job = Queue::connection()->pop();
        $this->assertInstanceOf(DatabaseJob::class, $job);
        $this->assertSame(0, DB::transactionLevel());
        $this->assertFalse(DB::connection()->getPdo()->inTransaction());
        $job->fire();
        return $job;
    }

    protected function assertNoTransportHttp(): void
    {
        // Legacy status-tracker HTTP is explicitly outside this D8 correction.
        Http::assertNotSent(fn ($request) => !str_contains($request->url(), '/application_status_tracks'));
    }

    protected function createMemoryTables(): void
    {
        // A deliberately small contract schema. No production migrations execute.
        $tables = [
            'users' => ['name' => 'string', 'email' => 'string', 'password' => 'string', 'role' => 'string',
                'is_active' => 'boolean', 'handshake_key' => 'string'],
            'zoning_applications' => ['reference_number' => 'string',
                'application_stream' => 'string', 'status' => 'string', 'applicant_name' => 'string',
                'contact_number' => 'string', 'encoded_by' => 'unsignedBigInteger',
                'assigned_planning_officer_id' => 'unsignedBigInteger', 'purpose' => 'string', 'barangay' => 'string'],
            'zoning_application_types' => ['zoning_application_id' => 'unsignedBigInteger', 'application_type' => 'string'],
            'parcels' => ['zoning_application_id' => 'unsignedBigInteger', 'parcel_code' => 'string',
                'latitude' => 'double', 'longitude' => 'double'],
            'site_inspections' => ['zoning_application_id' => 'unsignedBigInteger', 'parcel_id' => 'unsignedBigInteger',
                'inspector_id' => 'unsignedBigInteger', 'assigned_by_imaps_user_id' => 'unsignedBigInteger',
                'assigned_by_name' => 'string', 'status' => 'string', 'scheduled_date' => 'date', 'deadline_date' => 'date',
                'assigned_notes' => 'text', 'completed_at' => 'timestamp', 'submitted_at' => 'timestamp',
                'findings' => 'text', 'is_compliant' => 'boolean', 'observations' => 'text', 'discrepancies' => 'text', 'recommendations' => 'text',
                'inspector_notes' => 'text', 'inspection_result' => 'string', 'checklist_data' => 'json',
                'confirmed_latitude' => 'double', 'confirmed_longitude' => 'double', 'gps_accuracy_m' => 'double',
                'gps_confirmed_at' => 'timestamp', 'delivery_status' => 'string', 'last_delivery_attempt_at' => 'timestamp',
                'delivered_at' => 'timestamp', 'last_delivery_failure_category' => 'string'],
            'technical_reviews' => ['zoning_application_id' => 'unsignedBigInteger', 'parcel_id' => 'unsignedBigInteger',
                'reviewed_by' => 'unsignedBigInteger', 'review_round' => 'integer', 'decision' => 'string',
                'findings' => 'text', 'decision_reason' => 'text', 'site_inspection_task_id' => 'unsignedBigInteger',
                'reviewed_site_inspection_id' => 'unsignedBigInteger', 'reviewed_at' => 'timestamp'],
            'site_inspection_assignments' => ['site_inspection_id' => 'unsignedBigInteger', 'assignment_type' => 'string',
                'from_inspector_id' => 'unsignedBigInteger', 'to_inspector_id' => 'unsignedBigInteger',
                'reason' => 'string', 'reason_note' => 'text', 'reassigned_by' => 'unsignedBigInteger', 'reassigned_at' => 'timestamp'],
            'notifications' => ['user_id' => 'unsignedBigInteger', 'title' => 'string', 'message' => 'text',
                'type' => 'string', 'action_url' => 'string', 'is_read' => 'boolean', 'read_at' => 'timestamp'],
            'audit_trail' => ['application_id' => 'unsignedBigInteger', 'action' => 'string',
                'performed_by' => 'unsignedBigInteger', 'note' => 'text', 'performed_at' => 'timestamp'],
            'application_status_tracks' => ['reference_number' => 'string', 'form_number' => 'string',
                'contact_number' => 'string', 'masked_applicant_name' => 'string', 'application_type' => 'string',
                'business_name' => 'string', 'status' => 'string', 'stage_order' => 'integer', 'note' => 'text',
                'scheduled_date' => 'date'],
        ];
        foreach ($tables as $name => $columns) {
            Schema::create($name, function (Blueprint $table) use ($columns) {
                $table->id();
                foreach ($columns as $name => $type) {
                    $table->{$type}($name)->nullable();
                }
                $table->timestamps();
            });
        }
        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->string('queue');
            $table->longText('payload');
            $table->unsignedTinyInteger('attempts');
            $table->unsignedInteger('reserved_at')->nullable();
            $table->unsignedInteger('available_at');
            $table->unsignedInteger('created_at');
        });
        Schema::create('inspection_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('site_inspection_id');
            $table->integer('attempt_number');
            foreach (['source', 'outcome', 'failure_category', 'safe_message', 'queue_job_uuid'] as $column) {
                $table->string($column)->nullable();
            }
            foreach (['attempted_at', 'completed_at', 'created_at'] as $column) {
                $table->timestamp($column)->nullable();
            }
            $table->unique(['site_inspection_id', 'attempt_number']);
        });
    }
}
