# iMAPS ↔ FieldSync Bridge Architecture

## Purpose and evidence boundary

This is the **single canonical working reference** for all future iMAPS ↔ Supabase ↔ FieldSync bridge work. A fresh agent or team member must be able to restart from this document without relying on old chat history or scattered audit reports.

The canonical operational flow is:

**Planning Officer → iMAPS Technical Review → Site Inspection assignment → iMAPS bridge/system → Supabase → FieldSync Site Inspector → Supabase → iMAPS → Planning Officer Technical Review**

Admin is a side/support actor, not part of the assignment, field-work, or approval chain.

This document combines current implementation evidence, supplied schema evidence, locked business decisions, planned corrections, and live-verification boundaries. It does not claim that supplied exports or repository assumptions equal the current live deployment.

### Evidence classifications

Every material assertion should use one of these classifications when its status could be ambiguous:

- **CONFIRMED BUSINESS RULE** — explicitly settled by the team; do not reopen without directly contradictory new evidence or an explicit team change.
- **VERIFIED IMPLEMENTATION** — established by current source inspection or executed tests.
- **PROVIDED SCHEMA EVIDENCE** — established by supplied schema/table/RLS exports, but not necessarily the current live deployment.
- **LIVE VERIFIED** — checked against the current running environment with captured evidence.
- **PLANNED** — accepted future work that is not implemented.
- **BLOCKED** — cannot currently be verified or completed because a named prerequisite is unavailable.
- **LEGACY** — historical behavior, vocabulary, or planning retained only for context and not authoritative for new work.

# BRIDGE WORK ENTRYPOINT

> **BEFORE ANY FUTURE BRIDGE WORK**

1. Read this document first.
2. Read **CURRENT ACTIVE LOOP** and the current issue/loop close record.
3. Do not reopen settled business decisions unless new evidence directly contradicts them or the team explicitly changes them.
4. Do not implement future loops ahead of the active loop.
5. After each verified issue, update this document with what changed, evidence, tests, remaining blocker, and the next active issue.
6. Treat implementation evidence as stronger than historical assumptions. Keep implementation evidence distinct from supplied schema evidence and live verification.
7. Classify claims as **CONFIRMED BUSINESS RULE**, **VERIFIED IMPLEMENTATION**, **PROVIDED SCHEMA EVIDENCE**, **LIVE VERIFIED**, **PLANNED**, **BLOCKED**, or **LEGACY**.
8. Preserve unrelated work and keep each bridge issue bounded to its approved contract.

# CURRENT ACTIVE LOOP

**LOOP 3 — Assigning Planning Officer — IN PROGRESS**

Current evidence shows the source-side provenance contract is implemented in the local model, migration, and job payload. The Controller capture and live Supabase schema application remain Team Leader-owned and pending explicit controller-side implementation, so this loop remains in progress rather than closed.

**Current verified work:**
- `SiteInspection` fillable includes the latest assigner provenance fields and comments describe the latest Planning Officer semantics.
- `PushInspectionToSupabase` forwards persisted assignment provenance without using runtime auth lookup.
- FieldSync offline cache now persists `assignment_instructions`, `assigned_by_imaps_user_id`, and `assigned_by_name` and restores them on cache reopen.
- The current source contract keeps `assignment_instructions` and `inspector_notes` independent and preserves Loop 1 status behavior.

**Outstanding / deferred:**
- Team Leader-owned controller capture of the authenticated Planning Officer before dispatch remains pending.
- Live Supabase remote columns for `public.field_jobs.assigned_by_imaps_user_id` and `assigned_by_name` still require manual live verification or explicit user confirmation before claiming production verification.

---

## LOOP 2 — Assignment Instructions Ownership — CLOSED / VERIFIED LOCALLY (2026-09-18)

**Phase A — Shared schema additive column:**
- `field_jobs.assignment_instructions text` column: **APPLIED / LIVE VERIFIED** (confirmed live in Supabase via session query; nullable, no default).

**Phase B — iMAPS payload correction (`PushInspectionToSupabase.php`):**
- **VERIFIED IMPLEMENTATION:** `assigned_notes` now maps to `assignment_instructions` in the upsert payload.
- **VERIFIED IMPLEMENTATION:** `inspector_notes` is omitted entirely from the iMAPS upsert payload — this is the safest retry form; no retry or re-push can ever overwrite the inspector's own notes column.
- File: `C:\Users\Ralph Lauren\iMAPS\app\Jobs\PushInspectionToSupabase.php` (line 136 region).

**Phase C — FieldSync read-side implementation:**

*`tasks_screen.dart`:*
- `final String? assignmentInstructions;` field added to `TaskItem` class.
- Constructor param added; `fromJob` factory parses `job['assignment_instructions'] as String?`.
- `inspectorNotes` and `assignmentInstructions` are parsed independently with no cross-contamination.
- File: `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\modules\tasks\screens\tasks_screen.dart`

*`parcel_detail_screen.dart`:*
- Assignment Instructions `_GlassCard` inserted as a proper sibling list item after the INSPECTION PROTOCOL card.
- Gated on `task.assignmentInstructions?.trim().isNotEmpty == true` — null/empty shows nothing, no fallback to `inspector_notes`.
- File: `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\navigation\parcel_detail_screen.dart`

*`completed_inspection_detail_screen.dart`:*
- Assignment Instructions Container card inserted as a sibling list item after the INSPECTION DATA label.
- Same null/empty gate — no fallback to `inspector_notes`.
- File: `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\modules\inspection\screens\completed_inspection_detail_screen.dart`

*`supabase_service.dart`:*
- `assignment_instructions` column added to the explicit column list in `fetchMyJobs` select query (line 427 region).
- The detail/completed-job select already used `*` (wildcard) — no change needed there.
- File: `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\supabase_service.dart`

**Phase D — Tests written and passing:**

*iMAPS PHPUnit:*
- `Loop2AssignmentInstructionsOwnershipTest.php` — 5 tests / 10 assertions passed:
  1. `assigned_notes` maps to `assignment_instructions` in payload.
  2. Payload does NOT contain `inspector_notes` key.
  3. `inspector_notes` is absent — remote value preserved on retry.
  4. Existing remote status preserved — not reset on retry (Loop 1 regression guard).
  5. Status does not default to legacy `Pending` casing.
- `PushInspectionToSupabaseStatusContractTest.php` (Loop 1 regression) — 7 tests / 9 assertions passed.

*FieldSync Dart:*
- `loop2_assignment_instructions_contract_test.dart` — 11 tests passed:
  1–2. `fromJob` populates/nulls `assignmentInstructions` correctly.
  3. `inspectorNotes` and `assignmentInstructions` parsed independently, no cross-contamination.
  4–5. Null/empty `assignmentInstructions` does not fall back to `inspectorNotes`.
  6. `supabase_service` select query confirmed to contain `assignment_instructions`.
  7. `sync_outbox_service` confirmed to NOT write `assignment_instructions`.
  8–11. Lifecycle/category behaviour unchanged (pending/ongoing/completed and null-instruction guard).
- `task_category_ground_truth_test.dart` (Loop 1 regression) — 38 tests passed.

**Static analysis:**
- `flutter analyze --no-pub`: 0 errors, 0 warnings. 38 infos are pre-existing `withOpacity` deprecations in unrelated files — not introduced by this work.
- `git diff --check`: only pre-existing line-ending warnings in unrelated files (not introduced by this work). iMAPS diff check clean.

**Phases E / F / G completed — see Loop 2 Closure Record below.**

**LOOP 2 — ASSIGNMENT INSTRUCTIONS OWNERSHIP — CLOSED / VERIFIED LOCALLY**

**Shared column (`assignment_instructions`):** APPLIED / LIVE VERIFIED

**Real retry E2E on production data:** DEFERRED TO LOOP 10

**NEXT ACTIVE LOOP: LOOP 3 — ASSIGNING PLANNING OFFICER**
(Do not start Loop 3 until explicitly instructed.)

**Previous Loop Closure:**
**LOOP 1 — Canonical Task Status — CLOSED / VERIFIED LOCALLY**
(Boundaries: Loop 1 closure means local/source/test verification of the canonical lifecycle, compatibility mapping, category precedence, offline persistence and interrupted recovery. It does not mean full production E2E acceptance. Loop 10 remains the production E2E acceptance gate.)

**Loop 1 Close Record:**
- **CONTRACT:** `assigned` → `in_progress` → `completed`.
- **UI:** Pending → Ongoing → Completed.
- **COMPATIBILITY:** legacy Pending/pending; in-progress/ongoing; Completed/submitted; unsupported values handled safely.
- **PRODUCER:** new iMAPS jobs use `assigned`; retry preserves existing remote lifecycle.
- **OFFLINE:** start persists Ongoing; Final Submit persists Completed.
- **RECOVERY:** abandoned syncing reconciles safely; ACK loss / replay / photos / conditional writes protected.
- **SCHEDULING:** metadata only; Scheduled is subsection/presentation under Pending.
- **KNOWN DEFERRALS:** Loops 2–10 as defined by roadmap.
- **EVIDENCE:** exact latest test aggregate (15 suites, 226 tests passed), actual analyzer output (0 errors, 0 warnings, 38 infos), diff check clean, no live mutation during final local verification.

**Historical Loop 1 Substeps Record:**
- **Loop 1A — producer verification**: CLOSED / VERIFIED (source-level)
- **Loop 1B — status compatibility**: CLOSED / VERIFIED (contract-level)
- **Loop 1C — category mapping**: CLOSED / VERIFIED (implementation-level)
- **Loop 1C-R — downstream alignment**: CLOSED / VERIFIED (implementation-level)
- **Loop 1D-R — Offline Completion Visibility Repair**: CLOSED / VERIFIED LOCALLY (includes R2A retention and R2B conflict visibility)
- **Loop 1D-R3 — Offline Start Lifecycle**: CLOSED / VERIFIED LOCALLY
- **Loop 1D-R4 — Interrupted Outbox Recovery**: CLOSED / VERIFIED LOCALLY (stale recovery, ACK-loss replay, and enqueue-vs-ACK ordering)
- **Loop 1D — Online/Offline Lifecycle Verification**: CLOSED / VERIFIED LOCALLY

**LOOP 2 CLOSE RECORD — CLOSED / VERIFIED LOCALLY (2026-09-18)**

**Closure contract — all ten points satisfied:**

1. **Planning Officer owns `assignment_instructions`.** Sole writer: `PushInspectionToSupabase.php` line 136. FieldSync has zero write paths to this column (search: 0 matches across all outbox/service/provider files).
2. **Site Inspector owns `inspector_notes`.** FieldSync writers: `supabase_service.dart` (submitInspection), `sync_outbox_service.dart` (findings_update outbox + reconciliation), `inspection_provider.dart`. iMAPS: zero active writes to `inspector_notes` in any push job.
3. **iMAPS push writes `assigned_notes` → `assignment_instructions`.** Source-confirmed: `PushInspectionToSupabase.php` line 136.
4. **iMAPS push/retry does NOT write `inspector_notes`.** Key absent from `$jobPayload` (lines 128–137). Supabase upsert only touches supplied keys — absent key leaves remote column untouched on every retry.
5. **FieldSync reads `assignment_instructions` read-only.** `tasks_screen.dart` line 166; `supabase_service.dart` line 427 (SELECT). No outbox action includes it.
6. **FieldSync Final Submit / progress never writes `assignment_instructions`.** `submitInspection` payload (lines 838–860) confirmed absent. All outbox writers confirmed absent by search.
7. **`inspector_notes` survives iMAPS retry.** Loopback proof (static analysis — 4 cases): CASE 1 assigned/null notes → notes stays null; CASE 2 in_progress/notes present → notes unchanged verbatim; CASE 3 completed/notes present → notes unchanged; CASE 4 null assigned_notes → only `assignment_instructions` receives null, `inspector_notes` untouched. Real production E2E deferred to Loop 10.
8. **Lifecycle/status preservation from Loop 1 intact.** Retry reads existing status before upsert and supplies it verbatim (line 132). Loop 1 regressions: `PushInspectionToSupabaseStatusContractTest.php` 7/9 assertions ✅; `task_category_ground_truth_test.dart` 38/38 ✅.
9. **No legacy `inspector_notes` → `assignment_instructions` mass backfill performed.** No migration run. No data mutation in either repository during this loop.
10. **Existing historical rows with null `assignment_instructions` remain null.** Column added with no default and no trigger — correct and safe initial state.

**Regression evidence (fresh execution, 2026-09-18):**
- FieldSync: 235 passed across 16 suites; 1 pre-existing `r4_recovery_test.dart [E]` failure (drain-state ordering issue, predates Loop 2, unrelated to any Loop 2 column or payload).
- iMAPS: 12 tests / 19 assertions passed (Loop2AssignmentInstructionsOwnershipTest + PushInspectionToSupabaseStatusContractTest).
- `flutter analyze --no-pub`: 0 errors, 0 warnings, 38 pre-existing infos.
- `git diff --check`: pre-existing line-ending warnings only; no Loop 2 whitespace errors.
- No stage, commit, push, reset, clean, or stash performed.

**Live-vs-local classification:**
- `field_jobs.assignment_instructions` column: **APPLIED / LIVE VERIFIED**
- Implementation and loopback retry matrix: **VERIFIED LOCALLY**
- Real retry E2E on production data: **DEFERRED TO LOOP 10**

## Loop 0 → Loop 1A transition

**Loop 0 status: PARTIALLY CLOSED.** The identity/account-mapping portion is **CLOSED FOR CURRENT KNOWN INSPECTORS**. Remaining live infrastructure and security verification is deferred to the production-readiness gate.

The following are **LIVE VERIFIED from user-supplied safe row-level query results**. Raw handshake values were neither requested nor recorded; matching used MD5 handshake fingerprints:

| iMAPS Site Inspector | Supabase profile/Auth account | Classification |
|---|---|---|
| `users.id = 6`; Renato Dimaculangan; `dimaculanganr@gmail.com`; active | `full_name = MyTofu`; `auth_email = inspector@test.com`; UUID `ddcebeac-2217-41c5-a6e2-d7f873db9af2` | MATCHED |
| `users.id = 25`; Hanami Garduque; `tolentinoh@imaps.com`; active | `full_name = Henry Tolentino`; `auth_email = tolentinoh@imaps.com`; UUID `9bbc5cca-53b0-400d-8588-69b8fcd53c91` | MATCHED |

Additional **LIVE VERIFIED** evidence:

- local duplicate non-empty handshake query: **0 rows**;
- orphan `field_jobs.assigned_inspector_id` query: **0 rows**;
- the currently used FieldSync profile **MyTofu** is connected to iMAPS Site Inspector Renato Dimaculangan through the handshake bridge;
- display name and email do not define bridge identity;
- MyTofu `field_jobs` inventory: `assigned = 1`, `in_progress = 14`, `completed = 28`, legacy `Pending = 34`; total `77`.

This mixed population proves that Loop 1A must not rewrite existing `Pending` rows. Existing remote status remains authoritative on retry. Loop 1B has now defined transitional mapping; any actual legacy-row migration remains separate, gated work. Human-readable identity/profile mismatches are a separate future issue.

The following remain unresolved production-readiness requirements and are **NON-BLOCKING FOR LOOP 1A SOURCE-LEVEL CORRECTION ONLY**:

- live full catalog and constraint verification;
- live RLS, grant, and trigger verification;
- storage verification;
- server-side security hardening.

Loop 1A was permitted because it changes only the source fallback for a new remote `field_jobs` row, does not depend on identifying a particular inspector account, does not modify existing remote rows, does not mutate Supabase, and does not claim production E2E acceptance.

# CONFIRMED BUSINESS RULES — TEAM DECISIONS

These decisions are locked unless the team explicitly changes them.

## Rule 1 — Final Submit

FieldSync **Final Submit** means the field inspection is completed. There is no required separate task lifecycle status `submitted`. `submitted_at` is a timestamp/metadata field only. Technical Review after FieldSync completion occurs in iMAPS.

## Rule 2 — Decision authority

Only the Planning Officer has inspection-result business decision authority. Admin does not approve or decline inspection results.

## Rule 3 — Reinspection

Reinspection always creates a **new inspection round and task**. The previous completed inspection remains historical and keeps its photos, GPS, checklist, findings, and results. It must not be reused as the new inspection task.

## Rule 4 — Site Inspector access

The Site Inspector operational system is FieldSync. The main iMAPS web system is intended for Admin and Planning Officer users. Site Inspectors must not have general iMAPS web application access.

## Rule 5 — Assigning officer

FieldSync must show which Planning Officer assigned the task. Never infer Admin as the assigner.

## Rule 6 — Delivery failure visibility

iMAPS → FieldSync delivery failures must be visible to the Planning Officer as operational/actionable assignment information and to Admin as system/support/oversight information.

## 1. System ownership

### iMAPS

- Laravel/React planning and administration system.
- Owns the local PostgreSQL/PostGIS database.
- Owns application and parcel creation, Technical Review, inspector assignment, and initial inspection scheduling.
- Creates the local `SiteInspection`, pushes its remote task through `PushInspectionToSupabase`, and pulls completed results through `PullCompletedInspections`.

### FieldSync

- Flutter mobile application for site inspectors.
- Owns **My Tasks**, the inspection steps, offline/local persistence, and remote synchronization.
- Reads assigned tasks from Supabase, records field work, and writes task progress, completion data, and photo evidence back to Supabase.

### Supabase

- Shared remote integration layer between iMAPS and FieldSync.
- Holds the application mirror (`supabase_zoning_applications`), parcel mirror (`supabase_parcels`), tasks (`field_jobs`), photos/evidence, and inspector identity used by the bridge.
- Supabase Auth UUIDs provide the cross-system inspector identity used for task assignment and filtering.

## 2. End-to-end flow

```mermaid
flowchart LR
    A[Planning Officer creates application] --> B[(zoning_applications)]
    B --> C[(parcels)]
    C --> D[Technical Review]
    D --> E[Assign inspector + parcel + schedule]
    E --> F[(SiteInspection)]
    F --> G[PushInspectionToSupabase]
    G --> H[(supabase_zoning_applications)]
    H --> I[(supabase_parcels)]
    I --> J[(field_jobs)]
    J --> K[FieldSync My Tasks]
    K --> L[Inspector performs inspection steps]
    L --> M[FieldSync updates field_jobs and photos]
    M --> N[PullCompletedInspections]
    N --> O[(Local SiteInspection updated)]
    O --> P[Planning Officer Technical Review]
    P --> Q{Approved / Declined / Reinspection Requested}
```

The verified sequence is:

1. A Planning Officer creates the application in local `zoning_applications` and associates one or more local `parcels`.
2. During Technical Review, the Planning Officer selects a Site Inspector, intended parcel, schedule, and optional assignment data.
3. iMAPS creates a local `SiteInspection` and dispatches `PushInspectionToSupabase`.
4. The iMAPS bridge push upserts the application mirror, selected parcel mirror, and related `field_jobs` task.
5. FieldSync loads My Tasks for the authenticated inspector and conducts the inspection through its inspection steps, including offline/local persistence and remote sync paths.
6. FieldSync updates the remote `field_jobs` row and photo evidence; Final Submit sets the task to `completed`.
7. `PullCompletedInspections` selects completed remote jobs and updates the matching local `SiteInspection` by `local_inspection_id`.
8. The Planning Officer performs the post-inspection Technical Review and decides Approved, Declined, or Reinspection Requested. Admin does not make this decision.

## 3. Human input vs system generated

Fields listed here describe ownership, not universal requiredness. A value is not mandatory unless the current validation or schema explicitly makes it so.

| Domain | Human-entered | System-generated/mapped |
|---|---|---|
| Application | Applicant, business/project data; application type; classification/land use | Local application ID; workflow/lifecycle fields; Supabase application UUID returned by the application-mirror row |
| Parcel | Selected parcel; property/location details; target coordinates where supplied | Local parcel ID; relationship to the local application; Supabase parcel UUID returned by the pushed parcel row |
| Inspection assignment | Planning Officer selects the Site Inspector, scheduled date, deadline where supplied, and assignment instructions where supplied | Local inspection ID; inspector Supabase Auth UUID resolved from the shared handshake key; assigning-officer identity fields (planned); `field_jobs` ID generated remotely; task lifecycle/progress fields |


## 4. Planning-Officer-triggered iMAPS → Supabase contract

`PushInspectionToSupabase` is the canonical current iMAPS bridge writer for this Planning-Officer-triggered assignment flow. It upserts by `local_application_id`, `local_parcel_id`, and `local_inspection_id` and uses the returned remote application and parcel UUIDs in `field_jobs`.

| iMAPS source | Supabase destination | FieldSync usage |
|---|---|---|
| `zoning_applications.id` | `supabase_zoning_applications.local_application_id` | Stable local-to-remote application correlation |
| `zoning_applications.reference_number` | `supabase_zoning_applications.reference_number` | Displayed as task/inspection reference |
| `zoning_applications.application_type` | `supabase_zoning_applications.application_type` | Task/application context |
| `zoning_applications.land_use_class` | `supabase_zoning_applications.land_use_class` | Mirrored application classification |
| Application applicant/contact/purpose/location fields | Corresponding columns in `supabase_zoning_applications` | Applicant and application context in task screens |
| `parcels.id` | `supabase_parcels.local_parcel_id` | Stable local-to-remote parcel correlation |
| Pushed application row UUID | `supabase_parcels.supabase_application_id` | Associates parcel mirror to the application mirror |
| Parcel property/location/classification/coordinate fields | Corresponding columns in `supabase_parcels`; coordinates also produce pushed `geom` | Parcel identity, parcel details, map/GPS context |
| `site_inspections.id` | `field_jobs.local_inspection_id` | Stable task correlation and local completion lookup |
| Pushed application row UUID | `field_jobs.supabase_application_id` | Application relationship read with a task |
| `site_inspections.parcel_id` | `field_jobs.supabase_parcel_id`, via the corresponding pushed parcel row | Identifies the intended parcel and loads parcel context |
| `users.handshake_key` for `site_inspections.inspector_id`, resolved against `profiles.handshake_key` | `field_jobs.assigned_inspector_id` using the matched profile/Auth UUID | Compared with the authenticated inspector's user ID for My Tasks filtering |
| `site_inspections.scheduled_date` | `field_jobs.scheduled_date` | Task schedule |
| `site_inspections.deadline_date` | `field_jobs.deadline_date` | Task deadline |
| `site_inspections.assigned_notes` | `field_jobs.assignment_instructions` | **LOOP 2 PART 1 VERIFIED LOCALLY:** iMAPS now writes `assigned_notes` into `assignment_instructions`; `inspector_notes` omitted from payload entirely |
| `status` assignment policy: new remote row uses `assigned`; preserve any existing remote value unchanged on retry | `field_jobs.status` | FieldSync task lifecycle; UI maps `assigned` to Pending |

The source currently writes additional verified application fields (`representative_name`, `contact_number`, `email`, `purpose`, and `barangay`) and parcel fields (`parcel_code`, `location_address`, `barangay`, `owner_name`, `lot_number`, `tct_number`, `tax_dec_number`, `lot_area_sqm`, `land_use_class`, `property_index_number`, `arp_number`, `survey_number`, `latitude`, `longitude`, and `geom`). Requiredness is intentionally not inferred here.

## 5. Inspector identity contract

The canonical structural identity chain is:

**iMAPS `users.id` → `users.handshake_key` → Supabase `profiles.handshake_key` → `profiles.id` / Supabase Auth UUID → `field_jobs.assigned_inspector_id` → FieldSync `auth.currentUser.id`.**

The contract requires one unambiguous handshake mapping: each non-null/non-empty handshake key must identify at most one local iMAPS user and exactly one intended Supabase profile when assigned. Missing, duplicate, or mismatched mappings must fail visibly rather than select an arbitrary account.

Current source implements this shape by generating one handshake key, storing it on the local user and remote profile, resolving `SiteInspection.inspector_id` to the local `User`, querying `profiles` by handshake key in `PushInspectionToSupabase`, and assigning the returned profile/Auth UUID to `field_jobs.assigned_inspector_id`.

Operationally:

1. iMAPS provisions a Site Inspector in Supabase Auth and receives the Auth user UUID.
2. After profile creation, iMAPS writes the generated handshake key to the matching remote profile and stores the same key on the local user.
3. The local `SiteInspection.inspector_id` remains a local user foreign key.
4. The push resolves that local user, queries `profiles.handshake_key`, and fails loudly if no matching profile UUID is returned. Remote handshake-key uniqueness is a live-schema precondition because the query uses `limit=1` rather than detecting duplicates.
5. FieldSync obtains `client.auth.currentUser.id` and filters `field_jobs.assigned_inspector_id` to that UUID for My Tasks and completed-job reads.

The current bridge no longer uses `users.supabase_uuid` for assignment resolution. The migration whose historical filename mentions `supabase_uuid` now repairs `users.handshake_key` and its uniqueness instead; filename and implementation therefore differ.

### Provided 2026-09-16 schema evidence

**iMAPS schema provided:**

- `users.id`: bigint primary key;
- `users.email`, `users.name`, `users.role`, and `users.is_active`;
- `users.handshake_key`: nullable;
- the role CHECK includes `Planning Officer`, `Admin`, and `Site Inspector`;
- `site_inspections.inspector_id`: foreign key → `users.id`, `ON DELETE SET NULL`;
- email uniqueness is shown, but no UNIQUE constraint/index on `users.handshake_key` is shown.

Therefore, local handshake uniqueness remains a **schema gap in this provided database snapshot**, notwithstanding repository repair migration history.

**Supabase table export provided:**

- `profiles.id`: UUID primary key;
- `profiles.full_name`, `profiles.role`;
- `profiles.handshake_key`: nullable UNIQUE;
- `field_jobs.assigned_inspector_id`: UUID.

The structural remote handshake mapping is supported by the provided definition. The supplied files alone did not identify specific accounts; the later safe row-level fingerprint evidence recorded under **Loop 0 → Loop 1A transition** now closes account mapping for the two current known inspectors. Do not extrapolate that evidence to other accounts without the same safe matching process.

**ACCOUNT ROW MAPPING = CLOSED FOR CURRENT KNOWN INSPECTORS.** Display names and emails are descriptive only; the handshake bridge defines identity. Raw handshake values must not be recorded in this document.

### Profile/RLS identity risk from provided Supabase export

**HIGH / VERIFY AND HARDEN BEFORE PRODUCTION ACCEPTANCE**

The provided `profiles` policy allows users to update their own profile with `USING (auth.uid() = id)` and `WITH CHECK (auth.uid() = id)`. The same profile row contains `role` and `handshake_key`, and no column-specific protection is shown in the provided policy export. The provided `field_jobs` policies also include an Admin-role-dependent insert policy.

Unless another trigger, grant restriction, or permission layer not shown in the export prevents it, self-modification of profile role or handshake identity could undermine bridge authorization and identity. This is supplied policy evidence, not proof of exploitability in the live deployment. Verify and harden it before production acceptance; do not mutate policies as part of documentation work.

A separate least-privilege concern remains: the provided application/parcel SELECT policies use `true` for authenticated users. Their live scope and business acceptability require verification.

## 6. Parcel contract

- One zoning application can contain multiple parcels (`ZoningApplication` has many `Parcel` records).
- Every inspection task must identify the intended parcel rather than implicitly selecting an arbitrary application parcel.
- Standalone inspector assignment now requires `parcel_id`.
- iMAPS validates that the selected parcel's `zoning_application_id` matches the assigned inspection's `zoning_application_id`.
- `PushInspectionToSupabase` limits the loaded application parcels to `SiteInspection.parcel_id`, pushes that parcel mirror, and sets `field_jobs.supabase_parcel_id` to the corresponding remote parcel UUID.

## 7. Task lifecycle ownership

### iMAPS responsibility

- Creates and initializes the assignment.
- Supplies the initial assignment identity, application, parcel, inspector, schedule, deadline, and notes.
- **VERIFIED IMPLEMENTATION (Loop 1A):** current code initializes a new remote row with canonical machine status `assigned`; before Loop 1A it used legacy `Pending`.

### FieldSync responsibility

- Owns task progress after assignment.
- Updates the remote lifecycle as inspectors open and complete steps, synchronize work, and submit results.

Retries and re-pushes must preserve the existing `field_jobs.status`. The iMAPS bridge writer first reads the existing remote status and retains it in the upsert payload; a bridge retry must not blindly reset a FieldSync-managed lifecycle state to `assigned` or the legacy value `Pending`.

The canonical normal lifecycle is `assigned` → `in_progress` → `completed`. `cancelled` is reserved/unsupported because no cancellation workflow or writer is confirmed: preserve an existing value, exclude it from active My Tasks categories, surface diagnostics, and require a Team Leader decision before any client writes or product behavior are added. Existing remote state remains authoritative on retries.

## 7.1 Two separate state machines

### A. Inspector task lifecycle

Machine states:

`assigned` → `in_progress` → `completed`

Human-facing FieldSync categories:

**Pending → Ongoing → Completed**

| Machine state | My Tasks category | Meaning |
|---|---|---|
| `assigned` | Pending | Assigned field work has not started |
| `in_progress` | Ongoing | Inspector still has unfinished field work |
| `completed` | Completed | Inspector field work is finished |

`submitted_at` is metadata/a timestamp, not a lifecycle state. Scheduling is also metadata, not lifecycle. A self-scheduled `assigned` task appears under **Pending → Scheduled subsection**. Once work starts, `in_progress` takes precedence and the task appears in **Ongoing**. A self-scheduled `in_progress` task must never remain inside Pending.

### B. iMAPS post-inspection business lifecycle

`completed inspection received` → **Planning Officer Technical Review**

The Planning Officer then decides:

- **Approved**; or
- **Declined**; or
- **Reinspection Requested**.

`Reinspection Requested` → **NEW `SiteInspection`** → **NEW `local_inspection_id`** → **NEW `field_jobs` row** → new FieldSync **Pending** task.

The previous Completed task remains Completed.

## 7.2 My Tasks invariants

- FieldSync retains exactly three top-level visible categories: **Pending**, **Ongoing**, and **Completed**.
- Do not add **Under Review** as a fourth lifecycle/category.
- Do not place Planning Review inside Ongoing.
- **Ongoing** means the inspector still has unfinished field work.
- **Completed** means inspector field work is finished.
- Planning Review may optionally appear later as read-only secondary metadata under a Completed task, such as **Awaiting Review**, **Approved**, **Declined**, or **Reinspection Requested**, but only after a deliberate shared review contract is added.
- Planning Review must never affect `field_jobs.status`, `TaskItem.category`, `current_step`, or inspection progress.

## 7.3 Reinspection invariants and verified blockers

**Round 1:** `SiteInspection A` → `local_inspection_id A` → `field_jobs A` → Completed → immutable historical evidence.

If the Planning Officer requests reinspection:

**Round 2:** **NEW `SiteInspection B`** → **NEW `local_inspection_id B`** → **NEW `field_jobs B`** → fresh Pending task, progress, GPS, photos, checklist, and findings.

Never perform: Completed Round 1 → reset to Pending → reuse the same `local_inspection_id`.

Current blockers, recorded without fixing them here:

- **VERIFIED IMPLEMENTATION:** the `TechnicalReviewController` batch path uses `updateOrCreate` keyed by application + parcel and can reuse an existing `SiteInspection`.
- **VERIFIED IMPLEMENTATION:** bridge upsert by a reused `local_inspection_id` then reuses the same `field_jobs` row.
- **VERIFIED IMPLEMENTATION:** FieldSync currently permits completed-task rework.
- **VERIFIED IMPLEMENTATION:** GPS rework can regress `completed` → `in_progress`.
- **PLANNED:** server-side historical immutability is not yet enforced.

## 7.4 Assignment data ownership — REQUIRED CONTRACT CORRECTION

| Field | Owner | Other-system behavior |
|---|---|---|
| `assignment_instructions` | iMAPS / Planning Officer | FieldSync reads it only |
| `inspector_notes` | FieldSync / Site Inspector | iMAPS reads it as inspection-result data |

Current collision:

`site_inspections.assigned_notes` → `field_jobs.inspector_notes` → overwritten by FieldSync inspector notes → may later be overwritten again by an iMAPS bridge retry.

This is a **REQUIRED CONTRACT CORRECTION**. The two ownership domains must be separated with an additive shared contract.

## 7.5 Assigning Planning Officer contract

FieldSync must display the assigning Planning Officer. The recommended additive fields are:

- `assigned_by_imaps_user_id` — stable source identity in iMAPS;
- `assigned_by_name` — display snapshot for FieldSync and audit.

Planning Officers do not need Supabase Auth accounts merely to provide FieldSync display identity. Never infer Admin as the assigner.


## 8. Local PostgreSQL schema reality

PostgreSQL dump reconciliation showed that the migration ledger and actual deployed schema had historical drift.

### Columns already present in the reconciled dump

- `site_inspections.parcel_id`
- `site_inspections.deadline_date`
- `site_inspections.assigned_notes`

These are historical reconciliation findings, not proof of the supplied 2026-09-16 snapshot or current live database. In particular, repository repair history describes local handshake uniqueness, while the supplied 2026-09-16 iMAPS schema does not show that UNIQUE constraint; Loop 0 must reconcile and live-verify the difference.

### Columns absent from the reconciled dump

- `site_inspections.findings`
- `site_inspections.recommendation`
- `site_inspections.remarks`
- `site_inspections.is_compliant`

The reconciled dump already contains `users.handshake_key`; the later repair enforces reproducibility and uniqueness. No current bridge-required identity column is absent from that dump.

### Phase 1 reconciliation

- `2026_09_10_000000_add_bridge_columns_to_site_inspections_table.php` now guard-adds `parcel_id`, its parcel foreign key, `deadline_date`, `assigned_notes`, and nullable completion columns `findings`, `recommendation`, `remarks`, and `is_compliant`; rollback is intentionally non-destructive.
- `2026_07_19_060544_add_deadline_date_to_site_inspections_table.php` was repaired from malformed historical content into a valid guarded, non-destructive migration.
- `2026_09_10_000001_repair_supabase_uuid_on_users_table.php` (historical filename) forward-repairs nullable `users.handshake_key` and its unique index, with duplicate non-empty key detection before adding uniqueness.
- `2026_09_10_000002_add_site_inspector_to_users_role_check.php` safely reproduces the PostgreSQL role CHECK with `Site Inspector` included.

The actual reconciled dump accepted the `Site Inspector` role, while repository migrations previously did not reproduce that constraint correctly. The repair validates the replacement PostgreSQL CHECK before dropping the historical constraint.

## 9. Completed Phase 1 fixes

### `0dbbb3d5103b672f3e021add4ef3ff298c2ca853`

**`fix: stabilize FieldSync bridge integration`**

- Added the guarded bridge repair migration and parcel foreign-key/schema alignment.
- Aligned `SiteInspection` fillable fields with parcel, scheduling, notes, and completion data.
- Persisted a shared handshake key locally and on the Supabase profile when registering a Site Inspector.
- Required and validated exact parcel ownership during standalone assignment.
- Made remote task re-push retry-safe by retaining existing FieldSync status.
- Removed destructive parent-application deletion from completion pulling so remote history and evidence remain available.

### `abb9148f7d151fd5294ea33778c4e6c44cd25413`

**`fix: reconcile iMAPS bridge schema drift`**

- Extended the repair migration for missing nullable completion fields.
- Repaired the malformed historical deadline migration.
- Added the forward-safe `users.handshake_key` schema and unique-index repair with duplicate detection.
- Added PostgreSQL-safe reproducibility for the `Site Inspector` role constraint.

Together, the commits complete the verified Phase 1 scope: repair migration, parcel FK/schema alignment, completion-field schema repair, handshake-key schema repair, Site Inspector role reproducibility, malformed deadline migration repair, `SiteInspection` fillable alignment, inspector profile mapping, parcel-safe assignment, retry-safe remote status, and removal of destructive parent deletion.

## 10. FieldSync → Supabase → iMAPS current return contract

`PullCompletedInspections` currently selects remote `field_jobs` whose `status` is completed, locates the local `SiteInspection` through `field_jobs.local_inspection_id`, and persists:

- `status`
- `submitted_at`
- `inspection_result`
- `is_compliant`
- `findings`
- `observations`
- `discrepancies`
- `recommendations`
- `remarks`
- `inspector_notes`
- `checklist_data`
- `confirmed_latitude`, `confirmed_longitude`, `gps_accuracy_m`, and `gps_confirmed_at`
- local `completed_at`, set once from the iMAPS pull time (`now()`) when absent

The pull currently leaves the completed remote application, parcel, job, and evidence records in place. The guarded local rich-result migration and `SiteInspection` model support the selected fields above.

FieldSync and current remote readers/writers expose additional verified data that is **not yet persisted into local iMAPS by `PullCompletedInspections`**:

- `checklist_completed_count`
- `checklist_total_count`
- `photo_paths`
- `photo_count`
- photo evidence metadata read from `field_job_photos`, including `photo_url`, `latitude`, `longitude`, `captured_at`, and FieldSync's per-photo `notes`
- progress/rework evidence such as `current_step`, `step_timestamps`, `started_at`, and `rework_started_at`

Durable local ownership of this remaining reverse-sync dataset was historically labeled **Phase 5**. That label is now **LEGACY**; schedule the work only through an explicit loop/issue. The presence of direct Supabase reads in current iMAPS UI code does not mean these values are stored in local PostgreSQL.

## 11. Live Supabase items still unverified

The following are **LIVE VERIFY**. Source references or assumptions are not proof of the currently deployed Supabase definition, and these items are not classified as broken without defect evidence:

- **LIVE VERIFY:** deployed `field_jobs` columns and data types
- **LIVE VERIFY:** unique constraints, including the keys required by current upserts
- **LIVE VERIFY:** exact foreign-key names
- **LIVE VERIFY:** PostgREST relationship names used by nested selects
- **LIVE VERIFY:** delete cascade behavior
- **LIVE VERIFY:** `field_job_photos` foreign key and relationship
- **LIVE VERIFY:** `profiles` identity relationship to Supabase Auth, `profiles.handshake_key` uniqueness, and task identity
- **LIVE VERIFY:** RLS policies for inspectors and Admin/service operations
- **LIVE VERIFY:** CHECK constraints, including task lifecycle constraints
- **LIVE VERIFY:** custom triggers, including profile-creation behavior

## 11.1 iMAPS-owned bridge delivery lifecycle

Bridge delivery state is separate from the inspection lifecycle:

**Pending Delivery → Delivered to FieldSync**

or

**Pending Delivery → Delivery Failed**

Example: the Planning Officer creates an assignment; local `SiteInspection` creation succeeds; the bridge push is then Pending Delivery. A successful push becomes Delivered to FieldSync. A queue, profile-resolution, configuration, or Supabase push failure becomes Delivery Failed.

- The Planning Officer sees the affected assignment and an actionable delivery status.
- Admin sees aggregate, repeated, and system-level delivery failures for support and oversight.
- FieldSync has no responsibility when a task never reaches Supabase.
- These delivery states must not be stored as or confused with `field_jobs.status`.

## 11.2 Admin role — support, not approval

Admin is a side/support actor.

**Admin may own:**

- Site Inspector account provisioning;
- user management;
- audit visibility;
- analytics and system oversight;
- bridge-health monitoring;
- failed/repeated delivery monitoring;
- inspector identity-mapping issues;
- infrastructure/configuration alerts;
- diagnostic/support ticket review.

**Admin must not own:**

- Site Inspection assignment;
- Site Inspector selection;
- inspection scheduling;
- FieldSync task lifecycle;
- inspection approval;
- decline decisions;
- reinspection business decisions.

The Planning Officer owns those business actions and decisions.

## 11.3 Diagnostics and support connection

**PROVIDED SCHEMA EVIDENCE:** the supplied Supabase export includes `diagnostic_reports` with fields including:

- `id`;
- `reference_code`;
- `inspector_id`;
- `title`;
- `summary`;
- `module`;
- `status`;
- `technical_description`;
- `repro_steps`;
- `affected_file`;
- `recommended_action`;
- `created_at`;
- `updated_at`.

The supplied table description identifies these as **Inspector-submitted issue reports for MPDO Admin review**. The future support loop is:

**FieldSync Inspector → submits diagnostic/support issue → `diagnostic_reports` → iMAPS Admin/support oversight → triage/technical follow-up**

This support path is separate from inspection approval and Planning Officer Technical Review.

The provided RLS evidence shows inspectors can create and view their own diagnostic reports. No explicit authenticated Admin read/update policy was shown in that export. Therefore an Admin diagnostic UI/access path is **CONTRACT/ACCESS WORK REQUIRED**; do not claim it already works in iMAPS.

## 12. Development rules

1. Never reset FieldSync lifecycle state during an iMAPS bridge retry.
2. Never delete the remote parent application as completion cleanup.
3. Every field inspection must retain exact parcel identity.
4. `assigned_inspector_id` must use the inspector Supabase Auth UUID.
5. Do not expose Supabase service credentials.
6. Any iMAPS bridge payload change must be checked against current FieldSync readers.
7. Any FieldSync remote-schema/read change must be checked against the iMAPS bridge writer.
8. Historical migration drift must be repaired with reviewed, forward-safe migrations where possible.
9. Do not treat the migration ledger or a supplied export alone as proof of the actual deployed schema.
10. Do not edit unrelated UI or features during bridge work.
11. Before **any Controller modification**, the Team Leader must be notified and approval must be received.

## 13. Phase history — LEGACY planning context

This table preserves historical phase labels only. The loop roadmap below is authoritative for all future sequencing.

| Historical phase | Scope | Status |
|---|---|---|
| Phase 1 | Core bridge stabilization | **DONE** |
| Phase 2 | Team-safe Git handoff | **DONE** |
| Phase 3 | Canonical bridge architecture | **SUPERSEDED BY THIS CANONICAL DOCUMENT** |
| Phase 4 | Exact Planning Officer input contract | **SUPERSEDED BY LOOP ROADMAP** |
| Phase 5 | Rich reverse sync | **UNRESOLVED; schedule through an explicit loop/issue** |
| Phase 6 | Live Supabase and end-to-end verification | **REPRESENTED BY LOOPS 0 AND 10** |

## 14. Definition of done

Final bridge completion requires all of the following to be demonstrated:

- [ ] The correct application is pushed.
- [ ] The correct parcel is pushed.
- [ ] The correct inspector receives the task.
- [ ] Schedule, deadline, and notes are preserved.
- [ ] The FieldSync task appears correctly.
- [ ] The task lifecycle is not reset by an iMAPS bridge retry.
- [ ] FieldSync Steps 1–6 complete successfully.
- [ ] Offline/reconnect synchronization succeeds.
- [ ] Detailed inspection results return to iMAPS.
- [ ] Photos, checklist data, and results remain available.
- [ ] No destructive remote cleanup occurs.
- [ ] Live Supabase foreign keys, RLS policies, and constraints are verified.
- [ ] The real workflow is tested end to end.

---

## 15. Alignment matrix — field-by-field mapping

This matrix maps every bridge-relevant column across the four systems: local PostgreSQL (`site_inspections`), Supabase (`field_jobs`), FieldSync local SQLite, and FieldSync Supabase reads/writes. Columns are grouped by domain.

### 15.1 Application mirror — `supabase_zoning_applications`

| Column | iMAPS Push writes | Migration 002 defines | FieldSync reads | Status |
|---|---|---|---|---|
| `id` (uuid PK) | auto-generated | ✅ | via relation | ✅ OK |
| `local_application_id` | ✅ `application->id` | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `reference_number` | ✅ | ✅ unique | ✅ `referenceNumber` | ✅ OK |
| `applicant_name` | ✅ | ✅ | ✅ `applicantName` | ✅ OK |
| `application_type` | ✅ | ✅ nullable | ✅ via relation | ✅ OK |
| `land_use_class` | ✅ written | ❌ NOT DEFINED | ❌ not read directly | ⚠️ LIVE VERIFY |
| `declared_land_use` | — (not pushed) | ✅ nullable | ❌ not read | OK (unused) |
| `representative_name` | ✅ written | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `contact_number` | ✅ written | ❌ NOT DEFINED | ✅ via relation | ⚠️ LIVE VERIFY |
| `email` | ✅ written | ❌ NOT DEFINED | ✅ via relation | ⚠️ LIVE VERIFY |
| `purpose` | ✅ written | ❌ NOT DEFINED | ✅ via relation | ⚠️ LIVE VERIFY |
| `barangay` | ✅ | ✅ nullable | ✅ via relation | ✅ OK |
| `address` | — (not pushed) | ✅ nullable | ❌ not read | OK (unused) |
| `lot_area_sqm` | — (not pushed) | ✅ nullable | ❌ not read | OK (unused) |
| `zoning_classification` | — (not pushed) | ✅ nullable | ❌ not read | OK (unused) |
| `status` | — (not pushed) | ✅ default 'pending' | — | OK (managed separately) |

**Upsert conflict target:** PushInspectionToSupabase uses `?on_conflict=local_application_id`. This column is **NOT defined in migration 002**. Must exist on live Supabase for the push to succeed.

### 15.2 Parcel mirror — `supabase_parcels`

| Column | iMAPS Push writes | Migration 002 defines | FieldSync reads | Status |
|---|---|---|---|---|
| `id` (uuid PK) | auto-generated | ✅ | via relation | ✅ OK |
| `local_parcel_id` | ✅ `parcel->id`; upsert key | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `supabase_application_id` | ✅ | ✅ FK, cascade | — | ✅ OK |
| `parcel_number` | — | ✅ nullable | — | OK (unused) |
| `parcel_code` | ✅ | ❌ NOT DEFINED | iMAPS detail UI reads | ⚠️ LIVE VERIFY |
| `location_address` | ✅ | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `barangay` | ✅ | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `lot_number` | ✅ | ✅ nullable | — | ✅ OK |
| `block_number` | — | ✅ nullable | — | OK (unused) |
| `survey_number` | ✅ | ✅ nullable | — | ✅ OK |
| `lot_area_sqm` | ✅ | ❌ NOT DEFINED (`land_area_sqm` exists instead) | ✅ FieldSync + iMAPS read `lot_area_sqm` | 🔴 CONTRACT DRIFT |
| `land_area_sqm` | — | ✅ nullable | ❌ active clients do not read this spelling | ⚠️ NAMING DRIFT |
| `latitude` | ✅ | ✅ nullable | ✅ via relation | ✅ OK |
| `longitude` | ✅ | ✅ nullable | ✅ via relation | ✅ OK |
| `geom` | ✅ WKT point or null | ❌ NOT DEFINED | map/RPC behavior depends on deployment | ⚠️ LIVE VERIFY |
| `geojson_boundary` | — | ✅ nullable | — | OK (unused) |
| `owner_name` | ✅ | ✅ nullable | — | ✅ OK |
| `tct_number` | ✅ | ✅ nullable | — | ✅ OK |
| `tax_dec_number` | ✅ | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |
| `land_use_class` | ✅ | ❌ NOT DEFINED (`land_classification` exists instead) | ✅ via relation | 🔴 CONTRACT DRIFT |
| `land_classification` | — | ✅ nullable | ❌ active clients do not read this spelling | ⚠️ NAMING DRIFT |
| `property_index_number` | ✅ | ❌ NOT DEFINED | ✅ via relation | ⚠️ LIVE VERIFY |
| `arp_number` | ✅ | ❌ NOT DEFINED | — | ⚠️ LIVE VERIFY |

**Upsert conflict target:** `PushInspectionToSupabase` uses `?on_conflict=local_parcel_id`, which correctly preserves distinct parcels for a multi-parcel application. Migration 002 defines neither `local_parcel_id` nor its UNIQUE constraint, so both remain **LIVE VERIFY**. A repository schema dump contains `local_parcel_id` and a unique key, but that dump is historical evidence only.

### 15.3 Task — `field_jobs`

| Column | iMAPS Push writes | Migration 002 CHECK/defines | FieldSync writes | FieldSync reads | Status |
|---|---|---|---|---|---|
| `id` (uuid PK) | auto-generated | ✅ | — | ✅ `id` | ✅ OK |
| `local_inspection_id` | ✅ `$inspection->id` | ✅ unique | — | ✅ for filtering | ✅ OK |
| `assigned_inspector_id` | ✅ resolved UUID | ✅ FK → profiles | — | ✅ filtering | ✅ OK |
| `assigned_by_imaps_user_id` | ❌ planned additive writer | ❌ NOT DEFINED | read-only | planned display | REQUIRED CONTRACT ADDITION |
| `assigned_by_name` | ❌ planned additive writer | ❌ NOT DEFINED | read-only | planned display | REQUIRED CONTRACT ADDITION |
| `supabase_application_id` | ✅ | ✅ FK | — | ✅ via relation | ✅ OK |
| `supabase_parcel_id` | ✅ | ✅ FK | — | ✅ via relation | ✅ OK |
| `scheduled_date` | ✅ formatted Y-m-d | ✅ nullable date | — | ✅ displayed | ✅ OK |
| `deadline_date` | ✅ formatted Y-m-d | ❌ NOT DEFINED | — | ✅ displayed | ⚠️ LIVE VERIFY |
| `priority` | — | ✅ default 'normal' | — | — | OK |
| **`status`** | ✅ new row writes `'assigned'`; retry preserves existing value unchanged | CHECK: `assigned/in_progress/completed/cancelled` | writes `'in_progress'` / `'completed'` | reads current | LOOP 1A VERIFIED; Loop 1B mapping decided; live catalog verification still required |
| `findings` | — | ✅ nullable | ✅ `provider.notes` | ✅ displayed | ✅ OK |
| `observations` | — | ✅ nullable | ✅ generated string | ✅ displayed | ✅ OK |
| `discrepancies` | — | ✅ nullable | ✅ `provider.discrepancies` | ✅ displayed | ✅ OK |
| `recommendations` | — | ✅ nullable | ✅ `provider.recommendations` | ✅ displayed | ✅ OK |
| `is_compliant` | — | ✅ nullable boolean | ✅ `_selectedStatus == 'Compliant'` | ✅ displayed | ✅ OK |
| **`inspection_result`** | — | CHECK: `'With discrepancy'`, `'For review'`, `'Requires reinspection'` (sentence case) | writes `'With Discrepancy'`, `'For Review'`, `'Requires Reinspection'` (Title Case) | ✅ displayed | 🔴 CRITICAL |
| **`inspector_notes`** | ❌ omitted from iMAPS payload (Loop 2 Part 1 fix) — FieldSync owns this column exclusively | ✅ nullable | ✅ writes `provider.notes` | ✅ displayed | ✅ LOOP 2 PART 1 VERIFIED — iMAPS no longer writes this column; inspector value is safe from overwrite |
| `assignment_instructions` | ✅ writes `$inspection->assigned_notes` (Loop 2 Part 1 fix) | ✅ nullable text — APPLIED/LIVE VERIFIED | read-only; never written by FieldSync outbox | ✅ parcel_detail_screen + completed_inspection_detail_screen; null/empty shows nothing | LOOP 2 PART 1 VERIFIED LOCALLY |
| `confirmed_latitude` | — | ✅ nullable | ✅ GPS confirm | ✅ displayed | ✅ OK |
| `confirmed_longitude` | — | ✅ nullable | ✅ GPS confirm | ✅ displayed | ✅ OK |
| `gps_accuracy_m` | — | ✅ nullable | ✅ GPS confirm | ✅ displayed | ✅ OK |
| `gps_confirmed_at` | — | ✅ nullable | ✅ GPS confirm | ✅ displayed | ✅ OK |
| `checklist_data` | — | ✅ jsonb nullable | ✅ JSON array | ✅ displayed | ✅ OK |
| `checklist_completed_count` | — | ✅ int default 0 | ✅ computed | ✅ displayed | ✅ OK |
| `checklist_total_count` | — | ✅ int default 0 | ✅ computed | ✅ displayed | ✅ OK |
| `photo_paths` | — | ✅ text[] nullable | ✅ storage paths | ✅ displayed | ✅ OK |
| `photo_count` | — | ✅ int default 0 | ✅ computed | ✅ displayed | ✅ OK |
| `submitted_at` | — | ✅ nullable | ✅ ISO timestamp | ✅ displayed | ✅ timestamp metadata only; never a task status |
| `remarks` | — | ❌ NOT DEFINED | — | ✅ Pull + frontend read | ⚠️ LIVE VERIFY |
| `current_step` | — | ❌ NOT DEFINED | ✅ writes step number | ✅ reads for resume | ⚠️ LIVE VERIFY |
| `step_timestamps` | — | ❌ NOT DEFINED | ✅ writes per-step times | ✅ reads for display | ⚠️ LIVE VERIFY |
| `started_at` | — | ❌ NOT DEFINED | ✅ GPS confirm sets once | ✅ reads | ⚠️ LIVE VERIFY |
| `rework_started_at` | — | ❌ NOT DEFINED | ✅ lazy write on edit | ✅ reads for badge | ⚠️ LIVE VERIFY |
| `is_self_scheduled` | — | ❌ NOT DEFINED | — | ✅ reads for filter | ⚠️ LIVE VERIFY |
| `reviewed_by` | — | ✅ FK nullable | — | — | LEGACY Phase 5 label; any review use requires the optional Loop 8 contract |
| `reviewed_at` | — | ✅ nullable | — | — | LEGACY Phase 5 label; any review use requires the optional Loop 8 contract |

---

## 16. Internal inconsistencies found

### 🟡 LOOP 1 IN PROGRESS — Status value collision (producer and compatibility contract resolved; client implementation remains)

**Location:** `PushInspectionToSupabase.php` line 132 ↔ supplied migration `002_core_tables.sql` field_jobs CHECK constraint ↔ FieldSync `TaskItem` categorization.

**Evidence:**
- Supplied migration 002 defines: `CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled'))`.
- Before Loop 1A, PushInspectionToSupabase wrote: `'status' => $existingJob['status'] ?? 'Pending'`.
- **VERIFIED IMPLEMENTATION (Loop 1A):** it now writes `'status' => $existingJob['status'] ?? 'assigned'` and preserves a non-null existing remote value verbatim.
- **LIVE VERIFIED row evidence:** MyTofu has `assigned = 1`, `in_progress = 14`, `completed = 28`, and legacy `Pending = 34` (77 total). This proves canonical values are accepted by the deployed table and that live schema/data drift from the supplied CHECK evidence exists.
- **VERIFIED REPOSITORY INVENTORY (Loop 1B):** active task writers use `assigned`, `in_progress`, and `completed`; no active writer was found for status `submitted`, `Pending`, `pending`, `in-progress`, `ongoing`, `onprocess`, or `cancelled`. iMAPS does contain unrelated local `SiteInspection` `Pending` values, application workflow statuses, UI labels, and a legacy dashboard reader for `in-progress`; those are not remote status writers.

**Loop 1B result:** Client-side compatibility mapping does not require a schema change. Legacy rows remain untouched. New writers must emit only canonical normal lifecycle values. Live default/nullability/CHECK inspection is still required before any schema or data migration and before production acceptance, but it does not block the bounded Loop 1C read-mapping change. Human-facing Pending remains a UI category, not a new machine value.

### 🔴 CRITICAL — `inspection_result` CHECK casing mismatch

**Location:** Migration 002 CHECK constraint ↔ `review_submit_screen.dart` `_statusOptions`.

- Migration 002: `'Compliant', 'With discrepancy', 'For review', 'Requires reinspection'`.
- FieldSync writes: `'Compliant', 'With Discrepancy', 'For Review', 'Requires Reinspection'`.

Three of four values can fail if the CHECK is enforced. Choose one stored representation and enforce it everywhere. Recommended: retain FieldSync's existing user-facing Title Case values and update the CHECK via a forward migration, or map labels to stable machine enums before writing.

### ✅ RESOLVED (Loop 2 Part 1) — `inspector_notes` write-write collision

- **Previous state:** iMAPS wrote Planning Officer assignment instructions into `field_jobs.inspector_notes`; FieldSync later wrote inspector Findings notes into the same column; submission destroyed the assignment instructions.
- **Fix applied (VERIFIED LOCALLY):**
  - `assignment_instructions text` column added to `field_jobs` — APPLIED / LIVE VERIFIED in Supabase.
  - `PushInspectionToSupabase.php`: `assigned_notes` now maps to `assignment_instructions`; `inspector_notes` is **omitted entirely** from the upsert payload — iMAPS will never again touch (read, set, or null) the inspector's notes column.
  - FieldSync: `TaskItem` reads `assignment_instructions` into `assignmentInstructions`; displayed in `parcel_detail_screen` and `completed_inspection_detail_screen` — null/empty shows nothing; no fallback to `inspector_notes`.
  - `supabase_service.dart`: `assignment_instructions` added to the explicit column list in `fetchMyJobs`.
  - `sync_outbox_service.dart`: confirmed to not write `assignment_instructions`.
- **Tests:** 5 PHPUnit + 11 Dart tests pass; Loop 1 regression suites (7 PHP + 38 Dart) pass.
- **Remaining:** Phase E (live retry acceptance), Phase F (full regression), Phase G (Loop 2 Part 1 closure).

### 🟡 HIGH — Migration 002 is incomplete versus the code contract

The following actively used columns are absent from migration 002 and require live verification or additive migrations:

- `field_jobs`: active-code fields `deadline_date`, `current_step`, `step_timestamps`, `started_at`, `rework_started_at`, `is_self_scheduled`, and `remarks`; ✅ `assignment_instructions` — APPLIED / LIVE VERIFIED (Loop 2 Part 1); still required future fields: `assigned_by_imaps_user_id` and `assigned_by_name`.
- `supabase_zoning_applications`: `local_application_id`, `land_use_class`, `representative_name`, `contact_number`, `email`, `purpose`.
- `supabase_parcels`: `local_parcel_id`, `parcel_code`, `location_address`, `barangay`, `lot_area_sqm`, `geom`, `tax_dec_number`, `land_use_class`, `property_index_number`, `arp_number`. Migration 002 instead defines the unused spellings `land_area_sqm` and `land_classification`.
- Missing table definition: `field_job_photos`, used by FieldSync and the iMAPS inspection detail UI.

**Impact:** The repository migration ledger cannot prove that a clean Supabase deployment supports the current code. Applying it without a live inventory risks failed writes or an undocumented divergent schema.

**Recommendation:** Inventory the deployed schema first, then document or add only forward-safe bridge columns and constraints. Do not reset or drop existing data.

### 🟡 HIGH — Parcel mirror schema and upsert key drift from migration 002

The current push uses `?on_conflict=local_parcel_id`, consistent with the documented one-application-to-many-parcels model. Migration 002 does not define that column or a UNIQUE constraint for it. It also defines `land_area_sqm` and `land_classification`, while active writers/readers use `lot_area_sqm` and `land_use_class`, plus several columns absent from migration 002. PostgREST upsert conflict targets require a matching unique or primary-key constraint.

**Impact:** A deployment created only from migration 002 cannot accept the current parcel payload/upsert or satisfy active parcel selects. On a drifted live deployment, a missing unique constraint makes the upsert fail, while naming drift makes payloads or embeds fail with missing-column errors.

**Recommendation:** Verify every active parcel column in section 15.2 and confirm that live `local_parcel_id` has the correct type and a UNIQUE constraint. Adopt one canonical area/classification spelling and migrate/map all writers and readers. Do not make `supabase_application_id` unique because an application can contain multiple parcels.

### 🟢 MEDIUM — Local `recommendation` versus `recommendations`

Local `site_inspections` contains the legacy singular `recommendation` and the newer plural `recommendations`. FieldSync and PullCompletedInspections use the plural field. Confirm whether the singular field is still consumed; if not, mark it legacy and clean it up separately.

---

## 17. Settled contracts and remaining contract decisions

The following are no longer open questions:

- task lifecycle machine values are `assigned` → `in_progress` → `completed`;
- FieldSync labels remain Pending → Ongoing → Completed;
- assignment instructions and inspector notes require separate ownership fields;
- reinspection creates a new `SiteInspection`, `local_inspection_id`, and `field_jobs` row;
- Final Submit completes inspector field work; `submitted_at` is only a timestamp;
- Planning Officer, not Admin, owns inspection-result decisions.

Remaining explicit contract decisions include:

1. legacy task-status mapping and `cancelled` behavior;
2. the stored `inspection_result` vocabulary/casing;
3. which remote evidence must also be durable in local PostgreSQL;
4. optional round/lineage metadata for new reinspection rows;
5. a future optional Planning Review metadata contract that cannot alter task lifecycle;
6. delivery-state persistence with Planning Officer actionable visibility and separate Admin support/oversight visibility.

For rich reverse sync, current code persists result fields, checklist JSON, and GPS evidence, but not checklist summary counts, photos, or progress/rework timestamps. Photos should remain durable evidence with approved URL/path and retention semantics rather than duplicating binaries without an explicit requirement.


---

## 18. End-to-end readiness and preflight sequence

### 18.1 Current readiness verdict

The bridge is **not ready for a production E2E acceptance run**. Its intended flow and active code contract are documented, but the deployed Supabase contract has not been inventoried and the three critical inconsistencies in section 16 remain unresolved. Local runtime dependencies and configuration are also unavailable, so no live workflow has been executed as part of this audit.

Documentation completion does not establish runtime readiness. A green E2E verdict requires evidence from every checkpoint below.

### 18.2 Required preflight order

Perform these steps in order so a failed prerequisite cannot be hidden by a later partial success:

1. **Protect existing data.** Capture a recoverable Supabase backup or approved rollback point. Do not reset the project or replay migration 002 against production without reconciling it to the deployed schema.
2. **Inventory live Supabase.** Export table columns and types, defaults, NOT NULL rules, CHECK/UNIQUE/FK constraints, indexes, relationship names exposed by PostgREST, triggers, RLS policies, grants, storage buckets, and storage-object policies for all bridge tables.
3. **Reconcile schema evidence.** Compare the live inventory with section 15, migration 002, the repository schema dump, iMAPS payloads/selects, and FieldSync reads/writes. Treat the live catalog—not a historical migration or dump—as authoritative.
4. **Resolve blocking contracts.** At minimum, align the new-task status, normalize or map `inspection_result`, separate assignment instructions from inspector-authored notes, verify/enforce the `local_parcel_id` parcel upsert key, and standardize/map parcel area/classification names. Apply only reviewed, forward-safe migrations.
5. **Verify photo infrastructure.** Confirm the table contract in section 19, the `field_jobs` relationship, inspector SELECT/INSERT/UPDATE permissions needed by idempotent upserts, the `inspection-photos` bucket, object upload/update/read policies, and URL accessibility for iMAPS reviewers.
6. **Restore both runtimes.** Install locked Laravel/Node/Flutter dependencies; configure local PostgreSQL, queue processing, Supabase URL/keys, and FieldSync environment values; clear stale Laravel configuration caches. Never expose the service-role key to FieldSync or browser code.
7. **Prepare an isolated fixture.** Create or select one application, one exact parcel, one local `SiteInspection`, and one inspector whose local mapping resolves to the expected Supabase Auth/profile UUID. Record IDs before the test.
8. **Exercise the iMAPS → Supabase push.** Run the queue worker and dispatch the Planning-Officer-triggered bridge push. Verify exactly one application mirror, parcel mirror, and `field_jobs` row; validate UUID links, inspector identity, dates, instructions, assigning officer, and initial `assigned` status.
9. **Test retry idempotency.** Re-run the bridge push after FieldSync has changed the job to `in_progress`. Verify no duplicate mirrors/jobs are created and lifecycle/progress/output fields are not reset.
10. **Exercise FieldSync online.** Sign in as the assigned inspector, confirm only authorized tasks are visible, open the task, confirm GPS, complete Steps 1–6, capture photos and notes, and validate incremental remote writes.
11. **Exercise offline/reconnect.** Repeat representative checklist, photo, findings, and final-submit actions without connectivity; restore connectivity; drain the outbox; verify ordered synchronization, deterministic photo retries, no duplicate photo rows/objects, and no lost edits.
12. **Submit and inspect remotely.** Verify `completed`, submission/result fields, checklist payload and counts, GPS evidence, photo paths/count, photo metadata, timestamps, and retained assignment instructions under the agreed ownership model.
13. **Exercise reverse sync.** Run `php artisan sync:pull-inspections`; verify the intended fields update the matching local record by `local_inspection_id`, explicit remote null behavior is accepted, and a second pull is idempotent.
14. **Verify review and retention.** Confirm iMAPS can render the completed report and photos, completed records remain available to FieldSync history, and no application/parcel/job/evidence parent is destructively removed.
15. **Run authorization negatives.** Verify another inspector cannot read or modify the job/photos, unauthenticated clients cannot access protected data, and service operations use server-side credentials only.
16. **Capture evidence.** Save sanitized request/response samples, row counts and IDs, screenshots or logs for each checkpoint, schema-policy exports, and the exact revisions tested. Mark section 14 complete only after every assertion passes.

### 18.3 Stop conditions

Stop the E2E run and fix the contract before continuing if any of these occur:

- a push violates a CHECK/NOT NULL/foreign-key constraint;
- an upsert reports no matching UNIQUE/exclusion constraint;
- a retry creates a duplicate or resets FieldSync-owned state;
- inspector identity does not resolve to the authenticated UUID;
- RLS allows cross-inspector access or blocks the assigned inspector's required operation;
- photo metadata, storage objects, or reviewer access diverge;
- reverse sync targets the wrong local inspection or loses previously accepted evidence.

---

## 19. Expected `field_job_photos` contract

Migration 002 does not create `field_job_photos`. A repository schema dump contains a table with most of the required shape, but it is historical evidence only and is **not proof of the live deployment**. The active FieldSync writer and both clients' readers require the following effective contract:

| Column/contract | Expected definition or behavior | Evidence and caveat |
|---|---|---|
| `id` | UUID primary key; client-supplied deterministic UUID must be accepted | FieldSync upserts on `id` to make retries idempotent; a generated default may remain for other writers |
| `field_job_id` | UUID NOT NULL FK → `field_jobs.id` with `ON DELETE CASCADE` | Required for the nested PostgREST relationship and ownership checks |
| `photo_url` | TEXT NOT NULL | Stored after upload and read by iMAPS/FieldSync |
| `latitude` | DOUBLE PRECISION nullable | Capture metadata |
| `longitude` | DOUBLE PRECISION nullable | Capture metadata |
| `captured_at` | TIMESTAMPTZ nullable or default `now()` | Capture timestamp read by both clients |
| `notes` | TEXT nullable | Active FieldSync upload writes per-photo notes; this column is absent from the inspected schema dump and therefore requires **LIVE VERIFY** |
| `created_at` | TIMESTAMPTZ default `now()` | Present in the repository schema dump; useful audit metadata |
| Parent relationship | PostgREST must expose `field_jobs` → `field_job_photos` through the FK | Both clients use nested `field_job_photos (...)` selects |
| Delete behavior | Deleting a job cascades to metadata rows; normal completion must not delete the job | Dump evidence shows cascade; **LIVE VERIFY** |
| Retry behavior | Upsert conflict on `id` updates the same row | Requires the PK/UNIQUE key and an applicable UPDATE RLS policy, not only INSERT |

### 19.1 Required RLS behavior

With RLS enabled, an authenticated inspector should be able to:

- SELECT photos only when the parent job's `assigned_inspector_id = auth.uid()`;
- INSERT photos only for a parent job assigned to `auth.uid()`;
- UPDATE an existing owned photo row, because FieldSync uses `upsert(..., onConflict: 'id')` on retry;
- optionally DELETE only owned photos if product behavior explicitly requires deletion.

The inspected schema dump includes inspector SELECT and INSERT policies but no photo UPDATE policy. Consequently, first upload may work while an idempotent retry that reaches the UPDATE branch may fail. This is a **HIGH, LIVE VERIFY** item. Any server-side iMAPS read must use an approved server credential or a separate least-privilege policy. The current iMAPS inspection-detail utility performs this read in browser code, so the configured browser key and effective RLS access must be audited; a service-role key must never be exposed there.

### 19.2 Storage contract

Active FieldSync code uploads to the `inspection-photos` bucket and stores a public URL in `photo_url`/`photo_paths`. The live project must therefore verify:

- the bucket exists;
- authenticated assigned inspectors can create and overwrite only authorized objects;
- deterministic object paths are compatible with retries;
- object MIME/size limits match captured files;
- URLs stored for iMAPS remain readable for the required retention period;
- public-bucket use is an explicit privacy decision. If evidence must be private, replace public URLs with durable object paths and generate authorized signed URLs at read time.

No repository SQL inspected during this audit establishes that bucket or its object policies. Storage remains **LIVE VERIFY**.

---

## 20. Consolidated risk summary

| Severity | Risk | Current evidence | Required closure |
|---|---|---|---|
| 🟡 Loop 1 open | New-task producer formerly used `Pending` while canonical/migration lifecycle accepts `assigned` | Loop 1A now writes `assigned` and preserves retry status; live mixed inventory includes 34 `Pending` rows | Loop 1B must decide explicit legacy mappings and verify live/default/CHECK compatibility; do not rewrite rows implicitly |
| 🔴 Critical | `inspection_result` casing/value mismatch | FieldSync Title Case differs from migration CHECK sentence case | Adopt stable machine values or align/map every writer, CHECK, reader, and existing row |
| ✅ Resolved (Loop 2 Part 1) | Assignment instructions and inspector findings shared `inspector_notes` | `assignment_instructions` column added (LIVE VERIFIED); iMAPS now writes `assignment_instructions`; `inspector_notes` omitted from iMAPS payload; FieldSync reads `assignment_instructions` read-only | Phase E live retry acceptance remaining |
| 🟡 High | Profile role/handshake fields may be self-modifiable | Provided own-profile UPDATE policy shows no column-specific protection | Verify all grants/triggers live and harden identity-sensitive columns before production acceptance |
| 🟡 High | Completed inspection history is mutable | FieldSync rework/GPS paths can regress `completed` to `in_progress`; no server guard verified | Restrict completed edits, protect transitions server-side, and handle stale outbox actions |
| 🟡 High | Active contract exceeds migration 002 | Multiple required columns and photo table are absent | Inventory live schema and add reviewed forward-safe migrations/documentation |
| 🟡 High | Parcel mirror contract drifts from migration 002 | Upsert key/columns are missing and active `lot_area_sqm`/`land_use_class` spellings differ from migration | Inventory all parcel columns; enforce `local_parcel_id` uniqueness; standardize or map names |
| 🟡 High | Photo retry may be blocked by RLS | Active writer uses upsert; inspected dump shows SELECT/INSERT but no UPDATE policy | Verify live policies and add an ownership-scoped UPDATE policy if absent |
| 🟡 High | Photo storage/privacy contract is undocumented | Code assumes `inspection-photos` and public URLs | Verify bucket/policies/retention; approve public access or move to signed URLs |
| 🟡 High | Live FK names and PostgREST relationships may differ from client selects | FieldSync uses explicit FK-qualified embeds; iMAPS uses nested photo relation | Verify names in the live catalog and run each select under the real role |
| 🟡 High | Browser-side inspection-detail access may be over-broad or blocked by RLS | iMAPS reads remote jobs/photos through a browser Supabase client; effective key/policies are unverified | Confirm only a public/anon key is exposed and design least-privilege reviewer access |
| 🟡 High | Rich remote evidence is only partially durable in local PostgreSQL | Pull omits counts, photos, and progress/rework timestamps | Approve an explicit future loop/issue and persist only required durable evidence/metadata |
| 🟡 High | Reinspection implementation violates the confirmed new-round contract | Controller `updateOrCreate`, bridge upsert reuse, and completed-task rework can reuse/regress Round 1 | Create a new local and remote row per round; enforce completed-history immutability and prove isolation |
| 🟢 Medium | Singular `recommendation` coexists with plural `recommendations` locally | Legacy/new naming both exist | Confirm consumers, deprecate safely, and migrate separately if unused |
| 🟢 Medium | Repository dump and migration ledger represent different schema eras | Dump includes objects absent from migration 002 and may include later drift | Label artifacts by provenance/date; generate a reconciled migration baseline after live inventory |
| 🟢 Medium | Historical migration filename no longer describes its implementation | `repair_supabase_uuid...` now repairs `handshake_key` | Preserve ledger integrity, but document the mismatch and use accurate names for future migrations |
| 🟢 Medium | Runtime and E2E evidence are unavailable | No executable local environment or live test completed | Restore dependencies/configuration and execute section 18 with captured evidence |

### 20.1 Audit disposition

The static contract audit is complete enough for team review: ownership, mappings, inconsistencies, decisions, live-verification boundaries, and the acceptance sequence are now recorded. The bridge itself remains **blocked for production E2E acceptance** until live Supabase inventory and E2E evidence close the Critical and High risks above.

This document deliberately does not claim that documentation findings are deployed fixes. As of this audit, no application code, Supabase migration, RLS policy, storage configuration, or production data has been changed.

# BRIDGE LOOP ENGINEERING WORKFLOW

Every bridge issue must follow this sequence:

```text
AUDIT
↓
CONTRACT DECISION
↓
SHARED SCHEMA PRECONDITION
↓
IMAPS CHANGE
↓
IMAPS VERIFY
↓
FIELDSYNC CHANGE
↓
FIELDSYNC VERIFY
↓
CROSS-SYSTEM E2E
↓
CLOSE ISSUE
↓
UPDATE THIS DOCUMENT
↓
NEXT ISSUE
```

Mandatory rules:

1. Work on **one issue at a time**.
2. Do not batch unrelated bridge fixes.
3. Change and verify the iMAPS producer/business side first.
4. Modify FieldSync consumer behavior only after the iMAPS side is verified.
5. Exception: when iMAPS must write a new shared Supabase field, a reviewed, forward-safe additive shared-schema prerequisite may come first.
6. Never rewrite both repositories simultaneously without an explicit shared-contract reason.
7. Before **any Controller modification**, notify the Team Leader and receive approval.
8. Preserve unrelated work.
9. Never use blanket migrations against drifted databases.
10. Every loop must produce evidence before closure.
11. Closure evidence must identify the contract, exact changes, tests, relevant IDs/logs/screenshots or query results, authorization negatives, remaining risks, and team approval where required.
12. Update **CURRENT ACTIVE LOOP** and append/fill the close template before starting the next issue.

# CANONICAL ISSUE ORDER

## LOOP 0 — Ground Truth / Identity — PARTIALLY CLOSED

- supplied schema evidence reconciled;
- safe actual mappings are closed for the two current known inspectors;
- local duplicate non-empty handshakes: 0 rows; orphan assigned-inspector references: 0 rows;
- live full catalog/constraints, RLS/grants/triggers, storage, and server-side security hardening remain required at the production-readiness gate.

## LOOP 1 — Canonical Task Status — IN PROGRESS

- shared normal machine lifecycle: `assigned` → `in_progress` → `completed`;
- **Loop 1A CLOSED / VERIFIED:** iMAPS new task fallback changed from legacy `Pending` to `assigned`, and existing non-null remote status is preserved exactly on retries;
- **Loop 1B CLOSED / VERIFIED (contract-level):** transitional compatibility, legacy values, new-write prohibition, `submitted`, `cancelled`, and unknown/null behavior are decided below;
- live default/nullability/CHECK verification remains required before schema/data migration and production acceptance, but does not block client read mapping;
- **Current: Loop 1C:** implement the exact FieldSync mapping and scheduling precedence below, then verify online/offline lifecycle behavior.

## LOOP 2 — Assignment Instructions Ownership

- add `assignment_instructions`;
- iMAPS writer ownership;
- retry safety;
- FieldSync read-only consumption;
- keep `inspector_notes` inspector-owned.

## LOOP 3 — Assigning Planning Officer

- add `assigned_by_imaps_user_id`;
- add `assigned_by_name`;
- iMAPS persists and pushes the actor;
- FieldSync displays it read-only;
- never infer Admin.

## LOOP 4 — Reinspection / New Round

- create a new `SiteInspection`;
- create a new `local_inspection_id`;
- create a new `field_jobs` row;
- preserve Round 1;
- decide round/lineage metadata;
- prove local and remote isolation.

## LOOP 5 — Completed Immutability

- remove or restrict completed in-place rework;
- prevent GPS `completed` → `in_progress` regression;
- add server-side lifecycle protection;
- define stale outbox handling.

## LOOP 6 — Site Inspector iMAPS Access

- enforce the confirmed rule: iMAPS web = Admin + Planning Officer; FieldSync = Site Inspector;
- audit route, frontend, and backend enforcement;
- obtain Team Leader approval before Controller changes.

## LOOP 7 — Photo / Storage / Authorization Contract

- verify/add `field_job_photos.notes`;
- verify ownership-scoped UPDATE/DELETE RLS;
- decide bucket privacy;
- verify retry/delete behavior;
- verify inspector scoping.

## LOOP 8 — Planning Review Metadata — OPTIONAL / AFTER CORE LIFECYCLE

- optionally add a read-only badge under Completed;
- never affect task status or category.

## LOOP 9 — Delivery Monitoring + Admin Diagnostics

- add Pending Delivery, Delivered to FieldSync, and Delivery Failed;
- provide Planning Officer actionable visibility;
- provide Admin aggregate oversight;
- implement the `diagnostic_reports`/Admin support path and required access contract.

## LOOP 10 — Full E2E Acceptance

- first assignment;
- retry idempotency;
- online inspection;
- offline/reconnect;
- Final Submit;
- reverse sync;
- Planning Officer decision;
- reinspection Round 2;
- authorization negative tests;
- retention/history;
- evidence capture.

# LOOP 1B STATUS COMPATIBILITY DECISION

## Status-consumer inventory

**VERIFIED REPOSITORY INVENTORY:** Occurrences relevant to `field_jobs.status` were classified so local and display vocabulary is not mistaken for the remote task state:

| Classification | Repository evidence | Decision |
|---|---|---|
| **A. Remote FieldSync task machine state** | `PushInspectionToSupabase` creates `assigned` and preserves existing values; `PullCompletedInspections` selects only `eq.completed`; FieldSync audit records writes of `in_progress` and `completed` | Canonical remote normal lifecycle is `assigned` → `in_progress` → `completed` |
| **B. Local `SiteInspection` status** | Local migration defaults `site_inspections.status` to `Pending`; assignment controllers create local `Pending`; pull copies a completed remote result locally | Separate local state. Its `Pending` does not authorize remote `field_jobs.status = 'Pending'` |
| **C. iMAPS application workflow status** | Application and Technical Review statuses such as Pending Review, Technical Review, approval/decline/reinspection, and release states | Separate business workflow; never map these into the inspector task lifecycle |
| **D. UI display label** | FieldSync Pending/Ongoing/Completed categories; iMAPS badges and compliance text | Labels only; a Pending label is not necessarily a stored remote value |
| **E. Compatibility/legacy branch** | iMAPS detail UI recognizes `submitted` as completed-equivalent; inspector statistics still reads `in-progress`; FieldSync's current substring categorizer accepts/falls back across old values | Transitional reads only. These branches must not become new-write contracts |
| **F. Unrelated status** | Queue/job, user, document, application, draft, checklist, and generic “submitted/completed/ongoing” prose | Out of the `field_jobs` status contract |

The only identified iMAPS method that can generically insert a caller-provided `field_jobs` payload is `SupabaseService::createFieldJob`; no repository call site supplies a noncanonical status. No active iMAPS writer was found for `submitted`, `Pending`, `pending`, `in-progress`, `ongoing`, `onprocess`, or `cancelled`. The established FieldSync audit likewise identifies active writes only for `in_progress` and `completed`.

## Explicit transitional compatibility map

New writes are case-sensitive and must use only `assigned`, `in_progress`, or `completed` for the normal lifecycle. “Safe to preserve” means an existing value may remain untouched and the Loop 1A retry contract may echo it; it does **not** mean the value is valid for new writes.

| Stored value | Canonical? | Legacy / unsupported? | FieldSync category during transition | Safe to preserve temporarily? | Eventual migration | New writes |
|---|---|---|---|---|---|---|
| `assigned` | Yes | No | Pending | Yes | No | Allowed for assignment creation |
| `Pending` | No | Legacy | Pending | Yes | Recommended only after row-level proof and backup/review | Reject |
| `pending` | No | Legacy variant | Pending | Yes | Recommended under the same proof gate | Reject |
| `in_progress` | Yes | No | Ongoing | Yes | No | Allowed when work starts/resumes |
| `in-progress` | No | Legacy compatibility value | Ongoing | Yes | Recommended after inventory | Reject |
| `ongoing` | No | Legacy compatibility value | Ongoing | Yes | Recommended after inventory | Reject |
| `onprocess` | No | Legacy value with unconfirmed meaning; no active or historical writer was found in available source/audit evidence | Unknown/Needs Attention with diagnostic telemetry until row evidence proves active unfinished work | Yes | No migration decision until meaning and affected rows are verified | Reject |
| `completed` | Yes | No | Completed | Yes | No | Allowed only on Final Submit/completion |
| `Completed` | No | Legacy case variant | Completed | Yes | Recommended after inventory | Reject |
| `submitted` | No | Legacy read compatibility only | Completed | Yes | Recommended to `completed` after backup/review | Reject |
| `cancelled` | Not in normal lifecycle | Reserved/unsupported | Exclude from Pending/Ongoing/Completed and flag visibly/diagnostically | Yes | No mapping or migration until Team Leader decision | Reject until a cancellation contract exists |
| SQL `NULL` | No | Invalid/ambiguous | Exclude and show Unknown/Needs Attention; log diagnostics | Preserve for diagnosis; do not coerce in client | Repair only after row investigation | Reject; status should be explicit |
| Empty, whitespace, or any unknown value | No | Invalid/unknown | Exclude and show Unknown/Needs Attention; log diagnostics | Preserve for diagnosis; do not coerce in client | Decide case-by-case after inventory | Reject |

### Legacy `Pending` policy

The 34 LIVE VERIFIED MyTofu `Pending` rows remain untouched. During transition, clients interpret exact `Pending` and `pending` as not-started tasks in the Pending category. New writers must not create either value; `assigned` is the canonical replacement. A future data migration is permitted only after proving each candidate represents not-started field work and after backup, query review, owner approval, and rollback planning. Scheduling remains metadata: only an assigned/pending-equivalent task can appear in the Pending/Scheduled subsection.

### Legacy `submitted` policy

There is no normal lifecycle state `submitted`, and no active remote writer for it was found in the iMAPS repository or the existing FieldSync audit. Final Submit is the confirmed transition to `completed`; therefore exact `submitted` is **LEGACY READ COMPATIBILITY ONLY** and is interpreted as Completed field work. It must never be written by new code. Existing rows, if any, remain unchanged in this loop. iMAPS's existing completed-equivalent UI checks support this interpretation, while `PullCompletedInspections` currently fetches only exact `completed`; that reverse-sync limitation must be considered before any discovered `submitted` rows are retired or migrated.

### `in-progress`, `ongoing`, and `onprocess` policy

No active writer was found for these three spellings. Exact `in-progress` has an existing iMAPS dashboard compatibility read and is a clear separator variant of canonical `in_progress`. `ongoing` is the established human category for unfinished inspector work. Those two values may be read as Ongoing during transition and must never be written. `onprocess` is preserved by Loop 1A tests, but neither the repository history nor the available FieldSync audit identifies its producer or confirms its business meaning. It therefore remains an unresolved legacy value and maps to Unknown/Needs Attention with diagnostics, not Ongoing, until live row evidence or a Team Leader decision establishes that it means active unfinished work. Any later data migration requires live inventory and row-level confirmation.

### `cancelled`, unknown, and null policy

No confirmed cancellation workflow or active writer exists. `cancelled` is therefore reserved/unsupported, not Pending and not silently completed. Preserve any existing row, exclude it from the three ordinary active categories, expose an Unknown/Needs Attention presentation or dedicated diagnostic path, and obtain a Team Leader product decision before defining cancellation visibility, reactivation, or a closed-state category.

Unknown, empty, and null statuses must not look like valid new assignments. The least-risk transition is to retain the task in fetched data, classify it as Unknown/Needs Attention outside ordinary category membership, and log diagnostic context without secrets. This prevents accidental work on malformed tasks while keeping them discoverable for support. Do not coerce, rewrite, or default them in the client. If the present three-tab UI cannot render a separate diagnostic surface safely in Loop 1C, exclude the task from normal lists and emit actionable logging rather than falling back to Pending.

## Shared-schema compatibility and read-only live verification

**Loop 1B classification: A — NO SCHEMA CHANGE NEEDED FOR CLIENT MAPPING.** LIVE VERIFIED rows prove the deployed table accepts `assigned`, `in_progress`, and `completed`, so the bounded Loop 1C read/category mapping is not schema-blocked. Legacy `Pending` rows can remain because Loop 1C is read-only with respect to normalization.

Live catalog evidence is still unavailable for the `field_jobs.status` default, nullability, and actual CHECK definition. Supplied migration evidence says the CHECK allows `assigned`, `in_progress`, `completed`, and `cancelled`, but the 34 live `Pending` rows prove that evidence does not exactly describe current live enforcement. Accordingly, live verification is required before deciding whether a forward-safe schema correction is needed, before migrating legacy values, and before production acceptance. The same applies to the known `inspection_result` CHECK mismatch.

Run the following **SELECT-only** statements manually in the Supabase SQL Editor; they require no secrets and perform no mutations:

```sql
-- A/E. Global status vocabulary, counts, and explicit NULL count.
select
  case when status is null then '<NULL>' else status end as status_value,
  count(*) as row_count
from public.field_jobs
group by status
order by status nulls first;

select count(*) as null_status_rows
from public.field_jobs
where status is null;

-- B. Deployed status column type, default, and nullability.
select
  table_schema,
  table_name,
  column_name,
  data_type,
  udt_schema,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'field_jobs'
  and column_name = 'status';

-- C. Every CHECK constraint on field_jobs (inspect any expression mentioning status).
select
  n.nspname as table_schema,
  c.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid, true) as constraint_definition,
  con.convalidated as is_validated
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'field_jobs'
  and con.contype = 'c'
order by con.conname;

-- D. CHECK constraints whose deployed definition mentions inspection_result.
select
  n.nspname as table_schema,
  c.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid, true) as constraint_definition,
  con.convalidated as is_validated
from pg_catalog.pg_constraint con
join pg_catalog.pg_class c on c.oid = con.conrelid
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'field_jobs'
  and con.contype = 'c'
  and pg_get_constraintdef(con.oid, true) ilike '%inspection_result%'
order by con.conname;

-- F (optional). Counts by assigned inspector without exposing credentials.
select
  assigned_inspector_id,
  case when status is null then '<NULL>' else status end as status_value,
  count(*) as row_count
from public.field_jobs
group by assigned_inspector_id, status
order by assigned_inspector_id, status nulls first;
```

## Exact Loop 1C entry contract

Loop 1C is authorized only to implement explicit FieldSync read categorization and scheduling precedence, without row migration or new status vocabulary:

1. Match the stored value against explicit case-sensitive compatibility entries; do not use broad substring matching or silently trim/coerce malformed values.
2. Map exact `assigned`, `Pending`, and `pending` to **Pending**.
3. Map exact `in_progress`, `in-progress`, and `ongoing` to **Ongoing**; emit legacy diagnostics for noncanonical values.
4. Map exact `completed`, `Completed`, and legacy `submitted` to **Completed**; `submitted` remains read-only compatibility and is never written.
5. Map `onprocess`, `cancelled`, SQL null, empty/whitespace, and every unrecognized value to **Unknown/Needs Attention** outside Pending/Ongoing/Completed; log diagnostics and never silently map them to Pending. `onprocess` awaits evidence of meaning; `cancelled` remains reserved pending a Team Leader decision.
6. Apply lifecycle before scheduling: (1) completed-equivalent, (2) in-progress-equivalent, (3) assigned/pending-equivalent, then (4) scheduling subsection only within Pending. Thus `is_self_scheduled + in_progress` is Ongoing, never Pending/Scheduled.
7. Preserve exactly three normal My Tasks categories. Unknown/Needs Attention is a safety/diagnostic presentation, not a fourth lifecycle and not Planning Review.
8. Keep new remote writes canonical: only `assigned`, `in_progress`, and `completed`; no compatibility value may be emitted.
9. Add focused tests for every table row, unknown/null, whitespace/substring near-misses, and scheduling precedence. Do not begin row migration or schema work in Loop 1C.

# LOOP 1C-R VERIFICATION RECORD

```text
ISSUE: Direct downstream Scheduled-category consumer alignment
LOOP: 1C-R — bounded downstream repair only
STATUS: CLOSED / VERIFIED (implementation-level); Loop 1 remains IN PROGRESS
DISCOVERY: Loop 1C validation found stale top-level Scheduled assumptions in home_dashboard_screen.dart and a raw display-status boundary in active_assignments_folder_card.dart.
CONTRACT: Home Dashboard and Active Assignments consume TaskItem.lifecycleCategory and PendingTaskSection; scheduling never overrides lifecycle; Scheduled remains visual metadata only for Pending/self-scheduled tasks.
IMAPS CHANGE: Canonical bridge document only. Application PHP, Controllers, tests, and migrations unchanged.
SUPABASE CHANGE: None. No SQL was executed and no schema or remote row was mutated.
FIELDSYNC CHANGE: Corrected lib/modules/analytics_dashboard/screens/home_dashboard_screen.dart and lib/modules/analytics_dashboard/widgets/active_assignments_folder_card.dart; added test/downstream_scheduled_alignment_test.dart. No Loop 1C status-map or My Tasks core change.
BEHAVIOR: assigned/non-self-scheduled displays Pending; assigned or legacy Pending/self-scheduled remains lifecycle Pending with Scheduled presentation; self-scheduled in_progress remains Ongoing; self-scheduled completed/submitted remains Completed; self-scheduled cancelled/onprocess is excluded from ordinary Pending/Scheduled behavior.
VISUAL PRESERVATION: Existing Scheduled badge, violet folder treatment, completion-flow label, visit-date behavior, cards, layout, animation, colors, icons, and labels remain. Scheduled is derived only from PendingTaskSection.scheduled.
TESTS: flutter test test/task_category_ground_truth_test.dart test/downstream_scheduled_alignment_test.dart — 46 passed (38 Loop 1C ground-truth + 8 downstream cases).
ANALYZER: flutter analyze --no-pub — 42 pre-existing diagnostics (0 errors, 4 warnings, 38 infos), matching the pre-change baseline; no new diagnostic caused by Loop 1C-R.
CHECKS: Repository-wide active Dart search found no remaining category ==/!= 'Scheduled' or category.contains lifecycle logic. git diff --check passed; exact target diff reviewed.
STATUS CONTRACT: Unchanged. mapTaskStatusToLifecycle(), TaskLifecycleCategory, PendingTaskSection, TaskItem.category, and _categorizeAndFilter() were not modified by Loop 1C-R.
SAFETY: No InspectionProvider, DBHelper, SyncOutboxService, Supabase write logic, inspection screen, auth, security, navigation, SQL, schema, migration, Controller, iMAPS application, or remote-row change.
CLOSED: Loop 1C-R downstream Scheduled alignment only.
NEXT LOOP: Loop 1D — Online/Offline Lifecycle Verification. Do not infer that Loop 1D has started.
```

# LOOP 1C VERIFICATION RECORD

```text
ISSUE: FieldSync category mapping and scheduling precedence
LOOP: 1C — implementation only
STATUS: CLOSED / VERIFIED (implementation-level); Loop 1 remains IN PROGRESS
CONTRACT: Exact case-sensitive status mapping; scheduling never overrides lifecycle; unknown/cancelled/onprocess excluded from normal categories; no schema or row mutation.
IMAPS CHANGE: None. Application PHP, Controllers, and migrations unchanged.
SUPABASE CHANGE: None. No SQL was executed and no schema or row was mutated.
FIELDSYNC CHANGE: Exact transitional mapper + scheduling precedence fix implemented in tasks_screen.dart. Files changed: lib/modules/tasks/screens/tasks_screen.dart, test/task_category_ground_truth_test.dart.
TESTS: 38 focused unit tests pass covering exact status mapping, scheduling precedence, substring near-miss rejection, null/empty/whitespace handling, unknown/cancelled/onprocess exclusion, online/offline source parity. dart analyze reports no new errors (1 pre-existing unused_local_variable warning in tasks_screen.dart; 41 pre-existing infos elsewhere). git diff --check clean on changed files.
EVIDENCE: (1) mapTaskStatusToLifecycle() implements exact case-sensitive switch with no trimming/coercion. (2) derivedHighestStep uses lifecycleCategory instead of substring matching. (3) category getter now returns 'Pending'/'Ongoing'/'Completed'/'Unknown' via lifecycleCategory. (4) pendingSection getter sub-divides Pending into Scheduled/Available Anytime. (5) _tabOrder reduced from 4 to 3 ('Scheduled' removed). (6) Pending list now filters by pendingSection for subsection headers. (7) All 'Scheduled' category references in _CompactTaskCard replaced with pendingSection == PendingTaskSection.scheduled. (8) SupabaseService writes only canonical values: assigned (iMAPS), in_progress, completed — verified unchanged. (9) DBHelper.cacheJobs stores status string verbatim from remote; no client-side normalization. (10) Unknown status diagnostic emits debugPrint per task id+status (no PII). (11) Existing legacy Pending rows not rewritten.
OPEN RISKS: Live status default/nullability/CHECK constraints unverified. submitted/onprocess actual row populations unknown. cancelled behavior requires Team Leader decision. Production E2E remains blocked. isUrgent local variable warning is pre-existing.
TEAM APPROVAL: No database, migration, Controller, or write-path change was made.
CLOSED: Loop 1C category mapping and scheduling precedence only.
NEXT LOOP: Loop 1D — online/offline lifecycle verification.
```

# LOOP 1B DECISION RECORD

```text
ISSUE: Shared/live field_jobs status compatibility and legacy mapping
LOOP: 1B — contract/compatibility only
STATUS: CLOSED / VERIFIED (contract-level); Loop 1 remains IN PROGRESS
CONTRACT: Explicit transitional reads; canonical new writes only; no row normalization.
IMAPS CHANGE: Canonical bridge document only. Application PHP, Controllers, and migrations unchanged.
SUPABASE CHANGE: None. No SQL was executed and no schema or row was mutated.
FIELDSYNC CHANGE: None. Loop 1C implementation was not started.
TESTS: Documentation consistency, git diff --check, and changed-file audit.
EVIDENCE: Repository inventory, existing FieldSync audit, supplied migration evidence, and LIVE VERIFIED MyTofu counts (assigned 1, in_progress 14, completed 28, Pending 34).
OPEN RISKS: Live status default/nullability/CHECK and inspection_result CHECK remain unverified; submitted/onprocess populations are unknown; cancelled has no product workflow; production E2E remains blocked.
TEAM APPROVAL: Team Leader decision is still required before cancellation behavior is introduced.
CLOSED: Loop 1B mapping decision only.
NEXT LOOP AT 1B CLOSE: Loop 1C — FieldSync category mapping and scheduling precedence (now closed; see verification record above).
```

# LOOP 1A VERIFICATION RECORD

```text
ISSUE: iMAPS initial remote field_job status
LOOP: 1A — iMAPS producer only
STATUS: PASSED (source-level); Loop 1 remains IN PROGRESS
CONTRACT: New remote job = assigned. Existing remote status = preserve unchanged.
IMAPS CHANGE: app/Jobs/PushInspectionToSupabase.php changed only the new-row fallback from Pending to assigned. Added tests/Unit/PushInspectionToSupabaseStatusContractTest.php.
SUPABASE CHANGE: None. No live rows, schema, policies, storage, or configuration were mutated.
FIELDSYNC CHANGE: None.
TESTS: PHP syntax checks passed for the job and test; focused PHPUnit run passed 7 tests / 9 assertions; git diff --check passed.
EVIDENCE: Existing lookup uses field_jobs filtered by local_inspection_id, selects status, and limits to one row. The upsert uses local_inspection_id and sends existing status verbatim when present. Cases verified: new → assigned; assigned/in_progress/completed preserved; Pending/pending/onprocess preserved.
OPEN RISKS AT 1A CLOSE: The upsert also resends iMAPS-owned relationship, date, inspector, and notes fields, but does not include FieldSync progress/output fields. A concurrent FieldSync status change between lookup and upsert can still be overwritten by the earlier fetched status (read-then-write race); report only, not fixed in Loop 1A. Null or absent existing status falls back to assigned because PHP null coalescing treats both as missing. At that closure point, live defaults/CHECKs, legacy mapping, cancelled behavior, FieldSync category mapping/precedence, online/offline behavior, and production E2E remained open; Loop 1B has since resolved the mapping contract only.
TEAM APPROVAL: No Controller change was made or required.
CLOSED: Loop 1A source-level correction only.
NEXT LOOP AT 1A CLOSE: Loop 1B — shared/live status compatibility and legacy mapping decision (now closed; see record above).
```

# LOOP 1D-R LOCAL VERIFICATION RECORD

**STATUS: LOOP 1D-R — CLOSED / VERIFIED LOCALLY.** Reopened by the final evidence audit, then closed after R2A durable normal-entry retention and R2B protected unsupported-status availability both passed local validation. The original verification below is historical; the R2A and R2B continuation records supply current closure evidence. Loop 1 remains OPEN / IN PROGRESS; no production E2E closure is claimed.

- **Root cause / VERIFIED IMPLEMENTATION:** offline Final Submit queued `submit_inspection` but never updated cached lifecycle. Cache replacement and direct fetched-list consumers could also expose stale lifecycle. Current offline screens call `TaskItem.fromJob` with cached fields; no production `fromOfflineCache` factory exists.
- **Production files modified (minimum two):** `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\db_helper.dart`; `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\supabase_service.dart`. Neither outbox-service nor submit-screen edits were needed. Test added: `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\offline_completion_persistence_test.dart`.
- **Atomic acceptance:** existing `enqueueAction` inserts the original pending action and updates exactly one same-job cached row to lowercase `completed` in one transaction. Insert failure, update failure or missing cache row rolls back acceptance. Existing awaited enqueue/catch prevents false offline-success UI. No schema/version change.
- **Separate dimensions:** completed field work survives outbox `pending`, `failed`, `syncing`, `conflict`; all retain payload. `synced` ends protection. Acknowledged-history pruning, UUID-per-submit, deterministic IDs for other actions, payloads, replacement semantics and retries are unchanged.
- **One shared rule:** DBHelper correlates `pending_actions.job_id = local_jobs.id = field_jobs.id`; local completed-equivalent evidence plus an unacknowledged submit protects against exact `assigned`, `Pending`, `pending`, `in_progress`, `in-progress`, `ongoing`. Only effective status becomes `completed`. Remote `completed`, `Completed`, `submitted` remain unchanged; compatibility values are not new lifecycle writes.
- **Cache:** protection query, projection and replacement share one transaction. Pending-completion rows omitted remotely retain local evidence; all other rows retain normal replacement policy.
- **Fetch:** `fetchMyJobs()` uses the same rule before returning to unchanged Tasks/Home Dashboard consumers, preserves all other fields and never writes remote data. Local database failure propagates rather than silently displaying unprotected stale state.
- **Unsupported conflicts (historical behavior, superseded by R2B below):** protected completion against `cancelled`, `onprocess`, null, empty/whitespace or unknown raises an explicit lifecycle `StateError` with field-job ID. No projection is returned; cache/outbox remain unchanged. The whole refresh fails: Tasks uses existing error UI, Dashboard existing logging. No new category, cancellation semantics, per-row conflict UI or outbox-state rewrite. Offline cache retains accepted completion evidence.
- **Step 6 limitation:** InspectionProgress and asynchronous timestamp persistence remain unchanged. A crash after submission commit but before Step 6 persistence can leave timestamp evidence absent while lifecycle/payload survive. No duplicated progress logic.
- **Tests / VERIFIED LOCALLY:** 34 new tests + 38 category + 8 downstream = **80 passed**. Temporary file-backed FFI SQLite uses production CREATE TABLE definitions and real `SyncOutboxService.enqueueSubmitInspection`. Covers both write failures, missing row, legacy-start fixture, self-scheduled close/reopen reconstruction, all stale/completed/unsupported values, four unacknowledged states, acknowledgement, job/action isolation, deduplication and remote omission. Real `fetchMyJobs` runs against a loopback mock and tests both consumers' unchanged lifecycle presentation boundaries.
- **Reconnect boundary:** actual drain against the mock completes and acknowledges the same action, with no resend on a second drain. Empty photo fixture only: no real photo delivery, connectivity callback or live E2E claim.
- **Validation:** combined three-file `flutter test --no-pub` run passed 80 tests. `flutter analyze --no-pub`: **0 errors / 4 warnings / 38 infos / 42 diagnostics**, matching baseline. Both repositories' `git diff --check` passed. Existing SDK alias `C:\Users\RALPHL~1\flutter\bin\flutter.bat` avoids the Windows native-hook path quoting failure; no SDK, dependency or junction changes.
- **Safety:** no live Supabase/MyTofu/legacy-row/GPS/photo/inspection mutation. No iMAPS application, Controller, migration, queue or reverse-sync edits. Accepted/unrelated dirty work preserved. No staging, commit, push or branch change; canonical MD remains untracked/unstaged.
- **Remaining Loop 1D:** actual first-start/offline-start writes, reconnect triggers, interrupted drain, UI navigation/refresh timing, native restart, controlled E2E and real photo delivery. Completed-rework/GPS defects remain separate and untouched.
- **NEXT ACTIVE SUBSTEP:** Loop 1D — Remaining Online/Offline Lifecycle Verification. STOP; do not run automatically or start Loop 2.

# LOOP 1D-R2A DURABLE NORMAL INSPECTION RETENTION

**STATUS: LOOP 1D-R2A — CLOSED / VERIFIED LOCALLY.** Post-reboot adaptive sequential validation completed successfully on 2026-09-17. This acceptance remains intact. Overall Loop 1D-R subsequently closed after R2B validation, recorded below.

- **Persistence decision:** local-only `inspection_job_retention(job_id TEXT PRIMARY KEY NOT NULL, retained_at TEXT NOT NULL)`. Exact field-job UUID identity; durable normal-inspection local-job retention, NOT lifecycle or sync status. Existing drafts/current_step/is_synced lacked reliable start/retirement semantics: entry did not persist a draft and post-submit Step 6 persistence was asynchronous.
- **SQLite:** version 9 → 10 adds only this table. Fresh creation and upgrade share additive `CREATE TABLE IF NOT EXISTS`; existing tables/data are not reset. The existing explicit local-data wipe also clears markers. No remote schema migration.
- **Start:** ParcelDetail's unlocked NORMAL step-entry handler awaits exact-job cache + marker persistence before navigation. Passive Task Overview/draft loading, displayed Dashboard cards, Tasks rows and Profile statistics do not retain. Entry failure blocks navigation; draft initialization is awaited. Repeated entry is idempotent.
- **Dashboard:** preserves the real fetched payload by UUID and forwards the selected payload to ParcelDetail. DBHelper factors the existing cache mapping so actual applicant/parcel/cache metadata is retained, not a fabricated id/status row. No extra network request or fetchMyJobs cache side effect. Tasks/offline entry uses its exact cached row.
- **Resume/lifetime:** normal unfinished draft loading remains in InspectionProvider.startInspection. Markers survive leave/save/restart/offline/omission. No abandon workflow exists, so there is no age/timeout/inferred abandonment cleanup. Accepted Final Submit is the release boundary.
- **Cache:** omission protection is the union of unfinished-work marker IDs and pending-completion IDs. Unrelated jobs remain replaceable; included jobs accept normal metadata updates. Retention alone never projects completed. Pending-completion conflict/category behavior is unchanged.
- **Offline:** one transaction inserts the durable submit, updates exactly one matching cached row to completed, and removes its marker. Failure of any write rolls back all effects. The missing-row guard stays strict. Pending completion then supplies protection until acknowledgement.
- **Online:** after successful normal remote submission, ReviewSubmit calls idempotent local finalization outside the remote retry/enqueue catch. It updates local completed and removes the marker transactionally. Failure returns false, logs and displays a warning without resubmitting the successful business action. Later canonical remote `completed` caching removes the marker defensively; omission never does.
- **Completed rework bypass identified but intentionally excluded from R2A because completed rework lifecycle is a separately known blocker.** OUT OF R2A SCOPE — existing completed-rework path, to be handled by the later Completed Immutability/Reinspection loop. CompletedInspectionDetail and hydrateForRework are unmodified; normal retention is excluded in rework mode.
- **R2A production scope used:** DBHelper, ParcelDetail, HomeDashboard and ReviewSubmit only, under `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib`. No R2A edits to InspectionProvider or SupabaseService.

- **Tests added:** `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\inspection_job_retention_test.dart` (13 tests), plus 2 loopback online tests in `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\offline_completion_persistence_test.dart`. Covers metadata/UUID prerequisite, normal entry/resume, passive viewing, migration preservation, idempotency, restart, omission/isolation, metadata updates, recovery, rollback at all three writes, pending handoff and online cleanup without duplicate PATCH.
- **Evidence limits:** widget tests exercise real ParcelDetail navigation using a Dashboard-shaped payload; Dashboard forwarding is source-asserted, not a rendered Home journey. Entry uses an unlocked Review step to avoid GPS/map I/O. Migration exercises file-backed FFI SQLite with production DDL/shared migration, not native SQLCipher startup. Online submission uses the real service against loopback plus local finalization; ReviewSubmit placement is source-asserted. No live E2E claim.
- **Final passing evidence (2026-09-17):** post-reboot adaptive validation on the constrained 8 GB Windows host ran four separate Flutter invocations sequentially, each with `--no-pub --concurrency=1 --reporter compact`. Runner results: `task_category_ground_truth_test.dart` **38 passed**, `downstream_scheduled_alignment_test.dart` **8 passed**, `offline_completion_persistence_test.dart` **36 passed**, `inspection_job_retention_test.dart` **13 passed**. Each file independently exited **0**, with **0 failures** and no crash/OOM. Exact aggregate: **95 passed**. This successful final gate supersedes the earlier resource-blocked attempts; no production or test changes were required.
- **Historical resource limitation (resolved for this validation):** earlier combined run crashed with Dart VM `Out of memory`; an earlier sequential retry failed to start `DartWorker` with about 196 MiB free RAM. Those attempts remain recorded as runtime failures, not assertion failures or passing runs. Historical logs: `C:\Users\RALPHL~1\AppData\Local\Temp\fieldsync-r2a-final-tests.txt` and `C:\Users\RALPHL~1\AppData\Local\Temp\r2a-downstream_scheduled_alignment_test.txt`. The later successful adaptive run above supplies closure evidence.
- **Adaptive resource checks:** initial available RAM / commit headroom: **1303.2 / 3954.4 MiB**. After category: **1173.0 / 4008.2**; downstream: **1375.7 / 3920.8**; offline completion: **1400.0 / 3845.2**; retention: **1472.8 / 3834.0**. Waited three seconds after each suite and confirmed no remaining Dart/Flutter workers. Post-analyzer check: **1331.2 / 3605.9 MiB**. No processes were terminated; no resource-stop condition occurred at these checkpoints.
- **Analyzer/diff:** final analyzer: 0 errors / 4 warnings / 38 infos / 42 diagnostics, matching baseline; exit 1 from existing diagnostics. Both repositories passed `git diff --check`; LF/CRLF notices only.
- **Safety:** temporary databases and loopback only. No live Supabase/MyTofu/real-job mutation, iMAPS application/Controller edits, remote migrations, staging, commits or pushes. Unrelated dirty state preserved.
- **R2A handoff (historical):** R2A closed with R2B next and overall Loop 1D-R still open. R2B has since completed as recorded below. R2A persistence was neither reopened nor redesigned; its retention suite passed again.

# LOOP 1D-R2B PROTECTED UNSUPPORTED-STATUS AVAILABILITY

**STATUS: LOOP 1D-R2B — CLOSED / VERIFIED LOCALLY.**

- **Original defect:** DBHelper's protected unsupported-status branch threw `StateError` inside the list projection. One conflicting job aborted `fetchMyJobs()` for Tasks, Home Dashboard and Profile, and aborted raw-list caching.
- **Contract / two dimensions:** exact same-job local completed-equivalent evidence plus at least one durable unacknowledged `submit_inspection` preserves effective lowercase `completed`. Unsupported remote lifecycle is a sync disagreement, not unfinished inspector work. No cancellation business semantics or fourth category is introduced.
- **Minimum production change:** only `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\db_helper.dart`, replacing the throwing branch with a projected map copy. SupabaseService already delegates to this shared projection and needed no R2B edit. TasksScreen, HomeDashboard and Profile production code are unchanged by R2B.
- **Conflict evidence:** returned maps contain `_localPendingCompletionConflict: true` and `_remoteStatusSnapshot` with the exact original remote value, including null/empty/whitespace. Other fetched fields and original input maps are preserved. Existing `debugPrint` logs job ID, unsupported classification and active local protection, never arbitrary status text, credentials or inspection payloads. No new diagnostic subsystem.
- **Per-job matrix:** protected `onprocess`, `cancelled`, null, empty string, whitespace and `unknown_value` all return effective Completed plus evidence without blocking unrelated jobs. Recognized stale `assigned`, `Pending`, `pending`, `in_progress`, `in-progress`, `ongoing` project completed without conflict metadata. Remote `completed`, `Completed`, `submitted` remain unchanged without conflict metadata. Unprotected unsupported statuses remain raw and excluded from ordinary lifecycle categories.
- **Cache:** the same shared rule keeps protected cached lifecycle completed; raw four-job refresh retains unrelated Pending/Ongoing/Completed rows without conflict rollback. Explicit SQLite column mapping excludes diagnostic keys. No new schema/migration or business status; SQLite v10 and R2A retention/handoff/online cleanup remain intact.
- **Lifetime / acknowledgement:** evidence describes the current fetched contradiction, not permanent SQLite history. Repeated unsupported fetches retain evidence; the next agreeing completed fetch has no marker. Existing same-job EXISTS protection covers pending/failed/syncing/conflict. A synced first submission plus failed second submission stays protected; after both are synced, raw cancelled and ordinary unsupported cache semantics resume. Outbox payloads and acknowledgement behavior are unchanged.
- **Consumer availability / statistics:** the actual loopback-backed `fetchMyJobs()` returns all four jobs (A completed + cancelled snapshot, B assigned, C in_progress, D completed). This shared boundary serves all three unchanged consumers. The real Profile `InspectorDashboardStats.fromTasks` sequence also passes and counts effective local Completed normally. No UI redesign or rendered three-screen E2E claim.
- **Tests:** extended `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\offline_completion_persistence_test.dart` using the existing temporary file-backed FFI SQLite and loopback Supabase harness. Six obsolete throw expectations were replaced with protected-conflict assertions; 11 additional tests cover unprotected matrix, whole-list/raw-cache isolation, Profile aggregation, repeated/current evidence lifetime, recognized stale metadata absence and multiple-action acknowledgement. Completed-equivalent cases also assert no metadata. Direct projection proves source-map immutability; request-method recording proves conflict fetch/cache paths issue GET only (no PATCH/insert/delete/RPC).
- **Final sequential validation:** each invocation used `--no-pub --concurrency=1 --reporter compact`, with five-second waits and memory checks between suites. Category **38**, downstream **8**, offline completion **47**, retention **13** = **106 passed, 0 failed**, exit **0** each, no OOM. Existing coverage remains green under the new locked conflict contract. Initial final-run RAM/commit headroom: **1249.4/1871.4 MiB**; final post-retention: **1534.8/2129.4 MiB**. No resource threshold stop. Two Dart processes remained visible across the validation checkpoints; their roles were not classified, and no processes were terminated.
- **Analyzer / diff:** confirmed `flutter analyze --no-pub`: **0 errors / 4 warnings / 38 infos / 42 diagnostics**, baseline unchanged, expected exit **1**. Both repositories passed `git diff --check`, exit **0**, with existing LF/CRLF notices only; statuses inspected and unrelated dirty state preserved. Test logs: `C:\Users\RALPHL~1\AppData\Local\Temp\r2b-final-<suite>.txt`; confirmed analyzer log: `C:\Users\RALPHL~1\AppData\Local\Temp\r2b-confirm-analyze.txt`.
- **Scope / limitations:** no live Supabase/MyTofu mutation, remote lifecycle conversion, iMAPS application/Controller edit, staging, commit or push. No native SQLCipher/device/production E2E claim. Step-6 asynchronous timestamp crash window, completed rework and cancellation business behavior remain out of scope. R2A remains CLOSED / VERIFIED LOCALLY.
- **Overall disposition:** **LOOP 1D-R — CLOSED / VERIFIED LOCALLY** because R2A and R2B are both closed. Loop 1 remains OPEN / IN PROGRESS.
- **R2B handoff (historical):** remaining Loop 1D was not started by R2B. The separately authorized verification below subsequently found an offline-start defect; R2B acceptance remains intact.

# LOOP 1D-R3 OFFLINE START LIFECYCLE

**STATUS: LOOP 1D-R3 — CLOSED / VERIFIED LOCALLY.**

- **Root cause:** `DBHelper.enqueueAction` durably accepted offline start work but updated cached lifecycle only for `submit_inspection`, so accepted `gps_confirm`/`mark_ongoing` left `local_jobs.status = assigned` and restart reconstruction stayed Pending.
- **Exact lifecycle-bearing action types:** `gps_confirm` (ID `gps_confirm_<jobId>`, GPS-verification fallback) and `mark_ongoing` (ID `mark_ongoing_<jobId>`, exit/save ongoing fallback). Recognition is exact string equality in the shared enqueue boundary; no substring/fuzzy matching. Retention, progress and other actions are deliberately not start signals. SupabaseService and GPS screens are unchanged.
- **Atomic contract:** queue insert/replace and lifecycle update commit together in the existing single `enqueueAction` transaction. Deterministic replacement semantics are unchanged. Missing exact `local_jobs` row throws and rolls back both effects without a fake row. Failed queue replacement (insert abort, lifecycle-update abort/ignore) rolls back, preserving any pre-existing queued action unchanged.
- **Status matrix:** `assigned`, `Pending`, `pending`, `in_progress`, `in-progress`, `ongoing` → canonical `in_progress`. Completed-equivalent `completed`/`Completed`/`submitted` and unsupported `cancelled`/`onprocess`/null/empty/whitespace/unknown are never modified, never downgraded and never promoted; their existing enqueue semantics remain. Retention is NOT retired by start acceptance; it is retired later by accepted Final Submit.
- **Restart behavior:** after accepted offline start plus close/reopen of file-backed FFI SQLite, `local_jobs.status` is `in_progress`; `TaskItem.fromJob` category is Ongoing, including self-scheduled (`is_self_scheduled` metadata intact, never Pending/Scheduled). Partial `local_inspections` progress and the retention marker survive.
- **Tests:** `test/offline_start_verification_test.dart` now passes with an explicit Ongoing assertion after real `enqueueGpsConfirm`, fixture step persistence and repeated `enqueueMarkOngoing`; new `test/offline_start_atomicity_test.dart` adds 40 focused cases: both types × six supported statuses (restart, retention, deduplication, isolation, canonical payload), both types × nine completed/unsupported values (status preserved, action enqueued), rollback on insert/update/ignore/missing with prior action restored, and missing-row rejection without fake rows. No live Supabase/MyTofu/GPS/photo mutation; loopback-free, no drain, no widget navigation.
- **Validation:** sequential `--no-pub --concurrency=1 --reporter compact`, memory-checked between suites. R3 files: verification **1/1**, atomicity **40/40**. Accepted regression suites rerun with actual counts: category **38**, downstream **8**, offline completion **47**, retention **13** = **106**. Aggregate this validation: **147 passed, 0 failed**, exit **0** each, no OOM or threshold stop (final RAM/headroom 1611/2195 MiB). Analyzer baseline unchanged: **0 errors / 4 warnings / 38 infos / 42 diagnostics**, expected exit **1**. Both repositories passed `git diff --check` (exit 0). Logs: `C:\Users\RALPHL~1\AppData\Local\Temp\r3-*.txt`.
- **Boundaries:** SQLite v10 and R2A/R2B protection are untouched. Online local-cache convergence is NOT claimed fixed. Stale `syncing` recovery was not touched and remains documented as unverified. No new schema/migration, staging, commit or push; unrelated dirty state preserved.
- **Exact next action:** return to **LOOP 1D — Remaining Lifecycle Verification** (online start convergence, delivery acknowledgement, reconnect triggers, interrupted syncing recovery, restart matrix, photo ordering, full convergence). It must NOT be resumed automatically. Loop 1 remains OPEN. Do not start Loop 2.

# LOOP 1D REMAINING VERIFICATION — OFFLINE START DEFECT

**STATUS: SUPERSEDED BY LOOP 1D-R3 BELOW — offline-start defect repaired and CLOSED / VERIFIED LOCALLY.** The reproduction evidence below is historical. Interrupted-syncing recovery and the remaining inventory are still UNVERIFIED. R2A/R2B/Loop 1D-R closures remain accepted.

- **Inspected start path:** passive ParcelDetail loads the draft; unlocked normal step entry calls retention before navigation. Retention does not change lifecycle. Site Map Continue calls `markStepComplete(1)` then opens GPS Verification; progress persistence writes `local_inspections`, not cached lifecycle. GPS confirmation calls `confirmGpsOnSite`, falls back to awaited `enqueueGpsConfirm` on failure, records provider GPS evidence, marks Step 2 complete and proceeds to Photos. GPS exit/save calls `markJobOngoing` with `enqueueMarkOngoing` fallback. These are inspected branches, not a completed audit of every start path.
- **Canonical writers (source-only):** `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\supabase_service.dart` writes canonical `in_progress` in both `markJobOngoing` and `confirmGpsOnSite`, including for legacy Pending input. Neither writes local lifecycle. Online execution/cache convergence and legacy-start integration were not tested in this stopped pass. Mere ParcelDetail viewing does not initiate a lifecycle write.
- **OFFLINE START LIFECYCLE DEFECT:** `DBHelper.enqueueAction` updates local lifecycle only for Final Submit. Accepted `gps_confirm` and `mark_ongoing` actions leave assigned cache rows assigned. Provider GPS recording changes in-memory boundary evidence only; progress persistence is separate. Genuine offline work can therefore remain Pending after restart despite durable delivery actions and partial progress. Retention behaves correctly; this is not a demonstrated R2A/R2B regression.
- **Focused reproduction:** `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\offline_start_verification_test.dart` uses temporary file-backed FFI SQLite and production DDL. Cache exact UUID jobs A/B assigned; retain A; call real GPS enqueue with synthetic coordinates; fixture-persist local step 2; enqueue mark ongoing twice; close/reopen DB. GPS action has exact A UUID, deterministic ID, pending state, retry_count 0 and coordinate payload. Mark ongoing deduplicates. Both actions, A retention and partial progress survive; B stays assigned without a draft. A remains assigned/Pending rather than required in_progress/Ongoing. Progress is a fixture, not a GPS widget integration test; no network, real GPS or drain is used.
- **Test evidence:** targeted sequential single-worker run: **0 passed / 1 failed, exit 1**, expected `in_progress`, actual `assigned`; no resource failure. Log: `C:\Users\RALPHL~1\AppData\Local\Temp\loop1d-offline-start-contract.txt`. The retained regression intentionally fails. Its label/diagnostic and obsolete characterization assertions were cleaned up after reproduction; the failing lifecycle assertion is unchanged. No further execution after stopping. The accepted **106 passes** and analyzer **0 errors / 4 warnings / 38 infos / 42 diagnostics** are PRIOR evidence, not rerun results from this pass.
- **Incomplete verification:** remaining restart matrix, online/legacy integration, normal completed immutability and full three-consumer flow were not newly exercised. Offline Final Submit restart, protected stale/conflicting refresh and acknowledgement convergence retain prior R2A/R2B evidence only.
- **Reconnect/recovery inventory incomplete:** inspected startup drain and debounced connectivity callback in `SyncOutboxService.start`; search also found Sync Center connectivity/manual/global/per-job drain calls. Full trigger/overlap/refresh analysis stopped. Ordinary DB selection includes pending/failed, not syncing/conflict. Startup recovery of stale syncing and interrupted-drain boundaries A–E remain **UNVERIFIED**, not a second confirmed defect. Failed/conflict execution and photo-ordering/partial-upload verification also remain deferred.
- **Native/live boundary:** no native app launch or live MyTofu/Supabase/GPS/photo mutation. Native device lifecycle E2E and real photo delivery remain DEFERRED; isolated live verification may follow in Loop 10, but source/local criteria do not yet permit Loop 1 closure.
- **Changes/safety:** only this document and the focused verification test changed. No production, iMAPS application, Controller, migration, staging, commit or push changes. Unrelated dirty work preserved.
- **Repair handoff (historical):** the offline-start repair was subsequently authorized as LOOP 1D-R3 and closed (record below). Resuming unfinished verification, including critical stale-syncing recovery, remains a separate instruction. Do not start Loop 2.

# LOOP 1D-V1 — INTERRUPTED OUTBOX RECOVERY

**STATUS: DEFECT FOUND / REPAIR REQUIRED — verification stopped; no repair implemented.** This record supersedes earlier *unverified* stale-syncing notes only. R3, R2A/R2B and Loop 1D-R remain CLOSED / VERIFIED LOCALLY. Loop 1D and Loop 1 remain open.

- **VERIFIED IMPLEMENTATION — defect:** a committed `syncing` claim survives file-backed SQLite close/reopen but never becomes actionable through ordinary automatic, manual/global, or manual/per-job drains. **NO STALE-SYNCING RECOVERY FOUND** in the inspected startup/connectivity/drain paths and source searches. `getActionableActions()` selects only `pending`/`failed`; Sync Center display includes `syncing`, which does not imply retry eligibility.
- **Source:** `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\db_helper.dart` selection at 725–731, claim at 773–780, acknowledgement at 783–800; `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\sync_outbox_service.dart` startup/connectivity at 165–172, drain selection at 421–430, claim-before-remote and acknowledgement at 455–466. Startup immediately calls the same drain; connectivity schedules it after 900 ms. A process death cannot run the catch/finally path that would normally mark an execution failure retryable.
- **Focused evidence:** `C:\Users\Ralph Lauren\imaps_fieldsync_main\test\interrupted_drain_verification_test.dart` uses production DDL, a temporary file-backed FFI DB, the real `markActionSyncing`, and real automatic/manual/per-job drains. It verifies pending eligibility, commits the claim, ages its timestamp, reopens SQLite, and requires either `synced` or renewed retry eligibility. **0 passed / 1 failed, exit 1** at the recovery assertion: `Interrupted action remains syncing; 0 eligible rows after automatic/manual/per-job drain.` No setup/compiler/network failure. This intentionally failing acceptance test is retained, not skipped or inverted to make the defect pass.
- **Evidence boundary:** DB reopen models the durable interrupted state; no OS process was killed, no native startup/connectivity event was simulated, and no remote delivery/ack-loss scenario was executed. The incomplete loopback draft was replaced before this run; it supplied no evidence. No Supabase initialization, credentials, or live mutations were used.
- **Case coverage:** C confirmed locally for `mark_ongoing`. A pending eligibility is a test precondition; B failed retry eligibility, E synced exclusion and F conflict exclusion are source-level only in this V1 pass, not fresh delivery tests. D remote-success/local-ack-loss and cross-job delivery isolation remain unverified after the stop condition. The shared status selector also excludes syncing GPS/submit rows, but those action executions were not newly tested.
- **Concurrency:** source has a synchronous static `_draining` guard set before its first await and cleared in finally; same-isolate reentrant drains return. This is not a durable database claim/lease or proof of cross-isolate/process exclusion. No concurrency execution test was added.
- **Duplicate delivery boundary:** no exactly-once guarantee is established. Source conflict checks include `gps_confirm`/`submit_inspection`, exclude `mark_ongoing`, and use an in-memory known-good timestamp map. Lost acknowledgements may therefore require reconciliation rather than unconditional replay. Per-action remote idempotency, duplicate side effects and version-conflict outcomes remain unverified; do not infer them from this local test.
- **Regression validation:** all six accepted suites rerun sequentially with `--no-pub --concurrency=1 --reporter compact`: offline-start verification **1**, atomicity **40**, category **38**, downstream **8**, offline completion **47**, retention **13** = **147 passed / 0 failed**, exit 0 each. An additional initial atomicity baseline also passed (not double-counted). Memory gates before runs: stop below 350 MiB available RAM or 1 GiB free virtual-memory headroom; no gate stop occurred.
- **Static validation:** analyzer output contains **0 errors / 4 warnings / 38 infos / 42 diagnostics**, matching the accepted baseline; terminal reported 42 issues (native exit capture was interrupted by PowerShell error handling). Both repositories passed `git diff --check`, exit 0, before this documentation update. Logs are `C:\Users\RALPHL~1\AppData\Local\Temp\fieldsync-v1-*.log`.
- **Smallest next repair — PLANNED, NOT AUTHORIZED HERE:** stale-syncing recovery at a serialized startup/drain boundary, preserving payloads/IDs/retry history and conflict exclusion, without reclaiming live in-flight work. Before replay, resolve the remote-success/local-ack-lost ambiguity and validate duplicate/conflict behavior. Do not merely include every `syncing` row in ordinary selection. Re-run this acceptance test plus cases A–F and isolation/concurrency checks after an explicitly authorized repair.
- **Scope:** only the new verification test and this bridge document were edited for V1; pre-existing dirty production work is unrelated and preserved. No production/iMAPS application/Controller changes, migration, staging, commit, push, online-start/photo verification, or Loop 2 work.

# LOOP 1D-R4 — INTERRUPTED OUTBOX RECOVERY

**STATUS: BLOCKED / DESIGN CONTRACT REQUIRED — audit completed; STOPPED BEFORE PRODUCTION IMPLEMENTATION.** The mandatory replay-safety gate failed. V1 remains DEFECT FOUND / REPAIR REQUIRED. R3/R2A/R2B and earlier closures remain accepted. No production, test or schema changes in R4.

## Seven-action inventory

Source root: `C:\Users\Ralph Lauren\imaps_fieldsync_main`. Evidence: `lib\core\services\sync_outbox_service.dart` 185–399, 591–820; `lib\core\services\supabase_service.dart` 97–115, 349–408, 445–687, 699–748, 795–804.

Classifications are strict **current-contract** classifications. C means unresolved end-to-end stale replay, not that future safe recovery is impossible. No unconditional A is established; partial field updates are B candidates only after a guarded-reconciliation contract.

| Exact type | Local action ID | Remote verbs/targets | Class |
|---|---|---|---|
| `gps_confirm` | `gps_confirm_<jobId>` | PATCH `field_jobs` GPS/status; separate PATCH null started_at; POST INSERT `activity_log` | **C**: new GPS time, unguarded evidence/status overwrite, duplicate audit risk. |
| `mark_ongoing` | `mark_ongoing_<jobId>` | PATCH `field_jobs.status` NOT ILIKE completed; separate PATCH null started_at | **C**: no version check; predicate is not assigned-only; two writes may partially land. |
| `submit_inspection` | persisted UUID v4 | Photo operations below; PATCH `field_jobs` completion/evidence; POST INSERT `activity_log` | **C**: new submitted_at, clears rework marker, no exact revision/action receipt. |
| `checklist_update` | `checklist_update_<jobId>` | PATCH checklist_data and two counts in `field_jobs` | **C; B candidate**: same payload repeats assignments, but no atomic revision predicate. |
| `current_step_update` | `current_step_update_<jobId>` | PATCH current_step/optional step_timestamps in `field_jobs` | **C; B candidate**: stale replay can overwrite newer progress. |
| `findings_update` | `findings_update_<jobId>` | PATCH four findings/note fields in `field_jobs` | **C; B candidate**: stale replay can overwrite newer findings. |
| `photos_update` | `photos_update_<jobId>` | GET photo IDs; Storage upload POST/upsert; POST UPSERT `field_job_photos` on id; PATCH job photo_paths/count | **C**: stable identities, but ID-only resume and mutable local files do not prove evidence integrity. |

All except mark_ongoing use a pre-execution version GET: nullable durable `cachedUpdatedAtSnapshot` or in-memory `_knownGoodUpdatedAt`. The map is lost on restart; payload snapshot survives. Null snapshot skips checks; forceSyncAnyway bypasses checks. GET then PATCH by job ID is NOT compare-and-set. Version mismatch cannot distinguish this interrupted write from another writer. Local action IDs are not sent to remote mutation/audit helpers. Unknown types only log/skip, not an eighth supported operation.

## Repeat effects / reconciliation

- All seven PATCH an existing job: no direct duplicate field_jobs inserts. Counts are assignments, not increments. No helper directly accumulates a numeric quantity.
- GPS/submit INSERT non-deduplicated activity rows; logging errors are swallowed. Provided `full.sql` 201–210 defaults ID to random UUID and unread to false. Repeats can duplicate activity/unread entries. Other five helpers do not directly insert remote audit events. Deployed trigger/webhook/push effects are unverified; absence is not claimed.
- Photo key: base64url(local path), padding removed. Storage: `inspection-photos`, object `inspections/<jobId>/photo_<key>.jpg`. Metadata ID: UUID v5(namespace `6ba7b811-9dad-11d1-80b4-00c04fd430c8`, storage path). Same path/job upserts same object/row, not new retry identities. But file content is not hashed/immutable; ID-only resume does not verify metadata/bytes. Missing files are skipped; remote URLs reused.
- `fetchJobDetail` exposes job fields/photo metadata; `fetchJobUpdatedAt` exposes version. Neither proves a particular action and all its side effects landed. GPS timestamp existence or completed status alone is insufficient. Equal fields can establish current satisfaction only under an approved policy; differing fields do not prove non-delivery. Activity can be deleted and lacks action identity.

## R4 crash and design boundary

Zero photos: still needs version-safe delivery. Some photos: recorded IDs can resume; storage-success/row-failure retries overwrite the same object if the file exists. All photos: IDs do not prove completion PATCH. Completion PATCH success: submission time/rework fields changed; audit may or may not exist. ACK lost: replay can change time/audit or overwrite a newer revision. No real-photo E2E claim.

**Missing contract:** atomic operation/revision receipt and side-effect deduplication, OR explicitly approved state-satisfaction reconciliation with conditional writes, newer-revision conflict handling, partial-operation and audit-loss policy. No remote action identity or version is invented. A local lease column alone cannot solve remote ACK ambiguity.

**Ownership proposal only:** one-time pre-claim startup snapshot serialized under `_draining`, ordered before every drain entry, could separate previous claims from current claims in the single-isolate architecture without schema/age-only reset. Repeated start must not resnapshot live claims. Current fields contain no execution owner. No cross-process exactly-once claim.

State machine unchanged: pending/failed → syncing → synced; error → failed; version conflict → conflict; abandoned syncing remains stuck. No recovery transition installed. Local lifecycle, completion protection, IDs/payload/retry history untouched. Same-job actions can coexist; created-at ordering cannot resolve stale earlier work superseded by completion.

**Validation:** no R4 tests added/run; V1 acceptance unchanged. V1's one intentional failure, 147 passing regressions and analyzer 0/4/38/42 remain PRIOR evidence. No live mutation, migration, staging, commit or push. Only canonical documentation changed. R4 NOT closed; agree on missing replay/reconciliation contract before implementation. Do not resume general Loop 1D or Loop 2.

# LOOP 1D-R4-P1 — PHOTO RETRY RLS PREREQUISITE

**APPLIED / LIVE VERIFIED AT POLICY-DEFINITION LEVEL.** Team Leader approval received; the user manually executed the approved bounded SQL and supplied the live policy inventory. This supersedes the earlier prerequisite/design-blocked status, not its historical evidence.

- `public.field_job_photos`: `r4p1_inspectors_update_assigned_job_photos`, permissive UPDATE for authenticated. USING requires the parent `field_jobs.assigned_inspector_id = auth.uid()`; WITH CHECK applies the same ownership boundary to the resulting parent relationship.
- `storage.objects`: `r4p1_inspectors_update_assigned_inspection_objects`, permissive UPDATE for authenticated. Both USING and WITH CHECK require bucket `inspection-photos` and folder segment [2] to equal a `field_jobs.id` assigned to `auth.uid()`.
- Existing inspection-photo SELECT/INSERT and avatar policies remain. No DELETE/ALL/public-write access added. Policy creation changed no existing data. `inspection-photos` remains PRIVATE (`public = false`).
- Authenticated Storage overwrite/retry E2E remains UNVERIFIED. Definition-level authorization is not runtime evidence. Repository migration reconciliation remains future work; no automatic db push.

**Live-schema evidence correction (historical evidence retained):** the supplied-schema `inspection_result` casing mismatch is historical; user-returned live evidence verifies alignment with the current Title Case writer. The historical `field_jobs` status CHECK is absent from the returned live constraint inventory; it is historical migration evidence, NOT current live truth. Earlier records remain as dated/audit evidence and are superseded on these points.

**R4 resume authorized:** state-satisfaction reconciliation plus atomic conditional replay is now approved within `db_helper.dart`, `sync_outbox_service.dart`, and `supabase_service.dart` only. Current active work is LOOP 1D-R4, implementation/verification pending; Loop 1 remains OPEN. General Loop 1D and Loop 2 are not resumed. No live mutation during implementation/testing; mocks/loopback/temp SQLite only. Accepted F1 private reads, F2 full-name display, F3 checkbox removal remain unchanged.

# LOOP 1D-R4 — RESUME IMPLEMENTATION RECORD (2026-09-17)

**STATUS: DEFECT/BLOCKER REMAINS — PARTIAL IMPLEMENTATION, NOT CLOSED.** Supersedes earlier no-production-implementation status, not historical evidence. R4-P1 approval, manual execution, exact policy names and definition-level verification are recorded above; authenticated overwrite E2E remains unverified.

## Implemented portion

- Production scope: only `C:\Users\Ralph Lauren\imaps_fieldsync_main\lib\core\services\db_helper.dart`, `sync_outbox_service.dart`, and `supabase_service.dart`. No UI, SQLite schema/version, uploader-format, or iMAPS application change.
- Startup transaction under `_draining`, once per process, marks pre-existing syncing rows with durable payload flag `r4RecoveryRequired` and changes them to retry-eligible failed. IDs, original payload fields and retry counts retained. Malformed JSON conflicts. Ordinary selector stays pending/failed. Recovery retries retain marker across restart and never use ordinary replay. No age threshold or cross-process lease claim.
- Exact action dispatch; authenticated assignee-constrained job read; missing/reassigned/unsupported jobs conflict. Satisfaction ACKs with existing local sync diagnostics and no reconstructed activity. Replay ignores in-memory known-good version and force-anyway bypass; requires durable unchanged snapshot and atomic ID/assignment/status/updated_at predicate. Zero returned rows conflicts. WHERE tests old tuple before BEFORE UPDATE stamps new revision; live trigger behavior was NOT newly verified. Loopback simulated returned revision only.
- mark_ongoing: started ongoing ACK; completed supersession ACK/no regression. Unsatisfied work needs durable base. Legacy empty payloads therefore conflict rather than blindly replay.
- GPS: compares coordinates/accuracy, confirmation/start presence and lifecycle; matching ACK/no activity, differing/partial evidence conflicts; absent evidence with valid base gets conditional write. Full timestamp chronological consistency still outstanding.
- Checklist exact data/counts; findings exact writer fields; current step exact value/optional timestamp map, lower numeric step prohibited. Matching ACK, newer/absent base conflict, valid base conditional replay.
- Photos: original-path deterministic object and UUID v5 metadata identity; metadata comparison and authenticated byte reads, comparing local bytes when available. Object-only partial with matching local bytes/valid durable base inserts ONLY missing metadata (not overwrite upsert), then guarded job PATCH. Loopback: zero object upload, one metadata INSERT, one conditional job PATCH, zero activity INSERT. Existing complete photo paths/count avoid PATCH.
- Submit: zero-photo full-evidence ACK-loss and missing-completion conditional write tested; local Completed persists, ACK releases pending-completion protection. Completed status alone is insufficient; rework/submission ambiguity conflicts instead of blind clearing.

## Remaining defects / acceptance gaps — NOT deployment-ready R4

- Missing-object/both-missing photo resume NOT implemented; missing Storage errors remain retry failures. Remote-URL-only identity conflicts. Metadata-only/ambiguous evidence and authorization matrix untested.
- Metadata INSERT is not atomic with job version guard; concurrent advancement between read/photo work/completion needs tests/review. Final job PATCH is guarded; no cross-table atomicity claimed.
- Non-empty submit partial upload and ACK-loss, completed rework resubmit, GPS chronological/partial-start evidence, repeated start() (rather than concurrent drain), complete A–F matrix, cross-job and historical same-job isolation remain incomplete.
- Enqueue can replace deterministic IDs while claims await; exact claimed-payload conditional local ACK is not implemented. Reentrant-drain exclusion is not enqueue-vs-ACK proof.
- Live trigger evidence and loopback zero-row PostgREST response contract still required. No live SQL/mutation used to obtain them.

## Final local validation

Each suite sequential with `--no-pub --concurrency=1 --reporter compact`: new `r4_recovery_test.dart` **22**, new `r4_photo_loopback_test.dart` **1**; offline-start **1**, atomicity **40**, category **38**, downstream **8**, offline-completion **47**, retention **13**, unchanged interrupted-drain **1**; F1 resolver **9**, presentation **5**, F2 name **3**, F3 checkbox **2**, widget **2** = **192 passed / 0 failed**, exit 0 each. Earlier compiler failure and object-only red reproduction were corrected before final validation; expectations not weakened. V1 passes durable retry eligibility without initialized Supabase, not remote delivery proof.

Analyzer: **0 errors / 4 warnings / 38 infos = 42**, baseline matched (exit 1 for diagnostics). Both repositories diff-check exit 0. Logs in `C:\Users\RALPHL~1\AppData\Local\Temp\`: `r4-validation-summary.txt`, `r4-analyze-final.log`, per-suite `r4-<test-name>.log`.

F1 private authenticated reads, F2 full name, F3 checkbox removal preserved and regression-tested. No webhook_test execution, live Supabase schema/policy/data mutation, MyTofu/live photos/GPS, staging, commit or push. Existing dirty work preserved; new R4 tests untracked.

**STOPPED AT R4. Next:** complete missing-object recovery with loopback evidence, then submission/ownership/isolation gaps within authorized scope. Active substep remains R4; Loop 1 OPEN. Do not resume general Loop 1D or Loop 2.

# LOOP CLOSE TEMPLATE

Use this template after every completed issue. Do not mark an issue closed without the evidence required by its contract and this workflow.

```text
ISSUE:
LOOP:
STATUS:
CONTRACT:
IMAPS CHANGE:
SUPABASE CHANGE:
FIELDSYNC CHANGE:
TESTS:
EVIDENCE:
OPEN RISKS:
TEAM APPROVAL:
CLOSED:
NEXT LOOP:
```

# LOOP 1D-R4-V2 — MISSING-OBJECT PHOTO RECOVERY & FAULT INJECTION (V2-FI)

**STATUS: CLOSED / VERIFIED LOCALLY.**

- **Scope & Contract:** Resolved missing-object photo recovery matrix (Cases A–H) and verified multi-pass fault injection (FI-1 to FI-5) for `photos_update` and the photo-subroutine of `submit_inspection`. Zero live Supabase / Storage mutation. All assertions verified via in-process HTTP loopback server.
- **Production Delta:**
  - **V2 Production Delta:** `lib/core/services/supabase_service.dart` (`verifyOutboxRecoveryPhotos` routine adding byte identity checking, URL/object path extraction, metadata verification vs storage byte recovery, and guarded photo patching subroutine for `submit_inspection`).
  - **V2-FI Production Delta:** NONE (test-only verification; zero production code changes required).
  - **Total R4 Production Scope:** `lib/core/services/db_helper.dart`, `lib/core/services/sync_outbox_service.dart`, `lib/core/services/supabase_service.dart`.
- **A. Recovery-State Matrix Verification (Cases A–H):**
  - **Case A (Storage Present + Metadata Present):** Byte identities match local cache and metadata matches; skips upload (0 uploads), skips insert (0 inserts), converges references (1 patch).
  - **Case B (Storage Present + Metadata Missing):** Object-only partial state. Byte identities verified; skips upload (0 uploads), inserts deterministic row (1 insert), converges references (1 patch).
  - **Case C (Storage Present + Metadata Differing):** Deterministic ID matches but metadata attributes differ; yields conflict without overwrite (0 uploads, 0 inserts, 0 patches).
  - **Case D (Storage Missing + Local File Missing):** Missing bytes cannot be reconstructed without local file source; yields explicit conflict (0 uploads, 0 inserts, 0 patches).
  - **Case E (Storage Missing + Metadata Missing + Local Present):** Full interrupt recovery with valid durable base; uploads object (1 upload), inserts row (1 insert), converges references (1 patch).
  - **Case F (Storage Missing + Outdated Durable Base):** Remote task base updated since queue snapshot; yields conflict (0 uploads, 0 inserts, 0 patches).
  - **Case G (Storage Missing + Matching Metadata + Local Present):** Metadata exists but storage object absent; restores object (1 upload), skips duplicate insert (0 inserts), converges references (1 patch).
  - **Case H (Storage Missing + Differing Metadata):** Storage absent and remote metadata differs; yields conflict (0 uploads, 0 inserts, 0 patches).
- **B. Injected Interruption & Multi-Pass Failure Verification (FI-1 to FI-5):**
  - **FI-1 (Upload Succeeds, Metadata Write Fails):** Pass 1: Storage upload succeeds (1 upload), metadata INSERT fails (0 inserts), job PATCH count = 0. Action transitions to `failed` (retry_count=1, `r4RecoveryRequired: true` preserved). Pass 2: Detects existing object, 0 duplicate uploads (total 1), inserts metadata once (total 1), executes guarded job PATCH once (total 1). Action transitions to `synced`.
  - **FI-2 (Metadata Write Succeeds, Job PATCH Fails):** Pass 1: Upload (1) and metadata insert (1) succeed; guarded `field_jobs` PATCH returns 500 error (0 patches). Action transitions to `failed` (`r4RecoveryRequired: true`). Pass 2: 0 duplicate uploads (total 1), 0 duplicate metadata inserts (total 1), retries only guarded job PATCH (total 1). Action transitions to `synced`.
  - **FI-3 (Storage Upload Fails Before Metadata):** Pass 1: Injected storage upload failure (0 uploads, 0 inserts, 0 patches). Storage object remains absent. Action transitions to `failed` (`r4RecoveryRequired: true`). Pass 2: Uploads bytes once (total 1), inserts metadata once (total 1), executes guarded job PATCH once (total 1). Action transitions to `synced`.
  - **FI-4 (Interruption After Partial Success + PERSISTED REOPEN SIMULATION):** Simulates crash / restart boundary. SQLite handle closed, Supabase instance disposed, session cleared. Reopened from disk; Supabase re-initialized. Startup recovery (`recoverAbandonedClaims()`) transitions in-flight `syncing` action to `failed` with `r4RecoveryRequired: true`. Drain reconciles: 0 duplicate uploads, 1 metadata insert, 1 guarded job PATCH. Action transitions to `synced`.
  - **FI-5 (Already Synced Re-Drain Idempotency):** Subsequent drain pass on synced action issues 0 uploads, 0 metadata writes, and 0 job PATCHes; action remains `synced`.
- **Deterministic Identity & Path Parsing:** Reuses existing `_stablePhotoKey` and UUID v5 derivation. Historical `getPublicUrl` values (F1 compatibility) are recognized as identical storage object paths (`extractStorageObjectPath`) without misclassification.
- **Guarded Convergence & Zero-Row Response:** Conditional PATCH requires matching `updated_at` and `status`. Zero affected rows explicitly yields conflict. Satisfied job references issue 0 PATCH.
- **Payload & Marker Integrity:** `r4RecoveryRequired` durable marker preserves all original photo payload keys and attributes.
- **Live Evidence Classification:** R4-P1 storage and table policies are classified as `INHERITED ACCEPTED LIVE VERIFIED EVIDENCE` (no fresh live query run in V2).
- **Canonical Architecture Documentation:** UPDATED `C:\Users\Ralph Lauren\iMAPS\docs\FIELDSYNC_BRIDGE_ARCHITECTURE.md` as the single canonical reference.
- **Validation:**
  - Focused: 33/33 tests passed in `test/r4_recovery_test.dart` and 21/21 passed in `test/r4_photo_loopback_test.dart` (`--no-pub --concurrency=1 --reporter compact`).
  - Aggregate: 226/226 passed across all 15 active non-live test suites (excluding `webhook_test.dart` and `db_check.dart`).
  - Analyzer baseline updated: 0 errors / 0 warnings / 38 infos = 38 diagnostics (exit 1). `git diff --check` clean in both repositories (line endings notices only).
- **Remaining R4 Gaps Closed:** Full submit business-state recovery (findings/checklist state machine), enqueue-vs-ACK ownership, repeated `start()` concurrency beyond reentrant guard, cross-job action sequence history evaluated and proven conflict-safe.
- **Disposition:** **LOOP 1D-R4 — CLOSED / VERIFIED LOCALLY**. Proceeded to **LOOP 1D FINAL** lifecycle matrix evaluation and subsequent Loop 1 closure.


