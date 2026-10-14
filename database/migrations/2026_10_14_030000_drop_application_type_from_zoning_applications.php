<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * zoning_application_types is the only record of an application's types.
     * The label column it was split from goes; ZoningApplication builds the
     * same label from the rows, and the Supabase mirror still receives it.
     *
     * Keep in sync with ZoningApplication::APPLICATION_TYPES.
     */
    private const TYPES = [
        'Locational Clearance',
        'Zoning Certificate',
        'Development Permit',
        'Preliminary Approval and Locational Clearance (PALC)',
        'Petition for Rezoning',
        'Petition for Reclassification',
        'Special Land Use Permit',
    ];

    public function up(): void
    {
        if (! Schema::hasColumn('zoning_applications', 'application_type')) {
            return;
        }

        // The rows must say what the label says, or dropping it loses a type.
        $mismatched = [];

        DB::table('zoning_applications')->select('id', 'application_type')->orderBy('id')
            ->chunkById(500, function ($applications) use (&$mismatched) {
                $labels = $this->labelsFromRows($applications->pluck('id')->all());

                foreach ($applications as $application) {
                    $label = (string) $application->application_type;
                    if ($label !== ($labels[$application->id] ?? '')) {
                        $mismatched[] = "#{$application->id}: '{$label}' vs rows '" . ($labels[$application->id] ?? '') . "'";
                    }
                }
            });

        if ($mismatched !== []) {
            throw new RuntimeException('Label and zoning_application_types disagree; fix these first: ' . implode('; ', $mismatched));
        }

        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->dropColumn('application_type');
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('zoning_applications', 'application_type')) {
            return;
        }

        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->string('application_type', 255)->default('');
        });

        DB::table('zoning_applications')->select('id')->orderBy('id')
            ->chunkById(500, function ($applications) {
                foreach ($this->labelsFromRows($applications->pluck('id')->all()) as $id => $label) {
                    DB::table('zoning_applications')->where('id', $id)->update(['application_type' => $label]);
                }
            });

        DB::statement('ALTER TABLE zoning_applications ALTER COLUMN application_type DROP DEFAULT');
    }

    /**
     * @param  int[]  $ids
     * @return array<int, string> application id => label in TYPES order
     */
    private function labelsFromRows(array $ids): array
    {
        return DB::table('zoning_application_types')
            ->whereIn('zoning_application_id', $ids)
            ->get()
            ->groupBy('zoning_application_id')
            ->map(fn ($rows) => implode(', ', array_values(array_intersect(self::TYPES, $rows->pluck('application_type')->all()))))
            ->all();
    }
};
