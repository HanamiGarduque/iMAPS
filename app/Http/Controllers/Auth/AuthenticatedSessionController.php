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

        // 2. Attempt authentication
        if (! Auth::attempt($request->only('email', 'password'), $request->boolean('remember'))) {
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