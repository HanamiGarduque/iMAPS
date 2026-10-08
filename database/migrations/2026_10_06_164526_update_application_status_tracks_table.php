<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('application_status_tracks', function (Blueprint $table) {
            if (!Schema::hasColumn('application_status_tracks', 'form_number')) {
                $table->string('form_number', 100)->nullable()->after('reference_number')->index();
            }
            if (!Schema::hasColumn('application_status_tracks', 'contact_number')) {
                $table->string('contact_number', 30)->nullable()->after('form_number')->index();
            }
            if (!Schema::hasColumn('application_status_tracks', 'application_type')) {
                $table->string('application_type', 255)->nullable()->after('masked_applicant_name');
            }
            if (!Schema::hasColumn('application_status_tracks', 'business_name')) {
                $table->string('business_name', 255)->nullable()->after('application_type');
            }
            if (!Schema::hasColumn('application_status_tracks', 'stage_order')) {
                $table->integer('stage_order')->nullable()->default(1)->after('status');
            }
            if (!Schema::hasColumn('application_status_tracks', 'note')) {
                $table->text('note')->nullable()->after('stage_order');
            }
            if (!Schema::hasColumn('application_status_tracks', 'scheduled_date')) {
                $table->timestamp('scheduled_date')->nullable()->after('note');
            }
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('application_status_tracks', function (Blueprint $table) {
            $table->dropColumn([
                'form_number',
                'contact_number',
                'application_type',
                'business_name',
                'stage_order',
                'note',
                'scheduled_date',
            ]);
        });
    }
};