<?php

namespace App\Support;

use App\Models\InspectionDeliveryAttempt;

/**
 * Loop 9C-1 - presentation-safe Loop 9 delivery state for one inspection round.
 *
 * This class is a PURE presenter. It reads no database, calls no Supabase or
 * FieldSync service, and holds no state, which is what makes the safety rules
 * below directly and exhaustively testable.
 *
 * WHY THE PROSE LIVES HERE
 * ------------------------
 * A Planning Officer must never have to interpret a raw database token, and no
 * raw diagnostic material may ever reach a browser. Every user-facing string is
 * therefore produced server-side from a closed vocabulary, in one place.
 *
 * NULL IS NOT A PROBLEM
 * ---------------------
 * `delivery_status IS NULL` means exactly one thing: NO CANONICAL LOOP 9 DELIVERY
 * RECORD EXISTS. It never means failed, pending, or "not delivered".
 *
 * Two different historical populations land on NULL and they must not be
 * confused with each other or with a problem:
 *
 *   1. pre-bridge rounds, which predate Loop 9 monitoring entirely; and
 *   2. genuinely delivered FieldSync jobs that intentionally have NO fabricated
 *      local delivery history.
 *
 * A reader shown a successful job under wording like "Not delivered" or
 * "Failed" would be actively misinformed, so the NULL branch is worded as the
 * plain absence of a record and never as a defect. This reader does not consult
 * Supabase to tell those two populations apart, and must not be extended to do
 * so: the distinction is not a delivery state.
 *
 * DELIVERY IS NOT TASK LIFECYCLE
 * ------------------------------
 * `assigned` / `in_progress` / `completed` are FieldSync task lifecycle values
 * owned by the bridge writer's remote lifecycle preservation. They are never
 * used as a delivery label here, and local delivery state never implies remote
 * field progression. iMAPS cannot prove field progression, so it must not claim
 * it.
 *
 * See docs/FIELDSYNC_BRIDGE_ARCHITECTURE.md for the recorded Loop 9 contract.
 */
final class InspectionDeliveryStatus
{
    /**
     * API-facing delivery states.
     *
     * `no_delivery_record` is NOT a database value. It is the explicit neutral
     * presentation of `delivery_status IS NULL`. The three others map 1:1 onto
     * the 9A CHECK-constrained `site_inspections.delivery_status` vocabulary.
     */
    public const STATE_NO_RECORD = 'no_delivery_record';
    public const STATE_NOT_DELIVERED = 'not_yet_delivered';
    public const STATE_PENDING = 'pending_delivery';
    public const STATE_DELIVERED = 'delivered';
    public const STATE_FAILED = 'delivery_failed';

    /**
     * Closed label and message vocabulary, keyed by API-facing state.
     */
    private const PRESENTATION = [
        // The recorder was demonstrably live when this round was created and
        // still holds no attempt for it: that is positive proof, not absence.
        self::STATE_NOT_DELIVERED => [
            'label'   => 'Not Yet Delivered',
            'message' => 'This inspection round has not been sent to FieldSync yet.',
        ],
        // The recorder cannot speak for this round at all. Deliberately NOT
        // "never delivered" and NOT "missing": a round predating the recorder
        // may well have been delivered, and asserting otherwise would be a
        // claim the records do not support.
        self::STATE_NO_RECORD => [
            'label'   => 'Delivery History Unavailable',
            'message' => 'iMAPS has no delivery history for this inspection round. '
                .'This does not show whether FieldSync received it.',
        ],
        self::STATE_PENDING => [
            'label'   => 'Pending Delivery',
            'message' => 'This inspection round is awaiting or undergoing FieldSync delivery.',
        ],
        self::STATE_DELIVERED => [
            'label'   => 'Delivered',
            'message' => 'This inspection round was delivered to FieldSync.',
        ],
        self::STATE_FAILED => [
            'label'   => 'Delivery Failed',
            'message' => 'A recorded attempt to deliver this inspection round to FieldSync failed, '
                .'and no later attempt has succeeded.',
        ],
    ];

    /**
     * Closed failure-category vocabulary mapped to safe prose.
     *
     * Every string here is authored copy. No value is ever taken from an
     * exception message, a PostgREST response body, a URL, a credential, a
     * handshake key, SQL text, a filesystem path or a signed URL, so none of
     * those can leak through this map.
     */
    private const FAILURE_MESSAGES = [
        InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED
            => 'The assigned inspector is not linked to a FieldSync account.',
        InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE
            => 'FieldSync could not be reached.',
        InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE
            => 'FieldSync rejected the iMAPS bridge credentials.',
        InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE
            => 'FieldSync found a conflict with existing data.',
        InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE
            => 'FieldSync rejected the delivery data.',
        InspectionDeliveryAttempt::FAILURE_CONFIGURATION_FAILURE
            => 'The iMAPS bridge configuration is incomplete.',
        InspectionDeliveryAttempt::FAILURE_UNKNOWN
            => 'Delivery failed for an unclassified reason.',
    ];

    /**
     * Map the stored `delivery_status` onto an API-facing state token, 1:1.
     *
     * Anything unrecognized - including a value introduced by a future
     * migration this class has never seen - degrades to the neutral
     * no-record presentation rather than guessing. Guessing is the single way
     * this reader could invent a delivery failure that never happened.
     */
    public static function state(?string $deliveryStatus, bool $neverAttempted = false): string
    {
        return match ($deliveryStatus) {
            self::STATE_PENDING  => self::STATE_PENDING,
            self::STATE_DELIVERED => self::STATE_DELIVERED,
            self::STATE_FAILED  => self::STATE_FAILED,
            // A NULL round only earns "not yet delivered" when the caller could
            // PROVE the recorder was already running when the round was created.
            // Absence of a row on its own is never that proof.
            // Only a genuine NULL may be promoted. A junk stored value is unknown
            // history, and the proof flag must never turn it into a claim.
            default => $neverAttempted && $deliveryStatus === null
                ? self::STATE_NOT_DELIVERED
                : self::STATE_NO_RECORD,
        };
    }

    /**
     * Pure predicate: can these two timestamps prove this round was never sent?
     *
     * `$recorderLiveFrom` is the earliest delivery attempt ever recorded. When
     * it exists and is not later than the round's own creation, the recorder was
     * demonstrably running, so its silence about this round is real evidence
     * rather than a historical gap. A NULL `$recorderLiveFrom` means no attempt
     * has ever been recorded anywhere, which proves nothing about this round.
     */
    public static function provesNeverDelivered(
        ?\DateTimeInterface $roundCreatedAt,
        ?\DateTimeInterface $recorderLiveFrom,
    ): bool {
        if ($roundCreatedAt === null || $recorderLiveFrom === null) {
            return false;
        }

        return $recorderLiveFrom->getTimestamp() <= $roundCreatedAt->getTimestamp();
    }

    /** User-facing label for an API-facing state. */
    public static function label(string $state): string
    {
        return self::PRESENTATION[$state]['label'] ?? self::PRESENTATION[self::STATE_NO_RECORD]['label'];
    }

    /** User-facing explanation for an API-facing state. */
    public static function message(string $state): string
    {
        return self::PRESENTATION[$state]['message'] ?? self::PRESENTATION[self::STATE_NO_RECORD]['message'];
    }

    /**
     * Is this round recorded as a delivery failure?
     *
     * The only state from which any future retry authority may ever be
     * considered. Pending means a delivery is already in flight, and delivered
     * means nothing failed.
     */
    public static function isFailure(?string $deliveryStatus, bool $neverAttempted = false): bool
    {
        return self::state($deliveryStatus, $neverAttempted) === self::STATE_FAILED;
    }

    /**
     * Earliest delivery attempt this installation has ever recorded.
     *
     * Lives on the model, not on the presenter, so this class stays a pure
     * function of its arguments. Callers read it ONCE per request and pass the
     * resulting boolean to {@see state()}.
     *
     * @see InspectionDeliveryAttempt::recorderLiveFrom()
     */

    /**
     * LOOP 9D: short human-readable name for each failure category.
     *
     * This is the Admin diagnostic view of the closed vocabulary. The 9C-1/9C-4
     * Planning Officer surface deliberately never renders the raw token; the
     * architecture record assigns the token to 9D Admin monitoring, and this map
     * is where it becomes readable.
     *
     * Authored copy, keyed by the closed vocabulary, exactly like
     * FAILURE_MESSAGES. No value is derived from an exception, a response body,
     * SQL text, a path, a URL or any credential, so nothing can leak through it.
     * Every entry is a diagnostic NAME; FAILURE_MESSAGES remains the prose.
     */
    private const FAILURE_CATEGORY_LABELS = [
        InspectionDeliveryAttempt::FAILURE_INSPECTOR_MAPPING_UNRESOLVED
            => 'Inspector mapping unresolved',
        InspectionDeliveryAttempt::FAILURE_SUPABASE_UNREACHABLE
            => 'FieldSync unreachable',
        InspectionDeliveryAttempt::FAILURE_AUTHENTICATION_FAILURE
            => 'Bridge authentication failure',
        InspectionDeliveryAttempt::FAILURE_REMOTE_CONSTRAINT_FAILURE
            => 'Remote constraint failure',
        InspectionDeliveryAttempt::FAILURE_REMOTE_VALIDATION_FAILURE
            => 'Remote validation failure',
        InspectionDeliveryAttempt::FAILURE_CONFIGURATION_FAILURE
            => 'Bridge configuration failure',
        InspectionDeliveryAttempt::FAILURE_UNKNOWN
            => 'Unclassified failure',
    ];

    /**
     * Human-readable failure-category name for a monitoring surface.
     *
     * Normalizes first, so a stored value this class has never seen degrades to
     * the `unknown` label rather than reaching a browser verbatim. NULL stays
     * NULL: absence of a category is not a category.
     */
    public static function failureCategoryLabel(?string $category): ?string
    {
        $normalized = self::failureCategory($category);

        if ($normalized === null) {
            return null;
        }

        return self::FAILURE_CATEGORY_LABELS[$normalized]
            ?? self::FAILURE_CATEGORY_LABELS[InspectionDeliveryAttempt::FAILURE_UNKNOWN];
    }

    /**
     * LOOP 9D: human-readable names for the attempt `source` vocabulary.
     *
     * Authored copy keyed by the closed vocabulary, exactly like the other maps
     * in this class. The browser is given a name so it never has to invent one,
     * and an unrecognized stored value degrades to the `unknown` name rather
     * than reaching a screen raw.
     */
    private const SOURCE_LABELS = [
        InspectionDeliveryAttempt::SOURCE_INITIAL_DISPATCH => 'Initial delivery',
        InspectionDeliveryAttempt::SOURCE_AUTOMATIC_RETRY => 'Automatic retry',
        InspectionDeliveryAttempt::SOURCE_PLANNING_OFFICER_RETRY => 'Planning Officer retry',
        InspectionDeliveryAttempt::SOURCE_LEGACY_RECONCILIATION => 'Legacy reconciliation',
    ];

    /** LOOP 9D: human-readable names for the attempt `outcome` vocabulary. */
    private const OUTCOME_LABELS = [
        InspectionDeliveryAttempt::OUTCOME_PENDING => 'In progress',
        InspectionDeliveryAttempt::OUTCOME_DELIVERED => 'Delivered',
        InspectionDeliveryAttempt::OUTCOME_FAILED => 'Failed',
    ];

    /** Readable name for an attempt source, or NULL when there is none. */
    public static function sourceLabel(?string $source): ?string
    {
        if ($source === null) {
            return null;
        }

        return self::SOURCE_LABELS[$source] ?? 'Unrecognised source';
    }

    /** Readable name for an attempt outcome, or NULL when there is none. */
    public static function outcomeLabel(?string $outcome): ?string
    {
        if ($outcome === null) {
            return null;
        }

        return self::OUTCOME_LABELS[$outcome] ?? 'Unrecognised outcome';
    }

    /**
     * Normalize a stored failure category onto the closed vocabulary.
     *
     * An unexpected stored value becomes `unknown` so a client can only ever
     * receive a category that has authored prose behind it. NULL stays NULL:
     * absence of a category is not a category.
     */
    public static function failureCategory(?string $category): ?string
    {
        if ($category === null) {
            return null;
        }

        return array_key_exists($category, self::FAILURE_MESSAGES)
            ? $category
            : InspectionDeliveryAttempt::FAILURE_UNKNOWN;
    }

    /**
     * Safe prose for a failure category, or NULL when there is no failure.
     *
     * @param  string|null  $category  already normalized, or raw
     */
    public static function failureMessage(?string $category): ?string
    {
        $normalized = self::failureCategory($category);

        if ($normalized === null) {
            return null;
        }

        return self::FAILURE_MESSAGES[$normalized] ?? self::FAILURE_MESSAGES[InspectionDeliveryAttempt::FAILURE_UNKNOWN];
    }

    /**
     * Neutral explanation for why this viewer is not an authorized RETRY ACTOR.
     *
     * This is an APPLICATION-LEVEL ACTOR reason and nothing else. Round-level
     * reasons ("no delivery record", "pending", "already delivered") are
     * deliberately not mixed in here: a round's own `state`, `label` and
     * `message` already explain itself, and merging the two levels is what
     * would let a future UI show a round-level excuse for an actor-level
     * refusal, or the reverse.
     *
     * States only locally provable facts. It never implies that some other
     * officer could recover the application, and it never names or infers an
     * owner from a non-ownership column.
     *
     * @param  string|null  $viewerRole  the authenticated user's role
     * @param  int|null     $ownerId     `zoning_applications.assigned_planning_officer_id`
     * @param  int|null     $viewerId    the authenticated local iMAPS user id
     */
    public static function retryUnavailableReason(?string $viewerRole, ?int $ownerId, ?int $viewerId): ?string
    {
        // Admin is not offered retry at all, and is told nothing about it: a
        // reason string aimed at officers would be noise for a role that will
        // never see the control.
        if ($viewerRole !== 'Planning Officer') {
            return null;
        }

        if ($ownerId === null) {
            return 'A Planning Officer has not been assigned to this application yet, so delivery retry is not available.';
        }

        if ($viewerId !== null && $ownerId !== $viewerId) {
            return 'Delivery retry is only available to the Planning Officer currently assigned to this application.';
        }

        return null;
    }
}
