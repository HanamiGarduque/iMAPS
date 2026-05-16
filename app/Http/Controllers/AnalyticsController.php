<?php

namespace App\Http\Controllers;

use Illuminate\Support\Facades\Http;

class AnalyticsController extends Controller
{
    public function index()
    {
        $response = Http::get(
            'http://127.0.0.1:5000/analytics'
        );

        $analytics = $response->json();

        return inertia(
            'Analytics/Index',
            [

                'analytics' => $analytics,

                'filters' => [

                    'year' => now()->year,

                    'barangay' => 'all',

                    'service_type' => 'all',
                ],

                'barangays' => collect(
                    $analytics['by_barangay_type']
                )->pluck('brgy'),

                'auth' => [

                    'user' => auth()->user()
                ]
            ]
        );
    }
}