<?php

namespace Tests\Feature;

use App\Models\User;
use Tests\TestCase;

/**
 * Loop 6 — HTTP access boundary tests that require NO database fixtures.
 *
 * A Site Inspector Laravel session is established synthetically from an
 * in-memory user model (exactly as the Loop 6 contract anticipates: "an
 * already-issued Site Inspector Laravel session could exist"), then direct
 * internal URLs must return 403 — the role middleware aborts before any
 * controller, database query, Supabase call, or FieldSync interaction.
 *
 * Also proves guest redirects and that the public portal / public tracking
 * remain reachable without authentication.
 */
class Loop6AccessBoundaryTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        // Role-boundary assertions do not depend on built frontend assets.
        $this->withoutVite();
    }

    private function establishSiteInspectorSession(): void
    {
        $inspector = new User();
        $inspector->forceFill([
            'id'    => 9999,
            'name'  => 'Synthetic Site Inspector',
            'email' => 'synthetic.inspector@example.test',
            'role'  => 'Site Inspector',
        ]);

        $this->actingAs($inspector);
    }

    // ─── Existing SI session denied on internal read routes (defense in depth) ───

    public function test_existing_site_inspector_session_is_denied_on_internal_read_routes(): void
    {
        $this->establishSiteInspectorSession();

        foreach ([
            '/dashboard',
            '/applications',
            '/applications/1',
            '/technical-review',
        ] as $uri) {
            $this->get($uri)->assertForbidden("{$uri} must return 403 for an existing Site Inspector session.");
        }
    }

    public function test_existing_site_inspector_session_is_denied_on_search_map_and_inspection_apis(): void
    {
        $this->establishSiteInspectorSession();

        foreach ([
            '/api/global-search?q=test',
            '/api/map/zoning-lookup?lat=13.84&lng=121.20',
            '/api/map/zoning-area-lookup?lat=13.84&lng=121.20',
            '/api/map/land_use',
            '/api/inspections/1/supabase-data',
            '/api/tax-map/lookup/12345',
        ] as $uri) {
            $this->get($uri)->assertForbidden("{$uri} must return 403 for an existing Site Inspector session.");
        }
    }

    public function test_existing_site_inspector_session_is_denied_on_encode_and_draft_mutations(): void
    {
        $this->establishSiteInspectorSession();

        $this->get('/applications/encode')->assertForbidden('Encode form must return 403 for a Site Inspector session.');
        $this->post('/applications/encode', [])->assertForbidden('Encode submission must return 403 for a Site Inspector session.');
        $this->get('/applications/drafts')->assertForbidden('Drafts index must return 403 for a Site Inspector session.');
        $this->post('/applications/drafts/save', [])->assertForbidden('Draft save must return 403 for a Site Inspector session.');
        $this->delete('/applications/drafts/1')->assertForbidden('Draft delete must return 403 for a Site Inspector session.');
        $this->post('/applications/update-status', [])->assertForbidden('Status update must return 403 for a Site Inspector session.');
    }

    public function test_existing_site_inspector_session_is_denied_on_technical_review_mutations(): void
    {
        $this->establishSiteInspectorSession();

        $this->post('/technical-review/update-status', [])->assertForbidden('Technical review status update must return 403 for a Site Inspector session.');
        $this->post('/technical-review/submit-batch', [])->assertForbidden('Technical review batch submit must return 403 for a Site Inspector session.');
        $this->post('/technical-review/assign-inspector', [])->assertForbidden('Inspector assignment must return 403 for a Site Inspector session.');
    }

    public function test_existing_site_inspector_session_is_denied_on_admin_modules(): void
    {
        $this->establishSiteInspectorSession();

        // Upstream replaced the retired /analytics page with /reports and the
        // /audit-log page with the per-user Activity Log endpoint. The Loop 6
        // security rule is unchanged: these Admin-only surfaces must still
        // return 403 for an existing Site Inspector session.
        foreach ([
            '/register-new-account',
            '/reports',
            '/users/1/logs',
            '/settings',
            '/users',
        ] as $uri) {
            $this->get($uri)->assertForbidden("{$uri} must return 403 for a Site Inspector session.");
        }
    }

    // ─── Guest behavior: internal routes require login; public stays public ───

    public function test_guest_is_redirected_to_login_from_internal_routes(): void
    {
        $this->get('/dashboard')->assertRedirect('/login');
        $this->get('/applications')->assertRedirect('/login');
        $this->get('/api/global-search?q=test')->assertRedirect('/login');
    }

    public function test_guest_tax_map_lookup_requires_authentication(): void
    {
        $this->get('/api/tax-map/lookup/12345')->assertRedirect('/login');
    }

    public function test_public_portal_and_public_tracking_remain_public(): void
    {
        $this->get('/')->assertOk();
        $this->get('/public-portal')->assertOk();
    }
}
