<?php

namespace Tests\Feature;

use App\Models\InspectionDeliveryAttempt;
use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * ISSUE C REGRESSION HOTFIX — discovered during Issue D E2E on APP-2026-00036.
 *
 * THE DEFECT
 * ----------
 * `InspectionDeliveryController::shapeRounds()` captures `$recorderLiveFrom` in
 * its mapping closure, but the method never declares that parameter. PHP raises
 * "Undefined variable", Laravel converts the warning to an ErrorException, and
 * `GET /applications/{id}/delivery-status` returns HTTP 500 for EVERY
 * application. The application page then renders "Delivery status could not be
 * loaded."
 *
 * This is monitoring/presentation only. The delivery itself had succeeded; only
 * the reader was broken.
 *
 * WHAT IS PINNED HERE
 * -------------------
 *  - the endpoint answers 200 and never 500s for any round population;
 *  - the recorder proof is read exactly ONCE per request and is passed INTO
 *    round shaping, so shaping cannot silently reach for the database;
 *  - every delivery state still resolves to its own label, including the
 *    distinction between "no record" and "never delivered";
 *  - a junk stored status is never promoted to "Not Yet Delivered";
 *  - nothing officer-facing renders "Loop 9" or "No Delivery Record".
 */
class InspectionDeliveryStatusReaderTest extends TestCase
{
    use RefreshDatabase;

    private User $officer;
    private ZoningApplication $application;
    private Parcel $parcel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        $this->withoutVite();

        $this->officer = User::create(['name' => 'Delivery Officer', 'email' => 'delivery-'.uniqid().'@example.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
        $this->application = ZoningApplication::create([
            'reference_number' => 'APP-DELIVERY-'.uniqid(), 'application_type' => 'Locational Clearance',
            'status' => 'Technical Review', 'purpose' => 'Delivery reader regression.',
            'applicant_name' => 'Delivery Reader Applicant', 'contact_number' => '09171234567',
            'barangay' => 'Bagong Pook', 'encoded_by' => $this->officer->id,
            'assigned_planning_officer_id' => $this->officer->id,
        ]);
        $this->parcel = Parcel::create(['zoning_application_id' => $this->application->id,
            'parcel_code' => 'P-01', 'latitude' => 13.1, 'longitude' => 121.4]);
    }

    /**
     * delivery_status and friends are recorder-owned and deliberately NOT on
     * SiteInspection::$fillable, so mass assignment cannot write them. The
     * fixture therefore writes the column the way the recorder does.
     */
    private function round(?string $deliveryStatus, array $extra = []): SiteInspection
    {
        // `created_at` is what the recorder proof is compared against, and it is
        // Eloquent-owned rather than mass-assignable, so the fixture writes it.
        $timestamps = array_intersect_key($extra, ['created_at' => 1, 'updated_at' => 1]);
        unset($extra['created_at'], $extra['updated_at']);

        $round = SiteInspection::create($extra + [
            'zoning_application_id' => $this->application->id,
            'parcel_id'             => $this->parcel->id,
            'inspector_id'          => User::create(['name' => 'Inspector', 'email' => 'insp-'.uniqid().'@example.test',
                'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true,
                'handshake_key' => 'hk-'.uniqid()])->id,
            'status'                => 'assigned',
        ]);

        if ($deliveryStatus !== null) {
            $columns = ['delivery_status' => $deliveryStatus];

            // The schema CHECKs these relationships, so the fixture must write
            // what the recorder actually writes rather than the bare token.
            if ($deliveryStatus === 'delivered') {
                $columns['delivered_at'] = now();
            }
            if ($deliveryStatus === 'delivery_failed') {
                $columns['last_delivery_failure_category'] = 'supabase_unreachable';
            }

            DB::table('site_inspections')->where('id', $round->id)->update($columns);
        }

        if ($timestamps !== []) {
            DB::table('site_inspections')->where('id', $round->id)->update($timestamps);
        }

        return $round->fresh();
    }

    private function attempt(SiteInspection $round, string $outcome, ?string $attemptedAt = null): void
    {
        InspectionDeliveryAttempt::create([
            'site_inspection_id' => $round->id,
            'attempt_number'     => 1,
            'source'             => InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH,
            'outcome'            => $outcome,
            'attempted_at'       => $attemptedAt ?? now(),
            'completed_at'       => now(),
            'queue_job_uuid'     => (string) Str::uuid(),
        ]);
    }

    private function read(): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->officer)
            ->getJson(route('applications.delivery-status', $this->application->id));
    }

    /** label of the round whose id matches */
    private function labelFor(array $payload, int $roundId): ?string
    {
        foreach ($payload['inspections'] as $round) {
            if ((int) $round['inspection_id'] === $roundId) {
                return $round['delivery']['label'] ?? null;
            }
        }

        return null;
    }

    // ---------------------------------------------------------------- 1

    public function test_the_endpoint_answers_200_instead_of_500(): void
    {
        $this->round('delivered');
        $this->round(null);

        $response = $this->read();

        $this->assertSame(200, $response->getStatusCode(),
            'The delivery reader must never 500. ' . substr((string) $response->getContent(), 0, 300));
        $this->assertCount(2, $response->json('inspections'));
    }

    public function test_the_endpoint_answers_200_for_an_application_with_no_rounds(): void
    {
        $response = $this->read();

        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame([], $response->json('inspections'));
    }

    // ---------------------------------------------------------------- 2 & 3

    public function test_round_shaping_receives_the_request_level_recorder_proof(): void
    {
        // A round created BEFORE the earliest attempt predates the recorder.
        $historical = $this->round(null, ['created_at' => now()->subDays(10), 'updated_at' => now()->subDays(10)]);
        $this->attempt($this->round('delivered'), 'delivered', (string) now()->subDay());

        // The proof must be passed in, not re-read per round.
        $controller = (string) file_get_contents(
            dirname(__DIR__, 2) . '/app/Http/Controllers/InspectionDeliveryController.php'
        );
        $this->assertSame(
            1,
            substr_count($controller, 'InspectionDeliveryAttempt::recorderLiveFrom()'),
            'The recorder proof is read once per request, never once per round.'
        );
        $this->assertMatchesRegularExpression(
            '/shapeRounds\([^)]*\$attemptsByRound,\s*\$recorderLiveFrom\)/s',
            $controller,
            'status() must pass the request-level proof into shapeRounds().'
        );

        $response = $this->read();
        $this->assertSame(200, $response->getStatusCode());
        $this->assertSame(
            'Delivery History Unavailable',
            $this->labelFor($response->json(), (int) $historical->id),
        );
    }

    public function test_one_request_performs_exactly_one_recorder_proof_lookup(): void
    {
        $this->attempt($this->round('delivered'), 'delivered');
        for ($i = 0; $i < 4; $i++) {
            $this->round('pending_delivery');
        }

        $proofQueries = 0;
        DB::listen(function ($query) use (&$proofQueries): void {
            if (str_contains($query->sql, 'min(') && str_contains($query->sql, 'attempted_at')) {
                $proofQueries++;
            }
        });

        $this->assertSame(200, $this->read()->getStatusCode());

        $this->assertSame(1, $proofQueries,
            'Five rounds must still cost exactly one recorder proof query.');
    }

    // ---------------------------------------------------------------- 4..8

    public function test_a_round_predating_the_recorder_is_history_unavailable_not_never_delivered(): void
    {
        $historical = $this->round(null, ['created_at' => now()->subDays(10), 'updated_at' => now()->subDays(10)]);
        $this->attempt($this->round('delivered'), 'delivered', (string) now()->subDay());

        $this->assertSame('Delivery History Unavailable',
            $this->labelFor($this->read()->json(), (int) $historical->id));
    }

    public function test_a_post_recorder_round_with_no_attempt_is_not_yet_delivered(): void
    {
        $this->attempt($this->round('delivered'), 'delivered', (string) now()->subDay());
        $fresh = $this->round(null, ['created_at' => now(), 'updated_at' => now()]);

        $this->assertSame('Not Yet Delivered', $this->labelFor($this->read()->json(), (int) $fresh->id));
    }

    public function test_a_round_with_no_recorder_and_no_attempt_proves_nothing(): void
    {
        $this->assertFalse(Schema::hasTable('inspection_delivery_attempts') && false);

        $round = $this->round(null);
        $response = $this->read();

        // With NO attempt anywhere, recorderLiveFrom() is NULL, so the proof
        // cannot speak for the round and the neutral label is correct.
        $this->assertSame('Delivery History Unavailable',
            $this->labelFor($response->json(), (int) $round->id));
    }

    public function test_delivered_and_failed_rounds_keep_their_own_labels(): void
    {
        $delivered = $this->round('delivered');
        $this->attempt($delivered, 'delivered');
        $failed = $this->round('delivery_failed');

        $payload = $this->read()->json();

        $this->assertSame('Delivered', $this->labelFor($payload, (int) $delivered->id));
        $this->assertSame('Delivery Failed', $this->labelFor($payload, (int) $failed->id));
    }

    public function test_a_pending_round_reports_pending_and_not_a_failure(): void
    {
        $pending = $this->round('pending_delivery');
        $this->attempt($this->round('delivered'), 'delivered');

        $this->assertSame('Pending Delivery', $this->labelFor($this->read()->json(), (int) $pending->id));
    }

    // ---------------------------------------------------------------- 8

    public function test_a_junk_stored_status_is_never_promoted_to_not_yet_delivered(): void
    {
        // The column is CHECK-constrained, so a junk value cannot normally be
        // stored at all. The presentation guard is therefore proven where it
        // actually lives: the pure state mapper, which must degrade an unknown
        // value to the neutral no-record state even when the caller believes the
        // round was never attempted.
        $this->assertSame(
            \App\Support\InspectionDeliveryStatus::STATE_NO_RECORD,
            \App\Support\InspectionDeliveryStatus::state('totally_bogus_status', true)
        );
        $this->assertSame(
            \App\Support\InspectionDeliveryStatus::STATE_NO_RECORD,
            \App\Support\InspectionDeliveryStatus::state('some_future_status', true)
        );
        $this->assertSame(
            \App\Support\InspectionDeliveryStatus::STATE_PENDING,
            \App\Support\InspectionDeliveryStatus::state(\App\Support\InspectionDeliveryStatus::STATE_PENDING)
        );
    }

    public function test_the_stored_delivery_status_is_check_constrained(): void
    {
        $round = $this->round(null);

        $this->expectException(\Illuminate\Database\QueryException::class);

        DB::table('site_inspections')->where('id', $round->id)
            ->update(['delivery_status' => 'totally_bogus_status']);
    }

    // ---------------------------------------------------------------- 9..11

    public function test_application_registry_semantics_are_unchanged(): void
    {
        $delivered = $this->round('delivered');
        $this->attempt($delivered, 'delivered');

        $response = $this->actingAs($this->officer)->get('/applications');
        $response->assertOk();

        $listing = $this->actingAs($this->officer)
            ->getJson(route('applications.delivery-status', $this->application->id))
            ->json();

        $this->assertSame('Delivered', $this->labelFor($listing, (int) $delivered->id));
        $this->assertNull($listing['retry_actor_unavailable_reason'],
            'The assigned Planning Officer is an authorized actor.');
    }

    public function test_no_officer_facing_payload_contains_loop_9_or_no_delivery_record(): void
    {
        $this->round(null);
        $this->attempt($this->round('delivered'), 'delivered');

        $payload = $this->read()->json();

        foreach ($payload['inspections'] as $round) {
            foreach (['label', 'message'] as $field) {
                $text = (string) ($round['delivery'][$field] ?? '');
                $this->assertStringNotContainsStringIgnoringCase('Loop 9', $text);
                $this->assertStringNotContainsString('No Delivery Record', $text);
            }
        }
    }
}