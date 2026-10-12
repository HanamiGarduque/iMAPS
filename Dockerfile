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
RUN apt-get update && apt-get install -y --no-install-recommends \
        supervisor postgresql-client postgis libreoffice-calc fonts-liberation unzip \
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

ENV APP_ENV=production APP_DEBUG=false LOG_CHANNEL=stderr
CMD ["bash", "/start.sh"]
