<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * Office-only access without Cloudflare: refuse any client IP not in ALLOWED_IPS
 * (comma-separated, CIDR ranges allowed). Disabled when ALLOWED_IPS is unset;
 * /ping stays open for Railway's healthcheck. Blocked IPs are logged so the
 * address the app actually sees can be copied into ALLOWED_IPS.
 */
class RestrictToAllowedIps
{
    public function handle(Request $request, Closure $next)
    {
        $allowed = config('app.allowed_ips');

        if ($allowed && ! $request->is('ping') && ! IpUtils::checkIp((string) $request->ip(), $allowed)) {
            Log::warning('Blocked by ALLOWED_IPS', ['ip' => $request->ip()]);
            abort(403);
        }

        return $next($request);
    }
}
