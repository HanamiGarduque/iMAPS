<?php

namespace App\Services;

use RuntimeException;

/**
 * Bridge source identity (cross-environment namespace guard).
 *
 * The shared Supabase FieldSync bridge project is written to by more than one
 * iMAPS environment. Its mirror tables keyed local iMAPS rows by BARE local
 * integer ids, which are only unique inside ONE iMAPS database. Without a
 * namespace, two environments resolve the same `local_inspection_id = 37` to
 * the same remote `field_jobs` row and overwrite each other's assignment
 * (incident: APP-2026-00026 / inspection 37 / job a761b17a-...).
 *
 * This class is the single authority for the namespace value. It is
 * deliberately small and dependency-free so every writer and reader resolves
 * it the same way.
 *
 * Contract (LOCKED):
 *  - explicit      - only `IMAPS_BRIDGE_SOURCE_ID` / `config('bridge.source_id')`;
 *  - stable        - nothing here derives it from hostname, environment name,
 *                    database name, APP_ENV or any runtime state;
 *  - unique        - one distinct value per iMAPS database/environment;
 *  - non-secret    - it is an environment label, never a credential;
 *  - FAIL CLOSED   - a write that requires bridge identity without a configured
 *                    source id raises, and is never retried against another
 *                    environment's namespace.
 *
 * There is intentionally no `default`, no `production`, no hostname and no
 * database-name fallback: every one of those was a way for two environments to
 * agree on one identity and collide again.
 */
class BridgeSourceIdentity
{
    /**
     * Config key that exposes the value to the application.
     */
    public const CONFIG_KEY = 'bridge.source_id';

    /**
     * Canonical environment variable name.
     */
    public const ENV_KEY = 'IMAPS_BRIDGE_SOURCE_ID';

    /**
     * Remote column that carries the namespace on every mirror table.
     */
    public const COLUMN = 'bridge_source_id';

    /**
     * Accepted shape: lowercase/uppercase alphanumerics plus `.`, `_`, `-`.
     *
     * Deliberately excludes commas, parentheses, quotes, whitespace, `*` and
     * `:`. PostgREST filter values are comma-separated and parenthesised
     * (`?bridge_source_id=eq.<value>`), so a value containing those characters
     * would silently change the meaning of a lookup filter rather than fail.
     */
    public const FORMAT = '/^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$/';

    /**
     * Values that mean "nobody actually configured this".
     *
     * These are rejected even when explicitly present, because a value that
     * every deployment would pick is exactly the shared sentinel the namespace
     * exists to eliminate. They are the documented "unset" spellings, not
     * environment names.
     *
     * Note on `production`: it is NOT in this list. An environment genuinely
     * named "production" is a real, explicit choice, and the contract permits
     * an explicitly configured value. What the contract forbids is a SILENT
     * fallback to it. Uniqueness across environments remains an operational
     * obligation of whoever sets the value; see the documentation.
     *
     * @var list<string>
     */
    public const REJECTED = [
        'default',
        'none',
        'null',
        'nil',
        'undefined',
        'changeme',
        'todo',
        'fixme',
        'localhost',
        'example',
        'placeholder',
        'your-bridge-source-id',
    ];

    /**
     * Is a usable bridge source identity configured for this deployment?
     *
     * A diagnostics-only helper: it answers the question without throwing, so a
     * health surface can report "not configured" instead of failing. It must
     * never be used to skip a guard on a write path.
     */
    public static function isConfigured(): bool
    {
        return self::normalize(self::rawConfiguredValue()) !== null;
    }

    /**
     * The configured bridge source identity, or FAIL CLOSED.
     *
     * @throws RuntimeException when the value is missing or unusable.
     */
    public static function id(): string
    {
        $value = self::normalize(self::rawConfiguredValue());

        if ($value === null) {
            throw new RuntimeException(self::missingMessage());
        }

        return $value;
    }

    /**
     * Explain, without throwing, why a configured value would be rejected.
     * Returns null when the value is usable.
     */
    public static function rejectionReason(?string $value): ?string
    {
        if ($value === null || trim($value) === '') {
            return 'it is not set';
        }

        $trimmed = trim($value);

        if (in_array(strtolower($trimmed), self::REJECTED, true)) {
            return 'it is a shared placeholder value ("' . $trimmed . '") rather than a unique per-environment identity';
        }

        if (preg_match(self::FORMAT, $trimmed) !== 1) {
            return 'it must be 2-63 characters of letters, digits, dot, underscore or hyphen, and must not contain commas, parentheses, quotes or whitespace';
        }

        return null;
    }

    private static function missingMessage(): string
    {
        $configured = self::rawConfiguredValue();
        $reason = self::rejectionReason($configured);

        $message = 'Refusing to write the FieldSync bridge: ' . self::ENV_KEY . ' is unusable because ' . $reason . '. '
            . 'Every iMAPS environment sharing this Supabase project must set a stable, unique, non-secret ' . self::ENV_KEY
            . ' (letters, digits, dot, underscore or hyphen). There is deliberately no default: a shared fallback value '
            . 'would let two environments overwrite each other\'s rows again.';

        if ($reason !== 'it is not set') {
            $message .= ' Rejected value length: ' . strlen((string) $configured) . '.';
        }

        return $message;
    }

    /**
     * Read the configured value without inventing one.
     *
     * `config()` is authoritative because it survives `config:cache`. `env()`
     * is a deliberate fallback for a worker booted before config caching, which
     * is the same reason the existing Supabase writer reads both.
     */
    private static function rawConfiguredValue(): ?string
    {
        if (function_exists('config')) {
            try {
                $fromConfig = config(self::CONFIG_KEY);

                if (is_string($fromConfig) && trim($fromConfig) !== '') {
                    return $fromConfig;
                }
            } catch (\Throwable $e) {
                // A boot that cannot read config must still fail closed below,
                // never silently fall through to an unvalidated identity.
            }
        }

        $fromEnv = env(self::ENV_KEY);

        return is_string($fromEnv) && trim($fromEnv) !== '' ? $fromEnv : null;
    }

    private static function normalize(?string $value): ?string
    {
        if ($value === null) {
            return null;
        }

        $trimmed = trim($value);

        return self::rejectionReason($trimmed) === null ? $trimmed : null;
    }
}
