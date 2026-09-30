<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class RoleMiddleware
{
    /**
     * Handle an incoming request.
     *
     * Accepts one or more canonical role strings via variadic middleware parameters.
     * Laravel passes `middleware('role:Admin,Planning Officer')` as two separate
     * arguments, so a single `string $role` parameter silently drops every role
     * after the first. The variadic signature below receives all of them:
     *   role:Admin                → $roles = ['Admin']
     *   role:Planning Officer     → $roles = ['Planning Officer']
     *   role:Admin,Planning Officer → $roles = ['Admin', 'Planning Officer']
     *
     * Authorization passes only when a request is authenticated AND the
     * authenticated user's role exactly matches (case-sensitive, no aliases,
     * no normalization) at least one of the supplied roles.
     *
     * Canonical role strings:
     *   'Admin'
     *   'Planning Officer'
     *   'Site Inspector'
     *
     * Unauthenticated requests follow the normal Laravel authentication
     * behavior (redirect to the login route). Authenticated requests whose
     * role is not authorized receive 403.
     */
    public function handle(Request $request, Closure $next, string ...$roles): Response
    {
        if (! Auth::check()) {
            return redirect()->route('login');
        }

        if (! in_array(Auth::user()->role, $roles, true)) {
            abort(403);
        }

        return $next($request);
    }
}
