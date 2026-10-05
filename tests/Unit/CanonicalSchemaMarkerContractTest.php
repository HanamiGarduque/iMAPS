<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

/**
 * `CANONICAL_DATABASE_SCHEMA.md` is a copy-pasteable SQL source of truth:
 * copy the whole file, paste it into PostgreSQL, and the canonical structure
 * exists in one controlled execution. That promise is only credible if the file
 * really is pure SQL, and only stable if the markers it declares are unique.
 *
 * These tests guard the file's *form*, which no other test covers. They cannot
 * prove the SQL is semantically correct - that is proved by executing the file
 * against a real PostgreSQL and fingerprinting the result against live.
 *
 * The change log explains each marker; the canonical file defines it. Every
 * reference there must resolve to exactly one definition here.
 */
class CanonicalSchemaMarkerContractTest extends TestCase
{
    private const CANONICAL = 'docs/CANONICAL_DATABASE_SCHEMA.md';

    private const CHANGE_LOG = 'docs/FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md';

    private const ARCHITECTURE = 'docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md';

    /**
     * Matches a marker reference with or without its brackets. The body
     * only: callers supply their own delimiters, so a delimiter mistake cannot
     * silently turn a reference scan into a no-op.
     */
    private const MARKER_BODY = '(\[SCHEMA-(?:BASE|ADD|EXT|SEQ|SEQOWN|IDENT|CON|IDX)-\d+\]|\bSCHEMA-(?:BASE|ADD|EXT|SEQ|SEQOWN|IDENT|CON|IDX)-\d+)';

    // ==================================================================
    // THE CANONICAL FILE IS PURE SQL
    // ==================================================================

    /**
     * The defect this pins: the file used to be 2,040 lines of Markdown
     * narrative mixed with SQL fragments, so "copy the whole file and run it"
     * could never work and narrative could silently creep back in.
     */
    public function test_canonical_schema_contains_no_markdown_outside_sql_comments(): void
    {
        foreach ($this->nonCommentLines() as $number => $line) {
            $this->assertDoesNotMatchRegularExpression(
                '/^\s*#{1,6}\s/',
                $line,
                "Markdown heading leaked into the canonical SQL at line {$number}: {$line}"
            );
            $this->assertDoesNotMatchRegularExpression(
                '/^\s*\|/',
                $line,
                "Markdown table row leaked into the canonical SQL at line {$number}: {$line}"
            );
            $this->assertStringNotContainsString(
                '```',
                $line,
                "Markdown code fence leaked into the canonical SQL at line {$number}: {$line}"
            );
            $this->assertStringNotContainsString(
                '**',
                $line,
                "Markdown bold marker leaked into the canonical SQL at line {$number}: {$line}"
            );
        }
    }

    /**
     * The extension must be declared before anything that uses a spatial type,
     * or a fresh database fails with `type "geometry" does not exist`.
     */
    public function test_canonical_schema_declares_postgis_before_any_spatial_table(): void
    {
        $sql = $this->canonical();

        $this->assertMatchesRegularExpression(
            '/CREATE EXTENSION IF NOT EXISTS postgis/i',
            $sql,
            'The canonical SQL must declare postgis itself; a fresh install cannot infer it.'
        );

        $extension = strpos($sql, 'CREATE EXTENSION IF NOT EXISTS postgis');
        $spatialTable = strpos($sql, 'CREATE TABLE public.barangay_boundary');

        $this->assertNotFalse($spatialTable);
        $this->assertLessThan(
            $spatialTable,
            $extension,
            'postgis must be declared before the first PostGIS table.'
        );
    }

    /**
     * Statement order is what makes the file executable in one pass:
     * sequences and tables before the constraints and indexes that reference them.
     */
    public function test_canonical_schema_orders_statements_for_a_single_forward_pass(): void
    {
        $sql = $this->canonical();

        $lastTable = strrpos($sql, 'CREATE TABLE public.');
        $firstConstraint = strpos($sql, 'ADD CONSTRAINT');
        $firstIndex = strpos($sql, 'CREATE INDEX');

        $this->assertNotFalse($lastTable);
        $this->assertNotFalse($firstConstraint);
        $this->assertNotFalse($firstIndex);

        // assertLessThan($expected, $actual): $actual must be below $expected.
        $this->assertLessThan($firstConstraint, $lastTable, 'Constraints must follow every table.');
        $this->assertLessThan($firstIndex, $lastTable, 'Indexes must follow every table.');
    }

    // ==================================================================
    // MARKERS ARE UNIQUE AND RESOLVABLE
    // ==================================================================

    /**
     * A marker appearing twice cannot be referenced unambiguously, so the change
     * log could never say which one it meant.
     */
    public function test_every_canonical_marker_is_declared_exactly_once(): void
    {
        $declarations = $this->markerDeclarations();

        $this->assertNotEmpty($declarations, 'The canonical SQL must declare schema markers.');

        // A keyed map would silently overwrite the first occurrence, which is
        // exactly the defect: collect every declaration, then look for repeats.
        $counts = array_count_values(array_column($declarations, 'marker'));
        $repeated = array_keys(array_filter($counts, static fn (int $n): bool => $n > 1));

        $this->assertSame(
            [],
            $repeated,
            'These canonical markers are declared more than once, so no document can '
            . 'reference them unambiguously: ' . implode(', ', $repeated)
        );
    }

    /**
     * A reference to a marker that does not exist is worse than no reference:
     * it sends a reader looking for an object that was never defined.
     */
    public function test_every_marker_referenced_in_the_change_log_exists_in_the_canonical_schema(): void
    {
        $declared = $this->declaredMarkers();
        $orphans = [];

        foreach ($this->referencedMarkers($this->changeLog()) as $marker) {
            if (! isset($declared[$marker])) {
                $orphans[$marker] = true;
            }
        }

        $this->assertSame(
            [],
            array_keys($orphans),
            'The change log references canonical markers that the canonical schema never declares.'
        );
    }

    /**
     * The architecture document points readers at schema detail. Those pointers
     * must resolve too, otherwise the reference is worse than nothing.
     */
    public function test_every_marker_referenced_in_the_architecture_doc_exists(): void
    {
        $declared = $this->declaredMarkers();
        $orphans = [];

        foreach ($this->referencedMarkers($this->architecture()) as $marker) {
            if (! isset($declared[$marker])) {
                $orphans[$marker] = true;
            }
        }

        $this->assertSame([], array_keys($orphans), 'The architecture document references undeclared markers.');
    }

    /**
     * Every table marker must actually be explained in the change log. A schema
     * object nobody documented is how a contract silently loses its rationale.
     */
    public function test_every_table_marker_is_explained_in_the_change_log(): void
    {
        $explained = [];

        foreach ($this->referencedMarkers($this->changeLog()) as $marker) {
            $explained[$marker] = true;
        }

        $missing = [];

        foreach ($this->markerDeclarations() as $declaration) {
            $marker = $declaration['marker'];
            $number = $declaration['line'];
            if (preg_match('/^SCHEMA-(?:BASE|ADD|EXT)-/', $marker) !== 1) {
                continue;
            }
            if (! isset($explained[$marker])) {
                $missing[] = "{$marker} (canonical line {$number})";
            }
        }

        $this->assertSame(
            [],
            $missing,
            'These canonical table markers have no change-log entry: ' . implode(', ', $missing)
        );
    }

    /**
     * The old file was addressed by section number ("section 25"). Those
     * references break silently once the numbering changes, so the canonical
     * numbering is a marker scheme and stale section pointers must not survive.
     */
    public function test_no_document_still_points_at_the_old_canonical_section_numbering(): void
    {
        foreach ([$this->changeLog(), $this->architecture()] as $document) {
            $this->assertDoesNotMatchRegularExpression(
                '/CANONICAL_DATABASE_SCHEMA\.md`? section \d+/',
                $document,
                'A document still references the canonical file by the removed section numbering.'
            );
        }
    }

    /**
     * The canonical file is a schema contract, so it must not quietly carry the
     * Laravel migration ledger: Laravel creates and owns that table.
     */
    public function test_canonical_schema_does_not_define_the_laravel_migration_ledger(): void
    {
        foreach ($this->nonCommentLines() as $number => $line) {
            $this->assertDoesNotMatchRegularExpression(
                '/\bmigrations\b/',
                $line,
                "The canonical SQL must not define the migrations ledger (line {$number}): {$line}"
            );
        }
    }

    // ==================================================================
    // HELPERS
    // ==================================================================

    private function canonical(): string
    {
        return $this->read(self::CANONICAL);
    }

    private function changeLog(): string
    {
        return $this->read(self::CHANGE_LOG);
    }

    private function architecture(): string
    {
        return $this->read(self::ARCHITECTURE);
    }

    private function read(string $path): string
    {
        $this->assertFileExists($path);

        return (string) file_get_contents($path);
    }

    /**
     * Executable lines only. A `--` comment is legal SQL, so Markdown inside a
     * comment is still allowed; Markdown on its own line is not.
     *
     * @return array<int, string> keyed by 1-based line number
     */
    private function nonCommentLines(): array
    {
        $executable = [];

        foreach (explode("\n", str_replace("\r\n", "\n", $this->canonical())) as $index => $line) {
            if (trim($line) === '' || str_starts_with(ltrim($line), '--')) {
                continue;
            }
            $executable[$index + 1] = $line;
        }

        return $executable;
    }

    /**
     * Bracketed marker declarations, keyed by marker ID => declaring line.
     *
     * @return array<string, int>
     */
    private function markerDeclarations(): array
    {
        $declarations = [];

        foreach (explode("\n", str_replace("\r\n", "\n", $this->canonical())) as $index => $line) {
            if (preg_match('/^\s*--\s*\[('.self::classlessMarkerPattern().')\]/', $line, $m) === 1) {
                $declarations[] = ['marker' => $m[1], 'line' => $index + 1];
            }
        }

        return $declarations;
    }

    /**
     * The set of distinct markers the canonical schema declares, for reference
     * resolution. Uniqueness itself is asserted by
     * {@see test_every_canonical_marker_is_declared_exactly_once()}.
     *
     * @return array<string, true>
     */
    private function declaredMarkers(): array
    {
        $declared = [];

        foreach ($this->markerDeclarations() as $declaration) {
            $declared[$declaration['marker']] = true;
        }

        return $declared;
    }

    /**
     * Every marker mentioned anywhere in a document, bracketed or not. The
     * canonical file's own unbracketed index must be excluded by the caller, so
     * this is used only for the documents that *reference* markers.
     *
     * @return list<string>
     */
    private function referencedMarkers(string $document): array
    {
        $found = [];

        preg_match_all('/'.self::MARKER_BODY.'/', $document, $matches);

        foreach ($matches[1] as $reference) {
            $found[] = trim($reference, '[]');
        }

        return array_values(array_unique($found));
    }

    private static function classlessMarkerPattern(): string
    {
        return 'SCHEMA-(?:BASE|ADD|EXT|SEQ|SEQOWN|IDENT|CON|IDX)-\d+';
    }
}