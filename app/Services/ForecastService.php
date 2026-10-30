<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Exception;

class ForecastService
{
    protected string $url;
    protected string $apiKey;
    protected int $timeout;

    /**
     * The forecasting service names barangays after its own shapefile, which
     * spells two of them differently from iMAPS. This maps its output back so
     * the counts land on the right barangay.
     */
    public const SERVICE_NAME_ALIASES = [
        'nazi'     => 'Nasi',
        'palacpac' => 'Palakpak',
    ];

    public function __construct()
    {
        // Config only. A hardcoded fallback key would let a missing
        // FORECAST_SERVICE_API_KEY look like a working install.
        $this->url = (string) config('services.forecast.url');
        $this->apiKey = (string) config('services.forecast.api_key');
        $this->timeout = (int) config('services.forecast.timeout', 180);
    }

    /**
     * "2026 Q4" / "Q4 2026" -> [2026, 4]. Null when the label is unreadable:
     * guessing a year would file the prediction under the wrong quarter.
     */
    protected function parseQuarterLabel(?string $label): ?array
    {
        if ($label === null || $label === '') {
            return null;
        }
        if (preg_match('/(\d{4})\D*Q([1-4])/i', $label, $m)) {
            return [(int) $m[1], (int) $m[2]];
        }
        if (preg_match('/Q([1-4])\D*(\d{4})/i', $label, $m)) {
            return [(int) $m[2], (int) $m[1]];
        }

        return null;
    }

    /**
     * Fetch the forecast from the FastAPI microservice. The service forecasts
     * from its own history (MPDO monthly totals, split by barangay), so nothing
     * is sent: the model runs on the same data it was validated on, never on
     * whatever happens to be in this database or an uploaded file.
     */
    public function generateForecast(): array
    {
        if ($this->url === '' || $this->apiKey === '') {
            throw new Exception('Forecasting service is not configured. Set FORECAST_SERVICE_URL and FORECAST_SERVICE_API_KEY.');
        }

        // A cold run outlasts PHP's request limit (30s locally, 120s in the
        // container), which killed the request mid-call with a fatal error
        // instead of letting the timeout below fail cleanly. Raise the limit to
        // cover the service timeout; never lower it, and never add one where
        // there is none (CLI, tests).
        $limit = (int) ini_get('max_execution_time');
        if ($limit > 0 && $limit < $this->timeout + 30) {
            set_time_limit($this->timeout + 30);
        }

        try {
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'X-API-Key' => $this->apiKey,
                    'accept'    => 'application/json',
                ])
                ->get($this->url);

            if ($response->failed()) {
                Log::error('Forecast Microservice Error', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
                throw new Exception("Forecasting microservice returned status " . $response->status());
            }

            $data = $response->json();

            // The model predicts a count per barangay-quarter. Pass those counts
            // through as they are. Splitting a count into N invented application
            // records — each with a cycled purpose and a random lot area — put
            // fabricated rows in front of planners as if they were filings.
            $demand = [];
            foreach ($data['forecasts'] ?? [] as $fc) {
                $label = $fc['Quarter_Label'] ?? null;
                $parsed = $this->parseQuarterLabel($label);
                $barangay = trim((string) ($fc['Barangay'] ?? ''));
                $barangay = self::SERVICE_NAME_ALIASES[mb_strtolower($barangay)] ?? $barangay;
                if ($parsed === null || $barangay === '') {
                    Log::warning('Skipping forecast row with no usable barangay or quarter', ['row' => $fc]);
                    continue;
                }

                $demand[] = [
                    'barangay'  => $barangay,
                    'year'      => $parsed[0],
                    'quarter'   => $parsed[1],
                    'label'     => (string) $label,
                    'predicted' => (float) ($fc['Predicted_Quarterly_Clearances'] ?? 0),
                ];
            }

            $data['demand'] = $demand;

            // The quarters the forecast was made from. A forecast quarter is
            // compared against these, not historical_data, so "than last year"
            // uses the same history as the model.
            $history = [];
            foreach ($data['history'] ?? [] as $q) {
                if (!isset($q['year'], $q['quarter'], $q['total'])) {
                    continue;
                }
                $barangays = [];
                foreach ($q['barangays'] ?? [] as $name => $count) {
                    $name = trim((string) $name);
                    $name = self::SERVICE_NAME_ALIASES[mb_strtolower($name)] ?? $name;
                    $barangays[$name] = ($barangays[$name] ?? 0) + (int) $count;
                }
                $history[] = [
                    'year'      => (int) $q['year'],
                    'quarter'   => (int) $q['quarter'],
                    'label'     => (string) ($q['label'] ?? ''),
                    'total'     => (int) $q['total'],
                    'barangays' => $barangays,
                ];
            }
            $data['history'] = $history;

            return $data;
        } catch (Exception $e) {
            // Fail closed. Inventing pins and reporting fixed MAE/WMAPE here
            // presented a forecast that no model produced.
            Log::error('Forecast generation failed', ['error' => $e->getMessage()]);
            throw $e;
        }
    }
}
