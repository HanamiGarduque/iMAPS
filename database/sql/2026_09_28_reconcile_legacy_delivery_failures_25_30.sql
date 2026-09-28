-- Loop 9A-R: exact legacy delivery failure reconciliation for inspections 25-30.
-- Target: iMAPS PostgreSQL (applied to local imaps_db_0921).
--
-- name: 2026_09_28_reconcile_legacy_delivery_failures_25_30.sql
--
-- CLASSIFICATION: DATA-ONLY RECONCILIATION AGAINST THE EXISTING 0921 DATABASE.
--   - NOT a migration. NOT a fresh-install artifact. NOT a schema change.
--   - A fresh database has no historical inspections 25-30, so this script must
--     NEVER be added to seed/migration behaviour.
--
-- WHAT IT RECORDS
--   Six already-proven, already-terminal FieldSync delivery failures from
--   2026-09-11. It makes invisible false state visible as a durable
--   DELIVERY_FAILED business fact. It performs NO resend.
--
-- PROVEN LINEAGE (1:1, derived from the serialized queue payload, not chronology)
--   The stored `failed_jobs.payload` carries
--     App\Jobs\PushInspectionToSupabase -> inspection -> App\Models\SiteInspection{id}
--   so the mapping below is read directly out of the job payload:
--     inspection 25 <- failed_jobs.id 7
--     inspection 26 <- failed_jobs.id 8
--     inspection 27 <- failed_jobs.id 9
--     inspection 28 <- failed_jobs.id 10
--     inspection 29 <- failed_jobs.id 11
--     inspection 30 <- failed_jobs.id 12
--   All six exceptions are the same terminal failure, raised by
--   PushInspectionToSupabase::resolveSupabaseUserId() when the local inspector
--   account could not be resolved to a Supabase profile via handshake_key:
--     "Local User ID 25 does not have a mapped Supabase UUID."
--   Normalized: inspector_mapping_unresolved.
--   The fact that this mapping succeeds TODAY does NOT rewrite the historical
--   cause. The recorded cause is the cause at the time of failure.
--
-- HISTORY LIMITATION (deliberate and important)
--   Each attempt row is ONE reconstructed business-level terminal delivery
--   EVENT, because the pre-Loop-9 system had no delivery-attempt
--   instrumentation. attempt_number = 1 therefore does NOT mean Laravel
--   internally attempted the job only once, and no internal automatic-retry
--   history is inferred or fabricated from `failed_jobs`.
--
-- TIMESTAMPS
--   attempted_at / completed_at / last_delivery_attempt_at use the exact mapped
--   failed_jobs.failed_at, because this records a known historical terminal
--   event rather than fabricating a new attempt time today. created_at keeps
--   its insertion-time default and is NOT backdated.
--
-- WHAT THIS SCRIPT MUST NOT DO
--   - No resend, no retry, no dispatch, no remote call of any kind.
--   - No Planning Officer ownership is assigned or inferred. encoded_by is
--     historical encoder attribution and is NOT ownership; it is not read here.
--   - No change to inspection status, inspector, application, parcel, schedule,
--     findings, notes, review history, reference number, or application status.
--   - No Supabase, Storage, RLS, or FieldSync mutation.
--   - `failed_jobs` is neither read destructively nor modified: it stays as the
--     original queue-level technical evidence. Loop 9 records business delivery
--     history separately.
--   - Pre-bridge inspections 3-21 and 24 are excluded and asserted untouched.
--
-- SAFETY
--   Every target is named explicitly with `id IN (25,26,27,28,29,30)`.
--   There is no BETWEEN range predicate, no date predicate, no inspector-only
--   predicate, and no status-only predicate. Any guard failure aborts the whole
--   transaction, so a partial reconciliation is impossible.

BEGIN;

-- ---------------------------------------------------------------------------
-- GUARD 1 - the six exact targets exist.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE id IN (25, 26, 27, 28, 29, 30);

    IF n <> 6 THEN
        RAISE EXCEPTION 'GUARD FAIL: expected exactly 6 target inspections (25-30), found %', n;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- GUARD 2 - all six currently have NO delivery state (idempotency precondition).
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE id IN (25, 26, 27, 28, 29, 30)
      AND (delivery_status IS NOT NULL
           OR last_delivery_attempt_at IS NOT NULL
           OR delivered_at IS NOT NULL
           OR last_delivery_failure_category IS NOT NULL);

    IF n <> 0 THEN
        RAISE EXCEPTION 'GUARD FAIL: % of the targets already carry delivery state; refusing to overwrite', n;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- GUARD 3 - no delivery attempt already exists for the six.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
    FROM public.inspection_delivery_attempts
    WHERE site_inspection_id IN (25, 26, 27, 28, 29, 30);

    IF n <> 0 THEN
        RAISE EXCEPTION 'GUARD FAIL: % attempt rows already exist for the targets; refusing to duplicate history', n;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- GUARD 4 - no attempt may point at a protected pre-bridge inspection.
-- (3-21 and 24 are permanently excluded from delivery monitoring.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE (id BETWEEN 3 AND 21 OR id = 24)
      AND (delivery_status IS NOT NULL
           OR last_delivery_attempt_at IS NOT NULL
           OR delivered_at IS NOT NULL
           OR last_delivery_failure_category IS NOT NULL);

    IF n <> 0 THEN
        RAISE EXCEPTION 'GUARD FAIL: % pre-bridge inspections (3-21,24) carry delivery state and must stay NULL', n;
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- GUARD 5 - attempt numbering is free for exactly these six.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer;
BEGIN
    SELECT count(*) INTO n
    FROM public.inspection_delivery_attempts
    WHERE site_inspection_id IN (25, 26, 27, 28, 29, 30)
      AND attempt_number = 1;

    IF n <> 0 THEN
        RAISE EXCEPTION 'GUARD FAIL: attempt_number 1 is already taken for at least one target';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- STEP 1 - six reconstructed historical terminal delivery events.
--
-- safe_message is a normalized user-facing explanation. It deliberately does NOT
-- contain the raw exception text, the serialized payload, a handshake key, a
-- token, an API key, an Authorization header, a filesystem path, or a URL.
-- ---------------------------------------------------------------------------
INSERT INTO public.inspection_delivery_attempts (
    site_inspection_id,
    attempt_number,
    source,
    outcome,
    failure_category,
    safe_message,
    attempted_at,
    completed_at
) VALUES
    (25, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 00:51:31', TIMESTAMP '2026-09-11 00:51:31'),
    (26, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 18:24:56', TIMESTAMP '2026-09-11 18:24:56'),
    (27, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 18:29:47', TIMESTAMP '2026-09-11 18:29:47'),
    (28, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 19:17:36', TIMESTAMP '2026-09-11 19:17:36'),
    (29, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 19:25:40', TIMESTAMP '2026-09-11 19:25:40'),
    (30, 1, 'legacy_reconciliation', 'failed', 'inspector_mapping_unresolved',
     'Historical delivery failed because the assigned inspector did not have a mapped FieldSync profile at the time of delivery.',
     TIMESTAMP '2026-09-11 19:29:48', TIMESTAMP '2026-09-11 19:29:48');

-- ---------------------------------------------------------------------------
-- STEP 2 - current delivery summary for exactly the same six rows.
--
-- Only the four Loop 9A delivery columns are touched. delivered_at stays NULL
-- because these rounds were never confirmed delivered.
-- ---------------------------------------------------------------------------
UPDATE public.site_inspections
SET delivery_status                = 'delivery_failed',
    last_delivery_attempt_at       = CASE id
                                         WHEN 25 THEN TIMESTAMP '2026-09-11 00:51:31'
                                         WHEN 26 THEN TIMESTAMP '2026-09-11 18:24:56'
                                         WHEN 27 THEN TIMESTAMP '2026-09-11 18:29:47'
                                         WHEN 28 THEN TIMESTAMP '2026-09-11 19:17:36'
                                         WHEN 29 THEN TIMESTAMP '2026-09-11 19:25:40'
                                         WHEN 30 THEN TIMESTAMP '2026-09-11 19:29:48'
                                     END,
    delivered_at                   = NULL,
    last_delivery_failure_category = 'inspector_mapping_unresolved'
WHERE id IN (25, 26, 27, 28, 29, 30);

-- ---------------------------------------------------------------------------
-- POST-ASSERTIONS. Any failure aborts the transaction and nothing is committed.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n integer; mismatched integer;
BEGIN
    -- exactly six rows updated
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE id IN (25, 26, 27, 28, 29, 30)
      AND delivery_status = 'delivery_failed'
      AND last_delivery_failure_category = 'inspector_mapping_unresolved'
      AND delivered_at IS NULL;
    IF n <> 6 THEN
        RAISE EXCEPTION 'POST FAIL: % of 6 targets are correctly marked delivery_failed', n;
    END IF;

    -- exactly six attempt rows, all legacy_reconciliation / failed
    SELECT count(*) INTO n
    FROM public.inspection_delivery_attempts
    WHERE site_inspection_id IN (25, 26, 27, 28, 29, 30)
      AND attempt_number = 1
      AND source = 'legacy_reconciliation'
      AND outcome = 'failed'
      AND failure_category = 'inspector_mapping_unresolved';
    IF n <> 6 THEN
        RAISE EXCEPTION 'POST FAIL: % of 6 legacy_reconciliation attempt rows are correct', n;
    END IF;

    -- every attempt timestamp must equal the mapped historical failed_at
    SELECT count(*) INTO mismatched
    FROM public.inspection_delivery_attempts
    WHERE site_inspection_id IN (25, 26, 27, 28, 29, 30)
      AND (attempted_at, completed_at) NOT IN (
            (TIMESTAMP '2026-09-11 00:51:31', TIMESTAMP '2026-09-11 00:51:31'),
            (TIMESTAMP '2026-09-11 18:24:56', TIMESTAMP '2026-09-11 18:24:56'),
            (TIMESTAMP '2026-09-11 18:29:47', TIMESTAMP '2026-09-11 18:29:47'),
            (TIMESTAMP '2026-09-11 19:17:36', TIMESTAMP '2026-09-11 19:17:36'),
            (TIMESTAMP '2026-09-11 19:25:40', TIMESTAMP '2026-09-11 19:25:40'),
            (TIMESTAMP '2026-09-11 19:29:48', TIMESTAMP '2026-09-11 19:29:48')
      );
    IF mismatched <> 0 THEN
        RAISE EXCEPTION 'POST FAIL: % attempt rows have a timestamp that does not match the mapped failed_at', mismatched;
    END IF;

    -- summary timestamp must match its attempt timestamp
    SELECT count(*) INTO mismatched
    FROM public.site_inspections si
    JOIN public.inspection_delivery_attempts a
      ON a.site_inspection_id = si.id AND a.attempt_number = 1
    WHERE si.id IN (25, 26, 27, 28, 29, 30)
      AND si.last_delivery_attempt_at IS DISTINCT FROM a.attempted_at;
    IF mismatched <> 0 THEN
        RAISE EXCEPTION 'POST FAIL: % summary last_delivery_attempt_at values disagree with their attempt rows', mismatched;
    END IF;

    -- no attempt row may exist anywhere else (no fabricated history)
    SELECT count(*) INTO n FROM public.inspection_delivery_attempts;
    IF n <> 6 THEN
        RAISE EXCEPTION 'POST FAIL: % total attempt rows exist, expected exactly 6', n;
    END IF;

    -- protected pre-bridge rows must remain NULL
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE (id BETWEEN 3 AND 21 OR id = 24)
      AND (delivery_status IS NOT NULL
           OR last_delivery_attempt_at IS NOT NULL
           OR delivered_at IS NOT NULL
           OR last_delivery_failure_category IS NOT NULL);
    IF n <> 0 THEN
        RAISE EXCEPTION 'POST FAIL: % pre-bridge inspections (3-21,24) were modified', n;
    END IF;

    -- already-matched historical bridge jobs must remain NULL: this
    -- reconciliation must not fabricate delivery history for them.
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE id IN (22, 23, 31, 32, 33, 34, 35, 36, 37)
      AND (delivery_status IS NOT NULL
           OR last_delivery_attempt_at IS NOT NULL
           OR delivered_at IS NOT NULL
           OR last_delivery_failure_category IS NOT NULL);
    IF n <> 0 THEN
        RAISE EXCEPTION 'POST FAIL: % already-matched inspections were given fabricated delivery history', n;
    END IF;

    -- total delivery state must be exactly the six targets
    SELECT count(*) INTO n
    FROM public.site_inspections
    WHERE delivery_status IS NOT NULL;
    IF n <> 6 THEN
        RAISE EXCEPTION 'POST FAIL: % rows carry delivery state, expected exactly 6', n;
    END IF;
END $$;

COMMIT;
