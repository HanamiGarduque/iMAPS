<?php

namespace Tests\Feature;

use App\Models\ForecastOutput;
use App\Models\ForecastRun;
use App\Models\ZoningApplication;
use App\Models\ZoningApplicationType;
use App\Services\ForecastService;
use App\Services\ForecastSyncService;
use Exception;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ForecastSyncTest extends TestCase
{
    use RefreshDatabase;

    protected ForecastSyncService $syncService;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-valid-forecast-api-key-32chars',
            'services.forecast.timeout' => 60,
        ]);

        $this->syncService = app(ForecastSyncService::class);
    }

    public function test_compile_filings_csv_includes_historical_and_zoning_clearances(): void
    {
        // 1. Insert historical LC row
        DB::table('historical_data')->insert([
            'encoding_date'    => '2025-03-15',
            'application_type' => 'Locational Clearance',
            'barangay'         => 'Nasi',
            'zoning_code'      => 'R1-Z',
            'form_number'      => 'HIST-001',
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        // 2. Insert zoning application LC row
        $app = ZoningApplication::factory()->create([
            'reference_number'      => 'ZA-2026-001',
            'form_number'           => 'ZA-2026-001',
            'barangay'              => 'Quilib',
            'application_type'      => 'Locational Clearance',
            'target_land_use_class' => 'C1-Z',
            'status'                => 'Released',
            'date_of_receipt'       => '2026-04-10',
        ]);

        $csv = $this->syncService->compileFilingsCsv();
        $this->assertNotEmpty($csv);

        $lines = explode("\n", trim($csv));
        $this->assertSame(
            ['Application Type', 'Encoding Date', 'Barangay', 'Zoning Code', 'Reference Number'],
            str_getcsv($lines[0])
        );

        $this->assertStringContainsString('"Locational Clearance",2025-03-15,Nasi,R1-Z,HIST-001', $csv);
        $this->assertStringContainsString('"Locational Clearance",2026-04-10,Quilib,C1-Z,ZA-2026-001', $csv);
    }

    public function test_compile_filings_csv_deduplicates_by_reference_number(): void
    {
        // Insert historical row
        DB::table('historical_data')->insert([
            'encoding_date'    => '2026-01-10',
            'application_type' => 'Locational Clearance',
            'barangay'         => 'Alupay',
            'zoning_code'      => 'R1-Z',
            'form_number'      => 'DUP-REF-100',
            'created_at'       => now(),
            'updated_at'       => now(),
        ]);

        // Insert duplicate reference in zoning_applications
        $app = ZoningApplication::factory()->create([
            'reference_number'      => 'DUP-REF-100',
            'barangay'              => 'Alupay',
            'application_type'      => 'Locational Clearance',
            'target_land_use_class' => 'R1-Z',
            'status'                => 'Released',
            'date_of_receipt'       => '2026-01-10',
        ]);

        $csv = $this->syncService->compileFilingsCsv();
        $occurrences = substr_count($csv, 'DUP-REF-100');
        $this->assertSame(1, $occurrences, 'Duplicate reference numbers must be deduplicated in the compiled CSV.');
    }

    public function test_push_and_sync_uploads_to_microservice_persists_to_database_and_cache(): void
    {
        $mockForecastResponse = [
            'metrics' => [
                'validation_mae'   => 1.45,
                'validation_wmape' => 38.2,
                'validation_r2'    => 0.72,
            ],
            'training_window' => [
                'start' => '2021 Q4',
                'end'   => '2026 Q3',
            ],
            'forecasts' => [
                [
                    'Quarter_Label'                  => '2026 Q4',
                    'Barangay'                       => 'Nazi', // Should map to Nasi
                    'Predicted_Quarterly_Clearances' => 8.4,
                    'Lower_80'                       => 4.0,
                    'Upper_80'                       => 13.0,
                ],
                [
                    'Quarter_Label'                  => '2026 Q4',
                    'Barangay'                       => 'Palacpac', // Should map to Palakpak
                    'Predicted_Quarterly_Clearances' => 3.1,
                    'Lower_80'                       => 1.0,
                    'Upper_80'                       => 6.0,
                ],
            ],
            'history' => [
                [
                    'year'      => 2026,
                    'quarter'   => 3,
                    'label'     => '2026 Q3',
                    'total'     => 120,
                    'barangays' => ['Nazi' => 5],
                ],
            ],
        ];

        Http::fake([
            'http://localhost:8002/api/v1/forecast*' => Http::response($mockForecastResponse, 200),
        ]);

        $dummyCsv = "Application Type,Encoding Date,Barangay,Zoning Code,Reference Number\nLocational Clearance,2026-01-01,Nasi,R1-Z,REF1";
        $result = $this->syncService->pushAndSync($dummyCsv, 'test-runner');

        Http::assertSent(function ($request) {
            return $request->method() === 'POST'
                && str_starts_with($request->url(), 'http://localhost:8002/api/v1/forecast')
                && $request->hasHeader('X-API-Key', 'test-valid-forecast-api-key-32chars')
                && str_contains($request->body(), 'compiled_clearances.csv');
        });

        // 1. Verify database ForecastRun
        $this->assertSame(1, ForecastRun::count());
        $run = ForecastRun::first();
        $this->assertSame('Locational Clearance', $run->application_type);
        $this->assertSame(2, $run->forecast_periods);
        $this->assertSame('completed', $run->status);
        $this->assertSame('test-runner', $run->triggered_by);
        $this->assertSame(1.45, $run->model_metrics['validation_mae']);

        // 2. Verify database ForecastOutput rows and alias mapping
        $this->assertSame(2, ForecastOutput::count());
        $outputNasi = ForecastOutput::where('barangay', 'Nasi')->first();
        $this->assertNotNull($outputNasi);
        $this->assertSame(2026, (int) $outputNasi->year);
        $this->assertSame(4, (int) $outputNasi->quarter);
        $this->assertEquals(8.4, (float) $outputNasi->mean_value);
        $this->assertEquals(4.0, (float) $outputNasi->lower_80);

        $outputPalakpak = ForecastOutput::where('barangay', 'Palakpak')->first();
        $this->assertNotNull($outputPalakpak);

        // 3. Verify Cache::get('forecast.latest')
        $cached = Cache::get('forecast.latest');
        $this->assertNotNull($cached);
        $this->assertSame($run->id, $cached['run_id']);
        $this->assertCount(2, $cached['demand']);
        $this->assertSame('Nasi', $cached['demand'][0]['barangay']);
        $this->assertSame('Palakpak', $cached['demand'][1]['barangay']);
        $this->assertSame(120, $cached['history'][0]['total']);
        $this->assertSame(['Nasi' => 5], $cached['history'][0]['barangays']);
    }

    public function test_sync_command_runs_successfully(): void
    {
        $mockForecastResponse = [
            'metrics' => [
                'validation_mae'   => 1.5,
                'validation_wmape' => 40.0,
                'validation_r2'    => 0.70,
            ],
            'training_window' => ['start' => '2021 Q4', 'end' => '2026 Q3'],
            'forecasts' => [
                [
                    'Quarter_Label'                  => '2026 Q4',
                    'Barangay'                       => 'Nasi',
                    'Predicted_Quarterly_Clearances' => 5.0,
                ],
            ],
            'history' => [],
        ];

        Http::fake([
            'http://localhost:8002/api/v1/forecast*' => Http::response($mockForecastResponse, 200),
        ]);

        $exitCode = Artisan::call('forecast:sync', ['--force' => true]);
        $this->assertSame(0, $exitCode);
        $this->assertSame(1, ForecastRun::count());
    }

    public function test_push_and_sync_fails_loudly_when_service_errors(): void
    {
        Http::fake([
            'http://localhost:8002/api/v1/forecast*' => Http::response('Internal error', 500),
        ]);

        $this->expectException(Exception::class);
        $this->expectExceptionMessage('Forecasting microservice returned status 500');

        $this->syncService->pushAndSync("dummy,header\n1,2");
    }
}
