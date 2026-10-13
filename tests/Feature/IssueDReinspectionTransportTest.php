<?php

namespace Tests\Feature;

use App\Jobs\PushInspectionToSupabase;
use App\Jobs\PushPlanningReviewToSupabase;
use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\TechnicalReview;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Http\Client\Factory as HttpFactory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\FakePostgRest;
use Tests\Support\PlanningEvaluationMemoryDatabase;
use Tests\TestCase;

class IssueDReinspectionTransportTest extends TestCase
{
    use PlanningEvaluationMemoryDatabase;

    private const REASON = 'Controlled Issue D reinspection context test';
    private const INSPECTOR_UUID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private User $officer;
    private User $inspector;
    private ZoningApplication $application;
    private Parcel $parcel;
    private FakePostgRest $rest;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        $this->assertSame('', DB::selectOne('PRAGMA database_list')->file);
        $this->withoutVite();
        $this->createMemoryTables();
        $this->officer = User::forceCreate(['name' => 'Issue D Officer', 'email' => 'officer@issue-d.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
        $this->inspector = User::forceCreate(['name' => 'Issue D Inspector', 'email' => 'inspector@issue-d.test',
            'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true,
            'handshake_key' => 'issue-d-test-handshake']);
        $this->actingAs($this->officer);
        $this->application = ZoningApplication::create([
            'reference_number' => 'APP-ISSUE-D', 'application_type' => 'Zoning Certificate',
            'status' => 'Technical Review', 'purpose' => 'Isolated regression',
            'applicant_name' => 'Controlled Applicant', 'contact_number' => '09000000000',
            'barangay' => 'Alupay', 'encoded_by' => $this->officer->id,
        ]);
        $this->parcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-01', 'latitude' => 13.85, 'longitude' => 121.2]);
        config(['bridge.source_id' => 'issue-d-isolated', 'services.supabase.url' => 'https://issue-d.test',
            'services.supabase.key' => 'test-service', 'services.supabase.service_key' => 'test-service']);
        $this->rest = new FakePostgRest();
        foreach (['field_jobs' => 'local_inspection_id', 'supabase_zoning_applications' => 'local_application_id',
            'supabase_parcels' => 'local_parcel_id', 'field_job_reviews' => 'technical_review_id'] as $table => $key) {
            $this->rest->declareUniqueKeys($table, [['bridge_source_id', $key]]);
        }
        Http::swap(new HttpFactory());
        Http::preventStrayRequests();
        Http::fake(['https://issue-d.test/*' => function (Request $request) {
            if (str_contains($request->url(), '/profiles')) return Http::response([['id' => self::INSPECTOR_UUID]]);
            return $this->rest->handle($request);
        }]);
    }

    public function test_normal_batch_flow_creates_rounds_one_two_and_three_and_transports_exact_linkage(): void
    {
        $previous = null;
        for ($round = 1; $round <= 3; $round++) {
            $snapshot = $previous?->fresh()->getAttributes();
            $this->post('/technical-review/submit-batch', ['application_id' => $this->application->id,
                'reviews' => [$this->parcel->id => $this->decision($round)]])->assertSessionHasNoErrors()->assertRedirect('/applications');
            $inspection = SiteInspection::orderByDesc('id')->firstOrFail();
            $review = TechnicalReview::orderByDesc('id')->firstOrFail();
            $this->assertSame($inspection->id, (int) $review->site_inspection_task_id);
            $this->assertSame($previous?->id, $review->reviewed_site_inspection_id);
            if ($previous) $this->assertSame($snapshot, $previous->fresh()->getAttributes());
            $this->assertSame($inspection->id, $this->queuedJobs(PushInspectionToSupabase::class)->sole()->inspection->id);
            $this->runNextJob();
            $jobs = $this->rest->rows('field_jobs');
            $job = array_values(array_filter($jobs, fn ($j) => $j['local_inspection_id'] === $inspection->id))[0];
            $this->assertSame($round, $job['inspection_round_number']);
            $this->assertSame($previous?->id, $job['previous_site_inspection_id']);
            $this->assertSame($previous ? self::REASON : null, $job['reinspection_reason']);
            $this->assertSame($previous ? $review->reviewed_at->toIso8601String() : null, $job['reinspection_reviewed_at']);
            if ($previous) {
                $transport = $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole();
                $this->assertSame($review->id, $transport->technicalReviewId);
                $this->assertSame($previous->id, $transport->reviewedSiteInspectionId);
                $this->assertSame(self::REASON, $transport->decisionReason);
                $this->runNextJob();
                $canonical = array_values(array_filter($this->rest->rows('field_job_reviews'),
                    fn ($r) => $r['technical_review_id'] === $review->id))[0];
                $oldJob = array_values(array_filter($jobs, fn ($j) => $j['local_inspection_id'] === $previous->id))[0];
                $this->assertSame($oldJob['id'], $canonical['field_job_id']);
                $this->assertNotSame($job['id'], $canonical['field_job_id']);
                $this->assertSame(self::REASON, $canonical['decision_reason']);
            }
            $this->assertSame(0, DB::table('jobs')->count());
            $inspection->update(['status' => 'completed', 'completed_at' => now(), 'submitted_at' => now(),
                'inspector_notes' => "Independent round $round findings", 'inspection_result' => 'Requires Reinspection']);
            $previous = $inspection;
        }
        $this->assertCount(3, $this->rest->rows('field_jobs'));
        $this->assertCount(3, array_unique(array_column($this->rest->rows('field_jobs'), 'id')));
        $this->assertCount(2, $this->rest->rows('field_job_reviews'));
    }

    public function test_single_action_flow_queues_review_for_the_old_round_transactionally(): void
    {
        $old = SiteInspection::create(['zoning_application_id' => $this->application->id,
            'parcel_id' => $this->parcel->id, 'inspector_id' => $this->inspector->id,
            'status' => 'completed', 'completed_at' => now(), 'inspector_notes' => 'Preserved old findings']);
        $this->post('/technical-review/update-status', [...$this->decision(2),
            'id' => $this->application->id, 'parcel_id' => $this->parcel->id])
            ->assertSessionHasNoErrors()->assertRedirect('/applications');
        $review = TechnicalReview::firstOrFail();
        $this->assertSame($old->id, $review->reviewed_site_inspection_id);
        $transport = $this->queuedJobs(PushPlanningReviewToSupabase::class)->sole();
        $this->assertSame($old->id, $transport->reviewedSiteInspectionId);
        $this->assertSame(self::REASON, $transport->decisionReason);
        $this->assertSame(2, DB::table('jobs')->count());
        $this->assertNoTransportHttp();
        $this->assertSame('completed', $old->fresh()->status);
    }

    private function decision(int $round): array
    {
        return ['decision' => $round === 1 ? 'Needs Site Inspection' : 'Requires Reinspection',
            'decision_reason' => $round === 1 ? null : self::REASON,
            'inspector_id' => $this->inspector->id, 'scheduled_date' => now()->toDateString(),
            'deadline_date' => now()->addDays(7)->toDateString(), 'assigned_notes' => "Round $round instructions"];
    }
}
