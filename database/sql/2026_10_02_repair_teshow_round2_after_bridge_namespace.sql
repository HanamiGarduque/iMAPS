-- =====================================================================
-- =====================================================================
-- TESHOW ROUND 2 GUARDED MAPPING REPAIR - 2026-10-02
-- =====================================================================
-- STATUS: PREPARED - NOT YET APPLIED. AWAITING EXPLICIT USER APPROVAL.
--
-- Run with:
--   psql -v ON_ERROR_STOP=1 \
--     -f database/sql/2026_10_02_repair_teshow_round2_after_bridge_namespace.sql
--
-- Take a `pg_dump` first, as with every prior remote change.
--
-- PREREQUISITE: the bridge namespace apply must already have run, and the
-- corrective that removed the surviving standalone bare unique on
-- field_job_reviews must already have run. Preconditions 1 and 2 prove both.
-- =====================================================================
-- ----------------------------------------------------------------------------
-- WHAT IS BEING REPAIRED
-- ----------------------------------------------------------------------------
-- Target row, exactly one:
--     a761b17a-3fad-44ed-b451-7f0af0e41183   (local_inspection_id = 37)
--
-- It is Teshow / APP-2026-00026 Round 2. A second iMAPS environment pushed its
-- OWN local_inspection_id = 37 using ON CONFLICT (local_inspection_id), which
-- resolved to this same remote row and overwrote its writer-owned mapping:
--
--     supabase_application_id   -> 7a87a08d  (that environment's APP-2026-00032)
--     supabase_parcel_id        -> 2676c039  (that environment's parcel 70)
--     assigned_inspector_id     -> c4e22f50  (that environment's inspector)
--     scheduled_date            -> 2026-10-01
--     deadline_date             -> 2026-10-03
--     assignment_instructions  -> 'ddd'
--
-- FieldSync-owned LIFECYCLE survived, because FieldSync owns those columns and
-- the colliding writer does not write them:
--
--     status = in_progress, current_step = 1,
--     started_at = 2026-09-26T18:05:46.831173+00:00,
--     step_timestamps, activity_log proving Renato / ddcebeac completed Step 1
--     in Mavalor on 2026-09-26.
--
-- That is exactly why the row looked plausible: the task existed, the
-- inspector's real work existed, and only the mapping pointed at a different
-- site. The bridge namespace apply has since run and left this row's
-- bridge_source_id NULL precisely because its ownership could not be proven from
-- the mirror columns alone.
--
-- This repair restores the mapping to THIS environment's local record for
-- inspection 37 and claims the row. It resets nothing.
--
-- ----------------------------------------------------------------------------
-- THE RESTORED VALUES ARE CORROBORATED, NOT ASSUMED
-- ----------------------------------------------------------------------------
-- Every "after" value below was read back from the LOCAL canonical database on
-- 2026-10-02, and each remote target UUID was confirmed to exist on Supabase:
--
--   local site_inspections 37
--     zoning_application_id 132  = APP-2026-00026  -> eaf432ea-... (exists)
--     parcel_id              64  = Mavalor        -> 69bfaafb-... (exists)
--     inspector_id            6  = Renato Dimaculangan, dimaculanganr@gmail.com
--                                          -> ddcebeac-... (FieldSync id, from the
--                                             field_jobs assignment audit)
--     scheduled_date  2026-09-23
--     deadline_date   2026-10-23
--     assigned_notes  'Loop 4 Round 2 reinspection E2E.'
--     status assigned; confirmed_latitude/longitude NULL; completed_at NULL
--
-- The strongest single piece of evidence is the Mavalor match. The surviving
-- activity_log row records Renato completing "Step 1: Site verification" at
-- Mavalor on 2026-09-26, and the restored parcel 64 IS Mavalor. The corrupted
-- mapping pointed the completed work at a different site; the restored mapping
-- points it back at the site the inspector actually visited. Independent
-- evidence from FieldSync's own log agrees with the local record.
--
-- ----------------------------------------------------------------------------
-- THE PRESERVATION CONTRACT
-- ----------------------------------------------------------------------------
-- PRESERVED EXACTLY (asserted, not assumed):
--     id, local_inspection_id, created_at, status, current_step, started_at,
--     step_timestamps, rework_started_at, submitted_at, the GPS columns, the
--     checklist columns, the photo columns, inspection_result, is_compliant,
--     findings, observations, discrepancies, recommendations, inspector_notes,
--     assigned_by_imaps_user_id, assigned_by_name
-- and every field_job_photos, field_job_reviews and activity_log row.
--
-- EXPECTED TO CHANGE: the seven mapping columns written below, PLUS updated_at.
--
-- updated_at IS EXPECTED TO MOVE, and that is correct. The table has an enabled
-- BEFORE UPDATE trigger trg_field_jobs_set_updated_at calling
-- set_updated_at_utc(). This repair is a genuine write, so that trigger MUST
-- stamp a new value. Unlike the namespace backfill - which touches nothing but
-- bridge_source_id and therefore suspends the trigger - suppressing the
-- timestamp here would falsify the record of when the mapping was corrected.
-- The trigger is NOT disabled in this script, and updated_at is NEVER assigned
-- by hand: if it appeared in the SET list the script would be lying about the
-- provenance of the repair.
--
-- ----------------------------------------------------------------------------
-- WHY ONE UPDATE
-- ----------------------------------------------------------------------------
-- One statement, one transaction. The mapping and the namespace claim commit
-- together or not at all, so the row can never be half-repaired. A previous
-- plan deferred bridge_source_id to a second write; that could leave the row
-- claiming this namespace while still pointing at the other environment's site.
-- =====================================================================
-- =====================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- =====================================================================
-- PRECONDITIONS - every one must hold, or nothing is written
-- =====================================================================

-- 0. The table and the namespace column exist, proving the apply ran.
DO $$
BEGIN
    IF to_regclass('public.field_jobs') IS NULL THEN
        RAISE EXCEPTION 'ABORT: public.field_jobs does not exist. Refusing to run against an unknown schema.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'field_jobs'
          AND column_name = 'bridge_source_id' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'ABORT: public.field_jobs.bridge_source_id is absent or not text. The bridge namespace apply must run first.';
    END IF;
END $$;

-- 1. The target exists EXACTLY ONCE.
DO $$
DECLARE v_n bigint;
BEGIN
    SELECT count(*) INTO v_n FROM public.field_jobs
    WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    IF v_n <> 1 THEN
        RAISE EXCEPTION 'ABORT: target row a761b17a-3fad-44ed-b451-7f0af0e41183 matched % row(s), expected exactly 1.', v_n;
    END IF;

    -- And no OTHER row may claim local_inspection_id 37 in any namespace.
    SELECT count(*) INTO v_n FROM public.field_jobs WHERE local_inspection_id = 37;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'ABORT: local_inspection_id 37 is present on % row(s), expected 1. A duplicate would mean the collision has already spread.', v_n;
    END IF;
END $$;

-- 2. The bare standalone unique on field_job_reviews must already be gone.
--    The corrective runs BEFORE this one; if it has not, the schema is not in
--    the state this repair assumes.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'field_job_reviews_technical_review_id_key'
    ) THEN
        RAISE EXCEPTION 'ABORT: field_job_reviews_technical_review_id_key still exists. Run 2026_10_02_drop_field_job_reviews_bare_unique_index_after_namespace.sql first.';
    END IF;
END $$;

-- 3. The BEFORE snapshot. Every precondition after this point is asserted
--    against it, so a concurrent write between checks cannot slip through.
CREATE TEMP TABLE teshow_before ON COMMIT DROP AS
SELECT * FROM public.field_jobs WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

-- 4. Lifecycle and identity state.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM teshow_before;

    IF r.bridge_source_id IS NOT NULL THEN
        RAISE EXCEPTION 'ABORT: bridge_source_id is already ''%''. Expected NULL (unclaimed). The row may already be repaired.', r.bridge_source_id;
    END IF;

    IF r.local_inspection_id <> 37 THEN
        RAISE EXCEPTION 'ABORT: local_inspection_id is %, expected 37.', r.local_inspection_id;
    END IF;

    IF r.status <> 'in_progress' THEN
        RAISE EXCEPTION 'ABORT: status is ''%'', expected in_progress.', r.status;
    END IF;

    IF r.current_step <> 1 THEN
        RAISE EXCEPTION 'ABORT: current_step is %, expected 1.', r.current_step;
    END IF;

    IF r.started_at IS DISTINCT FROM timestamptz '2026-09-26T18:05:46.831173+00:00' THEN
        RAISE EXCEPTION 'ABORT: started_at is %, expected 2026-09-26T18:05:46.831173+00.', r.started_at;
    END IF;
END $$;

-- 5. Timestamps identifying the exact audited state.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM teshow_before;

    IF r.created_at IS DISTINCT FROM timestamptz '2026-09-22T13:48:04.351620+00:00' THEN
        RAISE EXCEPTION 'ABORT: created_at is %, expected 2026-09-22T13:48:04.351620+00.', r.created_at;
    END IF;

    IF r.updated_at IS DISTINCT FROM timestamptz '2026-10-01T02:45:13.120729+00:00' THEN
        RAISE EXCEPTION 'ABORT: updated_at is %, expected 2026-10-01T02:45:13.120729+00 (the hijack timestamp). The row has been written since the audit; re-audit before repairing.', r.updated_at;
    END IF;
END $$;

-- 5a. The whole-table row count, snapshotted now and compared after the write
--     so that "this repair created or deleted nothing" is proved against the
--     state this run actually saw.
CREATE TEMP TABLE teshow_total_before ON COMMIT DROP AS
SELECT count(*)::bigint AS total FROM public.field_jobs;

-- 6. The CORRUPTED mapping must still be exactly this. If another environment
--    has written since the audit, the repair target is no longer known.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM teshow_before;

    IF r.supabase_application_id::text <> '7a87a08d-6e8a-4943-8f4b-0a2ae242e09f' THEN
        RAISE EXCEPTION 'ABORT: supabase_application_id is %, expected the other environment''s 7a87a08d-6e8a-4943-8f4b-0a2ae242e09f.', r.supabase_application_id;
    END IF;

    IF r.supabase_parcel_id::text <> '2676c039-3a3a-4ad5-8ed9-c44208e0b9d7' THEN
        RAISE EXCEPTION 'ABORT: supabase_parcel_id is %, expected the other environment''s 2676c039-3a3a-4ad5-8ed9-c44208e0b9d7.', r.supabase_parcel_id;
    END IF;

    IF r.assigned_inspector_id::text <> 'c4e22f50-d3c3-4495-b3be-bd264da2e735' THEN
        RAISE EXCEPTION 'ABORT: assigned_inspector_id is %, expected the other environment''s c4e22f50-d3c3-4495-b3be-bd264da2e735.', r.assigned_inspector_id;
    END IF;

    IF r.scheduled_date <> date '2026-10-01' THEN
        RAISE EXCEPTION 'ABORT: scheduled_date is %, expected 2026-10-01.', r.scheduled_date;
    END IF;

    IF r.deadline_date <> date '2026-10-03' THEN
        RAISE EXCEPTION 'ABORT: deadline_date is %, expected 2026-10-03.', r.deadline_date;
    END IF;

    IF r.assignment_instructions <> 'ddd' THEN
        RAISE EXCEPTION 'ABORT: assignment_instructions is ''%'', expected ''ddd''.', coalesce(r.assignment_instructions, '(null)');
    END IF;
END $$;

-- 7. Provenance of the ORIGINAL assignment must still be this environment's.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM teshow_before;

    IF r.assigned_by_imaps_user_id <> 4 THEN
        RAISE EXCEPTION 'ABORT: assigned_by_imaps_user_id is %, expected 4.', r.assigned_by_imaps_user_id;
    END IF;

    IF r.assigned_by_name <> 'Jyerine Desunia' THEN
        RAISE EXCEPTION 'ABORT: assigned_by_name is ''%'', expected ''Jyerine Desunia''.', coalesce(r.assigned_by_name, '(null)');
    END IF;
END $$;

-- 8. Dependent evidence counts, snapshotted for the postcondition comparison.
CREATE TEMP TABLE teshow_dep_before ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM public.field_job_photos  WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS photos,
    (SELECT count(*) FROM public.field_job_reviews WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS reviews,
    (SELECT count(*) FROM public.activity_log       WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS activity,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.field_job_photos t WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS photos_md5,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.field_job_reviews t WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS reviews_md5,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.activity_log t WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS activity_md5;

DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM teshow_dep_before;

    IF r.photos <> 0 THEN
        RAISE EXCEPTION 'ABORT: field_job_photos has % row(s), expected 0. Re-audit: photo evidence exists that this plan does not account for.', r.photos;
    END IF;

    IF r.reviews <> 0 THEN
        RAISE EXCEPTION 'ABORT: field_job_reviews has % row(s), expected 0.', r.reviews;
    END IF;

    IF r.activity <> 1 THEN
        RAISE EXCEPTION 'ABORT: activity_log has % row(s), expected exactly 1.', r.activity;
    END IF;
END $$;

-- 9. LOOP 10 GUARD - the other live task must not be disturbed, and its
--    state is recorded so the postcondition can prove it.
CREATE TEMP TABLE loop10_before ON COMMIT DROP AS
SELECT * FROM public.field_jobs WHERE id = '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999';

DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM loop10_before;

    IF r.id IS NULL THEN
        RAISE EXCEPTION 'ABORT: Loop 10 job 1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999 is absent.';
    END IF;

    IF r.bridge_source_id <> 'rosario-imaps-local-0921-a' THEN
        RAISE EXCEPTION 'ABORT: Loop 10 job bridge_source_id is ''%'', expected rosario-imaps-local-0921-a.', coalesce(r.bridge_source_id, '(null)');
    END IF;

    IF r.status <> 'in_progress' THEN
        RAISE EXCEPTION 'ABORT: Loop 10 job status is ''%'', expected in_progress.', r.status;
    END IF;

    IF r.current_step <> 1 THEN
        RAISE EXCEPTION 'ABORT: Loop 10 job current_step is %, expected 1.', r.current_step;
    END IF;
END $$;

\echo '--- all preconditions passed; repairing exactly one row ---'

-- =====================================================================
-- THE ONLY MUTATION
--
-- Seven mapping columns, including the namespace claim, in ONE statement.
--
-- updated_at is deliberately ABSENT: the enabled BEFORE UPDATE trigger stamps
-- it. Assigning it here would forge the provenance of the repair.
--
-- No lifecycle, evidence or provenance column appears in this SET list.
--
-- The UPDATE lives INSIDE a DO block so that GET DIAGNOSTICS ROW_COUNT is read
-- in the same block that issued it. Placed at top level, ROW_COUNT belongs to
-- the enclosing statement's context and a following DO block always reads 0 -
-- which would abort a perfectly correct repair immediately after the write.
-- The mutation is still exactly one UPDATE against exactly one primary key.
-- =====================================================================
DO $$
DECLARE v_n integer;
BEGIN
    UPDATE public.field_jobs
       SET bridge_source_id       = 'rosario-imaps-local-0921-a',
           supabase_application_id = 'eaf432ea-8f26-4266-bf4b-ca88887ac470',  -- APP-2026-00026 / local application 132
           supabase_parcel_id      = '69bfaafb-a5e2-4871-b9d0-830ea0599b3f',  -- local parcel 64
           assigned_inspector_id   = 'ddcebeac-2217-41c5-a6e2-d7f873db9af2',  -- Renato
           scheduled_date          = date '2026-09-23',
           deadline_date           = date '2026-10-23',
           assignment_instructions = 'Loop 4 Round 2 reinspection E2E.'
     WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'ABORT: the UPDATE affected % row(s), expected exactly 1.', v_n;
    END IF;
    -- NOTE: every RAISE in this script that passes a parameter MUST carry a
    -- matching % placeholder. PL/pgSQL raises "too many parameters specified
    -- for RAISE" otherwise, which under ON_ERROR_STOP aborts the whole
    -- transaction from what is only progress reporting.
    RAISE NOTICE 'repaired exactly % row(s)', v_n;
END $$;

\echo '--- repair written; verifying preservation ---'

-- =====================================================================
-- POSTCONDITIONS
-- =====================================================================

-- 1. WHOLE-ROW PRESERVATION.
--    The after-row, with ONLY the seven mapping columns and updated_at
--    removed, must equal the before-row exactly. Any other difference is a
--    silent rewrite of lifecycle or evidence and aborts everything.
DO $$
DECLARE
    v_before jsonb;
    v_after  jsonb;
    v_changed text;
BEGIN
    SELECT to_jsonb(t) - ARRAY[
        'bridge_source_id', 'supabase_application_id', 'supabase_parcel_id',
        'assigned_inspector_id', 'scheduled_date', 'deadline_date',
        'assignment_instructions', 'updated_at'
    ]::text[]
      INTO v_before
      FROM teshow_before t;

    SELECT to_jsonb(j) - ARRAY[
        'bridge_source_id', 'supabase_application_id', 'supabase_parcel_id',
        'assigned_inspector_id', 'scheduled_date', 'deadline_date',
        'assignment_instructions', 'updated_at'
    ]::text[]
      INTO v_after
      FROM public.field_jobs j
     WHERE j.id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    -- jsonb_each yields (key, value), but the column list alias renames them to
    -- (k, v). USING must therefore name 'k', not 'key'; USING (key) fails with
    -- "column key specified in USING clause does not exist in left table".
    SELECT string_agg(b.k, ', ' ORDER BY b.k) INTO v_changed
    FROM jsonb_each(v_before) AS b(k, v)
    JOIN jsonb_each(v_after)  AS a(k, v) ON b.k = a.k
    WHERE b.v IS DISTINCT FROM a.v;

    IF v_changed IS NOT NULL THEN
        RAISE EXCEPTION 'PRESERVATION FAILED: these non-mapping column(s) changed: %. Rolling back the whole repair.', v_changed;
    END IF;

    -- The join above only compares keys present on BOTH sides, so a column that
    -- vanished from one snapshot would be compared against nothing. Prove the
    -- two key sets are identical, then compare them as whole documents, which
    -- is strictly stronger than the per-key loop above.
    IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_before) AS k)
       IS DISTINCT FROM
       (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v_after)  AS k) THEN
        RAISE EXCEPTION 'PRESERVATION FAILED: the before and after snapshots do not expose the same column set.';
    END IF;

    IF v_before::text IS DISTINCT FROM v_after::text THEN
        RAISE EXCEPTION 'PRESERVATION FAILED: whole-document comparison differs even though the per-key loop found nothing.';
    END IF;

    RAISE NOTICE 'preservation OK: every non-mapping column is byte-identical';
END $$;

-- 2. updated_at MUST have advanced, and must have advanced through the trigger.
DO $$
DECLARE
    v_old timestamptz;
    v_new timestamptz;
BEGIN
    SELECT updated_at INTO v_old FROM teshow_before;
    SELECT updated_at INTO v_new FROM public.field_jobs
     WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    IF v_new IS NULL THEN
        RAISE EXCEPTION 'updated_at became NULL. The trigger must stamp it.';
    END IF;

    IF v_new <= v_old THEN
        RAISE EXCEPTION 'updated_at did not advance: was %, now %. The enabled trigger must move it.', v_old, v_new;
    END IF;

    RAISE NOTICE 'updated_at advanced % -> %', v_old, v_new;
END $$;

-- 3. The repaired mapping is exactly what was intended.
DO $$
DECLARE r record;
BEGIN
    SELECT * INTO r FROM public.field_jobs WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';

    IF r.bridge_source_id <> 'rosario-imaps-local-0921-a' THEN
        RAISE EXCEPTION 'bridge_source_id is ''%'' after repair.', coalesce(r.bridge_source_id, '(null)');
    END IF;
    IF r.supabase_application_id::text <> 'eaf432ea-8f26-4266-bf4b-ca88887ac470' THEN
        RAISE EXCEPTION 'supabase_application_id is % after repair.', r.supabase_application_id;
    END IF;
    IF r.supabase_parcel_id::text <> '69bfaafb-a5e2-4871-b9d0-830ea0599b3f' THEN
        RAISE EXCEPTION 'supabase_parcel_id is % after repair.', r.supabase_parcel_id;
    END IF;
    IF r.assigned_inspector_id::text <> 'ddcebeac-2217-41c5-a6e2-d7f873db9af2' THEN
        RAISE EXCEPTION 'assigned_inspector_id is % after repair.', r.assigned_inspector_id;
    END IF;
    IF r.scheduled_date <> date '2026-09-23' THEN
        RAISE EXCEPTION 'scheduled_date is % after repair.', r.scheduled_date;
    END IF;
    IF r.deadline_date <> date '2026-10-23' THEN
        RAISE EXCEPTION 'deadline_date is % after repair.', r.deadline_date;
    END IF;
    IF r.assignment_instructions <> 'Loop 4 Round 2 reinspection E2E.' THEN
        RAISE EXCEPTION 'assignment_instructions is ''%'' after repair.', coalesce(r.assignment_instructions, '(null)');
    END IF;
END $$;

-- 4. Exactly ONE row now resolves for (this namespace, local_inspection_id 37).
DO $$
DECLARE v_n bigint;
BEGIN
    SELECT count(*) INTO v_n FROM public.field_jobs
    WHERE bridge_source_id = 'rosario-imaps-local-0921-a' AND local_inspection_id = 37;

    IF v_n <> 1 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: % row(s) resolve for (rosario-imaps-local-0921-a, 37), expected 1.', v_n;
    END IF;
END $$;

-- 5. No duplicate uuid, no creation, no deletion.
--    The total is compared against the count snapshotted at the start of THIS
--    run, not against a literal. A hardcoded expectation would abort a correct
--    repair merely because an unrelated job was created between the audit and
--    the apply, which is a false alarm that trains the operator to re-audit
--    for no reason. The property that actually matters is: this repair changed
--    no row other than its single target.
DO $$
DECLARE v_n bigint;
BEGIN
    SELECT count(*) INTO v_n FROM public.field_jobs;
    IF v_n <> (SELECT total FROM teshow_total_before) THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: field_jobs held % row(s) before the repair and % after. This repair must never create or delete a job.',
            (SELECT total FROM teshow_total_before), v_n;
    END IF;

    SELECT count(*) INTO v_n FROM public.field_jobs WHERE id = 'a761b17a-3fad-44ed-b451-7f0af0e41183';
    IF v_n <> 1 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: the target uuid is present % time(s).', v_n;
    END IF;
END $$;

-- 6. Dependent evidence unchanged, by count AND by content hash.
--    Built as a named temp table with the SAME shape as teshow_dep_before and
--    then compared row-wise. A bare multi-column "SELECT ... INTO rec" yields
--    ?column? fields, so reading rec.photos would fail at runtime; naming the
--    columns makes the comparison impossible to get subtly wrong.
CREATE TEMP TABLE teshow_dep_after ON COMMIT DROP AS
SELECT
    (SELECT count(*) FROM public.field_job_photos  WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS photos,
    (SELECT count(*) FROM public.field_job_reviews WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS reviews,
    (SELECT count(*) FROM public.activity_log       WHERE field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS activity,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.field_job_photos t  WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS photos_md5,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.field_job_reviews t WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS reviews_md5,
    (SELECT md5(coalesce(string_agg(t::text, ',' ORDER BY t.id), ''))
       FROM public.activity_log t      WHERE t.field_job_id = 'a761b17a-3fad-44ed-b451-7f0af0e41183') AS activity_md5;

DO $$
DECLARE r record; b record;
BEGIN
    SELECT * INTO r FROM teshow_dep_before;
    SELECT * INTO b FROM teshow_dep_after;

    IF b.photos <> r.photos OR b.photos_md5 <> r.photos_md5 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: field_job_photos changed (count % -> %, hash % -> %).', r.photos, b.photos, r.photos_md5, b.photos_md5;
    END IF;
    IF b.reviews <> r.reviews OR b.reviews_md5 <> r.reviews_md5 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: field_job_reviews changed (count % -> %, hash % -> %).', r.reviews, b.reviews, r.reviews_md5, b.reviews_md5;
    END IF;
    IF b.activity <> r.activity OR b.activity_md5 <> r.activity_md5 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: activity_log changed (count % -> %, hash % -> %).', r.activity, b.activity, r.activity_md5, b.activity_md5;
    END IF;

    RAISE NOTICE 'dependent evidence unchanged: photos=%, reviews=%, activity_log=%', b.photos, b.reviews, b.activity;
END $$;

-- 7. LOOP 10 GUARD, after.
DO $$
DECLARE r record; b record;
BEGIN
    SELECT * INTO r FROM loop10_before;
    SELECT * INTO b FROM public.field_jobs WHERE id = '1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999';

    -- Whole-row identity must be untouched; only updated_at could legitimately
    -- differ, and this repair never targets that row at all, so even that must
    -- not move.
    IF (to_jsonb(b) - 'updated_at')::text IS DISTINCT FROM (to_jsonb(r) - 'updated_at')::text THEN
        RAISE EXCEPTION 'LOOP 10 GUARD FAILED: job 1f9df2ac changed during the Teshow repair.';
    END IF;

    IF (to_jsonb(b))::text IS DISTINCT FROM (to_jsonb(r))::text THEN
        RAISE EXCEPTION 'LOOP 10 GUARD FAILED: job 1f9df2ac updated_at moved during a repair that does not target it.';
    END IF;

    RAISE NOTICE 'Loop 10 job 1f9df2ac is byte-identical';
END $$;

\echo ''
\echo 'TESHOW REPAIR APPLIED AND VERIFIED.'
\echo '  mapping restored to APP-2026-00026 / parcel 64 / Renato ddcebeac'
\echo '  bridge_source_id claimed: rosario-imaps-local-0921-a'
\echo '  lifecycle, evidence and provenance: byte-identical (verified)'
\echo '  updated_at: advanced through the enabled trigger (verified)'
\echo '  field_job_photos / field_job_reviews / activity_log: unchanged (verified)'
\echo '  Loop 10 job 1f9df2ac: byte-identical (verified)'
\echo '  exactly one row resolves for (rosario-imaps-local-0921-a, 37)'
\echo '  no job created, no job deleted'
\echo ''
\echo 'DEVICE CONFIRMATION REMAINS SEPARATE. This is backend recovery only.'

COMMIT;

-- =====================================================================
-- ROLLBACK / RECOVERY
-- =====================================================================
-- The transaction rolls back on ANY failed precondition or postcondition, so a
-- refused run leaves the row exactly as it was. Nothing needs undoing.
--
-- Do NOT "roll back" by rewriting the mapping to the other environment's
-- values: that is the corrupt state this script exists to remove.
-- =====================================================================