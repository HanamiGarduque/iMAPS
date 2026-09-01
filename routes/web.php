<?php

use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\TechnicalReviewController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\AuditTrailController;
use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\PublicPortalController;
use App\Http\Controllers\MapController; 
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\Auth\RegisteredUserController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ── Public Landing Page ──
Route::get('/', function () {
    return Inertia::render('Welcome', [
        'canLogin'       => Route::has('login'),
        'canRegister'    => false,
        'laravelVersion' => Application::VERSION,
        'phpVersion'     => PHP_VERSION,
    ]);
});

// ── Authenticated Routes (All Auth Users) ──
Route::middleware('auth')->group(function () {

    // Map Layer API Endpoint
    Route::get('/api/map/{layer}', [MapController::class, 'getLayer'])
        ->name('api.map.layer');
    // Dashboard
    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');
    // Search
    Route::get('/api/global-search', [SearchController::class, 'globalSearch'])->middleware('auth');
    // Applications Docket List
    Route::get('/applications', [ApplicationController::class, 'index'])
        ->name('applications.index');

    // Technical Reviews List
    Route::get('/technical-review', [TechnicalReviewController::class, 'index'])
        ->name('technicalreview.index');

    // ── Application Creation Form (Must be placed before wildcard {id} route) ──
    Route::get('/applications/encode', [ApplicationController::class, 'create'])
        ->name('applications.create')
        ->middleware('role:Planning Officer,Admin');

    Route::post('/applications/encode', [ApplicationController::class, 'store'])
        ->name('applications.store')
        ->middleware('role:Planning Officer');

    // ── Drafts / Offline Storage ──
    // Placed correctly before the /applications/{id} route to avoid wildcard conflicts
    Route::get('/applications/drafts', [ApplicationController::class, 'draftsIndex'])
        ->name('drafts.index')
        ->middleware('role:Planning Officer'); // Added middleware for consistency
        
    Route::post('/applications/drafts/save', [ApplicationController::class, 'saveDraft'])
        ->name('drafts.save');
        
    Route::delete('/applications/drafts/{id}', [ApplicationController::class, 'destroyDraft'])
        ->name('drafts.destroy');

    // ── Single-View & Standard Status Transitions ──
    Route::get('/applications/{id}', [ApplicationController::class, 'show'])
        ->name('applications.show');

    // Handles Approved / Declined standard status changes from the show docket
    Route::post('/applications/update-status', [ApplicationController::class, 'updateStatus'])
        ->name('applications.updateStatus')
        ->middleware('role:Planning Officer,Admin');

    // ── Technical Review & Field Scheduling Transitions ──
    // Handles changing technical review status (e.g., transition to Site Inspection)
    Route::post('/technical-review/update-status', [TechnicalReviewController::class, 'updateStatus'])
        ->name('technical-review.update')
        ->middleware('role:Planning Officer');

    // Handles the per-parcel batch review submitted from Applications/Show.jsx
    Route::post('/technical-review/submit-batch', [TechnicalReviewController::class, 'submitBatch'])
        ->name('technical-review.submit-batch')
        ->middleware('role:Planning Officer');

    // Handles specific inspector allocation/scheduling 
    Route::post('/technical-review/assign-inspector', [TechnicalReviewController::class, 'assignInspector'])
        ->name('technical-review.assign-inspector')
        ->middleware('role:Planning Officer');

    Route::get('/api/inspections/{localInspectionId}/supabase-data', [TechnicalReviewController::class, 'getSupabaseInspectionData'])
        ->name('api.inspections.supabase');

});

// ── Admin-Only Routes ──
Route::middleware(['auth', 'role:Admin'])->group(function () {

    // Override Default Registration to be Admin-Only
    Route::get('register-new-account', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('register-new-account', [RegisteredUserController::class, 'store']);

    Route::get('/analytics', [AnalyticsController::class, 'index'])
        ->name('analytics.index');

    Route::get('/audit-log', [AuditTrailController::class, 'index'])
        ->name('audit-log.index');
        Route::get('/settings', [SettingsController::class, 'index'])
        ->name('settings.index');
        
    Route::post('/settings/upload-shapefile', [SettingsController::class, 'uploadShapefile'])
        ->name('settings.upload-shapefile');

    Route::post('/settings/upload-tiles', [SettingsController::class, 'uploadRasterTiles']);
    
    // User Management
    Route::get('/users', [UserManagementController::class, 'index'])->name('users.index');
    Route::post('/users/sensitive-data', [UserManagementController::class, 'fetchSensitiveData'])->name('users.sensitive');
    Route::post('/users/{id}/update', [UserManagementController::class, 'updateProfile'])->name('users.update-profile');
});

// ── Public Portal Access ──
Route::get('/public-portal', [PublicPortalController::class, 'index'])
    ->name('public-portal');

require __DIR__ . '/auth.php';