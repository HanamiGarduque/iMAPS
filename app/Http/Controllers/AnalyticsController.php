<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;

class AnalyticsController extends Controller
{
    public function index(Request $request)
    {
        // ── STATIC DATA (placeholder hanggang may real DB data) ────────
        // TODO: Palitan ng actual Eloquent queries pag may real data na.

        return Inertia::render('Analytics/Index', [
            'filters' => [
                'year'         => 2026,
                'barangay'     => 'all',
                'service_type' => 'all',
            ],
            'barangays' => [
                'Rosario (Pob.)',
                'Guitnang Bayan',
                'Alayar',
                'San Benilson',
                'Palingonon',
                'Barquerohan',
                'Lumbang',
                'Sampaloc',
            ],
            'analytics' => [
                'summary' => [
                    'total_applications'  => 142,
                    'total_prev_year'     => 115,
                    'completed'           => 85,
                    'pending'             => 45,
                    'denied'              => 12,
                    'avg_processing_days' => 12.5,
                    'avg_days_prev_year'  => 14.2,
                ],
                'by_status' => [
                    ['status' => 'Released',         'count' => 85, 'percentage' => 59.8],
                    ['status' => 'Under SB',          'count' => 25, 'percentage' => 17.6],
                    ['status' => 'For Release',       'count' => 12, 'percentage' => 8.4],
                    ['status' => 'Technical Review',  'count' => 10, 'percentage' => 7.0],
                    ['status' => 'Initial Eval',      'count' => 10, 'percentage' => 7.0],
                ],
                'by_type' => [
                    ['application_type' => 'Locational Clearance', 'count' => 82],
                    ['application_type' => 'Zoning Certification',  'count' => 35],
                    ['application_type' => 'Development Permit',    'count' => 25],
                ],
                'by_barangay_type' => [
                    ['brgy' => 'Rosario (Pob.)',  'lc' => 25, 'zc' => 10, 'dp' => 5],
                    ['brgy' => 'Guitnang Bayan',  'lc' => 15, 'zc' => 8,  'dp' => 4],
                    ['brgy' => 'Alayar',          'lc' => 12, 'zc' => 5,  'dp' => 6],
                    ['brgy' => 'San Benilson',    'lc' => 10, 'zc' => 4,  'dp' => 3],
                    ['brgy' => 'Palingonon',      'lc' => 8,  'zc' => 3,  'dp' => 2],
                    ['brgy' => 'Barquerohan',     'lc' => 6,  'zc' => 3,  'dp' => 2],
                    ['brgy' => 'Lumbang',         'lc' => 4,  'zc' => 1,  'dp' => 2],
                    ['brgy' => 'Sampaloc',        'lc' => 2,  'zc' => 1,  'dp' => 1],
                ],
                'monthly_trend_current' => [42, 38, 45, 50, 48, 55, 60, 58, 62, 59, 65, 70],
                'monthly_trend_prev'    => [35, 32, 40, 42, 45, 48, 50, 55, 52, 50, 58, 60],
                'months'                => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],
                'base_forecast'         => [75, 82, 78, 65, 60, 55],
                'forecast_months'       => ['Jan 2027','Feb 2027','Mar 2027','Apr 2027','May 2027','Jun 2027'],
                'metrics' => [
                    'mae'  => 1.8,
                    'rmse' => 2.3,
                    'mape' => '8.4%',
                    'mase' => 0.87,
                ],
                'office_capacity' => 80,
            ],
        ]);
    }
}