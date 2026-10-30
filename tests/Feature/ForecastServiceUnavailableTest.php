<?php

namespace Tests\Feature;

use App\Services\ForecastService;
use Exception;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ForecastServiceUnavailableTest extends TestCase
{
    public function test_missing_api_key_fails_loudly_instead_of_calling_the_service(): void
    {
        config(['services.forecast.api_key' => null]);
        Http::fake();

        try {
            (new ForecastService)->generateForecast();
            $this->fail('An unconfigured forecasting service must throw.');
        } catch (Exception $e) {
            $this->assertStringContainsString('not configured', $e->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_missing_url_fails_loudly(): void
    {
        config(['services.forecast.url' => '']);
        Http::fake();

        $this->expectException(Exception::class);
        (new ForecastService)->generateForecast();
    }

    public function test_an_unreachable_service_throws_rather_than_returning_invented_pins(): void
    {
        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake(['*' => Http::response('connection refused', 503)]);

        try {
            $result = (new ForecastService)->generateForecast();
            $this->fail('Expected a failure, got a forecast: ' . json_encode($result));
        } catch (Exception $e) {
            $this->assertStringContainsString('503', $e->getMessage());
        }
    }

    public function test_the_run_fetches_the_service_forecast_without_sending_history(): void
    {
        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake(['*' => Http::response(['forecasts' => [], 'metrics' => []], 200)]);

        (new ForecastService)->generateForecast();

        // The service forecasts from its own MPDO-based history; nothing from
        // this database is uploaded.
        Http::assertSent(function ($request) {
            return $request->method() === 'GET'
                && $request->url() === 'http://localhost:8002/api/v1/forecast'
                && $request->hasHeader('X-API-Key', 'test-key')
                && $request->body() === '';
        });
    }

    public function test_a_predicted_count_is_passed_through_without_inventing_records(): void
    {
        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake(['*' => Http::response([
            'forecasts' => [
                ['Quarter_Label' => '2026 Q4', 'Barangay' => 'Namunga', 'Predicted_Quarterly_Clearances' => 7],
                ['Quarter_Label' => 'nonsense', 'Barangay' => 'Namuco', 'Predicted_Quarterly_Clearances' => 3],
            ],
            'metrics' => ['validation_mae' => 1.379, 'validation_wmape' => 42.3, 'validation_r2' => 0.7],
        ], 200)]);

        $result = (new ForecastService)->generateForecast();

        $this->assertArrayNotHasKey('pins', $result);
        // The unparseable quarter is dropped, not filed under a guessed year.
        $this->assertSame([[
            'barangay' => 'Namunga',
            'year' => 2026,
            'quarter' => 4,
            'label' => '2026 Q4',
            'predicted' => 7.0,
        ]], $result['demand']);
        $this->assertSame(42.3, $result['metrics']['validation_wmape']);
    }

    public function test_the_services_history_is_passed_through_with_imaps_spellings(): void
    {
        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake(['*' => Http::response([
            'forecasts' => [],
            'metrics' => [],
            'history' => [
                ['label' => '2025 Q4', 'year' => 2025, 'quarter' => 4, 'total' => 179,
                 'barangays' => ['Quilib' => 18, 'Nazi' => 2, 'Palacpac' => 1]],
                ['label' => 'broken', 'barangays' => []],
            ],
        ], 200)]);

        $result = (new ForecastService)->generateForecast();

        // The comparison baseline for "than last year" is the service's own
        // history, with its shapefile spellings mapped back to iMAPS names.
        $this->assertSame([[
            'year' => 2025,
            'quarter' => 4,
            'label' => '2025 Q4',
            'total' => 179,
            'barangays' => ['Quilib' => 18, 'Nasi' => 2, 'Palakpak' => 1],
        ]], $result['history']);
    }
}
