# iMAPS ↔ FieldSync Database Change Log

## Purpose and rules

Canonical audit ledger for actual PostgreSQL, Supabase database, and Supabase backend mutations supporting the iMAPS ↔ FieldSync bridge. `FIELDSYNC_BRIDGE_ARCHITECTURE.md` defines the contract; this file records actual or pending database/backend changes.

Never record credentials, keys, tokens, handshakes, passwords, or secrets. If historical execution cannot be proved, record **Historical change — exact executed SQL unavailable**.

## Change entries

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
