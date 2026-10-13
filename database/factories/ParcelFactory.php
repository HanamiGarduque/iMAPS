<?php

namespace Database\Factories;

use App\Models\ZoningApplication;
use Illuminate\Database\Eloquent\Factories\Factory;

class ParcelFactory extends Factory
{
    public function definition(): array
    {
        return [
            'zoning_application_id' => ZoningApplication::factory(),
            'parcel_code' => 'P-' . $this->faker->unique()->numberBetween(1, 999999),
        ];
    }
}
