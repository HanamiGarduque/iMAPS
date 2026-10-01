-- =====================================================================
-- CROSS-ENVIRONMENT BRIDGE IDENTITY FIX - FORWARD SQL (SUPABASE)
-- =====================================================================
--
-- name: 2026_10_01_bridge_source_namespace_collision_fix_forward.sql
-- target: the SHARED Supabase FieldSync bridge project
-- status: PREPARED - NOT YET APPLIED. AWAITING EXPLICIT USER APPROVAL.
--
-- DO NOT RUN THIS UNTIL THE PASS-1 REPORT IS ACCEPTED AND THE REMOTE APPLY IS
-- EXPLICITLY APPROVED. This file was created and dry-run validated only.
--
-- HOW TO APPLY (when approved)
--   pg_dump first, as with every prior remote change.
--   psql -v ON_ERROR_STOP=1 -v bridge_source_id='<YOUR UNIQUE SOURCE ID>' \
--        -f database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql
--
--   `bridge_source_id` MUST be the value configured as IMAPS_BRIDGE_SOURCE_ID
--   in THIS iMAPS deployment. The script refuses to run without it. It is NOT
--   defaulted, NOT derived from a hostname and NOT derived from a database name.
--
--
-- ----------------------------------------------------------------------------
-- ROOT CAUSE (proven incident)
-- ----------------------------------------------------------------------------
-- The shared bridge tables identify an iMAPS row by a BARE LOCAL INTEGER:
--
--   field_jobs.local_inspection_id                   UNIQUE
--   supabase_zoning_applications.local_application_id UNIQUE
--   supabase_parcels.local_parcel_id                 UNIQUE
--   field_job_reviews.technical_review_id             UNIQUE
--
-- Those integers are unique only INSIDE ONE iMAPS DATABASE. The Supabase
-- project is shared by more than one iMAPS environment, so two environments
-- resolving the same local id resolved to the SAME remote row.
--
-- Proven on 2026-10-01 (TESHOW / APP-2026-00026, local application 132,
-- parcel 64):
--
--   remote job a761b17a-3fad-44ed-b451-7f0af0e41183  (local_inspection_id 37)
--
--   Round 2 was assigned to Renato (local) / Hubbie ddcebeac (remote) and
--   started in Mavalor on 2026-09-26. A second iMAPS environment then pushed
--   its own local_inspection_id = 37 and, because the writer used
--   ON CONFLICT (local_inspection_id), OVERWROTE this row's writer-owned
--   mapping:
--
--     supabase_application_id  -> 7a87a08d  (APP-2026-00032 / Boy Abunda)
--     supabase_parcel_id       -> 2676c039  (their parcel 70)
--     assigned_inspector_id    -> c4e22f50  (Juan Dela Cruz)
--     scheduled_date           -> 2026-10-01
--     deadline_date            -> 2026-10-03
--     assignment_instructions  -> their value
--
--   while FieldSync-owned lifecycle survived:
--     status = in_progress, current_step = 1,
--     started_at = 2026-09-26T18:05:46.831173+00:00,
--     step_timestamps = {"1": "2026-09-26T17:50:46.146511Z"},
--     activity_log: Renato / ddcebeac "Completed Step 1: Site verification"
--     in Mavalor at 2026-09-26T17:50:46.982345+00:00.
--
--   Overwriting the mapping while leaving the lifecycle is what made the row
--   look plausible: the task existed, the inspector's work existed, and the
--   job pointed at a completely different site.
--
--
-- ----------------------------------------------------------------------------
-- THE CONTRACT THIS SCRIPT INSTALLS
-- ----------------------------------------------------------------------------
-- Mirror identity becomes (bridge_source_id, local_*_id):
--
--   field_jobs                     UNIQUE (bridge_source_id, local_inspection_id)
--   supabase_zoning_applications   UNIQUE (bridge_source_id, local_application_id)
--   supabase_parcels               UNIQUE (bridge_source_id, local_parcel_id)
--   field_job_reviews              UNIQUE (bridge_source_id, technical_review_id)
--
-- Remote UUID primary keys are PRESERVED and remain the canonical row ids.
-- Nothing is deleted. No business row is recreated. Foreign keys and every
-- other column are untouched.
--
-- Phase 1 (this file) makes bridge_source_id NULLABLE and backfills only
-- PROVEN rows. Phase 2 (separate, later, NOT in this file) can then tighten
-- it to NOT NULL once every environment has deployed the namespaced writer.
--
--
-- ----------------------------------------------------------------------------
-- LEGACY / BACKFILL STRATEGY - THREE-WAY, NO GUESSED PROVENANCE
-- ----------------------------------------------------------------------------
-- Rows that predate bridge_source_id are classified, never guessed:
--
--   A. PROVEN CURRENT ENVIRONMENT
--      Assigned this deployment's bridge_source_id. Every one of these was
--      proven by independent evidence, not by creation timestamp alone:
--        * the local id exists in THIS iMAPS database;
--        * the remote application mirror's reference_number AND applicant_name
--          equal the local application row's;
--        * the remote parcel mirror's property_index_number AND owner_name
--          equal the local parcel row's, and its application relationship
--          matches the local parcel's application;
--        * the remote assigned_inspector_id resolves, through this deployment's
--          own users.handshake_key -> profiles.handshake_key mapping, to the
--          local site_inspections.inspector_id.
--      The frozen UUID lists are supplied below so the apply is explicit,
--      reviewable, and cannot silently grow.
--
--   B. PROVEN OTHER ENVIRONMENT
--      The local id does NOT exist in this iMAPS database at all. These rows
--      are left with bridge_source_id = NULL. This script never assigns this
--      deployment's identity to them and never invents an identity for them;
--      their owning environment must set its OWN bridge_source_id and claim
--      them. Leaving them NULL is what makes that safe: they cannot collide
--      with either namespace, because PostgreSQL treats NULL as distinct in a
--      UNIQUE constraint.
--
--   C. UNRESOLVED LEGACY
--      Left NULL, and NOT silently claimed. Specifically the Teshow job
--      a761b17a-3fad-44ed-b451-7f0af0e41183: its current remote mapping does
--      NOT match this environment's local record for local_inspection_id 37
--      (it points at APP-2026-00032 / parcel 70 / Juan Dela Cruz), yet its
--      lifecycle and activity_log prove Teshow. Classifying it as "current"
--      would assert ownership this script cannot prove from the mirror columns
--      alone, and classifying it as "other" would hand a live Teshow task to
--      another environment. It therefore stays NULL and is repaired by the
--      separate, explicitly approved Teshow recovery procedure, which repairs
--      the mapping FIRST and only then claims the row.
--
-- The classification queries below are printed, not asserted. Review them
-- against the frozen lists before approving the apply.
--
--
-- ----------------------------------------------------------------------------
-- OLD DEPLOYMENT SAFETY
-- ----------------------------------------------------------------------------
-- Once the bare UNIQUE (local_inspection_id) is dropped, an OLD deployment
-- still sending `ON CONFLICT (local_inspection_id)` gets, from PostgreSQL:
--
--   ERROR: there is no unique or exclusion constraint matching the ON CONFLICT
--   specification  (SQLSTATE 42P10)
--
-- PostgREST surfaces that as HTTP 409 with code 42P10, and the writer's
-- existing `!successful()` branch classifies it and fails the attempt. The
-- old writer STOPS. It cannot overwrite another environment, because the
-- constraint it names no longer exists.
--
-- That is the preferred fail-safe: an old deployment loses the ability to
-- corrupt the bridge rather than silently keeping it.
--
-- REQUIRED COORDINATION: every active iMAPS deployment writing to THIS
-- Supabase project must be upgraded to the namespaced contract BEFORE this
-- script is applied, or its deliveries will fail with 42P10 until it is. No
-- compatibility shim is created here on purpose - preserving the bare-local-id
-- conflict target would preserve the collision vulnerability.
--
--
-- ----------------------------------------------------------------------------
-- SCOPE OF EACH TABLE (audited, not assumed)
-- ----------------------------------------------------------------------------
-- Namespaced here (each PROVEN to key on a bare local integer):
--   field_jobs                    local_inspection_id          (16 rows)
--   supabase_zoning_applications  local_application_id         (24 rows)
--   supabase_parcels              local_parcel_id              (20 rows)
--   field_job_reviews             technical_review_id           ( 0 rows)
--
-- DELIBERATELY NOT namespaced:
--   field_job_photos  - its only identity is field_job_id, a REMOTE uuid FK.
--                       It carries no local integer, so it has no collision.
--   local_inspections - remote-side table, 0 rows, no local-id mirror column
--                       in use by this writer.
--   profiles, activity_log, diagnostic_reports, application_status_tracks -
--                       no local-id identity.
--
-- This matches the audit rule "do NOT namespace tables that do not actually
-- use local integer identity".
--
--
-- ----------------------------------------------------------------------------
-- TRANSACTIONALITY
-- ----------------------------------------------------------------------------
-- The whole script runs in ONE transaction. Any guard failure RAISEs, which
-- aborts and rolls back everything: no partial column set, no partial
-- constraint swap, no orphaned index. PostgreSQL permits transactional DDL,
-- so this is applied as a single atomic unit.
--
-- =====================================================================


\set ON_ERROR_STOP on
\timing off

BEGIN;

-- Capture the requested source id, then refuse to proceed without one.
CREATE TEMP TABLE bridge_ns_request (
    requested_source_id text NOT NULL
) ON COMMIT DROP;

INSERT INTO bridge_ns_request (requested_source_id)
VALUES (:'bridge_source_id');

DO $$
DECLARE
    v_requested text;
BEGIN
    SELECT requested_source_id INTO v_requested FROM bridge_ns_request;

    IF v_requested IS NULL OR btrim(v_requested) = '' THEN
        RAISE EXCEPTION
            'REFUSING TO RUN: psql variable bridge_source_id was not supplied. It must be the value configured as IMAPS_BRIDGE_SOURCE_ID in this iMAPS deployment. There is deliberately no default.';
    END IF;

    IF btrim(v_requested) !~ '^[A-Za-z0-9][A-Za-z0-9._-]{1,62}$' THEN
        RAISE EXCEPTION
            'REFUSING TO RUN: bridge_source_id "%" is not an acceptable identity. Use 2-63 characters of letters, digits, dot, underscore or hyphen; no comma, parenthesis, quote, whitespace or colon.',
            v_requested;
    END IF;

    -- Kept identical to App\Services\BridgeSourceIdentity::REJECTED, so the
    -- writer and the migration can never disagree about what "unset" means.
    IF lower(btrim(v_requested)) IN (
        'default','none','null','nil','undefined','changeme','todo','fixme',
        'localhost','example','placeholder','your-bridge-source-id'
    ) THEN
        RAISE EXCEPTION
            'REFUSING TO RUN: bridge_source_id "%" is a shared placeholder. Two environments using the same placeholder is exactly the collision this script fixes. Choose a value unique to this database.',
            v_requested;
    END IF;
END
$$;


-- =====================================================================
-- SECTION 1 - INCOMPATIBLE-SCHEMA GUARD
-- =====================================================================
-- Runs BEFORE any DDL. Aborts the whole transaction if the live schema is not
-- the schema this script was written against, so an unexpected deployment can
-- never be silently reshaped.
-- =====================================================================
DO $$
DECLARE
    v_missing text := '';
    v_wrong   text := '';
BEGIN
    -- 1a. Every target table must exist.
    IF to_regclass('public.field_jobs') IS NULL THEN
        v_missing := v_missing || ' public.field_jobs';
    END IF;
    IF to_regclass('public.supabase_zoning_applications') IS NULL THEN
        v_missing := v_missing || ' public.supabase_zoning_applications';
    END IF;
    IF to_regclass('public.supabase_parcels') IS NULL THEN
        v_missing := v_missing || ' public.supabase_parcels';
    END IF;
    IF to_regclass('public.field_job_reviews') IS NULL THEN
        v_missing := v_missing || ' public.field_job_reviews';
    END IF;

    IF v_missing <> '' THEN
        RAISE EXCEPTION
            'INCOMPATIBLE SCHEMA: expected table(s) not found:% . Refusing to alter an unknown schema.',
            v_missing;
    END IF;

    -- 1b. Each local-id column must exist and be integer-typed. A text local
    --     id would mean the live contract already differs from the audited one.
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'field_jobs'
          AND column_name = 'local_inspection_id' AND data_type = 'integer'
    ) THEN
        v_wrong := v_wrong || ' field_jobs.local_inspection_id(integer)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supabase_zoning_applications'
          AND column_name = 'local_application_id' AND data_type = 'integer'
    ) THEN
        v_wrong := v_wrong || ' supabase_zoning_applications.local_application_id(integer)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'supabase_parcels'
          AND column_name = 'local_parcel_id' AND data_type = 'integer'
    ) THEN
        v_wrong := v_wrong || ' supabase_parcels.local_parcel_id(integer)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'field_job_reviews'
          AND column_name = 'technical_review_id' AND data_type = 'bigint'
    ) THEN
        v_wrong := v_wrong || ' field_job_reviews.technical_review_id(bigint)';
    END IF;

    IF v_wrong <> '' THEN
        RAISE EXCEPTION
            'INCOMPATIBLE SCHEMA: audited local-id column(s) missing or retyped:% . Refusing to continue.',
            v_wrong;
    END IF;

    -- 1c. bridge_source_id must not already exist with a different type. It is
    --     added later with ADD COLUMN IF NOT EXISTS for idempotence, but a
    --     pre-existing differently-typed column means someone else already
    --     made this decision and the plan must be re-reviewed.
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('field_jobs','supabase_zoning_applications',
                             'supabase_parcels','field_job_reviews')
          AND column_name = 'bridge_source_id'
          AND data_type <> 'text'
    ) THEN
        RAISE EXCEPTION
            'INCOMPATIBLE SCHEMA: a bridge_source_id column already exists with a non-text type. Re-review before continuing.';
    END IF;

    -- 1d. Refuse if a bare-local-id unique index already exists on a target
    --     table but is NOT one of the four this script replaces. Silently
    --     leaving an extra one behind would preserve a collision.
    IF EXISTS (
        SELECT 1
        FROM pg_index i
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public'
          AND t.relname IN ('field_jobs','supabase_zoning_applications',
                            'supabase_parcels','field_job_reviews')
          AND i.indisunique
          AND i.indnatts = 1
          AND (
              (t.relname = 'field_jobs'                    AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'local_inspection_id'))
           OR (t.relname = 'supabase_zoning_applications'  AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'local_application_id'))
           OR (t.relname = 'supabase_parcels'              AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'local_parcel_id'))
           OR (t.relname = 'field_job_reviews'             AND i.indkey[0] = (SELECT attnum FROM pg_attribute WHERE attrelid = t.oid AND attname = 'technical_review_id'))
          )
    ) THEN
        -- Expected on a first apply: these are the four constraints Section 6
        -- drops by catalog lookup. Just record how many, do not abort.
        RAISE NOTICE 'bare local-id unique indexes found on target tables; Section 6 will replace them';
    END IF;
END
$$;


-- =====================================================================
-- SECTION 2 - ADD bridge_source_id (nullable in phase 1)
-- =====================================================================
-- Nullable on purpose: proven rows are backfilled below, unresolved rows stay
-- NULL until their real owner is known, and PostgreSQL treats NULL as distinct
-- inside a UNIQUE constraint so an unclaimed row cannot collide with anything.
-- NOT NULL is a later, separately approved phase.
-- =====================================================================
ALTER TABLE public.field_jobs
    ADD COLUMN IF NOT EXISTS bridge_source_id text;

ALTER TABLE public.supabase_zoning_applications
    ADD COLUMN IF NOT EXISTS bridge_source_id text;

ALTER TABLE public.supabase_parcels
    ADD COLUMN IF NOT EXISTS bridge_source_id text;

ALTER TABLE public.field_job_reviews
    ADD COLUMN IF NOT EXISTS bridge_source_id text;

COMMENT ON COLUMN public.field_jobs.bridge_source_id IS
    'Namespace identity of the iMAPS deployment that owns this row. Rows are keyed by (bridge_source_id, local_inspection_id); the local integer alone is NOT globally unique.';
COMMENT ON COLUMN public.supabase_zoning_applications.bridge_source_id IS
    'Namespace identity of the iMAPS deployment that owns this row. Rows are keyed by (bridge_source_id, local_application_id); the local integer alone is NOT globally unique.';
COMMENT ON COLUMN public.supabase_parcels.bridge_source_id IS
    'Namespace identity of the iMAPS deployment that owns this row. Rows are keyed by (bridge_source_id, local_parcel_id); the local integer alone is NOT globally unique.';
COMMENT ON COLUMN public.field_job_reviews.bridge_source_id IS
    'Namespace identity of the iMAPS deployment that owns this row. Rows are keyed by (bridge_source_id, technical_review_id); the local integer alone is NOT globally unique.';


-- =====================================================================
-- SECTION 3 - FROZEN CLASS-A UUID LISTS (proven current environment)
-- =====================================================================
-- Frozen at audit time so the apply cannot silently grow. Each id satisfied
-- every independent check listed in the LEGACY STRATEGY header.
--
--   field_jobs: 15 of 16. The 16th (a761b17a, local_inspection_id 37) is
--     deliberately EXCLUDED as UNRESOLVED: its current mapping does not match
--     this environment's local record for inspection 37 while its lifecycle
--     and activity_log prove Teshow. It stays NULL until the Teshow recovery
--     procedure repairs the mapping and then claims it.
--
--   supabase_zoning_applications: 21 of 24. Excluded: 7a87a08d
--     (local_application_id 138), 4afe8a3d (136) and b23e89d7 (137) - none of
--     those local applications exists in this database, so they are PROVEN
--     another environment's rows.
--
--   supabase_parcels: 19 of 20. Excluded: 2676c039 (local_parcel_id 70) -
--     PROVEN another environment's row.
--
-- Empty the matching list if the apply-time classification disagrees.
-- =====================================================================

-- field_jobs (15 rows, PROVEN current environment)
CREATE TEMP TABLE bridge_ns_field_jobs_a (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bridge_ns_field_jobs_a (id) VALUES
    ('c93d7416-4ba3-43fb-9fae-ddcf5630426f'),  -- local_inspection_id 11
    ('a07c1f51-938b-4130-b2b2-147f13061893'),  -- local_inspection_id 12
    ('215e3940-c826-403f-bbec-b28f244b78db'),  -- local_inspection_id 17
    ('c47de697-114f-4c7c-b3aa-9b3c1c635b8e'),  -- local_inspection_id 22
    ('646955fe-d904-4332-a500-72ed072a5a76'),  -- local_inspection_id 23
    ('3f2aaf65-ec58-46ca-b0c4-e15a483374c2'),  -- local_inspection_id 24
    ('adb0e751-540d-422f-8e61-a18e9e0b0b60'),  -- local_inspection_id 31
    ('21c5e69f-1d4d-4255-9a49-1602616067d7'),  -- local_inspection_id 32
    ('398327f9-0f16-49ba-abd6-8fa888475ec0'),  -- local_inspection_id 33
    ('b2b88ac5-b30e-4b2b-8fdf-70a70f941e59'),  -- local_inspection_id 34
    ('c7315702-a00f-476c-84f6-f1ba268686f7'),  -- local_inspection_id 35
    ('76d79ab8-e38e-4682-ada2-a67ac84dde00'),  -- local_inspection_id 36
    ('d5d68298-c1a9-475a-b5eb-77d7a6bcf5bb'),  -- local_inspection_id 39
    ('2f1391df-819f-4413-a2ae-1f6ffe2f1a99'),  -- local_inspection_id 40
    ('1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999')   -- local_inspection_id 41 (LOOP 10 FIXTURE)
;

-- supabase_zoning_applications (21 rows, PROVEN current environment)
CREATE TEMP TABLE bridge_ns_sza_a (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bridge_ns_sza_a (id) VALUES
    ('4d0e7d3a-1349-471a-8d38-9df53d0ef131'),  -- local_application_id 1
    ('e24b851b-5e81-4f9e-92da-f26fa45f97b0'),  -- local_application_id 50
    ('55e18802-bbc5-4a65-8147-1ef08782fcb9'),  -- local_application_id 54
    ('609923a7-fd5c-451a-b317-a353b07e5911'),  -- local_application_id 56
    ('44f7bcb5-fc42-42f0-aec1-975d2e2f6546'),  -- local_application_id 58
    ('ef0f4ad6-576e-45c3-91d0-340bf5ce7abb'),  -- local_application_id 104
    ('77db4a93-724b-4a3d-bc86-3547632f1f78'),  -- local_application_id 115
    ('8f189065-3eb6-4248-b428-e61e648cff30'),  -- local_application_id 116
    ('00876362-9935-4868-8201-c6a14b9f30a3'),  -- local_application_id 117
    ('fa0b2b13-c9d4-48cb-b1b9-211dc2caa3ed'),  -- local_application_id 118
    ('93726694-ba4d-4c20-87d1-30091d660fef'),  -- local_application_id 119
    ('ca978fe8-285a-4d4e-b8d0-34ed74c095b3'),  -- local_application_id 122
    ('ea4da582-638e-4fce-84a1-a1c49ab73a91'),  -- local_application_id 126
    ('972f17c5-6d54-43a0-92f8-98a8089c72b2'),  -- local_application_id 127
    ('c6310250-a9d1-4181-8ad9-f744b443c2a2'),  -- local_application_id 128
    ('96a8db4a-547f-456c-9fdb-db9dc2e47c31'),  -- local_application_id 131
    ('eaf432ea-8f26-4266-bf4b-ca88887ac470'),  -- local_application_id 132 (TESHOW / APP-2026-00026)
    ('36f8cc88-e22c-4d3d-8562-11e92b69b921'),  -- local_application_id 142
    ('4f2a5d18-86b5-4a87-8c6d-a9c443dbd4cf'),  -- local_application_id 143
    ('b9511828-2d93-46d2-abc9-4a7cbef037da'),  -- local_application_id 144
    ('b108513f-b1e8-4415-a088-b4107fc4374b')   -- local_application_id 145 (LOOP 10 FIXTURE)
;

-- supabase_parcels (19 rows, PROVEN current environment)
CREATE TEMP TABLE bridge_ns_parcels_a (id uuid PRIMARY KEY) ON COMMIT DROP;
INSERT INTO bridge_ns_parcels_a (id) VALUES
    ('224f3f96-5829-467b-ad3c-ad2707b0b991'),  -- local_parcel_id 21
    ('e9f59675-3a9e-4818-80d0-5e6c3fe99e2b'),  -- local_parcel_id 26
    ('37e1035f-3f9e-4503-ac02-47a40869be72'),  -- local_parcel_id 28
    ('e9f14279-95cd-4733-8d90-4fc0db25d64e'),  -- local_parcel_id 30
    ('9b752b80-91bb-4dd0-9b97-2c895dfdb30a'),  -- local_parcel_id 38
    ('2efb9cfd-5cfb-48e3-a92e-75f64ba09a91'),  -- local_parcel_id 49
    ('0f96ca38-01e7-4a65-8185-792752b99396'),  -- local_parcel_id 50
    ('462f7887-ceba-4024-b785-dad5ef16a4c3'),  -- local_parcel_id 51
    ('cca83051-248c-4814-b586-1436780a1af8'),  -- local_parcel_id 52
    ('b344f83c-c88d-4f6b-8c80-785f8d0d3613'),  -- local_parcel_id 53
    ('f8d99ac7-c74b-42ad-bc75-1fa6d55dc626'),  -- local_parcel_id 56
    ('9d340006-6b94-4586-897c-40d98385c7b0'),  -- local_parcel_id 60
    ('8cc6b976-fbe7-4eb6-9dfd-2a193e2a435b'),  -- local_parcel_id 61
    ('a57ddc72-434a-49db-9af5-1c3adcb73eba'),  -- local_parcel_id 62
    ('44e7f0b9-c861-4966-89ce-23f193893762'),  -- local_parcel_id 63
    ('69bfaafb-a5e2-4871-b9d0-830ea0599b3f'),  -- local_parcel_id 64 (TESHOW)
    ('ce341bfb-340d-425b-9c34-f08ab42b0a86'),  -- local_parcel_id 75
    ('1a9d064e-951c-4a9c-a42b-3be25be0a037'),  -- local_parcel_id 76
    ('cf974dc9-d219-4f9d-9776-40e237c12d34')   -- local_parcel_id 77 (LOOP 10 FIXTURE)
;


-- =====================================================================
-- SECTION 4 - PRE-UPDATE REPORTING (print, do not assert)
-- =====================================================================
-- Shows exactly what is about to be claimed and what is being left unclaimed.
-- Review this output when applying.
-- =====================================================================
\echo '--- field_jobs: what will be claimed ---'
SELECT j.local_inspection_id, j.id, j.status
FROM public.field_jobs j
JOIN bridge_ns_field_jobs_a a ON a.id = j.id
ORDER BY j.local_inspection_id;

\echo '--- field_jobs UNCLAIMED (detail) ---'
SELECT j.id, j.local_inspection_id, j.status, j.current_step, j.started_at,
       j.supabase_application_id, j.supabase_parcel_id, j.assigned_inspector_id
FROM public.field_jobs j
WHERE j.id NOT IN (SELECT id FROM bridge_ns_field_jobs_a)
ORDER BY j.local_inspection_id;

\echo '--- supabase_zoning_applications UNCLAIMED (detail) ---'
SELECT a.id, a.local_application_id, a.reference_number, a.applicant_name
FROM public.supabase_zoning_applications a
WHERE a.id NOT IN (SELECT id FROM bridge_ns_sza_a)
ORDER BY a.local_application_id;

\echo '--- supabase_parcels UNCLAIMED (detail) ---'
SELECT p.id, p.local_parcel_id, p.property_index_number, p.owner_name
FROM public.supabase_parcels p
WHERE p.id NOT IN (SELECT id FROM bridge_ns_parcels_a)
ORDER BY p.local_parcel_id;


-- =====================================================================
-- SECTION 5 - BACKFILL PROVEN ROWS ONLY
-- =====================================================================
-- Only the frozen Class-A UUID lists are touched. Every UPDATE joins on the
-- primary key, so it cannot match a row outside those lists even if the lists
-- were edited incorrectly.
--
-- THE field_jobs BACKFILL MUST PRESERVE updated_at.
--
-- `public.field_jobs` carries a BEFORE UPDATE trigger
-- `trg_field_jobs_set_updated_at` executing `public.set_updated_at_utc()`.
-- A plain `UPDATE ... SET bridge_source_id = ...` is an UPDATE, so that trigger
-- would fire and stamp a fresh `updated_at` onto all 15 Class-A rows. That
-- silently rewrites the observable write-time of every real inspection job,
-- including two COMPLETED rounds whose historical timestamps are evidence.
-- The intended change is `bridge_source_id` and nothing else.
--
-- The trigger is therefore DISABLED FOR THE DURATION OF THIS BACKFILL ONLY:
--   * the trigger function itself is never modified;
--   * the trigger is never dropped;
--   * `DISABLE TRIGGER USER` is never used - it would also suppress the
--     completed-lifecycle trigger that protects finished rounds;
--   * only `trg_field_jobs_set_updated_at` is named, by exact name;
--   * everything stays inside this script's single transaction, so a failure
--     rolls the re-enable back with everything else.
--
-- The trigger is asserted to exist and to be enabled BEFORE it is disabled, and
-- asserted enabled again AFTER. A missing, renamed or already-disabled trigger
-- RAISEs, which aborts the whole transaction BEFORE any row is touched: an
-- environment whose trigger is not the expected one must not be silently
-- stamped by this script.
--
-- NOTE ON THE CATALOG TYPE (live defect, fixed 2026-10-02): pg_trigger.tgenabled
-- is "char", not boolean. Selecting it straight into a boolean variable fails
-- with 22P02 invalid input syntax for type boolean: "O". Both guards therefore
-- select the boolean EXPRESSION (t.tgenabled = 'O') and test that.
--
-- The mirror tables (application, parcel, review) have no such trigger and need
-- no handling.
-- =====================================================================
DO $$
DECLARE
    v_source text;
    v_n      integer;
    v_tname  text;
    v_ten    boolean;
    -- The raw catalog "char" value, kept ONLY so the RAISE messages can report
    -- what was actually seen ('O', 'D', 'R', 'A') instead of a boolean.
    v_tgenabled "char";
    v_before integer;
    v_after  integer;
BEGIN
    SELECT requested_source_id INTO v_source FROM bridge_ns_request;

    -- ---------------------------------------------------------------------
    -- 5a. SNAPSHOT every value the field_jobs backfill must not disturb.
    --
    -- A BEFORE snapshot of the whole preservation set, so Section 5f can prove
    -- equality rather than assert it. Temporary table, ON COMMIT DROP, so it
    -- disappears with the transaction either way.
    -- ---------------------------------------------------------------------
    DROP TABLE IF EXISTS bridge_ns_field_jobs_before;
    CREATE TEMP TABLE bridge_ns_field_jobs_before ON COMMIT DROP AS
    SELECT j.id,
           j.updated_at,
           j.status,
           j.current_step,
           j.started_at,
           j.submitted_at,
           j.step_timestamps,
           j.assigned_inspector_id,
           j.supabase_application_id,
           j.supabase_parcel_id
      FROM public.field_jobs j
      JOIN bridge_ns_field_jobs_a a ON a.id = j.id;

    GET DIAGNOSTICS v_before = ROW_COUNT;
    RAISE NOTICE 'field_jobs: snapshotted % proven row(s) before the backfill', v_before;

    IF v_before = 0 THEN
        RAISE EXCEPTION 'ABORT: no field_jobs snapshot rows. The frozen Class-A list matched nothing, so the backfill would claim nothing.';
    END IF;

    -- ---------------------------------------------------------------------
    -- 5b. Assert the exact trigger exists and is enabled.
    --
    -- pg_trigger.tgenabled is PostgreSQL type "char" (one character), NOT a
    -- boolean: 'O' = origin/enabled, 'D' = disabled, 'R' = replica, 'A' = always.
    -- Assigning it straight into a boolean variable fails at runtime with
    --     22P02 invalid input syntax for type boolean: "O"
    -- which is what the first live apply attempt hit. The catalog value must be
    -- COMPARED, not cast: this selects the boolean EXPRESSION (tgenabled = 'O')
    -- into a boolean variable. Comparing later is then a plain boolean test.
    -- ---------------------------------------------------------------------
    SELECT t.tgname, (t.tgenabled = 'O')
      INTO v_tname, v_ten
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'field_jobs'
       AND t.tgname = 'trg_field_jobs_set_updated_at'
       AND NOT t.tgisinternal;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ABORT: trigger public.field_jobs.trg_field_jobs_set_updated_at is MISSING. Expected a BEFORE UPDATE trigger calling public.set_updated_at_utc(). Refusing to run: without that guard this script cannot reason about updated_at. Re-audit before applying.';
    END IF;

    IF v_ten IS NOT TRUE THEN
        RAISE EXCEPTION 'ABORT: trigger trg_field_jobs_set_updated_at is present but NOT enabled (tgenabled = ''%''). Refusing to run: the live trigger state differs from the audited one. Re-audit before applying.', v_tgenabled;
    END IF;

    RAISE NOTICE 'field_jobs: confirmed trigger % exists and is enabled', v_tname;

    -- ---------------------------------------------------------------------
    -- 5c. Disable THAT trigger only, by exact name.
    --
    -- Not `DISABLE TRIGGER USER`, which would also suppress
    -- trg_preserve_completed_field_job_lifecycle and every other user trigger,
    -- including the FieldSync-side guards on finished rounds.
    -- ---------------------------------------------------------------------
    ALTER TABLE public.field_jobs DISABLE TRIGGER trg_field_jobs_set_updated_at;

    -- ---------------------------------------------------------------------
    -- 5d. The frozen Class-A backfill. bridge_source_id ONLY.
    -- ---------------------------------------------------------------------
    UPDATE public.field_jobs j
       SET bridge_source_id = v_source
      FROM bridge_ns_field_jobs_a a
     WHERE j.id = a.id
       AND j.bridge_source_id IS DISTINCT FROM v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'field_jobs: % proven rows claimed', v_n;

    -- ---------------------------------------------------------------------
    -- 5e. Re-enable immediately, then assert it.
    -- ---------------------------------------------------------------------
    ALTER TABLE public.field_jobs ENABLE TRIGGER trg_field_jobs_set_updated_at;

    -- Same "char" comparison as 5b: tgenabled is never assigned into the boolean
    -- variable directly.
    SELECT t.tgenabled, (t.tgenabled = 'O') INTO v_tgenabled, v_ten
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'field_jobs'
       AND t.tgname = 'trg_field_jobs_set_updated_at'
       AND NOT t.tgisinternal;

    IF v_ten IS NOT TRUE THEN
        RAISE EXCEPTION 'ABORT: trigger trg_field_jobs_set_updated_at was not re-enabled (tgenabled = ''%''). Rolling back the whole transaction.', v_tgenabled;
    END IF;

    RAISE NOTICE 'field_jobs: trigger % re-enabled and verified', v_tname;

    -- ---------------------------------------------------------------------
    -- 5f. PROVE nothing but bridge_source_id moved.
    --
    -- IS DISTINCT FROM is used throughout so a NULL comparison is a real
    -- difference rather than an unknown that silently matches nothing.
    -- Any mismatch RAISEs and rolls the entire transaction back.
    -- ---------------------------------------------------------------------
    SELECT count(*) INTO v_after
      FROM bridge_ns_field_jobs_before b
      JOIN public.field_jobs j ON j.id = b.id
     WHERE j.bridge_source_id IS DISTINCT FROM v_source
        OR j.updated_at              IS DISTINCT FROM b.updated_at
        OR j.status                  IS DISTINCT FROM b.status
        OR j.current_step            IS DISTINCT FROM b.current_step
        OR j.started_at              IS DISTINCT FROM b.started_at
        OR j.submitted_at            IS DISTINCT FROM b.submitted_at
        OR j.step_timestamps         IS DISTINCT FROM b.step_timestamps
        OR j.assigned_inspector_id   IS DISTINCT FROM b.assigned_inspector_id
        OR j.supabase_application_id IS DISTINCT FROM b.supabase_application_id
        OR j.supabase_parcel_id      IS DISTINCT FROM b.supabase_parcel_id;

    IF v_after > 0 THEN
        RAISE EXCEPTION 'ABORT: % of % field_jobs row(s) failed the post-backfill preservation check. bridge_source_id must be set and EVERY other captured value byte-identical. Rolling back.', v_after, v_before;
    END IF;

    RAISE NOTICE 'field_jobs: % row(s) verified - bridge_source_id set, updated_at and all lifecycle/evidence columns unchanged', v_before;

    DROP TABLE IF EXISTS bridge_ns_field_jobs_before;

    -- ---------------------------------------------------------------------
    -- Mirror tables: no updated_at trigger exists on these, so they need no
    -- disable/re-enable handling and no snapshot.
    -- ---------------------------------------------------------------------
    UPDATE public.supabase_zoning_applications t
       SET bridge_source_id = v_source
      FROM bridge_ns_sza_a a
     WHERE t.id = a.id
       AND t.bridge_source_id IS DISTINCT FROM v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'supabase_zoning_applications: % proven rows claimed', v_n;

    UPDATE public.supabase_parcels t
       SET bridge_source_id = v_source
      FROM bridge_ns_parcels_a a
     WHERE t.id = a.id
       AND t.bridge_source_id IS DISTINCT FROM v_source;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'supabase_parcels: % proven rows claimed', v_n;

    -- field_job_reviews held 0 rows at audit time. It is still namespaced so
    -- the writer's composite ON CONFLICT target is honoured from the first
    -- write, and so a review can never be written unnamespaced later.
    -- Nothing is claimed: no reviewed round was proven for this environment.
    UPDATE public.field_job_reviews t
       SET bridge_source_id = v_source
     WHERE t.bridge_source_id IS NULL
       AND false;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    RAISE NOTICE 'field_job_reviews: % rows claimed (0 expected: table empty, no reviewed round proven)', v_n;
END
$$;


-- =====================================================================
-- =====================================================================
-- SECTION 6 - REPLACE BARE UNIQUE WITH COMPOSITE UNIQUE
-- =====================================================================
-- The old objects are found by CATALOG, not by a hard-coded name, because the
-- live names were never exported. Each is dropped only if it is exactly a
-- single-column unique index on the audited local-id column, and the
-- replacement is created in the same transaction.
--
-- Replacing a UNIQUE constraint does not touch the primary key, so the remote
-- uuid remains the canonical row id and every FK into these tables keeps
-- resolving to the same row.
--
-- OBJECT TYPE MUST BE DETECTED, NOT ASSUMED (live defect, fixed 2026-10-02).
-- The original version of this section dropped every survivor with
--     ALTER TABLE ... DROP CONSTRAINT IF EXISTS <name>
-- A UNIQUE can be EITHER a constraint-backed object (it appears in pg_constraint
-- and is dropped by DROP CONSTRAINT) OR a STANDALONE unique index (it is
-- absent from pg_constraint and must be dropped by DROP INDEX).
-- DROP CONSTRAINT IF EXISTS against a standalone index silently does NOTHING -
-- IF EXISTS suppresses the error. On the live project that left
--     field_job_reviews_technical_review_id_key  UNIQUE (technical_review_id)
-- in place while the composite was added next to it. The composite then cannot
-- admit a second row for the same technical_review_id, so the table stayed
-- collision-prone: the exact defect this script exists to remove.
--
-- Each drop below therefore reads pg_constraint for the object name and issues
-- DROP CONSTRAINT or DROP INDEX accordingly, then RAISEs if the object is
-- still present. A survivor that could not be removed is a hard failure, not a
-- notice.
-- =====================================================================

-- field_jobs: drop UNIQUE (local_inspection_id)
DO $$
DECLARE
    v_idx   text;
    v_table text := 'field_jobs';
    v_col   text := 'local_inspection_id';
    v_is_constraint boolean;
    v_still_there  integer;
BEGIN
    FOR v_idx, v_is_constraint IN
        SELECT c.relname,
               (k.oid IS NOT NULL)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = v_col
        LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname
        WHERE n.nspname = 'public' AND t.relname = v_table
          AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
          AND NOT i.indisprimary
    LOOP
        IF v_is_constraint THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE CONSTRAINT %', v_table, v_idx;
        ELSE
            EXECUTE format('DROP INDEX public.%I', v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE INDEX %', v_table, v_idx;
        END IF;

        -- Prove it is gone. A silent no-op here is precisely the defect that
        -- shipped, so it must be a hard failure rather than a notice.
        SELECT count(*) INTO v_still_there
        FROM pg_class c2
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'public' AND c2.relname = v_idx;

        IF v_still_there > 0 THEN
            RAISE EXCEPTION 'ABORT: bare unique object % on public.% still exists after the drop. The namespacing would be incomplete.', v_idx, v_table;
        END IF;
    END LOOP;
END
$$;

ALTER TABLE public.field_jobs
    ADD CONSTRAINT field_jobs_bridge_source_id_local_inspection_id_key
    UNIQUE (bridge_source_id, local_inspection_id);

-- supabase_zoning_applications: drop UNIQUE (local_application_id)
DO $$
DECLARE
    v_idx   text;
    v_table text := 'supabase_zoning_applications';
    v_col   text := 'local_application_id';
    v_is_constraint boolean;
    v_still_there  integer;
BEGIN
    FOR v_idx, v_is_constraint IN
        SELECT c.relname,
               (k.oid IS NOT NULL)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = v_col
        LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname
        WHERE n.nspname = 'public' AND t.relname = v_table
          AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
          AND NOT i.indisprimary
    LOOP
        IF v_is_constraint THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE CONSTRAINT %', v_table, v_idx;
        ELSE
            EXECUTE format('DROP INDEX public.%I', v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE INDEX %', v_table, v_idx;
        END IF;

        SELECT count(*) INTO v_still_there
        FROM pg_class c2
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'public' AND c2.relname = v_idx;

        IF v_still_there > 0 THEN
            RAISE EXCEPTION 'ABORT: bare unique object % on public.% still exists after the drop. The namespacing would be incomplete.', v_idx, v_table;
        END IF;
    END LOOP;
END
$$;

-- Name is deliberately 58 characters: PostgreSQL truncates identifiers at 63,
-- and a silently truncated constraint name would make the Section 8 verification
-- below and the documented rollback refer to an object that does not exist.
ALTER TABLE public.supabase_zoning_applications
    ADD CONSTRAINT supabase_zoning_applications_bridge_local_application_id_key
    UNIQUE (bridge_source_id, local_application_id);

-- supabase_parcels: drop UNIQUE (local_parcel_id)
DO $$
DECLARE
    v_idx   text;
    v_table text := 'supabase_parcels';
    v_col   text := 'local_parcel_id';
    v_is_constraint boolean;
    v_still_there  integer;
BEGIN
    FOR v_idx, v_is_constraint IN
        SELECT c.relname,
               (k.oid IS NOT NULL)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = v_col
        LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname
        WHERE n.nspname = 'public' AND t.relname = v_table
          AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
          AND NOT i.indisprimary
    LOOP
        IF v_is_constraint THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE CONSTRAINT %', v_table, v_idx;
        ELSE
            EXECUTE format('DROP INDEX public.%I', v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE INDEX %', v_table, v_idx;
        END IF;

        SELECT count(*) INTO v_still_there
        FROM pg_class c2
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'public' AND c2.relname = v_idx;

        IF v_still_there > 0 THEN
            RAISE EXCEPTION 'ABORT: bare unique object % on public.% still exists after the drop. The namespacing would be incomplete.', v_idx, v_table;
        END IF;
    END LOOP;
END
$$;

ALTER TABLE public.supabase_parcels
    ADD CONSTRAINT supabase_parcels_bridge_source_id_local_parcel_id_key
    UNIQUE (bridge_source_id, local_parcel_id);

-- field_job_reviews: drop UNIQUE (technical_review_id)
-- field_job_reviews: drop UNIQUE (technical_review_id)
-- THIS IS THE TABLE WHERE THE LIVE DEFECT OCCURRED. Its bare unique was a
-- STANDALONE INDEX (absent from pg_constraint), so `DROP CONSTRAINT IF EXISTS`
-- silently did nothing and the survivor survived next to the new composite.
DO $$
DECLARE
    v_idx   text;
    v_table text := 'field_job_reviews';
    v_col   text := 'technical_review_id';
    v_is_constraint boolean;
    v_still_there  integer;
BEGIN
    FOR v_idx, v_is_constraint IN
        SELECT c.relname,
               (k.oid IS NOT NULL)
        FROM pg_index i
        JOIN pg_class c ON c.oid = i.indexrelid
        JOIN pg_class t ON t.oid = i.indrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = v_col
        LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname
        WHERE n.nspname = 'public' AND t.relname = v_table
          AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
          AND NOT i.indisprimary
    LOOP
        IF v_is_constraint THEN
            EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table, v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE CONSTRAINT %', v_table, v_idx;
        ELSE
            EXECUTE format('DROP INDEX public.%I', v_idx);
            RAISE NOTICE '%: dropped bare UNIQUE INDEX %', v_table, v_idx;
        END IF;

        SELECT count(*) INTO v_still_there
        FROM pg_class c2
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'public' AND c2.relname = v_idx;

        IF v_still_there > 0 THEN
            RAISE EXCEPTION 'ABORT: bare unique object % on public.% still exists after the drop. The namespacing would be incomplete.', v_idx, v_table;
        END IF;
    END LOOP;
END
$$;

ALTER TABLE public.field_job_reviews
    ADD CONSTRAINT field_job_reviews_bridge_source_id_technical_review_id_key
    UNIQUE (bridge_source_id, technical_review_id);


-- =====================================================================
-- SECTION 7 - SUPPORTING INDEXES FOR EXISTING READERS
-- =====================================================================
-- The composite UNIQUE above already serves
--   field_jobs ?bridge_source_id=eq.X&local_inspection_id=eq.N
-- as a leftmost-prefix equality lookup, and likewise for the two mirror tables.
--
-- ONE INDEX IS KEPT, because one PROVEN iMAPS reader needs it:
--   * PullCompletedInspections(): bridge_source_id + status='completed'.
--     status is not the leading part of the composite UNIQUE, so this lookup has
--     no covering index.
--
-- THREE SPECULATIVE INDEXES ARE DELIBERATELY NOT CREATED. They were proposed
-- before the readers were audited, and no proven iMAPS reader needs them:
--   * (bridge_source_id, assigned_inspector_id) - FieldSync's inspector query
--     filters assigned_inspector_id = auth.uid() and is UNCHANGED by this work.
--     It does not scope that read by bridge_source_id at all, so an index leading
--     with bridge_source_id would not have served it.
--   * (bridge_source_id, reference_number) - no reader identifies or correlates
--     an application mirror row by reference_number. reference_number is a
--     BUSINESS identifier, not bridge identity, and it is deliberately NOT given
--     a UNIQUE constraint for that reason.
--   * (bridge_source_id, property_index_number) - same: property_index_number is
--     cadastral display data, not a bridge identity component.
--
-- Creating an index that no query uses costs write amplification on every mirror
-- write and implies a correlation that does not exist. They are recorded here
-- rather than silently dropped, and no EXISTING live index is removed by this
-- artifact.
-- =====================================================================
CREATE INDEX IF NOT EXISTS field_jobs_bridge_source_id_status_index
    ON public.field_jobs (bridge_source_id, status);


-- =====================================================================
-- SECTION 8 - POST-UPDATE VERIFICATION (printed, asserted where it matters)
-- =====================================================================
DO $$
DECLARE
    v_source text;
    v_bad    integer;
BEGIN
    SELECT requested_source_id INTO v_source FROM bridge_ns_request;

    -- No row may carry a foreign namespace. Everything not claimed stays NULL.
    SELECT count(*) INTO v_bad
    FROM public.field_jobs
    WHERE bridge_source_id IS NOT NULL AND bridge_source_id <> v_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: % field_jobs rows carry a foreign bridge_source_id', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.supabase_zoning_applications
    WHERE bridge_source_id IS NOT NULL AND bridge_source_id <> v_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: % supabase_zoning_applications rows carry a foreign bridge_source_id', v_bad;
    END IF;

    SELECT count(*) INTO v_bad
    FROM public.supabase_parcels
    WHERE bridge_source_id IS NOT NULL AND bridge_source_id <> v_source;
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: % supabase_parcels rows carry a foreign bridge_source_id', v_bad;
    END IF;

    -- Composite uniqueness must now be in force on every target table.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'field_jobs_bridge_source_id_local_inspection_id_key'
          AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: composite UNIQUE on field_jobs is absent';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'supabase_zoning_applications_bridge_local_application_id_key'
          AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: composite UNIQUE on supabase_zoning_applications is absent';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'supabase_parcels_bridge_source_id_local_parcel_id_key'
          AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: composite UNIQUE on supabase_parcels is absent';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'field_job_reviews_bridge_source_id_technical_review_id_key'
          AND contype = 'u'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: composite UNIQUE on field_job_reviews is absent';
    END IF;

    -- Remote UUID primary keys must still exist and be untouched.
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_jobs'::regclass AND contype = 'p'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: field_jobs lost its primary key';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.supabase_parcels'::regclass AND contype = 'p'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: supabase_parcels lost its primary key';
    END IF;

    -- Foreign keys must still resolve (photos and reviews point at field_jobs).
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'public.field_job_photos'::regclass AND contype = 'f'
    ) THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: field_job_photos lost its foreign key; relationships were not preserved';
    END IF;

    -- Row counts must be exactly what the audit recorded: nothing deleted,
    -- nothing recreated.
    IF (SELECT count(*) FROM public.field_jobs) <> 16 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: field_jobs row count changed; this script must never delete or recreate rows';
    END IF;

    IF (SELECT count(*) FROM public.supabase_zoning_applications) <> 24 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: supabase_zoning_applications row count changed';
    END IF;

    IF (SELECT count(*) FROM public.supabase_parcels) <> 20 THEN
        RAISE EXCEPTION 'VERIFICATION FAILED: supabase_parcels row count changed';
    END IF;

    RAISE NOTICE 'verification passed: no foreign namespace present, composite UNIQUE installed, primary key and foreign keys intact, row counts unchanged';
END
$$;

\echo '--- post-apply state ---'
SELECT 'field_jobs' AS table_name,
       count(*) AS total,
       count(bridge_source_id) AS claimed,
       count(*) - count(bridge_source_id) AS unclaimed
FROM public.field_jobs
UNION ALL
SELECT 'supabase_zoning_applications', count(*), count(bridge_source_id), count(*) - count(bridge_source_id)
FROM public.supabase_zoning_applications
UNION ALL
SELECT 'supabase_parcels', count(*), count(bridge_source_id), count(*) - count(bridge_source_id)
FROM public.supabase_parcels
UNION ALL
SELECT 'field_job_reviews', count(*), count(bridge_source_id), count(*) - count(bridge_source_id)
FROM public.field_job_reviews;

\echo '--- coexistence proof: one row per (namespace, local_inspection_id) ---'
SELECT local_inspection_id,
       count(*) AS rows_sharing_this_local_id,
       coalesce(array_agg(coalesce(bridge_source_id, '(unclaimed)')), '{}') AS namespaces
FROM public.field_jobs
GROUP BY local_inspection_id
ORDER BY local_inspection_id;

COMMIT;

\echo ''
\echo 'APPLIED. Phase 1 only: bridge_source_id is NULLABLE.'
\echo 'Remaining, each needing its own approval:'
\echo '  - Teshow job a761b17a-3fad-44ed-b451-7f0af0e41183 mapping repair, then claim.'
\echo '  - Coordination with the other environment for its unclaimed rows.'
\echo '  - Phase 2: SET NOT NULL on bridge_source_id once every environment is deployed.'
-- =====================================================================
-- ROLLBACK / RECOVERY
-- =====================================================================
-- To revert this Phase 1 apply:
--   BEGIN;
--     ALTER TABLE public.field_jobs DROP CONSTRAINT IF EXISTS field_jobs_bridge_source_id_local_inspection_id_key;
--     ALTER TABLE public.supabase_zoning_applications DROP CONSTRAINT IF EXISTS supabase_zoning_applications_bridge_local_application_id_key;
--     ALTER TABLE public.supabase_parcels DROP CONSTRAINT IF EXISTS supabase_parcels_bridge_source_id_local_parcel_id_key;
--     ALTER TABLE public.field_job_reviews DROP CONSTRAINT IF EXISTS field_job_reviews_bridge_source_id_technical_review_id_key;
--     DROP INDEX IF EXISTS field_jobs_bridge_source_id_status_index;
--     ALTER TABLE public.field_jobs DROP COLUMN IF EXISTS bridge_source_id;
--     ALTER TABLE public.supabase_zoning_applications DROP COLUMN IF EXISTS bridge_source_id;
--     ALTER TABLE public.supabase_parcels DROP COLUMN IF EXISTS bridge_source_id;
--     ALTER TABLE public.field_job_reviews DROP COLUMN IF EXISTS bridge_source_id;
--     -- then restore the four original bare UNIQUE constraints:
--     --   field_jobs                   UNIQUE (local_inspection_id)
--     --   supabase_zoning_applications UNIQUE (local_application_id)
--     --   supabase_parcels             UNIQUE (local_parcel_id)
--     --   field_job_reviews            UNIQUE (technical_review_id)
--   COMMIT;
--
-- Reverting restores the COLLISION VULNERABILITY. It is an emergency measure
-- only, and every already-deployed namespaced writer must be reverted at the
-- same time, or its ON CONFLICT targets will fail with 42P10.
--
-- Take a `pg_dump` before applying, as with every prior remote change.
-- =====================================================================
