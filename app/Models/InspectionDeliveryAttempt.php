<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Append-only history of iMAPS -> FieldSync bridge delivery attempts for one
 * exact inspection round.
 *
 * This model records ATTEMPTS. It is deliberately NOT the source of truth for
 * the current delivery state: `site_inspections.delivery_status` is. Keeping
 * the two separate means a summary can move forward (pending -> delivered ->
 * failed -> pending on retry) without ever rewriting what actually happened.
 *
 * Bridge delivery state is separate from the FieldSync task lifecycle
 * (`site_inspections.status` / `field_jobs.status`:
 * assigned -> in_progress -> completed). Nothing in this model may be used to
 * derive, infer, or alter task lifecycle.
 *
 * Loop 9A is schema foundation only: no writer populates these rows yet.
 */
class InspectionDeliveryAttempt extends Model
{
    use HasFactory;

    /** Attempt initiated by the dispatch that created the inspection round. */
    public const SOURCE_INITIAL_DISPATCH = 'initial_dispatch';

    /** Attempt initiated by the Laravel queue worker's own retry. */
    public const SOURCE_AUTOMATIC_RETRY = 'automatic_retry';

    /** Attempt initiated by the current assigned Planning Officer (Loop 9C). */
    public const SOURCE_PLANNING_OFFICER_RETRY = 'planning_officer_retry';

    /**
     * Attempt recorded while reconciling a proven historical failure into
     * visible delivery state. Never an automatic resend.
     */
    public const SOURCE_LEGACY_RECONCILIATION = 'legacy_reconciliation';

    /** Attempt is still in flight; no outcome yet. */
    public const OUTCOME_PENDING = 'pending';

    /** Remote contract completed successfully for this exact round. */
    public const OUTCOME_DELIVERED = 'delivered';

    /** Attempt terminated without completing the remote contract. */
    public const OUTCOME_FAILED = 'failed';

    /** The local inspector account has no resolvable remote profile. */
    public const FAILURE_INSPECTOR_MAPPING_UNRESOLVED = 'inspector_mapping_unresolved';

    /** Supabase could not be reached (network, DNS, timeout). */
    public const FAILURE_SUPABASE_UNREACHABLE = 'supabase_unreachable';

    /** Supabase rejected the request credentials. */
    public const FAILURE_AUTHENTICATION_FAILURE = 'authentication_failure';

    /** Remote rejected the write on a constraint (e.g. duplicate key). */
    public const FAILURE_REMOTE_CONSTRAINT_FAILURE = 'remote_constraint_failure';

    /** Remote rejected the payload shape or a column value. */
    public const FAILURE_REMOTE_VALIDATION_FAILURE = 'remote_validation_failure';

    /** iMAPS bridge configuration is incomplete (missing URL/credentials). */
    public const FAILURE_CONFIGURATION_FAILURE = 'configuration_failure';

    /** Unclassifiable failure. Never a raw exception message. */
    public const FAILURE_UNKNOWN = 'unknown';

    protected $fillable = [
        'site_inspection_id',
        'attempt_number',
        'source',
        'outcome',
        'failure_category',
        'safe_message',
        'attempted_at',
        'completed_at',
    ];

    protected $casts = [
        'attempt_number' => 'integer',
        'attempted_at' => 'datetime',
        'completed_at' => 'datetime',
        'created_at' => 'datetime',
        'updated_at' => 'datetime',
    ];

    /** The exact inspection round this attempt targets. */
    public function siteInspection(): BelongsTo
    {
        return $this->belongsTo(SiteInspection::class, 'site_inspection_id');
    }

    /** @return list<string> */
    public static function sources(): array
    {
        return [
            self::SOURCE_INITIAL_DISPATCH,
            self::SOURCE_AUTOMATIC_RETRY,
            self::SOURCE_PLANNING_OFFICER_RETRY,
            self::SOURCE_LEGACY_RECONCILIATION,
        ];
    }

    /** @return list<string> */
    public static function outcomes(): array
    {
        return [
            self::OUTCOME_PENDING,
            self::OUTCOME_DELIVERED,
            self::OUTCOME_FAILED,
        ];
    }

    /** @return list<string> */
    public static function failureCategories(): array
    {
        return [
            self::FAILURE_INSPECTOR_MAPPING_UNRESOLVED,
            self::FAILURE_SUPABASE_UNREACHABLE,
            self::FAILURE_AUTHENTICATION_FAILURE,
            self::FAILURE_REMOTE_CONSTRAINT_FAILURE,
            self::FAILURE_REMOTE_VALIDATION_FAILURE,
            self::FAILURE_CONFIGURATION_FAILURE,
            self::FAILURE_UNKNOWN,
        ];
    }
}
