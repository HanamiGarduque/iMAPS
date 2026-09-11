<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'handshake_key')) {
            Schema::table('users', function (Blueprint $table) {
                $table->string('handshake_key')->nullable()->after('id');
            });
        }

        $hasUniqueIndex = collect(Schema::getIndexes('users'))->contains(function (array $index) {
            $columns = $index['columns'] ?? [];

            return ($index['unique'] ?? false)
                && is_array($columns)
                && in_array('handshake_key', $columns, true);
        });

        if (! $hasUniqueIndex) {
            Schema::table('users', function (Blueprint $table) {
                $table->unique('handshake_key');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('users', 'handshake_key')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('handshake_key');
            });
        }
    }
};