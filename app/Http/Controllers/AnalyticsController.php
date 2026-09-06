<?php
namespace App\Http\Controllers;

use App\Exceptions\FastApiException;
use App\Models\MonthlyMetric;
use App\Models\ForecastRun;
use App\Models\ForecastOutput;
use App\Services\FastApiService;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AnalyticsController extends Controller
{
    // 1. Renders the React Analytics Page
    public function index()
    {
        $actuals = MonthlyMetric::whereNotNull('target_value')
            ->orderBy('metric_date', 'asc')
            ->get(['metric_date', 'target_value', 'rainfall_mm', 'inflation_rate']);

        $latestRun = ForecastRun::where('status', 'completed')->latest()->first();
        
        $forecasts = $latestRun 
            ? ForecastOutput::where('forecast_run_id', $latestRun->id)->orderBy('forecast_date', 'asc')->get()
            : [];

        return Inertia::render('Analytics/Index', [
            'actuals' => $actuals,
            'forecasts' => $forecasts,
            'latestRun' => $latestRun,
        ]);
    }

    // 2. Handles the "Re-run Model" button from React using FastApiService
    public function rerun(FastApiService $fastApiService)
    {
        $actuals = MonthlyMetric::whereNotNull('target_value')
            ->orderBy('metric_date', 'asc')
            ->get();

        try {
            // Call Python service with timeouts & retries
            $response = $fastApiService->post('/api/forecast', [
                'history' => $actuals,
                'steps' => 6,
            ]);

            // Save run execution
            $run = ForecastRun::create([
                'triggered_by' => 'manual_button',
                'executed_at' => now(),
                'status' => 'completed',
            ]);

            // Store forecast points
            foreach ($response['forecasts'] as $item) {
                ForecastOutput::create([
                    'forecast_run_id' => $run->id,
                    'forecast_date' => $item['forecast_date'],
                    'mean_value' => $item['mean_value'],
                    'lower_ci' => $item['lower_ci'],
                    'upper_ci' => $item['upper_ci'],
                ]);
            }

            return back()->with('message', 'SARIMAX model re-executed successfully.');

        } catch (FastApiException $e) {
            return back()->withErrors(['forecast_error' => $e->getMessage()]);
        }
    }
}