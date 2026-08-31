<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http; 
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

                // Query Supabase profiles filtered by handshake_key to get their Supabase UUIDs first
                $profileResponse = Http::withHeaders([
                    'apikey' => $supabaseKey,
                    'Authorization' => 'Bearer ' . $supabaseKey,
                ])->get($supabaseUrl . '/rest/v1/profiles', [
                    'select' => 'id,handshake_key',
                    'handshake_key' => 'in.(' . implode(',', $handshakeKeys) . ')'
                ]);

                if ($profileResponse->successful()) {
                    $profiles = collect($profileResponse->json());
                    $supabaseUuids = $profiles->pluck('id')->filter()->toArray();

                    if (!empty($supabaseUuids)) {
                        // Query field jobs using the matched Supabase UUIDs
                        $jobResponse = Http::withHeaders([
                            'apikey' => $supabaseKey,
                            'Authorization' => 'Bearer ' . $supabaseKey,
                        ])->get($supabaseUrl . '/rest/v1/field_jobs', [
                            'select' => '*',
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
                                                'in_progress' => $jobs->where('status', 'in-progress')->count(),
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
                $topBarangay = $userApps->countBy('barangay')->sortDesc()->keys()->first() ?? 'N/A';

                $types = [
                    'locational' => $userApps->where('application_type', 'Locational Clearance')->count(),
                    'development' => $userApps->where('application_type', 'Development Permit')->count(),
                    'zoning' => $userApps->where('application_type', 'Zoning Certification')->count(),
                    'special' => $userApps->where('application_type', 'Special Land Use Permit')->count(),
                ];

                $status = [
                    'released' => $userApps->where('status', 'Released')->count(),
                    'pending' => $userApps->whereIn('status', ['Received', 'Technical Review', 'Under Sangguniang Bayan', 'For Release'])->count(),
                    'denied' => $userApps->where('status', 'Denied')->count(),
                ];

                $poStats[$poId] = [
                    'total_fees' => '₱' . number_format($totalFees, 2),
                    'top_barangay' => $topBarangay,
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
                    'types' => ['locational' => 0, 'development' => 0, 'zoning' => 0, 'special' => 0],
                    'status' => ['released' => 0, 'pending' => 0, 'denied' => 0]
                ];
            }
        }

        return Inertia::render('Users/Index', [
            'users' => $users,
            'filters' => $request->only(['search', 'role'])
        ]);
    }

    public function fetchSensitiveData(Request $request)
    {
        $request->validate([
            'admin_password' => 'required',
            'target_user_id' => 'required'
        ]);

        $adminUser = Auth::user();

        if ($adminUser && Hash::check($request->admin_password, $adminUser->password)) {
            $targetUser = DB::table('users')->where('id', $request->target_user_id)->first();
            
            return response()->json([
                'success' => true,
                'handshake_key' => $targetUser->handshake_key,
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Authentication failed.'], 403);
    }

    public function updateProfile(Request $request, $id)
    {
        $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|unique:users,email,' . $id,
            'is_active' => 'required|boolean',
        ]);

        DB::table('users')->where('id', $id)->update([
            'name' => $request->name,
            'email' => $request->email,
            'is_active' => $request->is_active,
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }

    public function resetPassword(Request $request)
    {
        $request->validate([
            'target_user_id' => 'required|exists:users,id',
            'new_password' => 'required|string|min:8',
        ]);

        DB::table('users')->where('id', $request->target_user_id)->update([
            'password' => Hash::make($request->new_password),
            'updated_at' => now(),
        ]);

        return response()->json(['success' => true]);
    }
}