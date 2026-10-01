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

CREATE INDEX field_jobs_bridge_source_id_status_index
    ON field_jobs (bridge_source_id, status);
CREATE INDEX field_jobs_bridge_source_id_assigned_inspector_id_index
    ON field_jobs (bridge_source_id, assigned_inspector_id);


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
\echo ''
\echo 'The real Supabase project was NOT contacted by this script.'
