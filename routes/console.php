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