<?php

namespace App\Services;

use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * Land-use mix per barangay: the normalised Shannon entropy index
 *
 *     LUM = −Σ pᵢ ln pᵢ / ln K
 *
 * where pᵢ is land-use category i's share of the land area and K is the number
 * of categories (the 11 official CLUP 2030 categories). 0 means a single land
 * use; 1 means all eleven in equal shares.
 *
 * Two versions of the score are computed:
 *  - recorded mix: the lot area of every clearance, certificate and permit in
 *    historical_data over the last five years, grouped by the category of the
 *    zone it was filed under. This is the headline score. It moves as new
 *    records come in, so it tracks what is actually being developed.
 *  - plan mix: the area of each CLUP 2030 zone. It does not change until the
 *    plan is amended, so it is the baseline the recorded mix is compared to.
 *
 * The Maps page's time slider repeats the score once per quarter over the
 * last five years, each step over the five years ending that quarter, so
 * every step is a rolling five-year window. A step whose five years reach
 * back before the first recorded filing covers only the history there is, and
 * is marked partial.
 *
 * The window is anchored on the latest filing, not on a fixed date: importing
 * a new quarter of records moves every window forward and drops the oldest
 * quarter.
 *
 * Both the Maps page and the Overview read this class, so the two pages always
 * show the same score.
 */
class LandUseMixService
{
    /** Length of the rolling window, in years. */
    public const WINDOW_YEARS = 5;

    /** The same, in quarters. */
    public const WINDOW_QUARTERS = self::WINDOW_YEARS * 4;

    /**
     * A score needs at least this many records with a lot area; with fewer,
     * one large lot decides the whole score.
     */
    public const MIN_RECORDS = 5;

    /** Filing-record spellings the zoning map spells differently. */
    public const ALIASES = ['palakpak' => 'palacpac'];

    /**
     * CLUP 2030 zone code => land-use category, as in clupZones.js. Roads are
     * left out: no clearance is filed for a road, so counting them would give
     * the plan a land use the records can never have.
     */
    public const CATEGORIES = [
        'PDA-SZ' => 'agricultural', 'PTA-SZ-RA' => 'agricultural', '5491-APDA-SZ' => 'agricultural',
        'FZ' => 'forest', 'FR-SZ' => 'forest', 'THSP-SZ' => 'forest',
        'WZ' => 'water',
        'R1-Z' => 'residential', 'R2-Z' => 'residential', 'BR2-SZ' => 'residential', 'MR2-SZ' => 'residential', 'Residential' => 'residential',
        'C1-Z' => 'commercial', 'C2-Z' => 'commercial',
        'I1-Z' => 'industrial', 'I2-Z' => 'industrial', 'I3-Z' => 'industrial',
        'AgIndZ' => 'agroIndustrial', 'AgIndZ-PTR' => 'agroIndustrial', 'AgIndZ-PGR' => 'agroIndustrial',
        'GI-Z' => 'institutional',
        'PR-Z' => 'parks', 'C/MP-Z' => 'parks',
        'T-Z' => 'tourism', 'ECT-Z' => 'tourism',
        'UTS-Z' => 'utilities', 'CMRF' => 'utilities',
    ];

    /** K in the formula: every category a zone can fall in. */
    public const CATEGORY_COUNT = 11;

    /** Normalised Shannon index over category => area, rounded to two places. */
    public static function shannon(array $areas): float
    {
        $total = array_sum($areas);
        if ($total <= 0) {
            return 0.0;
        }
        $h = 0.0;
        foreach ($areas as $area) {
            if ($area > 0) {
                $p = $area / $total;
                $h -= $p * log($p);
            }
        }

        return round($h / log(self::CATEGORY_COUNT), 2);
    }

    /** Zone code => area folded into category => area; unknown codes dropped. */
    public static function byCategory(array $zoneAreas): array
    {
        $out = [];
        foreach ($zoneAreas as $zone => $area) {
            $cat = self::CATEGORIES[trim((string) $zone)] ?? null;
            if ($cat !== null) {
                $out[$cat] = ($out[$cat] ?? 0) + $area;
            }
        }

        return $out;
    }

    /** Category shares as [{name, value}] in percent, largest first. */
    public static function distribution(array $areas, int $precision = 1): array
    {
        $total = array_sum($areas);
        if ($total <= 0) {
            return [];
        }
        $rows = [];
        foreach ($areas as $cat => $area) {
            $rows[] = ['name' => $cat, 'value' => round($area / $total * 100, $precision)];
        }
        usort($rows, fn ($a, $b) => $b['value'] <=> $a['value']);

        return $rows;
    }

    /**
     * Everything the diversity views need, keyed by the plan's spelling of
     * each barangay. Pass $plan when the caller already loaded planAreas().
     *
     * @return array{
     *   window: array{from: string|null, to: string|null},
     *   barangays: array<string, array>,
     *   municipal: array,
     *   timeline: array<int, array>,
     * }
     */
    public function compute(?array $plan = null): array
    {
        $plan ??= $this->planAreas();
        $window = $this->window();
        // The earliest slider step's window starts five years before the
        // headline window does.
        $records = $window['to']
            ? $this->developmentRecords(
                self::quarterStart($window['firstQuarter'] - self::WINDOW_QUARTERS + 1)->toDateString(),
                $window['to'],
            )
            : collect();

        return self::aggregate($plan, $records, $window);
    }

    /**
     * Pure part of compute(), kept apart so it can be tested without a
     * database.
     *
     * @param array<string, array<string, float>> $plan  barangay => zone => area (plan spelling)
     * @param iterable $records  rows with barangay, zoning_code, lot_area_sqm, year, quarter
     * @param array $window  from/to dates plus firstQuarter/lastQuarter as year * 4 + quarter − 1
     */
    public static function aggregate(array $plan, iterable $records, array $window): array
    {
        // Filing records and the zoning map spell some barangays differently
        // ("Maalas-As" / "Maalas-as", "Palakpak" / "Palacpac"), so records are
        // matched case-insensitively, through ALIASES, and filed under the
        // plan's spelling.
        $key = function ($name) {
            $k = mb_strtolower(trim((string) $name));

            return self::ALIASES[$k] ?? $k;
        };
        $names = [];
        foreach (array_keys($plan) as $name) {
            $names[$key($name)] = $name;
        }

        // Category areas and record counts per barangay per quarter. '' is
        // Rosario as a whole, which also takes barangays the map does not have.
        $byQuarter = [];
        $counts = [];
        $unmapped = 0;
        $dataFirst = null;
        foreach ($records as $r) {
            $cat = self::CATEGORIES[trim((string) $r->zoning_code)] ?? null;
            $area = (float) $r->lot_area_sqm;
            if ($cat === null || $area <= 0) {
                continue;
            }
            $q = (int) $r->year * 4 + (int) $r->quarter - 1;
            $dataFirst = $dataFirst === null ? $q : min($dataFirst, $q);
            $name = $names[$key($r->barangay)] ?? null;
            // Unmapped counts only the headline window, like 'records'.
            if ($name === null && $q >= ($window['firstQuarter'] ?? PHP_INT_MIN)) {
                $unmapped++;
            }
            foreach ($name === null ? [''] : ['', $name] as $who) {
                $byQuarter[$who][$q][$cat] = ($byQuarter[$who][$q][$cat] ?? 0) + $area;
                $counts[$who][$q] = ($counts[$who][$q] ?? 0) + 1;
            }
        }

        // Category areas and record count for one area over quarters [from, to].
        $span = function (string $who, int $from, int $to) use ($byQuarter, $counts) {
            $areas = [];
            $n = 0;
            for ($q = $from; $q <= $to; $q++) {
                foreach ($byQuarter[$who][$q] ?? [] as $cat => $a) {
                    $areas[$cat] = ($areas[$cat] ?? 0) + $a;
                }
                $n += $counts[$who][$q] ?? 0;
            }

            return [$areas, $n];
        };

        $first = $window['firstQuarter'] ?? null;
        $last = $window['lastQuarter'] ?? null;
        $hasWindow = $first !== null && $last !== null;

        // Headline score over the whole window, against the plan.
        $summary = function (string $who, array $planZones) use ($span, $first, $last, $hasWindow) {
            $planAreas = self::byCategory($planZones);
            $planScore = self::shannon($planAreas);
            [$areas, $n] = $hasWindow ? $span($who, $first, $last) : [[], 0];
            // Too few records to score: fall back to the plan, and say so.
            $fromRecords = $n >= self::MIN_RECORDS;
            $score = $fromRecords ? self::shannon($areas) : $planScore;

            return [
                'diversity'        => $score,
                'source'           => $fromRecords ? 'records' : 'plan',
                'planDiversity'    => $planScore,
                'variance'         => round($score - $planScore, 2),
                'distribution'     => self::distribution($fromRecords ? $areas : $planAreas),
                'planDistribution' => self::distribution($planAreas),
                'records'          => $n,
                'developedHa'      => round(array_sum($areas) / 10000, 1),
            ];
        };

        $barangays = [];
        $munPlan = [];
        foreach ($plan as $name => $zones) {
            $barangays[$name] = $summary($name, $zones);
            foreach ($zones as $zone => $area) {
                $munPlan[$zone] = ($munPlan[$zone] ?? 0) + $area;
            }
        }
        $municipal = $summary('', $munPlan) + [
            'unmappedRecords' => $unmapped,
            'planZones'       => $munPlan,
        ];

        // One slider step per quarter of the headline window, each scored
        // over the five years ending that quarter. The last step is the
        // headline window itself.
        $timeline = [];
        if ($hasWindow) {
            for ($end = $first; $end <= $last; $end++) {
                // Never before the first recorded filing: a window that reaches
                // further back covers only the history there is.
                $start = max($end - self::WINDOW_QUARTERS + 1, $dataFirst ?? $first);
                $quarters = $end - $start + 1;
                $step = [
                    'year'      => intdiv($end, 4),
                    'quarter'   => $end % 4 + 1,
                    'label'     => sprintf("Q%d '%02d", $end % 4 + 1, intdiv($end, 4) % 100),
                    'from'      => self::quarterStart($start)->toDateString(),
                    'to'        => self::quarterStart($end + 1)->subDay()->toDateString(),
                    'quarters'  => $quarters,
                    'partial'   => $quarters < self::WINDOW_QUARTERS,
                    'barangays' => [],
                ];
                foreach (array_merge([''], array_keys($plan)) as $who) {
                    [$areas, $n] = $span($who, $start, $end);
                    $scored = $n >= self::MIN_RECORDS;
                    $entry = [
                        'diversity'    => $scored ? self::shannon($areas) : null,
                        'records'      => $n,
                        'distribution' => $scored ? self::distribution($areas, 0) : [],
                        'developedHa'  => round(array_sum($areas) / 10000, 1),
                    ];
                    if ($who === '') {
                        $step['municipal'] = $entry;
                    } else {
                        $step['barangays'][$who] = $entry;
                    }
                }
                $timeline[] = $step;
            }
        }

        return [
            'window'    => ['from' => $window['from'] ?? null, 'to' => $window['to'] ?? null],
            'barangays' => $barangays,
            'municipal' => $municipal,
            'timeline'  => $timeline,
        ];
    }

    /** First day of quarter index q (year * 4 + quarter − 1). */
    private static function quarterStart(int $q): CarbonImmutable
    {
        return CarbonImmutable::create(intdiv($q, 4), ($q % 4) * 3 + 1, 1);
    }

    /** CLUP 2030 zone area per barangay: barangay => zone => m². */
    public function planAreas(): array
    {
        $areas = [];
        $rows = DB::table('land_use_plan')
            ->select('location', 'lup_2030', DB::raw('SUM(shape_area) as area'))
            ->whereNotNull('location')
            ->groupBy('location', 'lup_2030')
            ->get();
        foreach ($rows as $row) {
            $b = trim($row->location);
            $areas[$b][$row->lup_2030] = ($areas[$b][$row->lup_2030] ?? 0) + (float) $row->area;
        }

        return $areas;
    }

    /**
     * The last five years of whole quarters, ending with the quarter of the
     * latest recorded filing rather than today, so a late import never leaves
     * the newest quarters empty.
     */
    public function window(): array
    {
        $latest = DB::table('historical_data')->max('encoding_date');
        if (!$latest) {
            return ['from' => null, 'to' => null, 'firstQuarter' => null, 'lastQuarter' => null];
        }
        $d = CarbonImmutable::parse($latest);
        $last = $d->year * 4 + $d->quarter - 1;
        $first = $last - self::WINDOW_QUARTERS + 1;

        return [
            'from'         => self::quarterStart($first)->toDateString(),
            'to'           => self::quarterStart($last + 1)->subDay()->toDateString(),
            'firstQuarter' => $first,
            'lastQuarter'  => $last,
        ];
    }

    /** Filings with a zone and lot area inside [from, to]. */
    public function developmentRecords(string $from, string $to)
    {
        return DB::table('historical_data')
            ->selectRaw('barangay, zoning_code, lot_area_sqm,
                EXTRACT(YEAR FROM encoding_date::date)::int AS year,
                EXTRACT(QUARTER FROM encoding_date::date)::int AS quarter')
            ->whereNotNull('zoning_code')
            ->where('lot_area_sqm', '>', 0)
            ->whereRaw('encoding_date::date BETWEEN ? AND ?', [$from, $to])
            ->get();
    }
}
