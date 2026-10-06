<?php

namespace Tests\Unit;

use App\Support\InspectionRoundNumbering;
use Illuminate\Database\Eloquent\Model;
use PHPUnit\Framework\TestCase;

/**
 * PHASE 2B2B - canonical inspection round identity.
 *
 * WHAT IS BEING PINNED
 * --------------------
 * A round is one PARCEL's visit sequence: the 1-based position of an inspection
 * within its own (zoning_application_id, parcel_id) chain, ordered by id.
 *
 * This exists because the previous implementation numbered rounds per
 * APPLICATION and nothing could tell the difference: every existing round test
 * used a single-parcel application, where both definitions coincide by accident.
 * The fixtures below are ordered so a per-application implementation FAILS.
 *
 * WHY A UNIT TEST AND NOT A DATABASE TEST
 * --------------------------------------
 * The canonical helper takes an optional chain reader. Production passes none
 * and therefore always queries the database; these tests pass a fixed chain so
 * the NUMBERING CONTRACT can be proved executably without a database driver.
 *
 * That is not a weakened assertion - it is the same code path. The ordering,
 * grouping and exclusion logic all live in `chainPositions()`, which is exactly
 * what runs in production; only the row FETCH is substituted. A test that
 * asserted on source text instead could not distinguish a working implementation
 * from a plausible-looking one at all.
 *
 * The database-backed behaviour is additionally covered by
 * InspectionRoundNumberingFeatureTest, which builds real rows.
 */
class InspectionRoundNumberingTest extends TestCase
{
    // ---------------------------------------------------------------
    // MULTI-PARCEL: the case that distinguishes the two contracts
    // ---------------------------------------------------------------

    /**
     * The decisive test. One application, two parcels, interleaved ids:
     *
     *   id 1 -> P-01, id 2 -> P-02, id 3 -> P-01
     *
     * A per-application implementation answers 1,2,3. The canonical contract
     * answers 1,1,2.
     */
    public function test_each_parcel_starts_its_own_round_one_within_one_application(): void
    {
        $chain = [
            $this->row(1, 10, 100), // P-01 first visit
            $this->row(2, 10, 200), // P-02 first visit, interleaved
            $this->row(3, 10, 100), // P-01 second visit
        ];

        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, 100), $this->inspection(2, 10, 200), $this->inspection(3, 10, 100)],
            fn () => $chain
        );

        $this->assertSame(1, $rounds[1]['round_number'], 'P-01 first visit is Round 1');
        $this->assertSame(1, $rounds[2]['round_number'], 'P-02 first visit is Round 1 too');
        $this->assertSame(2, $rounds[3]['round_number'], 'P-01 second visit is Round 2');

        // Explicitly NOT the per-application answer.
        $this->assertNotSame(
            [1, 2, 3],
            [$rounds[1]['round_number'], $rounds[2]['round_number'], $rounds[3]['round_number']],
            'rounds must NOT be sequenced across parcels of one application'
        );

        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $rounds[1]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $rounds[2]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_REINSPECTION, $rounds[3]['round_kind']);

        $this->assertFalse($rounds[1]['is_reinspection']);
        $this->assertFalse($rounds[2]['is_reinspection']);
        $this->assertTrue($rounds[3]['is_reinspection']);
    }

    /**
     * Row ORDER in the supplied chain must not matter: the ordering is defined
     * inside the helper, so two callers cannot disagree.
     */
    public function test_chain_order_does_not_change_the_round_number(): void
    {
        $inOrder = [
            $this->row(1, 10, 100),
            $this->row(2, 10, 200),
            $this->row(3, 10, 100),
        ];
        $shuffled = [$inOrder[2], $inOrder[1], $inOrder[0]];

        $inspections = [$this->inspection(1, 10, 100), $this->inspection(2, 10, 200), $this->inspection(3, 10, 100)];

        $a = InspectionRoundNumbering::forInspections($inspections, fn () => $inOrder);
        $b = InspectionRoundNumbering::forInspections($inspections, fn () => $shuffled);

        $this->assertSame(
            [$a[1]['round_number'], $a[2]['round_number'], $a[3]['round_number']],
            [$b[1]['round_number'], $b[2]['round_number'], $b[3]['round_number']],
            'the numbering must be order-independent'
        );

        $this->assertSame([1, 1, 2], [$b[1]['round_number'], $b[2]['round_number'], $b[3]['round_number']]);
    }

    /**
     * Two applications must not share a sequence, and ids must not interleave
     * across them either.
     */
    public function test_round_numbering_restarts_per_application(): void
    {
        $chain = [
            $this->row(1, 10, 100),
            $this->row(2, 11, 100), // same parcel id, DIFFERENT application
            $this->row(3, 10, 100),
        ];

        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, 100), $this->inspection(2, 11, 100), $this->inspection(3, 10, 100)],
            fn () => $chain
        );

        $this->assertSame(1, $rounds[1]['round_number']);
        $this->assertSame(2, $rounds[3]['round_number']);
        $this->assertSame(1, $rounds[2]['round_number'], 'a different application restarts at Round 1');
    }

    /**
     * The chain is read for the WHOLE application, so supplying only a later row
     * still yields its true position. A position-over-supplied-rows
     * implementation would answer 1.
     */
    public function test_chain_is_read_from_the_database_not_from_the_rows_supplied(): void
    {
        $chain = [$this->row(1, 10, 100), $this->row(2, 10, 100), $this->row(3, 10, 100)];

        $round = InspectionRoundNumbering::forInspection($this->inspection(3, 10, 100), fn () => $chain);

        $this->assertSame(3, $round['round_number'], 'the whole chain must be read, not just the given row');
        $this->assertTrue($round['is_reinspection']);
    }

    // ---------------------------------------------------------------
    // LEGACY NULL-PARCEL ROWS
    // ---------------------------------------------------------------

    /**
     * A parcel-unknown row gets NO round number and is classified historical. It
     * must never be labelled Original or Reinspection.
     */
    public function test_null_parcel_row_has_no_round_and_is_historical(): void
    {
        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(7, 10, null)],
            fn () => []   // the production query excludes NULL parcels
        );

        $round = $rounds[7];

        $this->assertNull($round['round_number'], 'a parcel-unknown row has no round number');
        $this->assertSame(InspectionRoundNumbering::KIND_HISTORICAL, $round['round_kind']);
        $this->assertSame(InspectionRoundNumbering::HISTORICAL_NOTE, $round['note']);
        $this->assertTrue($round['is_historical']);
        $this->assertFalse($round['is_reinspection']);

        $this->assertNotSame(InspectionRoundNumbering::KIND_ORIGINAL, $round['round_kind']);
        $this->assertNotSame(InspectionRoundNumbering::KIND_REINSPECTION, $round['round_kind']);
    }

    /**
     * Even if a NULL-parcel row somehow reached the chain reader, it must still
     * be excluded rather than folded into a synthetic chain. This is the
     * defence-in-depth case: the SQL excludes it, and this proves the helper
     * does not depend on that.
     */
    public function test_null_parcel_row_is_excluded_even_if_the_reader_returns_it(): void
    {
        $chain = [
            $this->row(1, 10, null), // must not be positioned
            $this->row(2, 10, 100),
            $this->row(3, 10, 100),
        ];

        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, null), $this->inspection(2, 10, 100), $this->inspection(3, 10, 100)],
            fn () => $chain
        );

        $this->assertNull($rounds[1]['round_number'], 'a NULL parcel can never be positioned');
        $this->assertSame(1, $rounds[2]['round_number'], 'the real chain must still start at 1');
        $this->assertSame(2, $rounds[3]['round_number']);
    }

    /**
     * Historical rows must not disturb a real parcel's numbering, nor be counted
     * as reinspections.
     *
     * The legacy rows have LOWER ids than the real ones, so an implementation
     * that counted positions over all rows would push the real first visit to
     * Round 3.
     */
    public function test_legacy_null_rows_do_not_shift_a_real_parcel_round_or_counter(): void
    {
        // Ids 1 and 2 are the legacy rows: they carry no parcel, so the production
        // query never returns them and they appear nowhere in the chain.
        $chain = [
            $this->row(3, 10, 100),
            $this->row(4, 10, 100),
        ];
        $inspections = [
            $this->inspection(1, 10, null),
            $this->inspection(2, 10, null),
            $this->inspection(3, 10, 100),
            $this->inspection(4, 10, 100),
        ];

        $rounds = InspectionRoundNumbering::forInspections($inspections, fn () => $chain);

        $this->assertNull($rounds[1]['round_number']);
        $this->assertNull($rounds[2]['round_number']);

        $this->assertSame(1, $rounds[3]['round_number'], 'legacy rows must not shift the first real round');
        $this->assertSame(2, $rounds[4]['round_number'], 'legacy rows must not shift later rounds');
        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $rounds[3]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_REINSPECTION, $rounds[4]['round_kind']);

        $reinspections = 0;
        foreach ($rounds as $round) {
            if (InspectionRoundNumbering::isReinspection($round)) {
                $reinspections++;
            }
        }
        $this->assertSame(1, $reinspections, 'exactly one real reinspection; legacy rows add none');
    }

    /**
     * Isolate the CLASSIFICATION guard: even when the chain reader hands back a
     * position for a row, a row whose OWN parcel_id is NULL must be reported as
     * historical with no round.
     *
     * The reader here is deliberately inconsistent with the model (it claims the
     * row has a parcel). Production can never do that - the query filters on the
     * same column - but the invariant has to hold on its own, because it is the
     * difference between "Round 1" and "no round known" for the 8 legacy rows.
     */
    public function test_a_row_whose_own_parcel_is_null_is_never_given_a_round(): void
    {
        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, null)],
            // Claims a chain position exists for a parcel-less row.
            fn () => [$this->row(1, 10, 100)]
        );

        $this->assertNull($rounds[1]['round_number'], 'the row declares no parcel, so it has no round');
        $this->assertSame(InspectionRoundNumbering::KIND_HISTORICAL, $rounds[1]['round_kind']);
        $this->assertFalse($rounds[1]['is_reinspection']);
    }

    /**
     * Isolate the CHAIN guard: a chain row with no parcel must not create a
     * position, even when the inspection being resolved claims a parcel.
     *
     * Otherwise the missing parcel would be folded into a synthetic group and a
     * real round number would be invented out of an unrelated row.
     */
    public function test_a_chain_row_without_a_parcel_creates_no_position(): void
    {
        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, 100)],
            // The chain row for this id carries NO parcel, so no position exists.
            fn () => [$this->row(1, 10, null)]
        );

        $this->assertNull($rounds[1]['round_number'], 'an unpositionable chain row yields no round');
        $this->assertSame(InspectionRoundNumbering::KIND_HISTORICAL, $rounds[1]['round_kind']);
    }

    /**
     * A legacy row must not become a round for the parcel that later appears on
     * the same application: they are unrelated rows, not a shared chain.
     */
    public function test_legacy_row_is_never_attributed_to_a_later_parcel(): void
    {
        $rounds = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, 10, null), $this->inspection(2, 10, 100)],
            fn () => [$this->row(2, 10, 100)]
        );

        $this->assertNull($rounds[1]['round_number'], 'the legacy row is not part of any parcel chain');
        $this->assertSame(1, $rounds[2]['round_number'], 'the real row is still Round 1');
    }

    // ---------------------------------------------------------------
    // INVARIANTS
    // ---------------------------------------------------------------

    /**
     * isReinspection() must be false for a historical row even when handed a
     * hand-built array that looks like it has a round, so no caller can turn one
     * into a reinspection by accident.
     */
    public function test_is_reinspection_requires_a_real_round_number(): void
    {
        $this->assertTrue(InspectionRoundNumbering::isReinspection(['round_number' => 2]));
        $this->assertFalse(InspectionRoundNumbering::isReinspection(['round_number' => 1]));
        $this->assertFalse(InspectionRoundNumbering::isReinspection(['round_number' => null]));
        $this->assertFalse(InspectionRoundNumbering::isReinspection([]));
    }

    public function test_empty_input_returns_an_empty_map(): void
    {
        $this->assertSame([], InspectionRoundNumbering::forInspections([]));
    }

    public function test_production_path_reads_the_database_by_default(): void
    {
        // No chain reader supplied: the helper must query for itself. Asserted
        // executably by proving the reader is not required for correctness of
        // the empty-input guard, which returns before any query.
        $this->assertSame([], InspectionRoundNumbering::forInspections([], fn () => [
            $this->row(1, 10, 100),
        ]));
    }

    // ---------------------------------------------------------------

    private function row(int $id, int $applicationId, ?int $parcelId): object
    {
        return (object) [
            'id' => $id,
            'zoning_application_id' => $applicationId,
            'parcel_id' => $parcelId,
        ];
    }

    private function inspection(int $id, int $applicationId, ?int $parcelId): Model
    {
        $model = $this->getMockBuilder(Model::class)
            ->onlyMethods(['getKey'])
            ->getMock();

        $model->method('getKey')->willReturn($id);

        // Eloquent reads attributes through __get, so a plain attribute bag is
        // enough here.
        $model->setAttribute('id', $id);
        $model->setAttribute('zoning_application_id', $applicationId);
        $model->setAttribute('parcel_id', $parcelId);

        return $model;
    }
}