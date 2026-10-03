-- =============================================================================
-- CANONICAL DATABASE RECONCILIATION — FORWARD UPDATE FOR EXISTING 0921 DATABASES
-- =============================================================================
-- name: 2026_09_26_canonical_schema_reconciliation_0921_forward.sql
-- target: iMAPS PostgreSQL
-- applies_to: databases derived from the team 0921 baseline that already have
--             an `migrations` ledger. NEVER run against a fresh consolidated
--             `create_initial_schema` database.
-- baseline: imaps_db_0921 (team 0921 base + approved Loop 1-7 bridge changes)
-- audited:  2026-09-26
--
-- PURPOSE
--   Bring every 0921-based teammate database to the ONE canonical schema
--   required by current application code, without touching business data.
--
-- SAFETY CONTRACT
--   * Forward-only. No DROP TABLE, no destructive column removal, no data rewrite.
--   * Idempotent: safe to run more than once; every statement is guarded.
--   * Existing rows are never updated by this script.
--   * No environment-specific IDs or data.
--   * Take a backup before running on any shared environment.
--
-- CANONICAL DECISIONS ENCODED HERE
--   1. site_inspections.assigned_notes is the ONE canonical
--      assignment-instructions field. NOT `assignment_instructions`,
--      NOT `remarks`.
--   2. site_inspections.remarks is RETIRED. It is zoning-application context
--      and is intentionally NOT added, even though origin/master's
--      SiteInspection::$fillable still lists it.
--   3. site_inspections.recommendation (singular) is a dead $fillable entry
--      with no writer in any controller or job. NOT added.
--      `recommendations` (plural) is the live field and is retained.
--   4. application_sequences is LEGACY: retained, not dropped, not used by the
--      target reference strategy.
--   5. users.supabase_uuid has zero readers/writers on either branch and is
--      NOT part of the canonical schema.
--
-- VERIFIED LOCAL STATE (imaps_db_0921, read-only audit 2026-09-26)
--   site_inspections    : all 23 canonical columns already present
--   users               : 3-role CHECK present, handshake_key present
--   technical_reviews   : review_round + 4-value decision CHECK present
--   zoning_applications : remarks + individual_fee* present
--   => On a compliant 0921 database this script performs NO structural change.
--      It is the reproducible team handoff and the drift detector.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 1 — site_inspections: canonical column set
-- -----------------------------------------------------------------------------
-- Source of truth: app/Models/SiteInspection.php $fillable,
-- app/Jobs/PushInspectionToSupabase.php,
-- app/Http/Controllers/TechnicalReviewController.php,
-- app/Http/Controllers/ApplicationController.php

ALTER TABLE public.site_inspections
    -- Assignment (assigned_notes is the canonical instruction field)
    ADD COLUMN IF NOT EXISTS assigned_notes                text NULL,
    ADD COLUMN IF NOT EXISTS deadline_date                 date NULL,
    ADD COLUMN IF NOT EXISTS assigned_by_imaps_user_id     bigint NULL,
    ADD COLUMN IF NOT EXISTS assigned_by_name              varchar NULL,
    -- Parcel linkage used by the GIS / property-target flow
    ADD COLUMN IF NOT EXISTS parcel_id                     bigint NULL,
    -- Completed-inspection result contract (Loop 4/5)
    ADD COLUMN IF NOT EXISTS findings                      text NULL,
    ADD COLUMN IF NOT EXISTS is_compliant                  boolean NULL,
    ADD COLUMN IF NOT EXISTS submitted_at                  timestamp NULL,
    ADD COLUMN IF NOT EXISTS inspection_result             varchar NULL,
    ADD COLUMN IF NOT EXISTS observations                  text NULL,
    ADD COLUMN IF NOT EXISTS discrepancies                 text NULL,
    ADD COLUMN IF NOT EXISTS recommendations               text NULL,
    ADD COLUMN IF NOT EXISTS inspector_notes               text NULL,
    ADD COLUMN IF NOT EXISTS checklist_data                json NULL,
    -- Confirmed GPS evidence (Loop 7 map focus + FieldSync evidence)
    ADD COLUMN IF NOT EXISTS confirmed_latitude            double precision NULL,
    ADD COLUMN IF NOT EXISTS confirmed_longitude           double precision NULL,
    ADD COLUMN IF NOT EXISTS gps_accuracy_m                double precision NULL,
    ADD COLUMN IF NOT EXISTS gps_confirmed_at              timestamp NULL;

-- Canonical lifecycle default (Loop 1 aligned the contract to 'assigned').

-- -----------------------------------------------------------------------------
-- SECTION 2 — site_inspections: parcel_id foreign key
-- -----------------------------------------------------------------------------
-- The column exists locally but carries NO foreign key. The canonical
-- definition (bridge-columns migration) requires
-- REFERENCES parcels(id) ON DELETE CASCADE.
-- Validity is proven first so a pre-existing orphan can never block the FK.
DO $$
DECLARE
    v_orphans integer;
BEGIN
    IF to_regclass('public.parcels') IS NOT NULL
       AND EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public'
              AND table_name   = 'site_inspections'
              AND column_name  = 'parcel_id'
       )
       AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.site_inspections'::regclass
              AND contype  = 'f'
              AND pg_get_constraintdef(oid) LIKE '%parcel_id%'
       )
    THEN
        SELECT count(*) INTO v_orphans
        FROM public.site_inspections si
        WHERE si.parcel_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.parcels p WHERE p.id = si.parcel_id);

        IF v_orphans > 0 THEN
            RAISE EXCEPTION
                'ABORT: % site_inspections row(s) reference a missing parcels.id. '
                'Resolve these rows before applying the parcel_id foreign key.',
                v_orphans;
        END IF;

        ALTER TABLE public.site_inspections
            ADD CONSTRAINT site_inspections_parcel_id_foreign
            FOREIGN KEY (parcel_id) REFERENCES public.parcels (id) ON DELETE CASCADE;

        RAISE NOTICE 'Added site_inspections_parcel_id_foreign.';
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 3 — users: canonical three-role CHECK constraint
-- -----------------------------------------------------------------------------
-- Contract: Admin | Planning Officer | Site Inspector (Loop 6 role matrix).
-- Idempotent. Rows are validated first so the swap can never fail.
DO $$
DECLARE
    v_invalid integer;
BEGIN
    IF to_regclass('public.users') IS NOT NULL THEN
        SELECT count(*) INTO v_invalid
        FROM public.users
        WHERE role NOT IN ('Planning Officer', 'Admin', 'Site Inspector');

        IF v_invalid > 0 THEN
            RAISE EXCEPTION
                'ABORT: % user role(s) outside the canonical three roles. '
                'Normalize those roles before applying the constraint.',
                v_invalid;
        END IF;

        ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('Planning Officer', 'Admin', 'Site Inspector'));
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 4 — users: handshake_key (live auth/bridge field)
-- -----------------------------------------------------------------------------
-- Retained: used by the handshake path on this branch (7 refs) and on
-- origin/master (19 refs).
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS handshake_key varchar NULL;

-- NOTE: users.supabase_uuid is intentionally NOT added.
--       Read-only audit found ZERO readers/writers on this branch AND on
--       origin/master. It is not part of the canonical contract.

-- -----------------------------------------------------------------------------
-- SECTION 5 — technical_reviews: reinspection round support
-- -----------------------------------------------------------------------------
-- Loop 4 introduced isolated reinspection rounds. review_round lives on
-- technical_reviews (NOT site_inspections) and is the round counter.
ALTER TABLE public.technical_reviews
    ADD COLUMN IF NOT EXISTS review_round smallint NOT NULL DEFAULT 1;

-- Canonical decision vocabulary, including the reinspection decision.
DO $$
DECLARE
    v_invalid integer;
BEGIN
    IF to_regclass('public.technical_reviews') IS NOT NULL THEN
        SELECT count(*) INTO v_invalid
        FROM public.technical_reviews
        WHERE decision NOT IN (
            'Approved', 'Needs Site Inspection', 'Requires Reinspection', 'Declined'
        );

        IF v_invalid > 0 THEN
            RAISE EXCEPTION
                'ABORT: % technical_reviews row(s) have a decision outside the '
                'canonical four-value vocabulary.', v_invalid;
        END IF;

        ALTER TABLE public.technical_reviews
            DROP CONSTRAINT IF EXISTS technical_reviews_decision_check;
        ALTER TABLE public.technical_reviews
            ADD CONSTRAINT technical_reviews_decision_check
            CHECK (decision IN (
                'Approved', 'Needs Site Inspection', 'Requires Reinspection', 'Declined'
            ));
    END IF;
END $$;

-- NOTE: users.supabase_uuid is intentionally NOT added.
--       Read-only audit found ZERO readers/writers on this branch AND on
--       origin/master. It is not part of the canonical contract.

-- -----------------------------------------------------------------------------
-- SECTION 6 — zoning_applications: application context
-- -----------------------------------------------------------------------------
-- `remarks` here is CORRECT and retained: it is zoning-application context,
-- distinct from site-inspection assignment instructions.
-- The individual_fee* columns are NOT NULL in the local canonical schema.
ALTER TABLE public.zoning_applications
    ADD COLUMN IF NOT EXISTS remarks                   text NULL,
    ADD COLUMN IF NOT EXISTS zoning_certificate_fee    numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locational_clearance_fee  numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS development_permit_fee    numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_fees                numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS penalty_fee               numeric NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- SECTION 7 — reference indexes for the bridge read paths
-- -----------------------------------------------------------------------------
-- Additive only. No existing index is dropped or replaced.
CREATE INDEX IF NOT EXISTS site_inspections_zoning_application_id_index
    ON public.site_inspections (zoning_application_id);
CREATE INDEX IF NOT EXISTS site_inspections_inspector_id_index
    ON public.site_inspections (inspector_id);
CREATE INDEX IF NOT EXISTS site_inspections_status_index
    ON public.site_inspections (status);
CREATE INDEX IF NOT EXISTS technical_reviews_zoning_application_id_index
    ON public.technical_reviews (zoning_application_id);
CREATE INDEX IF NOT EXISTS technical_reviews_zoning_application_id_review_round_index
    ON public.technical_reviews (zoning_application_id, review_round);

-- -----------------------------------------------------------------------------
-- SECTION 8 — EXPLICIT NON-ACTIONS (recorded decisions, deliberately omitted)
-- -----------------------------------------------------------------------------
--   * site_inspections.remarks        -> RETIRED, not created.
--   * site_inspections.recommendation -> dead $fillable entry, no writer, not created.
--   * users.supabase_uuid             -> zero readers/writers, not created.
--   * application_sequences           -> LEGACY, retained, NOT dropped, NOT used.
--   * historical rows                 -> never updated by this script.

COMMIT;

-- =============================================================================
-- POST-RUN VERIFICATION (read-only; run separately, not inside the transaction)
-- =============================================================================
-- SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--  WHERE table_schema='public' AND table_name='site_inspections'
--  ORDER BY ordinal_position;
--   -> expect the 23 canonical columns.
--      Absence of remarks/recommendation is CORRECT, not a defect.
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid='public.site_inspections'::regclass;
--   -> expect site_inspections_parcel_id_foreign among the results
--
-- SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint WHERE conrelid='public.users'::regclass AND contype='c';
--   -> expect the three-role users_role_check
--
-- SELECT role, count(*) FROM public.users GROUP BY role ORDER BY role;
--   -> only 'Admin', 'Planning Officer', 'Site Inspector'
--
-- SELECT status, count(*) FROM public.site_inspections GROUP BY status ORDER BY status;
--   -> existing lifecycle values unchanged
-- =============================================================================
