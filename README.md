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
  - **Land-Use Diversity & Plan Drift**: Shannon Diversity Index calculation and plan drift detection comparing permitted usage against municipal Comprehensive Land Use Plans (CLUP).
  - **Urban Growth Forecasting**: Integration with a predictive forecasting service to project quarter-by-quarter land-use transitions and urban expansion. **Requires a separate FastAPI + XGBoost microservice that lives in its own repository** — see [Urban Growth Forecasting](#-urban-growth-forecasting-external-microservice).
  - **Tax Dec & Parcel Lookup**: Live verification of Tax Declaration numbers (Tax Dec / TCT) against spatial parcel boundaries.

- **📋 Zoning Application Docket (`/applications`)**
  - **End-to-End Workflow**: Complete lifecycle tracking: Application Encoding → Parcel Verification → Technical Review → Field Inspection Scheduling → Final Decision (Approval/Disapproval).
  - **Offline & Draft Storage**: Local storage backup and draft manager enabling Planning Officers to prepare application details offline.
  - **Public Reference Tracking**: Automatic generation of public tracking reference links for applicants.

- **🔍 Technical Review & Field Inspections (`/site-inspections`)**
  - **Inspector Allocation & Scheduling**: Assign field inspectors to specific pending applications with geographic provenance.
  - **Supabase Cloud Sync**: Bidirectional sync between local Laravel backend and mobile inspector applications (`PushInspectionToSupabase`, `PullCompletedInspections`).

- **📊 Analytics & Reporting (`/reports`)**
  - **Export Formats**: PDF export via `laravel-dompdf` and Excel export via `simplexlsxgen`.
  - **Interactive Visualizations**: Data charts built with Chart.js and Recharts for trend analysis.

- **🔐 Security, Audit Trail & Role-Based Access (`/users`)**
  - **Granular RBAC**: Role middleware distinguishing `Admin` and `Planning Officer` capabilities.
  - **Comprehensive Audit Logging**: Event logging (`AuditTrail`) tracking sensitive data access, password resets, status transitions, and system activities.

- **🌐 Citizen Public Portal (`/public-portal`)**
  - Public-facing lookup for verifying zoning permit status and reference tracking.

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
| **Export Engines** | `barryvdh/laravel-dompdf`, `shuchkin/simplexlsxgen` |

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
| Request | `POST {FORECAST_SERVICE_URL}` — multipart `file`, header `X-API-Key` |
| Default URL | `http://localhost:8002/api/v1/forecast` |
| CSV columns required | `Encoding Date`, `Barangay`, `Application Type` — all present in `storage/app/rosario_zoning_apps_2021_2026.csv`, which iMAPS sends when no file is uploaded |
| Data precondition | the CSV must contain a **fully completed quarter**; the service trains on a rolling 60 months from it and predicts the next two quarters, then rejects the request if that precondition fails |
| Response | `{ forecasts: [{Date, Quarter_Label, Barangay, Predicted_Quarterly_Clearances}], metrics: {validation_mae, validation_wmape, validation_r2}, summary: {q<N>_<YEAR>_total, combined_total} }` |
| Runtime | **~24s warm, over 30s cold** (it trains an XGBoost model per request and loads the shapefiles on first call). `FORECAST_SERVICE_TIMEOUT` defaults to 180s; Guzzle's 30s default used to abort the request mid-forecast. Match it in nginx (`fastcgi_read_timeout`) and php-fpm (`request_terminate_timeout`). |

`ForecastService` parses `Quarter_Label` (`"2026 Q4"`) and passes `metrics` straight through,
so the MAE/WMAPE shown in the Trends panel are the model's real validation figures whenever
the service answers. Verified end-to-end against the running service with the default CSV:
96 forecast rows over `2026 Q4` / `2027 Q1`, `validation_mae` 1.379, `validation_wmape` 42.3,
`validation_r2` 0.785, expanded to 490 map pins on real barangay centroids. (`validation_wmape`
is a percentage, not a fraction; `formatWmape` in `TrendsPanel.jsx` handles both.)

### When it is not deployed

Leave `FORECAST_SERVICE_URL` / `FORECAST_SERVICE_API_KEY` blank. `POST /api/forecast/generate`
then returns **HTTP 503** with an error the UI displays. It does **not** substitute invented
numbers — the previous fallback did exactly that, fabricating pins and reporting a fixed
MAE 2.155 / WMAPE 30.2% as if a model had run. Everything else in iMAPS (intake, review,
inspection, permits, maps) works without the service.

> **Still outstanding:** `ForecastService::getQuarterData()` — used by the Dashboard timeline
> for future quarters — still synthesises pins with `mt_rand()` and falls back to those same
> fixed MAE/WMAPE constants. It never calls the microservice. Replacing it is Phase 1 of
> `LC_DEMAND_FORECAST_PLAN.md`.

### About the key that was hardcoded

`app/Services/ForecastService.php` used to carry a real-looking API key as its fallback
default, and that value is in this repo's history (`e4a5160`, `2f81b3d`). The fallback is
removed and the service now fails closed when the key is unset.

**The committed value is not the key the microservice accepts.** It is byte-identical to the
one hardcoded in the service's own committed `run_server.sh` (217 chars, same digest), while
the live `API_KEY` in `iMAPS-forecasting-service/.env` is a different 219-char value that has
never been committed in either repo. So the leaked value grants no access to the current
deployment and there is no rotation emergency.

Two follow-ups anyway: clean the dead key out of the service's `run_server.sh` (read it from
the environment) so nobody copies it back into `.env`, and never reintroduce a fallback
default here — `tests/Unit/ForecastServiceConfigTest.php` enforces that.

---

## 🔑 Default Credentials (Seeded)

| Role | Email | Password | Access Rights |
| --- | --- | --- | --- |
| **Admin** | `admin@imaps.com` | `password123` | Full access, settings, shapefile management, user management & audit logs |
| **Planning Officer** | `planner@imaps.com` | `password123` | Application encoding, technical reviews, inspection scheduling & drafts |

---

## ⚙️ Custom Commands & Testing

- **Sync Completed Mobile Field Inspections:**
  ```bash
  php artisan inspections:pull-completed
  ```
- **Import Historical Data:**
  ```bash
  php artisan data:import-historical
  ```
- **Execute Test Suite:**
  ```bash
  composer run test
  # or
  php artisan test
  ```

---

## 📂 Project Structure

```
iMAPS/
├── app/
│   ├── Console/Commands/       # Custom Artisan commands (Supabase sync, data import)
│   ├── Http/
│   │   ├── Controllers/        # Controllers (Maps, Analytics, Applications, Inspections)
│   │   └── Middleware/         # Inertia request handler & Role middleware
│   ├── Jobs/                   # Queued jobs (PushInspectionToSupabase)
│   ├── Models/                 # Eloquent models (ZoningApplication, Parcel, SiteInspection, AuditTrail)
│   └── Services/               # Audit logger & status tracker services
├── config/                     # Application configurations
├── database/
│   ├── factories/              # Model factories
│   ├── migrations/             # Schema migrations
│   └── seeders/                # User & Zoning Application seeders
├── resources/
│   └── js/
│       ├── Components/         # React UI components & GIS map panels
│       ├── Layouts/            # App layout shells (Authenticated, Guest)
│       └── Pages/              # Inertia views (Dashboard, Maps, Applications, Reports, Users)
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
