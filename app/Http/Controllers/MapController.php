<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class MapController extends Controller
{
    // Map geometry is reference data: it only changes when an administrator
    // re-imports a shapefile through Settings. Building it is not cheap, though
    // — `land_use_plan` is 513 parcels and 722,952 vertices (22 MB of raw
    // GeoJSON), and every request used to re-run ST_Transform and
    // ST_SimplifyPreserveTopology over all of it, then ship the result
    // uncompressed. The generated GeoJSON is now built once, gzipped once, and
    // served from cache until the next import.
    private const CACHE_TTL_DAYS = 30;
    private const VERSION_KEY = 'map_layers:version';

    // Called after a shapefile import so the next request rebuilds from the new
    // table. Bumping a version (rather than deleting keys) also retires every
    // `?barangay=` variant without having to enumerate them.
    public static function flushLayerCache(): void
    {
        Cache::forever(self::VERSION_KEY, (string) microtime(true));
    }

    // Builds and caches the layers the dashboard opens with, so no user is the
    // one who pays for a cold build. Measured cold: rosario_boundary ~2s,
    // barangay_boundary ~0.3s, land_use_plan ~19.5s — that last one used to be
    // part of every dashboard load.
    public static function warmLayerCache(array $layers = ['rosario_boundary', 'barangay_boundary', 'land_use_plan']): array
    {
        $timings = [];
        $controller = new self();
        foreach ($layers as $layer) {
            $start = microtime(true);
            $controller->getLayer($layer, Request::create('/', 'GET'));
            $timings[$layer] = (int) round((microtime(true) - $start) * 1000);
        }
        return $timings;
    }

    private function cacheKey(string $layer, string $scope): string
    {
        $version = Cache::rememberForever(self::VERSION_KEY, fn () => '1');
        return 'map_layers:' . $version . ':' . $layer . ':' . md5(strtolower($scope));
    }

    public function getLayer($layer, Request $request)
    {
        // Whitelist allowed tables to prevent SQL injection
        $allowedLayers = [
            'rosario_boundary' => 'public.rosario_boundary',
            'barangay_boundary' => 'public.barangay_boundary',
            'land_use_plan' => 'public.land_use_plan',
            'land_parcels' => 'public.land_parcels'
        ];

        if (!array_key_exists($layer, $allowedLayers)) {
            return response()->json(['error' => 'Layer not found'], 404);
        }

        $tableName = $allowedLayers[$layer];

        // Optional ?barangay= scoping for layers that carry a `location` column.
        //
        // The diversity map reveals one barangay's zoning parcels at a time. It
        // used to pull every parcel in the municipality and filter client-side,
        // in both the 2D and the 3D view, so the whole plan crossed the wire
        // twice before a single parcel could be drawn. Filtering in PostGIS
        // keeps the response proportional to what is actually rendered.
        $barangay = trim((string) $request->query('barangay', ''));
        $scopeClause = '';
        $bindings = [];

        if ($barangay !== '' && $layer === 'land_use_plan') {
            // Bound parameter, and compared case-insensitively because the
            // `location` values carry inconsistent casing and padding.
            $scopeClause = 'AND LOWER(TRIM(location)) = LOWER(TRIM(?))';
            $bindings[] = $barangay;
        }

        $key = $this->cacheKey($layer, $barangay);

        // The ETag lives under its own small key so a revalidation (the common
        // case after first load) never has to read the multi-megabyte body.
        $etag = Cache::get($key . ':etag');
        if ($etag === null) {
            $geojson = $this->buildGeoJson($tableName, $scopeClause, $bindings);
            $etag = '"' . md5($geojson) . '"';

            $ttl = now()->addDays(self::CACHE_TTL_DAYS);
            Cache::put($key . ':body', $geojson, $ttl);
            // Compressed once here instead of per request. base64 so the value
            // survives cache stores that keep text columns (database/pgsql).
            Cache::put($key . ':gz', base64_encode(gzencode($geojson, 6)), $ttl);
            Cache::put($key . ':etag', $etag, $ttl);
        }

        $headers = [
            'Content-Type' => 'application/json',
            // `private`: these routes sit behind auth. `no-cache` means "store it,
            // but check back first" — the browser keeps its copy and asks with
            // If-None-Match, getting a body-less 304 unless a re-import changed
            // the geometry. Always fresh, and nearly free when nothing changed.
            'Cache-Control' => 'private, no-cache',
            'ETag' => $etag,
            'Vary' => 'Accept-Encoding',
        ];

        $ifNoneMatch = (string) $request->header('If-None-Match', '');
        if ($ifNoneMatch !== '' && str_contains($ifNoneMatch, trim($etag, '"'))) {
            return response('', 304, $headers);
        }

        // GeoJSON compresses roughly 8–10x. `php artisan serve` never compresses
        // responses, so without this the full payload crossed the wire raw.
        $acceptsGzip = str_contains(strtolower((string) $request->header('Accept-Encoding', '')), 'gzip');
        if ($acceptsGzip) {
            $gz = Cache::get($key . ':gz');
            if ($gz !== null) {
                $body = base64_decode($gz);
                return response($body, 200, $headers + [
                    'Content-Encoding' => 'gzip',
                    'Content-Length' => (string) strlen($body),
                ]);
            }
        }

        $body = Cache::get($key . ':body');
        if ($body === null) {
            // Evicted between the ETag check and now: rebuild inline.
            $body = $this->buildGeoJson($tableName, $scopeClause, $bindings);
        }

        return response($body, 200, $headers + ['Content-Length' => (string) strlen($body)]);
    }

    private function buildGeoJson(string $tableName, string $scopeClause, array $bindings): string
    {
        // 1. Transform coordinates to WGS84 (EPSG:4326)
        // 2. Filter out rogue/corrupt geometries that fall outside the Philippines bounds
        // 3. Drop shape_leng / shape_area: computed by the GIS export, read by
        //    nothing in the application, and repeated on every feature.
        $query = "
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(transformed_geom, 6)::jsonb,
                'properties', to_jsonb(inputs) - 'geom' - 'transformed_geom' - 'shape_leng' - 'shape_area'
              ) AS feature
              FROM (
                  SELECT *,
                  ST_SimplifyPreserveTopology(
                      CASE 
                        WHEN ST_XMax(geom) > 5000000 
                        THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                        WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 
                        THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                        ELSE geom 
                      END, 
                  0.00005) AS transformed_geom
                  FROM $tableName WHERE geom IS NOT NULL $scopeClause
              ) inputs
              WHERE ST_XMin(transformed_geom) BETWEEN 115 AND 128 
                AND ST_YMin(transformed_geom) BETWEEN 4 AND 22
            ) features;
        ";

        $result = DB::select($query, $bindings);

        return (string) $result[0]->geojson;
    }
    public function getZoningByCoordinates(Request $request)
    {
        $request->validate([
            'lat' => 'required|numeric',
            'lng' => 'required|numeric',
        ]);

        $lat = (float) $request->input('lat');
        $lng = (float) $request->input('lng');

        try {
            // Realistic PostGIS Point-in-Polygon Query
            // 1. ST_MakePoint creates the 2D coordinate from the frontend
            // 2. ST_SetSRID tags it as EPSG:4326 (Lat/Lng)
            // 3. ST_Force2D flattens your MultiPolygonZM to MultiPolygon so it can intersect
            // land_use_plan.geom is declared SRID 4326 but its actual coordinates
            // are frequently still raw Philippines Zone III eastings/northings
            // (values in the 500,000s/1,500,000s) — ST_SRID() alone can't catch
            // that since the column metadata itself says 4326. Detect it the
            // same way warmLayerCache() below does: real lon/lat never exceeds
            // 180/90, so a coordinate past that range is still projected.
            $query = "
                SELECT lup_2030
                FROM land_use_plan
                WHERE ST_Intersects(
                    ST_MakeValid(ST_Force2D(
                        CASE
                            WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                            WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                            WHEN ST_SRID(geom) = 0 THEN ST_SetSRID(geom, 4326)
                            WHEN ST_SRID(geom) != 4326 THEN ST_Transform(geom, 4326)
                            ELSE geom
                        END
                    )),

                    ST_SetSRID(ST_MakePoint(?, ?), 4326)
                )
                LIMIT 1
            ";

            $zoning = \Illuminate\Support\Facades\DB::selectOne($query, [$lng, $lat]);

            return response()->json([
                'lup_2030' => $zoning ? $zoning->lup_2030 : null
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error("Spatial Zoning Error: " . $e->getMessage());
            return response()->json(['lup_2030' => null], 500);
        }
    }
    public function getZoningByParcelArea(Request $request)
    {
        $request->validate([
            'pin' => 'required|string',
        ]);

        $pin = $request->input('pin');

        try {
            // 1. ST_MakeValid prevents PostGIS topology exceptions from dirty polygons
            // 2. ST_Force2D flattens geometries
            // 3. Heuristic transforms: when SRID is missing or coordinates are in projected units
            //    try common projections (WebMercator / local projected) based on coordinate magnitude
            $query = "
                WITH pgeom AS (
                  SELECT property_index_number,
                    ST_MakeValid(ST_Force2D(
                      CASE
                        WHEN ST_SRID(geom) = 0 THEN (
                          CASE
                            WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                            WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                            ELSE ST_SetSRID(geom, 4326)
                          END
                        )
                        WHEN ST_SRID(geom) = 4326 AND (ST_XMax(geom) > 180 OR ST_YMax(geom) > 90) THEN (
                          CASE
                            WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                            WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                            ELSE geom
                          END
                        )
                        WHEN ST_SRID(geom) != 4326 THEN ST_Transform(geom, 4326)
                        ELSE geom
                      END
                    )) AS geom4326
                  FROM land_parcels
                  WHERE property_index_number = ?
                ), zgeom AS (
                  SELECT lup_2030,
                    ST_MakeValid(ST_Force2D(
                      CASE
                        WHEN ST_SRID(geom) = 0 THEN (
                          CASE
                            WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                            WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                            ELSE ST_SetSRID(geom, 4326)
                          END
                        )
                        WHEN ST_SRID(geom) = 4326 AND (ST_XMax(geom) > 180 OR ST_YMax(geom) > 90) THEN (
                          CASE
                            WHEN ST_XMax(geom) > 5000000 THEN ST_Transform(ST_SetSRID(geom, 3857), 4326)
                            WHEN ST_XMax(geom) > 180 OR ST_YMax(geom) > 90 THEN ST_Transform(ST_SetSRID(geom, 25393), 4326)
                            ELSE geom
                          END
                        )
                        WHEN ST_SRID(geom) != 4326 THEN ST_Transform(geom, 4326)
                        ELSE geom
                      END
                    )) AS geom4326
                  FROM land_use_plan
                )
                SELECT z.lup_2030,
                  ST_Area(ST_Intersection(p.geom4326, z.geom4326)) AS overlap_area
                FROM pgeom p
                JOIN zgeom z ON ST_Intersects(p.geom4326, z.geom4326)
                ORDER BY overlap_area DESC
                LIMIT 1
            ";

            $zoning = \Illuminate\Support\Facades\DB::selectOne($query, [$pin]);

            return response()->json([
                'lup_2030' => $zoning ? $zoning->lup_2030 : null
            ]);
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::error("Area Zoning Error: " . $e->getMessage());
            return response()->json(['lup_2030' => null], 500);
        }
    }
    
}