<?php

use App\Http\Controllers\ApplicationController;
use App\Http\Controllers\TechnicalReviewController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\PublicPortalController;
use App\Http\Controllers\MapController; 
use App\Http\Controllers\UserManagementController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\SearchController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\Auth\RegisteredUserController;
use Illuminate\Foundation\Application;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

// ── Session Keep-Alive Ping ──
Route::get('/ping', function () {
    return response()->json(['status' => 'ok', 'timestamp' => now()->toIso8601String()]);
})->name('ping');

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
    Route::get('/api/map/{layer}', [MapController::class, 'getLayer'])->name('api.map.layer');
    Route::get('/api/forecast/{year}/{quarter}', [\App\Http\Controllers\ForecastController::class, 'getQuarterData']);
    Route::post('/api/forecast/generate', [\App\Http\Controllers\ForecastController::class, 'generate']);
    Route::get('/maps/urban-growth-data', [MapController::class, 'getUrbanGrowthData'])->name('maps.urban_growth');
    // Landing page after login: KPI/welcome/analytics overview
    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard');

    // Redirect /maps to the unified GIS Dashboard
    Route::get('/maps', fn () => redirect()->route('dashboard'))
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

    // Encoder lookups (read-only), before /applications/{id} for the same reason
    Route::get('/applications/applicant-lookup', [ApplicationController::class, 'applicantLookup'])
        ->name('applications.applicantLookup')
        ->middleware('role:Planning Officer');
    // ── Single-View & Standard Status Transitions ──
    Route::get('/applications/{id}', [ApplicationController::class, 'show'])
        ->name('applications.show');

    Route::post('/applications/{id}/amendment-refs', [ApplicationController::class, 'updateAmendmentRefs'])
        ->whereNumber('id')
        ->name('applications.amendmentRefs')
        ->middleware('role:Planning Officer');

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

    // ── Notifications ──
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::get('/api/notifications', [NotificationController::class, 'getUnread'])->name('api.notifications.unread');
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllAsRead'])->name('notifications.mark-all-read');
    Route::delete('/notifications/clear-all', [NotificationController::class, 'clearAll'])->name('notifications.clear-all');
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy'])->name('notifications.destroy');

});

// ── Admin-Only Routes ──
Route::middleware(['auth', 'role:Admin'])->group(function () {

    // Override Default Registration to be Admin-Only
    Route::get('register-new-account', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('register-new-account', [RegisteredUserController::class, 'store']);

    // ── Standard Reports ──
    Route::get('/reports', [ReportController::class, 'index'])->name('reports.index');
    Route::post('/api/analytics/report/preview', [ReportController::class, 'previewReport'])->name('reports.preview');
    Route::post('/api/analytics/report', [ReportController::class, 'generateReport'])->name('reports.generate');

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