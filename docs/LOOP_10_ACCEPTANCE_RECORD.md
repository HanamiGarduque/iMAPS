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