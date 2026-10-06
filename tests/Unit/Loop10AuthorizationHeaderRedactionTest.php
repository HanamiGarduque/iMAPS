<?php

namespace Tests\Unit;

use App\Support\DiagnosticTextSanitizer;
use Tests\TestCase;

/**
 * Loop 10 non-device acceptance - the `Authorization` header redaction defect.
 *
 * THE DEFECT THIS PINS
 * --------------------
 * `DiagnosticTextSanitizer::redactBearerAndAuthorization()` matched `\S+` after
 * the colon, which stops after ONE whitespace-delimited token. On the real header
 * shape
 *
 *     Authorization: Bearer abc123
 *
 * that consumed only the word `Bearer`, and the rule produced
 *
 *     Authorization: [redacted credential] abc123
 *
 * The bearer rule running immediately afterwards could no longer match, because
 * the word it searches for had already been consumed by the header rule. The
 * output therefore LOOKED redacted while the credential value remained readable
 * in the diagnostic text a Planning Officer is shown.
 *
 * This was found by running the sanitizer during Loop 10 acceptance, not by
 * reading the code. Every case below was an observed output.
 *
 * NOTE: this extends Tests\TestCase, not PHPUnit\Framework\TestCase, because
 * `DiagnosticTextSanitizer::redactKnownCredentialValues()` reads `config()` and
 * the `users` handshake values. Under a bare PHPUnit case the container is not
 * booted and every assertion dies with `Class "config" does not exist`, which
 * looks like a sanitizer failure but is a harness failure.
 */
class Loop10AuthorizationHeaderRedactionTest extends TestCase
{
    private const TOKEN = 'abc123SECRETVALUE';

    /**
     * THE REGRESSION: the header must not leave the credential value behind.
     */
    public function test_authorization_bearer_header_does_not_leak_the_credential(): void
    {
        $out = DiagnosticTextSanitizer::sanitize('Authorization: Bearer '.self::TOKEN);

        $this->assertStringNotContainsString(
            self::TOKEN,
            $out,
            'The credential value survived sanitization inside an Authorization header.'
        );
        $this->assertStringContainsString(DiagnosticTextSanitizer::MARKER_CREDENTIAL, $out);
    }

    /**
     * Every recognised auth scheme, not just bearer, because the same rule
     * applied to all of them and the same truncation applied to all of them.
     */
    public function test_every_auth_scheme_header_consumes_its_credential(): void
    {
        foreach (['Bearer', 'Token', 'Basic', 'Digest', 'ApiKey'] as $scheme) {
            $out = DiagnosticTextSanitizer::sanitize('Authorization: '.$scheme.' '.self::TOKEN);

            $this->assertStringNotContainsString(
                self::TOKEN,
                $out,
                "The {$scheme} header left its credential value in the output."
            );
        }
    }

    /**
     * The real defect shape: a JWT in a bearer header. A partially redacted JWT
     * is still a leak, and a shortened one is still usable as an oracle.
     */
    public function test_authorization_header_with_a_jwt_leaks_no_jwt_fragment(): void
    {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyMzQ1In0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';

        $out = DiagnosticTextSanitizer::sanitize('Authorization: Bearer '.$jwt);

        $this->assertStringNotContainsString('eyJ', $out);
        $this->assertStringNotContainsString($jwt, $out);
        $this->assertStringNotContainsString('dBjftJeZ', $out);
    }

    /**
     * Case and separator insensitivity: the rule must not be bypassable by
     * writing `authorization=`, `AUTHORIZATION:` or extra whitespace.
     */
    public function test_the_header_rule_is_not_bypassable_by_formatting(): void
    {
        foreach ([
            'authorization: Bearer '.self::TOKEN,
            'AUTHORIZATION: Bearer '.self::TOKEN,
            'Authorization = Bearer '.self::TOKEN,
            'Authorization:   Bearer   '.self::TOKEN,
            "Authorization:\tBearer ".self::TOKEN,
        ] as $variant) {
            $out = DiagnosticTextSanitizer::sanitize($variant);

            $this->assertStringNotContainsString(
                self::TOKEN,
                $out,
                'Authorization header redaction was bypassable by formatting: '.$variant
            );
        }
    }

    /**
     * A header with no recognised scheme must still have its value removed.
     */
    public function test_an_unrecognised_scheme_header_is_still_redacted(): void
    {
        $out = DiagnosticTextSanitizer::sanitize('authorization: '.self::TOKEN);

        $this->assertStringNotContainsString(self::TOKEN, $out);
    }

    /**
     * A bare `Bearer x` with no header name at all must still be redacted; this
     * is the case the original rule handled correctly and must keep working.
     */
    public function test_a_bare_bearer_fragment_is_still_redacted(): void
    {
        $out = DiagnosticTextSanitizer::sanitize('the header said bearer '.self::TOKEN);

        $this->assertStringNotContainsString(self::TOKEN, $out);
    }

    /**
     * The composed hostile string: every sensitive class in one value, which is
     * the shape a real pasted diagnostic report has.
     */
    public function test_composed_hostile_report_leaks_nothing(): void
    {
        $hostile = 'see https://laapipjyprmmaylunxib.supabase.co/storage/v1/object/sign/inspection-photos/a/b.jpg?token=SECRET'
            .' and eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOjEyMyJ9.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk'
            .' plus Authorization: Bearer '.self::TOKEN
            .' and service_key=sb_secret_abcdefghijklmnop';

        $out = DiagnosticTextSanitizer::sanitize($hostile);

        foreach ([
            'laapipjyprmmaylunxib.supabase.co' => 'Supabase host',
            'token=SECRET'                      => 'signed URL token',
            'eyJ'                               => 'JWT',
            self::TOKEN                         => 'bearer credential',
            'sb_secret_abcdefghijklmnop'        => 'service key',
        ] as $needle => $what) {
            $this->assertStringNotContainsString($needle, $out, "A {$what} survived sanitization.");
        }

        // Ordinary prose must survive, or the sanitizer destroys the report.
        $this->assertStringContainsString('see', $out);
    }

    /**
     * No fragment of the credential may be echoed back, not even a prefix: a
     * prefix is a confirmation oracle for an attacker probing for the value.
     *
     * The output is allowed to carry more than one marker. The scheme-aware rule
     * consumes `Bearer <token>` and then the fallback value rule still sees the
     * remaining whitespace before the authored marker, so it appends a second
     * one. Two markers are cosmetically redundant and behaviourally harmless;
     * what matters is that no credential byte survives. The earlier form of this
     * assertion demanded a single marker and so failed on correct behaviour.
     */
    public function test_no_credential_prefix_is_echoed_back(): void
    {
        $out = DiagnosticTextSanitizer::sanitize('Authorization: Bearer '.self::TOKEN);

        $this->assertStringNotContainsString(substr(self::TOKEN, 0, 6), $out);
        $this->assertStringNotContainsString(substr(self::TOKEN, -6), $out);
        $this->assertMatchesRegularExpression(
            '/^Authorization:(\s*\[[^]]+\])+$/',
            $out,
            'The redacted header must contain nothing but authored markers.'
        );
    }

    /**
     * The sanitizer must still REDACT rather than merely escape, and must still
     * preserve ordinary diagnostic prose.
     */
    public function test_ordinary_prose_is_preserved(): void
    {
        $this->assertStringContainsString(
            'the map fails on cold start at step 2',
            DiagnosticTextSanitizer::sanitize('the map fails on cold start at step 2')
        );
    }
}