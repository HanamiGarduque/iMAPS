<?php

namespace Tests\Unit;

use App\Support\InspectionDeliveryRetryEligibility as Eligibility;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Rule F: a failed round may be resent until the day before its scheduled
 * inspection, so the inspector still receives it in time.
 */
class DeliveryResendWindowTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-13 23:30', config('app.timezone')));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_resending_is_open_until_the_day_before(): void
    {
        $this->assertTrue(Eligibility::withinResendWindow('2026-10-14'), 'the day before is still open');
        $this->assertTrue(Eligibility::withinResendWindow('2026-10-20'));
    }

    public function test_resending_closes_on_the_scheduled_date(): void
    {
        $this->assertFalse(Eligibility::withinResendWindow('2026-10-13'), 'the scheduled day itself is too late');
        $this->assertFalse(Eligibility::withinResendWindow('2026-10-01'));
    }

    public function test_a_round_without_a_date_fails_closed(): void
    {
        $this->assertFalse(Eligibility::withinResendWindow(null));
        $this->assertFalse(Eligibility::withinResendWindow(''));
    }

    public function test_the_rule_is_part_of_the_single_eligibility_decision(): void
    {
        $round = fn (?string $date) => [
            'round_id' => 5,
            'parcel_id' => 9,
            'delivery_status' => 'delivery_failed',
            'inspector_eligible' => true,
            'scheduled_date' => $date,
        ];

        $open = Eligibility::evaluateRound($round('2026-10-14'), [9 => 5]);
        $this->assertTrue($open['eligible']);

        $closed = Eligibility::evaluateRound($round('2026-10-13'), [9 => 5]);
        $this->assertFalse($closed['eligible']);
        $this->assertSame([Eligibility::BLOCKER_TOO_LATE], $closed['blockers']);

        $this->assertFalse(
            Eligibility::canRetry($round('2026-10-13'), [9 => 5], 'Planning Officer', 7, 7),
            'the owning Planning Officer is refused once the window has closed'
        );
    }
}
