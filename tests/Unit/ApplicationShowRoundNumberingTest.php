<?php

namespace Tests\Unit;

use App\Support\InspectionRoundNumbering;
use Illuminate\Database\Eloquent\Model;
use Tests\TestCase;

/**
 * REGRESSION: the 500 on /applications/{id}.
 *
 * THE DEFECT
 * ----------
 * `ApplicationController::show()` called a COLLECTION method on the helper's
 * return value:
 *
 *     InspectionRoundNumbering::forInspections($openRounds)
 *         ->map(fn (array $round) => $round['round_number']);
 *
 * but the helper's established contract is `array<int, array{...}>`. Every other
 * caller in the repository treats it as that array - `InspectionOperationsContext`
 * and `InspectionReviewVisibility` index it by inspection id, `forInspection()`
 * indexes its own wrapper, and `ApplicationController` itself indexes it as an
 * array at the same method a few lines earlier (`$rounds[(int) $inspection->id]`).
 * So the helper is right and this one caller was wrong. It threw
 * `Call to a member function map() on array` and the page returned 500 for both
 * Admin and Planning Officer.
 *
 * THE FIX
 * -------
 * `collect()` is applied AT THIS CALLER. The helper's global return contract is
 * deliberately NOT changed: doing so would alter four working callers to
 * accommodate one broken one, and would break the injectable contract its own
 * tests assert.
 *
 * THE INVARIANT THAT MATTERS
 * --------------------------
 * Round identity must be untouched by the repair: canonical (application, parcel)
 * chains, 1-based, ordered by inspection id ascending, Round 1 = Original,
 * Round > 1 = Reinspection, NULL parcel historical and never inferred.
 */
class ApplicationShowRoundNumberingTest extends TestCase
{
    private const APP = 10;

    private function inspection(int $id, int $application, ?int $parcel): Model
    {
        $model = $this->getMockBuilder(Model::class)->onlyMethods([])->getMock();
        $model->setAttribute('id', $id);
        $model->setAttribute('zoning_application_id', $application);
        $model->setAttribute('parcel_id', $parcel);

        return $model;
    }

    private function chain(array $rows): array
    {
        return array_map(fn ($r) => (object) $r, $rows);
    }

    /**
     * The exact expression the controller now uses, with the same chain reader
     * seam the helper's own tests use so the assertion needs no database.
     */
    private function controllerRoundMap(iterable $inspections, array $chain): array
    {
        return collect(InspectionRoundNumbering::forInspections($inspections, fn () => $chain))
            ->map(fn (array $round) => $round['round_number'])
            ->all();
    }

    /**
     * The helper's canonical return type is a plain array. This is asserted
     * against the real call, not the docblock, so a future change to the
     * contract cannot pass silently.
     */
    public function test_the_helper_still_returns_a_plain_array_keyed_by_inspection_id(): void
    {
        $result = InspectionRoundNumbering::forInspections(
            [$this->inspection(1, self::APP, 100)],
            fn () => $this->chain([['id' => 1, 'zoning_application_id' => self::APP, 'parcel_id' => 100]])
        );

        $this->assertIsArray($result, 'forInspections() must keep returning an array.');
        $this->assertArrayHasKey(1, $result, 'It must be keyed by inspection id, not a list.');
        $this->assertArrayHasKey('round_number', $result[1]);
        $this->assertFalse($result instanceof \Illuminate\Support\Collection);
    }

    public function test_the_controller_expression_no_longer_calls_a_collection_method_on_an_array(): void
    {
        $source = (string) file_get_contents(base_path('app/Http/Controllers/ApplicationController.php'));
        $body = (string) preg_replace('#/\*.*?\*/#s', '', $source);

        $this->assertDoesNotMatchRegularExpression(
            '/InspectionRoundNumbering::forInspections\([^)]*\)\s*\n?\s*->map\(/',
            $body,
            'The helper returns an array. Calling ->map() directly on it is the exact 500.'
        );

        $this->assertMatchesRegularExpression(
            '/collect\(\s*\n?\s*InspectionRoundNumbering::forInspections\(/',
            $body,
            'The collection wrapper must be applied at the caller that needs it.'
        );

        // The fix must not reach into the helper and change its contract.
        $helper = (string) file_get_contents(base_path('app/Support/InspectionRoundNumbering.php'));
        $this->assertMatchesRegularExpression(
            '/public static function forInspections\(iterable \$inspections, \?callable \$chainReader = null\): array/',
            $helper,
            'The canonical return type must stay an array. Callers depend on it.'
        );
    }

    /**
     * The decisive behaviour case: one application, two parcels, interleaved
     * ids. A per-application implementation would answer 1,2,3. Canonical must
     * answer 1,1,2, and the repaired caller expression must agree exactly.
     */
    public function test_multi_round_parcel_numbering_is_unchanged_by_the_repair(): void
    {
        $chain = $this->chain([
            ['id' => 1, 'zoning_application_id' => self::APP, 'parcel_id' => 100],
            ['id' => 2, 'zoning_application_id' => self::APP, 'parcel_id' => 200],
            ['id' => 3, 'zoning_application_id' => self::APP, 'parcel_id' => 100],
        ]);
        $inspections = [
            $this->inspection(1, self::APP, 100),
            $this->inspection(2, self::APP, 200),
            $this->inspection(3, self::APP, 100),
        ];

        $canonical = InspectionRoundNumbering::forInspections($inspections, fn () => $chain);
        $viaController = $this->controllerRoundMap($inspections, $chain);

        $expected = [1 => 1, 2 => 1, 3 => 2];
        $this->assertSame($expected, array_map(fn (array $r) => $r['round_number'], $canonical));
        $this->assertSame($expected, $viaController, 'The repaired caller must match canonical exactly.');
        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $canonical[1]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $canonical[2]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_REINSPECTION, $canonical[3]['round_kind']);
    }

    public function test_a_null_parcel_row_stays_historical_and_is_never_given_a_round(): void
    {
        $chain = $this->chain([
            ['id' => 5, 'zoning_application_id' => self::APP, 'parcel_id' => 300],
            ['id' => 6, 'zoning_application_id' => self::APP, 'parcel_id' => null],
        ]);
        $inspections = [
            $this->inspection(5, self::APP, 300),
            $this->inspection(6, self::APP, null),
        ];

        $canonical = InspectionRoundNumbering::forInspections($inspections, fn () => $chain);
        $viaController = $this->controllerRoundMap($inspections, $chain);

        $this->assertNull($canonical[6]['round_number'], 'A parcel-unknown row must have no round.');
        $this->assertSame(InspectionRoundNumbering::KIND_HISTORICAL, $canonical[6]['round_kind']);
        $this->assertNull($viaController[6], 'The caller must carry the null through, not default it to 1.');
        $this->assertSame(1, $viaController[5], 'A real chain is unaffected by an unsequenceable sibling.');
    }

    public function test_round_numbers_are_ordered_by_inspection_id_ascending_and_one_based(): void
    {
        // Deliberately supplied out of order: the chain reader decides.
        $chain = $this->chain([
            ['id' => 31, 'zoning_application_id' => self::APP, 'parcel_id' => 400],
            ['id' => 32, 'zoning_application_id' => self::APP, 'parcel_id' => 400],
            ['id' => 33, 'zoning_application_id' => self::APP, 'parcel_id' => 400],
        ]);
        $rounds = InspectionRoundNumbering::forInspections([
            $this->inspection(33, self::APP, 400),
            $this->inspection(31, self::APP, 400),
            $this->inspection(32, self::APP, 400),
        ], fn () => $chain);

        $this->assertSame(1, $rounds[31]['round_number']);
        $this->assertSame(2, $rounds[32]['round_number']);
        $this->assertSame(3, $rounds[33]['round_number']);
    }

    public function test_rounds_are_scoped_per_application(): void
    {
        $chain = $this->chain([
            ['id' => 1, 'zoning_application_id' => 10, 'parcel_id' => 100],
            ['id' => 2, 'zoning_application_id' => 11, 'parcel_id' => 100],
        ]);
        $rounds = InspectionRoundNumbering::forInspections([
            $this->inspection(1, 10, 100),
            $this->inspection(2, 11, 100),
        ], fn () => $chain);

        $this->assertSame(1, $rounds[1]['round_number']);
        $this->assertSame(1, $rounds[2]['round_number'], 'A different application starts its own Round 1.');
    }

    /**
     * No per-round query may be introduced by the repair.
     *
     * The controller already receives `$openRounds` from an eager load, and the
     * helper reads the whole chain in ONE query. This pins that the caller adds
     * no per-parcel or per-inspection read of its own.
     */
    public function test_the_repair_introduces_no_per_round_query(): void
    {
        $source = (string) file_get_contents(base_path('app/Http/Controllers/ApplicationController.php'));

        // The chain read belongs to the helper and must stay there.
        $this->assertSame(
            1,
            preg_match_all('/InspectionRoundNumbering::forInspections\(\$openRounds\)/', $source),
            'The controller must ask the helper exactly once for the open rounds.'
        );
        $this->assertDoesNotMatchRegularExpression(
            '/for\s*\(\s*\$openRounds[\s\S]{0,400}?DB::|foreach\s*\(\s*\$openRounds[\s\S]{0,400}?DB::/',
            $source,
            'No query may be issued inside a loop over the rounds.'
        );

        $helper = (string) file_get_contents(base_path('app/Support/InspectionRoundNumbering.php'));
        $this->assertSame(
            1,
            preg_match_all('/DB::table\(.site_inspections.\)/', $helper),
            'The helper still reads the chain with a single query.'
        );
    }
}