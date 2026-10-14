<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * The fee breakdown was a repeating group of columns on zoning_applications
     * (one column per fee kind). Store it as one row per charged fee instead.
     *
     * zoning_applications.assessment_fee stays: it is the official total recorded
     * with the OR number, and applications imported from the old records carry
     * that total without any breakdown.
     *
     * Keep in sync with ApplicationFee::COLUMN_BY_TYPE.
     */
    private const COLUMN_BY_TYPE = [
        'zoning_certificate'   => 'zoning_certificate_fee',
        'locational_clearance' => 'locational_clearance_fee',
        'development_permit'   => 'development_permit_fee',
        'other'                => 'other_fees',
        'penalty'              => 'penalty_fee',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('application_fees')) {
            Schema::create('application_fees', function (Blueprint $table) {
                $table->id();
                $table->foreignId('zoning_application_id')
                    ->constrained('zoning_applications')
                    ->cascadeOnDelete();
                $table->string('fee_type', 40);
                $table->decimal('amount', 12, 2);
                $table->timestamps();

                $table->unique(['zoning_application_id', 'fee_type']);
            });

            DB::statement('ALTER TABLE application_fees ADD CONSTRAINT application_fees_amount_non_negative CHECK (amount >= 0)');
            DB::statement("ALTER TABLE application_fees ADD CONSTRAINT application_fees_type_known CHECK (fee_type IN ('"
                . implode("','", array_keys(self::COLUMN_BY_TYPE)) . "'))");
        }

        // Copy every charged fee. A zero was the form's "not charged", so it gets no row.
        foreach (self::COLUMN_BY_TYPE as $type => $column) {
            if (! Schema::hasColumn('zoning_applications', $column)) {
                continue;
            }

            DB::statement(
                "INSERT INTO application_fees (zoning_application_id, fee_type, amount, created_at, updated_at)
                 SELECT id, ?, {$column}, created_at, COALESCE(updated_at, created_at)
                 FROM zoning_applications
                 WHERE {$column} > 0
                 ON CONFLICT (zoning_application_id, fee_type) DO NOTHING",
                [$type]
            );
        }

        $existing = array_values(array_filter(
            self::COLUMN_BY_TYPE,
            fn (string $column) => Schema::hasColumn('zoning_applications', $column),
        ));

        if ($existing !== []) {
            Schema::table('zoning_applications', fn (Blueprint $table) => $table->dropColumn($existing));
        }
    }

    public function down(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            foreach (self::COLUMN_BY_TYPE as $column) {
                if (! Schema::hasColumn('zoning_applications', $column)) {
                    $table->decimal($column, 12, 2)->default(0);
                }
            }
        });

        if (Schema::hasTable('application_fees')) {
            foreach (self::COLUMN_BY_TYPE as $type => $column) {
                DB::update(
                    "UPDATE zoning_applications za SET {$column} = f.amount
                     FROM application_fees f
                     WHERE f.zoning_application_id = za.id AND f.fee_type = ?",
                    [$type]
                );
            }
        }

        Schema::dropIfExists('application_fees');
    }
};
