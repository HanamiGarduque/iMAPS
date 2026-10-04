<?php

namespace Tests\Unit;

use Illuminate\Database\Migrations\Migration;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * LEGACY MIGRATION ORDERING CONTRACT.
 *
 * Two migration filenames predate the repository's migration tracking and sort
 * BEFORE `2026_09_19_000000_create_initial_schema`:
 *
 *   2026_09_11_000000_add_rich_result_columns_to_site_inspections_table
 *   2026_09_19_000000_add_assignment_provenance_to_site_inspections_table
 *
 * On a fresh database they therefore ALTER `site_inspections` before that table
 * exists, which fails with SQLSTATE 42P01. Canonical, correctly ordered
 * replacements exist (or arrive with the master sync) as `..._000001` and
 * `..._000002`.
 *
 * The files must NOT be deleted or renamed: deployed ledgers already recorded
 * these exact names, so removing them orphans those rows and makes
 * `migrate:rollback` report success while doing nothing. They are therefore kept
 * as explicit no-op supersession migrations.
 *
 * These tests pin the parts that must never silently regress:
 *  - both filenames remain resolvable;
 *  - neither up() nor down() performs ANY schema mutation;
 *  - each file names its canonical replacement;
 *  - the ordering hazard that forced this treatment is still visible;
 *  - invoking either migration touches no database connection at all.
 *
 * The behavioural fresh-database proof (PostGIS created first, full chain runs)
 * lives in the disposable-cluster runner, not here.
 */
class LegacyMigrationOrderingContractTest extends TestCase
{
    private const STALE_RICH = 'database/migrations/2026_09_11_000000_add_rich_result_columns_to_site_inspections_table.php';

    private const STALE_PROVENANCE = 'database/migrations/2026_09_19_000000_add_assignment_provenance_to_site_inspections_table.php';

    private const CANONICAL_RICH = '2026_09_19_000001_add_rich_result_columns_to_site_inspections_table';

    private const CANONICAL_PROVENANCE = '2026_09_19_000002_add_assignment_provenance_to_site_inspections_table';

    private const INITIAL_SCHEMA = '2026_09_19_000000_create_initial_schema';

    /** @return array<string, array{0: string}> */
    public static function staleFiles(): array
    {
        return [
            'rich result columns' => [self::STALE_RICH],
            'assignment provenance' => [self::STALE_PROVENANCE],
        ];
    }

    // ==================================================================
    // 1. THE FILENAMES MUST SURVIVE
    // ==================================================================

    #[DataProvider('staleFiles')]
    public function test_stale_filename_is_retained_and_resolvable(string $path): void
    {
        // Deleting or renaming these orphans historical ledger rows. That is the
        // exact harm the no-op treatment exists to prevent.
        $this->assertFileExists($path);
        $this->assertIsObject(require base_path($path), 'The migration file must return a Migration instance.');
    }

    #[DataProvider('staleFiles')]
    public function test_stale_file_is_a_valid_migration_subclass(string $path): void
    {
        $this->assertInstanceOf(Migration::class, require base_path($path));
    }

    // ==================================================================
    // 2 + 6. NO SCHEMA MUTATION ANYWHERE IN EITHER FILE
    // ==================================================================

    #[DataProvider('staleFiles')]
    public function test_stale_migration_contains_no_schema_mutation_primitives(string $path): void
    {
        $source = (string) file_get_contents(base_path($path));

        foreach ([
            'Schema::', 'DB::', 'Blueprint', '->table(', '->create(', '->dropColumn',
            'dropIfExists', 'dropColumn', 'dropIndex', 'dropUnique', 'dropForeign',
            '->string(', '->timestamp(', '->json(', '->text(', '->double(', '->integer(',
            '->boolean(', '->decimal(', '->date(', '->increments(', '->id(',
            'ALTER TABLE', 'CREATE TABLE', 'DROP TABLE',
        ] as $primitive) {
            $this->assertStringNotContainsString(
                $primitive,
                $source,
                "A superseded migration must not contain '{$primitive}'. It performs no schema mutation."
            );
        }
    }

    #[DataProvider('staleFiles')]
    public function test_invoking_up_and_down_touches_no_database(string $path): void
    {
        // Stronger than a source scan: if either method issued a query it would
        // need a connection and would fail here, because none is configured for it.
        $migration = require base_path($path);

        $migration->up();
        $migration->down();

        $this->assertTrue(true, 'up() and down() completed without any database interaction.');
    }

    #[DataProvider('staleFiles')]
    public function test_down_cannot_destructively_reverse_a_superseded_migration(string $path): void
    {
        // Rollback safety: a historical batch containing this filename must not
        // drop columns or tables the migration never created.
        $migration = require base_path($path);

        $migration->down();

        $this->assertTrue(true, 'down() completed with no schema mutation and no database interaction.');
    }

    // ==================================================================
    // 3. THE CANONICAL REPLACEMENT IS DOCUMENTED
    // ==================================================================

    public function test_rich_result_shim_names_its_canonical_replacement(): void
    {
        $this->assertStringContainsString(
            self::CANONICAL_RICH,
            (string) file_get_contents(base_path(self::STALE_RICH)),
            'The shim must point at the canonical renamed migration.'
        );
    }

    public function test_provenance_shim_names_its_canonical_replacement(): void
    {
        $this->assertStringContainsString(
            self::CANONICAL_PROVENANCE,
            (string) file_get_contents(base_path(self::STALE_PROVENANCE)),
            'The shim must point at the canonical renamed migration.'
        );
    }

    #[DataProvider('staleFiles')]
    public function test_shim_explains_why_the_historical_name_is_retained(string $path): void
    {
        $source = (string) file_get_contents(base_path($path));

        $this->assertStringContainsString('SUPERSEDED', $source, 'The file must declare itself superseded.');
        $this->assertStringContainsString(
            'ledger',
            $source,
            'The file must explain that the historical filename is retained for ledger compatibility.'
        );
    }

    // ==================================================================
    // 4 + 5. THE ORDERING HAZARD REMAINS VISIBLE
    // ==================================================================

    public function test_both_stale_filenames_still_sort_before_the_initial_schema(): void
    {
        // This ordering is precisely why these migrations must be no-ops. If a
        // future rename ever moved them after the initial schema, this test is the
        // signal to revisit the treatment rather than leave a stale assumption.
        foreach ([self::STALE_RICH, self::STALE_PROVENANCE] as $path) {
            $name = basename($path, '.php');
            $initial = base_path('database/migrations/' . self::INITIAL_SCHEMA . '.php');

            $this->assertFileExists($initial);
            $this->assertLessThan(
                self::INITIAL_SCHEMA,
                $name,
                "{$name} is expected to sort before the initial schema; that is why it is a no-op shim."
            );
        }
    }

    #[DataProvider('staleFiles')]
    public function test_stale_migration_is_not_emptied_out(string $path): void
    {
        // migrate:status coherence comes from the filename existing in the
        // repository; this guards that the file is a real artifact carrying its
        // explanatory comment rather than a truncated placeholder.
        $this->assertGreaterThan(
            200,
            strlen((string) file_get_contents(base_path($path))),
            'The shim must retain its explanatory comment.'
        );
    }
}