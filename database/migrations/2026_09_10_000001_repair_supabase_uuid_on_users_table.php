<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use RuntimeException;

return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('users', 'supabase_uuid')) {
            Schema::table('users', function (Blueprint $table) {
                $table->uuid('supabase_uuid')->nullable()->after('id');
            });
        }

        $hasUniqueIndex = collect(Schema::getIndexes('users'))->contains(function (array $index) {
            return ($index['unique'] ?? false)
                && ($index['columns'] ?? []) === ['supabase_uuid'];
        });

        if ($hasUniqueIndex) {
            return;
        }

        $hasDuplicateUuids = DB::table('users')
            ->select('supabase_uuid')
            ->whereNotNull('supabase_uuid')
            ->groupBy('supabase_uuid')
            ->havingRaw('COUNT(*) > 1')
            ->exists();

        if ($hasDuplicateUuids) {
            throw new RuntimeException(
                'Cannot add a unique constraint to users.supabase_uuid because duplicate non-null values exist.'
            );
        }

        Schema::table('users', function (Blueprint $table) {
            $table->unique('supabase_uuid');
        });
    }

    public function down(): void
    {
        // Intentionally non-destructive because the column or index may predate this repair.
    }
};
