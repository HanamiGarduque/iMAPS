<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

// Loop 6: the tax-map lookup endpoint is NOT registered here. It lives in
// routes/web.php behind the session guard plus role:Admin,Planning Officer.
// This stateless group must never expose it, so the controller is not
// imported in this file.

Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware(['auth:sanctum', App\Http\Middleware\EnsureUserIsActive::class]);

