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

    private const HISTORY_ARCHIVE = 'docs/FIELDSYNC_BRIDGE_HISTORY_ARCHIVE.md';

    private const LOOP_10 = 'docs/LOOP_10_ACCEPTANCE_RECORD.md';

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


    // ==================================================================
    // DOCUMENTATION HYGIENE
    // ==================================================================

    /**
     * The corruption this pins: a lossy text round-trip turned ten stray
     * continuation bytes in the parent into literal U+FFFD replacement
     * characters, and a strict UTF-8 reader then failed on them. A documentation
     * file that cannot be decoded strictly is not readable evidence.
     */
    public function test_every_normalized_document_decodes_as_strict_utf8_without_a_bom(): void
    {
        foreach ($this->normalizedDocuments() as $path) {
            $bytes = (string) file_get_contents($path);

            $this->assertNotSame(
                "\xEF\xBB\xBF",
                substr($bytes, 0, 3),
                "{$path} must not carry a UTF-8 BOM."
            );

            // A strict decoder rejects lone continuation bytes and truncated
            // sequences; a lenient one silently substitutes U+FFFD, which is
            // how this defect stayed invisible.
            $decoded = (string) mb_convert_encoding($bytes, 'UTF-8', 'UTF-8');
            $this->assertSame(
                $bytes,
                $decoded,
                "{$path} is not valid UTF-8, or contains a character that does not survive a decode round trip."
            );

            $this->assertStringNotContainsString(
                "\u{FFFD}",
                $decoded,
                "{$path} contains a literal U+FFFD replacement character."
            );
        }
    }

    /**
     * Architecture belongs in the architecture document; dated records do not.
     * History is preserved verbatim in the archive rather than deleted, so this
     * asserts separation, not loss.
     */
    public function test_architecture_document_holds_architecture_not_project_history(): void
    {
        $architecture = $this->architecture();

        foreach ([
            '## Scope of this document',
            'CONFIRMED BUSINESS RULES',
            'Admin/PO page',
        ] as $architectureSection) {
            $this->assertStringContainsString(
                $architectureSection,
                $architecture,
                "The architecture document must keep its architecture section: {$architectureSection}"
            );
        }

        foreach ([
            'BRIDGE WORK ENTRYPOINT',
            'CURRENT ACTIVE LOOP',
            'CANONICAL ISSUE ORDER',
            'LOOP STATUS RECONCILIATION',
        ] as $historySection) {
            $this->assertStringNotContainsString(
                $historySection,
                $architecture,
                "A project-history/status section leaked back into the architecture document: {$historySection}"
            );
        }
    }

    /**
     * The archive is only worth having if it actually preserves the history it
     * claims to preserve. Each section removed from the architecture document
     * must still be readable somewhere.
     */
    public function test_archived_history_is_preserved_verbatim(): void
    {
        $archive = $this->read(self::HISTORY_ARCHIVE);

        foreach ([
            'BRIDGE WORK ENTRYPOINT',
            'CURRENT ACTIVE LOOP',
            'LOOP STATUS RECONCILIATION',
            'CANONICAL ISSUE ORDER',
            'LOOP 7B MANUAL E2E DISCOVERY',
            'LOOP 9C-2 - DELIVERY STATUS UI',
            'POST-CLEANUP DOCUMENTATION CHECKPOINT',
        ] as $archivedSection) {
            $this->assertStringContainsString(
                $archivedSection,
                $archive,
                "History was dropped instead of archived: {$archivedSection}"
            );
        }

        $this->assertStringContainsString(
            'FIELDSYNC_BRIDGE_ARCHITECTURE.md',
            $archive,
            'The archive must point the reader back to the architecture document.'
        );
    }

    /**
     * The canonical file's own index must agree with what it declares, or the
     * "summary" is worse than no summary.
     *
     * This deliberately tolerates gaps. A gap is a permanent fact about a
     * published identifier set, not an error to be renumbered away, so the index
     * is checked for "declares nothing that does not exist" and not the reverse.
     */
    public function test_canonical_marker_index_agrees_with_the_declared_markers(): void
    {
        $declared = [];
        foreach ($this->markerDeclarations() as $declaration) {
            $declared[$declaration['marker']] = true;
        }

        $indexed = $this->markersNamedByTheCanonicalIndex();

        $this->assertNotEmpty($indexed, 'The canonical file must carry a marker index.');

        foreach (array_keys($indexed) as $marker) {
            $this->assertArrayHasKey(
                $marker,
                $declared,
                "The canonical index names [{$marker}], which the file never declares."
            );
        }
    }

    /**
     * Marker IDs are stable, published identifiers. This pins the published
     * SCHEMA-SEQOWN set exactly, including the deliberate gap, so a future
     * renumbering cannot silently repoint every document that cites one.
     *
     * The 015 gap exists because `migrations_id_seq` is the Laravel ledger's own
     * sequence, which the canonical schema deliberately omits. It was left vacant
     * rather than closed, because these IDs had already been pushed.
     */
    public function test_seqown_marker_identities_are_stable_and_keep_their_intentional_gap(): void
    {
        $expected = [];

        foreach (range(1, 14) as $n) {
            $expected[] = sprintf('SCHEMA-SEQOWN-%03d', $n);
        }
        foreach (range(16, 24) as $n) {
            $expected[] = sprintf('SCHEMA-SEQOWN-%03d', $n);
        }

        $actual = [];
        foreach ($this->markerDeclarations() as $declaration) {
            if (str_starts_with($declaration['marker'], 'SCHEMA-SEQOWN-')) {
                $actual[] = $declaration['marker'];
            }
        }
        sort($actual);

        $this->assertSame(
            $expected,
            $actual,
            'SCHEMA-SEQOWN identities changed. These IDs were published in 566b82b and are '
            . 'stable identifiers; they must never be renumbered to make the class contiguous.'
        );

        $this->assertCount(23, $actual);
        $this->assertNotContains('SCHEMA-SEQOWN-015', $actual, '015 is intentionally vacant.');
        $this->assertContains('SCHEMA-SEQOWN-024', $actual, '024 is a published identity.');
    }

    /**
     * A gap must never be closed by renumbering. If a new object is ever added to
     * this class it takes the next unused ID above the current maximum, so this
     * pins the highest published ID as the ceiling rather than deriving it from
     * the count.
     */
    public function test_a_marker_gap_does_not_shift_the_identities_above_it(): void
    {
        $seqown = [];
        foreach ($this->markerDeclarations() as $declaration) {
            if (str_starts_with($declaration['marker'], 'SCHEMA-SEQOWN-')) {
                $seqown[] = (int) substr($declaration['marker'], -3);
            }
        }

        // The count is 23 while the highest ID is 24. Anything that "tidied" the
        // class would make these two numbers equal.
        $this->assertCount(23, $seqown);
        $this->assertSame(24, max($seqown));
        $this->assertSame(1, min($seqown));

        foreach ($seqown as $number) {
            if ($number === 15) {
                continue;
            }
            $this->assertContains(
                $number,
                range(1, 24),
                "SEQOWN ID {$number} drifted outside the published 001..024 window."
            );
        }
    }

    /**
     * Marker IDs named by the canonical file's own index lines. Handles both the
     * `A..B` shorthand and the explicit `A..B and C..D` form, and deliberately
     * expands ranges inclusive of any gap they describe.
     *
     * @return array<string, true>
     */
    private function markersNamedByTheCanonicalIndex(): array
    {
        $lines = explode("\n", str_replace("\r\n", "\n", $this->canonical()));
        $named = [];

        foreach ($lines as $line) {
            // Only the index block: an index line is a comment naming IDs, not a
            // declaration (which is followed by the SQL it labels).
            if (preg_match('/^\s*--\s*(?!\[[A-Z])((?:SCHEMA-[A-Z]+-\d+)(?:\s*\.\.\s*(?:SCHEMA-[A-Z]+-\d+))?(?:\s*and\s*(?:SCHEMA-[A-Z]+-\d+)(?:\s*\.\.\s*(?:SCHEMA-[A-Z]+-\d+))?)*)\b/', $line, $m) !== 1) {
                continue;
            }

            preg_match_all('/(SCHEMA-[A-Z]+)-(\d+)(?:\s*\.\.\s*(?:SCHEMA-[A-Z]+-(\d+)))?/', $m[1], $pairs, PREG_SET_ORDER);

            foreach ($pairs as $pair) {
                $class = $pair[1];
                $from = (int) $pair[2];
                $to = isset($pair[3]) && $pair[3] !== '' ? (int) $pair[3] : $from;

                for ($n = $from; $n <= $to; $n++) {
                    $named[sprintf('%s-%03d', $class, $n)] = true;
                }
            }
        }

        return $named;
    }
    /**
     * @return list<string>
     */
    private function normalizedDocuments(): array
    {
        return [
            self::CANONICAL,
            self::CHANGE_LOG,
            self::ARCHITECTURE,
            self::HISTORY_ARCHIVE,
            self::LOOP_10,
        ];
    }

        private static function classlessMarkerPattern(): string
    {
        return 'SCHEMA-(?:BASE|ADD|EXT|SEQ|SEQOWN|IDENT|CON|IDX)-\d+';
    }
}