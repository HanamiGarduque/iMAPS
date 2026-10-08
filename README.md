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
  - **Urban Growth Forecasting**: Integration with predictive forecasting services to project quarter-by-quarter land-use transitions and urban expansion.
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

- **PHP** >= 8.2 (with `pdo`, `sqlite`/`mysqli`, `mbstring`, `openssl` extensions)
- **Composer** >= 2.0
- **Node.js** >= 18.x & **npm**
- **SQLite** or **MySQL / PostgreSQL** database engine

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
   > Update `.env` with your database credentials, Supabase API credentials (for mobile field sync), and FastAPI endpoints (for ML growth forecasting).

4. **Database Setup & Seed Data:**
   ```bash
   touch database/database.sqlite
   php artisan migrate --seed
   ```

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
