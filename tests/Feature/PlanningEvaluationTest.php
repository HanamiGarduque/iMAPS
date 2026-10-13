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
use App\Services\InspectionDeliveryRetryService;
use App\Services\SupabaseService;
use App\Services\WorkAssignmentService;
use App\Support\InspectionRoundNumbering;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Queue\DatabaseQueue;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;
use Tests\Support\FakePostgRest;
use Tests\Support\PlanningEvaluationMemoryDatabase;

/** Real controller/model regressions, with no migrations or persistent database. */
class PlanningEvaluationTest extends TestCase
{
    use PlanningEvaluationMemoryDatabase;

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
        $this->assertCount(0, $this->queuedJobs(PushInspectionToSupabase::class));
        $transport = $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole();
        $this->assertSame($this->roundOne->id, $transport->reviewedSiteInspectionId);
        $this->assertSame($decision, $transport->decision);
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
        $this->assertSame($new->id, $this->queuedJobs(PushInspectionToSupabase::class)->sole()->inspection->id);
        $transport = $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole();
        $this->assertSame($this->roundOne->id, $transport->reviewedSiteInspectionId);
        $this->assertSame(self::REASON, $transport->decisionReason);
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
        $this->queuedJobs(PushInspectionToSupabase::class)->sole()->handle($recorder);
        $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole()->handle(app(SupabaseService::class));
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
        $this->assertSame(0, DB::table('jobs')->count());
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
        $this->assertSame(0, DB::table('jobs')->count());
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
        $this->assertSame(0, DB::table('jobs')->count());
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
    public function test_database_reinspection_transport_waits_for_committed_creator_review(bool $batch): void
    {
        // Explicit job flags must remain atomic even if the connection default is changed.
        config(['queue.connections.database.after_commit' => true]);
        $rest = $this->useNativeInspectionQueue();

        // The controller's inner commit must not release an outer transaction's job.
        DB::beginTransaction();
        try {
            $this->submit($this->assignment(), $batch)->assertSessionHasNoErrors()->assertRedirect('/applications');
            $new = SiteInspection::latest('id')->firstOrFail();
            $review = TechnicalReview::latest('id')->firstOrFail();
            $this->assertSame(1, DB::transactionLevel());
            $this->assertSame(2, SiteInspection::count());
            $this->assertSame(2, TechnicalReview::count());
            $this->assertSame(2, DB::table('jobs')->count(), 'Both intents must already belong to the transaction');
            $this->assertNoTransportHttp();
            $this->assertCount(1, $rest->rows('field_jobs'));
            DB::commit();
        } finally {
            if (DB::transactionLevel() > 0) {
                DB::rollBack();
            }
        }

        $this->assertSame(2, DB::table('jobs')->count());
        $this->assertNoTransportHttp();
        $this->runNextJob();
        $this->runNextJob();
        $this->assertSame(0, DB::table('jobs')->count());
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
        $this->assertSame(0, DB::table('jobs')->count());
        $this->submit($this->assignment(), $batch)->assertSessionHasErrors(['decision']);
        $this->assertSame(2, TechnicalReview::count());
        $this->assertSame(0, DB::table('jobs')->count(), 'Repeated submission must not enqueue another inspection');
        $this->assertSame($jobs, $rest->rows('field_jobs'));
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
        $this->assertSame($this->reviewSnapshot, $this->initialReview->fresh()->getAttributes());
        $this->assertEquals($this->ownershipSnapshot, DB::table('site_inspection_assignments')
            ->where('site_inspection_id', $this->roundOne->id)->get()->toArray());
    }

    #[DataProvider('reviewEndpoints')]
    public function test_database_reinspection_transport_is_discarded_when_creator_transaction_rolls_back(bool $batch): void
    {
        $rest = $this->useNativeInspectionQueue();
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
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertNoTransportHttp();
        DB::transaction(fn () => null);
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertCount(1, $rest->rows('field_jobs'));
        $this->assertSame('Technical Review', $this->application->fresh()->status);
        $this->assertHistoryPreserved();
    }

    #[DataProvider('reviewEndpoints')]
    public function test_atomic_outer_rollback_removes_both_delivery_intents(bool $batch): void
    {
        $this->useNativeInspectionQueue();
        $before = $this->localSnapshot();
        DB::beginTransaction();
        try {
            $this->submit($this->assignment(), $batch)->assertRedirect('/applications');
            $this->assertSame(2, DB::table('jobs')->count());
            $this->assertNoTransportHttp();
        } finally {
            DB::rollBack();
        }
        DB::transaction(fn () => null);
        $this->assertSame($before, $this->localSnapshot());
        $this->assertNoTransportHttp();
        $this->assertHistoryPreserved();
    }

    public static function failedJobInserts(): array
    {
        return ['single first' => [false, 0], 'single second' => [false, 1],
            'batch first' => [true, 0], 'batch second' => [true, 1]];
    }

    #[DataProvider('failedJobInserts')]
    public function test_atomic_job_insert_failure_rolls_back_every_local_change(bool $batch, int $existing): void
    {
        $before = $this->localSnapshot();
        DB::unprepared("CREATE TEMP TRIGGER fail_d8_job BEFORE INSERT ON jobs
            WHEN (SELECT COUNT(*) FROM jobs) = {$existing}
            BEGIN SELECT RAISE(ABORT, 'controlled D8 queue insert failure'); END");
        $this->withoutExceptionHandling();
        try {
            $this->submit($this->assignment(), $batch);
            $this->fail('The queue INSERT failure must propagate');
        } catch (\Illuminate\Database\QueryException $exception) {
            $this->assertStringContainsString('controlled D8 queue insert failure', $exception->getMessage());
        }
        $this->assertSame($before, $this->localSnapshot());
        $this->assertSame(0, DB::transactionLevel());
        $this->assertNoTransportHttp();
        $this->assertHistoryPreserved();
    }

    public static function unsupportedQueues(): array
    {
        $cases = [];
        foreach (['sync', 'redis', 'other_database', 'connector_override', 'native_connector_override'] as $kind) {
            foreach ([false, true] as $batch) {
                $cases[$kind.($batch ? ' batch' : ' single')] = [$kind, $batch];
            }
        }
        return $cases;
    }

    #[DataProvider('unsupportedQueues')]
    public function test_atomic_unsupported_queue_refuses_the_operation(string $kind, bool $batch): void
    {
        $before = $this->localSnapshot();
        $this->configureUnsupportedQueue($kind);
        $this->withoutExceptionHandling();
        try {
            $this->submit($this->assignment(), $batch);
            $this->fail('Unsupported queue setup must fail closed');
        } catch (\RuntimeException $exception) {
            $this->assertSame('FieldSync delivery requires the native database queue on the current transaction connection.', $exception->getMessage());
        }
        $this->assertSame($before, $this->localSnapshot());
        $this->assertNoTransportHttp();
    }

    public function test_atomic_inspection_failure_leaves_other_batch_deliveries_independent(): void
    {
        $rest = $this->useNativeInspectionQueue();
        $other = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-02', 'latitude' => 13.85, 'longitude' => 121.2]);
        $oldOther = $this->roundOne->replicate();
        $oldOther->parcel_id = $other->id;
        $oldOther->save();
        app(WorkAssignmentService::class)->recordInitialInspectorAssignment($oldOther, $this->officer);
        $oldReview = $this->initialReview->replicate();
        $oldReview->fill(['parcel_id' => $other->id, 'site_inspection_task_id' => $oldOther->id])->save();
        $rest->seed('field_jobs', ['id' => 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            'bridge_source_id' => 'planning-evaluation-test', 'local_inspection_id' => $oldOther->id,
            'status' => 'completed', 'photo_paths' => ['other-round-one-test.jpg']]);
        $oldJobs = $rest->rows('field_jobs');
        $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id,
            'reviews' => [$this->parcel->id => $this->assignment(), $other->id => $this->assignment()]])
            ->assertRedirect('/applications');
        $this->assertSame(4, DB::table('jobs')->count());
        $new = SiteInspection::where('status', 'assigned')->orderBy('id')->firstOrFail();
        $failId = $new->id;
        $this->fakeTransport($rest, fn (Request $request) =>
            $request->method() === 'POST' && str_contains($request->url(), '/field_jobs?')
                && (int) $request['local_inspection_id'] === $failId);
        $job = Queue::connection()->pop();
        $uuid = $job->uuid();
        try {
            $job->fire();
            $this->fail('Controlled first inspection transport must fail');
        } catch (\Exception $exception) {
            $this->assertStringContainsString('Field Job Sync Failed', $exception->getMessage());
            $job->release(5);
        }
        $this->assertSame(4, DB::table('jobs')->count(), 'The failed intent and every independent intent remain durable');
        $this->runNextJob();
        $this->runNextJob();
        $this->runNextJob();
        $this->assertSame(1, DB::table('jobs')->count());
        $this->assertCount(2, $rest->rows('field_job_reviews'));
        $this->assertSame($uuid, json_decode(DB::table('jobs')->sole()->payload, true)['uuid']);
        $this->fakeTransport($rest);
        $this->travel(5)->seconds();
        $this->runNextJob();
        $this->assertSame(0, DB::table('jobs')->count());
        $this->assertSame(4, SiteInspection::count());
        $this->assertSame(4, TechnicalReview::count());
        $this->assertSame($oldJobs, array_slice($rest->rows('field_jobs'), 0, 2));
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
    }

    public static function reviewTransportFailures(): array
    {
        return ['missing target' => ['missing'], 'lookup HTTP failure' => ['lookup'], 'upsert HTTP failure' => ['upsert']];
    }

    #[DataProvider('reviewTransportFailures')]
    public function test_review_delivery_retries_immutable_target_without_fifo(string $failure): void
    {
        $rest = $this->useNativeInspectionQueue($failure !== 'missing');
        $this->submit($this->assignment())->assertRedirect('/applications');
        $this->assertNoTransportHttp();
        // Let the review run first; R2 delivery is deliberately delayed.
        DB::table('jobs')->where('id', DB::table('jobs')->min('id'))->update(['available_at' => now()->addSeconds(600)->timestamp]);
        $this->fakeTransport($rest, fn (Request $request) =>
            ($failure === 'lookup' && $request->method() === 'GET' && str_contains($request->url(), '/field_jobs?'))
            || ($failure === 'upsert' && str_contains($request->url(), '/field_job_reviews')));
        $job = Queue::connection()->pop();
        $uuid = $job->uuid();
        $this->assertSame(PushPlanningReviewToSupabase::class, $job->resolveName());
        try {
            $job->fire();
            $this->fail('Missing/failed review delivery must not be silently acknowledged');
        } catch (\RuntimeException $exception) {
            $this->assertStringContainsString('Planning review', $exception->getMessage());
            $job->release(5);
        }
        $this->assertSame(5, $job->payload()['maxTries']);
        $this->assertSame('5,30,120,300', $job->payload()['backoff']);
        $this->assertSame(2, DB::table('jobs')->count());
        $this->fakeTransport($rest);
        if ($failure === 'missing') {
            // Deliver the actual reviewed R1 mirror, not an invented R2 substitute.
            DB::transaction(function () {
                Queue::connection()->push((new PushInspectionToSupabase($this->roundOne))->beforeCommit());
            });
            $this->runNextJob();
        }
        $this->travel(5)->seconds();
        $retried = $this->runNextJob();
        $this->assertSame($uuid, $retried->uuid());
        $this->assertSame(2, $retried->attempts());
        $this->assertCount(1, $rest->rows('field_job_reviews'));
        $remote = $rest->rows('field_job_reviews')[0];
        $this->assertSame($this->roundOne->id, $remote['reviewed_site_inspection_id']);
        $this->assertSame('planning-evaluation-test', $remote['bridge_source_id']);
        $this->assertSame($this->queuedJobs(PushInspectionToSupabase::class)->sole()->inspection->id,
            SiteInspection::latest('id')->firstOrFail()->id);
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame(2, TechnicalReview::count());
    }

    public function test_atomic_duplicate_handlers_preserve_namespaced_identity_and_history(): void
    {
        $rest = $this->useNativeInspectionQueue();
        $old = $rest->rows('field_jobs')[0];
        $this->submit($this->assignment())->assertRedirect('/applications');
        $inspection = $this->queuedJobs(PushInspectionToSupabase::class)->sole();
        $review = $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole();
        $otherJob = ['id' => 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'bridge_source_id' => 'other-test-source',
            'local_inspection_id' => $inspection->inspection->id, 'status' => 'completed', 'photo_paths' => ['other-source.jpg']];
        $rest->seed('field_jobs', $otherJob);
        $this->runNextJob();
        $this->runNextJob();
        DB::transaction(function () use ($inspection, $review) {
            Queue::connection()->push($inspection->beforeCommit());
            Queue::connection()->push($review->beforeCommit());
        });
        $this->runNextJob();
        $this->runNextJob();
        $this->assertCount(3, $rest->rows('field_jobs'));
        $this->assertCount(1, $rest->rows('field_job_reviews'));
        $this->assertSame($old, $rest->rows('field_jobs')[0]);
        $this->assertSame($otherJob, $rest->rows('field_jobs')[1]);
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame(2, TechnicalReview::count());
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
        $this->assertSame($this->reviewSnapshot, $this->initialReview->fresh()->getAttributes());
    }

    public function test_retry_uses_existing_round_and_preserves_independent_review_intent(): void
    {
        $rest = $this->useNativeInspectionQueue();
        $this->application->update(['assigned_planning_officer_id' => $this->officer->id]);
        $this->submit($this->assignment())->assertRedirect('/applications');
        $new = SiteInspection::latest('id')->firstOrFail();
        $this->fakeTransport($rest, fn (Request $request) =>
            $request->method() === 'POST' && str_contains($request->url(), '/field_jobs?'));
        $job = Queue::connection()->pop();
        try {
            $job->fire();
            $this->fail('Controlled inspection failure must propagate');
        } catch (\Exception $exception) {
            $job->fail($exception);
        }
        $this->assertSame('delivery_failed', $new->fresh()->delivery_status);
        $this->assertCount(1, $this->queuedJobs(PushPlanningReviewToSupabase::class));
        $requestCount = count(Http::recorded());
        $result = app(InspectionDeliveryRetryService::class)->queueRetry($new->id, $this->officer);
        $this->assertTrue($result->isQueued());
        $this->assertCount($requestCount, Http::recorded());
        $this->assertSame(2, DB::table('jobs')->count());
        $this->fakeTransport($rest);
        $this->runNextJob();
        $this->runNextJob();
        $this->assertSame('delivered', $new->fresh()->delivery_status);
        $this->assertCount(1, $rest->rows('field_job_reviews'));
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame(2, TechnicalReview::count());
        $this->assertSame($this->roundSnapshot, $this->roundOne->fresh()->getAttributes());
    }

    public static function unsupportedRetryQueues(): array
    {
        return ['sync' => ['sync'], 'redis' => ['redis'], 'other database' => ['other_database'],
            'connector override' => ['connector_override'], 'native connector override' => ['native_connector_override']];
    }

    #[DataProvider('unsupportedRetryQueues')]
    public function test_retry_rejects_unsupported_queue_without_partial_pending_state(string $kind): void
    {
        $this->application->update(['assigned_planning_officer_id' => $this->officer->id]);
        $this->submit($this->assignment())->assertRedirect('/applications');
        $new = SiteInspection::latest('id')->firstOrFail();
        $new->forceFill(['delivery_status' => 'delivery_failed'])->save();
        $before = $this->localSnapshot();
        $this->configureUnsupportedQueue($kind);
        try {
            app(InspectionDeliveryRetryService::class)->queueRetry($new->id, $this->officer);
            $this->fail('Unsupported retry queue must fail closed');
        } catch (\RuntimeException $exception) {
            $this->assertSame('FieldSync delivery requires the native database queue on the current transaction connection.', $exception->getMessage());
        }
        $this->assertSame('delivery_failed', $new->fresh()->delivery_status);
        $this->assertSame($before, $this->localSnapshot());
        $this->assertNoTransportHttp();
    }

    private function configureUnsupportedQueue(string $kind): void
    {
        config(['queue.default' => 'unsupported', 'queue.connections.unsupported' => [
            'driver' => in_array($kind, ['sync', 'redis'], true) ? $kind : 'database',
            'connection' => $kind === 'other_database' ? 'other' : 'sqlite',
            'table' => 'jobs', 'queue' => 'default', 'retry_after' => 90, 'after_commit' => false],
            'database.connections.other' => config('database.connections.sqlite')]);
        if (in_array($kind, ['redis', 'connector_override'], true)) {
            // An inert override prevents any real Redis connection even on RED.
            Queue::addConnector($kind === 'redis' ? 'redis' : 'database', fn () =>
                new class implements \Illuminate\Queue\Connectors\ConnectorInterface {
                    public function connect(array $config) { return new \Illuminate\Queue\NullQueue(); }
                });
        }
        if ($kind === 'native_connector_override') {
            Queue::addConnector('database', fn () =>
                new class implements \Illuminate\Queue\Connectors\ConnectorInterface {
                    public function connect(array $config) {
                        return new DatabaseQueue(DB::connection(), $config['table'], $config['queue']);
                    }
                });
        }
    }

    private function localSnapshot(): array
    {
        $state = ['application' => $this->application->fresh()->getAttributes()];
        foreach (['site_inspections', 'technical_reviews', 'site_inspection_assignments', 'audit_trail',
            'notifications', 'application_status_tracks', 'inspection_delivery_attempts', 'jobs'] as $table) {
            $state[$table] = DB::table($table)->count();
        }
        return $state;
    }

    private function fakeTransport(FakePostgRest $rest, ?callable $failure = null): void
    {
        Http::swap(new HttpFactory());
        Http::preventStrayRequests();
        Http::fake(['https://evaluation.test/*' => function (Request $request) use ($rest, $failure) {
            if ($failure !== null && $failure($request)) {
                return Http::response(['message' => 'controlled transport failure'], 503);
            }
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/profiles') {
                return Http::response([['id' => 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']]);
            }
            return $rest->handle($request);
        }]);
    }

    private function useNativeInspectionQueue(bool $seedOld = true): FakePostgRest
    {
        $this->assertSame(DatabaseQueue::class, get_class(Queue::connection()));
        $this->assertSame(DB::connection(), Queue::connection()->getDatabase());
        $rest = new FakePostgRest();
        foreach (['field_jobs' => 'local_inspection_id', 'supabase_zoning_applications' => 'local_application_id',
            'supabase_parcels' => 'local_parcel_id', 'field_job_reviews' => 'technical_review_id'] as $table => $key) {
            $rest->declareUniqueKeys($table, [['bridge_source_id', $key]]);
        }
        if ($seedOld) {
            $rest->seed('field_jobs', ['id' => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                'bridge_source_id' => 'planning-evaluation-test', 'local_inspection_id' => $this->roundOne->id,
                'status' => 'completed', 'photo_paths' => ['round-one-test.jpg']]);
        }
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

}
