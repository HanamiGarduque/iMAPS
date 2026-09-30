-- Loop 9B safety revision: queue-dispatch correlation for delivery attempts.
-- Target: iMAPS PostgreSQL (applied to local imaps_db_0921).
--
-- name: 2026_09_28_add_delivery_attempt_queue_correlation.sql
--
-- REASON
--   The 9B safety review found, BEFORE push, that `failed(Throwable)` cannot
--   safely correlate a terminal Laravel queued command with its own durable
--   attempt rows. It could only read "the globally latest attempt", which is
--   ambiguous when a newer dispatch from a DIFFERENT queued job has also
--   failed but is still retryable. That is reachable as soon as queue tries
--   exceed 1.
--
-- WHAT THIS ADDS
--   Exactly one nullable correlation column plus one index that serves the
--   terminal-correlation lookup. Nothing else.
--
-- COLUMN SEMANTICS
--   queue_job_uuid = the stable Laravel queue payload UUID of the queued
--   PushInspectionToSupabase dispatch that produced this attempt.
--     - one separately dispatched job  => one UUID
--     - automatic retries of that job  => the SAME UUID, new attempt_number
--     - separately dispatched jobs     => different UUIDs
--   It is therefore deliberately NOT unique: several attempt rows legitimately
--   share one UUID across the retries of a single dispatch.
--
-- TYPE EVIDENCE (why `uuid` and not varchar(36))
--   - Laravel 12.58.0 `Illuminate\Queue\Queue::createObjectPayload()` sets
--     'uuid' => (string) Str::uuid(), so the value is always a canonical UUID.
--   - `Illuminate\Queue\Jobs\Job::uuid()` is a concrete method returning
--     payload()['uuid'], so it is available on the database driver too.
--   - All 12 live failed_jobs payload UUIDs are canonical, single length, and
--     cast cleanly to the PostgreSQL uuid type.
--   The native type is therefore used instead of a length-guessed varchar.
--
-- HISTORICAL NULL CONTRACT
--   The six `legacy_reconciliation` attempts stay NULL. No UUID is derived or
--   backfilled from failed_jobs now: 9A-R deliberately recorded no queue
--   correlation, and inventing the linkage afterwards would fabricate business
--   history.
--
-- NO CHECK ON PROSPECTIVE SOURCES — WHY
--   Requiring queue_job_uuid IS NOT NULL for the prospective sources was
--   considered and rejected. A NULL can only arise from (a) legacy
--   reconciliation, or (b) a synchronous/manual invocation that has no queue job
--   at all. Case (b) can never reach `failed()`, because that hook is only
--   invoked by the queue handler, so a NULL prospective row can never terminalize
--   a summary. A hard NOT NULL would add fragility for no safety gain, and the
--   brief forbids weakening production correctness merely to satisfy a
--   synchronous test path.
--
-- SAFETY
--   Additive and idempotent. No DROP, no TRUNCATE, no data rewrite, no
--   delivery_status update, no attempt-history rewrite, no UUID backfill, and no
--   migration-ledger edit.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The correlation column.
-- ---------------------------------------------------------------------------
ALTER TABLE public.inspection_delivery_attempts
    ADD COLUMN IF NOT EXISTS queue_job_uuid uuid NULL;

COMMENT ON COLUMN public.inspection_delivery_attempts.queue_job_uuid IS
    'Stable Laravel queue payload UUID of the queued PushInspectionToSupabase dispatch that produced this attempt. Automatic retries of one dispatch share this UUID and each create a new attempt_number. NULL for legacy_reconciliation rows and for any synchronous execution that has no queue job.';

-- ---------------------------------------------------------------------------
-- 2. Correlation lookup index.
--
--    failed() must find the latest attempt for ONE site_inspection_id and ONE
--    queue_job_uuid, and separately the global latest attempt for the round.
--    This partial index serves the correlated lookup while staying tiny,
--    because every historical and legacy row is NULL.
--
--    NOT UNIQUE by design: retries of one dispatch share a UUID.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS inspection_delivery_attempts_queue_correlation_index
    ON public.inspection_delivery_attempts (site_inspection_id, queue_job_uuid, attempt_number DESC)
    WHERE queue_job_uuid IS NOT NULL;

COMMIT;
