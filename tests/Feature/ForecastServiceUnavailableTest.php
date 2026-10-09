<?php

namespace Tests\Feature;

use App\Services\ForecastService;
use Exception;
use Illuminate\Foundation\Testing\DatabaseTransactions;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ForecastServiceUnavailableTest extends TestCase
{
    use DatabaseTransactions;

    private function seedRecordedHistory(): void
    {
        DB::table('historical_data')->insert([
            [
                'encoding_date' => '2024-01-15',
                'barangay' => 'Namunga',
                'application_type' => 'Locational Clearance',
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'encoding_date' => '2024-04-20',
                'barangay' => 'Namuco',
                'application_type' => 'Locational Clearance',
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ]);
    }

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
        $this->seedRecordedHistory();

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

    public function test_an_empty_history_fails_closed(): void
    {
        DB::table('historical_data')->delete();

        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake();

        try {
            (new ForecastService)->generateForecast();
            $this->fail('A forecast with no recorded history must throw.');
        } catch (\DomainException $e) {
            // A data precondition, not an outage: the controller answers 422.
            $this->assertStringContainsString('No recorded clearance history', $e->getMessage());
        }

        Http::assertNothingSent();
    }

    public function test_the_run_sends_the_recorded_history_as_the_csv(): void
    {
        $this->seedRecordedHistory();

        config([
            'services.forecast.url' => 'http://localhost:8002/api/v1/forecast',
            'services.forecast.api_key' => 'test-key',
        ]);
        Http::fake(['*' => Http::response(['forecasts' => [], 'metrics' => []], 200)]);

        (new ForecastService)->generateForecast();

        Http::assertSent(function ($request) {
            $csv = $request->data()[0]['contents'];
            // fputcsv() quotes the fields that need it; the service reads it with pandas.
            $this->assertStringContainsString('Encoding Date', $csv);
            $this->assertStringContainsString('2024-01-15,Namunga,', $csv);
            $this->assertStringContainsString('2024-04-20,Namuco,', $csv);

            return true;
        });
    }

    public function test_a_predicted_count_is_passed_through_without_inventing_records(): void
    {
        $this->seedRecordedHistory();

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
}
