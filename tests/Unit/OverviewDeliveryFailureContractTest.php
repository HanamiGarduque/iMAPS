<?php

namespace Tests\Unit;

use App\Support\InspectionDeliveryStatus;
use PHPUnit\Framework\TestCase;

/** Query/source contract only: no Laravel bootstrap, database or transport. */
class OverviewDeliveryFailureContractTest extends TestCase
{
    private function source(): string
    {
        $source = file_get_contents(dirname(__DIR__, 2).'/app/Http/Controllers/OverviewController.php');

        return implode('', array_map(
            fn ($token) => is_array($token)
                ? (in_array($token[0], [T_COMMENT, T_DOC_COMMENT], true) ? '' : $token[1])
                : $token,
            token_get_all($source),
        ));
    }

    public function test_admin_failure_count_uses_the_recorders_canonical_delivery_state(): void
    {
        $this->assertSame(1, preg_match(
            "/'failed'\s*=>\s*SiteInspection::where\('delivery_status',\s*'([^']+)'\)->count\(\)/",
            $this->source(),
            $match,
        ));
        $this->assertSame(InspectionDeliveryStatus::STATE_FAILED, $match[1]);
    }

    public function test_reading_the_overview_does_not_generate_duplicate_notifications(): void
    {
        $this->assertDoesNotMatchRegularExpression('/AppNotification::(?:create|notify\w*)\s*\(/', $this->source());
    }
}
