<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Schema;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

/**
 * The fee breakdown lives in application_fees (one row per charged fee), while
 * the form, the detail page and the permit templates keep using the old field
 * names. assessment_fee stays on zoning_applications as the recorded total.
 */
class ApplicationFeesTest extends TestCase
{
    use RefreshDatabase;

    private User $officer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();

        $this->officer = User::forceCreate(['name' => 'Fee Officer', 'email' => 'fees-'.uniqid().'@example.test',
            'password' => 'test-only', 'role' => 'Planning Officer', 'is_active' => true]);
    }

    public function test_encoding_stores_one_row_per_charged_fee(): void
    {
        $application = $this->encode([
            'assessment_fee'           => 2750,
            'zoning_certificate_fee'   => 1500,
            'locational_clearance_fee' => 1000,
            'development_permit_fee'   => 0,
            'other_fees'               => '',
            'penalty_fee'              => 250,
        ]);

        $this->assertEqualsCanonicalizing(
            ['zoning_certificate' => 1500.0, 'locational_clearance' => 1000.0, 'penalty' => 250.0],
            $application->fees()->pluck('amount', 'fee_type')->map(fn ($a) => (float) $a)->all(),
        );
        $this->assertSame(2750.0, $application->assessment_fee);
    }

    public function test_breakdown_reads_back_under_the_form_field_names(): void
    {
        $application = $this->encode(['assessment_fee' => 1700, 'zoning_certificate_fee' => 1200, 'other_fees' => 500]);

        $this->assertSame(1200.0, $application->zoning_certificate_fee);
        $this->assertSame(0.0, $application->locational_clearance_fee);
        $this->assertSame(0.0, $application->development_permit_fee);
        $this->assertSame(500.0, $application->other_fees);
        $this->assertSame(0.0, $application->penalty_fee);
    }

    public function test_detail_page_receives_the_breakdown(): void
    {
        $application = $this->encode(['assessment_fee' => 1500, 'development_permit_fee' => 1500]);

        $this->actingAs($this->officer)->get(route('applications.show', $application->id))
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->where('application.development_permit_fee', 1500)
                ->where('application.zoning_certificate_fee', 0)
                ->where('application.assessment_fee', 1500));
    }

    public function test_sync_replaces_and_clears_amounts(): void
    {
        $application = $this->encode(['assessment_fee' => 1000, 'zoning_certificate_fee' => 1000]);

        $application->syncFees(['zoning_certificate_fee' => 0, 'penalty_fee' => 300]);

        $this->assertSame(['penalty' => 300.0], $application->fees()->pluck('amount', 'fee_type')->all());
    }

    public function test_deleting_an_application_removes_its_fees(): void
    {
        $application = $this->encode(['assessment_fee' => 1000, 'zoning_certificate_fee' => 1000]);

        $application->delete();

        $this->assertSame(0, DB::table('application_fees')->count());
    }

    public function test_the_old_fee_columns_are_gone(): void
    {
        foreach (['zoning_certificate_fee', 'locational_clearance_fee', 'development_permit_fee', 'other_fees', 'penalty_fee'] as $column) {
            $this->assertFalse(Schema::hasColumn('zoning_applications', $column), "{$column} should have moved to application_fees.");
        }
    }

    public function test_migration_copies_existing_breakdowns_and_rolls_back(): void
    {
        $migration = require database_path('migrations/2026_10_14_010000_move_fee_breakdown_to_application_fees.php');
        $application = $this->encode(['assessment_fee' => 0]);

        $migration->down();
        DB::table('zoning_applications')->where('id', $application->id)
            ->update(['zoning_certificate_fee' => 800, 'penalty_fee' => 120, 'other_fees' => 0]);

        $migration->up();

        $this->assertSame(
            ['penalty' => 120.0, 'zoning_certificate' => 800.0],
            $application->fees()->orderBy('fee_type')->pluck('amount', 'fee_type')->all(),
        );

        $migration->down();
        $this->assertSame('800.00', DB::table('zoning_applications')->where('id', $application->id)->value('zoning_certificate_fee'));
        $migration->up();
    }

    private function encode(array $fees): ZoningApplication
    {
        $form = 'F-'.uniqid();

        $this->actingAs($this->officer)->post(route('applications.store'), $fees + [
            'application_stream'     => 'permit',
            'application_type'       => 'Locational Clearance',
            'form_number'            => $form,
            'purpose'                => 'Fee breakdown coverage.',
            'applicant_name'         => 'Fee Applicant',
            'contact_number'         => '09171234567',
            'email'                  => 'fee.applicant@example.test',
            'barangay'               => 'Bagong Pook',
            'or_number'              => 'OR-'.uniqid(),
            'preferred_release_mode' => 'Pick-up at Office',
            'date_of_receipt'        => now()->toDateString(),
            'parcels'                => [[
                'parcel_code'           => 'P-01',
                'barangay'              => 'Bagong Pook',
                'owner_name'            => 'Fee Applicant',
                'property_index_number' => 'PIN-'.uniqid(),
                'lot_area_sqm'          => 500,
                'land_use_class'        => 'Residential',
                'coordinates'           => '13.1234, 121.4567',
            ]],
        ])->assertRedirect()->assertSessionHasNoErrors();

        return ZoningApplication::where('form_number', $form)->sole();
    }
}
