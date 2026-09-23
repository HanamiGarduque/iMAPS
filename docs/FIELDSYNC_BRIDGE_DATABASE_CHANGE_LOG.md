# iMAPS ↔ FieldSync Database Change Log

## Purpose and rules

Canonical audit ledger for actual PostgreSQL, Supabase database, and Supabase backend mutations supporting the iMAPS ↔ FieldSync bridge. `FIELDSYNC_BRIDGE_ARCHITECTURE.md` defines the contract; this file records actual or pending database/backend changes.

Never record credentials, keys, tokens, handshakes, passwords, or secrets. If historical execution cannot be proved, record **Historical change — exact executed SQL unavailable**.

## Change entries

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

## Future-entry template

Record all 14 fields used above. Never include secrets.
