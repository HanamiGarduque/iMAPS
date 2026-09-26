<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->id();
            $table->string('email', 80)->unique();
            $table->string('password', 255);
            $table->string('name', 255);
            $table->string('role', 255)->default('Planning Officer');
            $table->boolean('is_active')->default(true);
            $table->timestamp('last_login')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
            $table->string('handshake_key')->nullable();
        });

        Schema::create('application_drafts', function (Blueprint $table) {
            $table->id();
            $table->string('temp_reference_number', 255)->unique();
            $table->unsignedBigInteger('user_id');
            $table->string('applicant_name', 255)->nullable();
            $table->string('application_type', 255)->nullable();
            $table->string('barangay', 255)->nullable();
            $table->string('status', 255)->default('Auto-saved');
            $table->json('form_payload')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
        });

        Schema::create('application_status_tracks', function (Blueprint $table) {
            $table->id();
            $table->string('reference_number', 255);
            $table->string('masked_applicant_name', 255);
            $table->string('status', 255);
            $table->timestamp('created_at')->useCurrent();
        });

        Schema::create('audit_trail', function (Blueprint $table) {
            $table->id();
            $table->integer('application_id');
            $table->string('action', 60);
            $table->integer('performed_by');
            $table->text('note')->nullable();
            $table->timestamp('performed_at')->useCurrent();
        });

        Schema::create('barangay_boundary', function (Blueprint $table) {
            $table->increments('gid');
            $table->string('location', 50)->nullable();
            $table->decimal('shape_leng', 18, 8)->nullable();
            $table->decimal('shape_area', 18, 8)->nullable();
            $table->decimal('land_area', 18, 8)->nullable();
        });
        DB::statement('ALTER TABLE barangay_boundary ADD COLUMN geom geometry(MultiPolygon,4326)');

        Schema::create('failed_jobs', function (Blueprint $table) {
            $table->id();
            $table->string('uuid', 255)->unique();
            $table->text('connection');
            $table->text('queue');
            $table->text('payload');
            $table->text('exception');
            $table->timestamp('failed_at')->useCurrent();
        });

        Schema::create('jobs', function (Blueprint $table) {
            $table->id();
            $table->string('queue', 255);
            $table->text('payload');
            $table->unsignedSmallInteger('attempts');
            $table->unsignedInteger('reserved_at')->nullable();
            $table->unsignedInteger('available_at');
            $table->unsignedInteger('created_at');
        });

        Schema::create('land_parcels', function (Blueprint $table) {
            $table->increments('gid');
            $table->string('barangay', 80)->nullable();
            $table->decimal('lot_area_sqm', 15, 4)->nullable();
            $table->string('land_use_class', 80)->nullable();
            $table->string('parcel_code', 80)->nullable();
            $table->string('survey_number', 80)->nullable();
            $table->string('location_address', 80)->nullable();
            $table->string('owner_name', 80)->nullable();
            $table->string('lot_number', 80)->nullable();
            $table->string('property_index_number', 80)->nullable();
            $table->string('tct_number', 80)->nullable();
            $table->string('tax_dec_number', 80)->nullable();
            $table->string('arp_number', 80)->nullable();
            $table->string('source', 80)->nullable();
        });
        DB::statement('ALTER TABLE land_parcels ADD COLUMN geom geometry(MultiPolygon,4326)');

        Schema::create('land_use_plan', function (Blueprint $table) {
            $table->increments('gid');
            $table->string('location', 50)->nullable();
            $table->string('lup_2030', 50)->nullable();
            $table->decimal('shape_leng', 18, 8)->nullable();
            $table->decimal('shape_area', 18, 8)->nullable();
        });
        DB::statement('ALTER TABLE land_use_plan ADD COLUMN geom geometry(MultiPolygon,4326)');

        Schema::create('zoning_applications', function (Blueprint $table) {
            $table->id();
            $table->string('reference_number', 30)->unique();
            $table->string('application_type', 255);
            $table->string('status', 255)->default('Received');
            $table->text('purpose');
            $table->string('applicant_name', 255);
            $table->string('contact_number', 15);
            $table->string('email', 255)->nullable();
            $table->string('representative_name', 255)->nullable();
            $table->string('barangay', 100);
            $table->decimal('assessment_fee', 12, 2)->nullable();
            $table->string('or_number', 50)->nullable();
            $table->text('remarks')->nullable();
            $table->unsignedBigInteger('encoded_by')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->string('form_number', 100)->nullable();
            $table->string('target_land_use_class', 100)->nullable();
            $table->string('corporation_name', 255)->nullable();
            $table->string('corporation_contact', 15)->nullable();
            $table->text('corporation_address')->nullable();
            $table->decimal('building_area', 12, 4)->nullable();
            $table->decimal('area_to_develop', 12, 4)->nullable();
            $table->integer('number_of_saleable_lots')->nullable();
            $table->string('project_type_business_name', 255)->nullable();
            $table->decimal('project_cost', 15, 2)->nullable();
            $table->string('right_over_land', 100)->nullable();
            $table->string('project_tenure', 100)->nullable();
            $table->string('preferred_release_mode', 100)->nullable();
            $table->string('application_stream', 100)->default('Permit');
            $table->string('sb_ordinance_number', 100)->nullable();
            $table->string('dar_clearance_ref', 100)->nullable();
            $table->string('representative_address', 100)->nullable();
            $table->string('representative_contact', 100)->nullable();
            $table->decimal('zoning_certificate_fee', 12, 2)->default(0);
            $table->decimal('locational_clearance_fee', 12, 2)->default(0);
            $table->decimal('development_permit_fee', 12, 2)->default(0);
            $table->decimal('other_fees', 12, 2)->default(0);
            $table->decimal('penalty_fee', 12, 2)->default(0);
            $table->date('date_of_receipt')->nullable();
        });

        Schema::create('parcels', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('zoning_application_id');
            $table->string('parcel_code', 20);
            $table->string('lot_number', 100)->nullable();
            $table->string('tct_number', 100)->nullable();
            $table->string('tax_dec_number', 100)->nullable();
            $table->decimal('lot_area_sqm', 12, 4)->nullable();
            $table->decimal('latitude', 10, 7)->nullable();
            $table->decimal('longitude', 10, 7)->nullable();
            $table->string('land_use_class', 100)->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
            $table->string('property_index_number', 50)->nullable();
            $table->string('barangay', 100)->nullable();
            $table->text('location_address')->nullable();
            $table->string('owner_name', 100)->nullable();
            $table->string('arp_number')->nullable();
            $table->string('survey_number')->nullable();
            $table->unique(['zoning_application_id', 'parcel_code']);
        });
        DB::statement('ALTER TABLE parcels ADD COLUMN boundary geometry(Polygon,4326)');

        Schema::create('rosario_boundary', function (Blueprint $table) {
            $table->increments('gid');
            $table->double('id')->nullable();
        });
        DB::statement('ALTER TABLE rosario_boundary ADD COLUMN geom geometry(MultiPolygon,4326)');

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id', 255)->primary();
            $table->unsignedBigInteger('user_id')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->text('payload');
            $table->integer('last_activity');
        });

        Schema::create('site_inspections', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('zoning_application_id');
            $table->unsignedBigInteger('inspector_id')->nullable();
            $table->string('status', 255)->default('Pending');
            $table->date('scheduled_date')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamp('created_at')->nullable();
            $table->timestamp('updated_at')->nullable();
            $table->text('assigned_notes')->nullable();
            $table->unsignedBigInteger('parcel_id')->nullable();
            $table->date('deadline_date')->nullable();
        });

        
        Schema::create('technical_reviews', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('zoning_application_id');
            $table->unsignedBigInteger('reviewed_by');
            $table->smallInteger('review_round')->default(1);
            $table->string('decision', 30);
            $table->text('findings')->nullable();
            $table->text('decision_reason')->nullable();
            $table->unsignedBigInteger('site_inspection_task_id')->nullable();
            $table->timestamp('reviewed_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('updated_at')->nullable();
            $table->unsignedBigInteger('parcel_id')->nullable();
        });

        // Add foreign keys
        Schema::table('application_drafts', function (Blueprint $table) {
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        Schema::table('parcels', function (Blueprint $table) {
            $table->foreign('zoning_application_id')->references('id')->on('zoning_applications')->onDelete('cascade');
            $table->index('zoning_application_id', 'parcels_zoning_application_id_index');
        });

        Schema::table('site_inspections', function (Blueprint $table) {
            $table->foreign('inspector_id')->references('id')->on('users')->onDelete('set null');
            $table->foreign('zoning_application_id')->references('id')->on('zoning_applications')->onDelete('cascade');
        });

        Schema::table('technical_reviews', function (Blueprint $table) {
            $table->foreign('reviewed_by')->references('id')->on('users')->onDelete('restrict');
            $table->foreign('zoning_application_id')->references('id')->on('zoning_applications')->onDelete('cascade');
        });

        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->foreign('encoded_by')->references('id')->on('users')->onDelete('set null');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('technical_reviews');
        Schema::dropIfExists('site_inspections');
        Schema::dropIfExists('parcels');
        Schema::dropIfExists('zoning_applications');
        Schema::dropIfExists('application_drafts');
        Schema::dropIfExists('users');
        Schema::dropIfExists('application_status_tracks');
        Schema::dropIfExists('audit_trail');
        Schema::dropIfExists('barangay_boundary');
        Schema::dropIfExists('failed_jobs');
        Schema::dropIfExists('jobs');
        Schema::dropIfExists('land_parcels');
        Schema::dropIfExists('land_use_plan');
        Schema::dropIfExists('rosario_boundary');
        Schema::dropIfExists('sessions');
    }
};
