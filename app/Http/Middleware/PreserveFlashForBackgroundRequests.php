<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Flash data lives for exactly one request. A background fetch() that lands
 * between a redirect and the page it leads to (the header's notification poll,
 * a map layer, a draft autosave) would use up that one request, so the page
 * arrives without its flash: the encoding form then reported "Submission not
 * confirmed" for an application that had been saved.
 *
 * Background requests never render flash, so they leave it for the next page:
 * the flash they found is kept for one more request. Flash they set themselves
 * ages normally. Page visits (Inertia or a real navigation) consume flash as
 * before. Same request classification as the authentication handler in
 * bootstrap/app.php.
 */
class PreserveFlashForBackgroundRequests
{
    public function handle(Request $request, Closure $next)
    {
        $response = $next($request);

        if ($this->isBackground($request) && $request->hasSession()) {
            $session = $request->session();
            $session->keep($session->get('_flash.old', []));
        }

        return $response;
    }

    private function isBackground(Request $request): bool
    {
        $mode = $request->header('Sec-Fetch-Mode');

        return ! $request->header('X-Inertia') && $mode && $mode !== 'navigate';
    }
}
