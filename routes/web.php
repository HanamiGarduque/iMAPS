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
        'canLogin'       => Route::has('login'),
        'canRegister'    => Route::has('register'),
        'laravelVersion' => Application::VERSION,
        'phpVersion'     => PHP_VERSION,
    ]);
});

// ── Authenticated routes (all roles) ──
Route::middleware('auth')->group(function () {

    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');

    Route::get('/applications', [ApplicationController::class, 'index'])
        ->name('applications.index');

    // ── must be before {id} ──
    Route::get('/applications/encode', [ApplicationController::class, 'create'])
        ->name('applications.create')->middleware('role:Planning Officer');

    Route::post('/applications/encode', [ApplicationController::class, 'store'])
        ->name('applications.store')->middleware('role:Planning Officer');

    Route::get('/applications/{id}', [ApplicationController::class, 'show'])
        ->name('applications.show');

    Route::post('/applications/update-status', [ApplicationController::class, 'updateStatus'])
        ->name('applications.updateStatus');
});

// ── Admin only ──
Route::middleware(['auth', 'role:Admin'])->group(function () {

    Route::get('/analytics', [AnalyticsController::class, 'index'])
        ->name('analytics.index');

    Route::get('/audit-log', [AuditTrailController::class, 'index'])
        ->name('audit-log.index');
});

// ── Public ──
Route::get('/public-portal', [PublicPortalController::class, 'index'])
    ->name('public-portal');

require __DIR__ . '/auth.php';