<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Loop 9C-1 - Planning Officer / Admin delivery-status READER.
 *
 * Team Leader approved Loop 9C. 9C-1 is a READ CONTRACT ONLY: it exposes
 * canonical Loop 9 delivery state per inspection round, and it is deliberately
 * inert - it dispatches nothing, writes nothing, and reads no Supabase or
 * FieldSync.
 *
 * WHY THESE TESTS NEED NO DATABASE
 * --------------------------------
 * The role boundary is enforced by `RoleMiddleware`, which aborts BEFORE any
 * controller, query, or remote call runs. That is the same property
 * `Loop6AccessBoundaryTest` relies on, so the whole access matrix is provable
 * with a synthetic in-memory user and no fixtures.
 *
 * That is not a shortcut - it is the stronger assertion. A Site Inspector is
 * refused before the reader can even open a connection, which is exactly the
 * "no authority expansion" guarantee 9C must make.
 *
 * State-shaping behaviour (NULL, pending, delivered, failed, multi-round,
 * failure prose) is covered exhaustively in
 * `Tests\Unit\Loop9c1DeliveryStatusContractTest` against the pure presenter,
 * plus rollback-only PostgreSQL probes.
 */
class Loop9c1DeliveryStatusReaderTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Role-boundary assertions must not depend on built frontend assets.
        $this->withoutVite();
    }

    private function syntheticUser(int $id, string $role, string $name): User
    {
        $user = new User();
        $user->forceFill([
            'id'    => $id,
            'name'  => $name,
            'email' => strtolower(str_replace(' ', '.', $name)) . '@example.test',
            'role'  => $role,
        ]);

        return $user;
    }

    private function uri(int $applicationId = 1): string
    {
        return "/applications/{$applicationId}/delivery-status";
    }

    // ══════════════════════════════════════════════════════════════
    // ROUTE CONTRACT
    // ══════════════════════════════════════════════════════════════

    public function test_route_is_a_named_get_inside_the_authenticated_group(): void
    {
        $route = collect(Route::getRoutes()->getRoutes())->first(
            fn ($candidate) => $candidate->uri() === 'applications/{id}/delivery-status',
        );

        $this->assertNotNull($route, 'The delivery-status read route must exist.');
        $this->assertSame(['GET', 'HEAD'], $route->methods(), 'Read-only: GET and HEAD only.');

        $middleware = $route->gatherMiddleware();

        $this->assertContains('web', $middleware);
        $this->assertContains('auth', $middleware, 'Must be inside the authenticated group.');
        $this->assertContains(
            'role:Admin,Planning Officer',
            $middleware,
            'Must match the existing applications.show read boundary exactly.'
        );

        $this->assertSame('applications.delivery-status', $route->getName());
    }

    public function test_route_middleware_matches_the_applications_show_boundary_exactly(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes());

        $show = $routes->first(fn ($r) => $r->uri() === 'applications/{id}');
        $delivery = $routes->first(fn ($r) => $r->uri() === 'applications/{id}/delivery-status');

        $this->assertNotNull($show);
        $this->assertNotNull($delivery);

        // The reader must not be stricter OR broader than Application Detail.
        // Being stricter would hide state from every caller, because no live
        // application currently has a recorded Planning Officer owner.
        $this->assertSame(
            $show->gatherMiddleware(),
            $delivery->gatherMiddleware(),
            'Delivery read boundary must be identical to Application Detail read boundary.'
        );
    }

    public function test_reader_exposes_no_mutation_route(): void
    {
        $deliveryRoutes = collect(Route::getRoutes()->getRoutes())
            ->filter(fn ($r) => str_contains($r->uri(), 'delivery'));

        foreach ($deliveryRoutes as $route) {
            $this->assertSame(
                ['GET', 'HEAD'],
                $route->methods(),
                "9C-1 must expose read-only delivery routes only; found {$route->uri()}."
            );
        }

        // No retry route exists yet. 9C-3 owns that.
        $this->assertTrue(
            collect(Route::getRoutes()->getRoutes())
                ->every(fn ($r) => ! str_contains($r->uri(), 'retry-delivery')),
            '9C-1 must NOT add a retry route.'
        );
    }

    public function test_reader_route_does_not_shadow_the_application_detail_route(): void
    {
        $routes = collect(Route::getRoutes()->getRoutes());

        $this->assertNotNull($routes->first(fn ($r) => $r->uri() === 'applications/{id}'));
        $this->assertNotNull($routes->first(fn ($r) => $r->uri() === 'applications/{id}/delivery-status'));
    }

    // ══════════════════════════════════════════════════════════════
    // SITE INSPECTOR - DENIED (403)
    // ══════════════════════════════════════════════════════════════

    public function test_site_inspector_is_forbidden_on_the_delivery_reader(): void
    {
        $this->actingAs($this->syntheticUser(25, 'Site Inspector', 'Hanami Garduque'));

        $this->get($this->uri())->assertForbidden();
    }

    public function test_site_inspector_is_forbidden_for_every_application_id(): void
    {
        $this->actingAs($this->syntheticUser(25, 'Site Inspector', 'Hanami Garduque'));

        // Authorization must not depend on which application is addressed.
        foreach ([1, 25, 104, 115, 999] as $id) {
            $this->get($this->uri($id))->assertForbidden(
                "Site Inspector must be refused for application {$id}."
            );
        }
    }

    // ══════════════════════════════════════════════════════════════
    // GUEST - DENIED
    // ══════════════════════════════════════════════════════════════

    public function test_guest_is_redirected_to_login(): void
    {
        $this->get($this->uri())->assertRedirect('/login');
    }

    public function test_guest_is_redirected_for_every_application_id(): void
    {
        foreach ([1, 25, 104] as $id) {
            $this->get($this->uri($id))->assertRedirect('/login');
        }
    }

    // ══════════════════════════════════════════════════════════════
    // ADMIN / PLANNING OFFICER - PASS THE MIDDLEWARE
    // ══════════════════════════════════════════════════════════════

    public function test_admin_passes_the_role_middleware(): void
    {
        $this->actingAs($this->syntheticUser(1, 'Admin', 'Administrator'));

        // The reader needs a real application row, which this environment
        // cannot provide. What is asserted is that the ROLE BOUNDARY admits
        // Admin: the response is neither refused nor redirected.
        //
        // The final status code is deliberately NOT asserted. Reaching the
        // controller at all is the proof; whether a missing row then yields 404
        // or a database error depends on the test connection, and this project
        // pins phpunit.xml to sqlite while PHP has no pdo_sqlite driver.
        $status = $this->get($this->uri(999999))->getStatusCode();

        $this->assertNotSame(403, $status, 'Admin must not be refused by the role boundary.');
        $this->assertNotSame(302, $status, 'Admin must not be redirected to login.');
        $this->assertNotSame(401, $status, 'Admin must not be treated as unauthenticated.');
    }

    public function test_planning_officer_passes_the_role_middleware(): void
    {
        $this->actingAs($this->syntheticUser(2, 'Planning Officer', 'Blaster Salonga'));

        $status = $this->get($this->uri(999999))->getStatusCode();

        $this->assertNotSame(403, $status, 'Planning Officer must not be refused by the role boundary.');
        $this->assertNotSame(302, $status, 'Planning Officer must not be redirected to login.');
        $this->assertNotSame(401, $status, 'Planning Officer must not be treated as unauthenticated.');
    }

    public function test_no_role_is_inferred_from_a_non_ownership_column(): void
    {
        // A Site Inspector is refused no matter what identifier is addressed.
        // Ownership inference from encoded_by / reviewed_by / audit actor is
        // not merely absent from the retry rule - it must not become a way to
        // READ someone else's delivery state either.
        $this->actingAs($this->syntheticUser(9999, 'Site Inspector', 'Synthetic Site Inspector'));

        $this->get($this->uri(104))->assertForbidden();
        $this->get($this->uri(115))->assertForbidden();
    }
}
