# Deploying iMAPS on Railway behind Cloudflare

One Railway app service (web + queue worker + scheduler under supervisord, see
`docker/`) + a PostGIS database + one Volume. Cloudflare sits in front and only
lets the office IPs through.

## 1. Railway

1. **New project → Deploy from GitHub repo.** Railway reads `railway.json` and builds the `Dockerfile`.
2. **Add the database:** *New → Template → "PostGIS"* (the plain Postgres plugin has no PostGIS and migrations will fail).
3. **Add a Volume** to the app service, mount path **`/data`** (holds uploads, generated permits, map tiles).
4. **Variables** on the app service:

| Variable | Value |
|---|---|
| `APP_KEY` | `php artisan key:generate --show` locally |
| `APP_URL` | `https://<your-domain>` |
| `DB_CONNECTION` | `pgsql` |
| `DB_HOST` / `DB_PORT` / `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | reference the PostGIS service: `${{Postgres.PGHOST}}` etc. |
| `SESSION_SECURE_COOKIE` | `true` |
| `SESSION_ENCRYPT` | `true` |
| `QUEUE_CONNECTION` / `SESSION_DRIVER` | `database` |
| `CACHE_STORE` | `file` (no migration creates a `cache` table, so `database` crashes the queue worker) |
| `LOG_LEVEL` | `warning` |
| `IMAPS_BRIDGE_SOURCE_ID` | unique for this install, e.g. `rosario-imaps-railway-a` |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` | from Supabase (one line each, no wrapping) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | same values; needed at **build** time, so set before the first deploy |
| `FORECAST_SERVICE_URL`, `FORECAST_SERVICE_API_KEY` | only if the forecasting service is hosted somewhere |
| `ORIGIN_SECRET` | `openssl rand -hex 32` (see section 3) |

   Do not set `PORT`; Railway injects it. Do not run the seeders (`admin@imaps.com` / `password123`).
5. **Networking → Custom Domain:** add your domain, point the CNAME Railway gives you at it. Then **delete the generated `*.up.railway.app` domain.**
6. First boot runs migrations automatically (`docker/start.sh`). Create the first admin with
   `railway ssh` → `php artisan tinker`, then log in and import shapefiles on the **Settings** page and run `php artisan map:warm`.

## 2. Cloudflare

1. Add the domain to Cloudflare (free plan), proxied (orange cloud) CNAME to Railway.
2. **SSL/TLS → Full (strict)**. (Flexible causes redirect loops.)
3. **Security → WAF → Custom rules → Create rule**, action **Block**:

   ```
   (http.host eq "imaps.example.gov.ph" and not ip.src in {203.0.113.10 203.0.113.11})
   ```
   Replace host and IPs with the real ones. Office IPs must be static; check with the ISP.
4. **Rules → Transform Rules → Modify Request Header → Set static**: `X-Origin-Secret` = the same value as `ORIGIN_SECRET`.
   Without this step the app returns 403 to everyone (only `/ping` is exempt).

## 2b. Office-only access without Cloudflare (temporary)

Until a domain is on Cloudflare, set `ALLOWED_IPS` on the app service (comma-separated, CIDR allowed,
e.g. `203.0.113.10,198.51.100.0/24`) and leave `ORIGIN_SECRET` **unset**. Anyone else gets 403 (`/ping` stays open).
Blocked IPs are logged as `Blocked by ALLOWED_IPS`; if you are blocked, copy the IP from the logs.
Once Cloudflare's WAF rule is live, remove `ALLOWED_IPS` and set `ORIGIN_SECRET`.

## 3. Why the origin secret

The WAF only filters traffic that goes through Cloudflare. Railway's origin is still
reachable directly, so the app rejects any request that lacks the secret header
Cloudflare adds (`app/Http/Middleware/RequireOriginSecret.php`).

## 4. Known limits

- **Cloudflare free caps uploads at 100 MB.** The Settings tile upload allows 200 MB. Upload large tile sets another way
  (`railway ssh`, then write into `/data/tiles/clup_tiles`).
- Tiles in git (`public/tiles`) seed `/data/tiles` once on first boot; after that the volume wins.
- Runs a single instance (volume + in-container queue). Don't scale replicas.
- Logs go to stderr (Railway log viewer); `storage/logs` is not used.
- Updates: push to GitHub; Railway rebuilds, runs migrations, restarts. Take a Postgres backup first for risky migrations.
- Fonts/basemaps still load from Google/OSM/ArcGIS: office PCs need internet (see `PRE_DEPLOYMENT.md` section 7).
