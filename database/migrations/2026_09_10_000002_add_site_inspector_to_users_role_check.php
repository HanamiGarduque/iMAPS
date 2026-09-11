<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check_site_inspector');
        DB::statement(<<<'SQL'
            ALTER TABLE users
            ADD CONSTRAINT users_role_check_site_inspector
            CHECK (role IN ('Planning Officer', 'Admin', 'Site Inspector')) NOT VALID
        SQL);
        DB::statement('ALTER TABLE users VALIDATE CONSTRAINT users_role_check_site_inspector');
        DB::statement('ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check');
        DB::statement(
            'ALTER TABLE users RENAME CONSTRAINT users_role_check_site_inspector TO users_role_check'
        );
    }

    public function down(): void
    {
        // Intentionally non-destructive because users may already have the Site Inspector role.
    }
};
