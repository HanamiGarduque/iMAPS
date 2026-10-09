<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use DomainException;
use Exception;

class ForecastService
{
    protected string $url;
    protected string $apiKey;
    protected int $timeout;

    public function __construct()
    {
        // Config only. A hardcoded fallback key would let a missing
        // FORECAST_SERVICE_API_KEY look like a working install.
        $this->url = (string) config('services.forecast.url');
        $this->apiKey = (string) config('services.forecast.api_key');
        $this->timeout = (int) config('services.forecast.timeout', 180);
    }

    /**
     * The clearance history this system actually holds, as the CSV the
     * microservice expects: Encoding Date, Barangay, Application Type.
     *
     * Read from historical_data — the same table the dashboard shows as
     * recorded history — so the forecast is never trained on a bundled file
     * that has drifted from the records on screen.
     */
    protected function recordedHistoryCsv(): string
    {
        $rows = Schema::hasTable('historical_data')
            ? DB::table('historical_data')
                ->select('encoding_date', 'barangay', 'application_type')
                ->whereNotNull('encoding_date')
                ->whereNotNull('barangay')
                ->where('barangay', '<>', '')
                ->orderBy('encoding_date')
                ->get()
            : collect();

        if ($rows->isEmpty()) {
            // Not a service outage: the operator has to fix the data.
            throw new DomainException('No recorded clearance history is available to forecast from. Import the historical clearances, or upload a CSV with this run.');
        }

        $handle = fopen('php://temp', 'r+');
        fputcsv($handle, ['Encoding Date', 'Barangay', 'Application Type']);
        foreach ($rows as $row) {
            fputcsv($handle, [
                substr((string) $row->encoding_date, 0, 10),
                trim((string) $row->barangay),
                (string) $row->application_type,
            ]);
        }
        rewind($handle);
        $csv = stream_get_contents($handle);
        fclose($handle);

        return $csv;
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
     * Send the recorded history to the FastAPI microservice and retrieve the
     * forecast. The history is read from the database, never uploaded: a model
     * run that anyone could feed an arbitrary CSV is not evidence about Rosario.
     */
    public function generateForecast(): array
    {
        if ($this->url === '' || $this->apiKey === '') {
            throw new Exception('Forecasting service is not configured. Set FORECAST_SERVICE_URL and FORECAST_SERVICE_API_KEY.');
        }

        try {
            $response = Http::timeout($this->timeout)
                ->withHeaders([
                    'X-API-Key' => $this->apiKey,
                    'accept'    => 'application/json',
                ])
                ->attach('file', $this->recordedHistoryCsv(), 'recorded_clearance_history.csv')
                ->post($this->url);

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

            return $data;
        } catch (DomainException $e) {
            throw $e;
        } catch (Exception $e) {
            // Fail closed. Inventing pins and reporting fixed MAE/WMAPE here
            // presented a forecast that no model produced.
            Log::error('Forecast generation failed', ['error' => $e->getMessage()]);
            throw $e;
        }
    }
}
