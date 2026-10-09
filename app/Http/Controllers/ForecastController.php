<?php

namespace App\Http\Controllers;

use App\Services\ForecastService;
use Illuminate\Support\Facades\Log;


class ForecastController extends Controller
{
    protected ForecastService $forecastService;

    

    public function __construct(ForecastService $forecastService)
    {
        $this->forecastService = $forecastService;

        
    }

    public function generate()
    {
        try {
            $forecastData = $this->forecastService->generateForecast();

            return response()->json([
                'status'  => 'success',
                'data'    => $forecastData,
            ]);
        } catch (\DomainException $e) {
            // The request was fine and the service may be up — there is nothing
            // recorded to forecast from. Say so instead of blaming the service.
            return response()->json([
                'status'  => 'error',
                'message' => $e->getMessage(),
            ], 422);
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
}
