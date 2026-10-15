<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use App\Services\SupabaseService;


class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        $this->app->singleton(SupabaseService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        Vite::prefetch(concurrency: 3);

        // Sitewide ceiling, generous for map panning; stricter per-route throttles still apply on top.
        RateLimiter::for('app', fn (Request $request) => match (true) {
            $request->is('ping') => Limit::none(),
            $request->user() !== null => Limit::perMinute(300)->by('user:' . $request->user()->getAuthIdentifier()),
            default => Limit::perMinute(60)->by('ip:' . $request->ip()),
        });
    }
}
