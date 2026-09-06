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
        'Zoning Certification',
        'Development Permit',
    ];

    private const LAND_USE_CLASSES = [
        'Residential', 'Commercial', 'industrial', 'Agri-Industrial', 'institutional', 'Recreational',
    ];

    // Rosario, Batangas center: 13.8410, 121.2062
    // ~0.05 degrees offset covers roughly the whole municipality
    private const LAT_CENTER  = 13.8410;
    private const LNG_CENTER  = 121.2062;
    private const COORD_SPREAD = 0.05;

    public function definition(): array
    {
        $applicationType = $this->faker->randomElement(self::APPLICATION_TYPES);

        $dateOfApplication = $this->faker->dateTimeBetween('-1 year', 'now');

        $typeCode = match($applicationType) {
            'Locational Clearance'   => 'LC',
            'Zoning Certification'   => 'ZC',
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
            'lot_number'          => $this->faker->numerify('Lot ##'),
            'tct_number'          => $this->faker->numerify('TCT-####-######'),
            'lot_area_sqm'            => $this->faker->randomFloat(4, 50, 5000),
            'latitude'            => $this->faker->randomFloat(
                                        7,
                                        self::LAT_CENTER - self::COORD_SPREAD,
                                        self::LAT_CENTER + self::COORD_SPREAD
                                    ),
            'longitude'           => $this->faker->randomFloat(
                                        7,
                                        self::LNG_CENTER - self::COORD_SPREAD,
                                        self::LNG_CENTER + self::COORD_SPREAD
                                    ),
            'assessment_fee'      => $this->faker->randomFloat(2, 500, 50000),
            'or_number'           => $this->faker->optional(0.5)->numerify('OR-#######'),
            'remarks'             => $this->faker->optional(0.4)->sentence(),
            'encoded_by'          => User::inRandomOrder()->value('id'),
            'land_use_class'      => $this->faker->randomElement(self::LAND_USE_CLASSES),
        ];
    }
}