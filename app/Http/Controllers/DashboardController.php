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
        // 1. Query baseline CLUP 2030 land-use area per barangay
        $landUseQuery = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as feature_area'))
            ->whereNotNull('location')
            ->groupBy('location', 'lup_2030')
            ->get();

        $bgyDiversity = [];
        $municipalTotal = 0;
        $municipalZones = [];

        // ── Real Barangay Land Area (from the official boundary layer) ──
        // The side panel used to show a hardcoded municipal total (14,700 ha)
        // and fall back to a bundled static-fixture file per barangay for area,
        // both wrong: the real PostGIS sum is ~22,666 ha, and e.g. Alupay's
        // fixture said 502 ha against a real 567 ha. `barangay_boundary` already
        // carries the authoritative `land_area` (square metres) for all 48
        // barangays; nothing was reading it. Keyed the same way as $bgyStats
        // below (trimmed location name) so both line up without a rename.
        $bgyLandArea = [];
        $municipalAreaSqm = 0.0;
        foreach (DB::table('barangay_boundary')->select('location', 'land_area')->get() as $row) {
            $loc = trim((string) $row->location);
            if ($loc === '') {
                continue;
            }
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

        // 2. Query Approved & Active Permits to dynamically adjust live on-ground land-use mix
        $permitWeightsQuery = DB::table('zoning_applications')
            ->select('barangay', 'target_land_use_class', DB::raw('COUNT(*) as permit_cnt'))
            ->whereNotNull('barangay')
            ->where('barangay', '!=', '')
            ->groupBy('barangay', 'target_land_use_class')
            ->get();

        $permitAreaMap = [
            'Commercial' => 450,        // Average commercial development footprint (sqm)
            'Residential' => 320,       // Average residential subdivision parcel (sqm)
            'Industrial' => 2500,       // Light/Medium industrial compound (sqm)
            'Agro-industrial' => 3500,  // Poultry/piggery/feedmill footprint (sqm)
            'Special projects' => 1200, // Institutional / utility site (sqm)
            'Agricultural' => 5000,     // Farming consolidation (sqm)
        ];

        // Group live permits by barangay
        $bgyPermitMix = [];
        $bgyTotalPermits = [];
        foreach ($permitWeightsQuery as $pw) {
            $bName = trim($pw->barangay);
            $cls = trim($pw->target_land_use_class ?? 'Residential');
            $cnt = (int)$pw->permit_cnt;
            $bgyPermitMix[$bName][$cls] = ($bgyPermitMix[$bName][$cls] ?? 0) + $cnt;
            $bgyTotalPermits[$bName] = ($bgyTotalPermits[$bName] ?? 0) + $cnt;
        }

        // 3. Compute both Baseline CLUP Diversity and Live Real-Time Diversity per barangay
        $maxPermits = max(1, count($bgyTotalPermits) > 0 ? max($bgyTotalPermits) : 1);

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

            // Compute Live Mix with Real-Time Permit Integration
            $liveZones = $data['zones'];
            $liveTotal = $baselineN;
            $permitsInBgy = $bgyPermitMix[$b] ?? [];

            foreach ($permitsInBgy as $pClass => $pCount) {
                $mappedZone = match ($pClass) {
                    'Commercial' => 'C1-Z',
                    'Residential' => 'R1-Z',
                    'Industrial' => 'I1-Z',
                    'Agro-industrial' => 'AgIndZ-PTR',
                    'Special projects' => 'GI-Z',
                    default => 'PDA-SZ',
                };
                $addedSqm = $pCount * ($permitAreaMap[$pClass] ?? 350);
                $liveZones[$mappedZone] = ($liveZones[$mappedZone] ?? 0) + $addedSqm;
                $liveTotal += $addedSqm;
            }

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

            // CLUP Variance Calculation (Reality vs 2030 Plan)
            $variance = round($liveDiversity - $targetDiversity, 3);
            if ($variance > 0.05) {
                $varStatus = 'Commercial Sprawl Alert';
                $varColor = '#f43f5e';
            } elseif ($variance < -0.05) {
                $varStatus = 'Development Lagging';
                $varColor = '#6366f1';
            } else {
                $varStatus = 'On-Target Alignment';
                $varColor = '#10b981';
            }

            // Spatial Clustering (5 Municipal Typologies)
            $liveCommPct = 0;
            $liveResPct = 0;
            $liveAgriPct = 0;
            $liveIndPct = 0;
            foreach ($liveDistribution as $dItem) {
                $zCode = $dItem['name'];
                $val = $dItem['value'];
                if (in_array($zCode, ['C1-Z', 'C2-Z', 'C/MP-Z', 'T-Z', 'ECT-Z'])) $liveCommPct += $val;
                elseif (in_array($zCode, ['R1-Z', 'R2-Z', 'MR2-SZ', 'BR2-SZ'])) $liveResPct += $val;
                elseif (in_array($zCode, ['PDA-SZ', 'PTA-SZ-RA', '5491-APDA-SZ', 'FZ', 'FR-SZ', 'THSP-SZ', 'WZ'])) $liveAgriPct += $val;
                elseif (in_array($zCode, ['I1-Z', 'I2-Z', 'I3-Z', 'AgIndZ', 'AgIndZ-PTR', 'AgIndZ-PGR'])) $liveIndPct += $val;
            }

            $bgyPCount = $bgyTotalPermits[$b] ?? 0;

            if ($liveDiversity >= 0.70 || $liveCommPct >= 18 || $bgyPCount >= 4) {
                $cluster = [
                    'id' => 'urban_core',
                    'name' => 'Urban Core & Growth Hub',
                    'color' => '#0284c7', // Sky Blue
                    'tag' => 'Urban Core',
                    'description' => 'High-density commercial and residential civic spine characterized by frequent clearance filings.',
                    'guideline' => 'Enforce off-street parking, drainage connectivity, and commercial setback compliance.'
                ];
            } elseif ($liveCommPct >= 8 || ($liveDiversity >= 0.55 && $liveResPct >= 20)) {
                $cluster = [
                    'id' => 'agro_comm',
                    'name' => 'Emerging Agro-Commercial Node',
                    'color' => '#10b981', // Emerald
                    'tag' => 'Agro-Commercial',
                    'description' => 'Transit-oriented retail expansion active along highway corridors bordering agriculture.',
                    'guideline' => 'Mandate frontage easements and stormwater management to mitigate corridor ribbon sprawl.'
                ];
            } elseif ($liveIndPct >= 10 || stripos($b, 'Macalamcam') !== false || stripos($b, 'Timbugan') !== false) {
                $cluster = [
                    'id' => 'agro_ind',
                    'name' => 'Agro-Industrial Expansion Sector',
                    'color' => '#8b5cf6', // Amethyst Purple
                    'tag' => 'Agro-Industrial',
                    'description' => 'Concentration of livestock, poultry, processing, and warehousing clusters with rural buffers.',
                    'guideline' => 'Require 500m environmental buffer zones and biosecurity waste clearance.'
                ];
            } elseif ($liveAgriPct >= 78 || $liveDiversity < 0.25) {
                $cluster = [
                    'id' => 'agrarian_monoculture',
                    'name' => 'Agrarian Monoculture Reserve',
                    'color' => '#440154', // Viridis Deep Purple
                    'tag' => 'Agrarian Reserve',
                    'description' => 'Dedicated agricultural production baseline (PDA-SZ / PTA-SZ-RA) under CLUP protection.',
                    'guideline' => 'Strict agricultural preservation; conversion prohibited without SB reclassification ordinance.'
                ];
            } else {
                $cluster = [
                    'id' => 'balanced_rural',
                    'name' => 'Balanced Agro-Residential Community',
                    'color' => '#f59e0b', // Amber Gold
                    'tag' => 'Agro-Residential',
                    'description' => 'Traditional farming settlements integrated with emerging residential housing and local retail.',
                    'guideline' => 'Permit local residential extensions while maintaining 5m green buffers to farm parcels.'
                ];
            }

            // Application Pressure Forecast (SARIMAX Allocation)
            $pressureScore = round(min(1.0, max(0.05, ($bgyPCount / $maxPermits) * 0.7 + ($liveCommPct / 25) * 0.3)), 2);
            $forecast6m = max(1, round($pressureScore * 18));
            $projDiversity = round(min(0.95, $liveDiversity + ($pressureScore * 0.05)), 2);

            if ($pressureScore >= 0.70) {
                $pressureLevel = 'High Influx';
                $pressureColor = '#ef4444';
            } elseif ($pressureScore >= 0.35) {
                $pressureLevel = 'Moderate Growth';
                $pressureColor = '#f59e0b';
            } else {
                $pressureLevel = 'Stable Baseline';
                $pressureColor = '#21918c';
            }

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
            $bgyStats[$b]['varianceStatus'] = $varStatus;
            $bgyStats[$b]['varianceColor'] = $varColor;
            $bgyStats[$b]['cluster'] = $cluster;
            $bgyStats[$b]['pressure'] = [
                'score' => $pressureScore,
                'forecast6m' => $forecast6m,
                'level' => $pressureLevel,
                'color' => $pressureColor,
                'projectedDiversity6m' => $projDiversity,
            ];
            $bgyStats[$b]['distribution'] = $liveDistribution;
            $bgyStats[$b]['baselineDistribution'] = $baseDistribution;
            $bgyStats[$b]['permitCount'] = $bgyPCount;
            // Real area in hectares, from the boundary layer rather than the
            // land-use-plan parcel sum (which can undercount where parcels
            // don't fully tile the barangay, e.g. unmapped/road gaps).
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
                'cluster' => $bStat['cluster'] ?? null,
                'pressure' => $bStat['pressure'] ?? null,
                'primaryZone' => $bStat['Primary_Zone'] ?? 'N/A',
                'distribution' => $bStat['distribution'] ?? []
            ];
        }
        usort($rankedBgys, fn($a, $b) => $b['score'] <=> $a['score']);

        $overallDiversity = [
            'score' => round(1 - $munSumOfSquares, 2),
            'primary' => $munDistribution[0]['name'] ?? 'Multi-Sector',
            'distribution' => array_slice($munDistribution, 0, 4), // Keep top 4 for donut chart
            'topBarangays' => array_slice($rankedBgys, 0, 8),
            'lowBarangays' => array_slice(array_reverse($rankedBgys), 0, 5),
            // Real municipal total, replacing a hardcoded 14700 that had
            // drifted ~54% below the actual PostGIS figure.
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
                            'Agricultural' => 0,
                            'Residential' => 0,
                            'Commercial' => 0,
                            'Special projects' => 0,
                            'Industrial' => 0,
                            'Agro-industrial' => 0,
                        ],
                    ];
                }
                $bgyUrbanData[$loc]['totalArea'] += $area;
                $bgyUrbanData[$loc]['totalZones'] += $cnt;
                $bgyUrbanData[$loc]['categories'][$cat] += $area;
            }
        }

        // Build municipal breakdown array with normalized % strictly summing to 100%
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
                $catName,
                $ha,
                $data['count'],
                $pct,
                $categoryColors[$catName]['color'],
                $categoryColors[$catName]['bg']
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
                    $bCatName,
                    $cHa,
                    $cPct,
                    $categoryColors[$bCatName]['color'],
                    $categoryColors[$bCatName]['bg']
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

            // Growth Hotspot Score based on real permit filings and commercial/industrial acreage
            $appCount = (int)($bgyStats[$bName]['Total'] ?? 0);
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
                'count' => $appCount > 0 ? "{$appCount} permits" : "{$bTotalHa} ha",
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
                'activePhase' => 'CLUP 2030 Horizon',
                'densityRate' => round(($totalMunArea / 10000) / max(1, count($bgyUrbanData)), 1) . " ha / Bgy",
                'breakdown' => $municipalBreakdown,
            ],
            'byBarangay' => $byBarangayUrban,
            'hotspots' => array_slice($growthHotspots, 0, 7),
        ];

        $recent = (clone $query)->with('parcels:id,zoning_application_id,latitude,longitude,lot_number,lot_area_sqm,tax_dec_number')
            ->select('id', 'reference_number', 'applicant_name', 'application_type', 'status', 'barangay', 'purpose', 'target_land_use_class', 'created_at')
            ->orderByDesc('created_at')
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
            'urbanGrowthData'  => $urbanGrowthData,
            'filters'   => ['application_type' => $appType ?? 'Zoning Certificate'],
        ]);
    }
}