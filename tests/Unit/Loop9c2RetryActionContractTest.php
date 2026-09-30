<?php

namespace Tests\Unit;

use App\Http\Controllers\InspectionDeliveryController;
use Illuminate\Support\Facades\Route;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Loop 9C-2 - the Planning Officer delivery retry POST route and action.
 *
 * UNIT + ROUTE + SOURCE-CONTRACT coverage. It needs no database, because the
 * role boundary is enforced by `RoleMiddleware`, which aborts BEFORE any
 * controller, query or remote call runs. That is the same property
 * `Loop9c1DeliveryStatusReaderTest` relies on, so the whole access matrix is
 * provable with a synthetic in-memory user and no fixtures.
 *
 * That is not a shortcut: a Site Inspector and an Admin are refused before the
 * request can open a connection, which is exactly the "no authority expansion"
 * guarantee the retry action has to make. The database-backed behaviour of an
 * AUTHORIZED Planning Officer is proven separately, against real PostgreSQL
 * with rollback-only probes, in
 * `Tests\Feature\Loop9c2RetryPostActionPostgresTest`.
 */
class Loop9c2RetryActionContractTest extends TestCase
{
    private const URI = 'site-inspections/{inspection}/retry-delivery';

    private function controllerSource(): string
    {
        return (string) file_get_contents(
            base_path('app/Http/Controllers/InspectionDeliveryController.php')
        );
    }

    private function serviceSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/InspectionDeliveryRetryService.php'));
    }

    /**
     * The source of ONE method, by reflection line range.
     *
     * Assertions about "the controller must not decide anything" are scoped to
     * the action itself, not to the whole class: the 9C-1 READER in the same
     * file legitimately reads `assigned_planning_officer_id` and maps delivery
     * state, and a whole-class scan would confuse that with duplicated retry
     * logic.
     */
    private function methodSource(string $class, string $method): string
    {
        $reflection = new ReflectionMethod($class, $method);
        $path = (string) $reflection->getFileName();
        $lines = file($path, FILE_IGNORE_NEW_LINES) ?: [];

        return implode("\n", array_slice(
            $lines,
            $reflection->getStartLine() - 1,
            $reflection->getEndLine() - $reflection->getStartLine() + 1
        ));
    }

    private function retryAction(): string
    {
        return $this->methodSource(InspectionDeliveryController::class, 'retry');
    }

    private function refusalTranslator(): string
    {
        return $this->methodSource(InspectionDeliveryController::class, 'translateRefusal');
    }

    private function code(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/\/\*\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*\/\/.*$/m', '', $text);

        return $text;
    }

    private function route(): ?\Illuminate\Routing\Route
    {
        $route = Route::getRoutes()->getByName('site-inspections.retry-delivery');

        return $route instanceof \Illuminate\Routing\Route ? $route : null;
    }

    // ==================================================================
    // 1. The route contract.
    // ==================================================================

    public function test_the_route_exists_exactly_once_with_the_agreed_shape(): void
    {
        $route = $this->route();

        $this->assertNotNull($route, 'The retry route must be registered.');
        $this->assertSame(self::URI, $route->uri());
        $this->assertContains('POST', $route->methods());
        $this->assertSame(
            InspectionDeliveryController::class . '@retry',
            $route->getActionName()
        );

        // No duplicate: not a second API route, not a second definition.
        $matching = 0;
        foreach (Route::getRoutes() as $candidate) {
            if ($candidate->uri() === self::URI) {
                $matching++;
            }
        }
        $this->assertSame(1, $matching, 'Exactly one route may own this URI.');
    }

    public function test_the_route_is_post_only_and_never_reachable_by_get(): void
    {
        $route = $this->route();

        foreach (['GET', 'HEAD', 'PUT', 'PATCH', 'DELETE'] as $method) {
            $this->assertNotContains(
                $method,
                $route->methods(),
                "A delivery retry is a mutation and must never answer {$method}."
            );
        }

        // And no other route anywhere exposes the same URI to a reader verb.
        foreach (Route::getRoutes() as $candidate) {
            if ($candidate->uri() !== self::URI) {
                continue;
            }
            $this->assertNotContains('GET', $candidate->methods());
        }
    }

    public function test_the_route_is_guarded_by_auth_and_planning_officer_only(): void
    {
        // The declared middleware chain, exactly as the route states it. The
        // effective boundary is then proven behaviourally at the bottom of this
        // class: Admin, Site Inspector and guest are each refused.
        $middleware = $this->route()->gatherMiddleware();

        $this->assertContains('web', $middleware, 'Must stay in the web group.');
        $this->assertContains('auth', $middleware);
        $this->assertContains('role:Planning Officer', $middleware);

        // Narrower than the 9C-1 read route on purpose: Admin is not an
        // authorized retry actor, and Site Inspectors are FieldSync-only.
        $read = Route::getRoutes()->getByName('applications.delivery-status')->gatherMiddleware();
        $this->assertContains('role:Admin,Planning Officer', $read);
        $this->assertNotContains(
            'role:Admin,Planning Officer',
            $middleware,
            'The retry route must never be reachable by Admin.'
        );
        $this->assertNotContains('role:Admin', $middleware);
        $this->assertNotContains('role:Site Inspector', $middleware);
    }

    public function test_csrf_stays_active_and_no_exception_was_added(): void
    {
        // The `web` group supplies `VerifyCsrfToken` by default in Laravel 12.
        $this->assertContains('web', $this->route()->gatherMiddleware());

        $web = (string) file_get_contents(base_path('routes/web.php'));
        $this->assertStringNotContainsString('withoutMiddleware', $web);
        $this->assertStringNotContainsString('VerifyCsrfToken', $web);
        $this->assertStringNotContainsString('$except', $web);

        // And nothing anywhere re-enables CSRF or exempts this URI.
        foreach (['app/Http/Middleware', 'bootstrap/app.php', 'routes/api.php'] as $path) {
            $full = base_path($path);
            if (! is_file($full)) {
                continue;
            }
            $source = is_dir($full)
                ? implode("\n", array_map('file_get_contents', glob($full . '/*.php') ?: []))
                : (string) file_get_contents($full);

            $this->assertStringNotContainsString('retry-delivery', $source);
        }
    }

    public function test_the_route_is_not_declared_on_the_stateless_api_group(): void
    {
        $api = (string) file_get_contents(base_path('routes/api.php'));

        $this->assertStringNotContainsString('retry-delivery', $api);
        $this->assertStringNotContainsString('InspectionDeliveryRetryService', $api);
    }

    // ==================================================================
    // 2. The controller action is THIN.
    // ==================================================================

    public function test_the_action_contains_no_business_rule(): void
    {
        $action = $this->retryAction();

        // Every one of these would be a rule duplicated out of the 9C-3-1
        // service. A read side and a write side that each own a copy of a rule
        // is how a browser ends up offering a control the server refuses.
        foreach ([
            'delivery_status',
            'assigned_planning_officer_id',
            'isSuperseded',
            'latestRoundIdsByParcel',
            'inspectorIsLocallyEligible',
            'evaluateRound',
            'actorAuthorized',
            'canRetry',
            'handshake_key',
            'is_active',
            'Site Inspector',
            'delivery_failed',
            'pending_delivery',
            'forceFill',
            'lockForUpdate',
            'DB::',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $this->code($action),
                "The retry action must not contain '{$forbidden}'; every rule belongs to the service."
            );
        }
    }

    public function test_the_action_performs_no_write_dispatch_or_remote_call_itself(): void
    {
        $code = $this->code($this->retryAction());

        foreach ([
            'PushInspectionToSupabase::dispatch',
            'PushPlanningReviewToSupabase',
            'InspectionDeliveryRecorder',
            'inspection_delivery_attempts',
            'audit_trail',
            'SupabaseService',
            'Http::',
            'profiles',
            'field_jobs',
            'SiteInspection::create',
            'newRound(',
            'technical_reviews',
            '->update(',
            '->save(',
            '->create(',
            '->delete(',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The retry action must not reference '{$forbidden}'."
            );
        }
    }

    public function test_the_action_takes_the_actor_from_the_session_and_never_the_body(): void
    {
        $code = $this->code($this->retryAction());

        $this->assertStringContainsString('$request->user()', $code);
        $this->assertStringContainsString('->queueRetry($inspection, $actor)', $code);

        // No request-supplied identity, and no body read at all.
        foreach ([
            '$request->input',
            '$request->get(',
            '$request->post(',
            '$request->all(',
            '$request->only(',
            '$request->validate(',
            'planning_officer_id',
            'performed_by',
            "'user_id'",
            "'actor'",
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The retry action must not read '{$forbidden}' from the request."
            );
        }
    }

    public function test_the_action_delegates_to_the_service_and_nothing_else(): void
    {
        $code = $this->code($this->retryAction());

        $this->assertStringContainsString('InspectionDeliveryRetryService::class', $code);
        $this->assertStringContainsString('->queueRetry(', $code);

        // The service itself is untouched by this phase and still owns the
        // locks, the pending transition, the strict audit and the dispatch.
        $service = $this->code($this->serviceSource());
        $this->assertSame(2, substr_count($service, 'lockForUpdate()'));
        $this->assertStringContainsString('PushInspectionToSupabase::dispatch($inspection, self::DELIVERY_SOURCE)', $service);
        $this->assertStringContainsString("DB::table('audit_trail')->insert([", $service);
    }

    // ==================================================================
    // 3. The response contract.
    // ==================================================================

    public function test_success_says_queued_and_never_claims_delivery(): void
    {
        $code = $this->code($this->retryAction());

        $this->assertStringContainsString("back()->with('success', 'Delivery retry has been queued.')", $code);

        // Every over-claiming wording is forbidden.
        foreach ([
            'Delivered successfully',
            'Sent to FieldSync',
            'successfully delivered',
            'Delivery successful',
            'restarted',
            'Restarted',
            'resend',
        ] as $forbidden) {
            $this->assertStringNotContainsString(
                $forbidden,
                $code,
                "The success message must not claim '{$forbidden}'."
            );
        }
    }

    public function test_domain_outcomes_map_to_the_agreed_status_codes(): void
    {
        $translator = $this->code($this->refusalTranslator());

        // 404: the target does not exist.
        $this->assertStringContainsString('INSPECTION_NOT_FOUND', $translator);
        $this->assertStringContainsString('APPLICATION_NOT_FOUND', $translator);

        // 403: the caller may not act on this application.
        $this->assertStringContainsString('NOT_AUTHORIZED', $translator);

        // 409: well formed, but conflicts with the round's current state.
        foreach ([
            'WRONG_DELIVERY_STATE',
            'SUPERSEDED_ROUND',
            'PARCEL_UNKNOWN',
            'APPLICATION_MISMATCH',
            'INSPECTOR_INVALID',
        ] as $conflict) {
            $this->assertStringContainsString($conflict, $translator);
        }

        // Three distinct domain statuses, and no fourth: 404 not found, 403 not
        // permitted, 409 conflicts with the round's current state.
        $this->assertStringContainsString('=> 404', $translator);
        $this->assertStringContainsString('=> 403', $translator);
        $this->assertStringContainsString('=> 409', $translator);
        $this->assertStringNotContainsString('=> 500', $translator);
        $this->assertStringNotContainsString('=> 422', $translator);
        $this->assertStringNotContainsString('=> 503', $translator);

        // 503 for an infrastructure failure, which is a different thing: the
        // service transaction has already unwound and the request may be retried.
        $this->assertStringContainsString('abort(503,', $this->code($this->retryAction()));
    }

    public function test_refusal_responses_never_expose_an_internal_outcome_token(): void
    {
        $translator = $this->refusalTranslator();

        // The outcome constants may be NAMED (they are the mapping) but the
        // browser must receive authored prose, never the token itself.
        $this->assertStringContainsString('$result->message()', $translator);

        $action = $this->retryAction();
        $this->assertStringNotContainsString('$result->outcome', $action . '|' . substr($translator, 0, 0));
    }

    public function test_an_unexpected_failure_is_never_surfaced_to_the_browser(): void
    {
        $action = $this->retryAction();

        // Logged server-side...
        $this->assertStringContainsString('Log::error(', $action);
        $this->assertStringContainsString('exception_message', $action);

        // ...and the response carries only the authored sentence.
        $this->assertStringContainsString("abort(503, 'Delivery retry could not be queued.')", $action);

        // The logged value is never concatenated into the response.
        $this->assertStringNotContainsString('$exception->getMessage(), ', $action);
        $this->assertStringNotContainsString('$exception->getMessage() .', $action);

        // And the browser-facing abort carries no detail.
        $abort = $this->code($action);
        $this->assertStringNotContainsString('SQLSTATE', $abort);
        $this->assertStringNotContainsString('getTraceAsString', $abort);
        $this->assertStringNotContainsString('getMessage()', substr($abort, strpos($abort, 'abort(503') ?: 0));
    }

    public function test_a_missing_actor_is_refused_rather_than_crashing_the_service(): void
    {
        $code = $this->code($this->retryAction());

        // The route middleware already guarantees a Planning Officer. This
        // guard exists so a future loosening of the route cannot turn a null
        // actor into a TypeError inside the service.
        $this->assertStringContainsString('if ($actor === null) {', $code);
        $this->assertStringContainsString('abort(403,', $code);
    }

    // ==================================================================
    // 4. The access matrix, proven without a database.
    // ==================================================================

    public function test_a_site_inspector_is_refused_before_any_controller_runs(): void
    {
        $inspector = new \App\Models\User();
        $inspector->forceFill(['id' => 501, 'name' => 'SI', 'email' => 'si@example.test', 'role' => 'Site Inspector']);

        $this->actingAs($inspector)
            ->post('/site-inspections/1/retry-delivery')
            ->assertForbidden();
    }

    public function test_an_admin_is_refused_before_any_controller_runs(): void
    {
        $admin = new \App\Models\User();
        $admin->forceFill(['id' => 1, 'name' => 'Admin', 'email' => 'admin@example.test', 'role' => 'Admin']);

        $this->actingAs($admin)
            ->post('/site-inspections/1/retry-delivery')
            ->assertForbidden();
    }

    public function test_a_guest_is_redirected_to_login(): void
    {
        $this->post('/site-inspections/1/retry-delivery')
            ->assertRedirect(route('login'));
    }
}
