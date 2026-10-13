<?php

namespace Database\Factories;

use App\Models\ZoningApplication;
use Illuminate\Database\Eloquent\Factories\Factory;

class SiteInspectionFactory extends Factory
{
    public function definition(): array
    {
        return [
            'zoning_application_id' => ZoningApplication::factory(),
            'status' => 'Pending',
        ];
    }
}
