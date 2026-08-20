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

        // PostGIS magic query to convert spatial table to GeoJSON
        $query = "
            SELECT jsonb_build_object(
                'type',     'FeatureCollection',
                'features', jsonb_agg(features.feature)
            ) as geojson
            FROM (
              SELECT jsonb_build_object(
                'type',       'Feature',
                'geometry',   ST_AsGeoJSON(geom)::jsonb,
                'properties', to_jsonb(inputs) - 'geom'
              ) AS feature
              FROM (SELECT * FROM $tableName) inputs
            ) features;
        ";

        $result = DB::select($query);
        $geojson = json_decode($result[0]->geojson);

        return response()->json($geojson);
    }
}