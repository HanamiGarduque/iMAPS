<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
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
            'status' => session('status'),
            // Public by design; null turns the Turnstile widget off.
            'turnstileSiteKey' => $this->turnstileEnabled() ? config('services.turnstile.site_key') : null,
        ]);
    }

    public function store(LoginRequest $request): RedirectResponse
    {
        $throttleKey = $request->throttleKey();

        // Cloudflare Turnstile runs before anything touches the credentials or the lockout counter,
        // so a failed or missing check never costs the real user a login attempt.
        if ($this->turnstileEnabled() && ! $this->turnstilePasses($request)) {
            throw ValidationException::withMessages([
                'email' => 'Please complete the security check and try again.',
            ]);
        }

        // Temporary, per email+IP lockout. The account itself is never deactivated: anyone who
        // knows an email address could otherwise lock that person (or every admin) out for good.
        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            $this->throwLockedOut($throttleKey);
        }

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
        $deactivated = false;

        if (! Auth::attemptWhen(
            $request->only('email', 'password'),
            function ($attemptedUser) use (&$siteInspectorRejected, &$deactivated) {
                // Deactivation is only revealed once the password has been verified (this callback
                // never runs for a wrong password), so the login page can't be used to probe which
                // emails belong to deactivated accounts.
                if ($attemptedUser instanceof User && !$attemptedUser->is_active) {
                    $deactivated = true;

                    return false;
                }

                if ($attemptedUser instanceof User && $attemptedUser->role === 'Site Inspector') {
                    $siteInspectorRejected = true;

                    return false;
                }

                return true;
            }
        )) {
            if ($deactivated) {
                RateLimiter::clear($throttleKey);

                throw ValidationException::withMessages([
                    'email' => 'Your account has been deactivated. Please contact an administrator.',
                ]);
            }

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

            RateLimiter::hit($throttleKey, 900);
            $attempts = RateLimiter::attempts($throttleKey);

            // 3. Block further attempts from this email+IP for 15 minutes on the 5th failure
            if ($attempts >= 5) {
                $this->throwLockedOut($throttleKey);
            }

            // Show remaining attempts
            $attemptsLeft = 5 - $attempts;
            throw ValidationException::withMessages([
                // The same hint goes to every wrong-password response, so a legitimately deactivated user
                // knows where to look without the page revealing which emails are deactivated.
                'email' => 'Incorrect email or password. ' . $attemptsLeft . ' ' . Str::plural('attempt', $attemptsLeft) . ' left.'
                    . ' Still locked out? Contact an administrator.',
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

        // Always land on Maps; drop any pre-login URL so it can't resurface later.
        $request->session()->forget('url.intended');

        return redirect(route('maps', absolute: false));
    }

    private function turnstileEnabled(): bool
    {
        return filled(config('services.turnstile.site_key')) && filled(config('services.turnstile.secret_key'));
    }

    private function turnstilePasses(Request $request): bool
    {
        $token = $request->input('cf-turnstile-response');

        if (! is_string($token) || $token === '') {
            return false;
        }

        try {
            $response = Http::asForm()->timeout(5)->post('https://challenges.cloudflare.com/turnstile/v0/siteverify', [
                'secret' => config('services.turnstile.secret_key'),
                'response' => $token,
                'remoteip' => $request->ip(),
            ]);
        } catch (\Throwable) {
            return false;
        }

        return $response->successful() && $response->json('success') === true;
    }

    // retry_after (seconds) lets the login page show a live countdown; the email message is the plain-text fallback.
    private function throwLockedOut(string $throttleKey): never
    {
        $seconds = RateLimiter::availableIn($throttleKey);

        throw ValidationException::withMessages([
            'email' => 'Too many failed login attempts. Try again in ' . ceil($seconds / 60) . ' minute(s).',
            'retry_after' => (string) $seconds,
        ]);
    }

    public function destroy(Request $request): RedirectResponse
    {
        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect()->route('login');
    }
}