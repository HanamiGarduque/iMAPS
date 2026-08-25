<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Inertia\Inertia;

class UserManagementController extends Controller
{
    public function index(Request $request)
    {
        $search = $request->input('search');
        $role = $request->input('role');

        // 1. Fetch users from the local database
        $users = DB::table('users')
            ->select('id', 'name', 'email', 'role', 'is_active', 'last_login', 'created_at', 'supabase_uuid')
            // Subquery for Planning Officers (Local DB)
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

        // 2. Extract IDs for Site Inspectors currently on screen
        $inspectors = collect($users->items())->where('role', 'Site Inspector');
        
        // Note: If your Supabase field_jobs table uses the supabase_uuid instead of the local integer id, 
        // change pluck('id') to pluck('supabase_uuid') here and in the mapping loop below.
        $inspectorIds = $inspectors->pluck('id')->toArray();

        // 3. Fetch completed inspections from Supabase separately
        $inspectionCounts = [];
        if (!empty($inspectorIds)) {
            try {
                // Assuming you have a 'supabase' connection configured in config/database.php.
                // If you use the Supabase REST API via HTTP instead, you can replace this with an Http::get() call.
                $inspectionCounts = DB::connection('supabase')
                    ->table('field_jobs')
                    ->select('assigned_inspector_id', DB::raw('COUNT(*) as total'))
                    ->whereIn('assigned_inspector_id', $inspectorIds)
                    ->where('status', 'completed')
                    ->groupBy('assigned_inspector_id')
                    ->pluck('total', 'assigned_inspector_id')
                    ->toArray();
            } catch (\Exception $e) {
                // Failsafe if Supabase connection drops
            }
        }

        // 4. Map the external Supabase counts back to the local user objects
        foreach ($users->items() as $user) {
            if ($user->role === 'Site Inspector') {
                $user->completed_inspections_count = $inspectionCounts[$user->id] ?? 0;
            } else {
                $user->completed_inspections_count = 0;
            }
        }

        return Inertia::render('Users/Index', [
            'users' => $users,
            'filters' => $request->only(['search', 'role'])
        ]);
    }

    // Endpoint for Admin to verify their password and fetch sensitive data
    public function fetchSensitiveData(Request $request)
    {
        $request->validate([
            'admin_password' => 'required',
            'target_user_id' => 'required'
        ]);

        $adminUser = Auth::user();

        // Check if user exists AND password matches
        if ($adminUser && Hash::check($request->admin_password, $adminUser->password)) {
            $targetUser = DB::table('users')->where('id', $request->target_user_id)->first();
            
            return response()->json([
                'success' => true,
                'supabase_uuid' => $targetUser->supabase_uuid,
            ]);
        }

        return response()->json(['success' => false, 'message' => 'Authentication failed.'], 403);
    }
}