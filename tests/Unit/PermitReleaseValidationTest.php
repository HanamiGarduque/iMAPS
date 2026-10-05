<?php

namespace Tests\Unit;

use App\Models\GeneratedPermit;
use App\Models\ZoningApplication;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Tests\TestCase;

class PermitReleaseValidationTest extends TestCase
{
    public function test_recommended_permits_for_single_types(): void
    {
        $appLc = new ZoningApplication(['application_type' => 'Locational Clearance']);
        $this->assertSame(['lc'], $appLc->getRecommendedPermitTypes());

        $appZc = new ZoningApplication(['application_type' => 'Zoning Certificate']);
        $this->assertSame(['zc'], $appZc->getRecommendedPermitTypes());

        $appDp = new ZoningApplication(['application_type' => 'Development Permit']);
        $this->assertSame(['dp'], $appDp->getRecommendedPermitTypes());

        $appPalc = new ZoningApplication(['application_type' => 'Preliminary Approval and Locational Clearance (PALC)']);
        $this->assertSame(['dp'], $appPalc->getRecommendedPermitTypes());

        $appRezoning = new ZoningApplication(['application_type' => 'Petition for Rezoning']);
        $this->assertSame(['lc'], $appRezoning->getRecommendedPermitTypes());

        $appReclass = new ZoningApplication(['application_type' => 'Petition for Reclassification']);
        $this->assertSame(['lc'], $appReclass->getRecommendedPermitTypes());
    }

    public function test_recommended_permits_for_multi_types(): void
    {
        $appMulti1 = new ZoningApplication(['application_type' => 'Locational Clearance, Zoning Certificate']);
        $this->assertEqualsCanonicalizing(['lc', 'zc'], $appMulti1->getRecommendedPermitTypes());

        $appMulti2 = new ZoningApplication(['application_type' => 'Locational Clearance, Petition for Rezoning']);
        $this->assertSame(['lc'], $appMulti2->getRecommendedPermitTypes());

        $appMulti3 = new ZoningApplication([
            'application_type' => 'Development Permit, Locational Clearance, Zoning Certificate'
        ]);
        $this->assertEqualsCanonicalizing(['dp', 'lc', 'zc'], $appMulti3->getRecommendedPermitTypes());
    }

    public function test_zoning_evaluation_does_not_satisfy_required_permits(): void
    {
        $app = new ZoningApplication(['application_type' => 'Locational Clearance']);
        $zePermit = new GeneratedPermit(['permit_type' => 'ze', 'permit_name' => 'Zoning Evaluation']);

        // Set relation directly
        $app->setRelation('generatedPermits', new EloquentCollection([$zePermit]));

        $this->assertSame(['lc'], $app->getMissingRecommendedPermitTypes());
        $this->assertSame(['Locational Clearance'], $app->getMissingRecommendedPermitNames());
        $this->assertFalse($app->hasAllRecommendedPermitsGenerated());
    }

    public function test_missing_permits_when_required_permit_is_generated(): void
    {
        $app = new ZoningApplication(['application_type' => 'Locational Clearance']);
        $lcPermit = new GeneratedPermit(['permit_type' => 'lc', 'permit_name' => 'Locational Clearance']);

        $app->setRelation('generatedPermits', new EloquentCollection([$lcPermit]));

        $this->assertSame([], $app->getMissingRecommendedPermitTypes());
        $this->assertSame([], $app->getMissingRecommendedPermitNames());
        $this->assertTrue($app->hasAllRecommendedPermitsGenerated());
    }

    public function test_multi_type_requires_all_recommended_permits(): void
    {
        $app = new ZoningApplication(['application_type' => 'Locational Clearance, Zoning Certificate']);
        $lcPermit = new GeneratedPermit(['permit_type' => 'lc', 'permit_name' => 'Locational Clearance']);

        $app->setRelation('generatedPermits', new EloquentCollection([$lcPermit]));

        // LC is generated, but ZC is still missing
        $this->assertSame(['zc'], $app->getMissingRecommendedPermitTypes());
        $this->assertSame(['Zoning Certification'], $app->getMissingRecommendedPermitNames());
        $this->assertFalse($app->hasAllRecommendedPermitsGenerated());

        // Now both generated
        $zcPermit = new GeneratedPermit(['permit_type' => 'zc', 'permit_name' => 'Zoning Certification']);
        $app->setRelation('generatedPermits', new EloquentCollection([$lcPermit, $zcPermit]));

        $this->assertSame([], $app->getMissingRecommendedPermitTypes());
        $this->assertTrue($app->hasAllRecommendedPermitsGenerated());
    }

    public function test_palc_is_satisfied_by_either_dp_or_lc(): void
    {
        $app = new ZoningApplication(['application_type' => 'Preliminary Approval and Locational Clearance (PALC)']);

        // When DP is generated
        $dpPermit = new GeneratedPermit(['permit_type' => 'dp', 'permit_name' => 'Development Permit']);
        $app->setRelation('generatedPermits', new EloquentCollection([$dpPermit]));
        $this->assertTrue($app->hasAllRecommendedPermitsGenerated());

        // When LC is generated instead
        $lcPermit = new GeneratedPermit(['permit_type' => 'lc', 'permit_name' => 'Locational Clearance']);
        $app->setRelation('generatedPermits', new EloquentCollection([$lcPermit]));
        $this->assertTrue($app->hasAllRecommendedPermitsGenerated());

        // When only ZE is generated, not satisfied
        $zePermit = new GeneratedPermit(['permit_type' => 'ze', 'permit_name' => 'Zoning Evaluation']);
        $app->setRelation('generatedPermits', new EloquentCollection([$zePermit]));
        $this->assertFalse($app->hasAllRecommendedPermitsGenerated());
    }

    public function test_amendment_stream_petition_types(): void
    {
        $appRezoning = new ZoningApplication([
            'application_stream' => 'amendment',
            'application_type'   => 'Locational Clearance, Petition for Rezoning',
        ]);
        $this->assertSame(['lc'], $appRezoning->getRecommendedPermitTypes());

        $appReclass = new ZoningApplication([
            'application_stream' => 'amendment',
            'application_type'   => 'Locational Clearance, Petition for Reclassification',
        ]);
        $this->assertSame(['lc'], $appReclass->getRecommendedPermitTypes());
    }
}
