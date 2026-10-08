<?php

namespace Tests\Unit;

use App\Models\SiteInspection;
use App\Support\InspectionOperationsContext;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2D - read-only operations context for the inspection detail page.
 *
 * The defect class this guards against is MISATTRIBUTION:
 *
 *  - showing another lot's inspection as this round's history,
 *  - inventing a chain for a row that has no parcel,
 *  - presenting a global diagnostic count as if it belonged to this inspection,
 *  - re-deriving a round number in a way that can disagree with the canonical one,
 *  - turning a neutral "no delivery record" into a failure.
 *
 * Proven through the helpers' reader seams where a database would otherwise be
 * required, because the Feature suite cannot execute in this environment (the
 * whole suite fails on the pre-existing `pdo_sqlite` gap).
 */
class InspectionOperationsContextTest extends TestCase
{
    // ================================================================
    // DELIVERY
    // ================================================================

    public function test_each_canonical_delivery_state_renders_its_own_label(): void
    {
        $expected = [
            null => 'No Delivery Record',
            'pending_delivery' => 'Pending Delivery',
            'delivered' => 'Delivered to FieldSync',
            'delivery_failed' => 'Delivery Failed',
        ];

        foreach ($expected as $raw => $label) {
            $delivery = InspectionOperationsContext::delivery($this->inspection($raw));

            $this->assertSame($label, $delivery['label'], 'label for ' . var_export($raw, true));
        }
    }

    public function test_no_delivery_record_is_neutral_and_never_a_failure(): void
    {
        $delivery = InspectionOperationsContext::delivery($this->inspection(null));

        $this->assertFalse(
            $delivery['is_failure'],
            'most historical rounds were never pushed to FieldSync; that is not a fault'
        );
        $this->assertSame('no_delivery_record', $delivery['state']);
        $this->assertSame(0, $delivery['attempt_count']);
        $this->assertNull($delivery['failure_category']);
    }

    public function test_delivered_reports_its_delivery_date_and_no_failure(): void
    {
        $delivery = InspectionOperationsContext::delivery($this->inspection('delivered', [], 100, 10, 1, '2026-10-01 00:00:00'));

        $this->assertTrue($delivery['state'] === 'delivered');
        $this->assertFalse($delivery['is_failure']);
        $this->assertSame('2026-10-01', $delivery['delivered_at']);
        $this->assertNull($delivery['failure_category'], 'a delivered round has no failure to report');
    }

    public function test_delivery_failure_exposes_its_category_and_message(): void
    {
        $delivery = InspectionOperationsContext::delivery($this->inspection('delivery_failed', [
            ['attempt_number' => 1, 'attempted_at' => '2026-09-12', 'outcome' => 'failed', 'failure_category' => 'remote_unreachable', 'safe_message' => null],
            ['attempt_number' => 2, 'attempted_at' => '2026-09-13', 'outcome' => 'failed', 'failure_category' => 'remote_unreachable', 'safe_message' => null],
        ]));

        $this->assertTrue($delivery['is_failure']);
        $this->assertSame(2, $delivery['attempt_count'], 'attempt count must be accurate');
        $this->assertSame('remote_unreachable', $delivery['failure_category']);
        $this->assertNotNull($delivery['failure_message'], 'a failure category must yield a safe message');
        $this->assertSame('2026-09-13', $delivery['last_attempt_at'], 'the newest attempt must be reported');
    }

    public function test_attempt_count_is_exact_not_capped(): void
    {
        foreach ([1, 3, 7] as $count) {
            $attempts = [];

            for ($i = 1; $i <= $count; $i++) {
                $attempts[] = ['attempt_number' => $i, 'attempted_at' => '2026-09-12', 'outcome' => 'failed', 'failure_category' => null, 'safe_message' => null];
            }

            $delivery = InspectionOperationsContext::delivery($this->inspection('delivery_failed', $attempts));

            $this->assertSame($count, $delivery['attempt_count']);
        }
    }

    public function test_failure_detail_is_absent_on_a_non_failing_round(): void
    {
        $delivery = InspectionOperationsContext::delivery($this->inspection('pending_delivery', [
            ['attempt_number' => 1, 'attempted_at' => '2026-09-12', 'outcome' => 'pending', 'failure_category' => null, 'safe_message' => null],
        ]));

        $this->assertNull($delivery['failure_category'], 'no failure may be reported for a pending round');
        $this->assertNull($delivery['failure_message']);
    }

    // ================================================================
    // ROUND HISTORY
    // ================================================================

    public function test_history_contains_every_round_of_the_same_parcel(): void
    {
        // Two rounds of one parcel: the Teshow shape.
        $history = $this->historyFor(
            currentId: 2,
            chain: [$this->row(1, 10, 100), $this->row(2, 10, 100)],
        );

        $this->assertTrue($history['available']);
        $this->assertCount(2, $history['rounds']);
        $this->assertSame([1, 2], array_column($history['rounds'], 'inspection_id'));
        $this->assertSame([1, 2], array_column($history['rounds'], 'round_number'));
        $this->assertSame(2, $history['current_round_id']);
    }

    public function test_current_round_is_identifiable_from_either_end_of_the_chain(): void
    {
        $chain = [$this->row(1, 10, 100), $this->row(2, 10, 100)];

        $fromFirst = $this->historyFor(1, $chain);
        $this->assertTrue($fromFirst['rounds'][0]['is_current']);
        $this->assertFalse($fromFirst['rounds'][1]['is_current']);

        $fromSecond = $this->historyFor(2, $chain);
        $this->assertFalse($fromSecond['rounds'][0]['is_current']);
        $this->assertTrue($fromSecond['rounds'][1]['is_current']);
    }

    public function test_another_parcels_inspection_never_appears(): void
    {
        // Both parcels belong to application 10. Only P-01's chain may appear.
        $history = $this->historyFor(
            currentId: 1,
            chain: [$this->row(1, 10, 100), $this->row(2, 10, 100)],
            // P-02's rounds exist but must not leak in.
            otherParcels: [$this->row(3, 10, 200), $this->row(4, 10, 200)],
        );

        $ids = array_column($history['rounds'], 'inspection_id');

        $this->assertSame([1, 2], $ids);
        $this->assertNotContains(3, $ids, 'P-02 Round 1 leaked into P-01 history');
        $this->assertNotContains(4, $ids, 'P-02 Round 2 leaked into P-01 history');
    }

    public function test_an_application_scoped_round_number_cannot_displace_the_canonical_one(): void
    {
        // Interleaved ids: 1 (P-01), 2 (P-02), 3 (P-01).
        // P-01's canonical chain is 1 and 3 -> rounds 1 and 2, NOT 1 and 3.
        $history = $this->historyFor(
            currentId: 3,
            chain: [$this->row(1, 10, 100), $this->row(3, 10, 100)],
            otherParcels: [$this->row(2, 10, 200)],
        );

        $this->assertSame(
            [1, 2],
            array_column($history['rounds'], 'round_number'),
            'round numbers must come from the canonical per-parcel chain'
        );
    }

    public function test_parcel_unknown_row_gets_no_invented_chain(): void
    {
        $history = InspectionOperationsContext::roundHistory(
            $this->inspection('assigned', [], null, 10)
        );

        $this->assertFalse($history['available']);
        $this->assertSame([], $history['rounds'], 'no chain may be constructed for a parcel-unknown row');
        $this->assertNotNull($history['unavailable_reason']);
        $this->assertStringContainsString('Parcel was not recorded', $history['unavailable_reason']);
    }

    public function test_a_lone_round_reports_available_but_empty_history(): void
    {
        $history = $this->historyFor(
            currentId: 1,
            chain: [$this->row(1, 10, 100)],
        );

        $this->assertTrue($history['available']);
        $this->assertSame([], $history['rounds']);
        $this->assertSame(1, $history['current_round_id']);
    }

    /**
     * A three-round chain numbers 1, 2, 3 with no gap and no drift.
     *
     * Replaces an earlier test that tried to put a parcel-less row into a
     * parcel's history. That scenario is unreachable: the production reader
     * scopes by parcel, so such a row can never be returned. What matters
     * instead is that a longer chain numbers consecutively.
     */
    /**
 * The production sibling read must be scoped by application AND parcel.
 *
 * STRUCTURAL BY NECESSITY: this is the one rule that lives in a SQL builder and
 * therefore cannot be executed without a database - the Feature suite that could
 * is blocked by the `pdo_sqlite` gap. Everything downstream of it IS proved
 * executably: `test_another_parcels_inspection_never_appears` feeds a reader that
 * returns another parcel's rows and shows the resolver refuses to widen them.
 *
 * This assertion closes the remaining half - that the production reader cannot
 * even return such rows. Dropping the parcel filter is the one mutation the
 * executable tests cannot see, and it is the single most damaging one, because it
 * would show one lot's rounds on another lot's page.
 */
public function test_production_sibling_read_is_scoped_by_application_and_parcel(): void
{
    $source = (string) file_get_contents(dirname(__DIR__, 2) . '/app/Support/InspectionOperationsContext.php');
    $code = preg_replace('#/\*[\s\S]*?\*/#', '', $source) ?? $source;

    // Isolate readSiblings so a where() elsewhere cannot satisfy this.
    $start = strpos($code, 'private static function readSiblings');
    $this->assertNotFalse($start, 'the production sibling reader must exist');

    $body = substr($code, $start, 900);

    $this->assertStringContainsString(
        "->where('zoning_application_id', \$inspection->zoning_application_id)",
        $body,
        'the sibling read must be scoped by application'
    );
    $this->assertStringContainsString(
        "->where('parcel_id', \$inspection->parcel_id)",
        $body,
        'the sibling read MUST be scoped by parcel. Without this, one lot\'s rounds '
        .'would be listed on another lot\'s page - the cross-parcel leak the round '
        .'contract exists to prevent.'
    );
}

public function test_a_three_round_chain_numbers_consecutively(): void
    {
        $history = $this->historyFor(
            currentId: 3,
            chain: [$this->row(1, 10, 100), $this->row(2, 10, 100), $this->row(3, 10, 100)],
        );

        $this->assertSame([1, 2, 3], array_column($history['rounds'], 'round_number'));
        $this->assertSame('Original Inspection', $history['rounds'][0]['round_kind']);
        $this->assertSame('Reinspection', $history['rounds'][1]['round_kind']);
        $this->assertTrue($history['rounds'][2]['is_current']);
        $this->assertFalse($history['rounds'][0]['is_current']);
    }

    // ================================================================
    // ROLE / SAFETY
    // ================================================================

    public function test_no_mutating_endpoint_is_added_by_this_phase(): void
    {
        $routes = dirname(__DIR__, 2) . '/routes/web.php';
        $before = (string) file_get_contents($routes);

        // A mutating site-inspections route would have to appear here. The only
        // non-GET action this phase relies on is the pre-existing scoped sync.
        $this->assertStringNotContainsString(
            "Route::post('/site-inspections/{id}",
            $before,
            'no new POST may be introduced for delivery, history or diagnostics'
        );
        $this->assertStringNotContainsString(
            'Route::put(',
            $before,
            'no PUT route may be introduced by this phase'
        );
    }

    public function test_delivery_context_exposes_no_action_capability(): void
    {
        $delivery = InspectionOperationsContext::delivery($this->inspection('delivery_failed', [
            ['attempt_number' => 1, 'attempted_at' => '2026-09-12', 'outcome' => 'failed', 'failure_category' => 'remote_unreachable', 'safe_message' => null],
        ]));

        foreach (['can_retry', 'retry', 'can_reassign', 'can_approve', 'action_url', 'href'] as $forbidden) {
            $this->assertArrayNotHasKey(
                $forbidden,
                $delivery,
                'a read-only delivery summary must not expose an action capability'
            );
        }
    }

        public function test_round_history_rounds_expose_no_write_capability(): void
    {
        $history = $this->historyFor(1, [$this->row(1, 10, 100), $this->row(2, 10, 100)]);

        foreach ($history['rounds'] as $round) {
            foreach (['can_retry', 'can_reassign', 'can_approve', 'action'] as $forbidden) {
                $this->assertArrayNotHasKey($forbidden, $round);
            }
        }
    }

    // ================================================================

    /**
     * Build history for a chain, with fixed rows injected through the seam so the
     * resolution rules are what runs, not a database.
     */
    private function historyFor(int $currentId, array $chain, array $otherParcels = []): array
    {
        $all = array_merge($chain, $otherParcels);

        $current = $this->inspection('assigned', [], 100, 10, $currentId);

        // Mirrors the production query EXACTLY: every round of this parcel,
        // INCLUDING the current one. Excluding it would make a two-round chain
        // look like a lone round.
        $siblings = collect($all)
            ->filter(fn ($row) => (int) $row->parcel_id === 100)
            ->map(fn ($row) => $this->siblingModel($row));

        return InspectionOperationsContext::roundHistoryWithChain($current, $siblings, $all);
    }

    /**
     * A real unsaved SiteInspection for a chain row.
     *
     * `setRawAttributes` is used deliberately: assigning a date-cast attribute
     * through setAttribute() asks the connection for its grammar, which needs a
     * booted application. Raw attributes bypass casting, and the fields under
     * test - id, application, parcel, status - are not cast anyway.
     */
    private function siblingModel(object $row): SiteInspection
    {
        $model = new SiteInspection();
        $model->setRawAttributes([
            'id' => $row->id,
            'zoning_application_id' => $row->zoning_application_id,
            'parcel_id' => $row->parcel_id,
            'status' => $row->status,
            'inspector_id' => $row->inspector_id,
            'delivery_status' => $row->delivery_status,
            'scheduled_date' => $this->date($row->scheduled_date),
            'completed_at' => $this->date($row->completed_at),
            'submitted_at' => $this->date($row->submitted_at),
        ], true);
        $model->exists = true;

        return $model;
    }

    /**
     * Dates are stored as Carbon instances, not strings.
     *
     * Reading a date-cast attribute holding a STRING makes Eloquent ask the
     * connection for its date format, which a Unit suite without a booted
     * application cannot provide. A Carbon value short-circuits that path
     * entirely, so no connection is needed.
     */
    private function date(?string $value): ?\Illuminate\Support\Carbon
    {
        return $value === null ? null : \Illuminate\Support\Carbon::parse($value);
    }

    private function row(int $id, int $applicationId, ?int $parcelId): object
    {
        return (object) [
            'id' => $id,
            'zoning_application_id' => $applicationId,
            'parcel_id' => $parcelId,
            'status' => $id === 1 ? 'completed' : 'assigned',
            'inspector_id' => 6,
            'scheduled_date' => '2026-09-22',
            'completed_at' => $id === 1 ? '2026-09-22 00:00:00' : null,
            'submitted_at' => null,
            'delivery_status' => null,
        ];
    }

    /**
     * A REAL unsaved SiteInspection.
     *
     * Deliberately not a mock: the production signatures require a SiteInspection,
     * and loosening them for a test would weaken the contract. An unsaved model
     * still reads its own attributes, so nothing here needs a database - the
     * attempt relation is pre-set so it is never lazy loaded.
     */
    private function inspection(
        ?string $deliveryStatus,
        array $attempts = [],
        ?int $parcelId = 100,
        ?int $applicationId = 10,
        int $id = 1,
        ?string $deliveredAt = null
    ): SiteInspection {
        $model = new SiteInspection();
        $model->setRawAttributes([
            'id' => $id,
            'zoning_application_id' => $applicationId,
            'parcel_id' => $parcelId,
            'status' => 'assigned',
            'delivery_status' => $deliveryStatus,
            'delivered_at' => $this->date($deliveredAt),
        ], true);
        $model->exists = true;

        $model->setRelation('deliveryAttempts', $this->attemptCollection($attempts));

        return $model;
    }

    /**
     * Attempts as plain objects, NOT Eloquent models.
     *
     * Setting a date-cast attribute on an unsaved model asks the connection for
     * its grammar, which needs a booted application. The delivery path only reads
     * documented scalar attempt fields, so plain objects with a real Carbon date
     * exercise it exactly, without dragging a database into a Unit test.
     */
    private function attemptCollection(array $rows): \Illuminate\Support\Collection
    {
        return collect($rows)->map(fn (array $row) => (object) [
            'attempt_number' => $row['attempt_number'] ?? null,
            'outcome' => $row['outcome'] ?? null,
            'failure_category' => $row['failure_category'] ?? null,
            'safe_message' => $row['safe_message'] ?? null,
            'attempted_at' => isset($row['attempted_at']) && $row['attempted_at'] !== null
                ? \Illuminate\Support\Carbon::parse($row['attempted_at'])
                : null,
            'created_at' => null,
        ]);
    }
}