<?php

namespace Tests\Unit;

use PHPUnit\Framework\TestCase;

class PostgisRequirementTest extends TestCase
{
    private function initialSchemaSource(): string
    {
        return file_get_contents(
            __DIR__ . '/../../database/migrations/2026_09_19_000000_create_initial_schema.php'
        );
    }

    public function test_migration_refuses_to_build_the_schema_without_postgis(): void
    {
        $source = $this->initialSchemaSource();

        $this->assertStringContainsString('$this->requireSpatialSupport();', $source);
        $this->assertStringContainsString('CREATE EXTENSION IF NOT EXISTS postgis', $source);
        $this->assertStringContainsString('CREATE EXTENSION postgis;', $source);

        // The sqlite branches store geom as TEXT; every ST_* query would fail at
        // runtime. Outside the test suite that must abort, not degrade silently.
        $this->assertStringContainsString('runningUnitTests()', $source);
    }

    public function test_the_guard_runs_before_any_table_is_created(): void
    {
        $source = $this->initialSchemaSource();

        $guard = strpos($source, '$this->requireSpatialSupport();');
        $firstCreate = strpos($source, "Schema::create('users'");

        $this->assertNotFalse($guard);
        $this->assertNotFalse($firstCreate);
        $this->assertLessThan($firstCreate, $guard, 'A half-built schema is worse than no schema.');
    }

    public function test_env_template_pins_the_postgres_connection(): void
    {
        // config/database.php defaults to sqlite, so an env template without
        // DB_CONNECTION silently produces a non-spatial install.
        $this->assertStringContainsString(
            "DB_CONNECTION=pgsql\n",
            file_get_contents(__DIR__ . '/../../.env.example')
        );
    }

    public function test_readme_does_not_tell_installers_to_create_a_sqlite_database(): void
    {
        $readme = file_get_contents(__DIR__ . '/../../README.md');

        $this->assertStringNotContainsString('touch database/database.sqlite', $readme);
        $this->assertStringContainsString('CREATE EXTENSION postgis;', $readme);
    }
}
