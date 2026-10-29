<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// MPDO keeps application records for 10 years, so nothing an officer does in
// the app removes one. Archiving hides a closed record from the working
// registry; voiding marks a record encoded by mistake. Both keep the row, its
// files and its history. Removing a saved permit keeps the file and the row.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->timestamp('archived_at')->nullable()->index();
            $table->foreignId('archived_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('voided_at')->nullable()->index();
            $table->foreignId('voided_by')->nullable()->constrained('users')->nullOnDelete();
            $table->text('void_reason')->nullable();
        });

        Schema::table('generated_permits', function (Blueprint $table) {
            $table->softDeletes();
            $table->foreignId('deleted_by')->nullable()->constrained('users')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('generated_permits', function (Blueprint $table) {
            $table->dropConstrainedForeignId('deleted_by');
            $table->dropSoftDeletes();
        });

        Schema::table('zoning_applications', function (Blueprint $table) {
            $table->dropConstrainedForeignId('voided_by');
            $table->dropConstrainedForeignId('archived_by');
            $table->dropColumn(['archived_at', 'voided_at', 'void_reason']);
        });
    }
};
