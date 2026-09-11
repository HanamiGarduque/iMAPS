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
            'layer_type' => 'required|string|in:municipal_boundary,barangay_boundary,land_use_plan',
            'shapefile_zip' => 'required|file|mimes:zip|max:51200', // 50MB max
        ]);

        $zipFile = $request->file('shapefile_zip');
        $extractPath = storage_path('app/temp_shapefiles/' . uniqid());
        File::ensureDirectoryExists($extractPath);
        
        // 1. Extract the ZIP
        $zip = new ZipArchive;
        if ($zip->open($zipFile->path()) === TRUE) {
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entryName = $zip->getNameIndex($index);
                if ($entryName === false || str_contains(str_replace('\\', '/', $entryName), '../') || str_starts_with($entryName, '/')) {
                    $zip->close();
                    File::deleteDirectory($extractPath);
                    return back()->withErrors(['shapefile_zip' => 'The archive contains an unsafe file path.']);
                }
            }
            if (!$zip->extractTo($extractPath)) {
                $zip->close();
                File::deleteDirectory($extractPath);
                return back()->withErrors(['shapefile_zip' => 'Failed to extract the shapefile archive.']);
            }
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
            'land_parcels'       => 'public.land_parcels',
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

        // Validate the archive before replacing the currently active tile set.
        $zip = new ZipArchive;
        if ($zip->open($zipFile->path()) === TRUE) {
            $hasTile = false;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $entryName = $zip->getNameIndex($index);
                $normalizedName = str_replace('\\', '/', (string) $entryName);
                if ($entryName === false || str_contains($normalizedName, '../') || str_starts_with($normalizedName, '/')) {
                    $zip->close();
                    return back()->withErrors(['tiles_zip' => 'The archive contains an unsafe file path.']);
                }
                if (preg_match('/\.(png|jpe?g|webp)$/i', $normalizedName)) {
                    $hasTile = true;
                }
            }
            if (!$hasTile) {
                $zip->close();
                return back()->withErrors(['tiles_zip' => 'The archive does not contain PNG, JPG, or WebP map tiles.']);
            }

            $stagingPath = storage_path('app/temp_tiles/' . uniqid());
            File::ensureDirectoryExists($stagingPath);
            if (!$zip->extractTo($stagingPath)) {
                $zip->close();
                File::deleteDirectory($stagingPath);
                return back()->withErrors(['tiles_zip' => 'Failed to extract the tile archive.']);
            }
            $zip->close();

            // Clear out the old map tiles only after archive validation and extraction succeed.
            if (File::exists($publicPath)) {
                File::deleteDirectory($publicPath);
            }
            File::ensureDirectoryExists(dirname($publicPath));
            if (!File::moveDirectory($stagingPath, $publicPath)) {
                File::deleteDirectory($stagingPath);
                return back()->withErrors(['tiles_zip' => 'The validated tile archive could not be activated.']);
            }
            return back()->with('success', 'CLUP raster map overlay updated successfully!');
        } else {
            return back()->withErrors(['tiles_zip' => 'Failed to open the tile zip archive.']);
        }
    }
}