-- Loop 9A: Inspection delivery monitoring schema foundation.
-- Target: iMAPS PostgreSQL (applied to local imaps_db_0921; retained as the
-- reproducible handoff for the authorized Team Leader deployment).
--
-- name: 2026_09_28_add_inspection_delivery_monitoring.sql
--
-- CONTRACT
--   Bridge DELIVERY state is a separate, new business fact. It is NOT
--   field_jobs.status and NOT site_inspections.status. The FieldSync task
--   lifecycle remains exactly: assigned -> in_progress -> completed.
--
--   site_inspections.delivery_status (current summary, nullable)
--       pending_delivery | delivered | delivery_failed
--   inspection_delivery_attempts (append-only history, one row per attempt)
--
--   There is deliberately NO "retrying" business state: a retry is an attempt
--   row, not a distinct business condition.
--
-- SAFETY
--   - Additive only. No DROP, no TRUNCATE, no destructive rewrite.
--   - Idempotent (IF NOT EXISTS / guarded DO blocks).
--   - NO historical backfill. Every pre-existing site_inspections row keeps
--     delivery_status = NULL. This is intentional and is the contract:
--       * inspections 3-21 and 24 are pre-bridge historical records and are
--         permanently excluded from delivery monitoring;
--       * inspections 25-30 are proven post-bridge delivery failures, but their
--         NULL -> delivery_failed reconciliation is a SEPARATE, explicitly
--         authorized execution step and is NOT performed here.
--     Fabricated delivery history is therefore impossible from this script.
--   - Laravel failed_jobs remains generic queue infrastructure and is NOT used
--     as a business delivery record.
--   - No raw exception dump, credential, token, header, or signed URL column.
--     safe_message is a short normalized user-facing explanation only; raw
--     technical detail stays in server logs.
--
-- ON DELETE
--   ON DELETE CASCADE matches the established contract for operational history
--   owned by one inspection round (site_inspection_assignments uses CASCADE),
--   and deliberately differs from business decision records
--   (technical_reviews.reviewed_site_inspection_id uses SET NULL), which must
--   survive their referenced round.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. CURRENT delivery summary on site_inspections.
--    All four columns are nullable and left NULL for every existing row.
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS delivery_status character varying(32) NULL;
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS last_delivery_attempt_at timestamp NULL;
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS delivered_at timestamp NULL;
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS last_delivery_failure_category character varying(48) NULL;

COMMENT ON COLUMN public.site_inspections.delivery_status IS
    'CURRENT bridge delivery state: pending_delivery | delivered | delivery_failed. NULL means never established (historical pre-bridge row or not yet reconciled). Never backfilled speculatively.';
COMMENT ON COLUMN public.site_inspections.last_delivery_attempt_at IS
    'Timestamp of the most recent delivery attempt. NULL when no attempt has been recorded.';
COMMENT ON COLUMN public.site_inspections.delivered_at IS
    'Timestamp of the most recent CONFIRMED successful delivery. Retained as history and never erased by a later state change.';
COMMENT ON COLUMN public.site_inspections.last_delivery_failure_category IS
    'Normalized category of the most recent failed attempt. NULL unless the most recent attempt failed.';

-- ---------------------------------------------------------------------------
-- 2. Closed vocabularies enforced by CHECK constraints.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'site_inspections_delivery_status_check'
          AND conrelid = 'public.site_inspections'::regclass
    ) THEN
        ALTER TABLE public.site_inspections
            ADD CONSTRAINT site_inspections_delivery_status_check
            CHECK (
                delivery_status IS NULL
                OR delivery_status IN ('pending_delivery', 'delivered', 'delivery_failed')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'site_inspections_delivery_failure_category_check'
          AND conrelid = 'public.site_inspections'::regclass
    ) THEN
        ALTER TABLE public.site_inspections
            ADD CONSTRAINT site_inspections_delivery_failure_category_check
            CHECK (
                last_delivery_failure_category IS NULL
                OR last_delivery_failure_category IN (
                    'inspector_mapping_unresolved',
                    'supabase_unreachable',
                    'authentication_failure',
                    'remote_constraint_failure',
                    'remote_validation_failure',
                    'configuration_failure',
                    'unknown'
                )
            );
    END IF;
END $$;

-- One-directional invariant only: a confirmed delivery always has its
-- timestamp. The reverse is deliberately NOT constrained, so a later retry
-- that returns the row to pending_delivery does not require erasing the
-- historical delivered_at value.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'site_inspections_delivered_at_present_check'
          AND conrelid = 'public.site_inspections'::regclass
    ) THEN
        ALTER TABLE public.site_inspections
            ADD CONSTRAINT site_inspections_delivered_at_present_check
            CHECK (delivery_status IS DISTINCT FROM 'delivered' OR delivered_at IS NOT NULL);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Append-only delivery attempt history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inspection_delivery_attempts (
    id                 bigserial     PRIMARY KEY,
    site_inspection_id bigint        NOT NULL,
    attempt_number     integer       NOT NULL,
    source             character varying(32)  NOT NULL,
    outcome            character varying(16)  NOT NULL,
    failure_category   character varying(48)  NULL,
    safe_message       text          NULL,
    attempted_at       timestamp     NOT NULL DEFAULT now(),
    completed_at       timestamp     NULL,
    created_at         timestamp     NULL DEFAULT now()
);

COMMENT ON TABLE public.inspection_delivery_attempts IS
    'Append-only history of iMAPS -> FieldSync bridge delivery attempts for one exact inspection round. Not the source of truth for current state; site_inspections.delivery_status is.';
COMMENT ON COLUMN public.inspection_delivery_attempts.attempt_number IS
    'Per-inspection sequence starting at 1. Scoped to site_inspection_id, never global.';
COMMENT ON COLUMN public.inspection_delivery_attempts.source IS
    'Who initiated the attempt: initial_dispatch | automatic_retry | planning_officer_retry | legacy_reconciliation.';
COMMENT ON COLUMN public.inspection_delivery_attempts.outcome IS
    'Attempt result: pending | delivered | failed.';
COMMENT ON COLUMN public.inspection_delivery_attempts.failure_category IS
    'Required when outcome = failed; must be NULL when outcome is pending or delivered.';
COMMENT ON COLUMN public.inspection_delivery_attempts.safe_message IS
    'Short normalized user-facing explanation. Never a raw exception dump, credential, token, header, or signed URL.';

-- Attempt numbering is scoped to the inspection round, not global.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_inspection_attempt_unique'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_inspection_attempt_unique
            UNIQUE (site_inspection_id, attempt_number);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_inspection_foreign'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_inspection_foreign
            FOREIGN KEY (site_inspection_id)
            REFERENCES public.site_inspections (id)
            ON DELETE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_source_check'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_source_check
            CHECK (source IN (
                'initial_dispatch',
                'automatic_retry',
                'planning_officer_retry',
                'legacy_reconciliation'
            ));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_outcome_check'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_outcome_check
            CHECK (outcome IN ('pending', 'delivered', 'failed'));
    END IF;
END $$;

-- NULL rules for failure_category are enforced in BOTH directions, and the
-- membership test is written to be NULL-safe (IS NULL / IS NOT NULL) so that a
-- NULL can never slip through an IN (...) test.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_failure_category_check'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_failure_category_check
            CHECK (
                (
                    outcome = 'failed'
                    AND failure_category IS NOT NULL
                    AND failure_category IN (
                        'inspector_mapping_unresolved',
                        'supabase_unreachable',
                        'authentication_failure',
                        'remote_constraint_failure',
                        'remote_validation_failure',
                        'configuration_failure',
                        'unknown'
                    )
                )
                OR
                (
                    outcome IN ('pending', 'delivered')
                    AND failure_category IS NULL
                )
            );
    END IF;
END $$;

-- attempt_number must be a positive sequence value.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_attempt_number_check'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_attempt_number_check
            CHECK (attempt_number >= 1);
    END IF;
END $$;

-- A completed attempt must carry its completion timestamp.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_catalog.pg_constraint
        WHERE conname = 'inspection_delivery_attempts_completed_at_check'
          AND conrelid = 'public.inspection_delivery_attempts'::regclass
    ) THEN
        ALTER TABLE public.inspection_delivery_attempts
            ADD CONSTRAINT inspection_delivery_attempts_completed_at_check
            CHECK (outcome = 'pending' OR completed_at IS NOT NULL);
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Indexes justified by the approved Loop 9 queries.
--
--    a) site_inspections(delivery_status) WHERE delivery_status IS NOT NULL
--       Loop 9C shows delivery state on Application Detail; Loop 9D aggregates
--       unresolved failures. Every historical row is NULL today, so a partial
--       index keeps the index tiny and matches both predicates exactly.
--
--    b) inspection_delivery_attempts(site_inspection_id, attempted_at)
--       Loading one round's delivery history newest-first (9B/9C/9D detail).
--       The UNIQUE(site_inspection_id, attempt_number) index already covers
--       equality lookup on the round; this composite additionally serves the
--       chronological ordering used by the history view.
--
--    Deliberately NOT added: an index on inspection_delivery_attempts.outcome.
--    It has three distinct values, so selectivity is negligible, and the
--    current-state aggregate reads site_inspections.delivery_status instead.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS site_inspections_delivery_status_index
    ON public.site_inspections (delivery_status)
    WHERE delivery_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS inspection_delivery_attempts_inspection_attempted_index
    ON public.inspection_delivery_attempts (site_inspection_id, attempted_at);

COMMIT;
