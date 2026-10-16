<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * DRAFT: aligns the forecast tables with the per-barangay, 2-quarter design.
 *
 *  - forecast_outputs gains barangay, year and quarter. Nothing writes to
 *    this table yet, so the new columns are nullable; tighten them to NOT NULL
 *    once the forecast persistence code exists.
 *  - forecast_outputs.lower_ci / upper_ci become lower_80 / upper_80, because
 *    the manuscript reports an 80% prediction range, not a confidence interval.
 *  - forecast_runs.forecast_periods defaults to 2 (quarters), not the 6 months
 *    of the old SARIMAX design.
 *
 * After running: update ForecastOutput::$fillable, the forecast tables in
 * docs/CANONICAL_DATABASE_SCHEMA.md, and the change log.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->string('barangay')->nullable()->after('forecast_run_id');
            $table->smallInteger('year')->nullable()->after('barangay');
            $table->unsignedTinyInteger('quarter')->nullable()->after('year');
        });

        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->renameColumn('lower_ci', 'lower_80');
            $table->renameColumn('upper_ci', 'upper_80');
        });

        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->index(['forecast_run_id', 'barangay', 'year', 'quarter'], 'forecast_outputs_run_barangay_quarter_idx');
        });

        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->integer('forecast_periods')->default(2)->change();
        });
    }

    public function down(): void
    {
        Schema::table('forecast_runs', function (Blueprint $table) {
            $table->integer('forecast_periods')->default(6)->change();
        });

        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->dropIndex('forecast_outputs_run_barangay_quarter_idx');
        });

        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->renameColumn('lower_80', 'lower_ci');
            $table->renameColumn('upper_80', 'upper_ci');
        });

        Schema::table('forecast_outputs', function (Blueprint $table) {
            $table->dropColumn(['barangay', 'year', 'quarter']);
        });
    }
};
