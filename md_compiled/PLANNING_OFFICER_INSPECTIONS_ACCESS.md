# Planning Officer access to Site Inspections and Reports & Support

**Date:** 2026-10-09
**Area:** Site Inspections (access), Reports & Support (read access + UI restyle)
**Status:** Uncommitted on `master` working tree — review before merging

## TL;DR

- **Site Inspections:** `/site-inspections` and `/site-inspections/{id}` now admit **Admin and Planning Officer**. A Planning Officer sees only the rounds **they assigned** (`site_inspections.assigned_by_imaps_user_id`). Admins still see everything, and Site Inspectors are still refused.
- **Reports & Support:** a Planning Officer can now **read** an Application Support report if they own the application **or** assigned an inspection round on it. **Handling (Mark in review / Resolve / Won't fix) still requires owning the application.**
- **Sync from FieldSync stays Admin-only.**
- No migration, no new dependency, and no change to how rounds or applications get assigned.

## ⚠ Action needed (data, not code)

The 3 current Application Support reports (DR-2026-0003, -0005, -0006) are on **APP-2026-00025** and **APP-2026-00026**. Neither application has an assigned Planning Officer, and iMAPS has **no inspection rounds** on either. FieldSync's jobs point to rounds that no longer exist locally, so the report page says "originating inspection could not be verified".

So **no Planning Officer can see these reports yet.** An Admin needs to open each application → **Details** → **Assignment & inspection delivery** and assign a Planning Officer. Don't do this from the command line: the UI records who made the assignment, and the command line would skip or misattribute that record.

## Why

Planning Officers schedule site inspections (`technical-review.assign-inspector`), but they couldn't open the Inspections module to follow up on them. Inspectors' support reports are raised from those same inspections, so Planning Officers also need to read the reports on applications where they scheduled the fieldwork.

## Behavior

### Site Inspections

| Viewer | `/site-inspections` list | `/site-inspections/{id}` |
|---|---|---|
| Admin | All rounds (unchanged) | Any round |
| Planning Officer | Only rounds where `assigned_by_imaps_user_id` = their user id | Their own round → 200. Anyone else's round → **404** |
| Site Inspector | 403 (unchanged) | 403 (unchanged) |
| Guest | Redirect to login (unchanged) | Redirect to login (unchanged) |

- A Planning Officer gets a 404 for another officer's round, not a 403, so the page doesn't confirm the round exists.
- On the detail page, **Round History** still lists every round on that parcel for context. Rounds the viewer can't open show as plain text, not links.
- The "Admin Support Actions" (Sync from FieldSync) box only appears for Admins.

### Reports & Support (Application Support)

| Planning Officer's relationship to the application | Sees the report | Can handle it |
|---|---|---|
| Owns it (`assigned_planning_officer_id`) | Yes (unchanged) | Yes (unchanged) |
| Assigned an inspection round on it, but doesn't own it | **Yes (new)** | No. The page is read-only, and a forged `POST /diagnostics/{id}/handle` returns **403** |
| Neither | No | No |

Admins still see everything. Planning Officers still can't see Technical Issues (403).

## Code changes

| File | Change |
|---|---|
| `app/Models/SiteInspection.php` | New `scopeVisibleTo(?User $viewer)`. Admin → no filter. Planning Officer → `where assigned_by_imaps_user_id = id`. Anyone else → no rows. **This is the only place the "rounds I assigned" rule is defined**, and both features use it. |
| `app/Http/Controllers/SiteInspectionController.php` | `index()` applies `visibleTo()` to the pending and completed queries, so counters, the PO-review summary and the operations overview are built from the filtered set. `show()` uses `visibleTo()->findOrFail()`. Each Round History entry gets a `viewable` flag. |
| `app/Support/ReportingVisibility.php` | `canViewReport()`: owner **or** has a `visibleTo()` round on the application. The extra lookup runs only when the ownership check fails, and once per instance (memoized per viewer). It fails closed if the `assigned_by_imaps_user_id` column is missing. `handlingStatuses()`, `canNotify()` and escalations are **untouched**. |
| `routes/web.php` | `site-inspections.index` and `site-inspections.show`: `role:Admin` → `role:Admin,Planning Officer`. `sync-from-fieldsync` is still `role:Admin`. |
| `resources/js/Components/Sidebar.jsx` | The Inspections entry is shown to Planning Officers (`adminOnly: false`, and the extra PO exclusion is removed). Display only; the server enforces access. |
| `resources/js/Pages/Site Inspections/Show.jsx` | The sync box renders only for `Admin`. Round History rows with `viewable === false` render as a `<div>`, not a `<Link>`. |

## Things to know

- **Older inspection rounds are Admin-only.** 29 of the 33 current rounds have a null `assigned_by_imaps_user_id`, because they were created before that column was filled in. We don't guess who assigned them. Every new assignment from `TechnicalReviewController` and `ApplicationController` already records the assigner.
- **Site Inspections follows who assigned the round, not who owns the application.** After an application is handed over (`applications.reassign-planning-officer`), the new owner won't see rounds the previous officer scheduled. Changing it to "assigned by me OR on an application I own" is a one-line change in `scopeVisibleTo`, but it needs a product decision first.
- **Read access to a report doesn't grant authority over it.** A Planning Officer who sees a report only because of an inspection round they assigned can't respond to it. The application owner (or, if no one owns it, an Admin triaging with Mark in review) handles it.
- The PO-only `retry-delivery` and `reassign-inspector` routes are untouched.
- The Planning Officer **Overview** page still has no "Site inspections" shortcut. Only the sidebar entry was added.

## Also in this change set: Reports & Support restyle

This is UI only. The data, permissions and request logic are untouched.

- `Diagnostics/Index.jsx`: report types are now tabs, each report is a compact row, reports that block field work get a red edge and a "Blocks field work" badge, and times are relative.
- `Diagnostics/Show.jsx`: two columns. The inspector's report is on the left; Report identity, Handling and the Official response are on the right. Resolve is the main button and Won't fix is secondary. Both ask for confirmation, because they're final.
- `Diagnostics/ReportUi.jsx`: shared styles updated. Adds the `primary`, `Ago` and `BlockingBadge` exports.

## Tests

- **PHPUnit `tests/Unit`:** no new failures. The same 26 tests fail before and after these changes, all for reasons unrelated to them. This includes `ReportingVisibilityTest`'s query-budget and ownership-handover tests, which still pass.
- **`tests/js/check-detail-operations.cjs`:** passes.
- **`tests/js/check-reports-support.cjs`:** updated for the two-column layout, with stubs for the `@/utils/signOut` and `./DevelopmentSupport` imports. 38 of its 39 assertions pass. The remaining one (`!/escalation|imaps\.contact/` on the controller) was already out of date: it contradicts the Development Support escalation feature. Whoever owns that feature should decide whether to update the assertion or the feature.
- **`tests/js/check-page-parses.cjs`:** already failing before these changes, on `Auth/AuthUI.jsx`. Unrelated.
- **Manual requests** (real HTTP requests through the app, as each role): match the Behavior tables above.
  - Round History `viewable` flags were checked inside a database transaction that was rolled back.
  - Read-only report access was checked the same way: a simulated round on APP-2026-00025 assigned by a Planning Officer made DR-2026-0003 visible to them with no handling actions, and the forged handle POST returned 403. Nothing was saved.

## How to verify locally

**Site Inspections**
1. Log in as a Planning Officer who has scheduled an inspection. **Inspections** should appear in the sidebar and list only their rounds.
2. Open one of their rounds. There should be no "Admin Support Actions" box.
3. Open another officer's round id directly, e.g. `/site-inspections/3`. You should get a 404.
4. Log in as an Admin. You should see all rounds, and Sync from FieldSync should still be there.

**Reports & Support**
5. As a Planning Officer, open **Reports & Support**. You should see reports on applications you own or scheduled an inspection on, and nothing else.
6. Open a report on an application you scheduled an inspection on but don't own. It should be marked **Read only**, with no Handling section.
7. After an Admin assigns you to APP-2026-00025/00026 (see **Action needed**), their reports should appear with the full Handling section.
