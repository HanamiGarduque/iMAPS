<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->decimal('zoning_certificate_fee', 12, 2)->default(0);
            $table->decimal('locational_clearance_fee', 12, 2)->default(0);
            $table->decimal('development_permit_fee', 12, 2)->default(0);
            $table->decimal('other_fees', 12, 2)->default(0);
            $table->decimal('penalty_fee', 12, 2)->default(0);
            $table->date('date_of_receipt')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->dropColumn([
                'zoning_certificate_fee',
                'locational_clearance_fee',
                'development_permit_fee',
                'other_fees',
                'penalty_fee', 
                'date_of_receipt',
            ]);
        });
    }
};