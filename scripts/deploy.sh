#!/usr/bin/env bash
# Sync the dev tree to the pre-deployment copy and rebuild it. Run from anywhere:
#   scripts/deploy.sh            # deploy
#   scripts/deploy.sh --no-build # skip npm ci/build (backend-only change)
# Details: docs/PRE_DEPLOYMENT.md
set -euo pipefail

DEV="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD="${IMAPS_PROD:-$HOME/imaps-app}"
SECRETS="$HOME/.imaps-deploy"
BACKUPS="$HOME/imaps-backups"
URL="http://127.0.0.1:8080"
BUILD=1; [[ "${1:-}" == "--no-build" ]] && BUILD=0

[[ -f "$PROD/.env" ]] || { echo "No $PROD/.env - do the first-time setup in docs/PRE_DEPLOYMENT.md"; exit 1; }
step() { printf '\n==> %s\n' "$*"; }

step "Backing up prod database"
mkdir -p "$BACKUPS"
DUMP="$BACKUPS/imaps_prod_$(date +%F_%H%M%S).dump"
PGPASSWORD="$(cat "$SECRETS/db_password")" pg_dump -Fc -h 127.0.0.1 -U imaps_app imaps_prod > "$DUMP"
echo "saved $DUMP"
ls -1t "$BACKUPS"/*.dump | tail -n +15 | xargs -r rm --   # keep the newest 14

step "Syncing code (dev -> prod)"
# Never touched: .env, vendor, node_modules, prod uploads (tiles, storage runtime files, storage link).
# Permit templates under storage/app/templates are code, so they do sync.
rsync -a --delete \
  --exclude='/.env' --exclude='/.git' --exclude='/vendor' --exclude='/node_modules' \
  --exclude='/nul' --exclude='/response.txt' --exclude='/scratch' \
  --exclude='/database/database.sqlite' --exclude='/.phpunit.result.cache' \
  --exclude='/iMAPS-forecasting-service' --exclude='/public/hot' \
  --exclude='/public/storage' --exclude='/public/tiles' \
  --include='/storage/app/templates/***' --exclude='/storage/app/*' \
  --exclude='/storage/logs' --exclude='/storage/framework' \
  "$DEV/" "$PROD/"

cd "$PROD"
step "Installing PHP dependencies"
composer install --no-dev --optimize-autoloader --no-interaction

if (( BUILD )); then
  step "Building frontend"
  npm ci --no-audit --no-fund
  npm run build
fi

step "Migrating database"
php artisan migrate --force || { echo "MIGRATION FAILED. Restore with: pg_restore -c -h 127.0.0.1 -U imaps_app -d imaps_prod $DUMP"; exit 1; }

step "Refreshing caches and restarting services"
php artisan config:cache && php artisan route:cache && php artisan view:cache
systemctl --user restart imaps-web imaps-queue imaps-scheduler
sleep 3

step "Smoke test"
code="$(curl -s -o /dev/null -w '%{http_code}' "$URL/ping")"
[[ "$code" == 200 ]] || { echo "FAILED: $URL/ping returned $code. Check: journalctl --user -u imaps-web -n 50"; exit 1; }
echo "OK: $URL/ping returned 200. Backup kept at $DUMP"
