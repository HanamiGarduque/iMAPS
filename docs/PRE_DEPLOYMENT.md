# iMAPS Pre-Deployment Guide (Linux, defense demo)

This records how the pre-deployment copy of iMAPS was set up on a Linux machine
for the defense, so any group member can rebuild or update it. The final
installation at the client's office (Windows + Laragon) is a separate step.

> **No secrets in this file.** Passwords live in `~/.imaps-deploy/` on the demo
> machine and in the deployed `.env`. Never commit either.

## 1. What is running

| Item | Value |
|---|---|
| App folder | `~/imaps-app` (a copy of the dev tree, not a git clone) |
| Database | PostgreSQL 16+ with PostGIS, database `imaps_prod`, role `imaps_app` |
| URL | `http://<machine-LAN-IP>:8080` (find it with `hostname -I`) |
| Web | `imaps-web` systemd user service (`php artisan serve`, 4 workers) |
| Queue | `imaps-queue` (`php artisan queue:work`) |
| Scheduler | `imaps-scheduler` (`php artisan schedule:work`) |
| Secrets | `~/.imaps-deploy/db_password`, `~/.imaps-deploy/accounts.txt` |

The queue and scheduler are required. Without them, FieldSync inspection sync
silently stops (`PushInspectionToSupabase` jobs never run and
`sync:pull-inspections` never fires).

## 2. Requirements

- PHP 8.3 with `pdo_pgsql pgsql gd zip mbstring intl bcmath curl xml`
- PostgreSQL with the PostGIS package (the app uses `ST_*` functions and
  `geometry(...,4326)` columns; plain PostgreSQL will not work)
- `shp2pgsql` (comes with PostGIS; the Settings page shapefile import calls it)
- Composer, Node 18+ and npm, rsync

## 3. First-time setup

### 3.1 Database
```bash
sudo -u postgres psql <<SQL
CREATE ROLE imaps_app LOGIN PASSWORD '<generate one: openssl rand -hex 16>';
CREATE DATABASE imaps_prod OWNER imaps_app;
\c imaps_prod
CREATE EXTENSION IF NOT EXISTS postgis;
SQL
```

### 3.2 Copy the app
Run from the dev repo. The excludes keep dev-only files and secrets out.
```bash
rsync -a --delete \
  --exclude='/.env' --exclude='/vendor' --exclude='/node_modules' --exclude='/.git' \
  --exclude='/nul' --exclude='/response.txt' --exclude='/scratch' \
  --exclude='/database/database.sqlite' --exclude='/.phpunit.result.cache' \
  --exclude='/iMAPS-forecasting-service' --exclude='/public/hot' \
  --exclude='/storage/logs/*' --exclude='/storage/framework/sessions/*' \
  --exclude='/storage/framework/cache/data/*' --exclude='/storage/app/temp_shapefiles/*' \
  /path/to/dev/iMAPS/ ~/imaps-app/
```
`--delete` removes files in the deployed copy that no longer exist in dev. It
does not touch the excluded `.env`, `vendor`, `node_modules`, or the database.

### 3.3 Create `~/imaps-app/.env`
Start from the dev `.env`, then set at least:

```
APP_ENV=production
APP_DEBUG=false
APP_URL=http://<LAN-IP>:8080
APP_KEY=                       # filled by key:generate below
DB_CONNECTION=pgsql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=imaps_prod
DB_USERNAME=imaps_app
DB_PASSWORD=<the password from 3.1>
SESSION_ENCRYPT=true
QUEUE_CONNECTION=database
LOG_LEVEL=warning
FORECAST_SERVICE_API_KEY=<new random value>
IMAPS_BRIDGE_SOURCE_ID=<unique id for THIS install, e.g. rosario-imaps-pre-deploy-1009-a>
```

Rules:
- `IMAPS_BRIDGE_SOURCE_ID` must be unique per install. Reusing the dev value
  causes the row-overwrite collision described in `.env.example`.
- Every line must be `KEY=value`. A long key wrapped onto a second line is
  silently truncated. This already happened to `SUPABASE_ANON_KEY` in the dev
  `.env` (see section 7).
- `chmod 600 .env`

### 3.4 Build
```bash
cd ~/imaps-app
composer install --no-dev --optimize-autoloader
php artisan key:generate --force
npm ci && npm run build
php artisan migrate --force
php artisan storage:link
```

### 3.5 Create accounts
Do **not** run the seeders. `UserSeeder` creates `admin@imaps.com` with the
password `password123`, and `ZoningApplicationSeeder` adds fake rows. Create
users with generated passwords instead (via `php artisan tinker` or the
Users page once you are logged in as an admin).

### 3.6 Cache, then start the services
```bash
php artisan config:cache && php artisan route:cache && php artisan view:cache
```
Create three files in `~/.config/systemd/user/`, differing only in
`Description` and `ExecStart`:

```ini
[Unit]
Description=iMAPS <web|queue|scheduler>
After=network.target postgresql.service
[Service]
WorkingDirectory=/home/<you>/imaps-app
ExecStart=<see table>
Restart=always
RestartSec=3
[Install]
WantedBy=default.target
```

| File | `ExecStart` | Extra line under `[Service]` |
|---|---|---|
| `imaps-web.service` | `/usr/bin/php artisan serve --host=0.0.0.0 --port=8080 --no-reload` | `Environment=PHP_CLI_SERVER_WORKERS=4` and `Environment=PHP_INI_SCAN_DIR=:/home/<you>/.imaps-deploy/php.d` (see below) |
| `imaps-queue.service` | `/usr/bin/php artisan queue:work --tries=3 --max-time=3600` | none |
| `imaps-scheduler.service` | `/usr/bin/php artisan schedule:work` | none |

The tile upload accepts up to 200 MB, but PHP's default limit is 100 MB. Raise it:
```bash
mkdir -p ~/.imaps-deploy/php.d
printf 'upload_max_filesize=256M\npost_max_size=260M\n' > ~/.imaps-deploy/php.d/uploads.ini
```

```bash
systemctl --user daemon-reload
systemctl --user enable --now imaps-web imaps-queue imaps-scheduler
loginctl enable-linger $USER      # start at boot, no login needed
```

### 3.7 Load the map data
The database has no map data after migration. Log in as an admin, open the
**Settings** page and upload the shapefile zips (barangay boundaries, parcels,
land-use plan). Then pre-build the map cache, or the first dashboard load takes
about 20 seconds:
```bash
cd ~/imaps-app && php artisan map:warm
```

## 4. Updating the deployment

**Easy way:** commit your changes, then run `scripts/deploy.sh` (add `--no-build` for backend-only changes). It does the backup, sync, build, migrate, cache, restart and a smoke test, and stops at the first failure. The manual steps it automates are below.

1. Commit your changes in the dev repo (the deployed copy only reflects what you sync).
2. **Back up first:** `pg_dump -Fc -h 127.0.0.1 -U imaps_app imaps_prod > ~/imaps_prod_$(date +%F).dump`
3. Re-run the rsync from 3.2.
4. Then:
```bash
cd ~/imaps-app
composer install --no-dev --optimize-autoloader
npm ci && npm run build            # skipping this serves the OLD frontend
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache
php artisan map:warm --fresh       # only if map data changed
systemctl --user restart imaps-web imaps-queue imaps-scheduler
```

Rules:
- Schema changes go in a **new** migration file. Never edit one that already ran.
- Never edit files inside `~/imaps-app` directly; the next rsync overwrites them.
- After changing `.env`, re-run `config:cache` and restart the services.
- Do the last update at least a day before the defense.

## 5. Day-to-day commands

```bash
systemctl --user status imaps-web imaps-queue imaps-scheduler
journalctl --user -u imaps-web -f           # live logs for one service
tail -f ~/imaps-app/storage/logs/laravel.log
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/ping   # expect 200
```

## 6. Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| Browser shows old UI after an update | Forgot `npm run build`, or hard-refresh the browser |
| `.env` change has no effect | Run `php artisan config:cache`, restart the services |
| 500 error on every page | Check `storage/logs/laravel.log`. Often `storage/` or `bootstrap/cache` not writable by your user |
| Map and dashboard empty | Map data not imported (3.7) |
| Inspections stop syncing | `imaps-queue` or `imaps-scheduler` not running, or the machine has no internet to Supabase |
| `PostGIS is required` during migrate | Run `CREATE EXTENSION postgis;` inside `imaps_prod` as the `postgres` user |
| Services gone after reboot | `loginctl enable-linger $USER` was not run |
| Page hangs for seconds, map has no basemap | The machine has no internet (see section 7) |

## 7. Known issues before the defense

1. **Needs internet for fonts and basemaps.** `resources/views/app.blade.php`
   loads Google Fonts as a blocking stylesheet, and the maps pull tiles from
   OpenStreetMap and ArcGIS and glyphs from `demotiles.maplibre.org`. Test on
   the venue network or a phone hotspot, or self-host these assets.
2. **Forecasting service is missing.** `iMAPS-forecasting-service/` has empty
   folders and is not tracked by git. The app calls it on ports 8002/8001, so
   urban growth forecasting fails until the source is recovered. Hide or
   disable that feature for the demo if it is not found.
3. **`SUPABASE_ANON_KEY` is truncated in the dev `.env`.** Its last characters
   sit on a separate line (the `VITE_` copy has the full key). Join them in dev.
4. **Hardcoded API key.** `app/Services/ForecastService.php:20` has a real
   looking key as the fallback default and it is committed to git. Rotate it
   and remove the default.
5. **`php artisan serve` is for the demo only.** The client install uses
   Laragon's Apache as a Windows service.
6. **The web port is open to the whole LAN.** Anyone on the same network can
   reach the login page. Do not load real government data on this machine.

## 8. Differences for the client (Windows + Laragon)

The steps are the same, but the Linux-specific parts change:

| Linux demo | Windows client |
|---|---|
| systemd user services | NSSM services for queue and scheduler; Apache as a Windows service |
| `php artisan serve` | Laragon Apache with the document root at `public\` |
| PostGIS from apt | EDB PostgreSQL installer, then Stack Builder, then PostGIS |
| HTTP on port 8080 | HTTPS with an internal CA such as `mkcert`, installed on office PCs |
| `pg_dump` by hand | Nightly scheduled task with `pg_dump` and `robocopy` of `storage\app` |

Also disable sleep and automatic restarts on that PC, give it a fixed IP and
hostname, and use a UPS.

## 9. Undo everything on the demo machine
```bash
systemctl --user disable --now imaps-web imaps-queue imaps-scheduler
rm -rf ~/imaps-app ~/.imaps-deploy ~/.config/systemd/user/imaps-*.service
sudo -u postgres psql -c "DROP DATABASE imaps_prod; DROP ROLE imaps_app;"
loginctl disable-linger
```
