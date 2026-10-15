<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Cloudflare adds X-Origin-Secret to every proxied request. Anything that reaches
 * Railway without it bypassed Cloudflare (and its IP allowlist), so refuse it.
 * Disabled when ORIGIN_SECRET is unset; /ping stays open for Railway's healthcheck.
 *
 * A request that passes the secret check provably came through Cloudflare, so its
 * CF-Connecting-IP is trustworthy and replaces X-Forwarded-For (which Cloudflare only
 * appends to, so a visitor can forge the leftmost entries). Rate limits and the login
 * lockout key off the client IP and would otherwise be bypassable with a forged header.
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

        if ($secret !== '') {
            $clientIp = (string) $request->header('CF-Connecting-IP');

            if (filter_var($clientIp, FILTER_VALIDATE_IP)) {
                $request->headers->set('X-Forwarded-For', $clientIp);
            }
        }

        return $next($request);
    }
}
