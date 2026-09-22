# iMAPS ↔ FieldSync Database Change Log

## Purpose and rules

Canonical audit ledger for actual PostgreSQL, Supabase database, and Supabase backend mutations supporting the iMAPS ↔ FieldSync bridge. `FIELDSYNC_BRIDGE_ARCHITECTURE.md` defines the contract; this file records actual or pending database/backend changes.

Never record credentials, keys, tokens, handshakes, passwords, or secrets. If historical execution cannot be proved, record **Historical change — exact executed SQL unavailable**.

## Change entries

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
- FieldSync device coexistence and new push-notification receipt: **pending user confirmation**.


## Future-entry template

Record all 14 fields used above. Never include secrets.
