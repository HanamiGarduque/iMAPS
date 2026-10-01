-- =====================================================================
-- =====================================================================
-- CORRECTIVE FOLLOW-UP - 2026-10-02
-- Drop the surviving STANDALONE unique index on field_job_reviews
-- =====================================================================
-- STATUS: PREPARED - NOT YET APPLIED. AWAITING EXPLICIT USER APPROVAL.
--
-- Run with:
--   psql -v ON_ERROR_STOP=1 \
--     -f database/sql/2026_10_02_drop_field_job_reviews_bare_unique_index_after_namespace.sql
--
-- Take a `pg_dump` first, as with every prior remote change. A verified
-- pre-namespace dump already exists, but this is a second mutation.
--
-- ----------------------------------------------------------------------------
-- WHY THIS FILE EXISTS
-- ----------------------------------------------------------------------------
-- 2026_10_01_bridge_source_namespace_collision_fix_forward.sql added
-- UNIQUE (bridge_source_id, technical_review_id) to this table, but did NOT
-- remove the pre-existing bare UNIQUE (technical_review_id).
--
-- The reason is an object-type assumption that turned out to be wrong on this
-- table. Section 6 of that script dropped every survivor with
--
--     ALTER TABLE public.field_job_reviews DROP CONSTRAINT IF EXISTS <name>
--
-- A UNIQUE in PostgreSQL may be EITHER
--   (a) a constraint-backed object - present in pg_constraint, dropped by
--       DROP CONSTRAINT; or
--   (b) a STANDALONE unique index - absent from pg_constraint, dropped only by
--       DROP INDEX.
--
-- On field_job_reviews the object was shape (b). IF EXISTS suppressed the
-- error and DROP CONSTRAINT did nothing at all, so the survivor remained:
--
--     field_job_reviews_technical_review_id_key   UNIQUE btree (technical_review_id)
--
-- Consequence: the composite that sits beside it can never admit a second row
-- for the same technical_review_id, because the bare index forbids it first.
-- Two iMAPS environments still cannot both write local technical_review_id = N.
-- That is precisely the collision class the namespace exists to remove, so the
-- namespacing was only HALF effective on this table.
--
-- The table holds 0 rows, so nothing is blocked today. The defect is latent,
-- not active, which is why it is a follow-up rather than a rollback.
--
-- The forward script has been corrected for the FUTURE: Section 6 now
-- catalog-detects the object type per survivor (LEFT JOIN pg_constraint) and
-- issues DROP CONSTRAINT or DROP INDEX accordingly, then verifies the object
-- is gone and RAISEs if it survives.
--
-- ----------------------------------------------------------------------------
-- SCOPE - EXACTLY ONE OBJECT
-- ----------------------------------------------------------------------------
--   DROP INDEX public.field_job_reviews_technical_review_id_key;
--
-- No other table is touched. No row is written. No column is altered. The
-- composite UNIQUE, the primary key, the decision CHECK and the field_job_id
-- foreign key are all left exactly as they are.
--
-- ----------------------------------------------------------------------------
-- WHY NOT A GENERIC RE-RUN
-- ----------------------------------------------------------------------------
-- Re-running the full forward SQL would be wrong: its Section 8 asserts exact
-- row counts and re-runs the whole backfill. This is one index on one table, so
-- it gets its own small, fully guarded, single-transaction artifact that can be
-- reviewed on its own.
-- =====================================================================
-- =====================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- =====================================================================
-- PRECONDITIONS - every one must hold, or the whole thing rolls back
-- =====================================================================

-- 1. The table exists.
DO $$
BEGIN
    IF to_regclass('public.field_job_reviews') IS NULL THEN
        RAISE EXCEPTION 'ABORT: public.field_job_reviews does not exist. Refusing to run against an unknown schema.';
    END IF;
END $$;

-- 2. The namespace column exists, so the composite identity is in place.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'field_job_reviews'
          AND column_name = 'bridge_source_id' AND data_type = 'text'
    ) THEN
        RAISE EXCEPTION 'ABORT: public.field_job_reviews.bridge_source_id is absent or not text. The namespace apply must have run first.';
    END IF;
END $$;

-- 3. The table is empty. Dropping a uniqueness object over live rows would be
--    a different and much larger decision than the one being made here.
DO $$
DECLARE v_n bigint;
BEGIN
    SELECT count(*) INTO v_n FROM public.field_job_reviews;
    IF v_n <> 0 THEN
        RAISE EXCEPTION 'ABORT: public.field_job_reviews has % row(s), expected 0. Re-audit before dropping a uniqueness object over live data.', v_n;
    END IF;
END $$;

-- 4. The CORRECT composite exists and is valid.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
          AND c.relname = 'field_job_reviews_bridge_source_id_technical_review_id_key'
          AND i.indisunique AND i.indnatts = 2 AND i.indisvalid
    ) THEN
        RAISE EXCEPTION 'ABORT: the composite UNIQUE (bridge_source_id, technical_review_id) is missing, not unique, or invalid. Refusing to remove the bare index - it is currently the only uniqueness protection on this table.';
    END IF;
END $$;

-- 5. The standalone index exists EXACTLY as expected: unique, single-column,
--    on technical_review_id, and valid.
DO $$
DECLARE v_def text;
BEGIN
    SELECT pg_get_indexdef(i.indexrelid) INTO v_def
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
      AND c.relname = 'field_job_reviews_technical_review_id_key';

    IF v_def IS NULL THEN
        RAISE EXCEPTION 'ABORT: index field_job_reviews_technical_review_id_key does not exist. Either it was already removed or the schema differs. Re-audit.';
    END IF;

    IF v_def <> 'CREATE UNIQUE INDEX field_job_reviews_technical_review_id_key ON public.field_job_reviews USING btree (technical_review_id)' THEN
        RAISE EXCEPTION 'ABORT: the survivor is not the expected object. Found: %', v_def;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'technical_review_id'
        WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
          AND c.relname = 'field_job_reviews_technical_review_id_key'
          AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum AND i.indisvalid
    ) THEN
        RAISE EXCEPTION 'ABORT: the survivor is not a valid single-column UNIQUE on technical_review_id. Refusing to drop an object this script does not fully understand.';
    END IF;
END $$;

-- 6. The survivor has NO owning pg_constraint. This is the fact that made
--    DROP CONSTRAINT a silent no-op, so it is asserted rather than assumed.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_job_reviews'::regclass
          AND conname = 'field_job_reviews_technical_review_id_key'
    ) THEN
        RAISE EXCEPTION 'ABORT: field_job_reviews_technical_review_id_key IS a constraint, not a standalone index. This corrective assumes the standalone shape; use DROP CONSTRAINT instead and re-audit.';
    END IF;
END $$;

-- 7. It is not the primary key.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
          AND c.relname = 'field_job_reviews_technical_review_id_key' AND i.indisprimary
    ) THEN
        RAISE EXCEPTION 'ABORT: the survivor is the PRIMARY KEY. Refusing to drop it.';
    END IF;
END $$;

\echo '--- preconditions passed; dropping the survivor ---'

-- =====================================================================
-- THE ONLY MUTATION
-- =====================================================================
DROP INDEX public.field_job_reviews_technical_review_id_key;

\echo '--- survivor dropped ---'

-- =====================================================================
-- POSTCONDITIONS - verified inside the same transaction
-- =====================================================================

-- The survivor is gone.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relname = 'field_job_reviews_technical_review_id_key'
    ) THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: the survivor index still exists.';
    END IF;
END $$;

-- NO bare single-column UNIQUE on technical_review_id remains, by ANY name.
DO $$
DECLARE v_left text;
BEGIN
    SELECT string_agg(c.relname, ', ') INTO v_left
    FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_class t ON t.oid = i.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'technical_review_id'
    WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
      AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum;

    IF v_left IS NOT NULL THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: a bare UNIQUE on technical_review_id still exists: %', v_left;
    END IF;
END $$;

-- The composite is still present and valid.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = 'field_job_reviews'
          AND c.relname = 'field_job_reviews_bridge_source_id_technical_review_id_key'
          AND i.indisunique AND i.indnatts = 2 AND i.indisvalid
    ) THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: the composite UNIQUE was disturbed.';
    END IF;
END $$;

-- The primary key is untouched.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_job_reviews'::regclass AND contype = 'p'
    ) THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: field_job_reviews lost its primary key.';
    END IF;
END $$;

-- The field_job_id foreign key is untouched.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_job_reviews'::regclass AND contype = 'f'
    ) THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: field_job_reviews lost its foreign key; relationships were not preserved.';
    END IF;
END $$;

-- The row count is still 0: nothing was written.
DO $$
DECLARE v_n bigint;
BEGIN
    SELECT count(*) INTO v_n FROM public.field_job_reviews;
    IF v_n <> 0 THEN
        RAISE EXCEPTION 'POSTCONDITION FAILED: row count is %, expected 0. This script must never write.', v_n;
    END IF;
END $$;

\echo ''
\echo 'CORRECTIVE APPLY VERIFIED.'
\echo '  - standalone bare UNIQUE index on technical_review_id: REMOVED'
\echo '  - bare UNIQUE on technical_review_id: none remain'
\echo '  - composite UNIQUE (bridge_source_id, technical_review_id): intact and valid'
\echo '  - primary key, decision CHECK and field_job_id FK: intact'
\echo '  - row count: 0 (nothing written)'
\echo ''
\echo 'field_job_reviews is now fully namespaced. No other table was touched.'

COMMIT;

-- =====================================================================
-- ROLLBACK / RECOVERY
-- =====================================================================
-- Restoring the survivor would REINTRODUCE the collision this removes, so it is
-- not offered as a routine option. If a genuine future need appears, recreate
-- it deliberately and knowingly:
--
--   BEGIN;
--     CREATE UNIQUE INDEX field_job_reviews_technical_review_id_key
--         ON public.field_job_reviews (technical_review_id);
--   COMMIT;
--
-- =====================================================================