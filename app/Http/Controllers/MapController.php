<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MapController extends Controller
{
    public function getLayer($layer)
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

        // 1. Transform coordinates to WGS84 (EPSG:4326)
        // 2. Filter out rogue/corrupt geometries that fall outside the Philippines bounds
        $query = "
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', COALESCE(jsonb_agg(features.feature), '[]'::jsonb)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(transformed_geom)::jsonb,
                'properties', to_jsonb(inputs) - 'geom' - 'transformed_geom'
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
                  FROM $tableName WHERE geom IS NOT NULL
              ) inputs
              WHERE ST_XMin(transformed_geom) BETWEEN 115 AND 128 
                AND ST_YMin(transformed_geom) BETWEEN 4 AND 22
            ) features;
        ";

        $result = DB::select($query);

        // Output the raw JSON string directly from PostGIS with correct headers.
        return response($result[0]->geojson, 200, ['Content-Type' => 'application/json']);
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
            $query = "
                SELECT lup_2030 
                FROM land_use_plan 
                WHERE ST_Intersects(
                    ST_MakeValid(ST_Force2D(
                        CASE 
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