<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
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
        $request->validate([
            'name'     => 'required|string|max:255',
            'email'    => 'required|string|lowercase|email|max:255|unique:' . User::class,
            'role'     => 'required|in:Admin,Planning Officer,Site Inspector',
            'password' => ['required', 'confirmed', Rules\Password::defaults()],
        ]);

        $handshakeKey = Str::random(60); 
        $phtTimestamp = now('Asia/Manila')->format('Y-m-d H:i:s'); 

        if ($request->role === 'Site Inspector') {
            $supabaseUrl = config('services.supabase.url');
            $supabaseKey = config('services.supabase.service_key');

            $authResponse = Http::withHeaders([
                'apikey'        => $supabaseKey,
                'Authorization' => 'Bearer ' . $supabaseKey,
            ])->post("{$supabaseUrl}/auth/v1/admin/users", [
                'email'         => $request->email,
                'password'      => $request->password,
                'email_confirm' => true,
            ]);

            $supabaseUserId = $authResponse->json('id');

            if ($authResponse->successful() && $supabaseUserId) {
                
                // 1. Pause execution for 1 second to let the Supabase trigger finish
                sleep(1); 

                // 2. Patch the existing row created by the trigger
                $profileResponse = Http::withHeaders([
                    'apikey'        => $supabaseKey,
                    'Authorization' => 'Bearer ' . $supabaseKey,
                    'Content-Type'  => 'application/json',
                ])->patch("{$supabaseUrl}/rest/v1/profiles?id=eq.{$supabaseUserId}", [
                    'full_name'     => $request->name,
                    'role'          => 'inspector',
                    'handshake_key' => $handshakeKey,
                    'created_at'    => $phtTimestamp, 
                    'updated_at'    => $phtTimestamp,
                ]);

                // 3. Throw a hard error to the frontend if the update STILL fails
                if (!$profileResponse->successful()) {
                    throw ValidationException::withMessages([
                        'email' => 'User created in Auth, but Profile sync failed: ' . $profileResponse->body(),
                    ]);
                }

            } else {
                throw ValidationException::withMessages([
                    'email' => 'Failed to register user in Supabase Auth: ' . ($authResponse->json('msg') ?? $authResponse->body()),
                ]);
            }
        }

        $user = User::create([
            'name'          => $request->name,
            'email'         => $request->email,
            'role'          => $request->role,    
            'password'      => Hash::make($request->password),
            'handshake_key' => $handshakeKey, 
        ]);

        event(new Registered($user));

        return back()->with('success', 'User account successfully provisioned!');
    }
}