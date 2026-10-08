<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use App\Models\ApplicationDraft;
use App\Models\SiteInspection;
use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

// Landing page after login: a light summary of the registry and the user's
// own queue. The GIS map stays on /dashboard.
class OverviewController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $isAdmin = $user->role === 'Admin';

        $statusCounts = ZoningApplication::select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->pluck('cnt', 'status');

        $monthStart = now()->startOfMonth();

        $appsByBarangay = ZoningApplication::whereNotNull('barangay')
            ->selectRaw('TRIM(barangay) as name, COUNT(*) as cnt')
            ->groupByRaw('TRIM(barangay)')
            ->pluck('cnt', 'name');

        // Land-use mix per barangay (Simpson index over CLUP zone area), the
        // same score the GIS dashboard's diversity view extrudes in 3D.
        $zoneAreas = [];
        $municipalAreas = [];
        $rows = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as area'))
            ->whereNotNull('location')
            ->groupBy('location', 'lup_2030')
            ->get();
        foreach ($rows as $row) {
            $b = trim($row->location);
            $zoneAreas[$b][$row->lup_2030] = ($zoneAreas[$b][$row->lup_2030] ?? 0) + (float) $row->area;
            $municipalAreas[$row->lup_2030] = ($municipalAreas[$row->lup_2030] ?? 0) + (float) $row->area;
        }
        $simpson = function (array $areas): float {
            $total = array_sum($areas);
            if ($total <= 0) {
                return 0.0;
            }
            return round(1 - array_sum(array_map(fn ($a) => ($a / $total) ** 2, $areas)), 2);
        };

        $bgyStats = [];
        foreach ($zoneAreas as $name => $areas) {
            $bgyStats[$name] = [
                'diversity' => $simpson($areas),
                'Total'     => (int) ($appsByBarangay[$name] ?? 0),
            ];
        }

        // Still-open applications, aged against the same 14-day SLA the registry
        // badges use ("past SLA" after 14 days, "pending" from day 6).
        $open = ZoningApplication::whereRaw("NOT (status ILIKE '%released%' OR status ILIKE '%approved%' OR status ILIKE '%denied%' OR status ILIKE '%reject%')");

        return Inertia::render('Overview', [
            'pastSla'      => (clone $open)->where('created_at', '<', now()->subDays(14))->count(),
            'ageing'       => (clone $open)->whereBetween('created_at', [now()->subDays(14), now()->subDays(5)])->count(),
            'statusCounts' => $statusCounts,
            'thisMonth'    => ZoningApplication::where('created_at', '>=', $monthStart)->count(),
            'lastMonth'    => ZoningApplication::whereBetween('created_at', [$monthStart->copy()->subMonth(), $monthStart])->count(),
            'bgyStats'     => $bgyStats,
            'municipalDiversity' => $simpson($municipalAreas),
            'unreadCount'  => AppNotification::forUser($user->id)->unread()->count(),
            'latestUnread' => AppNotification::forUser($user->id)->unread()->latest()->value('title'),
            // Each role only gets the queue it can open (drafts are Planning
            // Officer-only, inspections Admin-only).
            'draftCount'   => $isAdmin ? null : ApplicationDraft::where('user_id', $user->id)->count(),
            'upcomingInspections' => $isAdmin
                ? SiteInspection::whereNull('completed_at')->whereDate('scheduled_date', '>=', today())->count()
                : null,
        ]);
    }
}
