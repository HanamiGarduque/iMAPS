# iMAPS - FieldSync Bridge Historical Archive

**This file is an archive, not a contract.** It preserves dated loop records,
verification records, front-end delivery records and status snapshots that were
previously interleaved into `FIELDSYNC_BRIDGE_ARCHITECTURE.md`. They are kept
verbatim, in their original order, because several contain evidence that exists
nowhere else.

For current architecture and current invariants, read
`FIELDSYNC_BRIDGE_ARCHITECTURE.md`. For what a schema object is and why it exists,
read `FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md`. For the schema itself, read
`CANONICAL_DATABASE_SCHEMA.md`.

Nothing in this archive is a live requirement. Where an archived entry states a
superseded status, the architecture document governs.

---

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

**LOOP 9 — Delivery Monitoring + Admin Diagnostics — CLOSED**

> **Supersedes the previous `LOOP 3 — Assigning Planning Officer — IN PROGRESS` entry, which correctly described the state at the time it was written. Loop 3 is closed; see Loop status reconciliation below. That historical text is retained further down in this document and is not falsified here.**
>
> **Status history:** this entry previously read `AUDIT NEXT`, which correctly described the state when the Loop 9 audit and the D1–D20 contract decision had just been recorded. The audit has since **PASSED**, the contract was decided, and Loop 9C was **Team Leader APPROVED** on the audited narrow scope. Progress: **9A** schema (pushed) → **9A-R** legacy reconciliation (pushed) → **9B** writer + queue-correlation schema + writer correlation correction + Scenario E regression (**pushed**) → **9C-1** server-side delivery status reader (**implemented, unpushed**). Retry is **not** implemented and no UI exists yet. Do not skip ahead to Loop 10.
>
> *That status history is a point-in-time record from 2026-09-28 and is preserved verbatim. The parenthetical "implemented, unpushed" and the sentence "Retry is not implemented and no UI exists yet" are both **superseded**: all of 9A through 9G are now implemented, pushed and closed. See the closure update immediately below and **LOOP 9 - FINAL CLOSURE**.*

> **Closure update (2026-10-01, Loop 9 final docs-only pass):** this paragraph previously read *"Loop 9 is partially implemented. Phases 9A, 9A-R, 9B and 9C-1 are complete; 9C-2 onward, 9D, 9E/9F and 9G have not started. 9C-2 is next and is not implemented."* That was the accurate status on 2026-09-28. It has been replaced rather than kept, because a document's **current** status must not keep claiming an unimplemented phase is next. The superseded wording is recorded verbatim in this note, and the dated 9C-2, 9C-3, 9D and 9E/9F entries below remain untouched as point-in-time history. **Loop 9 is now CLOSED:** all of 9A, 9A-R, 9B, 9C-1, 9C-2, 9C-3, 9C-4, 9C-5, 9D, 9E/9F and 9G are complete and verified. See **LOOP 9 - FINAL CLOSURE** at the end of this document. **Do not start Loop 10 from this section; the next activity is Team Leader handoff / master integration review.**

Loop 9 initial scope is recorded verbatim in **CANONICAL ISSUE ORDER → LOOP 9** below. It remains the original planning scope; every phase in it is now closed.

## Superseded historical entry — LOOP 3 "Assigning Planning Officer — IN PROGRESS"

> Preserved verbatim as point-in-time history. This entry was the **CURRENT ACTIVE LOOP** section before the 2026-09-28 documentation checkpoint. It is retained so the Loop 3 closure evidence is not lost. **Loop 3 is now CLOSED.**

**LOOP 3 — Assigning Planning Officer — IN PROGRESS**

Current evidence shows the source-side provenance contract is implemented in the local model, migration, and job payload. The Controller capture and live Supabase schema application remain Team Leader-owned and pending explicit controller-side implementation, so this loop remains in progress rather than closed.

**Current verified work:**
- `SiteInspection` fillable includes the latest assigner provenance fields and comments describe the latest Planning Officer semantics.
- `PushInspectionToSupabase` forwards persisted assignment provenance without using runtime auth lookup.
- FieldSync offline cache now persists `assignment_instructions`, `assigned_by_imaps_user_id`, and `assigned_by_name` and restores them on cache reopen.
- The current source contract keeps `assignment_instructions` and `inspector_notes` independent and preserves Loop 1 status behavior.

**Outstanding / deferred (as recorded at that time):**
- Team Leader-owned controller capture of the authenticated Planning Officer before dispatch was pending.
- Live Supabase remote columns for `public.field_jobs.assigned_by_imaps_user_id` and `assigned_by_name` still required manual live verification or explicit user confirmation before claiming production verification.

> **Closure note (2026-09-28):** both items above were subsequently resolved — controller-side capture of the authenticated Planning Officer is implemented and the remote columns are live-verified. Loop 3 is **CLOSED**. See the Loop 3 contract tests and the Work Reassignment Phase 1 record below.

---

# LOOP STATUS RECONCILIATION (2026-09-28, post-cleanup checkpoint)

This is the authoritative active-status summary. Where an older entry states a different status, that entry is a point-in-time record and is preserved; this section states the current truth.

| Loop | Current status | Note |
|---|---|---|
| Loop 0 | **PARTIALLY CLOSED** (as originally recorded) | Historical / production-readiness identity items are retained exactly as documented. **Do not reopen closed known-inspector identity work without new direct evidence.** |
| Loop 1 | **CLOSED** | Canonical lifecycle implemented and verified within the accepted boundaries. |
| Loop 2 | **CLOSED** | Assignment instructions ownership closed. |
| Loop 3 | **CLOSED** | Assigning Planning Officer provenance closed. The former `IN PROGRESS` entry above is historical. |
| Loop 4 | **CLOSED** | Reinspection / new-round contract closed. |
| Loop 5 | **CLOSED** | Completed lifecycle protection closed. |
| Loop 6 | **IMPLEMENTED** | Site Inspector iMAPS access control implemented. Remaining credential/environment cases remain **approved deferrals** where already documented. |
| Loop 7 | **CLOSED within the approved boundary** | Photo / storage / authorization implementation closed. Real on-site 30 m device/photo completion and remote DELETE remain **deferred**. |
| Loop 8 | **IMPLEMENTED AND PUSHED** | Planning Review Metadata implemented and pushed. The read-only, round-safe metadata contract is closed. |
| Loop 9 | **9C-2 UI VERIFIED; 9C-3 NEXT** | Current active loop. 9A + 9A-R + 9B + 9C-1 + 9C-2 pushed. Delivery status is now user-visible, read-only, per inspection round, for Admin and Planning Officer. Retry is not implemented. |

Historical sub-loop evidence (Loop 1A/1B/1C/1D/1D-R series, Loop 7B/7C/7D/7F/7G) is **not erased** by this table.

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

**NEXT ACTIVE LOOP: LOOP 9 — DELIVERY MONITORING + ADMIN DIAGNOSTICS — AUDIT NEXT**
(Do not start Loop 9 implementation until the Loop 9 audit and contract decision are complete.)

> **Status history:** this line previously read `NEXT ACTIVE LOOP: LOOP 3 — ASSIGNING PLANNING OFFICER (Do not start Loop 3 until explicitly instructed.)`. That was accurate when written. Loop 3 is now **closed**; see **LOOP STATUS RECONCILIATION** and the **CURRENT ACTIVE LOOP** section at the top of this document. The Loop 3 historical record is preserved below.

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

## LOOP 6 — Site Inspector iMAPS Access — IMPLEMENTED 2026-09-24; AUTH GATE CORRECTED 2026-09-24 (pre-live-E2E); pending Team Leader live access E2E

- enforce the confirmed rule: iMAPS web = Admin + Planning Officer; FieldSync = Site Inspector;
- audit route, frontend, and backend enforcement;
- Team Leader approval received before Controller changes (approved with corrections: encode GET/POST and `POST /applications/update-status` are `role:Planning Officer` only, Admin excluded).
- Implementation record (2026-09-24):
  - `app/Http/Middleware/RoleMiddleware.php` — variadic `string ...$roles`, `Auth::check()` first (guests get normal Laravel login redirect), strict case-sensitive `in_array(..., true)` with no aliases/normalization, authenticated unauthorized → 403.
  - `app/Http/Controllers/Auth/AuthenticatedSessionController.php` — Site Inspector login gate is a PRE-login role callback inside `Auth::attemptWhen()`: the framework verifies the credentials first (after `hasValidCredentials()`), then the exact check `role === 'Site Inspector'` runs BEFORE any password rehash, session establishment, or remember-token handling; rejection returns the validation error "Site Inspectors use FieldSync for site inspection activities." with no `logout()`, no session teardown, and no users-row write. The earlier credential-success + `logout()`/`session()->invalidate()` teardown was replaced on 2026-09-24 after installed-framework source review established that `Auth::attempt()` rehashes first (`hashing.rehash_on_login` defaults to true) and that `logout()` rotates a populated `remember_token` — both being users-row writes the gate must never trigger. Invalid credentials never execute the callback, so they keep the ordinary invalid-credentials response and never leak the FieldSync guidance. Rate limiting, the 5-attempt lockout, credential validation, allowed-role session regeneration, and the allowed-role `last_login` update are preserved; a rejected SI login writes no password/role/`is_active`/`handshake_key`/`last_login`/`remember_token` change (source-verified against the installed framework; the DB-backed runtime proofs are environment-blocked — see Verification, and are not claimed as runtime-verified).
  - `routes/web.php` — shared internal routes (`/dashboard`, `/applications`, `/applications/{id}`, `/technical-review`, `/api/global-search`, map ×3, `/api/inspections/{id}/supabase-data`) behind `role:Admin,Planning Officer`; encode GET/POST, drafts ×3, `POST /applications/update-status`, TR mutation POSTs behind `role:Planning Officer`; Admin-only group unchanged; `/api/tax-map/lookup/{pin}` moved from stateless `routes/api.php` into this session-backed auth group behind `role:Admin,Planning Officer` (sole caller is the PO encode form, `Create.jsx`); public tracking (`/`, `/public-portal`) stays public.
  - `routes/api.php` — only `GET /user` (Sanctum) remains; tax-map route removed.
  - UI hygiene (not the security boundary): `Sidebar.jsx` hides operational nav from Site Inspector and shows FieldSync guidance; `Header.jsx` hides internal search from Site Inspector and gates the `/settings` profile link to Admin.
- Verification (after the 2026-09-24 pre-live-E2E auth correction): `tests/Unit/Loop6SiteInspectorAccessContractTest.php` 15 tests / 146 assertions green (includes installed `SessionGuard`/`AuthManager` source proofs of the pre-login rejection ordering and of the `logout()` remember-token rotation risk that forced the correction); `tests/Feature/Loop6AccessBoundaryTest.php` 8 tests / 34 assertions green; full Unit suite (incl. Loop 2/3/4/5 contracts) 75 tests / 423 assertions green; `tests/Feature/Loop6RoleMatrixTest.php` (18 tests: Admin/PO/SI login matrix, rejected-SI non-impact incl. password/`handshake_key`/`remember_token`, invalid-SI-credential path, allowed-role session regeneration, rate-limit/lockout) is structured honestly but ENVIRONMENT BLOCKED locally — all 18 error in `RefreshDatabase` setUp with `could not find driver (Connection: sqlite, Database: :memory:)` because `pdo_sqlite` is not installed (0 assertion failures; pre-existing local limitation, previously 38/47 Feature tests blocked, including all 24 pre-existing DB tests); these DB-backed proofs are NOT runtime-verified here and must run in an environment with `pdo_sqlite`; `npm run build` not re-run because this correction changed no JS.
- Status: **LOOP 6 IMPLEMENTATION PASS — PENDING LIVE ACCESS E2E.** Not closed; no closure record is written until the Team Leader's live access E2E passes.
- Loop 6 database/Supabase schema/data migration: NONE executed during implementation. FieldSync/Supabase code: unchanged.

### 2026-09-25 — Loop 6 manual live E2E status + two bounded correctness corrections

**LOOP 6 STATUS: IN PROGRESS — LIVE E2E SUBSTANTIALLY PASSING, FINAL TEAM CONFIRMATION PENDING**

This entry does not close Loop 6 and writes no Loop 6 closure record.

**Verified manual acceptance evidence (team-supplied, 2026-09-24/25):**

1. Planning Officer login/logout cycle works without Ctrl+F5. — LIVE VERIFIED
2. Admin login/logout cycle works without Ctrl+F5. — LIVE VERIFIED
3. Repeated auth transitions no longer produce HTTP 419. — LIVE VERIFIED
4. Admin shared/internal access matrix passed. — LIVE VERIFIED
5. Planning Officer workflow/read access matrix passed. — LIVE VERIFIED
6. Admin is denied PO-only Encode/Drafts. — LIVE VERIFIED
7. Planning Officer is denied Admin-only modules. — LIVE VERIFIED
8. Public `/public-portal` remains reachable. — LIVE VERIFIED
9. Guest internal Dashboard/Application routes redirect to login. — LIVE VERIFIED
10. FieldSync read-only non-impact acceptance passed. — LIVE VERIFIED
11. Tax-map authorization allowed Admin/PO through to the controller. — LIVE VERIFIED
12. Tax-map PostgreSQL query defect was corrected. — VERIFIED IMPLEMENTATION
13. Manual authenticated tax-map retest now returns the expected parcel JSON instead of HTTP 500. — LIVE VERIFIED

**Loop 6 remains open because:**

- one **VALID LOCAL iMAPS Site Inspector credential** must still be tested by the Team Leader; the expected rejection text remains: `Site Inspectors use FieldSync for site inspection activities.`
- Audit Log navigation behavior for Settings/User Management is awaiting Team clarification.
- guest tax-map denial remains pending if it has not yet been observed in a genuinely logged-out browser session.
- DB-backed PHPUnit matrix remains environment-blocked where PHP/pdo_sqlite cannot execute.

**Correction record 1 — stale CSRF token across Inertia auth transitions (419):**

- **Root cause (VERIFIED SOURCE):** a pre-existing static CSRF meta/header pattern. `resources/js/bootstrap.js` read `<meta name="csrf-token">` once at boot and assigned that value to `window.axios.defaults.headers.common['X-CSRF-TOKEN']` **and** `['X-XSRF-TOKEN']`; `resources/js/Pages/Users/Index.jsx` attached a per-page `X-CSRF-TOKEN` header. That persistent value outlived the server session, so a token minted before a login/logout transition was replayed on the next state-changing request and produced HTTP 419.
- **Correction (VERIFIED IMPLEMENTATION):** the static/persistent manual token pattern was removed. The meta tag was deleted from `resources/views/app.blade.php`, the boot-time axios default headers were deleted from `resources/js/bootstrap.js`, and the manual headers were removed from the three `Users/Index.jsx` POST calls. The application now relies on Laravel/Axios current `XSRF-TOKEN` cookie behavior.
- **Verification:** manual Admin/PO repeated login/logout confirms the 419 symptom is resolved (evidence 3). `tests/Unit/Loop6CsrfSessionContractTest.php` (2 tests) asserts the frontend XSRF-cookie lifecycle and that auth routes remain POST/web-protected; `tests/Feature/Loop6AuthTransitionTest.php` (2 tests) covers repeated allowed-role login/logout transitions and preserves Site Inspector rejection plus invalid-credential guest behavior.
- **Ownership:** no Controller role/business ownership change was made by the CSRF fix.

**Correction record 2 — tax-map lookup query defect:**

- **Authorization unchanged:** `/api/tax-map/lookup/{pin}` remains a session-backed GET behind `role:Admin,Planning Officer` in `routes/web.php`. The SQL fix changed no route, role, schema, or data.
- **Original defect (VERIFIED SOURCE; previously observed as HTTP 500 after authorization):** `TaxMapLookupController::lookup()` normalized the PIN with `UPPER(REPLACE(REPLACE(REPLACE(property_index_number, ?, ""), ?, ""), ?, ""))`. Those double-quoted empty strings are invalid in PostgreSQL (`zero-length delimited identifier`), so an authenticated Admin/PO request that had already passed authorization returned HTTP 500.
- **Correction (VERIFIED IMPLEMENTATION):** the replacements are now safely bound parameters — `['-', '', ' ', '', '.', '', $normalizedPin]` — making normalization portable and injection-safe.
- **Verification:** manual authenticated retest now returns the expected parcel JSON instead of HTTP 500 (evidence 13). `tests/Feature/TaxMapLookupTest.php` (5 tests) covers route/method, Admin/PO authorization pass, Site Inspector/guest denial, bound-literal not-found behavior, and special-character binding.
- **Guest denial** for the tax-map endpoint must be recorded separately when actually observed in a genuinely logged-out browser session; it is not claimed here.

**Database effect classification for this period:** IMPLEMENTATION / SCHEMA MUTATION: NONE. BUSINESS-DATA MIGRATION: NONE. SUPABASE MUTATION: NONE. Manual acceptance performed read-only application/database reads; normal successful Admin/PO logins may have updated allowed-role authentication metadata. Canonical ledger: `FIELDSYNC_BRIDGE_DATABASE_CHANGE_LOG.md`, 2026-09-25 entry.

---

## LOOP 7 — Photo / Storage / Authorization Contract

**LOOP 7 — AUDIT STARTED (2026-09-25). IMPLEMENTATION NOT AUTHORIZED.**

- Audit-only scope: establish the current FieldSync capture → Storage object → `field_job_photos` metadata → iMAPS reader path; verify live `field_job_photos` schema/RLS, `inspection-photos` bucket privacy and object policies, retry/idempotency, delete behavior, cross-inspector denial, and the private-bucket URL contract.
- The mandatory pre-Loop-7 Git checkpoint (both repositories) is recorded; everything it listed existed before this audit began.
- Loop 6 remains open: no Loop 6 closure, no commit, no push.
- No FieldSync source edit, Supabase migration, RLS/Storage policy change, bucket change, photo-row mutation, live photo upload, iMAPS reader change, or Controller authorization change is authorized during the audit.
- Loop 7 audit start — NO DATABASE/SUPABASE MUTATION.

- verify/add `field_job_photos.notes`;
- verify ownership-scoped UPDATE/DELETE RLS;
- decide bucket privacy;
- verify retry/delete behavior;
- verify inspector scoping.

## LOOP 8 - Planning Review Metadata - IMPLEMENTED AND PUSHED (2026-09-27 implementation; delivery confirmed 2026-09-28)

> **Status history:** the heading originally read `IMPLEMENTED 2026-09-27 (implementation pass; not yet committed)`. That was accurate when written. Loop 8 has since been committed and pushed to `origin/fix/fieldsync-bridge-stability`. The read-only, round-safe metadata contract is **CLOSED**.

- optionally add a read-only badge under Completed;
- never affect task status or category.

### LOOP 8 implementation record (2026-09-27) — round-safe read-only contract

**Purpose:** show optional, read-only Planning Review metadata in FieldSync for the **exact inspection round that was reviewed**. It never modifies `field_jobs.status`, `TaskItem.category`, `current_step`, progress, completed state, reinspection state, photo evidence, or sync ACK state. A review requesting reinspection does **not** reopen the reviewed Completed task; the existing reinspection workflow still creates a NEW round.

**iMAPS reviewed-round identity (prospective, never backfilled):**

- `technical_reviews.reviewed_site_inspection_id` — nullable, FK → `site_inspections(id)` `ON DELETE SET NULL`, indexed. It is the **existing** round being reviewed.
- `technical_reviews.site_inspection_task_id` remains the **new** round created by the decision. **The two are never synonyms.**
- Captured by `TechnicalReviewController::resolveReviewedInspectionId()` **before** any new round is created, only for result decisions (`Approved` / `Declined` / `Requires Reinspection`), and only when the parcel's latest existing round is `completed`. An initial `Needs Site Inspection` decision records `NULL`.
- **No historical backfill.** All 78 pre-existing review rows remain `NULL`; APP-2026-00026 data was deliberately not modified.

**Supabase transport — new `public.field_job_reviews` table (APPLIED / LIVE VERIFIED):**

`id`, `field_job_id` (FK → `field_jobs(id)` `ON DELETE CASCADE`), `technical_review_id` (UNIQUE — one source review event = one transport row), `reviewed_site_inspection_id` (traceability), `decision` (CHECK: `Approved` / `Declined` / `Requires Reinspection`), `reviewed_by`, `reviewed_by_name`, `reviewed_at`, `created_at`. RLS **enabled**.

- One SELECT policy for `authenticated`: review metadata is readable **only** when the parent `field_jobs.assigned_inspector_id = auth.uid()`.
- **No INSERT/UPDATE/DELETE policy for any client role.** The iMAPS server service credential is the only writer; FieldSync review metadata is read-only. No service-role key is exposed to the mobile client.

**iMAPS writer:** `PushPlanningReviewToSupabase` (dispatched **after** the review transaction commits) → `SupabaseService::findFieldJobIdByLocalInspectionId()` resolves the remote job from the reviewed round identity **only** (never by application, parcel, or reference number) → `upsertFieldJobReview()` upserts with `on_conflict=technical_review_id`. An unresolvable round is logged, never redirected to a guessed target.

**FieldSync:** optional `PlanningReviewMetadata` model; fetched through the existing `field_job_reviews` embed on the job queries (keyed by exact `field_job_id`, never joined by application/parcel/reference); cached in the existing `local_jobs` pattern as nullable `planning_review` JSON (db version 12) so previously synced metadata stays readable offline; rendered as a small read-only "Planning Review" card on the Completed task detail, shown **only** when a review row exists. Decision mapping: `Approved` → Approved, `Declined` → Declined, `Requires Reinspection` → Reinspection Requested.

**"Awaiting Review" is deliberately NOT implemented.** Historical reviews have no reliable reviewed-round identity, so a Completed task with no review row simply shows no section; nothing is inferred.

**Verification:** iMAPS `Loop8PlanningReviewContractTest` 15 tests / 44 assertions PASS; related lifecycle contracts 10 tests / 98 assertions PASS; `php -l` clean. FieldSync `loop8_planning_review_test.dart` 14 tests PASS; `flutter analyze` clean; combined Loop 8 + Loop 4 + Loop 5 + category suites 61 tests PASS. Live Supabase: assigned inspector reads 1 review row for own job; unrelated inspector 0 rows; anon 0 rows; inspector INSERT denied (`42501`); inspector UPDATE/DELETE are no-ops (0 rows mutated); `field_jobs` round 36 remains `completed`/step 6 and round 37 remains `in_progress`/step 1 — review isolation and completed immutability confirmed live.

## LOOP 9 — Delivery Monitoring + Admin Diagnostics — **AUDIT NEXT**

**STATUS: AUDIT NEXT. Loop 9 has NOT been implemented.**

Implementation may begin only after the Loop 9 audit and the explicit Loop 9 contract decision. Do not implement any part of the scope below during the documentation checkpoint, and do not skip ahead to Loop 10.

### Initial scope (canonical, recorded 2026-09-28)

**A. Bridge delivery lifecycle**

`Pending Delivery` / `Delivered to FieldSync` / `Delivery Failed`

This delivery state is **separate from** `field_jobs.status` (`assigned` / `in_progress` / `completed`). It must not be conflated with task lifecycle state.

**B. Planning Officer visibility**

Planning Officer needs actionable assignment-delivery information for their own work.

**C. Admin visibility**

Admin needs aggregate/system-support visibility for repeated delivery problems.

**D. Diagnostic support path**

`FieldSync Site Inspector` → `diagnostic_reports` → Admin/support triage.

**E. Authority boundary**

Admin support/diagnostic oversight must **NOT** become:

- inspection assignment authority
- technical-review decision authority
- field-work authority

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

### Canonical remaining order (recorded 2026-09-28)

`Loop 9` → `Loop 10 Full E2E Acceptance` → final cleanup/retention decisions still outstanding → final DB export/package → final team handoff.

The 2026-09-28 synthetic/test-data cleanup is **not** Loop 9 and must not be renamed as such. Loop 10 does not start until Loop 9 is audited, contracted, and closed. The final database export/package remains deferred until the remaining numbered loops and final acceptance are complete.

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


# LOOP 7B — IMAPS PRIVATE PHOTO READER IMPLEMENTED
**PENDING USER LIVE E2E**

## Implementation

- The existing protected route `GET /api/inspections/{localInspectionId}/supabase-data` remains the single reader endpoint.
- Authorization remains `auth` plus `role:Admin,Planning Officer`; Site Inspector and guest access remain denied.
- `App\Services\SupabaseService::getInspectionWithSignedPhotos()` performs the server-side field-job/metadata fetch, normalizes current raw paths and historical public/authenticated/signed Storage URLs, rejects host/path/traversal/cross-job values and metadata rows whose `field_job_id` does not match the resolved job, and generates a fresh signed URL per authorized photo.
- The response separates durable `photo_path` from transient `signed_url`; it does not return `field_job_photos.photo_url` or `field_jobs.photo_paths`.
- The default signed-URL TTL is 300 seconds through `INSPECTION_PHOTO_SIGNED_URL_TTL`; runtime code bounds it to 60–3600 seconds.
- `ParcelInspectionStatus` now calls the same-origin Laravel endpoint with `axios` and renders only `signed_url`; it no longer performs an active browser-side `field_jobs`/`field_job_photos` query.
- Photo notes are returned and displayed in the lightbox when present.

## Validation

- `tests/Unit/Loop7SecurePhotoReaderContractTest.php`: 5 tests passed.
- `tests/Feature/Loop7SecurePhotoReaderTest.php`: 5 tests passed; 40 total assertions across the focused Loop 7 suite.
- PHP syntax checks passed for the changed PHP source/tests.
- `npm run build` passed.
- `git diff --check` passed.
- The broader Loop 6 feature role matrix is environment-blocked by the known missing `pdo_sqlite` driver; the database-free Loop 6 access contracts remain green.
- No Supabase schema, RLS, Storage policy, row, or FieldSync mutation was made.
- User live browser E2E is still required; no credentialed request was executed by the agent.

**Contract status:** **CONFIRMED / IMPLEMENTATION AUTHORIZED FOR LOOP 7B ONLY.**
**Implementation status:** **LOOP 7B IMPLEMENTED — PENDING USER LIVE E2E; LOOP 7 REMAINS OPEN.**

# LOOP 7B MANUAL E2E DISCOVERY — PHOTO DISPLAY BLOCKER CORRECTED, RETEST PENDING

**Discovery date:** 2026-09-25
**Fixture:** Application `54` / reference `LC-2026-00039` / local inspection `22` / field job `c47de697-114f-4c7c-b3aa-9b3c1c635b8e`.

## Manual evidence

- **USER OBSERVED:** `GET /api/inspections/22/supabase-data` returned HTTP 200 for Planning Officer and Admin, but no photo grid/lightbox rendered.
- **USER OBSERVED:** the page displayed `1 Photos Uploaded` while the fixture had four live metadata rows and four backing private objects.
- **USER OBSERVED:** multiple identical inspection requests appeared in one page session.
- Authorization, guest denial, Site Inspector denial, and absence of a 419 regression remained passing.

## Exact root causes

- **LIVE VERIFIED:** the field-job read returned no nested `field_job_photos` relation even though an exact read of `field_job_photos` by `field_job_id` returned four rows. The original service silently produced zero photo entries.
- **LIVE VERIFIED:** `field_jobs.photo_count` was stale at `1`; the React fallback `photosToRender.length || inspection.photo_count` displayed that stale aggregate when no renderable entries existed.
- **VERIFIED SOURCE:** `ParcelInspectionStatus` depended on `localInspection` and an inline `onStatusFetched` callback, allowing parent re-renders to refetch the same inspection.
- **LIVE VERIFIED:** the configured Supabase base URL had a trailing slash. The signing request concatenated it directly, producing a double-slash Storage path and HTTP 400 from Storage. The same object signed successfully after base-URL trimming.

## Bounded correction

- `SupabaseService::getInspectionWithSignedPhotos()` now reads the exact `field_job_photos` rows in a second server-side query scoped by the resolved field-job ID, then normalizes, validates, and signs each row.
- The signing endpoint now uses `rtrim($this->url, '/')` before composing the Storage URL.
- `ParcelInspectionStatus` derives its evidence count only from returned renderable `signed_url` entries; stale `field_jobs.photo_count` no longer controls the displayed count.
- The fetch effect depends only on `inspectionId`; current parent data/callback values are held in refs, preventing parent-render refetch loops.
- No stored URL, photo row, count, Storage object, RLS policy, or FieldSync behavior was mutated.

## Verification after correction

- **LIVE VERIFIED read-only probe:** 4 metadata rows read, 4 paths normalized, 4 signed URLs generated, 4 final photo entries returned; response contained no `photo_url`, `photo_paths`, or service credential.
- Focused Loop 7 tests and database-free Loop 6 access tests: **36 passed, 233 assertions**.
- PHP syntax checks passed.
- `npm run build` passed.
- `git diff --check` passed.
- FieldSync source, Supabase schema/policies, Storage, and live rows were unchanged.

**Status:** **LOOP 7B PHOTO DISPLAY FIX READY FOR USER RETEST — LOOP 7B MANUAL E2E NOT YET RE-CLAIMED PASS; LOOP 7 REMAINS OPEN.**



# LOOP 7B FINAL SIGNED-URL DELIVERY FIX

**Status:** **SERVER VERIFIED — FINAL USER BROWSER RETEST REQUIRED**

## Manual retest evidence

- **USER OBSERVED:** metadata delivery, four-photo count, React mapping, and lightbox interaction passed for the existing fixture `54` / local inspection `22` / field job `c47de697-114f-4c7c-b3aa-9b3c1c635b8e`.
- **USER OBSERVED:** four photo cards rendered, but thumbnail pixels and the lightbox image were broken.
- **USER OBSERVED:** Admin and Planning Officer authorization passed; guest and Site Inspector denial passed; no 419 regression; refetch behavior appeared corrected.

## Exact URL root cause

- **LIVE VERIFIED:** the Laravel signing request is correctly composed as `POST /storage/v1/object/sign/inspection-photos/<object>` with the configured 300-second TTL.
- **LIVE VERIFIED:** Supabase returns a relative `signedURL` whose path is `/object/sign/inspection-photos/<object>?token=...` (token not recorded).
- **VERIFIED SOURCE / LIVE VERIFIED:** the previous code prepended only the project origin to that relative value, producing `https://<project>/object/sign/...`; a server-side GET of that URL returned HTTP 404 with an application/json error body.
- **REQUIRED DELIVERY ROUTE:** the private object delivery URL must contain `/storage/v1/object/sign/...`.

## Bounded fix

- `SupabaseService::createInspectionPhotoSignedUrl()` now:
  - keeps absolute signed responses unchanged;
  - converts relative `/object/sign/...` responses to `<project>/storage/v1/object/sign/...`;
  - preserves relative responses already beginning `/storage/v1/` without duplicating the prefix;
  - preserves the token/query string;
  - supports configured Supabase URLs with or without a trailing slash.
- The signing request remains unchanged and transient.
- No React change was required; the component already uses `photo.signed_url` and `selectedPhoto.signed_url`.
- No photo row, count, Storage object, RLS policy, or FieldSync source was changed.

## Server-side byte verification

A read-only server-side sign-and-GET probe against one of the existing four objects returned:

- HTTP status: **200**
- Content-Type: **image/jpeg**
- Non-zero bytes: **YES**
- Bytes received: **114,840**
- Signed URL/token: not printed or persisted

The returned signed URL path was verified to begin:

```text
/storage/v1/object/sign/inspection-photos/inspections/<field-job-id>/...
```

## Automated verification

- Focused Loop 7 + database-free Loop 6 tests: **39 passed, 240 assertions**.
- PHP syntax checks passed.
- `npm run build` passed.
- `git diff --check` passed.
- No browser pixels were claimed through the current non-browser tool interface.

**Status:** **LOOP 7B SIGNED IMAGE FIX — READY FOR FINAL USER RETEST; LOOP 7B MANUAL PASS NOT YET CLAIMED; LOOP 7 REMAINS OPEN.**



# LOOP 7B SECURE PRIVATE-PHOTO READER — IMPLEMENTATION + USER BROWSER E2E PASS

**Status:** **LOOP 7B SECURE IMAPS PRIVATE-PHOTO READER IMPLEMENTATION + USER BROWSER E2E = PASS**
**Scope:** Loop 7B only. Loop 7 remains open; Loop 7C was not started.

## Accepted browser evidence

- **USER CONFIRMED:** fixture `LC-2026-00039` / application `54` / local inspection `22` / field job `c47de697-114f-4c7c-b3aa-9b3c1c635b8e` loaded successfully in iMAPS.
- **USER CONFIRMED:** `4 Photos Uploaded` displayed.
- **USER CONFIRMED:** four evidence thumbnails rendered with actual image pixels.
- **USER CONFIRMED:** thumbnail image requests returned HTTP 200 and transferred non-zero JPEG resources.
- **USER CONFIRMED:** lightbox opened and enlarged image pixels rendered.
- **USER CONFIRMED:** `GET /api/inspections/22/supabase-data` returned HTTP 200.
- **USER CONFIRMED:** one normal inspection request was observed after refresh; the previous continuous/unnecessary refetch behavior was not observed.
- **USER CONFIRMED:** the Admin browser path also passed.
- **USER CONFIRMED:** Guest denial remained PASS.
- **USER CONFIRMED:** Site Inspector endpoint denial remained PASS.
- **USER CONFIRMED:** no 419 regression occurred.

The final signed-image browser gate passed after the server-side URL composition correction. No signed URL token, credential, cookie, or session identifier is recorded here.

## Protected contract

- Private `inspection-photos` bucket remains unchanged.
- Laravel remains the trusted metadata reader and signed-URL generator.
- React consumes only the Laravel-authorized result.
- Raw durable `photo_path` remains separate from transient `signed_url`.
- Four canonical photo entries remain intact.
- No FieldSync, Supabase data, RLS, Storage policy, bucket, or PostgreSQL mutation occurred.

**Loop 7B status:** **VERIFIED / BROWSER E2E PASS.** This does not mark all of Loop 7 closed.

---

# POST-7B INSPECTION VIEWER CONTEXT AUDIT

## Parcel PIN

- **VERIFIED:** local parcel `26` for application `54` has `property_index_number = 041021-008-02-006-0750`.
- **VERIFIED LIVE:** the remote field job references `supabase_parcel_id = e9f59675-3a9e-4818-80d0-5e6c3fe99e2b`; its `supabase_parcels.local_parcel_id = 26` and `property_index_number = 041021-008-02-006-0750`.
- **VERIFIED:** local PIN and remote PIN match; no contract drift exists.
- **VERIFIED SOURCE:** the previous Laravel field-job read did not request `supabase_parcels`, so the existing React `inspection.supabase_parcels?.property_index_number` projection had no source and rendered `N/A`.
- **CORRECTION:** the Laravel reader now performs an exact `supabase_parcels` read by the resolved `supabase_parcel_id`; the React component prefers the already-loaded local iMAPS parcel PIN and accepts the remote PIN only when remote `local_parcel_id` matches the current local parcel. Missing PINs still render `N/A`.

## Map focus

- **VERIFIED:** the Show page’s existing map path fit `activeParcelFeature` or the barangay GeoJSON only. It had no confirmed-inspection GPS path.
- **VERIFIED LIVE:** fixture `22` has valid remote confirmed coordinates `13.9567603, 121.163363`; the local `site_inspections` row currently has null local GPS because the inspection is assigned.
- **VERIFIED:** the local `land_parcels` layer has no matching feature for the local PIN, and local `parcels.boundary` is null. The current broad fallback is therefore expected from the old geometry path.
- **CORRECTION:** `Show.jsx` now receives authorized inspection data from `ParcelInspectionStatus`, validates finite latitude/longitude ranges, renders a confirmed-site `CircleMarker`, and focuses the map at the existing site zoom `18` when a valid parcel boundary is not available. Existing parcel-boundary fit remains preferred; barangay fit remains the final fallback.
- **SAFETY:** missing, null, non-finite, or out-of-range coordinates return `null` and are never passed to Leaflet.

## Deferred GIS findings

- `GET /geojson/land_use_plan.geojson` → 404 remains a **DEFERRED GIS/UI BUG**.
- `Invalid LatLng object: (NaN, NaN)` remains a **DEFERRED GIS/UI BUG** outside the corrected confirmed-coordinate path.
- Neither issue was used to justify changing land-use GeoJSON or unrelated map data.

**Post-7B viewer status:** **IMPLEMENTED — READY FOR USER PIN/MAP RETEST.**




# LOOP 7F — LEGACY / ORPHAN RECONCILIATION AUDIT

**Status:** READ-ONLY RECONCILIATION COMPLETE — LOOP 7 REMAINS OPEN; READY FOR LOOP 7G CLOSURE REVIEW

**Mode:** Live read-only inventory and classification only. No cleanup, delete, migration, rename, RLS change, Storage policy change, device E2E, APK install, or commit/stage/push occurred.

## Live inventory (verified 2026-09-26)

- **FieldSync Supabase project:** `laapipjyprmmaylunxib` (linked project, `ACTIVE_HEALTHY`; internal project reference only, not a credential).
- **`field_job_photos` rows:** 87.
- **Metadata rows using canonical raw Storage object paths:** 85.
- **Metadata rows using legacy full Storage URL values:** 2.
- **Metadata rows with an unrecognized/malformed value form:** 0.
- **Storage objects in `inspection-photos`:** 106.
- **Metadata paths with a backing Storage object:** 87.
- **Metadata paths missing a backing Storage object:** 0.
- **Storage objects with no metadata row:** 19.
- **Duplicate metadata rows for the same canonical object path:** 0.
- **Duplicate logical metadata identities detected:** 0.

The earlier audit counts (2 legacy URL rows and 19 orphan objects) are still numerically present, but the live check was rerun rather than assumed. The reconciliation is internally consistent: every metadata row resolves to a canonical object path, every such object exists, and the excess 19 objects are unreferenced by metadata and by current job photo-path arrays.

## Legacy URL row classification

The two legacy rows are historical completed-inspection evidence, not active write-path records.

| Row ID | Field job ID | Value type | Backing object | Job status | Historical/active | Canonical identity derivable | Migration risk |
|---|---|---|---|---|---|---|---|
| `516a42d2-bb1a-59ec-903d-5bcf5bdc416d` | `8404b6a1-873b-4a0b-bfaa-e1eba8bbc493` | Legacy Storage URL | Yes | `completed`; `submitted_at` set; no rework | Historical | Yes; object naming is canonical | High if rewritten; not required for current read compatibility |
| `dd82dedf-d415-5398-8af5-db3c7f8a8c68` | `6eeee8e5-2dd3-43e1-a5df-704c08815338` | Legacy Storage URL | Yes | `completed`; `submitted_at` set; no rework | Historical | Yes; object naming is canonical | High if rewritten; not required for current read compatibility |

- Both rows point to existing objects and remain usable as historical evidence.
- Their object names use the canonical `inspections/<field_job_id>/photo_<key>.jpg` naming form even though the stored metadata value is a full Storage URL.
- Full legacy URLs, signed tokens, and credentials are intentionally not recorded here.
- The rows were **not rewritten**, and no canonical-identity migration was attempted.

## Orphan object classification

The 19 unreferenced Storage objects are all historical dated objects (2026-07-19) under seven job prefixes. No orphan has a matching current `field_jobs` row, and no current job `photo_paths` array references any orphan object.

| Field-job prefix | Count | Object date window | Naming form | Metadata reference | Current job exists | `photo_paths` reference | Classification |
|---|---:|---|---|---|---|---|---|
| `375064e2-1ef0-494a-b22a-58fce5b7873a` | 8 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `56510162-b847-477b-8c05-a19042847553` | 2 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `9b6d483b-2d54-47a3-a34b-c7ca0d9832f3` | 3 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `cbfde9f2-d4bf-4175-a5a9-02fc85f75731` | 1 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `d367b917-1fe0-4dda-a94c-b77a10d7aa10` | 1 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `f9b37971-7c00-484f-b0f2-b9847fbf996d` | 1 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |
| `fd3fc7c7-5704-42a5-a905-d88ae832356a` | 3 | 2026-07-19 | Canonical | No | No | No | A — historical legacy orphan |

Classification basis: the objects are unreferenced, belong to job prefixes that no longer resolve, and predate the current live metadata set. The evidence does not prove a specific cause, so no failed-write or interrupted-write cause is asserted. None is classified as a current canonical orphan affecting an active job, and none is classified as “not actually orphan” after recheck.

## Canonical future-writer protection

**VERIFIED IMPLEMENTATION / LIVE-CONSISTENCY CHECK:**

- Current FieldSync writer path: `SupabaseService.photoStoragePath()` produces `inspections/<field_job_id>/photo_<base64url(local_path)>.jpg`.
- `SupabaseService.photoRowId()` derives the metadata identity with UUIDv5 of that canonical Storage path.
- New/inserted metadata writes use the canonical raw object path, not a public URL.
- Loop 7D recovery reuses the same identity for canonical partial states: missing object, missing metadata, ACK loss, and retry do not create a second object path or second metadata identity.
- Existing historical metadata values are preserved when the deterministic identity already exists; the writer does not introduce new legacy URL metadata values.
- iMAPS `SupabaseService::normalizeInspectionPhotoPath()` supports the current raw path plus supported historical Storage URL forms, validates the field-job prefix, omits malformed/cross-job values, and returns `photo_path` with a transient `signed_url`. The stored legacy value is not treated as an authorization mechanism and is never written back by the reader.



## Production impact

1. **Do the 2 legacy rows break the current iMAPS signed-photo reader?** No. Both rows have backing objects, canonical object names, and are normalized by the current reader into a job-scoped path for short-lived signed URL creation.
2. **Do any orphan objects affect visible evidence?** No current visible evidence is affected. No orphan is referenced by `field_job_photos`, and no current `field_jobs.photo_paths` array references an orphan.
3. **Are any current canonical metadata rows missing their object?** No. All 87 metadata rows have a backing object; the 85 current canonical rows and 2 legacy-URL rows both resolve.
4. **Are any current jobs referencing orphan-only evidence?** No. Zero current jobs reference any orphan object.
5. **Does any finding block normal future photo capture/sync?** No. The canonical writer and Loop 7D recovery contract are unchanged.
6. **Does any finding block Loop 7 closure?** No reconciliation blocker was found. Loop 7F does not itself close Loop 7; Loop 7G is the closure review gate.
7. **Which findings are historical cleanup only?** The 19 dated, unreferenced orphan objects and the 2 legacy URL metadata rows. No cleanup is authorized or performed in this loop.

## Cleanup explicitly NOT performed

Loop 7F performed no `DELETE` of Storage objects or metadata rows, no `UPDATE` of `photo_url`/`photo_path`, no rename, no metadata-ID migration, no cleanup SQL creation or application, and no RLS/Storage policy change. Any future cleanup requires a separate, explicitly approved operation after retention/evidence review.

## Deferred boundaries

- **Loop 7E remote delete:** still deferred. No `field_job_photos` DELETE policy, Storage `inspection-photos` DELETE policy, durable delete outbox, retry contract, or remote pair-acknowledgement contract was implemented or applied in Loop 7F. Current conservative local-only delete/retention guards remain unchanged.
- **Loop 7D device E2E:** still deferred to the next approved physical-device session. Source/automated verification remains the available evidence; no APK install or device operation occurred.
- **Loop 7G:** closure review only after the Team Leader confirms the historical orphan cleanup decision and the Loop 7E remote-delete contract decision. Do not start Loop 7G cleanup work in this loop.

**LOOP 7F status:** **LEGACY / ORPHAN RECONCILIATION PASS — READ-ONLY; READY FOR LOOP 7G CLOSURE REVIEW.**



---

# LOOP 7G — FINAL CLOSURE / PRE-COMMIT REVIEW

**Date:** 2026-09-26
**Status:** **LOOP 7 IMPLEMENTATION BATCH FROZEN FOR SELECTIVE COMMIT — NOT FULL DEVICE/POLICY ACCEPTANCE**

## Phase disposition

- **7A — CONTRACT: PASS.** Private `inspection-photos` bucket, raw durable object-path identity, Laravel/session authorization, transient signed URLs, and Admin/Planning Officer review are the locked contract.
- **7B — SECURE iMAPS PRIVATE PHOTO READER: PASS.** Laravel generates short-lived signed URLs; React renders only the authorized result; no browser service-role key; Admin and Planning Officer paths passed; guest and Site Inspector denial passed; four photos rendered; lightbox passed; no 419 regression. The post-7B parcel-PIN and confirmed-inspection map-focus corrections are implemented and covered by source-contract tests; their manual retest belongs to tomorrow's broader browser regression and is not claimed as a separate E2E PASS tonight.
- **7C — FIELDSYNC PHOTO WRITER CONVERGENCE: PASS.** `SupabaseService.uploadInspectionPhotos()` is the one future writer; object identity is `inspections/<field_job_id>/photo_<base64url(local_path)>.jpg`; metadata identity is UUIDv5 of that path; the legacy provider path is a compatibility adapter.
- **7D — PHOTO RECOVERY / ACK: SOURCE + AUTOMATED PASS.** Remote completeness requires both the Storage object and metadata row; local acknowledgement follows verified completeness; canonical partial states, ACK loss, missing local file, and `unknown` existence handling are covered. **PHYSICAL DEVICE RECOVERY E2E = DEFERRED TO TOMORROW.**
- **7E — DELETE / RETENTION: SAFE LOCAL DELETE/RETENTION PROTECTION PASS.** Local file-first cleanup, local-row confirmation, and completed/rework/remote-work/acknowledged removal rejection are implemented and tested. **REMOTE DELETE CAPABILITY = DEFERRED / POLICY DECISION REQUIRED.** No remote DELETE policy or delete outbox exists.
- **7F — LEGACY / ORPHAN RECONCILIATION: PASS.** Live read-only inventory: 87 metadata rows, 87 backed objects, 106 total `inspection-photos` objects, 19 historical unreferenced orphans, 2 historical legacy URL rows, 0 metadata rows missing an object, and 0 duplicate canonical paths. No cleanup, rewrite, rename, or migration was performed.

## Core contract verification

The current implementation preserves all 14 reviewed Loop 7 boundaries: private storage; canonical Storage identity; UUIDv5 metadata identity; one reachable future writer; retry identity stability; object-plus-metadata remote completeness; local ACK only after remote completeness; Laravel/session authorization; transient signed URLs; raw durable stored path; completed/rework protection; preservation of historical evidence; no orphan cleanup; and no invented broad Admin/Planning Officer/Site Inspector delete right.

## Latest verification evidence

- FieldSync `flutter analyze`: **No issues found**.
- Loop 7E combined focused suite: **148 passed, 0 failed**.
- Loop 7F focused writer/recovery verification: **35 passed**; analyze clean; `git diff --check` passed.
- iMAPS focused Loop 7 reader suite re-run during Loop 7G: **19 passed, 84 assertions**.
- A debug APK build succeeded, but the artifact currently on disk (`2026-09-26 03:41:21`, SHA-256 `86215D83BB5BA1972DDFE57436B32997A3C7E73BD8633C32767FE208B260D08F`) predates the Loop 7E source/test edits. It is **not** a current post-7E device artifact. Rebuild and verify timestamp/hash before tomorrow's install.

## Deferred to tomorrow

1. Loop 7D physical-device recovery E2E: install a freshly rebuilt APK in place, offline capture, process death, reconnect/recovery, and duplicate check.
2. Full post-commit Loop 1–7 regression audit.
3. Broader cross-loop build/test/source audit, including the post-7B PIN/map browser retest.

## Deferred policy / future follow-up

4. Loop 7E remote photo deletion: bounded `field_job_photos` DELETE RLS, bounded Storage DELETE policy, durable delete outbox, restart-safe retry, and pair acknowledgement.
5. 19 historical orphan Storage objects: no cleanup.
6. 2 historical legacy URL metadata rows: preserve unchanged.
7. Rosario municipal-boundary business rule: separate production-readiness follow-up.

## Freeze decision

- **IMPLEMENTATION FREEZE SAFE: YES**
- **SAFE TO COMMIT CURRENT LOOP 7 BATCH: YES**, using selective staging only.
- **FULL DEVICE ACCEPTANCE COMPLETE: NO — DEFERRED.**
- **REMOTE DELETE FEATURE COMPLETE: NO — DEFERRED POLICY.**

No live cleanup, remote delete policy, RLS change, APK install, device E2E, master sync, commit, stage, or push occurred during Loop 7G.


---

# POST-CLEANUP DOCUMENTATION CHECKPOINT (2026-09-28)

This section closes Final Readiness, Work Reassignment Phase 1, the Final UX follow-up, and the
Final Synthetic / Test-Data Cleanup, and activates **Loop 9 — AUDIT NEXT**.

Nothing above this line is rewritten. Earlier entries that recorded `NOT PUSHED`, `IN PROGRESS`,
or "not yet committed" were accurate at the time and remain as point-in-time history; the
records below establish the final state.

## Work Reassignment Phase 1 — final delivery

- **Branch:** `fix/fieldsync-bridge-stability`
- **Final reassignment closure commit:** `73e55f0`
- **Pushed:** YES

Verified contract:

- Active Planning Officer creator receives initial application ownership.
- `encoded_by` remains historical encoder attribution and is never treated as current ownership.
- Historical applications are **not** backfilled.
- Admin may initial-assign and reassign Planning Officer ownership.
- Planning Officer may reassign **only untouched** Site Inspector rounds.
- Mid-flight Site Inspector transfer is blocked by design (fail-closed on remote FieldSync state).
- Assignment history row and audit row are transactionally coupled with the ownership change.
- Suspended users are excluded from assignable/reassignable sets.
- Initial assignment has `reason` NULL; reassignment requires a reason.
- `Other` requires a note.
- No account sharing.
- No Admin technical-review decision authority.
- No FieldSync client change.
- No Supabase schema change.

## Final UX / correctness follow-up — final delivery

- **`526b64f`** — inspection photo thumbnail reads the authorized `signed_url`; new authorized
  lightbox with re-fetch, Escape/backdrop/close, prev/next, and unavailable state.
- **`1c1fa50`** — applicant-folder context navigation; assignment modal clarity.
- Branch remote/local final at that checkpoint: `1c1fa50`. **Pushed: YES.**

Verified outcomes:

- Admin photo viewer: **PASS**
- PO evidence viewer through Application Detail: **PASS**
- Standalone Site Inspections detail remains **Admin-only intentionally**
- Applications folder → detail → same folder: **PASS**
- Site Inspections folder → detail → same folder: **PASS**
- First-assignment helper no longer resembles an input
- Assignment business contract: **unchanged**

Photo endpoint latency remains **P2 PERFORMANCE BACKLOG** and is **not** blocking.

## Final Readiness Audit record

- **P0:** 0
- **P1:** 0
- **Release / readiness gate: PASS**

Non-blocking findings retained:

- **P2** — photo endpoint latency; reference-number presentation split (legacy
  `DP-/LC-/ZA-/ZC-` versus new `APP-2026-*`); previously classified GIS / history UI items.
- **P3** — the documented backlog classifications (Analytics page, Audit Log scope, Settings
  polish, Reports, dead branches, unused props, Encode wizard sample registry, tracking/QR
  behaviour).

**Master divergence conclusion:** `origin/master` is already an ancestor of
`fix/fieldsync-bridge-stability`; the apparent 34-commit gap was only a stale **local** `master`
pointer. The feature branch carries 35 commits beyond `origin/master` and **0** upstream commits
are missing. **No merge or rebase is required for this reason. Do not modify `master`.**

## Final Synthetic / Test-Data Cleanup record (2026-09-28)

**AUTHORIZATION:** Option A — reuse of deleted synthetic APP numbers accepted.

**BACKUP:** a full local `pg_dump` (custom format) of the application database was created
successfully **before** any mutation and stored **outside the repository** as a local recovery
artifact. Complete pre-delete row contents for every deleted remote row were also exported to a
local directory outside Git. No credentials or sensitive paths are recorded canonically.

### iMAPS cleanup (BEFORE → AFTER)

| Table | Before | After | Deleted |
|---|---|---|---|
| zoning_applications | 72 | 70 | 2 |
| application_drafts | 75 | 9 | 66 |
| site_inspections | 35 | 35 | 0 |
| technical_reviews | 78 | 76 | 2 |
| audit_trail | 156 | 152 | 4 |
| parcels | 58 | 56 | 2 |
| application_status_tracks | 144 | 140 | 4 |
| application_po_assignments | 0 | 0 | 0 |
| site_inspection_assignments | 0 | 0 | 0 |

**Deleted synthetic applications:** `133 / APP-2026-00027`, `134 / APP-2026-00028`.

**Protected and verified intact afterwards:** `131 / APP-2026-00025`, `132 / APP-2026-00026`,
`site_inspection 36` (still `completed`), `site_inspection 37` (still `assigned`),
`technical_review 75`, `technical_review 76`, and all **44** legacy
`DP-` / `LC-` / `ZA-` / `ZC-` applications.

Nine unresolved drafts were deliberately **retained**, not deleted.

### Supabase cleanup (BEFORE → AFTER)

| Table | Before | After | Deleted |
|---|---|---|---|
| field_jobs | 84 | 9 | 75 (orphan synthetic jobs) |
| field_job_photos | 88 | 5 | 83 |
| field_job_reviews | 1 | 0 | 1 (Loop 8 validation artifact) |
| supabase_zoning_applications | 88 | 15 | 73 (orphan-only synthetic mirrors) |
| supabase_parcels | 88 | 15 | 73 (orphan-only synthetic mirrors) |
| profiles | 2 | 2 | 0 |

- **No Auth accounts deleted. No profile deleted. No RLS change.**
- The **Hubbie** profile was **retained** because it still owns retained jobs, including the
  protected inspection rounds 36 and 37.
- Remote jobs for local inspections 22, 23, 35, 36, 37 remain (5 rows).

### Storage retention state

- Storage objects **before:** 107
- Storage objects **after:** 107
- **Deleted: 0**

Current classification — these are **distinct** and must not be silently merged:

| Count | Classification | Disposition |
|---|---|---|
| **83** | Unreferenced **after synthetic metadata cleanup** — synthetic cleanup follow-up candidate | **NOT deleted** |
| **19** | Historical **Loop 7F** orphan objects | **deferred — NOT deleted** |
| **5** | Referenced by retained metadata | **KEEP** |

Both the 83 and the 19 are unreferenced now, but their **provenance differs**. Any future
Storage deletion requires a **separate retention/cleanup authorization**.

## Reference-number decision (explicit user decision)

`APP-2026-00027` and `APP-2026-00028` were synthetic-only and have been removed.

- Current retained APP maximum: **`APP-2026-00026`**
- The existing generator derives the next number from retained application data, so the next
  legitimate application **may reuse `APP-2026-00027`**.
- This reuse was explicitly **ACCEPTED**.
- **No retained application was renumbered.**
- `application_sequences` was **NOT** repaired or incremented.
- **No artificial reservation** for 27/28 was created.
- The generator (`getNextSequence()`) was **NOT** modified.

## Known approved deferrals — NOT failures

These remain deferred and must **not** be marked PASS:

- Physical 30 m Loop 7D live GPS / photo completion.
- Site Inspector iMAPS credential acceptance where no valid credential is available.
- Track A cadastral / CLUP fixture.
- Remote photo DELETE.
- The **19** historical Loop 7F Storage orphans.
- The **83** newly unreferenced synthetic Storage objects, pending a separate retention decision.
- Mid-flight Site Inspector transfer / recovery.
- Photo endpoint performance optimization.
- Final database export / package.

---

# LOOP 9A-R — LEGACY DELIVERY FAILURE RECONCILIATION (INSPECTIONS 25-30) — EXECUTED 2026-09-28

## What this was

A **data-only reconciliation** against the existing 0921 database. It is **not**
a migration, **not** a schema change, **not** a resend, and **not** an
assignment or reassignment.

It converts six already-proven, already-terminal, previously silent bridge
failures into a durable and queryable `delivery_failed` business fact. It
performs no remote call of any kind.

> **Visibility boundary — read this before assuming a user can see this.**
> What is true now: the six failures have durable business delivery state that
> iMAPS can query, and each has one `legacy_reconciliation` history row.
> What is **not** true yet: no Planning Officer or Admin screen displays
> "Delivery Failed" anywhere. There is no Retry Delivery control and no Admin
> bridge monitoring page. **PO visibility and technical retry arrive in 9C;
> Admin aggregate monitoring arrives in 9D.** Until those phases land, this
> reconciliation corrects the *recorded state* only, not the user experience.

## Business meaning

Between 2026-09-11 00:51 and 19:29, six Site Inspector assignments were encoded
in iMAPS and were **never delivered to FieldSync**. The assigned inspector's
local account could not be resolved to a Supabase profile, so every push failed.
The failures were recorded only in Laravel's generic `failed_jobs` table, which
no user-facing surface ever reads. The result was an invisible false state: the
Planning Officer saw a normal `assigned` inspection that in fact had no remote
task, and the inspector never received the work.

After this reconciliation those six rounds are explicitly, durably, and
honestly marked as failed deliveries. **No resend occurred**, and the rounds
still await a deliberate business decision.

| Inspection | Application | Reference | Historical failure (from `failed_jobs.failed_at`) |
|---|---|---|---|
| 25 | 104 | ZA-2026-00038 | 2026-09-11 00:51:31 |
| 26 | 115 | APP-2026-00011 | 2026-09-11 18:24:56 |
| 27 | 116 | APP-2026-00012 | 2026-09-11 18:29:47 |
| 28 | 117 | APP-2026-00013 | 2026-09-11 19:17:36 |
| 29 | 118 | APP-2026-00014 | 2026-09-11 19:25:40 |
| 30 | 119 | APP-2026-00015 | 2026-09-11 19:29:48 |

## Proven 1:1 lineage (not chronology)

The stored `failed_jobs.payload` serializes the job's model identity, so the
mapping is read directly out of the queue payload rather than inferred from
timestamps:

`App\Jobs\PushInspectionToSupabase` -> `inspection` -> `App\Models\SiteInspection{id}`

giving inspection 25 <- `failed_jobs.id` 7, 26 <- 8, 27 <- 9, 28 <- 10,
29 <- 11, 30 <- 12. Exactly one record per inspection; no target lacks a record;
no inspection has more than one. All six raise the same terminal failure from
`PushInspectionToSupabase::resolveSupabaseUserId()` when the local inspector
account could not be resolved to a Supabase profile via `handshake_key`.
Normalized category: **`inspector_mapping_unresolved`**.

Each inspection's own `created_at` independently precedes its `failed_at` by
4-5 seconds, corroborating the causal chain.

**The fact that this mapping succeeds today does not rewrite the historical
cause.** The recorded cause is the cause at the time of failure.

## History limitation (deliberate)

Each attempt row is **one reconstructed business-level terminal delivery
event**, because the pre-Loop-9 system had no delivery-attempt
instrumentation. `attempt_number = 1` therefore does **not** mean Laravel
internally attempted the job only once, and no internal automatic-retry history
is inferred or fabricated from `failed_jobs`. `created_at` is deliberately left
at real insertion time (2026-09-28) and is **not** backdated to September, so the
reconciliation is never mistaken for instrumentation that existed at the time.

## What was deliberately NOT done

- **No resend / no retry / no dispatch.** The `field_jobs` row for these rounds
  does not exist remotely and was not created.
- **No PO ownership assigned or inferred.** All six applications keep
  `assigned_planning_officer_id = NULL`. `encoded_by` is historical encoder
  attribution, not ownership, and was not read.
- **No lifecycle change.** Inspection status stays `assigned`; inspector,
  application, parcel, schedule, notes, findings, reference number, technical
  review history, and application status are all untouched.
- **No `failed_jobs` modification.** All 12 rows retained.
- **No Supabase, Storage, RLS, Auth, or FieldSync mutation.**
- **No fabricated history for already-delivered rounds.** Inspections
  22, 23, 31, 32, 33, 34, 35, 36, 37 remain `delivery_status = NULL`. This is
  intentional: a null state for a known-delivered historical job is honest, and
  the future writer contract (9B) establishes delivery state prospectively.
- **Pre-bridge rows excluded.** Inspections 3-21 and 24 remain `NULL`
  permanently.

## Live state after reconciliation

`site_inspections`: 35 total — 6 `delivery_failed`, 0 `pending_delivery`,
0 `delivered`, 29 `NULL`.
`inspection_delivery_attempts`: 6 rows, all `source = legacy_reconciliation`,
`outcome = failed`, `failure_category = inspector_mapping_unresolved`,
`attempt_number = 1`, `delivered_at` NULL on all six summary rows.
`failed_jobs`: 12 rows, retained.
Remote: 0 `field_jobs` for local inspections 25-30; Supabase counts byte-identical
before and after.

## Recovery remains a deliberate two-step business action

Not implemented here, and intentionally so:

1. An **Admin** records initial Planning Officer ownership using the already
   approved ownership workflow (all six applications currently have no PO
   pointer, so a PO cannot retry yet).
2. That assigned Planning Officer decides whether the assignment is still valid
   and, if so, may later use Technical Retry — a Loop 9C control.

If an assignment is obsolete, it is left as a recorded historical failed
delivery — queryable in the database but not yet displayed in any user interface
— and the business follow-up is recorded separately. No cancellation workflow is
invented inside Loop 9.

---

# LOOP 9C-2 - DELIVERY STATUS UI - IMPLEMENTED AND BROWSER VERIFIED 2026-09-29

**Team Leader approved** Loop 9C UI implementation. Delivery status is now
**user-visible**, read-only, and rendered **per inspection round** on Application
Detail for Admin and Planning Officer alike.

**9C is NOT complete. Retry is NOT implemented. No retry button exists.**

## What is user-visible now

One **FieldSync Delivery** panel per Application Detail, mounted in each of the
page's two mutually exclusive branches, rendering one row per inspection round
from the 9C-1 reader.

| Delivery state | Label shown |
| --- | --- |
| `no_delivery_record` | **No Delivery Record** |
| `pending_delivery` | **Pending Delivery** |
| `delivered` | **Delivered to FieldSync** |
| `delivery_failed` | **Delivery Failed** |

## The three distinctions the UI must never blur

- **Delivery state is NOT the inspection outcome.** The section subtitle states
  this in the page itself, and the badge uses a rounded-square shape so a
  delivery badge is not mistaken for an application status pill.
- **Delivery state is NOT the application decision** - nothing about Received,
  Technical Review, Released or Denied.
- **Delivery state is NOT FieldSync task lifecycle.** `assigned` /
  `in_progress` / `completed` are never used as delivery labels, and delivery
  state never implies field progression.

## Round labelling

`Inspection Round N`, from the server's `round` value. It is **presentation
chronology only**. `inspection_id` is the stable persisted identity.
"Original Inspection" and "Reinspection" are **not** rendered: the server sends
no `round_kind`, and deriving it in the browser would be a client-side business
inference.

## Server-authored wording

Every user-facing string comes from `delivery.label`, `delivery.message` and
`delivery.failure_message`. The component contains **no** business-label map, so
a future server vocabulary change reaches the UI with no client edit. The raw
`failure_category` token is **never** shown; that is 9D Admin monitoring's job.

`attempt_count` is worded as "1 delivery attempt" / "2 delivery attempts" and is
shown only when non-zero, so it can never be read as a count of FieldSync task
starts.

## Browser verification - what was ACTUALLY observed

Real headless Chrome against the running application, signed in as a real
Planning Officer, against the live PostgreSQL backend. Read-only throughout.

| Check | Result |
| --- | --- |
| Planning Officer login | signed in, landed on the dashboard |
| **Delivery Failed** (application 104, inspection 25) | **BROWSER VERIFIED** - rose badge, "Delivery Failed", server prose "The assigned inspector is not linked to a FieldSync account.", "Last delivery attempt: Sep 11, 2026 12:51 AM", "1 delivery attempt", inspector name |
| **No Delivery Record** (application 132, inspections 36 and 37) | **BROWSER VERIFIED** - neutral slate badge, server message "No Loop 9 delivery record exists for this inspection round." No attempt count, no timestamps, no retry |
| **Multi-round** (application 132) | **BROWSER VERIFIED** - one panel, **two** rows, "Inspection Round 1" and "Inspection Round 2", id-ascending, **not** collapsed to `latestOfMany()` |
| **Second page branch** (application 1, Received) | **BROWSER VERIFIED** - panel present with the neutral empty state |
| **Placement** | Verified in both branches: application-level, not inside a parcel card, not once per parcel, not inside a PO action gate |
| **Reader error** | **BROWSER VERIFIED** by blocking only the delivery-status request: shows "Delivery status could not be loaded." and explicitly disclaims a delivery problem. It does **not** show "Delivery Failed" |
| **Accessibility** | **BROWSER VERIFIED** on rendered DOM: `role="status"`, `aria-live="polite"`, decorative dot `aria-hidden="true"`, textual label present, **0** icon-only state spans |
| **Responsive** | **BROWSER VERIFIED** - no horizontal overflow at 420 px or at desktop width; panel fluid |
| **Network** | Exactly **one** `GET /applications/{id}/delivery-status` per page load; **no** non-GET request; **no** browser Supabase or realtime call; no polling |
| **Retry control** | **NONE** - the rendered panel contains no button and no link |
| **Console** | No uncaught exception. One pre-existing 404 for `/geojson/land_use_plan.geojson` - the upstream map-source change, unrelated to 9C and deliberately left alone |

### A real defect browser verification caught

The first wiring mounted the panel **above** the page's status ternary as well as
inside the else branch. Because a panel above the ternary already covers both
branches, every **non**-Technical-Review application rendered **two** panels and
issued **two** delivery requests. Structural source tests had passed; only real
rendering exposed it.

The fix places each mount inside its own mutually exclusive arm. Re-verified in
the browser: application 1 went from 2 panels / 2 requests to **1 / 1**, and the
Technical Review applications were unaffected. A contract test now asserts
mutual exclusivity so the regression cannot return.

### States that could NOT be browser-verified

`pending_delivery` and `delivered` are both **0** across the entire live
baseline, so no honest browser proof exists without mutating protected rows or
fabricating delivery attempts. Neither was done.

- **Pending Delivery - CONTRACT + BUILD VERIFIED ONLY**
- **Delivered to FieldSync - CONTRACT + BUILD VERIFIED ONLY**

Both will receive real lifecycle verification during an authorized writer/retry
fixture or 9G E2E.

## Boundaries respected

No retry service, retry route, retry button, POST request, business mutation,
audit write, Controller change, route change, database schema change, forward
SQL, migration, Supabase change or FieldSync change. The 9B writer and recorder
are untouched. The upstream map-source change in `Applications/Show.jsx` is
untouched, enforced by contract test.

Verification: `Loop9c2DeliveryPanelContractTest` 48 / 531, full Unit suite
475 / 2839, `npm run build` PASS. Live baseline after browser verification is
**unchanged**: 35 inspections, 6 `delivery_failed`, 29 NULL, 6 attempts, 0
correlated, 12 `failed_jobs`, 0 fabricated `delivered_at`, 152 `audit_trail`
rows - zero writes from the browser.

**Next: 9C-3 - Planning Officer Technical Retry Service + POST Action.** Not
started. It introduces business mutation and audit logging, so it requires its
own bounded audit and implementation review.
---

# LOOP 9C-4 - PLANNING OFFICER RETRY DELIVERY UI - IMPLEMENTED 2026-09-30

## What this is

One control added to the existing FieldSync Delivery panel on Application Detail:
a per-round **Retry Delivery** action for the Planning Officer who currently
owns the application. It is the only UI for the 9C-3 retry contract that the
server-side closure already delivered.

Production change is a single file: `resources/js/Components/InspectionDeliveryStatusPanel.jsx`.
`resources/js/Pages/Applications/Show.jsx` is **unchanged** - the panel already
received `applicationId` and fetches its own rounds, so it had everything needed
to submit the retry. That matters: `Applications/Show.jsx` has unresolved
master-side conflict history, and leaving it alone keeps this branch's merge
surface small.

## The server is the authority for eligibility

The button is gated on the server's per-round `delivery.can_retry` and on
**nothing else**. The panel does not check `delivery.state`, the viewer's role,
`assigned_planning_officer_id`, the inspector's role, the handshake key, round
ordering, `parcel_id`, or the failure category.

That is the whole point of the 9C-1 design. `can_retry` is the output of the one
shared `InspectionDeliveryRetryEligibility` contract that the 9C-3 retry service
also enforces, so a browser can never offer a control the POST would refuse.
Re-deriving any of those rules in the client would fork that single authority in
exactly the two bad directions: showing a button the server rejects, or hiding
one the server would accept.

The application-level `retry_actor_unavailable_reason` is **not** used to gate
the control. It answers a different question (may this person act on this
application at all) and it is `null` for Admin by design, so gating on it would
depend on the wrong flag. When the server offers it, it is rendered once as
subtle guidance above the rounds.

## Who sees the control

`can_retry: false` is returned identically to an Admin, a non-owning Planning
Officer, a Site Inspector and a guest. Therefore **none of them ever sees a
button** - there is no client-side role check to get wrong, and no disabled
placeholder advertising an authority the viewer does not have. An Admin who can
read delivery monitoring gets no action at all, which is the intended reading
experience rather than a tease.

## The request

`router.post` to `/site-inspections/{inspection}/retry-delivery`, with an
**empty body**.

- The established convention for a Component-initiated mutation in this
  repository is Inertia's `router` (`WorkAssignment.jsx`, `Header.jsx`), and it
  inherits the Inertia CSRF and redirect behaviour. No manual `X-CSRF-TOKEN` is
  constructed, which is the exact anti-pattern the Loop 6 CSRF contract exists
  to prevent.
- No application id, parcel id, actor id, inspector id, delivery state or queue
  source is sent. The server derives every one of them, and re-runs the same
  eligibility contract. A browser may not assert facts about a business record.

## "Queueing" is not "delivered"

The in-flight button reads **Queueing…**, not "Retrying…" or "Sending…". An
accepted retry means the request was **accepted and queued**; it says nothing
about whether FieldSync ever received anything. On success the panel re-reads the
9C-1 reader and renders whatever the **server** now reports - a round that was
`delivery_failed` becomes `pending_delivery` because the server says so, and its
button disappears because the refreshed `can_retry` is false.

There is **no optimistic state**. The panel never writes a delivery state
locally, and `pending_delivery` appears in this file only as a pre-existing
9C-2 `DELIVERY_TONE` styling key, which paints whatever label the server sent.

## Failure and concurrency

Refusals are handled without leaking anything:

- **403 / 404 / 409 / 503** all show one generic inline message, "Delivery retry
  could not be queued.", in the panel's existing amber reader-failure shape,
  explicitly worded so it cannot be read as a delivery that failed.
- The 9C-3 controller already authors safe prose for every refusal
  (`InspectionDeliveryRetryResult::MESSAGES`) and returns no exception message,
  SQLSTATE, table name or stack trace. The UI still does not surface it, because
  Inertia's `onError` callback is not a reliable channel for an `abort()` body:
  relying on it would risk showing either nothing or an internal token. The
  authored reason is not the officer's to act on here, and the re-fetch below
  lets the reader re-state the truth.
- No internal blocker token (`wrong_delivery_state`, `superseded_round`,
  `inspector_invalid`, `application_mismatch`, `parcel_unknown`,
  `not_authorized`), no `planning_officer_retry`, and no `queue_job_uuid` is
  rendered.
- **Both** the success and the failure branch re-read the reader. A 409 means the
  server state moved on, so a stale enabled button must not survive a refusal.
- The submitting state clears in `onFinish`, which Inertia fires on success and
  on error alike. Without that, a refused retry would leave a permanently
  disabled button. A second retry is also refused client-side while one is in
  flight, so no double POST is possible.
- Only the acting round shows the pending state, so unrelated rounds and
  unrelated application controls are never disabled.

## Accessibility

The control is a real `<button type="button">` with visible text, a `min-h` touch
target, `disabled` and `aria-busy` while submitting, and
`aria-label="Retry FieldSync delivery for Inspection Round N"` so the label
names the round it acts on. It is never icon-only.

Visually it is a small outlined secondary action that sits beside the delivery
badge, deliberately quieter than a primary application workflow button, and it
reuses only the panel's existing Tailwind tokens. No design token was added and
the round layout, spacing, typography and status colours are unchanged.

## Verification

`tests/Unit/Loop9c4RetryUiContractTest.php` - 16 tests. It proves the control
exists; is gated only on `can_retry === true`; posts to the 9C-3 route with an
empty body and no business field; constructs no CSRF header; disables and
`aria-busy`s while in flight; refuses a second activation; scopes the pending
state to one round; re-reads on both success and error; never fabricates a
delivery state; clears the submitting state in `onFinish`; renders **no** control
(never a disabled one) for a non-retryable round; exposes no internal token;
shows only the generic refusal message; carries the round-tied `aria-label`; and
proves 9C-4 changed neither `Applications/Show.jsx` nor any 9C-3 backend file,
route or migration.

Four 9C-2 containment assertions were **scoped rather than deleted**, because
they were written for a read-only panel that legitimately had no retry:

- `router.` is no longer forbidden - it is now required, and axios, a raw
  `XMLHttpRequest`, `useForm` and `sendBeacon` remain forbidden.
- `setTimeout` is no longer forbidden outright for the toast dismissal timer, but
  `setInterval`, `WebSocket`, `EventSource`, `realtime`, `subscribe(`,
  `refetchInterval` and `poll` remain forbidden, and every `setTimeout` must be
  paired with a `clearTimeout`.
- "no retry token at all" became "no client-side eligibility reconstruction",
  which is **stricter**: it enumerates the specific tokens that would mean the
  browser re-derives a server rule, and `retry_actor_authorized` stays forbidden
  outright.
- "no button at all" became "exactly one button, and no form, anchor or
  onSubmit".
- The "component must be byte-identical to 9C-2-1" freeze was replaced by a
  scope assertion, because that rule would have forbidden this entire phase. The
  reader content it used to protect is still pinned by the other 9C-2 tests in
  the same file.

Results: `Loop9c4RetryUiContractTest` + `Loop9c2DeliveryPanelContractTest` 64
tests / 361 assertions PASS; full Unit suite 546 / 2993 PASS;
`Loop9c1DeliveryStatusReaderTest` 11 / 49 PASS; `npm run build` PASS;
`git diff --check` clean.

## What was NOT verified, and why

- **No automated render.** This project has no frontend test runner (no vitest,
  jest, @testing-library, playwright, cypress, jsdom or happy-dom; no `test`
  script), and there is no jsdom to drive a real DOM. A `renderToStaticMarkup`
  harness was attempted and abandoned: it would not have exercised the mounted
  panel, because SSR does not run `useEffect`, so it could only ever have
  rendered the loading state. Per the phase's own preference order, option B (the
  source contract) is the correct available gate. **No claim is made that the
  button has been visually confirmed in a browser.**
- **The real POST was never executed against canonical.** Doing so would require
  a Planning Officer to own a failed round, and no such row exists.
- **Remote FieldSync delivery remains unverified.** 9C-4 queues the existing
  writer; it does not prove anything reached the bridge.

## Current data limitation (development state, NOT a defect)

The development database now holds **71** applications, and exactly **one**
(`id 142`, `APP-2026-00027`) has a non-null `assigned_planning_officer_id` -
owned by Planning Officer user 4. That application has a single round,
`id 38`, whose `delivery_status` is NULL, so it is **not** a recorded failure.

The six `delivery_failed` rounds (ids 25-30) belong to applications 104 and
115-119, **none of which has a Planning Officer owner**.

Evaluating the real `can_retry` contract read-only against the live data
therefore yields `false` for every round, for the owning Planning Officer **and**
for Admin. The correct rendering on current data is **no retry button anywhere**,
and that is a correct result, not a UI failure.

This state was not created or altered by 9C-4, which performed no database
write. No owner was backfilled, no ownership was inferred from `encoded_by`, and
eligibility was not relaxed to make a button appear. Establishing legitimate
ownership on a genuinely failed round is a prerequisite for the controlled
9C-5 E2E, together with its own authorization.

## Boundaries respected

No backend change: `InspectionDeliveryController`, `InspectionDeliveryRetryService`,
`InspectionDeliveryRetryEligibility`, `InspectionDeliveryRetryResult`,
`InspectionDeliveryStatus`, `PushInspectionToSupabase`, `routes/web.php` and
`database/migrations/` are all untouched, and this is asserted by test. No
`Applications/Show.jsx` change. No schema change, no migration, no forward SQL,
no canonical write, no Supabase change, no FieldSync change, no retry
business-logic change.

## Boundaries respected by the UI

Retry remains a **transport** operation. Adding this control does not change
application status, inspection business status, inspector assignment, Planning
Officer ownership, technical review decisions, photo evidence, FieldSync
`current_step` / `progress`, Planning Review identity, or reinspection identity.
A retry never grants a new round, never reopens a review, and never re-assigns
anyone.

**Next: 9C-5 - controlled retry E2E.** It requires an explicitly authorized
fixture that gives a Planning Officer legitimate ownership of a genuinely
`delivery_failed` round, plus a live FieldSync bridge, to prove the queued writer
actually delivers. That fixture is deliberately NOT created here.
