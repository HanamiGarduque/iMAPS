<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * zoning_applications.application_type held several types as one
     * comma-separated string, in whatever order they were picked and with two
     * spellings of Zoning Certificate. Exact-match filters missed combined
     * filings and grouped reports split one combination into several rows.
     *
     * The types move to one row each. application_type stays as the display
     * label (30 files and the FieldSync mirror read it), rewritten in the fixed
     * order below.
     *
     * Keep in sync with ZoningApplication::APPLICATION_TYPES and TYPE_ALIASES.
     */
    private const TYPES = [
        'Locational Clearance',
        'Zoning Certificate',
        'Development Permit',
        'Preliminary Approval and Locational Clearance (PALC)',
        'Petition for Rezoning',
        'Petition for Reclassification',
        // Legacy: no longer offered by the encoding form, present on older records.
        'Special Land Use Permit',
    ];

    private const ALIASES = [
        'Zoning Certification' => 'Zoning Certificate',
    ];

    public function up(): void
    {
        if (! Schema::hasTable('zoning_application_types')) {
            Schema::create('zoning_application_types', function (Blueprint $table) {
                $table->id();
                $table->foreignId('zoning_application_id')
                    ->constrained('zoning_applications')
                    ->cascadeOnDelete();
                $table->string('application_type', 100);

                $table->unique(['zoning_application_id', 'application_type']);
                $table->index('application_type');
            });

            DB::statement('ALTER TABLE zoning_application_types ADD CONSTRAINT zoning_application_types_type_known CHECK (application_type IN ('
                . implode(', ', array_map(fn (string $t) => DB::getPdo()->quote($t), self::TYPES)) . '))');
        }

        $unknown = [];

        DB::table('zoning_applications')->select('id', 'application_type')->orderBy('id')
            ->chunkById(500, function ($applications) use (&$unknown) {
                foreach ($applications as $application) {
                    $types = [];
                    foreach (explode(',', (string) $application->application_type) as $raw) {
                        $type = self::ALIASES[trim($raw)] ?? trim($raw);
                        if ($type === '') {
                            continue;
                        }
                        if (! in_array($type, self::TYPES, true)) {
                            $unknown[] = "#{$application->id}: {$type}";
                            continue;
                        }
                        $types[$type] = true;
                    }

                    $ordered = array_values(array_filter(self::TYPES, fn (string $t) => isset($types[$t])));

                    foreach ($ordered as $type) {
                        DB::table('zoning_application_types')->insertOrIgnore([
                            'zoning_application_id' => $application->id,
                            'application_type'      => $type,
                        ]);
                    }

                    if ($ordered !== []) {
                        DB::table('zoning_applications')->where('id', $application->id)
                            ->update(['application_type' => implode(', ', $ordered)]);
                    }
                }
            });

        // Refuse rather than silently drop a type nobody has mapped yet.
        if ($unknown !== []) {
            throw new RuntimeException('Unrecognized application types; add them to TYPES or ALIASES: ' . implode('; ', $unknown));
        }
    }

    public function down(): void
    {
        // The labels keep their normalized order and spelling; only the rows go.
        Schema::dropIfExists('zoning_application_types');
    }
};
