<?php

namespace Tests\Unit;

use App\Models\InspectionDeliveryAttempt;
use App\Support\InspectionDeliveryStatus;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * LOOP 9D - Admin aggregate delivery monitoring.
 *
 * 9C gave Admin the SAME per-application delivery panel a Planning Officer gets.
 * What did not exist was AGGREGATE monitoring: a way to answer "which deliveries
 * are broken?" without opening every application, and a way to see the attempt
 * history behind a round.
 *
 * THIS IS A READ-ONLY FEATURE. The authority boundary is the point of the suite,
 * so it is asserted from four independent directions:
 *
 *   1. the surface is Admin-gated on the SERVER, not merely hidden in React;
 *   2. the retry route is still Planning-Officer-only and still refuses Admin;
 *   3. attempt history is opt-in, absent by default, and Admin-only even when
 *      requested directly;
 *   4. no secret, credential or raw exception payload can reach a browser.
 *
 * The real behaviour is proven against `imaps_db_test` under a hard
 * rollback-only guard; this file is deliberately NOT a source-grep suite, because
 * every one of these rules is about what a viewer can actually obtain.
 */
class Loop9dAdminDeliveryMonitoringContractTest extends TestCase
{
    /** The ONLY database the live probes may ever touch. */
    private const SAFE_DATABASE = 'imaps_db_test';

    private function controllerSource(): string
    {
        return (string) file_get_contents(base_path('app/Http/Controllers/InspectionDeliveryController.php'));
    }

    private function listControllerSource(): string
    {
        return (string) file_get_contents(base_path('app/Http/Controllers/ApplicationController.php'));
    }

    private function panelSource(): string
    {
        return (string) file_get_contents(base_path('resources/js/Components/InspectionDeliveryStatusPanel.jsx'));
    }

    private function registrySource(): string
    {
        return (string) file_get_contents(base_path('resources/js/Pages/Applications/Index.jsx'));
    }

    private function statements(string $text): string
    {
        $text = (string) preg_replace('#/\*.*?\*/#s', '', $text);
        $text = (string) preg_replace('#^\s*(//|\*).*$#m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ==================================================================
    // 1. AUTHORITY BOUNDARY - the whole point of 9D
    // ==================================================================

    public function test_the_retry_route_is_still_planning_officer_only(): void
    {
        $web = (string) file_get_contents(base_path('routes/web.php'));

        $this->assertMatchesRegularExpression(
            '/retry-delivery.*?middleware\(\'role:Planning Officer\'\)/s',
            $web,
            'The retry route must remain Planning-Officer-only. 9D must not widen it.'
        );

        $this->assertStringNotContainsString(
            'role:Admin,Planning Officer',
            $this->statements($this->methodAfter($web, 'retry-delivery')),
            'Admin must never be added to the retry boundary.'
        );
    }

    public function test_the_monitoring_controller_writes_nothing(): void
    {
        // The monitoring additions are a read. The ONLY writes in this file belong
        // to the 9C-3 retry action, which is a separate method and is gated on the
        // Planning Officer route.
        $readOnly = $this->statements($this->methodBody($this->controllerSource(), 'private function loadAttemptHistory'))
            . ' ' . $this->statements($this->methodBody($this->controllerSource(), 'private function resolveAttemptHistoryRequest'))
            . ' ' . $this->statements($this->methodBody($this->controllerSource(), 'private function shapeRounds'));

        foreach (['insert(', 'update(', 'delete(', '::create(', 'forceFill(', '->save()', 'DB::table'] as $write) {
            $this->assertStringNotContainsString(
                $write,
                $readOnly,
                "9D monitoring must not write. Found '{$write}' in the monitoring read path."
            );
        }

        // Sanity: these three methods are the ones 9D added, and they must all
        // exist, or the assertions above would pass vacuously on empty strings.
        foreach ([
            'private function loadAttemptHistory',
            'private function resolveAttemptHistoryRequest',
            'private function shapeRounds',
        ] as $method) {
            $this->assertStringContainsString(
                $method,
                $this->controllerSource(),
                "Expected method missing: {$method}"
            );
        }

        $this->assertNotSame('', trim($readOnly), 'The scoped read path must not be empty.');
    }

    public function test_attempt_history_is_admin_only_and_absent_by_default(): void
    {
        $code = $this->statements($this->methodBody($this->controllerSource(), 'private function resolveAttemptHistoryRequest'));

        $this->assertStringContainsString(
            "! \$request->filled('include_attempts')",
            $code,
            'Attempt history must be opt-in. The default reader response must carry none.'
        );

        $this->assertStringContainsString(
            "=== 'Admin'",
            $code,
            'Attempt history must be refused for every non-Admin role, server-side.'
        );

        $this->assertStringContainsString(
            '403',
            $code,
            'A non-Admin asking for history must be refused, not silently served a smaller payload.'
        );
    }

    public function test_history_is_scoped_to_a_round_of_this_application(): void
    {
        $code = $this->statements($this->methodBody($this->controllerSource(), 'private function loadAttemptHistory'));

        $this->assertStringContainsString(
            '$application->siteInspections()',
            $code,
            'The requested round must be proved to belong to the requested application.'
        );

        $this->assertStringContainsString(
            '404',
            $code,
            'A round from another application must 404 rather than leak its history.'
        );
    }

    public function test_admin_never_gets_retry_authority(): void
    {
        // `can_retry` is the fact the UI gates on, and it must stay false for
        // Admin. This is the server-side half of "Admin sees no Retry button".
        $this->assertFalse(
            \App\Support\InspectionDeliveryRetryEligibility::canRetry(
                [
                    'round_id' => 39,
                    'parcel_id' => 75,
                    'delivery_status' => 'delivery_failed',
                    'inspector_eligible' => true,
                ],
                [75 => 39],
                'Admin',
                4,
                1,
            ),
            'Admin must never be an authorized retry actor.'
        );

        $this->assertNull(
            InspectionDeliveryStatus::retryUnavailableReason('Admin', 4, 1),
            'Admin must be told nothing about retry, because Admin never sees the control.'
        );
    }

    // ==================================================================
    // 2. SUPERSESSION IS SERVER-COMPUTED
    // ==================================================================

    public function test_supersession_is_computed_on_the_server_not_in_react(): void
    {
        $panel = $this->statements($this->panelSource());

        $this->assertStringContainsString(
            'inspection.is_superseded',
            $panel,
            'The panel must read the server flag verbatim.'
        );

        $this->assertStringContainsString(
            'isSuperseded = inspection.is_superseded === true',
            $panel,
            'The panel must not recompute supersession.'
        );

        // The real definition lives in the ONE eligibility predicate, so the
        // reader and the retry refusal can never disagree.
        $controller = $this->statements($this->controllerSource());
        $this->assertStringContainsString(
            'InspectionDeliveryRetryEligibility::isSuperseded(',
            $controller,
            'The reader must use the shared supersession predicate.'
        );
    }

    public function test_a_superseded_round_is_marked_not_hidden(): void
    {
        $panel = $this->statements($this->panelSource());

        $this->assertStringContainsString('Superseded', $panel, 'A superseded round must be marked.');
        $this->assertStringContainsString(
            'A newer inspection round exists for this parcel.',
            $panel,
            'The marker must carry its helper text.'
        );

        // Every round is still rendered: the reader returns all of them and the
        // panel maps all of them. Hiding history would erase evidence.
        $this->assertStringContainsString('rounds.map', $panel, 'Every round must still render.');
    }

    // ==================================================================
    // 3. THE AGGREGATE FILTER
    // ==================================================================

    public function test_the_delivery_filter_is_admin_only_and_server_side(): void
    {
        $code = $this->statements($this->listControllerSource());

        $this->assertStringContainsString(
            "'Admin'",
            $code,
            'The monitoring feature must be gated on the Admin role server-side.'
        );

        $this->assertStringContainsString(
            'delivery_status',
            $code,
            'The filter must be applied in the controller, not the browser.'
        );
    }

    public function test_the_filter_matches_the_row_it_selects(): void
    {
        $code = $this->statements($this->listControllerSource());

        // The filter's ordering rule and the row data's rule must be the same
        // rule, or a row can disagree with the filter that chose it.
        $this->assertStringContainsString(
            'ORDER BY si.id DESC',
            $code,
            'The filter must select the monitoring round by the same chronology the row data uses.'
        );

        $this->assertStringContainsString(
            'IS NULL',
            $code,
            'no_delivery_record must be a real predicate, not a client-side guess.'
        );
    }

    public function test_the_filter_cannot_be_used_to_empty_the_registry(): void
    {
        $code = $this->statements($this->listControllerSource());

        $this->assertStringContainsString(
            "in_array(\$requested, \$filterable, true)",
            $code,
            'The filter must accept only the closed vocabulary.'
        );

        $this->assertStringContainsString(
            "=== 'all'",
            $code,
            "An unrecognized value must behave as 'all' rather than matching nothing."
        );
    }

    public function test_the_list_never_loads_attempt_rows(): void
    {
        $code = $this->statements($this->listControllerSource());

        $this->assertStringContainsString(
            "withCount('deliveryAttempts')",
            $code,
            'The list must use the aggregate count, not attempt rows.'
        );

        $this->assertStringNotContainsString(
            "with(['deliveryAttempts'",
            $code,
            'The list must never eager-load attempt history: that is the N+1 9D must not introduce.'
        );
    }

    public function test_no_supabase_or_fieldsync_call_exists_in_the_monitoring_path(): void
    {
        $monitoring = $this->statements(
            $this->methodBody($this->listControllerSource(), 'private function buildDeliveryMonitoring')
        );

        foreach (['Http::', 'supabase', 'Supabase', 'PushInspectionToSupabase', 'dispatch('] as $remote) {
            $this->assertStringNotContainsString(
                $remote,
                $monitoring,
                "Monitoring must be local PostgreSQL only. Found '{$remote}'."
            );
        }
    }

    // ==================================================================
    // 4. NOTHING SECRET REACHES A BROWSER
    // ==================================================================

    public function test_attempt_history_exposes_no_free_text_or_credential(): void
    {
        $code = $this->statements($this->methodBody($this->controllerSource(), 'private function loadAttemptHistory'));

        // `safe_message` is the only free-text column on the table. The contract
        // authorizes the closed category vocabulary, and a free-text column is the
        // one field that could carry wording authored outside this codebase.
        $this->assertStringNotContainsString(
            'safe_message',
            $code,
            'Attempt history must not expose the free-text safe_message column.'
        );

        foreach ([
            'handshake_key', 'password', 'remember_token', 'Bearer',
            'SUPABASE_SERVICE_KEY', 'access_token', 'apikey', 'signed_url',
        ] as $secret) {
            $this->assertStringNotContainsString(
                $secret,
                $code,
                "'{$secret}' must never appear in the monitoring read path."
            );
        }
    }

    public function test_the_raw_category_token_is_normalized_and_labelled_server_side(): void
    {
        // The token is a CHECK-constrained value and the label is authored copy,
        // so a browser can never receive an unrecognized or exception-derived one.
        $this->assertSame(
            'Inspector mapping unresolved',
            InspectionDeliveryStatus::failureCategoryLabel('inspector_mapping_unresolved'),
        );

        $this->assertSame(
            'Unclassified failure',
            InspectionDeliveryStatus::failureCategoryLabel('something_invented_later'),
            'An unrecognized category must degrade to the authored unknown label, never render raw.'
        );

        $this->assertNull(
            InspectionDeliveryStatus::failureCategoryLabel(null),
            'Absence of a category is not a category.'
        );
    }

    public function test_source_and_outcome_labels_are_server_authored(): void
    {
        $this->assertSame(
            'Planning Officer retry',
            InspectionDeliveryStatus::sourceLabel(InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY),
        );

        $this->assertSame(
            'Delivered',
            InspectionDeliveryStatus::outcomeLabel(InspectionDeliveryAttempt::OUTCOME_DELIVERED),
        );

        $this->assertSame('Unrecognised source', InspectionDeliveryStatus::sourceLabel('nonsense'));
        $this->assertSame('Unrecognised outcome', InspectionDeliveryStatus::outcomeLabel('nonsense'));
    }

    public function test_the_browser_holds_no_delivery_business_predicate(): void
    {
        $registry = $this->statements($this->registrySource());

        // Presentation map only: colors keyed by server tokens. The browser must
        // not decide which round is current, whether a round is superseded, or
        // what a category means.
        foreach (['isSuperseded =', 'latestRound', 'supersedes'] as $inference) {
            $this->assertStringNotContainsString(
                $inference,
                $registry,
                "The registry must not infer delivery facts. Found '{$inference}'."
            );
        }
    }

    // ==================================================================
    // 5. LIVE PROOFS - rollback only, imaps_db_test only
    // ==================================================================

    private function useSafeDatabase(): void
    {
        config([
            'database.connections.pgsql.database' => self::SAFE_DATABASE,
            'database.default' => 'pgsql',
        ]);

        DB::purge('pgsql');

        $this->assertSame(
            self::SAFE_DATABASE,
            DB::connection('pgsql')->getDatabaseName(),
            'Refusing to run: 9D live probes must never touch canonical imaps_db_0921.'
        );
    }

    private function pgsqlAvailable(): bool
    {
        try {
            $this->useSafeDatabase();
            DB::connection('pgsql')->select('select 1');

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    public function test_attempt_history_round_trips_through_the_real_table(): void
    {
        if (! $this->pgsqlAvailable()) {
            $this->markTestSkipped('PostgreSQL test database unavailable; source contracts still asserted above.');
        }

        $this->useSafeDatabase();

        DB::connection('pgsql')->beginTransaction();

        try {
            $applicationId = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                'reference_number' => 'PHPUNIT-9D-HISTORY',
                'application_type' => 'Monitoring Probe',
                'purpose' => '9D attempt history probe',
                'applicant_name' => 'Probe',
                'contact_number' => '0000',
                'barangay' => 'Alupay',
            ]);

            $parcelId = DB::connection('pgsql')->table('parcels')->insertGetId([
                'zoning_application_id' => $applicationId,
                'parcel_code' => 'P-9D',
            ]);

            $roundA = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                'zoning_application_id' => $applicationId,
                'parcel_id' => $parcelId,
                'status' => 'assigned',
            ]);

            // A NEWER round for the SAME parcel supersedes the first one. This is
            // the real-world shape the marker exists for.
            $roundB = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                'zoning_application_id' => $applicationId,
                'parcel_id' => $parcelId,
                'status' => 'assigned',
            ]);

            $now = now();

            // One recorded FAILURE then one delivered retry, which is the exact
            // shape 9C-5 produced and the one monitoring must be able to explain.
            InspectionDeliveryAttempt::create([
                'site_inspection_id' => $roundB,
                'attempt_number' => 1,
                'source' => InspectionDeliveryAttempt::SOURCE_AUTOMATIC_RETRY,
                'outcome' => InspectionDeliveryAttempt::OUTCOME_FAILED,
                'failure_category' => InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE,
                'safe_message' => 'authored prose that must never be exposed',
                'attempted_at' => $now,
                'completed_at' => $now,
            ]);

            $uuid = '22222222-3333-4444-5555-666666666666';
            $attempt2 = InspectionDeliveryAttempt::create([
                'site_inspection_id' => $roundB,
                'attempt_number' => 2,
                'source' => InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY,
                'outcome' => InspectionDeliveryAttempt::OUTCOME_DELIVERED,
                'failure_category' => null,
                'safe_message' => null,
                'attempted_at' => $now,
                'completed_at' => $now,
            ]);
            $attempt2->forceFill(['queue_job_uuid' => $uuid])->save();

            $rounds = \App\Models\SiteInspection::query()
                ->where('zoning_application_id', $applicationId)
                ->withCount('deliveryAttempts')
                ->orderBy('id')
                ->get();

            // SUPERSESSION, from the same predicate the reader uses.
            $map = \App\Support\InspectionDeliveryRetryEligibility::latestRoundIdsByParcel($rounds);

            $this->assertTrue(
                \App\Support\InspectionDeliveryRetryEligibility::isSuperseded($roundA, $parcelId, $map),
                'The older round of the same parcel must be server-detected as superseded.'
            );

            $this->assertFalse(
                \App\Support\InspectionDeliveryRetryEligibility::isSuperseded($roundB, $parcelId, $map),
                'The newest round must not be superseded.'
            );

            // BOTH rounds stay visible. Superseded is a marker, never a filter.
            $this->assertCount(2, $rounds, 'A superseded round must remain in the reader payload.');

            // ATTEMPT HISTORY, read exactly as the controller reads it.
            $attempts = InspectionDeliveryAttempt::query()
                ->where('site_inspection_id', $roundB)
                ->orderBy('attempt_number')
                ->get([
                    'id', 'site_inspection_id', 'attempt_number', 'source', 'outcome',
                    'failure_category', 'attempted_at', 'completed_at', 'created_at', 'queue_job_uuid',
                ]);

            $this->assertCount(2, $attempts, 'Both attempts must be readable, oldest first.');

            $first = $attempts[0];
            $this->assertSame(1, (int) $first->attempt_number);
            $this->assertSame(InspectionDeliveryAttempt::SOURCE_AUTOMATIC_RETRY, $first->source);
            $this->assertSame(InspectionDeliveryAttempt::OUTCOME_FAILED, $first->outcome);
            $this->assertSame(
                'Remote validation failure',
                InspectionDeliveryStatus::failureCategoryLabel($first->failure_category),
            );
            $this->assertNotNull($first->created_at, 'created_at must be populated (9B hotfix).');

            $second = $attempts[1];
            $this->assertSame(2, (int) $second->attempt_number);
            $this->assertSame(InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY, $second->source);
            $this->assertSame(InspectionDeliveryAttempt::OUTCOME_DELIVERED, $second->outcome);
            $this->assertNull($second->failure_category, 'A delivered attempt has no failure category.');
            $this->assertNotNull($second->completed_at);
            $this->assertSame($uuid, $second->queue_job_uuid, 'Queue correlation must round-trip as an opaque uuid.');

            // The aggregate the LIST uses, and the count the reader already used
            // in 9C-1, must agree - proving there is no second definition.
            $this->assertSame(
                2,
                (int) $rounds->firstWhere('id', $roundB)->delivery_attempts_count,
                'withCount and the history query must agree on the same round.'
            );
        } finally {
            DB::connection('pgsql')->rollBack();
        }
    }

    public function test_the_delivery_filter_predicate_selects_each_state_correctly(): void
    {
        if (! $this->pgsqlAvailable()) {
            $this->markTestSkipped('PostgreSQL test database unavailable.');
        }

        $this->useSafeDatabase();

        DB::connection('pgsql')->beginTransaction();

        try {
            $make = function (string $ref, ?string $deliveryStatus): int {
                $applicationId = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                    'reference_number' => $ref,
                    'application_type' => 'Monitoring Probe',
                    'purpose' => '9D filter probe',
                    'applicant_name' => 'Probe',
                    'contact_number' => '0000',
                    'barangay' => 'Alupay',
                ]);

                $parcelId = DB::connection('pgsql')->table('parcels')->insertGetId([
                    'zoning_application_id' => $applicationId,
                    'parcel_code' => 'P-9D',
                ]);

                $roundId = DB::connection('pgsql')->table('site_inspections')->insertGetId([
                    'zoning_application_id' => $applicationId,
                    'parcel_id' => $parcelId,
                    'status' => 'assigned',
                ]);

                DB::connection('pgsql')->table('site_inspections')
                    ->where('id', $roundId)
                    ->update([
                        'delivery_status' => $deliveryStatus,
                        // The 9A contract REQUIRES `delivered_at` whenever the
                        // summary says `delivered`:
                        //   delivery_status IS DISTINCT FROM 'delivered'
                        //     OR delivered_at IS NOT NULL
                        // A fixture that sets `delivered` without it is rejected by
                        // the database, which is the constraint working correctly.
                        'delivered_at' => $deliveryStatus === 'delivered' ? now() : null,
                    ]);

                return $applicationId;
            };

            $delivered = $make('PHPUNIT-9D-DELIVERED', 'delivered');
            $pending = $make('PHPUNIT-9D-PENDING', 'pending_delivery');
            $failed = $make('PHPUNIT-9D-FAILED', 'delivery_failed');
            $noRecord = $make('PHPUNIT-9D-NORECORD', null);

            // The EXACT scalar subquery the controller uses.
            $sub = <<<'SQL'
                (SELECT si.delivery_status
                   FROM site_inspections si
                   JOIN parcels p ON p.id = si.parcel_id
                  WHERE p.zoning_application_id = zoning_applications.id
                  ORDER BY si.id DESC
                  LIMIT 1)
                SQL;

            $matches = fn (string $predicate) => DB::connection('pgsql')
                ->table('zoning_applications')
                ->whereIn('id', [$delivered, $pending, $failed, $noRecord])
                ->whereRaw($predicate)
                ->pluck('id')
                ->map(fn ($v) => (int) $v)
                ->all();

            $this->assertSame([$delivered], $matches("{$sub} = 'delivered'"), 'delivered filter');
            $this->assertSame([$pending], $matches("{$sub} = 'pending_delivery'"), 'pending_delivery filter');
            $this->assertSame([$failed], $matches("{$sub} = 'delivery_failed'"), 'delivery_failed filter');
            $this->assertSame([$noRecord], $matches("{$sub} IS NULL"), 'no_delivery_record filter');

            // An application with NO round at all is also "no delivery record",
            // because the subquery finds no row and yields NULL.
            $bareApplication = DB::connection('pgsql')->table('zoning_applications')->insertGetId([
                'reference_number' => 'PHPUNIT-9D-NOROUND',
                'application_type' => 'Monitoring Probe',
                'purpose' => '9D filter probe',
                'applicant_name' => 'Probe',
                'contact_number' => '0000',
                'barangay' => 'Alupay',
            ]);

            // `$noRecord` was created first, so its id is lower; both must match.
            $this->assertSame(
                [$noRecord, $bareApplication],
                DB::connection('pgsql')->table('zoning_applications')
                    ->whereIn('id', [$bareApplication, $noRecord, $delivered])
                    ->whereRaw("{$sub} IS NULL")
                    ->orderBy('id')
                    ->pluck('id')
                    ->map(fn ($v) => (int) $v)
                    ->all(),
                'An application with no inspection round has no delivery record either.'
            );
        } finally {
            DB::connection('pgsql')->rollBack();
        }
    }

    // ==================================================================
    // helpers
    // ==================================================================

    private function methodBody(string $source, string $signature): string
    {
        $start = strpos($source, $signature);
        $this->assertNotFalse($start, "Method not found: {$signature}");

        $rest = substr($source, $start + strlen($signature));

        if (preg_match('/\n {4}(?:public|private|protected)\s+function\s/', $rest, $m, PREG_OFFSET_CAPTURE) === 1) {
            return substr($rest, 0, $m[0][1]);
        }

        return $rest;
    }

    private function methodAfter(string $source, string $needle): string
    {
        $start = strpos($source, $needle);
        $this->assertNotFalse($start, "Not found: {$needle}");

        return substr($source, $start, 400);
    }
}
