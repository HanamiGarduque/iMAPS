<p align="center">
  <h1 align="center">iMAPS — Intelligent Geospatial Analytics & Land-Use Monitoring System</h1>
  <p align="center">
    <strong>Municipal Government of Rosario, Batangas</strong>
  </p>
  <p align="center">
    An enterprise spatial decision-support system for real-time land-use tracking, zoning permit administration, automated technical reviews, field inspection synchronization, and predictive urban growth analytics.
  </p>
</p>

---

## 🌟 Key Features

- **🗺️ Geospatial & Map Analytics (`/maps`)**
  - **Interactive GIS Viewport**: Built with MapLibre GL 3D & Leaflet for rendering barangay boundaries, zoning classification overlays, and land parcel boundaries.
  - **Land-Use Mix Monitoring**: normalised Shannon entropy index per barangay (−Σ p ln p ÷ ln 11 over the CLUP land-use categories), computed from the lot area filed in the last five years of recorded clearances, certificates and permits (`historical_data`) and compared against the CLUP 2030 plan mix. A time slider steps quarter by quarter through rolling five-year windows; the window is anchored on the latest filing, so each new import moves it forward.
  - **Urban Growth Forecasting**: Integration with a predictive forecasting service to project quarter-by-quarter land-use transitions and urban expansion. **Requires a separate FastAPI + XGBoost microservice that lives in its own repository** — see [Urban Growth Forecasting](#-urban-growth-forecasting-external-microservice).
  - **Landing Page**: The Overview page was removed; `/maps` is now the landing page. In-page help (`pageHelp.jsx`) explains each page.
  - **Tax Dec & Parcel Lookup**: Live verification of Tax Declaration numbers (Tax Dec / TCT) against spatial parcel boundaries.

- **📋 Zoning Application Docket (`/applications`)**
  - **End-to-End Workflow**: Complete lifecycle tracking: Application Encoding → Parcel Verification → Technical Review → Field Inspection Scheduling → Final Decision (Approval/Disapproval).
  - **Offline & Draft Storage**: Local storage backup and draft manager enabling Planning Officers to prepare application details offline.
  - **Applicant Municipality & Previous Records**: Applications capture the applicant's municipality, and the previous-record search was reworked for matching earlier filings.

- **🔍 Technical Review & Field Inspections (`/site-inspections`)**
  - **Inspector Allocation & Scheduling**: Assign field inspectors to specific pending applications with geographic provenance.
  - **Inspection Reports**: Structured checklist evidence is preserved in reports, reassignment refreshes the inspector report, and Planning Officers can read only the private photos of their own inspections.
  - **Supabase Cloud Sync**: Bidirectional sync between local Laravel backend and mobile inspector applications (`PushInspectionToSupabase`, `PullCompletedInspections`).

- **📊 Analytics & Reporting (`/reports`)**
  - **Export Formats**: Custom reports are exported as Excel (`simplexlsxgen`) or CSV; the old Blade/PDF report view and in-report chart rendering were removed. Permit documents are still generated as XLSX/PDF (see Permit storage).
  - **Report Builder**: Preset reports (monthly applications, by barangay, fees by month, land-use summary, full list) with a live preview. Reports show the `form_number` beside the `reference_number`.

- **🔐 Security, Audit Trail & Role-Based Access (`/users`)**
  - **Granular RBAC**: Role middleware distinguishing `Admin` and `Planning Officer` capabilities.
  - **Comprehensive Audit Logging**: Event logging (`AuditTrail`) tracking sensitive data access, password resets, status transitions, and system activities.

---

## 🏗️ Technology Stack

| Layer | Technology / Library |
| --- | --- |
| **Backend Framework** | [Laravel 12](https://laravel.com) (PHP 8.2+) |
| **Frontend Architecture** | [Inertia.js v3.1](https://inertiajs.com) with [React 18](https://react.dev) |
| **Styling & UI** | [Tailwind CSS v3](https://tailwindcss.com), Headless UI |
| **Build Tooling** | [Vite 7](https://vitejs.dev), `@vitejs/plugin-react` |
| **GIS & Mapping** | [MapLibre GL v6](https://maplibre.org), [Leaflet v1.9](https://leafletjs.com), `react-leaflet` |
| **Data Visualization** | [Chart.js v4](https://www.chartjs.org), [Recharts v3](https://recharts.org) |
| **Cloud & Mobile Sync** | [Supabase JS Client](https://supabase.com) (`@supabase/supabase-js`) |
| **Export Engines** | `barryvdh/laravel-dompdf`, `shuchkin/simplexlsxgen`; permit documents via `phpoffice/phpword` / `phpspreadsheet` (PDF through headless LibreOffice) |
| **Database** | PostgreSQL + PostGIS |
| **Permit Preview** | `pdfjs-dist` (in-browser PDF rendering of generated permits) |
| **Production Runtime** | Docker image on [Railway](https://railway.com): [FrankenPHP](https://frankenphp.dev) (Caddy) + `supervisord` (web, queue worker, scheduler), behind Cloudflare (WAF + origin secret) |
| **File Storage** | Railway volume (`/data`); generated permits optionally on **Cloudflare R2** via `league/flysystem-aws-s3-v3` |

---

## 🚀 Getting Started

### Prerequisites

- **PHP** >= 8.2 (with `pdo`, `pdo_pgsql`, `mbstring`, `openssl`, `gd` extensions)
- **Composer** >= 2.0
- **Node.js** >= 18.x & **npm**
- **PostgreSQL** >= 14 **with the PostGIS extension** — mandatory, see below

> **PostGIS is a hard requirement, not a preference.** The schema declares
> `geometry(MultiPolygon,4326)` / `geometry(Polygon,4326)` columns on `barangay_boundary`,
> `land_parcels`, `land_use_plan`, `parcels` and `rosario_boundary`, and the map, search,
> tax-map lookup and forecast code queries them with `ST_SetSRID`, `ST_Transform`,
> `ST_Intersects` and `ST_Centroid`. Plain PostgreSQL will not do, MySQL will not do, and
> **SQLite is not a fallback** — any stray `database/database.sqlite` is a leftover, not an
> option. `php artisan migrate` fails with instructions if PostGIS is missing or if
> `DB_CONNECTION` is anything but `pgsql` (the SQLite code path exists only so the PHPUnit
> suite can run in memory).
>
> - **Windows:** install PostgreSQL with the EDB installer, then use its bundled **Stack
>   Builder** to add *PostGIS*. Stack Builder is the only supported route; a plain
>   PostgreSQL install has no PostGIS packages.
> - **Linux:** `sudo apt install postgresql-16-postgis-3` (match your server version).
> - Then enable it **inside the iMAPS database** (installing the package is not enough):
>   ```bash
>   psql -U postgres -d imaps_db -c "CREATE EXTENSION postgis;"
>   ```
> - Also needed for shapefile import: the `shp2pgsql`, `psql` and `gdalsrsinfo` binaries on
>   `PATH` (PostGIS + GDAL).

> **PHP 8.2 constraint.** The permit generation feature pulls in `phpoffice/phpspreadsheet` and
> `phpoffice/phpword`, whose transitive dependency `maennchen/zipstream-php` must stay on the **3.1.x**
> line. ZipStream 3.2.x requires PHP 8.3, so `composer install` fails on a PHP 8.2 runtime. The lock
> pins 3.1.2 (which requires `php-64bit: ^8.2`) and the project platform stays `php: ^8.2`. Do not
> broaden-update the lock without re-checking that requirement.
> Both packages also require the **`gd`** extension, which is not enabled by default in every PHP
> distribution.

### 💻 Installation & Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd iMAPS
   ```

2. **Install dependencies:**
   ```bash
   composer install
   npm install
   ```

3. **Configure Environment:**
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```
   > Update `.env` with your PostgreSQL credentials (`DB_*`), Supabase API credentials (for
   > mobile field sync) and, if the forecasting microservice is deployed, `FORECAST_SERVICE_URL`
   > and `FORECAST_SERVICE_API_KEY`. `.env.example` documents which values are required and
   > ships **no** real secrets — there are deliberately no fallback keys anywhere in source.

4. **Database Setup & Seed Data:**
   ```bash
   createdb -U postgres imaps_db
   psql -U postgres -d imaps_db -c "CREATE EXTENSION postgis;"
   php artisan migrate --seed
   ```
   > `migrate` aborts with the exact remediation command if PostGIS is absent, so a
   > half-built schema is not possible.

5. **Run Development Stack:**
   Launch the unified development script (runs PHP server, Vite dev server, queue worker, and log watcher simultaneously):
   ```bash
   npm run dev
   ```

   *Alternatively, start services individually:*
   ```bash
   # Terminal 1: Application Server
   php artisan serve

   # Terminal 2: Asset Compiler
   npm run dev:vite

   # Terminal 3: Queue Listener
   php artisan queue:work
   ```

6. **Access Application:**
   Open [http://localhost:8000](http://localhost:8000) in your web browser.

---

## 🔮 Urban Growth Forecasting (external microservice)

The forecast layer is a client of a **separate FastAPI service that lives in its own
repository**, alongside this one — not inside it:

```text
Downloads/
├── iMAPS/                       # this repo (Laravel)
└── iMAPS-forecasting-service/   # the microservice (own git repo + README)
```

It is **FastAPI + XGBoost** (a classifier × regressor pair tuned with `RandomizedSearchCV`)
over spatial features extracted from shapefiles with GeoPandas — *not* the `statsmodels`
SARIMAX service described in `LC_DEMAND_FORECAST_PLAN.md` §3, which predates it.

> The empty `iMAPS-forecasting-service/` folder **inside this repo** is a stale skeleton of
> that project. It is not the service and must not be deployed.

### Deploying it

```bash
cd ../iMAPS-forecasting-service
docker-compose up --build -d          # host 8002 → container 8000
curl http://localhost:8002/health
```

Two things the service's own git clone will **not** give you — both must be copied to the
production machine by hand, because its `.gitignore` excludes them:

1. **`data/`** — the three required layers: `Barangay_Boundary_Rosario.shp`,
   `rosario_roads.shp`, `Land_Use_Plan_2016_2030_Rosario_Batangas.shp` (with their
   `.dbf`/`.shx`/`.prj` siblings).
2. **`.env`** — containing `API_KEY=…`. This value **must equal** `FORECAST_SERVICE_API_KEY`
   in the iMAPS `.env`, or every request returns 401.

Running it without Docker starts uvicorn on **port 8000**, which collides with
`php artisan serve`. Use `--port 8002`, or point `FORECAST_SERVICE_URL` at the port you chose.

### The contract (verified against the service source)

| | |
| --- | --- |
| Request | `GET {FORECAST_SERVICE_URL}` — header `X-API-Key`, **no body and no upload** |
| Default URL | `http://localhost:8002/api/v1/forecast` |
| Input data | None sent. The service forecasts from **its own history** (MPDO monthly totals, split by barangay), so the model runs on the data it was validated on rather than on `historical_data`, whose synthetic rows did not match the MPDO totals (e.g. Q4 2025: 89 vs 179) |
| Horizon | The service trains on a rolling 60 months and predicts the next two quarters |
| Response | `{ forecasts: [{Date, Quarter_Label, Barangay, Predicted_Quarterly_Clearances}], history: [...], metrics: {validation_mae, validation_wmape, validation_r2}, summary: {q<N>_<YEAR>_total, combined_total} }` |
| Runtime | **~24s warm, over 30s cold** (it trains an XGBoost model per request and loads the shapefiles on first call). `FORECAST_SERVICE_TIMEOUT` defaults to 180s; Guzzle's 30s default used to abort the request mid-forecast. Match it in nginx (`fastcgi_read_timeout`) and php-fpm (`request_terminate_timeout`). |

`ForecastService` parses `Quarter_Label` (`"2026 Q4"`) into a `demand` array of
`{barangay, year, quarter, label, predicted}` and passes `metrics` straight through, so the
MAE/WMAPE shown in the Trends panel are the model's real validation figures and the map shows
the predicted count per barangay. The `history` the service returns is normalised too: on a
forecast quarter the Maps page compares against it ("than last year", "than usual", per-barangay
changes, the timeline sentence) instead of `historical_data`. Recorded quarters still read
`historical_data`. The browser's saved forecast is keyed `v4`, so a run saved from the older
service (no history) is dropped and regenerated. A row whose quarter label cannot be parsed is dropped and
logged rather than filed under a guessed year, and no application records are generated from a
count. `validation_wmape` is a percentage (e.g. 42.3), which is how `formatWmape` in
`TrendsPanel.jsx` renders it. Where there is no run to show, the panel shows `—`, not a
stand-in figure.

### When it is not deployed

Leave `FORECAST_SERVICE_URL` / `FORECAST_SERVICE_API_KEY` blank. `POST /api/forecast/generate`
then returns **HTTP 503** with an error the UI displays. It does **not** substitute invented
numbers — the previous fallback did exactly that, fabricating pins and reporting a fixed
MAE 2.155 / WMAPE 30.2% as if a model had run. Everything else in iMAPS (intake, review,
inspection, permits, maps) works without the service.

`ForecastService::getQuarterData()` and its `GET /api/forecast/{year}/{quarter}` route are
gone. They never called the microservice: they invented 14–22 `mt_rand()` pins per future
quarter and reported those same fixed MAE/WMAPE/R² constants. A forecast quarter with no
model run now shows an empty bar and "no LC forecast available".

### About the key that was hardcoded

`app/Services/ForecastService.php` used to carry a real-looking API key as its fallback
default, and that value is in this repo's history (`e4a5160`, `2f81b3d`). The fallback is
removed and the service now fails closed when the key is unset.

**That value was a live credential, and it has already been rotated.** It is byte-identical to
the key that was also hardcoded in the service's own committed `run_server.sh` (217 chars, same
digest) and bundled into the shared zip archives. The service's `.env` records the remediation:
rotated **2026-10-09**, for exactly that reason. The current `API_KEY` is a different 219-char
value that has never been committed in either repo, so the leaked key now grants no access.

The leak was real; the response is done. What remains is keeping it that way.

Two follow-ups anyway: clean the dead key out of the service's `run_server.sh` (read it from
the environment) so nobody copies it back into `.env`, and never reintroduce a fallback
default here — `tests/Unit/ForecastServiceConfigTest.php` enforces that.

---

## 🚂 Production Deployment (Railway)

iMAPS is deployed on **[Railway](https://railway.com)** as a single Docker service plus a PostGIS
database and one persistent volume, fronted by **Cloudflare**, which only lets registered devices through (client certificates / mTLS and a WAF custom rule).
The full step-by-step guide is [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md); this
section is the overview.

### Access model

iMAPS is **hosted on the internet but restricted to authorized users** — it is not open to the
public. Each allowed device holds its own **client certificate** (mTLS), and a Cloudflare WAF custom
rule blocks any request without a valid one, so access follows the device rather than its IP
address and works from changing networks. `ORIGIN_SECRET` makes the app refuse any request that
bypassed Cloudflare with a 403; only `/ping` (Railway's health check) is exempt. The server has a
public address, so the mTLS rule and `ORIGIN_SECRET` are what keep it private. A lost device is
revoked individually in Cloudflare. The app's login (Turnstile, lockout) and role checks still apply
on top. `ALLOWED_IPS` is an optional app-side IP allowlist for offices with a fixed public IP; leave
it unset when staff have dynamic IPs.

### Architecture

```text
Users ──► Cloudflare (mTLS: registered devices only, adds X-Origin-Secret)
              │
              ▼
        Railway app service  (Dockerfile, FrankenPHP/Caddy on $PORT)
        ├── supervisord
        │   ├── web        frankenphp + Caddy
        │   ├── queue      php artisan queue:work
        │   └── scheduler  php artisan schedule:work
        ├── Volume  /data  (uploads, map tiles, file cache, permits when PERMITS_DISK=local)
        ├──► Railway PostGIS database
        ├──► Cloudflare R2 bucket, private (permits when PERMITS_DISK=r2)
        └──► Supabase (FieldSync bridge for mobile inspectors)
```

| File | Purpose |
| --- | --- |
| [railway.json](railway.json) | Tells Railway to build the `Dockerfile`; health check on `/ping` (300s timeout); restart on failure, max 5 retries |
| [Dockerfile](Dockerfile) | Two stages: Node 22 builds the Vite assets, then `dunglas/frankenphp` (PHP 8.3) with `pdo_pgsql`, `gd`, `zip`, `intl`, `postgis` (`shp2pgsql`) and LibreOffice Calc (permit PDFs) |
| [docker/start.sh](docker/start.sh) | Entrypoint: links `storage/app`, tiles and cache onto the `/data` volume, runs `php artisan migrate --force`, caches config/routes/views, starts supervisord |
| [docker/supervisord.conf](docker/supervisord.conf) | Runs the web server, queue worker and scheduler in one container |
| [docker/Caddyfile](docker/Caddyfile) | Serves `public/` on `$PORT`, 260 MB request body cap |
| [.railwayignore](.railwayignore) | Keeps `public/tiles` out of uploads; tiles live on the volume |

### Deploying

1. **New project → Deploy from GitHub repo** — Railway picks up `railway.json` and builds the `Dockerfile`.
2. **Add the PostGIS database** from Railway's *PostGIS* template. The plain Postgres plugin has no
   PostGIS and migrations will fail.
3. **Add a Volume** to the app service, mounted at **`/data`**.
4. **Set variables** on the app service (never commit them):

   | Variable | Notes |
   | --- | --- |
   | `APP_KEY`, `APP_URL` | `php artisan key:generate --show` locally; `https://<your-domain>` |
   | `DB_*` | Reference the PostGIS service, e.g. `${{Postgres.PGHOST}}` |
   | `SESSION_SECURE_COOKIE`, `SESSION_ENCRYPT` | `true` |
   | `QUEUE_CONNECTION`, `SESSION_DRIVER` | `database` |
   | `CACHE_STORE` | `file` — no `cache` table migration exists, `database` crashes the queue worker |
   | `IMAPS_BRIDGE_SOURCE_ID` | Unique per install, e.g. `rosario-imaps-railway-a` |
   | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | From Supabase |
   | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Same values; needed at **build** time, so set before the first deploy |
   | `ORIGIN_SECRET` | `openssl rand -hex 32`; must match Cloudflare's `X-Origin-Secret` header |
   | `CSP_MODE`, `HSTS_MAX_AGE` | Security headers: `report-only` (default) / `enforce` / `off` for the Content-Security-Policy, and the HSTS lifetime in seconds (see [SecurityHeaders.php](app/Http/Middleware/SecurityHeaders.php)) |
   | `ALLOWED_IPS` | Optional app-side IP allowlist for a fixed-IP office; leave unset when staff have dynamic IPs (works with `ORIGIN_SECRET`) |
   | `PERMITS_DISK` | `local` (default, the `/data` volume) or `r2` (Cloudflare R2) — see [Permit storage](#permit-storage-volume-or-cloudflare-r2) |
   | `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT` | Only when `PERMITS_DISK=r2`. Endpoint is `https://<account-id>.r2.cloudflarestorage.com` |
   | `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_R2_BUCKET` | Separate private bucket for [backups](#backups). `BACKUP_R2_ENDPOINT` defaults to `R2_ENDPOINT` |
   | `FORECAST_SERVICE_URL`, `FORECAST_SERVICE_API_KEY` | Only if the forecasting microservice is hosted |

   Do **not** set `PORT` (Railway injects it) and do **not** run the seeders in production.
5. **Networking:** add your custom domain (proxied through Cloudflare, SSL mode *Full (strict)*) and
   then delete the generated `*.up.railway.app` domain.
6. **First boot** runs migrations automatically. Create the first admin through `railway ssh` →
   `php artisan tinker`, log in, import shapefiles on the **Settings** page, then run `php artisan map:warm`.

### Cloudflare setup

Full steps are in [docs/RAILWAY_DEPLOYMENT.md §2](docs/RAILWAY_DEPLOYMENT.md#2-cloudflare). In short:

1. Proxy the domain through Cloudflare (orange cloud) and set **SSL/TLS → Full (strict)**;
   *Flexible* causes redirect loops.
2. **Registered devices (mTLS):** add the domain under *SSL/TLS → Client Certificates → Hosts*,
   issue one client certificate per device, then add a WAF custom rule
   `(not cf.tls_client_auth.cert_verified and http.host eq "<your-domain>")` → **Block**. Enable the
   rule only after your own device's certificate works. Delete any unintended Zero Trust Access
   application on the domain, or users get an extra email-code prompt.
3. **Transform rule:** set the request header `X-Origin-Secret` to the value of `ORIGIN_SECRET`.
   Without it the app answers 403 to everyone.
4. Leave `ALLOWED_IPS` unset when staff have dynamic IPs; it is only for a fixed-IP office.

#### Issuing and revoking device certificates (mTLS)

One certificate per device; never share one between people or machines. A browser without a
certificate sees Cloudflare's "Sorry, you have been blocked" page.

1. **Generate a CSR on the device.** The member creates a private key and certificate signing
   request on their own device (on Windows, `certreq -new` makes a non-exportable key in the
   user's certificate store) and sends only the CSR.
2. **Issue it in Cloudflare.** *SSL/TLS → Client Certificates → Add Certificate*, choose to use
   your own CSR, paste it, set a validity (1 year is a sensible default) and hand the issued
   certificate back. If Cloudflare rejects a `certreq` CSR, change the `NEW CERTIFICATE REQUEST`
   header and footer to `CERTIFICATE REQUEST`.
3. **Install it.** The member installs it (`certreq -accept` on Windows), restarts the browser and
   picks the certificate when prompted. Use Brave, Chrome or Edge on Windows; they read the
   Windows certificate store. Managed PCs can skip the prompt with the
   `AutoSelectCertificateForUrls` browser policy.
4. **Keep a register.** Record member, device, issue and expiry dates, and renew before expiry.
5. **Revoke** from the same Client Certificates list when a device is lost or a member leaves;
   only that device is blocked.

Prefer the CSR route: Cloudflare-generated keys (bundled as `.p12`) expose the private key to the
admin and must travel over a secure channel. To pause enforcement without invalidating any
certificate, set the WAF rule to **Disabled**. Because the rule only filters traffic that passes
through Cloudflare, `ORIGIN_SECRET` stays mandatory.

How the app relies on Cloudflare:

- **Origin secret** ([RequireOriginSecret.php](app/Http/Middleware/RequireOriginSecret.php)): Railway's
  origin is reachable directly, so any request without the correct `X-Origin-Secret` gets a 403
  (except `/ping`).
- **Real client IP:** once the secret checks out, the request provably came through Cloudflare, so
  `CF-Connecting-IP` replaces `X-Forwarded-For`. Visitors can forge the leftmost `X-Forwarded-For`
  entries, so trusting that header would let them dodge rate limits and the login lockout.
- **Rate limits** (`throttle:app` in [AppServiceProvider.php](app/Providers/AppServiceProvider.php)):
  signed-in users get 300 requests/min each, guests get 60/min per IP, and `/ping` is unlimited.
  Stricter per-route limits (10–30/min) apply on top to logins, shapefile and tile uploads, password
  resets and sensitive user data. Covered by `tests/Feature/CloudflareClientIpAndThrottleTest.php`.
- **App-side allowlist (optional):** [RestrictToAllowedIps.php](app/Http/Middleware/RestrictToAllowedIps.php)
  only runs when `ALLOWED_IPS` is set. It runs after the origin-secret check, so behind Cloudflare it
  sees `CF-Connecting-IP`; without Cloudflare it reads the right-hand (Railway-written) end of
  `X-Forwarded-For`. It logs blocked addresses as `Blocked by ALLOWED_IPS`. It is not compatible with
  dynamic IPs, which is why device certificates are the primary control.

### Permit storage (volume or Cloudflare R2)

Generated permits (XLSX/PDF) go to the disk named by `PERMITS_DISK`:

- **`local`** (default): the private disk on the `/data` volume. On boot, `docker/start.sh` moves
  any permits left on the old public disk into the private one.
- **`r2`**: a Cloudflare R2 bucket accessed through the S3 driver (`config/filesystems.php`, disk `r2`).
  **Keep the bucket private** and don't attach a public `r2.dev` URL or custom domain. Downloads
  are streamed through Laravel, so permits stay behind login.

To switch an existing install to R2, copy the files over before changing the variable. Otherwise
previously saved permits return 404:

```bash
php artisan permits:migrate-disk --from=local --to=r2            # copy, same paths
# set PERMITS_DISK=r2 and redeploy, check a few downloads, then optionally:
php artisan permits:migrate-disk --from=local --to=r2 --delete-source
```

The command skips files already on the target. With `--delete-source`, it removes a source file
only after the sizes match.

### Backups

Railway's Hobby plan has no backups, so the scheduler uploads them to a private R2 bucket of
their own, separate from the permits bucket (`config/backup.php`; disk set by `BACKUP_DISK`,
default `backups`). Create the bucket and an R2 API token with **Object Read & Write** scoped to
it, then set the `BACKUP_R2_*` variables:

| What | When | Kept | Path in bucket |
| --- | --- | --- | --- |
| Postgres dump (`pg_dump -Fc`) | Daily 02:00 | 14 days | `backups/database/imaps-db-<timestamp>.dump` |
| `storage/app` (uploads, permits) | Sundays 03:00 | 28 days | `backups/files/imaps-storage-<timestamp>.tar.gz` |

Map tiles aren't in the archive; keep the original tile ZIP so it can be re-uploaded. The image
installs `postgresql-client-16` to match the PostGIS server; if the server is upgraded, change
the version in the `Dockerfile` and `PG_DUMP_PATH` together. A failed run exits non-zero and logs
`Backup failed:` in Railway's logs.

Run one by hand (e.g. before a risky migration) with `php artisan backup:run` or
`php artisan backup:run --files`.

**Restore** (download the file from the R2 dashboard first):

```bash
# database: into a scratch DB to check it, or over production with --clean --if-exists
pg_restore --no-owner --no-acl -d "<postgres url>" imaps-db-<timestamp>.dump
# files: unpack into the volume
tar -xzf imaps-storage-<timestamp>.tar.gz -C /data/app
```

### Updating

Push to GitHub; Railway rebuilds, runs migrations on boot and restarts. Run
`php artisan backup:run` before risky migrations.

### Operational notes

- **Single instance only.** The volume and in-container queue worker mean replicas must not be scaled.
- **Logs** go to stderr and appear in Railway's log viewer; `storage/logs` is unused.
- **Permits** are stored on the private disk (or a private R2 bucket) and are only served to
  signed-in users.
- **Permit PDFs** are converted by LibreOffice inside the container. If no converter is found,
  `PERMIT_PDF_DRIVER=auto` falls back to Dompdf, which gives draft-quality output.
- **Uploads:** Cloudflare's free plan caps requests at 100 MB while the Settings tile upload allows
  200 MB; upload large tile sets via `railway ssh` into `/data/tiles/clup_tiles`.
- **Backups** go to R2 on a schedule (see [Backups](#backups)). Test a restore once.
- Users need internet access (Google Fonts, OSM/ArcGIS basemaps).

See the go-live checklist in [docs/RAILWAY_DEPLOYMENT.md](docs/RAILWAY_DEPLOYMENT.md#5-go-live-checklist)
before opening the site to staff.

---

## 🔑 Default Credentials (Local Development Only)

> ⚠️ These accounts are created by the seeders for **local development**. Never run the seeders
> in production; the Railway deployment must have no `admin@imaps.com` account.

| Role | Email | Password | Access Rights |
| --- | --- | --- | --- |
| **Admin** | `admin@imaps.com` | `password123` | Full access, settings, shapefile management, user management & audit logs |
| **Planning Officer** | `planner@imaps.com` | `password123` | Application encoding, technical reviews, inspection scheduling & drafts |

---

## ⚙️ Custom Commands & Testing

- **Sync Completed Mobile Field Inspections** (from Supabase):
  ```bash
  php artisan sync:pull-inspections
  php artisan sync:pull-inspections --local-inspection-id=42   # a single inspection
  ```
- **Warm the Map Cache** (after importing shapefiles):
  ```bash
  php artisan map:warm
  php artisan map:warm --fresh   # discard the current cache first
  ```
- **Move Stored Permits Between Disks** (e.g. volume → Cloudflare R2):
  ```bash
  php artisan permits:migrate-disk --from=local --to=r2 [--delete-source]
  ```
- **Back Up to R2** (runs on the scheduler; see [Backups](#backups)):
  ```bash
  php artisan backup:run            # database dump
  php artisan backup:run --files    # storage/app archive
  ```
- **Seed Demo Applications** (local/demo data only, never production):
  ```bash
  php artisan demo:applications --count=50 --dry-run          # preview who and what would be used
  php artisan demo:applications --per-barangay=2-10            # random count per barangay, on its own lots
  php artisan demo:applications --inspector="Name" --inspected # inspector takes ~half of the rounds
  php artisan demo:applications --except=inspection_scheduled,reinspection_scheduled
  php artisan demo:applications --from=2026-05-01 --to=2026-10-31 --seed=2026
  php artisan demo:applications --sync                         # also play out on Supabase (FieldSync + public tracker)
  php artisan demo:applications --tracker-only                 # status timelines to the public tracker only
  php artisan demo:applications --push                         # push already-created samples to Supabase
  php artisan demo:applications --purge                        # remove the samples this command created
  ```
  `--shuffle` randomises scenarios/officers; `--force` skips confirmation.
- **Fit Historical Clearances to the CLUP Plan** (dry run unless `--apply`):
  ```bash
  php artisan historical:fit-to-clup [--cap=0.2] [--seed=2026] [--apply] [--sql=changes.sql]
  ```
- **Forecast Report in the Console** (metrics, tables, charts from the running forecast service):
  ```bash
  python3 scripts/forecast_report.py [--top 48] [--save] [--no-show] [--json PATH]
  ```
  A notebook version is in `scripts/forecast_report.ipynb`. Needs only `matplotlib`; reads
  `FORECAST_SERVICE_URL` / `FORECAST_SERVICE_API_KEY` from the environment or `.env`.
- **Execute Test Suite:**
  ```bash
  composer run test
  # or
  php artisan test
  ```

---

## ⚠️ Limitations

**Access & infrastructure**

- **Internet required.** Fonts (Google),
  basemaps (OSM/ArcGIS) and the inspector sync (Supabase) all need internet. If the office
  connection or ISP goes down, the system is unavailable.
- **Access is tied to registered devices.** A browser or computer without a valid client
  certificate is blocked, so each new device needs a certificate issued and installed, and
  certificates expire and must be renewed. Phones and shared computers are harder to enrol. Anything
  else that calls the public domain without a certificate (webhooks, scripts) is blocked unless
  excepted in the Cloudflare rule.
- **Shared guest rate limit.** Unauthenticated requests are limited per public IP (60/min), so
  people behind one shared address (for example the office) share that limit.
- **Single instance.** The volume and in-container queue worker rule out scaling replicas. A
  container restart briefly takes the whole system down.
- **Upload size.** Cloudflare's free plan caps requests at 100 MB. Larger tile sets have to be
  copied in over `railway ssh`.
- **Backups are daily, not continuous.** The app dumps Postgres to R2 nightly, so up to a day of
  data can be lost; there is no point-in-time recovery. Map tiles aren't backed up.
- **Third-party services.** Railway, Cloudflare, Supabase and (optionally) R2 are external
  providers. Their outages, pricing or plan limits affect the system.

**Functional**

- **Rezoning and reclassification don't update the map.** The system records the petition and its
  SB ordinance or DAR clearance reference. The zoning layer itself has to be edited by hand in QGIS
  after the ordinance is enacted, then re-imported on the Settings page and the cache refreshed
  with `php artisan map:warm --fresh`.
- **Forecasting is optional and external.** It needs the separate FastAPI/XGBoost service, takes
  about 24–30+ seconds per run and forecasts from the service's own MPDO-based history, not from
  `historical_data`. Forecasts are estimates and are only as good as that history. They support
  decisions but don't make them.
- **Land-use mix depends on recorded data.** The entropy index uses the lot areas filed in
  `historical_data`. Missing or mis-encoded historical records skew the scores.
- **Map accuracy depends on the imported shapefiles.** Parcel, barangay and CLUP boundaries are only
  as current and accurate as the last import. The system doesn't edit geometry.
- **Drafts are per browser.** Offline drafts are kept in the browser's local storage, so they don't
  follow a user to another computer and are lost if browser data is cleared.
- **Roles are coarse.** The web app distinguishes only `Admin` and `Planning Officer`.
  `Site Inspector` accounts are managed here but work through the separate mobile app via Supabase,
  so inspection results only arrive once the device has synced.
- **PDF fidelity.** Permit PDFs match the template only when LibreOffice is available. The Dompdf
  fallback is draft quality.
- **PostgreSQL + PostGIS only.** No other database is supported.

---

## 📂 Project Structure

```
iMAPS/
├── app/
│   ├── Console/Commands/       # Custom Artisan commands (Supabase sync, permit disk migration)
│   ├── Http/
│   │   ├── Controllers/        # Controllers (Maps, Analytics, Applications, Inspections)
│   │   └── Middleware/         # Inertia request handler & Role middleware
│   ├── Jobs/                   # Queued jobs (PushInspectionToSupabase)
│   ├── Models/                 # Eloquent models (ZoningApplication, Parcel, SiteInspection, AuditTrail)
│   └── Services/               # Audit logger & status tracker services
├── config/                     # Application configurations
├── docker/                     # Production container config (Caddyfile, supervisord, start.sh, php.ini)
├── docs/                       # Deployment guide, FieldSync bridge & schema documentation
├── Dockerfile                  # Production image (Railway)
├── railway.json                # Railway build & health-check configuration
├── database/
│   ├── factories/              # Model factories
│   ├── migrations/             # Schema migrations
│   └── seeders/                # User & Zoning Application seeders
├── resources/
│   └── js/
│       ├── Components/         # React UI components & GIS map panels
│       ├── Layouts/            # App layout shells (Authenticated, Guest)
│       └── Pages/              # Inertia views (Overview, Maps, Applications, Reports, Users)
├── routes/
│   ├── web.php                 # Web and API endpoint routes
│   └── auth.php                # Authentication routes
└── scripts/                    # Development helper scripts
```

---

## 📜 Compliance & License

Developed for the **Municipal Government of Rosario, Batangas**.  
All system operations comply with the **Data Privacy Act of 2012 (RA 10173)**, Cybercrime Prevention Act, and municipal zoning ordinances.

Licensed under the [MIT License](LICENSE).
