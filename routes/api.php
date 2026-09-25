<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Loop 6: /api/tax-map/lookup/{pin} moved to routes/web.php (session-backed,
// auth + role:Admin,Planning Officer). Its only caller is the internal
// application encode form; the public portal does not depend on it.


Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');
