<?php

namespace Tests\Feature;

use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * An application's types live in zoning_application_types, one row each.
 * zoning_applications.application_type is the display label, always in
 * ZoningApplication::APPLICATION_TYPES order.
 */
class ZoningApplicationTypesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->assertSame('pgsql', config('database.default'), 'This suite requires the disposable PostgreSQL.');
        Http::fake(['*' => Http::response([], 200)]);
        Queue::fake();
        $this->withoutVite();
    }

    public function test_saving_orders_the_label_and_writes_one_row_per_type(): void
    {
        $application = ZoningApplication::factory()->create([
            'application_type' => 'Development Permit, Zoning Certification, Locational Clearance',
        ]);

        $this->assertSame('Locational Clearance, Zoning Certificate, Development Permit', $application->fresh()->application_type);
        $this->assertEqualsCanonicalizing(
            ['Locational Clearance', 'Zoning Certificate', 'Development Permit'],
            $application->types()->pluck('application_type')->all(),
        );
    }

    public function test_changing_the_types_replaces_the_rows(): void
    {
        $application = ZoningApplication::factory()->create(['application_type' => 'Locational Clearance, Development Permit']);

        $application->update(['application_type' => 'Zoning Certificate']);

        $this->assertSame(['Zoning Certificate'], $application->types()->pluck('application_type')->all());
    }

    public function test_an_unknown_type_is_refused(): void
    {
        $this->expectException(\InvalidArgumentException::class);

        ZoningApplication::factory()->create(['application_type' => 'Locational Clearance, Building Permit']);
    }

    public function test_type_filter_matches_combined_filings_and_the_old_spelling(): void
    {
        $alone = ZoningApplication::factory()->create(['application_type' => 'Zoning Certificate']);
        $combined = ZoningApplication::factory()->create(['application_type' => 'Locational Clearance, Zoning Certificate']);
        ZoningApplication::factory()->create(['application_type' => 'Development Permit']);

        foreach (['Zoning Certificate', 'Zoning Certification'] as $filter) {
            $this->assertEqualsCanonicalizing(
                [$alone->id, $combined->id],
                ZoningApplication::ofType($filter)->pluck('id')->all(),
                "Filter '{$filter}'",
            );
        }
    }

    public function test_report_filter_includes_combined_filings(): void
    {
        $admin = User::forceCreate(['name' => 'Report Admin', 'email' => 'types-'.uniqid().'@example.test',
            'password' => 'test-only', 'role' => 'Admin', 'is_active' => true]);
        ZoningApplication::factory()->create(['application_type' => 'Locational Clearance']);
        ZoningApplication::factory()->create(['application_type' => 'Development Permit, Locational Clearance']);
        ZoningApplication::factory()->create(['application_type' => 'Development Permit']);

        $response = $this->actingAs($admin)->postJson(route('reports.preview'), [
            'application_type'   => 'Locational Clearance',
            'variables'          => ['reference_number', 'application_type'],
            'presentation_style' => 'table',
        ])->assertOk();

        $this->assertStringNotContainsString('"Development Permit"', $response->getContent());
        $this->assertSame(2, substr_count($response->getContent(), 'Locational Clearance'));
    }

    public function test_migration_splits_existing_labels_and_fixes_the_spelling(): void
    {
        $migration = require database_path('migrations/2026_10_14_020000_create_zoning_application_types_table.php');
        $application = ZoningApplication::factory()->create(['application_type' => 'Locational Clearance']);

        $migration->down();
        DB::table('zoning_applications')->where('id', $application->id)
            ->update(['application_type' => 'Development Permit, Zoning Certification, Development Permit']);

        $migration->up();

        $this->assertSame('Zoning Certificate, Development Permit', DB::table('zoning_applications')->where('id', $application->id)->value('application_type'));
        $this->assertEqualsCanonicalizing(
            ['Zoning Certificate', 'Development Permit'],
            DB::table('zoning_application_types')->where('zoning_application_id', $application->id)->pluck('application_type')->all(),
        );
    }

    public function test_migration_refuses_an_unmapped_type(): void
    {
        $migration = require database_path('migrations/2026_10_14_020000_create_zoning_application_types_table.php');
        $application = ZoningApplication::factory()->create(['application_type' => 'Locational Clearance']);

        $migration->down();
        DB::table('zoning_applications')->where('id', $application->id)->update(['application_type' => 'Building Permit']);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Building Permit');

        $migration->up();
    }
}
