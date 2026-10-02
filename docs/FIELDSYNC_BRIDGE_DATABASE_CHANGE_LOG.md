# iMAPS ↔ FieldSync Database Change Log

## Purpose and rules

Canonical audit ledger for actual PostgreSQL, Supabase database, and Supabase backend mutations supporting the iMAPS ↔ FieldSync bridge. `FIELDSYNC_BRIDGE_ARCHITECTURE.md` defines the contract; this file records actual or pending database/backend changes.

Never record credentials, keys, tokens, handshakes, passwords, or secrets. If historical execution cannot be proved, record **Historical change — exact executed SQL unavailable**.

## Change entries

### 2026-09-27 - Work reassignment Phase 1 finalization - initial Planning Officer ownership + reason rule correction

1. **Date/time:** 2026-09-27.
2. **Loop / issue:** Work reassignment Phase 1 finalization. Closes the last business-contract gap: how an application gets its FIRST Planning Officer, and the fact that a first assignment was being forced to state a reassignment reason that was not true.
3. **System:** iMAPS PostgreSQL only. Local `imaps_db_0921`. **No Supabase change. No FieldSync change.**
4. **Business reason:** an application created by an active Planning Officer is owned by that officer, recorded as an explicit **initial assignment**. An initial assignment is **not a reassignment** and states no reason: the reason vocabulary describes why somebody is giving work away, and at first assignment nothing is.
5. **Exact SQL / operation:**
   - `database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php` - additive and idempotent.
   - Applied with `php artisan migrate --force --path=...` (exit 0). The plain `migrate` remains unusable on this database for the pre-existing ledger drift recorded in `docs/CANONICAL_DATABASE_SCHEMA.md` section 12; no ledger row was edited by hand.
6. **After state:** `reason` is now NULLABLE on both `application_po_assignments` and `site_inspection_assignments`. The reason CHECK on both tables is replaced with the exact rule `initial -> reason IS NULL` / `reassignment -> reason IS NOT NULL AND reason IN (the five values)`, and the "Other requires a note" CHECK now uses `IS DISTINCT FROM` instead of `<>`.
7. **TWO REAL DEFECTS FOUND AND FIXED, both by executing rather than reading:**
   - **Forced a false reason.** `reason` had been declared `NOT NULL` with a closed-vocabulary CHECK, so a first assignment could not omit it. Because nothing else was possible, the code had begun defaulting to "Workload Transfer" - so every brand-new application AND every brand-new inspection round was recorded as a workload handover that never happened. Both now record `reason = NULL`.
   - **NULL hole in the constraint.** The first version of the replacement rule was written as `reassignment AND reason IN (...)`. In SQL `NULL IN (...)` is NULL, not false, and a CHECK constraint PASSES on NULL - so that rule silently ACCEPTED a reassignment with no reason. Caught by running the constraint matrix: the `reassignment + NULL reason` case was wrongly accepted. The final rule guards both branches with explicit `IS NULL` / `IS NOT NULL`.
8. **Verification query/result:** nine constraint cases, each in its own rolled-back transaction so an expected rejection cannot be confused with an expected acceptance. All nine behave as intended: `initial`+NULL reason ACCEPTED; `reassignment`+valid reason ACCEPTED; `reassignment`+NULL reason REFUSED; `initial`+any reason REFUSED; `Other` with no note REFUSED; `Other` with a whitespace-only note REFUSED; out-of-vocabulary reason REFUSED; `initial` naming a previous owner REFUSED; `reassignment` with no previous owner REFUSED. Row counts after the matrix were unchanged at `0 / 0 / 156`, proving nothing was committed.
9. **Initialization rule:** `WorkAssignmentService::canReceiveInitialOwnership($role, $isActive)` is a pure predicate - the creator must be `role = 'Planning Officer'` AND `is_active = true`. An Admin is not eligible even though an Admin performs later handovers; a Site Inspector is never eligible; a suspended officer is not eligible. A creation by anybody else leaves the pointer NULL and writes no history row. `encoded_by` is NOT redefined: it keeps meaning "who originally encoded the application", is still written once at creation, and is never written by the assignment service.
10. **Historical backfill: NONE, deliberately.** Existing applications are not given an owner by copying `encoded_by`, because that proves who encoded a record, not who currently owns its unfinished work. Pre-existing applications honestly display "Not yet assigned" until an Administrator assigns one. No historical row was written by either migration.
11. **Admin control wording:** an unassigned application offers **Assign Planning Officer**; an assigned one offers **Reassign**. The reason field is hidden entirely on a first assignment and the form sends no `reason` parameter, so a first assignment can never be recorded as a handover. A reason is required only when an existing owner is being replaced. The database enforces the same rule independently, so the invariant holds even if a future writer bypasses the form.
12. **Related source/code:** `database/migrations/2026_09_27_020000_allow_initial_assignment_without_a_reason.php`; `app/Services/WorkAssignmentService.php` (`canReceiveInitialOwnership`, `initializePoOwnershipForNewApplication`, reason dropped for initial in both assign paths); `app/Http/Controllers/WorkReassignmentController.php` (reason now mandatory only when replacing an owner, on both routes); `app/Http/Controllers/ApplicationController.php` (initialization on the creation path); `resources/js/Components/WorkAssignment.jsx`; `tests/Unit/InitialPoOwnershipContractTest.php`; `tests/Unit/WorkReassignmentContractTest.php`.
13. **Rollback SQL/steps:** `down()` restores `NOT NULL` and the original CHECKs, but REFUSES to run while any initial row correctly has a NULL reason, rather than inventing a reason to satisfy the constraint. No `DROP TABLE` on any pre-existing table.
14. **Validation:** new focused suite `tests/Unit/InitialPoOwnershipContractTest.php` (20 tests) covers the eligibility matrix as a pure function (active PO accepted; suspended PO, Admin and Site Inspector refused; near-miss spellings refused), the creation-path wiring, the initial record shape, absence of any reason on an initial assignment for both ownership kinds, `encoded_by` never being written, the absence of any backfill, initial-vs-reassignment typing, the reason-required-only-when-replacing rule, the database rule refusing a reason on an initial row, the absence of the NULL hole, the Assign/Reassign UI distinction, the unchanged authority split, and the absence of a dangling "Reason:" label on a reasonless history line. Existing suite total: **230 tests, 1237 assertions**. `npm run build` green. `git diff --check` clean.
15. **Browser smoke, on a brand new browser profile with both roles signed out before logging in:** **32 checks, 32 passing.** Admin: an unassigned application reads "Not yet assigned" and offers "Assign Planning Officer"; the first-assignment form asks for NO reason and explains why; a first assignment with no reason succeeds; the application then shows that officer and offers "Reassign"; replacing an owner with no reason is refused; "Other" with no note is refused; an invented reason is refused; a cross-role receiver is refused; the Planning Officer decision endpoint returns 403; the inspector route returns 403 and no inspector control is rendered. Planning Officer: ownership is visible, no self-reassign control is offered, the Admin endpoint returns 403, an untouched round offers Reassign Inspector, an in-progress round is disabled with the plain-language message, the server refuses the in-progress round, and a round outside the named application is refused. The new-application rule was exercised END TO END by creating a real application through the real encode endpoint as the real officer: the created record shows that officer as the owner, is not shown as unassigned, and its history reads one initial assignment, no reason, no dangling label, changed by the creating officer. Every fixture the run created was then removed and the database verified back at `0 / 0 / 156 / 0` with no smoke rows anywhere.
16. **SQL validation, on a throwaway scratch database and never the real one:** both migrations applied cleanly in order against a minimal prerequisite schema; all objects present (pointer column, both history tables, 15 constraints per table); **re-applying the second migration a second time left the constraint count unchanged at 15**, proving the guards make it idempotent; the two decisive cases behaved correctly on a fresh install. The scratch database was then dropped and confirmed absent. The real database was verified unchanged throughout: `0 / 0 / 156 / 0`.
17. **Status:** **PHASE 1 FINALIZED. NOT PUSHED.**
18. **Notes / risks:** Supabase and FieldSync are unchanged. No mid-flight transfer or recovery flow is implemented. Historical applications remain unassigned by design and will show "Not yet assigned" until an Administrator acts on them. The `down()` path is intentionally one-way once initial rows exist.

### 2026-09-27 - Work reassignment Phase 1 - iMAPS additive column + two new history tables

1. **Date/time:** 2026-09-27.
2. **Loop / issue:** Work reassignment / business continuity, Phase 1. Implements the previously documented-only business rule so that pending work can be handed to another qualified employee without any account sharing.
3. **System:** iMAPS PostgreSQL only. Local `imaps_db_0921`. **No Supabase schema change. No FieldSync change.** No data mutation beyond schema creation.
4. **Business reason:** If a Planning Officer or Site Inspector is unavailable, work must keep moving, but accounts must never be shared and the receiving employee must work on their own account. That requires a durable record of who originally held the work, who received it, why, who authorized it and when. The audit found no such record existed: `site_inspections.inspector_id` was overwritten in place with no history, and there was no Planning Officer ownership field at all.
5. **Exact SQL / operation:**
   - `database/migrations/2026_09_27_010000_add_work_reassignment_contract.php` - additive and idempotent (guarded on `Schema::hasColumn` / `hasTable` / `pg_constraint` presence).
   - Applied to local `imaps_db_0921` with `php artisan migrate --force --path=database/migrations/2026_09_27_010000_add_work_reassignment_contract.php` (exit 0).
   - A plain `php artisan migrate` was **not** used and **not** attempted destructively: the repository's consolidated `create_initial_schema` is still recorded Pending against a live database that already has those tables, so a global run fails with `relation "users" already exists`. That ledger drift is pre-existing and is recorded in `docs/CANONICAL_DATABASE_SCHEMA.md` section 12. No ledger row was edited by hand.
6. **After state:**
   - `zoning_applications.assigned_planning_officer_id bigint NULL`, FK `zoning_applications_assigned_po_foreign -> users(id) ON DELETE SET NULL`.
   - New table `application_po_assignments` (7 constraints: 5 FKs/checks + type + reason + other-note + from-shape).
   - New table `site_inspection_assignments` (parallel constraints, keyed to one round).
   - 17 constraints created in total, all verified present in `pg_constraint`.
   - **No historical row was written.** `assigned_planning_officer_id` is NULL for all pre-existing applications and both history tables are empty. Ownership was deliberately not backfilled from `encoded_by` or from the latest reviewer, because the current workflow has no step that assigns an application to an officer and either source would invent an accountability fact nobody decided on.
7. **Verification query/result:** `information_schema.columns` confirms the new column as `bigint`/nullable; `information_schema.tables` confirms both new tables; `pg_constraint` confirms all 17 named constraints including the four CHECK constraints that enforce the closed reason vocabulary, the "Other requires a note" rule, and the initial-vs-reassignment previous-owner rule.
8. **Classification of audited fields:** `assigned_planning_officer_id` is a NEW current-ownership pointer. It is **not** `encoded_by` (encoder attribution), **not** `technical_reviews.reviewed_by` (decision actor per round), and **not** `audit_trail.performed_by` (event actor). `site_inspections.inspector_id` remains the canonical current inspector. `assigned_by_imaps_user_id` / `assigned_by_name` keep their existing meaning of *most recent assigning officer* and are still overwritten on handover; the durable previous-owner record is now the history table.
9. **Related source/code:** `database/migrations/2026_09_27_010000_add_work_reassignment_contract.php`; `app/Models/ApplicationPoAssignment.php`; `app/Models/SiteInspectionAssignment.php`; `app/Services/WorkAssignmentService.php`; `app/Support/InspectorTransferGuard.php`; `app/Support/ReassignmentReasons.php`; `app/Http/Controllers/WorkReassignmentController.php`; `app/Services/SupabaseService.php` (`fieldJobTransferStates`); `app/Models/User.php` (active-account scopes); `app/Models/ZoningApplication.php`; `app/Models/SiteInspection.php`; `resources/js/Components/WorkAssignment.jsx`; `resources/js/Pages/Applications/Show.jsx`; `tests/Unit/WorkReassignmentContractTest.php`.
10. **Rollback SQL/steps:** `down()` drops both history tables, the CHECK constraints and the new column/foreign key. Both tables are `ON DELETE CASCADE` from their parent, so no orphan rows can be left behind. No `DROP TABLE` on any pre-existing table.
11. **Validation:** `tests/Unit/WorkReassignmentContractTest.php` - 42 tests / 220 assertions, including pure-logic proof of the mid-flight safety rule (untouched allowed; remote `in_progress`, confirmed GPS, any checklist progress, any photo, completed, and unreadable remote all refused), runtime route resolution proving Admin cannot reach the inspector route and a Planning Officer cannot reach the application route, absence of any impersonation path, absence of a forced reset of remote progress, and assertion that the removed silent `fill([...$assignmentData, 'status' => 'assigned'])` overwrite has not returned. `npm run build` green. `git diff --check` clean.
12. **Status:** **PHASE 1 IMPLEMENTED AND APPLIED TO LOCAL 0921. NOT PUSHED.**
13. **Notes / risks:** Supabase and FieldSync are unchanged, and no client change was required: the handover reuses the existing bridge, which upserts one `field_jobs` row per `local_inspection_id`, so the SAME job changes assignee rather than a second job being created. The reassignment is refused unless the remote job is provably untouched (status `assigned`, no GPS, no checklist progress, no photos) and it fails closed when the remote state cannot be read, because local `site_inspections.status` has no in-progress value and therefore cannot prove a round is unstarted. Mid-flight transfer and any recovery flow remain deliberately unimplemented. A suspended account is now excluded from every inspector picker and refused by every validation rule; this corrects a message that previously promised an "active" account while checking only role and handshake key. Deciding an automatic initialization rule for `assigned_planning_officer_id` remains an open business question and was not guessed at. Application status, `encoded_by` and the technical review history are never modified by a handover.

### 2026-09-27 - Loop 8 Planning Review Metadata - iMAPS additive column + new Supabase table/RLS

1. **Date/time:** 2026-09-27 (local implementation session; shared Supabase change applied via the Supabase CLI Management API query path).
2. **Loop / issue:** Loop 8 — Planning Review Metadata (round-safe read-only contract). Decision approved by the Team Leader.
3. **System:** iMAPS PostgreSQL `public.technical_reviews`; shared Supabase PostgreSQL (new table `public.field_job_reviews`).
4. **Environment/project/database:** iMAPS local `imaps_db_0921`; shared Supabase project `laapipjyprmmaylunxib` (Southeast Asia / Singapore).
5. **Business reason:** Let the Planning Officer's decision reach the inspector as read-only metadata on the **exact round that was reviewed**, without touching the reviewed task's lifecycle and without reopening completed work.
6. **Before state:** `technical_reviews` had no way to record *which* inspection round a review was about; `site_inspection_task_id` (the new round) was the only inspection pointer, which cannot express "this decision reviewed round 36". Live `field_jobs` has **no** `reviewed_by`/`reviewed_at` columns (the earlier schema-dump claim was stale) and Planning Review lifecycle columns were deliberately never added to `field_jobs`.
7. **Exact SQL / operation:**
   - iMAPS: `database/sql/2026_09_27_loop8_planning_review_identity.sql` — `ALTER TABLE public.technical_reviews ADD COLUMN IF NOT EXISTS reviewed_site_inspection_id bigint NULL;` plus guarded `FOREIGN KEY (reviewed_site_inspection_id) REFERENCES public.site_inspections (id) ON DELETE SET NULL` and index `technical_reviews_reviewed_site_inspection_id_index`. No UPDATE, no backfill, no destructive DROP.
   - Supabase: `supabase/migrations/004_planning_review_metadata.sql` — creates `public.field_job_reviews` (PK `id`; FK `field_job_id → field_jobs(id) ON DELETE CASCADE`; `UNIQUE (technical_review_id)`; CHECK on `decision` ∈ Approved/Declined/Requires Reinspection; index on `field_job_id`), enables RLS, and creates the single SELECT policy `inspectors read own job review metadata` for `authenticated` scoped to `field_jobs.assigned_inspector_id = auth.uid()`. **No INSERT/UPDATE/DELETE policy is created for any client role.**
8. **After state / catalog evidence:** Live read-only checks confirm the column, FK and index on iMAPS; and on Supabase `field_job_reviews` with `relrowsecurity = true`, exactly one policy (`SELECT` / `{authenticated}`), the unique review-event index, and no write policy. iMAPS `technical_reviews` still holds **78 rows with 0 populated** `reviewed_site_inspection_id` — historical data was intentionally not backfilled and APP-2026-00026 was not modified.
9. **Verification:** iMAPS `Loop8PlanningReviewContractTest` 15 tests / 44 assertions PASS; Loop 4/5 + pull contracts 10 tests / 98 assertions PASS; `php -l` clean. FieldSync `loop8_planning_review_test.dart` 14 tests PASS; `flutter analyze` clean; combined Loop 8 + Loop 4 + Loop 5 + category suites 61 tests PASS. **Live Supabase RLS (all scenarios run inside transactions and rolled back):** the assigned inspector of job `76d79ab8-…` reads 1 review row; an unrelated inspector reads 0; anon reads 0; inspector INSERT is denied with `42501 new row violates row-level security policy`; inspector UPDATE/DELETE affect 0 rows and leave the row unchanged.
10. **Service-side writer (LIVE):** the production `SupabaseService::upsertFieldJobReview()` path was exercised once and returned success, writing the factual 2026-09-22 review event for `technical_review_id = 76` (`Requires Reinspection`) against `field_job_id 76d79ab8-…` — the field job of **round 36**, the round that was reviewed, not the new round. This row is the only `field_job_reviews` data row and can be removed on request. `field_jobs` was re-read afterwards: round 36 remains `completed`/step 6/submitted and round 37 remains `in_progress`/step 1, so review isolation and completed immutability are confirmed live.
11. **Related source:** `database/sql/2026_09_27_loop8_planning_review_identity.sql`; `database/migrations/2026_09_27_000000_add_reviewed_site_inspection_id_to_technical_reviews_table.php`; `TechnicalReviewController.php`; `TechnicalReview.php`; `SupabaseService.php`; `app/Jobs/PushPlanningReviewToSupabase.php`; `supabase/migrations/004_planning_review_metadata.sql`; FieldSync `lib/core/models/planning_review_metadata.dart`, `lib/core/services/db_helper.dart`, `lib/core/services/supabase_service.dart`, `lib/modules/tasks/screens/tasks_screen.dart`, `lib/modules/inspection/screens/completed_inspection_detail_screen.dart`, `test/loop8_planning_review_test.dart`.
12. **Rollback SQL/steps:** iMAPS — `ALTER TABLE public.technical_reviews DROP CONSTRAINT IF EXISTS technical_reviews_reviewed_site_inspection_id_foreign; DROP INDEX IF EXISTS technical_reviews_reviewed_site_inspection_id_index;` (the column is preserved by the migration's non-destructive `down()`). Supabase — `DROP TABLE IF EXISTS public.field_job_reviews;` after removing the policy. Nothing else depends on either object.
13. **Change scope:** one nullable iMAPS column + FK + index, and one new Supabase table with RLS and a single read policy. **No `field_jobs` column, constraint, trigger, or row was added or modified; no photo, storage, auth, or Edge Function change.**
14. **Deployment status:** **APPLIED / LIVE VERIFIED (schema + RLS + writer).** Implementation pass complete; **not yet committed.** Device-level FieldSync rendering of the new card remains to be confirmed on hardware.
15. **Notes / risks:** The reviewed-round scope rule (same application + parcel) is enforced in the controller because PostgreSQL forbids subqueries in `CHECK` constraints. FieldSync's new `local_jobs.planning_review` column requires a db version 12 migration; an existing device install needs the normal app update to gain it. Historical reviews intentionally show no Planning Review section until a reviewed-round identity exists.

### 2026-09-27 — Authorized reinspection fixture and remaining web-role E2E closure

- **Scope:** Normal authenticated browser reads and ADB workflow navigation only; no schema change, direct business-row mutation, GPS alteration, or Loop 8 implementation. Authorization applies only to the new reinspection round of `APP-2026-00026`; `APP-2026-00025` was not used.
- **Actual website roles:** Both user-authorized accounts were manually authenticated in a dedicated Chrome session. Application responses established one Admin and one Planning Officer; roles were not inferred from account names. Passwords were not placed in automation scripts or committed files.
- **Admin browser route matrix: PASS.** `/dashboard`, `/maps`, `/applications`, `/reports`, `/users`, `/settings`, and `/site-inspections` returned HTTP 200 with their expected Inertia components. Secure tax-map lookup using an existing parcel returned HTTP 200 with `found=true` and parcel data. An initial probe selected a nonexistent `land_parcels.id`; correcting the external read-only probe to use `gid` resolved that harness error without application changes.
- **Planning Officer browser route matrix: PASS.** Dashboard, Maps, applications, technical review, encode, and drafts returned HTTP 200. Reports, users, settings, and site-inspections returned HTTP 403. Both matrices used the actual authenticated browser session. Successful login may write normal session/last-login metadata.
- **Site Inspector website case:** Still credential-deferred. Neither supplied local account authenticated as Site Inspector; FieldSync authentication is not treated as iMAPS website authentication.
- **Read-only fixture baseline:** Original local inspection `36` and its separate remote field job remain `completed`, Step 6. New local inspection `37` remains locally `assigned`, with its separate assigned remote field job `in_progress`, saved step `1`, no GPS-confirmation timestamp, and zero photo metadata rows. The local assigned status is not a completed reverse-sync result.
- **Normal resume / GPS enforcement: PASS.** Opening only the new round through Tasks → Application Details → GPS Verification displayed **Step 2 of 6**, accuracy approximately 4 m, distance approximately 25 km, `Too Far`, and disabled `Approach site (<30 m)`. Stored step `1` represents the highest completed step; active UI Step 2 is the next step, not a persistence mismatch. No legitimate previous GPS completion was established for this round. No repeat GPS attempt, hidden photo route, state edit, or threshold change was used.
- **Process restart / round isolation: PASS.** Force-stop and ADB relaunch preserved authentication. Filtering the fixture showed one Ongoing and one Completed task. Reopening the new round retained Site Verification's saved timestamp and GPS as the next step. Local/remote original-row and photo-metadata fingerprints matched the pre-navigation baseline exactly; original round `36` was not reopened or rewritten. New round `37` remained independent and incomplete.
- **APP-2026-00026 REINSPECTION LIVE COMPLETION = ENVIRONMENTALLY BLOCKED AT GPS STEP.** Photo Evidence/camera was not reached; no user photo, new upload, live ACK/retry recovery, final submission, or completed reverse sync is claimed. Existing automated isolation, immutable completion, process-death recovery, duplicate prevention, ACK, and photo identity evidence is retained without rerunning broad suites.
- **Closure:** No proven runtime regression. Admin credential deferral is closed; SI website credentials and real on-site GPS/photo/reinspection completion remain environmental deferrals. Prior historical-data/Maps/Python/0921 SQL acceptance remains current through `8a79acb`. Final team DB export remains deferred until all loops finish. Loop 8 remains **Planning Review Metadata — OPTIONAL / AFTER CORE LIFECYCLE**, audit-first, with no task lifecycle/category/progress changes authorized.

### 2026-09-27 — Merged-master Maps compatibility for the 0921 forward-update path

1. **Loop / issue:** Pre-Loop-8 closure; merged-master compatibility, not a Loop 1–7 regression.
2. **System/environment:** Local iMAPS PostgreSQL `imaps_db_0921`; the shared team base remains 0921.
3. **Before state:** `to_regclass('public.historical_data')` returned NULL. Merged `MapsController` unconditionally reads this table, introduced by `2026_09_23_145135_create_historical_data_table.php`.
4. **Exact operation:** Apply `database/sql/2026_09_27_add_historical_data_for_0921.sql` after `2026_09_26_canonical_schema_reconciliation_0921_forward.sql`. Transactional `CREATE TABLE IF NOT EXISTS`, matching the migration's 12 columns: sequence-backed bigint PK; nullable date, varchar(255), text, numeric(12,2), and timestamp(0) without time zone columns. No secondary indexes, foreign keys, business defaults, or imported rows.
5. **Execution:** A local pre-change recovery backup was taken. Only the new additive SQL was applied, twice, proving PostgreSQL syntax and repeat-application safety. No Laravel migration was executed and no migration-ledger entry was edited.
6. **Verification:** Catalog columns/defaults/nullability/precision and PK index match the source migration. Migration-ledger fingerprint is unchanged. Row counts for `users`, `zoning_applications`, `site_inspections`, `technical_reviews`, and `application_sequences` are unchanged. SQL contains no business-row update/delete or destructive reset.
7. **Maps result:** Existing valid local Planning Officer credentials were verified without changing the account; a real headless Chrome login followed by `/maps` returned HTTP 200, rendered page content, and produced zero browser runtime exceptions. No Maps/Analytics source was changed. A supplemental raw Inertia request returned an empty/non-JSON response; it is not used as acceptance evidence. The full document/browser request establishes table compatibility.
8. **Python result:** `requests`, `openpyxl`, `scikit-learn`, and `psycopg2-binary` were already declared in `python-analytics/requirements.txt` but absent from the venv. Synced the declared requirements; `pip check` passed. Existing development stack has Vite, Laravel on `127.0.0.1:8000`, queue worker, and Python on `127.0.0.1:8001`. Python `/` and `/openapi.json` returned HTTP 200. No dependency-manifest/runtime-source correction was needed; a complete forecast/model-quality acceptance is not claimed.
9. **Affected validation:** No Maps/Forecasting tests were found. SQL/catalog/idempotency checks and browser/service smoke passed. Production frontend build passed with process-local `GOMAXPROCS=2` after the first esbuild run exhausted host memory; existing CSS/chunk-size warnings remain. No unrelated Loop suites were rerun: `58fe575` records 110 tests / 623 assertions passing.
10. **Preserved contract:** `site_inspections.assigned_notes` remains canonical; `remarks` remains retired; `application_sequences` is physically retained and runtime-retired. No Supabase/Storage mutation or remote photo DELETE implementation.
11. **Rollback/retention:** Retain the additive table; do not drop it as routine rollback. The pre-change backup is a recovery artifact only. Final team DB snapshot/export remains deferred until all loops, including Loop 8+, are complete.
12. **Deployment status:** Applied locally only. Team deployment uses the ordered forward SQL package and section 8 verification queries in `CANONICAL_DATABASE_SCHEMA.md`; no shared deployment or push is claimed.
13. **Closure acceptance boundaries:** Previously accepted PO/Guest Loop 6 and Loop 7 browser security results were retained, not rerun. Admin and Site Inspector local web credentials from the existing harness failed read-only password verification; both browser cases remain credential-deferred. ADB confirmed the installed FieldSync app retained its authenticated task list. Its current local DB is SQLCipher-encrypted, so the read-only copied database could not be queried with ordinary SQLite. Normal UI inspection found the known development task at Step 1 and older tasks at later steps, but did not establish a safe development task with proven legitimate GPS verification and permission for photo reuse. Live 7D remains environmentally deferred: the user is outside the 30 m boundary and no safe previously verified photo-step resume was established. No GPS/progress edits, camera capture, or historical-fixture changes occurred. Prior fresh-APK/data-preserving-install/session/process-death and automated 7D recovery, lost-ACK, deterministic identity results remain accepted historical evidence. Loop 7E local safeguards and completed/rework retention remain PASS; remote DELETE remains deferred by design. Track A fixture and pagination deferrals remain carried forward.

### 2026-09-25 — Loop 6 manual live E2E record + two bounded correctness corrections — schema/data migration: NONE

1. **Date/time:** 2026-09-25 (local session; manual acceptance performed 2026-09-24/25).
2. **Loop / issue:** Loop 6 — Site Inspector iMAPS web access control (status update only), 419/CSRF correction, tax-map query correction; plus the Loop 7 audit start record (no mutation).
3. **System:** iMAPS application/frontend layer only. No direct PostgreSQL DDL/DML was executed. Supabase was not mutated.
4. **Environment/project/database:** Local working tree, branch `fix/fieldsync-bridge-stability`, HEAD `8a28c8207717efa64e2ea9c66db531f4610c37d0`; application runtime `http://127.0.0.1:8000` against the existing local PostgreSQL database.
5. **Business reason:** Record the manual live acceptance outcome and the two bounded correctness corrections without any database change.
6. **Before state:** (a) 419 symptom — a persistent static CSRF meta/header pattern replayed a pre-transition token across Inertia auth transitions; (b) tax-map — PostgreSQL-invalid `""` empty-string literals inside the PIN-normalization `whereRaw`, so an already-authorized request failed with `SQLSTATE[42601] zero-length delimited identifier`.
7. **Exact SQL / operation:** **NONE.** No migration, DDL, DML, RLS change, Storage/bucket change, Supabase Auth/Edge Function change, or `field_job_photos`/`field_jobs` row insert/update/delete. Corrections were application-source-only: `resources/js/bootstrap.js`, `resources/views/app.blade.php`, `resources/js/Pages/Users/Index.jsx` (CSRF lifecycle) and `app/Http/Controllers/TaxMapLookupController.php` (bound empty-string parameters replacing `""`).
8. **After state:** Unchanged. No schema, migration, or business-data change exists from this period.
9. **Verification query/result:** Not applicable — no SQL was executed by this work. Runtime evidence was page/route behavior during manual acceptance (Admin and Planning Officer matrices, 419-free repeated auth transitions, authenticated tax-map parcel JSON, FieldSync read-only non-impact). The Laravel runtime itself performed read-only application/database queries during acceptance, and successful Admin/Planning Officer logins may have written normal allowed-role authentication metadata (`last_login`, session rows).
10. **Related source migration/code:** Files in item 7, plus new untracked tests `tests/Unit/Loop6CsrfSessionContractTest.php`, `tests/Feature/Loop6AuthTransitionTest.php`, `tests/Feature/TaxMapLookupTest.php`.
11. **Rollback SQL/steps:** Not applicable (no database change). Application rollback = revert the four source files.
12. **Change scope:** Application/frontend source and documentation only; zero database/backend mutation.
13. **Status:** **IMPLEMENTATION / SCHEMA MUTATION: NONE. BUSINESS-DATA MIGRATION: NONE. SUPABASE MUTATION FROM LOOP 6: NONE. MANUAL E2E: read-only application/database reads occurred; normal successful login metadata may have changed as part of authentication.**
14. **Notes / risks:** The 419 correction is application/frontend only, zero schema/data migration. The tax-map correction is a controller query correction only, zero schema/data migration. The authenticated manual tax-map lookup was **READ ONLY**. No credential, cookie, PIN-owner PII, raw session identifier, handshake key, or secret is recorded. Loop 6 remains open pending the Team Leader's valid local Site Inspector credential test, Audit Log navigation clarification, a genuinely logged-out guest tax-map observation, and the environment-blocked DB-backed PHPUnit proofs (`pdo_sqlite` absent). **Loop 7 audit start — NO DATABASE/SUPABASE MUTATION.**

### 2026-09-24 — Loop 6 Site Inspector web access control — schema/data migration: NONE

1. **Date/time:** 2026-09-24 (local implementation session).
2. **Loop / issue:** Loop 6 — Site Inspector iMAPS web access control (route/middleware authorization + approved login gate).
3. **System:** None (iMAPS application layer only: `RoleMiddleware`, `AuthenticatedSessionController`, `routes/web.php`, `routes/api.php`, `Sidebar.jsx`, `Header.jsx`, tests, docs).
4. **Environment/project/database:** Local working tree on branch `fix/fieldsync-bridge-stability`; no schema or data migration was executed during the Loop 6 implementation pass.
5. **Business reason:** Enforce the confirmed rule that iMAPS web is for Admin + Planning Officer only, while Site Inspectors use FieldSync — without any data change.
6. **Before state:** `routes/api.php` exposed stateless `/api/tax-map/lookup/{pin}` (no session/middleware); several internal web routes had no role middleware; the login path accepted Site Inspector credentials; `RoleMiddleware` had a single-string signature.
7. **Exact SQL / operation:** NONE. No migrations, no SQL, no Supabase Auth/RLS/Edge Function/notification/OneSignal/reverse-sync edits, no user password/role/`is_active`/handshake changes, no row insert/update/delete anywhere. The login rejection is a pre-login role callback inside `Auth::attemptWhen()`: the framework verifies the credentials first, then the Site Inspector role is rejected before any password rehash, session establishment, or remember-token handling — no `logout()`, no session teardown, and no users-row write occurs for a rejected Site Inspector login; `last_login` is not written for rejected sessions. This behavior is source-verified against the installed framework (`SessionGuard::attemptWhen` ordering; `logout()` would rotate a populated `remember_token`); the DB-backed Feature proofs remain ENVIRONMENT BLOCKED locally (`pdo_sqlite` missing) and are not claimed as runtime-verified.
8. **After state:** Unchanged — no database/schema/data migration was executed during Loop 6 implementation (the database exists; it was not intentionally mutated during this implementation pass). **Scope note:** this entry covers the implementation pass only. The later manual live E2E period (see the 2026-09-25 entry) performed read-only application/database reads, and normal successful allowed-role logins may have written authentication metadata; it is not covered by this implementation-scoped statement.
9. **Verification query/result:** Not applicable — no SQL or migration executed. Verified by scoped `git diff`: changes are confined to `app/Http/Middleware/RoleMiddleware.php`, `app/Http/Controllers/Auth/AuthenticatedSessionController.php`, `routes/web.php`, `routes/api.php`, `resources/js/Components/Sidebar.jsx`, `resources/js/Components/Header.jsx`, `tests/Unit/Loop6SiteInspectorAccessContractTest.php`, `tests/Feature/Loop6AccessBoundaryTest.php`, `tests/Feature/Loop6RoleMatrixTest.php`, and this docs file plus `FIELDSYNC_BRIDGE_ARCHITECTURE.md`. The FieldSync repository (`imaps_fieldsync_main`) is untouched.
10. **Related source migration/code:** None required.
11. **Rollback SQL/steps:** Revert the application files; no data rollback needed.
12. **Change scope:** Application code only; zero database/backend mutation.
13. **Status:** schema/data migration: NONE required; NONE performed during implementation.
14. **Notes / risks:** Feature tests requiring `RefreshDatabase` cannot execute locally (`pdo_sqlite` missing) — reported as an environment limitation, not as passing; they should be run in CI or an environment with `pdo_sqlite` before deployment sign-off. This includes all 18 tests of the Loop 6 role/login matrix (the rejected-login non-impact proofs: guest session, `last_login`, role, `is_active`, password, `handshake_key`, `remember_token`, invalid-credential path, allowed-role session regeneration, rate-limit/lockout), which are therefore NOT runtime-verified locally.

### 2026-09-23 — Loop 5 completed lifecycle protection (APPLIED SHARED)

1. **Date/time:** 2026-09-23 12:01:49 +08:00.
2. **Loop / issue:** Loop 5 — completed lifecycle immutability.
3. **System:** Supabase PostgreSQL `public.field_jobs`.
4. **Environment/project/database:** Linked shared FieldSync project `laapipjyprmmaylunxib` (Southeast Asia / Singapore).
5. **Business reason:** Authenticated inspectors have row-wide UPDATE permission on their assigned jobs, so source-only guards cannot prevent another allowed client path from changing a completed row to `assigned`/`in_progress`, lowering `current_step`, or clearing/replacing `submitted_at`.
6. **Before state:** Live read-only catalog queries through `supabase db query --linked` found no completed-lifecycle function or equivalent trigger. `field_jobs` had enabled `BEFORE UPDATE` trigger `trg_field_jobs_set_updated_at` → `public.set_updated_at_utc()`, enabled `AFTER INSERT` notification trigger `on_assignment_change`, and inspector UPDATE RLS using/checking `auth.uid() = assigned_inspector_id`. The `service_role` role has `BYPASSRLS` but remains subject to table triggers.
7. **Exact SQL / operation:** Applied only `supabase/migrations/003_completed_field_job_immutability.sql`. It creates/replaces `public.preserve_completed_field_job_lifecycle()` and creates `trg_preserve_completed_field_job_lifecycle BEFORE UPDATE ON public.field_jobs FOR EACH ROW`. For an already completed row it restores `status = 'completed'`, `current_step = 6`, and `OLD.submitted_at`; on first transition to completed it sets Step 6 and preserves a pre-existing non-null submission time. All other `NEW` columns pass through unchanged.
8. **Deployment method:** Supabase CLI 2.116.0 Management API query path, using `supabase db query --linked --file <migration>`. This did not use Docker, REST row mutation, or migration push and did not apply unrelated migration files.
9. **After state / catalog evidence:** Live `pg_trigger` reports exactly one enabled (`tgenabled = 'O'`) `trg_preserve_completed_field_job_lifecycle`, defined as `BEFORE UPDATE ON field_jobs FOR EACH ROW`, attached to `public.preserve_completed_field_job_lifecycle()`. The pre-existing updated-at and assignment notification triggers remain enabled. Live `pg_proc` returns the deployed function body matching migration `003`.
10. **Verification:** Catalog/schema verification passed. The trigger does not fire on INSERT, so new jobs/reinspection rounds and first assignment are unaffected; it changes only the three lifecycle fields during UPDATE and therefore permits evidence corrections and leaves assignment instructions/provenance unchanged. Focused source tests cover stale replay, cache classification, evidence-only rework, and submit timestamp preservation. Controlled live E2E then used the normal FieldSync Findings rework path on completed Round 1 (`local_inspection_id = 36`, job `76d79ab8-e38e-4682-ada2-a67ac84dde00`): inspector notes persisted with the recognizable Loop 5 correction, and the normal Findings save regenerated the editable observations text from the hydrated form, while `status = 'completed'`, `current_step = 6`, and the original `submitted_at = 2026-09-22 11:38:54.944788+00` remained exact. Identity, assignment provenance/instructions, GPS, checklist, photos, findings, discrepancies, recommendations, result, and compliance remained unchanged. A force-stop/reopen and fresh task fetch still showed Completed / Modified / Step 6/6. The existing Round-2 row (`local_inspection_id = 37`) remained separately assigned at Step 0 with its own instructions, and the application retained exactly two jobs (one row per round).
11. **Related source:** `supabase_service.dart`, `sync_outbox_service.dart`, `db_helper.dart`, `inspection_provider.dart`, `inspection_progress.dart`, `003_completed_field_job_immutability.sql`, iMAPS `SiteInspection.php`, and `PullCompletedInspections.php`.
12. **Rollback:** `DROP TRIGGER IF EXISTS trg_preserve_completed_field_job_lifecycle ON public.field_jobs; DROP FUNCTION IF EXISTS public.preserve_completed_field_job_lifecycle();` Review completed-row invariants before rollback.
13. **Change scope:** One function and one trigger on `public.field_jobs`; no table data update or repair occurred during deployment. The later live acceptance performed only ordinary evidence-row UPDATEs through the production FieldSync path; it was E2E evidence, not another schema migration. No unrelated migration or other table change occurred.
14. **Deployment status:** **APPLIED SHARED; LIVE E2E PASS.**


### 2026-09-22 13:27:54 +08:00 — Loop 4 local Site Inspection schema alignment

1. **Date/time:** 2026-09-22 13:27:54 +08:00 pre-change capture; execution/post-check in the same session.
2. **Loop / issue:** Loop 4 — reinspection and reverse-sync schema gate.
3. **System:** iMAPS PostgreSQL.
4. **Environment/project/database:** Local test DB `imaps_db_0921`, schema `public`.
5. **Business reason:** Persist the full FieldSync completion contract and permit a Planning Officer reinspection decision without replacing Round 1.
6. **Before state:** `site_inspections.is_compliant` and `findings` absent. Decision constraint allowed `Approved`, `Needs Site Inspection`, `Declined`.
7. **Exact SQL / operation:** Executed `database/sql/2026_09_22_loop4_site_inspection_schema_alignment.sql`: add nullable `is_compliant boolean` and `findings text`; replace the decision constraint with the approved four-value constraint.
8. **After state:** Both nullable result columns exist. Constraint allows exactly the four approved decisions. No historical row update was included.
9. **Verification query/result:** `information_schema.columns` and `pg_constraint`: `is_compliant` boolean/YES; `findings` text/YES; exact four values. Existing rows remain NULL in both new columns.
10. **Related source migration/code:** `2026_09_10_000000_add_bridge_columns_to_site_inspections_table.php`; `2026_09_21_000000_allow_requires_reinspection_technical_review_decision.php`; `PullCompletedInspections.php`; `TechnicalReviewController.php`; `SiteInspection.php`.
11. **Rollback SQL/steps:** With explicit approval, restore the old constraint using `ALTER TABLE public.technical_reviews DROP CONSTRAINT IF EXISTS technical_reviews_decision_check; ALTER TABLE public.technical_reviews ADD CONSTRAINT technical_reviews_decision_check CHECK (decision IN ('Approved', 'Needs Site Inspection', 'Declined'));`. Only after proving no required data exists, use `ALTER TABLE public.site_inspections DROP COLUMN IF EXISTS is_compliant, DROP COLUMN IF EXISTS findings;`. The Laravel repair migration intentionally has a non-destructive `down()`.
12. **Change scope:** Local test DB only; intended Team Leader PostgreSQL deployment.
13. **Status:** Applied locally; pending Leader deployment outside the local DB.
14. **Notes / risks:** Direct SQL and migrations converge. A later guarded bridge migration will skip these existing columns.

### 2026-09-22 — Loop 4 Supabase schema mutation: NONE REQUIRED

1. **Date/time:** 2026-09-22 verification session.
2. **Loop / issue:** Loop 4 — remote round identity and notification compatibility.
3. **System:** Supabase.
4. **Environment/project/database:** Shared project identified by repository evidence as `laapipjyprmmaylunxib`.
5. **Business reason:** Decide whether reinspection needs a new Supabase mutation.
6. **Before state:** Schema exports already define generated `field_jobs.id`, unique `local_inspection_id`, `Requires Reinspection`, and the `on_assignment_change` AFTER INSERT trigger. Source/tests establish provenance and upsert behavior.
7. **Exact SQL / operation:** No SQL, configuration, deployment, or data mutation.
8. **After state:** Unchanged.
9. **Verification query/result:** Schema exports show identity/result/trigger contracts. Prior live evidence records successful `field_jobs` INSERT → trigger → Edge Function. A new local inspection ID creates a separate remote job.
10. **Related source migration/code:** FieldSync `schema.sql` / `full.sql`; `PushInspectionToSupabase.php`; `loop4_multi_round_isolation_test.dart`.
11. **Rollback SQL/steps:** Not applicable.
12. **Change scope:** Shared Supabase verification only; no shared mutation.
13. **Status:** No change required.
14. **Notes / risks:** No new live schema query occurred in this session; evidence is source/export plus prior live-verification records. Stop before any future unplanned Supabase change.

### Historical — local `site_inspections.status` default aligned to `assigned`

1. **Date/time:** Historical; exact time unavailable.
2. **Loop / issue:** Bridge lifecycle vocabulary.
3. **System:** iMAPS PostgreSQL.
4. **Environment/project/database:** Local `imaps_db_0921`.
5. **Business reason:** Match FieldSync raw assignment status `assigned`.
6. **Before state:** Create-table migration defines original default `Pending`.
7. **Exact SQL / operation:** **Historical change — exact executed SQL unavailable.**
8. **After state:** Local schema default is `'assigned'::character varying`, non-nullable.
9. **Verification query/result:** `information_schema.columns` returned `character varying`, nullable `NO`, default `assigned`.
10. **Related source migration/code:** `2026_07_13_125119_create_site_inspections_table.php`; current assignment code writes `assigned` explicitly.
11. **Rollback SQL/steps:** Not recommended; `Pending` conflicts with the current bridge contract.
12. **Change scope:** Local test DB only; intended deployment contract.
13. **Status:** Applied locally; other deployment history unknown.
14. **Notes / risks:** Exact mutation mechanism is not invented.


### Historical — local `application_sequences` creation and APP/2026 alignment

1. **Date/time:** Historical; exact time unavailable.
2. **Loop / issue:** Canonical application reference sequence.
3. **System:** iMAPS PostgreSQL.
4. **Environment/project/database:** Local `imaps_db_0921`, `public.application_sequences`.
5. **Business reason:** Preserve monotonic canonical reference generation.
6. **Before state:** Not provable from available execution records.
7. **Exact SQL / operation:** **Historical change — exact executed SQL unavailable.**
8. **After state:** Table exists with `type_code`, `year`, `last_seq`; row is `APP / 2026 / 25`.
9. **Verification query/result:** Local query returned `APP | 2026 | 25`; maximum canonical `APP-2026-<number>` suffix is also `25`.
10. **Related source migration/code:** `2026_05_13_065441_create_application_sequences_table.php`; Git proves the current definition, not exact local execution SQL.
11. **Rollback SQL/steps:** Do not roll back while reference generation depends on it. Compare `last_seq` to canonical references before correction.
12. **Change scope:** Local test DB only; intended deployment contract.
13. **Status:** Applied locally; other deployment history unknown.
14. **Notes / risks:** No sequence mutation occurred during Loop 4.

### Historical/source-defined — iMAPS bridge/result columns

1. **Date/time:** Source commits dated 2026-09-10, 2026-09-11, 2026-09-19; exact DB times unavailable.
2. **Loop / issue:** Assignment context, completed results, and Planning Officer provenance.
3. **System:** iMAPS PostgreSQL.
4. **Environment/project/database:** Repository contract; local `imaps_db_0921` where verified.
5. **Business reason:** Carry parcel/deadline/instructions, completed evidence, and assigner provenance.
6. **Before state:** Restored-schema drift motivated guarded migrations; each historical pre-state is not fully provable.
7. **Exact SQL / operation:** **Historical change — exact executed SQL unavailable.** Source uses guarded Laravel operations for assignment, result, and provenance fields.
8. **After state:** Before Loop 4, local assignment/provenance/rich-result columns existed except `is_compliant` and `findings`; Loop 4 added those two.
9. **Verification query/result:** Local schema listing plus migration inspection. Focused Loop 2/3 tests verify instruction/provenance mapping.
10. **Related source migration/code:** `2026_09_10_000000_add_bridge_columns_to_site_inspections_table.php`; `2026_09_11_000000_add_rich_result_columns_to_site_inspections_table.php`; `2026_09_19_000000_add_assignment_provenance_to_site_inspections_table.php`.
11. **Rollback SQL/steps:** Migrations are non-destructive. Manual rollback requires data-retention review.
12. **Change scope:** Source-defined intended deployment; portions verified in local DB.
13. **Status:** Source-defined; local final contract aligned; Leader deployment not claimed.
14. **Notes / risks:** Local `assigned_notes` maps to remote `assignment_instructions`.

### Historical/source-defined — Supabase FieldSync bridge contract

1. **Date/time:** Historical; exact schema execution times unavailable.
2. **Loop / issue:** Remote identity, results, provenance, notifications.
3. **System:** Supabase.
4. **Environment/project/database:** Shared project identified by evidence as `laapipjyprmmaylunxib`.
5. **Business reason:** Store one remote job per local inspection round and notify on insertion.
6. **Before state:** Not fully provable.
7. **Exact SQL / operation:** **Historical change — exact executed SQL unavailable.** Exports define `field_jobs`, unique `local_inspection_id`, result constraints, and AFTER INSERT trigger.
8. **After state:** Exported contract has UUID job identity, unique local identity, results, accepted `Requires Reinspection`, and notification plumbing.
9. **Verification query/result:** `schema.sql`/`full.sql` plus prior live evidence in `WEBHOOK_POST_VAULT_FIX_TEST.md`; no shared mutation for this backfill.
10. **Related source migration/code:** Supabase migration/schema files; `PushInspectionToSupabase.php`; FieldSync cache/outbox/task source.
11. **Rollback SQL/steps:** Require fresh live export and impact plan; historical sequence is unavailable.
12. **Change scope:** Shared Supabase; source-defined and partly supported by prior live evidence.
13. **Status:** Known existing contract; no Loop 4 shared mutation.
14. **Notes / risks:** Do not infer every repository migration was applied verbatim.

### 2026-09-22 — Loop 4 Round-2 live E2E runtime record (not a schema change)

- Application `APP-2026-00026` (`132`), parcel `64`.
- Round 1 remains SiteInspection `36` / field job `76d79ab8-e38e-4682-ada2-a67ac84dde00`, completed with result `Requires Reinspection` and unchanged inspection evidence.
- The normal authenticated Planning Officer reinspection workflow created Round 2 as SiteInspection `37` / field job `a761b17a-3fad-44ed-b451-7f0af0e41183`.
- Round 2 starts clean with local/remote status `assigned`, remote `current_step = 0`, no submission/result/evidence, and assignment instructions `Loop 4 Round 2 reinspection E2E.`.
- Planning Officer provenance is user `4`, `Jyerine Desunia`, on both local and remote Round 2.
- Round-1 immutability: **PASS**. Round-2 clean state and evidence isolation: **PASS**.
- No direct PostgreSQL data repair, direct Supabase data mutation, Supabase schema mutation, reverse sync, delivery retry, or Round-2 start was performed during acceptance verification.
- FieldSync device coexistence and new push-notification receipt were pending at this checkpoint; both are **PASS** in the final acceptance entry below.


### 2026-09-23 — Loop 4 final device acceptance evidence

- Application `APP-2026-00026` (`132`), parcel `64`; Laravel runtime database verified as `imaps_db_0921`.
- Round 1: SiteInspection `36` / field job `76d79ab8-e38e-4682-ada2-a67ac84dde00`. Both remain completed with `Requires Reinspection`, `is_compliant = false`; remote progress is `6`. The previously completed bounded reverse sync is evidenced by the local completed result; no sync command was rerun in this pass.
- Round 2: SiteInspection `37` / field job `a761b17a-3fad-44ed-b451-7f0af0e41183`, created by the previously verified real Planning Officer workflow as distinct new rows. Exactly one remote row exists for local inspection `37`.
- Round-2 local/remote evidence remains clean: assigned, remote step `0`, null submission/result/GPS/checklist/findings, zero photo/checklist counts, empty remote step timestamps, null rework start. Instructions are `Loop 4 Round 2 reinspection E2E.`; provenance is user `4`, `Jyerine Desunia`; assigned inspector UUID is `ddcebeac-2217-41c5-a6e2-d7f873db9af2`.
- Normal FieldSync on wireless RMX3085: **PASS**. Filtering to the application shows Pending `1`, Ongoing `0`, Completed `1`. Round 1 displays Completed / Step 6/6; Round 2 displays Pending / Step 0/6. Round-2 details show 0% progress, no saved step evidence or photos, correct instructions and assigner. Start/Proceed was not pressed.
- Round-2 push notification: **PASS — directly confirmed by the user in this acceptance session**. No replacement notification was generated.
- Round-1 immutability: **PASS**. The original baseline is recorded in the prior `LOOP 4 ROUND-1 SESSION-PRESERVING COMPLETION REPORT`, recovered through the report extract supplied for final closure. Fresh read-only Laravel/Supabase comparisons match its identity, lifecycle, result, findings, observations, discrepancies, recommendations, inspector notes, checklist (3/5), GPS (13.817202, 121.232358; 5m), empty photos and provenance, including the accepted null instructions. Local submission/GPS/completion timestamps match the preceding acceptance read; the entire remote rows, including all six Round-1 step timestamps, exactly match the saved preceding acceptance capture. No changed field was found after Round-2 creation.
- Evidence is saved in the FieldSync workspace under `output/loop4-final/`: `round1-completed`, `round2-pending`, `round2-details`, and `round2-protocol` PNG/XML pairs, plus `remote-after-device-check.json` (current evidence, not a replacement historical baseline).
- No database/schema mutation, production source change, delivery retry, new round, or Round-2 start occurred. No additional Supabase schema mutation was required.
- Build classification: **ENVIRONMENTAL BUILD INSTABILITY**, based on the supplied checkpoint record of a later Gradle daemon/JVM crash after successful alternate and normal debug builds. No build or test-suite rerun was performed; the checkpoint changed only the live runner and isolation test, not production FieldSync source.
- Final closure: **LOOP 4 CLOSED — READY FOR LOOP 5**. Round 2 remains independently assigned and clean; no database/schema mutation, reverse sync, notification rerun or task execution occurred during the final read-only comparison. Structured comparison evidence: FieldSync output/loop4-final/closure-comparison.json.

### 2026-09-25 — Loop 7 photo/storage/authorization audit — database/Supabase mutation: NONE

1. **Date/time:** 2026-09-25 (read-only audit session).
2. **Loop / issue:** Loop 7 — photo writer, private Storage, metadata RLS, retry/idempotency, delete, and iMAPS reader reconciliation.
3. **System:** None. No PostgreSQL, Supabase, Auth, RLS, Storage, or application data mutation.
4. **Environment/project/database:** Read-only source review of the current iMAPS and FieldSync working trees; prior live catalog/photo consistency evidence was reconciled without rerunning mutation.
5. **Business reason:** Establish the current photo/storage authorization contract before implementation or cleanup decisions.
6. **Before state:** Current live evidence recorded 87 `field_job_photos` rows, 19 noted rows, 85 raw-path rows, 2 legacy public-URL rows, 19 orphaned Storage objects, private `inspection-photos` bucket, inspector-scoped metadata policies, inspector-scoped Storage SELECT/INSERT/UPDATE policies, and no remote DELETE policies. Current source also contains a newer deterministic writer path and a legacy public-URL writer path.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS policy, Storage policy, bucket setting, Auth change, Edge Function change, row insert/update/delete, or cleanup operation was executed.
8. **After state:** Unchanged. No database or Supabase mutation occurred. The documented Loop 7 status remains implementation-not-started.
9. **Verification query/result:** Read-only reconciliation confirmed the already-recorded live counts and policy findings. Source review confirmed the private-bucket reader mismatch, deterministic retry identity, legacy identity drift, local-photo state transitions, best-effort deletion, and missing live delete policy. No new mutation query was run.
10. **Related source/code:** `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\supabase_service.dart`; `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\db_helper.dart`; `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\sync_outbox_service.dart`; `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\modules\inspection\providers\inspection_provider.dart`; `C:\Users\Ralph Lauren\iMAPS\resources\js\Components\ParcelInspectionStatus.jsx`; `C:\Users\Ralph Lauren\iMAPS\resources\js\utils\supabaseApi.js`; `C:\Users\Ralph Lauren\iMAPS\app\Http\Controllers\TechnicalReviewController.php`.
11. **Rollback SQL/steps:** Not applicable; no mutation was performed.
12. **Change scope:** Documentation-only audit record. Local implementation, shared Supabase, and iMAPS runtime data remain untouched.
13. **Status:** **AUDIT COMPLETE — NO DATABASE/SUPABASE MUTATION; LOOP 7 IMPLEMENTATION NOT STARTED.**
14. **Notes / risks:** The 19 orphan objects and 2 legacy URL rows are recorded for future reconciliation only. Do not delete or rewrite them without an approved retention/cleanup contract. The current private-bucket/iMAPS-reader incompatibility, identity split, and absent DELETE policies remain open decisions. The 2026-09-24 Loop 6 ledger entry already contains one precise scope-qualified `8. After state` line; no duplicate line was present in the current file.


### 2026-09-25 — Loop 7 contract decision — application contract only; no database/Supabase mutation

1. **Date/time:** 2026-09-25 (Team Leader approval recorded before Loop 7B implementation).
2. **Loop / issue:** Loop 7A/7B photo/storage contract lock — private inspection-photo evidence and iMAPS reviewer access.
3. **System:** Contract/documentation only. No PostgreSQL, Supabase, Auth, RLS, Storage, or application mutation at decision time.
4. **Environment/project/database:** iMAPS application contract for the current FieldSync/Supabase bridge; no target database selected for mutation.
5. **Business reason:** Keep inspection evidence private while allowing authorized Admin and Planning Officer review without exposing browser service credentials.
6. **Before state:** The audit established a private `inspection-photos` bucket, mixed historical photo URL/path values, and a browser-side iMAPS reader that did not generate signed URLs.
7. **Exact SQL / operation:** **NONE.** This is a Team Leader contract decision only; no SQL, migration, policy, bucket, row, or credential operation was executed.
8. **After state:** Contract locked: `PRIVATE BUCKET + RAW DURABLE OBJECT PATH + LARAVEL AUTHORIZATION + SHORT-LIVED SIGNED URL + ADMIN / PLANNING OFFICER REVIEW`.
9. **Verification query/result:** Not applicable — no database operation. The decision is recorded for the upcoming application-layer implementation only.
10. **Related source/code:** Future Loop 7B scope is limited to the iMAPS Laravel reader/service and its authorized React reader path. FieldSync writer convergence is explicitly deferred.
11. **Rollback SQL/steps:** Not applicable; no mutation was performed.
12. **Change scope:** Documentation/contract only. Completed submitted evidence is retained; remote delete, legacy URL migration, orphan cleanup, and FieldSync writer convergence remain deferred.
13. **Status:** **TEAM LEADER APPROVED — LOOP 7B APPLICATION IMPLEMENTATION AUTHORIZED; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** No bucket visibility change, RLS change, Storage policy change, reviewer Supabase identity, row migration, or deletion operation is authorized by this decision.
### 2026-09-25 — Loop 7B application-layer implementation only

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Loop 7B secure iMAPS private-photo reader.
3. **System:** iMAPS application source only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\iMAPS`; runtime database and shared Supabase project unchanged.
5. **Business reason:** Allow authorized Admin and Planning Officer reviewers to view private inspection evidence without exposing Supabase service credentials to the browser.
6. **Before state:** The active iMAPS reader queried `field_jobs`/`field_job_photos` from the browser and used stored `photo_url` values directly.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS, Storage policy, bucket, row, or cleanup operation.
8. **After state:** The existing auth/role-protected inspection endpoint now delegates to the server-side Supabase service, normalizes durable photo paths, rejects cross-job metadata/path substitution, and returns short-lived signed URLs. React consumes only the server-authorized result.
9. **Verification query/result:** Not applicable; no database operation. Focused PHP tests, PHP syntax checks, Vite build, and `git diff --check` passed. User live E2E remains pending.
10. **Related source/code:** `app/Http/Controllers/TechnicalReviewController.php`; `app/Services/SupabaseService.php`; `config/services.php`; `resources/js/Components/ParcelInspectionStatus.jsx`; `resources/js/utils/supabaseApi.js`; focused Loop 7 tests.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded application diff if required.
12. **Change scope:** Application-layer implementation only. FieldSync writer convergence, legacy URL migration, orphan cleanup, remote delete, RLS, Storage, Auth, and Edge Functions remain unchanged/deferred.
13. **Status:** **LOOP 7B IMPLEMENTED — PENDING USER LIVE E2E; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** The broader Loop 6 feature role matrix is blocked locally by the known missing `pdo_sqlite` driver; no live credentials or mutations were used.



### 2026-09-25 — Loop 7B manual E2E photo-display blocker correction — application-layer only

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Loop 7B manual photo display/count/refetch blocker discovered against application `54`, local inspection `22`, field job `c47de697-114f-4c7c-b3aa-9b3c1c635b8e`.
3. **System:** iMAPS application source only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\iMAPS`; local iMAPS database and shared Supabase project unchanged.
5. **Business reason:** Ensure the approved private-photo reader returns the canonical metadata collection, generates usable signed URLs, displays a canonical renderable count, and does not continuously refetch the same inspection.
6. **Before state:** The field-job response omitted the nested photo relation despite four live metadata rows; React displayed stale `field_jobs.photo_count = 1`; parent callback/data dependencies caused unnecessary refetches; a trailing slash in the Supabase base URL caused Storage signing HTTP 400.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS, Storage policy, bucket, row, count, orphan, or cleanup operation.
8. **After state:** The server performs an exact `field_job_photos` read by resolved field-job ID, trims the Supabase base URL before signing, returns normalized `photo_path` plus fresh `signed_url`, and the React component derives count from renderable signed photos with an inspection-ID-scoped fetch effect.
9. **Verification query/result:** Read-only service probe returned 4 metadata rows, 4 normalized paths, 4 signed URLs, and 4 final photo entries; no stored URL or service credential was returned. Focused Loop 7 plus database-free Loop 6 tests passed: 36 tests / 233 assertions. PHP syntax, Vite build, and `git diff --check` passed.
10. **Related source/code:** `app/Services/SupabaseService.php`; `resources/js/Components/ParcelInspectionStatus.jsx`; focused Loop 7 tests; this canonical ledger.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded application diff if required.
12. **Change scope:** Application-layer correction only. FieldSync, Supabase schema, RLS, Storage, Auth, Edge Functions, row counts, legacy rows, and orphan objects remain unchanged/deferred.
13. **Status:** **LOOP 7B PHOTO DISPLAY FIX READY FOR USER RETEST; LOOP 7B MANUAL E2E NOT YET RE-CLAIMED PASS; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** The user must refresh the authorized browser page and verify actual thumbnails/lightbox, count, and request behavior. No live E2E mutation was performed.

### 2026-09-28 - Loop 9B writer correlation correction - NO SCHEMA CHANGE (runtime only)

1. **DATE:** 2026-09-28
2. **TYPE:** APPLICATION / RUNTIME CORRECTION — **NOT A SCHEMA CHANGE**
3. **Reason:** the 9B writer could not safely terminalize a queued failure. `failed()` had no durable link to its own dispatch, so under a future `--tries > 1` with overlapping dispatches it could terminalize a *newer, still-retryable* failure belonging to a different job (Scenario E).
4. **This is NOT a new schema change.** The `queue_job_uuid` column and its partial index were already added and recorded in the entry above (0921 forward SQL plus the `040000` fresh-install migration). This correction only **consumes** that column. No new DB object was required; if one had been required, work would have stopped instead.
5. **Schema touched in this correction:** **NONE.** `database/sql/` and `database/migrations/` unchanged. Live column remains `uuid NULL`, no default, index `inspection_delivery_attempts_queue_correlation_index` unchanged. Live = SQL = migration = docs parity retained.
6. **UUID source:** `$this->job?->uuid()` — the actual Laravel 12.58.0 queue payload uuid (`Illuminate\Queue\Jobs\Job::uuid()`, inherited by `DatabaseJob`). No `Str::uuid()` for an already-queued execution; no inspection-id or attempt-id surrogate.
7. **Persisting:** `InspectionDeliveryRecorder::beginAttempt()` now takes the runtime uuid and writes it with an explicit `forceFill()` + `save()`. The column is deliberately **not** in the model's `$fillable`, so it can never be mass-assigned from a request. Non-canonical values are treated as *no correlation*, not coerced.
8. **Dispatch-level semantics:** automatic retries of one dispatch share the **same** `queue_job_uuid` with a new `attempt_number` and `source = automatic_retry`; a separately dispatched job (including a future 9C PO retry) gets a **new** uuid. A synchronous/direct execution has no queue job, so its value is `NULL` — safe, because such an execution can never reach `failed()`.
9. **Terminal invariant, now implemented:** `reconcileTerminalFailure()` requires **both** (a) the callback's own correlated latest attempt to exist and have `outcome = failed`, **and** (b) that same attempt to be the **globally latest** attempt for the inspection. Correlation alone is NOT sufficient.
10. **No unsafe fallback:** a queued terminal callback with a NULL uuid is **refused before any lookup**, logs a safe server-side warning, and leaves the summary unchanged. There is no globally-latest fallback for queued processing. The 6 NULL-correlated legacy rows therefore need no future queue processing; they are already terminal historical facts.
11. **Overwrite protection:** an older terminal callback cannot overwrite a newer delivery execution that is `pending`, `delivered`, or a newer separate dispatch whose failure is still retryable. `delivered_at` is never cleared or overwritten; `last_delivery_failure_category` is taken from the correlated attempt row so the summary always matches its own attempt. Idempotent — no increment, create, or delete.
12. **Recorder-open failure:** if `beginAttempt()` throws, delivery still proceeds and a warning is logged; `failed()` then finds no correlated attempt and changes nothing. No correlation is fabricated and no other dispatch's attempt is inspected. Incomplete observability is preferred over false business truth.
13. **Rows affected:** **0.** No `UPDATE`, `INSERT`, `DELETE`, `ALTER`, or migration ledger write. The 6 `legacy_reconciliation` attempts remain `queue_job_uuid = NULL`; 0 rows are non-NULL.
14. **Before:** 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts / 6 `legacy_reconciliation` / 0 correlated / 12 `failed_jobs`.
15. **After:** identical — 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts / 6 `legacy_reconciliation` / 0 correlated / 12 `failed_jobs`.
16. **Remote bridge unchanged:** sequence is still application mirror → parcel mirror (with `ST_AsText` geometry) → existing `field_jobs` status read → `field_jobs` payload → `field_jobs` upsert. Conflict keys `local_application_id`, `local_parcel_id`, `local_inspection_id` unchanged. Remote lifecycle preservation (FieldSync-owned `status`) intact. No payload writes `inspector_notes`, `current_step`, checklist, GPS, photos, or reviews. No `$tries`/`$backoff`/`$timeout`/`retryUntil` introduced.
17. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** **Controllers / routes / frontend:** **UNCHANGED.** 9C PO retry route deliberately **not** implemented.
18. **Vocabulary:** unchanged — 7 normalized failure categories, 3 outcomes, 4 sources, same safe messages. `failed_jobs` still never used as business delivery state.
19. **Validation:** 9 rollback-only PostgreSQL probes implementing the corrected algorithm verbatim — single terminal failure, newer independent pending, newer independent delivered, newer-retryable-failed race (Scenario E), globally-latest terminal, same-dispatch successive failures, same-dispatch retry success, idempotency, NULL-correlation refusal. All PASS, all rolled back. `Loop9bWriterCorrelationCorrectionTest` 22 tests / 72 assertions PASS; full Unit suite 380 tests / 1884 assertions PASS; `php -l` and `git diff --check` clean.
20. **Rollback:** revert the two production files and the three test files. No data reversal is needed because this correction writes nothing outside future delivery attempts.
21. **Status:** **LOOP 9B CORRELATION CORRECTION PASS — READY FOR FINAL 9B STACK REVIEW.** Stack `8c9cf03` → `7330e41` → correction is **UNPUSHED**; neither earlier commit was amended.
22. **Notes / risks:** `8c9cf03` and `7330e41` must not be amended. 9C/9D will hit direct overlap with upstream `4ec435f` and still require explicit Controller approval. Live writer E2E remains **DEFERRED** to an authorized fixture.

### 2026-09-28 - Loop 9B final stack review - NO SCHEMA CHANGE (docs-only + comment dedup)

1. **DATE:** 2026-09-28
2. **TYPE:** DOCUMENTATION / COMMENT-ONLY — **NOT A SCHEMA CHANGE**
3. **Reason:** the final pre-push stack review found the degraded-observability contract verified in code but not stated with its classification in the canonical docs, and found two stale status lines plus one duplicated code docblock.
4. **Schema touched:** **NONE.** `database/sql/` and `database/migrations/` unchanged. Live column, type, nullability, default and index unchanged. Live = SQL = migration = docs parity retained. Migration ledger untouched; `php artisan migrate` was **not** run.
5. **Locked contract added:** **`MONITORING FAILURE MUST NOT SILENTLY REDEFINE THE BUSINESS ASSIGNMENT.`** When `beginAttempt()` fails before an attempt row exists, the classification is **`DEGRADED OBSERVABILITY`** — **not** `DELIVERY FAILURE` and **not** `FULLY MONITORED SUCCESS`. Verified against the actual code: the failure is logged safely as a closed literal plus the integer `site_inspection_id`; no pending / delivered / failed state is fabricated because every recorder call sits behind `if ($attempt !== null)`; it is never reported as a monitored success for the same reason; it never inspects another dispatch's attempts because `failed()` refuses when uncorrelated; and a genuine remote failure is still logged and rethrown. A successful remote delivery with failed local recording may stay locally untracked until a later idempotent delivery execution converges it.
6. **No new `delivery_status` value.** Degraded observability is not a business state. The 3-value vocabulary is unchanged, and the local footprint is one `Log::warning` line. The stored `safe_message` vocabulary is unchanged and still cannot carry a body, URL, key or header.
7. **Only one `delivery_failed` writer confirmed:** a grep across all of `app/` returns exactly one occurrence that writes the value, `InspectionDeliveryRecorder::reconcileTerminalFailure()`, reachable only from the job's `failed()` hook. The bridge `catch` never writes it.
8. **Comment-only production change:** a duplicated `beginAttempt()` docblock in `app/Services/InspectionDeliveryRecorder.php` was collapsed to one, and a pointer to this contract was added to the surviving block. **No executable statement changed.**
9. **Stale status lines corrected:** the architecture doc previously described the stack as three unpushed commits and 9B as awaiting review. It now records the four-commit stack and names 9C as the next phase, **not** implemented.
10. **Rows affected:** **0.** Live baseline re-verified read-only before and after: 35 inspections / 6 `delivery_failed` / 0 `pending_delivery` / 0 `delivered` / 29 NULL / 6 attempts / 6 `legacy_reconciliation` / 0 correlated / 12 `failed_jobs` / 0 fabricated `delivered_at`.
11. **PostgreSQL probes:** the 9 rollback-only correlation probes were re-run during the final stack review. All PASS, all rolled back, baseline unchanged.
12. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** **Controllers / routes / frontend:** **UNCHANGED.**
13. **Validation:** full Unit suite 391 tests / 1939 assertions PASS; `php -l` clean on all 9 changed PHP files; `git diff --check` clean; artifact/secret scan clean.
14. **Status:** **LOOP 9B COMPLETE — READY TO PUSH.** 9C **NOT** started.
15. **Notes / risks:** no commit was amended. 9C carries Controller, route and UI implications plus a known `origin/master` overlap at `4ec435f`, and requires its own audit, merge and authorization gate.

### 2026-09-29 - Loop 9C-1 final review correction - NO SCHEMA CHANGE (naming only)

1. **DATE:** 2026-09-29
2. **TYPE:** APPLICATION CONTRACT CORRECTION — **NOT A SCHEMA CHANGE**
3. **Reason:** the final semantic review of the 9C-1 reader found a genuinely misleading response field. `c52ad8d` shipped a top-level `is_retry_available`, which reads as "a retry can happen now" but actually only reports the application-level role-and-ownership gate.
4. **Proven at runtime, not assumed.** An HTTP probe against live PostgreSQL, inside a rolled-back transaction, set an application owner to the requesting Planning Officer and read an application whose round had **no delivery record**. Result: `is_retry_available = true` with `delivery.can_retry = false`. A Planning Officer consuming that name would have been offered a control with nothing behind it.
5. **Correction applied.** `is_retry_available` → **`retry_actor_authorized`**; `retry_unavailable_reason` → **`retry_actor_unavailable_reason`**. `c52ad8d` was **not** amended; this is a separate bounded commit.
6. **`delivery.can_retry` is the authoritative per-round decision.** It is `retry_actor_authorized AND that round is a recorded delivery_failed`. A future UI must gate every retry control on the per-round value, never on the actor gate.
7. **Concept levels are no longer mixed.** `retry_actor_unavailable_reason` carries **actor-level** facts only ("a Planning Officer has not been assigned yet", "only available to the Planning Officer currently assigned to this application"). Round-level explanations stay in the round's own `state`, `label` and `message`. A test asserts the actor reason can never contain round-level wording.
8. **Both old names are asserted absent** from executable code, and the actor-gate distinction is documented in the controller itself, because 9C-2 is the consumer most likely to get it wrong.
9. **Inspector response verified safe.** Already an explicit `{id, name}` literal; confirmed against a real row as `{"id":25,"name":"Hanami Garduque"}` with no email, role, `is_active`, `handshake_key`, Supabase profile correlation or session metadata.
10. **Schema change:** **NONE.** **Runtime DB writes:** **NONE.** `database/sql/` and `database/migrations/` untouched, migration ledger untouched, no `audit_trail` row, no delivery attempt, no summary change.
11. **Runtime verification added.** DB-backed PHPUnit Feature tests **did not execute** — `phpunit.xml` pins sqlite while this PHP build has no `pdo_sqlite` — and are **not** reported as passing. Instead the **real route, middleware, controller, query and response shaping** were exercised against live PostgreSQL inside an always-rolled-back transaction, with `phpunit.xml` unmodified. 8 probes PASS: Admin 200, Planning Officer 200, Site Inspector 403, Guest 302→/login, both NULL populations byte-identical, real row 25 correct and unmutated, assigned PO `can_retry` true / other PO and Admin false, and both rounds of a two-round application returned in `inspection_id` order. **2 queries per request**, no N+1.
12. **No-write proof:** baseline re-read after every probe and unchanged — 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts / 0 `application_po_assignments` / 0 applications with a recorded owner / 12 `failed_jobs` / 0 fabricated `delivered_at` / 0 probe rows. Ownership assignment for the §G probe was rolled back: applications 3 and 104 are NULL again.
13. **Master overlap re-checked after fetch.** `origin/master` ADVANCED to `1307db8` ("extended the session lifetime from 30 to 120"), which touches `routes/web.php` by adding a `/ping` route near the top of the file. A three-way `git merge-tree` dry run confirms **`routes/web.php` still auto-merges cleanly**; the route region 9C-1 uses is untouched. The upstream conflict set grew to 4 files (`ApplicationController`, `TechnicalReviewController`, `Header.jsx`, `Sidebar.jsx`) — all pre-existing and none of them touched by 9C-1. **Nothing was merged, rebased or cherry-picked.**
14. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** **Existing business Controllers:** **UNCHANGED.** **UI:** **UNCHANGED.** **Retry:** **NOT implemented.**
15. **Tests:** `Loop9c1DeliveryStatusContractTest` 36 / 297, `Loop9c1DeliveryStatusReaderTest` 11 / 35, full Unit suite 427 / 2314. Loop 9A 33/133, 9A-R 16/77, 9B 36/152, 9B schema 20/47, 9B correction 22/72, 9B Scenario E 11/55 — all PASS.
16. **Status:** **LOOP 9C-1 READY TO PUSH. 9C is NOT complete; retry and UI are not implemented.**
17. **Next:** 9C-2 — Planning Officer Delivery Status UI.

### 2026-09-29 - Loop 9C-1 delivery status reader - NO SCHEMA CHANGE (read-only)

1. **DATE:** 2026-09-29
2. **TYPE:** APPLICATION / READ-ONLY — **NOT A SCHEMA CHANGE**
3. **Authorization:** **Team Leader APPROVED** proceeding with Loop 9C using the audited narrow scope.
4. **Reason:** a Planning Officer had no way to see whether an inspection round reached FieldSync. 9B made the state durable and queryable; 9C-1 exposes it under the existing application-read boundary.
5. **This is NOT a new schema change.** No column, table, index, CHECK, value, forward SQL or migration was added. `database/sql/` and `database/migrations/` untouched. Migration ledger untouched; `php artisan migrate` was not run.
6. **Runtime DB writes:** **NONE.** No `INSERT`, `UPDATE`, `DELETE` or DDL. No `audit_trail` row, no delivery attempt, no delivery summary change, no assignment change, and no job dispatch. The 9B writer and `InspectionDeliveryRecorder` are untouched.
7. **Columns read (pre-existing, 9A):** `site_inspections.delivery_status`, `last_delivery_attempt_at`, `delivered_at`, `last_delivery_failure_category`; `zoning_applications.assigned_planning_officer_id` for `can_retry` authority only; an aggregate `COUNT` of `inspection_delivery_attempts` per round.
8. **Presentation contract:** `pending_delivery` → "Pending Delivery"; `delivered` → "Delivered to FieldSync"; `delivery_failed` → "Delivery Failed"; `NULL` → `no_delivery_record` / **"No Delivery Record"**, an API token that is deliberately **not** a database value.
9. **NULL semantics locked.** NULL states only the **absence of a canonical Loop 9 record**. It is never rendered as pending, waiting, missing, or failed, because the NULL population contains both pre-bridge rounds and genuinely **delivered** FieldSync jobs with no fabricated local history. The reader does not call Supabase to distinguish them, and that distinction is not a delivery state.
10. **Defensive mapping:** an unrecognized stored `delivery_status` degrades to `no_delivery_record` rather than being guessed, and an unrecognized stored failure category normalizes to `unknown`. Guessing a state is the one way this reader could invent a failure that never happened.
11. **All 7 failure categories mapped server-side** to authored prose, so no exception message, PostgREST body, URL, credential, handshake key, SQL text, filesystem path or signed URL can reach a browser.
12. **Not exposed:** `queue_job_uuid`, `attempt_number`, `safe_message`, `source`, `failed_jobs`, inspector notes, signed URLs. Only an aggregate `attempt_count` is returned; full operational history is 9D Admin monitoring.
13. **Every round returned.** `$application->siteInspections()` (the `hasMany`) ordered by `id`; the singular `Parcel::siteInspection()` `latestOfMany()` relation is deliberately avoided because it collapses an original inspection and its reinspection into one badge. `site_inspections` stores no round number, so the primary key IS the round chronology — the same one `latestOfMany()` already relies on.
14. **Access boundary identical to `applications.show`.** Verified that `ApplicationController::show()` performs no per-application authorization at all: zero `authorize`, zero `Gate::`, zero `can(`, zero `abort(403`. The reader is asserted byte-identical in middleware. Being stricter would hide state from every caller, since **0 of 70** applications has a recorded Planning Officer owner.
15. **`can_retry` is server-computed and false everywhere today.** True only for a Planning Officer whose local user id equals a non-NULL `assigned_planning_officer_id`, on a round whose state is `delivery_failed`. `encoded_by`, `technical_reviews.reviewed_by` and `audit_trail.performed_by` are never consulted — all 70 applications have `encoded_by` pointing at a Planning Officer who does not own them.
16. **Query shape:** three queries regardless of round count — application row, ordered rounds with `inspector` eager-loaded (`id`, `name` only), and one aggregate attempt count. No per-round N+1.
17. **Timestamps:** existing `toIso8601String()` convention; NULL returned as NULL; nothing fabricated, no hand-written offset.
18. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** **Existing business Controllers:** **UNCHANGED** (`ApplicationController`, `TechnicalReviewController`, `WorkReassignmentController`, `SiteInspectionController`). **UI:** **UNCHANGED** (`Applications/Show.jsx` untouched). **No retry action, route, service or button exists.**
19. **Validation:** `Loop9c1DeliveryStatusContractTest` 33 / 284; `Loop9c1DeliveryStatusReaderTest` 11 / 35; full Unit suite 424 / 2299; `php -l` clean; `git diff --check` clean. 16 rollback-only PostgreSQL probes, all PASS, all rolled back, 0 probe leftovers.
20. **Live baseline before and after:** 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts (all `legacy_reconciliation`, all `queue_job_uuid` NULL) / 0 correlated / 12 `failed_jobs` / 0 fabricated `delivered_at` / 70 applications / 0 applications with a recorded PO owner — **unchanged**.
21. **Master overlap:** the new route is placed in a base region untouched by `origin/master` and uses the inline FQCN form already present in `routes/web.php`, so no import is added to the block upstream also edits. A three-way `git merge-tree` dry run confirms `routes/web.php` still auto-merges cleanly; the three pre-existing upstream conflicts are in files 9C-1 never touches. **Nothing was merged, rebased or cherry-picked.**
22. **Status:** **LOOP 9C-1 IMPLEMENTED — READY FOR REVIEW. NOT PUSHED.**
23. **Notes / risks:** 9C is **NOT complete**. Retry is **NOT** implemented. No UI exists yet. DB-backed Feature tests remain unrunnable locally (`phpunit.xml` pins sqlite while PHP has no `pdo_sqlite`), so state shaping is proven by the pure presenter unit contract plus rollback-only PostgreSQL probes. **Next: 9C-2 — Planning Officer delivery status UI.**

### 2026-09-29 - Loop 9C-2 delivery status UI - UI / READ-ONLY CHANGE (NO DB CHANGE)

1. **DATE:** 2026-09-29
2. **TYPE:** **UI / READ-ONLY CHANGE.** Not a database change.
3. **Authorization:** **Team Leader APPROVED** Loop 9C UI implementation.
4. **Reason:** the 9C-1 reader made Loop 9 delivery state durable and queryable, but no Planning Officer or Admin could see it. 9C-2 renders it on Application Detail.
5. **Database schema:** **NO CHANGE.**
6. **Forward SQL:** **NONE.** No SQL artifact was created for this phase, because there is no database change to record.
7. **Migration:** **NONE.**
8. **Existing 0921 mutation:** **NONE.** The 9C-1 `queue_job_uuid` column, index and the 9A schema were not touched.
9. **Supabase DB:** **NONE.**
10. **FieldSync DB:** **NONE.**
11. **Migration ledger:** **UNCHANGED.** `php artisan migrate` was not run.
12. **DB runtime write:** **NONE.** No `INSERT`, `UPDATE`, `DELETE` or DDL, and no `audit_trail` row. The browser verification was entirely read-only: the live baseline was re-read afterwards and is identical, including all 152 `audit_trail` rows.
13. **Scope:** ONE new read-only component `InspectionDeliveryStatusPanel.jsx`, ONE page wired in `Applications/Show.jsx` (+38/-0, purely additive), ONE contract test, and the three canonical docs. No Controller, route, service, model, job or database file changed.
14. **Visibility:** Admin **and** Planning Officer, read-only, on Application Detail, one panel per page, one row per inspection round, all rounds sourced from the 9C-1 reader.
15. **Delivery states shown:** `no_delivery_record` -> "No Delivery Record"; `pending_delivery` -> "Pending Delivery"; `delivered` -> "Delivered to FieldSync"; `delivery_failed` -> "Delivery Failed".
16. **Delivery state is NOT:** the inspection outcome, the application decision, or the FieldSync task lifecycle. `assigned` / `in_progress` / `completed` are never used as delivery labels.
17. **Round labelling:** `Inspection Round N` from the server's `round`, which is **presentation chronology only**. `inspection_id` is the stable persisted identity. "Original Inspection" / "Reinspection" are not rendered: the server sends no `round_kind`, and inferring it in the browser would be a client-side business inference.
18. **Failure text:** server-authored safe prose from `delivery.failure_message`. The raw `failure_category` token is never rendered; that belongs to 9D Admin monitoring.
19. **Attempt count:** worded as delivery bridge attempts, shown only when non-zero.
20. **NULL semantics unchanged in the UI:** "No Delivery Record" is neutral and is never presented as not-delivered, missing, pending or failed. The reader error is worded as a failure to LOAD and explicitly disclaims any delivery problem, so a failed request can never be misread as a failed delivery.
21. **Retry:** **NOT IMPLEMENTED IN 9C-2.** No retry button, no retry service, no retry POST route, no retry field referenced. The rendered panel contains no button and no link at all.
22. **Browser verification (real headless Chrome, real login, live PostgreSQL):** Delivery Failed **BROWSER VERIFIED**; No Delivery Record **BROWSER VERIFIED**; multi-round **BROWSER VERIFIED** (two rows, id-ascending, not collapsed to `latestOfMany()`); second page branch **BROWSER VERIFIED**; placement, accessibility (`role="status"`, `aria-live="polite"`, `aria-hidden` dot, zero icon-only states), responsiveness (no horizontal overflow at 420 px or desktop), single `GET` per page with no non-GET request, no browser Supabase/realtime, and a **browser-forced** reader-error state were all verified on rendered DOM.
23. **Honest gap:** `pending_delivery` and `delivered` are **0** across the whole live baseline, so those two states are **CONTRACT + BUILD VERIFIED ONLY**. No protected row was mutated and no delivery attempt was fabricated to manufacture them. They await an authorized writer/retry fixture or 9G E2E.
24. **Defect found by browser verification and corrected:** the first wiring mounted the panel above the page's status ternary as well as inside the else branch, so every non-Technical-Review application rendered two panels and issued two delivery requests. Source contract tests had passed; only real rendering exposed it. Each mount was moved into its own mutually exclusive arm and a contract test now asserts mutual exclusivity.
25. **Pre-existing unrelated issue, not fixed here:** one console 404 for `/geojson/land_use_plan.geojson`. That is the upstream map-source change in `Applications/Show.jsx`, deliberately left alone so 9C-2 stays delivery-panel only.
26. **Validation:** `Loop9c2DeliveryPanelContractTest` 48 / 531; 9C-1 contract 36 / 367; 9C-1 reader 11 / 35; 9A 33 / 133; 9A-R 16 / 77; 9B 36 / 152; 9B schema 20 / 47; 9B correction 22 / 72; 9B Scenario E 11 / 55; full Unit suite 475 / 2839. `npm run build` PASS. `php -l` clean. `git diff --check` clean. No `package.json` or lockfile change and no dependency installed.
27. **Master overlap:** `origin/master` did not advance (`1307db8`). A three-way `merge-tree` dry run confirms `Applications/Show.jsx` still auto-merges cleanly. The 4 pre-existing upstream conflicts (`ApplicationController`, `TechnicalReviewController`, `Header.jsx`, `Sidebar.jsx`) are untouched. Nothing was merged, rebased or cherry-picked.
28. **Status:** **LOOP 9C-2 IMPLEMENTED AND BROWSER VERIFIED.** 9C is **NOT** complete.
29. **Remaining (as recorded on 2026-09-29):** 9C-3 retry service + server-side POST action; 9C-4 retry UI; 9C-5 full regression and E2E closure. 9C-3 introduces business mutation and audit logging and requires its own bounded audit and implementation review.
30. **CLOSURE ANNOTATION (added by the Loop 9 final docs-only pass):** the three items above were all subsequently closed. **9C-3: DONE - server-side Planning Officer retry contract. 9C-4: DONE - Planning Officer Retry Delivery UI. 9C-5: DONE - controlled retry E2E verified through FieldSync.** See the entries dated 2026-09-30 for each. The wording of line 29 is deliberately left as it was originally written, because it is an accurate record of what was outstanding at the time 9C-2 closed.
## Future-entry template

Record all 14 fields used above. Never include secrets.

### 2026-09-25 — Loop 7B final signed-image delivery URL composition correction — application-layer only

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Final manual retest showed metadata/count/lightbox wiring passed but signed image bytes were broken.
3. **System:** iMAPS application source only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\iMAPS`; local iMAPS database and shared Supabase project unchanged.
5. **Business reason:** Deliver private Storage bytes through the required `/storage/v1/object/sign/...` route without changing bucket visibility or exposing credentials.
6. **Before state:** Supabase signing returned relative `/object/sign/...`; Laravel prepended only the project origin, producing an invalid delivery route that returned HTTP 404. Metadata, count, React mapping, and lightbox interaction were already user-confirmed as passing.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS, Storage policy, bucket, row, count, orphan, upload, or delete operation.
8. **After state:** Relative `/object/sign/...` responses are converted to `/storage/v1/object/sign/...`; already-prefixed relative responses and absolute signed responses are preserved; query/token text is retained.
9. **Verification query/result:** Read-only server-side sign-and-GET probe: HTTP 200, Content-Type `image/jpeg`, non-zero bytes YES, 114,840 bytes. Focused Loop 7 plus database-free Loop 6 tests: 39 passed / 240 assertions. PHP syntax, Vite build, and `git diff --check` passed.
10. **Related source/code:** `app/Services/SupabaseService.php`; `tests/Unit/Loop7SecurePhotoReaderContractTest.php`; canonical architecture and database change ledger.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded application diff if required.
12. **Change scope:** Application-layer URL composition only. FieldSync, Supabase schema, RLS, Storage, Auth, Edge Functions, metadata rows, counts, and historical values remain unchanged/deferred.
13. **Status:** **LOOP 7B SIGNED IMAGE FIX READY FOR FINAL USER RETEST; LOOP 7B MANUAL PASS NOT YET CLAIMED; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** The user must perform the final browser pixel retest using the existing authenticated session. No credentials, signed tokens, or session identifiers were recorded.

### 2026-09-25 — Loop 7B user browser acceptance and post-7B inspection viewer context audit

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Loop 7B secure private-photo reader browser acceptance, followed by parcel-PIN and map-focus viewer audit.
3. **System:** iMAPS application source and documentation only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\iMAPS`; local iMAPS database and shared Supabase project unchanged.
5. **Business reason:** Close Loop 7B private-photo browser acceptance and correct the two proven inspection-viewer context gaps without changing photo security or live data.
6. **Before state:** Loop 7B had server-verified signed image bytes and the user had not yet completed the final browser retest. The viewer displayed `N/A` for the fixture parcel PIN because Laravel did not fetch `supabase_parcels`; the Show map had no confirmed-inspection GPS focus path.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS, Storage policy, bucket, field job, inspection, parcel, photo, coordinate, or application data mutation.
8. **After state:** User-confirmed Loop 7B browser acceptance recorded for application `54`, local inspection `22`, field job `c47de697-114f-4c7c-b3aa-9b3c1c635b8e`: four photo entries, four rendered thumbnails, JPEG image requests, rendered lightbox image, HTTP 200 endpoint, normal refresh fetch, Admin path, Guest denial, Site Inspector denial, and no 419 regression. Post-7B viewer source now returns exact matching remote parcel context, prefers the local PIN with a cross-parcel guard, validates confirmed coordinates, renders a confirmed-site marker, and focuses the map safely when geometry is unavailable.
9. **Verification query/result:** User browser evidence accepted as authoritative. Focused iMAPS/Loop 6 database-free tests: 42 passed / 264 assertions. PHP syntax, Vite build, and `git diff --check` passed. Loop 7B browser acceptance is PASS; post-7B PIN/map retest remains pending.
10. **Related source/code:** `app/Services/SupabaseService.php`; `resources/js/Components/ParcelInspectionStatus.jsx`; `resources/js/Pages/Applications/Show.jsx`; `tests/Feature/Loop7SecurePhotoReaderTest.php`; `tests/Unit/Loop7SecurePhotoReaderContractTest.php`; canonical architecture and database change ledger.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded application diff if required.
12. **Change scope:** Loop 7B browser record plus bounded post-7B viewer projection/map-focus correction. FieldSync, Supabase schema, RLS, Storage, Auth, Edge Functions, data rows, coordinates, and photo storage remain unchanged.
13. **Status:** **LOOP 7B SECURE PRIVATE-PHOTO READER BROWSER E2E PASS; POST-7B VIEWER PIN/MAP RETEST PENDING; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** Deferred GIS/UI findings remain: `GET /geojson/land_use_plan.geojson` 404 and `Invalid LatLng object: (NaN, NaN)`. No signed URL token, credential, cookie, or session identifier is recorded.


### 2026-09-25 — Loop 7C FieldSync photo writer convergence — source only

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Loop 7C FieldSync photo writer convergence; eliminate competing new remote photo identities without migrating historical data.
3. **System:** FieldSync application source only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\imaps_fieldsync_main`; local PostgreSQL, shared Supabase, Storage, Auth, and RLS unchanged.
5. **Business reason:** Ensure all new and retried inspection photo writes use one deterministic durable identity and preserve optional evidence metadata.
6. **Before state:** `InspectionProvider.syncToServer()` was a reachable legacy new-write path using `photo_<local_photos.id>.jpg`, local UUID metadata IDs, public URLs, and omitted notes. The newer deterministic writer used job ID plus local path and UUIDv5 but still wrote public URL values for new metadata rows.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS policy, Storage policy, bucket, row, object, delete, migration, or data cleanup operation.
8. **After state:** `SupabaseService.uploadInspectionPhotos()` is the single reachable new remote photo writer. New metadata uses the raw durable `inspections/<field_job_id>/photo_<base64url(local_path)>.jpg` path and UUIDv5 row identity. Existing historical stored values are preserved on resume. The legacy `syncToServer()` path is a compatibility adapter through the same canonical writer and preserves `notes`, latitude, longitude, and capture time.
9. **Verification query/result:** Focused FieldSync writer/outbox/recovery/local-photo/resolver/presentation tests passed: 120 tests. Scoped analyze reported only four pre-existing style infos, with no errors or warnings. Dart format check and `git diff --check` passed. No live mutation was performed.
10. **Related source/code:** `lib/core/services/supabase_service.dart`; `lib/modules/inspection/providers/inspection_provider.dart`; `test/loop7_photo_writer_convergence_test.dart`; canonical bridge architecture and this ledger.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded source/test diff if required.
12. **Change scope:** Loop 7C source convergence only. Loop 7D recovery, Loop 7E delete/retention, and Loop 7F legacy/orphan reconciliation remain deferred. Historical rows, public URLs, objects, and orphan candidates remain untouched.
13. **Status:** **LOOP 7C FIELDSYNC PHOTO WRITER CONVERGENCE PASS — READY FOR LOOP 7D RECOVERY CONTRACT REVIEW; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** Identity stability is based on field-job ID plus stable local path, not image-byte hashing. Existing historical URL values are preserved when matching identities resume. No credentials, tokens, signed URLs, cookies, or session identifiers were recorded.

### 2026-09-25 — Loop 7D FieldSync photo recovery / ACK correctness — source only

1. **Date/time:** 2026-09-25.
2. **Loop / issue:** Loop 7D photo recovery, outbox ACK, resume, and local `is_synced` correctness.
3. **System:** FieldSync application source and documentation only. No PostgreSQL or Supabase mutation.
4. **Environment/project/database:** `C:\Users\Ralph Lauren\imaps_fieldsync_main`; local PostgreSQL, shared Supabase, Storage, Auth, RLS, and bucket configuration unchanged.
5. **Business reason:** Prevent a photo from being acknowledged when only one intermediate write succeeded, while preserving the Loop 7C canonical identity and legacy read compatibility.
6. **Before state:** The normal writer trusted metadata-row presence without checking the canonical object, silently skipped missing local files, and did not propagate local acknowledgements from outbox photo actions. Recovery conflated unknown download/existence failures with missing evidence.
7. **Exact SQL / operation:** **NONE.** No SQL, migration, RLS policy, Storage policy, bucket, row, object, delete, retention, migration, or data cleanup operation.
8. **After state:** Remote photo completeness requires the canonical Storage object plus the canonical UUIDv5 metadata row. A narrow HEAD check distinguishes `exists`, definite `missing`, and `unknown`; unknown remains retryable. Missing objects and missing metadata are repaired with the same canonical identity. Local photo IDs are acknowledged only after the writer/recovery contract completes. `photos_update` and `submit_inspection` share the contract; historical stored URLs are preserved.
9. **Verification query/result:** Focused FieldSync Loop 7D/7C/outbox/recovery/local-photo/resolver/presentation tests passed: **129 tests**. Fault injection covered Storage success/failure, metadata success/failure, patch failure, ACK loss, missing local file, object exists/missing, existence UNKNOWN, restart recovery, same-identity retry, and submit parity. Scoped analyze reported no errors or warnings; only style infos. Dart format check and `git diff --check` passed. No live mutation was performed.
10. **Related source/code:** `lib/core/services/supabase_service.dart`; `lib/core/services/db_helper.dart`; `lib/core/services/sync_outbox_service.dart`; `test/r4_photo_loopback_test.dart`; canonical bridge architecture and this ledger.
11. **Rollback SQL/steps:** Not applicable; no database change. Revert the bounded source/test/documentation diff if required.
12. **Change scope:** Loop 7D recovery/ACK correctness only. Loop 7E delete/retention and Loop 7F legacy/orphan reconciliation remain deferred. No historical rows, public URLs, objects, orphan candidates, or retention markers were migrated or deleted.
13. **Status:** **LOOP 7D FIELDSYNC PHOTO RECOVERY / ACK CORRECTNESS PASS — READY FOR USER DEVICE RECOVERY E2E / LOOP 7E CONTRACT REVIEW; LOOP 7 REMAINS OPEN.**
14. **Notes / risks:** User/device recovery E2E is still required for a physical capture/reconnect/restart scenario. No live Supabase mutation, credentials, tokens, signed URLs, cookies, or session identifiers were recorded.


### 2026-09-26 — Loop 7F legacy / orphan reconciliation audit — schema/data migration: NONE

1. **Date/time:** 2026-09-26 (local audit session).
2. **Loop / issue:** Loop 7F — legacy metadata URL and orphan Storage object reconciliation.
3. **System:** Shared Supabase project read-only SQL/catalog inspection plus documentation. No iMAPS application-source change and no FieldSync functional source change.
4. **Environment/project/database:** Shared Supabase project `laapipjyprmmaylunxib`; `public.field_job_photos`, `public.field_jobs`, `storage.objects` for bucket `inspection-photos`; iMAPS branch `fix/fieldsync-bridge-stability`, HEAD `8a28c8207717efa64e2ea9c66db531f4610c37d0`; FieldSync branch `main`, HEAD as recorded in the Loop 7F report.
5. **Business reason:** Re-check historical photo metadata and Storage object state without assuming the earlier audit counts, and classify findings before any cleanup decision.
6. **Before state:** Prior audit recorded 2 legacy URL metadata rows and 19 orphan Storage objects; live counts were not assumed.
7. **Exact SQL / operation:** Read-only `SELECT`/catalog queries only, including counts, path-form classification, existence joins, and aggregate orphan reference checks. **No DDL, DML, DELETE, UPDATE, RLS change, Storage policy change, migration, rename, cleanup SQL, or live mutation.**
8. **After state:** Unchanged. Live inventory: 87 `field_job_photos` rows; 85 canonical raw path values; 2 legacy Storage URL values; 0 malformed/unclassified values; 106 `inspection-photos` objects; 87 metadata rows with backing objects; 0 metadata rows missing objects; 19 objects with no metadata row; 0 duplicate canonical object paths; 0 duplicate logical metadata identities.
9. **Verification query/result:** All 87 metadata rows resolved to a derivable canonical object path and every resolved path had a backing Storage object. The 19 orphan objects are unreferenced by metadata and by current `field_jobs.photo_paths`; none resolves to an existing current `field_jobs` row. The 2 legacy rows are completed, submitted, non-rework historical evidence with backing objects and canonical object naming.
10. **Classification:** The 2 legacy rows are historical evidence and remain readable through the current iMAPS normalizer; no rewrite or ID migration is justified by the audit. The 19 orphans are classified **A — historical legacy orphan** based on date, missing job prefix resolution, and absence of metadata/job-path references; no failed-write cause is proven.
11. **Related source/code:** `app/Services/SupabaseService.php` reader normalization; FieldSync `lib/core/services/supabase_service.dart` canonical writer/recovery contract; Loop 7C/7D/7E tests; this ledger and the bridge architecture document.
12. **Rollback SQL/steps:** Not applicable; no database change.
13. **Change scope:** Documentation only in this entry. No sensitive URL, signed token, credential, cookie, or session identifier recorded.
14. **Status:** **LOOP 7F READ-ONLY RECONCILIATION PASS — CLEANUP DEFERRED; LOOP 7E REMOTE DELETE POLICY STILL DEFERRED; LOOP 7D DEVICE E2E DEFERRED.**
15. **Notes / risks:** Do not treat legacy URL format alone as a defect: the current iMAPS secure reader normalizes supported legacy Storage URL forms and validates the field-job prefix. Any future orphan deletion or legacy metadata rewrite requires separate explicit authorization, retention review, and a defined acknowledgement/rollback contract.


### 2026-09-26 — Loop 7G final closure / pre-commit review — schema/data migration: NONE

1. **Date/time:** 2026-09-26.
2. **Loop / issue:** Loop 7G final implementation-boundary review and selective-commit preparation.
3. **System:** Read-only source/test/documentation review across iMAPS and FieldSync. No application feature work, database, Supabase, Storage, RLS, Auth, or Edge Function mutation.
4. **Environment/project/database:** iMAPS `fix/fieldsync-bridge-stability` at `8a28c8207717efa64e2ea9c66db531f4610c37d0`; FieldSync `main` at `5119205ead383fa324330129b74a61e6332a42e0`; live Supabase/PostgreSQL unchanged.
5. **Business reason:** Freeze the completed Loop 7 implementation batch for selective commit while keeping device acceptance and policy follow-ups explicitly deferred.
6. **Before state:** Loops 7A–7F were individually implemented/verified with Loop 7D device E2E and Loop 7E remote deletion still open; historical 7F records were unchanged.
7. **Exact SQL / operation:** **NONE.** No DDL, DML, DELETE, UPDATE, RLS/Storage policy, migration, cleanup, bucket change, or live mutation.
8. **After state:** Documentation only. 7A PASS; 7B PASS; 7C PASS; 7D source/automated PASS with device E2E deferred; 7E local retention safeguards PASS with remote deletion deferred; 7F reconciliation PASS. The Loop 7 implementation batch is frozen for selective commit; deferred items are not marked PASS.
9. **Verification query/result:** Focused iMAPS Loop 7 suite passed 19 tests / 84 assertions. Prior FieldSync evidence retained: `flutter analyze` No issues found; Loop 7E suite 148 passed; Loop 7F focused suite 35 passed; `git diff --check` passed. Repository SQL still defines no `field_job_photos` DELETE policy and no `inspection-photos` Storage DELETE policy. The APK on disk predates Loop 7E edits and requires a fresh rebuild before device installation.
10. **Classification:** Implementation freeze safe = YES. Selective commit safe = YES. Full device acceptance = NO, deferred. Remote delete feature = NO, deferred policy. Post-7B PIN/map manual retest remains part of tomorrow's broader browser regression; it is not claimed as a separate manual PASS tonight.
11. **Related source/code:** iMAPS secure reader/controller/config/React files and Loop 7 tests; FieldSync canonical writer, recovery, outbox, delete/retention, and Loop 7 tests; this ledger and the canonical bridge architecture.
12. **Rollback SQL/steps:** Not applicable; no database change.
13. **Change scope:** These two documentation files only during Loop 7G. No stage, commit, push, device operation, or master sync.
14. **Status:** **LOOP 7 IMPLEMENTATION BATCH FROZEN FOR SELECTIVE COMMIT; LOOP 7D DEVICE E2E AND LOOP 7E REMOTE DELETE POLICY DEFERRED.**
15. **Notes / risks:** Preserve the 19 historical orphans and 2 historical legacy URL rows unchanged. Rosario municipal-boundary business rule remains a separate production-readiness follow-up. Do not use `git add .`; stage only the reviewed Loop 7 files and the separately recommended workspace-hygiene files.


### 2026-09-26 — Canonical database schema reconciliation (pre-merge) — forward SQL + fresh-schema corrections

1. **Date/time:** 2026-09-26.
2. **Loop / issue:** Pre-merge canonical database reconciliation. Establish ONE schema contract for the team before the controlled `origin/master` merge.
3. **System:** iMAPS PostgreSQL. Local `imaps_db_0921` + repository SQL + documentation. No application source behavior change.
4. **Environment/project/database:** Local `imaps_db_0921` (read-only audit, then one idempotent forward apply). Production was **not** queried or modified. iMAPS branch `fix/fieldsync-bridge-stability` at `7b45e6c5aa7438cb4e1c0814ad00fccfccc044f6`; `origin/master` at `926fd8f2ba523f22c8666eef1c473e9aca5fd259`.
5. **Business reason:** `origin/master` consolidated 28 incremental migrations into one `create_initial_schema` that does not reproduce the canonical schema. The team needs a forward update for existing 0921 databases and a corrected fresh-install baseline, without touching business data.
6. **Before state:** Local 0921 database already carried all 23 canonical `site_inspections` columns, the three-role `users_role_check`, the four-value `technical_reviews_decision_check`, `review_round`, and the `individual_fee*` columns. Gaps: no `site_inspections.parcel_id` foreign key, and no reference indexes beyond primary keys.
7. **Exact SQL / operation:**
   - `database/sql/2026_09_26_canonical_schema_reconciliation_0921_forward.sql` — forward-only, idempotent update for existing 0921-based databases.
   - `database/sql/2026_09_26_fresh_install_canonical_corrections.sql` — corrections for fresh databases created from the consolidated schema.
   - Applied to local `imaps_db_0921`: exit 0. Re-run (idempotency proof): exit 0. Verified in a transaction+ROLLBACK dry run before applying.
   - Fresh-install file verified against a **throwaway scratch database** built to mimic the pre-correction consolidated gaps, then dropped. The real database was never used for that test.
8. **After state:** `site_inspections` now has `site_inspections_parcel_id_foreign` → `parcels(id) ON DELETE CASCADE`; five reference indexes added; role and decision CHECK constraints re-asserted idempotently; lifecycle default confirmed as `assigned`. **No business row was modified**: `users` 6, `site_inspections` 35, `zoning_applications` 70, `technical_reviews` 76, `migrations` 13 — all identical before and after. `site_inspections` status distribution unchanged (`assigned` 34, `completed` 1).
9. **Verification query/result:** Read-only audit of `information_schema.columns`, `pg_constraint`, `pg_indexes` for `users`, `site_inspections`, `zoning_applications`, `technical_reviews`, `application_drafts`, `application_sequences`, `parcels`. Confirmed `users_role_check` permits exactly `Planning Officer`, `Admin`, `Site Inspector`; live roles are Admin 2 / Planning Officer 2 / Site Inspector 2. Confirmed `technical_reviews_decision_check` permits the four canonical values including `Requires Reinspection`.
10. **Classification of audited fields:** `assigned_notes` = CANONICAL assignment-instructions field. `site_inspections.remarks` = **RETIRED** per Team Leader decision (zoning-application context, not inspection instructions) — correctly absent locally; `origin/master`'s `SiteInspection::$fillable` still lists it and that is a stale entry. `site_inspections.recommendation` (singular) = LEGACY dead `$fillable` entry with no writer; `recommendations` (plural) is live. `users.supabase_uuid` = **NOT canonical** (zero readers/writers on both branches). `application_sequences` = **LEGACY, RETAINED**, not dropped.
11. **Related source/code:** `database/sql/2026_09_26_canonical_schema_reconciliation_0921_forward.sql`; `database/sql/2026_09_26_fresh_install_canonical_corrections.sql`; `docs/CANONICAL_DATABASE_SCHEMA.md`; `app/Models/SiteInspection.php`; `app/Http/Controllers/ApplicationController.php`; `app/Http/Controllers/TechnicalReviewController.php`; `app/Jobs/PushInspectionToSupabase.php`.
12. **Rollback SQL/steps:** Take a backup first. Both files are additive and contain no `DROP TABLE` and no data rewrite. Applied constraints can be reverted individually with `ALTER TABLE ... DROP CONSTRAINT`. The `migrations` ledger is never edited manually.
13. **Validation:** Focused schema/source contract suite passed — **45 tests, 154 assertions** (Loop 2 assignment-instructions ownership, Loop 3 assigning-officer provenance, Loop 3 controller capture, Loop 7 secure photo reader feature + contract). `git diff --check` clean.
14. **Status:** **CANONICAL SCHEMA ESTABLISHED AND APPLIED TO LOCAL 0921 — MASTER MERGE STILL BLOCKED ON THE MIGRATION-HISTORY DECISION.**
15. **Notes / risks:** `origin/master` was NOT merged. Nothing was pushed. `application_sequences` retained. No production access was used. Fresh-install gaps proven and closed: missing result/GPS/checklist columns, missing role CHECK, missing `parcel_id` FK, `status` default `Pending` vs canonical `assigned`, missing `review_round` and reinspection decision value, missing `individual_fee*`, missing indexes. See `docs/CANONICAL_DATABASE_SCHEMA.md` for the full contract and verification queries.

### 2026-09-28 - Final synthetic / test-data cleanup - DATA ROW CLEANUP ONLY (no schema change)

1. **Classification:** Verified data cleanup. **NOT a schema change, NOT a migration.** No `CREATE`, no `ALTER`, no `DROP`, no RLS change, no Storage change, no Auth change. Row deletion only, using frozen explicit-ID sets resolved from lineage evidence beforehand. The `migrations` ledger was not edited.
2. **AUTHORIZATION:** Option A — reuse of the deleted synthetic `APP` reference numbers was explicitly accepted by the Team Leader before execution.
3. **Backup / rollback:** A full `pg_dump` (custom format) of the application database was created **before any mutation** and stored outside the repository as a local recovery artifact. Complete pre-delete row contents (`row_to_json`) for all 305 deleted remote rows, per-table explicit UUID lists, and the 83 affected Storage object names were exported to a local directory outside Git. All deleted rows are exactly restorable from those artifacts. `application_sequences` is intentionally **not** restored or repaired.
4. **iMAPS rows (BEFORE → AFTER):** `zoning_applications` 72 → 70; `application_drafts` 75 → 9; `site_inspections` 35 → 35; `technical_reviews` 78 → 76; `audit_trail` 156 → 152; `parcels` 58 → 56; `application_status_tracks` 144 → 140; `application_po_assignments` 0 → 0; `site_inspection_assignments` 0 → 0.
5. **Deleted iMAPS rows:** synthetic applications `133 / APP-2026-00027` and `134 / APP-2026-00028`, their `technical_reviews` 77–78, `parcels` 65–66, `audit_trail` 157–160, `application_status_tracks` 136–139, and 66 proven-E2E `application_drafts`.
6. **Protected and verified intact afterwards:** `131 / APP-2026-00025`, `132 / APP-2026-00026`, `site_inspection 36` (still `completed`), `site_inspection 37` (still `assigned`), `technical_reviews` 75 and 76, all 44 legacy `DP-` / `LC-` / `ZA-` / `ZC-` applications, and 9 unresolved drafts that were deliberately retained.
7. **Supabase rows (BEFORE → AFTER):** `field_jobs` 84 → 9 (75 deleted); `field_job_photos` 88 → 5 (83 deleted); `field_job_reviews` 1 → 0 (1 Loop 8 validation artifact deleted); `supabase_zoning_applications` 88 → 15 (73 orphan-only synthetic mirrors deleted); `supabase_parcels` 88 → 15 (73 deleted); `profiles` 2 → 2 (**0 deleted**).
8. **Deletion safety:** every remote candidate satisfied all proven lineage conditions before execution — `local_inspection_id` absent from the local `site_inspections` range, `assigned_by_name IS NULL`, `assigned_by_imaps_user_id IS NULL`, and 0 sharing with any retained job. Candidate sets were frozen to explicit UUIDs (75 / 83 / 73 / 73) and executed inside a self-guarding transaction that raises and rolls back on any count or protected-state mismatch. One attempt aborted and rolled back completely on a cross-database assertion; post-abort counts confirmed no partial deletion.
9. **Accounts / identities:** no Auth account deleted, no profile deleted. The **Hubbie** profile is **retained** because it still owns retained jobs including the protected rounds 36 and 37. Remote jobs for local inspections 22, 23, 35, 36, 37 remain.
10. **Storage:** 107 objects before, 107 after, **0 deleted**. Current classification is deliberately three-way: **83** unreferenced after synthetic metadata cleanup (follow-up candidate, not deleted); **19** historical Loop 7F orphans (deferred, not deleted); **5** referenced by retained metadata (KEEP). The 83 and the 19 share the same current state but different provenance and must not be merged. Any future Storage deletion requires separate authorization.
11. **Reference numbers:** `APP-2026-00027` and `APP-2026-00028` are absent. Current retained APP maximum is `APP-2026-00026`. Because the generator derives the next value from retained application data, the next legitimate application **may reuse `APP-2026-00027`** — explicitly accepted. No retained application renumbered; `application_sequences` not repaired or incremented; no artificial reservation created; `getNextSequence()` not modified.
12. **Related source/code:** none. This entry records a data operation only.
13. **Rollback SQL/steps:** restore from the pre-cleanup `pg_dump` for iMAPS, and re-insert from the exported JSON row set for Supabase. The `migrations` ledger is never edited manually.
14. **Validation:** post-cleanup counts matched every expected value exactly; all protected identities re-verified present; `git diff --check` clean; no source, migration, schema, RLS, Storage, Auth, or FieldSync change.
15. **Status:** **FINAL SYNTHETIC / TEST-DATA CLEANUP COMPLETE.** Release impact: none. Authorization, RLS, and the private photo bucket were not modified.
16. **Notes / risks:** the final database export/package is **still deferred** until the remaining numbered loops and final acceptance are complete. The final team handoff remains outstanding.

### 2026-09-28 - Loop 9A inspection delivery monitoring schema - ADDITIVE SCHEMA (no behavior change)

1. **Classification:** schema + model foundation. **No application behavior change, no bridge change.** Delivery execution is byte-for-byte unchanged.
2. **Scope:** `site_inspections` current delivery summary (4 nullable columns) and the append-only `inspection_delivery_attempts` history table, with real FK, closed CHECK vocabularies, per-round attempt uniqueness, and two justified indexes.
3. **iMAPS DB (existing 0921):** forward-safe additive SQL `database/sql/2026_09_28_add_inspection_delivery_monitoring.sql`, applied through the established explicit reviewed path with `--path`-equivalent direct execution. **`php artisan migrate` was NOT run** and the `migrations` ledger was not edited. Result: 4 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, 1 `CREATE TABLE IF NOT EXISTS`, guarded `DO` blocks for 7 CHECK/UNIQUE/FK constraints, 2 `CREATE INDEX IF NOT EXISTS`. Exit 0.
4. **Fresh database:** `database/migrations/2026_09_28_030000_add_inspection_delivery_monitoring.php` reproduces the identical contract, including `ON DELETE CASCADE`, the unique constraint, both indexes, and all 8 CHECK constraints. The old consolidated initial schema was **not** modified.
5. **ON DELETE choice, verified not assumed:** the canonical precedent `site_inspection_assignments` (operational history owned by one round) uses `ON DELETE CASCADE`, while `technical_reviews.reviewed_site_inspection_id` (a business decision record) uses `SET NULL`. Delivery attempts are operational history, so CASCADE was chosen. A real FK is used; no polymorphic `(type, id)` shape.
6. **No historical backfill:** all 35 pre-existing `site_inspections` rows kept `delivery_status = NULL`, and `inspection_delivery_attempts` is empty (0 rows) after the apply. Verified in-transaction: 0 rows carry any non-NULL delivery value, 0 attempt timestamps, 0 delivered_at, 0 failure categories.
7. **Preserved values, verified identical before and after:** `site_inspections` 35 rows; `status` 34 `assigned` + 1 `completed`; 35 with inspector; 27 with parcel; 21 distinct applications; `technical_reviews` 76 with 0 `reviewed_site_inspection_id`; `application_po_assignments` 0.
8. **Exclusions preserved:** inspections 3–21 and 24 (20 pre-bridge historical records) remain NULL permanently. Inspections 25–30 (the 6 proven post-bridge delivery failures) also remain NULL in 9A; their `NULL -> delivery_failed` reconciliation is a separately authorized execution step and was NOT performed. No automatic resend.
9. **Models:** new `App\Models\InspectionDeliveryAttempt` (fillable, datetime/integer casts, `siteInspection()` relation, vocabulary constants and accessors) and `SiteInspection::deliveryAttempts()` plus delivery timestamp casts. `delivery_status` and friends are deliberately **excluded from `$fillable`**: delivery state is writer-controlled, never request-driven, and mass-assigning it before a writer exists would be an unguarded path.
10. **Safety:** no column stores a raw exception dump, credential, token, header, connection string, handshake key, or signed URL. `safe_message` is a short normalized user-facing explanation. Laravel `failed_jobs` is explicitly not used as a business delivery record.
11. **Bridge stability (Team Leader condition):** `PushInspectionToSupabase` diff NONE; `ApplicationController`, `TechnicalReviewController`, `WorkReassignmentController`, `SiteInspectionController` diff NONE; `SupabaseService` diff NONE; `routes`/`bootstrap`/`config`/`resources/js` diff NONE; FieldSync untouched at `bbabd4d`. No new Controller was created — `DeliveryMonitoringController` and `DiagnosticReportController` belong to later phases and require a separate Controller checkpoint.
12. **Validation:** `Loop9aDeliverySchemaContractTest` 31 tests / 110 assertions PASS. Full Unit suite **284 tests / 1513 assertions PASS**. `php -l` clean on all three new PHP files.
13. **Live behavioural proof:** 19 constraint rules were exercised against real PostgreSQL inside a single transaction that was **rolled back** — valid/invalid `delivery_status`, valid/invalid `source`, valid/invalid `outcome`, `failed` requiring a category, `delivered` refusing a category, invalid category value, duplicate attempt number on the same round rejected, same attempt number on a different round allowed, FK to a missing round rejected, `attempt_number` 0 rejected, `pending` needing no category, and completed outcomes requiring `completed_at`. All 19 behaved exactly as designed; the rollback was confirmed to leave 0 attempt rows and 0 non-NULL delivery values.
14. **Environment limitation (reported, not worked around):** DB-backed Feature tests cannot execute locally because PHP has `pdo_pgsql` but not `pdo_sqlite`, so `RefreshDatabase` on in-memory SQLite fails with "could not find driver". Production constraints were **not** weakened to work around this; source-level contract tests were used, and the behavioural proof in point 13 was run against the real engine.
15. **Rollback SQL/steps:** the forward script is purely additive; reverting means dropping the two indexes, the attempt table, and the four summary columns, each guarded by `IF EXISTS`. The migration's `down()` performs exactly that. The `migrations` ledger is never edited manually.
16. **Status:** **LOOP 9A COMPLETE — schema foundation implemented and verified.** No writer instrumentation, no PO visibility/retry, no Admin monitoring, no diagnostic backend, no E2E. **Loop 9 is NOT complete.** Next: **9B — Delivery Writer Instrumentation.**

### 2026-09-28 - Loop 9A-R exact legacy delivery failure reconciliation (inspections 25-30) - DATA-ONLY RECONCILIATION

1. **Date:** 2026-09-28
2. **Type:** DATA-ONLY RECONCILIATION
3. **Schema change:** **NO** — no `CREATE`, no `ALTER`, no index, no constraint. Loop 9A's schema was already in place and was not touched.
4. **SQL artifact:** `database/sql/2026_09_28_reconcile_legacy_delivery_failures_25_30.sql`
5. **Fresh-install migration:** **NOT APPLICABLE / DO NOT APPLY.** A fresh database has no historical inspections 25-30. This artifact is deliberately NOT placed in `database/migrations/` and must never enter seed behaviour.
6. **Migration ledger:** **UNCHANGED.** No ledger row was created or edited, and `php artisan migrate` was not run.
7. **Backup:** a fresh custom-format `pg_dump` of `imaps_db_0921` was taken **after** the 9A schema change and **before** this data patch, stored outside the repository. Exit 0, 8.73 MB. Not committed.
8. **Targets:** exactly inspections `25, 26, 27, 28, 29, 30`, addressed only as `WHERE id IN (25,26,27,28,29,30)`. No `BETWEEN` range predicate, no date predicate, no inspector-only predicate, no status-only predicate. Attempt rows use explicit `VALUES`.
9. **Before:** 6 targets with `delivery_status = NULL`; `inspection_delivery_attempts` = 0 rows; `failed_jobs` = 12 rows; `site_inspections` = 35.
10. **After:** 6 targets `delivery_failed`; 6 `legacy_reconciliation` attempt rows; `failed_jobs` = 12 (retained); `site_inspections` = 35, of which 6 `delivery_failed` and 29 `NULL`.
11. **Lineage (1:1, from the serialized queue payload, not chronology):** `failed_jobs.payload` carries `App\Jobs\PushInspectionToSupabase -> inspection -> App\Models\SiteInspection{id}`. Inspection 25 <- fj 7, 26 <- 8, 27 <- 9, 28 <- 10, 29 <- 11, 30 <- 12. Exactly one record per inspection; no target lacks a record. All six raise the same terminal failure from `resolveSupabaseUserId()`: the local inspector account had no mapped Supabase profile via `handshake_key`. Normalized: `inspector_mapping_unresolved`. The fact that the mapping resolves today does not rewrite the historical cause.
12. **Values written:** `delivery_status = 'delivery_failed'`, `last_delivery_attempt_at` = the exact mapped `failed_jobs.failed_at`, `delivered_at = NULL`, `last_delivery_failure_category = 'inspector_mapping_unresolved'`. Attempt rows use `attempt_number = 1`, `source = 'legacy_reconciliation'`, `outcome = 'failed'`, with `attempted_at`/`completed_at` set to the same exact historical `failed_at`.
13. **History limitation (documented in the artifact and the test):** each attempt row is ONE reconstructed business-level terminal delivery event, because the pre-Loop-9 system had no attempt instrumentation. `attempt_number = 1` does **not** mean Laravel internally attempted the job only once, and no internal automatic-retry history was inferred from `failed_jobs`. `created_at` deliberately keeps its real insertion time (2026-09-28) and was **not** backdated to September.
14. **Historical pre-bridge:** inspections `3-21` and `24` were excluded and asserted untouched; all 20 remain `delivery_status = NULL`. No attempt row references them.
15. **Already-matched rounds:** inspections `22, 23, 31, 32, 33, 34, 35, 36, 37` were **not** given fabricated delivery history and remain `NULL`. A null state for a known-delivered historical job is the honest value; Loop 9B establishes delivery state prospectively.
16. **Remote delivery:** **NONE.** No resend, no retry, no dispatch, no remote call. Supabase read-only verification before and after: `field_jobs` for local inspections 25-30 = 0; `field_jobs` 9, `field_job_photos` 5, `field_job_reviews` 0, `supabase_zoning_applications` 15, `supabase_parcels` 15, `profiles` 2, storage objects 107 — identical before and after.
17. **`failed_jobs`:** retained unchanged at 12 rows. It remains generic queue infrastructure and the original technical evidence; `inspection_delivery_attempts` is the canonical **business** delivery history. The two are deliberately distinct records.
18. **PO ownership:** unchanged. All six applications keep `assigned_planning_officer_id = NULL`; `encoded_by` was not read as ownership; no `application_po_assignments` row was written. Recovery remains a two-step business action (Admin initial PO assignment, then PO Technical Retry) and belongs to later phases.
19. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED** (`bbabd4d`). **Controllers:** **UNCHANGED.** **Bridge writer:** **UNCHANGED** — `PushInspectionToSupabase`, `ApplicationController`, `TechnicalReviewController`, `WorkReassignmentController`, `SupabaseService`, and `routes` all diff NONE.
20. **Business regression check (identical before and after):** inspection status 34 `assigned` + 1 `completed`; 35 with inspector; 27 with parcel; 21 distinct applications; 8 with assignment notes; `technical_reviews` 76 with 0 `reviewed_site_inspection_id`; application statuses unchanged; 0 PO pointers; 0 PO assignment rows.
21. **SQL safety:** one transaction with **5 pre-guards** (six targets exist; all six have no existing delivery state; no existing attempts; protected pre-bridge rows still clean; attempt number 1 free) and **7 post-assertions** (six rows correctly marked; six correct attempt rows; attempt timestamps match the mapped `failed_at`; summary timestamps agree with their attempts; exactly 6 total attempt rows; pre-bridge unmodified; matched rounds not given fabricated history; exactly 6 rows carry delivery state). Any failure raises and aborts the transaction, so a partial reconciliation is impossible. Execution output: `BEGIN`, 5x `DO`, `INSERT 0 6`, `UPDATE 6`, `DO`, `COMMIT`, exit 0.
22. **Validation:** `Loop9arLegacyDeliveryReconciliationContractTest` **16 tests / 77 assertions PASS**; Loop 9A suite **33 tests / 131 assertions PASS**; full Unit suite **302 tests / 1611 assertions PASS**; `php -l` clean; `git diff --check` clean.
23. **Status:** **LOOP 9A-R COMPLETE - six previously silent delivery failures now have durable, queryable `delivery_failed` business state plus one `legacy_reconciliation` history row each.** No resend. **Visibility boundary:** no Planning Officer or Admin interface displays this state yet - PO visibility/retry arrives in 9C and Admin monitoring in 9D. Loop 9 is NOT complete. Next: **9B - Delivery Writer Instrumentation.**

### 2026-09-28 - Loop 9B delivery writer instrumentation - RUNTIME BEHAVIOUR ONLY (no schema change)

1. **Classification:** instrumentation of the existing bridge writer. **No schema change, no migration, no SQL artifact, no Controller change, no route change, no frontend change, no Supabase change, no FieldSync change.** The 9A schema already satisfied every requirement; no revision was needed.
2. **Files:** `app/Jobs/PushInspectionToSupabase.php` (modified), `app/Services/InspectionDeliveryRecorder.php` (new), `tests/Unit/Loop9bDeliveryWriterContractTest.php` (new). Nothing else.
3. **Remote bridge behaviour preserved exactly:** the six-step remote sequence and all three conflict keys (`local_application_id`, `local_parcel_id`, `local_inspection_id`) are unchanged; the `field_jobs` status pre-read and `$existingJob['status'] ?? 'assigned'` preservation are unchanged; `inspector_notes`, photos, photo metadata, reviews, `current_step`, checklist, GPS and findings remain absent from the payload; no compensating remote `DELETE` was added.
4. **Configuration guard corrected:** the missing-credential throw previously escaped the `try` block and could never be classified. It now participates in the guarded lifecycle and yields `configuration_failure` with the safe message "iMAPS bridge configuration is incomplete."
5. **Runtime DB behaviour (new):** every prospective writer execution opens an `inspection_delivery_attempts` row (`pending`) and sets `site_inspections.delivery_status = 'pending_delivery'`; success closes it as `delivered` and sets `delivered`; a bridge failure closes it as `failed` with a normalized category; the new `failed(Throwable)` hook sets the terminal `delivery_failed` summary.
6. **Attempt numbering:** allocated inside a short local transaction holding a `FOR UPDATE` lock on the parent `site_inspections` row, with `UNIQUE(site_inspection_id, attempt_number)` as a backstop and bounded retry on conflict. No naked `MAX()+1` outside the lock.
7. **Transaction boundaries:** the pending transaction commits before any network call; no local transaction is held open across HTTP. Success and failure each finalize in their own short transaction.
8. **Terminal failure semantics:** Laravel 12.58.0 runs `queue:work` with `--tries=1`, so the first throw is currently terminal (verified in framework source: `attempts() >= maxTries` triggers `failJob()` on the first run, and the release branch is skipped). 9B does **not** hard-code this: `handle()` never sets the terminal summary, and `failed()` is the authority, so correctness holds if tries are ever raised. `failed()` derives its decision from durable state only, because it may run against a reconstructed command.
9. **Concurrency protection:** the latest `attempt_number` wins — a newer `pending` or `delivered` attempt prevents an older failure from overwriting the summary. Close operations are idempotent.
10. **`delivered_at` semantics:** written only when currently NULL, so it records the FIRST successful remote delivery and survives later re-pushes; subsequent successes are visible in attempt history.
11. **Failure normalization:** closed 9A vocabulary, chosen from HTTP status, PostgREST `code`, and exception class where available. Only fixed normalized prose is stored; no response body, exception text, URL, key, header, handshake key, or signed URL reaches the database.
12. **Attempt source:** optional second constructor argument keeps all five dispatch sites byte-identical. `attempts() <= 1` -> `initial_dispatch`, `> 1` -> `automatic_retry`, explicit value used as-is for 9C. `initial_dispatch` means "first queue execution of that dispatched job", NOT "new application or inspection". `legacy_reconciliation` is never produced by the writer.
13. **Historical rows untouched:** inspections 25-30 remain `delivery_failed` with 6 `legacy_reconciliation` attempts; 3-21 and 24 remain NULL; 22, 23, 31-37 remain NULL. No delivered history was fabricated.
14. **Queue configuration:** no `$tries`, `$backoff`, `$timeout`, or `retryUntil()` was introduced.
15. **Validation:** `Loop9bDeliveryWriterContractTest` 36 tests / 150 assertions PASS; full Unit suite 338 tests / 1761 assertions PASS; 15 rollback-only PostgreSQL probes PASS (allocation sequence, duplicate rejection, cross-inspection numbering, row lock, delivered/failed close idempotency, newer-pending and newer-delivered protection, 9A CHECK still enforced, historical rows intact); `git diff --check` clean.
16. **Live state after 9B:** unchanged at 35 inspections / 6 `delivery_failed` / 29 NULL / 6 `legacy_reconciliation` attempts / 12 `failed_jobs`.
17. **Live writer E2E:** **DEFERRED TO AN AUTHORIZED FIXTURE / 9G.** No production fixture was manufactured.
18. **Rollback:** revert the two production files and the test; no data reversal is required because 9B only creates prospective rows, and `down()`-style cleanup is not needed for correctness.
19. **Status:** **LOOP 9B IMPLEMENTED — awaiting review.** 9C NOT started.
20. **Notes / risks:** upstream `4ec435f` already modified `ApplicationController`, `TechnicalReviewController`, `SiteInspectionController`, `routes/web.php` and related UI. 9B has zero overlap, but 9C and 9D will require a fresh overlap review and explicit Controller approval.

### 2026-09-28 - Loop 9B safety revision: queue-dispatch correlation - ADDITIVE SCHEMA

1. **DATE:** 2026-09-28
2. **TYPE:** ADDITIVE LOOP 9B SAFETY SCHEMA REVISION
3. **Reason:** queue terminal-correlation safety. The 9B review found before push that a terminal queued command could not be correlated with its own durable attempt rows, which is ambiguous under future retries and overlapping dispatches.
4. **Existing 0921:** **APPLIED** through the established explicit reviewed path. `php artisan migrate` was **NOT** run and the `migrations` ledger was **NOT** edited.
5. **Forward SQL:** `database/sql/2026_09_28_add_delivery_attempt_queue_correlation.sql`
6. **Fresh-install migration:** `database/migrations/2026_09_28_040000_add_delivery_attempt_queue_correlation.php`
7. **Schema added:** exactly one nullable column plus one index.
   - `inspection_delivery_attempts.queue_job_uuid uuid NULL` — the stable Laravel queue payload UUID of the dispatch that produced the attempt. **Not unique**: retries of one dispatch share it. No default.
   - `inspection_delivery_attempts_queue_correlation_index` — partial `(site_inspection_id, queue_job_uuid, attempt_number DESC) WHERE queue_job_uuid IS NOT NULL`, serving the correlated terminal lookup.
   - **No CHECK** was added; see point 9.
8. **Type evidence:** `uuid`, not `varchar(36)`. Laravel 12.58.0 `Queue::createObjectPayload()` sets `'uuid' => (string) Str::uuid()`; `Job::uuid()` is a concrete accessor inherited by the database driver; `DatabaseJob::release()` re-inserts the same payload so the value is stable across automatic retries. All 12 live `failed_jobs` payload uuids are canonical, single-length, and cast cleanly to the PostgreSQL uuid type.
9. **No CHECK on prospective sources, deliberately.** A NULL can only come from legacy reconciliation or a synchronous execution with no queue job, and a synchronous execution can never reach `failed()`, so it can never terminalize a summary. A NOT NULL would add fragility for no safety gain and would weaken production correctness to suit a test path.
10. **Rows affected:** **0 business rows rewritten.** No `UPDATE`, no `DELETE`, no `INSERT`, no `DROP`, no `TRUNCATE`, no uuid backfill, no `delivery_status` change, no attempt-history rewrite.
11. **Historical attempt rows:** the 6 `legacy_reconciliation` attempts remain `queue_job_uuid = NULL`. No uuid was derived from `failed_jobs`; 9A-R deliberately stored no queue correlation and backfilling now would fabricate business history.
12. **Before:** 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts / 6 `legacy_reconciliation` / 12 `failed_jobs`; column absent.
13. **After:** 35 inspections / 6 `delivery_failed` / 29 NULL / 6 attempts / 6 `legacy_reconciliation` / 12 `failed_jobs`; column present; 0 correlated, 6 NULL.
14. **Supabase:** **UNCHANGED**. **FieldSync:** **UNCHANGED**. **Controllers / routes / frontend / bridge writer:** **UNCHANGED** relative to `8c9cf03`.
15. **Validation:** `Loop9bQueueCorrelationSchemaContractTest` 20 tests / 47 assertions PASS; full Unit suite 358 tests / 1808 assertions PASS; `php -l` clean; `git diff --check` clean. Rollback-only PostgreSQL probes confirm the correlated rule returns `stays pending_delivery` for Scenario E where the globally-latest-only rule wrongly returned `delivery_failed`, and that retries may share one uuid while separate dispatches keep distinct uuids.
16. **Live = SQL = migration = docs parity:** column type, nullability, absence of default, index name, index columns and partial predicate all verified identical across the live catalog and both artifacts.
17. **Status:** **SCHEMA PRECONDITION COMPLETE.** The writer correction that consumes this column is a separate task. `8c9cf03` remains unpushed.

### 2026-09-30 - Loop 9C-3 Planning Officer technical delivery retry - server-side closure - schema/data migration: NONE

1. **Loop / issue:** Loop 9C-3 - Planning Officer Technical Delivery Retry. 9C-1 (delivery status reader), 9C-2 (delivery status UI) and the 9C-3 server contract (atomic retry service + POST action) were implemented; this entry records the database-facing result of the 9C-3 closure.
2. **Exact SQL / operation:** **NONE.** No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, `UPDATE` or `DELETE` was executed against any database in this phase. Canonical was read only.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **What an ACCEPTED runtime retry writes** (behaviour, not applied here): `site_inspections.delivery_status` moved `delivery_failed` -> `pending_delivery`; one `audit_trail` row with action `DELIVERY_RETRY_QUEUED`; one `jobs` row carrying the `planning_officer_retry` source.
5. **Atomicity:** those three writes occur in one local transaction holding a `zoning_applications` row lock taken before the `site_inspections` row lock. An infrastructure failure unwinds all three; there is no compensation path.
6. **`inspection_delivery_attempts`:** **unchanged at request time.** The HTTP request and the retry service never insert an attempt row. Attempt history remains owned by the Loop 9B recorder, which writes it later when the remote side acts - so a queued retry that never runs leaves no fabricated attempt.
7. **Authority:** current assigned Planning Officer only, via `zoning_applications.assigned_planning_officer_id`. `encoded_by`, `technical_reviews.reviewed_by` and `audit_trail.performed_by` are deliberately not consulted as ownership evidence.
8. **Rows affected by this phase:** **0.** The database was opened read-only for verification.
9. **Before:** 70 applications / 35 inspections / 6 `delivery_failed` / 0 `pending_delivery` / 0 `delivered` / 29 NULL / 6 attempts / 0 `DELIVERY_RETRY_QUEUED` / 0 jobs / 16 ledger rows.
10. **After:** **identical.** 70 / 35 / 6 / 0 / 0 / 29 / 6 / 0 / 0 / 16. Sequences unchanged at 141 / 73 / 37 / 25 / 194 / 78 / 19.
11. **Data limitation, recorded not fixed:** 0 applications currently carry `assigned_planning_officer_id`, and both assignment tables are empty, so no persistent row is currently eligible for Planning Officer retry. Historical owners were not backfilled and ownership was not inferred from `encoded_by`, because either would fabricate or misassign business history. Eligibility was not relaxed. Establishing legitimate ownership is a prerequisite for the later controlled E2E.
12. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** Remote Supabase retry execution is **NOT YET E2E VERIFIED**.
13. **Validation:** `Loop9c1DeliveryStatusContractTest`, `Loop9c2DeliveryPanelContractTest`, `Loop9c2RetryActionContractTest`, `Loop9c3RetryEligibilityContractTest` 139 tests / 953 assertions PASS; `Loop9c1DeliveryStatusReaderTest` 11 tests / 49 assertions PASS; full Unit suite 530 / 2895 PASS; `php -l` clean; `git diff --check` clean. The PostgreSQL / database-queue atomicity, double-submit and refusal-path probes were **SKIPPED - PREVIOUSLY RUNTIME-PROVEN; NO NEED TO RISK CANONICAL**; this branch carries no database-safety guard, so re-running a database-writing probe would put canonical at risk to reproduce evidence that already exists.
14. **Status:** **SERVER-SIDE RETRY CONTRACT CLOSED.** Retry UI (9C-4) and remote retry E2E (9C-5) remain outstanding.
15. **CLOSURE ANNOTATION (added by the Loop 9 final docs-only pass):** line 14 is the accurate status **as at 2026-09-30** and is preserved unchanged as chronology. Both items it names as outstanding were subsequently closed. **9C-4: DONE - Planning Officer Retry Delivery UI.** **9C-5: DONE - controlled retry E2E verified through FieldSync**, proven from a real browser-originated click on `APP-2026-00028` / inspection 39 through the server, the queue worker and the recorder to Supabase and FieldSync with no duplicate remote task. Remote Supabase retry execution is therefore **no longer unverified**, superseding line 12 of this entry as at the 9G audit.

### 2026-09-30 - Loop 9C-5 blocker fix - parcel point bridge correction - schema/data migration: NONE - BRIDGE WRITER CORRECTION

1. **Loop / issue:** Loop 9C-5 blocker. `PushInspectionToSupabase` pushed a cadastral MULTIPOLYGON into `supabase_parcels.geom`, which the remote `sync_parcel_latlng()` trigger cannot accept, so every PIN-matched inspection delivery failed remotely and no FieldSync task was ever created.
2. **Classification:** **BRIDGE WRITER CORRECTION.** The remote contract is unchanged; the writer was made to conform to it.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **Exact SQL / operation:** **NONE.** No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, `UPDATE` or `DELETE` was executed against any database. Canonical was read only, for a proof.
5. **Defect:** the writer preferred `ST_AsText(land_parcels.geom)` whenever a parcel's `property_index_number` matched `land_parcels`. That column is `geometry(MultiPolygon,4326)`, and 4177 of 4177 rows are `MultiPolygon`. The remote `supabase_parcels.geom` is `geometry(Geometry,4326)` and so accepted the value, but the `sync_parcel_latlng()` BEFORE INSERT OR UPDATE trigger derives `latitude` and `longitude` with `ST_X()` / `ST_Y()`, which accept only POINT. The remote insert failed with `SQLSTATE XX000: Argument to ST_Y() must have type POINT`, and the exception aborted the whole inspection push at the parcel step.
6. **Observed as:** `failed_jobs` id 13, uuid `fdc8a204-958e-427c-b0aa-eafaf134269b`, `App\Jobs\PushInspectionToSupabase`, failed 2026-09-30 18:04:45, raised at `PushInspectionToSupabase.php:174` for application `APP-2026-00027` / inspection round 38 / parcel 74. The local rows were already committed, so the application, parcel and inspection existed with no FieldSync task and no delivery attempt.
7. **Correction:** `supabase_parcels.geom` is now built solely from the stored parcel pin as `POINT(<longitude> <latitude>)`, longitude first, which is the WKT form the fallback branch and all pre-existing remote rows already used. The `land_parcels` geometry lookup was removed from the payload path.
8. **Rejected alternatives:** `ST_Centroid` and `ST_PointOnSurface` were considered and rejected. For a concave cadastral lot either can sit away from the officer's selected site pin, which would move the GPS proximity threshold an inspector is judged against. 14 of the 15 pre-existing remote rows are byte-equal to the stored `parcels.latitude`/`longitude`, so the stored pin is the existing de facto contract.
9. **Local cadastral geometry is unchanged.** `land_parcels.geom` remains `geometry(MultiPolygon,4326)` and local-only. It is still what the cadastral map and the land-use spatial lookup read. It is simply no longer a FieldSync transport.
10. **Null contract:** if either stored coordinate is absent the geometry stays `NULL`. No centroid, no `(0,0)`, no municipal default, and no coordinate borrowed from another parcel. 56 of 57 local parcels carry coordinates, so this is the rare case.
11. **`distance_to_parcel_boundary` is unchanged and NOT renamed.** It measures distance to the representative point, not to a boundary polygon, because that is what the column holds. The name is a historical artifact of a point-based implementation; changing it would be a remote contract change and is out of scope.
12. **Bridge scope, unchanged:** application mirror, parcel identity and the `on_conflict=local_parcel_id` upsert key, PIN, barangay, lot metadata, inspection identity, assigned Site Inspector, handshake resolution, field-job identity, photo behaviour, the delivery recorder, the planning-review bridge, and the 9C-3 retry dispatch source. Exactly one value changed: the source of `supabase_parcels.geom`.
13. **Rows affected:** **0.** No existing remote parcel row was modified. The 15 rows already present are all POINT and are compatible with the corrected writer output.
14. **Pre-existing on master:** the defective geometry block is byte-identical on `origin/master`. This is not a Loop 9 regression and was not introduced by any Loop 9 commit.
15. **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.** **Local schema and data:** **UNCHANGED.**
16. **Validation:** `ParcelPointBridgeContractTest` 10 tests / 49 assertions PASS, including a negative control confirming the assertions fail against the previous geometry logic. Full Unit suite 556 tests / 2985 assertions PASS. `Loop9c1DeliveryStatusReaderTest` 11 / 49 PASS. `php -l` clean, `git diff --check` clean. A read-only proof on parcel 74 produced `POINT(121.3146050 13.8325540)`, which `ST_X` and `ST_Y` both accept. No real bridge push was executed; remote delivery verification belongs to 9C-5.
17. **Status:** **9C-5 BLOCKER REMOVED.** The remaining 9C-5 prerequisite is a single controlled PO-owned `delivery_failed` E2E fixture, which requires its own authorization.

### 2026-09-30 - Loop 9B delivery-attempt recorder hotfix - schema/data migration: NONE - MODEL CORRECTION

1. **Loop / issue:** Loop 9B. Every Eloquent write to `inspection_delivery_attempts` failed, so the delivery recorder recorded nothing at all.
2. **Classification:** **MODEL CORRECTION.** The table shape was already correct and deliberate; the model disagreed with it. No column was added.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **Exact SQL / operation:** **NONE** against any database. This was a code-only correction, proven with rollback-only probes against `imaps_db_test`.
5. **Defect:** `inspection_delivery_attempts` is created by migration `2026_09_28_030000_add_inspection_delivery_monitoring` with `created_at` and deliberately WITHOUT `updated_at`. `App\Models\InspectionDeliveryAttempt` left Eloquent `$timestamps` at its default and cast `updated_at`, so every write emitted a column the table does not have: `SQLSTATE[42703]: column "updated_at" of relation "inspection_delivery_attempts" does not exist`.
6. **Observed as:** the writer catches that failure deliberately ("observability must never break delivery"), so the symptom was silent. The bridge still pushed successfully, the log recorded `Delivery attempt could not be opened; continuing without it.` immediately followed by `Successfully pushed Site Inspection 39 to Supabase.`, and the round was delivered with NO attempt evidence and NO `delivery_status` summary. Three occurrences are in the log: inspection 38 at 18:04:42, inspection 39 at 19:52:33, inspection 39 at 20:22:20.
7. **Correction:** `InspectionDeliveryAttempt::UPDATED_AT = null`, the model-native Laravel way to keep `created_at` Eloquent-owned while never emitting `updated_at`. The dead `updated_at` cast was removed so no model metadata describes a nonexistent column. `public $timestamps = false` was rejected: it would also have stopped `created_at` being populated and silently moved that job onto the column default.
8. **Second, unavoidable edit:** `InspectionDeliveryRecorder::markAttemptFailed()` no longer passes an explicit `'updated_at' => now()`. This was proven necessary, not tidied: it is a query-builder `update()`, and Eloquent's `Builder::addUpdatedAtColumn()` returns the caller's array untouched when `UPDATED_AT` is null, so the model constant alone would have left the failure path still raising 42703.
9. **Why the table has no `updated_at`:** an attempt row is created once, then transitions AT MOST ONCE from `pending` to `delivered` or `failed`. Both meaningful instants already have their own columns, `attempted_at` when the dispatch began and `completed_at` when the outcome was finalized, so `updated_at` could only duplicate `completed_at`. Adding a column to satisfy Eloquent was rejected as a schema change justified by nothing.
10. **Rows affected:** **0** existing rows. The 6 pre-existing attempts are unchanged.
11. **Local schema and data:** **UNCHANGED.** **Supabase:** **UNCHANGED.** **FieldSync:** **UNCHANGED.**
12. **Validation:** new `Loop9bDeliveryAttemptTimestampContractTest`, 8 tests / 37 assertions PASS, including a negative control that re-instates the legacy model contract in memory and asserts the insert then FAILS, so a green run is evidence rather than a vacuous pass. The live portion inserts and exercises both outcome transitions against the real table shape in `imaps_db_test` under a hard guard that refuses to run anywhere else, with every probe rolled back and zero residue. Loop 9B + 9C unit tests 252 / 1364 PASS. Full Unit suite 564 tests / 3029 assertions PASS, up from 556 / 2992. `php -l` clean, `git diff --check` clean. The 16 PHPUnit deprecations are pre-existing and unchanged.
13. **Status:** **RECORDER RESTORED.** Its success branch is subsequently proven end to end by 9C-5 below.

### 2026-09-30 - Loop 9C-5 controlled Planning Officer retry E2E - schema/data migration: NONE - E2E TEST DATA

1. **Loop / issue:** Loop 9C-5. First end-to-end proof that a Planning Officer delivery retry, executed by a person through the real browser UI, reaches Supabase and FieldSync.
2. **Classification:** **E2E TEST DATA ONLY.** No schema evolution, no production behaviour change, no defect fixed in this entry.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **Fixture:** `APP-2026-00028`, application 143, parcel 75, inspection 39, round 1. Planning Officer user 4 Jyerine Desunia. Site Inspector user 26 Gemini Norawit Titicharoenrak, remote profile `7abb9a75-8df1-491c-8677-de2da43af494`.
5. **Restore point taken first:** `20260930-203900_imaps_db_0921_before-loop9c5-gemini-retry.dump`, custom format, 9,153,554 bytes, `pg_restore --list` exit 0 with 229 TOC entries, SHA-256 `DC094C80542E745A5BEDCD874DDBF783382A319A2BB09387E3F7F2C4F6875BFD`. Baseline counts at capture: 72 applications / 37 inspections / 58 parcels / 158 audit rows / 6 attempts / 0 jobs / 14 failed jobs / 16 migrations; delivery states 6 `delivery_failed` / 0 `pending_delivery` / 0 `delivered` / 31 NULL.
6. **The initial normal delivery had already succeeded before this test**, at 20:22:20 `RUNNING` and 20:22:24 `DONE`, creating the application mirror, the parcel row and `field_job` `d5d68298-c1a9-475a-b5eb-77d7a6bcf5bb`, and the task appeared for Gemini in FieldSync. Because that delivery preceded the recorder hotfix above, `delivery_status` correctly remained `NULL`; it was never retro-fitted.
7. **The single synthetic precondition, separately authorized:** `UPDATE site_inspections SET delivery_status = 'delivery_failed' WHERE id = 39;` - `UPDATE 1`, one column, one row. **This was a controlled E2E precondition, NOT a naturally occurring bridge failure.** No infrastructure was broken to create it; Supabase, credentials, handshake mapping, network, queue configuration and FieldSync were healthy throughout. No business field changed: `status` remained `assigned` and `inspector_id` remained 26. No fake attempt row, no fake failed job, no fabricated `last_delivery_attempt_at`, no fabricated `delivered_at`, and `last_delivery_failure_category` was left `NULL`.
8. **Reader:** the real owning-Planning-Officer session returned `retry_actor_authorized: true`, an empty `retry_actor_unavailable_reason`, and `delivery.state: delivery_failed`, `delivery.label: Delivery Failed`, `delivery.can_retry: true` for round 1.
9. **UI origin:** the control renders only when the server reports `delivery.can_retry === true`, with no disabled placeholder, so a page loaded before the precondition shows no button at all. The Team Leader reloaded the page, confirmed the visible `Delivery Failed` state, the `Retry Delivery` control and the Gemini assignment, and clicked ONCE. The request was therefore browser-originated.
10. **HTTP:** exactly one request, at 21:01:01, `POST /site-inspections/39/retry-delivery`, empty payload. No application id, parcel id, actor id, inspector id, delivery status or delivery source is accepted from the client; the server derives all of them.
11. **Request-side atomicity:** `DELIVERY_RETRY_QUEUED` audit row id 201, application 143, performed by user 4, at 21:01:02, in the same transaction as the queue insert and the `delivery_failed` -> `pending_delivery` transition. The HTTP request created no attempt row.
12. **Worker:** exactly one `App\Jobs\PushInspectionToSupabase`, source `planning_officer_retry`, `RUNNING` 21:01:03 and `6s DONE` 21:01:09. No failure.
13. **Recorder:** exactly +1 attempt, id 20, attempt_number 1, `source: planning_officer_retry`, `outcome: delivered`, `failure_category: NULL`, `attempted_at` 21:01:03, `completed_at` 21:01:09, `created_at` 21:01:03, `queue_job_uuid` `85c40bbd-eab2-481d-80bb-73f10ae30a4e`. No `updated_at` column exists and none was written; no `SQLSTATE 42703`. This is the first real proof that the 9B recorder writes.
14. **Final local state:** `delivery_status: delivered`, `last_delivery_attempt_at` 21:01:03, `delivered_at` 21:01:09, `last_delivery_failure_category: NULL`. Not altered by hand.
15. **Supabase:** the retry UPSERTed rather than duplicated. Application mirror exactly one, `4f2a5d18-86b5-4a87-8c6d-a9c443dbd4cf`. Parcel 75 exactly one, `ce341bfb-340d-425b-9c34-f08ab42b0a86`, geom `Point [121.294846, 13.849451]`, so the parcel POINT correction held. `field_job` exactly one and the SAME id as the initial delivery, `d5d68298-c1a9-475a-b5eb-77d7a6bcf5bb`, Gemini still assigned, `status` still `assigned`. Remote totals unchanged at 20 / 16 / 10. FieldSync-owned task lifecycle preserved.
16. **FieldSync:** after one normal relaunch, Gemini's dashboard showed exactly ONE active assignment, `APP-2026-00028`, `Alupay`, `Ralph Lauren Bautista`, `ID: D5D68298` matching the remote `field_job`, status `PENDING`. No duplicate task, no lifecycle reset.
17. **No geometry regression:** `Argument to ST_Y() must have type POINT` did not recur. `failed_jobs` stayed at 14 and the count of failures mentioning `ST_Y` stayed at 2, both the pre-restart stale-worker evidence recorded earlier in this log.
18. **Deltas, fully accounted:** `audit_trail` 158 -> 159 (+1 `DELIVERY_RETRY_QUEUED`); `inspection_delivery_attempts` 6 -> 7 (+1); `jobs` 0 -> 0, inserted and consumed by the active worker; `failed_jobs` 14 -> 14; `migrations` 16 -> 16; inspection 39 delivery transport fields `NULL`/`NULL`/`NULL` -> `delivered`/21:01:03/21:01:09. No other column on inspection 39 changed and no other row anywhere changed.
19. **Protected evidence:** rounds 25-30 re-verified by hash after the retry. Their rows, their six `legacy_reconciliation` attempts, their audit rows, all non-fixture `site_inspections` and all non-fixture `audit_trail` rows were byte-identical to their pre-test values. The FieldSync repository was not modified.
20. **Notification is not required and not proven:** iMAPS has zero OneSignal call sites, so the backend half of the push contract does not exist. Task visibility after sync is the delivery proof. The Team Leader separately observed a device notification for the initial delivery; that was recorded but not investigated.
21. **Known limits, recorded not worked around:** the precondition is synthetic; a real `delivery_failed` is only produced by the recorder's failure branch via the queue's terminal `failed()` hook. This test therefore proves the recorder's SUCCESS branch, the branch that the `updated_at` defect had broken. Its failure branch remains unexercised end to end.
22. **Status:** **9C-5 CONTROLLED RETRY E2E VERIFIED.** The Planning Officer retry path is proven from the browser UI through the server, the queue worker and the recorder to Supabase and FieldSync, with no duplicate remote task and no protected-data movement.

### 2026-09-30 - Loop 9C-4 Planning Officer Retry Delivery UI - UI CHANGE (NO DB CHANGE)

1. **Loop / issue:** Loop 9C-4. The Planning Officer retry contract existed server-side after 9C-3, but no person could invoke it: there was no control anywhere in the browser.
2. **Purpose:** the Planning Officer retry-delivery control in the existing FieldSync Delivery panel.
3. **Classification:** **UI CHANGE.** A read-only phase until a person actually clicked it, which is why 9C-5 had to prove the path independently.
4. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.**
5. **Exact SQL / operation:** **NONE.** No `CREATE`, `ALTER`, `DROP`, `TRUNCATE`, `INSERT`, `UPDATE` or `DELETE` was executed against any database. Canonical was read only.
6. **Production scope:** `InspectionDeliveryStatusPanel` only. No Controller, route, service, model, job, migration or database file changed.
7. **Commit:** `4958fc4`.
8. **Contract:**
   - Retry Delivery renders **only** from server-authored `delivery.can_retry === true`;
   - **no client-side retry eligibility inference**;
   - the button enters a **Queueing** state while the request is active;
   - a duplicate click is guarded;
   - the POST target is the established Planning Officer retry route;
   - **no Admin retry control**;
   - **no delivery-state mutation from React** - React never writes `delivery_status`.
9. **Authority is server-owned.** The control is a rendering of a server decision. The retry route stayed `role:Planning Officer` and the retry service still re-checked `actorAuthorized()` under the application row lock, so hiding the button was never the enforcement.
10. **Supabase:** **NO SCHEMA CHANGE. NO CHANGE.**
11. **FieldSync:** **NO CHANGE.**
12. **E2E:** the UI implementation itself was completed in 9C-4. The real browser-originated retry click and the full transport verification were subsequently proven in **Loop 9C-5** using `APP-2026-00028` / inspection 39. 9C-4 is not claimed to have performed the E2E.
13. **Validation:** new `Loop9c4RetryUiContractTest`, 16 tests / 93 assertions PASS on live source, plus the updated `Loop9c2DeliveryPanelContractTest`. `npm run build` PASS, `php -l` clean, `git diff --check` clean. No database access is involved in this phase or its test.
14. **Status:** **9C-4 DONE - PLANNING OFFICER RETRY DELIVERY UI.** A separate test commit `0c0186f` later scoped a 9C-4 boundary assertion to its own commit, correcting a stale freeze of the same class already corrected elsewhere in this branch.

### 2026-09-30 - Loop 9D Admin delivery monitoring - schema/data migration: NONE - READ-ONLY MONITORING

1. **Loop / issue:** Loop 9D. The first aggregate delivery monitoring surface and the first reader of delivery attempt history.
2. **Classification:** **READ-ONLY MONITORING.** No schema evolution, no production behaviour change to any existing phase, no defect fixed in this entry.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **Exact SQL / operation:** **NONE against canonical.** Canonical was read only, for verification. The test suite wrote only to `imaps_db_test`, inside transactions that were always rolled back and verified at zero residue.
5. **The gap 9D closed:** Admin already had per-application delivery visibility from 9C. Missing were aggregate monitoring, attempt history, a supersession signal, and the raw failure category. `ApplicationController@index` filtered on barangay, status, application_type and search, never delivery state, so identifying failed deliveries meant opening 72 applications one at a time.
6. **Surface:** the existing `applications.index`. No new module, no new dashboard. Attempt history reuses the existing 9C-1 reader through an opt-in `include_attempts` parameter, so **`routes/web.php` was not modified at all**, which keeps the contested upstream-merge surface minimal.
7. **Monitoring round, defined once on the server:** the highest-id `site_inspections` row across an application's parcels. The filter and the rendered row use that identical rule, so a row can never disagree with the filter that selected it. `no_delivery_record` is one predicate covering both "no inspection round" and "newest round has no recorded delivery state".
8. **Supersession:** new server-computed `is_superseded` boolean, produced by `InspectionDeliveryRetryEligibility::isSuperseded()` from the same latest-round map the retry service uses. A superseded round remains VISIBLE and is marked, never hidden or filtered. `superseded` is deliberately NOT a `delivery_status` value.
9. **Attempt history:** opt-in per round via `include_attempts=<inspection_id>`. Absent from the payload by default. Admin-only, refused with **403** for every other role. A round from another application is **404**. At most one extra query, only on request.
10. **Fields exposed:** `attempt_number`, `source` and `outcome` with server-authored labels, `failure_category` with a server-authored label, `attempted_at`, `completed_at`, `created_at`, and `queue_job_uuid` as operational detail inside the disclosure.
11. **`safe_message` is deliberately NOT exposed.** It is the only free-text column on `inspection_delivery_attempts`. The 9D contract authorizes the closed category vocabulary, and the category is CHECK-constrained to seven values with a fixed label map, so it is the safe diagnostic signal. No exception, response body, SQL text, path, URL, credential, handshake key or token is reachable through any 9D read.
12. **Authority boundary unchanged:** the retry route remains `role:Planning Officer`; `InspectionDeliveryRetryService` still re-checks `actorAuthorized()` under the application row lock; Admin still receives `can_retry: false` for every round. 9D added no dispatch, no write, and no mutation path.
13. **Query shape:** local PostgreSQL only, no Supabase call, no FieldSync call, no device dependency. The list adds **zero** queries because the aggregate attempt count is a sub-select on the already-eager-loaded latest round. Attempt rows are never loaded per list row.
14. **No index added.** The existing partial index `site_inspections (delivery_status) WHERE delivery_status IS NOT NULL` serves the three concrete states. `no_delivery_record` is a NULL predicate and cannot use it; recorded as a known characteristic at current scale, not addressed.
15. **Canonical data changed: NO.** `migrations` stayed at 16, `failed_jobs` at 14, and `DELIVERY_RETRY_QUEUED` audits at 1. Rounds 25-30, their six `legacy_reconciliation` attempts and their audit rows were re-verified by hash and are byte-identical. No record was mutated by this phase.
16. **Foreign movement, explicitly identified and NOT caused by 9D:** `APP-2026-00029` / application 144 / inspection 40 was created through the normal iMAPS application flow at 21:25:50 by Planning Officer user 4 during the 9C-5 phase, with the standard `APPLICATION_CREATED` / `PLANNING_OFFICER_ASSIGNED` / `STATUS_UPDATE` audit signature, and its attempt is `source: initial_dispatch`, `outcome: delivered`. It is a normal initial delivery, not a retry, and predates every 9D code path.
17. **Four pre-existing phase-scope corrections, same defect class already corrected twice in this branch:** a phase assertion that inspected LIVE source silently became a freeze on all future authorized work. Corrected, each with the real invariant preserved: `Loop9c1DeliveryStatusContractTest` now reads the 9C-1 commit for its queue-correlation ban while asserting the response-shape rule on live code; `Loop9c3RetryEligibilityContractTest` now scopes the queue-uuid ban to `shapeDelivery()`, the method that builds the block every viewer receives; `Loop9c2DeliveryPanelContractTest` and `Loop9c4RetryUiContractTest` now assert the deferred diagnostic tokens against the 9C panel and require the live 9D disclosure to stay Admin-gated; `AdminPoPriorityClosureContractTest` now asserts the eager-load FACTS rather than one exact string, and adds a remote-free check for the new monitoring block. Three of the four were caught by my own code choices and fixed in the code instead: the "Completed:" task-lifecycle wording collision, and a `failure_category_label` field renamed to `failure_label` so the raw token is never the response key.
18. **Validation:** new `Loop9dAdminDeliveryMonitoringContractTest` 18 tests / 91 assertions PASS, including live rollback-only proofs in `imaps_db_test` for supersession detection, attempt-history round-trip, and every filter state, with a hard guard that refuses to run against anything but `imaps_db_test`. Loop 9B + 9C + 9D 270 tests / 1466 assertions PASS. Full Unit suite 582 tests / 3138 assertions PASS. `npm run build` PASS. `php -l` clean on every changed file. `git diff --check` clean. The 16 PHPUnit deprecations are pre-existing and unchanged.
19. **Real-data verification:** `delivery_status=delivery_failed` returned exactly the 6 known failures with the rendered label "Inspector mapping unresolved"; `delivered` returned `APP-2026-00028` and `APP-2026-00029`; `pending_delivery` returned empty, correct because no pending rows exist; `no_delivery_record` returned 22. On `APP-2026-00028` the default payload contained no `attempts` key, `is_superseded` was `false`, `can_retry` was `false` for Admin, and the on-demand request returned the single `planning_officer_retry` / `delivered` attempt with its queue uuid and no exception text. A Planning Officer requesting the same history received **403** and their default payload was unchanged. Application 50 showed 6 of 7 rounds marked superseded with all 7 still visible.
20. **Notification sender behaviour, Technical Review transport, remote-only identity drift, the FieldSync role label and the unexercised recorder failure branch remain SEPARATE and untouched.**
21. **Status:** **ADMIN DELIVERY MONITORING COMPLETE.** Next is 9E / 9F diagnostics scope audit only. 9D must not be read as closing Loop 9E/9F or Loop 9G.
22. **CLOSURE ANNOTATION (added by the Loop 9 final docs-only pass):** preserved as written, because it was accurate as at 2026-09-30 and remains correct as a statement about 9D's own scope. **9E/9F and 9G are both DONE**, and neither was closed by 9D.
### 2026-10-01 - Post-Loop 9 smoke: `notifications` table APPLIED to the canonical 0921 database

1. **Date/time:** 2026-10-01. **STATUS: APPLIED.** Supersedes the same-day PLANNED entry recorded one commit earlier; the plan is preserved below in this entry's item 20 so the record is not rewritten.
2. **Approval:** explicit user approval to apply only `database/sql/2026_10_01_create_notifications_table_for_0921_forward.sql` to `imaps_db_0921`, with no `php artisan migrate`, no ledger edit, no master touch, no merge or sync.
3. **Loop / issue:** post-Loop 9 system smoke, "Admin -> Notify Planning Officers" for FieldSync Diagnostic Reports. The action was blocked on this table and is now unblocked.
4. **System:** iMAPS PostgreSQL only, local `imaps_db_0921`. **No Supabase change. No FieldSync change. No business data change.**
5. **Pre-apply backup:** taken first, as the documented 0921 procedure requires. `pg_dump` exit 0, 26,220,886 bytes, verified to contain `COPY` blocks for `zoning_applications`, `site_inspections`, `technical_reviews` and `audit_trail`. No credential was printed.
6. **Operation:** `psql -v ON_ERROR_STOP=1 --echo-all -f database/sql/2026_10_01_create_notifications_table_for_0921_forward.sql`, **exit 0**. Both precondition guards ran, the table and all three indexes were created, and the transaction committed. `ON_ERROR_STOP=1` means a failed statement would have aborted with a non-zero exit rather than continuing silently.
7. **Exact SQL executed:** the artifact verbatim - `CREATE TABLE IF NOT EXISTS public.notifications` (10 columns, `notifications_pkey`, `notifications_user_id_foreign`), three `CREATE INDEX IF NOT EXISTS` statements (`notifications_user_id_is_read_index`, `notifications_broadcast_index`, `notifications_created_at_index`), six `COMMENT ON` statements, and two `DO $$` guard blocks. **No `DROP`, no `TRUNCATE`, no `UPDATE`, no `DELETE`, and no `migrations` ledger insert.**
8. **Post-apply verification, every recorded condition in `CANONICAL_DATABASE_SCHEMA.md` 22.9 checked and PASSED:** table exists; **exactly 10 columns** with the recorded types, lengths, nullability and defaults (`type` default `system_alert`, `is_read` default `false`, `id` a bigserial sequence, `read_at`/`created_at`/`updated_at` with no default); `PRIMARY KEY (id)`; the single FK `user_id -> users(id) ON DELETE CASCADE`; exactly one foreign key; **no CHECK/enum constraint**; **exactly 4 indexes** (the 3 explicit plus the PK index); table queryable and **0 rows**; **migration ledger still 16** with **no notification ledger row**; `public` tables **26 -> 27**.
9. **Business data unchanged - the regression guard:** `zoning_applications` 73, `site_inspections` 38, `technical_reviews` 79, `inspection_delivery_attempts` 8, `audit_trail` 162, `users` 7, `failed_jobs` 14, `application_po_assignments` 3, `application_status_tracks` 146. All six full-row fingerprints byte-identical: `cf1bc99afe8b2d7f90ca5d179f1d700b`, `222f3a3cbe3e90b5246f58585e5a8504`, `4024d7cf21533bea82af2d26023bf2b5`, `0372609f777e6098c7d19d96521d792a`, `11a22c9d6b5689f3bb094808689f6930`, `514a00071e43069b408823b4ce53b21a`.
10. **Runtime smoke of the existing write/read paths - real model, real table, inside a transaction that is always rolled back, so nothing persisted.** All passed: `notifyUser` persists with the correct type override, `is_read` default `false`, `read_at` NULL, `action_url` stored; `notifyRoles(['Admin','Planning Officer'])` writes exactly one row per matching user and **none to a Site Inspector**; `notifyAll` writes a `user_id = NULL` broadcast row; `scopeForUser` returns targeted **and** broadcast rows, and a Site Inspector sees the broadcast but not PO-targeted rows; `unread()` counts correctly; `orderByDesc('created_at')` is genuinely newest-first; single mark-as-read persists `is_read` and `read_at` and leaves the unread set; bulk mark-all-read clears every unread row.
11. **Constraint enforcement proven, each violation inside its own SAVEPOINT** (a failed statement poisons a PostgreSQL transaction, which is exactly what the first attempt demonstrated): a bogus `user_id` is rejected by the FK; a missing `title` is rejected; a missing `message` is rejected. Cascade was verified from the catalog (`confdeltype = 'c'`) rather than by deleting a user, because `users.password` is NOT NULL and a throwaway credential has no place in canonical.
12. **Post-smoke state:** `notifications` table **empty again** (8 rows created, all rolled back), ledger still 16, `users` still 7, `audit_trail` still 162, `users` fingerprint unchanged. The smoke created and deleted no user, wrote no audit row and wrote no business row.
13. **The pre-existing defect is now fixed:** the five write sites that were inside a transaction (`ApplicationController::store`, three `TechnicalReviewController::updateStatus` sites) and the uncaught `RegisteredUserController::store` no longer fail with `42P01`, so a Planning Officer can once again encode an application and record a technical review decision, and the notifications page and header bell work. `forceSync` no longer reports a false failure.
14. **No credential column exists on the table:** the 10 columns are `id, user_id, title, message, type, action_url, is_read, read_at, created_at, updated_at` - no `token`, `key`, `secret`, `password`, `payload` or `handshake_key`, verified against `information_schema`.
15. **TWO ERRORS IN MY OWN PLANNED DOCUMENTATION, caught by running the code rather than reading it.** See item 9a in the superseded plan below, preserved there. Both the "rows are written with NULL timestamps" claim and the "PostgreSQL sorts NULLs LAST under DESC" claim were wrong; both are corrected in the artifact and in `CANONICAL_DATABASE_SCHEMA.md` 22.5.
16. **Not done:** no `php artisan migrate`, no `migrate:fresh` / `migrate:reset`, no `DROP TABLE`, no ledger row inserted or edited, no migration renamed, no FieldSync change, no master merge or sync, no `notifications` row left behind.

### 2026-10-01 - Post-Loop 9 smoke: `notifications` table for the canonical 0921 database - **PLANNED / NOT APPLIED** (SUPERSEDED by the APPLIED entry above; preserved as the plan as written)

1. **Date/time:** 2026-10-01. **STATUS: PLANNED / NOT APPLIED.** Awaiting explicit user DB approval. **No SQL was executed, no migration was created or run, no ledger row was inserted, and the canonical database is unchanged.**
2. **Loop / issue:** post-Loop 9 system smoke, "Admin -> Notify Planning Officers" for FieldSync Diagnostic Reports. The action is blocked on a database object that does not exist, so the plan is recorded first and the button is deliberately not implemented.
3. **System:** iMAPS PostgreSQL only, local `imaps_db_0921`. **No Supabase change. No FieldSync change. No application data change.**
4. **Business reason:** `App\Models\AppNotification` declares `$table = 'notifications'`, and that table is absent from canonical, so the model raises `SQLSTATE[42P01] ... relation "notifications" does not exist`.
5. **THIS IS PRE-EXISTING AND NOT INTRODUCED HERE.** Six already-shipped production call sites write to the same missing table. It is recorded now only because it blocks the diagnostics action, and because the audit of those sites produced a materially important finding (item 12).
6. **Exact SQL / operation against any database:** **NONE EXECUTED.** The prepared artifact is `database/sql/2026_10_01_create_notifications_table_for_0921_forward.sql`, created and parse-validated but deliberately NOT run.
7. **Forward SQL design:** additive and idempotent (`IF NOT EXISTS` throughout, single transaction), mirroring the repository migration `2026_09_27_000000_create_notifications_table.php` exactly so the live table and the migration cannot diverge. Two precondition guards abort loudly rather than silently reconciling: `public.users` must exist, and any pre-existing `notifications` relation must be structurally complete. Silently "fixing" an unexpected existing table could destroy notification history this repository did not write.
8. **Table contract:** 10 columns. `id bigserial` PK; `user_id bigint NULL` FK -> `users(id)` `ON DELETE CASCADE`; `title varchar(255)` NOT NULL; `message text` NOT NULL; `type varchar(255)` NOT NULL DEFAULT `'system_alert'`; `action_url varchar(255)` NULL; `is_read boolean` NOT NULL DEFAULT `false`; `read_at timestamp(0)` NULL; `created_at` / `updated_at` `timestamp(0)` NULL. Indexes: the migration-named `(user_id, is_read)`, a partial `(user_id) WHERE user_id IS NULL` for the broadcast branch the composite cannot serve, and `(created_at DESC)` matching the real newest-first read order.
9. **Three contract decisions recorded rather than "improved":** (a) `user_id` stays NULLABLE because `notifyAll()` writes a broadcast row with `user_id = NULL` and `scopeForUser()` deliberately matches NULL. (b) `type` gets **no** CHECK or enum, because the migration's own comment lists values as "e.g." and `notifyUser()` accepts any string; an enum would break it and diverge from the migration. (c) `created_at` / `updated_at` stay NULLABLE with **no database default**, exactly as `$table->timestamps()` produces, because `DEFAULT now()` or `NOT NULL` would both diverge from the shipped migration.
9a. **TWO CLAIMS CORRECTED BY THE POST-APPLY RUNTIME SMOKE, not by reasoning.** The planned version of this entry asserted that `AppNotification::create()` leaves both timestamp columns NULL, and that PostgreSQL sorts NULLs LAST under `DESC`. **Both were wrong.** (i) `AppNotification` is a normal Eloquent model with `$timestamps` enabled, so Eloquent populates `created_at` / `updated_at` itself - measured at 0 of 8 smoke rows being NULL, with `orderByDesc('created_at)` ordering newest-first as the page and bell intend. The nullable, default-free columns therefore cause no ordering defect. (ii) PostgreSQL's default under `DESC` is `NULLS FIRST`, not `NULLS LAST`. Both errors were caught only because the smoke actually ran the real model against the real table; neither was visible from reading the migration. One characteristic genuinely remains: `timestamp(0)` is second precision, so same-second notifications tie and their relative order is planner-dependent - inherent to the migration's type, and not "fixed" because that would diverge from the migration.
10. **Migration ledger:** **UNCHANGED, 16 rows. No ledger row is inserted by the artifact.** Per `CANONICAL_DATABASE_SCHEMA.md` section 2 the ledger is never edited by hand on the 0921 path, and section 12 records that a global `php artisan migrate` cannot be run against canonical at all.
11. **The `2026_09_27_000000` prefix collision, recorded and NOT fixed here:** two repository migrations share that prefix - `create_notifications_table` and `add_reviewed_site_inspection_id_to_technical_reviews_table`. Laravel keys the ledger by migration NAME, so both would run, but the shared prefix makes execution order ambiguous. This is **why the notifications table is absent from canonical today**. Renaming a migration is a repository-history change and is not performed by this plan; ledger reconciliation remains a separate decision, exactly as section 12 states.
12. **AUDIT FINDING - five of six notification write sites are inside a database transaction, so on canonical a Planning Officer currently cannot encode an application or record a technical review decision.** `ApplicationController::store` (L582, inside `DB::beginTransaction`/`rollBack` L518-732) and three `TechnicalReviewController::updateStatus` sites (L244, L292, L315, all inside the single `DB::transaction` spanning L190-L326) roll back on the notification insert. `RegisteredUserController::store` (L97) is not caught, so it 500s **after** creating the user row, leaving a half-completed registration. Only `SiteInspectionController::forceSync` (L131) is caught, so it degrades to a misleading flash error. `submitBatch` and `assignInspector` write no notifications and are unaffected. Read side: all six `NotificationController` methods fail, and `getUnread` backs the header bell that `Header.jsx` polls every 30s on every authenticated page; the browser degrades safely there, but the notifications page itself does not.
13. **Fresh database handling:** **no duplicate definition added anywhere.** A fresh database already receives this table from the existing repository migration during the normal sequence, so the forward-SQL file is **0921-path only** and must never be run against a ledger-managed database - the same prohibition section 1 places on the fresh-install corrections.
14. **Verification performed (read-only / non-canonical):** the artifact was executed inside a throwaway schema inside a rolled-back transaction. It created exactly the 10 columns above, the PK, the FK and the 3 explicit indexes; `scopeForUser` semantics (targeted + broadcast) held; `is_read` defaulted to `false`; a second run was a no-op; and the incompatible-schema guard aborted as intended. The scratch schema was dropped. Canonical was re-verified afterwards and is untouched: `notifications` still absent, ledger still 16, still 26 tables, all business row counts and fingerprints identical.
15. **Notify-PO contract recorded, NOT implemented:** Admin-only send; target active `Planning Officer` users; content limited to diagnostic `reference_code`, `module`, a short safe summary and a link to the detail page; content drawn from the **sanitized** `DiagnosticReportReader` output, never the raw remote row; must not carry a signed URL, JWT, token, credential, handshake key or any text the sanitizer removed; a cooldown to prevent rapid duplicate sends; a small success confirmation; and the report is **NOT** auto-marked resolved. A Planning Officer may read the notice and open the report; a Site Inspector has no iMAPS web diagnostics access at all.
16. **Support contact config (unchanged, audited this pass):** `config/imaps.php` expects `IMAPS_SUPPORT_CONTACT_NAME`, `IMAPS_SUPPORT_CONTACT_EMAIL`, `IMAPS_SUPPORT_CONTACT_CHANNEL`, `IMAPS_SUPPORT_INSTRUCTIONS`. All four default to NULL, are rendered **Admin-only** on diagnostic detail, degrade to a "not configured" placeholder rather than an invented contact, are rendered as inert text and never as links, and the config reads **no** credential environment variable. **No values are set and none are invented.**
17. **Validation:** `php -l` clean; `git diff --check` clean. No PHP test was added or changed, because this pass changes no PHP behaviour - the notification model, controller and all six call sites are untouched. Existing suites were not re-run as a gate for a docs-and-SQL-only change; the last full Unit result on this branch stands (631 tests / 3537 assertions / 0 failures).
18. **Deliberately NOT done:** no `php artisan migrate`, no `migrate:fresh` / `migrate:reset`, no `DROP TABLE`, no ledger insert, no notification button or route, no migration rename, no master merge or sync, no FieldSync change.
19. **Status:** **PLAN READY, AWAITING USER DB APPROVAL.** Applying `2026_10_01_create_notifications_table_for_0921_forward.sql` is the precondition for the Admin "Notify Planning Officers" action, and independently fixes the pre-existing transaction-rollback defect in item 12.
20. **Correction to the 2026-09-30 9E/9F entry above, recorded rather than edited.** That entry states, correctly for its date, "Admin 200 on both routes; **Planning Officer 403** on both". On branch `fix/post-loop9-smoke-diagnostics` the diagnostics read boundary was widened to `role:Admin,Planning Officer`, because a Planning Officer is the role that resolves day-to-day FieldSync issues inside MPDO and was unable to read the report they had to act on. A **Site Inspector is still refused** on both routes, and the report remains immutable: both routes are GET-only, the controller exposes no `store`/`update`/`destroy`, and no mutation route exists for any role. The 9E/9F entry is left as written because it is accurate chronology; this item is the current contract. **Schema and database impact of that access change: NONE.**

### 2026-09-30 - Loop 9E/9F inspector diagnostic report Admin triage - schema/data migration: NONE - READ-ONLY REMOTE READER

1. **Loop / issue:** Loop 9E/9F, treated as ONE unit because the canonical record never defines them separately. The architecture record deferred "no diagnostic backend (**9E/9F**)" and named the Admin diagnostic access path as "CONTRACT/ACCESS WORK REQUIRED".
2. **Classification:** **READ-ONLY REMOTE READER.** Completes an existing support path; adds no business state, no delivery state and no authority.
3. **SCHEMA CHANGE: NONE.** **FORWARD SQL: NONE.** **MIGRATION: NONE.** **LOCAL TABLE: NONE** - verified absent, and deliberately not created. **SUPABASE SCHEMA: NONE.** **FIELDSYNC SCHEMA: NONE.**
4. **Exact SQL / operation against any database:** **NONE.** Canonical was read only. The new remote read is a `select` through the existing `SupabaseService::select()` helper, which already permits server-side reads, so **no new RLS policy and no access blocker were required**.
5. **What existed already:** the FieldSync client can submit a report (`diagnostics_screen.dart`, `diagnostics_service.dart` with `fetchMyReports()` / `submitReport()`), and the remote `diagnostic_reports` table exists with exactly the 13 documented columns and one real row. **What did not exist:** any iMAPS reference at all - 0 across `app/`, `resources/`, `routes/`, `tests/`, `database/`.
6. **Security finding that shaped the implementation:** the single live report contains a **signed Supabase Storage URL carrying a JWT** inside its `summary` free text - a time-limited bearer capability on a private inspection photo. The contract is therefore absolute: **raw remote free text must never reach a browser.** Redaction, not escaping.
7. **Sanitizer:** `App\Support\DiagnosticTextSanitizer` redacts Supabase storage URLs, any Supabase project host, credential-shaped query parameters, JWT-shaped values, `Bearer` / `Authorization` fragments and service-key-shaped assignments, and additionally matches the **live configured** service key by value. It never logs its input, never returns the raw value beside the safe one, and never emits a secret prefix.
8. **Three defects found by verifying against the LIVE report, not by reasoning.** (a) The value arrives slash-escaped, so a literal-`https://` rule matched nothing. (b) The URL rule began with `\b`, but the inspector typed the URL directly onto the previous word, so the boundary never matched and every URL passed through. (c) A naive `json_decode('"' . $text . '"')` returns NULL for text containing a raw newline - which inspector prose is full of - so a null-handling mistake would have made multi-line reports leak verbatim. All three are now pinned as regression tests.
9. **Allowlist:** only 8 safe metadata columns are requested and only explicitly written keys are returned. A wildcard select would make every future remote column browser-visible by default. Free text is limited to `summary`, `technical_description`, `repro_steps`, `recommended_action`.
10. **Identity:** the live report's `inspector_id` is `ddcebeac-...`, the profile whose local identity is a separately frozen open question. The reader reports `resolved: false` and "Unresolved inspector" and never guesses a name. Identity drift was NOT modified.
11. **Authority verified live:** Admin 200 on both routes; **Planning Officer 403** on both; guest redirected to login. `role:Admin` is the whole boundary, enforced by the real strict `RoleMiddleware`.
12. **Read only, enforced structurally:** 0 POST/PUT/PATCH/DELETE routes for `diagnostics`; no `store`, `update` or `destroy` method; the reader contains no `update(`, `delete(`, `insert(`, `patch(` or `post(`. An Admin cannot change a report's status and nothing can be deleted or written from iMAPS.
13. **9D not duplicated:** the controller and reader contain no `delivery_status`, `InspectionDeliveryAttempt`, `site_inspections`, `retry-delivery`, `SiteInspection` or `ZoningApplication` in executable code.
14. **Real-data verification:** `GET /diagnostics` and the detail route both returned HTTP 200 for Admin and showed `DR-2026-0001`, module `sync center`, status `submitted`, and "Unresolved inspector". Leak scan on BOTH responses: **no `supabase.co`, no `supabase.in`, no `/storage/v1/object`, no `token=`, no JWT head, no `Bearer`, and no service-key value.** The redaction marker was present, proving the fields were processed, and the ordinary Filipino prose survived intact.
15. **9A freeze scope-corrected:** `Loop9aDeliverySchemaContractTest::test_no_delivery_controller_or_ui_was_introduced` asserted that `DiagnosticReportController.php` must NOT exist - a stale future-work freeze, and the same defect class already corrected four times on this branch. The file-existence checks are now made against the 9A commit `5ea984f`, `DeliveryMonitoringController` is still asserted absent on live code, and the invariant is preserved in substance: 9A itself introduced neither file, and the now-authorized diagnostics controller is asserted never to touch the Loop 9 delivery state machine.
16. **Canonical data changed: NO.** `migrations` 16, `tables` 26, `attempts` 8, `failed_jobs` 14, `DELIVERY_RETRY_QUEUED` 1, and rounds 25-30 re-verified byte-identical by hash. No local `diagnostic_reports` table was created.
17. **Validation:** new `Loop9eAdminDiagnosticTriageContractTest` 25 tests / 117 assertions PASS, including locally-built signed-URL, escaped-URL, JSON-encoded-URL, glued-URL, raw-newline, JWT, tokenized-query, bearer, key-shape and value-match redaction cases, plus authority, read-only and domain-separation contracts. Loop 9A-9E 344 tests / 1798 assertions PASS. Full Unit suite 607 / 3262 PASS with the 16 pre-existing deprecations unchanged. `npm run build` PASS. `php -l` clean. `git diff --check` clean.
18. **FieldSync:** **UNCHANGED** - 126 dirty files, SHA-256 `961B640F...` identical.
19. **Deliberately out of scope and untouched:** queue/worker observability and `queue:restart` automation; the recorder terminal-failure branch; partial remote-write stage diagnostics; Juan Dela Cruz and Renato/Hubbie identity drift; Technical Review / `field_job_reviews`; the FieldSync role label; the notification sender question; Admin/PO provisioning; the master merge.
20. **Status:** **ADMIN DIAGNOSTIC TRIAGE COMPLETE.** 9E/9F closes the documented diagnostic-backend obligation. 9G - full cross-system E2E and final Loop 9 closure audit - has not started.
21. **CLOSURE ANNOTATION (added by the Loop 9 final docs-only pass):** the "9G has not started" wording above is the accurate status as at 2026-09-30 and is preserved as chronology. **9G is DONE.** The final cross-system closure audit was performed read-only and classified the loop as having docs-only closure items, which this pass has now recorded. 9G itself made **no** code, schema, data or test change. See `LOOP 9 - FINAL CLOSURE` in the architecture document.
22. **Final database closure statement (added by the Loop 9 final docs-only pass):** final Loop 9 schema state **MATCHES CANONICAL**; unrecorded schema changes **NONE**; 9C-4 was **UI ONLY**; 9C-5 was **E2E TEST DATA ONLY**; 9D was **NO DB CHANGE**; 9E/9F was **NO LOCAL DB CHANGE**; 9G was **AUDIT ONLY**; this docs pass is **NO DB CHANGE** — no migration, no forward SQL, no Supabase schema change, no FieldSync schema change.

### 2026-10-01 - Cross-environment bridge identity fix (Pass 1) - **PREPARED / NOT APPLIED REMOTELY** - SUPABASE FORWARD SQL PREPARED, iMAPS CONFIG + WRITERS + READERS UPDATED

1. **Date/time:** 2026-10-01. **STATUS: PREPARED - NOT YET APPLIED REMOTELY.** No SQL was executed against the shared Supabase FieldSync project, and no iMAPS SQL was executed at all. No `php artisan migrate`, no `migrate:fresh` / `migrate:reset`, no ledger row inserted or edited, no master merge or sync, no push to `master`.
2. **Branch:** `fix/bridge-source-namespace-collision`, created from the verified HEAD of `loop10-full-e2e-acceptance` (`df1a280`). Master was not merged, synced, rebased or pushed.
3. **Loop / issue:** cross-environment bridge identity collision. A second iMAPS environment overwrote the FieldSync job of a live application owned by this one.
4. **Root cause:** `field_jobs.local_inspection_id` (and the three sibling mirror identities) is a bare iMAPS-local integer. It is unique only inside ONE iMAPS database, while the Supabase FieldSync project is shared by more than one. `ON CONFLICT (local_inspection_id)` therefore resolved two different rounds from two different databases onto one remote row.
5. **Incident:** `APP-2026-00026` / local application `132` / parcel `64` / Teshow Promsakha Sakonnakhon, Mavalor. Round 2 = local inspection `37`, remote job `a761b17a-3fad-44ed-b451-7f0af0e41183`. At `2026-10-01T02:45:13.120729+00:00` another environment pushed its own local inspection `37` and overwrote `supabase_application_id` (-> `7a87a08d`, APP-2026-00032 / Boy Abunda), `supabase_parcel_id` (-> `2676c039`, their parcel 70), `assigned_inspector_id` (-> `c4e22f50`, Juan Dela Cruz), `scheduled_date`, `deadline_date` and `assignment_instructions`. FieldSync-owned lifecycle survived untouched: `status = in_progress`, `current_step = 1`, `started_at = 2026-09-26T18:05:46.831173+00:00`, `step_timestamps = {"1": "2026-09-26T17:50:46.146511Z"}`, and the Renato / `ddcebeac` "Completed Step 1: Site verification" in Mavalor `activity_log` row.
6. **Contract:** every iMAPS environment writing to the shared bridge carries a stable, explicit, non-secret `IMAPS_BRIDGE_SOURCE_ID`, exposed as `config('bridge.source_id')` from the new `config/bridge.php` and resolved by the new `App\Services\BridgeSourceIdentity`. Explicit, stable, unique, non-secret, never derived from hostname / `APP_ENV` / database name, and **FAIL CLOSED** - there is no `default`, no `production` fallback, no hostname, no database name.
7. **Config change (iMAPS only, no data):** new `config/bridge.php` with `source_id => env('IMAPS_BRIDGE_SOURCE_ID')`. New non-secret `.env.example` documenting the property, the shape rules and the rejection list. **The user's `.env` was NOT modified and is NOT committed**; no secret was printed, staged or written.
8. **Audited scope - namespaced (4 tables):** `field_jobs` (`local_inspection_id`), `supabase_zoning_applications` (`local_application_id`), `supabase_parcels` (`local_parcel_id`), `field_job_reviews` (`technical_review_id`). `field_job_reviews` is not in the originally expected list but the audit proved it keys on a bare iMAPS-local integer with a bare `UNIQUE`, so it has the identical defect and is included.
9. **Audited scope - deliberately NOT namespaced:** `field_job_photos` (identity is the remote uuid `field_job_id` FK; no local integer, so no collision), `local_inspections` (0 rows, no local-id mirror column in use), `profiles`, `activity_log`, `diagnostic_reports`, `application_status_tracks`, `notification_subscriptions`, `inspector_devices`, `inspector_device_subscriptions`, `push_device_subscriptions` (no local-id identity).
10. **Audit evidence:** live PostgREST row/column reads, the live PostgREST OpenAPI document, deliberate invalid-value probes confirming `integer` / `bigint` column types (`22P02`), read-only joins against the local iMAPS database, and a frozen provenance classifier. NOT assumed from documentation.
11. **Writers updated (existing writers only, no parallel writer):** `App\Jobs\PushInspectionToSupabase` (namespace resolved first, before any HTTP request; three composite `ON CONFLICT` targets; namespaced existing-job status pre-read), `SupabaseService::pushZoningApplication`, `::pushParcel`, `::createFieldJob`, `::upsertFieldJobReview`. The retry path (`InspectionDeliveryRetryService`) and the reassignment path (`WorkReassignmentController`) were **not** given a second writer: they already re-queue the same one, so they inherit the namespace, and both now say so in comments.
12. **Readers updated:** `SupabaseService::findFieldJobIdByLocalInspectionId`, `::fieldJobTransferStates`, `::getInspectionWithSignedPhotos`, and `PullCompletedInspections`. Each previously meant "my environment's local row" and filtered on a bare integer.
13. **Confidentiality note (found while auditing, fixed by the same change):** `getInspectionWithSignedPhotos` resolved the job by a bare `local_inspection_id` and then returned that job's findings, checklist and **signed private Storage URLs**. Without the namespace, another environment's round sharing the integer could have been rendered to a Planning Officer. It now resolves only this deployment's row and fails closed.
14. **Deliberately NOT changed:** FieldSync's inspector-visibility query `assigned_inspector_id = auth.uid()`. It is correct - it is scoped to the authenticated Supabase Auth user, which is globally unique. The defect was never there. `FieldSyncInspectorVisibilityContractTest` asserts that no iMAPS bridge read filters by `assigned_inspector_id`, so the collision cannot later be "fixed" in the wrong place. FieldSync repository: **not touched**.
15. **Forward SQL prepared:** `database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql`. Single transaction. Refuses to run without the `bridge_source_id` psql variable, and rejects the same placeholder words the writer rejects. Incompatible-schema guard runs **before** any DDL. Bare constraints are dropped by **catalog lookup**, not by a hard-coded name, because the live constraint names were never exported. Contains no `DELETE`, no `TRUNCATE`, no `DROP TABLE`, no `DROP COLUMN`, and no write to any FieldSync-owned lifecycle column. Post-apply assertions cover foreign-namespace absence, all four composite constraints, primary keys, foreign keys, and unchanged row counts.
16. **Remote UUID primary keys are preserved.** Replacing a `UNIQUE` constraint does not touch the primary key, so `field_job_photos.field_job_id` and `field_job_reviews.field_job_id` keep resolving to the same rows.
17. **Legacy classification - frozen, three-way, no guessed provenance:** **A (proven current environment) = 55 rows** claimed - `field_jobs` 15 of 16, `supabase_zoning_applications` 21 of 24, `supabase_parcels` 19 of 20, `field_job_reviews` 0. Each claimed row satisfied four independent checks: the local id exists here; the remote application's `reference_number` **and** `applicant_name` equal the local row's; the remote parcel's `property_index_number` **and** `owner_name` equal the local row's with a matching application relationship; and the remote `assigned_inspector_id` resolves through this deployment's own `handshake_key` mapping to the local `site_inspections.inspector_id`.
18. **Legacy classification - B (proven other environment) = 4 rows, left `NULL`, never claimed:** applications `7a87a08d` (local 138, APP-2026-00032 / Boy Abunda), `4afe8a3d` (local 136, APP-2026-00030 / Iris A. Napoles), `b23e89d7` (local 137, APP-2026-00031); parcel `2676c039` (local 70). None of those local ids exists in this database. They are left `NULL` deliberately: PostgreSQL treats `NULL` as distinct inside `UNIQUE`, so an unclaimed row cannot collide with either namespace, and their owning environment must claim them with its OWN `IMAPS_BRIDGE_SOURCE_ID`. No identity was invented for them.
19. **Legacy classification - C (unresolved) = 1 row, left `NULL`, deliberately NOT claimed:** `a761b17a-3fad-44ed-b451-7f0af0e41183` (local inspection `37`). Its mapping contradicts this environment's local record while its lifecycle and `activity_log` prove Teshow, so neither "current" nor "other" can be asserted from the mirror columns. It is repaired first, then claimed.
20. **Post-hijack activity audit - result: NO POST-HIJACK WORK.** `field_jobs.updated_at` on the hijacked row is still exactly `2026-10-01T02:45:13.120729+00:00`, i.e. no remote write after the hijack itself. `activity_log` for the job: 1 row total, **0** after the hijack. `activity_log` by Juan Dela Cruz, ever: **0**. `field_job_photos`: **0**. `field_job_reviews`: **0**. `current_step` still `1`. `submitted_at` still `NULL`. `checklist 0 / 0`. GPS columns all `NULL`. `rework_started_at` `NULL`. `diagnostic_reports` by Juan, ever: **0**; by anyone after the hijack: **0**. Remote `local_inspections`: **0** rows. `field_jobs` assigned to Juan anywhere: **1**, only the hijacked row, never written after the hijack. **Consequence:** there is no evidence to split and none was invented. The other environment can recreate its own namespaced job after deploying its own writer.
21. **Loop 10 fixture protected:** `APP-2026-00030` / local inspection `41` / remote job `1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999` is in the frozen Class-A claimed list (with application mirror `b108513f` and parcel mirror `cf974dc9`). `BridgeSourceNamespaceCollisionTest` asserts it resolves by `bridge_source_id` + `41`, keeps the same uuid, the same assignment (`7abb9a75`), the same `in_progress` status, the same `current_step = 1`, the same `started_at` and `step_timestamps`, and that a writer retry creates **no duplicate**.
22. **Old-deployment behaviour, proven not assumed:** once the bare `UNIQUE(local_inspection_id)` is dropped, an old writer's `ON CONFLICT (local_inspection_id)` raises SQLSTATE **42P10** ("there is no unique or exclusion constraint matching the ON CONFLICT specification"), which PostgREST returns as HTTP 409. The writer's existing `!successful()` branch classifies it and fails the attempt. The old writer STOPS; it cannot corrupt another environment. **Required coordination: every active iMAPS deployment on this Supabase project must be upgraded before the apply, or its deliveries fail with 42P10 until it is. No compatibility shim was created, on purpose - preserving a bare-local-id conflict target preserves the vulnerability.**
23. **Verification - dry run against real PostgreSQL, never the live bridge:** `database/sql/2026_10_01_bridge_source_namespace_dryrun.sql`, run in a throwaway database, inside throwaway schema `bridge_ns_dryrun`, which is dropped at the end. It first reproduces the defect (a bare `UNIQUE(local_inspection_id)` rejects the second writer), then proves: `(source_a, 37)` and `(source_b, 37)` **coexist** as two distinct rows; a source_a retry updates **only** the source_a row and leaves FieldSync lifecycle untouched; source_b **cannot** overwrite the source_a mapping; an old bare-local-id writer is rejected with 42P10; repeated identical writes stay one row per namespace; an unclaimed `NULL` row coexists with both namespaces; the application and parcel mirrors coexist the same way; two environments coexist on the same `technical_review_id`; and a photo still resolves to its job through the uuid primary key. All nine passed, and the script contains **no** reference to any real bridge table.
24. **Validation:** `BridgeSourceNamespaceCollisionTest` 21 tests / 115 assertions PASS (real writer code driven against an in-memory PostgREST simulator that enforces composite `ON CONFLICT` and refuses an undeclared target). `BridgeNamespaceSqlContractTest` 34 tests / 153 assertions PASS. `FieldSyncInspectorVisibilityContractTest` 4 tests / 25 assertions PASS. `Loop7SecurePhotoReaderTest` 9 tests / 32 assertions PASS, including two new cases: the job read is namespaced, and an unconfigured namespace refuses the read with **zero** HTTP requests sent. Full Unit suite **735 tests / 4028 assertions PASS** (baseline 676 / 3729; the 16 pre-existing deprecations and 9 pre-existing skips are unchanged). `php -l` clean on all 13 changed PHP files. `npm run build` PASS. `git diff --check` clean.
25. **Feature suite state, reported not hidden:** the Feature suite was already failing on this branch before this work - 55 errors and 40 failures, all from this environment lacking `pdo_sqlite` (`DB_CONNECTION=sqlite` in `phpunit.xml`, PHP built with `pdo_pgsql` only). Verified by stashing the change and re-running: identical 55 / 40. After the change: identical 55 / 40, plus 2 net new passing Feature tests. **This change introduced no Feature regression and did not paper over the pre-existing environment limitation.**
26. **Pre-existing contract tests updated, with the reasoning recorded in each:** `Loop4ReinspectionNewRoundTest`, `Loop9bDeliveryWriterContractTest`, `Loop9bWriterCorrelationCorrectionTest`, `ParcelPointBridgeContractTest` and `WorkReassignmentContractTest` each asserted the bare `on_conflict=local_*` keys. Those assertions encoded the defect, so they were updated to the namespaced keys and, where useful, extended with a negative assertion that no bare key may return. Round isolation, single-job-per-round, lifecycle preservation and the parcel-geometry contract are unchanged.
27. **Related finding recorded, not fixed:** `reference_number` also collides across environments - remote applications `4afe8a3d` (local 136) and `b108513f` (local 145) both carry `APP-2026-00030`. There is no unique constraint on it, so nothing is overwritten today, but a reference-number lookup can return another environment's application. Out of scope here; it needs its own decision.
28. **Rollback:** written out in full at the foot of the forward SQL - drop the four composite constraints, the four supporting indexes and the four `bridge_source_id` columns, then restore the four original bare `UNIQUE` constraints. Reverting **restores the collision vulnerability**, so it is an emergency measure only, and every already-deployed namespaced writer must be reverted at the same time or its `ON CONFLICT` targets will fail with 42P10.
29. **Still outstanding, each needing its own approval:** (a) apply the forward SQL remotely; (b) the Teshow mapping repair on `a761b17a…` - the exact five-step procedure is prepared, preserving that row's uuid, status, `current_step`, `started_at`, `step_timestamps`, GPS, checklist, photos and `activity_log`, with no reset; (c) coordinate with the other environment and identify its source id; (d) Phase 2 `SET NOT NULL` on `bridge_source_id` once every environment is deployed; (e) decide the `reference_number` collision separately.
30. **No migration.** No local iMAPS schema change was needed or made: the namespace lives in the shared remote mirror tables. `php artisan migrate` is neither required nor appropriate and was not run.

---

## 2026-10-01 - CROSS-ENVIRONMENT BRIDGE NAMESPACE COLLISION - PREPARED, NOT APPLIED (REMOTE / SUPABASE)

**Status: PREPARED. Remote apply NOT AUTHORIZED. Ledger untouched. No remote write performed.**

> This entry is the authoritative home for the bridge namespace rationale. The same
> material previously appeared as section 23 of `CANONICAL_DATABASE_SCHEMA.md`; that
> section was removed during the pre-apply gate because this file and
> `FIELDSYNC_BRIDGE_ARCHITECTURE.md` are the correct homes for a remote bridge
> contract that is not part of the local database. **No information was lost** — see
> the audit table and the nine dry-run proofs below.

### Classification

**BLOCKING HOTFIX INSIDE THE LOOP 10 PERIOD** — see the CURRENT STATE block in
`FIELDSYNC_BRIDGE_ARCHITECTURE.md`. Independent of Loop 10's own acceptance rows.

### 1. The defect

The shared Supabase FieldSync bridge tables are written to by more than one iMAPS
environment. Their mirror tables keyed iMAPS rows by **BARE LOCAL INTEGER IDS**,
which are unique only inside ONE iMAPS database while the Supabase project is
shared. Two writable environments therefore resolved the same
`local_inspection_id = 37` onto the same remote `field_jobs` row and overwrote
each other's assignment.

Observed incident: **`APP-2026-00026` / inspection 37 / job
`a761b17a-3fad-44ed-b451-7f0af0e41183`**. Local round 37 holds
`inspector_id = 6` (Renato Dimaculangan), whose handshake resolves to remote
`ddcebeac-2217-41c5-a6e2-d7f873db9af2`. The remote job is assigned to
`c4e22f50-d3c3-4495-b3be-bd264da2e735` (Juan Dela Cruz). **The pointers disagree.**
The row was not deleted; it is still present and `in_progress`.

### 2. The identity contract (LOCKED)

Bridge identity is the composite **`(bridge_source_id, local_*_id)`**.

| | |
|---|---|
| Environment variable | `IMAPS_BRIDGE_SOURCE_ID` |
| Application config | `config('bridge.source_id')` |
| Authority | `App\Services\BridgeSourceIdentity` |
| Remote column | `bridge_source_id` (`text`, nullable) on four mirrored tables |
| Shape | 2–63 chars: letters, digits, `.`, `_`, `-` |
| Rejected placeholders | `default`, `none`, `null`, `nil`, `undefined`, `changeme`, `todo`, `fixme`, `localhost`, `example`, `placeholder`, `your-bridge-source-id` |

Properties: **explicit** (never derived from hostname, `APP_ENV` or database
name), **stable** (configuration, not runtime state), **non-secret** (it appears
in logs and in the remote table), and **fail closed** (a write needing bridge
identity without a usable value raises before any HTTP request).

`production` is deliberately **not** on the rejected list: an environment genuinely
named "production" is an explicit choice. The contract forbids a *silent* fallback
to it, not an explicit value.

### 3. Source identity rule — CORRECTED 2026-10-01

The earlier wording said one distinct value "per iMAPS database/environment" and
listed "clone" among the things a value stays identical across. **That was wrong
and is corrected here:**

- **The SAME logical database / environment keeps the SAME source id** across
  restarts, deploys, rebuilds and rollbacks.
- **ANY independent clone or database that can write to this Supabase project MUST
  be given a NEW source id.** An independently writable clone that inherits the
  parent source's id reproduces the original collision, because bare local integer
  ids are unique only within one database.

A clone is stable *only* when it is not an independent writer. Every statement
implying an independent writable clone should retain the same id has been removed
from `.env.example`, `BridgeSourceIdentity` and the architecture document.

This logical source's id is **`rosario-imaps-local-0921-a`**. It appears in
`.env.example` and documentation only. **It has NOT been written into any `.env`;
that requires explicit approval.**

### 4. `reference_number` is NOT bridge identity

No `UNIQUE(reference_number)` is added, and no mirror correlation by
`reference_number` is introduced. `reference_number` is a **business** identifier.
Public tracking design is explicitly out of scope for this hotfix.

`SupabaseService::getApplicationByReference()` targets the LOCAL
`zoning_applications` table, not `supabase_zoning_applications`, so it is not a
mirror-identity concern.

An audit of executable iMAPS bridge code found **no** reader that identifies or
correlates an application mirror row by `reference_number`.

### 5. Remote tables affected

Four tables, each proven from the live schema to key on a bare iMAPS-local integer.

| Remote table | Local-id identity column | Type | Before | After (prepared) |
|---|---|---|---|---|
| `public.field_jobs` | `local_inspection_id` | `integer`, nullable | `UNIQUE (local_inspection_id)` | `UNIQUE (bridge_source_id, local_inspection_id)` |
| `public.supabase_zoning_applications` | `local_application_id` | `integer`, nullable | `UNIQUE (local_application_id)` | `UNIQUE (bridge_source_id, local_application_id)` |
| `public.supabase_parcels` | `local_parcel_id` | `integer`, nullable | `UNIQUE (local_parcel_id)` | `UNIQUE (bridge_source_id, local_parcel_id)` |
| `public.field_job_reviews` | `technical_review_id` | `bigint` | `UNIQUE (technical_review_id)` | `UNIQUE (bridge_source_id, technical_review_id)` |

`field_job_photos` is **NOT** namespaced: its identity is a remote uuid FK and
there is no local integer to collide. `SET NOT NULL` on `bridge_source_id` is
**Phase 2** and needs its own approval after every writer has deployed.

The `supabase_zoning_applications` constraint name is 58 characters on purpose:
PostgreSQL truncates identifiers at 63, and a silently truncated name would make
the verification and the documented rollback refer to a non-existent object. The
original 74-character name was caught by the dry run.

### 6. Indexes — CORRECTED 2026-10-01

**KEPT:** `field_jobs_bridge_source_id_status_index`, because
`PullCompletedInspections` filters `bridge_source_id` + `status` and `status` is
not the leading column of the composite `UNIQUE`.

**REMOVED as speculative** (they were proposed before the readers were audited):

- `(bridge_source_id, assigned_inspector_id)` — FieldSync's inspector query
  filters `assigned_inspector_id = auth.uid()` and does **not** scope that read by
  `bridge_source_id`, so a composite index leading with `bridge_source_id` would
  not have served it. FieldSync's query is **unchanged**.
- `(bridge_source_id, reference_number)` — no proven reader identifies a mirror row
  by `reference_number`.
- `(bridge_source_id, property_index_number)` — cadastral display data, not bridge
  identity.

An index no query uses costs write amplification on every mirror write and implies
a correlation that does not exist. **No existing live index is removed by this
artifact**, and the FieldSync-owned index remains untouched.

`FieldSyncInspectorVisibilityContractTest` previously REQUIRED the
`assigned_inspector_id` index to exist. That assertion encoded the wrong
premise and now asserts the real invariant instead: the forward SQL never drops
anything FieldSync's visibility depends on, and creates no partial predicate that
could hide an inspector's own rows.

### 7. Frozen legacy backfill classification

| Table | Claimed (Class A) | Total | Left `NULL` |
|---|---|---|---|
| `field_jobs` | 15 | 16 | 1 (Teshow job `a761b17a-…`, Class C, unresolved) |
| `supabase_zoning_applications` | 21 | 24 | 3 (Class B, proven other environment) |
| `supabase_parcels` | 19 | 20 | 1 (Class B, proven other environment) |
| `field_job_reviews` | 0 | 0 | 0 |
| **Total** | **55** | **60** | **5** |

Class A rows were proven by four independent checks: the local row exists; remote
`reference_number` **and** `applicant_name` match; remote `property_index_number`
**and** `owner_name` match with a consistent application relationship; and remote
`assigned_inspector_id` resolves through this deployment's own `handshake_key`
mapping to the local inspector. Class B rows have no local counterpart at all.
Class C is the single row whose mapping and lifecycle evidence disagree.

The UUID lists are **frozen literals inside the script**, joined on the primary
key, so an incorrect edit cannot widen the `UPDATE` set.

### 8. Dry-run result

Nine proofs, all PASS, all against real PostgreSQL in a scratch schema the script
drops before finishing:

1. The pre-fix defect reproduces — a bare `UNIQUE(local_inspection_id)` rejects the second writer.
2. `(source_a, 37)` and `(source_b, 37)` coexist as two distinct rows.
3. A source_a retry converges on the source_a row and leaves FieldSync lifecycle untouched.
4. The same retry does not touch the source_b row.
5. A source_b write cannot overwrite the source_a mapping — the incident, neutralised.
6. An old bare-local-id writer is rejected with SQLSTATE `42P10`.
7. Repeated identical writes stay one row per namespace.
8. An unclaimed (`NULL`) legacy row coexists with both namespaces.
9. Application, parcel and review mirrors all coexist per namespace, and a photo still resolves to its job through the uuid primary key.

### 9. Preserved objects

| Object | Treatment |
|---|---|
| `id uuid` primary keys on all four tables | **PRESERVED.** Replacing a `UNIQUE` does not touch a primary key. |
| `field_job_photos.field_job_id` -> `field_jobs(id)` | **PRESERVED**, proved in the dry run. |
| `field_job_reviews.field_job_id` -> `field_jobs(id)` | **PRESERVED.** |
| `supabase_parcels.supabase_application_id` | **PRESERVED.** |
| All FieldSync-owned lifecycle columns | **NOT WRITTEN.** `status`, `current_step`, `started_at`, `step_timestamps`, `rework_started_at`, `submitted_at`, `checklist_*`, `photo_*`, GPS, `findings`, `observations`, `discrepancies`, `recommendations`, `inspection_result`, `is_compliant`, `inspector_notes`. |
| Row counts | **UNCHANGED.** Asserted in the script. No `DELETE`, `TRUNCATE`, `DROP TABLE` or `DROP COLUMN`. |

### 10. Old-deployment behaviour after a future apply

An old iMAPS deployment still sending `ON CONFLICT (local_inspection_id)` receives
`SQLSTATE 42P10` (PostgREST HTTP 409) and its delivery attempt is marked failed by
the writer's existing non-2xx branch. It **fails closed** rather than corrupting
another environment. Every active deployment on the project must be upgraded
first. No compatibility shim is provided, because preserving the bare-local-id
conflict target preserves the vulnerability.

### 11. Rollback

Written out in full at the foot of the forward SQL: drop the four composite
constraints, drop `field_jobs_bridge_source_id_status_index`, drop the four
`bridge_source_id` columns, restore the four original bare `UNIQUE` constraints.
Reverting **restores the collision vulnerability**, so it is an emergency measure
only, and every deployed namespaced writer must be reverted at the same time or
its `ON CONFLICT` targets will fail with `42P10`.

If a namespace value is later found duplicated between two environments, the fix
is to give one of them a new `IMAPS_BRIDGE_SOURCE_ID` and re-push its own rows
under it. Existing rows are **not** rewritten in place; that would be the hijack
all over again.

### 12. Local impact

**NONE.** No local iMAPS table, column, constraint or index changes. No migration.
No ledger change. The only iMAPS-side changes are
`BridgeSourceIdentity` documentation, the `.env.example` example, the two
unapplied SQL artifacts, the corrected test premise, and documentation.

---

## 2026-10-02 - PRE-APPLY CORRECTION: `updated_at` TRIGGER SIDE-EFFECT ON THE `field_jobs` BACKFILL

**Status: PRE-APPLY CORRECTION. Still PREPARED, still NOT applied. No remote SQL executed. No `.env` modified.**

### 1. The defect this correction fixes

`public.field_jobs` carries an **enabled `BEFORE UPDATE` trigger
`trg_field_jobs_set_updated_at` executing `public.set_updated_at_utc()`** — a fact
established by a live read-only catalog query recorded earlier in this log, and
corroborated by the current data: 9 of 16 jobs carry an `updated_at` that differs
from `created_at`, which is what a firing `BEFORE UPDATE` trigger produces.

The prepared Phase 1 backfill was
`UPDATE public.field_jobs SET bridge_source_id = v_source WHERE ...`. That is an
`UPDATE`, so the trigger fired and stamped a fresh `updated_at` onto **all 15
Class-A rows**, including **two COMPLETED rounds** whose write times are
historical evidence. The intended change is `bridge_source_id` and nothing else,
so the original plan silently rewrote the observable write-time of every real
inspection job.

**Note on verification:** `pg_trigger` is not reachable through PostgREST, so the
trigger's existence cannot be confirmed from the iMAPS application. It is
therefore asserted **inside the forward SQL transaction itself**, which is the
correct place for the guard regardless: an environment whose trigger is missing,
renamed or already disabled must abort before a single row is touched.

### 2. The correction

`database/sql/2026_10_01_bridge_source_namespace_collision_fix_forward.sql`
Section 5 now, for `field_jobs` only:

1. **5a — BEFORE snapshot** into a temp table (`ON COMMIT DROP`) of `id`,
   `updated_at`, `status`, `current_step`, `started_at`, `submitted_at`,
   `step_timestamps`, `assigned_inspector_id`, `supabase_application_id`,
   `supabase_parcel_id` for every frozen Class-A uuid. An empty snapshot RAISEs:
   if the frozen list matched nothing, the backfill would claim nothing and the
   verification would be vacuous.
2. **5b — assert** `trg_field_jobs_set_updated_at` **exists and is enabled**
   (`tgenabled = 'O'`). Missing, renamed or already-disabled → `RAISE`, aborting
   the transaction **before any row is written**.
3. **5c — disable that one trigger by exact name**:
   `ALTER TABLE public.field_jobs DISABLE TRIGGER trg_field_jobs_set_updated_at`.
4. **5d — run the frozen Class-A backfill**, setting `bridge_source_id` only.
5. **5e — re-enable immediately** and **assert** it is enabled again.
6. **5f — verify** that `bridge_source_id` equals the requested source id and that
   every other snapshotted column is identical. Any mismatch → `RAISE`, rolling
   back the whole transaction.

What is **NOT** done:

- the trigger **function** is never modified;
- the trigger is **never dropped**;
- **`DISABLE TRIGGER USER` is never used** — that would also suppress
  `trg_preserve_completed_field_job_lifecycle`, the FieldSync-side guard on
  finished rounds;
- the completed-lifecycle trigger is never disabled;
- the mirror tables (`supabase_zoning_applications`, `supabase_parcels`,
  `field_job_reviews`) have no such trigger and need no handling.

Everything stays inside the script's single existing transaction, so a failure
rolls the re-enable back together with everything else. `ALTER TABLE ... DISABLE
TRIGGER` is transactional in PostgreSQL.

All comparisons use `IS DISTINCT FROM`, so a `NULL` is treated as a real
difference rather than an unknown that silently matches nothing.

### 3. Dry-run proof (real PostgreSQL, throwaway database)

The dry run now creates **both** live triggers and adds a tenth test. Executed
against a scratch database that was dropped afterwards; the real Supabase project
was never contacted.

| Step | Proof | Result |
|---|---|---|
| 10a | an ordinary `UPDATE` changes `updated_at` | **PASS** |
| 10b | the timestamp trigger exists and is enabled before anything is disabled | **PASS** |
| 10c | disabling by exact name leaves `trg_preserve_completed_field_job_lifecycle` **enabled** | **PASS** |
| 10d | the namespace backfill sets `bridge_source_id` and preserves `updated_at` byte-identically, plus `status`, `current_step`, `submitted_at`, `step_timestamps`, `assignment_instructions` | **PASS** |
| 10e | the trigger is re-enabled and verified | **PASS** |
| 10f | an ordinary `UPDATE` changes `updated_at` again after re-enable | **PASS** |
| 10g | the completed-lifecycle guard still rejects a status change on a completed row | **PASS** |

Dry run exit code `0`; the scratch database was confirmed gone (`0` matching rows
in `pg_database`) afterwards.

Two real defects surfaced while building this proof and were fixed: the scratch
`field_jobs` table had no `created_at`/`updated_at` columns at all, so the trigger
function had nothing to assign; and three temp tables were declared
`ON COMMIT DROP`, which under `psql` autocommit are destroyed by their own
creating transaction and were therefore missing when the later verification read
them. The teardown `DROP SCHEMA ... CASCADE` already cleans them up.

### 4. Teshow recovery contract CORRECTED

The documented Pass 2 procedure previously claimed the Teshow row's `updated_at`
stays byte-identical. **That claim was wrong** and is now corrected.

Unlike the Class-A backfill — which changes nothing but `bridge_source_id` — the
Teshow repair is a **genuine data change**, so the enabled `updated_at` trigger
**must** stamp a new value. Suppressing it there would falsify the record of when
the mapping was corrected.

| | |
|---|---|
| **PRESERVE EXACTLY** | job uuid, `created_at`, `status`, `current_step`, `started_at`, `step_timestamps`, `rework_started_at`, `submitted_at`, GPS evidence, checklist progress and `checklist_data`, photo evidence and every `field_job_photos` row, inspection result and evidence text, every `activity_log` row |
| **EXPECTED TO CHANGE** | the mapping columns being repaired (`supabase_application_id`, `supabase_parcel_id`, `assigned_inspector_id`, `scheduled_date`, `deadline_date`, `assignment_instructions`), `bridge_source_id`, and `updated_at` — the last **exactly because the real enabled trigger records the repair** |

The repair is now specified as **ONE guarded `UPDATE`** against the single uuid
`a761b17a-3fad-44ed-b451-7f0af0e41183`, setting all six mapping columns **and**
`bridge_source_id` in the same statement, inside one transaction with a BEFORE
snapshot, AFTER assertions and rollback on any preservation failure. The previous
five-step procedure deferred `bridge_source_id` to a second write, which could
half-apply. **The repair has NOT been executed.**

### 5. Local impact

**NONE.** No local iMAPS table, column, constraint or index changes; no migration;
no ledger change. Only the unapplied forward SQL, the unapplied dry run, the
`FieldSyncInspectorVisibilityContractTest` invariants and documentation.

---

## 2026-10-02 - PREPARED CORRECTIVE FOLLOW-UP: SURVIVING STANDALONE UNIQUE INDEX ON `field_job_reviews` — **NOT YET APPLIED**

**Status: PREPARED. Remote apply NOT AUTHORIZED. No remote write executed in this pass.**
**SUPERSEDED 2026-10-02 - the corrective was subsequently applied and verified;
see the later entry "CORRECTIVE APPLIED: STANDALONE BARE UNIQUE INDEX ON
`field_job_reviews` REMOVED - APPLIED / VERIFIED". This entry is preserved
unaltered below as the plan as written.**

### 1. What was found

The Phase 1 namespace apply succeeded on the four composite identities and the
15/21/19/0 backfill, but **one bare uniqueness object survived** on
`field_job_reviews`:

```
field_job_reviews_technical_review_id_key   UNIQUE btree (technical_review_id)
```

Verified live as a **standalone index**, not a constraint: its owning
`pg_constraint` row is `NULL`. The three other tables' bare uniques were removed
correctly.

### 2. Root cause

`2026_10_01_bridge_source_namespace_collision_fix_forward.sql` Section 6 dropped
every survivor with:

```sql
ALTER TABLE public.field_job_reviews DROP CONSTRAINT IF EXISTS <name>
```

A PostgreSQL `UNIQUE` may be either

- a **constraint-backed** object — present in `pg_constraint`, dropped by `DROP CONSTRAINT`; or
- a **standalone unique index** — absent from `pg_constraint`, dropped only by `DROP INDEX`.

On this table it was the second shape. `IF EXISTS` suppressed the error and
`DROP CONSTRAINT` did nothing at all. The drop was **silently a no-op** — which is
why the apply reported success and a post-apply assertion did not catch it.

### 3. Consequence

The composite that was added beside it can never admit a second row for the same
`technical_review_id`, because the bare index forbids it first. Two iMAPS
environments still cannot both write `local technical_review_id = N`. That is
precisely the collision class the namespace exists to remove, so
**`field_job_reviews` is only half namespaced.**

The table holds **0 rows**, so nothing is blocked today and no delivery is
affected: this is a **latent** defect, not an active one.

### 4. Why the post-apply verification missed it

The forward SQL's Section 8 asserted that each *composite* constraint existed and
valid. It never asserted that the *bare* object was **absent**, because Section 6
reported a drop as a `NOTICE` and treated `DROP CONSTRAINT IF EXISTS` as
sufficient. The dry run could not catch it either: it created the bare unique as a
table-level `UNIQUE (...)`, i.e. always the **constraint** shape, so the
standalone shape was never exercised.

### 5. Correction to the forward artifact (for the future)

Section 6 now **catalog-detects the object type per survivor** rather than
assuming it:

```sql
LEFT JOIN pg_constraint k ON k.conrelid = t.oid AND k.conname = c.relname
...
IF v_is_constraint THEN ALTER TABLE ... DROP CONSTRAINT ...
ELSE                     DROP INDEX ... END IF;
```

and then **verifies the object is gone, raising if it survives**. A drop that
cannot be verified is now a hard failure, not a notice. The same applies to all
four tables, and `NOT i.indisprimary` keeps primary keys out of scope.

Everything else is unchanged: same transaction, same backfill lists, same
composite names, same trigger handling, same source-id rules, same preservation
assertions.

### 6. Dry-run correction — both shapes now reproduced

The dry run's `field_job_reviews` bare unique is now created as a
**standalone index**, matching the live shape, while the other three remain
table-level constraints. Its Section 6 equivalent performs the same
type detection. One run now proves both paths:

```
field_jobs:                     dropped bare UNIQUE CONSTRAINT field_jobs_local_inspection_id_key
supabase_zoning_applications:   dropped bare UNIQUE CONSTRAINT supabase_zoning_applications_local_application_id_key
supabase_parcels:               dropped bare UNIQUE CONSTRAINT supabase_parcels_local_parcel_id_key
field_job_reviews:              dropped bare UNIQUE INDEX    field_job_reviews_technical_review_id_key
```

Had the dry run kept using `DROP CONSTRAINT IF EXISTS` everywhere, the fourth
line would be missing and the review-coexistence proof would fail. That is now a
real regression test rather than an assumption.

### 7. Corrective artifact prepared

`database/sql/2026_10_02_drop_field_job_reviews_bare_unique_index_after_namespace.sql`

Single transaction. Preconditions asserted before any change:

1. `public.field_job_reviews` exists;
2. `bridge_source_id` exists and is `text` (proving the apply ran first);
3. row count is exactly `0`;
4. the composite `UNIQUE (bridge_source_id, technical_review_id)` exists and is **valid**;
5. the survivor's `pg_get_indexdef` matches the exact expected string;
6. it is a valid single-column `UNIQUE` on `technical_review_id`;
7. it has **no owning `pg_constraint`** — the fact that made the original drop a no-op;
8. it is not the primary key.

Any mismatch `RAISE`s and rolls back. The only mutation is:

```sql
DROP INDEX public.field_job_reviews_technical_review_id_key;
```

Postconditions verified inside the same transaction: survivor gone; **no** bare
`UNIQUE` on `technical_review_id` under **any** name; composite intact and valid;
primary key intact; `field_job_id` foreign key intact; row count still `0`. No
other table is touched and nothing is written.

### 8. Verification

- Dry run exit `0`; all eight `updated_at` proofs PASS; both uniqueness shapes
  proved removed; scratch database confirmed dropped.
- `BridgeReviewUniqueIndexGapTest` **13 tests / 88 assertions** — new. Pins the
  object-type detection, the "survivor must be gone" failure mode, the
  `NOT i.indisprimary` scope guard, the dry run's standalone shape, and every
  precondition and postcondition of the corrective artifact.
- `BridgeNamespaceSqlContractTest` 41/217, `BridgeSourceNamespaceCollisionTest`
  21/115, `FieldSyncInspectorVisibilityContractTest` 6/31.
- Full Unit **748 passed / 4183 assertions / 0 failures / 9 skipped** (the 9 are
  the known `pdo_sqlite` gap). `npm run build` PASS. Whitespace check clean.
- Maintenance-mode note: three `Loop9c2RetryActionContractTest` cases assert 403/302
  from real routes and fail while the application is in maintenance mode, because
  Laravel returns 503 before routing. **Proved to be the sole cause** — lifting
  maintenance gives 748/748, and maintenance was restored immediately. This is a
  consequence of the Pass 2A freeze, not of these changes.

### 9. Status

**PREPARED corrective follow-up, NOT YET APPLIED.** The architecture document is
deliberately **not** marked fully verified. Remote apply requires explicit
approval and a fresh precheck, exactly like every prior remote change.

### 10. Deliberately not done

No remote SQL executed. Teshow not repaired. No `.env` change. No queue worker
started. `php artisan up` not left in effect (maintenance restored ON). No
FieldSync change. No master merge, sync, rebase or push. `.env` not committed.

---

## 2026-10-02 - CORRECTIVE APPLIED: STANDALONE BARE UNIQUE INDEX ON `field_job_reviews` REMOVED - **APPLIED / VERIFIED**

**Status: APPLIED / VERIFIED. This supersedes the status of the PREPARED entry
above; that entry is preserved unaltered above as the plan as written.**

### 1. Date/time and scope

2026-10-02. Exactly one object was removed from the shared Supabase FieldSync
project (`laapipjyprmmaylunxib`). Nothing else was written, in this pass or in
the Teshow pass that follows it on the same date.

### 2. Exact operation

`database/sql/2026_10_02_drop_field_job_reviews_bare_unique_index_after_namespace.sql`,
executed as committed through native `psql` with `-v ON_ERROR_STOP=1`. **psql exit
0.** The artifact was not stripped of its psql commands, not inlined, not
rewritten, and not substituted with a Management API SQL statement.

The single mutation, verbatim:

```sql
DROP INDEX public.field_job_reviews_technical_review_id_key;
```

### 3. What was removed, and how it is proved to be that object

**Exactly one** standalone bare `UNIQUE` index was removed:
`public.field_job_reviews_technical_review_id_key`, a valid single-column
`UNIQUE` on `technical_review_id` with **no owning `pg_constraint`** - the fact
that made the original drop inside the namespace forward SQL a silent no-op.
All eight preconditions were asserted before the drop, and the six
postconditions inside the same transaction, all of which passed.

### 4. What was preserved

- The composite `UNIQUE (bridge_source_id, technical_review_id)` is intact and
  valid, as `field_job_reviews_bridge_source_id_technical_review_id_key`. It
  owns exactly one `pg_constraint` row.
- The primary key `field_job_reviews_pkey` and the `field_job_id` foreign key
  are intact.
- `field_job_reviews` row count remained **0** throughout. The table has never
  held a row, so the drop could not have destroyed data.
- **No other table was touched.** The artifact contains no `DELETE`, no
  `TRUNCATE`, no `DROP TABLE` and no `DROP COLUMN`.

### 5. Post-apply read-back, re-queried independently after the apply

`pg_indexes` on `public.field_job_reviews` returns exactly three indexes, and
the bare unique's relname is absent from `pg_class` entirely:

| index | definition | owning `pg_constraint` |
| --- | --- | --- |
| `field_job_reviews_bridge_source_id_technical_review_id_key` | `UNIQUE (bridge_source_id, technical_review_id)` | 1 |
| `field_job_reviews_field_job_id_index` | `(field_job_id)` | 0 |
| `field_job_reviews_pkey` | `UNIQUE (id)` | 1 |

### 6. Consequence for the bridge contract

The namespace is now structurally complete. `technical_review_id` is no longer
uniquely constrained on its own anywhere, so a second iMAPS environment can
hold a review for the same Supabase `technical_review_id` without colliding,
while the composite still guarantees one review per
`(bridge_source_id, technical_review_id)` **within** each environment. This is
the whole point of the Phase 1 namespace fix, and the surviving bare unique was
the last place where the pre-fix assumption still lived in the live schema.

### 7. What remains outstanding

- **Teshow Round 2 recovery is PENDING.** The corrective removed a schema
  obstacle; it did not repair a single row. The mapping repair on
  `a761b17a-3fad-44ed-b451-7f0af0e41183` is prepared and validated but **not
  applied**; it is recorded in the entry that follows this one.
- Loop 10 remains **PARTIAL - FIELD ACCEPTANCE PENDING**. CP7-CP13 are unproven
  and cannot be claimed from a database-side change. This entry changes no
  Loop 10 status.

### 8. Deliberately not done

No repair SQL executed. No queue worker started. `php artisan up` not left in
effect - maintenance mode remains ON. No FieldSync change. No master merge,
sync, rebase or push. `.env` and `.env.testing` not read, modified, staged or
committed. No credential, token, handshake key or database password recorded.

---

## 2026-10-02 - TESHOW ROUND 2 GUARDED MAPPING REPAIR - **APPLIED / VERIFIED**

**Status: APPLIED / VERIFIED by an authorized operator, then independently
reverified read-only from the backend. Backend recovery and visibility PASS.
Device confirmation remains PENDING. Loop 10 remains PARTIAL - FIELD ACCEPTANCE
PENDING. No remote write was performed during this finalization pass.**

### 1. Date/time and scope

2026-10-02. Branch `fix/bridge-source-namespace-collision`, head
`bbe483abe5ffc000b0eb0b3c897d7d32edf2cebd` at the start of this pass. Locked
bridge source `rosario-imaps-local-0921-a`. Maintenance mode ON, queue worker
NONE, throughout.

### 2. The artifact

`database/sql/2026_10_02_repair_teshow_round2_after_bridge_namespace.sql`

One transaction. One `UPDATE`, against one primary key:

```
a761b17a-3fad-44ed-b451-7f0af0e41183     (local_inspection_id = 37)
```

### 3. Seven columns written, and nothing else

| column | corrupt value found | value written |
| --- | --- | --- |
| `bridge_source_id` | `NULL` | `rosario-imaps-local-0921-a` |
| `supabase_application_id` | `7a87a08d-...` (other env) | `eaf432ea-8f26-4266-bf4b-ca88887ac470` |
| `supabase_parcel_id` | `2676c039-...` (other env) | `69bfaafb-a5e2-4871-b9d0-830ea0599b3f` |
| `assigned_inspector_id` | `c4e22f50-...` (other env) | `ddcebeac-2217-41c5-a6e2-d7f873db9af2` |
| `scheduled_date` | `2026-10-01` | `2026-09-23` |
| `deadline_date` | `2026-10-03` | `2026-10-23` |
| `assignment_instructions` | `ddd` | `Loop 4 Round 2 reinspection E2E.` |

`id`, `local_inspection_id`, `created_at`, `status`, `current_step`,
`started_at`, `assigned_by_imaps_user_id` and `assigned_by_name` are **not**
assigned, and neither is any lifecycle, GPS, checklist, photo or evidence
column. `updated_at` is **not** assigned either - the enabled
`trg_field_jobs_set_updated_at` trigger stamps it, because this is a genuine
data change and suppressing the timestamp would falsify the record of when the
mapping was corrected.

### 4. The restored values are corroborated, not assumed

Each "after" value was read back from the **local canonical database** and each
remote UUID was confirmed to exist on Supabase, read-only:

- local `site_inspections` **37** -> `zoning_application_id` **132** =
  `APP-2026-00026` -> `eaf432ea-...` exists
- `parcel_id` **64** = **Mavalor** -> `69bfaafb-...` exists
- `inspector_id` **6** = **Renato Dimaculangan**, `dimaculanganr@gmail.com` ->
  `ddcebeac-...`
- `scheduled_date` `2026-09-23`, `deadline_date` `2026-10-23`,
  `assigned_notes` `Loop 4 Round 2 reinspection E2E.`
- local status `assigned`, `confirmed_latitude`/`confirmed_longitude` `NULL`,
  `completed_at` `NULL` - consistent with the remote row's preserved
  `in_progress` / `current_step = 1`.

The decisive cross-check is **Mavalor**. The surviving `activity_log` row
records Renato completing "Step 1: Site verification" at **Mavalor** on
2026-09-26, and restored parcel 64 **is** Mavalor. The corrupted mapping
pointed real completed work at a different site; the restored mapping points it
back at the site the inspector actually visited. FieldSync's own log and the
local record agree with each other.

### 5. All twenty preconditions re-verified against the live remote, read-only

`id`; `bridge_source_id IS NULL`; `local_inspection_id = 37`;
`status = in_progress`; `current_step = 1`;
`started_at = 2026-09-26T18:05:46.831173+00`;
`created_at = 2026-09-22T13:48:04.35162+00`;
`updated_at = 2026-10-01T02:45:13.120729+00` (the hijack timestamp);
`supabase_application_id = 7a87a08d-...`; `supabase_parcel_id = 2676c039-...`;
`assigned_inspector_id = c4e22f50-...`; `scheduled_date = 2026-10-01`;
`deadline_date = 2026-10-03`; `assignment_instructions = 'ddd'`;
`assigned_by_imaps_user_id = 4`; `assigned_by_name = 'Jyerine Desunia'`;
`field_job_photos` **0**; `field_job_reviews` **0**; `activity_log` **1**;
`local_inspection_id = 37` present on exactly **1** row in the whole table.

Loop 10 guard, also verified read-only: job `1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999`,
`bridge_source_id = rosario-imaps-local-0921-a`, `status = in_progress`,
`current_step = 1`, `started_at = 2026-10-01T03:39:49.20847+00`,
`updated_at = 2026-10-01T03:39:49.349537+00`.

### 6. The preservation contract, and how it is enforced

The whole row is snapshotted before the write. After the write, `to_jsonb` of the
after-row minus **only** the seven mapping columns and `updated_at` must equal
the same projection of the before-row. Two further checks close the loopholes a
per-key comparison would leave: the two key sets must be identical, and the two
whole projected documents must be equal as text. `field_job_photos`,
`field_job_reviews` and `activity_log` are compared by count **and** by
`md5(string_agg(t::text, ',' ORDER BY t.id))`. The Loop 10 job is compared
byte-for-byte, `updated_at` included, because this repair does not target it and
so must not move it at all.

### 7. Behavioural validation, in throwaway databases, never the real bridge

The artifact's own statements were executed against a scratch PostgreSQL
database that reproduces the real table shapes, the real `set_updated_at_utc()`
trigger, and the exact audited row in its exact corrupt state - with only the
schema qualifier changed. The real bridge was never referenced.

- **Positive run: applied and committed, `psql` exit 0.** Every postcondition
  held: preservation byte-identical, `updated_at` advanced through the trigger,
  dependent evidence unchanged (`photos=0, reviews=0, activity_log=1`), Loop 10
  job byte-identical, and exactly **1** row resolving for
  `(rosario-imaps-local-0921-a, 37)`. An independent read-back in a fresh psql
  session confirmed the repaired mapping persisted.
- **Drift run: refused, `psql` exit 3.** The identical fixture was re-created
  and then written once more by "the other environment" before the repair ran.
  The `updated_at` precondition refused it, and a read-back proved the row was
  left exactly as the drift left it - `bridge_source_id` still `NULL`, the
  drifted values intact. This is the guard doing its job: the audited
  corruption is a point in time, and a second hijack invalidates the plan.

Both scratch databases were dropped and confirmed absent.

### 8. Three defects this validation caught in the artifact itself

Recorded because they would each have aborted a correct apply against the real
bridge, and because a text-only review had passed all three:

1. `RAISE NOTICE '...', v_n;` with no `%` placeholder is a PL/pgSQL error
   (`too many parameters specified for RAISE`). Under `ON_ERROR_STOP` this
   aborted the transaction immediately after a successful write.
2. `GET DIAGNOSTICS v_n = ROW_COUNT;` in a `DO` block *separate* from the
   `UPDATE` always reads `0`, because `ROW_COUNT` is scoped to the statement's
   own context. The artifact would have reported `the UPDATE affected 0 row(s)`
   and rolled back a correct repair. The `UPDATE` now lives inside the same
   `DO` block, so it is still exactly one statement against exactly one key.
3. The preservation join used `USING (key)` against `jsonb_each(...) AS b(k, v)`.
   The column-list alias renames the columns, so `USING (key)` fails with
   `column "key" specified in USING clause does not exist in left table`. Now
   `ON b.k = a.k`.

A fourth issue was corrected as a design fault rather than a crash: the
"nothing created or deleted" postcondition hardcoded `field_jobs` to 16 rows.
That would abort a valid repair if an unrelated job were created between the
audit and the apply. It now compares against the count snapshotted at the start
of the same run, which is the property that actually matters.

### 9. Status

**APPLIED / VERIFIED.** An authorized operator applied and committed
`database/sql/2026_10_02_repair_teshow_round2_after_bridge_namespace.sql`.
The finalization pass then performed only read-only backend queries; it did not
re-execute the repair or any other remote SQL.

### 10. Read-only post-apply verification

- Teshow resolves exactly once by UUID and exactly once by
  `(bridge_source_id, local_inspection_id) = (rosario-imaps-local-0921-a, 37)`.
- The verified row is UUID `a761b17a-3fad-44ed-b451-7f0af0e41183`, application
  `eaf432ea-8f26-4266-bf4b-ca88887ac470`, parcel
  `69bfaafb-a5e2-4871-b9d0-830ea0599b3f`, and inspector
  `ddcebeac-2217-41c5-a6e2-d7f873db9af2` (Renato).
- FieldSync lifecycle remains `in_progress` / step `1`; trigger-managed
  `updated_at` is `2026-10-02T03:02:20.971649+00:00`.
- Dependent evidence remains `photos=0`, `reviews=0`, `activity_log=1`.
- The backend equivalent of FieldSync's inspector filter,
  `assigned_inspector_id = ddcebeac-2217-41c5-a6e2-d7f873db9af2`, returns the
  Teshow UUID exactly once: **BACKEND VISIBILITY PASS**.
- Round 1 / local inspection `36` remains exactly one row, UUID
  `76d79ab8-e38e-4682-ada2-a67ac84dde00`, `completed` / step `6`, on the same
  application, parcel, source and inspector.
- Loop 10 UUID `1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999` remains on source
  `rosario-imaps-local-0921-a`, `in_progress` / step `1`; Loop 10 remains
  **PARTIAL / FIELD ACCEPTANCE PENDING**.
- Device confirmation is still **PENDING**. No FieldSync source was changed.

### 11. Operational boundary

No queue worker was started. No FieldSync change. No master merge, sync, rebase
or push. No `.env` or `.env.testing` staging or commit. No credential, token,
handshake key or database password recorded. No GPS value faked, no proximity
rule bypassed, no completion manufactured, and no inspection progress edited
directly.

### 2026-10-02 - Teshow recovery closure + Loop 10 resume - **NO DB WRITE** - DOCS-ONLY ACCEPTANCE NOTES

1. **Date/time:** 2026-10-02. **STATUS: Teshow recovery CLOSED; Loop 10 remains PARTIAL / FIELD ACCEPTANCE PENDING.** **Schema change: NONE. Data change: NONE. Forward SQL: NONE. Migration: NONE.** No Supabase write, no iMAPS write, no FieldSync change, no master change. Documentation only.
2. **Branch:** `fix/bridge-source-namespace-collision`, at `d48ea25`. Same branch only; no merge, sync, rebase or push of `master`.
3. **Device confirmation recorded: PASS.** Teshow Round 2 is visible on the FieldSync device, and the backend row it resolves to is correct: job `a761b17a-3fad-44ed-b451-7f0af0e41183`, `local_inspection_id 37`, `bridge_source_id rosario-imaps-local-0921-a`, application `eaf432ea-…` (APP-2026-00026 / Teshow), parcel `69bfaafb-…` (local parcel 64, Jose Dimayuga, Mavalor), inspector `ddcebeac-…` (Renato / Hubbie), with `status in_progress`, `current_step 1`, `started_at 2026-09-26T18:05:46.831173+00:00`, `step_timestamps {"1": "2026-09-26T17:50:46.146511Z"}` and Renato's Mavalor `activity_log` row all intact. Backend and device now agree on round, site and inspector.
4. **Historical review limitation recorded.** `technical_reviews` 75 (`review_round 1`, `Needs Site Inspection`, `site_inspection_task_id 36`) and 76 (`review_round 2`, `Requires Reinspection`, `site_inspection_task_id 37`), both `zoning_application_id 132`, `parcel_id 64`, `reviewed_by 4`, were written **2026-09-22** — five days before Loop 8 introduced `reviewed_site_inspection_id`, `resolveReviewedInspectionId()` and the `PushPlanningReviewToSupabase` transport (**2026-09-27**). `reviewed_site_inspection_id` is therefore legitimately **NULL** on both, and **no Planning Review card is expected in FieldSync** for `APP-2026-00026` unless a future valid post-Loop 8 review is created normally.
5. **Review data changed: NO.** Verified read-only after the closure work: review 75 and 76 are byte-identical to the pre-closure audit on `decision`, `review_round`, `site_inspection_task_id`, `reviewed_site_inspection_id`, `parcel_id`, `zoning_application_id` and `updated_at`. No backfill. No inferred linkage. No hand-created `field_job_reviews` row. No FieldSync UI change.
6. **Why the NULL must not be "fixed".** Loop 8's own contract states a NULL `reviewed_site_inspection_id` "is the honest answer when no completed round exists — no link is invented, and no historical row is backfilled", and that `site_inspection_task_id` (the NEW round a decision creates) is explicitly NOT a synonym of the reviewed round. Inferring `36` for review 76 from `review_round = 2` is precisely that forbidden inference. Review 75 is doubly excluded: `Needs Site Inspection` is deliberately outside `TRANSPORTABLE_DECISIONS` because it is the initial scheduling decision with no reviewed round.
7. **No transport failure occurred — recorded so it is not re-investigated.** `field_job_reviews` = 0 rows. `failed_jobs` = 14 rows and **0** of them name `PushPlanningReviewToSupabase`; all 14 are `PushInspectionToSupabase` on unrelated rounds. The `jobs` queue held 0 pending rows before the worker was started. Both dispatch sites guard on `if ($reviewedSiteInspectionId !== null)`, so with the column NULL neither row ever built a transport; there is nothing to replay or retry.
8. **iMAPS web UI unaffected and already correct.** `ApplicationController::show` selects `technical_reviews.*` for `zoning_application_id = 132` (left-joined to `users` for `reviewed_by_name`, ordered by `review_round DESC`) and passes `technicalReviews` to `Applications/Show`, which renders both reviews in the per-parcel review panel and in the History timeline. The reviews were always visible in iMAPS; only the FieldSync card is absent, for the reason in item 4.
9. **Maintenance mode: OFF.** No `storage/framework/down`; no `php artisan down` in effect.
10. **Queue worker: RUNNING, using the project's existing process only.** Command `php artisan queue:work` — byte-identical to the project's `npm run dev:queue` script and the same command the project's existing dev runner already spawns alongside `php artisan serve`. No supervisor, service, watchdog, systemd unit or new process model was invented or installed. `queue:restart` was deliberately NOT run, to avoid signalling the live worker.
11. **Duplicate avoided.** During the check a second `queue:work` was started and immediately stopped again, leaving exactly ONE `queue:work` process — the project's own, **PID 48352**, started 11:45:41. Liveness verified: process alive, `Responding = True`, and CPU delta of **0 s over a 3 s sample**, i.e. healthy and idle in its wait loop rather than spinning or blocked.
12. **Starting the worker was provably safe and had no remote effect.** `jobs` held **0 pending rows** before the worker was started, so the start was a no-op by construction and could not write to Supabase. A byte-for-byte remote snapshot diff taken immediately before and after (worker running) confirms it: `field_jobs` 16, `supabase_zoning_applications` 24, `supabase_parcels` 20, `field_job_photos` 5, `activity_log` 7, `field_job_reviews` 0 — **all UNCHANGED**.
13. **Teshow protected: PASS.** Row `a761b17a-3fad-44ed-b451-7f0af0e41183` byte-identical across the closure window.
14. **Loop 10 protected: PASS.** Frozen resume baseline `APP-2026-00030` / application 145 / round 41 / job `1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999` byte-identical: `bridge_source_id rosario-imaps-local-0921-a`, `status in_progress`, `current_step 1`, application `b108513f-…`, parcel `cf974dc9-…`, inspector `7abb9a75-…` (Gemini), `updated_at 2026-10-01T03:39:49.349537+00:00`.
15. **Duplicate jobs: 0.** 16 rows across 16 distinct `local_inspection_id` values; zero local ids carry more than one `field_jobs` row anywhere in the namespace.
16. **`field_job_reviews` still 0.** Verified before and after.
17. **Loop 10 status UNCHANGED: PARTIAL / FIELD ACCEPTANCE PENDING.** Nothing here advanced a checkpoint. CP1–CP6 remain PASS; CP7–CP13 remain **FIELD ACCEPTANCE PENDING** because FieldSync enforces a real 30 m proximity rule against the assigned parcel and no device session has taken place on site. **Next: resume Loop 10 at CP7** against the frozen baseline in item 14.
18. **Validation:** documentation-only change. Full Unit suite 735 / 4028 PASS with the 16 pre-existing deprecations and 9 pre-existing skips unchanged; `npm run build` PASS; `php -l` clean; `git diff --check` clean. No source file was modified, so no behaviour changed and no focused test needed updating.
19. **Still outstanding, unchanged from the prior entries:** Loop 10 CP7–CP13 field acceptance; the historical round-35 reverse-sync gap (open separate, predates Loop 10); and the `reference_number` cross-environment collision, still recorded and deliberately unfixed.
20. **Not done:** no Supabase write, no iMAPS write, no `field_job_reviews` creation, no technical-review backfill or inference, no FieldSync change, no queue dispatch of any pending job, no new worker/supervisor setup, no master change.
