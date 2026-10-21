<?php

namespace Tests\Feature;

use App\Jobs\PushInspectionToSupabase;
use App\Models\AppNotification;
use App\Models\InspectionDeliveryAttempt;
use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\InspectionDeliveryRecorder;
use App\Services\WorkAssignmentService;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\Support\FakePostgRest;
use Tests\Support\PlanningEvaluationMemoryDatabase;
use Tests\TestCase;

/** Real writer + local recorder; fictional SQLite and fake HTTP only. */
class InspectionVisitDeliveryTest extends TestCase
{
    use PlanningEvaluationMemoryDatabase;

    private const OWNER = '11111111-1111-4111-8111-111111111111';
    private const JOB = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    private FakePostgRest $rest;
    private SiteInspection $inspection;
    private User $officer;
    private $interleave = null;
    private string $interleaveMethod = 'PATCH';

    protected function setUp(): void
    {
        parent::setUp();
        $this->createMemoryTables();
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        $this->officer = User::forceCreate(['name'=>'Fictional PO','email'=>'po@evaluation.test',
            'password'=>'test-only','role'=>'Planning Officer','is_active'=>true]);
        $inspector = User::forceCreate(['name'=>'Fictional Inspector','email'=>'inspector@evaluation.test',
            'password'=>'test-only','role'=>'Site Inspector','is_active'=>true,'handshake_key'=>'test-inspector']);
        $application = ZoningApplication::create(['reference_number'=>'APP-VISIT-TEST','application_type'=>'Zoning Certificate',
            'application_stream'=>'standard','status'=>'Technical Review','applicant_name'=>'Synthetic Applicant',
            'contact_number'=>'09000000000','encoded_by'=>$this->officer->id,'assigned_planning_officer_id'=>$this->officer->id]);
        $parcel = Parcel::create(['zoning_application_id'=>$application->id,'parcel_code'=>'P-01','latitude'=>13.85,'longitude'=>121.2]);
        $this->inspection = SiteInspection::create(['zoning_application_id'=>$application->id,'parcel_id'=>$parcel->id,
            'inspector_id'=>$inspector->id,'assigned_by_imaps_user_id'=>$this->officer->id,'assigned_by_name'=>$this->officer->name,
            'status'=>'assigned','scheduled_date'=>'2026-11-02','deadline_date'=>'2026-11-12','assigned_notes'=>'Current PO notes']);
        $this->rest = new FakePostgRest();
        foreach (['field_jobs'=>'local_inspection_id','supabase_zoning_applications'=>'local_application_id','supabase_parcels'=>'local_parcel_id'] as $table=>$key) {
            $this->rest->declareUniqueKeys($table, [['bridge_source_id',$key]]);
        }
        Http::swap(new Factory());
        Http::preventStrayRequests();
        Http::fake(['https://evaluation.test/*'=>function (Request $request) {
            if (parse_url($request->url(), PHP_URL_PATH) === '/rest/v1/profiles') {
                parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);
                return Http::response([['id'=>($query['handshake_key'] ?? '') === 'eq.test-new'
                    ? '22222222-2222-4222-8222-222222222222' : self::OWNER]]);
            }
            if ($this->interleave !== null && str_contains($request->url(), '/field_jobs') && $request->method() === $this->interleaveMethod) {
                $callback = $this->interleave;
                $this->interleave = null;
                $response = $callback($request);
                if ($response !== null) { return $response; }
            }
            return $this->rest->handle($request);
        }]);
    }

    private function remote(array $changes = []): array
    {
        return array_replace(['id'=>self::JOB,'bridge_source_id'=>'planning-evaluation-test',
            'local_inspection_id'=>$this->inspection->id,'inspection_round_number'=>1,'previous_site_inspection_id'=>null,
            'assigned_inspector_id'=>self::OWNER,'status'=>'in_progress','current_step'=>3,
            'scheduled_date'=>'2026-11-11','is_self_scheduled'=>true,'deadline_date'=>'2026-11-12',
            'updated_at'=>'2026-10-21T10:00:00.000001+00:00','started_at'=>'2026-10-21T09:00:00+00:00',
            'photo_paths'=>['fictional/photo.jpg'],'photo_count'=>1,'findings'=>'Inspector findings',
            'gps_confirmed_at'=>'2026-10-21T09:01:00+00:00','checklist_completed_count'=>3,
            'submitted_at'=>null,'rework_started_at'=>null], $changes);
    }

    private function deliver(): void
    {
        (new PushInspectionToSupabase($this->inspection))->handle(app(InspectionDeliveryRecorder::class));
    }

    public function test_creation_has_only_one_ignore_duplicates_preference(): void
    {
        $this->deliver();
        $requests = Http::recorded(fn (Request $r) => $r->method()==='POST' && str_contains($r->url(), '/field_jobs'));
        $this->assertCount(1, $requests);
        $this->assertSame(['return=representation,resolution=ignore-duplicates'], $requests->first()[0]->header('Prefer'));
    }

    public function test_patch_replaces_creation_preferences_instead_of_appending(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->deliver();
        $requests = Http::recorded(fn (Request $r) => $r->method()==='PATCH' && str_contains($r->url(), '/field_jobs'));
        $this->assertCount(1, $requests);
        $this->assertSame(['return=representation'], $requests->first()[0]->header('Prefer'));
    }

    public function test_existing_committed_visit_and_evidence_survive_delivery(): void
    {
        $before = $this->remote();
        $this->rest->seed('field_jobs', $before);
        $this->deliver();
        $after = $this->rest->rows('field_jobs')[0];
        foreach (['scheduled_date','is_self_scheduled','status','current_step','started_at','photo_paths','photo_count',
            'findings','gps_confirmed_at','checklist_completed_count','submitted_at','rework_started_at'] as $field) {
            $this->assertSame($before[$field], $after[$field], $field.' is inspector-owned');
        }
        $this->assertSame('Current PO notes', $after['assignment_instructions']);
        $this->assertSame('delivered', $this->inspection->fresh()->delivery_status);
        $this->assertCount(1, $this->rest->rows('field_jobs'));
    }

    public function test_po_deadline_before_committed_visit_is_visible_and_not_delivered(): void
    {
        $before = $this->remote();
        $this->rest->seed('field_jobs', $before);
        $this->inspection->update(['deadline_date'=>'2026-11-10']);
        $failure = null;
        try { $this->deliver(); } catch (\RuntimeException $e) { $failure = $e; }
        $this->assertNotNull($failure, 'A conflicting PO change must fail rather than claim delivery');
        $this->assertSame($before, $this->rest->rows('field_jobs')[0]);
        $this->assertNotSame('delivered', $this->inspection->fresh()->delivery_status);
        $attempt = InspectionDeliveryAttempt::latest('id')->firstOrFail();
        $this->assertSame('failed', $attempt->outcome);
        $this->assertSame('remote_constraint_failure', $attempt->failure_category);
        $notice = AppNotification::where('type','inspection_delivery_conflict')->sole();
        $this->assertSame($this->officer->id, (int) $notice->user_id);
        $this->assertStringContainsString('Visit', $notice->message);
    }

    private function assertRefused(): void
    {
        $failure = null;
        try { $this->deliver(); } catch (\RuntimeException $e) { $failure = $e; }
        $this->assertNotNull($failure, 'Unverified delivery must fail');
        $this->assertNotSame('delivered', $this->inspection->fresh()->delivery_status);
        $this->assertSame('remote_constraint_failure', InspectionDeliveryAttempt::latest('id')->firstOrFail()->failure_category);
    }

    public function test_creation_is_a_placeholder_and_repeated_delivery_keeps_one_uuid_and_round(): void
    {
        $this->deliver();
        $first = $this->rest->rows('field_jobs')[0];
        $this->assertSame('assigned', $first['status']);
        $this->assertFalse($first['is_self_scheduled']);
        $this->assertSame('2026-11-02', $first['scheduled_date']);
        $this->assertSame('2026-11-12', $first['deadline_date']);
        $this->deliver(); $this->deliver();
        $this->assertCount(1, $this->rest->rows('field_jobs'));
        $this->assertSame($first['id'], $this->rest->rows('field_jobs')[0]['id']);
        $this->assertSame(1, $this->rest->rows('field_jobs')[0]['inspection_round_number']);
        $this->assertSame(3, InspectionDeliveryAttempt::where('outcome','delivered')->count());
    }

    public static function lifecycles(): array
    {
        return array_map(fn ($status) => [$status], ['assigned','Pending','pending','in_progress','completed','onprocess','unknown']);
    }

    #[DataProvider('lifecycles')]
    public function test_redelivery_never_normalizes_or_resets_remote_lifecycle(string $status): void
    {
        $before = $this->remote(['status'=>$status,'submitted_at'=>'2026-10-20T10:00:00+00:00','rework_started_at'=>'2026-10-21T09:00:00+00:00']);
        $this->rest->seed('field_jobs', $before);
        $this->deliver();
        $after = $this->rest->rows('field_jobs')[0];
        foreach (['status','submitted_at','current_step','rework_started_at','photo_paths'] as $field) {
            $this->assertSame($before[$field], $after[$field]);
        }
        $writes = array_filter($this->rest->requests(), fn ($r) => $r['path']==='field_jobs' && $r['method']==='PATCH');
        $this->assertCount(1, $writes);
        foreach (['status','scheduled_date','is_self_scheduled','deadline_date','current_step','photo_paths','submitted_at'] as $field) {
            $this->assertArrayNotHasKey($field, array_values($writes)[0]['body']);
        }
    }

    public function test_even_an_uncommitted_placeholder_is_not_replaced_on_retry(): void
    {
        $this->rest->seed('field_jobs', $this->remote(['is_self_scheduled'=>false,'scheduled_date'=>'2026-11-03']));
        $this->deliver();
        $this->assertSame('2026-11-03', $this->rest->rows('field_jobs')[0]['scheduled_date']);
        $this->assertFalse($this->rest->rows('field_jobs')[0]['is_self_scheduled']);
    }

    public function test_inspector_schedules_between_lookup_and_patch_then_retry_preserves_the_visit(): void
    {
        $this->rest->seed('field_jobs', $this->remote(['is_self_scheduled'=>false,'scheduled_date'=>'2026-11-02']));
        $this->interleave = fn () => $this->rest->updateRow('field_jobs', self::JOB, ['scheduled_date'=>'2026-11-09','is_self_scheduled'=>true]);
        $this->assertRefused();
        $this->deliver();
        $this->assertSame('2026-11-09', $this->rest->rows('field_jobs')[0]['scheduled_date']);
        $this->assertTrue($this->rest->rows('field_jobs')[0]['is_self_scheduled']);
        $this->assertSame('delivered', $this->inspection->fresh()->delivery_status);
    }

    public function test_concurrent_completion_is_not_reopened_and_a_retry_preserves_receipt(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->interleave = fn () => $this->rest->updateRow('field_jobs', self::JOB,
            ['status'=>'completed','current_step'=>6,'submitted_at'=>'2026-10-21T11:00:00+00:00']);
        $this->assertRefused();
        $this->deliver();
        $row = $this->rest->rows('field_jobs')[0];
        $this->assertSame('completed', $row['status']);
        $this->assertSame(6, $row['current_step']);
        $this->assertSame('2026-10-21T11:00:00+00:00', $row['submitted_at']);
        $this->assertSame(['fictional/photo.jpg'], $row['photo_paths']);
    }

    public function test_competing_creator_and_commitment_win_without_duplicate_or_visit_overwrite(): void
    {
        $this->interleaveMethod = 'POST';
        $this->interleave = fn () => $this->rest->seed('field_jobs', $this->remote());
        $this->deliver();
        $this->assertCount(1, $this->rest->rows('field_jobs'));
        $this->assertSame(self::JOB, $this->rest->rows('field_jobs')[0]['id']);
        $this->assertSame('2026-11-11', $this->rest->rows('field_jobs')[0]['scheduled_date']);
    }

    public static function competingChanges(): array
    {
        return ['deadline'=>[['deadline_date'=>'2026-11-11']],
            'owner'=>[['assigned_inspector_id'=>'22222222-2222-4222-8222-222222222222']],
            'round'=>[['inspection_round_number'=>2]]];
    }

    #[DataProvider('competingChanges')]
    public function test_changed_remote_authority_cannot_be_overwritten(array $changes): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->interleave = fn () => $this->rest->updateRow('field_jobs', self::JOB, $changes);
        $this->assertRefused();
        foreach ($changes as $field=>$value) { $this->assertSame($value, $this->rest->rows('field_jobs')[0][$field]); }
    }

    public static function invalidRows(): array
    {
        return ['missing revision'=>[['updated_at'=>null]], 'wrong round'=>[['inspection_round_number'=>2]],
            'wrong previous round'=>[['previous_site_inspection_id'=>999]],
            'foreign owner'=>[['assigned_inspector_id'=>'22222222-2222-4222-8222-222222222222']],
            'deadline extension'=>[['deadline_date'=>'2026-11-15']], 'invalid revision'=>[['updated_at'=>'not-a-revision']]];
    }

    #[DataProvider('invalidRows')]
    public function test_unverified_existing_authority_is_refused_without_mutation(array $changes): void
    {
        $before = $this->remote($changes);
        $this->rest->seed('field_jobs', $before);
        $this->assertRefused();
        $this->assertSame($before, $this->rest->rows('field_jobs')[0]);
    }

    public function test_empty_creation_and_empty_refetch_are_not_success(): void
    {
        $this->interleaveMethod = 'POST';
        $this->interleave = fn () => Http::response([],201);
        $this->assertRefused();
        $this->assertCount(0, $this->rest->rows('field_jobs'));
    }

    public function test_a_malformed_creation_response_is_not_delivery(): void
    {
        $this->interleaveMethod = 'POST';
        $this->interleave = fn () => Http::response([['id'=>self::JOB,'bridge_source_id'=>'foreign']],201);
        $this->assertRefused();
    }

    public function test_namespace_collision_leaves_the_other_environment_unchanged(): void
    {
        $foreign = $this->remote(['bridge_source_id'=>'foreign-environment']);
        $this->rest->seed('field_jobs', $foreign);
        $this->deliver();
        $this->assertCount(2, $this->rest->rows('field_jobs'));
        $this->assertSame($foreign, $this->rest->rows('field_jobs')[0]);
    }

    public function test_legacy_null_round_is_guarded_then_enriched_without_touching_the_visit(): void
    {
        $this->rest->seed('field_jobs', $this->remote(['inspection_round_number'=>null]));
        $this->deliver();
        $this->assertSame(1, $this->rest->rows('field_jobs')[0]['inspection_round_number']);
        $this->assertSame('2026-11-11', $this->rest->rows('field_jobs')[0]['scheduled_date']);
    }

    private function prepareHandover(array $changes = []): void
    {
        app(WorkAssignmentService::class)->recordInitialInspectorAssignment($this->inspection, $this->officer);
        $new = User::forceCreate(['name'=>'Fictional Next Inspector','email'=>'next@evaluation.test',
            'password'=>'test-only','role'=>'Site Inspector','is_active'=>true,'handshake_key'=>'test-new']);
        $this->rest->seed('field_jobs', $this->remote(array_replace(['status'=>'assigned','current_step'=>0,'started_at'=>null,
            'gps_confirmed_at'=>null,'checklist_completed_count'=>0,'photo_count'=>0,'photo_paths'=>[],
            'findings'=>null,'is_self_scheduled'=>false,'scheduled_date'=>'2026-11-02'], $changes)));
        app(WorkAssignmentService::class)->reassignInspector($this->inspection, $this->officer, $new->id,
            'Absent', null, ['status'=>'assigned','gps_confirmed_at'=>null,'checklist_completed_count'=>0,'photo_count'=>0]);
    }

    public function test_recorded_unstarted_reassignment_hands_over_the_same_row(): void
    {
        $this->prepareHandover();
        $this->deliver();
        $row = $this->rest->rows('field_jobs')[0];
        $this->assertSame(self::JOB, $row['id']);
        $this->assertSame('22222222-2222-4222-8222-222222222222', $row['assigned_inspector_id']);
        $this->assertSame('assigned', $row['status']);
        $this->assertSame(2, $this->inspection->assignmentHistory()->count());
    }

    public function test_a_subsequent_recorded_handover_uses_the_latest_history_entry(): void
    {
        $this->prepareHandover();
        $this->deliver();
        $original = User::where('handshake_key','test-inspector')->firstOrFail();
        app(WorkAssignmentService::class)->reassignInspector($this->inspection->fresh(), $this->officer, $original->id,
            'Absent', null, ['status'=>'assigned','gps_confirmed_at'=>null,'checklist_completed_count'=>0,'photo_count'=>0]);
        $this->deliver();
        $this->assertSame(self::OWNER, $this->rest->rows('field_jobs')[0]['assigned_inspector_id']);
        $this->assertSame(3, $this->inspection->assignmentHistory()->count());
        $this->assertSame(self::JOB, $this->rest->rows('field_jobs')[0]['id']);
    }

    public function test_po_reassignment_of_a_committed_but_unstarted_visit_delivers_without_moving_it(): void
    {
        app(WorkAssignmentService::class)->recordInitialInspectorAssignment($this->inspection, $this->officer);
        $next = User::forceCreate(['name'=>'Fictional Next Inspector','email'=>'next@evaluation.test',
            'password'=>'test-only','role'=>'Site Inspector','is_active'=>true,'handshake_key'=>'test-new']);
        $this->rest->seed('field_jobs', $this->remote(['status'=>'assigned','current_step'=>0,'started_at'=>null,
            'gps_confirmed_at'=>null,'checklist_completed_count'=>0,'photo_count'=>0,'photo_paths'=>[], 'findings'=>null]));
        $this->actingAs($this->officer)->post('/site-inspections/reassign-inspector', [
            'site_inspection_id'=>$this->inspection->id,'zoning_application_id'=>$this->inspection->zoning_application_id,
            'to_inspector_id'=>$next->id,'reason'=>'Absent',
        ])->assertSessionHasNoErrors()->assertRedirect();
        $this->assertSame($next->id, (int) $this->inspection->fresh()->inspector_id);
        $this->runNextJob();
        $row = $this->rest->rows('field_jobs')[0];
        $this->assertSame('22222222-2222-4222-8222-222222222222', $row['assigned_inspector_id']);
        $this->assertSame('2026-11-11', $row['scheduled_date']);
        $this->assertTrue($row['is_self_scheduled']);
        $this->assertSame('delivered', $this->inspection->fresh()->delivery_status);
        $this->assertSame(2, $this->inspection->assignmentHistory()->count());
    }

    public function test_handover_requires_verified_evidence_counts(): void
    {
        $this->prepareHandover(['photo_count'=>null]);
        $this->assertRefused();
        $this->assertSame(self::OWNER, $this->rest->rows('field_jobs')[0]['assigned_inspector_id']);
    }

    public function test_started_field_work_after_po_reassignment_is_not_handed_over(): void
    {
        $this->prepareHandover(['status'=>'in_progress','current_step'=>1,'started_at'=>'2026-10-21T10:00:00+00:00']);
        $this->assertRefused();
        $this->assertSame(self::OWNER, $this->rest->rows('field_jobs')[0]['assigned_inspector_id']);
    }

    public function test_local_po_changes_during_delivery_cannot_be_marked_delivered(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->interleave = function () {
            SiteInspection::whereKey($this->inspection->id)->update(['deadline_date'=>'2026-11-10']);
        };
        $this->assertRefused();
        $this->assertSame('2026-11-12', $this->rest->rows('field_jobs')[0]['deadline_date']);
        $this->assertSame('2026-11-11', $this->rest->rows('field_jobs')[0]['scheduled_date']);
    }

    public function test_patch_response_for_a_different_uuid_is_not_confirmed(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->interleave = fn () => Http::response([$this->remote(['id'=>'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'])]);
        $this->assertRefused();
    }

    public static function unconfirmedMetadata(): array
    {
        return ['stale instructions'=>['assignment_instructions',false],
            'missing instructions'=>['assignment_instructions',true],
            'missing application'=>['supabase_application_id',true],
            'missing parcel'=>['supabase_parcel_id',true],
            'missing revision'=>['updated_at',true],
            'stale provenance'=>['assigned_by_name',false]];
    }

    #[DataProvider('unconfirmedMetadata')]
    public function test_unconfirmed_patch_metadata_is_not_reported_delivered(string $field, bool $missing): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->interleave = function (Request $request) use ($field, $missing) {
            $row = array_replace($request->data(), $this->remote());
            if ($missing) { unset($row[$field]); } else { $row[$field]='stale value'; }
            return Http::response([$row]);
        };
        $this->assertRefused();
    }

    public function test_repeated_conflict_notifications_are_deduplicated_for_the_current_po(): void
    {
        $this->rest->seed('field_jobs', $this->remote(['deadline_date'=>'2026-11-15']));
        $this->assertRefused(); $this->assertRefused();
        $this->assertSame(1, AppNotification::where('type','inspection_delivery_conflict')->count());
    }

    private function beforeAcknowledgement(callable $callback): void
    {
        $real = new InspectionDeliveryRecorder();
        $hook = \Mockery::mock(InspectionDeliveryRecorder::class)->makePartial();
        $hook->shouldReceive('markDelivered')->once()->andReturnUsing(function (InspectionDeliveryAttempt $attempt, ...$arguments) use ($real, $callback) {
            $callback($real);
            return $real->markDelivered($attempt, ...$arguments);
        });
        $this->app->instance(InspectionDeliveryRecorder::class, $hook);
    }

    public function test_po_change_after_final_read_is_rejected_inside_acknowledgement(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->beforeAcknowledgement(function () {
            SiteInspection::whereKey($this->inspection->id)->update(['deadline_date'=>'2026-11-10']);
        });
        $this->assertRefused();
        $this->assertSame('2026-11-12', $this->rest->rows('field_jobs')[0]['deadline_date']);
    }

    public function test_an_older_acknowledgement_cannot_overwrite_a_newer_pending_attempt(): void
    {
        $this->rest->seed('field_jobs', $this->remote());
        $this->beforeAcknowledgement(function (InspectionDeliveryRecorder $recorder) {
            $recorder->beginAttempt($this->inspection, 'planning_officer_retry');
        });
        $failure = null;
        try { $this->deliver(); } catch (\RuntimeException $e) { $failure=$e; }
        $this->assertNotNull($failure, 'An older request cannot confirm a newer delivery');
        $this->assertSame('pending_delivery', $this->inspection->fresh()->delivery_status);
        $attempts = InspectionDeliveryAttempt::orderBy('attempt_number')->get();
        $this->assertSame('failed', $attempts[0]->outcome);
        $this->assertSame('pending', $attempts[1]->outcome);
        $this->assertNull($this->inspection->fresh()->delivered_at);
    }
}
