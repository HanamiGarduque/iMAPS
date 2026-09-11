<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
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

        if ($hasUniqueIndex) {
            return;
        }

        $hasDuplicateHandshakeKeys = DB::table('users')
            ->select('handshake_key')
            ->whereNotNull('handshake_key')
            ->where('handshake_key', '!=', '')
            ->groupBy('handshake_key')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if ($hasDuplicateHandshakeKeys) {
            throw new RuntimeException(
                'Cannot add a unique constraint to users.handshake_key because duplicate non-null values exist.'
            );
        }

        Schema::table('users', function (Blueprint $table) {
            $table->unique('handshake_key');
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive because the column or index may predate this repair.
    }
};
