<?php

namespace App\Http\Controllers;

use Inertia\Inertia;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class DashboardController extends Controller
{
    public function index()
    {
        $total = DB::table('zoning_applications')->count();

        $byStatus = DB::table('zoning_applications')
            ->select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->get()
            ->pluck('cnt', 'status');

        $recent = DB::table('zoning_applications')
            ->select('reference_number', 'applicant_name', 'application_type', 'status', 'date_of_application')
            ->orderByDesc('created_at')
            ->limit(5)
            ->get();

        $thisMonth = DB::table('zoning_applications')
            ->whereRaw("DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())")
            ->count();

        $bgyStats = [];
        $bgyQuery = DB::table('zoning_applications')
            ->select('barangay', 'status', DB::raw('COUNT(*) as cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay', 'status')
            ->get();

        foreach ($bgyQuery as $row) {
            $b = trim($row->barangay);
            if (!isset($bgyStats[$b])) {
                $bgyStats[$b] = ['Total' => 0, 'Technical Review' => 0, 'Released' => 0];
            }
            if (stripos($row->status, 'Review') !== false) {
                $bgyStats[$b]['Technical Review'] += (int) $row->cnt;
            } elseif (stripos($row->status, 'Released') !== false) {
                $bgyStats[$b]['Released'] += (int) $row->cnt;
            }
            $bgyStats[$b]['Total'] += (int) $row->cnt;
        }

        return Inertia::render('Dashboard', [
            'userName'   => Auth::user()->name,
            'userRole'   => Auth::user()->role,
            'total'      => $total,
            'thisMonth'  => $thisMonth,
            'statusMap'  => $byStatus,
            'recent'     => $recent,
            'bgyStats'   => $bgyStats,
        ]);
    }
}