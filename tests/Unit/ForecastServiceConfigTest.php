<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class ForecastServiceConfigTest extends TestCase
{
    private function forecastServiceSource(): string
    {
        return file_get_contents(__DIR__ . '/../../app/Services/ForecastService.php');
    }

    public function test_no_api_key_is_hardcoded_as_a_fallback(): void
    {
        $source = $this->forecastServiceSource();

        // A fallback secret in source means a missing env var looks like a working
        // install, which is how it stays missing.
        $this->assertStringNotContainsString(
            "env('FORECAST_SERVICE_API_KEY'",
            $source,
            'Read the key through config(), not env() with a default.'
        );
        $this->assertSame(
            1,
            preg_match_all('/apiKey\s*=\s*\(string\)\s*config\(\'services\.forecast\.api_key\'\);/', $source),
            'The API key must come from config with no default value.'
        );
        $this->assertSame(
            0,
            preg_match_all('/[A-Za-z0-9]{40,}/', $source),
            'A long opaque literal in this file looks like a committed credential.'
        );
    }

    public function test_config_declares_no_default_api_key(): void
    {
        $source = file_get_contents(__DIR__ . '/../../config/services.php');

        $this->assertMatchesRegularExpression(
            "/'api_key'\s*=>\s*env\('FORECAST_SERVICE_API_KEY'\)\s*,/",
            $source,
            'config/services.php must not supply a default forecast API key.'
        );
    }

    public function test_env_example_ships_an_empty_forecast_key(): void
    {
        $source = file_get_contents(__DIR__ . '/../../.env.example');

        $this->assertStringContainsString("FORECAST_SERVICE_API_KEY=\n", $source);
    }

    public function test_the_http_call_allows_more_than_guzzles_default_thirty_seconds(): void
    {
        $source = $this->forecastServiceSource();

        // The service trains an XGBoost model per request (~24s warm, over 30s
        // cold), so the default 30s aborted it mid-forecast.
        $this->assertStringContainsString('Http::timeout($this->timeout)', $source);
        // Plain PHPUnit test: no booted app, so read the configured default from source.
        $matched = preg_match(
            "/'timeout'\s*=>\s*\(int\) env\('FORECAST_SERVICE_TIMEOUT', (\d+)\)/",
            file_get_contents(__DIR__ . '/../../config/services.php'),
            $m
        );
        $this->assertSame(1, $matched, 'config/services.php must declare a forecast timeout default.');
        $this->assertGreaterThanOrEqual(60, (int) $m[1]);
    }

    public function test_generate_forecast_does_not_fabricate_results_on_failure(): void
    {
        $source = $this->forecastServiceSource();

        // The old catch block built pins with mt_rand() and reported a fixed
        // MAE/WMAPE as a successful forecast no model had produced.
        $this->assertStringNotContainsString(
            'using spatial forecast model fallback',
            $source,
            'generateForecast() must fail closed, not substitute invented numbers.'
        );
        $this->assertStringNotContainsString("'validation_mae' => 2.155", $source);
        $this->assertStringNotContainsString("'validation_wmape' => 0.302", $source);
    }

    public function test_no_accuracy_figure_is_hardcoded_anywhere(): void
    {
        // getQuarterData() used to report a fixed MAE 2.155 / WMAPE 0.302 /
        // R2 0.785 for every quarter, which read as measured accuracy.
        foreach (['2.155', '0.302', '0.785'] as $constant) {
            $this->assertStringNotContainsString($constant, $this->forecastServiceSource());
        }
        $this->assertStringNotContainsString(
            'function getQuarterData',
            $this->forecastServiceSource(),
            'getQuarterData() produced no model output at all; it must stay deleted.'
        );
    }

    public function test_no_application_records_are_invented_from_a_predicted_count(): void
    {
        $source = $this->forecastServiceSource();

        // A count per barangay-quarter was expanded into that many pins, each
        // with a cycled purpose and mt_rand() lot area, and those showed up as
        // if they were filings.
        $this->assertStringNotContainsString('mt_rand', $source);
        $this->assertStringNotContainsString('Forecasted Application #', $source);
        $this->assertStringNotContainsString('lot_area_sqm', $source);
    }

    public function test_the_forecast_cannot_be_run_against_an_uploaded_file(): void
    {
        $service = $this->forecastServiceSource();
        $controller = file_get_contents(__DIR__ . '/../../app/Http/Controllers/ForecastController.php');

        // The model's output is presented as evidence about Rosario, so it runs
        // on the recorded clearances and nothing else.
        $this->assertStringNotContainsString('UploadedFile', $service);
        $this->assertStringNotContainsString('getClientOriginalName', $service);
        $this->assertStringNotContainsString("\$request->file(", $controller);
        $this->assertStringNotContainsString("'file' =>", $controller);
    }

    public function test_the_run_uses_recorded_history_not_a_bundled_csv(): void
    {
        $source = $this->forecastServiceSource();

        // The bundled CSV could drift from — or never have matched — the
        // clearances the dashboard shows as recorded.
        $this->assertStringNotContainsString('rosario_zoning_apps_2021_2026.csv', $source);
        $this->assertStringContainsString("DB::table('historical_data')", $source);
    }
}
