<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use App\Models\ApplicationDraft;
use App\Models\SiteInspection;
use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

// Landing page after login: a light summary of the registry and the user's
// own queue. The GIS map lives on /maps.
class OverviewController extends Controller
{
    public function index()
    {
        $user = Auth::user();
        $isAdmin = $user->role === 'Admin';

        $statusCounts = ZoningApplication::select('status', DB::raw('COUNT(*) as cnt'))
            ->groupBy('status')
            ->pluck('cnt', 'status');

        // Filing records and the zoning map spell barangays their own way, so
        // every per-barangay figure below is keyed by the lower-cased name.
        $key = fn ($name) => mb_strtolower(trim((string) $name));
        $bgy = 'LOWER(TRIM(barangay))';

        $statusByBgy = [];
        foreach (ZoningApplication::whereNotNull('barangay')->selectRaw("$bgy AS b, status, COUNT(*) AS cnt")->groupByRaw('1, 2')->get() as $r) {
            $statusByBgy[$r->b][$r->status] = (int) $r->cnt;
        }

        // Locational Clearance volume per quarter from historical_data — the
        // history the forecast is trained on — over the last six full quarters.
        $quarterEnd = now()->startOfQuarter();
        $quarterStart = $quarterEnd->copy()->subQuarters(6);
        $history = DB::table('historical_data')
            ->whereRaw('encoding_date::date >= ? AND encoding_date::date < ?', [$quarterStart->toDateString(), $quarterEnd->toDateString()]);
        $quarterKey = "EXTRACT(YEAR FROM encoding_date::date)::int || '-' || EXTRACT(QUARTER FROM encoding_date::date)::int";
        $counts = (clone $history)
            ->selectRaw("$quarterKey AS q, COUNT(*) AS count")
            ->groupByRaw('1')
            ->pluck('count', 'q');
        // Every quarter in the window, so a quarter with no filings shows as zero.
        $series = fn ($counts) => collect(range(0, 5))->map(function ($i) use ($quarterStart, $counts) {
            $q = $quarterStart->copy()->addQuarters($i);
            return ['year' => $q->year, 'quarter' => $q->quarter, 'count' => (int) ($counts[$q->year.'-'.$q->quarter] ?? 0)];
        });
        $quarterly = $series($counts);
        $quarterlyByBgy = [];
        foreach ((clone $history)->whereNotNull('barangay')->selectRaw("$bgy AS b, $quarterKey AS q, COUNT(*) AS count")->groupByRaw('1, 2')->get() as $r) {
            $quarterlyByBgy[$r->b][$r->q] = (int) $r->count;
        }
        $topBarangays = (clone $history)
            ->whereNotNull('barangay')
            ->where('barangay', '<>', '')
            ->selectRaw('TRIM(barangay) AS name, COUNT(*) AS count')
            ->groupByRaw('TRIM(barangay)')
            ->orderByDesc('count')
            ->limit(8)
            ->get();

        // The latest saved model run, summed per quarter. Never a live call:
        // the forecasting service is slow and may be down.
        $forecast = null;
        $forecastByBgy = [];
        if ($run = Cache::get('forecast.latest')) {
            $byQuarter = fn ($rows) => collect($rows)
                ->groupBy(fn ($d) => $d['year'].'-'.$d['quarter'])
                ->map(fn ($rows) => ['year' => $rows[0]['year'], 'quarter' => $rows[0]['quarter'], 'count' => round($rows->sum('predicted'))])
                ->sortKeys()
                ->values()
                ->take(2);
            $forecastByBgy = collect($run['demand'])->groupBy(fn ($d) => $key($d['barangay'] ?? ''))->map($byQuarter)->all();
            $forecast = [
                'generated_at' => $run['generated_at'],
                'quarters'     => $byQuarter($run['demand']),
                'r2'           => $run['metrics']['validation_r2'] ?? null,
                'wmape'        => $run['metrics']['validation_wmape'] ?? null,
                'mae'          => $run['metrics']['validation_mae'] ?? null,
            ];
        }

        // Land-use mix per barangay (Simpson index over CLUP zone area), the
        // same score the Maps page's diversity view extrudes in 3D.
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

        // Filing-to-release time, from the status history the public tracker reads.
        $releaseSpans = "
            SELECT reference_number, EXTRACT(EPOCH FROM r.t - s.t) / 86400 AS days
            FROM (SELECT reference_number, MIN(created_at) AS t FROM application_status_tracks GROUP BY 1) s
            JOIN (SELECT reference_number, MIN(created_at) AS t FROM application_status_tracks
                  WHERE status ILIKE '%released%' AND status NOT ILIKE '%for release%' GROUP BY 1) r USING (reference_number)
        ";
        $median = 'percentile_cont(0.5) WITHIN GROUP (ORDER BY days) AS median_days, COUNT(*) AS released';
        $release = DB::selectOne("SELECT $median FROM ($releaseSpans) x");
        $releaseByBgy = collect(DB::select("
            SELECT LOWER(TRIM(z.barangay)) AS b, $median
            FROM ($releaseSpans) x JOIN zoning_applications z USING (reference_number)
            WHERE z.barangay IS NOT NULL GROUP BY 1
        "))->keyBy('b');
        $releaseTime = fn ($r) => ['median_days' => $r?->median_days, 'released' => (int) ($r?->released ?? 0)];

        // Everything the page shows for Rosario, again per barangay, so picking
        // one on the map re-scopes every panel without another request.
        $bgyStats = [];
        foreach ($zoneAreas as $name => $areas) {
            $k = $key($name);
            $bgyStats[$name] = [
                'diversity'    => $simpson($areas),
                // CLUP 2030 zone code => area, for the zoning composition beside the map.
                'zones'        => array_map('round', $areas),
                'statusCounts' => $statusByBgy[$k] ?? [],
                'quarterly'    => $series($quarterlyByBgy[$k] ?? []),
                'forecast'     => $forecastByBgy[$k] ?? [],
                'releaseTime'  => $releaseTime($releaseByBgy[$k] ?? null),
            ];
        }

        return Inertia::render('Overview', [
            'releaseTime'  => $releaseTime($release),
            // Field app round-trip: assigned, findings synced back, delivery failures.
            'inspections'  => $isAdmin ? [
                'open'      => SiteInspection::whereNull('submitted_at')->whereNull('completed_at')->count(),
                'synced'    => SiteInspection::whereNotNull('submitted_at')->count(),
                'failed'    => SiteInspection::where('delivery_status', 'failed')->count(),
            ] : null,
            'statusCounts' => $statusCounts,
            'quarterly'    => $quarterly,
            'topBarangays' => $topBarangays,
            'forecast'     => $forecast,
            'bgyStats'     => $bgyStats,
            'municipalDiversity' => $simpson($municipalAreas),
            'municipalZones' => array_map('round', $municipalAreas),
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
