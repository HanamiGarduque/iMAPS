<?php

namespace Tests\Unit;

use App\Models\ZoningApplication;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ZoningApplicationSbRoutingTest extends TestCase
{
    public function test_amendment_stream_always_has_sb_routing(): void
    {
        $app = new ZoningApplication([
            'application_stream' => 'amendment',
            'status'             => 'Received',
        ]);

        $this->assertTrue($app->hasSbRouting());
    }

    public function test_under_sangguniang_bayan_status_has_sb_routing(): void
    {
        $app = new ZoningApplication([
            'application_stream' => 'permit',
            'status'             => 'Under Sangguniang Bayan',
        ]);

        $this->assertTrue($app->hasSbRouting());
    }

    public function test_having_sb_ordinance_number_has_sb_routing(): void
    {
        $app = new ZoningApplication([
            'application_stream'   => 'permit',
            'status'               => 'For Release',
            'sb_ordinance_number'  => 'Ord. No. 2026-001',
        ]);

        $this->assertTrue($app->hasSbRouting());
    }

    public function test_standard_clearance_without_sb_history_returns_false(): void
    {
        DB::shouldReceive('table')->with('application_status_tracks')->andReturnSelf();
        DB::shouldReceive('where')->with('reference_number', 'APP-2026-99999')->andReturnSelf();
        DB::shouldReceive('where')->with('status', 'Under Sangguniang Bayan')->andReturnSelf();
        DB::shouldReceive('exists')->andReturn(false);

        $app = new ZoningApplication([
            'reference_number'   => 'APP-2026-99999',
            'application_stream' => 'permit',
            'status'             => 'For Release',
        ]);

        $this->assertFalse($app->hasSbRouting());
    }

    public function test_standard_clearance_with_sb_history_returns_true(): void
    {
        DB::shouldReceive('table')->with('application_status_tracks')->andReturnSelf();
        DB::shouldReceive('where')->with('reference_number', 'APP-2026-88888')->andReturnSelf();
        DB::shouldReceive('where')->with('status', 'Under Sangguniang Bayan')->andReturnSelf();
        DB::shouldReceive('exists')->andReturn(true);

        $app = new ZoningApplication([
            'reference_number'   => 'APP-2026-88888',
            'application_stream' => 'permit',
            'status'             => 'For Release',
        ]);

        $this->assertTrue($app->hasSbRouting());
    }
}
