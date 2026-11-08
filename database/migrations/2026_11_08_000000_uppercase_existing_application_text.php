<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ApplicationController::store() stores encoded free text in capitals, but rows
 * created earlier (demo/seeded/legacy) kept their original casing. Backfill them
 * so every application reads the same as production. Email, contact numbers,
 * barangay, enums and dates are intentionally untouched.
 */
return new class extends Migration
{
    private const TARGETS = [
        'zoning_applications' => [
            'applicant_name', 'applicant_street', 'applicant_barangay', 'applicant_municipality',
            'representative_name', 'representative_address', 'corporation_name', 'corporation_address',
            'business_name', 'street_address', 'purpose', 'remarks',
        ],
        'parcels' => [
            'parcel_code', 'location_address', 'owner_name', 'property_index_number', 'arp_number',
            'survey_number', 'lot_number', 'tct_number', 'tax_dec_number',
        ],
        'technical_reviews' => ['decision_reason', 'findings'],
        'site_inspections' => ['assigned_notes'],
    ];

    public function up(): void
    {
        foreach (self::TARGETS as $table => $columns) {
            if (! Schema::hasTable($table)) {
                continue;
            }
            foreach ($columns as $column) {
                if (! Schema::hasColumn($table, $column)) {
                    continue;
                }
                DB::table($table)->whereNotNull($column)->orderBy('id')->each(function ($row) use ($table, $column) {
                    $value = $row->$column;
                    if (is_string($value) && ($upper = mb_strtoupper($value)) !== $value) {
                        DB::table($table)->where('id', $row->id)->update([$column => $upper]);
                    }
                });
            }
        }
    }

    public function down(): void
    {
        // Original casing is not recoverable.
    }
};
