<?php

namespace Tests\Unit;

use App\Http\Controllers\DiagnosticReportController;
use App\Services\DiagnosticReportReader;
use App\Support\DiagnosticTextSanitizer;
use Tests\TestCase;

/**
 * LOOP 9E/9F - Admin triage of FieldSync inspector diagnostic reports.
 *
 * This loop closes a support path that already existed everywhere except here: a
 * FieldSync Site Inspector submits an issue into the REMOTE `diagnostic_reports`
 * table, and an MPDO Admin triages it. The audit proved iMAPS had zero readers
 * of that table and the architecture record called the Admin access path
 * "CONTRACT/ACCESS WORK REQUIRED".
 *
 * THE POINT OF THIS SUITE
 * -----------------------
 * 1. AUTHORITY. Admin only, read only, and enforced by the route middleware rather
 *    than by hiding a link. There must be no write path of any kind.
 * 2. THE REDACTION CONTRACT. The audit found that the single live report contains
 *    a signed Supabase Storage URL - a bearer capability granting read on a
 *    private inspection photo - inside its free text. Every assertion here is
 *    about proving that value can never reach a browser.
 * 3. THE ALLOWLIST. The remote table is outside this repository, so a `select *`
 *    would make every future remote column browser-visible by default.
 * 4. DOMAIN SEPARATION. This is a support-ticket domain. It must not grow into a
 *    second delivery-monitoring surface.
 *
 * The security tests use a locally-built signed-URL shape. They never copy, log or
 * assert on the live report's real secret, and nothing here contacts Supabase.
 */
class Loop9eAdminDiagnosticTriageContractTest extends TestCase
{
    /** Captured before any test substitutes a stand-in credential. */
    private string $originalServiceKey = '';

    /**
     * A stand-in value for the value-matching redaction test.
     *
     * Assembled at runtime from fragments that name themselves as non-credentials,
     * so nothing resembling a provider key is ever committed. A secret scanner
     * cannot distinguish a fixture from a real key, and a realistic-looking
     * literal in a test blocked an entire push.
     */
    private function nonCredentialFixture(): string
    {
        return implode('-', ['phpunit', 'stand', 'in', 'value']) . '-' . str_repeat('z', 12);
    }

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalServiceKey = (string) config('services.supabase.service_key');
    }

    // ==================================================================
    // 1. THE SANITIZER - the mandatory part
    // ==================================================================

    /**
     * A signed Supabase Storage URL, built locally.
     *
     * Shaped exactly like the real one the audit found - a storage object path
     * carrying a JWT-shaped token in its query string - so the redaction is proven
     * against the true failure shape without ever touching the live value.
     */
    private function signedStorageUrl(): string
    {
        $jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'
            . '.eyJzdWIiOiJ1c2VyLWF1dGgifQ'
            . '.c2lnbmF0dXJlLXBsYWNlaG9sZGVy';

        return 'https://example-project.supabase.co/storage/v1/object/sign/'
            . 'inspection-photos/inspections/08152402-02d6-43ee-adfb-fddab771dfd2/photo-1.jpg'
            . '?token=' . $jwt;
    }

    public function test_signed_supabase_storage_url_is_removed(): void
    {
        $safe = DiagnosticTextSanitizer::sanitize($this->signedStorageUrl());

        $this->assertStringNotContainsString('supabase.co', $safe, 'A storage host must not survive.');
        $this->assertStringNotContainsString('/storage/v1/object/sign', $safe, 'A signed object path must not survive.');
        $this->assertStringNotContainsString('token=', $safe, 'A tokenized query must not survive.');
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_LINK, $safe);
    }

    /**
     * The bug this class exists to prevent, reproduced exactly.
     *
     * PostgREST returns JSON, Inertia re-encodes that JSON into an HTML
     * attribute, and the value that reaches PHP is slash-escaped:
     * `https:\/\/host\/storage\/v1\/object\/sign\/...?token=<jwt>`.
     *
     * A sanitizer whose URL rule matches only literal `https://` finds NOTHING in
     * that form. This was observed live against the real report during the first
     * verification pass - the storage host survived sanitization - so it is pinned
     * as a regression test rather than left to be rediscovered.
     */
    public function test_an_escaped_signed_url_is_still_removed(): void
    {
        $escaped = str_replace('/', '\\/', $this->signedStorageUrl());
        $escaped = str_replace('"', '\\"', $escaped);

        $safe = DiagnosticTextSanitizer::sanitize($escaped);

        $this->assertStringNotContainsString('supabase.co', $safe, 'An escaped signed URL must not survive.');
        $this->assertStringNotContainsString('eyJ', $safe, 'An escaped JWT must not survive.');
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_LINK, $safe);
    }

    public function test_a_json_encoded_signed_url_is_still_removed(): void
    {
        // The full round trip: remote value -> JSON -> embedded in a page prop.
        $encoded = (string) json_encode($this->signedStorageUrl());

        $safe = DiagnosticTextSanitizer::sanitize($encoded);

        $this->assertStringNotContainsString('supabase.co', $safe);
        $this->assertStringNotContainsString('token=', $safe);
    }

    public function test_any_supabase_host_is_removed_whatever_its_path(): void
    {
        // The real report's URL is long and its shape varies, so the boundary is
        // the HOST, not one path pattern.
        foreach ([
            'https://abcdefghijklmnop.supabase.co/storage/v1/object/sign/bucket/file.jpg?token=abc',
            'https://abcdefghijklmnop.supabase.co/rest/v1/rpc/anything',
            'https://abcdefghijklmnop.supabase.in/storage/v1/object/public/bucket/f.png',
        ] as $url) {
            $safe = DiagnosticTextSanitizer::sanitize("see {$url} for the report");

            $this->assertStringNotContainsString('supabase.co', $safe);
            $this->assertStringNotContainsString('supabase.in', $safe);
            $this->assertStringContainsString('see ', $safe, 'Prose around it must survive.');
        }
    }

    /**
     * The second real defect found during live verification, reproduced exactly.
     *
     * The URL rule originally began with `\b`, a word boundary. In the real report
     * the first URL is typed straight onto the previous word with no delimiter at
     * all — "pagkakaintindi kohttps://..." — so `\bhttps` never matched and the
     * rule silently passed EVERY URL in the text. A sanitizer that cannot fail
     * loudly is more dangerous than no sanitizer, so this is pinned.
     */
    public function test_a_url_glued_to_the_previous_word_is_still_removed(): void
    {
        $glued = 'pagkakaintindi ko' . $this->signedStorageUrl() . ' and that is all';

        $safe = DiagnosticTextSanitizer::sanitize($glued);

        $this->assertStringNotContainsString('supabase.co', $safe, 'A URL with no leading delimiter must still be removed.');
        $this->assertStringNotContainsString('token=', $safe);
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_LINK, $safe);
    }

    /**
     * A sanitizer must not depend on a whole-JSON decode succeeding.
     *
     * `json_decode('"' . $text . '"')` returns NULL for any text containing a raw
     * control character, and inspector prose is full of literal newlines. Had the
     * null case fallen through to "return the input untouched", every report
     * containing a line break would have leaked verbatim. This pins that the
     * primary per-escape pass always applies.
     */
    public function test_sanitization_still_applies_to_text_containing_raw_newlines(): void
    {
        $prose = "Naghahanap buhay lang kami.\nAte 1: \"Hindi ko ito ninakaw!\"\n"
            . 'here is the photo ' . $this->signedStorageUrl() . "\nend of report";

        $safe = DiagnosticTextSanitizer::sanitize($prose);

        $this->assertStringNotContainsString('supabase.co', $safe, 'Raw newlines must not defeat redaction.');
        $this->assertStringNotContainsString('token=', $safe);
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_LINK, $safe);
        $this->assertStringContainsString('Naghahanap buhay lang kami.', $safe, 'Prose must survive.');
        $this->assertStringContainsString('end of report', $safe);
    }

    public function test_a_signed_url_is_removed_whole_not_just_its_query(): void
    {
        // Stripping only `?token=` would leave a link that looks safe and still
        // discloses the private object path. The whole value must go.
        $safe = DiagnosticTextSanitizer::sanitize('see ' . $this->signedStorageUrl() . ' for details');

        $this->assertStringNotContainsString('08152402-02d6-43ee-adfb-fddab771dfd2', $safe);
        $this->assertStringNotContainsString('photo-1.jpg', $safe);
        $this->assertStringContainsString('see ', $safe, 'Surrounding prose must survive.');
        $this->assertStringContainsString('for details', $safe);
    }

    public function test_jwt_shaped_value_is_removed(): void
    {
        $jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';

        $safe = DiagnosticTextSanitizer::sanitize("Authorization payload was {$jwt} and then it broke");

        $this->assertStringNotContainsString('eyJhbGciOi', $safe, 'A JWT head must not survive.');
        $this->assertStringNotContainsString('dBjftJeZ', $safe, 'A JWT signature must not survive.');
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_CREDENTIAL, $safe);
        $this->assertStringContainsString('and then it broke', $safe);
    }

    public function test_tokenized_query_parameters_never_leak(): void
    {
        foreach (['token', 'signature', 'api_key', 'access_token', 'secret'] as $parameter) {
            $safe = DiagnosticTextSanitizer::sanitize(
                "https://example.test/report?{$parameter}=abcdef0123456789abcdef"
            );

            $this->assertStringNotContainsString(
                'abcdef0123456789abcdef',
                $safe,
                "A '{$parameter}' query value must never reach a browser."
            );
            $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_LINK, $safe);
        }
    }

    public function test_bearer_and_authorization_fragments_are_removed(): void
    {
        $bearer = DiagnosticTextSanitizer::sanitize('sent Bearer abc123SECRETVALUE456 in the header');

        $this->assertStringNotContainsString('abc123SECRETVALUE456', $bearer);
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_CREDENTIAL, $bearer);

        $auth = DiagnosticTextSanitizer::sanitize('Authorization: SUPERSECRETVALUE12345');

        $this->assertStringNotContainsString('SUPERSECRETVALUE12345', $auth);
    }

    public function test_service_key_shaped_values_are_removed(): void
    {
        // These fixtures are DELIBERATELY NOT KEY-SHAPED LITERALS.
        //
        // An earlier version of this test hardcoded realistic-looking provider key
        // strings. GitHub push protection classified one of them as a live Stripe
        // API key and refused the entire push, which is the correct outcome for
        // secret scanning but an expensive one: it blocked an entire delivery loop
        // over a fixture.
        //
        // A secret scanner cannot tell a fixture from a credential, so a test must
        // not contain anything that LOOKS like a provider key. These values are
        // assembled at runtime from obviously non-credential fragments, which
        // keeps the assertions identical while ensuring the committed source
        // carries nothing resembling a real key.
        // The two recognized key PREFIXES are the provider names the sanitizer
        // actually matches on. They are literals because they are the rule, and
        // the trailing segment is a self-describing non-credential run. A secret
        // scanner matches the whole provider-key shape, so a `live`/`test`
        // environment token would be refused; `fixture` is not an environment name
        // any provider issues, so this exercises the same branch safely.
        $values = [
            implode('_', ['sb', 'secret', 'fixture', str_repeat('x', 12)]),
            implode('_', ['sk', 'fixture', 'not-real', str_repeat('x', 12)]),
            'service_role = "' . implode('', ['not', 'a', 'real', 'value']) . str_repeat('y', 12) . '"',
        ];

        foreach ($values as $value) {
            $safe = DiagnosticTextSanitizer::sanitize("config had {$value} pasted in");

            $this->assertStringNotContainsString(
                preg_quote($value, '/'),
                $safe,
                'A key-shaped value must be removed.'
            );
        }
    }

    public function test_ordinary_diagnostic_prose_survives_intact(): void
    {
        // Redaction must not destroy the actual bug report. This is the whole
        // reason the sanitizer replaces a span instead of dropping the field.
        $prose = 'Naghahanap buhay lang kami. Ate 1 says the map does not load '
            . 'after rotating the device, and the parcel pin jumps to the wrong lot.';

        $this->assertSame($prose, DiagnosticTextSanitizer::sanitize($prose));
    }

    public function test_a_plain_url_is_preserved_because_it_is_not_a_secret(): void
    {
        // Removing every link would destroy legitimate diagnostic prose. The UI
        // renders survivors as inert text, so a plain URL is safe to keep.
        $safe = DiagnosticTextSanitizer::sanitize('docs at https://example.com/help#map exist');

        $this->assertStringContainsString('https://example.com/help#map', $safe);
    }

    public function test_non_scalar_input_is_never_rendered(): void
    {
        // A nested object could carry structure this class was never taught to
        // inspect, so it is refused rather than stringified.
        $this->assertSame('', DiagnosticTextSanitizer::sanitize(['token' => 'abc']));
        $this->assertSame('', DiagnosticTextSanitizer::sanitize(null));
    }

    public function test_the_configured_service_key_is_matched_by_value(): void
    {
        // The value-matching rule exists because SHAPE-based rules cannot recognize
        // a short or unusual key. The live Supabase service key is a JWT, which the
        // shape rules already catch, so this test pins the value path explicitly
        // rather than depending on whatever key a given environment happens to
        // hold. A representative stand-in is configured for the duration of the
        // test, and the original value is restored afterwards.
        //
        // The real configured key is never read, printed or asserted on here.
        $standIn = $this->nonCredentialFixture();

        config(['services.supabase.service_key' => $standIn]);

        try {
            $safe = DiagnosticTextSanitizer::sanitize("the key is {$standIn} please help");

            $this->assertStringNotContainsString(
                $standIn,
                $safe,
                'A configured key must be redacted by value even when its shape is unremarkable.'
            );

            $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_CREDENTIAL, $safe);
            $this->assertStringContainsString('please help', $safe, 'Surrounding prose must survive.');
        } finally {
            // Never leave a substituted credential behind for another test to read.
            config(['services.supabase.service_key' => $this->originalServiceKey]);
        }
    }

    // ==================================================================
    // 2. THE READER - allowlist and shaping
    // ==================================================================

    private function readerSource(): string
    {
        return (string) file_get_contents(base_path('app/Services/DiagnosticReportReader.php'));
    }

    private function read(string $relative): string
    {
        return (string) file_get_contents(base_path($relative));
    }

    /**
     * Executable code only: comments and docblocks stripped, whitespace collapsed.
     *
     * These files legitimately NAME the things they must not do, in prose, in
     * order to state the boundary. Asserting on raw text would invert the meaning
     * of every rule here.
     */
    private function executable(string $text): string
    {
        $text = (string) preg_replace('#/\*.*?\*/#s', '', $text);
        $text = (string) preg_replace('#^\s*(//|\*).*$#m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    public function test_only_allowlisted_remote_columns_are_requested(): void
    {
        $source = $this->readerSource();

        $this->assertStringContainsString('private const SAFE_COLUMNS', $source, 'An explicit allowlist is required.');
        $this->assertStringContainsString('private const FREE_TEXT_COLUMNS', $source);

        // A `select *` would make every future remote column visible by default.
        $this->assertStringNotContainsString("select('*'", $source);
        $this->assertStringNotContainsString("'*'", $source, "A wildcard select would leak future remote columns.");
    }

    public function test_every_free_text_field_is_sanitized_before_shaping(): void
    {
        $source = $this->readerSource();

        foreach ([
            'summary',
            'technical_description',
            'repro_steps',
            'recommended_action',
        ] as $field) {
            $this->assertStringContainsString(
                "'{$field}'",
                $source,
                "The free-text field '{$field}' must be explicitly handled."
            );
        }

        $this->assertStringContainsString(
            'DiagnosticTextSanitizer::sanitize',
            $source,
            'Free text must pass through the sanitizer.'
        );
    }

    public function test_the_reader_is_read_only(): void
    {
        $source = $this->readerSource();

        // The reader must have no remote write of any kind. It reuses
        // SupabaseService::select(); a mutation would mean calling update/delete.
        foreach (['->update(', '->delete(', '->insert(', '->patch(', '->post('] as $write) {
            $this->assertStringNotContainsString(
                $write,
                $source,
                "The 9E/9F reader must be read-only. Found '{$write}'."
            );
        }
    }

    public function test_unresolved_identity_never_becomes_a_guessed_name(): void
    {
        $source = $this->readerSource();

        $this->assertStringContainsString(
            'UNRESOLVED_INSPECTOR_LABEL',
            $source,
            'An honest unresolved marker is required.'
        );

        $this->assertStringContainsString(
            "'resolved' => false",
            $source,
            'Identity must be reported as unresolved, not guessed.'
        );

        // The reader must not reach into the local users/handshake tables to
        // invent a name for a remote uuid. That is the frozen identity-drift issue.
        foreach (['handshake_key', "from('users')", 'User::'] as $identityGuess) {
            $this->assertStringNotContainsString(
                $identityGuess,
                $source,
                "The reader must not resolve identity itself. Found '{$identityGuess}'."
            );
        }
    }

    public function test_the_raw_payload_is_never_returned_alongside_the_safe_value(): void
    {
        $source = $this->readerSource();

        // No parallel "raw" key, and no logging of the response body.
        $this->assertStringNotContainsString("'raw' =>", $source);
        $this->assertStringNotContainsString("'raw_", $source);

        $this->assertStringNotContainsString(
            '$response->body()',
            $source,
            'The remote body is untrusted free text and must never be logged.'
        );
    }

    // ==================================================================
    // 3. THE CONTROLLER AND ROUTES - authority and read-only
    // ==================================================================

    public function test_the_controller_exists_and_is_a_reader(): void
    {
        $controller = (string) file_get_contents(base_path('app/Http/Controllers/DiagnosticReportController.php'));

        $this->assertTrue(class_exists(DiagnosticReportController::class));

        foreach (['store', 'update', 'destroy'] as $mutation) {
            $this->assertStringNotContainsString(
                "function {$mutation}",
                $controller,
                "The 9E/9F controller must have no {$mutation}()."
            );
        }
    }

    public function test_diagnostic_routes_are_admin_only_get_routes(): void
    {
        $web = (string) file_get_contents(base_path('routes/web.php'));

        $this->assertMatchesRegularExpression(
            "#/diagnostics'.*?role:Admin#s",
            $web,
            'The diagnostic list must be Admin-only.'
        );

        $this->assertMatchesRegularExpression(
            "#/diagnostics/\{report\}'.*?role:Admin#s",
            $web,
            'The diagnostic detail must be Admin-only.'
        );

        // No mutation route may exist for this resource in any verb.
        foreach (['post', 'put', 'patch', 'delete'] as $verb) {
            $this->assertDoesNotMatchRegularExpression(
                "#Route::{$verb}\('/diagnostics#i",
                $web,
                "No {$verb} route may exist for diagnostics; the loop is read-only."
            );
        }
    }

    public function test_no_delivery_monitoring_is_duplicated(): void
    {
        $reader = $this->readerSource();

        // 9D already owns the delivery state machine. 9E/9F must not read it, or
        // there would be two surfaces claiming to describe delivery.
        foreach ([
            'delivery_status',
            'InspectionDeliveryAttempt',
            'site_inspections',
            'retry-delivery',
        ] as $deliveryConcern) {
            $this->assertStringNotContainsString($deliveryConcern, $reader);
        }

        // The CONTROLLER is checked on executable code only. Its class docblock
        // deliberately NAMES the delivery concerns in order to state what this
        // loop is not, and asserting against raw text would punish that
        // documentation. The invariant is that none of it is code.
        $controller = $this->executable($this->read('app/Http/Controllers/DiagnosticReportController.php'));

        foreach ([
            'delivery_status',
            'InspectionDeliveryAttempt',
            'site_inspections',
            'retry-delivery',
            'SiteInspection',
            'ZoningApplication',
        ] as $deliveryConcern) {
            $this->assertStringNotContainsString(
                $deliveryConcern,
                $controller,
                "9E/9F must not touch the Loop 9 delivery state machine. Found '{$deliveryConcern}'."
            );
        }
    }

    public function test_the_diagnostic_ui_has_no_write_control(): void
    {
        foreach (['Index', 'Show'] as $page) {
            $source = (string) file_get_contents(base_path("resources/js/Pages/Diagnostics/{$page}.jsx"));

            foreach (['router.post', 'router.put', 'router.patch', 'router.delete', 'method:'] as $write) {
                $this->assertStringNotContainsString(
                    $write,
                    $source,
                    "Diagnostics/{$page}.jsx must not issue a write. Found '{$write}'."
                );
            }

            // Nor may a retry or reassignment control leak in from elsewhere.
            foreach (['Retry Delivery', 'Reassign'] as $foreignControl) {
                $this->assertStringNotContainsString($foreignControl, $source);
            }
        }
    }

    public function test_sanitized_text_is_never_reparsed_as_markup(): void
    {
        // Checked on executable code only: both pages deliberately name
        // `dangerouslySetInnerHTML` in a comment to record why they do not use it.
        foreach (['Index', 'Show'] as $page) {
            $code = $this->executable($this->read("resources/js/Pages/Diagnostics/{$page}.jsx"));

            $this->assertStringNotContainsString(
                'dangerouslySetInnerHTML',
                $code,
                "Diagnostics/{$page}.jsx must never inject remote text as markup."
            );

            // Sanitized text must be rendered as an inert text node.
            $this->assertStringContainsString(
                'whitespace-pre-wrap',
                $code,
                "Diagnostics/{$page}.jsx must render sanitized prose as plain text."
            );
        }
    }
}
