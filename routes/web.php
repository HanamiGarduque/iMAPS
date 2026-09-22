<?php

use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\TechnicalReviewController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\MapsController;
use App\Http\Controllers\PublicPortalController;
use App\Http\Controllers\MapController; 
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\AnalyticsController;
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
    // Place specific zoning lookup routes before the generic layer wildcard to avoid route collision
    Route::get('/api/map/zoning-lookup', [MapController::class, 'getZoningByCoordinates']);
    Route::get('/api/map/zoning-area-lookup', [MapController::class, 'getZoningByParcelArea']);
    Route::get('/api/map/{layer}', [MapController::class, 'getLayer'])->name('api.map.layer'); // Generic layer access (whitelisted inside controller)

    // Landing page after login: KPI/welcome/analytics overview
    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');

    // Geospatial map view (zoning overlays, barangay boundaries, land-use diversity)
    Route::get('/maps', [MapsController::class, 'index'])
        ->name('maps.index');
    // Search
    Route::get('/api/global-search', [SearchController::class, 'globalSearch'])->middleware('auth');
    // Parcel verification (TCT / Tax Dec lookup) for the Permits & Status map layer
    Route::get('/api/parcels/verify', [SearchController::class, 'verifyParcel']);
    // Applications Docket List
    Route::get('/applications', [ApplicationController::class, 'index'])
        ->name('applications.index');

    // Technical Reviews List
    Route::get('/technical-review', [TechnicalReviewController::class, 'index'])
        ->name('technicalreview.index');

    // Site Inspections List
    Route::get('/site-inspections', [\App\Http\Controllers\SiteInspectionController::class, 'index'])
        ->name('site-inspections.index')
        ->middleware('role:Admin');
    Route::post('/site-inspections/sync', [\App\Http\Controllers\SiteInspectionController::class, 'forceSync'])
        ->name('site-inspections.sync')
        ->middleware('role:Admin');
    Route::get('/site-inspections/{id}', [\App\Http\Controllers\SiteInspectionController::class, 'show'])
        ->name('site-inspections.show')
        ->middleware('role:Admin');

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

    Route::get('/analytics', [AnalyticsController::class, 'index'])->name('analytics.index');
    Route::post('/api/forecast', [AnalyticsController::class, 'forecast'])->name('analytics.forecast');

    Route::get('/settings', [SettingsController::class, 'index'])
        ->name('settings.index');
        
    Route::post('/settings/upload-shapefile', [SettingsController::class, 'uploadShapefile'])
        ->name('settings.upload-shapefile');

    Route::post('/settings/upload-tiles', [SettingsController::class, 'uploadRasterTiles']);
    
    // User Management
    Route::get('/users', [UserManagementController::class, 'index'])->name('users.index');
    Route::get('/users/{id}/logs', [UserManagementController::class, 'logs'])->name('users.logs');
    Route::post('/users/sensitive-data', [UserManagementController::class, 'fetchSensitiveData'])->name('users.sensitive');
    Route::post('/users/reset-password', [UserManagementController::class, 'resetPassword'])->name('users.reset-password');
    Route::post('/users/{id}/update', [UserManagementController::class, 'updateProfile'])->name('users.update-profile');
});

// ── Public Portal Access ──
Route::get('/public-portal', [PublicPortalController::class, 'index'])
    ->name('public-portal');

require __DIR__ . '/auth.php';