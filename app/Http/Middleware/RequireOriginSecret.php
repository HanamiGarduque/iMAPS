<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Cloudflare adds X-Origin-Secret to every proxied request. Anything that reaches
 * Railway without it bypassed Cloudflare (and its IP allowlist), so refuse it.
 * Disabled when ORIGIN_SECRET is unset; /ping stays open for Railway's healthcheck.
 */
class RequireOriginSecret
{
    public function handle(Request $request, Closure $next)
    {
        $secret = (string) config('app.origin_secret');

        if ($secret !== '' && ! $request->is('ping')
            && ! hash_equals($secret, (string) $request->header('X-Origin-Secret'))) {
            abort(403);
        }

        return $next($request);
    }
}
