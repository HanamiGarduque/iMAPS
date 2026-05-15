<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use App\Services\SupabaseService;
use App\Models\ApplicationStatusTrack;
use App\Observers\ApplicationStatusTrackObserver;


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
        ApplicationStatusTrack::observe(ApplicationStatusTrackObserver::class);
    }
}
