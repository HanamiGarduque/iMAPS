<?php

namespace App\Support;

/**
 * The controlled vocabulary for work-reassignment reasons.
 *
 * These are the only reasons a handover may be recorded with. They are a
 * closed list on purpose: a reason is a business fact that gets reported on and
 * defended later, so it must be countable and comparable rather than a
 * free-text sentence somebody has to interpret.
 */
final class ReassignmentReasons
{
    public const ABSENT = 'Absent';
    public const ON_LEAVE = 'On Leave';
    public const WORKLOAD_TRANSFER = 'Workload Transfer';
    public const UNAVAILABLE = 'Unavailable';
    public const OTHER = 'Other';

    /**
     * Ordered for display. The order reads from the most concrete, verifiable
     * situations to the catch-all.
     *
     * @return array<int, string>
     */
    public static function all(): array
    {
        return [
            self::ABSENT,
            self::ON_LEAVE,
            self::WORKLOAD_TRANSFER,
            self::UNAVAILABLE,
            self::OTHER,
        ];
    }

    public static function isValid(string $reason): bool
    {
        return in_array($reason, self::all(), true);
    }

    /**
     * "Other" is only meaningful with a short explanation, so the note becomes
     * mandatory for that one reason and stays optional for the rest.
     */
    public static function noteIsRequired(string $reason): bool
    {
        return $reason === self::OTHER;
    }

    /**
     * @return array<string, string> validation messages keyed by field
     */
    public static function validationMessages(): array
    {
        return [
            'reason.in' => 'Select a valid reassignment reason.',
            'reason_note.required_if' => 'Explain the reason when you choose Other.',
        ];
    }
}
