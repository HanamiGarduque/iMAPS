FROM node:22-slim AS assets
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY vite.config.js postcss.config.js tailwind.config.js jsconfig.json ./
COPY resources ./resources
COPY public ./public
# Railway passes service variables to the build only when declared as ARG
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
RUN npm run build

FROM dunglas/frankenphp:1-php8.3 AS app
WORKDIR /app

# postgis = shp2pgsql (Settings shapefile import); libreoffice-calc = permit PDFs
# postgresql-client-16 comes from the PGDG repo so pg_dump (backup:run) matches the
# PostGIS server's major version; Debian's own client is newer and its dumps can
# fail to restore into 16.
RUN install -d /usr/share/postgresql-common/pgdg \
    && curl -fsSL -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    && . /etc/os-release \
    && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt ${VERSION_CODENAME}-pgdg main" \
        > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update && apt-get install -y --no-install-recommends \
        supervisor postgresql-client-16 postgis libreoffice-calc fonts-liberation unzip \
    && rm -rf /var/lib/apt/lists/* \
    && install-php-extensions pdo_pgsql pgsql gd zip mbstring intl bcmath exif opcache

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --no-interaction

COPY . .
COPY --from=assets /app/public/build ./public/build
RUN composer install --no-dev --optimize-autoloader --no-interaction \
    # templates are code: keep a pristine copy, the volume-backed storage/app gets it on boot
    && mv storage/app/templates /opt/templates \
    && mkdir -p public/tiles && mv public/tiles /opt/tiles

COPY docker/php.ini /usr/local/etc/php/conf.d/zz-imaps.ini
COPY docker/Caddyfile /etc/caddy/Caddyfile
COPY docker/supervisord.conf /etc/supervisor/conf.d/imaps.conf
COPY docker/start.sh /start.sh

ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr \
    PG_DUMP_PATH=/usr/lib/postgresql/16/bin/pg_dump
CMD ["bash", "/start.sh"]
