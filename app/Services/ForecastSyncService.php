<?php

namespace App\Services;

use App\Models\ForecastOutput;
use App\Models\ForecastRun;
use App\Models\ZoningApplication;
use Carbon\CarbonImmutable;
use Exception;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class ForecastSyncService
{
    protected string $url;
    protected string $apiKey;
    protected int $timeout;
    protected ForecastService $forecastService;

    public function __construct(ForecastService $forecastService)
    {
        $this->url = (string) config('services.forecast.url');
        $this->apiKey = (string) config('services.forecast.api_key');
        $this->timeout = (int) config('services.forecast.timeout', 180);
        $this->forecastService = $forecastService;
    }

    /**
     * Resolve the target forecast endpoint URL.
     */
    public function resolveForecastUrl(bool $persist = true): string
    {
        $url = rtrim($this->url, '/');
        if (!str_ends_with($url, '/forecast')) {
            if (str_ends_with($url, '/api/v1')) {
                $url .= '/forecast';
            } else {
                $url .= '/api/v1/forecast';
            }
        }
        return $persist ? $url . '?persist=true' : $url;
    }

    /**
     * Compile clearance records from historical_data and active zoning_applications
     * into a single clean CSV string for the spatial forecasting engine.
     *
     * Only filings up to the end of the last completed calendar quarter are included,
     * because the spatial forecasting engine requires fully completed quarters
     * to train lag features without mid-quarter bias.
     *
     * Format:
     * Application Type,Encoding Date,Barangay,Zoning Code,Reference Number
     */
    public function compileFilingsCsv(?string $upToDate = null): string
    {
        if ($upToDate === null) {
            $upToDate = CarbonImmutable::now('Asia/Manila')->startOfQuarter()->subDay()->toDateString();
        }

        $records = [];
        $seenRefs = [];

        // 1. Gather historical clearances up to the completed quarter boundary
        $histRows = DB::table('historical_data')
            ->select([
                'encoding_date',
                'application_type',
                'barangay',
                'zoning_code',
                'form_number',
            ])
            ->whereRaw('LOWER(TRIM(application_type)) = ?', ['locational clearance'])
            ->whereNotNull('encoding_date')
            ->whereDate('encoding_date', '<=', $upToDate)
            ->whereNotNull('barangay')
            ->whereRaw("TRIM(barangay) != ''")
            ->orderBy('encoding_date', 'asc')
            ->get();

        foreach ($histRows as $row) {
            $date = date('Y-m-d', strtotime((string) $row->encoding_date));
            $barangay = trim((string) $row->barangay);
            $zoningCode = trim((string) ($row->zoning_code ?? ''));
            $ref = trim((string) ($row->form_number ?? ''));

            if ($ref !== '') {
                $seenRefs[$ref] = true;
            }

            $records[] = [
                'type'        => 'Locational Clearance',
                'date'        => $date,
                'barangay'    => $barangay,
                'zoning_code' => $zoningCode,
                'reference'   => $ref,
            ];
        }

        // 2. Gather active, non-voided zoning applications up to the completed quarter boundary
        $zoningRows = ZoningApplication::with(['types', 'parcels'])
            ->whereNull('voided_at')
            ->whereHas('types', fn ($q) => $q->where('application_type', 'Locational Clearance'))
            ->get();

        foreach ($zoningRows as $app) {
            $dateObj = $app->date_of_receipt ?: $app->created_at;
            if (!$dateObj) {
                continue;
            }
            $date = $dateObj->format('Y-m-d');
            if ($date > $upToDate) {
                continue;
            }

            $ref = trim((string) ($app->reference_number ?: ($app->form_number ?: '')));

            // Avoid double-counting if already in historical_data
            if ($ref !== '' && isset($seenRefs[$ref])) {
                continue;
            }
            if ($ref !== '') {
                $seenRefs[$ref] = true;
            }

            $barangay = trim((string) ($app->barangay ?: ($app->parcels->first()->barangay ?? '')));
            if ($barangay === '') {
                continue;
            }

            $zoningCode = trim((string) ($app->target_land_use_class ?: ($app->land_use_class ?: ($app->parcels->first()->land_use_class ?? ''))));

            $records[] = [
                'type'        => 'Locational Clearance',
                'date'        => $date,
                'barangay'    => $barangay,
                'zoning_code' => $zoningCode,
                'reference'   => $ref,
            ];
        }

        // 3. Render into CSV
        $fp = fopen('php://temp', 'r+');
        fputcsv($fp, ['Application Type', 'Encoding Date', 'Barangay', 'Zoning Code', 'Reference Number']);
        foreach ($records as $r) {
            fputcsv($fp, [$r['type'], $r['date'], $r['barangay'], $r['zoning_code'], $r['reference']]);
        }
        rewind($fp);
        $csv = stream_get_contents($fp);
        fclose($fp);

        return $csv;
    }

    /**
     * Push the compiled clearances to the forecasting microservice, parse the
     * results, persist to database, update cache, and return output.
     */
    public function pushAndSync(?string $csvContent = null, string $triggeredBy = 'scheduler'): array
    {
        if ($this->url === '' || $this->apiKey === '') {
            throw new Exception('Forecasting service is not configured. Set FORECAST_SERVICE_URL and FORECAST_SERVICE_API_KEY.');
        }

        $limit = (int) ini_get('max_execution_time');
        if ($limit > 0 && $limit < $this->timeout + 30) {
            set_time_limit($this->timeout + 30);
        }

        if ($csvContent === null) {
            $csvContent = $this->compileFilingsCsv();
        }

        $lines = explode("\n", trim($csvContent));
        $rowCount = max(0, count($lines) - 1); // exclude header

        $endpoint = $this->resolveForecastUrl();
        Log::info('Dispatching compiled clearance filings to forecasting service', [
            'endpoint'     => $endpoint,
            'records'      => $rowCount,
            'triggered_by' => $triggeredBy,
        ]);

        $response = Http::timeout($this->timeout)
            ->withHeaders([
                'X-API-Key' => $this->apiKey,
                'Accept'    => 'application/json',
            ])
            ->attach('file', $csvContent, 'compiled_clearances.csv')
            ->post($endpoint);

        if ($response->failed()) {
            Log::error('Forecast Sync Microservice Error', [
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new Exception("Forecasting microservice returned status " . $response->status());
        }

        $data = $response->json();

        // Normalize demand rows and handle aliases
        $demand = [];
        $outputsToInsert = [];
        foreach ($data['forecasts'] ?? [] as $fc) {
            $label = $fc['Quarter_Label'] ?? null;
            $parsed = $this->parseQuarterLabel($label);
            $barangay = trim((string) ($fc['Barangay'] ?? ''));
            $barangay = ForecastService::SERVICE_NAME_ALIASES[mb_strtolower($barangay)] ?? $barangay;

            if ($parsed === null || $barangay === '') {
                continue;
            }

            $predicted = (float) ($fc['Predicted_Quarterly_Clearances'] ?? 0);
            $lower80 = isset($fc['Lower_80']) ? (float) $fc['Lower_80'] : null;
            $upper80 = isset($fc['Upper_80']) ? (float) $fc['Upper_80'] : null;

            $demand[] = [
                'barangay'  => $barangay,
                'year'      => $parsed[0],
                'quarter'   => $parsed[1],
                'label'     => (string) $label,
                'predicted' => $predicted,
                'lower_80'  => $lower80,
                'upper_80'  => $upper80,
            ];

            $forecastDate = CarbonImmutable::create($parsed[0], ($parsed[1] - 1) * 3 + 1, 1)->toDateString();
            $outputsToInsert[] = [
                'barangay'      => $barangay,
                'year'          => $parsed[0],
                'quarter'       => $parsed[1],
                'forecast_date' => $forecastDate,
                'mean_value'    => $predicted,
                'lower_80'      => $lower80,
                'upper_80'      => $upper80,
                'created_at'    => now(),
                'updated_at'    => now(),
            ];
        }

        // Normalize history rows
        $history = [];
        foreach ($data['history'] ?? [] as $q) {
            if (!isset($q['year'], $q['quarter'], $q['total'])) {
                continue;
            }
            $barangays = [];
            foreach ($q['barangays'] ?? [] as $name => $count) {
                $name = trim((string) $name);
                $name = ForecastService::SERVICE_NAME_ALIASES[mb_strtolower($name)] ?? $name;
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

        $data['demand'] = $demand;
        $data['history'] = $history;

        // Persist run to database
        DB::transaction(function () use ($data, $outputsToInsert, $rowCount, $triggeredBy) {
            $run = ForecastRun::create([
                'application_type' => 'Locational Clearance',
                'forecast_periods' => 2,
                'model_metrics'    => $data['metrics'] ?? null,
                'historical_data'  => [
                    'training_window' => $data['training_window'] ?? null,
                    'data_quality'    => $data['data_quality'] ?? null,
                    'summary'         => $data['summary'] ?? null,
                    'records_pushed'  => $rowCount,
                ],
                'triggered_by'     => $triggeredBy,
                'executed_at'      => now(),
                'status'           => 'completed',
            ]);

            foreach ($outputsToInsert as &$output) {
                $output['forecast_run_id'] = $run->id;
            }
            unset($output);

            if (!empty($outputsToInsert)) {
                ForecastOutput::insert($outputsToInsert);
            }

            Cache::forever('forecast.latest', [
                'generated_at' => now()->toIso8601String(),
                'run_id'       => $run->id,
                'demand'       => $data['demand'],
                'metrics'      => $data['metrics'] ?? null,
                'history'      => $data['history'],
                'summary'      => $data['summary'] ?? null,
            ]);
        });

        Log::info('Forecast synchronization completed successfully', [
            'metrics' => $data['metrics'] ?? null,
        ]);

        return $data;
    }

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
}
