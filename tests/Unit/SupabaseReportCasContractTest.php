<?php

namespace Tests\Unit;

use App\Services\SupabaseService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SupabaseReportCasContractTest extends TestCase
{
    private const REPORT = '30000000-0000-4000-8000-000000000001';

    private function service(): SupabaseService
    {
        config(['services.supabase.url' => 'https://reporting.test', 'services.supabase.anon_key' => 'test-public',
            'services.supabase.service_key' => 'test-server']);
        Http::preventStrayRequests();
        Http::fake(fn (Request $request) => Http::response([['id' => self::REPORT, 'status' => 'in_review']]));
        return new SupabaseService();
    }

    public function test_only_a_proven_lifecycle_step_reaches_the_transport(): void
    {
        $response = $this->service()->updateDiagnosticReportById(self::REPORT, 'submitted', ['status' => 'in_review']);
        $request = Http::recorded()[0][0];
        $this->assertSame('PATCH', $request->method());
        parse_str(parse_url($request->url(), PHP_URL_QUERY), $query);
        $this->assertSame(['id' => 'eq.'.self::REPORT, 'status' => 'eq.submitted'], $query);
        $this->assertSame(['status' => 'in_review'], $request->data());
        $this->assertTrue($response->successful());
    }

    public function test_unproven_or_rewriting_cas_shapes_are_refused_before_any_request(): void
    {
        $shapes = [
            'not a uuid' => ['not-a-uuid', 'submitted', ['status' => 'in_review']],
            'terminal expected status' => [self::REPORT, 'resolved', ['status' => 'in_review']],
            'self transition' => [self::REPORT, 'submitted', ['status' => 'submitted']],
            'terminal without response' => [self::REPORT, 'submitted', ['status' => 'resolved']],
            'response on review' => [self::REPORT, 'submitted', ['status' => 'in_review', 'response_message' => 'x']],
            'unknown target' => [self::REPORT, 'submitted', ['status' => 'reopened']],
            'arbitrary field' => [self::REPORT, 'submitted', ['status' => 'in_review', 'title' => 'changed']],
        ];
        foreach ($shapes as $label => [$id, $expected, $data]) {
            try {
                $this->service()->updateDiagnosticReportById($id, $expected, $data);
                $this->fail("{$label} must be refused before the remote write.");
            } catch (\InvalidArgumentException) {
                $this->assertCount(0, Http::recorded(), "{$label} must never reach the transport.");
            }
        }
    }
}