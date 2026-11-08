<?php

namespace Tests\Unit;

use App\Models\ApplicationFee;
use App\Models\ZoningApplication;
use App\Services\PermitExcelService;
use Tests\TestCase;

class PermitFeesTest extends TestCase
{
    private PermitExcelService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(PermitExcelService::class);
    }

    public function test_defaults_extracts_fees_from_application_fees(): void
    {
        $application = new ZoningApplication([
            'reference_number' => 'APP-2026-TEST',
            'form_number'      => 'FORM-123',
            'assessment_fee'   => 5240.00,
            'or_number'        => 'OR-9999',
            'application_type' => 'Locational Clearance',
        ]);

        $fees = collect([
            new ApplicationFee(['fee_type' => 'zoning_certificate', 'amount' => 720.00]),
            new ApplicationFee(['fee_type' => 'locational_clearance', 'amount' => 1440.00]),
            new ApplicationFee(['fee_type' => 'development_permit', 'amount' => 3080.00]),
        ]);

        $application->setRelation('fees', $fees);
        $application->setRelation('parcels', collect());

        $defaults = $this->service->defaults($application);

        $this->assertSame('720.00', $defaults['ZONING_FEE']);
        $this->assertSame('1,440.00', $defaults['LOCATIONAL_CLEARANCE_FEE']);
        $this->assertSame('3,080.00', $defaults['DEVELOPMENT_FEE']);
        $this->assertSame('5,240.00', $defaults['ASSESSMENT_FEE']);
        $this->assertSame('720', $defaults['ZC_AMOUNT']);
    }

    public function test_defaults_formats_zero_fees_as_empty_string(): void
    {
        $application = new ZoningApplication([
            'reference_number' => 'APP-2026-TEST-ZERO',
            'form_number'      => 'FORM-124',
            'assessment_fee'   => 720.00,
            'or_number'        => 'OR-1000',
            'application_type' => 'Zoning Certificate',
        ]);

        $fees = collect([
            new ApplicationFee(['fee_type' => 'zoning_certificate', 'amount' => 720.00]),
        ]);

        $application->setRelation('fees', $fees);
        $application->setRelation('parcels', collect());

        $defaults = $this->service->defaults($application);

        $this->assertSame('720.00', $defaults['ZONING_FEE']);
        $this->assertSame('', $defaults['LOCATIONAL_CLEARANCE_FEE']);
        $this->assertSame('', $defaults['DEVELOPMENT_FEE']);
    }

    public function test_legacy_application_without_fee_rows_falls_back_to_assessment_fee(): void
    {
        $application = new ZoningApplication([
            'reference_number' => 'APP-LEGACY-001',
            'form_number'      => 'FORM-LEGACY',
            'assessment_fee'   => 1440.00,
            'or_number'        => 'OR-0001',
            'application_type' => 'Locational Clearance',
        ]);

        $application->setRelation('fees', collect());
        $application->setRelation('parcels', collect());

        $defaults = $this->service->defaults($application);

        $this->assertSame('1,440.00', $defaults['LOCATIONAL_CLEARANCE_FEE']);
    }

    public function test_fee_aliases_in_permits_config(): void
    {
        $aliases = config('permits.aliases');

        $this->assertSame('ZONING_FEE', $aliases['ZC_AMOUNT'] ?? null);
        $this->assertSame('ZONING_FEE', $aliases['ZONING_CERTIFICATE_FEE'] ?? null);
        $this->assertSame('LOCATIONAL_CLEARANCE_FEE', $aliases['LOCATIONAL_CLEARANCE'] ?? null);
        $this->assertSame('DEVELOPMENT_FEE', $aliases['DEVELOPMENT_PERMIT_FEE'] ?? null);
    }
}
