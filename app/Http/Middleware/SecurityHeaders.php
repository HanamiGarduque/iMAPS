<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Vite;
use Symfony\Component\HttpFoundation\Response;

/**
 * Browser-side hardening headers on every response.
 *
 * Always sent: nosniff, clickjacking protection (same-origin framing only, the
 * permit PDF preview is a same-origin iframe), a strict referrer policy and a
 * Permissions-Policy that switches off features the app never uses. HSTS is sent
 * only over HTTPS (trustProxies makes isSecure() correct behind Cloudflare).
 *
 * Content-Security-Policy is controlled by CSP_MODE: `report-only` (default, the
 * browser logs violations to the console and blocks nothing), `enforce`, or `off`.
 * Check the console on the login page and the map pages in report-only mode before
 * switching to `enforce`. It is skipped while the Vite dev server runs, whose
 * origin changes per machine. Headers a controller already set are left alone.
 *
 * script-src keeps 'unsafe-inline' because the login splash and Inertia boot code
 * are inline; moving them to a nonce is the next tightening step.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        $headers = $response->headers;

        $defaults = [
            'X-Content-Type-Options' => 'nosniff',
            'X-Frame-Options' => 'SAMEORIGIN',
            'Referrer-Policy' => 'strict-origin-when-cross-origin',
            'Permissions-Policy' => 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        ];

        if ($request->isSecure() && ($maxAge = (int) config('app.hsts_max_age')) > 0) {
            $defaults['Strict-Transport-Security'] = "max-age={$maxAge}";
        }

        foreach ($defaults as $name => $value) {
            if (! $headers->has($name)) {
                $headers->set($name, $value);
            }
        }

        $mode = config('app.csp_mode');

        if (in_array($mode, ['enforce', 'report-only'], true) && ! Vite::isRunningHot()) {
            $name = $mode === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';

            if (! $headers->has($name)) {
                $headers->set($name, $this->policy());
            }
        }

        return $response;
    }

    private function policy(): string
    {
        $supabase = $this->supabaseOrigin();

        $tiles = 'https://tile.openstreetmap.org https://*.tile.openstreetmap.org '
            .'https://services.arcgisonline.com https://static-map-tiles-api.arcgis.com';

        $directives = [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' data: https://fonts.gstatic.com",
            "img-src 'self' data: blob: {$tiles} {$supabase}",
            "connect-src 'self' {$tiles} https://challenges.cloudflare.com {$supabase}".($supabase ? ' '.str_replace('https://', 'wss://', $supabase) : ''),
            "worker-src 'self' blob:",
            "frame-src 'self' blob: https://challenges.cloudflare.com",
            "object-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
        ];

        return implode('; ', $directives);
    }

    /** The Supabase project origin (images, realtime, REST), or '' when not configured. */
    private function supabaseOrigin(): string
    {
        $url = (string) config('services.supabase.url');
        $parts = parse_url($url);

        if (! isset($parts['scheme'], $parts['host']) || $parts['scheme'] !== 'https') {
            return '';
        }

        return $parts['scheme'].'://'.$parts['host'];
    }
}
