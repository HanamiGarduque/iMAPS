<?php
// routes/console.php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule; // <-- Make sure to import this facade!

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// The new Laravel 11+ way to schedule tasks directly in the routes file
Schedule::command('sync:pull-inspections')->everyFiveMinutes();

// Pre-build the cached map layers. Run after deploying or after restoring the
// database, so the first dashboard visit doesn't wait on the ~20s cold build of
// the land-use plan. Uploads through Settings already warm the cache.
Artisan::command('map:warm {--fresh : Discard the current cache first}', function () {
    if ($this->option('fresh')) {
        \App\Http\Controllers\MapController::flushLayerCache();
    }
    foreach (\App\Http\Controllers\MapController::warmLayerCache() as $layer => $ms) {
        $this->line(sprintf('  %-20s %6d ms', $layer, $ms));
    }
    $this->info('Map layers cached.');
})->purpose('Build and cache the GeoJSON map layers');
