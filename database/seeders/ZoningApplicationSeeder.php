<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\ZoningApplication;
use App\Services\ApplicationStatusTracker;

class ZoningApplicationSeeder extends Seeder
{
    public function run(): void
    {
        ZoningApplication::factory(10)->create()->each(function ($application) {
            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                $application->status
            );
        });
    }
}