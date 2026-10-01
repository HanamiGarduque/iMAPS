-- =====================================================================
-- BRIDGE SOURCE NAMESPACE - DRY RUN (throwaway, never the real bridge)
-- =====================================================================
--
-- name: 2026_10_01_bridge_source_namespace_dryrun.sql
-- target: a THROWAWAY schema in a scratch PostgreSQL database
-- status: validation harness. Touches NOTHING in `public`, nothing in the
--         real Supabase project, and ROLLBACKS at the end.
--
-- WHAT IT PROVES
--   1. The composite constraint is creatable and is enforced.
--   2. (source_a, 37) and (source_b, 37) COEXIST as two distinct rows.
--      This is the exact scenario the incident proved impossible.
--   3. (source_a, 37) twice is REJECTED, so a retry still converges.
--   4. An OLD writer's `ON CONFLICT (local_inspection_id)` FAILS with 42P10
--      rather than silently overwriting another environment. This is the
--      old-deployment safety claim, proven rather than asserted.
--   5. A source-B write CANNOT touch the source-A mapping, because the
--      conflict target resolves only within source B's namespace.
--   6. An UNCLAIMED row (bridge_source_id IS NULL) cannot collide with any
--      namespace, so unresolved legacy rows are safe to leave unclaimed.
--   7. Remote UUID primary keys and the photos FK survive the constraint swap.
--   8. The same coexistence/isolation behaviour for the application mirror
--      and the parcel mirror.
--
-- HOW TO RUN
--   Create a scratch database first (NEVER the iMAPS database):
--     createdb bridge_ns_dryrun
--     psql -d bridge_ns_dryrun -v ON_ERROR_STOP=1 \
--          -f database/sql/2026_10_01_bridge_source_namespace_dryrun.sql
--
--   The script creates schema `bridge_ns_dryrun`, runs everything inside it,
--   and drops it before finishing. It never touches `public`.
-- =====================================================================

\set ON_ERROR_STOP on
\echo '=== BRIDGE SOURCE NAMESPACE DRY RUN ==='

DROP SCHEMA IF EXISTS bridge_ns_dryrun CASCADE;
CREATE SCHEMA bridge_ns_dryrun;
SET search_path TO bridge_ns_dryrun, public;


-- =====================================================================
-- PRECONDITION SCHEMA (mirrors the audited remote shape)
-- =====================================================================
CREATE TABLE field_jobs (
    id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_inspection_id    integer NOT NULL,
    supabase_application_id uuid,
    supabase_parcel_id      uuid,
    status                 text,
    scheduled_date         date,
    deadline_date          date,
    assigned_inspector_id  uuid,
    assignment_instructions text,
    -- FieldSync-owned lifecycle. The writer must never touch these.
    current_step           integer NOT NULL DEFAULT 0,
    started_at             timestamptz,
    step_timestamps        jsonb,
    activity_log_note      text,
    submitted_at           timestamptz,
    -- present on the real table and stamped by trg_field_jobs_set_updated_at
    created_at             timestamptz,
    updated_at             timestamptz,
    UNIQUE (local_inspection_id)          -- THE DEFECT, reproduced exactly
);

CREATE TABLE field_job_photos (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    field_job_id uuid NOT NULL REFERENCES field_jobs(id) ON DELETE CASCADE,
    photo_url    text NOT NULL
);

CREATE TABLE field_job_reviews (
    id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    field_job_id              uuid REFERENCES field_jobs(id) ON DELETE CASCADE,
    technical_review_id       bigint NOT NULL,
    reviewed_site_inspection_id integer,
    decision                  text,
    UNIQUE (technical_review_id)   -- also a bare local integer
);

CREATE TABLE supabase_zoning_applications (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_application_id integer NOT NULL,
    reference_number     text,
    applicant_name       text,
    UNIQUE (local_application_id)   -- THE DEFECT
);

CREATE TABLE supabase_parcels (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    local_parcel_id         integer NOT NULL,
    supabase_application_id uuid REFERENCES supabase_zoning_applications(id),
    property_index_number   text,
    owner_name              text,
    UNIQUE (local_parcel_id)        -- THE DEFECT
);

\echo ''
\echo '--- 0. THE DEFECT IS REPRODUCIBLE BEFORE THE FIX ---'
\echo 'Expected: the second INSERT of local_inspection_id = 37 is REJECTED.'
\echo '(This is why the two environments collided onto one row.)'

INSERT INTO field_jobs (local_inspection_id, status, current_step)
VALUES (37, 'in_progress', 1);

DO $$
BEGIN
    BEGIN
        INSERT INTO field_jobs (local_inspection_id, status)
        VALUES (37, 'assigned');
        RAISE EXCEPTION 'UNEXPECTED: pre-fix duplicate insert succeeded; the dry run is not reproducing the audited schema';
    EXCEPTION
        WHEN unique_violation THEN
            RAISE NOTICE 'confirmed: bare UNIQUE(local_inspection_id) rejected the second writer - this is the collision';
    END;
END
$$;

DELETE FROM field_jobs WHERE local_inspection_id = 37;


-- =====================================================================
-- APPLY THE SAME SHAPE AS THE FORWARD SQL
-- =====================================================================
ALTER TABLE field_jobs                    ADD COLUMN bridge_source_id text;
ALTER TABLE supabase_zoning_applications  ADD COLUMN bridge_source_id text;
ALTER TABLE supabase_parcels              ADD COLUMN bridge_source_id text;
ALTER TABLE field_job_reviews             ADD COLUMN bridge_source_id text;

-- Drop the bare constraints by catalog, exactly as the forward SQL does.
DO $$
DECLARE v text;
BEGIN
    FOR v IN SELECT c.relname FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
              JOIN pg_class t ON t.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'local_inspection_id'
              WHERE n.nspname = 'bridge_ns_dryrun' AND t.relname = 'field_jobs'
                AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
    LOOP
        EXECUTE format('ALTER TABLE field_jobs DROP CONSTRAINT IF EXISTS %I', v);
    END LOOP;

    FOR v IN SELECT c.relname FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
              JOIN pg_class t ON t.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'local_application_id'
              WHERE n.nspname = 'bridge_ns_dryrun' AND t.relname = 'supabase_zoning_applications'
                AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
    LOOP
        EXECUTE format('ALTER TABLE supabase_zoning_applications DROP CONSTRAINT IF EXISTS %I', v);
    END LOOP;

    FOR v IN SELECT c.relname FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
              JOIN pg_class t ON t.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'local_parcel_id'
              WHERE n.nspname = 'bridge_ns_dryrun' AND t.relname = 'supabase_parcels'
                AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
    LOOP
        EXECUTE format('ALTER TABLE supabase_parcels DROP CONSTRAINT IF EXISTS %I', v);
    END LOOP;

    FOR v IN SELECT c.relname FROM pg_index i
              JOIN pg_class c ON c.oid = i.indexrelid
              JOIN pg_class t ON t.oid = i.indrelid
              JOIN pg_namespace n ON n.oid = t.relnamespace
              JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'technical_review_id'
              WHERE n.nspname = 'bridge_ns_dryrun' AND t.relname = 'field_job_reviews'
                AND i.indisunique AND i.indnatts = 1 AND i.indkey[0] = a.attnum
    LOOP
        EXECUTE format('ALTER TABLE field_job_reviews DROP CONSTRAINT IF EXISTS %I', v);
    END LOOP;
END
$$;

ALTER TABLE field_jobs
    ADD CONSTRAINT field_jobs_bridge_source_id_local_inspection_id_key
    UNIQUE (bridge_source_id, local_inspection_id);
ALTER TABLE supabase_zoning_applications
    ADD CONSTRAINT supabase_zoning_applications_bridge_local_application_id_key
    UNIQUE (bridge_source_id, local_application_id);
ALTER TABLE supabase_parcels
    ADD CONSTRAINT supabase_parcels_bridge_source_id_local_parcel_id_key
    UNIQUE (bridge_source_id, local_parcel_id);
ALTER TABLE field_job_reviews
    ADD CONSTRAINT field_job_reviews_bridge_source_id_technical_review_id_key
    UNIQUE (bridge_source_id, technical_review_id);

-- Only the index a PROVEN iMAPS reader needs. PullCompletedInspections filters
-- bridge_source_id + status, and status is not the leading column of the
-- composite UNIQUE above.
--
-- (bridge_source_id, assigned_inspector_id) is deliberately absent: FieldSync's
-- inspector query filters assigned_inspector_id = auth.uid() and is not a
-- bridge_source_id-scoped reader, so the index would not have served it. No
-- reference_number or property_index_number index is created either: no proven
-- reader identifies a mirror row by those columns, which are business display
-- data rather than bridge identity.
CREATE INDEX field_jobs_bridge_source_id_status_index
    ON field_jobs (bridge_source_id, status);


-- =====================================================================
-- SETUP - REALISTIC BEFORE UPDATE updated_at TRIGGERS
-- =====================================================================
-- The live bridge's job table has a BEFORE UPDATE trigger that stamps updated_at.
-- (Named here as "the job table" rather than with its real schema-qualified name:
-- this script asserts it never mentions the real bridge schema, and a comment
-- carrying that name would make that assertion fail for no real reason.)
-- The namespace backfill must not stamp it, so the dry run reproduces BOTH
-- triggers that exist live:
--
--   trg_field_jobs_set_updated_at           BEFORE UPDATE -> set_updated_at_utc()
--   trg_preserve_completed_field_job_lifecycle  BEFORE UPDATE, guards completed rows
--
-- The second one exists so the proof can also demonstrate that disabling the
-- timestamp trigger by EXACT NAME leaves the lifecycle guard active.
-- =====================================================================
CREATE OR REPLACE FUNCTION set_updated_at_utc() RETURNS trigger AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION protect_completed_lifecycle() RETURNS trigger AS $$
BEGIN
    IF OLD.status = 'completed' AND NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'completed lifecycle is immutable';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_field_jobs_set_updated_at
    BEFORE UPDATE ON field_jobs
    FOR EACH ROW EXECUTE FUNCTION set_updated_at_utc();

CREATE TRIGGER trg_preserve_completed_field_job_lifecycle
    BEFORE UPDATE ON field_jobs
    FOR EACH ROW EXECUTE FUNCTION protect_completed_lifecycle();


-- =====================================================================
-- TEST 1 - TWO ENVIRONMENTS, SAME LOCAL ID, TWO DISTINCT REMOTE JOBS
-- =====================================================================
\echo ''
\echo '=== TEST 1: (source_a, 37) and (source_b, 37) COEXIST ==='

-- source_a's row is seeded WITH FieldSync-owned lifecycle, mirroring the real
-- Teshow Round 2 shape: in_progress, step 1 done, started Sep 26.
INSERT INTO field_jobs (bridge_source_id, local_inspection_id, supabase_application_id,
                        supabase_parcel_id, assigned_inspector_id,
                        scheduled_date, deadline_date, assignment_instructions,
                        status, current_step, started_at, step_timestamps)
VALUES ('source_a', 37, '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-00000000aaaa', 'aaaaaaaa-0000-0000-0000-000000000001',
        '2026-09-23', '2026-10-23', 'Loop 4 Round 2',
        'in_progress', 1, '2026-09-26T18:05:46.831173+00:00',
        '{"1": "2026-09-26T17:50:46.146511Z"}');

INSERT INTO field_jobs (bridge_source_id, local_inspection_id, supabase_application_id,
                        assigned_inspector_id, status, current_step)
VALUES ('source_b', 37, '22222222-2222-2222-2222-222222222222',
        'bbbbbbbb-0000-0000-0000-000000000002', 'assigned', 0);

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM field_jobs WHERE local_inspection_id = 37;
    IF n <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 distinct remote jobs for local_inspection_id 37, found %', n;
    END IF;
    RAISE NOTICE 'PASS: two environments produced TWO distinct field_jobs rows for local_inspection_id 37';
END
$$;

SELECT bridge_source_id, local_inspection_id, supabase_application_id,
       assigned_inspector_id, status, current_step
FROM field_jobs WHERE local_inspection_id = 37 ORDER BY bridge_source_id;


-- =====================================================================
-- TEST 2 - SAME SOURCE, SAME LOCAL ID, RETRY CONVERGES
-- =====================================================================
\echo ''
\echo '=== TEST 2: source_a retry updates ONLY the source_a row ==='

INSERT INTO field_jobs (bridge_source_id, local_inspection_id, supabase_application_id,
                        supabase_parcel_id, scheduled_date, deadline_date,
                        assigned_inspector_id, assignment_instructions,
                        status, current_step, started_at, step_timestamps)
VALUES ('source_a', 37, '11111111-1111-1111-1111-111111111111',
        'aaaaaaaa-0000-0000-0000-00000000aaaa', '2026-09-23', '2026-10-23',
        'aaaaaaaa-0000-0000-0000-000000000001', 'Loop 4 Round 2',
        'in_progress', 1, '2026-09-26T18:05:46.831173+00:00',
        '{"1": "2026-09-26T17:50:46.146511Z"}')
ON CONFLICT (bridge_source_id, local_inspection_id) DO UPDATE
   SET supabase_application_id = EXCLUDED.supabase_application_id,
       supabase_parcel_id      = EXCLUDED.supabase_parcel_id,
       scheduled_date          = EXCLUDED.scheduled_date,
       deadline_date           = EXCLUDED.deadline_date,
       assigned_inspector_id   = EXCLUDED.assigned_inspector_id,
       assignment_instructions = EXCLUDED.assignment_instructions;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM field_jobs
    WHERE local_inspection_id = 37 AND bridge_source_id = 'source_a'
      AND supabase_parcel_id = 'aaaaaaaa-0000-0000-0000-00000000aaaa'::uuid
      AND scheduled_date = DATE '2026-09-23'
      AND assignment_instructions = 'Loop 4 Round 2'
      -- FieldSync-owned lifecycle must be UNTOUCHED by the retry:
      AND current_step = 1
      AND started_at = '2026-09-26T18:05:46.831173+00:00'::timestamptz
      AND step_timestamps = '{"1": "2026-09-26T17:50:46.146511Z"}'::jsonb;
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL: the source_a retry did not converge on its own row';
    END IF;
    RAISE NOTICE 'PASS: retry converged on the source_a row and left FieldSync lifecycle untouched';
END
$$;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM field_jobs
    WHERE bridge_source_id = 'source_b' AND local_inspection_id = 37
      AND supabase_application_id = '22222222-2222-2222-2222-222222222222'::uuid
      AND status = 'assigned' AND current_step = 0;
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL: the source_a retry modified the source_b row';
    END IF;
    RAISE NOTICE 'PASS: the source_a retry did NOT touch the source_b row';
END
$$;


-- =====================================================================
-- TEST 3 - SOURCE B CANNOT OVERWRITE SOURCE A
-- =====================================================================
\echo ''
\echo '=== TEST 3: source_b write cannot overwrite the source_a mapping ==='

-- This is the incident, replayed: source_b pushes local_inspection_id 37.
INSERT INTO field_jobs (bridge_source_id, local_inspection_id, supabase_application_id,
                        supabase_parcel_id, assigned_inspector_id,
                        scheduled_date, deadline_date, assignment_instructions)
VALUES ('source_b', 37, '33333333-3333-3333-3333-333333333333',
        'bbbbbbbb-0000-0000-0000-00000000bbbb', 'bbbbbbbb-0000-0000-0000-000000000002',
        '2026-10-01', '2026-10-03', 'hijack attempt')
ON CONFLICT (bridge_source_id, local_inspection_id) DO UPDATE
   SET supabase_application_id = EXCLUDED.supabase_application_id,
       supabase_parcel_id      = EXCLUDED.supabase_parcel_id,
       assigned_inspector_id   = EXCLUDED.assigned_inspector_id,
       scheduled_date          = EXCLUDED.scheduled_date,
       deadline_date           = EXCLUDED.deadline_date,
       assignment_instructions = EXCLUDED.assignment_instructions;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM field_jobs
    WHERE bridge_source_id = 'source_a' AND local_inspection_id = 37
      AND supabase_application_id = '11111111-1111-1111-1111-111111111111'::uuid
      AND supabase_parcel_id      = 'aaaaaaaa-0000-0000-0000-00000000aaaa'::uuid
      AND assigned_inspector_id   = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid
      AND scheduled_date          = DATE '2026-09-23'
      AND deadline_date           = DATE '2026-10-23'
      AND assignment_instructions = 'Loop 4 Round 2'
      AND current_step = 1
      AND started_at = '2026-09-26T18:05:46.831173+00:00'::timestamptz;
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL: source_b overwrote the source_a mapping (this is the incident)';
    END IF;
    RAISE NOTICE 'PASS: source_b write created/updated ONLY its own row; the source_a mapping is intact';
END
$$;

SELECT bridge_source_id, local_inspection_id, supabase_application_id,
       supabase_parcel_id, assigned_inspector_id, scheduled_date,
       assignment_instructions, status, current_step, started_at
FROM field_jobs WHERE local_inspection_id = 37 ORDER BY bridge_source_id;


-- =====================================================================
-- TEST 4 - OLD WRITER FAILS INSTEAD OF CORRUPTING
-- =====================================================================
\echo ''
\echo '=== TEST 4: an OLD deployment using ON CONFLICT(local_inspection_id) FAILS ==='
\echo 'Expected: SQLSTATE 42P10. The old writer stops; it cannot corrupt a namespace.'

DO $$
BEGIN
    BEGIN
        INSERT INTO field_jobs (local_inspection_id, supabase_application_id)
        VALUES (37, '44444444-4444-4444-4444-444444444444')
        ON CONFLICT (local_inspection_id) DO UPDATE
           SET supabase_application_id = EXCLUDED.supabase_application_id;
        RAISE EXCEPTION 'FAIL: an old bare-local-id writer still succeeded; the collision is still possible';
    EXCEPTION
        -- Matched by SQLSTATE, not by condition name, because the 42P10
        -- condition name is not `feature_not_supported`. Matching on the
        -- SQLSTATE is what PostgREST returns and what the writer's
        -- classifier keys on, so this is also the honest assertion.
        WHEN SQLSTATE '42P10' THEN
            RAISE NOTICE 'PASS: old writer rejected with SQLSTATE 42P10 - it FAILS rather than corrupting';
        WHEN OTHERS THEN
            RAISE EXCEPTION 'FAIL: old writer failed with an unexpected SQLSTATE, not 42P10';
    END;
END
$$;


-- =====================================================================
-- TEST 5 - RETRY IDEMPOTENCE (repeat the same write, still one row)
-- =====================================================================
\echo ''
\echo '=== TEST 5: same source + same local id repeated is still ONE row ==='
DO $$
DECLARE n int; i int;
BEGIN
    FOR i IN 1..3 LOOP
        INSERT INTO field_jobs (bridge_source_id, local_inspection_id, supabase_application_id)
        VALUES ('source_a', 37, '11111111-1111-1111-1111-111111111111')
        ON CONFLICT (bridge_source_id, local_inspection_id) DO UPDATE
           SET supabase_application_id = EXCLUDED.supabase_application_id;
    END LOOP;

    SELECT count(*) INTO n FROM field_jobs WHERE bridge_source_id = 'source_a';
    IF n <> 1 THEN
        RAISE EXCEPTION 'FAIL: repeated identical writes produced % rows for source_a, expected 1', n;
    END IF;
    RAISE NOTICE 'PASS: 3 additional identical writes still produced exactly 1 source_a row';
END
$$;


-- =====================================================================
-- TEST 6 - UNCLAIMED (NULL) LEGACY ROWS ARE SAFE
-- =====================================================================
\echo ''
\echo '=== TEST 6: an UNCLAIMED (NULL) legacy row cannot collide with anyone ==='

-- The unresolved Teshow-shaped row: left unclaimed by the migration.
INSERT INTO field_jobs (local_inspection_id, status, current_step, started_at)
VALUES (37, 'in_progress', 1, '2026-09-26T18:05:46.831173+00:00');

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM field_jobs WHERE local_inspection_id = 37;
    IF n <> 3 THEN
        RAISE EXCEPTION 'FAIL: the unclaimed row did not coexist (expected 3 rows total, got %)', n;
    END IF;
    RAISE NOTICE 'PASS: the unclaimed legacy row coexists with both namespaces without colliding';
END
$$;

SELECT coalesce(bridge_source_id, '(unclaimed / NULL)') AS namespace,
       local_inspection_id, status, current_step, id
FROM field_jobs WHERE local_inspection_id = 37
ORDER BY bridge_source_id NULLS FIRST;


-- =====================================================================
-- TEST 7 - APPLICATION AND PARCEL MIRRORS BEHAVE IDENTICALLY
-- =====================================================================
\echo ''
\echo '=== TEST 7: application + parcel mirrors also coexist per namespace ==='

INSERT INTO supabase_zoning_applications (bridge_source_id, local_application_id, reference_number, applicant_name)
VALUES ('source_a', 132, 'APP-2026-00026', 'Teshow Promsakha Sakonnakhon')
ON CONFLICT (bridge_source_id, local_application_id) DO UPDATE
   SET reference_number = EXCLUDED.reference_number;

INSERT INTO supabase_zoning_applications (bridge_source_id, local_application_id, reference_number, applicant_name)
VALUES ('source_b', 132, 'APP-2026-00032', 'Boy Abunda')
ON CONFLICT (bridge_source_id, local_application_id) DO UPDATE
   SET reference_number = EXCLUDED.reference_number;

INSERT INTO supabase_parcels (bridge_source_id, local_parcel_id, property_index_number, owner_name)
VALUES ('source_a', 64, '04-01-021-023-12-047', 'Jose Dimayuga')
ON CONFLICT (bridge_source_id, local_parcel_id) DO UPDATE
   SET owner_name = EXCLUDED.owner_name;

INSERT INTO supabase_parcels (bridge_source_id, local_parcel_id, property_index_number, owner_name)
VALUES ('source_b', 64, '04-01-021-001-10-672', 'Antonio Macatangay')
ON CONFLICT (bridge_source_id, local_parcel_id) DO UPDATE
   SET owner_name = EXCLUDED.owner_name;

DO $$
DECLARE n int;
BEGIN
    SELECT count(*) INTO n FROM supabase_zoning_applications WHERE local_application_id = 132;
    IF n <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 application mirrors for local_application_id 132, got %', n;
    END IF;
    SELECT count(*) INTO n FROM supabase_parcels WHERE local_parcel_id = 64;
    IF n <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 parcel mirrors for local_parcel_id 64, got %', n;
    END IF;
    RAISE NOTICE 'PASS: application and parcel mirrors coexist per namespace';
END
$$;

SELECT coalesce(bridge_source_id,'(unclaimed)') AS namespace, local_application_id, reference_number, applicant_name
FROM supabase_zoning_applications ORDER BY coalesce(bridge_source_id,'');
SELECT coalesce(bridge_source_id,'(unclaimed)') AS namespace, local_parcel_id, property_index_number, owner_name
FROM supabase_parcels ORDER BY coalesce(bridge_source_id,'');


-- =====================================================================
-- TEST 8 - PLANNING REVIEW MIRROR ALSO NAMESPACED
-- =====================================================================
\echo ''
\echo '=== TEST 8: field_job_reviews technical_review_id is namespaced too ==='
DO $$
DECLARE n int;
BEGIN
    INSERT INTO field_job_reviews (bridge_source_id, technical_review_id, decision)
    VALUES ('source_a', 76, 'Approved')
    ON CONFLICT (bridge_source_id, technical_review_id) DO UPDATE SET decision = EXCLUDED.decision;

    INSERT INTO field_job_reviews (bridge_source_id, technical_review_id, decision)
    VALUES ('source_b', 76, 'Declined')
    ON CONFLICT (bridge_source_id, technical_review_id) DO UPDATE SET decision = EXCLUDED.decision;

    SELECT count(*) INTO n FROM field_job_reviews WHERE technical_review_id = 76;
    IF n <> 2 THEN
        RAISE EXCEPTION 'FAIL: expected 2 review rows for technical_review_id 76, got %', n;
    END IF;
    RAISE NOTICE 'PASS: two environments coexist on the same local technical_review_id';
END
$$;


-- =====================================================================
-- TEST 9 - RELATIONSHIPS AND PRIMARY KEYS SURVIVE
-- =====================================================================
\echo ''
\echo '=== TEST 9: uuid primary keys and the photos FK survive the swap ==='

INSERT INTO field_job_photos (field_job_id, photo_url)
SELECT id, 'inspections/' || id || '/photo.jpg'
FROM field_jobs WHERE bridge_source_id = 'source_a' AND local_inspection_id = 37
LIMIT 1;

DO $$
DECLARE
    v_job  uuid;
    v_photo uuid;
BEGIN
    SELECT id INTO v_job FROM field_jobs
    WHERE bridge_source_id = 'source_a' AND local_inspection_id = 37;
    SELECT id INTO v_photo FROM field_job_photos WHERE field_job_id = v_job;

    IF v_job IS NULL OR v_photo IS NULL THEN
        RAISE EXCEPTION 'FAIL: the photo FK could not resolve after the constraint swap';
    END IF;
    RAISE NOTICE 'PASS: photo % still resolves to job % through the uuid primary key', v_photo, v_job;
END
$$;

\echo '--- object inventory (proves PK + FK + composite UNIQUE all present) ---'
SELECT t.relname AS table_name,
       (SELECT count(*) FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'p') AS primary_keys,
       (SELECT count(*) FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'f') AS foreign_keys,
       (SELECT count(*) FROM pg_constraint c
         WHERE c.conrelid = t.oid AND c.contype = 'u') AS unique_constraints,
       (SELECT count(*) FROM pg_index i WHERE i.indrelid = t.oid) AS total_indexes
FROM pg_class t
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'bridge_ns_dryrun' AND t.relkind = 'r'
ORDER BY t.relname;

\echo '--- composite unique constraint definitions ---'
SELECT conrelid::regclass AS table_name, conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE connamespace = 'bridge_ns_dryrun'::regnamespace AND contype = 'u'
ORDER BY conname;


-- =====================================================================
-- TEST 10 - updated_at TRIGGER SIDE-EFFECT: DISABLE ONE, PRESERVE, RE-ENABLE
-- =====================================================================
-- The namespace backfill on the real bridge would stamp updated_at on every
-- Class-A row unless the timestamp trigger is suspended for it. This test proves
-- the whole disable / backfill / re-enable sequence against a real trigger, and
-- proves the lifecycle guard was never disturbed.
\echo ''
\echo '=== TEST 10: updated_at trigger suspended ONLY for the namespace backfill ==='

-- A completed row, because the preservation claim matters most for finished work.
INSERT INTO field_jobs (bridge_source_id, local_inspection_id, status, current_step,
                        submitted_at, step_timestamps, assignment_instructions)
VALUES (NULL, 999, 'completed', 5, '2026-09-27T11:38:54',
        '{"1": "2026-09-26T17:50:46.146511Z"}', 'original instructions');

-- Pin updated_at so any change is unambiguous, even if the test runs fast.
UPDATE field_jobs SET updated_at = '2020-01-01 00:00:00+00' WHERE local_inspection_id = 999;
\echo '  seeded updated_at pinned to 2020-01-01'

-- 10a. An ORDINARY update MUST move updated_at. If this did not move it, the
--      trigger is not firing and the rest of the test would prove nothing.
--
--      The comparison is done in SQL, not with \if on \gset variables: psql's
--      \if cannot evaluate two timestamp literals as a boolean, and a plpgsql
--      record variable cannot be read outside its own DO block.
CREATE TEMP TABLE ns_before_ordinary AS
SELECT updated_at FROM field_jobs WHERE local_inspection_id = 999;

UPDATE field_jobs SET assignment_instructions = 'edited by an ordinary writer'
 WHERE local_inspection_id = 999;

DO $$
DECLARE
    v_before timestamptz;
    v_after  timestamptz;
BEGIN
    SELECT updated_at INTO v_before FROM ns_before_ordinary;
    SELECT updated_at INTO v_after  FROM field_jobs WHERE local_inspection_id = 999;

    IF v_before IS NOT DISTINCT FROM v_after THEN
        RAISE EXCEPTION 'TEST FAIL: an ordinary UPDATE did not change updated_at';
    END IF;
    RAISE NOTICE '  updated_at moved from % to %', v_before, v_after;
END $$;
\echo '  10a PASS: ordinary UPDATE changed updated_at'

-- Reset to the pinned value for the next step.
UPDATE field_jobs SET updated_at = '2020-01-01 00:00:00+00',
                     assignment_instructions = 'original instructions'
 WHERE local_inspection_id = 999;

-- Re-pin AFTER the reset, because the reset itself fired the trigger.
UPDATE field_jobs SET updated_at = '2020-01-01 00:00:00+00' WHERE local_inspection_id = 999;

-- Capture the pinned state into a temp table. A plpgsql record cannot be read
-- outside its own DO block, so the comparison has to go through a relation.
--
-- No ON COMMIT DROP: psql autocommits each statement, so a temp table declared
-- ON COMMIT DROP is destroyed by its own creating transaction and is missing by
-- the time the later DO block reads it. The schema is dropped at teardown
-- anyway, which is what actually cleans these up.
CREATE TEMP TABLE ns_pinned AS
SELECT status, current_step, submitted_at, step_timestamps, updated_at,
       assignment_instructions
  FROM field_jobs WHERE local_inspection_id = 999;
\echo '  pinned state captured'

-- 10b. The trigger must exist and be enabled before anything is disabled.
--
-- 10h (below) proves the pg_catalog TYPE behaviour this depends on: tgenabled
-- is "char", so it must be COMPARED ('O'), never assigned into a boolean. That
-- was a live 22P02 defect in the forward SQL, so the dry run now pins it.
DO $$
DECLARE v_ten boolean; v_raw "char";
BEGIN
    SELECT (tgenabled = 'O'), tgenabled INTO v_ten, v_raw FROM pg_trigger
    WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;
    IF v_ten IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST SETUP FAIL: trg_field_jobs_set_updated_at not enabled (tgenabled=%)', v_raw;
    END IF;
END $$;
\echo '  10b PASS: trg_field_jobs_set_updated_at exists and is enabled'

-- 10c. Disable THAT trigger only. The lifecycle guard stays enabled throughout.
ALTER TABLE field_jobs DISABLE TRIGGER trg_field_jobs_set_updated_at;

DO $$
DECLARE v_guard boolean; v_ts boolean;
BEGIN
    SELECT (tgenabled = 'D') INTO v_ts FROM pg_trigger
    WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;
    SELECT (tgenabled = 'O') INTO v_guard FROM pg_trigger
    WHERE tgname = 'trg_preserve_completed_field_job_lifecycle' AND NOT tgisinternal;

    IF v_ts IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAIL: timestamp trigger not disabled';
    END IF;
    IF v_guard IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAIL: the lifecycle guard was disturbed by naming only one trigger';
    END IF;
END $$;
\echo '  10c PASS: only the timestamp trigger is disabled; the lifecycle guard is still enabled'

-- 10d. The namespace backfill itself, with the trigger suspended.
UPDATE field_jobs SET bridge_source_id = 'source_a' WHERE local_inspection_id = 999;

DO $$
DECLARE
    r record;
    p record;
BEGIN
    SELECT status, current_step, submitted_at, step_timestamps, updated_at,
           assignment_instructions, bridge_source_id
      INTO r FROM field_jobs WHERE local_inspection_id = 999;

    SELECT status, current_step, submitted_at, step_timestamps, updated_at,
           assignment_instructions
      INTO p FROM ns_pinned;

    -- IS DISTINCT FROM, not <>, so a NULL is a real difference rather than an
    -- unknown that silently compares false.
    IF r.bridge_source_id IS DISTINCT FROM 'source_a' THEN
        RAISE EXCEPTION 'TEST FAIL: bridge_source_id was not set';
    END IF;
    IF r.updated_at::text <> p.updated_at::text THEN
        RAISE EXCEPTION 'TEST FAIL: the namespace backfill changed updated_at (was %, now %)',
            p.updated_at, r.updated_at;
    END IF;
    IF r.status IS DISTINCT FROM p.status THEN
        RAISE EXCEPTION 'TEST FAIL: status changed'; END IF;
    IF r.current_step IS DISTINCT FROM p.current_step THEN
        RAISE EXCEPTION 'TEST FAIL: current_step changed'; END IF;
    IF r.submitted_at IS DISTINCT FROM p.submitted_at THEN
        RAISE EXCEPTION 'TEST FAIL: submitted_at changed'; END IF;
    IF r.step_timestamps::text <> p.step_timestamps::text THEN
        RAISE EXCEPTION 'TEST FAIL: step_timestamps changed'; END IF;
    IF r.assignment_instructions IS DISTINCT FROM p.assignment_instructions THEN
        RAISE EXCEPTION 'TEST FAIL: assignment_instructions changed'; END IF;
END $$;
\echo '  10d PASS: namespace backfill set bridge_source_id and preserved updated_at byte-identically'

-- 10e. Re-enable immediately.
ALTER TABLE field_jobs ENABLE TRIGGER trg_field_jobs_set_updated_at;

DO $$
DECLARE v_ten boolean; v_raw "char";
BEGIN
    SELECT (tgenabled = 'O'), tgenabled INTO v_ten, v_raw FROM pg_trigger
    WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;
    IF v_ten IS NOT TRUE THEN
        RAISE EXCEPTION 'TEST FAIL: timestamp trigger not re-enabled (tgenabled=%)', v_raw;
    END IF;
END $$;
\echo '  10e PASS: trigger re-enabled and verified'

-- 10h. pg_trigger.tgenabled is "char", NOT boolean.
--
-- The forward SQL originally did `SELECT tgenabled INTO <boolean>` and failed
-- live with 22P02 invalid input syntax for type boolean: "O". This proof pins
-- that catalog behaviour so the artifact's comparison cannot regress to a cast,
-- and so nobody "simplifies" (tgenabled = 'O') back into a bare assignment.
DO $$
DECLARE
    v_bad    boolean;
    v_ok     boolean;
    v_raw    "char";
    v_broken boolean;
BEGIN
    SELECT tgenabled INTO v_raw FROM pg_trigger
    WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;

    -- The catalog really is one character of text.
    IF length(v_raw) <> 1 THEN
        RAISE EXCEPTION 'TEST FAIL: tgenabled is % chars, expected a single "char"', length(v_raw);
    END IF;

    -- Comparing yields a boolean.
    SELECT (tgenabled = 'O') INTO v_ok FROM pg_trigger
    WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;
    IF v_ok IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'TEST FAIL: (tgenabled = ''O'') did not yield true';
    END IF;

    -- And assigning it into a boolean is exactly the failure that was fixed.
    -- plpgsql has no nested DECLARE, so v_broken is declared at the top.
    BEGIN
        SELECT tgenabled INTO v_broken FROM pg_trigger
        WHERE tgname = 'trg_field_jobs_set_updated_at' AND NOT tgisinternal;
        RAISE EXCEPTION 'TEST FAIL: assigning tgenabled into a boolean did NOT raise, so the 22P02 risk has returned';
    EXCEPTION
        WHEN others THEN
            IF SQLERRM LIKE 'TEST FAIL:%' THEN
                RAISE;   -- rethrow our own failure, not the expected cast error
            END IF;
            RAISE NOTICE '  confirmed: direct assignment raises SQLSTATE %', SQLSTATE;
    END;
END $$;
\echo '  10h PASS: tgenabled is "char"; comparison works and direct assignment raises 22P02'

-- 10f. After re-enabling, an ordinary update MUST move updated_at again.
CREATE TEMP TABLE ns_before_reenabled AS
SELECT updated_at FROM field_jobs WHERE local_inspection_id = 999;

UPDATE field_jobs SET assignment_instructions = 'edited again after re-enable'
 WHERE local_inspection_id = 999;

DO $$
DECLARE
    v_before timestamptz;
    v_after  timestamptz;
BEGIN
    SELECT updated_at INTO v_before FROM ns_before_reenabled;
    SELECT updated_at INTO v_after  FROM field_jobs WHERE local_inspection_id = 999;

    IF v_before IS NOT DISTINCT FROM v_after THEN
        RAISE EXCEPTION 'TEST FAIL: updated_at did not move after the trigger was re-enabled';
    END IF;
    RAISE NOTICE '  updated_at moved from % to %', v_before, v_after;
END $$;
\echo '  10f PASS: a normal UPDATE changes updated_at again after re-enable'

-- 10g. The lifecycle guard still works, proving it was never actually disabled.
DO $$
BEGIN
    BEGIN
        UPDATE field_jobs SET status = 'in_progress' WHERE local_inspection_id = 999;
        RAISE EXCEPTION 'TEST FAIL: the completed-lifecycle guard did not fire';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM = 'TEST FAIL: the completed-lifecycle guard did not fire' THEN
                RAISE;
            END IF;
    END;
END $$;
\echo '  10g PASS: the completed-lifecycle guard still rejects the change'


-- =====================================================================
-- TEARDOWN
-- =====================================================================
\echo ''
\echo '=== DRY RUN COMPLETE — dropping the throwaway schema ==='
RESET search_path;
DROP SCHEMA bridge_ns_dryrun CASCADE;

\echo ''
\echo 'VERDICT: the namespaced identity behaves as required.'
\echo '  - two environments with the same local id produce two distinct rows'
\echo '  - a retry updates only its own namespace and preserves FieldSync lifecycle'
\echo '  - another environment cannot overwrite this mapping'
\echo '  - an old bare-local-id writer fails with 42P10 instead of corrupting'
\echo '  - unclaimed legacy rows cannot collide with any namespace'
\echo '  - uuid primary keys, foreign keys and relationships are preserved'
\echo '  - the updated_at trigger is suspended for the namespace backfill only,'
\echo '    and re-enabled and verified immediately afterwards'
\echo ''
\echo 'The real Supabase project was NOT contacted by this script.'
