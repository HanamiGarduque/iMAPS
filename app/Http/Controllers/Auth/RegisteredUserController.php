<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Auth\Events\Registered;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
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

                // The profile row is created remotely right after the auth user, so it may not exist yet:
                // retry briefly instead of always sleeping.
                $profile = null;
                for ($attempt = 0; $attempt < 4 && !$profile; $attempt++) {
                    if ($attempt > 0) usleep(300000);

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
                    $profile = $profileResponse->successful() && is_array($rows) && array_is_list($rows) && count($rows) === 1 ? $rows[0] : null;
                }

                if (!$profileResponse->successful() || !is_array($profile)
                    || ($profile['id'] ?? null) !== $supabaseUserId
                    || ($profile['role'] ?? null) !== 'inspector'
                    || ($profile['handshake_key'] ?? null) !== $handshakeKey
                    || ($profile['full_name'] ?? null) !== $request->name
                    || trim($request->name) === '') {
                    throw new \RuntimeException('Profile verification failed.');
                }
            } catch (\Throwable $error) {
                $removed = $supabaseUserId !== null && $this->deleteRemoteAccount($supabaseUserId);
                Log::error('Inspector provisioning failed.', [
                    'PROVISIONING_STAGE' => $stage,
                    'auth_user_id' => $supabaseUserId,
                    'remote_account_removed' => $removed,
                ]);
                throw ValidationException::withMessages([
                    'email' => match (true) {
                        $removed => 'The inspector account could not be completed and the partial remote account was removed. You can try again.',
                        $supabaseUserId !== null => 'The remote identity was created, but its inspector profile could not be verified and could not be removed. Contact the administrator before retrying.',
                        default => 'Remote identity creation could not be confirmed. Contact the administrator before retrying.',
                    },
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
            $removed = $this->deleteRemoteAccount($supabaseUserId);
            Log::error('Inspector provisioning failed.', [
                'PROVISIONING_STAGE' => 'LOCAL_CREATE',
                'auth_user_id' => $supabaseUserId,
                'remote_account_removed' => $removed,
            ]);
            throw ValidationException::withMessages([
                'email' => $removed
                    ? 'The local account could not be completed and the remote inspector account was removed. You can try again.'
                    : 'The remote inspector account was verified, but the local account could not be completed and the remote account could not be removed. Contact the administrator before retrying.',
            ]);
        }

        DB::table('audit_trail')->insert([
            'application_id' => 0,
            'action' => 'User Account Created',
            'performed_by' => $request->user()->id,
            'note' => "Created {$user->role} account #{$user->id} for {$user->name} ({$user->email})",
            'performed_at' => now(),
        ]);

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

    // Best-effort rollback of a half-created inspector: without it the email stays taken in Supabase
    // and every retry fails. A 404 counts as removed (already gone).
    private function deleteRemoteAccount(string $supabaseUserId): bool
    {
        try {
            $key = config('services.supabase.service_key');
            $response = Http::withHeaders(['apikey' => $key, 'Authorization' => 'Bearer ' . $key])
                ->timeout(12)
                ->delete(config('services.supabase.url') . "/auth/v1/admin/users/{$supabaseUserId}");

            return $response->successful() || $response->status() === 404;
        } catch (\Throwable $e) {
            return false;
        }
    }
}
