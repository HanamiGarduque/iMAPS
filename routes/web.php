<?php

use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\AuditTrailController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\PublicPortalController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin' => Route::has('login'),
        'canRegister' => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion' => PHP_VERSION,
    ]);
});

Route::get('/dashboard', function () {
    return Inertia::render('Dashboard');
})->middleware(['auth', 'verified'])->name('dashboard');

Route::middleware('auth')->group(function () {
    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');  // ← add this

    Route::get('/applications',            [ApplicationController::class, 'index'])->name('applications.index');
    Route::get('/applications/encode',     [ApplicationController::class, 'create'])->name('applications.create');
    Route::post('/applications/encode',    [ApplicationController::class, 'store'])->name('applications.store');
    Route::get('/applications/{id}',       [ApplicationController::class, 'show'])->name('applications.show');
    Route::post('/applications/update-status', [ApplicationController::class, 'updateStatus'])->name('applications.updateStatus');
    Route::get('/audit-log',               [AuditTrailController::class, 'index'])->name('audit-log.index');
    Route::get('/analytics',               [AnalyticsController::class, 'index'])->name('analytics.index');
});

Route::get('/public-portal', [PublicPortalController::class, 'index'])->name('public-portal');

require __DIR__ . '/auth.php';
