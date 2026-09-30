<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class AuthenticatedSessionController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('Auth/Login', [
            'canResetPassword' => Route::has('password.request'),
            'status' => session('status'),
        ]);
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        $user = User::where('email', $request->email)->first();

        // 1. Prevent login if the account is already blocked
        if ($user && !$user->is_active) {
            throw ValidationException::withMessages([
                'email' => 'Your account has been deactivated. Please contact an administrator.',
            ]);
        }

        $throttleKey = Str::transliterate(Str::lower($request->input('email')).'|'.$request->ip());

        // 2. Attempt authentication.
        //
        // ── Loop 6 — Site Inspector iMAPS web access gate (Leader-approved) ──
        // attemptWhen() proves the credentials FIRST: the installed
        // SessionGuard runs this callback only after hasValidCredentials()
        // passes and BEFORE any password rehash, session establishment, or
        // remember-token handling can occur. Returning false fails the
        // attempt itself (no login(), no rehash, no session, no users-row
        // write). Invalid credentials never execute the callback, so they
        // keep the ordinary invalid-credentials response below and never
        // reveal the FieldSync role guidance to a caller whose password did
        // not verify.
        $siteInspectorRejected = false;

        if (! Auth::attemptWhen(
            $request->only('email', 'password'),
            function ($attemptedUser) use (&$siteInspectorRejected) {
                if ($attemptedUser instanceof User && $attemptedUser->role === 'Site Inspector') {
                    $siteInspectorRejected = true;

                    return false;
                }

                return true;
            },
            $request->boolean('remember')
        )) {
            if ($siteInspectorRejected) {
                // Credentials verified + Site Inspector role: a role rejection,
                // not a failed password. Clear the failure counter exactly as
                // any credential-valid attempt always has, then reject with
                // user-facing FieldSync guidance. No authenticated session was
                // ever established, so there is nothing to tear down and no
                // account state to restore.
                RateLimiter::clear($throttleKey);

                throw ValidationException::withMessages([
                    'email' => 'Site Inspectors use FieldSync for site inspection activities.',
                ]);
            }

            RateLimiter::hit($throttleKey);
            $attempts = RateLimiter::attempts($throttleKey);

            // 3. Block account on the 5th failed attempt
            if ($attempts >= 5) {
                if ($user) {
                    $user->is_active = false;
                    $user->save();
                }
                
                RateLimiter::clear($throttleKey);

                throw ValidationException::withMessages([
                    'email' => 'Security Alert: Your account has been permanently blocked due to 5 failed login attempts. Contact an admin to restore access.',
                ]);
            }

            // Show remaining attempts
            $attemptsLeft = 5 - $attempts;
            throw ValidationException::withMessages([
                'email' => trans('auth.failed') . " You have {$attemptsLeft} attempt(s) remaining.",
            ]);
        }

        // 4. On success: clear failures and update timestamp
        RateLimiter::clear($throttleKey);

        $request->session()->regenerate();

        $authUser = Auth::user();

        if ($authUser instanceof User) {
            $authUser->last_login = now();
            $authUser->save();
        }

        return redirect()->intended(route('dashboard', absolute: false));
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}