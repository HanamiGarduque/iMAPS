<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\TaxMapLookupController;


Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

Route::get('/tax-map/lookup/{pin}', [TaxMapLookupController::class, 'lookup']);
Route::post('/analytics/report/preview', [App\Http\Controllers\AnalyticsController::class, 'previewReport'])->name('analytics.report.preview');
Route::post('/analytics/report', [App\Http\Controllers\AnalyticsController::class, 'generateReport'])->name('analytics.report');
