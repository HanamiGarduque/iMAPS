<?php

namespace Tests\Feature;

use App\Http\Controllers\TaxMapLookupController;
use App\Models\User;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Mockery;
use Tests\TestCase;

class TaxMapLookupTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutVite();
    }

    public function test_endpoint_remains_get_and_admin_planning_officer_protected(): void
    {
        $route = collect(Route::getRoutes()->getRoutes())->first(
            fn ($candidate) => $candidate->uri() === 'api/tax-map/lookup/{pin}',
        );

        $this->assertNotNull($route);
        $this->assertSame(['GET', 'HEAD'], $route->methods());
        $this->assertContains('web', $route->gatherMiddleware());
        $this->assertContains('role:Admin,Planning Officer', $route->gatherMiddleware());
    }

    public function test_site_inspector_and_guest_cannot_reach_the_lookup(): void
    {
        $inspector = new User();
        $inspector->forceFill([
            'id' => 9999,
            'name' => 'Synthetic Site Inspector',
            'email' => 'synthetic.inspector@example.test',
            'role' => 'Site Inspector',
        ]);

        $this->actingAs($inspector)
            ->get('/api/tax-map/lookup/04-01-021-001-12-330')
            ->assertForbidden();

        // End the synthetic Site Inspector session before asserting guest
        // behavior; otherwise the second request is still authenticated and
        // correctly returns 403 instead of redirecting to login.
        $this->post('/logout')->assertRedirect(route('login'));
        $this->assertGuest();

        $this->get('/api/tax-map/lookup/04-01-021-001-12-330')
            ->assertRedirect(route('login'));
    }

    public function test_admin_and_planning_officer_pass_authorization(): void
    {
        foreach (['Admin', 'Planning Officer'] as $role) {
            $user = new User();
            $user->forceFill([
                'id' => $role === 'Admin' ? 1001 : 1002,
                'name' => "Synthetic {$role}",
                'email' => strtolower(str_replace(' ', '.', $role)) . '@example.test',
                'role' => $role,
            ]);

            $query = Mockery::mock(Builder::class);
            $query->shouldReceive('where')->once()->andReturnUsing(function ($callback) use ($query) {
                $callback($query);
                return $query;
            });
            $query->shouldReceive('whereRaw')->once()->andReturn($query);
            $query->shouldReceive('orWhere')->twice()->andReturn($query);
            $query->shouldReceive('first')->once()->andReturn(null);

            DB::shouldReceive('table')->once()->with('public.land_parcels')->andReturn($query);

            $this->actingAs($user)
                ->get('/api/tax-map/lookup/04-01-021-001-12-330')
                ->assertNotFound();
        }
    }

    public function test_formatted_pin_uses_bound_string_literals_and_returns_not_found(): void
    {
        $query = Mockery::mock(Builder::class);
        $query->shouldReceive('where')->once()->andReturnUsing(function ($callback) use ($query) {
            $callback($query);
            return $query;
        });
        $query->shouldReceive('whereRaw')->once()->with(
            'UPPER(REPLACE(REPLACE(REPLACE(property_index_number, ?, ?), ?, ?), ?, ?)) = ?',
            ['-', '', ' ', '', '.', '', '040102100112330'],
        )->andReturn($query);
        $query->shouldReceive('orWhere')->twice()->andReturn($query);
        $query->shouldReceive('first')->once()->andReturn(null);

        DB::shouldReceive('table')->once()->with('public.land_parcels')->andReturn($query);

        $response = (new TaxMapLookupController())->lookup('04-01-021-001-12-330');

        $this->assertSame(404, $response->getStatusCode());
        $this->assertSame([
            'found' => false,
            'message' => 'No parcel found for PIN "04-01-021-001-12-330".',
        ], $response->getData(true));
    }

    public function test_special_characters_are_bound_not_interpolated_and_response_shape_is_preserved(): void
    {
        $parcel = (object) [
            'id' => 42,
            'property_index_number' => '04-01-021-001-12-330',
            'barangay' => 'Poblacion',
            'tct_number' => 'TCT-1',
            'tax_dec_number' => 'TD-1',
            'lot_area_sqm' => '120.5',
            'land_use_class' => 'R-1',
            'lot_number' => 'Lot 1',
            'location_address' => 'Test Address',
            'owner_name' => 'Test Owner',
            'arp_number' => 'ARP-1',
            'survey_number' => 'Survey-1',
        ];

        $query = Mockery::mock(Builder::class);
        $query->shouldReceive('where')->once()->andReturnUsing(function ($callback) use ($query) {
            $callback($query);
            return $query;
        });
        // The controller intentionally strips every non-alphanumeric character
        // before binding the normalized PIN. The full alphanumeric remainder
        // is still passed as a bound value, never interpolated into SQL.
        $query->shouldReceive('whereRaw')->once()->with(
            'UPPER(REPLACE(REPLACE(REPLACE(property_index_number, ?, ?), ?, ?), ?, ?)) = ?',
            ['-', '', ' ', '', '.', '', '040102100112330DROPTABLELANDPARCELS'],
        )->andReturn($query);
        $query->shouldReceive('orWhere')->twice()->andReturn($query);
        $query->shouldReceive('first')->once()->andReturn($parcel);

        DB::shouldReceive('table')->once()->with('public.land_parcels')->andReturn($query);
        DB::shouldReceive('selectOne')->once()->andReturn((object) ['land_use_class' => 'R-1']);

        $response = (new TaxMapLookupController())->lookup("04-01-021-001-12-330'; DROP TABLE land_parcels; --");
        $data = $response->getData(true);

        $this->assertSame(200, $response->getStatusCode());
        $this->assertTrue($data['found']);
        $this->assertSame('04-01-021-001-12-330', $data['data']['property_index_number']);
        $this->assertSame('R-1', $data['data']['land_use_class']);
        $this->assertSame('R-1', $data['data']['recorded_land_use_class']);
        $this->assertSame('R-1', $data['data']['zoning_plan_class']);
    }
}
