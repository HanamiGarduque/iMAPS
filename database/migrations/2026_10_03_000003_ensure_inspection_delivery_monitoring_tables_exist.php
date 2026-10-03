<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Repair a partially applied inspection delivery monitoring schema.
     *
     * Some environments reach the app before the Loop 9A delivery-monitoring
     * migration has been applied, or the DB was restored from a partial dump.
     * This migration only creates what is missing and keeps the rest of the data
     * untouched.
     */
    public function up(): void
    {
        $this->ensureSiteInspectionDeliveryColumns();
        $this->ensureInspectionDeliveryAttemptsTable();
        $this->ensureIndex();
    }

    public function down(): void
    {
        // No destructive rollback for an operational repair migration.
    }

    private function ensureSiteInspectionDeliveryColumns(): void
    {
        if (! Schema::hasTable('site_inspections')) {
            return;
        }

        foreach ([
            'delivery_status' => ['type' => 'string', 'length' => 32],
            'last_delivery_attempt_at' => ['type' => 'timestamp'],
            'delivered_at' => ['type' => 'timestamp'],
            'last_delivery_failure_category' => ['type' => 'string', 'length' => 48],
        ] as $column => $definition) {
            if (Schema::hasColumn('site_inspections', $column)) {
                continue;
            }

            Schema::table('site_inspections', function (Blueprint $table) use ($column, $definition) {
                if (($definition['type'] ?? 'string') === 'timestamp') {
                    $table->timestamp($column)->nullable();

                    return;
                }

                $table->string($column, $definition['length'] ?? 255)->nullable();
            });
        }
    }

    private function ensureInspectionDeliveryAttemptsTable(): void
    {
        if (Schema::hasTable('inspection_delivery_attempts')) {
            return;
        }

        Schema::create('inspection_delivery_attempts', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('site_inspection_id');
            $table->unsignedInteger('attempt_number');
            $table->string('source', 32);
            $table->string('outcome', 16);
            $table->string('failure_category', 48)->nullable();
            $table->text('safe_message')->nullable();
            $table->timestamp('attempted_at')->useCurrent();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->unique(['site_inspection_id', 'attempt_number'], 'inspection_delivery_attempts_inspection_attempt_unique');
            $table->index(['site_inspection_id', 'attempted_at'], 'inspection_delivery_attempts_inspection_attempted_index');
            $table->foreign('site_inspection_id', 'inspection_delivery_attempts_inspection_foreign')
                ->references('id')
                ->on('site_inspections')
                ->cascadeOnDelete();
        });
    }

    private function ensureIndex(): void
    {
        $exists = DB::selectOne(
            "SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'site_inspections_delivery_status_index'"
        );

        if ($exists === null) {
            DB::statement(
                'CREATE INDEX IF NOT EXISTS site_inspections_delivery_status_index'
                . ' ON site_inspections (delivery_status)'
                . ' WHERE delivery_status IS NOT NULL'
            );
        }
    }
};
