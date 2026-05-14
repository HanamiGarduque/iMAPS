<?php

namespace App\Providers;

use Illuminate\Support\Facades\Vite;
use Illuminate\Support\ServiceProvider;
use App\Models\ApplicationStatusTrack;
use App\Models\ZoningApplication;
use App\Observers\ZoningApplicationObserver;
use App\Observers\ApplicationStatusTrackObserver;


class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
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
