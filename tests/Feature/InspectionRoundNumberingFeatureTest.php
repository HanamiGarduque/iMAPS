<?php

namespace Tests\Feature;

use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Support\InspectionOperationsSummary;
use App\Support\InspectionRoundNumbering;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * PHASE 2B2B - canonical round identity against REAL database rows.
 *
 * InspectionRoundNumberingTest proves the numbering contract executably through
 * the helper's chain-reader seam. This suite proves the same contract through
 * the real production path - no reader injected, the database queried - and
 * through the controllers that display the result.
 *
 * The fixtures are deliberately interleaved so a per-application implementation
 * would fail: id 1 (P-01), id 2 (P-02), id 3 (P-01) must number 1, 1, 2.
 */
class InspectionRoundNumberingFeatureTest extends TestCase
{
    use RefreshDatabase;

    // ---------------------------------------------------------------
    // THE DECISIVE MULTI-PARCEL CASE
    // ---------------------------------------------------------------

    public function test_multi_parcel_application_numbers_each_parcel_from_one(): void
    {
        $app = $this->makeApplication();
        $p1 = $this->makeParcel($app);
        $p2 = $this->makeParcel($app);

        $a1 = $this->makeInspection($app, $p1);
        $b1 = $this->makeInspection($app, $p2); // interleaved on purpose
        $a2 = $this->makeInspection($app, $p1);

        $rounds = InspectionRoundNumbering::forInspections(
            SiteInspection::whereIn('id', [$a1->id, $b1->id, $a2->id])->get()
        );

        $this->assertSame(1, $rounds[$a1->id]['round_number']);
        $this->assertSame(1, $rounds[$b1->id]['round_number'], 'P-02 first visit is also Round 1');
        $this->assertSame(2, $rounds[$a2->id]['round_number'], 'P-01 second visit is Round 2');

        $this->assertSame(InspectionRoundNumbering::KIND_ORIGINAL, $rounds[$b1->id]['round_kind']);
        $this->assertSame(InspectionRoundNumbering::KIND_REINSPECTION, $rounds[$a2->id]['round_kind']);
    }

    public function test_chain_is_read_from_the_database_for_a_single_row(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);

        $first = $this->makeInspection($app, $parcel);
        $second = $this->makeInspection($app, $parcel);
        $third = $this->makeInspection($app, $parcel);

        // Only the third row is resolved, so the chain must come from the DB.
        $round = InspectionRoundNumbering::forInspection(SiteInspection::find($third->id));

        $this->assertSame(3, $round['round_number']);
        $this->assertTrue($round['is_reinspection']);
        $this->assertSame(1, InspectionRoundNumbering::forInspection(SiteInspection::find($first->id))['round_number']);
        $this->assertSame(2, InspectionRoundNumbering::forInspection(SiteInspection::find($second->id))['round_number']);
    }

    // ---------------------------------------------------------------
    // LEGACY NULL-PARCEL ROWS
    // ---------------------------------------------------------------

    public function test_null_parcel_rows_are_historical_with_no_round(): void
    {
        $app = $this->makeApplication();
        $legacy = $this->makeLegacyInspection($app);

        $round = InspectionRoundNumbering::forInspection(SiteInspection::find($legacy->id));

        $this->assertNull($round['round_number']);
        $this->assertSame(InspectionRoundNumbering::KIND_HISTORICAL, $round['round_kind']);
        $this->assertSame(InspectionRoundNumbering::HISTORICAL_NOTE, $round['note']);
    }

    public function test_legacy_rows_do_not_shift_a_real_parcel_chain(): void
    {
        $app = $this->makeApplication();
        $this->makeLegacyInspection($app);
        $this->makeLegacyInspection($app);

        $parcel = $this->makeParcel($app);
        $first = $this->makeInspection($app, $parcel);
        $second = $this->makeInspection($app, $parcel);

        $rounds = InspectionRoundNumbering::forInspections(
            SiteInspection::where('zoning_application_id', $app->id)->get()
        );

        $this->assertSame(1, $rounds[$first->id]['round_number'], 'legacy rows must not shift the real first round');
        $this->assertSame(2, $rounds[$second->id]['round_number']);
    }

    // ---------------------------------------------------------------
    // THE REINSPECTION COUNTER, INCLUDING THE DATA-FLOW DEFECT
    // ---------------------------------------------------------------

    /**
     * `counters()` must not depend on a caller having injected an attribute.
     *
     * It previously read `$i->round_number`, which SiteInspectionController
     * attached as a side effect, so the same method returned 14 through the
     * controller and 0 when called directly. Both calls below therefore run
     * against identically un-enriched models and MUST agree.
     */
    public function test_reinspection_counter_is_identical_with_and_without_controller_enrichment(): void
    {
        $app = $this->makeApplication();
        $p1 = $this->makeParcel($app);
        $p2 = $this->makeParcel($app);

        $this->makeInspection($app, $p1);
        $this->makeInspection($app, $p1); // Round 2 - a real reinspection
        $this->makeInspection($app, $p1); // Round 3 - another
        $this->makeInspection($app, $p2); // Round 1 for a DIFFERENT parcel

        $this->makeLegacyInspection($app);
        $this->makeLegacyInspection($app);

        $summary = new InspectionOperationsSummary();

        $bare = $summary->counters(SiteInspection::where('zoning_application_id', $app->id)->get());

        // Simulate the controller's enrichment, then call again.
        $enriched = SiteInspection::where('zoning_application_id', $app->id)->get();
        foreach ($enriched as $inspection) {
            $round = InspectionRoundNumbering::forInspection($inspection);
            $inspection->round_number = $round['round_number'];
        }
        $viaEnriched = $summary->counters($enriched);

        $this->assertSame(
            $viaEnriched['reinspections'],
            $bare['reinspections'],
            'the counter must not depend on an injected attribute'
        );

        // Only the two genuine repeats on P-01 count. P-02's first visit is
        // Round 1, and the two legacy rows count for nothing.
        $this->assertSame(2, $bare['reinspections']);
    }

    public function test_legacy_rows_are_never_counted_as_reinspections(): void
    {
        $app = $this->makeApplication();

        // Five parcel-unknown rows: under the old per-application numbering these
        // alone would have produced four "reinspections".
        for ($i = 0; $i < 5; $i++) {
            $this->makeLegacyInspection($app);
        }

        $counters = (new InspectionOperationsSummary())
            ->counters(SiteInspection::where('zoning_application_id', $app->id)->get());

        $this->assertSame(0, $counters['reinspections'], 'historical rows are not reinspections');
        $this->assertSame(5, $counters['total'], 'but they are still real records and stay visible');
    }

    // ---------------------------------------------------------------
    // NO PERSISTENCE
    // ---------------------------------------------------------------

    public function test_round_numbering_is_never_written_to_the_database(): void
    {
        $app = $this->makeApplication();
        $parcel = $this->makeParcel($app);
        $first = $this->makeInspection($app, $parcel);
        $second = $this->makeInspection($app, $parcel);

        InspectionRoundNumbering::forInspections(SiteInspection::all());

        $this->assertFalse(
            $this->app['db']->getSchemaBuilder()->hasColumn('site_inspections', 'round_number'),
            'no round_number column may be introduced'
        );

        $fresh = SiteInspection::find($first->id);
        $this->assertNull($fresh->round_number ?? null, 'models are not mutated with hidden state');

        // The rows themselves are untouched.
        $this->assertSame(2, SiteInspection::count());
    }

    // ---------------------------------------------------------------

    private function makeApplication(): ZoningApplication
    {
        $user = User::factory()->create();

        return ZoningApplication::factory()->create(['created_by' => $user->id]);
    }

    private function makeParcel(ZoningApplication $app): Parcel
    {
        return Parcel::factory()->create(['zoning_application_id' => $app->id]);
    }

    private function makeInspection(ZoningApplication $app, Parcel $parcel): SiteInspection
    {
        return SiteInspection::factory()->create([
            'zoning_application_id' => $app->id,
            'parcel_id' => $parcel->id,
            'status' => 'assigned',
        ]);
    }

    private function makeLegacyInspection(ZoningApplication $app): SiteInspection
    {
        return SiteInspection::factory()->create([
            'zoning_application_id' => $app->id,
            'parcel_id' => null,
            'status' => 'assigned',
        ]);
    }
}