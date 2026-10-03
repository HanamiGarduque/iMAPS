<?php

namespace App\Support;

/**
 * Loop 9C-3 - the transport-independent outcome of a retry request.
 *
 * WHY A RESULT OBJECT RATHER THAN EXCEPTIONS
 * ------------------------------------------
 * A refused retry is a normal, expected business outcome, not an error: the
 * caller is simply not allowed, the round is not in a failed state, the round
 * has been superseded, or the assigned inspector cannot receive field work.
 * Those are decisions the service reports, and 9C-3-2 will map them to HTTP.
 *
 * Anything that is NOT a decision - a database error, a queue insert failure, a
 * lost connection - deliberately leaves this class entirely and propagates as a
 * `Throwable`. Flattening an infrastructure failure into a refusal would let a
 * 409 be returned for something that is actually a 503, and would hide a real
 * fault behind ordinary business prose.
 *
 * The service therefore has exactly two shapes: a refusal it can explain, and a
 * failure it must not explain.
 *
 * NO HTTP HERE. There is no status code, no response, no redirect and no abort
 * in this class or in the service that returns it.
 *
 * EVERY MESSAGE IS AUTHORED PROSE
 * ------------------------------
 * No message is built from an exception, a response body, a URL, a credential,
 * a handshake key, a Supabase identity, a queue uuid or SQL text, so none of
 * those can leak through a refusal.
 */
final class InspectionDeliveryRetryResult
{
    /** The retry was accepted and queued. Delivery has NOT happened. */
    public const QUEUED = 'queued';

    /** No inspection round exists with the requested identity. */
    public const INSPECTION_NOT_FOUND = 'inspection_not_found';

    /** The round's application no longer exists. */
    public const APPLICATION_NOT_FOUND = 'application_not_found';

    /**
     * The round's `zoning_application_id` no longer matches the application the
     * service locked. Refused rather than trusted: no authorization decision is
     * ever made from a value read before a lock existed.
     */
    public const APPLICATION_MISMATCH = 'application_mismatch';

    /** Rules A + B failed: wrong role, no recorded owner, or not the owner. */
    public const NOT_AUTHORIZED = 'not_authorized';

    /** Rule C failed: the round has no recorded delivery failure. */
    public const WRONG_DELIVERY_STATE = 'wrong_delivery_state';

    /** Rule D failed: a newer round exists for the same application and parcel. */
    public const SUPERSEDED_ROUND = 'superseded_round';

    /** `parcel_id` is NULL, so non-supersession cannot be proven. */
    public const PARCEL_UNKNOWN = 'parcel_unknown';

    /** Rule E failed: the assigned inspector is not locally eligible. */
    public const INSPECTOR_INVALID = 'inspector_invalid';

    /**
     * Closed, authored refusal prose. Anything unmapped degrades to a neutral
     * sentence that reveals nothing, so a future outcome can never leak a
     * detail by being added to the service without being added here.
     *
     * @var array<string, string>
     */
    private const MESSAGES = [
        self::INSPECTION_NOT_FOUND => 'That inspection round does not exist.',
        self::APPLICATION_NOT_FOUND => 'The application for that inspection round does not exist.',
        self::APPLICATION_MISMATCH => 'That inspection round is no longer part of the application it was requested for.',
        self::NOT_AUTHORIZED => 'Delivery retry is only available to the Planning Officer currently assigned to this application.',
        self::WRONG_DELIVERY_STATE => 'Only an inspection round with a recorded FieldSync delivery failure can be queued for retry.',
        self::SUPERSEDED_ROUND => 'A newer inspection round has superseded this one, so it is no longer the current round for that parcel.',
        self::PARCEL_UNKNOWN => 'This inspection round is not linked to a parcel, so its position in the round sequence cannot be confirmed.',
        self::INSPECTOR_INVALID => 'The Site Inspector assigned to this round is not currently able to receive FieldSync work, so a retry was not queued.',
    ];

    private function __construct(
        public readonly string $outcome,
        public readonly ?int $siteInspectionId = null,
        public readonly ?int $applicationId = null,
    ) {
    }

    /** An accepted retry. `queued` means QUEUED, never delivered. */
    public static function queued(int $siteInspectionId, int $applicationId): self
    {
        return new self(self::QUEUED, $siteInspectionId, $applicationId);
    }

    /**
     * A refused retry. Only ever called with an outcome this class defines, so
     * 9C-3-2 can exhaustively map refusals without a silent default.
     */
    public static function refused(string $outcome, ?int $siteInspectionId = null, ?int $applicationId = null): self
    {
        if (! array_key_exists($outcome, self::MESSAGES)) {
            $outcome = self::INSPECTION_NOT_FOUND;
        }

        return new self($outcome, $siteInspectionId, $applicationId);
    }

    public function isQueued(): bool
    {
        return $this->outcome === self::QUEUED;
    }

    /**
     * Safe, authored explanation. The word "queued" is used deliberately: the
     * FieldSync delivery itself has not happened and this service cannot know
     * whether it ever will.
     */
    public function message(): string
    {
        return self::MESSAGES[$this->outcome] ?? 'The delivery retry request was refused.';
    }
}
