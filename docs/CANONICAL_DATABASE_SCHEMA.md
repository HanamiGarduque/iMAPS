# Canonical Database Schema â€” iMAPS â†” FieldSync Bridge

**Status:** CANONICAL â€” reconciled 2026-09-26; Maps compatibility added 2026-09-27
**Scope:** iMAPS PostgreSQL (Rosario). Defines ONE schema contract for the team.
**Authority:** This document plus the forward-update and fresh-install SQL files in `database/sql/` listed below.

---

## 1. Baseline model

All team members started from the **0921 database** (`imaps_db_0921`). Since then the
schema accumulated approved Loop 1â€“7 bridge changes.

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
| `id` | PK | Eloquent | âœ… | âœ… | â€” |
| `zoning_application_id` | owning application | ApplicationController | âœ… | âœ… | â€” |
| `inspector_id` | assigned Site Inspector | ApplicationController, TechnicalReviewController | âœ… | âœ… | â€” |
| `status` | lifecycle, default `assigned` | ApplicationController | âœ… | âš ï¸ default `Pending` | **default corrected** |
| `scheduled_date` | schedule | ApplicationController | âœ… | âœ… | â€” |
| `deadline_date` | assignment deadline | ApplicationController, TechnicalReviewController | âœ… | âœ… | â€” |
| `completed_at` | completion marker | PullCompletedInspections | âœ… | âœ… | â€” |
| `assigned_notes` | **CANONICAL assignment instructions** | ApplicationController, TechnicalReviewController | âœ… | âœ… | â€” |
| `assigned_by_imaps_user_id` | assignment provenance | TechnicalReviewController | âœ… | âš ï¸ later migration | â€” |
| `assigned_by_name` | assignment provenance | TechnicalReviewController | âœ… | âš ï¸ later migration | â€” |
| `parcel_id` | GIS target parcel | ApplicationController | âœ… | âš ï¸ no FK | **FK added** |
| `findings` | result narrative | PullCompletedInspections | âœ… | âŒ | **added** |
| `is_compliant` | compliance result | PullCompletedInspections | âœ… | âŒ | **added** |
| `submitted_at` | submission timestamp | FieldSync bridge | âœ… | âš ï¸ later migration | â€” |
| `inspection_result` | result summary | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `observations` | field observation | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `discrepancies` | field discrepancy | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `recommendations` | **live** recommendation field | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `inspector_notes` | inspector-authored notes | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `checklist_data` | checklist snapshot | PullCompletedInspections | âœ… | âš ï¸ later migration | â€” |
| `confirmed_latitude` | GPS evidence | FieldSync bridge | âœ… | âš ï¸ later migration | â€” |
| `confirmed_longitude` | GPS evidence | FieldSync bridge | âœ… | âš ï¸ later migration | â€” |
| `gps_accuracy_m` | GPS accuracy | FieldSync bridge | âœ… | âš ï¸ later migration | â€” |
| `gps_confirmed_at` | GPS confirmation time | FieldSync bridge | âœ… | âš ï¸ later migration | â€” |

### Deliberately NOT part of the contract

| Field | Classification | Reason |
|---|---|---|
| `remarks` | **RETIRED** | Team Leader decision: `remarks` is zoning-application context, **not** the Site Inspection instruction field. Local 0921 DB correctly lacks it. The stale merged `$fillable` entry was removed in `d5e2112`. |
| `recommendation` (singular) | **LEGACY â€” dead** | Stale `$fillable` entry removed in `d5e2112`; no live writer. `recommendations` (plural) is live. Not created. |
| `review_round` | **NOT ON THIS TABLE** | Reinspection round counter lives on `technical_reviews`. |

---

## 4. `remarks` vs assignment instructions â€” resolved

**Decision (Team Leader):** Planning Officer inspection instructions use the
assignment-instructions field. `remarks` is zoning-application context.

**Audit result â€” `assigned_notes` is the canonical field.** It is used consistently by:

- `ApplicationController::store()` â€” `parcels.*.assigned_notes` validation + create
- `TechnicalReviewController` â€” 6 sites including reinspection-required validation
- `ParcelInspectionScheduler.jsx` â€” "Assignment Instructions" textarea
- `SiteInspection::$fillable`
- Supabase bridge â€” forwarded to `field_jobs.assignment_instructions`
- Local 0921 DB â€” column present

`assignment_instructions` exists only as a **Supabase `field_jobs` column**, not an
iMAPS `site_inspections` column. No rename is required or performed.

`zoning_applications.remarks` is retained â€” it is correct in that context.

---

## 5. `users` / role contract

| Field | Canonical | Notes |
|---|---|---|
| `role` | âœ… CHECK-constrained | Exactly `Admin`, `Planning Officer`, `Site Inspector` |
| `handshake_key` | âœ… retained | Used by the FieldSync/iMAPS handshake path |
| `supabase_uuid` | âŒ **NOT canonical** | **Zero** readers/writers on this branch AND on `origin/master`. Not created. |
| `is_active`, `last_login` | âœ… retained | Loop 6 rejected-login non-impact contract |

A DB-level CHECK constraint **is** retained â€” the local 0921 database already enforces
it, and the Loop 6 role matrix depends on exactly these three values.

Local data confirms only canonical values exist: `Admin` 2, `Planning Officer` 2, `Site Inspector` 2.

---

## 6. `technical_reviews`

| Field | Canonical | Notes |
|---|---|---|
| `review_round` | âœ… | Reinspection round counter, default 1 |
| `decision` | âœ… CHECK | `Approved`, `Needs Site Inspection`, `Requires Reinspection`, `Declined` |
| `site_inspection_task_id` | âœ… | The **NEW** inspection round created by this review decision, when applicable. Nullable. |
| `reviewed_site_inspection_id` | âœ… Loop 8, nullable | The **EXISTING** inspection round whose result this review is reviewing. FK â†’ `site_inspections(id)` `ON DELETE SET NULL`, plus a supporting index. |

`Requires Reinspection` is required by the Loop 4 reinspection contract.

### 6.1 Loop 8 â€” reviewed round vs created round (never synonyms)

- `reviewed_site_inspection_id` answers *"which finished round is being reviewed?"*
- `site_inspection_task_id` answers *"which new round did this decision create?"*

Contract example: completed inspection `36` is reviewed with a `Requires Reinspection`
decision â†’ `reviewed_site_inspection_id = 36` and `site_inspection_task_id = 37`.
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

## 7. `application_sequences` â€” LEGACY, RETAINED

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

## 10. Merged-master Maps compatibility â€” 2026-09-27

- The shared team base remains **0921**. Post-0921 compatibility is delivered as
  forward SQL, not a database rebuild or migration-ledger rewrite.
- Merged master introduced `2026_09_23_145135_create_historical_data_table.php`.
  `MapsController` queries this table unconditionally; its absence caused HTTP 500.
  This is merged-master compatibility, not a Loop 1â€“7 regression.
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
creation by anybody else leaves the column **NULL** and writes no history row â€”
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
| `reason` | `varchar(30)` **NULL** | `Absent` \| `On Leave` \| `Workload Transfer` \| `Unavailable` \| `Other`. **NULL is correct for an `initial` row** â€” see 11.6 |
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
that was not true** â€” and since nothing else was possible, the code had begun
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

- FK `site_inspection_id -> site_inspections(id) ON DELETE CASCADE` â€” matching the
  existing operational-history contract (`site_inspection_assignments`), and
  deliberately different from business decision records
  (`technical_reviews.reviewed_site_inspection_id` = SET NULL).
- `UNIQUE (site_inspection_id, attempt_number)` â€” per-round attempt numbering.
- `source`: `initial_dispatch` | `automatic_retry` | `planning_officer_retry` | `legacy_reconciliation`
- `outcome`: `pending` | `delivered` | `failed`
- `failure_category`: `inspector_mapping_unresolved` | `supabase_unreachable` |
  `authentication_failure` | `remote_constraint_failure` |
  `remote_validation_failure` | `configuration_failure` | `unknown`
- NULL rules both directions: `failed` requires a category; `pending`/`delivered`
  require it to be NULL, written with explicit `IS NULL` / `IS NOT NULL`.

### 15.3 No backfill, and the preserved exclusions

No existing row received a delivery value. Inspections 3â€“21 and 24 remain NULL
permanently (pre-bridge historical records). Inspections 25â€“30 â€” the 6 proven
post-bridge delivery failures â€” also remain NULL; their reconciliation is a
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
â€” **existing-0921 data patch only.** It is deliberately NOT a migration and
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

- one separately dispatched job â†’ one uuid
- automatic retries of that job â†’ the **same** uuid, new `attempt_number`
- separately dispatched jobs â†’ different uuids
- **not unique** â€” the retries of one dispatch legitimately share it
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
value is `$this->job?->uuid()` â€” the actual Laravel 12.58.0 queue payload uuid of
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

1. **Correlation** â€” the callback's own dispatch uuid must match a real attempt
   for that inspection, and that attempt's `outcome` must be `failed`.
2. **Ownership of current state** â€” that correlated attempt must also be the
   **globally latest** attempt for the inspection.

Correlation alone is explicitly **not** sufficient. A terminal callback whose
uuid is NULL is **refused before any lookup**, a safe server-side warning is
logged, and the summary is left unchanged. There is deliberately **no**
globally-latest fallback for a queued terminal callback, because that fallback is
the exact race this column exists to prevent. NULL-correlated legacy rows can
therefore never be picked up by future queue processing â€” they are already
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
exists, the outcome is classified as **`DEGRADED OBSERVABILITY`** â€” **not**
`DELIVERY FAILURE`, and **not** `FULLY MONITORED SUCCESS`.

This is a **local recording** outcome only. It is not a new
`inspection_delivery_attempts` row, and it is not a new `delivery_status` value,
so it adds **no** column, value or CHECK here. In practice the local footprint is
a single `Log::warning` line carrying only a closed literal and the integer
`site_inspection_id`; the stored `safe_message` vocabulary is unchanged and can
never carry a response body, URL, key or header.

The established remote bridge delivery continues, because Loop 9 monitoring is
additive and must not break the previously working Loops 1â€“8 assignment path. A
successful remote delivery whose local recording failed may therefore remain
**locally untracked** until a later idempotent delivery execution converges it â€”
and it must never be described as a clean monitored success.

## 20. Loop 9C-1 delivery status reader contract - 2026-09-29 (NO SCHEMA CHANGE)

**Team Leader approved** Loop 9C using the audited narrow scope. 9C-1 delivers the
**server-side READ contract only**.

**No column, table, index, CHECK, value or migration was added.** This section
documents which *existing* 9A/9B columns the reader reads and the exact
presentation contract applied to them. Sections 1-19 remain authoritative,
including the 9A schema, the 9A-R reconciliation state, the `queue_job_uuid`
revision, and the migration-ledger warning.

**9C is NOT complete. Retry is NOT implemented. No UI exists yet.**

### 20.1 Columns read (all pre-existing, all 9A)

| Column | Used for |
| --- | --- |
| `site_inspections.delivery_status` | the delivery state; `NULL` = no canonical record |
| `site_inspections.last_delivery_attempt_at` | `last_attempt_at` |
| `site_inspections.delivered_at` | `delivered_at` |
| `site_inspections.last_delivery_failure_category` | safe failure category + prose |
| `zoning_applications.assigned_planning_officer_id` | `can_retry` authority only |
| `COUNT(inspection_delivery_attempts)` via `withCount` | `attempt_count` only |

### 20.2 Presentation contract

| Stored `delivery_status` | API state | Label |
| --- | --- | --- |
| `pending_delivery` | `pending_delivery` | Pending Delivery |
| `delivered` | `delivered` | Delivered to FieldSync |
| `delivery_failed` | `delivery_failed` | Delivery Failed |
| `NULL` | `no_delivery_record` (**not a DB value**) | No Delivery Record |

An unrecognized stored value degrades to `no_delivery_record` rather than being
guessed. `no_delivery_record` states only the **absence of a record**; it is
never rendered as pending, waiting, missing, or failed, because the NULL
population includes both pre-bridge rounds and genuinely **delivered** FieldSync
jobs that intentionally carry no fabricated local history.

`assigned` / `in_progress` / `completed` remain FieldSync task lifecycle values
and are never used as a delivery label.

### 20.3 Not exposed by 9C-1

`inspection_delivery_attempts.queue_job_uuid`, `attempt_number`, `safe_message`,
`source`, `failed_jobs`, and any inspector-owned or evidence column. Only an
aggregate `attempt_count` is returned. Full operational history is 9D Admin
monitoring.

### 20.4 Runtime writes

**None.** 9C-1 performs no `INSERT`, `UPDATE`, `DELETE` or DDL. No `audit_trail`
row, no delivery attempt, no summary change, no assignment change, and no job
dispatch. The 9B writer and `InspectionDeliveryRecorder` are untouched.

### 20.4a Retry eligibility contract (corrected naming)

`delivery.can_retry` is the **authoritative per-round** decision: it is true only
when the viewer is a Planning Officer whose local user id equals a non-NULL
`assigned_planning_officer_id`, **and** that round is a recorded `delivery_failed`.

The **application-level** field is `retry_actor_authorized`. It answers only the
role-and-ownership gate and is **not** an action flag. It originally shipped as
`is_retry_available`, which an HTTP runtime probe proved misleading: an
application owned by the viewer whose rounds all had no delivery record returned
`is_retry_available = true` while `delivery.can_retry = false`. A UI reading the
old name would have offered a control with nothing behind it. `c52ad8d` was
**not** amended; the rename is a separate bounded commit.

`retry_actor_unavailable_reason` is an application-level **actor** reason only.
Round-level explanations are deliberately not mixed in; a round explains itself
through its own `state`, `label` and `message`.

### 20.5 Inspector response

`inspection.inspector` is an explicit `{id, name}` literal, never a raw `User`
model dump. No email, role, `is_active`, `handshake_key`, Supabase profile
correlation, or session/account metadata is emitted.

### 20.6 Verification

`Loop9c1DeliveryStatusContractTest` 36 / 297, `Loop9c1DeliveryStatusReaderTest`
11 / 35, full Unit suite 427 / 2314.

**DB-backed PHPUnit Feature tests did NOT execute**: `phpunit.xml` pins
`DB_CONNECTION=sqlite` while this PHP build has no `pdo_sqlite`, so they are
**not** reported as passing. The required runtime evidence was obtained by
exercising the **real route, middleware, controller, query and response shaping**
against live PostgreSQL inside an always-rolled-back transaction, with
`phpunit.xml` unmodified (PHPUnit `<env>` carries no `force`, so a shell override
wins). 8 runtime probes PASS: Admin 200, Planning Officer 200, Site Inspector
403, Guest 302, both NULL populations byte-identical, real row 25 correct and
unmutated, assigned-PO `can_retry` true / other-PO and Admin false, and both
rounds of a two-round application returned in id order. **2 queries per
request**, no N+1. Plus 16 rollback-only SQL probes, all PASS.

Live baseline unchanged: 35 inspections, 6 `delivery_failed`, 29 NULL, 6
attempts, 0 correlated, 12 `failed_jobs`, 0 `application_po_assignments`, 0
applications with a recorded owner, 0 fabricated `delivered_at`, 0 probe rows.

### 20.6 Scope

No Supabase change. No FieldSync change. No existing business Controller edit.
`Applications/Show.jsx` untouched. The 9C-1 route sits in a base region untouched
by `origin/master`, and a three-way `merge-tree` dry run confirms
`routes/web.php` still auto-merges cleanly. Nothing was merged.

**Next: 9C-2 â€” Planning Officer delivery status UI.** Not started.

## 21. Loop 9C-2 delivery status UI - 2026-09-29 (UI / READ-ONLY, NO SCHEMA CHANGE)

**No column, table, index, CHECK, value, forward SQL or migration was added,
altered or dropped.** Section 20 remains authoritative for the 9C-1 reader
contract, and Sections 1-19 remain authoritative throughout.

**9C-2 is a UI / read-only change. It is not a database change.**

### 21.1 Database impact

| Item | Result |
| --- | --- |
| Schema change | NONE |
| Forward SQL | NONE - no artifact created, because there is no change to record |
| Migration | NONE |
| Existing 0921 mutation | NONE |
| Supabase DB | NONE |
| FieldSync DB | NONE |
| Migration ledger | UNCHANGED |
| Runtime DB write | NONE - no `INSERT`/`UPDATE`/`DELETE`/DDL, no `audit_trail` row |
| Controller / route / service / model / job | NONE |

Browser verification was entirely read-only. The live baseline was re-read
afterwards and is identical: 35 inspections, 6 `delivery_failed`, 29 NULL, 6
attempts, 0 correlated, 12 `failed_jobs`, 0 fabricated `delivered_at`, 152
`audit_trail` rows.

### 21.2 What the UI reads

Only the pre-existing 9A columns, through the 9C-1 reader, and only these fields:
`delivery_status` (as the server's `state` / `label` / `message`), the two
delivery timestamps, an aggregate `attempt_count`, and the server-mapped
`failure_message`. `failure_category`, `queue_job_uuid`, `attempt_number`,
`safe_message` and `failed_jobs` are never rendered.

### 21.3 Presentation contract

| Delivery state | Label |
| --- | --- |
| `no_delivery_record` | No Delivery Record |
| `pending_delivery` | Pending Delivery |
| `delivered` | Delivered to FieldSync |
| `delivery_failed` | Delivery Failed |

`Inspection Round N` is **presentation chronology only**; `inspection_id` is the
stable persisted identity. The database has no round column, and no
`round_kind` is sent or derived.

### 21.4 Verification status, stated honestly

Delivery Failed, No Delivery Record, and multi-round rendering are
**BROWSER VERIFIED** in a real signed-in session. `pending_delivery` and
`delivered` are **0** in the live baseline, so they are **CONTRACT + BUILD
VERIFIED ONLY** - no protected row was mutated and no attempt fabricated to
manufacture them.

**Next: 9C-3 - Planning Officer Technical Retry Service + POST Action.** Not
started. 9C is NOT complete.

---

## 22. `notifications` table - 2026-10-01 (APPLIED)

Forward SQL: `database/sql/2026_10_01_create_notifications_table_for_0921_forward.sql`

**STATUS: APPLIED to `imaps_db_0921` on 2026-10-01 with explicit user approval.**
`psql -v ON_ERROR_STOP=1 -f ...` exited 0. Ledger untouched at 16 rows. All
business row counts and fingerprints verified unchanged. See
`FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md` for the applied entry.

The plan as originally written is preserved in 22.14 so the record is not
rewritten.

### 22.1 Why

`App\Models\AppNotification` declares `protected $table = 'notifications'`.
That table does **not** exist in the canonical 0921 database, so the model and
its whole read surface raise:

```
SQLSTATE[42P01]: Undefined table: 7
ERROR:  relation "notifications" does not exist
```

This is a **pre-existing master-side schema inconsistency**, not something the
post-Loop 9 diagnostics work introduced. It is recorded here because the
"Admin -> Notify Planning Officers" diagnostic action is blocked on it, and
because six already-shipped production features are already broken by it.

The repository migration `2026_09_27_000000_create_notifications_table.php` is
present but was never applied to canonical (section 22.6).

### 22.2 Table contract

Identical to the shipped migration. Reproduced rather than "improved", so the
live table and the repository migration cannot diverge.

| Column | Type | Null | Default | Notes |
| --- | --- | --- | --- | --- |
| `id` | `bigserial` | NO | sequence | PRIMARY KEY |
| `user_id` | `bigint` | YES | none | FK -> `users(id)` `ON DELETE CASCADE` |
| `title` | `varchar(255)` | NO | none | |
| `message` | `text` | NO | none | |
| `type` | `varchar(255)` | NO | `'system_alert'` | no CHECK - see 22.4 |
| `action_url` | `varchar(255)` | YES | none | relative in-app path only |
| `is_read` | `boolean` | NO | `false` | |
| `read_at` | `timestamp(0)` | YES | none | set on first mark-read |
| `created_at` | `timestamp(0)` | YES | none | see 22.5 |
| `updated_at` | `timestamp(0)` | YES | none | see 22.5 |

`user_id` is **nullable by design**: `AppNotification::notifyAll()` writes a
broadcast row with `user_id = NULL`, and `scopeForUser()` deliberately matches
`user_id = ? OR user_id IS NULL`. The FK must permit NULL.

### 22.3 Constraints and indexes

| Object | Definition | Reason |
| --- | --- | --- |
| `notifications_pkey` | `PRIMARY KEY (id)` | from `$table->id()` |
| `notifications_user_id_foreign` | `FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE` | `->constrained('users')->onDelete('cascade')` |
| `notifications_user_id_is_read_index` | `(user_id, is_read)` | the migration's index; serves the unread badge and the per-user list |
| `notifications_broadcast_index` | `(user_id) WHERE user_id IS NULL` | the composite cannot serve the broadcast branch, because NULLs are not indexed by it |
| `notifications_created_at_index` | `(created_at DESC)` | matches the actual `orderByDesc('created_at')` read order |

**Checks/enums: NONE, deliberately.** The migration's own comment lists types as
`e.g.`, not as an exhaustive set, and `notifyUser()` accepts any string. A CHECK
or enum would reject legitimate new types and would diverge from the shipped
migration.

### 22.4 No CHECK on `type`

Recorded explicitly because it looks like an omission. Adding an enum here would
break `AppNotification::notifyUser(..., 'any_string', ...)` and would make the
live table disagree with the repository migration.

### 22.5 `created_at` / `updated_at` behaviour

Laravel's `$table->timestamps()` on PostgreSQL yields two **nullable**
`timestamp(0) without time zone` columns with **no database default**. This is
reproduced exactly; a `DEFAULT now()` or a `NOT NULL` would both diverge from
the shipped migration.

**Corrected after the post-apply runtime smoke (2026-10-01).** An earlier draft
of this section claimed that rows written by `AppNotification::create()` end up
with NULL timestamps, and cited that as a cosmetic weakness. **That was wrong.**
`AppNotification` is a normal Eloquent model with `$timestamps` left enabled, so
Eloquent populates `created_at` and `updated_at` on every create and update.
Measured: 0 of 8 smoke-written rows had a NULL `created_at`, and
`orderByDesc('created_at')` ordered newest-first as intended. The nullable,
default-free columns are correct and cause **no** ordering defect.

The same smoke also corrected a second claim: PostgreSQL's default under `DESC`
is `NULLS FIRST`, not `NULLS LAST`. That mattered only for the discarded
NULL-timestamp theory, and the `created_at DESC` index still matches the query
as written.

One characteristic genuinely remains: `timestamp(0)` is **second** precision, so
two notifications created in the same second tie and their relative order is
whatever the planner returns. This is inherent to the migration's type and is
deliberately not "fixed", because changing the type would make the live table
diverge from `2026_09_27_000000_create_notifications_table.php`.

### 22.6 Migration ledger and the `2026_09_27_000000` prefix collision

**No ledger row is inserted by the forward SQL.** Section 2 forbids manually
editing the ledger on the 0921 path, and section 12 records that a global
`php artisan migrate` cannot be run against canonical at all.

The collision itself is pre-existing: two repository migrations share the
prefix `2026_09_27_000000` -

- `2026_09_27_000000_create_notifications_table.php`
- `2026_09_27_000000_add_reviewed_site_inspection_id_to_technical_reviews_table.php`

Laravel keys the ledger by migration **name**, not filename, so both would be
recorded and both would run, but the shared prefix makes execution order
ambiguous. This is why the notifications table is absent from canonical today.
Renaming a migration is a repository-history change and is **not** performed by
this plan. Reconciling the ledger remains a separate decision, exactly as
section 12 states.

### 22.7 Existing 0921 handling

```
1. BACK UP the database.
2. psql -v ON_ERROR_STOP=1 -d imaps_db_0921 \
     -f database/sql/2026_10_01_create_notifications_table_for_0921_forward.sql
3. Run the verification queries in 22.9.
```

The script is additive, idempotent, and wrapped in one transaction. It
**aborts loudly** rather than silently reconciling if a `notifications` relation
already exists with an incompatible shape: that relation may hold notification
history this repository did not write, and overwriting it could destroy it.

`public.users` is verified present first; the script refuses to run without it.

### 22.8 Fresh database handling

**No duplicate definition is added anywhere.** A fresh database already receives
this table from the existing repository migration
`2026_09_27_000000_create_notifications_table.php`, which runs as part of the
normal migration sequence (section 2, fresh path, steps 1-7).

The forward-SQL file is therefore **0921-path only** and must never be run
against a fresh/ledger-managed database, exactly like
`2026_09_26_fresh_install_canonical_corrections.sql` (section 1: "**Never** run
the fresh-install corrections against a database that already has a ledger").

### 22.9 Verification queries

After apply, all of these must hold. Queries 6-8 are the regression guard.

```sql
-- 1. table present (expect 10 columns)
SELECT count(*) FROM information_schema.columns
 WHERE table_schema='public' AND table_name='notifications';

-- 2. exact column contract
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name='notifications'
 ORDER BY ordinal_position;

-- 3. constraints: PK + the single FK
SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
 WHERE conrelid='public.notifications'::regclass ORDER BY conname;

-- 4. indexes (expect 4 rows: the 3 explicit ones + the PK index)
SELECT indexname FROM pg_indexes
 WHERE schemaname='public' AND tablename='notifications' ORDER BY indexname;

-- 5. usable, empty on a fresh apply
SELECT count(*) FROM notifications;

-- 6. migration ledger MUST still be 16, unedited by the script
SELECT count(*) FROM migrations;

-- 7. business row counts MUST be unchanged
SELECT (SELECT count(*) FROM zoning_applications)          AS zoning_applications,  -- 73
       (SELECT count(*) FROM site_inspections)             AS site_inspections,     -- 38
       (SELECT count(*) FROM technical_reviews)            AS technical_reviews,    -- 79
       (SELECT count(*) FROM inspection_delivery_attempts) AS delivery_attempts,    --  8
       (SELECT count(*) FROM audit_trail)                  AS audit_trail,          -- 162
       (SELECT count(*) FROM users)                        AS users,                --  7
       (SELECT count(*) FROM failed_jobs)                  AS failed_jobs;          -- 14

-- 8. business fingerprints MUST be unchanged
SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) FROM (SELECT * FROM zoning_applications) t;
--   cf1bc99afe8b2d7f90ca5d179f1d700b
SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) FROM (SELECT * FROM site_inspections) t;
--   222f3a3cbe3e90b5246f58585e5a8504
SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) FROM (SELECT * FROM technical_reviews) t;
--   4024d7cf21533bea82af2d26023bf2b5
SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) FROM (SELECT * FROM audit_trail) t;
--   11a22c9d6b5689f3bb094808689f6930

-- 9. the header bell read path now works: GET /api/notifications
```

The forward SQL was parse-validated against a real PostgreSQL parser inside a
throwaway schema that was rolled back and dropped: it creates exactly the
10 columns above, the PK, the FK and the 3 explicit indexes; `scopeForUser`
semantics (targeted + broadcast) hold; `is_read` defaults to `false`; a re-run
is a no-op; and the incompatible-schema guard aborts as intended. Canonical was
confirmed unchanged afterwards (ledger 16, 26 tables, no `notifications`).

### 22.10 Rollback / recovery

Before any notification is written - which is the current state - the table can
be removed cleanly and the ledger is still 16 rows:

```sql
DROP TABLE IF EXISTS public.notifications;   -- drops its indexes and FK
SELECT count(*) FROM migrations;             -- 16
```

After rows exist, do **not** drop: notification history would be lost and the
header bell would break again. Prefer a forward repair. Back up first, as the
0921 procedure requires.

### 22.11 Application call sites that depend on this table

Every one of these is currently broken on canonical.

**Write sites (6):**

All three `TechnicalReviewController` sites are in **one** method,
`updateStatus` (L153-345), inside a single `DB::transaction` spanning
L190-L326. Verified by reading the transaction boundaries rather than inferred.

| File | Method | Trigger | Target | Failure class |
| --- | --- | --- | --- | --- |
| `ApplicationController.php` | `store` (L582) | new application encoded | Admin + Planning Officer | **fatal, inside `DB::beginTransaction`/`rollBack`** (L518-732) - the whole application creation rolls back |
| `RegisteredUserController.php` | `store` (L97) | new user registered | Admin | **fatal, not caught** - the user row is created, then the request 500s, leaving a half-completed registration |
| `TechnicalReviewController.php` | `updateStatus` (L244) | inspection assigned to a Site Inspector | one Site Inspector | **fatal, inside `DB::transaction`** - rolls the assignment back |
| `TechnicalReviewController.php` | `updateStatus` (L292) | final decision, application status updated | Admin + Planning Officer | **fatal, inside `DB::transaction`** - rolls the review back |
| `TechnicalReviewController.php` | `updateStatus` (L315) | inspection flagged | Admin + Planning Officer | **fatal, inside `DB::transaction`** - rolls the review back |
| `SiteInspectionController.php` | `forceSync` (L131) | FieldSync sync finished | Admin + Planning Officer | **caught** - `catch (\Exception)` converts it to a flash error, so the sync reports failure even though the sync itself succeeded |

`updateStatus` is reached from the Technical Review queue, so all three
Technical Review write paths fail together.

**Read sites (6, all in `NotificationController`):** `index`, `getUnread`,
`markAsRead`, `markAllAsRead`, `destroy`, `clearAll`.

`getUnread` backs the header bell, which `Header.jsx` polls every 30 seconds on
every authenticated page. It degrades safely in the browser (the fetch is
`.catch`-guarded and falls back to a zero count), so the bell shows no
notifications rather than breaking the page - but the notifications page itself
and every write above fail.

**The highest-severity finding:** five of the six write sites are inside a
database transaction, so on canonical a Planning Officer currently **cannot
encode an application, or record a technical review decision** (which is also
how a site inspection gets assigned) - the transaction rolls back on the
notification insert. This is a live production defect that predates the
diagnostics work and is fixed by applying 22.7.

Note that `submitBatch` and `assignInspector` do **not** write notifications and
are therefore unaffected; the exposure is `updateStatus` and `store`.

### 22.12 Post-Loop 9 "Notify Planning Officers" - contract, not yet implemented

Recorded here so the DB precondition and the intended action are documented
together. **No button, route or controller exists for this yet.**

Once 22.7 is applied, the intended action is:

| Concern | Contract |
| --- | --- |
| Who may send | **Admin only** |
| Who may read | Admin + Planning Officer; a Site Inspector has no iMAPS web diagnostics access at all |
| Target users | active `Planning Officer` users |
| Content | diagnostic `reference_code`, `module`, a short safe summary, and a link to the diagnostic detail |
| Must NOT contain | signed URL, JWT, token, credential, handshake key, or any text the sanitizer removed |
| Sanitization | content is taken from the **sanitized** `DiagnosticReportReader` output, never the raw remote row |
| Duplicate sends | a rate limit / cooldown should prevent rapid repeated sends |
| On success | a small confirmation; the report is **NOT** marked resolved - the notice is a reminder only |

### 22.13 Section status

| Item | Result |
| --- | --- |
| Forward SQL | CREATED and **APPLIED** - `2026_10_01_create_notifications_table_for_0921_forward.sql` |
| SQL executed | **YES**, with explicit user approval, `psql` exit 0 |
| Pre-apply backup | TAKEN - `pg_dump` exit 0, 26,220,886 bytes, contents verified |
| Existing 0921 mutation | **ADDITIVE ONLY** - one table, one FK, three indexes |
| Migration ledger | **UNCHANGED** - 16 rows, no row inserted or edited |
| Migration | **NONE created, edited or run** |
| Fresh DB | **UNAFFECTED** - already covered by the existing repository migration |
| Canonical tables | 26 -> 27 |
| Business data | **UNCHANGED** - all 9 row counts and all 6 fingerprints identical |
| `php artisan migrate` | **NOT RUN** |
| Notify PO action | Implemented separately, after this apply |

### 22.14 The plan as originally written (preserved, superseded)

The PLANNED / NOT APPLIED version of this section is preserved because it
records the reasoning that preceded approval, and because it contains two claims
that the post-apply smoke proved wrong. Both corrections are in 22.5.

- The table was justified as fixing six broken production call sites, with five
  of them inside a database transaction.
- It was stated that no `migrations` ledger row would be inserted, and that the
  `2026_09_27_000000` prefix collision was recorded but deliberately not fixed.
- **Wrong as written:** "a row written by `AppNotification::create()` has both
  columns NULL". Eloquent populates them. See 22.5.
- **Wrong as written:** "PostgreSQL sorts NULLs LAST on DESC by default". The
  default is `NULLS FIRST`. See 22.5.
- **Correct as written:** the table contract, the index set, the guard design,
  the 0921-vs-fresh split, and the decision not to touch the ledger.
---

## 23. Reports & Support V2 shared reporting schema - 2026-10-03 (APPLIED)

Applies to the **remote shared FieldSync/Supabase bridge project**, not to the
canonical iMAPS `localhost` database. The iMAPS `migrations` ledger is NOT touched
and no Laravel migration was created: these objects live in a remote database that
iMAPS reaches only through its bridge writer and readers.

Project `laapipjyprmmaylunxib`. Locked bridge source `rosario-imaps-local-0921-a`,
resolved at runtime through `App\Services\BridgeSourceIdentity::id()` ->
`config('bridge.source_id')` -> `IMAPS_BRIDGE_SOURCE_ID`. No deployment-specific
value is hardcoded in the SQL below.

Approved artifact SHA-256:
`D542242BEB5F7CFDD7DC1DFA3CF512E236ECF817E9EC00070FEFAAEB4F2616BC`. The SQL-only
block is sections B-I of that artifact, extracted byte-for-byte rather than retyped,
and it is one transaction.

| Object | Kind | Note |
|---|---|---|
| `diagnostic_reports.report_type` | NEW column | `NOT NULL DEFAULT 'technical_issue'`; legacy rows are Technical Issues, with no backfill UPDATE |
| `diagnostic_reports.field_job_id` | NEW column | nullable; may become NULL only through `ON DELETE SET NULL` |
| `diagnostic_reports.supabase_application_id` | NEW column | durable application identity |
| `diagnostic_reports.bridge_source_id` | NEW column | the namespace that makes that identity meaningful |
| `diagnostic_reports.support_category` | NEW column | controlled vocabulary, Application Support only |
| `dr_field_job_fk` | NEW constraint | `field_jobs(id)`, `ON UPDATE RESTRICT ON DELETE SET NULL` |
| `dr_application_fk` | NEW constraint | `supabase_zoning_applications(id)`, `ON UPDATE RESTRICT ON DELETE RESTRICT` |
| `dr_report_type_ck` | NEW constraint | closed `report_type` vocabulary |
| `dr_report_identity_ck` | NEW constraint | at-rest identity and category coherence |
| `dr_protect_field_job_identity()` | NEW function | `SECURITY INVOKER`, `search_path` pinned empty |
| `dr_guard_field_job_identity` | NEW trigger | `BEFORE UPDATE ON public.field_jobs FOR EACH ROW` |
| `dr_support_filing_is_valid(...)` | NEW function | `SECURITY INVOKER`, nine arguments |
| `dr_support_filing_valid` | NEW policy | `AS RESTRICTIVE FOR INSERT TO authenticated` |
| `dr_reports_type_status_created_idx` | NEW index | `(report_type, status, created_at DESC)` |
| `dr_reports_support_app_idx` | NEW index | partial on Application Support, namespaced |
| `dr_reports_field_job_idx` | NEW index | partial, supporting the FK `SET NULL` path |

Preserved unchanged: the `set_diagnostic_reference` and `touch_diagnostic_report`
triggers, `generate_diagnostic_reference()`, `public.diagnostic_report_seq`, the
`diagnostic_reports_status_check` vocabulary, both existing permissive own-report
policies, every `field_jobs` and mirror policy, the legacy report row, and every
`service_role` grant.

Post-apply privileges:

| Object | `authenticated` | `anon` | `service_role` |
|---|---|---|---|
| `diagnostic_reports` | `SELECT, INSERT` | none | unchanged (trusted) |
| `field_jobs` | `SELECT, UPDATE` | none | unchanged (trusted) |
| `supabase_zoning_applications` | `SELECT` | none | unchanged (trusted) |
| `diagnostic_report_seq` | `USAGE` | none | unchanged (trusted) |

Rollback is a separately approved guarded operation and is deliberately NOT part of
this canonical block. It refuses to discard retained Application Support data or any
populated new field, and it never deletes a report or a report-bearing application
mirror in order to succeed.

<!-- BEGIN CANONICAL SQL: reports-and-support-v2 -->
-- B. NEW COLUMNS. No UPDATE/backfill; existing rows read as technical_issue.
ALTER TABLE public.diagnostic_reports
 ADD COLUMN report_type text NOT NULL DEFAULT 'technical_issue',
 ADD COLUMN field_job_id uuid,
 ADD COLUMN supabase_application_id uuid,
 ADD COLUMN bridge_source_id text,
 ADD COLUMN support_category text,
 ADD COLUMN affected_field text,
 ADD COLUMN requested_change text,
 ADD COLUMN expected_behavior text,
 ADD COLUMN blocks_field_work boolean,
 ADD COLUMN occurred_at timestamptz,
 ADD COLUMN connectivity_state text,
 ADD COLUMN app_version text,
 ADD COLUMN os_version text;

-- C. NEW FKs. Job deletion preserves the report via SET NULL.
-- RESTRICT preserves the durable application anchor: generic cleanup must
-- SKIP report-bearing mirrors, not delete reports or null the application.
ALTER TABLE public.diagnostic_reports
 ADD CONSTRAINT dr_field_job_fk FOREIGN KEY (field_job_id)
  REFERENCES public.field_jobs(id) ON UPDATE RESTRICT ON DELETE SET NULL,
 ADD CONSTRAINT dr_application_fk FOREIGN KEY (supabase_application_id)
  REFERENCES public.supabase_zoning_applications(id) ON UPDATE RESTRICT ON DELETE RESTRICT;

-- D. NEW AT-REST CHECKS. No status or review-field at-rest restriction:
-- trusted Admin/support review must remain possible after initial filing.
ALTER TABLE public.diagnostic_reports
 ADD CONSTRAINT dr_report_type_ck CHECK (report_type IN ('technical_issue','application_support')),
 ADD CONSTRAINT dr_report_identity_ck CHECK (
  (report_type='technical_issue'
   AND field_job_id IS NULL AND supabase_application_id IS NULL
   AND bridge_source_id IS NULL AND support_category IS NULL)
  OR
  (report_type='application_support'
   AND supabase_application_id IS NOT NULL AND bridge_source_id IS NOT NULL
   AND support_category IS NOT NULL
   AND support_category IN ('incorrect_information','missing_information',
    'additional_site_information','clarification_request','correction_request','other'))
 );

-- E. NEW NARROW JOB IDENTITY GUARD.
-- Without this, an inspector could rewrite their job's application/namespace
-- before filing a report, defeating an otherwise-correct filing join.
-- Database role is authoritative; JWT role is an additional restrictive signal,
-- never a privilege grant. selected role/claim also cover a SECURITY DEFINER
-- wrapper whose current_user becomes the function owner.
CREATE FUNCTION public.dr_protect_field_job_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
 IF (
   current_user = 'authenticated'
   OR current_setting('role', true) = 'authenticated'
   OR auth.role() = 'authenticated'
 ) AND (
   NEW.id IS DISTINCT FROM OLD.id
   OR NEW.local_inspection_id IS DISTINCT FROM OLD.local_inspection_id
   OR NEW.supabase_application_id IS DISTINCT FROM OLD.supabase_application_id
   OR NEW.supabase_parcel_id IS DISTINCT FROM OLD.supabase_parcel_id
   OR NEW.bridge_source_id IS DISTINCT FROM OLD.bridge_source_id
 ) THEN
   RAISE EXCEPTION USING ERRCODE='42501',
    MESSAGE='FieldSync job identity is bridge-managed and cannot be changed by authenticated clients.';
 END IF;
 RETURN NEW;
END;
$function$;
-- Supabase function defaults explicitly grant anon/authenticated EXECUTE.
-- Revoke those named grants as well as PUBLIC; do not alter global defaults.
REVOKE ALL ON FUNCTION public.dr_protect_field_job_identity() FROM PUBLIC, anon, authenticated;
-- Trigger execution does not require granting callers direct EXECUTE.
CREATE TRIGGER dr_guard_field_job_identity
 BEFORE UPDATE ON public.field_jobs
 FOR EACH ROW EXECUTE FUNCTION public.dr_protect_field_job_identity();

-- F. NEW SECURITY INVOKER FILING VALIDATOR.
-- Existing SELECT RLS exposes the caller's assigned job and application mirror.
-- No SECURITY DEFINER, no hardcoded deployment source, no owner requirement.
CREATE FUNCTION public.dr_support_filing_is_valid(
 p_job uuid, p_app uuid, p_bridge text, p_type text,
 p_status text, p_technical_description text, p_affected_file text,
 p_recommended_action text, p_category text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
 SELECT coalesce(
  auth.uid() IS NOT NULL
  AND p_status='submitted'
  AND p_technical_description IS NULL
  AND p_affected_file IS NULL
  AND p_recommended_action IS NULL
  AND CASE
   WHEN p_type='technical_issue' THEN
    p_job IS NULL AND p_app IS NULL AND p_bridge IS NULL AND p_category IS NULL
   WHEN p_type='application_support' THEN
    p_job IS NOT NULL AND p_app IS NOT NULL AND p_bridge IS NOT NULL
    AND p_category IS NOT NULL
    AND p_category IN ('incorrect_information','missing_information',
     'additional_site_information','clarification_request','correction_request','other')
    AND EXISTS (
     SELECT 1 FROM public.field_jobs j
     JOIN public.supabase_zoning_applications a ON a.id=j.supabase_application_id
     WHERE j.id=p_job AND j.assigned_inspector_id=auth.uid()
      AND j.supabase_application_id=p_app AND j.bridge_source_id=p_bridge
      AND a.id=p_app AND a.bridge_source_id=p_bridge
    )
   ELSE false
  END, false);
$function$;
REVOKE ALL ON FUNCTION public.dr_support_filing_is_valid(uuid,uuid,text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dr_support_filing_is_valid(uuid,uuid,text,text,text,text,text,text,text) TO authenticated;

-- G. NEW RESTRICTIVE POLICY. Existing "Inspectors create own reports"
-- remains permissive; the result is existing author check AND this policy.
-- Existing "Inspectors view own reports" SELECT policy is unchanged.
-- repro_steps is deliberately NOT an Admin-only field: inspectors may submit it.
CREATE POLICY dr_support_filing_valid ON public.diagnostic_reports
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (
  inspector_id=auth.uid()
  AND public.dr_support_filing_is_valid(
   field_job_id,supabase_application_id,bridge_source_id,report_type,status,
   technical_description,affected_file,recommended_action,support_category)
 );

-- H. CHANGED TABLE/SEQUENCE GRANTS. Trusted service_role grants are untouched.
-- No audited anon consumer needs these tables or the reference sequence.
-- No audited authenticated consumer creates jobs: iMAPS uses service_role.
-- The existing authenticated Admin INSERT policy remains but loses table INSERT;
-- local iMAPS Admin/server job creation continues through service_role.
REVOKE ALL PRIVILEGES ON TABLE public.diagnostic_reports,
 public.field_jobs, public.supabase_zoning_applications FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT ON TABLE public.diagnostic_reports TO authenticated;
GRANT SELECT, UPDATE ON TABLE public.field_jobs TO authenticated;
GRANT SELECT ON TABLE public.supabase_zoning_applications TO authenticated;
-- nextval needs USAGE. Preserve the existing INVOKER reference generator.
-- Remove UPDATE (setval) and unnecessary SELECT, and all anon/PUBLIC access.
REVOKE ALL PRIVILEGES ON SEQUENCE public.diagnostic_report_seq FROM anon, authenticated, PUBLIC;
GRANT USAGE ON SEQUENCE public.diagnostic_report_seq TO authenticated;

-- I. NEW INDEXES: scoped reporting and FK SET NULL lookup.
CREATE INDEX dr_reports_type_status_created_idx
 ON public.diagnostic_reports(report_type,status,created_at DESC);
CREATE INDEX dr_reports_support_app_idx
 ON public.diagnostic_reports(bridge_source_id,supabase_application_id,created_at DESC)
 WHERE report_type='application_support';
CREATE INDEX dr_reports_field_job_idx ON public.diagnostic_reports(field_job_id)
 WHERE field_job_id IS NOT NULL;
COMMIT;
<!-- END CANONICAL SQL: reports-and-support-v2 -->

---

---

## 24. Reports & Support response/status contract - 2026-10-04 (APPLIED)

Two database surfaces, applied under one explicit user approval:

| Surface | Database | Marker |
|---|---|---|
| Inspector-facing response projection | **remote** shared FieldSync/Supabase bridge project `laapipjyprmmaylunxib` | `reports-and-support-response-v1` |
| Authoritative actor/action audit | **local** canonical iMAPS `imaps_db_0921` | Laravel migration `2026_10_04_000000_create_report_action_audit_table` |

The remote project is reached only through iMAPS' bridge readers/writer; the local
`migrations` ledger is touched only by the local migration. Section 23 above
covered a remote-only change; this section covers both surfaces, following the
convention already established by section 22, which documents the **local**
`notifications` table in this same file.

**STATUS: BOTH APPLIED 2026-10-04 with explicit user approval.**

Remote artifact SHA-256 `50476673468C1CD9E6BBBB7BB47B22D20135F2955E6E07F1B6D4269F69EB69D7`,
executed via `supabase db query --linked --file`, exit 0. The SQL-only block below is
the executable statement set of that artifact, extracted byte-for-byte rather than
retyped, and it is one transaction.

Local artifact SHA-256 `8EBF310835ABD03EF88CD31B09A71341A93619D3FB44D29141263FE3E5A25DB9`,
`php -l` clean, applied with
`php artisan migrate --path=database/migrations/2026_10_04_000000_create_report_action_audit_table.php`,
`DONE` in 732.36ms. Ledger advanced 16 -> 17 with exactly one entry. Table created with
0 rows.

The product handling workflow (Admin/PO response endpoints, status transitions in the
UI) is **NOT** implemented by this change. This section records schema only.

### 24.1 Remote objects added (`laapipjyprmmaylunxib`)

| Object | Kind | Note |
|---|---|---|
| `diagnostic_reports.response_message` | NEW column | `text`, nullable; the only safe inspector-facing projection of the official response |
| `diagnostic_reports.responded_by_name` | NEW column | `character varying(255)`, nullable; display snapshot, bounded by local `users.name` |
| `diagnostic_reports.responded_at` | NEW column | `timestamptz`, nullable |
| `dr_response_coherence_ck` | NEW constraint | status-aware coherence; non-blank tested with `~ '[^[:space:]]'`, **not** `btrim()` |
| `dr_response_message_length_ck` | NEW constraint | `char_length(response_message) <= 2000` |
| `dr_guard_response_transition()` | NEW function | `SECURITY INVOKER`, `search_path` pinned empty; BEFORE UPDATE lifecycle guard |
| `dr_guard_response_transition` | NEW trigger | `BEFORE UPDATE ON public.diagnostic_reports FOR EACH ROW` |
| `dr_support_filing_is_valid(...)` | REPLACED | arity 9 -> 12; now also requires all three response fields NULL at filing |
| `dr_support_filing_valid` | REPLACED | recreated to call the 12-argument validator |
| `dr_support_filing_is_valid(9 args)` | DROPPED | superseded overload removed so no stale validator stays executable |

Deliberately **not** added: `responded_by` or any local actor id, any role snapshot,
any escalation column, any new status value, any `authenticated` UPDATE/DELETE
privilege, any UPDATE/DELETE RLS policy, and any index. There is no `responded_by`
because FieldSync wildcard-selects this table, so every added column reaches the
inspector client; canonical responder identity lives locally in
`report_action_audit.performed_by`.

`btrim()` was rejected as the non-blank test after live proof on the target database:
it strips ordinary spaces only, so tab-only, newline-only, carriage-return-only,
form-feed-only, vertical-tab-only and mixed-whitespace-only responses all satisfied
`btrim(x) <> ''`. Six of seven whitespace-only inputs would have been accepted as an
official response. `~ '[^[:space:]]'` rejects all of them.

Function ACLs are applied deterministically (`REVOKE` from `PUBLIC, anon,
authenticated, service_role`, then grant back only the intent) because this database's
`pg_default_acl` for functions in `public` grants EXECUTE to `anon`, `authenticated`
**and** `service_role` directly. Verified result: validator
`{postgres=X/postgres,authenticated=X/postgres}`, transition function
`{postgres=X/postgres}`.

Table privileges are unchanged from section 23: `authenticated` holds `SELECT, INSERT`
only, `anon` none, `service_role` unchanged. RLS on, not forced, three policies, no
UPDATE or DELETE policy. Five indexes unchanged. `diagnostic_reports_status_check`
unchanged at exactly four values.

### 24.2 Local objects added (`imaps_db_0921`)

| Object | Kind | Note |
|---|---|---|
| `report_action_audit` | NEW table | append-only authoritative record of who acted, what transition, when |
| `report_action_audit_action_ck` | NEW constraint | closed three-value action vocabulary |
| `report_action_audit_from_status_ck` | NEW constraint | `submitted`, `in_review` |
| `report_action_audit_to_status_ck` | NEW constraint | `in_review`, `resolved`, `wont_fix` |
| `report_action_audit_transition_ck` | NEW constraint | the only three legal `(action, from_status, to_status)` triples |
| `report_action_audit_performed_by_foreign` | NEW constraint | `users(id)` `ON DELETE RESTRICT` |
| `report_action_audit_report_id_action_unique` | NEW index | `UNIQUE (report_id, action)`; local retry idempotency |
| `report_action_audit_one_terminal_unique` | NEW index | partial `UNIQUE (report_id)` on terminal actions only |

Exactly **four** indexes exist: the primary key, `(report_id, performed_at)` ordered
history, `report_action_audit_report_id_action_unique`, and the partial terminal index.
Aggregate `unique = 3`, `non-unique = 1`. There is deliberately **no** index on
`performed_by`: Laravel's `constrained()` emits no index, PostgreSQL does not
auto-index a referencing column, and no planned query filters or sorts by it. This was
verified live — 12 of 21 foreign keys in this schema have no supporting index,
including the two identical actor-`RESTRICT` precedents `technical_reviews.reviewed_by`
and `application_po_assignments.reassigned_by`.

Maximum two audit rows per report. `submitted -> terminal` is one row;
`submitted -> in_review -> terminal` is two. Three rows is unrepresentable.

`down()` refuses to drop a populated table: it returns if the table is absent, takes
`ACCESS EXCLUSIVE` before counting so no insert can land between the emptiness check
and the `DROP`, throws if any row exists, and drops only when empty. No force mode,
no truncate, no row deletion.

<!-- BEGIN CANONICAL SQL: reports-and-support-response-v1 -->
-- ============================================================
-- REMOTE (shared FieldSync/Supabase bridge project laapipjyprmmaylunxib)
-- public.diagnostic_reports -- one transaction.
-- Extracted byte-for-byte from the approved Candidate A artifact.
-- ============================================================
BEGIN;

-- A. ADDITIVE COLUMNS. No backfill: every existing row keeps NULL and therefore
-- still satisfies the coherence CHECK, so no historical response is fabricated.
ALTER TABLE public.diagnostic_reports
 ADD COLUMN response_message  text,
 ADD COLUMN responded_by_name character varying(255),
 ADD COLUMN responded_at      timestamptz;

-- B. STATUS-AWARE RESPONSE COHERENCE.
-- Non-blank is tested with a POSIX class, not btrim(): btrim() strips ordinary
-- spaces only and accepted tab/newline/CR/FF/VT/mixed whitespace-only responses.
-- The IS NOT NULL conjuncts are load-bearing: a CHECK rejects only on FALSE, and
-- NULL ~ regex is NULL, so without them a resolved report with no response would
-- be accepted.
ALTER TABLE public.diagnostic_reports
 ADD CONSTRAINT dr_response_coherence_ck CHECK (
      (
        status IN ('submitted', 'in_review')
        AND response_message  IS NULL
        AND responded_by_name IS NULL
        AND responded_at      IS NULL
      )
   OR (
        status IN ('resolved', 'wont_fix')
        AND response_message  IS NOT NULL
        AND response_message  ~ '[^[:space:]]'
        AND responded_by_name IS NOT NULL
        AND responded_by_name ~ '[^[:space:]]'
        AND responded_at      IS NOT NULL
      )
 );

-- C. RESPONSE LENGTH CEILING. Database is the authority; also enforced in
-- application validation, and not surfaced as UI clutter.
ALTER TABLE public.diagnostic_reports
 ADD CONSTRAINT dr_response_message_length_ck CHECK (
      response_message IS NULL
   OR char_length(response_message) <= 2000
 );

-- D. LIFECYCLE TRANSITION GUARD. Narrow: returns immediately unless a lifecycle
-- column actually changes, so unrelated UPDATEs are untouched. Disjoint from
-- touch_diagnostic_report (which only assigns updated_at), and fires first
-- alphabetically.
CREATE OR REPLACE FUNCTION public.dr_guard_response_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $function$
BEGIN
  IF (NEW.status, NEW.response_message, NEW.responded_by_name, NEW.responded_at)
     IS NOT DISTINCT FROM
     (OLD.status, OLD.response_message, OLD.responded_by_name, OLD.responded_at)
  THEN
    RETURN NEW;
  END IF;

  IF OLD.status IN ('resolved', 'wont_fix') THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Report lifecycle: status ''' || OLD.status || ''' is final. '
                || 'A resolved or wont-fix report cannot be reopened and its '
                || 'official response cannot be changed. File a new report.';
  END IF;

  IF NOT (
       (OLD.status = 'submitted' AND NEW.status IN ('in_review', 'resolved', 'wont_fix'))
    OR (OLD.status = 'in_review'  AND NEW.status IN ('resolved', 'wont_fix'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'Report lifecycle: transition ' || OLD.status || ' -> '
                || NEW.status || ' is not allowed.';
  END IF;

  RETURN NEW;
END;
$function$;

-- A trigger function is never called on a role's behalf to authorise: PostgreSQL
-- does not check EXECUTE on it at fire time. Revoke from every role that could
-- hold EXECUTE, including service_role, which pg_default_acl would otherwise
-- grant directly.
REVOKE ALL ON FUNCTION public.dr_guard_response_transition() FROM PUBLIC, anon, authenticated, service_role;

CREATE TRIGGER dr_guard_response_transition
 BEFORE UPDATE ON public.diagnostic_reports
 FOR EACH ROW EXECUTE FUNCTION public.dr_guard_response_transition();

-- E. INSPECTOR INSERT HARDENING. Required once the response columns exist: the
-- nine-argument validator ignored them, so an authenticated inspector could have
-- filed their own report already carrying a fabricated response. New 12-argument
-- overload requires all three response fields NULL at filing.
CREATE OR REPLACE FUNCTION public.dr_support_filing_is_valid(
  p_job uuid,
  p_app uuid,
  p_bridge text,
  p_type text,
  p_status text,
  p_technical_description text,
  p_affected_file text,
  p_recommended_action text,
  p_category text,
  p_response_message text,
  p_responded_by_name character varying(255),
  p_responded_at timestamptz
)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $function$
 SELECT coalesce(
   auth.uid() IS NOT NULL
   AND p_status='submitted'
   AND p_technical_description IS NULL
   AND p_affected_file IS NULL
   AND p_recommended_action IS NULL
   AND p_response_message IS NULL
   AND p_responded_by_name IS NULL
   AND p_responded_at IS NULL
   AND CASE
    WHEN p_type='technical_issue' THEN
     p_job IS NULL AND p_app IS NULL AND p_bridge IS NULL AND p_category IS NULL
    WHEN p_type='application_support' THEN
     p_job IS NOT NULL AND p_app IS NOT NULL AND p_bridge IS NOT NULL
     AND p_category IS NOT NULL
     AND p_category IN ('incorrect_information','missing_information',
      'additional_site_information','clarification_request','correction_request','other')
     AND EXISTS (
      SELECT 1 FROM public.field_jobs j
      JOIN public.supabase_zoning_applications a ON a.id=j.supabase_application_id
      WHERE j.id=p_job AND j.assigned_inspector_id=auth.uid()
       AND j.supabase_application_id=p_app AND j.bridge_source_id=p_bridge
       AND a.id=p_app AND a.bridge_source_id=p_bridge
     )
    ELSE false
   END, false);
$function$;

-- Deterministic ACL: revoke from every role that could hold EXECUTE, then grant
-- back only authenticated. service_role is named in the REVOKE because
-- pg_default_acl grants it directly and it never calls this function
-- (service_role has BYPASSRLS, so the RESTRICTIVE policy is never evaluated for it).
REVOKE ALL ON FUNCTION public.dr_support_filing_is_valid(uuid,uuid,text,text,text,text,text,text,text,text,character varying,timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dr_support_filing_is_valid(uuid,uuid,text,text,text,text,text,text,text,text,character varying,timestamptz) TO authenticated;

-- The restrictive policy must call the new arity. Recreated under the SAME name,
-- in the SAME transaction, so there is no instant at which the table has response
-- columns and a validator that ignores them.
DROP POLICY dr_support_filing_valid ON public.diagnostic_reports;
CREATE POLICY dr_support_filing_valid ON public.diagnostic_reports
 AS RESTRICTIVE FOR INSERT TO authenticated
 WITH CHECK (
  inspector_id=auth.uid()
  AND public.dr_support_filing_is_valid(
   field_job_id,supabase_application_id,bridge_source_id,report_type,status,
   technical_description,affected_file,recommended_action,support_category,
   response_message,responded_by_name,responded_at));

-- Drop the superseded nine-argument overload: no policy references it, and
-- leaving it would keep authenticated EXECUTE on a validator that ignores the
-- response columns.
DROP FUNCTION IF EXISTS public.dr_support_filing_is_valid(uuid,uuid,text,text,text,text,text,text,text);

COMMIT;

-- ============================================================
-- LOCAL (canonical iMAPS imaps_db_0921) -- as produced by Laravel migration
-- 2026_10_04_000000_create_report_action_audit_table.php.
-- Recorded from the live catalog, not retyped.
-- ============================================================

-- F. LOCAL AUDIT TABLE. Append-only; no created_at/updated_at because Eloquent
-- would rewrite updated_at on every save. report_id is the REMOTE uuid and is
-- deliberately NOT a foreign key: it lives in another database.
CREATE TABLE public.report_action_audit (
    id bigint DEFAULT nextval('report_action_audit_id_seq'::regclass) NOT NULL,
    report_id uuid NOT NULL,
    action character varying(60) NOT NULL,
    from_status character varying(20) NOT NULL,
    to_status character varying(20) NOT NULL,
    performed_by bigint NOT NULL,
    performed_by_name character varying(255) NOT NULL,
    performed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL);

-- G. PRIMARY KEY and the actor FK with ON DELETE RESTRICT: the actor must never
-- vanish from an authoritative record of who acted.
ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_pkey PRIMARY KEY (id);

ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_performed_by_foreign
 FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

-- H. AUDIT VOCABULARY AND COHERENCE. Only three (action, from_status,
-- to_status) triples are representable, which makes reopen and every
-- action/status mismatch unrepresentable.
ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_action_ck
 CHECK (action IN ('report_review_started','report_resolved','report_wont_fix'));

ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_from_status_ck
 CHECK (from_status IN ('submitted','in_review'));

ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_to_status_ck
 CHECK (to_status IN ('in_review','resolved','wont_fix'));

ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_transition_ck
 CHECK (
      (action = 'report_review_started' AND from_status = 'submitted'   AND to_status = 'in_review')
   OR (action = 'report_resolved'       AND from_status IN ('submitted','in_review') AND to_status = 'resolved')
   OR (action = 'report_wont_fix'       AND from_status IN ('submitted','in_review') AND to_status = 'wont_fix')
 );

-- I. LOCAL AUDIT INDEXES -- three functional indexes plus the primary key.
-- (report_id, performed_at)   ordered history for the per-report read and the
--                             two-source reconciliation scan.
-- UNIQUE (report_id, action)  local retry idempotency: a retry after a lost
--                             acknowledgement must not create a second
--                             authoritative-looking row.
-- partial UNIQUE (report_id)  one terminal outcome per report, so a report can
--                             never be both Resolved and Won't fix even via a
--                             manual INSERT.
-- Deliberately NO index on performed_by -- see section 24.2.
CREATE INDEX report_action_audit_report_id_performed_at_index
 ON public.report_action_audit (report_id, performed_at);

ALTER TABLE public.report_action_audit
 ADD CONSTRAINT report_action_audit_report_id_action_unique
 UNIQUE (report_id, action);

CREATE UNIQUE INDEX report_action_audit_one_terminal_unique
 ON public.report_action_audit (report_id)
 WHERE action IN ('report_resolved','report_wont_fix');
<!-- END CANONICAL SQL: reports-and-support-response-v1 -->

### 24.3 Post-apply verified state

Remote `diagnostic_reports`: 29 columns, 10 constraints (5 CHECK / 3 FK / 1 PK / 1
UNIQUE), 3 triggers all enabled, exactly one `dr_support_filing_is_valid` at
`pronargs = 12`, zero rows at `pronargs = 9`, 5 indexes, 3 RLS policies and zero
UPDATE/DELETE policies, `authenticated` = `SELECT, INSERT` only. All 4 existing
reports remain `submitted` with all three response columns `NULL`; there are 0
terminal rows. `DR-2026-0003` is `application_support` / `submitted` with
`local_application_id` 131 and all response columns `NULL`, and was not mutated.

Local `report_action_audit`: 8 columns, 4 CHECK constraints, 1 FK, 4 indexes
(`unique = 3`, `non_unique = 1`), 0 rows, migration recorded at batch 17.

Rollback is a separately approved guarded operation and is deliberately NOT part of
this canonical block. The remote rollback refuses once any official response exists;
the local `down()` refuses once any audit row exists.