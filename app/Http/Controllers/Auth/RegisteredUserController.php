<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Illuminate\Validation\Rules;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class RegisteredUserController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('Auth/Register');
    }

    public function store(Request $request): RedirectResponse
    {
        if (is_string($request->email)) {
            $request->merge(['email' => Str::lower(trim($request->email))]);
        }

        $request->validate([
            'name'    => 'required|string|max:255',
            'email'    => 'required|string|lowercase|email|max:255|unique:' . User::class,
            'role'     => 'required|in:Admin,Planning Officer,Site Inspector',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $handshakeKey = Str::random(60);
        $phtTimestamp = now('Asia/Manila')->format('Y-m-d H:i:s');
        $supabaseUserId = null;

        if ($request->role === 'Site Inspector') {
            $supabaseUrl = config('services.supabase.url');
            $supabaseKey = config('services.supabase.service_key');

            $stage = 'AUTH_CREATE';
            try {
                $authResponse = Http::withHeaders([
                    'apikey'        => $supabaseKey,
                    'Authorization' => 'Bearer ' . $supabaseKey,
                ])->timeout(12)->post("{$supabaseUrl}/auth/v1/admin/users", [
                    'email'         => $request->email,
                    'password'      => $request->password,
                    'email_confirm' => true,
                ]);
                $createdId = $authResponse->json('id');
                if (!$authResponse->successful() || !is_string($createdId) || !Str::isUuid($createdId)) {
                    throw new \RuntimeException('Auth creation unverified.');
                }
                $supabaseUserId = $createdId;
                $stage = 'PROFILE_VERIFY';
                sleep(1);

                $profileResponse = Http::withHeaders([
                    'apikey'        => $supabaseKey,
                    'Authorization' => 'Bearer ' . $supabaseKey,
                    'Content-Type'  => 'application/json',
                    'Prefer'        => 'return=representation',
                ])->timeout(12)->patch("{$supabaseUrl}/rest/v1/profiles?id=eq.{$supabaseUserId}", [
                    'full_name'     => $request->name,
                    'role'          => 'inspector',
                    'handshake_key' => $handshakeKey,
                    'created_at'    => $phtTimestamp,
                    'updated_at'    => $phtTimestamp,
                ]);

                $rows = $profileResponse->json();
                $profile = is_array($rows) && array_is_list($rows) && count($rows) === 1 ? $rows[0] : null;
                if (!$profileResponse->successful() || !is_array($profile)
                    || ($profile['id'] ?? null) !== $supabaseUserId
                    || ($profile['role'] ?? null) !== 'inspector'
                    || ($profile['handshake_key'] ?? null) !== $handshakeKey
                    || ($profile['full_name'] ?? null) !== $request->name
                    || trim($request->name) === '') {
                    throw new \RuntimeException('Profile verification failed.');
                }
            } catch (\Throwable $error) {
                Log::error('Inspector provisioning failed.', [
                    'PROVISIONING_STAGE' => $stage,
                    'auth_user_id' => $supabaseUserId,
                ]);
                throw ValidationException::withMessages([
                    'email' => $stage === 'PROFILE_VERIFY'
                        ? 'The remote identity was created, but its inspector profile could not be verified. Contact the administrator before retrying.'
                        : 'Remote identity creation could not be confirmed. Contact the administrator before retrying.',
                ]);
            }
        }

        try {
            $user = User::create([
                'name'          => $request->name,
                'email'         => $request->email,
                'role'          => $request->role,
                'password'      => Hash::make($request->password),
                'handshake_key' => $handshakeKey,
            ]);
        } catch (\Throwable $error) {
            if ($supabaseUserId === null) throw $error;
            Log::error('Inspector provisioning failed.', [
                'PROVISIONING_STAGE' => 'LOCAL_CREATE',
                'auth_user_id' => $supabaseUserId,
            ]);
            throw ValidationException::withMessages([
                'email' => 'The remote inspector account was verified, but the local account could not be completed. Contact the administrator before retrying.',
            ]);
        }

        \App\Models\AppNotification::notifyRoles(
            ['Admin'],
            'New User Registered',
            "New account created for {$user->name} ({$user->email}) with role {$user->role}.",
            'user_registered',
            '/users'
        );

        event(new Registered($user));

        return back()->with('success', 'User account successfully provisioned!');
    }
}
