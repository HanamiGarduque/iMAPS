<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\IpUtils;

/**
 * Office-only access: refuse any client IP not in ALLOWED_IPS (comma-separated,
 * CIDR ranges allowed). Disabled when ALLOWED_IPS is unset; /ping stays open for
 * Railway's healthcheck. Blocked IPs are logged so the address the app actually
 * sees can be copied into ALLOWED_IPS.
 *
 * Works with or without Cloudflare: RequireOriginSecret runs first and, once the
 * secret checks out, replaces X-Forwarded-For with CF-Connecting-IP, so the walk
 * below finds the visitor rather than a Cloudflare edge server.
 */
class RestrictToAllowedIps
{
    public function handle(Request $request, Closure $next)
    {
        $allowed = config('app.allowed_ips');

        if ($allowed && ! $request->is('ping')) {
            $ip = $this->clientIp($request);

            if (! IpUtils::checkIp($ip, $allowed)) {
                Log::warning('Blocked by ALLOWED_IPS', ['ip' => $ip]);
                abort(403);
            }
        }

        return $next($request);
    }

    /**
     * Railway reaches the app through internal proxies (100.64.0.0/10), so
     * $request->ip() is a proxy. Walk X-Forwarded-For from the right (the part
     * Railway wrote, which a visitor cannot forge) and take the first address
     * that is not internal infrastructure.
     */
    private function clientIp(Request $request): string
    {
        $chain = array_reverse(array_map('trim', explode(',', (string) $request->header('X-Forwarded-For'))));

        foreach ($chain as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP) && ! IpUtils::isPrivateIp($ip)) {
                return $ip;
            }
        }

        return (string) $request->ip();
    }
}
