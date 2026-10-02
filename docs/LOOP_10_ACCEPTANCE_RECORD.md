# LOOP 10 — NON-DEVICE ACCEPTANCE RECORD

**Branch:** `loop10-full-e2e-acceptance`
**Status:** **PARTIAL — FIELD ACCEPTANCE PENDING**
**Not closed.** Mandatory on-device rows CP6–CP13 are unproven.

This is deliberately **not** called a blocker or a regression. FieldSync enforces a
real 30 m proximity rule against the assigned parcel (`distance_to_parcel_boundary`),
and the Loop 10 site is physically unreachable from the operator's location. The
pending rows are **unexecuted acceptance**, not failed acceptance.

---

## ISSUE

Loop 10 is the full end-to-end acceptance of the FieldSync bridge. Loops 1–9 were
already proven; Loop 10 proves the existing contract end to end on ONE
brand-new application, rather than by redesign.

## LOOP

Loop 10 — FULL E2E ACCEPTANCE (no new features).

## STATUS

**PARTIAL — FIELD ACCEPTANCE PENDING**

| Row | Check | Result |
|---|---|---|
| CP1 | brand-new application + initial PO ownership | **PASS** |
| CP2 | Round 1 via *Needs Site Inspection* | **PASS** |
| CP3 | Gemini initial assignment + provenance | **PASS** (defect found and fixed) |
| CP4 | FieldSync delivery, POINT geometry | **PASS** |
| CP5 | retry idempotency, same remote job | **PASS** |
| CP6 | task start / progress scoped to Round 1 | **PASS** |
| — | authorization matrix (Admin/PO/SI/Public) | **PASS** |
| — | diagnostics acceptance (DR-2026-0001) | **PASS** |
| — | notification acceptance | **PASS** |
| — | Loops 1–9 regression sweep | **PASS** (carried forward) |
| CP7 | confirmed GPS | **PENDING ONSITE** |
| CP8 | offline continuation + reconnect | **PENDING ONSITE** |
| CP9 | Final Submit | **PENDING ONSITE** |
| CP10 | reverse sync into iMAPS | **PENDING ONSITE** |
| CP11 | *Requires Reinspection* decision | **PENDING ONSITE** |
| CP12 | Round 2 assignment | **PENDING ONSITE** |
| CP13 | Round 2 delivery | **PENDING ONSITE** |
| — | Round 1→2 retention / duplicate proof | **PENDING ONSITE** |

## CONTRACT

Proven on live canonical plus live Supabase, with no invented data:

- A new application receives current PO ownership. The initial ownership row is
  `assignment_type='initial'` with `from_planning_officer_id` and `reason` both NULL.
- The first inspection round is created by *Needs Site Inspection*, never by
  *Requires Reinspection*, and its `reviewed_site_inspection_id` is NULL because no
  prior completed round exists.
- Initial Site Inspector assignment is **not** a transfer: no handover reason.
- One local round maps to exactly one remote `field_job`.
- Parcel geometry reaches FieldSync as `POINT(longitude latitude)`, never a
  cadastral MultiPolygon.
- A Planning Officer retry is idempotent: the same remote job id before and after,
  remote count still 1, task not reset, mirrors not duplicated.
- Starting a task changes only that task.
- Confirmed GPS is a property of the round and remains NULL until FieldSync
  verifies it on site. The parcel centroid is **not** a substitute.
- Authority is three distinct boundaries: Admin, Planning Officer, Site Inspector.
- Diagnostic reports are immutable and remote-free-text never reaches a browser.

## IMAPS CHANGE

Two defects, both found by executing the existing contract rather than by reading it.

**1. `ApplicationController::store()` wrote no assignment provenance.**

The encode-time path creates the round inline and set `site_inspections.inspector_id`
without ever writing a `site_inspection_assignments` row. The other two creation
paths — `TechnicalReviewController::createInspectionRound()` and `assignInspector()` —
already called the canonical writer, so the encode path was the only one missing it.
Canonical held **39 rounds and 0 provenance rows**.

The fix reuses `WorkAssignmentService::recordInitialInspectorAssignment()`, the ONE
canonical writer, inside the existing transaction. No second history mechanism.

**2. `DiagnosticTextSanitizer` leaked the credential inside an `Authorization` header.**

`redactBearerAndAuthorization()` matched `\S+` after the colon, which stops after one
whitespace-delimited token. On the real header shape it consumed only the word
`Bearer`, so:

```
in : Authorization: Bearer abc123
out: Authorization: [redacted credential] abc123     <- credential survived
```

The bearer rule that ran next could no longer match, because the word it searches
for had already been replaced. Output *looked* redacted while the token stayed
readable in text a Planning Officer is shown. The rule now consumes the scheme with
its value, and later rules skip already-inserted markers so output stays a single
clean marker rather than `Authorization: [redacted credential] credential]`.

## SUPABASE CHANGE

**NONE.** No schema, no table, no column, no policy, no RLS change.

## FIELDSYNC CHANGE

**NONE.** The repository at `..\imaps_fieldsync` is untouched: 126 dirty files,
SHA-256 `961B640F...`, identical. The proximity gate that blocks CP7+ is a correct
business rule and was **not** modified, bypassed or relaxed.

## TESTS

- `Loop10EncodeTimeInspectorAssignmentProvenanceTest` — 7 tests / 26 assertions.
  Proven to **fail on the pre-fix controller** and pass after.
- `Loop10AuthorizationHeaderRedactionTest` — 9 tests / 27 assertions.
  Proven to **fail 5 on the pre-fix sanitizer** and pass after.

Both use broken/fixed reproduction rather than a test that only ever passed.

Full Unit suite, Loop 9 gate and Loop 1–8 contract tests: see **EVIDENCE**.

The 9 PostgreSQL `tests/Feature` cases remain unrun: `phpunit.xml` pins
`DB_CONNECTION=sqlite` and `pdo_sqlite` is absent in this environment, so they would
fail on the driver rather than on a regression. Their contracts are covered by the
live runtime matrix. The 9 Unit skips are the same known gap in
`DiagnosticNotifyPlanningOfficersTest`.

## EVIDENCE

### Fixture (frozen, not cleaned up)

```
LOOP10_APPLICATION_ID      145
LOOP10_REFERENCE           APP-2026-00030
LOOP10_PARCEL_ID           77
LOOP10_PO_ID               4   (desunia@imaps.com, Planning Officer, active)
ROUND_1_INSPECTION_ID      41
ROUND_1_SITE_INSPECTOR_ID  26  (gemini@imaps.com, "Gemini Norawit Titicharoenrak")
ROUND_1_FIELD_JOB_ID       1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999
```

### Resume baseline for the onsite session

```
round 1 status                assigned
round 1 checklist result      NULL
confirmed lat / long          NULL / NULL
completed_at                  NULL
submitted_at                  NULL
delivery_status               delivered
delivery attempts             2   (initial_dispatch, planning_officer_retry)
assignment provenance rows    1   (initial, from NULL, to 26, reason NULL, by 4)
remote status                 in_progress
remote started_at             2026-10-01T03:39:49Z
remote current_step           1
remote checklist              0 / 0
remote photo_count            0
rounds for this application   1   (no Round 2 yet)
```

Round 1 is correctly **open and unperformed**. No cleanup is required and none was
done. `delivery_status = delivered` records that the task reached FieldSync, which is
a different fact from the inspection having been carried out.

### CP5 idempotency, the whole claim

```
DELIVERY_RETRY_QUEUED audit     1   (by PO 4, 11:34:46)
planning_officer_retry attempt  1   (id 23, delivered, no failure category)
initial_dispatch attempt 1      retained — history is append-only
ROUND_1_FIELD_JOB_ID before     1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999
ROUND_1_FIELD_JOB_ID after      1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999
remote job count                1
app mirror / parcel mirror      1 / 1
task after retry                status=assigned, checklist 0/0, submitted_at NULL,
                                GPS unconfirmed, inspector still Gemini
```

### CP6 task start

```
status            assigned -> in_progress
started_at        NULL     -> 2026-10-01T03:39:49Z
current_step      1
step_timestamps   [1 => 2026-10-01T03:37:50Z]
checklist         0/0        photo_count 0        submitted_at NULL
local round       still 'assigned' — reverse sync pulls completed results only
third delivery attempt   none (starting is not a redelivery)
```

No other round moved. The four other `in_progress` remote jobs were each checked by
their own `started_at`: rounds 23, 22 and 37 pre-date Loop 10, and round 40 belongs
to the previous fixture `APP-2026-00029` (parcel 76) and started before the Loop 10
fixture existed. Only round 41 was created for application 145.

### Authorization matrix

Proven by replaying each route's **resolved** middleware chain through the real
`RoleMiddleware` as a real canonical user of each role.

| Route | Admin | PO | SI |
|---|---|---|---|
| delivery monitoring | allowed | denied | denied |
| diagnostics read (list + detail) | allowed | allowed | denied |
| Notify Planning Officers | allowed | denied | denied |
| PO Retry Delivery POST | denied | allowed | denied |
| PO technical-review decision | denied | allowed | denied |
| PO SI reassignment | denied | allowed | denied |
| PO application ownership handover | allowed | denied | denied |
| PO encode application | denied | allowed | denied |
| dashboard | allowed | allowed | denied |

Site Inspector denied across **all 63** authenticated internal web routes. No
internal control reachable without a session. FieldSync identity remains exactly one
remote profile.

### Diagnostics and notification

`DR-2026-0001` reused; exactly **one** report exists, no spam report created. Only
diagnostics mutation is the Admin notify POST. The controller has no
`store`/`update`/`destroy` and never writes the remote report table. Escalation is
Admin-only and read from `config('imaps.contact')` — no invented contact, no
credential env var, no phone literal.

Two real diagnostic notices exist, addressed to Planning Officers only, both linking
to `/diagnostics/0dcbfec0-2400-4c7f-af66-c4e4a8eb0d3d`, which resolves. No stored
notice contains a Supabase host, token, JWT, storage path or service key. Duplicate
suppression is configured at a 30-minute cooldown scoped to an **unread** identical
notice, and sending never marks the report resolved.

## OPEN RISKS

1. **Round 1 completion is unproven.** The reverse-sync result path
   (`PullCompletedInspections` → `site_inspections`) has not been exercised by this
   loop on live canonical data. CP10 is the row that proves it.
2. **CP8 offline behaviour is unproven.** Offline continuation and single-cycle
   reconnect are the least-covered rows in this loop and cannot be simulated
   honestly.
3. **Reinspection is unproven end to end.** `reviewed_site_inspection_id` is NULL on
   all 79 historical reviews because the column arrived by forward SQL on
   2026-09-27 and was deliberately never backfilled. The resolver rule is proven
   against source, but CP11 proves it on a real decision.
4. **Timestamp ties.** `timestamp(0)` second precision means same-second rows tie and
   their order is planner-dependent. Recorded characteristic, not a defect.
5. **Vehicle-clock drift.** A FieldSync device wrote a `started_at` roughly 10 hours
   from server UTC. Timestamps from the handset are device-authoritative.

## OPEN SEPARATE

**Pre-existing, predates Loop 10, NOT fixed here.** The remote `field_job` for
historical round 35 (`c7315702…`) is `completed` with
`submitted_at = 2026-09-21T12:11:00Z`, while its local `site_inspections` row is
still `status = assigned`. The job satisfies the `status=eq.completed` filter in
`PullCompletedInspections`, so it is eligible and simply has not been pulled. Ten
days separate that completion from the Loop 10 fixture.

Candidate for `PullCompletedInspections` reconciliation. Out of Loop 10 scope.

## TEAM APPROVAL

Branch pushed for review. **Not merged. Master untouched.**

## CLOSED

**NOT CLOSED.** Loop 10 remains open until CP7–CP13 are executed on site against this
same fixture.

## NEXT LOOP

**NEXT WORKSTREAM: SITE INSPECTION — ADMIN SIDE.**

**NOT STARTED.** Recorded as the agreed successor only.

## ONSITE RESUME PROCEDURE

When a device session is available at the San Carlos parcel, resume **without
recreating anything**:

1. Confirm Round 1 is still id 41, remote job `1f9df2ac…`, status `in_progress`.
2. Confirm the resume baseline above still matches before starting.
3. Complete Step 3 onward on site, then CP7 (GPS), CP8 (offline/reconnect),
   CP9 (Final Submit), CP10 (reverse sync).
4. CP11 *Requires Reinspection*, CP12 Round 2 assignment, CP13 Round 2 delivery.
5. Assert `ROUND_2_INSPECTION_ID != 41` and the final duplicate counts.

Do not create another application. Do not reuse `APP-2026-00029`.
---

## READINESS PROVENANCE CORRECTION (2026-10-02) - ISOLATED FIELD APK BUILD

Recorded by Cline. Loop 10 sequence, bridge integrity, iMAPS and cross-system
verification only. **No FieldSync source file was modified, no FieldSync audit
finding was fixed, and the Codex Active Assignments branch was not touched.**

### 1. Why this entry exists

A readiness check compared the Loop 10 fixture fingerprint before and after an
isolated FieldSync debug APK build and found it unchanged. A second check of
the same row showed `bridge_source_id` populated and the mapping repaired,
which does not match the pre-build snapshot taken earlier in the same session.

That apparent contradiction is resolved by **when** each write happened, not by
whether one happened. Both facts are true and must be recorded separately,
because conflating them would either invent an incident or hide a real one.

### 2. Two distinct events - do not merge them

| | |
|---|---|
| **HISTORICAL PRE-BUILD WRITE** | **AUTHORIZED - Teshow Round 2 repair** |
| Timestamp | `2026-10-02 03:02:20 UTC` = `2026-10-02 11:02:20` local |
| Nature | The authorized manual apply of the prepared guarded repair artifact `database/sql/2026_10_02_repair_teshow_round2_after_bridge_namespace.sql`, against `a761b17a-3fad-44ed-b451-7f0af0e41183` |
| Authority | Applied intentionally by an authorized operator, using the artifact whose twenty preconditions and postconditions had already been proven |
| Status | **COMPLETE.** Backend recovery PASS. Not an incident, and no incident investigation is warranted |

| | |
|---|---|
| **ISOLATED APK BUILD WINDOW** | **NO SUPABASE WRITE OBSERVED** |
| Window | `2026-10-02 04:41:53` - `04:47:14 UTC` (12:41:53 - 12:47:14 local) |
| Activity | `flutter clean` -> `flutter pub get` -> `flutter build apk --debug -v`, from the authoritative FieldSync checkout `imaps_fieldsync_main` |
| Supabase contact | **None.** Every Supabase interaction in this window was a read-only `SELECT` against `field_jobs`. No `INSERT`, `UPDATE`, `DELETE`, DDL or Management API write occurred |
| Ordering proof | The authorized Teshow write at 03:02:20 UTC **preceded the build window start by 1 h 39 m**. The build cannot have produced or repeated it |

The ordering is the decisive fact: the repair was already committed to the
remote **before** the first build command ran, and the remote fixture hash
`619cba4e60a4bd46fd3e53a777611cbd` was identical when sampled on both sides of
the build window.

### 3. Correct scope of the fingerprint comparison - stated precisely

The before/after MD5 comparison is valid evidence for exactly one claim:

> **The Loop 10 fixture was unchanged DURING the isolated APK build window.**

It is **not** evidence about the earlier authorized Teshow repair, and must
never be cited as such. The "before" sample for that comparison was taken
*after* the authorized 03:02:20 UTC apply had already committed, so the two
samples bracket only the build. A hash that is stable across a window is
evidence of stability in that window and is silent about everything before it.
Reporting it as proof that no write had ever occurred would have been a false
negative, and the honest form of the claim is the narrow one above.

Note on the recorded branch name: the build ran against `fix/home-active-assignments`
at HEAD `be7b7a3`, which is the state it was in at that time. The checkout has since
moved to `fix/profile-header-name-layout` by Codex's own work, still at the same
commit. Neither change was made by Cline, and the build did not depend on which of
those branches the checkout was parked on.
### 4. Isolated debug APK build - PASS

Executed from the authoritative checkout `imaps_fieldsync_main`
(`origin` `imaps-fieldsync`, branch `fix/home-active-assignments`, HEAD
`be7b7a342d80d1aa46df215890781cad29b0c3bc`). The smaller/stub FieldSync
checkout is not the acceptance gate and was not used.

| Step | Result |
|---|---|
| `flutter clean` | exit `0` |
| `flutter pub get` | exit `0` |
| `flutter build apk --debug -v` | exit `0`, `BUILD SUCCESSFUL in 5m 11s` |

Artifact: `build/app/outputs/flutter-apk/app-debug.apk`,
194,564,241 bytes, SHA-256 `DA2EDF0606F6AF05884DA63C1DC00A969DA2F7E15E804B1D56E0572951A610C2`.

Isolation and safety evidence:

- **No test runner was active.** The Dart processes present were editor tooling
  (language server, tooling daemon, devtools, MCP server), none of them a
  `flutter test`. No `flutter test` was started, and the operator's editor
  processes were deliberately left alone.
- **`pubspec.lock` preserved byte-identical** across `pub get`:
  SHA-256 `210930DC0133D05B8E12E0608B906C8FE225B4A79AF17C3A6CB123FD8016FF8F`, 45,509 bytes.
- **No dependency changes.** `pubspec.yaml` SHA-256 unchanged
  (`E6FAE8F39A433F9AD0F52F8613C1065B26E0C2FE0D74CF56E8611E225E7A52D4`).
- **No source edits.** All 128 git-tracked files under `lib/`, `android/` and
  `test/` are byte-identical to their pre-build hashes. HEAD unchanged at
  `be7b7a3`; the checkout's dirty-entry count is unchanged at 38, all of them
  pre-existing and none introduced by this pass.
- **No error signature in 7,774 lines of verbose output:** zero hits for
  `FAILURE:`, `BUILD FAILED`, `error:`, `Execution failed`,
  `A problem occurred`, `Exception`.
- **`flutter test` was not run, so no live remote `field_jobs` INSERT occurred.**
  See finding F below for why that matters.

### 5. FieldSync audit findings - CLASSIFIED, NOT FIXED

All six are **Codex-owned**. Cline recorded evidence and changed nothing. The
`Active Assignments` Home logic and render/layout work is **Codex Task 01** and
was excluded from Cline entirely.

| # | Finding | Evidence recorded | Status |
|---|---|---|---|
| A | `pre_loop3_cleanup_contract_test.dart` scheduling lifecycle separation defect | Pins `scheduled_date` + `is_self_scheduled` on the writer, forbids `remarks` and `status` there, and separates assignment deadline from notes | **CODEX-OWNED. NOT FIXED** |
| B | `home_active_assignments_test.dart` render/layout assertion | **Overlaps Codex Task 01** | **CODEX-OWNED. NOT FIXED** |
| C | CP7 GPS gate | `gps_verification_screen.dart:54` gates on `_distance! <= siteVerificationDistanceThresholdMeters` (30.0) while the UI renders **"In Zone (< 30 m)"** - a reading of exactly 30.0 m passes a gate the copy describes as strictly less than. **No accuracy or staleness gate exists anywhere in the GPS path.** `inspection_constants.dart:1` defines the shared 30.0 constant; `site_map_screen.dart:100` repeats the same `<=` | **CODEX-OWNED. NOT FIXED** |
| D | Latent checklist rework reset gap | `hydrateForRework` (`inspection_provider.dart:296`) repopulates `_siteCondition` / `_zoningObservations` from prior answers and deliberately resets nothing, while `completed_inspection_detail_screen.dart` offers per-step rework via `_reworkStep(1..6)` that `hydrateForRework` ignores by hardcoding `_currentStep = 1` | **CODEX-OWNED. NOT FIXED** |
| E | Android readiness not release-grade | `applicationId` and `namespace` are both **`com.example.imaps_fieldsync`**; `android:label="imaps_fieldsync"`; and `compileSdk` / `minSdk` / `targetSdk` all delegate to `flutter.*`, so the SDK levels are whatever the *installed Flutter* supplies and are **unpinned by the project** | **CODEX-OWNED. NOT FIXED** |
| F | `webhook_test.dart` performs a live remote INSERT | `test/webhook_test.dart:104` calls `client.from('field_jobs').insert({...})` with no `@Tags`, `skip:` or `group:` guard, so it is eligible to run in a normal regression suite against the **shared live** database | **CODEX-OWNED. NOT FIXED** |

Item C is a real boundary defect, not a wording preference: the rule is
`distance <= 30.0` in code and `< 30 m` on screen. It was not "corrected" by
loosening the text, and the genuine FieldSync 30 m proximity rule was not
bypassed or weakened by any action in this pass.

Item F is why this pass ran **no** `flutter test` at all. The instruction to
build in isolation was honoured strictly, which also removed any risk of that
test writing to the live bridge.

### 6. Generated tracked artifact - hygiene finding, RECORDED ONLY

`android/build/reports/problems/problems-report.html` is a **Gradle-generated
report that is tracked in git** - the only file under `android/build/` that is.
The isolated build rewrote it, so it now differs from `HEAD`. The Groovy
space-assignment deprecation count in it moved `15` -> `30` because the report
now records `"requestedTasks":"assembleDebug"` rather than an empty task list.

**This was deliberately NOT fixed.** The file was not untracked, not removed,
not reverted and not committed, per instruction. Recorded as a repository
hygiene finding for Codex: a machine-generated report should not be version
controlled, and it will keep showing as a spurious diff on every build. Note
that the doubled warning count is a reporting artifact of the same deprecation
being evaluated in both the configuration-cache and normal paths, not a doubling
of real problems.

### 7. Loop 10 fixture - preserved exactly

| | |
|---|---|
| Remote fingerprint | `619cba4e60a4bd46fd3e53a777611cbd` over both Loop 10 jobs, identical on both sides of the build window |
| Local canonical fingerprint | `01ebebc059e57f17bbc80f974e3fc01b` for `site_inspections` id 41, unchanged |
| Total `field_jobs` | 16 - no job created or deleted |
| Loop 10 job `1f9df2ac-â€¦` | `bridge_source_id = rosario-imaps-local-0921-a`, `in_progress`, `current_step = 1`, `started_at 2026-10-01T03:39:49.20847+00`, `updated_at 2026-10-01T03:39:49.349537+00` - byte-identical, never a target of any write |
| Fixture status | **Frozen. Not cleaned up, not altered, not re-created.** Ready for onsite resume against `APP-2026-00030` |

No GPS value was faked, no FieldSync proximity rule bypassed, no completion
manufactured, and no inspection progress modified at any point in this pass.

### 8. Loop 10 status - UNCHANGED

Loop 10 remains **PARTIAL - FIELD ACCEPTANCE PENDING**. CP1-CP6 PASS, CP7-CP13
and the Round 1 -> 2 retention proof remain unproven and still require physical
presence within 30 m of the San Carlos parcel. The backend-side readiness work
in this entry does not advance a single checkpoint, and nothing here is a
regression.

### 9. Deliberately not done

No FieldSync source edited. No FieldSync audit finding fixed. No Codex Active
Assignments branch touched. `problems-report.html` not untracked or reverted.
No `flutter test` executed, so no live remote INSERT. No fixture alteration. No
`master` merge, sync, rebase or push. No branch merged. No `.env` or
`.env.testing` modification, staging or commit. No credential, token, handshake
key or database password recorded.

---

# LOOP 10 â€” ONSITE HANDOFF FREEZE (2026-10-02)

**Branch:** `fix/bridge-source-namespace-collision` Â· **HEAD:** `61aaab5`
**Status:** **PARTIAL / FIELD ACCEPTANCE PENDING** â€” unchanged, and it cannot
become anything else until a human stands at the San Carlos parcel.

This section is a **read-only documentation checkpoint**. It is not a new
implementation loop. Nothing here advanced a checkpoint, fixed a FieldSync
finding, or altered the frozen fixture.

---

## 1. FROZEN BASELINE â€” verified read-only at freeze time

The one fixture every onsite checkpoint must use. **No replacement fixture, no
mock GPS, no bypass, no second application.**

| | |
|---|---|
| Application | `APP-2026-00030` (local application **145**) |
| Parcel | **77**, **San Carlos** â€” the 30 m site |
| Inspection | **41** (Round 1) |
| Remote `field_job` | `1f9df2ac-e7a5-4ea2-a6de-89f5ebd2a999` |
| Bridge source | `rosario-imaps-local-0921-a` |
| Inspector | Gemini, `7abb9a75-8df1-491c-8677-de2da43af494` |
| Remote application | `b108513f-b1e8-4415-a088-b4107fc4374b` |
| Remote parcel | `cf974dc9-d219-4f9d-9776-40e237c12d34` |

| Field | Frozen value |
|---|---|
| `status` | `in_progress` |
| `current_step` | `1` |
| `started_at` | `2026-10-01T03:39:49.20847+00` |
| `updated_at` | `2026-10-01T03:39:49.349537+00` |
| `step_timestamps` | `{"1": "2026-10-01T03:37:50.742199Z"}` |
| `confirmed_latitude` / `confirmed_longitude` | `NULL` / `NULL` |
| `gps_accuracy_m` / `gps_confirmed_at` | `NULL` / `NULL` |
| `inspection_result` | `NULL` |
| `submitted_at` | `NULL` |
| `photo_count` | `0` |
| checklist counts | not present on the remote row (0 / 0) |

Local canonical `site_inspections` 41: `zoning_application_id 145`,
`parcel_id 77`, `status assigned`, `delivery_status delivered`, all four GPS
columns `NULL`, `completed_at` `NULL`, `submitted_at` `NULL`, no checklist data.

**Rounds for application 145: exactly 1.** Round 2 does not exist yet â€” that is
the correct CP13 starting point, and its absence is the thing CP13 must change.

### Duplicate-identity proof

```
local_inspection_id = 41, any namespace      -> 1
(rosario-imaps-local-0921-a, 41)             -> 1
total field_jobs rows                        -> 16
distinct local_inspection_id values          -> 16
application mirror b108513f-...              -> 1
parcel mirror cf974dc9-...                   -> 1
```

16 rows across 16 distinct local ids: **no local id carries more than one
`field_jobs` row anywhere in the namespace.** Bridge identity
`(bridge_source_id, local_inspection_id)` resolves uniquely.

### What this baseline does NOT prove

It proves the fixture is **intact and unambiguous**. It proves **nothing** about
CP7â€“CP13. Those rows are unexecuted, and a clean starting state is a
precondition for acceptance, never a substitute for it.

---

## 2. CHECKPOINT NUMBERING — LOCKED TO THE HISTORICAL CANONICAL SEQUENCE

**CP1–CP13 are historical acceptance identifiers and they are canonical. They are
not renumbered.** A FieldSync workflow step is a *different kind of thing* from a
Loop 10 checkpoint, and conflating the two is the specific error this section
exists to prevent.

### The two concepts

- A **FieldSync Step** is one screen in the app's six-step inspection workflow.
- A **Loop 10 CP** is a historical acceptance identifier, fixed when the loop was
  written, and stable thereafter.

One acceptance checkpoint may contain several FieldSync steps, and one FieldSync
step may be a precondition of a checkpoint rather than the checkpoint itself. So
**FieldSync Step 3 = Photos does not mean Loop 10 CP9 = Photos.** FieldSync
Steps 3, 4, 5 and 6 are all **subchecks of CP8**, not CP9 through CP12.

### CROSSWALK — app workflow versus Loop 10 acceptance

| APP WORKFLOW | LOOP 10 ACCEPTANCE |
|---|---|
| GPS Verification | **CP7** |
| Offline / resume | **CP8** |
| Photos | **CP8 subcheck** (FieldSync Step 3) |
| Checklist | **CP8 subcheck** (FieldSync Step 4) |
| Findings | **CP8 subcheck** (FieldSync Step 5) |
| Review screen | **CP8 subcheck** (FieldSync Step 6) |
| Final Submit | **CP9** |
| Reverse Sync | **CP10** |
| Requires Reinspection | **CP11** |
| Round 2 Assignment | **CP12** |
| Round 2 Delivery | **CP13** |

### Locked labels

| CP | Label |
|---|---|
| CP7 | Successful onsite GPS / proximity acceptance |
| CP8 | Field execution + offline/reconnect acceptance |
| CP9 | Final Submit |
| CP10 | Reverse Sync to iMAPS |
| CP11 | Planning Officer — Requires Reinspection |
| CP12 | Round 2 Assignment |
| CP13 | Round 2 Delivery / FieldSync visibility |

*Historical note: an earlier draft of this handoff promoted FieldSync Steps 3–6
into CP9–CP12. That was rejected and corrected before onsite use. The canonical
STATUS table above was never renumbered.*

---

## 3. ONSITE EXECUTION ORDER

**Do not collapse checkpoints.** Each is verified in all three systems before the
next begins. FieldSync owns Steps 1–6; the Planning Officer acts in iMAPS.

**Step 0 — Reconfirm the frozen fixture.** Before any device action, confirm the
section 1 baseline still holds: `APP-2026-00030`, inspection **41**, job
`1f9df2ac-…`, `status in_progress`, `current_step 1`, all four GPS columns NULL,
`submitted_at` NULL. Create nothing. If any of it has moved, **STOP** and escalate
rather than continuing on a drifted fixture.

### CP7 — Successful onsite GPS / proximity acceptance

- **User action:** On site at San Carlos parcel 77, open the task, reach
  *GPS verification* and confirm the location.
- **FieldSync:** the control enables only inside the radius; after confirming the
  step completes and the app advances.
- **Supabase:** `field_jobs` for `1f9df2ac-…` gains non-NULL
  `confirmed_latitude`, `confirmed_longitude`, `gps_accuracy_m`,
  `gps_confirmed_at`; `step_timestamps` gains key `"2"`; `status` stays
  `in_progress`; `submitted_at` stays `NULL`.
- **iMAPS:** unchanged — GPS is FieldSync-owned and the local round keeps all four
  columns NULL until a completed round is pulled.
- **Evidence:** screenshot showing **distance and accuracy**; post-confirm screen;
  the four remote values with timestamps.
- **STOP before CP8** unless: distance genuinely under 30 m, all four GPS columns
  non-NULL, `current_step` advanced, `submitted_at` still NULL.

### CP8 — Field execution + offline/reconnect acceptance

CP8 is **one** checkpoint covering field execution, and it carries four
subchecks. **These are FieldSync Steps, not CP numbers.** Each subcheck keeps its
own evidence and its own stop condition.

#### CP8 subcheck A — FieldSync Step 3, Photographic Evidence

- **User action:** complete *Photos* with genuine on-site photographs.
- **FieldSync:** photos attach to **this** job only; count rises from 0.
- **Supabase:** `photo_count` > 0, `photo_paths` populated, `field_job_photos`
  rows exist for `1f9df2ac-…` with real coordinates.
- **iMAPS:** unchanged.
- **Evidence:** photo grid screenshot; photo count; confirmation the photos
  belong to this job. **Never photograph a screen containing a token, PIN,
  credential or key.**
- **Subcheck stop:** photo count > 0 remotely, and no photo belongs to another
  task.

#### CP8 subcheck B — FieldSync Step 4, Checklist

- **User action:** complete *Checklist* item by item.
- **FieldSync:** every item toggles and persists; nothing resets on navigating
  away and back.
- **Supabase:** checklist counts reflect real progress and `checklist_data`
  matches what was ticked.
- **iMAPS:** unchanged.
- **Evidence:** partially completed checklist **and** completed checklist;
  remote counts alongside.
- **Subcheck stop:** counts consistent, no item silently reverted, and no
  cross-contamination from another task.

#### CP8 subcheck C — FieldSync Step 5, Findings

- **User action:** complete *Findings* — findings, observations, discrepancies,
  recommendations, inspector notes and the compliance verdict.
- **FieldSync:** entries persist per step; nothing bleeds into another step or
  another task.
- **Supabase:** `findings`, `observations`, `discrepancies`, `recommendations`,
  `inspector_notes`, `is_compliant` populated with exactly what was entered.
- **iMAPS:** unchanged.
- **Evidence:** findings entries before and after navigating away and back;
  remote values.
- **Subcheck stop:** every entered field round-trips unchanged.

#### CP8 subcheck D — FieldSync Step 6, Review screen / pre-submit validation

- **User action:** review on the final step and confirm the pre-submit summary is
  complete and correct. **Do not submit yet** — submission is CP9.
- **FieldSync:** the review screen shows every prior step's captured value, with
  nothing missing or blank.
- **Supabase:** unchanged by the review screen itself.
- **iMAPS:** unchanged.
- **Evidence:** screenshot of the complete review summary, one shot per
  sub-section so each is legible.
- **Subcheck stop:** the review screen shows all of photos, checklist, findings
  and GPS as present. If anything is missing, **stop here** — do not submit a
  partial inspection.

#### CP8 offline / reconnect behaviour

- **User action:** enable airplane mode partway through field execution, continue
  working, then restore connectivity and let the outbox drain.
- **FieldSync:** work continues offline with no data loss; a pending-sync
  indicator is visible; after reconnect it clears.
- **Supabase:** nothing required during the offline window; after reconnect the
  outbox applies the queued work.
- **iMAPS:** unchanged.
- **Evidence:** offline/pending indicator; a value typed while offline, still
  present afterwards; post-reconnect cleared indicator.
- **STOP before CP9** unless: all four subchecks passed **and** offline work
  survived the reconnect.

### CP9 — Final Submit

- **User action:** submit the completed inspection.
- **FieldSync:** submission accepted; the task reads **Completed**.
- **Supabase:** `status` → `completed`, `current_step` → `6`, `submitted_at` set
  to a real timestamp, and **all prior evidence still present** — photos,
  checklist, findings, GPS, `step_timestamps`.
- **iMAPS:** not yet — the local round stays as-is until CP10.
- **Evidence:** Completed state showing step 6/6; remote `status`,
  `current_step`, `submitted_at`; a re-read of every evidence column.
- **STOP before CP10** unless: `status = completed`, `current_step = 6`,
  `submitted_at` non-NULL, and **no evidence column was cleared**. Completed must
  remain Completed.

### CP10 — Reverse Sync to iMAPS

- **User action:** Planning Officer runs the reverse sync, scoped to this
  inspection.
- **iMAPS:** `site_inspections` **41 alone** reflects completion — status
  completed, `completed_at` and `submitted_at` populated, findings carried across,
  `delivery_status` unchanged. **No other inspection mutated.**
- **FieldSync / Supabase:** unchanged by the sync.
- **Evidence:** sync output showing the scoped target; inspection 41 before and
  after; explicit confirmation no other round moved.
- **STOP before CP11** unless: the sync touched inspection 41 and nothing else,
  and Round 1 is still intact.

### CP11 — Planning Officer selects Requires Reinspection

- **User action:** the PO files a technical review with the *Requires Reinspection*
  decision, with assignment instructions and dates.
- **iMAPS:** a **new** `site_inspections` row for application 145 with
  `id != 41`, `reviewed_site_inspection_id = 41`, `status assigned`. The completed
  Round 1 is **preserved and unmodified**.
- **FieldSync / Supabase:** unchanged at this instant — the new round is not
  assigned or delivered yet.
- **Evidence:** the review row with its `review_round`; the new inspection id;
  explicit proof Round 1 is untouched and still Completed.
- **STOP before CP12** unless: a new round exists, `reviewed_site_inspection_id`
  points at 41, and Round 1 was not modified.

### CP12 — Round 2 Assignment

- **User action:** the PO assigns the **new** Round 2 inspection to an inspector.
- **iMAPS:** the new inspection gains its inspector and provenance — an initial
  assignment, **not** a transfer, so no handover reason. Round 1 unchanged.
- **FieldSync / Supabase:** not yet delivered; CP13 covers that.
- **Evidence:** the new inspection id, its inspector, and the provenance row
  (`assignment_type = initial`, `from_planning_officer_id` NULL,
  `reason` NULL); Round 1 still Completed.
- **STOP before CP13** unless: the new round has a correct inspector and
  provenance, and Round 1 is untouched.

### CP13 — Round 2 Delivery / FieldSync visibility

- **User action:** the delivery runs through the bridge to FieldSync; the assigned
  inspector opens the app.
- **Supabase:** a **new** `field_jobs` row with a **new UUID**,
  `bridge_source_id = rosario-imaps-local-0921-a`, its **own**
  `local_inspection_id`, `assigned_inspector_id` equal to the newly chosen
  inspector, status not in progress, all GPS columns NULL, `submitted_at` NULL.
  **Total `field_jobs` goes 16 → 17**, with 17 distinct local ids.
- **FieldSync:** the new task is visible **on the newly assigned inspector's
  device only**, with the right application, round and instructions.
- **iMAPS:** both rounds present — Round 1 Completed, Round 2 open and assigned.
- **Evidence:** new inspection id **and its UUID**; both `field_jobs` rows side
  by side proving distinct UUIDs; the FieldSync dashboard on the assigned
  inspector's device; confirmation Round 1 is still Completed.
- **STOP immediately** unless: a new round exists, Round 1 was not modified, no
  duplicate job appeared, and the task is on the right device.

---

## 4. GPS ONSITE ACCEPTANCE CARD (CP7)

### A. BEFORE successful verification â€” expected

```
field_jobs.status                      in_progress
field_jobs.current_step                1
field_jobs.confirmed_latitude          NULL
field_jobs.confirmed_longitude         NULL
field_jobs.gps_accuracy_m              NULL
field_jobs.gps_confirmed_at            NULL
```

A confirmed reading is **never** pre-seeded. All four must be NULL at freeze and
immediately before the attempt.

### B. OUTSIDE ZONE â€” already observed, PASS

Observed from the operator's location at roughly **23 km** from the parcel: the
control read **Too Far / Outside Zone** and could not be completed. This is the
genuine FieldSync proximity rule working, and it is the correct negative control
for CP7 â€” a check that cannot fail proves nothing.

Expected in that state: verification blocked, **no** step advancement, **no**
confirmed-GPS persistence, all four GPS columns still NULL afterwards.

### C. INSIDE VALID ZONE â€” NOT SIMULATED

Nothing here may be simulated, faked or bypassed. The onsite operator must be
**physically at San Carlos parcel 77**, and these must be observed on the real
device:

- the app reports a distance genuinely under 30 m from the assigned parcel;
- the displayed accuracy figure is captured in the evidence;
- the verify control is enabled only once inside the radius;
- after confirming, Step 2 completes and the app advances.

Exact remote values that must change after a successful verification:

```
field_jobs.confirmed_latitude     NULL -> <real latitude, parcel 77>
field_jobs.confirmed_longitude    NULL -> <real longitude, parcel 77>
field_jobs.gps_accuracy_m         NULL -> <the accuracy the device reported>
field_jobs.gps_confirmed_at       NULL -> <real UTC confirmation timestamp>
field_jobs.step_timestamps        gains key "2"
field_jobs.status                 in_progress (unchanged)
field_jobs.submitted_at           NULL (unchanged)
```

The coordinates must be the device's real fix near San Carlos. **The parcel
centroid is not a substitute and must never be written in place of a real fix.**

### OPEN FIELDSYNC FINDINGS â€” NOT FIXED BY CLINE

Reported for awareness during the gate audit. **Not implemented, not assigned,
not scheduled here.** Each is a real observation about the current code.

1. **Boundary mismatch between code and on-screen text.**
   `lib/modules/inspection/screens/gps_verification_screen.dart:54` gates on
   `_distance! <= siteVerificationDistanceThresholdMeters` where the constant is
   `30.0`, while the interface renders **"In Zone (< 30 m)"** and **"Approach
   site (< 30 m)"**. A reading of exactly 30.0 m **passes** a gate the copy
   describes as strictly less than. `site_map_screen.dart:100` repeats the same
   `<=`. *Onsite impact:* a reading of precisely 30.0 m would be accepted while the
   screen says the rule is `< 30`. **Does not block** physical acceptance at a
   genuine sub-30 m distance, which is the case actually being tested.

2. **No accuracy or staleness gate.**
   The GPS path checks distance only. Nothing in `lib/` constrains the reported
   accuracy, and nothing bounds how old a cached fix may be. *Onsite impact:* a
   coarse or stale fix inside the radius would be accepted. **Does not block**
   physical acceptance; it is a robustness gap, not a failure of the 30 m rule.

The genuine 30 m proximity rule was **not** weakened, loosened or bypassed by
any Cline action, and the on-screen text was not edited to match the code.

---

## 5. ONSITE EVIDENCE CHECKLIST

Practical, no source inspection needed. One row per checkpoint.

**For every checkpoint capture:** the displayed application / reference number,
the step number, the distance and accuracy where relevant, and the resulting
state.

| CP | Capture |
|---|---|
| CP7 | GPS reading with **distance and accuracy**; post-confirm screen; remote `confirmed_latitude` / `confirmed_longitude` / `gps_accuracy_m` / `gps_confirmed_at` |
| CP8 · Step 3 Photos | photo grid; photo count; confirmation photos belong to this job |
| CP8 · Step 4 Checklist | partially completed checklist; completed checklist; remote checklist counts |
| CP8 · Step 5 Findings | findings entries before and after navigating away and back; remote values |
| CP8 · Step 6 Review | complete pre-submit summary, one legible shot per sub-section, **before** submitting |
| CP8 · offline | offline/pending-sync indicator; a value typed while offline, still present after; post-reconnect cleared indicator |
| CP9 | Completed state showing step 6/6; remote `status` / `current_step` / `submitted_at`; evidence columns still intact |
| CP10 | sync output showing the scoped target; inspection 41 before/after; **no other round moved** |
| CP11 | review row with its `review_round`; the new inspection id; proof Round 1 is untouched and still Completed |
| CP12 | new inspection id, its inspector, and the provenance row (`initial`, from NULL, reason NULL); Round 1 unchanged |
| CP13 | new inspection id **and UUID**; both `field_jobs` rows side by side; FieldSync dashboard on the assigned inspector's device; Round 1 still Completed |

**Never capture:** any screen showing a token, API key, bearer credential,
handshake key, database password, session cookie, or another person's PIN. If a
credential is ever visible in a screenshot, stop and retake it.

---

## 6. NO-GO CONDITIONS â€” STOP TESTING

Any single condition below means: **STOP TESTING Â· PRESERVE STATE Â· CAPTURE
EVIDENCE Â· NO MANUAL DB REPAIR.** Do not edit the database, do not "fix" the row,
do not re-run a delivery to paper over a symptom, and do not create a
replacement fixture. Escalate with the evidence.

| # | Condition |
|---|---|
| 1 | The wrong application or task appears on the device |
| 2 | The task is assigned to the wrong inspector |
| 3 | A duplicate job appears for the same round |
| 4 | Progress jumps unexpectedly (a step completes without being done) |
| 5 | Another task's checklist, findings or photos appear on this task |
| 6 | GPS verification succeeds while plainly outside the allowed radius |
| 7 | Data entered offline disappears after restart or reconnect |
| 8 | A photo is marked synced when its upload actually failed |
| 9 | A Completed task reverts to Ongoing |
| 10 | Reverse sync updates the wrong inspection round, or more than one |
| 11 | *Requires Reinspection* modifies the old completed round instead of creating a new one |
| 12 | A second `field_jobs` row appears for local inspection 41 |
| 13 | Round 2 is created without assignment instructions, dates or inspector |
| 14 | A new round's task is visible on the wrong inspector's device |
| 15 | Confirmed GPS coordinates are the parcel centroid rather than a real fix |
| 16 | Any credential, token or key is exposed in evidence |

---

## 7. AUTOMATED EVIDENT ALREADY AVAILABLE â€” AND ITS LIMIT

CP1â€“CP6, the authorization matrix, diagnostics, notifications and the Loops 1â€“9
regression sweep are proven by executed tests against live canonical and live
Supabase. CP7's outside-zone gate is proven by direct observation.

**Automated evidence does not replace physical acceptance.** A passing suite
proves the contract holds for the inputs it exercised. It cannot prove that
FieldSync's GPS gate accepts a genuine sub-30 m fix on a real handset, that
offline work survives a real reconnect, that real photographs upload, or that a
real reinspection round reaches the right inspector's dashboard. Only a person at
the parcel can produce those.

No mock GPS, no bypass, and no replacement fixture is permitted for any
checkpoint.

---

## 8. FIRST ACTION ON ARRIVAL AT ROSARIO

1. Do **not** create anything. Confirm the frozen baseline in section 1 still
   matches: `APP-2026-00030`, inspection 41, job `1f9df2ac-â€¦`, `in_progress`,
   `current_step 1`, all four GPS columns NULL, `submitted_at` NULL.
2. Use the locked numbering in section 2: **CP9 is Final Submit**, and Photos,
   Checklist, Findings and the Review screen are **CP8 subchecks**, not
   CP9-CP12.
3. Open the task on the Gemini device **at San Carlos parcel 77** and begin
   **CP7**.
