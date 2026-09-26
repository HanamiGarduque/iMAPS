-- =============================================================================
-- CANONICAL DATABASE RECONCILIATION — FRESH-INSTALL CORRECTIONS
-- =============================================================================
-- name: 2026_09_26_fresh_install_canonical_corrections.sql
-- target: iMAPS PostgreSQL
-- applies_to: FRESH databases only, AFTER the consolidated
--             2026_09_19_000000_create_initial_schema.php has run and AFTER
--             the incremental bridge migrations
--             (2026_09_11_000000_add_rich_result_columns,
--              2026_09_19_000000_add_assignment_provenance,
--              2026_09_20_151538_add_assigned_by_columns).
-- audited: 2026-09-26
-- do_not_use_on: any database that already carries a 0921-derived
--                 `migrations` ledger. Use the forward file instead.
--
-- WHY THIS FILE EXISTS
--   origin/master's `create_initial_schema` does NOT reproduce the canonical
--   schema on its own. Read-only audit of
--   database/migrations/2026_09_19_000000_create_initial_schema.php proved the
--   following gaps against current application code:
--
--   GAP 1 — site_inspections is created with only 11 columns and is missing the
--           completed-inspection result contract that
--           SiteInspection::$fillable and PushInspectionToSupabase require:
--           findings, is_compliant, submitted_at, inspection_result,
--           observations, discrepancies, recommendations, inspector_notes,
--           checklist_data, confirmed_latitude, confirmed_longitude,
--           gps_accuracy_m, gps_confirmed_at.
--           (Partially covered by the incremental rich-result migration, but
--            is_compliant and findings are NOT, so this file is authoritative.)
--
--   GAP 2 — `users` has no role CHECK constraint. The Loop 6 role contract is
--           exactly three values and the local 0921 database enforces it.
--
--   GAP 3 — `users.supabase_uuid` is not created. Correct: it has zero
--           readers/writers on either branch and is not canonical.
--           `handshake_key` IS required and must exist.
--
--   GAP 4 — site_inspections.parcel_id has no foreign key to parcels(id).
--
--   GAP 5 — site_inspections.status defaults to 'Pending', contradicting the
--           Loop 1 canonical lifecycle value 'assigned'.
--
--   GAP 6 — technical_reviews lacks review_round and the four-value decision
--           CHECK including 'Requires Reinspection' (Loop 4).
--
--   GAP 7 — zoning_applications lacks the individual_fee* columns that the
--           local canonical schema declares NOT NULL DEFAULT 0.
--
--   GAP 8 — no reference indexes for the bridge read paths.
--
--   NOT A GAP — intentionally absent, and this file does NOT add them:
--           site_inspections.remarks, site_inspections.recommendation,
--           users.supabase_uuid, application_sequences.
--
-- SAFETY
--   Forward-only and idempotent. Additive only. No DROP, no data rewrite.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- SECTION 1 — site_inspections: full canonical column set
-- -----------------------------------------------------------------------------
ALTER TABLE public.site_inspections
    ADD COLUMN IF NOT EXISTS assigned_notes            text NULL,
    ADD COLUMN IF NOT EXISTS deadline_date             date NULL,
    ADD COLUMN IF NOT EXISTS assigned_by_imaps_user_id bigint NULL,
    ADD COLUMN IF NOT EXISTS assigned_by_name          varchar NULL,
    ADD COLUMN IF NOT EXISTS parcel_id                bigint NULL,
    ADD COLUMN IF NOT EXISTS findings                 text NULL,
    ADD COLUMN IF NOT EXISTS is_compliant             boolean NULL,
    ADD COLUMN IF NOT EXISTS submitted_at             timestamp NULL,
    ADD COLUMN IF NOT EXISTS inspection_result        varchar NULL,
    ADD COLUMN IF NOT EXISTS observations             text NULL,
    ADD COLUMN IF NOT EXISTS discrepancies            text NULL,
    ADD COLUMN IF NOT EXISTS recommendations          text NULL,
    ADD COLUMN IF NOT EXISTS inspector_notes          text NULL,
    ADD COLUMN IF NOT EXISTS checklist_data           json NULL,
    ADD COLUMN IF NOT EXISTS confirmed_latitude       double precision NULL,
    ADD COLUMN IF NOT EXISTS confirmed_longitude      double precision NULL,
    ADD COLUMN IF NOT EXISTS gps_accuracy_m           double precision NULL,
    ADD COLUMN IF NOT EXISTS gps_confirmed_at         timestamp NULL;

ALTER TABLE public.site_inspections
    ALTER COLUMN status SET DEFAULT 'assigned';

-- -----------------------------------------------------------------------------
-- SECTION 2 — site_inspections: parcel_id foreign key
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    IF to_regclass('public.parcels') IS NOT NULL
       AND to_regclass('public.site_inspections') IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conrelid = 'public.site_inspections'::regclass
              AND contype  = 'f'
              AND pg_get_constraintdef(oid) LIKE '%parcel_id%'
       )
    THEN
        ALTER TABLE public.site_inspections
            ADD CONSTRAINT site_inspections_parcel_id_foreign
            FOREIGN KEY (parcel_id) REFERENCES public.parcels (id) ON DELETE CASCADE;
    END IF;
END $$;

-- -----------------------------------------------------------------------------
-- SECTION 3 — users: three-role CHECK + handshake_key
-- -----------------------------------------------------------------------------
ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS handshake_key varchar NULL;

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
                'ABORT: % user row(s) have a role outside the canonical three roles.',
                v_invalid;
        END IF;

        ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_check
            CHECK (role IN ('Planning Officer', 'Admin', 'Site Inspector'));
    END IF;
END $$;

-- NOTE: users.supabase_uuid is intentionally NOT created.
--       Zero readers/writers on this branch and on origin/master.

-- -----------------------------------------------------------------------------
-- SECTION 4 — technical_reviews: reinspection rounds
-- -----------------------------------------------------------------------------
ALTER TABLE public.technical_reviews
    ADD COLUMN IF NOT EXISTS review_round smallint NOT NULL DEFAULT 1;

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
                'ABORT: % technical_reviews row(s) have a non-canonical decision.',
                v_invalid;
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

-- -----------------------------------------------------------------------------
-- SECTION 5 — zoning_applications: individual fees
-- -----------------------------------------------------------------------------
ALTER TABLE public.zoning_applications
    ADD COLUMN IF NOT EXISTS remarks                  text NULL,
    ADD COLUMN IF NOT EXISTS zoning_certificate_fee   numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS locational_clearance_fee numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS development_permit_fee   numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS other_fees               numeric NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS penalty_fee              numeric NOT NULL DEFAULT 0;

-- -----------------------------------------------------------------------------
-- SECTION 6 — reference indexes
-- -----------------------------------------------------------------------------
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
-- SECTION 7 — EXPLICIT NON-ACTIONS
-- -----------------------------------------------------------------------------
--   site_inspections.remarks        -> RETIRED. Not created.
--   site_inspections.recommendation -> dead $fillable entry. Not created.
--   users.supabase_uuid             -> zero readers/writers. Not created.
--   application_sequences           -> LEGACY. Not created on fresh installs.
--                                      Reference numbers are derived from
--                                      zoning_applications with
--                                      lockForUpdate (origin/master strategy).

COMMIT;
