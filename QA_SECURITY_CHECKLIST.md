# iMAPS – QA & Security Improvement Checklist

Working checklist for QA and security hardening. Items marked **[Finding]** were spotted while reading the code (file refs included) and should be verified and fixed. Everything else is a standard verification step. Tick boxes as you go.

Stack: Laravel (Inertia + React), PostgreSQL/PostGIS, Supabase (FieldSync bridge), LibreOffice permit PDF generation.
Roles: `Admin`, `Planning Officer`, `Site Inspector` (FieldSync only).

---

## 1. Security findings to fix first

| # | Priority | Finding | Where | Suggested fix |
|---|----------|---------|-------|---------------|
| S1 | High | **[Finding]** Generated permits are stored on the `public` disk. If `php artisan storage:link` has been run (`public/storage/permits` exists locally), anyone who guesses/knows the URL can fetch a permit without logging in, bypassing the auth + role checks on the download route. `GeneratedPermit::url()` also returns that public URL. | [ApplicationController.php:1731](app/Http/Controllers/ApplicationController.php#L1731), [GeneratedPermit.php:47](app/Models/GeneratedPermit.php#L47) | Store on the `local` (private) disk and serve only through `downloadSavedPermit`. Remove/stop using `url()`. |
| S2 | Medium | **[Finding]** `Content-Disposition` filename is concatenated unescaped from `file_name`. A name containing `"` or CR/LF can break the header. | [ApplicationController.php:1809](app/Http/Controllers/ApplicationController.php#L1809) | Use `response()->download()` / `Storage::download()` or `HeaderUtils::makeDisposition()`; sanitize `file_name` on save. |
| S3 | Medium | **[Finding]** Logout is excluded from CSRF validation. Forced-logout nuisance attack. | [bootstrap/app.php:19](bootstrap/app.php#L19) | Remove the exception; handle 419 on logout by redirecting to login (already done in `respond()`). |
| S4 | Medium | **[Finding]** `psql` command is built as a string with `DB_HOST`, `DB_USERNAME`, `DB_DATABASE` interpolated and unescaped. Values come from `.env` (not user input) but a bad value becomes shell injection. | [SettingsController.php:118](app/Http/Controllers/SettingsController.php#L118) | Pass an argument array to `Process::run([...])` (no shell). |
| S5 | Medium | **[Finding]** Shapefile/tile ZIP upload: path check only looks for `../` and a leading `/`; no limit on entry count or total uncompressed size (zip bomb). Windows drive paths (`C:\`) not rejected. | [SettingsController.php:45](app/Http/Controllers/SettingsController.php#L45), [:195](app/Http/Controllers/SettingsController.php#L195) | Cap entry count and sum of `statIndex()['size']`; reject `:` in names; check `.shp/.shx/.dbf` presence; use `realpath` containment check after extract. `mimes:zip` is only an extension/sniff check. |
| S6 | Low | **[Finding]** Login throttle is 5 attempts keyed on email + IP, but there is no `throttle` middleware on admin POSTs (`/users/reset-password`, `/users/sensitive-data`, `/api/forecast/generate`, report generation, uploads). | [routes/web.php](routes/web.php) | Add `throttle:` middleware on sensitive/expensive POSTs. |
| S7 | Low | **[Finding]** `dangerouslySetInnerHTML` on pagination labels. Laravel's paginator labels are safe today, but keep it that way. | [Users/Index.jsx:861](resources/js/Pages/Users/Index.jsx#L861), [TechnicalReview/Index.jsx:356](resources/js/Pages/TechnicalReview/Index.jsx#L356) | Replace with decoded text (e.g. map `&laquo;`/`&raquo;`) or confirm labels are never user-controlled. |
| S8 | Low | **[Finding]** `/ping` is unauthenticated and `/up` health route is exposed. Harmless, but confirm they return no version/env info. | [routes/web.php:19](routes/web.php#L19) | Keep minimal output. |
| S9 | Housekeeping | **[Finding]** Stray untracked file `nul` in repo root (Windows artifact) and mojibake comments (`â”€â”€`) in `routes/web.php`. | repo root, [routes/web.php](routes/web.php) | Delete `nul`; re-save file as UTF-8. |
| S10 | Housekeeping | **[Finding]** `.gitignore` notes `.env.testing` contained a real `DB_PASSWORD`, `APP_KEY`, `SUPABASE_SERVICE_KEY`. | [.gitignore](.gitignore) | `git log -p -- .env.testing` to confirm it never entered history. If it did, **rotate all three** and purge history. |
| S11 | Low (downgraded) | **[Fixed]** A real-looking `FORECAST_SERVICE_API_KEY` was hardcoded as the fallback default in `ForecastService` and is in git history (`e4a5160`, `2f81b3d`). The default is removed and the service now fails closed when the key is unset. **Verified not a live credential:** compared against `iMAPS-forecasting-service/.env`, the committed value differs (217 vs 219 chars), so it authenticates nothing; the service's own `.env` was never committed. | [ForecastService.php:22](app/Services/ForecastService.php#L22) | No rotation emergency. Keep the fallback gone (`tests/Unit/ForecastServiceConfigTest.php` enforces it). Rotate opportunistically if you want the dead value to stay dead. |
| S12 | Medium | **[Fixed]** `POST /api/forecast/generate` previously returned fabricated forecast pins and a fixed MAE 2.155 / WMAPE 30.2% whenever the microservice was missing or unreachable — invented numbers presented as model output. Now returns HTTP 503 and logs the cause. **Still open:** `ForecastService::getQuarterData()` (Dashboard timeline) continues to synthesise pins with `mt_rand()` and the same fixed metrics. | [ForecastService.php](app/Services/ForecastService.php), [ForecastController.php](app/Http/Controllers/ForecastController.php) | Replace `getQuarterData()` with real model output — Phase 1 of `LC_DEMAND_FORECAST_PLAN.md`. |

Already done well (keep, don't regress): parameterized `whereRaw` queries, `EnsureUserIsActive` ends live sessions, role middleware on admin/PO routes, login rate limiting, Authorization header redaction, unauthenticated-fetch returns JSON 401.

---

## 2. Security verification checklist

### Authentication & sessions
- [ ] Deactivated user is logged out on the very next request (web and `/api/user`).
- [ ] Session expiry on background `fetch()` returns JSON 401, not a redirect (see `SessionExpiryResponseTest`).
- [ ] Session cookie flags in production: `SESSION_SECURE_COOKIE=true`, `SESSION_HTTP_ONLY=true`, `SESSION_SAME_SITE=lax`.
- [ ] Session ID regenerates on login; invalidated on logout.
- [ ] Password policy enforced on register and admin reset (min length, not just "required").
- [ ] Admin password reset forces change on next login (or is otherwise audited).
- [ ] Email verification and password-reset links are signed and throttled (`routes/auth.php`).

### Authorization (test every route with every role + unauthenticated)
- [ ] Site Inspector gets 403 on all internal web routes (`Loop6RoleMatrixTest`).
- [ ] Planning Officer cannot reach Admin-only routes: `/users*`, `/settings*`, `/reports`, `register-new-account`, `/api/analytics/*`.
- [ ] **IDOR checks** – URLs take raw IDs; confirm a user can only touch records they own or are assigned: `/applications/{id}`, `/saved-permits/{permitId}`, `/site-inspections/{id}`, `/notifications/{id}`, `/applications/drafts/{id}` (drafts must be scoped to the owner).
- [ ] `/api/map/{layer}`: `layer` is whitelisted, not used as a table name.
- [ ] Status transitions (`update-status`, `submit-batch`, `assign-inspector`, reassign) reject illegal transitions and non-assigned users.
- [ ] Completed inspections are immutable (`Loop5` test) – verify via API, not just the UI.

### Input validation & injection
- [ ] Every POST/PUT/DELETE uses `$request->validate()` or a FormRequest (grep for `$request->input(` / `->all()` without validation).
- [ ] No `$guarded = []` / mass assignment on models that hold role, `is_active`, or status fields.
- [ ] Search endpoints (`global-search`, `applicant-lookup`, `parcels/verify`, tax-map lookup) escape `%` and `_` in LIKE terms and cap length.
- [ ] Dynamic SQL fragments (`$folderKey`, `$monitoringRoundDelivery` in `ApplicationController`) are built only from constants – never request input.
- [ ] Permit template `${TAG}` values cannot inject spreadsheet formulas (`=`, `+`, `-`, `@` prefix) – frozen-values step must neutralize them.

### File handling
- [ ] Upload limits and types enforced server-side (shapefile 50 MB, tiles 200 MB) – try a renamed `.exe`, a zip bomb, a zip with `..\` and `C:\` paths.
- [ ] Permit files are not reachable by direct URL (see S1) – try `/storage/permits/...` logged out.
- [ ] Temp dirs (`temp_tiles`, shapefile extract) are cleaned on failure paths.
- [ ] LibreOffice conversion has timeouts (set: 120 s / 90 s) and runs with a non-privileged user.

### Secrets & config
- [ ] Production: `APP_DEBUG=false`, `APP_ENV=production`, unique `APP_KEY`.
- [ ] `SUPABASE_SERVICE_KEY` is server-side only, never in `VITE_*` vars or Inertia props.
- [ ] `.env*` not tracked (`git ls-files | grep env`) and not served by the web server (document root = `public/`).
- [ ] Logs do not contain tokens, passwords, or applicant PII.
- [ ] `composer audit` and `npm audit` clean (or each finding triaged).
- [ ] No fallback secrets in source: `grep -rn "env('.*KEY', '" app config` returns nothing.
- [ ] `FORECAST_SERVICE_API_KEY` in the iMAPS `.env` matches `API_KEY` in the microservice's `.env` (mismatch = 401 on every forecast); unset means the endpoint returns 503, not invented data.
- [ ] PostGIS enabled in the target database (`SELECT extversion FROM pg_extension WHERE extname='postgis'`); `DB_CONNECTION=pgsql`, no `database/database.sqlite` in use.

### Transport & headers
- [ ] HTTPS enforced; HSTS enabled.
- [ ] Add security headers: `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`/`frame-ancestors`, `Referrer-Policy`, `Permissions-Policy`.
- [ ] CORS config does not allow `*` with credentials.

### Data protection / audit
- [ ] Sensitive-data reveal (`/users/sensitive-data`) is Admin-only, re-authenticates or is audit-logged.
- [ ] `AuditTrail` records: login, role change, deactivation, permit generate/delete, report export, uploads, status changes.
- [ ] Applicant PII (names, TCT numbers) is not exposed in notifications, search results, or reports to roles that don't need it.
- [ ] Backups: DB backup tables created by shapefile import (`CREATE TABLE ... AS TABLE`) are pruned.

---

## 3. QA checklist

### Automated tests – run before every merge
```bash
composer install && npm ci
php artisan test                      # Unit + Feature (Postgres integration tests need DB)
for f in tests/js/*.cjs; do node "$f" || break; done
npm run build                         # catches JSX/import errors
```
- [ ] All PHP tests green.
- [ ] All `tests/js/*.cjs` checks green.
- [ ] Postgres integration tests run via `tests/run-report-*-postgres.ps1` (Windows) or an equivalent shell script on Linux.
- [ ] Add a test for each security fix above (S1, S2, S3, S5 first). Pattern: copy `Loop6AccessBoundaryTest`.
- [ ] Pending working-tree changes (ReportController, SettingsController, ZoningApplication, GeneratePermitModal, Reports/Index, PermitReleaseValidationTest) have passing tests before commit.

### Manual regression – core flows
**Authentication**
- [ ] Login / logout / wrong password / 5 failed attempts lockout / deactivated account.
- [ ] Session timeout while on a form: submit shows "page expired" and recovers without data loss.

**Applications**
- [ ] Encode new application → reference number sequence correct, no duplicates when two users submit at once.
- [ ] Save draft → reopen → submit; delete draft (own only).
- [ ] Applicant lookup autofill; parcel verify by TCT with odd formatting (spaces, dashes, lowercase).
- [ ] Status update through the full lifecycle; invalid jumps rejected; status track and audit entries written.
- [ ] Amendment refs update.

**Technical review & inspections**
- [ ] Assign inspector, reassign inspector / planning officer (reason required).
- [ ] Submit batch; reinspection creates a new round (not overwrite); round labels correct.
- [ ] Delivery status panel and retry (only when eligible); admin delivery monitoring.
- [ ] FieldSync sync (single + scoped); handle Supabase down/timeouts gracefully.
- [ ] Secure photo reader requires auth and correct scope.

**Permits**
- [ ] Generate each permit type → Excel + PDF; verify tags all filled, no blank `${TAG}` left, formulas frozen.
- [ ] Release validation blocks incomplete applications (`PermitReleaseValidationTest`).
- [ ] Download, preview, delete saved permit; file removed from disk on delete.
- [ ] Behaviour when LibreOffice is missing (fallback driver) and when conversion times out.

**Maps, forecast, dashboard**
- [ ] Layers load; zoning lookup by coordinate and by parcel area; coordinates outside the municipality.
- [ ] Forecast generate (long-running): double-click does not start two runs; failure shows an error.
- [ ] Dashboard/overview counts match the Applications list totals.

**Reports & support**
- [ ] Report preview vs generate produce the same numbers; empty date range; very large range.
- [ ] Diagnostic report handle / escalate / recommendation / close; notify planning officers.

**Admin**
- [ ] Create user, update profile, reset password, deactivate, view logs.
- [ ] Upload shapefile: valid, corrupt, missing `.dbf`, wrong CRS; failure restores the backup table.
- [ ] Upload tiles: valid, no images, unsafe paths; previous tiles kept on failure; restore works.

**Notifications**
- [ ] Unread count, mark read, mark all, clear read, clear all – only affects the current user's notifications.

### Non-functional
- [ ] Accessibility: keyboard-only navigation of modals (focus trap, Esc closes), labels on all inputs, visible focus, colour contrast, status not conveyed by colour alone.
- [ ] Responsive: 1366×768 laptop and tablet widths for main tables and the map page.
- [ ] Browsers: current Chrome, Edge, Firefox.
- [ ] Performance: Applications list and dashboard with realistic row counts (check for N+1 queries via debugbar/`DB::listen`); map layer payload sizes.
- [ ] Error pages: 403, 404, 419, 500 render a friendly Inertia page, no stack trace in production.
- [ ] Time zones: timestamps display consistently (server vs. Supabase vs. browser).

---

## 4. Suggested order of work

1. S1, S10 (public permit files, secret history) – exposure risks.
2. S3, S4, S5, S2 – small, contained code fixes, each with a test.
3. Role × route matrix test covering every route in `routes/web.php` (generate the list with `php artisan route:list --json`).
4. Security headers + production config review.
5. S6–S9 cleanup.
6. Run the full manual regression above on staging before release; record results and date in the table below.

## 5. Sign-off log

| Date | Tester | Build/commit | Scope | Result | Notes |
|------|--------|--------------|-------|--------|-------|
|      |        |              |       |        |       |
