<?php

namespace Tests\Feature;

use App\Jobs\PushInspectionToSupabase;
use App\Jobs\PushPlanningReviewToSupabase;
use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\TechnicalReview;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\InspectionDeliveryRecorder;
use App\Services\SupabaseService;
use App\Services\WorkAssignmentService;
use App\Support\InspectionRoundNumbering;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Bootstrap\BootProviders;
use Illuminate\Foundation\Bootstrap\LoadConfiguration;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Queue\Events\JobProcessing;
use Illuminate\Queue\SyncQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use Tests\Support\FakePostgRest;

/** Real controller/model regressions, with no migrations or persistent database. */
class PlanningEvaluationTest extends TestCase
{
    private const REASON = 'Controlled Issue D reinspection context test';

    private User $officer;
    private User $inspector;
    private ZoningApplication $application;
    private Parcel $parcel;
    private SiteInspection $roundOne;
    private TechnicalReview $initialReview;
    private array $roundSnapshot;
    private array $reviewSnapshot;
    private array $ownershipSnapshot;

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
                'queue.default' => 'sync', 'logging.default' => 'null',
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
            Queue::fake();
        });
        $app->make(Kernel::class)->bootstrap();

        return $app;
    }

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        $this->assertSame('', DB::selectOne('PRAGMA database_list')->file);
        $this->withoutVite();
        $this->travelTo(now()->setDate(2026, 10, 11)->setTime(12, 0));
        $this->createMemoryTables();
        $this->officer = User::forceCreate(['name' => 'Test PO', 'email' => 'po@evaluation.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
        $oldInspector = User::forceCreate(['name' => 'Round 1 Inspector', 'email' => 'old@evaluation.test',
            'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => 'test-old']);
        $this->inspector = User::forceCreate(['name' => 'Round 2 Inspector', 'email' => 'new@evaluation.test',
            'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => 'test-new']);
        $this->actingAs($this->officer);
        $this->application = ZoningApplication::create(['reference_number' => 'APP-EVALUATION-TEST',
            'application_type' => 'Zoning Certificate', 'application_stream' => 'standard',
            'status' => 'Technical Review', 'applicant_name' => 'Synthetic Applicant',
            'contact_number' => '09000000000', 'encoded_by' => $this->officer->id]);
        $this->parcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-01', 'latitude' => 13.85, 'longitude' => 121.2]);
        $this->roundOne = SiteInspection::create(['zoning_application_id' => $this->application->id,
            'parcel_id' => $this->parcel->id, 'inspector_id' => $oldInspector->id,
            'assigned_by_imaps_user_id' => $this->officer->id, 'assigned_by_name' => $this->officer->name,
            'scheduled_date' => '2026-09-21', 'deadline_date' => '2026-09-25',
            'assigned_notes' => 'Original instructions', 'status' => 'completed',
            'completed_at' => '2026-09-22 10:00:00', 'submitted_at' => '2026-09-22 10:00:00',
            'findings' => 'Original findings', 'observations' => 'Original observations',
            'discrepancies' => 'Original discrepancy', 'recommendations' => 'Verify setback',
            'inspector_notes' => 'Original notes', 'inspection_result' => 'Requires Reinspection',
            'checklist_data' => [['item' => 'setback', 'passed' => false]],
            'confirmed_latitude' => 13.845, 'confirmed_longitude' => 121.206,
            'gps_accuracy_m' => 4.5, 'gps_confirmed_at' => '2026-09-22 09:00:00']);
        app(WorkAssignmentService::class)->recordInitialInspectorAssignment($this->roundOne, $this->officer);
        $this->initialReview = TechnicalReview::create(['zoning_application_id' => $this->application->id,
            'parcel_id' => $this->parcel->id, 'reviewed_by' => $this->officer->id,
            'review_round' => 1, 'decision' => 'Needs Site Inspection', 'findings' => 'Original review',
            'site_inspection_task_id' => $this->roundOne->id, 'reviewed_at' => '2026-09-20 12:00:00']);
        $this->roundSnapshot = $this->roundOne->fresh()->getAttributes();
        $this->reviewSnapshot = $this->initialReview->fresh()->getAttributes();
        $this->ownershipSnapshot = DB::table('site_inspection_assignments')->get()->toArray();
    }

    public static function finalDecisions(): array
    {
        return [
            'batch approve' => [true, 'Approved', 'For Release'],
            'batch decline' => [true, 'Declined', 'Denied'],
            'single approve' => [false, 'Approved', 'For Release'],
            'single decline' => [false, 'Declined', 'Denied'],
        ];
    }

    #[DataProvider('finalDecisions')]
    public function test_final_decisions_ignore_historical_assignment_fields(bool $batch, string $decision, string $status): void
    {
        $review = ['decision' => $decision, 'decision_reason' => $decision === 'Declined' ? 'Current reason' : null, 'findings' => 'Current notes',
            'inspector_id' => $this->roundOne->inspector_id, 'scheduled_date' => '2026-09-21',
            'deadline_date' => '2026-09-25', 'assigned_notes' => 'Original instructions'];
        $this->submit($review, $batch)->assertSessionHasNoErrors()->assertRedirect('/applications');
        $this->assertSame($status, $this->application->fresh()->status);
        $this->assertSame(1, SiteInspection::count());
        $latest = TechnicalReview::latest('id')->firstOrFail();
        $this->assertSame(2, (int) $latest->review_round);
        $this->assertSame($decision, $latest->decision);
        $this->assertSame($decision === 'Declined' ? 'Current reason' : null, $latest->decision_reason);
        $this->assertSame($this->roundOne->id, $latest->reviewed_site_inspection_id);
        $this->assertNull($latest->site_inspection_task_id);
        Queue::assertNotPushed(PushInspectionToSupabase::class);
        Queue::assertPushed(PushPlanningReviewToSupabase::class, fn ($job) =>
            $job->reviewedSiteInspectionId === $this->roundOne->id && $job->decision === $decision);
        $this->assertHistoryPreserved();
    }

    public static function reviewEndpoints(): array
    {
        return ['batch' => [true], 'single' => [false]];
    }

    #[DataProvider('reviewEndpoints')]
    public function test_reinspection_creates_a_clean_round_two_with_new_assignment_and_old_review_link(bool $batch): void
    {
        $this->submit(array_replace($this->assignment(), ['decision_reason' => "  ".self::REASON." \t\n "]), $batch)
            ->assertSessionHasNoErrors()->assertRedirect('/applications');
        $new = SiteInspection::latest('id')->firstOrFail();
        $review = TechnicalReview::latest('id')->firstOrFail();
        $this->assertSame(2, SiteInspection::count());
        $this->assertNotSame($this->roundOne->id, $new->id);
        $this->assertSame('assigned', $new->status);
        $this->assertSame($this->inspector->id, (int) $new->inspector_id);
        $this->assertSame('2026-10-14', $new->scheduled_date->toDateString());
        $this->assertSame('2026-10-18', $new->deadline_date->toDateString());
        $this->assertSame('Reverify setback with new photos', $new->assigned_notes);
        $this->assertSame(self::REASON, $review->decision_reason);
        $this->assertSame($this->officer->id, (int) $new->assigned_by_imaps_user_id);
        $this->assertSame($this->roundOne->id, $review->reviewed_site_inspection_id);
        $this->assertSame($new->id, (int) $review->site_inspection_task_id);
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertSame(1, InspectionRoundNumbering::forInspection($this->roundOne)['round_number']);
        $this->assertSame(2, InspectionRoundNumbering::forInspection($new)['round_number']);
        foreach (['findings', 'observations', 'discrepancies', 'recommendations', 'inspector_notes',
            'inspection_result', 'checklist_data', 'confirmed_latitude', 'confirmed_longitude',
            'gps_accuracy_m', 'gps_confirmed_at', 'completed_at', 'submitted_at'] as $field) {
            $this->assertNull($new->{$field}, "$field must not be inherited from Round 1");
        }
        $this->assertSame(1, $new->assignmentHistory()->count());
        Queue::assertPushed(PushInspectionToSupabase::class, fn ($job) => $job->inspection->id === $new->id);
        Queue::assertPushed(PushPlanningReviewToSupabase::class, fn ($job) =>
            $job->reviewedSiteInspectionId === $this->roundOne->id && $job->decisionReason === self::REASON);
        $this->assertHistoryPreserved();

        // Execute the real transports after submission; only HTTP and delivery
        // attempt allocation are replaced. This is not live queue/delivery proof.
        $rest = new FakePostgRest();
        foreach (['field_jobs' => 'local_inspection_id', 'supabase_zoning_applications' => 'local_application_id',
            'supabase_parcels' => 'local_parcel_id', 'field_job_reviews' => 'technical_review_id'] as $table => $key) {
            $rest->declareUniqueKeys($table, [['bridge_source_id', $key]]);
        }
        $oldJob = ['id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'bridge_source_id' => 'planning-evaluation-test', 'local_inspection_id' => $this->roundOne->id,
            'status' => 'completed', 'photo_paths' => ['round-one-test.jpg'], 'inspector_notes' => 'Original findings'];
        $rest->seed('field_jobs', $oldJob);
        Http::swap(new HttpFactory());
        Http::preventStrayRequests();
        Http::fake(['https://evaluation.test/*' => function (Request $request) use ($rest) {
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/profiles') {
                return Http::response([['id' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]);
            }
            return $rest->handle($request);
        }]);
        $recorder = $this->createPartialMock(InspectionDeliveryRecorder::class, ['beginAttempt']);
        $recorder->method('beginAttempt')->willReturn(null);
        Queue::pushed(PushInspectionToSupabase::class)->sole()->handle($recorder);
        Queue::pushed(PushPlanningReviewToSupabase::class)->sole()->handle(app(SupabaseService::class));
        $jobs = $rest->rows('field_jobs');
        $this->assertCount(2, $jobs);
        $this->assertSame($oldJob, $jobs[0]);
        $this->assertSame($new->id, $jobs[1]['local_inspection_id']);
        $this->assertNotSame($oldJob['id'], $jobs[1]['id']);
        $this->assertSame(2, $jobs[1]['inspection_round_number']);
        $this->assertSame($this->roundOne->id, $jobs[1]['previous_site_inspection_id']);
        $this->assertSame(self::REASON, $jobs[1]['reinspection_reason']);
        $this->assertSame('Reverify setback with new photos', $jobs[1]['assignment_instructions']);
        $this->assertSame($review->reviewed_at->toIso8601String(), $jobs[1]['reinspection_reviewed_at']);
        $reviews = $rest->rows('field_job_reviews');
        $this->assertCount(1, $reviews);
        $this->assertSame($review->id, $reviews[0]['technical_review_id']);
        $this->assertSame($oldJob['id'], $reviews[0]['field_job_id']);
        $this->assertSame($this->roundOne->id, $reviews[0]['reviewed_site_inspection_id']);
        $this->assertSame(self::REASON, $reviews[0]['decision_reason']);
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
        $this->assertSame($this->reviewSnapshot, $this->initialReview->fresh()->getAttributes());
        $this->assertEquals($this->ownershipSnapshot, DB::table('site_inspection_assignments')
            ->where('site_inspection_id', $this->roundOne->id)->get()->toArray());
    }

    public static function invalidAssignments(): array
    {
        return [
            'missing inspector' => [['inspector_id' => null], 'inspector_id'],
            'missing schedule' => [['scheduled_date' => null], 'inspector_id'],
            'missing deadline' => [['deadline_date' => null], 'inspector_id'],
            'historical schedule' => [['scheduled_date' => '2026-09-21'], 'scheduled_date'],
            'invalid schedule' => [['scheduled_date' => 'not-a-date'], 'scheduled_date'],
            'invalid deadline' => [['deadline_date' => 'not-a-date'], 'deadline_date'],
            'deadline before schedule' => [['deadline_date' => '2026-10-13'], 'deadline_date'],
            'missing instructions' => [['assigned_notes' => null], 'assigned_notes'],
            'blank instructions' => [['assigned_notes' => '   '], 'assigned_notes'],
            'wrong-role inspector' => [['inspector_id' => 1], 'inspector_id'],
        ];
    }

    #[DataProvider('invalidAssignments')]
    public function test_invalid_reinspection_is_rejected_without_changing_history(array $override, string $field): void
    {
        $this->submit(array_replace($this->assignment(), $override))
            ->assertSessionHasErrors(["reviews.{$this->parcel->id}.$field"]);
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertSame(1, SiteInspection::count());
        $this->assertSame(1, TechnicalReview::count());
        Queue::assertNothingPushed();
        $this->assertHistoryPreserved();
    }

    public function test_single_reinspection_also_requires_instructions(): void
    {
        $this->submit(array_replace($this->assignment(), ['assigned_notes' => null]), false)
            ->assertSessionHasErrors(['assigned_notes']);
        $this->assertSame(1, SiteInspection::count());
        $this->assertSame(1, TechnicalReview::count());
        $this->assertHistoryPreserved();
    }

    public function test_approval_keeps_amendment_routing(): void
    {
        $this->application->update(['application_stream' => 'amendment']);
        $this->submit(['decision' => 'Approved'])->assertSessionHasNoErrors();
        $this->assertSame('Under Sangguniang Bayan', $this->application->fresh()->status);
        $this->assertSame(1, SiteInspection::count());
        $this->assertHistoryPreserved();
    }

    public function test_mixed_batch_excludes_only_the_final_decisions_assignment_fields(): void
    {
        $otherParcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-02', 'latitude' => 13.85, 'longitude' => 121.2]);
        $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id,
            'reviews' => [
                $this->parcel->id => ['decision' => 'Approved', 'inspector_id' => 'irrelevant',
                    'scheduled_date' => '2026-09-21', 'deadline_date' => 'not-a-date', 'assigned_notes' => ['irrelevant']],
                $otherParcel->id => ['decision' => 'Needs Site Inspection', 'inspector_id' => $this->inspector->id,
                    'scheduled_date' => '2026-10-14', 'deadline_date' => '2026-10-18'],
            ]])->assertSessionHasNoErrors()->assertRedirect('/applications');
        $new = SiteInspection::latest('id')->firstOrFail();
        $review = TechnicalReview::where('parcel_id', $otherParcel->id)->firstOrFail();
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame($otherParcel->id, (int) $new->parcel_id);
        $this->assertSame('2026-10-14', $new->scheduled_date->toDateString());
        $this->assertSame('2026-10-18', $new->deadline_date->toDateString());
        $this->assertSame(1, InspectionRoundNumbering::forInspection($new)['round_number']);
        $this->assertSame(2, (int) $review->review_round);
        $this->assertNull($review->reviewed_site_inspection_id);
        $this->assertSame($new->id, (int) $review->site_inspection_task_id);
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertHistoryPreserved();
    }

    public function test_initial_inspection_still_rejects_a_past_schedule_in_a_mixed_batch(): void
    {
        $otherParcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-02', 'latitude' => 13.85, 'longitude' => 121.2]);
        $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id,
            'reviews' => [
                $this->parcel->id => ['decision' => 'Approved', 'scheduled_date' => '2026-09-21'],
                $otherParcel->id => ['decision' => 'Needs Site Inspection', 'inspector_id' => $this->inspector->id,
                    'scheduled_date' => '2026-09-21', 'deadline_date' => '2026-10-18'],
            ]])->assertSessionHasErrors(["reviews.{$otherParcel->id}.scheduled_date"])
                ->assertSessionDoesntHaveErrors(["reviews.{$this->parcel->id}.scheduled_date"]);
        $this->assertSame(1, SiteInspection::count());
        $this->assertSame(1, TechnicalReview::count());
        Queue::assertNothingPushed();
        $this->assertHistoryPreserved();
    }

    public static function invalidDecisionReasons(): array
    {
        return [
            'batch reinspection missing' => [true, 'Requires Reinspection', []],
            'batch reinspection empty' => [true, 'Requires Reinspection', ['decision_reason' => '']],
            'batch reinspection whitespace' => [true, 'Requires Reinspection', ['decision_reason' => " \t\n "]],
            'single reinspection missing' => [false, 'Requires Reinspection', []],
            'single reinspection empty' => [false, 'Requires Reinspection', ['decision_reason' => '']],
            'single reinspection whitespace' => [false, 'Requires Reinspection', ['decision_reason' => " \t\n "]],
            'batch decline missing' => [true, 'Declined', []],
            'batch decline empty' => [true, 'Declined', ['decision_reason' => '']],
            'batch decline whitespace' => [true, 'Declined', ['decision_reason' => " \t\n "]],
            'single decline missing' => [false, 'Declined', []],
            'single decline empty' => [false, 'Declined', ['decision_reason' => '']],
            'single decline whitespace' => [false, 'Declined', ['decision_reason' => " \t\n "]],
        ];
    }

    #[DataProvider('invalidDecisionReasons')]
    public function test_missing_or_blank_decision_reason_is_rejected_without_changing_history(bool $batch, string $decision, array $reason): void
    {
        $review = $this->assignment();
        unset($review['decision_reason']);
        $this->submit(array_replace($review, ['decision' => $decision], $reason), $batch)
            ->assertSessionHasErrors([$batch ? "reviews.{$this->parcel->id}.decision_reason" : 'decision_reason']);
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertSame(1, SiteInspection::count());
        $this->assertSame(1, TechnicalReview::count());
        Queue::assertNothingPushed();
        $this->assertHistoryPreserved();
    }

    #[DataProvider('reviewEndpoints')]
    public function test_initial_inspection_does_not_require_a_reason_or_instructions(bool $batch): void
    {
        $parcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-02', 'latitude' => 13.85, 'longitude' => 121.2]);
        $review = ['decision' => 'Needs Site Inspection', 'inspector_id' => $this->inspector->id,
            'scheduled_date' => '2026-10-14', 'deadline_date' => '2026-10-18'];
        ($batch
            ? $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id, 'reviews' => [$parcel->id => $review]])
            : $this->post('/technical-review/update-status', ['id' => $this->application->id, 'parcel_id' => $parcel->id, ...$review]))
            ->assertSessionHasNoErrors()->assertRedirect('/applications');
        $new = SiteInspection::latest('id')->firstOrFail();
        $createdReview = TechnicalReview::latest('id')->firstOrFail();
        $this->assertSame($parcel->id, (int) $new->parcel_id);
        $this->assertNull($createdReview->decision_reason);
        $this->assertNull($new->assigned_notes);
        $this->assertNull($createdReview->reviewed_site_inspection_id);
        $this->assertSame($new->id, (int) $createdReview->site_inspection_task_id);
        $this->assertSame(1, InspectionRoundNumbering::forInspection($new)['round_number']);
        $this->assertHistoryPreserved();
    }

    #[DataProvider('reviewEndpoints')]
    public function test_sync_reinspection_transport_waits_for_committed_creator_review(bool $batch): void
    {
        $rest = $this->useRealSyncInspectionQueue();
        $executions = [];
        Queue::before(function (JobProcessing $event) use (&$executions) {
            if ($event->job->resolveName() === PushInspectionToSupabase::class) {
                $executions[] = [
                    'transaction_level' => DB::transactionLevel(),
                    'pdo_in_transaction' => DB::connection()->getPdo()->inTransaction(),
                    'creator' => TechnicalReview::where('decision', 'Requires Reinspection')->first()?->getAttributes(),
                ];
            }
        });

        // The controller's inner commit must not release an outer transaction's job.
        DB::beginTransaction();
        try {
            $this->submit($this->assignment(), $batch)->assertSessionHasNoErrors()->assertRedirect('/applications');
            $new = SiteInspection::latest('id')->firstOrFail();
            $review = TechnicalReview::latest('id')->firstOrFail();
            $this->assertSame(1, DB::transactionLevel());
            $this->assertSame(2, SiteInspection::count());
            $this->assertSame(2, TechnicalReview::count());
            $this->assertCount(0, $executions, 'Inspection transport must wait for the outermost commit');
            $this->assertCount(1, $rest->rows('field_jobs'));
            DB::commit();
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
        }

        $this->assertCount(1, $executions, 'Exactly one real sync inspection job must execute');
        $this->assertSame(0, $executions[0]['transaction_level']);
        $this->assertFalse($executions[0]['pdo_in_transaction']);
        $this->assertSame($review->getAttributes(), $executions[0]['creator']);
        $jobs = $rest->rows('field_jobs');
        $this->assertCount(2, $jobs);
        $this->assertSame($new->id, $jobs[1]['local_inspection_id']);
        $this->assertSame(2, $jobs[1]['inspection_round_number']);
        $this->assertSame($this->roundOne->id, $jobs[1]['previous_site_inspection_id']);
        $this->assertSame(self::REASON, $jobs[1]['reinspection_reason']);
        $this->assertSame($review->reviewed_at->toIso8601String(), $jobs[1]['reinspection_reviewed_at']);
        $this->assertSame('Reverify setback with new photos', $jobs[1]['assignment_instructions']);
        $this->assertSame($this->roundOne->id, $review->reviewed_site_inspection_id);
        $this->assertSame($new->id, (int) $review->site_inspection_task_id);
        $this->assertSame(['round-one-test.jpg'], $jobs[0]['photo_paths']);
        $this->assertSame('completed', $jobs[0]['status']);
        DB::transaction(fn () => null);
        $this->assertCount(1, $executions, 'A later commit must not execute the transport again');
        $this->submit($this->assignment(), $batch)->assertSessionHasErrors(['decision']);
        $this->assertSame(2, TechnicalReview::count());
        $this->assertCount(1, $executions, 'A repeated submission must not dispatch another inspection');
        $this->assertSame($jobs, $rest->rows('field_jobs'));
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
        $this->assertSame($this->reviewSnapshot, $this->initialReview->fresh()->getAttributes());
        $this->assertEquals($this->ownershipSnapshot, DB::table('site_inspection_assignments')
            ->where('site_inspection_id', $this->roundOne->id)->get()->toArray());
    }

    #[DataProvider('reviewEndpoints')]
    public function test_sync_reinspection_transport_is_discarded_when_creator_transaction_rolls_back(bool $batch): void
    {
        $rest = $this->useRealSyncInspectionQueue();
        $executions = 0;
        Queue::before(function (JobProcessing $event) use (&$executions) {
            if ($event->job->resolveName() === PushInspectionToSupabase::class) {
                $executions++;
            }
        });
        $createdReviewId = null;
        TechnicalReview::created(function (TechnicalReview $review) use (&$createdReviewId) {
            if ($review->decision === 'Requires Reinspection') {
                $createdReviewId = $review->id;
                throw new \RuntimeException('Controlled D8 creator rollback');
            }
        });
        $this->withoutExceptionHandling();
        try {
            $this->submit($this->assignment(), $batch);
            $this->fail('The controlled creator failure must roll back the controller transaction');
        } catch (\RuntimeException $exception) {
            $this->assertSame('Controlled D8 creator rollback', $exception->getMessage());
        }

        $this->assertNotNull($createdReviewId, 'Rollback must happen after the creator row was inserted');
        $this->assertSame(0, DB::transactionLevel());
        $this->assertFalse(DB::connection()->getPdo()->inTransaction());
        $this->assertSame(1, SiteInspection::count());
        $this->assertSame(1, TechnicalReview::count());
        $this->assertSame(0, $executions, 'A rolled-back inspection job must never execute');
        DB::transaction(fn () => null);
        $this->assertSame(0, $executions, 'Rollback must discard callbacks rather than release them on a later commit');
        $this->assertCount(1, $rest->rows('field_jobs'));
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertHistoryPreserved();
    }

    private function useRealSyncInspectionQueue(): FakePostgRest
    {
        // Inspection jobs pass through the native SyncQueue; unrelated jobs stay fake.
        $queue = Queue::fake()->except([PushInspectionToSupabase::class]);
        $this->assertInstanceOf(SyncQueue::class, $queue->queue->connection());
        $this->assertFalse((bool) config('queue.connections.sync.after_commit'));
        $rest = new FakePostgRest();
        foreach (['field_jobs' => 'local_inspection_id', 'supabase_zoning_applications' => 'local_application_id',
            'supabase_parcels' => 'local_parcel_id'] as $table => $key) {
            $rest->declareUniqueKeys($table, [['bridge_source_id', $key]]);
        }
        $rest->seed('field_jobs', ['id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            'bridge_source_id' => 'planning-evaluation-test', 'local_inspection_id' => $this->roundOne->id,
            'status' => 'completed', 'photo_paths' => ['round-one-test.jpg']]);
        Http::swap(new HttpFactory());
        Http::preventStrayRequests();
        Http::fake(['https://evaluation.test/*' => function (Request $request) use ($rest) {
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/profiles') {
                return Http::response([['id' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]);
            }
            if (str_contains($request->url(), '/application_status_tracks')) {
                return Http::response([], 201);
            }
            return $rest->handle($request);
        }]);
        $recorder = $this->createPartialMock(InspectionDeliveryRecorder::class, ['beginAttempt']);
        $recorder->method('beginAttempt')->willReturn(null);
        $this->app->instance(InspectionDeliveryRecorder::class, $recorder);

        return $rest;
    }

    private function assignment(): array
    {
        return ['decision' => 'Requires Reinspection', 'inspector_id' => $this->inspector->id,
            'scheduled_date' => '2026-10-14', 'deadline_date' => '2026-10-18',
            'decision_reason' => self::REASON,
            'assigned_notes' => 'Reverify setback with new photos', 'findings' => 'Current evaluation'];
    }

    private function submit(array $review, bool $batch = true)
    {
        return $batch
            ? $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id,
                'reviews' => [$this->parcel->id => $review]])
            : $this->post('/technical-review/update-status', ['id' => $this->application->id,
                'parcel_id' => $this->parcel->id, ...$review]);
    }

    private function assertHistoryPreserved(): void
    {
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
        $this->assertSame($this->reviewSnapshot, $this->initialReview->fresh()->getAttributes());
        $this->assertEquals($this->ownershipSnapshot, DB::table('site_inspection_assignments')
            ->where('site_inspection_id', $this->roundOne->id)->get()->toArray());
        // Only status-track HTTP is synchronous here; neither photos nor the
        // completed field job may be written by an evaluation request.
        Http::assertNotSent(fn ($request) => !str_contains($request->url(), '/application_status_tracks'));
    }

    private function createMemoryTables(): void
    {
        // A deliberately small contract schema. No production migrations execute.
        $tables = [
            'users' => ['name' => 'string', 'email' => 'string', 'password' => 'string', 'role' => 'string',
                'is_active' => 'boolean', 'handshake_key' => 'string'],
            'zoning_applications' => ['reference_number' => 'string', 'application_type' => 'string',
                'application_stream' => 'string', 'status' => 'string', 'applicant_name' => 'string',
                'contact_number' => 'string', 'encoded_by' => 'unsignedBigInteger',
                'assigned_planning_officer_id' => 'unsignedBigInteger'],
            'parcels' => ['zoning_application_id' => 'unsignedBigInteger', 'parcel_code' => 'string',
                'latitude' => 'double', 'longitude' => 'double'],
            'site_inspections' => ['zoning_application_id' => 'unsignedBigInteger', 'parcel_id' => 'unsignedBigInteger',
                'inspector_id' => 'unsignedBigInteger', 'assigned_by_imaps_user_id' => 'unsignedBigInteger',
                'assigned_by_name' => 'string', 'status' => 'string', 'scheduled_date' => 'date', 'deadline_date' => 'date',
                'assigned_notes' => 'text', 'completed_at' => 'timestamp', 'submitted_at' => 'timestamp',
                'findings' => 'text', 'observations' => 'text', 'discrepancies' => 'text', 'recommendations' => 'text',
                'inspector_notes' => 'text', 'inspection_result' => 'string', 'checklist_data' => 'json',
                'confirmed_latitude' => 'double', 'confirmed_longitude' => 'double', 'gps_accuracy_m' => 'double',
                'gps_confirmed_at' => 'timestamp'],
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
    }
}
