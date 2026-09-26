<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class MapsController extends Controller
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

        $bgyRows = (clone $query)->select('barangay', 'status', 'target_land_use_class', DB::raw('COUNT(*) as cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay', 'status', 'target_land_use_class')
            ->get();

        $bgyStats = [];
        foreach ($bgyRows as $row) {
            $b = trim($row->barangay);
            if (!isset($bgyStats[$b])) {
                $bgyStats[$b] = [
                    'Total' => 0,
                    'Technical Review' => 0,
                    'Released' => 0,
                    'Primary_Zone' => $row->target_land_use_class ?? 'Residential'
                ];
            }
            if (stripos($row->status, 'Review') !== false) {
                $bgyStats[$b]['Technical Review'] += (int) $row->cnt;
            } elseif (stripos($row->status, 'Release') !== false) {
                $bgyStats[$b]['Released'] += (int) $row->cnt;
            }
            $bgyStats[$b]['Total'] += (int) $row->cnt;
        }

        // ── Real-Time Permit Integration & Dynamic Diversity Index ──
        $landUseQuery = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as feature_area'))
            ->whereNotNull('location')
            ->groupBy('location', 'lup_2030')
            ->get();

        $bgyDiversity = [];
        $municipalTotal = 0;
        $municipalZones = [];

        $bgyLandArea = [];
        $municipalAreaSqm = 0.0;
        foreach (DB::table('barangay_boundary')->select('location', 'land_area')->get() as $row) {
            $loc = trim((string) $row->location);
            if ($loc === '') continue;
            $sqm = (float) $row->land_area;
            $bgyLandArea[$loc] = $sqm;
            $municipalAreaSqm += $sqm;
        }

        foreach ($landUseQuery as $lu) {
            $b = trim($lu->location);
            $area = (float) $lu->feature_area;
            
            $bgyDiversity[$b]['total'] = ($bgyDiversity[$b]['total'] ?? 0) + $area;
            $bgyDiversity[$b]['zones'][$lu->lup_2030] = ($bgyDiversity[$b]['zones'][$lu->lup_2030] ?? 0) + $area;

            $municipalTotal += $area;
            $municipalZones[$lu->lup_2030] = ($municipalZones[$lu->lup_2030] ?? 0) + $area;
        }

        $maxPermits = max(1, count($bgyStats) > 0 ? max(array_column($bgyStats, 'Total')) : 1);

        foreach ($bgyDiversity as $b => $data) {
            $baselineN = $data['total'];
            $baseSumOfSquares = 0;
            $baseDistribution = [];

            if ($baselineN > 0) {
                foreach ($data['zones'] as $zone => $area) {
                    $p = $area / $baselineN;
                    $baseSumOfSquares += ($p * $p);
                    $baseDistribution[] = ['name' => $zone, 'value' => round($p * 100, 1)];
                }
            }
            usort($baseDistribution, fn($a, $b) => $b['value'] <=> $a['value']);
            $targetDiversity = round(1 - $baseSumOfSquares, 2);

            $liveZones = $data['zones'];
            $liveTotal = $baselineN;
            $bgyPCount = $bgyStats[$b]['Total'] ?? 0;

            $liveSumOfSquares = 0;
            $liveDistribution = [];
            if ($liveTotal > 0) {
                foreach ($liveZones as $zone => $area) {
                    $p = $area / $liveTotal;
                    $liveSumOfSquares += ($p * $p);
                    $liveDistribution[] = ['name' => $zone, 'value' => round($p * 100, 1)];
                }
            }
            usort($liveDistribution, fn($a, $b) => $b['value'] <=> $a['value']);
            $liveDiversity = round(1 - $liveSumOfSquares, 2);

            $variance = round($liveDiversity - $targetDiversity, 3);
            
            if (!isset($bgyStats[$b])) {
                $bgyStats[$b] = [
                    'Total' => $bgyPCount,
                    'Technical Review' => 0,
                    'Released' => 0,
                    'Primary_Zone' => $liveDistribution[0]['name'] ?? 'Residential'
                ];
            }

            $bgyStats[$b]['diversity'] = $liveDiversity;
            $bgyStats[$b]['liveDiversity'] = $liveDiversity;
            $bgyStats[$b]['clupTargetDiversity'] = $targetDiversity;
            $bgyStats[$b]['variance'] = $variance;
            $bgyStats[$b]['distribution'] = $liveDistribution;
            $bgyStats[$b]['baselineDistribution'] = $baseDistribution;
            $bgyStats[$b]['permitCount'] = $bgyPCount;
            $bgyStats[$b]['areaHa'] = round(($bgyLandArea[$b] ?? 0) / 10000, 1);
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

        $rankedBgys = [];
        foreach ($bgyStats as $bgyName => $bStat) {
            $rankedBgys[] = [
                'name' => $bgyName,
                'score' => $bStat['diversity'] ?? 0,
                'liveDiversity' => $bStat['liveDiversity'] ?? 0,
                'clupTarget' => $bStat['clupTargetDiversity'] ?? 0,
                'variance' => $bStat['variance'] ?? 0,
                'primaryZone' => $bStat['Primary_Zone'] ?? 'N/A',
                'distribution' => $bStat['distribution'] ?? []
            ];
        }
        usort($rankedBgys, fn($a, $b) => $b['score'] <=> $a['score']);

        $overallDiversity = [
            'score' => round(1 - $munSumOfSquares, 2),
            'primary' => $munDistribution[0]['name'] ?? 'Multi-Sector',
            'distribution' => array_slice($munDistribution, 0, 4),
            'topBarangays' => array_slice($rankedBgys, 0, 8),
            'lowBarangays' => array_slice(array_reverse($rankedBgys), 0, 5),
            'totalAreaHa' => round($municipalAreaSqm / 10000, 1),
        ];

        // ── 6-Class Standard CLUP Land Use Mapping & Urban Growth Metrics ──
        $zoneCategoryMap = [
            'R1-Z' => 'Residential', 'R2-Z' => 'Residential', 'MR2-SZ' => 'Residential', 'BR2-SZ' => 'Residential',
            'C1-Z' => 'Commercial', 'C2-Z' => 'Commercial', 'C/MP-Z' => 'Commercial', 'T-Z' => 'Commercial', 'ECT-Z' => 'Commercial',
            'I1-Z' => 'Industrial', 'I2-Z' => 'Industrial', 'I3-Z' => 'Industrial',
            'AgIndZ' => 'Agro-industrial', 'AgIndZ-PTR' => 'Agro-industrial', 'AgIndZ-PGR' => 'Agro-industrial',
            'PDA-SZ' => 'Agricultural', 'PTA-SZ-RA' => 'Agricultural', '5491-APDA-SZ' => 'Agricultural',
            'FZ' => 'Agricultural', 'FR-SZ' => 'Agricultural', 'THSP-SZ' => 'Agricultural', 'WZ' => 'Agricultural',
            'PR-Z' => 'Special projects', 'GI-Z' => 'Special projects', 'UTS-Z' => 'Special projects',
            'CMRF' => 'Special projects', 'ROAD' => 'Special projects', 'PROPOSED ROAD' => 'Special projects'
        ];

        $categoryColors = [
            'Agricultural' => ['color' => '#84cc16', 'bg' => '#ecfccb'],
            'Residential' => ['color' => '#22c55e', 'bg' => '#dcfce7'],
            'Commercial' => ['color' => '#f59e0b', 'bg' => '#fef3c7'],
            'Special projects' => ['color' => '#64748b', 'bg' => '#f1f5f9'],
            'Industrial' => ['color' => '#ef4444', 'bg' => '#fee2e2'],
            'Agro-industrial' => ['color' => '#8b5cf6', 'bg' => '#f3e8ff'],
        ];

        $detailedLu = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as total_area'), DB::raw('COUNT(*) as cnt'))
            ->groupBy('location', 'lup_2030')
            ->get();

        $munCategories = [
            'Agricultural' => ['area' => 0, 'count' => 0],
            'Residential' => ['area' => 0, 'count' => 0],
            'Commercial' => ['area' => 0, 'count' => 0],
            'Special projects' => ['area' => 0, 'count' => 0],
            'Industrial' => ['area' => 0, 'count' => 0],
            'Agro-industrial' => ['area' => 0, 'count' => 0],
        ];
        $totalMunArea = 0;
        $totalMunZones = 0;
        $bgyUrbanData = [];

        foreach ($detailedLu as $row) {
            $cat = $zoneCategoryMap[$row->lup_2030] ?? 'Special projects';
            $area = (float)$row->total_area;
            $cnt = (int)$row->cnt;
            $loc = trim($row->location ?? '');

            $munCategories[$cat]['area'] += $area;
            $munCategories[$cat]['count'] += $cnt;
            $totalMunArea += $area;
            $totalMunZones += $cnt;

            if ($loc !== '') {
                if (!isset($bgyUrbanData[$loc])) {
                    $bgyUrbanData[$loc] = [
                        'totalArea' => 0,
                        'totalZones' => 0,
                        'categories' => [
                            'Agricultural' => 0, 'Residential' => 0, 'Commercial' => 0,
                            'Special projects' => 0, 'Industrial' => 0, 'Agro-industrial' => 0,
                        ],
                    ];
                }
                $bgyUrbanData[$loc]['totalArea'] += $area;
                $bgyUrbanData[$loc]['totalZones'] += $cnt;
                $bgyUrbanData[$loc]['categories'][$cat] += $area;
            }
        }

        $municipalBreakdown = [];
        $accumulatedPct = 0;
        $catKeys = array_keys($munCategories);
        $totalCats = count($catKeys);

        foreach ($catKeys as $index => $catName) {
            $data = $munCategories[$catName];
            $ha = round($data['area'] / 10000, 1);
            if ($index === $totalCats - 1) {
                $pct = round(100.0 - $accumulatedPct, 1);
            } else {
                $pct = $totalMunArea > 0 ? round(($data['area'] / $totalMunArea) * 100, 1) : 0;
                $accumulatedPct += $pct;
            }
            $municipalBreakdown[] = [
                $catName, $ha, $data['count'], $pct,
                $categoryColors[$catName]['color'], $categoryColors[$catName]['bg']
            ];
        }
        usort($municipalBreakdown, fn($a, $b) => $b[1] <=> $a[1]);

        $byBarangayUrban = [];
        $growthHotspots = [];

        foreach ($bgyUrbanData as $bName => $bData) {
            $bArea = $bData['totalArea'];
            $bTotalHa = round($bArea / 10000, 1);
            $bBreakdown = [];
            $bAccPct = 0;
            $bCatKeys = array_keys($bData['categories']);
            $bTotalCats = count($bCatKeys);

            foreach ($bCatKeys as $bIdx => $bCatName) {
                $cArea = $bData['categories'][$bCatName];
                $cHa = round($cArea / 10000, 1);
                if ($bIdx === $bTotalCats - 1) {
                    $cPct = round(100.0 - $bAccPct, 1);
                } else {
                    $cPct = $bArea > 0 ? round(($cArea / $bArea) * 100, 1) : 0;
                    $bAccPct += $cPct;
                }
                $bBreakdown[] = [
                    $bCatName, $cHa, $cPct,
                    $categoryColors[$bCatName]['color'], $categoryColors[$bCatName]['bg']
                ];
            }
            usort($bBreakdown, fn($a, $b) => $b[1] <=> $a[1]);

            $dominant = $bBreakdown[0][0] ?? 'Agricultural';
            $dominantPct = $bBreakdown[0][2] ?? 0;

            $byBarangayUrban[$bName] = [
                'totalHectares' => $bTotalHa,
                'totalZones' => $bData['totalZones'],
                'dominantUse' => "{$dominant} ({$dominantPct}%)",
                'dominantCategory' => $dominant,
                'breakdown' => $bBreakdown,
            ];
        } // end foreach $bgyUrbanData (byBarangay population)

        // ── STRICT LOCATIONAL CLEARANCE FILTER & PIN MAPPING (2021 - AUG 2026) ──
        $historicalRows = DB::table('historical_data')
            ->select('id', 'form_number', 'name', 'barangay', 'zoning_code', 'lot_area_sqm', 'application_type', 'purpose', 'encoding_date')
            ->where('application_type', 'Locational Clearance')
            ->whereNotNull('barangay')
            ->whereDate('encoding_date', '>=', '2021-01-01')
            ->whereDate('encoding_date', '<=', '2026-08-31')
            ->orderBy('encoding_date', 'asc')
            ->get();

        $bgyCentroids = DB::table('barangay_boundary')
            ->select('location', DB::raw('ST_Y(ST_Centroid(geom)) as lat'), DB::raw('ST_X(ST_Centroid(geom)) as lng'))
            ->get()
            ->keyBy(fn($item) => trim($item->location));

        $historicalBgyCounts = [];
        $historicalByYearAndBarangay = [];
        $historicalPins = [];

        foreach ($historicalRows as $hRow) {
            $year = (int) date('Y', strtotime($hRow->encoding_date));
            if ($year < 2021 || $year > 2026) continue;

            $bName = trim($hRow->barangay);
            if ($bName === '') continue;

            if (!isset($historicalBgyCounts[$bName])) {
                $historicalBgyCounts[$bName] = 0;
            }
            $historicalBgyCounts[$bName]++;

            // 1. Populate Time Slider Counts
            if (!isset($historicalByYearAndBarangay[$year])) {
                $historicalByYearAndBarangay[$year] = [];
            }
            if (!isset($historicalByYearAndBarangay[$year][$bName])) {
                $historicalByYearAndBarangay[$year][$bName] = 0;
            }
            $historicalByYearAndBarangay[$year][$bName]++;

            // 2. Determine Land Use Category from Zoning Code
            $zCode = trim($hRow->zoning_code ?? '');
            $cat = $zoneCategoryMap[$zCode] ?? 'Special projects';

            // 3. Populate Map Pins & Popup Info with jitter for visual clarity
            $centroid = $bgyCentroids[$bName] ?? null;
            $lat = $centroid ? ($centroid->lat + (($hRow->id % 13) - 6) * 0.0008) : 13.8459;
            $lng = $centroid ? ($centroid->lng + (($hRow->id % 17) - 8) * 0.0008) : 121.2068;

            if (!isset($historicalPins[$year])) {
                $historicalPins[$year] = [];
            }
            $historicalPins[$year][] = [
                'id' => $hRow->id,
                'reference_number' => $hRow->form_number,
                'applicant_name' => $hRow->name,
                'barangay' => $bName,
                'application_type' => $hRow->application_type,
                'purpose' => $hRow->purpose,
                'zoning_code' => $zCode,
                'target_land_use_class' => $cat,
                'lot_area_sqm' => $hRow->lot_area_sqm,
                'latitude' => $lat,
                'longitude' => $lng,
                'created_at' => $hRow->encoding_date,
            ];
        }

        foreach ($bgyUrbanData as $bName => $bData) {
            $appCount = (int)($historicalBgyCounts[$bName] ?? 0);
            $commHa = $bData['categories']['Commercial'] / 10000;
            $indHa = $bData['categories']['Industrial'] / 10000;
            $agroHa = $bData['categories']['Agro-industrial'] / 10000;

            $driver = 'Agricultural Preservation';
            if ($indHa > 15) $driver = 'Industrial Hub';
            elseif ($agroHa > 15) $driver = 'Agro-industrial Zone';
            elseif ($commHa > 10 || $appCount >= 3) $driver = 'Commercial Corridor';
            elseif (($bData['categories']['Residential'] / 10000) > 25) $driver = 'Residential Expansion';

            $score = ($appCount * 15) + ($commHa * 2.0) + ($indHa * 2.5) + ($agroHa * 1.8);

            $growthHotspots[] = [
                'name' => $bName,
                'type' => $driver,
                'count' => $appCount > 0 ? "{$appCount} LC permits" : "{$bTotalHa} ha",
                'color' => $categoryColors[$dominant]['color'] ?? '#2563eb',
                'bg' => $categoryColors[$dominant]['bg'] ?? '#dbeafe',
                'score' => $score,
            ];
        }

        usort($growthHotspots, fn($a, $b) => $b['score'] <=> $a['score']);
        foreach ($growthHotspots as $idx => &$gh) {
            $gh['rank'] = $idx + 1;
        }
        unset($gh);

        $urbanGrowthData = [
            'municipal' => [
                'totalHectares' => round($totalMunArea / 10000, 1),
                'totalZones' => $totalMunZones,
                'dominantUse' => $municipalBreakdown[0][0] . " (" . $municipalBreakdown[0][3] . "%)",
                'dominantCategory' => $municipalBreakdown[0][0],
                'breakdown' => $municipalBreakdown,
            ],
            'byBarangay' => $byBarangayUrban,
            'hotspots' => array_slice($growthHotspots, 0, 7),
            'historicalPermits' => $historicalByYearAndBarangay, // Powers the time-slider counts
            'historicalPins' => $historicalPins, // Powers the map pin markers and popup info cards
        ];

        $recent = (clone $query)->with('parcels:id,zoning_application_id,latitude,longitude,lot_number,lot_area_sqm,tax_dec_number')
            ->select('id', 'reference_number', 'applicant_name', 'application_type', 'status', 'barangay', 'purpose', 'target_land_use_class', 'created_at')
            ->orderByDesc('created_at')
            ->get();

        return Inertia::render('Maps', [
            'userName'  => Auth::user()->name ?? 'Staff',
            'userRole'  => Auth::user()->role ?? 'User',
            'total'     => $total,
            'thisMonth' => $thisMonth,
            'statusMap' => $statusMap,
            'recent'    => $recent,
            'bgyStats'  => $bgyStats,
            'overallDiversity' => $overallDiversity,
            'urbanGrowthData'  => $urbanGrowthData,
            'filters'   => ['application_type' => $appType ?? 'Zoning Certificate'],
        ]);
    }
}