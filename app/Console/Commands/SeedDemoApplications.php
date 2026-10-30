<?php

namespace App\Console\Commands;

use App\Jobs\PushInspectionToSupabase;
use App\Jobs\PushPlanningReviewToSupabase;
use App\Models\InspectionDeliveryAttempt;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\ApplicationStatusTracker;
use App\Services\PermitExcelService;
use App\Services\SupabaseService;
use Illuminate\Console\Command;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Fills the registry with sample applications spread over every workflow stage:
 * awaiting review, inspection scheduled / overdue / returned, reinspection,
 * denied, under the Sangguniang Bayan, for release and released (with permits).
 *
 * Every record is written the way the controllers write it (same statuses,
 * review rounds, inspection rounds, ownership history, status timeline and
 * audit notes), only backdated, so the pages read like months of real use.
 * Parcels are sampled from land_parcels, so they sit on the map.
 *
 * Nothing leaves the database unless --sync (or later --push) is given. Then
 * the FieldSync side is played out too: every round is delivered by the real
 * PushInspectionToSupabase job, returned rounds are completed on the field job
 * the way the app records them (steps, GPS, checklist, activity feed), the
 * Planning Review of each returned round goes out through
 * PushPlanningReviewToSupabase, the status timeline reaches the public tracker,
 * and the results are pulled back with sync:pull-inspections. --purge removes
 * the remote copies as well. No in-app notifications are sent either way.
 */
class SeedDemoApplications extends Command
{
    protected $signature = 'demo:applications
        {--count=50 : How many applications to create}
        {--seed=2026 : Random seed; the same seed on the same data gives the same applications}
        {--shuffle : Draw the scenarios, parcel counts and officers at random instead of the fixed interleaved spread}
        {--inspector= : Site Inspector (id or name) who takes about half of the inspection rounds}
        {--sync : Also play the applications out on Supabase (FieldSync app and public tracker)}
        {--push : Instead of creating any, play the sample applications already here out on Supabase (skips what is already there)}
        {--dry-run : Show who and what would be used, write nothing}
        {--purge : Delete the sample applications this command created, instead of creating any}
        {--force : Do not ask for confirmation}';

    protected $description = 'Create sample zoning applications across every workflow stage (or remove them with --purge)';

    // A sample application carries both markers, so --purge never touches a real filing.
    private const EMAIL_DOMAIN = 'example.com';
    private const FORM_PREFIX = 'U-8';

    /**
     * key => [count, how many of them are multi-parcel, stream, steps].
     *
     * Steps: encode | inspect (Needs Site Inspection) | reinspect (Requires
     * Reinspection) | compliant / discrepancy / returned (inspector submits the
     * round; returned = any result) | approve | decline | ordinance (SB
     * ordinance recorded, moved to For Release) | release (permits generated,
     * Released).
     */
    private const SCENARIOS = [
        'awaiting_review'              => [5, 1, 'permit',    ['encode']],
        'inspection_scheduled'         => [6, 2, 'permit',    ['encode', 'inspect']],
        'inspection_returned'          => [5, 1, 'permit',    ['encode', 'inspect', 'returned']],
        'reinspection_scheduled'       => [2, 0, 'permit',    ['encode', 'inspect', 'discrepancy', 'reinspect']],
        'denied_at_review'             => [3, 0, 'permit',    ['encode', 'decline']],
        'denied_after_inspection'      => [3, 1, 'permit',    ['encode', 'inspect', 'discrepancy', 'decline']],
        'for_release'                  => [4, 1, 'permit',    ['encode', 'approve']],
        'for_release_after_inspection' => [3, 0, 'permit',    ['encode', 'inspect', 'compliant', 'approve']],
        'released'                     => [6, 2, 'permit',    ['encode', 'approve', 'release']],
        'released_after_inspection'    => [5, 1, 'permit',    ['encode', 'inspect', 'compliant', 'approve', 'release']],
        'sb_pending'                   => [3, 1, 'amendment', ['encode', 'approve']],
        'sb_after_inspection'          => [2, 0, 'amendment', ['encode', 'inspect', 'compliant', 'approve']],
        'sb_released'                  => [2, 0, 'amendment', ['encode', 'approve', 'ordinance', 'release']],
        'reinspected_then_released'    => [1, 0, 'permit',    ['encode', 'inspect', 'discrepancy', 'reinspect', 'compliant', 'approve', 'release']],
    ];

    private const CLASSES = [
        'residential'   => ['R1-Z', 'R2-Z', 'MR2-SZ', 'BR2-SZ'],
        'commercial'    => ['C1-Z', 'C2-Z', 'C/MP-Z'],
        'industrial'    => ['I1-Z', 'I2-Z', 'I3-Z'],
        'agricultural'  => ['AgIndZ', 'AgIndZ-PTR', 'AgIndZ-PGR'],
        'institutional' => ['GI-Z'],
    ];

    private const CATEGORY_WEIGHTS = ['residential' => 38, 'commercial' => 30, 'industrial' => 12, 'agricultural' => 14, 'institutional' => 6];

    // [business name, purpose, short use, types, building area range, project cost range, corporation, saleable lots range]
    private const PROJECTS = [
        'residential' => [
            [null, 'Construction of a two-storey single-detached residential house', 'residential house', ['Locational Clearance'], [90, 220], [1_200_000, 3_500_000], null, null],
            [null, 'Construction of a bungalow-type residential house', 'residential house', ['Locational Clearance'], [60, 120], [800_000, 1_800_000], null, null],
            ['{last} Apartment', 'Construction of a six-door two-storey apartment building', 'apartment building', ['Locational Clearance', 'Zoning Certificate'], [280, 420], [4_000_000, 7_500_000], null, null],
            ['{last} Sari-Sari Store', 'Sari-sari store attached to the existing residence', 'sari-sari store', ['Zoning Certificate'], [12, 30], [50_000, 150_000], null, null],
            ['Villa {brgy} Homes', 'Residential subdivision development with road network and drainage', 'residential subdivision', ['Preliminary Approval and Locational Clearance (PALC)', 'Development Permit'], null, [18_000_000, 45_000_000], 'Batangas Southridge Land Corp.', [12, 40]],
        ],
        'commercial' => [
            ['{last} Bakeshop', 'Operation of a bakery and pastry shop', 'bakery', ['Zoning Certificate'], [40, 90], [300_000, 900_000], null, null],
            ['{last} Hardware & Construction Supply', 'Hardware and construction supply store with stockyard', 'hardware store', ['Locational Clearance', 'Zoning Certificate'], [150, 400], [1_500_000, 4_000_000], null, null],
            ['{brgy} Water Refilling Station', 'Purified water refilling station', 'water refilling station', ['Zoning Certificate'], [25, 60], [250_000, 600_000], null, null],
            ['{last} Auto Repair Shop', 'Automotive repair and vulcanizing shop', 'auto repair shop', ['Locational Clearance', 'Zoning Certificate'], [120, 300], [700_000, 2_000_000], null, null],
            ['{last} Dental Clinic', 'Dental clinic on the ground floor of an existing building', 'dental clinic', ['Zoning Certificate'], [40, 80], [400_000, 1_200_000], null, null],
            ['{last} Commercial Building', 'Construction of a three-storey commercial building with ground-floor retail', 'commercial building', ['Locational Clearance'], [450, 900], [9_000_000, 18_000_000], 'Lipa-Rosario Development Corp.', null],
            ['Kapihan sa {brgy}', 'Coffee shop and snack bar', 'coffee shop', ['Zoning Certificate'], [35, 90], [350_000, 1_000_000], null, null],
            ['Rosario Fuels Station', 'Construction and operation of a gasoline service station', 'gasoline station', ['Locational Clearance', 'Zoning Certificate'], [180, 350], [12_000_000, 20_000_000], 'Pinagsibaan Fuel Corp.', null],
        ],
        'industrial' => [
            ['{last} Rice & Feeds Trading', 'Warehouse for rice and animal feeds trading', 'warehouse', ['Locational Clearance'], [300, 800], [3_000_000, 8_000_000], null, null],
            ['{last} Hollow Blocks', 'Hollow blocks manufacturing plant', 'hollow blocks plant', ['Locational Clearance', 'Zoning Certificate'], [200, 500], [1_500_000, 4_000_000], null, null],
            ['Silangan Cold Storage', 'Cold storage facility for agricultural produce', 'cold storage facility', ['Locational Clearance'], [600, 1500], [15_000_000, 35_000_000], 'Silangan Cold Chain Inc.', null],
            ['{last} Steel Works', 'Steel fabrication and welding shop', 'steel fabrication shop', ['Locational Clearance', 'Zoning Certificate'], [250, 600], [2_500_000, 6_000_000], 'Marasigan Steelworks Inc.', null],
        ],
        'agricultural' => [
            ['{last} Poultry Farm', 'Poultry layer farm, 5,000 heads', 'poultry farm', ['Locational Clearance'], [400, 1200], [2_000_000, 5_000_000], null, null],
            ['{last} Piggery', 'Backyard piggery, 40 heads, with septic and biogas digester', 'piggery', ['Locational Clearance'], [150, 350], [600_000, 1_500_000], null, null],
            ['{last} Rice Mill', 'Rice mill and palay drying pavement', 'rice mill', ['Locational Clearance', 'Zoning Certificate'], [250, 600], [2_500_000, 6_000_000], 'Rosario Agri-Ventures Inc.', null],
            [null, 'Agricultural produce consolidation and packing shed', 'packing shed', ['Locational Clearance'], [120, 300], [500_000, 1_500_000], null, null],
        ],
        'institutional' => [
            ['Little Learners Academy', 'Expansion of a private preschool, two additional classrooms', 'school expansion', ['Locational Clearance'], [120, 260], [2_000_000, 4_500_000], 'Little Learners Academy of Rosario, Inc.', null],
            ['{brgy} Chapel', 'Construction of a barangay chapel', 'chapel', ['Locational Clearance'], [150, 300], [1_500_000, 3_500_000], '{brgy} Pastoral Council', null],
        ],
    ];

    // Agricultural lots petitioned into another zone: [target class, purpose, short use, types, business name]
    private const AMENDMENTS = [
        ['R1-Z', 'Reclassification of agricultural land to residential use for a subdivision', 'residential subdivision', ['Petition for Reclassification'], 'Villa {brgy} Homes'],
        ['C1-Z', 'Rezoning of an agri-industrial lot to commercial use for a roadside commercial strip', 'commercial strip', ['Locational Clearance', 'Petition for Rezoning'], '{last} Commercial Center'],
        ['R2-Z', 'Reclassification of agricultural land to medium-density residential use', 'townhouse project', ['Petition for Reclassification'], '{brgy} Townhomes'],
        ['C2-Z', 'Rezoning to commercial use for a gasoline station and convenience store', 'gasoline station', ['Locational Clearance', 'Petition for Rezoning'], 'Rosario Fuels Station'],
    ];

    private const FIRST_NAMES = ['Maria', 'Jose', 'Ana', 'Juan', 'Rosario', 'Antonio', 'Lourdes', 'Ramon', 'Teresita', 'Eduardo', 'Cristina', 'Roberto', 'Marites', 'Danilo', 'Josefina', 'Ricardo', 'Leonora', 'Fernando', 'Gloria', 'Rogelio', 'Evelyn', 'Arnel', 'Rowena', 'Jericho', 'Kristine', 'Mark Anthony', 'Angelica', 'Paolo', 'Liza', 'Noel', 'Carmela', 'Rodel'];
    private const LAST_NAMES = ['Macatangay', 'Ilagan', 'Mendoza', 'Alday', 'Castillo', 'Comia', 'Marasigan', 'Panganiban', 'Katigbak', 'Landicho', 'Atienza', 'Magpantay', 'Aguila', 'De Castro', 'Perez', 'Reyes', 'Garcia', 'Bautista', 'Villanueva', 'Malabanan', 'Hernandez', 'Rosales', 'Umali', 'Dimaano'];

    private const CHECKLIST = ['Structure matches declared use', 'Setback distances compliant', 'Accessibility & road frontage', 'Surrounding developments noted', 'Signage / commercial activity present'];

    private const ASSIGN_NOTES = ['Verify actual use and setbacks.', 'Check road right-of-way and access.', 'Confirm lot boundaries against the TCT technical description.', 'Applicant declares a vacant lot; check for existing structures.', 'Verify distance from the creek easement.'];

    private const DISCREPANCIES = [
        ['Existing perimeter fence encroaches about 1.5 m into the road right-of-way.', 'Require the applicant to relocate the fence and submit a revised site development plan.'],
        ['Lot boundary does not match the survey plan; part of the adjacent lot is occupied.', 'Require a relocation survey by a licensed geodetic engineer.'],
        ['No setback from the creek; the structure is within the 3 m easement.', 'Structure must be set back outside the easement before approval.'],
        ['Actual use on site differs from the declared use; storage of materials observed.', 'Applicant to clarify the actual use and amend the application if needed.'],
    ];

    private const DECLINE_REASONS = [
        'Incomplete documentary requirements: no proof of ownership or contract of lease submitted within 30 days.',
        'Lot lies within the 3-meter easement of the river; development not allowed under the Water Code.',
    ];

    private array $pos = [];
    private array $inspectors = [];
    private ?User $featured = null;
    private ?User $admin = null;
    private array $usedPins = [];
    private array $usedForms = [];
    private array $writtenFiles = [];
    private array $createdIds = [];
    private array $openInspectionIds = [];
    private array $counts = ['parcels' => 0, 'inspections' => 0, 'reviews' => 0, 'permits' => 0];
    private int $inspectorTurn = 0;
    private int $permitSeq = 0;
    private int $ordinanceSeq = 0;

    public function handle(): int
    {
        if ($this->option('purge')) {
            return $this->purge();
        }

        mt_srand((int) $this->option('seed'));

        if ($this->option('push')) {
            $ids = $this->sampleApplications()->keys()->all();
            if (! $ids) {
                $this->info('No sample applications found.');
                return self::SUCCESS;
            }
            return $this->mirror($ids) ? self::SUCCESS : self::FAILURE;
        }
        $count = max(1, (int) $this->option('count'));

        $this->pos = User::where('role', 'Planning Officer')->where('is_active', true)->orderBy('id')->get()->all();
        $this->inspectors = User::where('role', 'Site Inspector')->where('is_active', true)->whereNotNull('handshake_key')->orderBy('id')->get()->all();
        $this->admin = User::where('role', 'Admin')->where('is_active', true)->orderBy('id')->first();

        if (! $this->pos) {
            $this->error('No active Planning Officer exists. Create one first; applications are encoded and reviewed by Planning Officers.');
            return self::FAILURE;
        }
        if (! $this->inspectors) {
            $this->error('No active Site Inspector with a FieldSync account exists. Create one first; inspection rounds need an inspector.');
            return self::FAILURE;
        }
        if (($wanted = $this->option('inspector')) !== null) {
            $this->featured = collect($this->inspectors)->first(fn ($u) => (string) $u->id === $wanted || strcasecmp($u->name, $wanted) === 0);
            if (! $this->featured) {
                $this->error("No active Site Inspector with a FieldSync account matches \"{$wanted}\".");
                return self::FAILURE;
            }
        }

        $available = DB::table('land_parcels')
            ->whereNotNull('geom')
            ->whereNotNull('property_index_number')
            ->whereIn('land_use_class', array_merge(...array_values(self::CLASSES)))
            ->count();
        if ($available < $count * 2) {
            $this->error("Only {$available} usable land parcels found. Import the land parcel layer (Settings) first; sample parcels are taken from it.");
            return self::FAILURE;
        }

        $plans = $this->plan($count);

        $this->info(sprintf('Database: %s on %s', config('database.connections.' . config('database.default') . '.database'), config('database.connections.' . config('database.default') . '.host')));
        $this->line('Planning Officers: ' . collect($this->pos)->map(fn ($u) => "{$u->name} (#{$u->id})")->implode(', '));
        $this->line('Site Inspectors:   ' . collect($this->inspectors)->map(fn ($u) => "{$u->name} (#{$u->id})")->implode(', '));
        if ($this->featured) {
            $this->line("Featured inspector: {$this->featured->name} (#{$this->featured->id}), about half of the rounds");
        }
        $this->line('Admin:             ' . ($this->admin ? "{$this->admin->name} (#{$this->admin->id})" : 'none (no reassignment samples)'));
        $this->table(['Scenario', 'Applications', 'Multi-parcel'], collect($plans)->groupBy('key')->map(fn ($g, $k) => [$k, $g->count(), $g->where('multi', true)->count()])->values()->all());

        if ($this->option('dry-run')) {
            $this->comment('Dry run: nothing written.');
            return self::SUCCESS;
        }

        if (! $this->option('force') && ! $this->confirm("Create {$count} sample applications in this database?")) {
            return self::FAILURE;
        }

        try {
            DB::transaction(function () use ($plans) {
                $this->usedPins = array_flip(DB::table('parcels')->whereNotNull('property_index_number')->pluck('property_index_number')->all());
                $this->usedForms = array_flip(DB::table('zoning_applications')->whereNotNull('form_number')->pluck('form_number')->all());

                $latest = DB::table('zoning_applications')
                    ->where('reference_number', 'like', 'APP-' . now()->year . '-%')
                    ->lockForUpdate()
                    ->orderBy('reference_number', 'desc')
                    ->value('reference_number');
                $seq = $latest ? (int) Str::afterLast($latest, '-') : 0;

                $bar = $this->output->createProgressBar(count($plans));
                foreach ($plans as $plan) {
                    $this->run1($plan, sprintf('APP-%s-%05d', now()->year, ++$seq));
                    $bar->advance();
                }
                $bar->finish();
                $this->newLine();
            });
        } catch (\Throwable $e) {
            $this->deleteWrittenFiles();
            $this->error('Nothing was saved: ' . $e->getMessage());
            return self::FAILURE;
        }

        $this->info(sprintf(
            'Created %d applications, %d parcels, %d review decisions, %d inspection rounds, %d permits.',
            count($plans), $this->counts['parcels'], $this->counts['reviews'], $this->counts['inspections'], $this->counts['permits']
        ));

        if ($this->option('sync')) {
            return $this->mirror($this->createdIds) ? self::SUCCESS : self::FAILURE;
        }
        if ($this->openInspectionIds) {
            $this->comment(count($this->openInspectionIds) . ' open inspection rounds were not sent to the FieldSync app (run with --push to send them).');
        }

        return self::SUCCESS;
    }

    // ── Planning ────────────────────────────────────────────────────────────

    /** Scenario instances, interleaved so a small --count still covers every stage, with their event times. */
    private function plan(int $count): array
    {
        $instances = [];
        $widest = max(array_column(self::SCENARIOS, 0));
        // --shuffle: every scenario once (in random order) before any repeats, ~40% multi-parcel.
        $bag = [];
        while ($this->option('shuffle') && count($instances) < $count) {
            if (! $bag) {
                $bag = array_keys(self::SCENARIOS);
            }
            $key = array_splice($bag, mt_rand(0, count($bag) - 1), 1)[0];
            [$n, , $stream, $steps] = self::SCENARIOS[$key];
            $instances[] = ['key' => $key, 'nth' => mt_rand(0, $n - 1), 'multi' => mt_rand(1, 100) <= 40, 'stream' => $stream, 'steps' => $steps];
        }
        for ($pass = 0; count($instances) < $count; $pass++) {
            for ($r = 0; $r < $widest; $r++) {
                foreach (self::SCENARIOS as $key => [$n, $multi, $stream, $steps]) {
                    if ($r < $n && count($instances) < $count) {
                        $instances[] = ['key' => $key, 'nth' => $pass * $n + $r, 'multi' => $r < $multi, 'stream' => $stream, 'steps' => $steps];
                    }
                }
            }
        }

        foreach ($instances as &$instance) {
            $instance += $this->planTimes($instance);
        }
        unset($instance);

        usort($instances, fn ($a, $b) => $a['times'][0] <=> $b['times'][0]);

        return $instances;
    }

    private function planTimes(array $instance): array
    {
        $steps = $instance['steps'];
        $gaps = [];
        $rounds = [];
        $sched = null;

        foreach ($steps as $i => $step) {
            switch ($step) {
                case 'encode':
                    $gaps[$i] = 0;
                    break;
                case 'inspect':
                case 'reinspect':
                    $gaps[$i] = $i === 1 ? mt_rand(0, 4) : mt_rand(1, 4);
                    $sched = $rounds[$i] = ['scheduled' => mt_rand(2, 6), 'deadline' => mt_rand(3, 7)];
                    break;
                case 'compliant':
                case 'discrepancy':
                case 'returned':
                    $gaps[$i] = $sched['scheduled'] + (mt_rand(1, 4) === 1 ? 1 : 0);
                    break;
                case 'approve':
                case 'decline':
                    $gaps[$i] = $i === 1 ? mt_rand(0, 4) : mt_rand(1, 4);
                    break;
                case 'ordinance':
                    $gaps[$i] = mt_rand(14, 35);
                    break;
                case 'release':
                    $gaps[$i] = mt_rand(2, 9);
                    break;
            }
        }

        $last = end($steps);
        $overdue = $instance['key'] === 'inspection_scheduled' && $instance['nth'] === 0;
        $endAgo = match (true) {
            $overdue                               => $sched['scheduled'] + $sched['deadline'] + mt_rand(1, 3),
            in_array($last, ['inspect', 'reinspect']) => mt_rand(0, 4),
            $last === 'encode'                     => mt_rand(0, 10),
            $last === 'returned'                   => mt_rand(0, 6),
            str_starts_with($instance['key'], 'sb_') && $last === 'approve' => mt_rand(5, 45),
            default                                => mt_rand(3, 170),
        };
        $total = array_sum($gaps);
        $endAgo = max(0, min($endAgo, 185 - $total));

        $now = now();
        $day = $now->copy()->startOfDay()->subDays($endAgo + $total);
        $prev = null;
        $times = [];

        foreach ($gaps as $i => $gap) {
            $day = $day->copy()->addDays($gap);
            $date = $day->copy();
            if (isset($rounds[$i])) {
                $rounds[$i]['date'] = $day->copy()->addDays($rounds[$i]['scheduled'])->toDateString();
            }
            // Office days only (field work may fall on a weekend), unless that
            // would put the event before the previous one.
            $fieldWork = in_array($steps[$i], ['compliant', 'discrepancy', 'returned'], true);
            while (! $fieldWork && $date->isWeekend() && (! $prev || $date->copy()->subDay()->gte($prev->copy()->startOfDay()))) {
                $date->subDay();
            }
            $at = $date->copy()->setTime(mt_rand(8, 16), mt_rand(0, 59));
            if ($prev && $at->lte($prev)) {
                $at = $prev->copy()->addMinutes(mt_rand(10, 50));
            }
            if ($at->gt($now->copy()->subMinutes(5))) {
                $at = $now->copy()->subMinutes(mt_rand(5, 30));
                if ($prev && $at->lte($prev)) {
                    $at = $prev->copy()->addMinute();
                }
            }
            $times[$i] = $at;
            $prev = $at;
        }

        return ['times' => $times, 'rounds' => $rounds];
    }

    // ── Running one application ─────────────────────────────────────────────

    private function run1(array $plan, string $reference): void
    {
        $a = $this->compose($plan, $reference);

        foreach ($plan['steps'] as $i => $step) {
            $at = $plan['times'][$i];
            match ($step) {
                'encode'      => $this->encode($a, $at),
                'inspect'     => $this->review($a, $at, 'Needs Site Inspection', $plan['rounds'][$i]),
                'reinspect'   => $this->review($a, $at, 'Requires Reinspection', $plan['rounds'][$i]),
                'approve'     => $this->review($a, $at, 'Approved'),
                'decline'     => $this->review($a, $at, 'Declined'),
                'compliant'   => $this->completeInspections($a, $at, 'Compliant'),
                'discrepancy' => $this->completeInspections($a, $at, 'With Discrepancy'),
                'returned'    => $this->completeInspections($a, $at, $this->weighted(['Compliant' => 2, 'With Discrepancy' => 2, 'For Review' => 1])),
                'ordinance'   => $this->recordOrdinance($a, $at),
                'release'     => $this->release($a, $at),
            };
        }
        $this->createdIds[] = $a['id'];
    }

    /** The applicant, project and parcels of one application. */
    private function compose(array $plan, string $reference): array
    {
        $amendment = $plan['stream'] === 'amendment';
        $mismatch = $plan['key'] === 'denied_at_review' && $plan['nth'] % 3 !== 2;

        if ($amendment) {
            $parcelCategory = 'agricultural';
            [$target, $purpose, $use, $types, $business] = $this->pick(self::AMENDMENTS);
            $project = [$business, $purpose, $use, $types, null, [5_000_000, 30_000_000], null, null];
        } else {
            $parcelCategory = $mismatch ? 'residential' : $this->weighted(self::CATEGORY_WEIGHTS);
            $projectCategory = $mismatch ? $this->pick(['industrial', 'agricultural']) : $parcelCategory;
            $project = $this->pick(self::PROJECTS[$projectCategory]);
            $target = null;
        }

        $parcels = $this->sampleParcels($parcelCategory, $plan['multi'] ? mt_rand(2, 4) : 1);
        [$business, $purpose, $use, $types, $buildingRange, $costRange, $corporation, $lotsRange] = $project;

        $brgy = $parcels[0]->barangay;
        $owner = mt_rand(1, 100) <= 40;
        if ($owner) {
            $first = Str::before($parcels[0]->owner_name, ' ');
            $last = trim(Str::after($parcels[0]->owner_name, ' ')) ?: $this->pick(self::LAST_NAMES);
            $applicant = $parcels[0]->owner_name;
        } else {
            $first = $this->pick(self::FIRST_NAMES);
            $last = $this->pick(self::LAST_NAMES);
            $applicant = "{$first} {$last}";
        }
        $fill = fn (?string $s) => $s === null ? null : str_replace(['{last}', '{brgy}'], [$last, $brgy], $s);

        $area = round(array_sum(array_map(fn ($p) => (float) $p->lot_area_sqm, $parcels)), 2);
        $building = $buildingRange ? min($area, mt_rand($buildingRange[0], $buildingRange[1])) : null;
        $cost = round(mt_rand($costRange[0], $costRange[1]), -3);
        $hasRep = $corporation !== null || mt_rand(1, 100) <= 25;

        $fees = [];
        if (in_array('Locational Clearance', $types, true) || in_array('Preliminary Approval and Locational Clearance (PALC)', $types, true)) {
            $fees['locational_clearance'] = round(max(500, $cost * 0.001), 2);
        }
        if (in_array('Zoning Certificate', $types, true)) {
            $fees['zoning_certificate'] = mt_rand(6, 16) * 50;
        }
        if (in_array('Development Permit', $types, true)) {
            $fees['development_permit'] = round($area * 10, 2);
        }
        $fees['other'] = $amendment ? 2500 : 100;
        if (mt_rand(1, 100) <= 8) {
            $fees['penalty'] = 500;
        }

        return [
            'reference_number'        => $reference,
            'stream'                  => $plan['stream'],
            'types'                   => ZoningApplication::normalizeTypes($types),
            'target'                  => $target,
            'purpose'                 => $purpose,
            'use'                     => $use,
            'mismatch'                => $mismatch,
            'applicant'               => $applicant,
            'applicant_street'        => 'Purok ' . mt_rand(1, 7),
            'applicant_barangay'      => mt_rand(1, 100) <= 70 ? $brgy : $parcels[mt_rand(0, count($parcels) - 1)]->barangay,
            'contact'                 => $this->phone(),
            'email'                   => Str::slug("{$first} {$last}", '.') . mt_rand(1, 99) . '@' . self::EMAIL_DOMAIN,
            'representative'          => $hasRep ? $this->pick(self::FIRST_NAMES) . ' ' . $this->pick(self::LAST_NAMES) : null,
            'corporation'             => $fill($corporation),
            'business_name'           => $fill($business),
            'barangay'                => $brgy,
            'building_area'           => $building,
            'area_to_develop'         => $area,
            'lots'                    => $lotsRange ? mt_rand($lotsRange[0], $lotsRange[1]) : null,
            'cost'                    => $cost,
            'right_over_land'         => $owner ? 'Owner' : $this->weighted(['Lessee' => 3, 'Others' => 1]),
            'tenure'                  => $use === 'packing shed' ? 'Temporary' : 'Permanent',
            'release_mode'            => $this->weighted(['Pick-up' => 6, 'By mail - Applicant' => 3, 'By mail - Authorized Representative' => $hasRep ? 2 : 0]),
            'fees'                    => $fees,
            'parcels'                 => $parcels,
            'po'                      => $this->pos[$plan['nth'] % count($this->pos)],
            'reassign_po'             => in_array($plan['key'], ['for_release', 'inspection_returned'], true) && $plan['nth'] === 0,
            'reassign_inspector'      => $plan['key'] === 'inspection_scheduled' && $plan['nth'] === 1,
            'mixed'                   => $plan['multi'] && $plan['nth'] % 2 === 0,
            'round'                   => 0,
            'pending'                 => [],
            'returned'                => [],
            'status'                  => 'Received',
        ];
    }

    private function encode(array &$a, Carbon $at): void
    {
        $po = $a['po'];
        $label = implode(', ', $a['types']);

        $a['form_number'] = $this->formNumber();
        $a['label'] = $label;

        $a['id'] = DB::table('zoning_applications')->insertGetId([
            'reference_number'        => $a['reference_number'],
            'application_stream'      => $a['stream'],
            'form_number'             => $a['form_number'],
            'target_land_use_class'   => $a['target'],
            'status'                  => 'Received',
            'purpose'                 => $a['purpose'],
            'applicant_name'          => $a['applicant'],
            'applicant_street'        => $a['applicant_street'],
            'applicant_barangay'      => $a['applicant_barangay'],
            'contact_number'          => $a['contact'],
            'email'                   => $a['email'],
            'corporation_name'        => $a['corporation'],
            'corporation_address'     => $a['corporation'] ? 'Brgy. ' . $a['barangay'] . ', Rosario, Batangas' : null,
            'corporation_contact'     => $a['corporation'] ? $this->phone() : null,
            'representative_name'     => $a['representative'],
            'representative_address'  => $a['representative'] ? 'Purok ' . mt_rand(1, 7) . ', Brgy. ' . $a['barangay'] . ', Rosario, Batangas' : null,
            'representative_contact'  => $a['representative'] ? $this->phone() : null,
            'barangay'                => $a['barangay'],
            'building_area'           => $a['building_area'],
            'area_to_develop'         => $a['area_to_develop'],
            'number_of_saleable_lots' => $a['lots'],
            'business_name'           => $a['business_name'],
            'project_cost'            => $a['cost'],
            'right_over_land'         => $a['right_over_land'],
            'project_tenure'          => $a['tenure'],
            'preferred_release_mode'  => $a['release_mode'],
            'assessment_fee'          => array_sum($a['fees']),
            'date_of_receipt'         => $at->toDateString(),
            'or_number'               => sprintf('OR-%05d', mt_rand(10000, 99999)),
            'encoded_by'              => $po->id,
            'assigned_planning_officer_id' => $po->id,
            'created_at'              => $at,
            'updated_at'              => $at,
        ]);

        foreach ($a['types'] as $type) {
            DB::table('zoning_application_types')->insert(['zoning_application_id' => $a['id'], 'application_type' => $type]);
        }
        foreach ($a['fees'] as $type => $amount) {
            DB::table('application_fees')->insert(['zoning_application_id' => $a['id'], 'fee_type' => $type, 'amount' => $amount, 'created_at' => $at, 'updated_at' => $at]);
        }

        foreach ($a['parcels'] as $index => $p) {
            $p->id = DB::table('parcels')->insertGetId([
                'zoning_application_id' => $a['id'],
                'parcel_code'           => sprintf('P-%02d', $index + 1),
                'location_address'      => $p->location_address,
                'barangay'              => $p->barangay,
                'owner_name'            => $p->owner_name,
                'lot_number'            => $p->lot_number,
                'tct_number'            => $p->tct_number,
                'tax_dec_number'        => $p->tax_dec_number,
                'lot_area_sqm'          => round((float) $p->lot_area_sqm, 2),
                'latitude'              => round((float) $p->lat, 7),
                'longitude'             => round((float) $p->lng, 7),
                'land_use_class'        => $p->land_use_class,
                'property_index_number' => $p->property_index_number,
                'arp_number'            => $p->arp_number,
                'survey_number'         => $p->survey_number,
                'created_at'            => $at,
                'updated_at'            => $at,
            ]);
            $p->code = sprintf('P-%02d', $index + 1);
            $this->counts['parcels']++;
        }

        $n = count($a['parcels']);
        $this->track($a, 'Received', "Application encoded by staff with {$n} parcel(s).", $at);
        $this->audit($a, 'APPLICATION_CREATED', $po, "Application encoded by staff with {$n} parcel(s).", $at);

        DB::table('application_po_assignments')->insert([
            'zoning_application_id' => $a['id'], 'assignment_type' => 'initial', 'from_planning_officer_id' => null,
            'to_planning_officer_id' => $po->id, 'reason' => null, 'reason_note' => null, 'reassigned_by' => $po->id, 'reassigned_at' => $at,
        ]);
        $this->audit($a, 'PLANNING_OFFICER_ASSIGNED', $po, sprintf('Initial Planning Officer ownership assigned to %s at application creation by the same officer. encoded_by is unchanged and keeps its own meaning.', $po->name), $at);

        $status = $a['stream'] === 'amendment' ? 'Under Sangguniang Bayan' : 'Technical Review';
        $this->setStatus($a, $status, $at);
        $this->track($a, $status, null, $at);
        $this->audit($a, 'STATUS_UPDATE', $po, "Application automatically moved from Received to {$status} upon encoding.", $at);

        if ($a['reassign_po'] && count($this->pos) > 1 && $this->admin) {
            $to = collect($this->pos)->first(fn ($u) => $u->id !== $po->id);
            $when = $at->copy()->addMinutes(20);
            DB::table('application_po_assignments')->insert([
                'zoning_application_id' => $a['id'], 'assignment_type' => 'reassignment', 'from_planning_officer_id' => $po->id,
                'to_planning_officer_id' => $to->id, 'reason' => 'Workload Transfer', 'reason_note' => null,
                'reassigned_by' => $this->admin->id, 'reassigned_at' => $when,
            ]);
            DB::table('zoning_applications')->where('id', $a['id'])->update(['assigned_planning_officer_id' => $to->id]);
            $this->audit($a, 'PLANNING_OFFICER_REASSIGNED', $this->admin, sprintf(
                'Planning Officer ownership moved from %s (%d) to %s (%d). Reason: Workload Transfer. The application status, encoder and technical review history were not changed.',
                $po->name, $po->id, $to->name, $to->id
            ), $when);
            $a['po'] = $to;
        }
    }

    /**
     * One batch review submission, as TechnicalReviewController::submitBatch()
     * records it: the parcels with a returned inspection are decided; on the
     * first review every parcel is.
     */
    private function review(array &$a, Carbon $at, string $decision, ?array $round = null): void
    {
        $po = $a['po'];
        $reviewed = $a['returned'];
        $a['returned'] = [];
        $targets = $reviewed
            ? array_values(array_filter($a['parcels'], fn ($p) => isset($reviewed[$p->id])))
            : $a['parcels'];

        $decisions = [];
        foreach ($targets as $i => $p) {
            // A multi-parcel filing may clear one lot at once and send the rest to the field.
            $decisions[$p->id] = ($decision === 'Needs Site Inspection' && $a['mixed'] && $i === 0 && ! $reviewed) ? 'Approved' : $decision;
        }

        $roundNo = ++$a['round'];
        foreach ($targets as $p) {
            $d = $decisions[$p->id];
            $taskId = null;
            if (in_array($d, ['Needs Site Inspection', 'Requires Reinspection'], true)) {
                $taskId = $this->createInspection($a, $p, $at, $round, $d === 'Requires Reinspection');
            }

            [$findings, $reason] = $this->reviewText($a, $p, $d, $reviewed[$p->id] ?? null);
            DB::table('technical_reviews')->insert([
                'zoning_application_id'       => $a['id'],
                'parcel_id'                   => $p->id,
                'reviewed_by'                 => $po->id,
                'review_round'                => $roundNo,
                'decision'                    => $d,
                'findings'                    => $findings,
                'decision_reason'             => $reason,
                'site_inspection_task_id'     => $taskId,
                'reviewed_site_inspection_id' => $reviewed[$p->id]['id'] ?? null,
                'reviewed_at'                 => $at,
                'created_at'                  => $at,
                'updated_at'                  => $at,
            ]);
            $this->counts['reviews']++;
        }

        $seen = array_values($decisions);
        if (in_array('Declined', $seen, true)) {
            $status = 'Denied';
        } elseif (array_intersect(['Needs Site Inspection', 'Requires Reinspection'], $seen)) {
            $status = 'Technical Review';
        } elseif ($a['status'] === 'Under Sangguniang Bayan' || $a['stream'] === 'amendment') {
            $status = 'Under Sangguniang Bayan';
        } else {
            $status = 'For Release';
        }
        $this->setStatus($a, $status, $at);

        $codes = fn (array $want) => implode(', ', array_map(fn ($p) => $p->code, array_filter($targets, fn ($p) => in_array($decisions[$p->id], $want, true))));
        $approved = $codes(['Approved']);
        $inspected = $codes(['Needs Site Inspection', 'Requires Reinspection']);
        $declined = $codes(['Declined']);

        if ($inspected !== '') {
            $date = $round['date'];
            $note ="Site inspection scheduled for parcel(s) [{$inspected}] on {$date}." . ($approved !== '' ? " Approved parcel(s): [{$approved}]." : '');
            $this->track($a, 'Site Inspection Scheduled', $note, $at, $date);
            $this->audit($a, 'TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION', $po, $note, $at);
            if ($approved !== '') {
                $this->track($a, 'Approved', "Parcel(s) [{$approved}] approved upon technical review.", $at);
                $this->audit($a, 'TECHNICAL_REVIEW_APPROVED', $po, "Parcel(s) [{$approved}] approved upon technical review.", $at);
            }
            $this->audit($a, 'BATCH_TECHNICAL_REVIEW_UPDATED', $po, 'Batch review processed. Application requires Site Inspection for certain parcels.', $at);
            return;
        }

        if ($approved !== '') {
            $this->track($a, 'Approved', "Parcel(s) [{$approved}] approved upon technical review.", $at);
        }
        $this->track($a, $status, $approved !== '' ? "Technical review completed: parcel(s) [{$approved}] approved. Overall status updated to {$status}." : null, $at);
        if ($declined !== '') {
            $this->audit($a, 'TECHNICAL_REVIEW_DECLINED', $po, "Parcel(s) [{$declined}] declined upon technical review. Status moved to Denied.", $at);
        } else {
            $this->audit($a, 'TECHNICAL_REVIEW_APPROVED', $po, "All parcel(s) [{$approved}] approved upon technical review. Status moved to {$status}.", $at);
        }
        $this->audit($a, 'BATCH_TECHNICAL_REVIEW_COMPLETED', $po, "Batch review finalized. Overall application status updated to {$status}.", $at);
    }

    private function createInspection(array &$a, object $p, Carbon $at, array $round, bool $reinspection): int
    {
        $po = $a['po'];
        $inspector = $this->nextInspector();
        $scheduled = Carbon::parse($round['date']);

        $id = DB::table('site_inspections')->insertGetId([
            'zoning_application_id'     => $a['id'],
            'parcel_id'                 => $p->id,
            'inspector_id'              => $inspector->id,
            'status'                    => 'assigned',
            'scheduled_date'            => $scheduled->toDateString(),
            'deadline_date'             => $scheduled->copy()->addDays($round['deadline'])->toDateString(),
            'assigned_notes'            => $reinspection
                ? 'Reinspect after the applicant\'s corrections: verify the setback and that the encroachment was removed.'
                : $this->pick(self::ASSIGN_NOTES),
            'assigned_by_imaps_user_id' => $po->id,
            'assigned_by_name'          => $po->name,
            'created_at'                => $at,
            'updated_at'                => $at,
        ]);
        DB::table('site_inspection_assignments')->insert([
            'site_inspection_id' => $id, 'assignment_type' => 'initial', 'from_inspector_id' => null,
            'to_inspector_id' => $inspector->id, 'reason' => null, 'reason_note' => null, 'reassigned_by' => $po->id, 'reassigned_at' => $at,
        ]);

        if ($a['reassign_inspector'] && count($this->inspectors) > 1) {
            $to = collect($this->inspectors)->first(fn ($u) => $u->id !== $inspector->id);
            $when = $at->copy()->addMinutes(45)->min(now()->subMinute());
            DB::table('site_inspection_assignments')->insert([
                'site_inspection_id' => $id, 'assignment_type' => 'reassignment', 'from_inspector_id' => $inspector->id,
                'to_inspector_id' => $to->id, 'reason' => 'On Leave', 'reason_note' => null, 'reassigned_by' => $po->id, 'reassigned_at' => $when,
            ]);
            DB::table('site_inspections')->where('id', $id)->update(['inspector_id' => $to->id]);
            $this->audit($a, 'SITE_INSPECTOR_REASSIGNED', $po, sprintf(
                'Inspector for %s round 1 moved from %s (%d) to %s (%d). Reason: On Leave. The round status and any evidence already collected were not changed.',
                $p->code, $inspector->name, $inspector->id, $to->name, $to->id
            ), $when);
            $a['reassign_inspector'] = false;
        }

        $a['pending'][$p->id] = $id;
        $this->openInspectionIds[$id] = true;
        $this->counts['inspections']++;

        return $id;
    }

    /** The inspector submits every open round of the application from the field. */
    private function completeInspections(array &$a, Carbon $at, string $result): void
    {
        foreach ($a['pending'] as $parcelId => $id) {
            $p = collect($a['parcels'])->firstWhere('id', $parcelId);
            $created = Carbon::parse(DB::table('site_inspections')->where('id', $id)->value('created_at'));
            $done = $at->copy()->addMinutes(mt_rand(0, 40));
            $offset = mt_rand(3, 25);
            [$discrepancy, $recommendation] = $this->pick(self::DISCREPANCIES);

            $checks = array_map(fn ($item) => ['item' => $item, 'checked' => $result === 'Compliant' ? true : mt_rand(1, 100) <= 60], self::CHECKLIST);
            $notes = match ($result) {
                'Compliant'        => 'Site matches the submitted plans. Neighbors interviewed; no objections raised.',
                'With Discrepancy' => $discrepancy,
                default            => 'Access road appears to be a private right-of-way; ownership needs a barangay certification.',
            };

            DB::table('site_inspections')->where('id', $id)->update([
                'status'              => 'completed',
                'submitted_at'        => $done,
                'completed_at'        => $done,
                'inspection_result'   => $result,
                'is_compliant'        => match ($result) { 'Compliant' => true, 'With Discrepancy' => false, default => null },
                'observations'        => "Actual land use: {$p->land_use_class}. Boundary status: Verified on-site — {$offset}m from declared location.",
                'discrepancies'       => $result === 'Compliant' ? 'None observed.' : $notes,
                'recommendations'     => match ($result) {
                    'Compliant'        => 'Recommend approval of the application.',
                    'With Discrepancy' => $recommendation,
                    default            => 'Planning Officer to require the barangay certification before deciding.',
                },
                'inspector_notes'     => $notes,
                'findings'            => $notes,
                'checklist_data'      => json_encode($checks),
                'confirmed_latitude'  => (float) $p->lat + mt_rand(-15, 15) / 100000,
                'confirmed_longitude' => (float) $p->lng + mt_rand(-15, 15) / 100000,
                'gps_accuracy_m'      => mt_rand(30, 200) / 10,
                'gps_confirmed_at'    => $done->copy()->subMinute(),
                // The round reached the FieldSync app, or it could not have come back.
                'delivery_status'          => 'delivered',
                'last_delivery_attempt_at' => $created->copy()->addSeconds(3),
                'delivered_at'             => $created->copy()->addSeconds(6),
                'updated_at'          => $done,
            ]);
            DB::table('inspection_delivery_attempts')->insert([
                'site_inspection_id' => $id, 'attempt_number' => 1, 'source' => 'initial_dispatch', 'outcome' => 'delivered',
                'attempted_at' => $created->copy()->addSeconds(3), 'completed_at' => $created->copy()->addSeconds(6), 'created_at' => $created->copy()->addSeconds(3),
            ]);

            $a['returned'][$parcelId] = ['id' => $id, 'result' => $result, 'discrepancy' => $notes];
            unset($this->openInspectionIds[$id]);
        }
        $a['pending'] = [];
    }

    private function recordOrdinance(array &$a, Carbon $at): void
    {
        $po = $a['po'];
        $ordinance = sprintf('Ordinance No. %s-%03d', $at->year, 10 + ++$this->ordinanceSeq * 3);
        $dar = in_array('Petition for Reclassification', $a['types'], true) ? sprintf('DAR-4A-CLR-%s-%04d', $at->year, mt_rand(100, 9999)) : null;
        $a['ordinance'] = $ordinance;
        $a['ordinance_date'] = $at->copy()->subDays(mt_rand(1, 5))->toDateString();

        DB::table('zoning_applications')->where('id', $a['id'])->update(['sb_ordinance_number' => $ordinance, 'dar_clearance_ref' => $dar, 'updated_at' => $at]);
        $this->audit($a, 'AMENDMENT_REFS_UPDATED', $po, sprintf('SB ordinance no.: %s; DAR clearance ref.: %s', $ordinance, $dar ?? '—'), $at);

        $when = $at->copy()->addMinutes(5);
        $this->setStatus($a, 'For Release', $when);
        $this->audit($a, 'STATUS_UPDATE', $po, 'Status changed from "Under Sangguniang Bayan" to "For Release"', $when);
        $this->track($a, 'For Release', null, $when);
    }

    /** Generate the permits the release gate asks for, then mark Released. Stays For Release if a permit cannot be built. */
    private function release(array &$a, Carbon $at): void
    {
        $po = $a['po'];
        $model = ZoningApplication::with(['parcels', 'encodedBy'])->findOrFail($a['id']);
        $service = app(PermitExcelService::class);
        $disk = Storage::disk(config('filesystems.permits_disk'));

        foreach ($model->getRecommendedPermitTypes() as $type) {
            $code = strtoupper($type);
            $fields = [
                "{$code}_DN"  => sprintf('%s-%s-%04d', $code, $at->year, 100 + ++$this->permitSeq),
                'DATE_ISSUED' => $at->toDateString(),
            ];
            if (! empty($a['ordinance'])) {
                $fields['SB_RESOLUTION'] = $a['ordinance'];
                $fields['DATE_APPROVED'] = $a['ordinance_date'];
            }

            $path = null;
            $format = null;
            foreach (['pdf', 'xlsx'] as $try) {
                try {
                    $path = $service->generate($model, $type, ['fields' => $fields], $try);
                    $format = $try;
                    break;
                } catch (\Throwable $e) {
                    $this->warn("{$a['reference_number']}: {$try} {$code} failed ({$e->getMessage()})");
                }
            }
            if (! $path) {
                $this->warn("{$a['reference_number']} left at For Release: its {$code} permit could not be generated.");
                return;
            }

            $label = config("permits.documents.{$type}.label", $code);
            $fileName = sprintf('%s_%s_%s.%s', Str::slug($label, '_'), $a['reference_number'], Str::random(6), $format);
            $storagePath = "permits/{$a['id']}/{$fileName}";
            $disk->makeDirectory("permits/{$a['id']}");
            $disk->put($storagePath, file_get_contents($path));
            $this->writtenFiles[] = $storagePath;
            $size = filesize($path);
            @unlink($path);

            DB::table('generated_permits')->insert([
                'zoning_application_id' => $a['id'], 'permit_type' => $type, 'permit_name' => $label,
                'file_name' => $fileName, 'file_path' => $storagePath, 'file_format' => $format, 'file_size' => $size,
                'input_data' => json_encode($fields), 'generated_by' => $po->id, 'created_at' => $at, 'updated_at' => $at,
            ]);
            $this->audit($a, 'PERMIT_GENERATED', $po, sprintf('%s generated & stored (%s).', $label, strtoupper($format)), $at);
            $this->counts['permits']++;
        }

        $when = $at->copy()->addMinutes(mt_rand(10, 60))->min(now()->subMinute());
        $this->setStatus($a, 'Released', $when);
        $this->audit($a, 'STATUS_UPDATE', $po, 'Status changed from "For Release" to "Released"', $when);
        $this->track($a, 'Released', null, $when);
    }

    // ── Text ────────────────────────────────────────────────────────────────

    /** [findings, decision_reason] for a review decision. */
    private function reviewText(array $a, object $p, string $decision, ?array $inspection): array
    {
        $class = $p->land_use_class;
        return match ($decision) {
            'Approved' => [$inspection
                ? "Site inspection found the lot compliant. Proposed {$a['use']} is allowed in {$class}."
                : "Proposed {$a['use']} is allowed in {$class}. Documentary requirements complete.", null],
            'Needs Site Inspection' => ["Proposed {$a['use']} on a {$class} lot; field verification of actual use and setbacks needed.", null],
            'Requires Reinspection' => ["Inspection returned with discrepancy: {$inspection['discrepancy']}", 'Applicant submitted corrections; a new round is needed to verify them.'],
            'Declined' => $inspection
                ? ["Inspection returned with discrepancy: {$inspection['discrepancy']}", 'Site conditions do not comply with the Zoning Ordinance and were not corrected by the applicant.']
                : ($a['mismatch']
                    ? ["Lot is classified {$class}.", "Proposed {$a['use']} is not an allowed use in the {$class} zone under the Comprehensive Zoning Ordinance."]
                    : ['Application reviewed against the documentary checklist.', $this->pick(self::DECLINE_REASONS)]),
        };
    }

    // ── Writers ─────────────────────────────────────────────────────────────

    private function setStatus(array &$a, string $status, Carbon $at): void
    {
        $a['status'] = $status;
        DB::table('zoning_applications')->where('id', $a['id'])->update(['status' => $status, 'updated_at' => $at]);
    }

    private function track(array $a, string $status, ?string $note, Carbon $at, ?string $scheduled = null): void
    {
        $row = [
            'reference_number'      => $a['reference_number'],
            'form_number'           => $a['form_number'],
            'contact_number'        => $a['contact'],
            'masked_applicant_name' => ApplicationStatusTracker::maskName($a['applicant']),
            'application_type'      => $a['label'],
            'business_name'         => $a['business_name'],
            'status'                => $status,
            'stage_order'           => ApplicationStatusTracker::STATUS_ORDER[$status] ?? 1,
            'note'                  => $note,
            'scheduled_date'        => $scheduled,
            'created_at'            => $at,
        ];
        DB::table('application_status_tracks')->insert($row);
    }

    private function audit(array $a, string $action, User $by, string $note, Carbon $at): void
    {
        DB::table('audit_trail')->insert(['application_id' => $a['id'], 'action' => $action, 'performed_by' => $by->id, 'note' => $note, 'performed_at' => $at]);
    }

    // ── Parcels ─────────────────────────────────────────────────────────────

    /** An unused lot of the category plus its nearest unused neighbours, so a multi-parcel filing is contiguous. */
    private function sampleParcels(string $category, int $count): array
    {
        $columns = 'gid, barangay, lot_area_sqm, land_use_class, survey_number, location_address, owner_name, lot_number,
            property_index_number, tct_number, tax_dec_number, arp_number,
            ST_Y(ST_PointOnSurface(geom)) AS lat, ST_X(ST_PointOnSurface(geom)) AS lng';
        $classes = self::CLASSES[$category];
        $in = implode(',', array_fill(0, count($classes), '?'));
        $salt = (string) mt_rand();

        $candidates = DB::select(
            "SELECT {$columns} FROM land_parcels
             WHERE geom IS NOT NULL AND property_index_number IS NOT NULL AND owner_name IS NOT NULL
               AND land_use_class IN ({$in}) AND lot_area_sqm BETWEEN 80 AND 20000
             ORDER BY md5(gid::text || ?) LIMIT 50",
            [...$classes, $salt]
        );
        $anchor = collect($candidates)->first(fn ($p) => ! isset($this->usedPins[$p->property_index_number]));
        if (! $anchor) {
            throw new \RuntimeException("No unused {$category} land parcel left to sample.");
        }

        $parcels = [$anchor];
        $this->usedPins[$anchor->property_index_number] = true;

        if ($count > 1) {
            $neighbours = DB::select(
                "SELECT {$columns} FROM land_parcels
                 WHERE gid <> ? AND geom IS NOT NULL AND property_index_number IS NOT NULL AND owner_name IS NOT NULL
                   AND barangay = ? AND lot_area_sqm BETWEEN 80 AND 20000
                 ORDER BY geom <-> (SELECT geom FROM land_parcels WHERE gid = ?) LIMIT 20",
                [$anchor->gid, $anchor->barangay, $anchor->gid]
            );
            foreach ($neighbours as $n) {
                if (count($parcels) >= $count) {
                    break;
                }
                if (! isset($this->usedPins[$n->property_index_number])) {
                    $parcels[] = $n;
                    $this->usedPins[$n->property_index_number] = true;
                }
            }
        }

        return $parcels;
    }

    // ── FieldSync / public tracker ──────────────────────────────────────────

    private const APP_STEPS = [1 => 'Site verification', 2 => 'GPS verification', 3 => 'Photos', 4 => 'Checklist', 5 => 'Findings'];

    /**
     * Play the given sample applications out on Supabase. Anything already
     * there (a timeline, a delivered round, a completed job, a review) is left
     * alone, so this can be re-run after a partial failure.
     */
    private function mirror(array $ids): bool
    {
        if (! config('services.supabase.url') || ! config('services.supabase.service_key')) {
            $this->error('Supabase is not configured here; nothing pushed.');
            return false;
        }

        $supabase = app(SupabaseService::class);
        $this->info('Playing ' . count($ids) . " applications out on Supabase (bridge {$supabase->bridgeSourceId()})...");
        $failed = 0;

        // 1. Public tracker timeline, with its real (backdated) times.
        $tracks = 0;
        foreach (DB::table('zoning_applications')->whereIn('id', $ids)->orderBy('id')->get(['reference_number', 'form_number']) as $app) {
            // The tracker is keyed by reference (one row per reference and status),
            // and other iMAPS databases share it: never mix two filings' timelines.
            $there = $supabase->select('application_status_tracks', 'form_number', ['reference_number' => "eq.{$app->reference_number}"]);
            if (! $there->successful()) {
                $failed++;
                continue;
            }
            $forms = array_unique(array_column($there->json(), 'form_number'));
            if (array_diff($forms, [$app->form_number])) {
                $this->warn("Public tracker already holds {$app->reference_number} for another filing (form " . implode(', ', array_diff($forms, [$app->form_number])) . '); its timeline was not pushed.');
                continue;
            }
            if ($forms) {
                continue;
            }
            $rows = DB::table('application_status_tracks')->where('reference_number', $app->reference_number)->where('form_number', $app->form_number)->orderBy('created_at')->orderBy('id')->get()
                ->unique('status');
            foreach ($rows as $row) {
                $ok = $supabase->pushStatusTrack([
                    'reference_number'      => $row->reference_number,
                    'form_number'           => $row->form_number,
                    'contact_number'        => $row->contact_number,
                    'masked_applicant_name' => $row->masked_applicant_name,
                    'application_type'      => $row->application_type,
                    'business_name'         => $row->business_name,
                    'status'                => $row->status,
                    'stage_order'           => $row->stage_order,
                    'note'                  => $row->note,
                    'scheduled_date'        => $row->scheduled_date ? Carbon::parse($row->scheduled_date)->toIso8601String() : null,
                    'created_at'            => $this->utc($row->created_at),
                ]);
                $ok ? $tracks++ : $failed++;
            }
        }
        $this->line("Public tracker: {$tracks} timeline entries pushed.");

        // 2. Every round, oldest first, so a reinspection finds its previous round.
        $delivered = $completed = 0;
        $returned = [];
        foreach (SiteInspection::whereIn('zoning_application_id', $ids)->orderBy('id')->get() as $round) {
            try {
                $jobId = $this->deliverRound($supabase, $round, $delivered);
                if ($round->status === 'completed') {
                    $this->completeOnApp($supabase, $round->fresh(), $jobId) && $completed++;
                    $returned[] = $round->id;
                }
            } catch (\Throwable $e) {
                $failed++;
                $this->warn("Round #{$round->id}: {$e->getMessage()}");
            }
        }
        $this->line("FieldSync: {$delivered} rounds delivered, {$completed} completed on the app.");

        // 3. The Planning Review of every returned round, as the controller sends it.
        $reviews = 0;
        $rows = DB::table('technical_reviews as t')->join('users as u', 'u.id', '=', 't.reviewed_by')
            ->whereIn('t.zoning_application_id', $ids)->whereNotNull('t.reviewed_site_inspection_id')
            ->whereIn('t.decision', PushPlanningReviewToSupabase::TRANSPORTABLE_DECISIONS)
            ->orderBy('t.id')->get(['t.*', 'u.name as reviewer']);
        foreach ($rows as $r) {
            try {
                $reviewedAt = Carbon::parse($r->reviewed_at);
                PushPlanningReviewToSupabase::dispatchSync((int) $r->id, (int) $r->reviewed_site_inspection_id, $r->decision, (int) $r->reviewed_by, $r->reviewer, $reviewedAt->toIso8601String(), $r->decision_reason);
                $this->remote()->patch('field_job_reviews?' . $this->query($supabase->scopedFilters(['technical_review_id' => "eq.{$r->id}"])), ['created_at' => $this->utc($reviewedAt->copy()->addSeconds(2))])->throw();
                $reviews++;
            } catch (\Throwable $e) {
                $failed++;
                $this->warn("Review #{$r->id}: {$e->getMessage()}");
            }
        }
        $this->line("FieldSync: {$reviews} Planning Reviews sent back to the inspectors.");

        // 4. iMAPS pulls the app's results back, the same command the scheduler runs.
        $pulled = [];
        foreach ($returned as $id) {
            Artisan::call('sync:pull-inspections', ['--local-inspection-id' => $id]);
            $result = Str::after(Str::afterLast(trim(Artisan::output()), "\n"), 'SYNC_RESULT=');
            $pulled[$result] = ($pulled[$result] ?? 0) + 1;
        }
        $this->line('Pulled back: ' . (collect($pulled)->map(fn ($n, $r) => "{$n} {$r}")->implode(', ') ?: 'nothing to pull'));

        if ($failed) {
            $this->error("{$failed} pushes failed (see above / laravel.log). Run --push again to retry them.");
        }

        return $failed === 0;
    }

    /** Deliver a round through the real bridge job, unless it already reached FieldSync. Returns the field job id. */
    private function deliverRound(SupabaseService $supabase, SiteInspection $round, int &$delivered): string
    {
        $jobId = $supabase->findFieldJobIdByLocalInspectionId($round->id);
        if (! $jobId) {
            // The seeder's stand-in delivery record gives way to the real one.
            DB::table('inspection_delivery_attempts')->where('site_inspection_id', $round->id)->delete();
            DB::table('site_inspections')->where('id', $round->id)->update(['delivery_status' => null, 'delivered_at' => null, 'last_delivery_attempt_at' => null]);

            PushInspectionToSupabase::dispatchSync(SiteInspection::findOrFail($round->id), InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH);

            $jobId = $supabase->findFieldJobIdByLocalInspectionId($round->id)
                ?? throw new \RuntimeException('delivered, but the field job cannot be found');
            $delivered++;
        }
        if (DB::table('site_inspections')->where('id', $round->id)->value('delivery_status') !== 'delivered') {
            throw new \RuntimeException('the bridge did not confirm delivery');
        }

        // Delivered seconds after the Planning Officer assigned it, not today.
        $created = Carbon::parse($round->getRawOriginal('created_at'));
        $sent = $created->copy()->addSeconds(3);
        $ack = $created->copy()->addSeconds(6);
        DB::table('inspection_delivery_attempts')->where('site_inspection_id', $round->id)->update(['attempted_at' => $sent, 'completed_at' => $ack, 'created_at' => $sent]);
        DB::table('site_inspections')->where('id', $round->id)->update([
            'last_delivery_attempt_at' => $sent, 'delivered_at' => $ack,
            'updated_at' => $round->getRawOriginal('submitted_at') ?? $created,
        ]);
        $this->remote()->patch("field_jobs?id=eq.{$jobId}", ['created_at' => $this->utc($created)])->throw();

        return $jobId;
    }

    /** What the inspector's phone records while working a returned round: steps, GPS, checklist, findings, activity feed. */
    private function completeOnApp(SupabaseService $supabase, SiteInspection $round, string $jobId): bool
    {
        $job = $this->remote()->get('field_jobs', ['id' => "eq.{$jobId}", 'select' => 'status'])->throw()->json();
        if (($job[0]['status'] ?? null) === 'completed') {
            return false;
        }

        $submitted = Carbon::parse($round->getRawOriginal('submitted_at'));
        $span = mt_rand(20, 45) * 60;
        $start = $submitted->copy()->subSeconds($span);
        $at = fn (float $share) => $start->copy()->addSeconds((int) round($span * $share));
        $steps = [1 => $at(0.03), 2 => $at(0.12), 3 => $at(0.45), 4 => $at(0.65), 5 => $at(0.92)];
        $gps = $steps[2]->copy()->subSecond();
        $checklist = $round->checklist_data ?? [];

        $this->remote()->patch('field_jobs?' . $this->query($supabase->scopedFilters(['id' => "eq.{$jobId}"])), [
            'status'                    => 'completed',
            'current_step'              => 6,
            'started_at'                => $this->utc($start->copy()->addSeconds(5)),
            'step_timestamps'           => array_map(fn ($t) => $t->copy()->utc()->format('Y-m-d\TH:i:s.u\Z'), $steps),
            'gps_confirmed_at'          => $this->utc($gps),
            'confirmed_latitude'        => $round->confirmed_latitude,
            'confirmed_longitude'       => $round->confirmed_longitude,
            'gps_accuracy_m'            => $round->gps_accuracy_m,
            'checklist_data'            => $checklist,
            'checklist_completed_count' => count(array_filter($checklist, fn ($c) => $c['checked'] ?? false)),
            'checklist_total_count'     => count($checklist),
            'photo_paths'               => [],
            'photo_count'               => 0,
            'inspection_result'         => $round->inspection_result,
            'is_compliant'              => $round->is_compliant,
            'findings'                  => $round->findings,
            'observations'              => $round->observations,
            'discrepancies'             => $round->discrepancies,
            'recommendations'           => $round->recommendations,
            'inspector_notes'           => $round->inspector_notes,
            'submitted_at'              => $this->utc($submitted),
            'updated_at'                => $this->utc($submitted),
        ])->throw();

        // The local copy keeps the app's GPS time, so the pull-back changes nothing.
        DB::table('site_inspections')->where('id', $round->id)->update(['gps_confirmed_at' => $gps]);

        $inspector = $this->profileId($round->inspector_id);
        $place = DB::table('parcels')->where('id', $round->parcel_id)->value('barangay');
        $feed = [];
        foreach ($steps as $n => $t) {
            if ($n === 2) {
                $feed[] = ['gps_confirmed', 'GPS verified on-site', $gps];
            }
            $feed[] = ['step_completed', "Completed Step {$n}: " . self::APP_STEPS[$n], $t];
        }
        $feed[] = ['inspection_completed', 'Inspection completed', $submitted];
        $this->remote()->post('activity_log', array_map(fn ($e) => [
            'inspector_id' => $inspector, 'field_job_id' => $jobId, 'event_type' => $e[0], 'title' => $e[1], 'subtitle' => $place,
            'occurred_at' => $this->utc($e[2]), 'created_at' => $this->utc($e[2]), 'is_read' => true,
        ], $feed))->throw();

        return true;
    }

    /** Remove the remote copies of the given sample applications. */
    private function unmirror(array $appIds, array $references): void
    {
        if (! config('services.supabase.url') || ! config('services.supabase.service_key')) {
            return;
        }

        $supabase = app(SupabaseService::class);
        $rounds = DB::table('site_inspections')->whereIn('zoning_application_id', $appIds)->pluck('id')->all();
        $parcels = DB::table('parcels')->whereIn('zoning_application_id', $appIds)->pluck('id')->all();
        $in = fn (array $ids) => 'in.(' . implode(',', $ids) . ')';
        $scoped = fn (string $table, array $filters) => $this->remote()->delete($table . '?' . $this->query($supabase->scopedFilters($filters)))->throw();

        try {
            if ($rounds) {
                $jobs = array_column($this->remote()->get('field_jobs', $supabase->scopedFilters(['local_inspection_id' => $in($rounds), 'select' => 'id']))->throw()->json(), 'id');
                if ($jobs) {
                    $quoted = 'in.(' . implode(',', $jobs) . ')';
                    $this->remote()->delete('activity_log?' . $this->query(['field_job_id' => $quoted]))->throw();
                    $scoped('field_job_reviews', ['field_job_id' => $quoted]);
                }
                $scoped('field_jobs', ['local_inspection_id' => $in($rounds)]);
            }
            if ($parcels) {
                $scoped('supabase_parcels', ['local_parcel_id' => $in($parcels)]);
            }
            $scoped('supabase_zoning_applications', ['local_application_id' => $in($appIds)]);
            foreach ($references as $reference => $form) {
                $this->remote()->delete('application_status_tracks?' . $this->query(['reference_number' => "eq.{$reference}", 'form_number' => "eq.{$form}"]))->throw();
            }
            $this->line('Removed their FieldSync jobs, reviews, activity and tracker timelines from Supabase.');
        } catch (\Throwable $e) {
            $this->warn('Supabase cleanup failed (' . $e->getMessage() . '); remote copies may remain.');
        }
    }

    private function remote(): PendingRequest
    {
        $key = config('services.supabase.service_key');

        return Http::baseUrl(rtrim(config('services.supabase.url'), '/') . '/rest/v1/')
            ->withHeaders(['apikey' => $key, 'Authorization' => "Bearer {$key}", 'Prefer' => 'return=minimal'])
            ->timeout(20);
    }

    private function query(array $filters): string
    {
        return http_build_query($filters, '', '&', PHP_QUERY_RFC3986);
    }

    /** A local (app timezone) time as the UTC instant Supabase stores. */
    private function utc(mixed $time): string
    {
        $time = $time instanceof \DateTimeInterface ? Carbon::instance($time) : Carbon::parse($time, config('app.timezone'));

        return $time->utc()->toIso8601String();
    }

    private function profileId(int $userId): string
    {
        static $ids = [];

        return $ids[$userId] ??= $this->remote()->get('profiles', [
            'handshake_key' => 'eq.' . DB::table('users')->where('id', $userId)->value('handshake_key'), 'select' => 'id',
        ])->throw()->json()[0]['id'] ?? throw new \RuntimeException("no FieldSync profile for user #{$userId}");
    }

    // ── Purge ───────────────────────────────────────────────────────────────

    private function purge(): int
    {
        $apps = $this->sampleApplications();

        if ($apps->isEmpty()) {
            $this->info('No sample applications found.');
            return self::SUCCESS;
        }

        $this->line(sprintf('Database: %s on %s', config('database.connections.' . config('database.default') . '.database'), config('database.connections.' . config('database.default') . '.host')));
        $this->line($apps->count() . ' sample applications: ' . $apps->values()->implode(', '));
        if ($this->option('dry-run')) {
            $this->comment('Dry run: nothing deleted.');
            return self::SUCCESS;
        }
        if (! $this->option('force') && ! $this->confirm('Delete them with their parcels, reviews, inspections, permits, timeline and audit entries (here and on Supabase)?')) {
            return self::FAILURE;
        }

        $ids = $apps->keys()->all();
        $files = DB::table('generated_permits')->whereIn('zoning_application_id', $ids)->pluck('file_path')->all();

        // Remote first: the local rows hold the ids the remote copies are keyed by.
        $this->unmirror($ids, DB::table('zoning_applications')->whereIn('id', $ids)->pluck('form_number', 'reference_number')->all());

        DB::transaction(function () use ($ids, $apps) {
            DB::table('audit_trail')->whereIn('application_id', $ids)->delete();
            DB::table('application_status_tracks')->whereIn('reference_number', $apps->values()->all())->delete();
            // Parcels, types, fees, reviews, inspection rounds, ownership history and permits cascade.
            DB::table('zoning_applications')->whereIn('id', $ids)->delete();
        });

        $disk = Storage::disk(config('filesystems.permits_disk'));
        foreach ($files as $file) {
            $disk->delete($file);
        }
        foreach ($ids as $id) {
            if ($disk->exists("permits/{$id}") && ! $disk->allFiles("permits/{$id}")) {
                $disk->deleteDirectory("permits/{$id}");
            }
        }

        $this->info("Deleted {$apps->count()} sample applications and " . count($files) . ' permit files.');

        return self::SUCCESS;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /** reference_number by id of the sample applications (both markers, so never a real filing). */
    private function sampleApplications(): \Illuminate\Support\Collection
    {
        return DB::table('zoning_applications')
            ->where('email', 'like', '%@' . self::EMAIL_DOMAIN)
            ->where('form_number', 'like', self::FORM_PREFIX . '%')
            ->orderBy('id')
            ->pluck('reference_number', 'id');
    }

    /** The featured inspector about half the time, otherwise the others in turn (at random with --shuffle). */
    private function nextInspector(): User
    {
        $others = array_values(array_filter($this->inspectors, fn ($u) => $u->id !== $this->featured?->id));
        if ($this->featured && (! $others || mt_rand(1, 100) <= 50)) {
            return $this->featured;
        }

        return $this->option('shuffle') ? $this->pick($others) : $others[$this->inspectorTurn++ % count($others)];
    }

    private function deleteWrittenFiles(): void
    {
        $disk = Storage::disk(config('filesystems.permits_disk'));
        foreach ($this->writtenFiles as $file) {
            $disk->delete($file);
        }
    }

    private function formNumber(): string
    {
        do {
            $form = self::FORM_PREFIX . str_pad((string) mt_rand(0, 99999), 5, '0', STR_PAD_LEFT);
        } while (isset($this->usedForms[$form]));
        $this->usedForms[$form] = true;

        return $form;
    }

    private function phone(): string
    {
        return '09' . $this->pick(['17', '18', '19', '20', '27', '28', '55', '56', '61', '66', '77', '95', '98']) . str_pad((string) mt_rand(0, 9_999_999), 7, '0', STR_PAD_LEFT);
    }

    private function pick(array $items): mixed
    {
        return $items[mt_rand(0, count($items) - 1)];
    }

    /** @param array<string,int> $weights */
    private function weighted(array $weights): string
    {
        $roll = mt_rand(1, array_sum($weights));
        foreach ($weights as $value => $weight) {
            if (($roll -= $weight) <= 0) {
                return $value;
            }
        }

        return array_key_first($weights);
    }
}
