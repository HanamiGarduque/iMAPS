<?php

namespace App\Support;

/**
 * LOOP 9E/9F - server-side sanitizer for untrusted remote free text.
 *
 * WHY THIS EXISTS
 * ---------------
 * `diagnostic_reports` is a REMOTE table that a FieldSync Site Inspector fills in
 * by hand. It is therefore untrusted free text, and the audit found that the one
 * real report on the live database has a signed Supabase Storage URL - a bearer
 * capability carrying a JWT - pasted into its `summary` field.
 *
 * That is not hypothetical. Supabase signed URLs are time-limited read grants on
 * private inspection photos. Returning one to a browser hands the reader the
 * photo. So the rule this class enforces is absolute:
 *
 *   RAW REMOTE FREE TEXT MUST NEVER REACH A BROWSER.
 *
 * Every caller passes text through {@see self::sanitize()} BEFORE it becomes an
 * Inertia prop or a JSON field. The browser only ever receives output from here.
 *
 * DESIGN RULES
 * ------------
 * - REDACT, DO NOT ESCAPE. Escaping stops markup injection but does nothing about
 *   a leaked capability. A signed URL is not dangerous because of its characters.
 * - REDACT THE WHOLE URL, NOT JUST ITS QUERY. Stripping `?token=` off a signed
 *   URL leaves a link that looks safe and still leaks the path of a private
 *   object. The entire value goes.
 * - AUTHORED MARKERS ONLY. Output is fixed copy. No fragment of a secret is ever
 *   echoed back, not even a prefix, because a prefix is a confirmation oracle for
 *   an attacker probing for the value.
 * - NEVER LOG THE INPUT. Nothing here writes to a log, and no caller may log the
 *   pre-sanitize value. A sanitizer that logs what it removed is a second leak.
 * - KNOWN CREDENTIALS ARE MATCHED BY VALUE. The configured Supabase service key
 *   and any local handshake value are compared directly, so a report that
 *   quotes this application's own configuration is still redacted even though the
 *   shape is not recognizable.
 * - PRESERVE ORDINARY PROSE. Only the sensitive span is replaced, so a support
 *   agent still reads the actual bug report.
 */
class DiagnosticTextSanitizer
{
    /** Authored marker for a removed link that carried a capability. */
    public const MARKER_LINK = '[redacted sensitive link]';

    /** Authored marker for a removed credential-shaped value. */
    public const MARKER_CREDENTIAL = '[redacted credential]';

    /**
     * Sanitize one untrusted free-text value.
     *
     * Accepts anything, including null, arrays and scalars, because the input is
     * whatever a remote JSON document happened to contain. Returns a string.
     */
    public static function sanitize(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        if (! is_scalar($value)) {
            // An unexpected non-scalar is never rendered. It is not stringified,
            // because a nested object could carry structure this class has never
            // been taught to inspect.
            return '';
        }

        $text = (string) $value;

        if ($text === '') {
            return '';
        }

        // THE UNESCAPE IS A SECURITY FIX, AND IT RUNS FIRST.
        //
        // Text arriving from the remote table may be slash-escaped
        // (`https:\/\/host\/...?token=`) because it travelled through a JSON
        // document and a page-prop encoding. A URL rule written only for literal
        // `https://` matches nothing in that form and passes a LIVE SIGNED URL
        // straight through.
        //
        // This was observed against the real report, not theorised: the first
        // verification pass showed the storage host surviving sanitization for
        // exactly this reason.
        //
        // THE FALLBACK IS NOT OPTIONAL. A naive `json_decode('"' . $text . '"')`
        // returns NULL for any value containing a raw control character, and
        // inspector free text contains literal newlines and tabs constantly. A
        // NULL return would therefore mean "sanitize nothing", which is the
        // worst possible outcome for a security control. So the per-escape
        // decoder is the PRIMARY path and the whole-JSON decode is only a
        // refinement on top of it.
        $text = self::decodeEscapes($text);

        // ORDER MATTERS. A signed URL already contains a JWT in its query string,
        // so the URL rules must run first; otherwise the JWT rule would replace
        // only the token and leave a usable-looking link behind.
        $text = self::redactKnownCredentialValues($text);
        $text = self::redactUrls($text);
        $text = self::redactBearerAndAuthorization($text);
        $text = self::redactJwtShaped($text);
        $text = self::redactKeyShaped($text);

        return $text;
    }

    /**
     * Undo JSON string escapes so a literal URL is recognizable to the rules.
     *
     * THE PER-ESCAPE DECODER IS THE PRIMARY PATH BECAUSE IT CANNOT FAIL. It only
     * rewrites a backslash followed by a recognized escape and leaves every other
     * byte alone, including the raw newlines and tabs that real inspector prose
     * contains constantly.
     *
     * A whole-JSON decode is attempted afterwards purely as a REFINEMENT, to also
     * resolve `\u002F`-style sequences, which are the same bypass in a different
     * disguise. It is allowed to fail, because it does fail on text holding raw
     * control characters - `json_decode('"' . $text . '"')` returns NULL for those -
     * and its failure must never discard the primary pass. Getting this backwards
     * would mean "sanitize nothing" whenever a report contains a newline, which is
     * precisely the case the redaction exists for.
     */
    private static function decodeEscapes(string $text): string
    {
        if (! str_contains($text, '\\')) {
            return $text;
        }

        $primary = (string) preg_replace_callback(
            '/\\\\(u[0-9a-fA-F]{4}|["\\\\\/nrtbf])/',
            static function (array $m): string {
                return match ($m[1]) {
                    'n' => "\n",
                    'r' => "\r",
                    't' => "\t",
                    'b' => "\x08",
                    'f' => "\f",
                    'u' => (string) mb_chr((int) hexdec(substr($m[1], 1)), 'UTF-8'),
                    default => $m[1],
                };
            },
            $text
        );

        // Refinement only. On failure the primary result stands, unchanged.
        $refined = json_decode('"' . str_replace(['\\', '"'], ['\\\\', '\\"'], $primary) . '"');

        return is_string($refined) ? $refined : $primary;
    }

    /**
     * Sanitize a value that may be absent, preserving the null/absent distinction.
     *
     * Used for fields whose absence is itself meaningful, so that "no value" does
     * not silently become an empty string in a diagnostic payload.
     *
     * @return array<string, string|null>
     */
    public static function sanitizeFields(array $values, array $keys): array
    {
        $out = [];

        foreach ($keys as $key) {
            $out[$key] = array_key_exists($key, $values) && $values[$key] !== null
                ? self::sanitize($values[$key])
                : null;
        }

        return $out;
    }

    /**
     * Remove the exact configured credential values, wherever they appear.
     *
     * Shape-based rules cannot recognize a short or unusual key. Comparing against
     * the live configuration closes that hole, so a report quoting this
     * application's own service key or a handshake value is redacted regardless
     * of how it is formatted.
     *
     * The comparison is done with a plain substring check against a value that is
     * only ever used for comparison. It is never stored, returned or logged.
     */
    private static function redactKnownCredentialValues(string $text): string
    {
        $secrets = [];

        foreach ([
            config('services.supabase.service_key'),
            config('services.supabase.anon_key'),
        ] as $configured) {
            if (is_string($configured) && strlen($configured) >= 20) {
                $secrets[$configured] = true;
            }
        }

        // Local handshake values are per-account secrets on the bridge. A remote
        // free-text report has no legitimate reason to contain one.
        try {
            if (config('database.default') && \Illuminate\Support\Facades\Schema::hasTable('users')) {
                \Illuminate\Support\Facades\DB::table('users')
                    ->whereNotNull('handshake_key')
                    ->where('handshake_key', '<>', '')
                    ->pluck('handshake_key')
                    ->each(function ($value) use (&$secrets) {
                        if (is_string($value) && strlen($value) >= 12) {
                            $secrets[$value] = true;
                        }
                    });
            }
        } catch (\Throwable) {
            // Diagnostics must never fail because a secret lookup could not run.
            // The shape-based rules below still apply.
        }

        foreach (array_keys($secrets) as $secret) {
            $text = str_replace($secret, self::MARKER_CREDENTIAL, $text);
        }

        return $text;
    }

    /**
     * Remove any URL that carries or implies a capability.
     *
     * Four classes are removed whole:
     *  1. Supabase Storage object URLs, signed or public-looking;
     *  2. any URL with a credential-shaped query parameter;
     *  3. any URL carrying a JWT-shaped value anywhere in it;
     *  4. any URL on a Supabase project host, whatever its path.
     *
     * Rule 4 exists because the real report's URL is long and the earlier
     * storage-path rule alone proved too narrow to be a safe boundary. A Supabase
     * host in untrusted free text has no legitimate diagnostic reason to appear,
     * so the whole URL goes regardless of shape.
     *
     * A plain http(s) URL elsewhere is left intact: it is not a secret, and
     * removing every link would destroy ordinary diagnostic prose. The UI renders
     * survivors as non-clickable text, which is a presentation rule, not a
     * security one.
     */
    private static function redactUrls(string $text): string
    {
        // A URL is a scheme, an authority, then anything up to whitespace or a
        // closing quote/bracket. Deliberately greedy about the query string so a
        // signed URL is captured in full.
        // A leading `\b` is NOT used. In the real report the first URL is
        // concatenated directly onto the previous word with no delimiter
        // ("pagkakaintindi kohttps://..."), so a word boundary matched nothing
        // and the whole rule silently passed every URL in the text. That was the
        // second real defect found during live verification.
        //
        // The character class terminates on whitespace, quotes, angle brackets and
        // brackets. An ESCAPED quote or bracket is tolerated inside the body
        // because the value arrives with backslashes still in it; the trailing
        // backslash is trimmed by the cleanup below.
        return (string) preg_replace_callback(
            '#https?://[^\s<>"\'\)\]}]+(?:\\.)?#i',
            function (array $match): string {
                $url = $match[0];

                $isStorageObject = (bool) preg_match('#/storage/v1/object/(sign|public|authenticated)/#i', $url);
                $isSupabaseHost = (bool) preg_match('#\.supabase\.(?:co|in)/#i', $url);
                $hasCredentialQuery = (bool) preg_match(
                    '#[\?&](token|signature|sig|key|api[_-]?key|access[_-]?token|auth|credential|secret|x-amz-[a-z-]+|expires)=#i',
                    $url
                );
                $carriesJwt = (bool) preg_match('#\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#', $url);

                return ($isStorageObject || $isSupabaseHost || $hasCredentialQuery || $carriesJwt)
                    ? self::MARKER_LINK
                    // Strip the trailing backslash an escaped terminator left
                    // behind, so a preserved plain URL does not gain stray
                    // punctuation in the rendered text.
                    : rtrim($url, '\\');
            },
            $text
        );
    }

    /** Remove an `Authorization: ...` or `Bearer ...` fragment. */
    private static function redactBearerAndAuthorization(string $text): string
    {
        $text = (string) preg_replace(
            '/\bauthorization\s*[:=]\s*\S+/i',
            'Authorization: ' . self::MARKER_CREDENTIAL,
            $text
        );

        return (string) preg_replace(
            '/\bbearer\s+\S+/i',
            'Bearer ' . self::MARKER_CREDENTIAL,
            $text
        );
    }

    /**
     * Remove any JWT-shaped value.
     *
     * `eyJ` is the base64 of `{"`, so it is a reliable head for a real JWT while
     * being vanishingly unlikely in bug-report prose. The trailing components are
     * required so an ordinary word beginning with those characters is not eaten.
     */
    private static function redactJwtShaped(string $text): string
    {
        return (string) preg_replace(
            '/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}/',
            self::MARKER_CREDENTIAL,
            $text
        );
    }

    /**
     * Remove long opaque key-shaped assignments.
     *
     * Catches a pasted service-role or publishable key that is not the one this
     * application is configured with, for example one belonging to another
     * environment. The length floor keeps ordinary long identifiers and stack
     * frames out of the result.
     */
    private static function redactKeyShaped(string $text): string
    {
        $text = (string) preg_replace(
            '/\b(?:sb_(?:secret|publishable)_|sk_(?:live|test)_|gh[pousr]_)[A-Za-z0-9_-]{8,}/',
            self::MARKER_CREDENTIAL,
            $text
        );

        return (string) preg_replace(
            '/\b(?:api[_-]?key|apikey|service[_-]?role|secret[_-]?key|access[_-]?token|handshake[_-]?key)'
            . '\s*[:=]\s*["\']?[A-Za-z0-9._-]{16,}["\']?/i',
            self::MARKER_CREDENTIAL,
            $text
        );
    }
}
