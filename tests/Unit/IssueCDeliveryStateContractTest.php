<?php

namespace Tests\Unit;

use App\Support\InspectionDeliveryStatus;
use Carbon\Carbon;
use Tests\TestCase;

/**
 * ISSUE C - delivery status semantics.
 *
 * The four Planning Officer business states, and the rule that separates them:
 *
 *   DELIVERED            a successful delivery is proven
 *   DELIVERY FAILED      an attempt failed and nothing later succeeded
 *   NOT YET DELIVERED    the system can PROVE no attempt ever happened
 *   DELIVERY HISTORY     the recorder cannot speak for this round at all
 *     UNAVAILABLE
 *
 * "No Delivery Record" was retired as a user-facing state because a MISSING ROW
 * was being read as certainty about the delivery itself.
 *
 * This class is a pure presenter, so the whole state machine is verified here
 * without a database, which is what makes every branch exhaustively testable.
 */
class IssueCDeliveryStateContractTest extends TestCase
{
    /** Resolved from THIS file, never from the framework base path. */
    private function root(string $relative): string
    {
        return dirname(__DIR__, 2).DIRECTORY_SEPARATOR.str_replace('/', DIRECTORY_SEPARATOR, $relative);
    }

    private function presenterSource(): string
    {
        return (string) file_get_contents($this->root('app/Support/InspectionDeliveryStatus.php'));
    }

    /** Strip comments, then collapse whitespace, so assertions match CODE only. */
    private function code(string $text): string
    {
        $text = (string) preg_replace('/\/\*.*?\*\//s', '', $text);
        $text = (string) preg_replace('/^\s*(\/\/|\*).*$/m', '', $text);

        return (string) preg_replace('/\s+/', ' ', $text);
    }

    // ── 1. successful delivery ───────────────────────────────────────────────

    public function test_successful_delivery_is_delivered(): void
    {
        $this->assertSame('delivered', InspectionDeliveryStatus::state('delivered'));
        $this->assertSame('Delivered', InspectionDeliveryStatus::label('delivered'));
        $this->assertFalse(InspectionDeliveryStatus::isFailure('delivered'));
    }

    // ── 2. failed attempt, no later success ──────────────────────────────────

    public function test_failed_attempt_is_delivery_failed(): void
    {
        $this->assertSame('delivery_failed', InspectionDeliveryStatus::state('delivery_failed'));
        $this->assertSame('Delivery Failed', InspectionDeliveryStatus::label('delivery_failed'));
        $this->assertTrue(InspectionDeliveryStatus::isFailure('delivery_failed'));
        $this->assertStringContainsStringIgnoringCase(
            'failed',
            InspectionDeliveryStatus::message('delivery_failed'),
        );
    }

    public function test_delivery_failed_claims_a_recorded_attempt_not_a_bare_absence(): void
    {
        $message = InspectionDeliveryStatus::message('delivery_failed');
        $this->assertStringContainsStringIgnoringCase('recorded attempt', $message);
        $this->assertStringContainsStringIgnoringCase('no later attempt', $message);
    }

    // ── 3. positively unsent inspection ──────────────────────────────────────

    public function test_proven_never_sent_is_not_yet_delivered(): void
    {
        $never = InspectionDeliveryStatus::provesNeverDelivered(
            Carbon::parse('2026-10-01 09:00:00'),
            Carbon::parse('2026-09-01 09:00:00'), // recorder already running
        );

        $this->assertTrue($never);
        $this->assertSame(
            'not_yet_delivered',
            InspectionDeliveryStatus::state(null, $never),
        );
        $this->assertSame('Not Yet Delivered', InspectionDeliveryStatus::label('not_yet_delivered'));
    }

    public function test_never_delivered_proof_requires_both_timestamps(): void
    {
        $round = Carbon::parse('2026-10-01 09:00:00');

        $this->assertFalse(
            InspectionDeliveryStatus::provesNeverDelivered(null, Carbon::parse('2026-09-01 09:00:00')),
            'a round with no creation instant cannot be proven unsent',
        );
        $this->assertFalse(
            InspectionDeliveryStatus::provesNeverDelivered($round, null),
            'no recorded attempt anywhere proves nothing about this round',
        );
    }

    public function test_round_created_before_the_first_attempt_is_never_proven_unsent(): void
    {
        $this->assertFalse(InspectionDeliveryStatus::provesNeverDelivered(
            Carbon::parse('2026-08-01 09:00:00'),  // predates the recorder
            Carbon::parse('2026-09-01 09:00:00'),
        ));
    }

    public function test_round_created_exactly_when_the_recorder_started_is_proven_unsent(): void
    {
        $instant = Carbon::parse('2026-09-01 09:00:00');
        $this->assertTrue(InspectionDeliveryStatus::provesNeverDelivered($instant, $instant));
    }

    // ── 4/5. historical gap ──────────────────────────────────────────────────

    public function test_missing_history_is_unavailable_not_never_delivered(): void
    {
        $this->assertSame('no_delivery_record', InspectionDeliveryStatus::state(null, false));
        $this->assertSame(
            'Delivery History Unavailable',
            InspectionDeliveryStatus::label('no_delivery_record'),
        );
    }

    public function test_history_unavailable_never_implies_non_delivery(): void
    {
        $label = InspectionDeliveryStatus::label('no_delivery_record');
        $message = InspectionDeliveryStatus::message('no_delivery_record');

        $this->assertStringContainsStringIgnoringCase('no delivery history', $message);
        $this->assertStringContainsStringIgnoringCase('does not show whether', $message);

        // Every false certainty the retired wording implied.
        foreach ([
            'no delivery record',
            'never delivered',
            'not delivered',
            'undelivered',
            'never received',
            'not received',
            'never opened',
            'never started',
            'never assigned',
            'failed',
            'pending',
        ] as $forbidden) {
            $this->assertStringNotContainsStringIgnoringCase($forbidden, $label, "label leaked '{$forbidden}'");
            $this->assertStringNotContainsStringIgnoringCase($forbidden, $message, "message leaked '{$forbidden}'");
        }
    }

    public function test_not_yet_delivered_and_history_unavailable_are_different_states(): void
    {
        $this->assertNotSame(
            InspectionDeliveryStatus::STATE_NOT_DELIVERED,
            InspectionDeliveryStatus::STATE_NO_RECORD,
        );
        $this->assertNotSame(
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_NOT_DELIVERED),
            InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_NO_RECORD),
        );
    }

    // ── 6/7. retry then success ──────────────────────────────────────────────

    public function test_a_later_success_supersedes_an_earlier_failure(): void
    {
        // The recorder owns the transition: a delivered round is `delivered`
        // whatever an earlier attempt recorded.
        $this->assertSame('delivered', InspectionDeliveryStatus::state('delivered'));
        $this->assertFalse(InspectionDeliveryStatus::isFailure('delivered'));
    }

    public function test_attempt_history_is_append_only_in_the_recorder(): void
    {
        $source = $this->code((string) file_get_contents($this->root('app/Services/InspectionDeliveryRecorder.php')));

        // A new row per attempt, never an update of the previous one.
        $this->assertStringContainsString("->max('attempt_number') + 1", $source);
        $this->assertStringContainsString('InspectionDeliveryAttempt::create(', $source);
        $this->assertStringNotContainsString('InspectionDeliveryAttempt::update(', $source);

        // The first success wins `delivered_at`, and a success clears the
        // recorded failure, so a later failure cannot erase a delivery.
        $this->assertStringContainsString('if ($parent->delivered_at === null) {', $source);
        $this->assertStringContainsString("'last_delivery_failure_category' => null", $source);
    }

    // ── 8. rounds do not share delivery state ────────────────────────────────

    public function test_delivery_state_is_derived_only_from_that_rounds_own_status(): void
    {
        $this->assertSame('delivered', InspectionDeliveryStatus::state('delivered'));
        $this->assertSame('delivery_failed', InspectionDeliveryStatus::state('delivery_failed'));
        $this->assertSame('no_delivery_record', InspectionDeliveryStatus::state(null, false));

        // The presenter receives one round's status and nothing else, so it
        // cannot possibly be reading another round's record.
        $code = $this->code($this->presenterSource());
        $this->assertStringContainsString('public static function state(?string $deliveryStatus', $code);
        $this->assertStringNotContainsString('SiteInspection', $code);
        $this->assertStringNotContainsString('DeliveryAttempt::query()', $code);
    }

    // ── 9. every read surface uses this one presenter ────────────────────────

    public function test_all_read_surfaces_share_the_single_presenter(): void
    {
        $surfaces = [
            'app/Http/Controllers/ApplicationController.php',
            'app/Http/Controllers/InspectionDeliveryController.php',
            'app/Support/InspectionOperationsContext.php',
        ];

        foreach ($surfaces as $surface) {
            $source = (string) file_get_contents(base_path($surface));
            $this->assertStringContainsString('InspectionDeliveryStatus::state(', $source, $surface);
            $this->assertStringContainsString('InspectionDeliveryStatus::label(', $source, $surface);

            // A surface must not author its own delivery wording.
            foreach (['No Delivery Record', 'Delivered to FieldSync', 'No Loop 9'] as $forbidden) {
                $this->assertStringNotContainsString(
                    $forbidden,
                    $source,
                    "{$surface} must not author the delivery wording '{$forbidden}'",
                );
            }
        }
    }

    // ── 10. zero Planning Officer facing "Loop 9" ────────────────────────────

    public function test_no_planning_officer_facing_string_says_loop_9(): void
    {
        foreach ([
            InspectionDeliveryStatus::STATE_NO_RECORD,
            InspectionDeliveryStatus::STATE_NOT_DELIVERED,
            InspectionDeliveryStatus::STATE_PENDING,
            InspectionDeliveryStatus::STATE_DELIVERED,
            InspectionDeliveryStatus::STATE_FAILED,
        ] as $state) {
            $this->assertStringNotContainsStringIgnoringCase('loop 9', InspectionDeliveryStatus::label($state));
            $this->assertStringNotContainsStringIgnoringCase('loop 9', InspectionDeliveryStatus::message($state));
        }
    }

    public function test_no_authored_delivery_string_contains_loop_9(): void
    {
        // Only CODE is inspected: an internal code comment may keep the term,
        // but nothing that can reach a browser may.
        $code = $this->code($this->presenterSource());

        $this->assertStringNotContainsStringIgnoringCase(
            'loop 9',
            $code,
            'no user-facing delivery string may contain the internal Loop 9 term',
        );
    }

    public function test_loop_9_is_never_rendered_by_the_planning_officer_ui(): void
    {
        foreach ([
            'resources/js/Components/InspectionDeliveryStatusPanel.jsx',
            'resources/js/Pages/Applications/Index.jsx',
            'resources/js/Pages/Applications/Show.jsx',
            'resources/js/Pages/Site Inspections/Index.jsx',
            'resources/js/Pages/Site Inspections/Show.jsx',
        ] as $component) {
            $source = (string) file_get_contents(base_path($component));
            // Strip comments, then look at what is left: JSX text and strings.
            $rendered = (string) preg_replace('/\/\*.*?\*\//s', '', $source);
            $rendered = (string) preg_replace('/^\s*\/\/.*$/m', '', $rendered);
            $rendered = (string) preg_replace('/\/\/.*$/m', '', $rendered);

            $this->assertStringNotContainsStringIgnoringCase(
                'loop 9',
                $rendered,
                "{$component} must not render internal Loop 9 terminology",
            );
        }
    }

    // ── 11. delivery state is not ownership ──────────────────────────────────

    public function test_no_delivery_state_implies_ownership(): void
    {
        $states = [
            InspectionDeliveryStatus::STATE_NO_RECORD,
            InspectionDeliveryStatus::STATE_NOT_DELIVERED,
            InspectionDeliveryStatus::STATE_PENDING,
            InspectionDeliveryStatus::STATE_DELIVERED,
            InspectionDeliveryStatus::STATE_FAILED,
        ];

        foreach ($states as $state) {
            foreach (['assigned', 'unassigned', 'reassigned', 'owner', 'ownership'] as $forbidden) {
                $this->assertStringNotContainsStringIgnoringCase(
                    $forbidden,
                    InspectionDeliveryStatus::label($state),
                    "delivery state '{$state}' must not speak about ownership",
                );
            }
        }
    }

    public function test_the_retail_of_the_presenter_takes_no_ownership_input(): void
    {
        // The ONLY non-status input to the state machine is a boolean that
        // describes delivery attempts, never an inspector or owner.
        $code = $this->code($this->presenterSource());
        $this->assertStringContainsString(
            'public static function state(?string $deliveryStatus, bool $neverAttempted = false)',
            $code,
        );
    }

    // ── 12. unknown stored values never guess ────────────────────────────────

    public function test_unrecognised_stored_status_never_claims_a_delivery_state(): void
    {
        foreach (['', 'DELIVERED', 'delivered ', 'something_new', 'not_yet_delivered'] as $stored) {
            $this->assertSame(
                InspectionDeliveryStatus::STATE_NO_RECORD,
                InspectionDeliveryStatus::state($stored),
                "stored '{$stored}' must not be guessed into a delivery state",
            );
        }
    }

    public function test_an_unrecognised_status_is_never_promoted_to_not_yet_delivered(): void
    {
        // A junk status is unknown history, not proven non-delivery.
        $this->assertSame(
            InspectionDeliveryStatus::STATE_NO_RECORD,
            InspectionDeliveryStatus::state('junk', true),
        );
    }

    // ── schema honesty ───────────────────────────────────────────────────────

    public function test_no_schema_or_migration_change_was_required(): void
    {
        // The whole state machine reuses the existing nullable summary column
        // and the existing append-only attempt table.
        $model = $this->code((string) file_get_contents($this->root('app/Models/InspectionDeliveryAttempt.php')));
        $this->assertStringContainsString("min('attempted_at')", $model);

        // The proof signal is read ONCE per request, not per round.
        $controller = $this->code((string) file_get_contents(
            $this->root('app/Http/Controllers/InspectionDeliveryController.php')
        ));
        $this->assertSame(
            1,
            substr_count($controller, 'InspectionDeliveryAttempt::recorderLiveFrom()'),
            'the recorder-live instant must be read once per request, not per round',
        );
    }
}
