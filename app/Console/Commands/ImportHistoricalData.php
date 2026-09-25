<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

class ImportHistoricalData extends Command
{
    protected $signature = 'import:historical-data';
    protected $description = 'Import zoning data from rosario_zoning_apps_2021_2026.csv directly into historical_data table';

    public function handle()
    {
        $path = storage_path('app/rosario_zoning_apps_2021_2026.csv');

        if (!file_exists($path)) {
            $this->error("File not found at {$path}");
            return;
        }

        $file = fopen($path, 'r');
        
        // Skip the header row
        fgetcsv($file);

        $this->info("Importing data by column index...");

        $count = 0;
        while (($row = fgetcsv($file)) !== false) {
            // Ensure the row has data
            if (empty($row) || count($row) < 9) {
                continue;
            }

            DB::table('historical_data')->insert([
                'encoding_date'    => !empty($row[0]) ? date('Y-m-d', strtotime(trim($row[0]))) : null,
                'form_number'      => trim($row[1]) ?? null,
                'name'             => trim($row[2]) ?? null,
                'barangay'         => trim($row[3]) ?? null,
                'zoning_code'      => trim($row[4]) ?? null,
                'lot_area_sqm'     => !empty($row[5]) ? (float) str_replace(',', '', $row[5]) : null,
                'application_type' => trim($row[6]) ?? null,
                'purpose'          => trim($row[7]) ?? null,
                'assessment_fee'   => !empty($row[8]) ? (float) str_replace(',', '', $row[8]) : null,
                'created_at'       => now(),
                'updated_at'       => now(),
            ]);
            $count++;
        }

        fclose($file);
        $this->info("Successfully imported {$count} rows into historical_data!");
    }
}