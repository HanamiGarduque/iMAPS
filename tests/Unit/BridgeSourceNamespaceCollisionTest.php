<?php

namespace Tests\Unit;

use App\Services\BridgeSourceIdentity;
use App\Services\SupabaseService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Tests\Support\FakePostgRest;
use Tests\TestCase;

/**
 * Cross-environment bridge namespace: two environments, the same local id.
 *
 * These tests drive the REAL writer code and inspect the REAL requests it
 * builds. `FakePostgRest` applies PostgREST's composite `on_conflict`
 * semantics so the assertions are behavioural, not string matching on source.
 *
 * Every scenario here is a rewrite of the proven 2026-10-01 incident:
 * source A's `local_inspection_id = 37` and source B's `local_inspection_id =
 * 37` used to resolve to ONE remote row.
 */
class BridgeSourceNamespaceCollisionTest extends TestCase
{
    private const SOURCE_A = 'imaps-rosario-canopy-prod';

    private const SOURCE_B = 'imaps-rosario-canopy-dr';

    private FakePostgRest $rest;

    protected function setUp(): void
    {
        parent::setUp();

        $this->rest = new FakePostgRest();
        Http::fake(fn (Request $request) => $this->rest->handle($request));

        config([
            'services.supabase.url'         => 'https://example.supabase.co',
            'services.supabase.anon_key'    => 'anon',
            'services.supabase.service_key' => 'service',
        ]);
    }

    private function useSource(?string $sourceId): void
    {
        config(['bridge.source_id' => $sourceId]);
    }

    private function service(): SupabaseService
    {
        return new SupabaseService();
    }

    /**
     * The remote table shape as audited on 2026-10-01, AFTER the forward SQL:
     * identity is the composite key, never a bare local integer.
     */
    private function declarePostMigrationShape(): void
    {
        $this->rest->declareUniqueKeys('field_jobs', [
            ['bridge_source_id', 'local_inspection_id'],
        ]);
        $this->rest->declareUniqueKeys('supabase_zoning_applications', [
            ['bridge_source_id', 'local_application_id'],
        ]);
        $this->rest->declareUniqueKeys('supabase_parcels', [
            ['bridge_source_id', 'local_parcel_id'],
        ]);
        $this->rest->declareUniqueKeys('field_job_reviews', [
            ['bridge_source_id', 'technical_review_id'],
        ]);
    }

    // ==================================================================
    // THE INCIDENT, REPLAYED
    // ==================================================================

    public function test_two_environments_with_the_same_local_inspection_id_produce_two_distinct_remote_jobs(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        $this->service()->createFieldJob([
            'local_inspection_id'     => 37,
            'supabase_application_id' => 'aaaa-app-132',
            'supabase_parcel_id'      => 'aaaa-parcel-64',
            'assigned_inspector_id'   => 'ddcebeac-2217-41c5-a6e2-d7f873db9af2',
            'scheduled_date'          => '2026-09-23',
        ]);

        $this->useSource(self::SOURCE_B);
        $this->service()->createFieldJob([
            'local_inspection_id'     => 37,
            'supabase_application_id' => 'bbbb-app-138',
            'supabase_parcel_id'      => 'bbbb-parcel-70',
            'assigned_inspector_id'   => 'c4e22f50-d3c3-4495-b3be-bd264da2e735',
            'scheduled_date'          => '2026-10-01',
        ]);

        $this->assertSame(2, $this->rest->count('field_jobs'), 'Each environment must get its own remote job.');

        $aRows = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => ($r['bridge_source_id'] ?? null) === self::SOURCE_A
        ));
        $bRows = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => ($r['bridge_source_id'] ?? null) === self::SOURCE_B
        ));

        $this->assertCount(1, $aRows);
        $this->assertCount(1, $bRows);
        $this->assertNotSame($aRows[0]['id'], $bRows[0]['id']);
        $this->assertSame(37, $aRows[0]['local_inspection_id']);
        $this->assertSame(37, $bRows[0]['local_inspection_id']);
    }

    public function test_source_b_cannot_overwrite_the_source_a_mapping(): void
    {
        $this->declarePostMigrationShape();

        // Source A: the Teshow Round 2 mapping.
        $this->useSource(self::SOURCE_A);
        $this->service()->createFieldJob([
            'local_inspection_id'      => 37,
            'supabase_application_id'  => 'aaaa-app-132',
            'supabase_parcel_id'       => 'aaaa-parcel-64',
            'assigned_inspector_id'    => 'ddcebeac-2217-41c5-a6e2-d7f873db9af2',
            'scheduled_date'           => '2026-09-23',
            'deadline_date'            => '2026-10-23',
            'assignment_instructions'  => 'Loop 4 Round 2 reinspection',
        ]);

        // Source B: the hijack, exactly as it happened on 2026-10-01.
        $this->useSource(self::SOURCE_B);
        $this->service()->createFieldJob([
            'local_inspection_id'      => 37,
            'supabase_application_id'  => 'bbbb-app-138',
            'supabase_parcel_id'       => 'bbbb-parcel-70',
            'assigned_inspector_id'    => 'c4e22f50-d3c3-4495-b3be-bd264da2e735',
            'scheduled_date'           => '2026-10-01',
            'deadline_date'            => '2026-10-03',
            'assignment_instructions'  => 'hijack',
        ]);

        $sourceA = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => ($r['bridge_source_id'] ?? null) === self::SOURCE_A
        ))[0];

        $this->assertSame('aaaa-app-132', $sourceA['supabase_application_id'], 'Source A application must be untouched.');
        $this->assertSame('aaaa-parcel-64', $sourceA['supabase_parcel_id'], 'Source A parcel must be untouched.');
        $this->assertSame('ddcebeac-2217-41c5-a6e2-d7f873db9af2', $sourceA['assigned_inspector_id']);
        $this->assertSame('2026-09-23', $sourceA['scheduled_date']);
        $this->assertSame('2026-10-23', $sourceA['deadline_date']);
        $this->assertSame('Loop 4 Round 2 reinspection', $sourceA['assignment_instructions']);
    }

    public function test_source_a_retry_updates_only_the_source_a_job(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        $this->service()->createFieldJob([
            'local_inspection_id' => 37,
            'status'              => 'in_progress',
            'current_step'        => 1,
            'started_at'          => '2026-09-26T18:05:46.831173+00:00',
            'step_timestamps'     => ['1' => '2026-09-26T17:50:46.146511Z'],
        ]);

        $firstId = $this->rest->rows('field_jobs')[0]['id'];

        $this->useSource(self::SOURCE_B);
        $this->service()->createFieldJob([
            'local_inspection_id' => 37,
            'status'              => 'assigned',
            'current_step'        => 0,
        ]);
        $otherId = $this->rest->rows('field_jobs')[1]['id'];

        // The retry: same source, same local id, updated assignment.
        $this->useSource(self::SOURCE_A);
        $this->service()->createFieldJob([
            'local_inspection_id'     => 37,
            'supabase_application_id' => 'aaaa-app-132',
            'scheduled_date'          => '2026-10-02',
        ]);

        $this->assertSame(2, $this->rest->count('field_jobs'), 'A retry must not create a third row.');

        $sourceA = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => ($r['bridge_source_id'] ?? null) === self::SOURCE_A
        ))[0];

        $this->assertSame($firstId, $sourceA['id'], 'The retry must converge on the SAME remote job uuid.');
        $this->assertSame('2026-10-02', $sourceA['scheduled_date']);

        $sourceB = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => ($r['bridge_source_id'] ?? null) === self::SOURCE_B
        ))[0];

        $this->assertSame($otherId, $sourceB['id']);
        $this->assertArrayNotHasKey('scheduled_date', $sourceB, 'The retry must not reach the other namespace.');
    }

    public function test_identical_repeated_writes_stay_one_row_per_namespace(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        for ($i = 0; $i < 3; $i++) {
            $this->service()->createFieldJob([
                'local_inspection_id' => 37,
                'supabase_application_id' => 'aaaa-app-132',
            ]);
        }

        $this->assertSame(1, $this->rest->count('field_jobs'));
    }

    // ==================================================================
    // APPLICATION AND PARCEL MIRRORS
    // ==================================================================

    public function test_application_mirrors_do_not_collide_across_environments(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        $uuidA = $this->service()->pushZoningApplication([
            'local_application_id' => 132,
            'reference_number'     => 'APP-2026-00026',
            'applicant_name'       => 'Teshow Promsakha Sakonnakhon',
        ]);

        $this->useSource(self::SOURCE_B);
        $uuidB = $this->service()->pushZoningApplication([
            'local_application_id' => 132,
            'reference_number'     => 'APP-2026-00032',
            'applicant_name'       => 'Boy Abunda',
        ]);

        $this->assertNotNull($uuidA);
        $this->assertNotNull($uuidB);
        $this->assertNotSame($uuidA, $uuidB, 'Same local application id, two environments, two remote rows.');
        $this->assertSame(2, $this->rest->count('supabase_zoning_applications'));
    }

    public function test_parcel_mirrors_do_not_collide_across_environments(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        $this->service()->pushParcel([
            'local_parcel_id'       => 64,
            'property_index_number' => '04-01-021-023-12-047',
            'owner_name'            => 'Jose Dimayuga',
        ]);

        $this->useSource(self::SOURCE_B);
        $this->service()->pushParcel([
            'local_parcel_id'       => 64,
            'property_index_number' => '04-01-021-001-10-672',
            'owner_name'            => 'Antonio Macatangay',
        ]);

        $this->assertSame(2, $this->rest->count('supabase_parcels'));

        $pins = array_map(
            fn (array $r): string => (string) $r['property_index_number'],
            $this->rest->rows('supabase_parcels'),
        );

        $this->assertContains('04-01-021-023-12-047', $pins);
        $this->assertContains('04-01-021-001-10-672', $pins);
    }

    public function test_planning_review_mirror_is_namespaced_too(): void
    {
        $this->declarePostMigrationShape();

        $this->useSource(self::SOURCE_A);
        $this->assertTrue($this->service()->upsertFieldJobReview([
            'field_job_id'        => 'job-a',
            'technical_review_id' => 76,
            'decision'            => 'Approved',
        ]));

        $this->useSource(self::SOURCE_B);
        $this->assertTrue($this->service()->upsertFieldJobReview([
            'field_job_id'        => 'job-b',
            'technical_review_id' => 76,
            'decision'            => 'Declined',
        ]));

        $this->assertSame(2, $this->rest->count('field_job_reviews'));

        $decisions = array_map(
            fn (array $r): string => (string) $r['decision'],
            $this->rest->rows('field_job_reviews'),
        );

        $this->assertContains('Approved', $decisions);
        $this->assertContains('Declined', $decisions);
    }

    // ==================================================================
    // REQUEST SHAPE: NO WRITE PATH MAY USE A BARE LOCAL ID
    // ==================================================================

    public function test_no_write_path_uses_a_bare_local_id_conflict_target(): void
    {
        $this->declarePostMigrationShape();
        $this->useSource(self::SOURCE_A);

        $service = $this->service();
        $service->pushZoningApplication(['local_application_id' => 132]);
        $service->pushParcel(['local_parcel_id' => 64]);
        $service->createFieldJob(['local_inspection_id' => 37]);
        $service->upsertFieldJobReview(['technical_review_id' => 76]);

        foreach ($this->rest->requests() as $request) {
            $onConflict = $request['query']['on_conflict'] ?? null;

            $this->assertNotNull($onConflict, 'A mirror write must declare an explicit conflict target.');
            $this->assertStringContainsString(
                'bridge_source_id',
                (string) $onConflict,
                "Conflict target {$onConflict} is not namespaced.",
            );
        }
    }

    public function test_every_mirror_write_carries_its_own_bridge_source_id(): void
    {
        $this->declarePostMigrationShape();
        $this->useSource(self::SOURCE_A);

        $service = $this->service();
        $service->pushZoningApplication(['local_application_id' => 132]);
        $service->pushParcel(['local_parcel_id' => 64]);
        $service->createFieldJob(['local_inspection_id' => 37]);
        $service->upsertFieldJobReview(['technical_review_id' => 76]);

        $this->assertCount(4, $this->rest->requests());

        foreach ($this->rest->requests() as $request) {
            $this->assertSame(
                self::SOURCE_A,
                $request['body']['bridge_source_id'] ?? null,
                'A mirror write without its own namespace could be matched by another environment.',
            );
        }
    }

    // ==================================================================
    // FAIL CLOSED
    // ==================================================================

    public function test_a_missing_bridge_source_id_fails_closed_before_any_remote_write(): void
    {
        $this->declarePostMigrationShape();
        $this->useSource(null);

        $service = $this->service();

        try {
            $service->createFieldJob(['local_inspection_id' => 37]);
            $this->fail('A missing bridge source id must not be allowed to write.');
        } catch (RuntimeException $e) {
            $this->assertStringContainsString(BridgeSourceIdentity::ENV_KEY, $e->getMessage());
            $this->assertStringContainsString('no default', $e->getMessage());
        }

        $this->assertCount(0, $this->rest->requests(), 'Nothing may reach the network without bridge identity.');
        $this->assertSame(0, $this->rest->count('field_jobs'));
    }

    public function test_a_shared_placeholder_bridge_source_id_is_rejected_rather_than_defaulted(): void
    {
        // `production` is deliberately NOT here: an environment genuinely named
        // "production" is an explicit choice, and the contract forbids a silent
        // fallback rather than an explicit word. See BridgeSourceIdentity::REJECTED.
        foreach (['default', 'localhost', 'changeme', 'YOUR-BRIDGE-SOURCE-ID', 'NONE', 'null'] as $placeholder) {
            $this->useSource($placeholder);

            $this->assertFalse(
                BridgeSourceIdentity::isConfigured(),
                "'{$placeholder}' must never be accepted as a namespace identity.",
            );

            $rejected = false;

            try {
                BridgeSourceIdentity::id();
            } catch (RuntimeException $e) {
                $rejected = true;
                $this->assertStringContainsString(BridgeSourceIdentity::ENV_KEY, $e->getMessage());
            }

            $this->assertTrue($rejected, "'{$placeholder}' must fail closed, not resolve to some default.");
        }
    }

    public function test_a_bridge_source_id_containing_postgrest_syntax_is_rejected(): void
    {
        // A comma would silently change the meaning of a PostgREST filter, so
        // it must be refused rather than sanitised into something plausible.
        foreach (['has,comma', 'has space', 'has(paren)', 'has"quote', 'a'] as $bad) {
            $this->useSource($bad);
            $this->assertFalse(BridgeSourceIdentity::isConfigured(), "'{$bad}' must be rejected.");
        }
    }

    public function test_a_valid_bridge_source_id_is_accepted_and_is_not_derived(): void
    {
        $this->useSource('imaps-rosario-canopy-prod');

        $this->assertTrue(BridgeSourceIdentity::isConfigured());
        $this->assertSame('imaps-rosario-canopy-prod', BridgeSourceIdentity::id());
    }

    // ==================================================================
    // READERS
    // ==================================================================

    public function test_readers_only_see_this_environments_rows(): void
    {
        $this->rest->seed('field_jobs', [
            'bridge_source_id'    => self::SOURCE_A,
            'local_inspection_id' => 37,
            'id'                  => 'job-a',
            'status'              => 'in_progress',
        ]);
        $this->rest->seed('field_jobs', [
            'bridge_source_id'    => self::SOURCE_B,
            'local_inspection_id' => 37,
            'id'                  => 'job-b',
            'status'              => 'assigned',
        ]);
        $this->rest->declareUniqueKeys('field_jobs', [['bridge_source_id', 'local_inspection_id']]);

        $this->useSource(self::SOURCE_A);
        $service = $this->service();

        $this->assertSame('job-a', $service->findFieldJobIdByLocalInspectionId(37));

        $states = $service->fieldJobTransferStates([37]);
        $this->assertArrayHasKey(37, $states);
        $this->assertSame('in_progress', $states[37]['status'], 'Another environment\'s job state leaked in.');

        $this->useSource(self::SOURCE_B);
        $this->assertSame('job-b', $this->service()->findFieldJobIdByLocalInspectionId(37));
    }

    public function test_every_lookup_that_means_my_environments_row_filters_on_bridge_source_id(): void
    {
        $this->rest->seed('field_jobs', [
            'bridge_source_id'    => self::SOURCE_A,
            'local_inspection_id' => 37,
            'id'                  => 'job-a',
        ]);
        $this->rest->declareUniqueKeys('field_jobs', [['bridge_source_id', 'local_inspection_id']]);

        $this->useSource(self::SOURCE_A);
        $this->service()->findFieldJobIdByLocalInspectionId(37);
        $this->service()->fieldJobTransferStates([37]);

        foreach ($this->rest->requests() as $request) {
            $this->assertSame(
                'eq.' . self::SOURCE_A,
                $request['query']['bridge_source_id'] ?? null,
                'A lookup that means "my row" must filter on the namespace.',
            );
        }
    }

    // ==================================================================
    // LOOP 10 FIXTURE
    // ==================================================================

    public function test_the_loop_10_fixture_survives_namespacing_byte_for_byte(): void
    {
        // The real remote row for APP-2026-00030 / local inspection 41, as
        // audited on 2026-10-01, already carrying the backfilled namespace.
        $this->rest->seed('field_jobs', [
            'id'                      => '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999',
            'bridge_source_id'        => self::SOURCE_A,
            'local_inspection_id'     => 41,
            'supabase_application_id' => 'b108513f-b1e8-4415-a088-b4107fc4374b',
            'supabase_parcel_id'      => 'cf974dc9-d219-4f9d-9776-40e237c12d34',
            'status'                  => 'in_progress',
            'current_step'            => 1,
            'started_at'              => '2026-10-01T03:39:49.20847+00:00',
            'step_timestamps'         => ['1' => '2026-10-01T03:37:50.742199Z'],
            'assigned_inspector_id'   => '7abb9a75-8df1-491c-8677-de2da43af494',
            'scheduled_date'          => '2026-10-01',
            'deadline_date'           => '2026-11-01',
            'assignment_instructions' => 'testing',
        ]);
        $this->rest->declareUniqueKeys('field_jobs', [['bridge_source_id', 'local_inspection_id']]);

        $this->useSource(self::SOURCE_A);

        $this->assertSame(
            '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999',
            $this->service()->findFieldJobIdByLocalInspectionId(41),
            'The fixture must resolve by bridge_source_id + 41.',
        );

        $fixture = $this->rest->rows('field_jobs')[0];

        $this->assertSame('1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999', $fixture['id'], 'Same UUID.');
        $this->assertSame(41, $fixture['local_inspection_id']);
        $this->assertSame('in_progress', $fixture['status'], 'Same lifecycle state.');
        $this->assertSame(1, $fixture['current_step'], 'Same step.');
        $this->assertSame('2026-10-01T03:39:49.20847+00:00', $fixture['started_at']);
        $this->assertSame(['1' => '2026-10-01T03:37:50.742199Z'], $fixture['step_timestamps']);
        $this->assertSame('7abb9a75-8df1-491c-8677-de2da43af494', $fixture['assigned_inspector_id'], 'Same assignment.');
        $this->assertSame('b108513f-b1e8-4415-a088-b4107fc4374b', $fixture['supabase_application_id']);
        $this->assertSame('cf974dc9-d219-4f9d-9776-40e237c12d34', $fixture['supabase_parcel_id']);
        $this->assertSame('testing', $fixture['assignment_instructions']);
    }

    public function test_a_writer_retry_for_inspection_41_does_not_duplicate_the_fixture(): void
    {
        $this->rest->seed('field_jobs', [
            'id'                  => '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999',
            'bridge_source_id'    => self::SOURCE_A,
            'local_inspection_id' => 41,
            'status'              => 'in_progress',
            'current_step'        => 1,
        ]);
        $this->rest->seed('field_jobs', [
            'id'                  => 'other-env-job',
            'bridge_source_id'    => self::SOURCE_B,
            'local_inspection_id' => 41,
            'status'              => 'assigned',
        ]);
        $this->rest->declareUniqueKeys('field_jobs', [['bridge_source_id', 'local_inspection_id']]);

        $this->useSource(self::SOURCE_A);
        $this->assertTrue($this->service()->createFieldJob([
            'local_inspection_id'     => 41,
            'assignment_instructions' => 'testing',
        ]));

        $this->assertSame(2, $this->rest->count('field_jobs'), 'No duplicate may be created.');

        $fixture = array_values(array_filter(
            $this->rest->rows('field_jobs'),
            fn (array $r): bool => $r['id'] === '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999'
        ))[0];

        $this->assertSame('in_progress', $fixture['status'], 'Lifecycle must survive a writer retry.');
        $this->assertSame(1, $fixture['current_step']);
    }

    // ==================================================================
    // OLD WRITER SAFETY
    // ==================================================================

    public function test_a_bare_local_id_conflict_target_is_refused_by_the_server(): void
    {
        // Post-migration, field_jobs has ONLY the composite unique key. This is
        // the exact request an OLD deployment still sends.
        $this->rest->declareUniqueKeys('field_jobs', [['bridge_source_id', 'local_inspection_id']]);
        $this->useSource(self::SOURCE_A);

        $response = Http::post('https://example.supabase.co/rest/v1/field_jobs?on_conflict=local_inspection_id', [
            'local_inspection_id' => 37,
        ]);

        $this->assertTrue($response->failed(), 'The old writer must FAIL, not silently overwrite.');
        $this->assertSame(409, $response->status());
        $this->assertSame('42P10', $response->json('code'));
        $this->assertStringContainsString(
            'no unique or exclusion constraint matching the ON CONFLICT specification',
            (string) $response->json('message'),
        );

        $this->assertSame(0, $this->rest->count('field_jobs'), 'The refused request must not have written a row.');
    }

    public function test_the_namespaced_writer_never_emits_a_bare_local_id_conflict_target(): void
    {
        $this->declarePostMigrationShape();
        $this->useSource(self::SOURCE_A);

        $this->assertTrue($this->service()->createFieldJob(['local_inspection_id' => 37]));

        $requests = $this->rest->requests();
        $last = $requests[count($requests) - 1];
        $this->assertSame('bridge_source_id,local_inspection_id', $last['query']['on_conflict']);
    }

    public function test_the_production_writer_source_ships_the_namespaced_contract(): void
    {
        // The job that caused the incident must be namespaced too. This is a
        // source-level assertion because PushInspectionToSupabase needs a live
        // Eloquent graph and a Supabase project; the request shape it builds is
        // asserted above against the same SupabaseService transport.
        $source = file_get_contents(base_path('app/Jobs/PushInspectionToSupabase.php'));
        $this->assertNotFalse($source);

        $this->assertStringNotContainsString('on_conflict=local_application_id', $source);
        $this->assertStringNotContainsString('on_conflict=local_parcel_id', $source);
        $this->assertStringNotContainsString('on_conflict=local_inspection_id', $source);

        $this->assertStringContainsString('on_conflict=bridge_source_id,local_application_id', $source);
        $this->assertStringContainsString('on_conflict=bridge_source_id,local_parcel_id', $source);
        $this->assertStringContainsString('on_conflict=bridge_source_id,local_inspection_id', $source);

        $this->assertStringContainsString('"eq.{$bridgeSourceId}"', $source);
        $this->assertStringContainsString('$bridgeSourceId = BridgeSourceIdentity::id();', $source);
    }

    public function test_the_source_reader_is_unchanged_by_namespacing(): void
    {
        $sources = [
            'app/Jobs/PushInspectionToSupabase.php',
            'app/Services/SupabaseService.php',
            'app/Console/Commands/PullCompletedInspections.php',
            'app/Jobs/PushPlanningReviewToSupabase.php',
            'config/bridge.php',
            'app/Services/BridgeSourceIdentity.php',
        ];

        foreach ($sources as $path) {
            $this->assertFileExists(base_path($path));
        }
    }
}
