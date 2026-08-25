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
            'land_use_plan' => 'public.land_use_plan'
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
}