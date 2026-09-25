<?php

namespace Tests\Unit;

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class Loop6CsrfSessionContractTest extends TestCase
{
    public function test_frontend_uses_laravel_xsrf_cookie_lifecycle(): void
    {
        $bootstrap = file_get_contents(dirname(__DIR__, 2) . '/resources/js/bootstrap.js');
        $blade = file_get_contents(dirname(__DIR__, 2) . '/resources/views/app.blade.php');
        $users = file_get_contents(dirname(__DIR__, 2) . '/resources/js/Pages/Users/Index.jsx');

        $this->assertIsString($bootstrap);
        $this->assertIsString($blade);
        $this->assertIsString($users);

        $this->assertStringContainsString('window.axios = axios', $bootstrap);
        $this->assertStringContainsString('X-Requested-With', $bootstrap);
        $this->assertStringNotContainsString('csrfTokenMeta', $bootstrap);
        $this->assertStringNotContainsString('X-CSRF-TOKEN', $bootstrap);
        $this->assertStringNotContainsString('X-XSRF-TOKEN', $bootstrap);
        $this->assertStringNotContainsString('csrf-token', $blade);
        $this->assertStringNotContainsString('X-CSRF-TOKEN', $users);
        $this->assertStringNotContainsString('meta[name="csrf-token"]', $users);
        $this->assertStringNotContainsString('location.reload', $bootstrap);
        $this->assertStringNotContainsString('Clear-SiteData', $bootstrap);
        $this->assertStringNotContainsString('location.reload', $users);
        $this->assertStringNotContainsString('Clear-SiteData', $users);
    }

    public function test_auth_routes_remain_post_and_web_protected(): void
    {
        // Laravel registers both the GET login form and the POST login
        // endpoint under the same route name. getByName() returns only one of
        // them, so select the POST contract explicitly instead of assuming
        // the named lookup resolves to the credential-processing route.
        $routes = collect(Route::getRoutes()->getRoutes());
        $login = $routes->first(
            fn ($route) => $route->uri() === 'login'
                && in_array('POST', $route->methods(), true),
        );
        $logout = $routes->first(
            fn ($route) => $route->uri() === 'logout'
                && in_array('POST', $route->methods(), true),
        );

        $this->assertNotNull($login);
        $this->assertNotNull($logout);
        $this->assertContains('POST', $login->methods());
        $this->assertContains('POST', $logout->methods());
        $this->assertContains('web', $login->gatherMiddleware());
        $this->assertContains('web', $logout->gatherMiddleware());
        $this->assertStringNotContainsString('csrf', file_get_contents(dirname(__DIR__, 2) . '/bootstrap/app.php'));
    }
}
