#!/usr/bin/env bash
# Railway container entrypoint. The Volume is mounted at /data.
set -euo pipefail
cd /app

# Persistent state: storage/app (uploads, permits, history json) and map tiles.
mkdir -p /data/app/public /data/app/private /data/app/generated_permits
rm -rf storage/app && ln -s /data/app storage/app
# code: overwrite every deploy. Copy the CONTENTS ("/."): once the volume already has
# storage/app/templates, "cp -r /opt/templates storage/app/templates" nests a copy inside it
# and the live files (e.g. the permit .xlsx) never update.
mkdir -p storage/app/templates
cp -rf /opt/templates/. storage/app/templates/
[ -d /data/tiles ] || cp -r /opt/tiles /data/tiles   # seed once; Settings uploads then persist
ln -sfn /data/tiles public/tiles
# Permits used to live on the public disk (world-readable); move them to the private one
if [ -d storage/app/public/permits ]; then
  mkdir -p storage/app/private/permits
  cp -rn storage/app/public/permits/. storage/app/private/permits/ && rm -rf storage/app/public/permits
fi
php artisan storage:link --force

# File cache (map data uses rememberForever) lives on the volume so deploys don't wipe it
mkdir -p /data/cache
rm -rf storage/framework/cache && ln -s /data/cache storage/framework/cache

# Postgres must have PostGIS (use Railway's PostGIS template, not the plain one)
php artisan migrate --force
php artisan config:cache && php artisan route:cache && php artisan view:cache

exec supervisord -c /etc/supervisor/conf.d/imaps.conf
