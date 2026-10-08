<?php

namespace Tests\Feature;

use App\Services\ForecastService;
use Exception;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class ForecastServiceUnavailableTest extends TestCase
{
    private function csvPath(): string
    {
        return storage_path('app/rosario_zoning_apps_2021_2026.csv');
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
        if (! file_exists($this->csvPath())) {
            $this->markTestSkipped('Default historical CSV is absent in this environment.');
        }

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
}
