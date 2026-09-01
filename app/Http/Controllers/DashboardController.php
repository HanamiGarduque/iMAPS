<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index(Request $request)
    {
        $appType = $request->input('application_type');

        $query = ZoningApplication::query();
        if ($appType && $appType !== 'All') {
            $query->where('application_type', 'like', "%{$appType}%");
        }

        $total = (clone $query)->count();
        $thisMonth = (clone $query)->whereYear('created_at', now()->year)
            ->whereMonth('created_at', now()->month)
            ->count();

        $statusMap = (clone $query)->select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->pluck('cnt', 'status');

        $bgyRows = (clone $query)->select('barangay', 'status', 'land_use_class', DB::raw('COUNT(*) as cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay', 'status', 'land_use_class')
            ->get();

        $bgyStats = [];
        foreach ($bgyRows as $row) {
            $b = trim($row->barangay);
            if (!isset($bgyStats[$b])) {
                $bgyStats[$b] = [
                    'Total' => 0, 
                    'Technical Review' => 0, 
                    'Released' => 0,
                    'Primary_Zone' => $row->land_use_class ?? 'Residential'
                ];
            }
            if (stripos($row->status, 'Review') !== false) {
                $bgyStats[$b]['Technical Review'] += (int) $row->cnt;
            } elseif (stripos($row->status, 'Release') !== false) {
                $bgyStats[$b]['Released'] += (int) $row->cnt;
            }
            $bgyStats[$b]['Total'] += (int) $row->cnt;
        }

        // Calculate Diversity Index via land_use_plan for both Barangay & Municipal levels
        $landUseQuery = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as feature_area'))
            ->whereNotNull('location')
            ->groupBy('location', 'lup_2030')
            ->get();

        $bgyDiversity = [];
        $municipalTotal = 0;
        $municipalZones = [];

        foreach ($landUseQuery as $lu) {
            $b = trim($lu->location);
            $area = (float) $lu->feature_area;
            
            $bgyDiversity[$b]['total'] = ($bgyDiversity[$b]['total'] ?? 0) + $area;
            $bgyDiversity[$b]['zones'][$lu->lup_2030] = ($bgyDiversity[$b]['zones'][$lu->lup_2030] ?? 0) + $area;

            $municipalTotal += $area;
            $municipalZones[$lu->lup_2030] = ($municipalZones[$lu->lup_2030] ?? 0) + $area;
        }

        // Apply Simpson's Diversity Index Formula (Barangay Level) based on area proportions
        foreach ($bgyDiversity as $b => $data) {
            $sumOfSquares = 0;
            $N = $data['total'];
            $distribution = [];
            
            if ($N > 0) {
                foreach ($data['zones'] as $zone => $area) {
                    $p = $area / $N;
                    $sumOfSquares += ($p * $p);
                    $distribution[] = ['name' => $zone, 'value' => round($p * 100, 1)];
                }
            }
            
            // Sort highest percentage first
            usort($distribution, fn($a, $b) => $b['value'] <=> $a['value']);
            
            if (!isset($bgyStats[$b])) {
                $bgyStats[$b] = ['Total' => 0, 'Technical Review' => 0, 'Released' => 0, 'Primary_Zone' => $distribution[0]['name'] ?? 'Residential'];
            }
            $bgyStats[$b]['diversity'] = round(1 - $sumOfSquares, 2);
            $bgyStats[$b]['distribution'] = $distribution;
        }

        // Apply Simpson's Diversity Index Formula (Municipal Level)
        $munSumOfSquares = 0;
        $munDistribution = [];
        if ($municipalTotal > 0) {
            foreach ($municipalZones as $zone => $count) {
                $p = $count / $municipalTotal;
                $munSumOfSquares += ($p * $p);
                $munDistribution[] = ['name' => $zone, 'value' => round($p * 100)];
            }
            usort($munDistribution, fn($a, $b) => $b['value'] <=> $a['value']);
        }

        $overallDiversity = [
            'score' => round(1 - $munSumOfSquares, 2),
            'primary' => $munDistribution[0]['name'] ?? 'Multi-Sector',
            'distribution' => array_slice($munDistribution, 0, 4) // Keep top 4 for donut chart
        ];

        $recent = (clone $query)->select('id', 'reference_number', 'applicant_name', 'application_type', 'status', 'barangay')
            ->orderByDesc('created_at')
            ->limit(50)
            ->get();

        return Inertia::render('Dashboard', [
            'userName'  => Auth::user()->name ?? 'Staff',
            'userRole'  => Auth::user()->role ?? 'User',
            'total'     => $total,
            'thisMonth' => $thisMonth,
            'statusMap' => $statusMap,
            'recent'    => $recent,
            'bgyStats'  => $bgyStats,
            'overallDiversity' => $overallDiversity,
            'filters'   => ['application_type' => $appType ?? 'Zoning Certificate'],
        ]);
    }
}