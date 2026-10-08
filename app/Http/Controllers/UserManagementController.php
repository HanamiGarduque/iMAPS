<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Http;
use App\Models\AppNotification;
use App\Models\AuditTrail;
use Illuminate\Validation\Rule;
use Inertia\Inertia;

class UserManagementController extends Controller
{
   public function index(Request $request)
    {
        $search = $request->input('search');
        $role = $request->input('role');

        // 1. Fetch users from the local database (including handshake_key)
        $users = DB::table('users')
            ->select('id', 'name', 'email', 'role', 'is_active', 'last_login', 'created_at', 'handshake_key')
            ->selectSub(function ($query) {
                $query->selectRaw('COUNT(*)')
                      ->from('zoning_applications')
                      ->whereColumn('zoning_applications.encoded_by', 'users.id');
            }, 'encoded_applications_count')
            ->when($search, function ($query, $search) {
                $query->where(function($q) use ($search) {
                    $q->where('name', 'ilike', "%{$search}%")
                      ->orWhere('email', 'ilike', "%{$search}%");
                });
            })
            ->when($role, function ($query, $role) {
                $query->where('role', $role);
            })
            ->orderBy('created_at', 'desc')
            ->paginate(10)
            ->withQueryString();

        // 2. Extract Handshake Keys for Site Inspectors
        $inspectors = collect($users->items())->where('role', 'Site Inspector');
        $handshakeKeys = $inspectors->pluck('handshake_key')->filter()->toArray();

        $planningOfficers = collect($users->items())->where('role', 'Planning Officer');
        $poIds = $planningOfficers->pluck('id')->toArray();

        // 3. Fetch metrics from Supabase REST API matched via handshake_key
        $inspectorStats = [];
        if (!empty($handshakeKeys)) {
            try {
                $supabaseUrl = rtrim(config('services.supabase.url'), '/');
                $supabaseKey = config('services.supabase.service_key');

                // Short timeouts: stats are a bonus, so a slow Supabase must not hold the page for the 30s default.
                $supabase = Http::withHeaders([
                    'apikey' => $supabaseKey,
                    'Authorization' => 'Bearer ' . $supabaseKey,
                ])->connectTimeout(2)->timeout(5);

                // Query Supabase profiles filtered by handshake_key to get their Supabase UUIDs first
                $profileResponse = $supabase->get($supabaseUrl . '/rest/v1/profiles', [
                    'select' => 'id,handshake_key',
                    'handshake_key' => 'in.(' . implode(',', $handshakeKeys) . ')'
                ]);

                if ($profileResponse->successful()) {
                    $profiles = collect($profileResponse->json());
                    $supabaseUuids = $profiles->pluck('id')->filter()->toArray();

                    if (!empty($supabaseUuids)) {
                        // Query field jobs using the matched Supabase UUIDs
                        $jobResponse = $supabase->get($supabaseUrl . '/rest/v1/field_jobs', [
                            'select' => 'assigned_inspector_id,status,is_self_scheduled,is_compliant,rework_started_at,photo_count,checklist_total_count,checklist_completed_count',
                            'assigned_inspector_id' => 'in.(' . implode(',', $supabaseUuids) . ')'
                        ]);

                        if ($jobResponse->successful()) {
                            $fieldJobs = collect($jobResponse->json());

                            foreach ($inspectors as $inspector) {
                                // Match local inspector to Supabase profile via handshake_key
                                $matchingProfile = $profiles->firstWhere('handshake_key', $inspector->handshake_key);
                                
                                if ($matchingProfile) {
                                    $supabaseUuid = $matchingProfile['id'];
                                    $jobs = $fieldJobs->where('assigned_inspector_id', $supabaseUuid);
                                    $total = $jobs->count();
                                    
                                    if ($total > 0) {
                                        $inspectorStats[$inspector->id] = [
                                            'total_caseload' => $total,
                                            'status' => [
                                                'pending' => $jobs->where('status', 'assigned')->count(),
                                                'in_progress' => $jobs->where('status', 'in_progress')->count(),
                                                'completed' => $jobs->where('status', 'completed')->count(),
                                            ],
                                            'initiative_rate' => round(($jobs->where('is_self_scheduled', true)->count() / $total) * 100),
                                            'compliance_rate' => round(($jobs->where('is_compliant', true)->count() / $total) * 100),
                                            'rework_frequency' => $jobs->whereNotNull('rework_started_at')->count(),
                                            'avg_photos' => round($jobs->avg('photo_count') ?? 0, 1),
                                            'checklist_accuracy' => $jobs->sum('checklist_total_count') > 0 
                                                ? round(($jobs->sum('checklist_completed_count') / $jobs->sum('checklist_total_count')) * 100) 
                                                : 0,
                                        ];
                                    }
                                }
                            }
                        }
                    }
                } else {
                    \Illuminate\Support\Facades\Log::error('Supabase Profile API Error: ' . $profileResponse->body());
                }
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::error('Supabase Exception: ' . $e->getMessage());
            }
        }

        // 4. Fetch Planning Officer stats from local DB
        $poStats = [];
        if (!empty($poIds)) {
            $apps = DB::table('zoning_applications')
                ->whereIn('encoded_by', $poIds)
                ->get();

            foreach ($poIds as $poId) {
                $userApps = $apps->where('encoded_by', $poId);

                $totalFees = $userApps->sum('assessment_fee');
                $barangayCounts = $userApps->whereNotNull('barangay')->where('barangay', '!=', '')->countBy('barangay')->sortDesc();
                $topBarangay = $barangayCounts->keys()->first() ?? 'N/A';
                $byMonth = $userApps->countBy(fn ($a) => substr((string) $a->created_at, 0, 7));
                $trend = collect(range(5, 0))->map(function ($i) use ($byMonth) {
                    $m = now()->startOfMonth()->subMonths($i);

                    return ['label' => $m->format('M'), 'count' => $byMonth[$m->format('Y-m')] ?? 0];
                })->values();

                $types = [
                    'locational' => $userApps->where('application_type', 'Locational Clearance')->count(),
                    'development' => $userApps->where('application_type', 'Development Permit')->count(),
                    // Stored as "Zoning Certificate" or legacy "Zoning Certification", often inside a comma-separated multi-type value.
                    'zoning' => $userApps->filter(fn ($a) => str_contains((string) $a->application_type, 'Zoning Certific'))->count(),
                    'special' => $userApps->where('application_type', 'Preliminary Approval and Locational Clearance (PALC)')->count(),
                ];

                $status = [
                    'released' => $userApps->where('status', 'Released')->count(),
                    'pending' => $userApps->whereIn('status', ['Received', 'Technical Review', 'Under Sangguniang Bayan', 'For Release'])->count(),
                    'denied' => $userApps->where('status', 'Denied')->count(),
                ];

                $poStats[$poId] = [
                    'total_fees' => '₱' . number_format($totalFees, 2),
                    'top_barangay' => $topBarangay,
                    'top_barangays' => $barangayCounts->take(3)->map(fn ($c, $b) => ['name' => $b, 'count' => $c])->values(),
                    'last_encoded_at' => $userApps->max('created_at'),
                    'this_month' => $trend->last()['count'],
                    'trend' => $trend,
                    'recent' => $userApps->sortByDesc('created_at')->take(5)->map(fn ($a) => [
                        'id' => $a->id,
                        'reference_number' => $a->reference_number,
                        'applicant_name' => $a->applicant_name,
                        'application_type' => $a->application_type,
                        'status' => $a->status,
                        'created_at' => $a->created_at,
                    ])->values(),
                    'types' => $types,
                    'status' => $status,
                ];
            }
        }

        // 5. Map stats back to frontend object
        foreach ($users->items() as $user) {
            if ($user->role === 'Site Inspector') {
                $user->inspector_stats = $inspectorStats[$user->id] ?? [
                    'total_caseload' => 0, 
                    'status' => ['pending' => 0, 'in_progress' => 0, 'completed' => 0],
                    'initiative_rate' => 0, 'compliance_rate' => 0, 'rework_frequency' => 0, 
                    'avg_photos' => 0, 'checklist_accuracy' => 0
                ];
            }

            if ($user->role === 'Planning Officer') {
                $user->stats = $poStats[$user->id] ?? [
                    'total_fees' => '₱0.00',
                    'top_barangay' => 'N/A',
                    'top_barangays' => [], 'last_encoded_at' => null, 'this_month' => 0, 'trend' => [], 'recent' => [],
                    'types' => ['locational' => 0, 'development' => 0, 'zoning' => 0, 'special' => 0],
                    'status' => ['released' => 0, 'pending' => 0, 'denied' => 0]
                ];
            }
        }

        // 6. Calculate total role counts across all users (respecting search if active)
        $roleCounts = [
            'total' => DB::table('users')->when($search, function($q) use ($search) {
                $q->where(function($sub) use ($search) {
                    $sub->where('name', 'ilike', "%{$search}%")->orWhere('email', 'ilike', "%{$search}%");
                });
            })->count(),
            'po' => DB::table('users')->where('role', 'Planning Officer')->when($search, function($q) use ($search) {
                $q->where(function($sub) use ($search) {
                    $sub->where('name', 'ilike', "%{$search}%")->orWhere('email', 'ilike', "%{$search}%");
                });
            })->count(),
            'inspector' => DB::table('users')->where('role', 'Site Inspector')->when($search, function($q) use ($search) {
                $q->where(function($sub) use ($search) {
                    $sub->where('name', 'ilike', "%{$search}%")->orWhere('email', 'ilike', "%{$search}%");
                });
            })->count(),
            'admin' => DB::table('users')->where('role', 'Admin')->when($search, function($q) use ($search) {
                $q->where(function($sub) use ($search) {
                    $sub->where('name', 'ilike', "%{$search}%")->orWhere('email', 'ilike', "%{$search}%");
                });
            })->count(),
        ];

        return Inertia::render('Users/Index', [
            'users' => $users,
            'filters' => $request->only(['search', 'role']),
            'role_counts' => $roleCounts,
        ]);
    }

    public function fetchSensitiveData(Request $request)
    {
        $request->validate([
            'admin_password' => 'required',
            'target_user_id' => 'required|integer|exists:users,id',
        ]);

        $adminUser = $request->user();
        $throttleKey = 'sensitive-data:' . $adminUser->id;

        if (RateLimiter::tooManyAttempts($throttleKey, 5)) {
            return response()->json([
                'success' => false,
                'message' => 'Too many failed attempts. Try again in ' . RateLimiter::availableIn($throttleKey) . ' seconds.',
            ], 429);
        }

        if (!Hash::check($request->admin_password, $adminUser->password)) {
            RateLimiter::hit($throttleKey, 900);
            return response()->json(['success' => false, 'message' => 'Authentication failed.'], 403);
        }

        RateLimiter::clear($throttleKey);

        DB::table('audit_trail')->insert([
            'application_id' => 0,
            'action' => 'Handshake Key Revealed',
            'performed_by' => $adminUser->id,
            'note' => 'Revealed handshake key for user #' . $request->target_user_id,
            'performed_at' => now(),
        ]);

        return response()->json([
            'success' => true,
            'handshake_key' => DB::table('users')->where('id', $request->target_user_id)->value('handshake_key'),
        ]);
    }

    public function updateProfile(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => ['required', 'email', Rule::unique('users', 'email')->ignore($id)],
            'is_active' => 'required|boolean',
        ]);

        $error = null;

        DB::transaction(function () use ($request, $id, &$error) {
            // Lock active admins so two concurrent deactivations can't both pass the last-admin check.
            $activeAdminIds = DB::table('users')->where('role', 'Admin')->where('is_active', true)
                ->lockForUpdate()->pluck('id')->all();

            $target = DB::table('users')->where('id', $id)->lockForUpdate()->first();
            if (!$target) {
                $error = ['User not found.', 404];
                return;
            }

            if (!$request->boolean('is_active') && $target->is_active) {
                if ((int) $id === (int) $request->user()->id) {
                    $error = ['You cannot deactivate your own account.', 422];
                    return;
                }
                if ($target->role === 'Admin' && count(array_diff($activeAdminIds, [(int) $id])) === 0) {
                    $error = ['Cannot deactivate the last active administrator.', 422];
                    return;
                }
            }

            $new = [
                'name' => $request->name,
                'email' => $request->email,
                'is_active' => $request->boolean('is_active'),
            ];

            $changes = [];
            foreach ($new as $field => $value) {
                if ($target->$field != $value) {
                    $changes[] = $field === 'is_active'
                        ? 'active: ' . ($target->is_active ? 'yes' : 'no') . ' → ' . ($value ? 'yes' : 'no')
                        : "$field: {$target->$field} → $value";
                }
            }

            DB::table('users')->where('id', $id)->update($new + ['updated_at' => now()]);

            if ($changes) {
                DB::table('audit_trail')->insert([
                    'application_id' => 0,
                    'action' => 'User Profile Updated',
                    'performed_by' => $request->user()->id,
                    'note' => "Updated user #{$id} (" . implode('; ', $changes) . ')',
                    'performed_at' => now(),
                ]);
            }
        });

        if ($error) {
            return response()->json(['success' => false, 'message' => $error[0]], $error[1]);
        }

        return response()->json(['success' => true]);
    }

    public function logs($id)
    {
        $user = DB::table('users')->select('id', 'name', 'email', 'role')->where('id', $id)->first();

        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found.'], 404);
        }

        $logs = AuditTrail::withRelations()
            ->byUser($id)
            ->orderByDesc('audit_trail.performed_at')
            ->limit(200)
            ->get();

        return response()->json([
            'success' => true,
            'user' => $user,
            'logs' => $logs,
        ]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'target_user_id' => 'required|exists:users,id',
            'new_password' => 'required|string|min:8',
            'admin_password' => 'required|current_password',
        ]);

        DB::transaction(function () use ($request) {
            DB::table('users')->where('id', $request->target_user_id)->update([
                'password' => Hash::make($request->new_password),
                'updated_at' => now(),
            ]);

            DB::table('audit_trail')->insert([
                'application_id' => 0,
                'action' => 'Password Reset',
                'performed_by' => $request->user()->id,
                'note' => 'Reset password for user #' . $request->target_user_id,
                'performed_at' => now(),
            ]);
        });

        // Best-effort and outside the transaction: a notification failure must not undo the reset.
        try {
            AppNotification::notifyUser(
                $request->target_user_id,
                'Password Reset',
                'An administrator reset your password. If you did not expect this, contact your administrator.',
                'system_alert'
            );
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Password reset notification failed: ' . $e->getMessage());
        }

        return response()->json(['success' => true]);
    }
}