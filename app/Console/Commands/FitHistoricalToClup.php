<?php

namespace App\Console\Commands;

use App\Services\LandUseMixService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Fits the modeled Locational Clearance rows of historical_data to the CLUP
 * 2030 plan, so the Diversity Index never shows a barangay filing more land
 * under a zone than the plan gives it.
 *
 * seed_imaps_history.py drew each row's zoning code from the town-wide mix,
 * without looking at the barangay's plan: Bagong Pook got 4.1 ha of Tourism
 * filings against a 0.06 ha Tourism zone. This goes through the rows and, per
 * barangay and zone, keeps the filed lot area under --cap of the zoned area:
 *
 *  - a row whose zone is in its barangay's plan and still has room is kept as
 *    it is;
 *  - any other row is moved to a zone of its barangay that has room, larger
 *    zones more often, with a lot area in that zone's usual range that fits;
 *  - a development purpose that does not suit the row's zone (a Farm
 *    Development Permit in a residential zone) is swapped for one that does.
 *    Paperwork purposes (bank financing, land title...) fit any zone;
 *  - a row no zone of its barangay has room for (the small, busy Poblacion
 *    barangays) loses its zoning code and lot area, like the rows that never
 *    had one. It still counts for the forecast, not for the land-use mix.
 *
 * Dates, barangays, form numbers, applicants and fees are never touched, so
 * the forecast's monthly and per-barangay counts stay the same. Rows without
 * a zoning code stay blank. The same seed on the same data gives the same
 * result, and running it again on fitted data changes nothing.
 */
class FitHistoricalToClup extends Command
{
    protected $signature = 'historical:fit-to-clup
        {--cap=0.2 : Most of a zone\'s planned area that its filings may add up to (0-1)}
        {--seed=2026 : Random seed; the same seed on the same data gives the same result}
        {--apply : Write the changes; without it, only report what would change}
        {--sql= : Also write the changes as UPDATE statements (keyed by form number) to this file}
        {--force : Do not ask for confirmation}';

    protected $description = 'Fit the modeled Locational Clearance zoning codes and lot areas to the CLUP 2030 plan';

    /** Plan pieces no clearance is filed under. */
    private const NOT_FILED = ['ROAD', 'PROPOSED ROAD'];

    /**
     * A barangay's zone gets its town-wide share of filings once it is well
     * above this size (m²); smaller zones get proportionally fewer.
     */
    private const HALF_WEIGHT_SQM = 50_000;

    /** Development purposes that suit each land-use category. */
    private const PURPOSES = [
        'residential'    => ['Residential Construction', 'Subdivision Phase 1'],
        'commercial'     => ['Commercial Building Construction', 'Commercial Complex Development'],
        'industrial'     => ['Warehouse/Factory Construction', 'Industrial Park Expansion', 'Facility/Structure Construction'],
        'agroIndustrial' => ['Agribusiness Construction', 'Warehouse/Factory Construction'],
        'agricultural'   => ['Farm Development Permit', 'Agribusiness Construction'],
        'forest'         => ['Site Development Permit'],
        'institutional'  => ['Facility/Structure Construction', 'Site Development Permit'],
        'parks'          => ['Site Development Permit', 'Facility/Structure Construction'],
        'tourism'        => ['Site Development Permit', 'Commercial Complex Development', 'Facility/Structure Construction'],
        'utilities'      => ['Facility/Structure Construction', 'Site Development Permit'],
        'water'          => ['Site Development Permit'],
    ];

    public function handle(LandUseMixService $mix): int
    {
        $cap = (float) $this->option('cap');
        if ($cap <= 0 || $cap > 1) {
            $this->error('--cap must be above 0 and at most 1.');

            return self::FAILURE;
        }
        mt_srand((int) $this->option('seed'));

        // Barangay => zone => m², under the records' barangay key.
        $plan = [];
        foreach ($mix->planAreas() as $name => $zones) {
            $plan[$this->key($name)] = array_diff_key($zones, array_flip(self::NOT_FILED));
        }

        $rows = DB::table('historical_data')
            ->select('id', 'form_number', 'barangay', 'zoning_code', 'lot_area_sqm', 'purpose')
            ->where('application_type', LandUseMixService::APPLICATION_TYPE)
            ->whereNotNull('zoning_code')
            ->where('zoning_code', '<>', '')
            ->orderBy('encoding_date')
            ->orderBy('id')
            ->get();
        if ($rows->isEmpty()) {
            $this->info('No Locational Clearance rows with a zoning code.');

            return self::SUCCESS;
        }

        // Each code's usual lot size and town-wide share of filings, from the rows as they are.
        $range = [];
        $share = [];
        foreach ($rows->groupBy('zoning_code') as $code => $group) {
            $areas = $group->pluck('lot_area_sqm')->filter()->map(fn ($a) => (float) $a);
            if ($areas->isNotEmpty()) {
                $range[$code] = [$areas->min(), $areas->max()];
            }
            $share[$code] = $group->count() / $rows->count();
        }

        // Rows are taken in a shuffled order, not by date: where a barangay's
        // zones cannot hold all its filings, the ones left uncoded are then
        // spread over the years instead of all being the latest.
        $order = $rows->all();
        for ($i = count($order) - 1; $i > 0; $i--) {
            $j = mt_rand(0, $i);
            [$order[$i], $order[$j]] = [$order[$j], $order[$i]];
        }

        $development = array_flip(LandUseMixService::DEVELOPMENT_PURPOSES);
        $used = [];
        $changes = [];
        $unmapped = 0;
        $stranded = 0;
        $before = [];
        foreach ($order as $r) {
            $b = $this->key($r->barangay);
            $area = (float) $r->lot_area_sqm;
            $before[$b][$r->zoning_code] = ($before[$b][$r->zoning_code] ?? 0) + $area;
            if (!isset($plan[$b])) {
                $unmapped++;
                continue;
            }

            $code = $r->zoning_code;
            $room = fn ($c) => $cap * ($plan[$b][$c] ?? 0) - ($used[$b][$c] ?? 0);
            if (!isset($plan[$b][$code]) || $area > $room($code)) {
                // Move it to a zone of this barangay with room for a usual lot.
                $weights = [];
                foreach ($plan[$b] as $c => $zoned) {
                    if (isset($range[$c]) && $room($c) >= $range[$c][0]) {
                        $weights[$c] = ($share[$c] ?? 0) * $zoned / ($zoned + self::HALF_WEIGHT_SQM);
                    }
                }
                $code = $this->pick($weights);
                if ($code === null) {
                    // Every zone of the barangay is full: leave the row uncoded.
                    $stranded++;
                    $changes[$r->id] = ['form_number' => $r->form_number, 'zoning_code' => '', 'lot_area_sqm' => null, 'purpose' => $r->purpose];
                    continue;
                }
                [$min, $max] = $range[$code];
                $area = round($min + $this->random() * (min($max, $room($code)) - $min), 2);
            }
            $used[$b][$code] = ($used[$b][$code] ?? 0) + $area;

            $purpose = $r->purpose;
            $suits = self::PURPOSES[LandUseMixService::CATEGORIES[$code] ?? 'utilities'];
            if (isset($development[$purpose]) && !in_array($purpose, $suits, true)) {
                $purpose = $suits[mt_rand(0, count($suits) - 1)];
            }

            if ($code !== $r->zoning_code || abs($area - (float) $r->lot_area_sqm) > 0.005 || $purpose !== $r->purpose) {
                $changes[$r->id] = ['form_number' => $r->form_number, 'zoning_code' => $code, 'lot_area_sqm' => $area, 'purpose' => $purpose];
            }
        }

        $this->report($rows, $changes, $plan, $before, $used, $cap, $unmapped, $stranded);

        if ($sql = $this->option('sql')) {
            file_put_contents($sql, $this->toSql($changes, $cap));
            $this->info('Wrote '.count($changes)." UPDATE statements to {$sql}.");
        }
        if (!$this->option('apply')) {
            $this->comment('Nothing written. Run again with --apply to save the changes.');

            return self::SUCCESS;
        }
        if ($changes === []) {
            $this->info('Already fitted; nothing to write.');

            return self::SUCCESS;
        }
        if (!$this->option('force') && !$this->confirm('Update '.count($changes).' rows of historical_data on '.DB::connection()->getDatabaseName().'?')) {
            return self::FAILURE;
        }
        DB::transaction(function () use ($changes) {
            foreach ($changes as $id => $c) {
                DB::table('historical_data')->where('id', $id)->update([
                    'zoning_code'  => $c['zoning_code'],
                    'lot_area_sqm' => $c['lot_area_sqm'],
                    'purpose'      => $c['purpose'],
                    'updated_at'   => now(),
                ]);
            }
        });
        $this->info('Updated '.count($changes).' rows.');

        return self::SUCCESS;
    }

    /** Records and the plan spell some barangays differently; match as LandUseMixService does. */
    private function key(?string $name): string
    {
        $k = mb_strtolower(trim((string) $name));

        return LandUseMixService::ALIASES[$k] ?? $k;
    }

    private function random(): float
    {
        return mt_rand() / mt_getrandmax();
    }

    /** A key drawn with probability proportional to its weight; null when there is none. */
    private function pick(array $weights): ?string
    {
        $total = array_sum($weights);
        if ($total <= 0) {
            return null;
        }
        $x = $this->random() * $total;
        foreach ($weights as $key => $w) {
            if (($x -= $w) <= 0) {
                return (string) $key;
            }
        }

        return (string) array_key_last($weights);
    }

    private function report($rows, array $changes, array $plan, array $before, array $used, float $cap, int $unmapped, int $stranded): void
    {
        $byField = ['zoning_code' => 0, 'lot_area_sqm' => 0, 'purpose' => 0];
        $original = $rows->keyBy('id');
        foreach ($changes as $id => $c) {
            $o = $original[$id];
            $byField['zoning_code'] += $c['zoning_code'] !== $o->zoning_code;
            $byField['lot_area_sqm'] += abs((float) $c['lot_area_sqm'] - (float) $o->lot_area_sqm) > 0.005;
            $byField['purpose'] += $c['purpose'] !== $o->purpose;
        }

        // Barangay zones whose filings add up to more than the cap, or more than the zone itself.
        $over = function (array $filed) use ($plan, $cap) {
            $overCap = 0;
            $overZone = 0;
            $worst = 0;
            foreach ($filed as $b => $zones) {
                foreach ($zones as $code => $area) {
                    if (!isset($plan[$b]) || $area <= 0) {
                        continue;
                    }
                    $zoned = $plan[$b][$code] ?? 0;
                    $ratio = $zoned > 0 ? $area / $zoned : INF;
                    $overCap += $ratio > $cap + 1e-9;
                    $overZone += $ratio > 1;
                    $worst = max($worst, $ratio);
                }
            }

            return [$overCap, $overZone, is_infinite($worst) ? 'zone not in plan' : round($worst * 100).'%'];
        };

        [$was, $now] = [$over($before), $over($used)];
        $this->table(['', 'Before', 'After'], [
            ['Barangay zones over '.round($cap * 100).'% filed', $was[0], $now[0]],
            ['Barangay zones over 100% filed (or not in plan)', $was[1], $now[1]],
            ['Most filed of one zone', $was[2], $now[2]],
        ]);
        $this->line(sprintf(
            '%d coded Locational Clearance rows: %d to change (zoning code %d, lot area %d, purpose %d).',
            $rows->count(), count($changes), $byField['zoning_code'], $byField['lot_area_sqm'], $byField['purpose'],
        ));
        if ($unmapped) {
            $this->warn("{$unmapped} rows are in a barangay the plan does not have; left as they are.");
        }
        if ($stranded) {
            $this->warn("{$stranded} rows had no zone with room left in their barangay; their zoning code is cleared.");
        }
    }

    private function toSql(array $changes, float $cap): string
    {
        $q = fn ($v) => $v === null ? 'NULL' : "'".str_replace("'", "''", (string) $v)."'";
        $lines = [
            '-- Generated by `php artisan historical:fit-to-clup --cap='.$cap.' --seed='.$this->option('seed').'`.',
            '-- Fits the modeled Locational Clearance rows of historical_data to the',
            '-- CLUP 2030 plan: zoning code, lot area and purpose only, by form number.',
            '-- Back up historical_data before applying.',
            '',
            'BEGIN;',
            '',
        ];
        foreach ($changes as $c) {
            $area = $c['lot_area_sqm'] === null ? 'NULL' : sprintf('%.2f', $c['lot_area_sqm']);
            $lines[] = 'UPDATE public.historical_data SET zoning_code = '.$q($c['zoning_code']).", lot_area_sqm = {$area}, purpose = ".$q($c['purpose'])
                .', updated_at = now() WHERE form_number = '.$q($c['form_number'])." AND application_type = 'Locational Clearance';";
        }
        $lines[] = '';
        $lines[] = 'COMMIT;';
        $lines[] = '';

        return implode("\n", $lines);
    }
}
