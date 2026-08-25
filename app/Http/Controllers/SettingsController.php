<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use ZipArchive;

class SettingsController extends Controller
{
    public function index()
    {
        return Inertia::render('Settings/Index');
    }

    public function uploadShapefile(Request $request)
    {
        $request->validate([
            'layer_type' => 'required|string',
            'shapefile_zip' => 'required|file|mimes:zip|max:51200', // 50MB max
        ]);

        $zipFile = $request->file('shapefile_zip');
        $extractPath = storage_path('app/temp_shapefiles/' . uniqid());
        
        // 1. Extract the ZIP
        $zip = new ZipArchive;
        if ($zip->open($zipFile->path()) === TRUE) {
            $zip->extractTo($extractPath);
            $zip->close();
        } else {
            return back()->withErrors(['shapefile_zip' => 'Failed to open the zip file.']);
        }

        // 2. Find the .shp file in the extracted contents
        $files = File::allFiles($extractPath);
        $shpFile = collect($files)->first(fn($f) => $f->getExtension() === 'shp');

        if (!$shpFile) {
            File::deleteDirectory($extractPath);
            return back()->withErrors(['shapefile_zip' => 'No .shp file found in the zip archive.']);
        }

        $baseName = $shpFile->getFilenameWithoutExtension();
        $dir = $shpFile->getPath();

        // 3. Validate the Big Four exist together
        $missing = [];
        foreach (['shx', 'dbf', 'prj'] as $ext) {
            if (!File::exists("$dir/$baseName.$ext")) {
                $missing[] = ".$ext";
            }
        }

        if (count($missing) > 0) {
            File::deleteDirectory($extractPath);
            return back()->withErrors(['shapefile_zip' => 'Missing required files: ' . implode(', ', $missing)]);
        }

        // 4. Map layer_type to actual database table names
        $tableMapping = [
            'municipal_boundary' => 'public.rosario_boundary',
            'barangay_boundary'  => 'public.barangay_boundary',
            'land_use_plan'      => 'public.land_use_plan',
        ];
        
        $targetTable = $tableMapping[$request->layer_type] ?? null;
        
        if (!$targetTable) {
            File::deleteDirectory($extractPath);
            return back()->withErrors(['layer_type' => 'Invalid map layer selected.']);
        }

        // 5. Execute PostGIS Import via Terminal Commands
        // Using -d to DROP the existing table and recreate it with the new data
        $shpPath = "$dir/$baseName.shp";
        $dbHost = env('DB_HOST', '127.0.0.1');
        $dbUser = env('DB_USERNAME', 'postgres');
        $dbName = env('DB_DATABASE', 'imaps');
        $dbPass = env('DB_PASSWORD', '');

        $sqlCommand = "shp2pgsql -d -I -s 4326 " . escapeshellarg($shpPath) . " " . escapeshellarg($targetTable);
        // Generate the SQL using shp2pgsql
        $generateSql = Process::run($sqlCommand);

        if ($generateSql->failed()) {
            File::deleteDirectory($extractPath);
            return back()->withErrors(['shapefile_zip' => 'Failed to convert shapefile to SQL.']);
        }

        // Push SQL to database using psql, injecting the password via environment variable
        $importSql = Process::env(['PGPASSWORD' => $dbPass])
            ->input($generateSql->output())
            ->run("psql -h $dbHost -U $dbUser -d $dbName");

        // 6. Cleanup Temporary Files
        File::deleteDirectory($extractPath);

        if ($importSql->failed()) {
            return back()->withErrors(['shapefile_zip' => 'Database import failed. Check PostgreSQL permissions.']);
        }

        return back()->with('success', 'Map layer updated successfully!');
    }
    public function uploadRasterTiles(Request $request)
    {
        $request->validate([
            'tiles_zip' => 'required|file|mimes:zip|max:204800', // Allow up to 200MB for tile bundles
        ]);

        $zipFile = $request->file('tiles_zip');
        
        // Define destination in the public directory (accessible to the browser)
        $publicPath = public_path('tiles/clup_tiles');
        
        // Clear out the old map tiles to prevent ghost images
        if (\Illuminate\Support\Facades\File::exists($publicPath)) {
            \Illuminate\Support\Facades\File::deleteDirectory($publicPath);
        }
        
        // 1. Extract the ZIP directly into the public folder
        $zip = new ZipArchive;
        if ($zip->open($zipFile->path()) === TRUE) {
            $zip->extractTo($publicPath);
            $zip->close();
            
            return back()->with('success', 'CLUP raster map overlay updated successfully!');
        } else {
            return back()->withErrors(['tiles_zip' => 'Failed to open the tile zip archive.']);
        }
    }
}