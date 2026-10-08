<?php

namespace Tests\Unit;

use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Tests\TestCase;

/**
 * SESSION EXPIRY (HTTP 419) RESPONSE SHAPE.
 *
 * `bootstrap/app.php` is shared infrastructure and the master sync changed its 419
 * branch: an `expectsJson()` request now receives a JSON body instead of a
 * redirect-with-flash. The Development Support escalation endpoints are Inertia
 * POSTs, so they sit directly on this path.
 *
 * These tests drive the REAL responder registered by the merged
 * `bootstrap/app.php` by raising the exception the CSRF middleware actually
 * raises, so a future edit to either branch is caught here.
 *
 * Scope: response SHAPE on session expiry only. This grants no authority and
 * asserts nothing about the report lifecycle.
 */
class SessionExpiryResponseTest extends TestCase
{
    /**
     * Render a genuine token-mismatch through the application's own exception
     * handler, which returns the transformed response instead of sending it.
     */
    private function render419(Request $request)
    {
        return app(\Illuminate\Contracts\Debug\ExceptionHandler::class)->render(
            $request,
            new TokenMismatchException('CSRF token mismatch.')
        );
    }

    public function test_a_json_request_receives_a_json_419_with_a_message(): void
    {
        $request = Request::create('/diagnostics/abc/escalations', 'POST', [], [], [], [
            'HTTP_X_REQUESTED_WITH' => 'XMLHttpRequest',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_INERTIA' => 'true',
        ]);

        $response = $this->render419($request);

        $this->assertSame(419, $response->getStatusCode(), 'Session expiry must stay 419.');

        $isJson = str_contains((string) $response->headers->get('Content-Type'), 'json');
        $this->assertTrue(
            $isJson,
            'An AJAX/Inertia request must receive a JSON 419, not an HTML redirect.'
        );

        $payload = json_decode($response->getContent(), true);
        $this->assertIsArray($payload, 'The JSON 419 must carry a decodable body.');
        $this->assertArrayHasKey('message', $payload, 'The JSON 419 must tell the operator what happened.');
        $this->assertNotSame('', trim((string) $payload['message']));
    }

    public function test_a_browser_request_is_redirected_to_login(): void
    {
        $response = $this->render419(Request::create('/site-inspections', 'GET'));

        // The merged handler redirects a browser to the login screen, so the status
        // is the redirect's 302 - it deliberately does not preserve 419 for HTML.
        $this->assertInstanceOf(
            RedirectResponse::class,
            $response,
            'A plain browser request must be redirected rather than shown a JSON body.'
        );
        $this->assertSame(302, $response->getStatusCode());
        $this->assertStringContainsString(
            'login',
            (string) $response->headers->get('Location'),
            'Session expiry must send a browser to the login route.'
        );
    }

    public function test_the_merged_handler_branches_on_expects_json(): void
    {
        // Pins the shared-infrastructure contract in source form too, so the
        // behavioural assertions above cannot be satisfied by accident.
        $source = (string) file_get_contents(base_path('bootstrap/app.php'));

        $this->assertStringContainsString('419', $source, 'The session-expiry branch must exist.');
        $this->assertMatchesRegularExpression(
            '/419[\s\S]{0,400}?expectsJson\(\)/',
            $source,
            'The 419 branch must ask expectsJson() before choosing a response shape.'
        );
        $this->assertStringContainsString(
            "'Session expired",
            $source,
            'The JSON 419 must carry a human-readable message.'
        );
    }
}