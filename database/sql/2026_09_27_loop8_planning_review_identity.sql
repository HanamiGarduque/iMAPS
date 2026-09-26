-- Loop 8: Planning Review Metadata — reviewed inspection-round identity.
-- Target: iMAPS PostgreSQL (applied to local imaps_db_0921 in this session;
-- retained as the reproducible handoff for the authorized Team Leader deployment).
--
-- Contract:
--   reviewed_site_inspection_id = the EXISTING inspection round whose result the
--                                 Planning Officer is reviewing.
--   site_inspection_task_id     = the NEW inspection round created by the review
--                                 decision, when applicable.
-- These two columns are NOT synonyms and must never be treated as such.
--
-- This script is additive, idempotent where practical, preserves every existing
-- row, performs NO historical backfill (historical records stay NULL until a
-- reviewed round is explicitly reviewed again), and contains no destructive DROP.
-- name: 2026_09_27_loop8_planning_review_identity.sql

BEGIN;

-- 1. Nullable, round-specific reviewed-round identity.
ALTER TABLE public.technical_reviews
    ADD COLUMN IF NOT EXISTS reviewed_site_inspection_id bigint NULL;

-- 2. Foreign key to the reviewed inspection round. ON DELETE SET NULL keeps a
--    review row readable if that round is ever removed, and never cascades a
--    delete into review history.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_catalog.pg_constraint
        WHERE conname = 'technical_reviews_reviewed_site_inspection_id_foreign'
          AND conrelid = 'public.technical_reviews'::regclass
    ) THEN
        ALTER TABLE public.technical_reviews
            ADD CONSTRAINT technical_reviews_reviewed_site_inspection_id_foreign
            FOREIGN KEY (reviewed_site_inspection_id)
            REFERENCES public.site_inspections (id)
            ON DELETE SET NULL;
    END IF;
END
$$;

-- 3. Lookup index for round-targeted review reads and the Loop 8 transport.
CREATE INDEX IF NOT EXISTS technical_reviews_reviewed_site_inspection_id_index
    ON public.technical_reviews (reviewed_site_inspection_id);

-- 4. Scope note (deliberately NOT a CHECK constraint):
--    PostgreSQL forbids subqueries inside CHECK constraints, so the
--    "reviewed round belongs to the same application and parcel" rule cannot be
--    expressed as a table constraint. It is enforced by construction in
--    TechnicalReviewController::resolveReviewedInspectionId(), which only ever
--    resolves the reviewed round from the same application + parcel pair that
--    the review row is being written for, and is covered by the Loop 8 source
--    contract tests. The column itself stays nullable and unconstrained for
--    historical rows.

COMMIT;
