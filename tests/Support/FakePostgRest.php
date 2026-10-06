<?php

namespace Tests\Support;

use GuzzleHttp\Promise\PromiseInterface;
use Illuminate\Http\Client\Factory;
use Illuminate\Http\Client\Request;

/**
 * A very small in-memory stand-in for the PostgREST endpoint the bridge writes
 * to.
 *
 * It exists so the namespaced-identity contract can be tested BEHAVIOURALLY:
 * the real writer builds real requests, and this simulator applies the two
 * PostgREST behaviours the contract depends on:
 *
 *  1. `?on_conflict=col_a,col_b` merges on that COMPOSITE key
 *     (`Prefer: resolution=merge-duplicates`).
 *  2. an `on_conflict` target that does not match a declared unique key is
 *     refused with HTTP 409 / `42P10`, exactly as PostgreSQL refuses it. That
 *     is the proven old-deployment fail-safe.
 *
 * It deliberately does NOT emulate anything else (RLS, triggers, generated
 * columns, spatial types). Column-level behaviour is proven against real
 * PostgreSQL by `database/sql/2026_10_01_bridge_source_namespace_dryrun.sql`.
 */
final class FakePostgRest
{
    /** @var array<string, list<array<string, mixed>>> */
    private array $rows = [];

    /** @var array<string, list<list<string>>> table => unique column tuples */
    private array $uniqueKeys = [];

    /** @var list<array<string, mixed>> every request the code under test made */
    private array $requests = [];

    private int $nextUuid = 1;

    /**
     * Seed a row and, optionally, declare the unique keys of its table.
     *
     * @param  list<list<string>>  $uniqueKeys
     */
    public function seed(string $table, array $row, array $uniqueKeys = []): void
    {
        $this->rows[$table] ??= [];
        $this->rows[$table][] = $row + ['id' => $this->uuid()];

        if ($uniqueKeys !== []) {
            $this->uniqueKeys[$table] = $uniqueKeys;
        }
    }

    /**
     * Declare the table's unique keys without seeding a row.
     *
     * @param  list<list<string>>  $uniqueKeys
     */
    public function declareUniqueKeys(string $table, array $uniqueKeys): void
    {
        $this->uniqueKeys[$table] = $uniqueKeys;
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function rows(string $table): array
    {
        return $this->rows[$table] ?? [];
    }

    public function count(string $table): int
    {
        return count($this->rows[$table] ?? []);
    }

    /**
     * @return list<array<string, mixed>>
     */
    public function requests(): array
    {
        return $this->requests;
    }

    public function handle(Request $request): PromiseInterface
    {
        $url = $request->url();
        $method = strtoupper($request->method());
        $this->requests[] = [
            'method'   => $method,
            'url'      => $url,
            'body'     => $request->data(),
            'path'     => $this->path($url),
            'query'    => $this->query($url),
        ];

        $table = $this->path($url);

        return $method === 'POST'
            ? $this->post($request, $table, $url)
            : $this->get($request, $table, $url);
    }

    private function post(Request $request, string $table, string $url): PromiseInterface
    {
        $payload = $request->data();

        if ($payload === []) {
            return $this->conflict('42P01', 'no payload');
        }

        $incoming = array_is_list($payload) ? $payload : [$payload];
        $onConflict = $this->onConflictTarget($url);

        if ($onConflict === null) {
            // Plain INSERT. PostgREST allows it; the unique keys below still
            // protect the row, which is how an un-namespaced old writer would
            // be stopped by a pre-existing row.
            $result = [];
            foreach ($incoming as $row) {
                $result[] = $this->insertRow($table, $row);
            }

            return $this->representation($request, $result);
        }

        if (! $this->hasUniqueKey($table, $onConflict)) {
            // The proven old-deployment failure: PostgreSQL has no unique index
            // matching this ON CONFLICT target.
            return $this->conflict(
                '42P10',
                'there is no unique or exclusion constraint matching the ON CONFLICT specification',
            );
        }

        $result = [];
        foreach ($incoming as $row) {
            $existing = $this->findByKey($table, $onConflict, $row);

            if ($existing === null) {
                $result[] = $this->insertRow($table, $row);

                continue;
            }

            // resolution=merge-duplicates: the provided columns are written.
            foreach ($row as $column => $value) {
                $this->rows[$table][array_search($existing, $this->rows[$table], true)][$column] = $value;
            }

            $result[] = $existing;
        }

        return $this->representation($request, $result);
    }

    private function get(Request $request, string $table, string $url): PromiseInterface
    {
        $query = $this->query($url);
        $matched = $this->rows[$table] ?? [];

        foreach ($query as $column => $value) {
            if (in_array($column, ['select', 'order', 'limit', 'offset', 'on_conflict'], true)) {
                continue;
            }

            $matched = array_values(array_filter(
                $matched,
                fn (array $row): bool => $this->matches($row[$column] ?? null, (string) $value)
            ));
        }

        if (isset($query['limit']) && is_numeric($query['limit'])) {
            $matched = array_slice($matched, 0, (int) $query['limit']);
        }

        return $this->jsonResponse($matched);
    }

    private function matches(mixed $actual, string $filter): bool
    {
        if (str_starts_with($filter, 'eq.')) {
            return (string) $actual === substr($filter, 3);
        }

        if (str_starts_with($filter, 'is.null')) {
            return $actual === null;
        }

        if (str_starts_with($filter, 'in.(')) {
            $wanted = array_map('trim', explode(',', trim(substr($filter, 3), '()')));
            $wanted = array_map(
                static fn (string $v): string => trim($v, '"'),
                $wanted,
            );

            return in_array((string) $actual, $wanted, true);
        }

        return true;
    }

    private function insertRow(string $table, array $row): array
    {
        $row += ['id' => $this->uuid()];
        $this->rows[$table][] = $row;

        return $row;
    }

    /**
     * @param  list<string>  $key
     */
    private function findByKey(string $table, array $key, array $candidate): ?array
    {
        foreach ($this->rows[$table] ?? [] as $row) {
            $same = true;

            foreach ($key as $column) {
                if (($row[$column] ?? null) !== ($candidate[$column] ?? null)) {
                    $same = false;

                    break;
                }
            }

            if ($same) {
                return $row;
            }
        }

        return null;
    }

    /**
     * @param  list<string>  $key
     */
    private function hasUniqueKey(string $table, array $key): bool
    {
        foreach ($this->uniqueKeys[$table] ?? [] as $declared) {
            if ($declared === $key) {
                return true;
            }
        }

        return false;
    }

    /**
     * @return list<string>|null
     */
    private function onConflictTarget(string $url): ?array
    {
        $query = $this->query($url);

        if (! isset($query['on_conflict'])) {
            return null;
        }

        return array_map('trim', explode(',', (string) $query['on_conflict']));
    }

    /**
     * @param  list<array<string, mixed>>  $rows
     */
    private function representation(Request $request, array $rows): PromiseInterface
    {
        $prefer = strtolower((string) ($request->header('Prefer')[0] ?? ''));

        if (str_contains($prefer, 'return=minimal')) {
            return $this->jsonResponse([], 201);
        }

        return $this->jsonResponse($rows, 201);
    }

    /**
     * @param  list<array<string, mixed>>  $body
     */
    /**
     * @param  list<array<string, mixed>>  $body
     */
    private function jsonResponse(array $body, int $status = 200): PromiseInterface
    {
        return Factory::response($body, $status);
    }

    private function conflict(string $code, string $message): PromiseInterface
    {
        return Factory::response(
            ['code' => $code, 'message' => $message, 'details' => null, 'hint' => null],
            409,
        );
    }

    private function path(string $url): string
    {
        $path = parse_url($url, PHP_URL_PATH) ?: '';

        return preg_replace('#^/rest/v1/#', '', $path) ?: '';
    }

    /**
     * @return array<string, string>
     */
    private function query(string $url): array
    {
        $query = [];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

        // parse_str mangles PostgREST's `in.(1,2)` into `in_(1,2)`.
        $raw = (string) parse_url($url, PHP_URL_QUERY);
        foreach (explode('&', $raw) as $pair) {
            if ($pair === '') {
                continue;
            }

            [$key, $value] = array_pad(explode('=', $pair, 2), 2, '');
            $query[rawurldecode($key)] = rawurldecode($value);
        }

        return $query;
    }

    private function uuid(): string
    {
        $n = $this->nextUuid++;

        return sprintf('00000000-0000-4000-8000-%012d', $n);
    }
}
