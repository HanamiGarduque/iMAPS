# Deploying iMAPS on Railway behind Cloudflare

One Railway app service (web + queue worker + scheduler under supervisord, see
`docker/`) + a PostGIS database + one Volume. Cloudflare sits in front and only
lets registered devices through: each device holds a client certificate (mTLS) and a
WAF custom rule blocks requests without one. IP addresses are not used, so staff on
dynamic IPs are not locked out.

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
| `VITE_ARCGIS_API_KEY` | Esri basemap key (satellite and topographic maps); needed at **build** time. Without it the map silently falls back to OpenStreetMap. Restrict it to the "Static basemap tiles" privilege and your domain referrer |
| `FORECAST_SERVICE_URL`, `FORECAST_SERVICE_API_KEY` | only if the forecasting service is hosted somewhere |
| `ORIGIN_SECRET` | `openssl rand -hex 32` (see section 3) |
| `CSP_MODE` | `report-only` (default: violations are logged in the browser console, nothing is blocked), `enforce` or `off`. Switch to `enforce` after checking the console on `/login` and the map pages |
| `HSTS_MAX_AGE` | seconds, default `31536000` (1 year); sent only over HTTPS; `0` disables |
| `ALLOWED_IPS` | leave **unset** when staff use dynamic IPs; only for an office with a fixed public IP (see section 2b) |

   Do not set `PORT`; Railway injects it. Do not run the seeders (`admin@imaps.com` / `password123`).
5. **Networking → Custom Domain:** add your domain, point the CNAME Railway gives you at it. Then **delete the generated `*.up.railway.app` domain.**
6. First boot runs migrations automatically (`docker/start.sh`). Create the first admin with
   `railway ssh` → `php artisan tinker`, then log in and import shapefiles on the **Settings** page and run `php artisan map:warm`.

## 2. Cloudflare

1. Add the domain to Cloudflare (free plan), proxied (orange cloud) CNAME to Railway.
2. **SSL/TLS → Full (strict)**. (Flexible causes redirect loops.)
3. **Registered devices only (mTLS).** Each allowed device gets its own client certificate; see
   section 2a for issuing them.
   - *SSL/TLS → Client Certificates → Hosts → Edit*: add the domain. This only makes Cloudflare
     request a certificate; it does not block anyone yet.
   - *Security → Security rules → Create custom rule* (or the **Create mTLS Rule** template),
     expression `(not cf.tls_client_auth.cert_verified and http.host eq "<your-domain>")`,
     action **Block**.
   - Turn the rule on only after your own device's certificate works, or you lock yourself out.
     To pause enforcement, set the rule to **Disabled** (certificates stay valid).

   A browser without a certificate sees Cloudflare's "Sorry, you have been blocked" page.
4. **No Zero Trust Access application on the domain.** If a self-hosted application exists under
   *Zero Trust → Access → Applications*, delete it unless you deliberately use it, or users get an
   extra email-code prompt (which can be slow to arrive).
5. **Rules → Transform Rules → Modify Request Header → Set static**: `X-Origin-Secret` = the same value as `ORIGIN_SECRET`.
   Without this step the app returns 403 to everyone (only `/ping` is exempt).

### 2a. Issuing and revoking device certificates

One certificate per device; never share one between people or machines.

1. The member generates a private key and a certificate signing request (CSR) on their own device
   (on Windows, `certreq -new` creates a non-exportable key in the user's certificate store) and
   sends only the CSR.
2. *SSL/TLS → Client Certificates → Add Certificate*, choose to use your own CSR, paste it, set a
   validity (1 year is a sensible default) and copy the issued certificate back to the member.
   (If Cloudflare rejects a `certreq` CSR, change the `NEW CERTIFICATE REQUEST` header and footer to
   `CERTIFICATE REQUEST`.)
3. The member installs it (`certreq -accept` on Windows), restarts the browser and picks the
   certificate when prompted. Use Brave, Chrome or Edge on Windows; they read the Windows store.
4. Record the member, device, issue and expiry dates; renew before expiry.
5. **Revoke** a certificate in the same Client Certificates list when a device is lost or a member
   leaves. Only that device is blocked.

Cloudflare-generated keys also work (download or copy the key, bundle it as `.p12`) but expose the
private key to the admin and must be moved over a secure channel, so prefer the CSR route. A
browser prompt to choose a certificate appears by default; managed PCs can skip it with the
`AutoSelectCertificateForUrls` browser policy.

## 2b. `ALLOWED_IPS` (app-side allowlist)

`ALLOWED_IPS` on the app service (comma-separated, CIDR allowed, e.g. `203.0.113.10,198.51.100.0/24`)
makes the app itself return 403 to any other client IP (`/ping` stays open). It works with
`ORIGIN_SECRET` set: the app then checks Cloudflare's `CF-Connecting-IP`. It is **not compatible
with dynamic IPs**: anyone whose address changes is blocked until the list is edited, so leave it
**unset** when access is controlled by device certificates (section 2). Use it only for an office
with a fixed public IP, or alone while the domain is not on Cloudflare yet (leave `ORIGIN_SECRET`
unset then). Blocked IPs are logged as `Blocked by ALLOWED_IPS`; if you are blocked, copy the IP
from the Railway logs.

## 3. Why the origin secret

The mTLS rule only filters traffic that goes through Cloudflare. Railway's origin is still
reachable directly, so the app rejects any request that lacks the secret header
Cloudflare adds (`app/Http/Middleware/RequireOriginSecret.php`).

## 4. Known limits

- **Cloudflare free caps uploads at 100 MB.** The Settings tile upload allows 200 MB. Upload large tile sets another way
  (`railway ssh`, then write into `/data/tiles/clup_tiles`).
- Tiles in git (`public/tiles`) seed `/data/tiles` once on first boot; after that the volume wins.
- Runs a single instance (volume + in-container queue). Don't scale replicas.
- Logs go to stderr (Railway log viewer); `storage/logs` is not used.
- Updates: push to GitHub; Railway rebuilds, runs migrations, restarts. Take a Postgres backup first for risky migrations.
- Fonts load from Google and basemaps from OSM/ArcGIS, so users need internet. The site itself is only reachable online.
- With the mTLS rule on, anything that calls the public domain without a certificate (webhooks,
  scripts, other services) is blocked too. Add a path exception to the rule for those callers.
- Certificates expire and are per device; a lost device must be revoked (section 2a).

## 5. Go-live checklist

- [ ] `ORIGIN_SECRET` set (or `ALLOWED_IPS` until Cloudflare is live); generated `*.up.railway.app` domain deleted.
- [ ] Domain listed under Client Certificates → Hosts; mTLS block rule is **Active**; every team device has its own certificate and the register of issued certificates is up to date.
- [ ] Tested: a registered device loads the site from a different network; an unregistered browser is blocked.
- [ ] `ALLOWED_IPS` unset (dynamic IPs) and the old `office_ips` WAF rule removed or disabled; no unintended Zero Trust Access application on the domain.
- [ ] Seeders never run; no `admin@imaps.com` / `password123` account exists (`User::where('email','admin@imaps.com')->count()` is 0).
- [ ] `APP_DEBUG=false`, `SESSION_SECURE_COOKIE=true`, `SESSION_ENCRYPT=true`.
- [ ] Security headers present (`curl -sI https://<domain>/ping`): `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, `Strict-Transport-Security`, and a `Content-Security-Policy-Report-Only` (or `Content-Security-Policy` once `CSP_MODE=enforce`) with no console violations on `/login` and the map pages.
- [ ] The Postgres service and the app's `/data` volume both exist (permits, uploads and tiles live on the volume).
- [ ] Backups: Railway does not back up Postgres or volumes for you by default. Enable Railway's volume backups on both,
      and keep an off-site `pg_dump` (`pg_dump "$DATABASE_PUBLIC_URL" -Fc -f imaps-$(date +%F).dump`) before risky migrations.
      Do a test restore once.
- [ ] Logged out, `/storage/permits/...` returns 404 (permits are on the private disk).
