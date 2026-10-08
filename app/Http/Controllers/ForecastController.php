<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\ForecastService;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;


class ForecastController extends Controller
{
    protected ForecastService $forecastService;

    

    public function __construct(ForecastService $forecastService)
    {
        $this->forecastService = $forecastService;

        
    }

    public function generate(Request $request)
    {
        $request->validate([
            'file' => 'nullable|file|mimes:csv,txt|max:10240',
        ]);

        try {
            $forecastData = $this->forecastService->generateForecast($request->file('file'));

            return response()->json([
                'status'  => 'success',
                'data'    => $forecastData,
            ]);
        } catch (\Exception $e) {
            Log::error('Forecast generation request failed', ['error' => $e->getMessage()]);

            // 503, not 500: the forecasting microservice is a separate deployment
            // that is not part of this repository. The reason stays in the log.
            return response()->json([
                'status'  => 'error',
                'message' => 'The urban growth forecasting service is unavailable. Contact your administrator.',
            ], 503);
        }
    }

    public function getQuarterData($year, $quarter)
    {
        try {
            $data = Cache::remember("forecast_q_{$year}_{$quarter}", 3600, function () use ($year, $quarter) {
                return $this->forecastService->getQuarterData($year, $quarter);
            });
            
            return response()->json([
                'status' => 'success',
                'data'   => $data,
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status'  => 'error',
                'message' => 'Unable to fetch quarter data.',
            ], 500);
        }
    }
}