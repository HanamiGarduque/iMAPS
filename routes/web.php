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
use App\Http\Controllers\TaxMapLookupController;
use App\Http\Controllers\WorkReassignmentController;
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

// ── Internal Authenticated Routes (Loop 6: Admin + Planning Officer only) ──
// Site Inspectors are FieldSync-only and receive 403 here even with an
// existing session. Per-role exceptions are declared on individual routes.
Route::middleware('auth')->group(function () {

    // Map Layer API Endpoint
    // Place specific zoning lookup routes before the generic layer wildcard to avoid route collision
    // Loop 6: shared internal map/search surfaces stay Admin + Planning Officer.
    Route::get('/api/map/zoning-lookup', [MapController::class, 'getZoningByCoordinates'])
        ->middleware('role:Admin,Planning Officer');
    Route::get('/api/map/zoning-area-lookup', [MapController::class, 'getZoningByParcelArea'])
        ->middleware('role:Admin,Planning Officer');
    Route::get('/api/map/{layer}', [MapController::class, 'getLayer'])
        ->name('api.map.layer') // Generic layer access (whitelisted inside controller)
        ->middleware('role:Admin,Planning Officer');

    // ── Forecasting + geospatial data (upstream) ──
    Route::get('/api/forecast/{year}/{quarter}', [\App\Http\Controllers\ForecastController::class, 'getQuarterData'])
        ->middleware('role:Admin,Planning Officer');
    Route::post('/api/forecast/generate', [\App\Http\Controllers\ForecastController::class, 'generate'])
        ->middleware('role:Admin,Planning Officer');
    Route::get('/maps/urban-growth-data', [MapController::class, 'getUrbanGrowthData'])
        ->name('maps.urban_growth')
        ->middleware('role:Admin,Planning Officer');
    Route::get('/api/parcels/verify', [SearchController::class, 'verifyParcel'])
        ->middleware('role:Admin,Planning Officer');

    // Landing page after login: KPI/welcome/analytics overview
    Route::get('/dashboard', [DashboardController::class, 'index'])
        ->name('dashboard')
        ->middleware('role:Admin,Planning Officer');

    // ── /maps product decision ─────────────────────────────────────────────
    // MASTER'S DIRECTION WINS. origin/master deliberately replaced the separate
    // geospatial Maps page with a single unified GIS Dashboard and deleted both
    // `app/Http/Controllers/MapsController.php` and `resources/js/Pages/Maps.jsx`.
    // Master also has no link to `/maps` anywhere.
    //
    // The Loop 9 side of this conflict pointed at MapsController@index, a class
    // master no longer ships. Taking the Loop 9 side would therefore register a
    // route whose controller does not exist (a runtime 500), and would
    // reintroduce a deleted product surface.
    //
    // This is a master product decision, NOT a Loop 9 contract: no Loop 9 phase
    // depends on /maps. Loop 9's own routes below are unaffected and are
    // preserved exactly.
    Route::get('/maps', fn () => redirect()->route('dashboard'))
        ->name('maps.index');

    // Search
    Route::get('/api/global-search', [SearchController::class, 'globalSearch'])
        ->middleware(['auth', 'role:Admin,Planning Officer']);
    // Applications Docket List
    Route::get('/applications', [ApplicationController::class, 'index'])
        ->name('applications.index')
        ->middleware('role:Admin,Planning Officer');

    // Technical Reviews List
    Route::get('/technical-review', [TechnicalReviewController::class, 'index'])
        ->name('technicalreview.index')
        ->middleware('role:Admin,Planning Officer');

    // ── Internal tax-map lookup (Loop 6: moved from routes/api.php so the
    // session guard works; Admin + Planning Officer only. Sole caller is the
    // application encode form — public portal does not use it.) ──
    Route::get('/api/tax-map/lookup/{pin}', [TaxMapLookupController::class, 'lookup'])
        ->middleware('role:Admin,Planning Officer');

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
    // Loop 6: application encoding is Planning Officer-only (Admin excluded).
    Route::get('/applications/encode', [ApplicationController::class, 'create'])
        ->name('applications.create')
        ->middleware('role:Planning Officer');

    Route::post('/applications/encode', [ApplicationController::class, 'store'])
        ->name('applications.store')
        ->middleware('role:Planning Officer');

    // ── Drafts / Offline Storage (Loop 6: Planning Officer-only) ──
    // Placed correctly before the /applications/{id} route to avoid wildcard conflicts
    Route::get('/applications/drafts', [ApplicationController::class, 'draftsIndex'])
        ->name('drafts.index')
        ->middleware('role:Planning Officer'); // Added middleware for consistency
        
    Route::post('/applications/drafts/save', [ApplicationController::class, 'saveDraft'])
        ->name('drafts.save')
        ->middleware('role:Planning Officer');
        
    Route::delete('/applications/drafts/{id}', [ApplicationController::class, 'destroyDraft'])
        ->name('drafts.destroy')
        ->middleware('role:Planning Officer');

    // Encoder lookups (read-only), before /applications/{id} for the same reason
    Route::get('/applications/applicant-lookup', [ApplicationController::class, 'applicantLookup'])
        ->name('applications.applicantLookup')
        ->middleware('role:Planning Officer');
    // ── Single-View & Standard Status Transitions ──
    Route::get('/applications/{id}/permit-schema/{type}', [ApplicationController::class, 'permitSchema'])
        ->whereNumber('id')
        ->name('applications.permit-schema');

    Route::post('/applications/{id}/export-preview/{type}', [ApplicationController::class, 'exportPreview'])->whereNumber('id')->name('applications.export-preview');
    Route::post('/applications/{id}/export-document/{type}', [ApplicationController::class, 'exportDocument'])
        ->whereNumber('id')
        ->name('applications.export-document');

    Route::get('/applications/{id}', [ApplicationController::class, 'show'])
        ->name('applications.show')
        ->middleware('role:Admin,Planning Officer');

    Route::post('/applications/{id}/amendment-refs', [ApplicationController::class, 'updateAmendmentRefs'])
        ->whereNumber('id')
        ->name('applications.amendmentRefs')
        ->middleware('role:Planning Officer');

    // Handles Approved / Declined standard status changes from the show docket
    // Loop 6 (Leader correction): status update is Planning Officer-only — NOT Admin.
    Route::post('/applications/update-status', [ApplicationController::class, 'updateStatus'])
        ->name('applications.updateStatus')
        ->middleware('role:Planning Officer');

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

    // ── Loop 9C-1: read-only Loop 9 delivery state per inspection round ─────
    // READ-ONLY. It reports `can_retry` as a server-computed authorization
    // fact. 9C-1 itself added no action, no dispatch and no UI; the retry
    // ROUTE that consumes that fact arrived later, in Loop 9C-2, directly below.
    //
    // The middleware is deliberately IDENTICAL to `applications.show` above,
    // because that route is the existing application-read boundary and it
    // performs no per-application authorization of its own. Matching it exactly
    // is what keeps this reader from being stricter (which would hide state
    // from every caller, since no application has a recorded Planning Officer
    // owner yet) or broader.
    //
    // PLACEMENT. This block sits in a region untouched by origin/master, and it
    // uses the inline FQCN form already used elsewhere in this file so no import
    // is added to the block origin/master also edits. Do not move it next to
    // `api.inspections.supabase` below: that statement is already changed on
    // this branch and is the exact line origin/master inserts against.
    Route::get('/applications/{id}/delivery-status', [\App\Http\Controllers\InspectionDeliveryController::class, 'status'])
        ->name('applications.delivery-status')
        ->middleware('role:Admin,Planning Officer');

    // -- Loop 9C-2: the Planning Officer delivery retry POST ----------------
    // THE FIRST USER-TRIGGERED LOOP 9 MUTATION. It re-queues the one existing
    // bridge writer for one existing inspection round. It is not a new
    // inspection, not a reinspection, not a reassignment and not a status
    // transition, and there is still no UI that calls it: 9C-4 owns the button.
    //
    // `role:Planning Officer` is the FIRST boundary, and it is deliberately
    // narrower than the read route above. Admin is refused because Admin is
    // not an authorized retry actor, and Site Inspector is refused because
    // Site Inspectors are FieldSync-only. The retry service re-checks role AND
    // application ownership under a row lock, so this is defence in depth
    // rather than the only check.
    //
    // POST ONLY, inside the `auth` web group, so CSRF verification stays
    // active. There is deliberately no GET equivalent: a delivery retry is a
    // mutation and must never be reachable by a link, a prefetch or a crawler.
    //
    // NO REQUEST BODY. The target is the route parameter and the actor is the
    // authenticated session. The server derives ownership, delivery state,
    // inspector eligibility and round currency; a client cannot assert any of
    // them.
    //
    // IDEMPOTENCY. There is no client request id. The service's row lock plus
    // its state transition are the guard, so a double submit yields one
    // accepted retry and one 409, never two successes.
    Route::post('/site-inspections/{inspection}/retry-delivery', [\App\Http\Controllers\InspectionDeliveryController::class, 'retry'])
        ->name('site-inspections.retry-delivery')
        ->middleware('role:Planning Officer');

    Route::get('/api/inspections/{localInspectionId}/supabase-data', [TechnicalReviewController::class, 'getSupabaseInspectionData'])
        ->name('api.inspections.supabase')
        ->middleware('role:Admin,Planning Officer');

    // ── Work Reassignment (business continuity, no account sharing) ──
    // Two SEPARATE responsibilities that are deliberately not merged:
    //   * Application ownership is Admin-initiated. Handing an application to
    //     another active Planning Officer keeps the work moving WITHOUT giving
    //     Admin any Planning Officer decision authority.
    //   * Inspection-round ownership is Planning-Officer-initiated. Admin does
    //     not reassign Site Inspectors in Phase 1.
    // No route here lets anyone act as, or log in as, another employee.
    Route::post('/applications/reassign-planning-officer', [WorkReassignmentController::class, 'reassignPlanningOfficer'])
        ->name('applications.reassign-planning-officer')
        ->middleware('role:Admin');

    Route::post('/site-inspections/reassign-inspector', [WorkReassignmentController::class, 'reassignInspector'])
        ->name('site-inspections.reassign-inspector')
        ->middleware('role:Planning Officer');

    Route::get('/work-reassignment/reasons', [WorkReassignmentController::class, 'reasons'])
        ->name('work-reassignment.reasons')
        ->middleware('role:Admin,Planning Officer');

    // ── Notifications ──
    Route::get('/notifications', [NotificationController::class, 'index'])->name('notifications.index');
    Route::get('/api/notifications', [NotificationController::class, 'getUnread'])->name('api.notifications.unread');
    Route::post('/notifications/{id}/read', [NotificationController::class, 'markAsRead'])->name('notifications.read');
    Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllAsRead'])->name('notifications.mark-all-read');
    Route::delete('/notifications/clear-all', [NotificationController::class, 'clearAll'])->name('notifications.clear-all');
    Route::delete('/notifications/{id}', [NotificationController::class, 'destroy'])->name('notifications.destroy');

});

// ── Admin-Only Routes (Loop 6: preserved Admin-only; not broadened to Planning Officer) ──
Route::middleware(['auth', 'role:Admin'])->group(function () {

    // Override Default Registration to be Admin-Only
    Route::get('register-new-account', [RegisteredUserController::class, 'create'])->name('register');
    Route::post('register-new-account', [RegisteredUserController::class, 'store']);

    // ── Standard Reports ──
    Route::get('/reports', [ReportController::class, 'index'])->name('reports.index');
    Route::post('/api/analytics/report/preview', [ReportController::class, 'previewReport'])->name('reports.preview');
    Route::post('/api/analytics/report', [ReportController::class, 'generateReport'])->name('reports.generate');

    // ── LOOP 9E/9F: Admin triage of FieldSync inspector diagnostic reports ──
    // READ ONLY. A FieldSync Site Inspector submits a support issue into the
    // REMOTE `diagnostic_reports` table; this is the missing iMAPS Admin half of
    // that path. It is NOT delivery monitoring (that is 9D, on local PostgreSQL)
    // and it shares no vocabulary with the delivery state machine.
    //
    // GET ONLY, deliberately. There is no POST, PATCH or DELETE here: the loop
    // contract is read-only, an Admin may not change a report's status, and the
    // remote table's only writer remains the FieldSync client. Adding a mutation
    // route later would be new scope, not an extension of this one.
    //
    // `role:Admin` is the WHOLE boundary and it is real: RoleMiddleware compares
    // the canonical role string exactly and aborts 403. A Planning Officer or a
    // Site Inspector using iMAPS is refused, and a guest is sent to login by the
    // surrounding `auth` group.
    //
    // PLACEMENT. Appended after the standard reports block and before settings,
    // using the inline FQCN form already used elsewhere in this file so no import
    // is added to a file origin/master also edits. This file is a KNOWN
    // upstream-contested merge point, so the patch is additive and self-contained.
    Route::get('/diagnostics', [\App\Http\Controllers\DiagnosticReportController::class, 'index'])
        ->name('diagnostics.index')
        ->middleware('role:Admin');

    Route::get('/diagnostics/{report}', [\App\Http\Controllers\DiagnosticReportController::class, 'show'])
        ->name('diagnostics.show')
        ->middleware('role:Admin');

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