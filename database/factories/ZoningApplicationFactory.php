<?php

namespace Database\Factories;

use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Carbon\Carbon;
use App\Models\ZoningApplication; // ← add this


class ZoningApplicationFactory extends Factory
{
    private const BARANGAYS = [
        'Alupay', 'Antipolo', 'Bagong Pook', 'Balibago',
        'Barangay A (Poblacion)', 'Barangay B (Poblacion)', 'Barangay C (Poblacion)',
        'Barangay D (Poblacion)', 'Barangay E (Poblacion)',
        'Bayawang', 'Baybayin', 'Bulihan', 'Cahigam', 'Calantas', 'Colongan', 'Itlugan',
        'Leviste (Tubahan)', 'Lumbangan', 'Maalas-as', 'Mabato', 'Mabunga',
        'Macalamcam A', 'Macalamcam B', 'Malaya', 'Maligaya', 'Marilag', 'Masaya',
        'Matamis (Malinao)', 'Mavalor', 'Mayuro', 'Namuco', 'Namunga', 'Nasi', 'Natu',
        'Palakpak', 'Pinagsibaan', 'Putingkahoy', 'Quilib', 'Salao', 'San Agustin',
        'San Carlos', 'San Ignacio', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz',
        'Timbugan', 'Tiquiwan', 'Tulos',
    ];

    private const APPLICATION_TYPES = [
        'Locational Clearance',
        'Zoning Certificate',
        'Development Permit',
    ];

    private const LAND_USE_CLASSES = [
        'Residential', 'Commercial', 'Industrial', 'Agri-Industrial', 'Institutional', 'Recreational',
    ];

    public function definition(): array
    {
        $applicationType = $this->faker->randomElement(self::APPLICATION_TYPES);

        $dateOfApplication = $this->faker->dateTimeBetween('-1 year', 'now');

        $typeCode = match($applicationType) {
            'Locational Clearance'   => 'LC',
            'Zoning Certificate'   => 'ZC',
            'Development Permit'     => 'DP',
        };

        $referenceNumber = $typeCode
            . '-' . Carbon::parse($dateOfApplication)->year
            . '-' . str_pad($this->faker->unique()->numberBetween(1, 99999), 5, '0', STR_PAD_LEFT);

        return [
            'reference_number'    => $referenceNumber,
            'application_type'    => $applicationType,
            'status' => 'Received',
            'purpose'             => $this->faker->sentence(10),
            'applicant_name'      => $this->faker->name(),
            'contact_number'      => $this->faker->numerify('09#########'),
            'email'               => $this->faker->optional(0.7)->safeEmail(),
            'representative_name' => $this->faker->optional(0.4)->name(),
            'barangay'            => $this->faker->randomElement(self::BARANGAYS),
            // lot_number, tct_number, lot_area_sqm, latitude and longitude live on `parcels`:
            // an application has many parcels, so they are no longer columns here.
            'assessment_fee'      => $this->faker->randomFloat(2, 500, 50000),
            'or_number'           => $this->faker->optional(0.5)->numerify('OR-#######'),
            'remarks'             => $this->faker->optional(0.4)->sentence(),
            'encoded_by'              => User::inRandomOrder()->value('id'),
            'target_land_use_class'   => $this->faker->randomElement(self::LAND_USE_CLASSES),
        ];
    }
}