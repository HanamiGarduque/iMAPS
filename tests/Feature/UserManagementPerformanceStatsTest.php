<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class UserManagementPerformanceStatsTest extends TestCase
{
    use RefreshDatabase;

    private $server = null;
    private string $routerPath = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    protected function tearDown(): void
    {
        if (is_resource($this->server)) {
            proc_terminate($this->server);
            proc_close($this->server);
        }
        if ($this->routerPath) {
            @unlink($this->routerPath);
        }
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Admin', 'is_active' => true]);
    }

    private function insertApp(int $encodedBy, string $type, string $ref): void
    {
        DB::table('zoning_applications')->insert([
            'reference_number' => $ref,
            'application_type' => $type,
            'purpose' => 'test',
            'applicant_name' => 'Applicant',
            'contact_number' => '0',
            'barangay' => 'Alupay',
            'encoded_by' => $encodedBy,
        ]);
    }

    public function test_planning_officer_zoning_count_includes_both_spellings_and_multi_type(): void
    {
        $po = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);
        $this->insertApp($po->id, 'Zoning Certificate', 'T-1');
        $this->insertApp($po->id, 'Zoning Certification', 'T-2');
        $this->insertApp($po->id, 'Locational Clearance, Zoning Certificate', 'T-3');
        $this->insertApp($po->id, 'Development Permit', 'T-4');

        $this->actingAs($this->admin())->get('/users?role=Planning Officer')
            ->assertInertia(fn (Assert $page) => $page
                ->where('users.data.0.stats.types.zoning', 3));
    }

    public function test_page_loads_quickly_when_supabase_hangs(): void
    {
        // Local server that never answers within the timeout, standing in for a Supabase outage.
        $this->routerPath = tempnam(sys_get_temp_dir(), 'slow') . '.php';
        file_put_contents($this->routerPath, '<?php sleep(20);');
        $port = random_int(20000, 40000);
        $this->server = proc_open(
            ['php', '-S', "127.0.0.1:$port", $this->routerPath],
            [1 => ['file', '/dev/null', 'w'], 2 => ['file', '/dev/null', 'w']],
            $pipes,
        );
        usleep(500000);

        config(['services.supabase.url' => "http://127.0.0.1:$port", 'services.supabase.service_key' => 'k']);
        User::factory()->create(['role' => 'Site Inspector', 'is_active' => true, 'handshake_key' => 'abc123']);

        $start = microtime(true);
        $this->actingAs($this->admin())->get('/users')->assertOk();
        $elapsed = microtime(true) - $start;

        $this->assertLessThan(10, $elapsed, "Page took {$elapsed}s with Supabase hanging.");
    }
}
