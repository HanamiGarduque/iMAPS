# Canonical Database Schema — iMAPS ↔ FieldSync Bridge

**Status:** CANONICAL — reconciled 2026-09-26; Maps compatibility added 2026-09-27
**Scope:** iMAPS PostgreSQL (Rosario). Defines ONE schema contract for the team.
**Authority:** This document plus the forward-update and fresh-install SQL files in `database/sql/` listed below.

---

## 1. Baseline model

All team members started from the **0921 database** (`imaps_db_0921`). Since then the
schema accumulated approved Loop 1–7 bridge changes.

`origin/master` (SHA `926fd8f`) introduced a consolidated
`2026_09_19_000000_create_initial_schema.php` that **deleted 28 incremental migrations**
and does **not** by itself reproduce the canonical schema.

**Therefore two supported paths exist, and they are NOT interchangeable:**

| Environment type | Strategy | SQL to run |
|---|---|---|
| **Existing 0921-based** (has a `migrations` ledger) | Preserve ledger, apply forward updates in order | `2026_09_26_canonical_schema_reconciliation_0921_forward.sql`, then `2026_09_27_add_historical_data_for_0921.sql` |
| **Fresh / new** | Consolidated schema, then later incremental migrations | `create_initial_schema` + incremental + `2026_09_26_fresh_install_canonical_corrections.sql` |

**Never** run the consolidated initial schema against an existing 0921-based database.
**Never** run the fresh-install corrections against a database that already has a ledger.

---

## 2. Execution order

### Existing 0921-based database

```
1. BACK UP the database.
2. psql -v ON_ERROR_STOP=1 -d <your_db> -f database/sql/2026_09_26_canonical_schema_reconciliation_0921_forward.sql
3. psql -v ON_ERROR_STOP=1 -d <your_db> -f database/sql/2026_09_27_add_historical_data_for_0921.sql
4. Run the verification queries in section 8.
```

The scripts are forward-only and idempotent. On an already-compliant database they
make **no structural change**. Preserve the existing migration ledger; do not run
the consolidated migration or manually insert ledger records on the 0921 path.

### Fresh database

```
1. create_initial_schema (origin/master)
2. 2026_09_11_000000_add_rich_result_columns_to_site_inspections_table
3. 2026_09_19_000000_add_assignment_provenance_to_site_inspections_table
4. 2026_09_20_151538_add_assigned_by_columns_to_site_inspections_table
5. Remaining applicable incremental migrations, including
   2026_09_23_145135_create_historical_data_table.php
6. 2026_09_26_fresh_install_canonical_corrections.sql
7. 2026_09_27_000000_add_reviewed_site_inspection_id_to_technical_reviews_table
8. Run the verification queries in section 8.
```

---

## 3. Canonical `site_inspections` contract

23 canonical columns. Derived from `app/Models/SiteInspection.php::$fillable` plus the
Loop 3/4/5/7 closed contracts, cross-checked against `origin/master`.

| Field | Why required | Source writer | Local DB | Fresh schema (pre-correction) | Action |
|---|---|---|---|---|---|
| `id` | PK | Eloquent | ✅ | ✅ | — |
| `zoning_application_id` | owning application | ApplicationController | ✅ | ✅ | — |
| `inspector_id` | assigned Site Inspector | ApplicationController, TechnicalReviewController | ✅ | ✅ | — |
| `status` | lifecycle, default `assigned` | ApplicationController | ✅ | ⚠️ default `Pending` | **default corrected** |
| `scheduled_date` | schedule | ApplicationController | ✅ | ✅ | — |
| `deadline_date` | assignment deadline | ApplicationController, TechnicalReviewController | ✅ | ✅ | — |
| `completed_at` | completion marker | PullCompletedInspections | ✅ | ✅ | — |
| `assigned_notes` | **CANONICAL assignment instructions** | ApplicationController, TechnicalReviewController | ✅ | ✅ | — |
| `assigned_by_imaps_user_id` | assignment provenance | TechnicalReviewController | ✅ | ⚠️ later migration | — |
| `assigned_by_name` | assignment provenance | TechnicalReviewController | ✅ | ⚠️ later migration | — |
| `parcel_id` | GIS target parcel | ApplicationController | ✅ | ⚠️ no FK | **FK added** |
| `findings` | result narrative | PullCompletedInspections | ✅ | ❌ | **added** |
| `is_compliant` | compliance result | PullCompletedInspections | ✅ | ❌ | **added** |
| `submitted_at` | submission timestamp | FieldSync bridge | ✅ | ⚠️ later migration | — |
| `inspection_result` | result summary | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `observations` | field observation | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `discrepancies` | field discrepancy | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `recommendations` | **live** recommendation field | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `inspector_notes` | inspector-authored notes | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `checklist_data` | checklist snapshot | PullCompletedInspections | ✅ | ⚠️ later migration | — |
| `confirmed_latitude` | GPS evidence | FieldSync bridge | ✅ | ⚠️ later migration | — |
| `confirmed_longitude` | GPS evidence | FieldSync bridge | ✅ | ⚠️ later migration | — |
| `gps_accuracy_m` | GPS accuracy | FieldSync bridge | ✅ | ⚠️ later migration | — |
| `gps_confirmed_at` | GPS confirmation time | FieldSync bridge | ✅ | ⚠️ later migration | — |

### Deliberately NOT part of the contract

| Field | Classification | Reason |
|---|---|---|
| `remarks` | **RETIRED** | Team Leader decision: `remarks` is zoning-application context, **not** the Site Inspection instruction field. Local 0921 DB correctly lacks it. The stale merged `$fillable` entry was removed in `d5e2112`. |
| `recommendation` (singular) | **LEGACY — dead** | Stale `$fillable` entry removed in `d5e2112`; no live writer. `recommendations` (plural) is live. Not created. |
| `review_round` | **NOT ON THIS TABLE** | Reinspection round counter lives on `technical_reviews`. |

---

## 4. `remarks` vs assignment instructions — resolved

**Decision (Team Leader):** Planning Officer inspection instructions use the
assignment-instructions field. `remarks` is zoning-application context.

**Audit result — `assigned_notes` is the canonical field.** It is used consistently by:

- `ApplicationController::store()` — `parcels.*.assigned_notes` validation + create
- `TechnicalReviewController` — 6 sites including reinspection-required validation
- `ParcelInspectionScheduler.jsx` — "Assignment Instructions" textarea
- `SiteInspection::$fillable`
- Supabase bridge — forwarded to `field_jobs.assignment_instructions`
- Local 0921 DB — column present

`assignment_instructions` exists only as a **Supabase `field_jobs` column**, not an
iMAPS `site_inspections` column. No rename is required or performed.

`zoning_applications.remarks` is retained — it is correct in that context.

---

## 5. `users` / role contract

| Field | Canonical | Notes |
|---|---|---|
| `role` | ✅ CHECK-constrained | Exactly `Admin`, `Planning Officer`, `Site Inspector` |
| `handshake_key` | ✅ retained | Used by the FieldSync/iMAPS handshake path |
| `supabase_uuid` | ❌ **NOT canonical** | **Zero** readers/writers on this branch AND on `origin/master`. Not created. |
| `is_active`, `last_login` | ✅ retained | Loop 6 rejected-login non-impact contract |

A DB-level CHECK constraint **is** retained — the local 0921 database already enforces
it, and the Loop 6 role matrix depends on exactly these three values.

Local data confirms only canonical values exist: `Admin` 2, `Planning Officer` 2, `Site Inspector` 2.

---

## 6. `technical_reviews`

| Field | Canonical | Notes |
|---|---|---|
| `review_round` | ✅ | Reinspection round counter, default 1 |
| `decision` | ✅ CHECK | `Approved`, `Needs Site Inspection`, `Requires Reinspection`, `Declined` |
| `site_inspection_task_id` | ✅ | The **NEW** inspection round created by this review decision, when applicable. Nullable. |
| `reviewed_site_inspection_id` | ✅ Loop 8, nullable | The **EXISTING** inspection round whose result this review is reviewing. FK → `site_inspections(id)` `ON DELETE SET NULL`, plus a supporting index. |

`Requires Reinspection` is required by the Loop 4 reinspection contract.

### 6.1 Loop 8 — reviewed round vs created round (never synonyms)

- `reviewed_site_inspection_id` answers *"which finished round is being reviewed?"*
- `site_inspection_task_id` answers *"which new round did this decision create?"*

Contract example: completed inspection `36` is reviewed with a `Requires Reinspection`
decision → `reviewed_site_inspection_id = 36` and `site_inspection_task_id = 37`.
Inspection 36 remains `completed`; inspection 37 is the new task.

Rules:

- recorded **prospectively**, before any new round is created;
- `NULL` for an initial `Needs Site Inspection` decision (no reviewed round exists);
- **no historical backfill.** Existing rows stay `NULL` until that round is explicitly
  reviewed again. APP-2026-00026 data was deliberately not modified.
- The reviewed round is resolved from the same application + parcel pair as the
  review row. PostgreSQL forbids subqueries in `CHECK` constraints, so that scope
  rule is enforced in `TechnicalReviewController::resolveReviewedInspectionId()`
  and pinned by `Loop8PlanningReviewContractTest`.
- The Laravel migration is `2026_09_27_000000_add_reviewed_site_inspection_id_to_technical_reviews_table.php`
  (guarded; `down()` is non-destructive and keeps the column).
- The 0921 database path applies `database/sql/2026_09_27_loop8_planning_review_identity.sql`.

---

## 7. `application_sequences` — LEGACY, RETAINED

- **Not dropped. Not deleted.** The table still exists in the local 0921 database.
- The target reference-number strategy is `origin/master`'s approach: derive the next
  number from `zoning_applications` using `lockForUpdate()` **inside** the transaction.
  This removes the runtime dependency on `application_sequences`.
- The runtime dependency was retired during the controlled master merge
  (`71c5e06`); regression coverage in `58fe575` guards the transaction-scoped
  strategy and absence of runtime use of this retained table.
- The table is retained temporarily so no teammate loses sequence history.

---

## 8. Verification queries

Run after applying the SQL package appropriate to the environment:

```sql
-- 1. site_inspections canonical columns
SELECT column_name, data_type, is_nullable
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='site_inspections'
 ORDER BY ordinal_position;

-- 2. remarks / recommendation must be ABSENT (expect 0)
SELECT count(*) FROM information_schema.columns
 WHERE table_name='site_inspections' AND column_name IN ('remarks','recommendation');

-- 3. parcel_id foreign key present (expect >= 1)
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid='public.site_inspections'::regclass AND contype='f';

-- 4. three-role CHECK (expect the 3 values)
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.users'::regclass AND conname='users_role_check';

-- 5. role values (expect only the 3 canonical)
SELECT role, count(*) FROM users GROUP BY role ORDER BY role;

-- 6. four-value decision CHECK
SELECT pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.technical_reviews'::regclass
   AND conname='technical_reviews_decision_check';

-- 7. lifecycle default
SELECT column_default FROM information_schema.columns
 WHERE table_name='site_inspections' AND column_name='status';

-- 8. historical_data exists; exactly 12 migration-defined columns
SELECT to_regclass('public.historical_data');
SELECT column_name, data_type, is_nullable, column_default,
       character_maximum_length, numeric_precision, numeric_scale, datetime_precision
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='historical_data'
 ORDER BY ordinal_position;

-- 9. Only sequence-backed bigint PK / its index; no secondary indexes or FKs
SELECT conname, pg_get_constraintdef(oid)
  FROM pg_constraint WHERE conrelid='public.historical_data'::regclass;
SELECT indexdef FROM pg_indexes
 WHERE schemaname='public' AND tablename='historical_data';

-- 10. Maps historical reader can execute (zero rows is valid)
SELECT id, form_number, name, barangay, zoning_code, lot_area_sqm,
       application_type, purpose, encoding_date
  FROM public.historical_data
 WHERE application_type='Locational Clearance' AND barangay IS NOT NULL
   AND encoding_date BETWEEN DATE '2021-01-01' AND DATE '2026-08-31'
 ORDER BY encoding_date ASC LIMIT 1;
```

---

## 9. Rollback / backup

- **Take a backup before applying anything.**
- The SQL files are additive and idempotent; they contain **no** `DROP TABLE`,
  no destructive column removal, and no data rewrite.
- Every constraint block validates existing rows first and raises an explicit `ABORT`
  rather than silently dropping data if a row would violate the canonical contract.
- Manual rollback of an applied constraint is a `DROP CONSTRAINT` only; no data is lost.
- `migrations` ledger history is **never** edited manually.

---

## 10. Merged-master Maps compatibility — 2026-09-27

- The shared team base remains **0921**. Post-0921 compatibility is delivered as
  forward SQL, not a database rebuild or migration-ledger rewrite.
- Merged master introduced `2026_09_23_145135_create_historical_data_table.php`.
  `MapsController` queries this table unconditionally; its absence caused HTTP 500.
  This is merged-master compatibility, not a Loop 1–7 regression.
- `2026_09_27_add_historical_data_for_0921.sql` mirrors the migration: `id`
  sequence-backed bigint PK; nullable `encoding_date` date; nullable varchar(255)
  `form_number`, `name`, `barangay`, `zoning_code`, `application_type`; nullable
  numeric(12,2) `lot_area_sqm`, `assessment_fee`; nullable `purpose` text; nullable
  timestamp(0) without time zone `created_at`, `updated_at`. No business defaults,
  foreign keys, additional unique constraints, or secondary indexes are declared.
- The SQL creates no environment-specific rows and imports no historical dataset.
  `IF NOT EXISTS` makes repeat application a no-op, not a repair for schema drift;
  always compare the catalog using section 8.
- Local execution: pre-change recovery backup taken; script applied twice to
  `imaps_db_0921`; catalog matched; migration-ledger fingerprint and checked
  business-table row counts unchanged. Authenticated `/maps` returned HTTP 200.
- Python forecasting uses the CSV plus recent `zoning_applications`, not this
  historical table. All required third-party dependencies were already declared;
  the existing venv was synced, with no Python source/manifest change.
- The **final team database snapshot remains deferred until all loops, including
  Loop 8+, are complete**. The local recovery backup is not a final team export.

## 11. Work reassignment contract (Phase 1) - 2026-09-27

Migration: `database/migrations/2026_09_27_010000_add_work_reassignment_contract.php`.
Additive and idempotent. Applied to local `imaps_db_0921` with
`--path=...` only; the repository migration ledger still contains two
unrelated pre-existing pending entries (see section 12).

### 11.1 Current ownership pointer

```sql
zoning_applications.assigned_planning_officer_id  bigint NULL
    -> users(id) ON DELETE SET NULL
    (zoning_applications_assigned_po_foreign)
```

The **CURRENT** responsible Planning Officer. Populated automatically when a new
application is created by an **active** Planning Officer, and recorded as an
explicit **initial assignment**.

Eligibility is a pure predicate,
`WorkAssignmentService::canReceiveInitialOwnership($role, $isActive)`: the
creator must be `role = 'Planning Officer'` **and** `is_active = true`. A
creation by anybody else leaves the column **NULL** and writes no history row —
ownership is never invented.

| Column | Meaning | Changes on handover? |
|---|---|---|
| `encoded_by` | who originally encoded/typed the application up | **No** |
| `assigned_planning_officer_id` | who currently owns the pending Planning Officer work | **Yes** |

At creation the two may hold the same user id and still mean different things.
**`encoded_by` is not redefined**, and nothing in the assignment service writes
it.

**NOT backfilled.** Existing applications are deliberately not given an owner by
copying `encoded_by`: proving who encoded a record is not proving who currently
owns its unfinished work. Pre-existing applications honestly show "Not yet
assigned" until an Administrator assigns one. No historical row was written by
either migration.

This is a **new, separate fact** and must not be confused with:

| Column | Meaning | Reused as ownership? |
|---|---|---|
| `encoded_by` | who typed the application up | **No** |
| `technical_reviews.reviewed_by` | who decided, in that review round | **No** |
| `audit_trail.performed_by` | actor of one application-level event | **No** |
| `site_inspections.assigned_by_imaps_user_id` / `_name` | the **most recent** assigning officer (overwritten on handover) | **No** |

The current inspector pointer is unchanged: `site_inspections.inspector_id`.

### 11.2 `application_po_assignments` - append-only ownership history

| Column | Type | Notes |
|---|---|---|
| `id` | `bigserial` | PK |
| `zoning_application_id` | `bigint` | FK `-> zoning_applications(id) ON DELETE CASCADE` |
| `assignment_type` | `varchar(20)` | `initial` \| `reassignment` |
| `from_planning_officer_id` | `bigint` NULL | FK `-> users(id) ON DELETE SET NULL` |
| `to_planning_officer_id` | `bigint` | FK `-> users(id) ON DELETE RESTRICT` |
| `reason` | `varchar(30)` **NULL** | `Absent` \| `On Leave` \| `Workload Transfer` \| `Unavailable` \| `Other`. **NULL is correct for an `initial` row** — see 11.6 |
| `reason_note` | `text` NULL | required when `reason = 'Other'` |
| `reassigned_by` | `bigint` | FK `-> users(id) ON DELETE RESTRICT` |
| `reassigned_at` | `timestamp` | |

Index: `app_po_assignments_lookup_idx (zoning_application_id, reassigned_at)`.

Checks: `..._type_check`, `..._reason_check`, `..._other_note_check`
(`reason <> 'Other' OR (reason_note IS NOT NULL AND btrim(reason_note) <> '')`),
and `..._from_check` (`initial` requires a NULL previous owner, `reassignment`
requires a non-NULL one).

### 11.3 `site_inspection_assignments` - append-only round ownership history

Identical shape, scoped to **one round**:
`site_inspection_id` FK `-> site_inspections(id) ON DELETE CASCADE`, with
`from_inspector_id` / `to_inspector_id` and the parallel
`site_insp_assignments_*` constraints, indexed on
`(site_inspection_id, reassigned_at)`.

A reinspection is a new round, so Round 1 and Round 2 never share an ownership
story.

### 11.4 Why two tables and not one generic table

A polymorphic `work_assignments(target_type, target_id)` **cannot** carry a
foreign key, so the exact application / exact round could never be guaranteed.
The contract requires the exact target, so each history table has a real FK.

### 11.5 Pointer vs history

The current owner is a mutable pointer on the business row; history is
append-only and never updated. A damaged or deleted history row therefore can
never change who currently owns work.

### 11.6 The reason rule (initial vs reassignment)

The reason vocabulary describes **why somebody is giving work away**. It has no
meaning the first time work is given to somebody, so:

```
initial       ->  reason IS NULL
reassignment  ->  reason IS NOT NULL AND reason IN (the five values)
reason Other  ->  reason_note IS NOT NULL AND btrim(reason_note) <> ''
```

Applied to **both** history tables by
`2026_09_27_020000_allow_initial_assignment_without_a_reason.php`, which also
relaxes `reason` to nullable.

This corrects a real defect. `reason` was originally `NOT NULL` with a
closed-vocabulary CHECK, so a first assignment was **forced to state a reason
that was not true** — and since nothing else was possible, the code had begun
defaulting to "Workload Transfer". Every brand-new application and every
brand-new inspection round was recorded as a workload handover that never
happened.

The constraint is written with explicit `IS NULL` / `IS NOT NULL` guards rather
than relying on `IN` alone. In SQL `NULL IN (...)` evaluates to **NULL, not
false**, and a CHECK constraint **passes** when its expression is null. A rule
written only as `reassignment AND reason IN (...)` would therefore silently
ACCEPT a reassignment with no reason at all. That was a second real defect,
caught by executing the constraint matrix instead of reading the SQL.

Verified behaviour (each case in its own rolled-back transaction):

| Case | Result |
|---|---|
| `initial` + NULL reason | ACCEPTED |
| `reassignment` + valid reason | ACCEPTED |
| `reassignment` + NULL reason | REFUSED |
| `initial` + any reason | REFUSED |
| `Other` with no note | REFUSED |
| `Other` with a whitespace-only note | REFUSED |
| out-of-vocabulary reason | REFUSED |
| `initial` naming a previous owner | REFUSED |
| `reassignment` with no previous owner | REFUSED |

### 11.7 Eligibility is enforced in the application layer, not by these tables

Receivers must be **active** (`users.is_active = true`) with the correct role,
and an inspector must additionally have a non-NULL `handshake_key`. That check
lives in `User::scopeActivePlanningOfficers()` /
`scopeActiveSiteInspectors()` and the matching validation rules, so the picker
and the submit check can never disagree. No column or constraint in this
migration duplicates it.

## 12. Migration ledger note (pre-existing, not introduced here)

`php artisan migrate` cannot be run globally against `imaps_db_0921`: the
repository's consolidated `2026_09_19_000000_create_initial_schema` is still
recorded as **Pending** while the live tables already exist, so a global run
fails with `relation "users" already exists`. This drift predates the
reassignment work and is the same condition already recorded in section 1 and in
the architecture document's audit findings.

The reassignment migration was therefore applied with an explicit `--path`, and
no ledger row was edited by hand. Reconciling the ledger remains a separate
decision.

## 13. Safety record

- No `migrate:fresh`, no `migrate:reset`, no `DROP TABLE` on any real database.
- No production database was queried or modified.
- No historical/business row was updated.
- `application_sequences` was not dropped.
- `site_inspections.remarks` was not added.
- `users.supabase_uuid` was not added.
- Latest master was reconciled in `71c5e06`; this follow-up changes SQL/docs only.
- The reassignment migration added no `DROP TABLE` and wrote no historical row.
  `assigned_planning_officer_id` is NULL for every pre-existing application, and
  both history tables are empty until a handover actually happens.
- No `migrations` ledger row was edited by hand.
- Nothing was pushed.

## 14. Final synthetic / test-data cleanup note - 2026-09-28 (NOT a schema change)

This section records a **data row cleanup only**. The canonical schema contract in
sections 1-13 is **unchanged**. No table definition, column, type, constraint, index,
policy, or default was added, altered, or dropped as a result of this cleanup. No
migration was created or applied. The `migrations` ledger was not edited.

Preserved and still authoritative from earlier sections:

- Section 2 execution order and the 0921 forward-update instructions.
- Section 7 `application_sequences` - **LEGACY, RETAINED** (still not dropped, and
  deliberately **not** repaired or incremented by the cleanup).
- Section 9 rollback / backup guidance.
- Section 11 the Work reassignment contract (Phase 1), including the initial-versus-
  reassignment constraints and the ownership pointer.
- Section 12 the migration-ledger warning and the explicit `--path` requirement.
  `php artisan migrate` still cannot be run globally against `imaps_db_0921`; that
  drift is unchanged and reconciling the ledger remains a separate decision.

**Pre-cleanup recovery backup:** a full `pg_dump` (custom format) of `imaps_db_0921`
was created before any mutation and stored outside the repository as a local recovery
artifact, together with complete pre-delete row exports for every deleted remote row.

**Rows removed** (provenance-proven synthetic/test data only): synthetic applications
`APP-2026-00027` and `APP-2026-00028` and their dependent child rows, 66 proven-E2E
`application_drafts`, 75 orphan Supabase `field_jobs` with 83 `field_job_photos`, 1
Loop 8 `field_job_reviews` validation artifact, and 73 + 73 orphan-only synthetic
application/parcel mirrors.

**Rows deliberately retained:** applications `APP-2026-00025` and `APP-2026-00026`;
`site_inspections` 36 (`completed`) and 37 (`assigned`); `technical_reviews` 75 and 76;
all 44 legacy `DP-` / `LC-` / `ZA-` / `ZC-` applications; 9 unresolved drafts; both
Supabase profiles; and all 107 Storage objects.

**Reference numbers:** `APP-2026-00027` / `APP-2026-00028` are absent and the retained
APP maximum is now `APP-2026-00026`. Reuse of `APP-2026-00027` by a future genuine
application was explicitly accepted; no retained application was renumbered and the
generator was not modified.

**Final database snapshot / export package remains DEFERRED** until the remaining
numbered loops and final acceptance are complete. A local recovery backup is not a
final team export.

## 15. Loop 9A inspection delivery monitoring schema - 2026-09-28 (ADDITIVE)

This section records an **additive schema change**. Sections 1-14 remain
authoritative and unchanged, including the 0921 forward-update instructions, the
`application_sequences` legacy/retained decision, the migration-ledger warning,
and the explicit `--path` requirement.

**The delivery contract is a new business fact and is separate from the FieldSync
task lifecycle.** `field_jobs.status` / `site_inspections.status` remain
`assigned` -> `in_progress` -> `completed` and are not modified.

### 15.1 `site_inspections` current delivery summary (all nullable)

```sql
delivery_status                  character varying(32) NULL
last_delivery_attempt_at         timestamp NULL
delivered_at                     timestamp NULL
last_delivery_failure_category   character varying(48) NULL
```

`delivery_status` is `pending_delivery` | `delivered` | `delivery_failed`, or
NULL. NULL means the delivery state was never established.

Checks: `delivery_status` in vocabulary or NULL; `last_delivery_failure_category`
in vocabulary or NULL; `delivery_status = 'delivered'` implies `delivered_at IS
NOT NULL`. The reverse implication is **deliberately not** constrained, so a
retry never has to erase a historical `delivered_at`.

### 15.2 `inspection_delivery_attempts` (append-only)

`id`, `site_inspection_id`, `attempt_number`, `source`, `outcome`,
`failure_category`, `safe_message`, `attempted_at`, `completed_at`, `created_at`

- FK `site_inspection_id -> site_inspections(id) ON DELETE CASCADE` — matching the
  existing operational-history contract (`site_inspection_assignments`), and
  deliberately different from business decision records
  (`technical_reviews.reviewed_site_inspection_id` = SET NULL).
- `UNIQUE (site_inspection_id, attempt_number)` — per-round attempt numbering.
- `source`: `initial_dispatch` | `automatic_retry` | `planning_officer_retry` | `legacy_reconciliation`
- `outcome`: `pending` | `delivered` | `failed`
- `failure_category`: `inspector_mapping_unresolved` | `supabase_unreachable` |
  `authentication_failure` | `remote_constraint_failure` |
  `remote_validation_failure` | `configuration_failure` | `unknown`
- NULL rules both directions: `failed` requires a category; `pending`/`delivered`
  require it to be NULL, written with explicit `IS NULL` / `IS NOT NULL`.

### 15.3 No backfill, and the preserved exclusions

No existing row received a delivery value. Inspections 3–21 and 24 remain NULL
permanently (pre-bridge historical records). Inspections 25–30 — the 6 proven
post-bridge delivery failures — also remain NULL; their reconciliation is a
separately authorized execution step, not schema creation. No speculative
backfill, and `failed_jobs` is never treated as business delivery state.

### 15.4 Deployment paths

Existing 0921: `database/sql/2026_09_28_add_inspection_delivery_monitoring.sql`,
additive and idempotent, applied through the explicit reviewed path. **Global
`php artisan migrate` must still not be run** (section 12) and the ledger was not
edited. Fresh database: `2026_09_28_030000_add_inspection_delivery_monitoring.php`
reproduces the identical contract.

The final database snapshot / export package remains **DEFERRED**.

## 16. Loop 9A-R legacy delivery failure reconciliation - 2026-09-28 (DATA ONLY)

**This is not a schema change.** Sections 1-15 remain authoritative and
unchanged, including the 0921 forward-update instructions, the
`application_sequences` legacy/retained decision, the migration-ledger warning,
and the explicit `--path` requirement.

Artifact: `database/sql/2026_09_28_reconcile_legacy_delivery_failures_25_30.sql`
— **existing-0921 data patch only.** It is deliberately NOT a migration and
must never be applied to a fresh database, which has no historical inspections
25-30.

### 16.1 Live reconciliation state (as of 2026-09-28)

`site_inspections` = 35 rows:
- `delivery_status = 'delivery_failed'`: **6** (inspections 25, 26, 27, 28, 29, 30)
- `delivery_status = 'pending_delivery'`: 0
- `delivery_status = 'delivered'`: 0
- `delivery_status IS NULL`: **29**

`inspection_delivery_attempts` = **6** rows, each `attempt_number = 1`,
`source = 'legacy_reconciliation'`, `outcome = 'failed'`,
`failure_category = 'inspector_mapping_unresolved'`, with `attempted_at` and
`completed_at` set to the exact historical `failed_jobs.failed_at` of the
matching failure. `created_at` is the real insertion time and is not backdated.

### 16.2 What is deliberately still NULL

- Inspections **3-21 and 24** (pre-bridge historical records) remain NULL
  permanently and are excluded from delivery monitoring.
- Inspections **22, 23, 31, 32, 33, 34, 35, 36, 37** already have remote tasks
  but remain NULL. Fabricating a `delivered` history for them would be
  invention; the future writer contract (Loop 9B) establishes delivery state
  prospectively.

### 16.3 Integrity notes

- `failed_jobs` (12 rows) is retained unchanged. It is generic queue
  infrastructure and the original technical evidence; `inspection_delivery_attempts`
  is the canonical **business** delivery history.
- No Planning Officer ownership was assigned or inferred. All six applications
  keep `assigned_planning_officer_id = NULL`; `encoded_by` is not ownership.
- No remote task exists for these six rounds and none was created.
- `application_status_tracks` for the affected applications was not modified; the
  delivery state is an inspection-round fact, not an application lifecycle fact.

The final database snapshot / export package remains **DEFERRED**.

## 17. Loop 9B delivery writer runtime behaviour - 2026-09-28 (NO SCHEMA CHANGE)

**9B changed no schema.** Sections 1-16 remain authoritative and unchanged,
including the 0921 forward-update instructions, the `application_sequences`
legacy/retained decision, the migration-ledger warning, the explicit `--path`
requirement, and the 9A-R reconciliation state.

- **Schema change:** NO
- **Forward SQL:** NONE
- **Fresh migration:** NONE
- **Supabase schema:** UNCHANGED
- **FieldSync DB:** UNCHANGED
- **Migration ledger:** UNCHANGED
- **Writer instrumentation:** IMPLEMENTED
- **Historical rows:** untouched (25-30 remain the reconciled failures; 3-21/24
  and 22, 23, 31-37 remain NULL)

### 17.1 Runtime meaning added to the existing schema

From 9B onward, every prospective execution of the bridge writer produces local
rows in the tables 9A already created:

1. a `pending` row in `inspection_delivery_attempts` and
   `delivery_status = 'pending_delivery'` on the round, before any network call;
2. on full remote success, `outcome = 'delivered'` and `delivery_status = 'delivered'`;
3. on a bridge failure, `outcome = 'failed'` with a normalized `failure_category`;
4. on terminal queue failure, `delivery_status = 'delivery_failed'`.

`delivered_at` records the first successful delivery only and is never cleared.

These are **new prospective facts only**. The 9A-R reconstruction and every
NULL row described in section 16 are unchanged by 9B.

The final database snapshot / export package remains **DEFERRED**.

## 18. Loop 9B safety revision: queue-dispatch correlation - 2026-09-28 (ADDITIVE)

**One nullable column was added. No business row was changed.** Sections 1-17
remain authoritative, including the 0921 forward-update instructions, the
migration-ledger warning, the explicit `--path` requirement, the 9A schema, and
the 9A-R reconciliation state.

### 18.1 New column

```sql
inspection_delivery_attempts.queue_job_uuid  uuid NULL
```

The stable Laravel queue payload UUID of the queued `PushInspectionToSupabase`
dispatch that produced the attempt.

- one separately dispatched job → one uuid
- automatic retries of that job → the **same** uuid, new `attempt_number`
- separately dispatched jobs → different uuids
- **not unique** — the retries of one dispatch legitimately share it
- no default

Native `uuid` type is used rather than a length-guessed `varchar`, because
Laravel generates the value with `Str::uuid()` and every observed value is a
canonical UUID.

### 18.2 New index

```sql
CREATE INDEX inspection_delivery_attempts_queue_correlation_index
    ON inspection_delivery_attempts (site_inspection_id, queue_job_uuid, attempt_number DESC)
    WHERE queue_job_uuid IS NOT NULL;
```

Serves the terminal-correlation lookup ("latest attempt for this round AND this
dispatch"). Partial, so it stays small while every historical row is NULL.

### 18.3 Historical rows

The six `legacy_reconciliation` attempts keep `queue_job_uuid = NULL`. No value
was backfilled from `failed_jobs`: those rows reconstruct pre-instrumentation
failures, and deriving a queue linkage now would invent business history.

### 18.4 Why no CHECK

A NULL can only come from legacy reconciliation or from a synchronous execution
that has no queue job. A synchronous execution can never invoke `failed()`,
because that hook is only called by the queue handler, so an uncorrelated
prospective row can never terminalize a summary. A `NOT NULL` constraint would
add fragility without adding safety.

### 18.5 Deployment paths

Existing 0921: `database/sql/2026_09_28_add_delivery_attempt_queue_correlation.sql`,
additive and idempotent, applied through the explicit reviewed path. Global
`php artisan migrate` was **not** run and the ledger was not edited. Fresh
database: `2026_09_28_040000_add_delivery_attempt_queue_correlation.php` reproduces
the identical column, type, nullability and index.

The final database snapshot / export package remains **DEFERRED**.

## 19. Loop 9B writer correlation correction - 2026-09-28 (NO SCHEMA CHANGE)

**Nothing was added, altered or dropped in this correction.** Section 18 is the
schema of record; this section records the runtime contract that now *consumes*
`queue_job_uuid`. `database/sql/` and `database/migrations/` were not touched, and
the 0921 forward path and the fresh-install migration remain byte-identical to
Section 18.5.

### 19.1 What the column now holds

`queue_job_uuid` is written **prospectively** by
`InspectionDeliveryRecorder::beginAttempt()` for every real queue execution. The
value is `$this->job?->uuid()` — the actual Laravel 12.58.0 queue payload uuid of
the dispatch executing right now, from the concrete
`Illuminate\Queue\Jobs\Job::uuid()` accessor inherited by `DatabaseJob`. No uuid
is ever generated by the writer, and no surrogate (inspection id, attempt id) is
used as correlation.

| Execution | `queue_job_uuid` | `attempt_number` | `source` |
| --- | --- | --- | --- |
| First dispatch | new uuid | 1 | `initial_dispatch` |
| Automatic retry, same dispatch | **same uuid** | new | `automatic_retry` |
| Separately dispatched job (incl. a future 9C PO retry) | **new uuid** | 1 | `initial_dispatch` / `planning_officer_retry` |
| Synchronous / direct invocation | `NULL` | 1 | `initial_dispatch` |

The column is written explicitly with `forceFill()` and is deliberately **not** in
the model's `$fillable`, so it can never be mass-assigned from a request. A
non-canonical value is treated as *no correlation* rather than coerced into the
native `uuid` column.

The six `legacy_reconciliation` rows stay `NULL` permanently, and 0 rows are
non-NULL at the time of this correction.

### 19.2 Terminal rule

`reconcileTerminalFailure()` now requires **two independent** conditions before
writing `delivery_status = delivery_failed`:

1. **Correlation** — the callback's own dispatch uuid must match a real attempt
   for that inspection, and that attempt's `outcome` must be `failed`.
2. **Ownership of current state** — that correlated attempt must also be the
   **globally latest** attempt for the inspection.

Correlation alone is explicitly **not** sufficient. A terminal callback whose
uuid is NULL is **refused before any lookup**, a safe server-side warning is
logged, and the summary is left unchanged. There is deliberately **no**
globally-latest fallback for a queued terminal callback, because that fallback is
the exact race this column exists to prevent. NULL-correlated legacy rows can
therefore never be picked up by future queue processing — they are already
terminal historical facts.

An older terminal callback cannot overwrite a newer delivery execution,
whether that newer execution is `pending`, `delivered`, or a newer separate
dispatch whose failure is still retryable. The write is idempotent: it recomputes
from durable facts and performs no increment, create or delete.

On the terminal write, `last_delivery_attempt_at` and
`last_delivery_failure_category` are taken from the **correlated attempt row**,
and `delivered_at` is never touched.

### 19.3 Behavioural verification

The corrected algorithm was executed against real PostgreSQL as rollback-only
probes, covering: single terminal failure, newer independent pending, newer
independent delivered, the newer-retryable-failed race, the globally-latest
terminal case, same-dispatch successive failures, same-dispatch retry success,
and idempotency. All probes passed and all were rolled back; the live baseline
after the probes is unchanged (35 inspections, 6 `delivery_failed`, 29 NULL, 6
attempts all with `queue_job_uuid` NULL, 12 `failed_jobs`).

### 19.4 Scope of this correction

No Controller, route, frontend, Supabase or FieldSync change. No Controller
approval was needed because no Controller was touched. The failure
normalization vocabulary (7 categories), the 3 outcomes, the 4 sources and the
safe messages are unchanged. `failed_jobs` remains unused as business delivery
state.

### 19.5 Degraded observability when local recording fails (locked contract)

**`MONITORING FAILURE MUST NOT SILENTLY REDEFINE THE BUSINESS ASSIGNMENT.`**

If `InspectionDeliveryRecorder::beginAttempt()` fails before an attempt row
exists, the outcome is classified as **`DEGRADED OBSERVABILITY`** — **not**
`DELIVERY FAILURE`, and **not** `FULLY MONITORED SUCCESS`.

This is a **local recording** outcome only. It is not a new
`inspection_delivery_attempts` row, and it is not a new `delivery_status` value,
so it adds **no** column, value or CHECK here. In practice the local footprint is
a single `Log::warning` line carrying only a closed literal and the integer
`site_inspection_id`; the stored `safe_message` vocabulary is unchanged and can
never carry a response body, URL, key or header.

The established remote bridge delivery continues, because Loop 9 monitoring is
additive and must not break the previously working Loops 1–8 assignment path. A
successful remote delivery whose local recording failed may therefore remain
**locally untracked** until a later idempotent delivery execution converges it —
and it must never be described as a clean monitored success.
