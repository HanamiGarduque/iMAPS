<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use App\Http\Middleware\RoleMiddleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )

    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->validateCsrfTokens(except: [
            'logout',
        ]);

        $middleware->web(append: [
            \App\Http\Middleware\HandleInertiaRequests::class,
            \Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets::class,
        ]);

        $middleware->alias([
            'role' => RoleMiddleware::class,
        ]);
    })

    ->withExceptions(function (Exceptions $exceptions): void {
        // A background fetch() from an expired session must not redirect:
        // that stores its JSON URL as url.intended, and the next login lands
        // on raw JSON ("must receive a valid Inertia response"). Page visits
        // (Inertia or real navigation) still redirect to login as before.
        $exceptions->render(function (AuthenticationException $e, Request $request) {
            $mode = $request->header('Sec-Fetch-Mode');

            if (! $request->header('X-Inertia') && $mode && $mode !== 'navigate') {
                return response()->json(['message' => 'Unauthenticated.'], 401);
            }
        });

        $exceptions->respond(function (Response $response, Throwable $exception, Request $request) {
            if ($response->getStatusCode() === 419) {
                // An expired session means the user is already signed out; bouncing "back"
                // to the same stale page made Sign Out look like it did nothing.
                if ($request->is('logout')) {
                    return redirect()->route('login');
                }

                return back()->with([
                    'message' => 'The page expired, please try again.',
                ]);
            }
            return $response;
        });
    })

    ->create();