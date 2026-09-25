<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Services\ForecastService;
use Illuminate\Support\Facades\Cache;


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
            return response()->json([
                'status'  => 'error',
                'message' => 'Unable to generate spatial forecast: ' . $e->getMessage(),
            ], 500);
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