<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],
    'supabase' => [
        'url'         => env('SUPABASE_URL'),
        'anon_key'    => env('SUPABASE_ANON_KEY'),
        'service_key' => env('SUPABASE_SERVICE_KEY'),
        'inspection_photo_signed_url_ttl' => (int) env('INSPECTION_PHOTO_SIGNED_URL_TTL', 300),
        // Alias used by PushInspectionToSupabase job (config('services.supabase.key'))
        'key'         => env('SUPABASE_SERVICE_KEY'),
    ],

    'fastapi' => [
        'base_url' => env('FASTAPI_BASE_URL', 'http://127.0.0.1:8001'),
        'timeout' => (int) env('FASTAPI_TIMEOUT', 30),
    ],

    'forecast' => [
        'url'     => env('FORECAST_SERVICE_URL', 'http://localhost:8002/api/v1/forecast'),
        'api_key' => env('FORECAST_SERVICE_API_KEY'),
        // The service trains an XGBoost model per request and loads shapefiles on
        // first call. Measured: ~24s warm, over 30s cold — Guzzle's 30s default
        // aborted the request while the forecast was still running.
        'timeout' => (int) env('FORECAST_SERVICE_TIMEOUT', 180),
    ],
];

