<?php

namespace Tests\Unit;

use App\Services\LandUseMixService;
use PHPUnit\Framework\TestCase;

class LandUseMixServiceTest extends TestCase
{
    // 2022 Q1 – 2023 Q4, as year * 4 + quarter − 1.
    private const WINDOW = ['from' => '2022-01-01', 'to' => '2023-12-31', 'firstQuarter' => 8088, 'lastQuarter' => 8095];

    private function record(string $barangay, ?string $zone, ?float $area, int $year, int $quarter = 1): object
    {
        return (object) ['barangay' => $barangay, 'zoning_code' => $zone, 'lot_area_sqm' => $area, 'year' => $year, 'quarter' => $quarter];
    }

    /** n equal lots in each of the given zones. */
    private function records(string $barangay, array $zones, int $year, int $quarter = 1, int $n = 5): array
    {
        $out = [];
        foreach ($zones as $zone) {
            for ($i = 0; $i < $n; $i++) {
                $out[] = $this->record($barangay, $zone, 100, $year, $quarter);
            }
        }

        return $out;
    }

    public function test_normalised_shannon_index(): void
    {
        $this->assertSame(0.0, LandUseMixService::shannon([]));
        $this->assertSame(0.0, LandUseMixService::shannon(['residential' => 100]));
        // ln 2 / ln 11
        $this->assertSame(0.29, LandUseMixService::shannon(['residential' => 50, 'commercial' => 50]));
        // All eleven categories in equal shares is the maximum.
        $all = array_fill_keys(array_unique(array_values(LandUseMixService::CATEGORIES)), 1);
        $this->assertCount(LandUseMixService::CATEGORY_COUNT, $all);
        $this->assertSame(1.0, LandUseMixService::shannon($all));
    }

    public function test_zones_are_scored_by_land_use_category(): void
    {
        // R-1 and R-2 are both residential: no mix. Roads are left out.
        $this->assertSame(['residential' => 300], LandUseMixService::byCategory(['R1-Z' => 100, 'R2-Z' => 200, 'ROAD' => 50]));
    }

    public function test_score_follows_recorded_filings_not_the_plan(): void
    {
        // The plan is all farmland (0.00); the filings split evenly in two.
        $plan = ['Tulos' => ['PDA-SZ' => 1_000_000]];
        $records = $this->records('Tulos', ['R1-Z', 'C1-Z'], 2022);

        $b = LandUseMixService::aggregate($plan, $records, self::WINDOW)['barangays']['Tulos'];

        $this->assertSame('records', $b['source']);
        $this->assertSame(0.29, $b['diversity']);
        $this->assertSame(0.0, $b['planDiversity']);
        $this->assertSame(0.29, $b['variance']);
        $this->assertSame(10, $b['records']);
        $this->assertSame(['residential', 'commercial'], array_column($b['distribution'], 'name'));
    }

    public function test_new_filings_move_the_score(): void
    {
        $plan = ['Tulos' => ['PDA-SZ' => 1_000_000]];
        $before = $this->records('Tulos', ['R1-Z'], 2022);
        $after = [...$before, ...$this->records('Tulos', ['C1-Z'], 2023)];

        $this->assertSame(0.0, LandUseMixService::aggregate($plan, $before, self::WINDOW)['barangays']['Tulos']['diversity']);
        $this->assertSame(0.29, LandUseMixService::aggregate($plan, $after, self::WINDOW)['barangays']['Tulos']['diversity']);
    }

    public function test_too_few_filings_fall_back_to_the_plan(): void
    {
        $plan = ['Natu' => ['R1-Z' => 50, 'C1-Z' => 50]];
        $records = [$this->record('Natu', 'I1-Z', 100, 2022)];

        $b = LandUseMixService::aggregate($plan, $records, self::WINDOW)['barangays']['Natu'];

        $this->assertSame('plan', $b['source']);
        $this->assertSame(0.29, $b['diversity']);
        $this->assertNull($b['variance']);
    }

    public function test_spellings_are_matched_and_unusable_rows_skipped(): void
    {
        $plan = ['Maalas-as' => ['R1-Z' => 1], 'Palakpak' => ['R1-Z' => 1]];
        $records = [
            $this->record('Maalas-As', 'R1-Z', 100, 2022),
            $this->record(' palacpac ', 'C1-Z', 100, 2022),
            $this->record('Maalas-As', null, null, 2022),
            $this->record('Maalas-As', 'R2-Z', 0, 2022),
            $this->record('Nowhere', 'I1-Z', 100, 2022),
        ];

        $mix = LandUseMixService::aggregate($plan, $records, self::WINDOW);

        $this->assertSame(1, $mix['barangays']['Maalas-as']['records']);
        $this->assertSame(1, $mix['barangays']['Palakpak']['records']);
        // Unmapped barangays still count toward Rosario.
        $this->assertSame(3, $mix['municipal']['records']);
        $this->assertSame(1, $mix['municipal']['unmappedRecords']);
    }

    public function test_each_step_covers_the_history_there_is_up_to_five_years(): void
    {
        $plan = ['Tulos' => ['PDA-SZ' => 1]];
        // 2022 Q1: residential. 2023 Q3: commercial arrives.
        $records = [
            ...$this->records('Tulos', ['R1-Z'], 2022, 1),
            ...$this->records('Tulos', ['C1-Z'], 2023, 3),
        ];

        $mix = LandUseMixService::aggregate($plan, $records, self::WINDOW);
        $timeline = $mix['timeline'];

        // One step per quarter of the window.
        $this->assertSame(["Q1 '22", "Q2 '22", "Q3 '22", "Q4 '22", "Q1 '23", "Q2 '23", "Q3 '23", "Q4 '23"], array_column($timeline, 'label'));
        // Records start 2022 Q1, so no window reaches back further than that,
        // and every step has less than five years: partial.
        $this->assertSame(array_fill(0, 8, '2022-01-01'), array_column($timeline, 'from'));
        $this->assertSame([1, 2, 3, 4, 5, 6, 7, 8], array_column($timeline, 'quarters'));
        $this->assertSame(array_fill(0, 8, true), array_column($timeline, 'partial'));

        // Residential is never dropped, so the mix appears once commercial does.
        $scores = array_map(fn ($s) => $s['barangays']['Tulos']['diversity'], $timeline);
        $this->assertSame([0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.29, 0.29], $scores);

        // The latest step is the headline score.
        $this->assertSame($mix['barangays']['Tulos']['diversity'], end($timeline)['barangays']['Tulos']['diversity']);
    }

    public function test_window_rolls_forward_and_drops_the_oldest_quarter(): void
    {
        // Window 2023 Q1 – 2027 Q4; records go back to 2022 Q4.
        $window = ['from' => '2023-01-01', 'to' => '2027-12-31', 'firstQuarter' => 2023 * 4, 'lastQuarter' => 2027 * 4 + 3];
        $plan = ['Tulos' => ['PDA-SZ' => 1]];
        $records = [
            ...$this->records('Tulos', ['R1-Z'], 2022, 4),
            ...$this->records('Tulos', ['C1-Z'], 2027, 3),
        ];

        $mix = LandUseMixService::aggregate($plan, $records, $window);
        $timeline = $mix['timeline'];
        $this->assertCount(20, $timeline);
        [$q3, $q4] = array_slice($timeline, -2);

        // Five full years to 2027 Q3 (2022 Q4 – 2027 Q3): both uses, mixed.
        $this->assertSame(['2022-10-01', '2027-09-30', 20, false], [$q3['from'], $q3['to'], $q3['quarters'], $q3['partial']]);
        $this->assertSame(0.29, $q3['barangays']['Tulos']['diversity']);
        $this->assertSame(10, $q3['barangays']['Tulos']['records']);

        // A quarter later 2022 Q4 has rolled out of the window.
        $this->assertSame(['2023-01-01', '2027-12-31', 20, false], [$q4['from'], $q4['to'], $q4['quarters'], $q4['partial']]);
        $this->assertSame(0.0, $q4['barangays']['Tulos']['diversity']);
        $this->assertSame(5, $q4['barangays']['Tulos']['records']);

        // The headline is that latest window.
        $this->assertSame(5, $mix['barangays']['Tulos']['records']);
        $this->assertSame(0.0, $mix['barangays']['Tulos']['diversity']);
    }
}
