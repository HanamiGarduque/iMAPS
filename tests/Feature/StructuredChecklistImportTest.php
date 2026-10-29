<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\Support\PlanningEvaluationMemoryDatabase;
use Tests\TestCase;

/** Real completed-result import; fictional in-memory data and fake HTTP only. */
class StructuredChecklistImportTest extends TestCase
{
    use PlanningEvaluationMemoryDatabase;

    public function test_pull_preserves_raw_checklist_evidence_and_history_on_replay(): void
    {
        $this->assertSame('sqlite', DB::connection()->getDriverName());
        $this->assertSame(':memory:', DB::connection()->getDatabaseName());
        $this->createMemoryTables();
        Http::swap(new Factory());
        Http::preventStrayRequests();

        $officer = User::forceCreate(['name' => 'Synthetic PO', 'email' => 'po@evaluation.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
        $inspector = User::forceCreate(['name' => 'Synthetic Inspector', 'email' => 'inspector@evaluation.test',
            'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true]);
        $application = ZoningApplication::create(['reference_number' => 'APP-CHECKLIST-TEST',
            'status' => 'Technical Review', 'applicant_name' => 'Synthetic Applicant', 'encoded_by' => $officer->id]);
        $parcel = Parcel::create(['zoning_application_id' => $application->id, 'parcel_code' => 'P-TEST']);
        $legacy = [
            ['item' => 'Structure matches declared use', 'checked' => true],
            ['item' => 'Setback distances compliant', 'checked' => false],
            ['item' => 'Accessibility & road frontage', 'checked' => true],
            ['item' => 'Surrounding developments noted', 'checked' => false],
            ['item' => 'Signage / commercial activity present', 'checked' => false],
        ];
        $assignment = ['inspector_id' => $inspector->id, 'scheduled_date' => '2026-10-01',
            'deadline_date' => '2026-10-15', 'assigned_by_imaps_user_id' => $officer->id,
            'assigned_by_name' => $officer->name];
        $historical = SiteInspection::create(['zoning_application_id' => $application->id, 'parcel_id' => $parcel->id,
            ...$assignment, 'status' => 'completed', 'submitted_at' => '2026-10-02 09:00:00',
            'completed_at' => '2026-10-02 09:00:00', 'checklist_data' => $legacy]);
        $current = $historical->newRound($assignment);
        $current->fill(['status' => 'completed', 'submitted_at' => '2026-10-12 09:00:00',
            'completed_at' => '2026-10-12 09:00:00', 'checklist_data' => $legacy])->save();
        DB::table('site_inspection_assignments')->insert(['site_inspection_id' => $current->id,
            'assignment_type' => 'initial', 'to_inspector_id' => $inspector->id,
            'reassigned_by' => $officer->id, 'reassigned_at' => '2026-10-10 09:00:00']);

        // Even ambiguous raw evidence belongs to the record; the JSX reader classifies it.
        $evidence = [...$legacy,
            ['item' => 'Existing project or development on site', 'answer' => 'yes'],
            ['item' => "Existing project's declared use", 'answer' => 'not_applicable'],
            ['item' => 'Extension of an existing structure', 'answer' => 'not_applicable'],
            ['item' => 'Still at the project proposal stage', 'answer' => 'yes'],
            ['item' => 'Trees present on the lot', 'answer' => 'no'],
            ['item' => 'Canal or waterway on or adjoining the lot', 'answer' => 'unable'],
            ['item' => 'Existing mojon or property marker observed', 'answer' => 'no'],
            ['item' => 'Existing mojon or property marker observed', 'answer' => 'yes'],
            ['item' => 'Future structured question', 'answer' => 'unrecognized'],
            ['item' => 'Trees present on the lot', 'answer' => ['unexpected' => 'synthetic']],
        ];
        $payload = ['local_inspection_id' => (string) $current->id, 'status' => 'completed',
            'submitted_at' => '2026-10-12T01:00:00+00:00', 'inspection_result' => 'For Review',
            'is_compliant' => null, 'findings' => 'Synthetic checklist evidence', 'observations' => null,
            'discrepancies' => null, 'recommendations' => null, 'inspector_notes' => null,
            'checklist_data' => $evidence, 'confirmed_latitude' => null, 'confirmed_longitude' => null,
            'gps_accuracy_m' => null, 'gps_confirmed_at' => null];
        Http::fake(['https://evaluation.test/rest/v1/field_jobs*' => Http::response([$payload])]);
        $historicalBefore = $historical->fresh()->getAttributes();
        $identityFields = array_flip(['id', 'zoning_application_id', 'parcel_id', 'inspector_id', 'assigned_by_imaps_user_id',
            'assigned_by_name', 'status', 'submitted_at', 'completed_at']);
        $identityBefore = array_intersect_key($current->fresh()->getAttributes(), $identityFields);
        $historyBefore = DB::table('site_inspection_assignments')->get()->toArray();

        $this->assertSame(0, Artisan::call('sync:pull-inspections', ['--local-inspection-id' => $current->id]));
        $this->assertStringContainsString('SYNC_RESULT=CHANGED', Artisan::output());
        $this->assertSame($evidence, $current->fresh()->checklist_data);
        $this->assertSame($legacy, array_slice($current->fresh()->checklist_data, 0, 5));
        $this->assertSame($identityBefore, array_intersect_key($current->fresh()->getAttributes(), $identityFields));
        $this->assertSame($historicalBefore, $historical->fresh()->getAttributes());
        $this->assertEquals($historyBefore, DB::table('site_inspection_assignments')->get()->toArray());
        $afterImport = $current->fresh()->getAttributes();

        $this->assertSame(0, Artisan::call('sync:pull-inspections', ['--local-inspection-id' => $current->id]));
        $this->assertStringContainsString('SYNC_RESULT=NO_CHANGE', Artisan::output());
        $this->assertSame($afterImport, $current->fresh()->getAttributes());
        $this->assertSame($historicalBefore, $historical->fresh()->getAttributes());
        $this->assertEquals($historyBefore, DB::table('site_inspection_assignments')->get()->toArray());
        $this->assertSame(2, SiteInspection::count());
        $this->assertSame(0, DB::table('notifications')->count());
        Http::assertSentCount(2);
        Http::assertSent(function (Request $request) use ($current) {
            parse_str(parse_url($request->url(), PHP_URL_QUERY) ?? '', $query);

            return $request->method() === 'GET'
                && ($query['bridge_source_id'] ?? null) === 'eq.planning-evaluation-test'
                && ($query['local_inspection_id'] ?? null) === 'eq.'.$current->id
                && ($query['status'] ?? null) === 'eq.completed'
                && in_array('checklist_data', explode(',', $query['select'] ?? ''), true);
        });
    }
}
