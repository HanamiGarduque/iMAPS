<?php

namespace App\Http\Controllers;

use App\Models\ForecastRun;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DashboardController extends Controller
{
    // Landing page after login: welcome message, KPIs, and an analytics preview
    // that surfaces the descriptive/forecasting work from the two system objectives
    // (spatio-temporal application trends + the SARIMAX 6-month forecast) without
    // duplicating the full Analytics or Maps pages.
    public function index()
    {
        $user = Auth::user();
        $isAdmin = ($user->role ?? null) === 'Admin';

        $now = now();
        $startOfMonth = $now->copy()->startOfMonth();
        $startOfLastMonth = $now->copy()->subMonthNoOverflow()->startOfMonth();
        $endOfLastMonth = $now->copy()->subMonthNoOverflow()->endOfMonth();

        $total = ZoningApplication::count();
        $thisMonthCount = ZoningApplication::where('created_at', '>=', $startOfMonth)->count();
        $lastMonthCount = ZoningApplication::whereBetween('created_at', [$startOfLastMonth, $endOfLastMonth])->count();
        $monthOverMonthPct = $lastMonthCount > 0
            ? round((($thisMonthCount - $lastMonthCount) / $lastMonthCount) * 100)
            : ($thisMonthCount > 0 ? 100 : 0);

        $statusCounts = ZoningApplication::select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->pluck('cnt', 'status');

        $pending = (int) (($statusCounts['Received'] ?? 0)
            + ($statusCounts['Technical Review'] ?? 0)
            + ($statusCounts['Under Sangguniang Bayan'] ?? 0));
        $released = (int) (($statusCounts['Released'] ?? 0) + ($statusCounts['For Release'] ?? 0));
        $denied = (int) ($statusCounts['Denied'] ?? 0);

        // ── Descriptive Analytics: application volume trend, last 6 months ──
        $trendRows = ZoningApplication::select(
                DB::raw("to_char(created_at, 'YYYY-MM') as ym"),
                DB::raw('COUNT(*) as cnt')
            )
            ->where('created_at', '>=', $now->copy()->subMonths(5)->startOfMonth())
            ->groupBy('ym')
            ->pluck('cnt', 'ym');

        $monthlyTrend = [];
        for ($i = 5; $i >= 0; $i--) {
            $month = $now->copy()->subMonths($i);
            $key = $month->format('Y-m');
            $monthlyTrend[] = [
                'month' => $month->format('M'),
                'count' => (int) ($trendRows[$key] ?? 0),
            ];
        }

        // ── Spatial Clustering: application volume by barangay ──
        $topBarangays = ZoningApplication::select('barangay', DB::raw('COUNT(*) as cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay')
            ->orderByDesc('cnt')
            ->limit(5)
            ->get()
            ->map(fn ($row) => ['barangay' => $row->barangay, 'count' => (int) $row->cnt]);

        // ── Recent Activity ──
        $recent = ZoningApplication::select('id', 'reference_number', 'applicant_name', 'application_type', 'status', 'barangay', 'created_at')
            ->orderByDesc('created_at')
            ->limit(6)
            ->get();

        // ── SARIMAX Forecast Preview (objective 3.2), reusing the latest saved run ──
        $latestRun = ForecastRun::with('outputs')->latest()->first();
        $forecastPreview = [];
        $forecastMetrics = null;

        if ($latestRun) {
            $forecastMetrics = $latestRun->model_metrics;
            $history = is_array($latestRun->historical_data) ? array_slice($latestRun->historical_data, -3) : [];

            foreach ($history as $h) {
                $forecastPreview[] = [
                    'date' => substr($h['metric_date'], 0, 7),
                    'historical' => (float) $h['target_value'],
                    'forecast' => null,
                ];
            }

            foreach ($latestRun->outputs as $f) {
                $forecastPreview[] = [
                    'date' => substr($f->forecast_date, 0, 7),
                    'historical' => null,
                    'forecast' => (float) $f->mean_value,
                ];
            }
        }

        // ── Operational KPI: field inspections in flight ──
        $inspectionsInProgress = SiteInspection::whereIn('status', ['assigned', 'pending', 'in-progress'])->count();

        return Inertia::render('Dashboard', [
            'userName' => $user->name ?? 'Staff',
            'userRole' => $user->role ?? 'User',
            'kpis' => [
                'total' => $total,
                'thisMonth' => $thisMonthCount,
                'monthOverMonthPct' => $monthOverMonthPct,
                'pending' => $pending,
                'released' => $released,
                'denied' => $denied,
                'inspectionsInProgress' => $inspectionsInProgress,
                'usersCount' => $isAdmin ? User::count() : null,
            ],
            'monthlyTrend' => $monthlyTrend,
            'topBarangays' => $topBarangays,
            'recent' => $recent,
            'forecastPreview' => $forecastPreview,
            'forecastMetrics' => $forecastMetrics,
            'hasForecast' => (bool) $latestRun,
        ]);
    }
}
