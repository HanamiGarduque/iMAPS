<?php

namespace Tests\Feature;

use App\Models\SiteInspection;
use App\Models\TechnicalReview;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Issue D E2E regression: creation-time routing precedence.
 *
 * APP-2026-00035 ("Locational Clearance, Petition for Rezoning", stream
 * `amendment`) recorded a per-parcel `Needs Site Inspection` evaluation, which
 * correctly created site_inspections row 51 and technical_reviews row 87 — and
 * then rolled the application up to `Under Sangguniang Bayan` anyway, because
 * `ApplicationController::store()` evaluated `$routeToSb` BEFORE the inspection
 * requirement. The application left Technical Review without the field evidence
 * the officer needed, so Round 1 could never reach FieldSync.
 *
 * THE RULE
 * -------
 *     Declined
 *     -> Needs Site Inspection        -> Technical Review
 *     -> SB routing / amendment       -> Under Sangguniang Bayan
 *     -> otherwise                    -> For Release
 *
 * An amendment still BELONGS to the SB workflow. This only fixes WHEN it enters.
 */
class IssueDAmendmentInspectionRoutingTest extends TestCase
{
    use RefreshDatabase;

    private int $formSequence = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();
    }

    // ---- 1. non-amendment + inspection -> inspection path ----

    public function test_standard_filing_with_needs_inspection_stays_in_technical_review(): void
    {
        $application = $this->encodeStandard([[
            'parcel_code' => 'P-01',
            'decision'    => 'Needs Site Inspection',
            'inspector'   => true,
        ]]);

        $this->assertSame('Technical Review', $application->status);
    }

    // ---- 2. amendment / petition + inspection -> inspection path ----
    // This is APP-2026-00035's exact shape.

    public function test_amendment_petition_with_needs_inspection_stays_in_technical_review(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Locational Clearance, Petition for Rezoning'],
            [['parcel_code' => 'P-01', 'decision' => 'Needs Site Inspection', 'inspector' => true]],
        );

        $this->assertSame('Technical Review', $application->status);
        $this->assertSame('amendment', $application->application_stream);
    }

    public function test_amendment_reclassification_with_needs_inspection_is_routed_to_technical_review(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Petition for Reclassification'],
            [['parcel_code' => 'P-01', 'decision' => 'Needs Site Inspection', 'inspector' => true]],
        );

        $this->assertSame('Technical Review', $application->status);
    }

    public function test_amendment_with_inspection_creates_the_round_and_keeps_the_request(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Petition for Rezoning'],
            [['parcel_code' => 'P-01', 'decision' => 'Needs Site Inspection', 'inspector' => true]],
        );

        $parcel = $application->parcels()->sole();

        $this->assertSame('Needs Site Inspection', TechnicalReview::where('parcel_id', $parcel->id)->value('decision'));

        $inspection = SiteInspection::where('parcel_id', $parcel->id)->sole();
        $this->assertSame($inspection->id, TechnicalReview::where('parcel_id', $parcel->id)->value('site_inspection_task_id'));
        $this->assertSame('assigned', $inspection->status);
        $this->assertNull($inspection->completed_at);
        $this->assertNull($inspection->submitted_at);

        // The fix changes WHEN SB is entered, not WHETHER the lot is SB-eligible.
        $this->assertTrue($application->fresh()->hasSbRouting());
    }

    // ---- 3. amendment + no inspection requirement -> SB path ----

    public function test_amendment_with_all_parcels_approved_is_routed_to_sangguniang_bayan(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Petition for Rezoning'],
            [['parcel_code' => 'P-01', 'decision' => 'Approved']],
        );

        $this->assertSame('Under Sangguniang Bayan', $application->status);
    }

    public function test_standard_filing_with_explicit_sb_routing_and_no_inspection_is_routed_to_sangguniang_bayan(): void
    {
        $application = $this->encodeStandard(
            [['parcel_code' => 'P-01', 'decision' => 'Approved']],
            ['route_to_sb' => true],
        );

        $this->assertSame('Under Sangguniang Bayan', $application->status);
    }

    public function test_standard_filing_with_explicit_sb_routing_and_inspection_stays_in_technical_review(): void
    {
        $application = $this->encodeStandard(
            [['parcel_code' => 'P-01', 'decision' => 'Needs Site Inspection', 'inspector' => true]],
            ['route_to_sb' => true],
        );

        $this->assertSame('Technical Review', $application->status);
    }

    // ---- 4. Declined outranks everything, including an inspection request ----

    public function test_declined_is_routed_to_denied_regardless_of_amendment(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Petition for Rezoning'],
            [['parcel_code' => 'P-01', 'decision' => 'Declined', 'reason' => 'Lot does not satisfy the recorded zoning.']],
        );

        $this->assertSame('Denied', $application->status);
    }

    public function test_declined_outranks_a_parallel_inspection_request(): void
    {
        $application = $this->encodeStandard([
            ['parcel_code' => 'P-01', 'decision' => 'Needs Site Inspection', 'inspector' => true],
            ['parcel_code' => 'P-02', 'decision' => 'Declined', 'reason' => 'Documents do not support the requested use.'],
        ]);

        $this->assertSame('Denied', $application->status);
    }

    // ---- 5. multi-parcel, any decision order, must still hold for inspection ----

    public function test_multi_parcel_amendment_holds_in_technical_review_in_either_order(): void
    {
        foreach ([
            'approved-first'  => ['Approved', 'Needs Site Inspection'],
            'inspection-first' => ['Needs Site Inspection', 'Approved'],
        ] as $label => $decisions) {
            $application = $this->encodeAmended(
                ['application_type' => 'Petition for Rezoning'],
                [
                    ['parcel_code' => 'P-01', 'decision' => $decisions[0], 'inspector' => $decisions[0] === 'Needs Site Inspection'],
                    ['parcel_code' => 'P-02', 'decision' => $decisions[1], 'inspector' => $decisions[1] === 'Needs Site Inspection'],
                ],
            );

            $this->assertSame('Technical Review', $application->status, "Inspection requirement must win ($label).");
            $this->assertCount(2, $application->parcels()->get());
            $this->assertSame(1, SiteInspection::where('zoning_application_id', $application->id)->count(), "One round ($label).");
        }
    }

    // ---- 6. existing non-amendment release path unchanged ----

    public function test_standard_filing_with_all_parcels_approved_is_routed_to_for_release(): void
    {
        $application = $this->encodeStandard([
            ['parcel_code' => 'P-01', 'decision' => 'Approved'],
            ['parcel_code' => 'P-02', 'decision' => 'Approved'],
        ]);

        $this->assertSame('For Release', $application->status);
    }

    public function test_standard_filing_without_any_evaluation_is_routed_to_technical_review(): void
    {
        $application = $this->encodeStandard([['parcel_code' => 'P-01']]);

        $this->assertSame('Technical Review', $application->status);
    }

    public function test_amendment_without_any_evaluation_is_routed_to_sangguniang_bayan(): void
    {
        $application = $this->encodeAmended(
            ['application_type' => 'Petition for Rezoning'],
            [['parcel_code' => 'P-01']],
        );

        $this->assertSame('Under Sangguniang Bayan', $application->status);
    }

    // ---- 7. source-level guard: the ordering itself must not regress ----

    public function test_store_evaluates_the_inspection_requirement_before_sb_routing(): void
    {
        $source = (string) file_get_contents(dirname(__DIR__, 2) . '/app/Http/Controllers/ApplicationController.php');

        $inspection = strpos($source, "in_array('Needs Site Inspection', \$decisionsSeen, true)) {\n                    \$application->update(['status' => 'Technical Review']);");
        $sb = strpos($source, "\$application->update(['status' => 'Under Sangguniang Bayan']);");

        $this->assertNotFalse($inspection, 'The inspection branch must exist in store().');
        $this->assertNotFalse($sb, 'The SB branch must exist in store().');
        $this->assertLessThan(
            $sb,
            $inspection,
            'An outstanding inspection requirement must be evaluated BEFORE SB routing.',
        );
    }

    // ---- fixtures ----

    /** @param list<array{parcel_code:string, decision?:string, inspector?:bool, reason?:string}> $parcels */
    private function encodeStandard(array $parcels, array $overrides = []): ZoningApplication
    {
        return $this->encode($overrides + ['application_stream' => 'permit'], $parcels);
    }

    private function encodeAmended(array $overrides, array $parcels): ZoningApplication
    {
        return $this->encode(
            $overrides + ['application_stream' => 'amendment', 'target_land_use_class' => 'R2-Z'],
            $parcels,
        );
    }

    private function encode(array $overrides, array $parcels): ZoningApplication
    {
        $officer = User::create(['name' => 'Routing Officer', 'email' => 'routing-'.uniqid().'@example.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);

        $payload = array_merge([
            'application_type'      => 'Locational Clearance',
            'form_number'            => 'U-'.str_pad((string) ++$this->formSequence, 6, '0', STR_PAD_LEFT),
            'purpose'                => 'Regression coverage for creation-time routing precedence.',
            'applicant_name'         => 'Routing Regression Applicant',
            'contact_number'         => '09171234567',
            'email'                  => 'routing.regression@example.test',
            'barangay'               => 'Bagong Pook',
            'assessment_fee'         => 1000,
            'or_number'              => 'OR-'.str_pad((string) $this->formSequence, 6, '0', STR_PAD_LEFT),
            'preferred_release_mode' => 'Pick-up at Office',
            'date_of_receipt'        => now()->toDateString(),
        ], $overrides);

        $payload['parcels'] = array_map(fn (array $p) => $this->parcelPayload($p), $parcels);

        $this->actingAs($officer)->post(route('applications.store'), $payload)
            ->assertRedirect()
            ->assertSessionHasNoErrors();

        return ZoningApplication::where('form_number', $payload['form_number'])->sole();
    }

    private function parcelPayload(array $parcel): array
    {
        $payload = [
            'parcel_code'           => $parcel['parcel_code'],
            'barangay'              => 'Bagong Pook',
            'owner_name'            => 'Routing Regression Applicant',
            'property_index_number' => 'PIN-'.$parcel['parcel_code'].'-'.uniqid(),
            'lot_area_sqm'          => 500,
            'land_use_class'        => 'Residential',
            'coordinates'           => '13.1234, 121.4567',
        ];

        if (! empty($parcel['decision'])) {
            $payload['decision'] = $parcel['decision'];
        }

        if (($parcel['decision'] ?? null) === 'Needs Site Inspection') {
            $inspector = User::create([
                'name' => 'Routing Inspector', 'email' => 'inspector-'.uniqid().'@example.test',
                'password' => 'test-only', 'role' => 'Site Inspector', 'is_active' => true,
                'handshake_key' => 'hk-'.uniqid(),
            ]);

            $payload['inspector_id']   = $inspector->id;
            $payload['scheduled_date'] = now()->addDay()->toDateString();
            $payload['deadline_date']  = now()->addDays(8)->toDateString();
            $payload['assigned_notes'] = 'Verify the recorded lot against the applicant documents.';
        }

        if (($parcel['decision'] ?? null) === 'Declined') {
            $payload['decision_reason'] = $parcel['reason'] ?? 'Recorded basis for declining this lot.';
        }

        return $payload;
    }
}
