<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use ZipArchive;

class SettingsController extends Controller
{
    private const LAYER_TABLES = [
        'municipal_boundary' => 'public.rosario_boundary',
        'barangay_boundary'  => 'public.barangay_boundary',
        'land_use_plan'      => 'public.land_use_plan',
        'land_parcels'       => 'public.land_parcels',
    ];

    private const TILES_KEY = 'clup_tiles';

    public function index()
    {
        return Inertia::render('Settings/Index', [
            'layerHistory' => $this->readHistory(),
        ]);
    }

    public function uploadShapefile(Request $request)
    {
        $request->validate([
            'layer_type' => 'required|string|in:' . implode(',', array_keys(self::LAYER_TABLES)),
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

        // 3. Validate the Big Five exist together
        $missing = [];
        foreach (['shx', 'dbf', 'prj', 'cpg'] as $ext) {
            if (!File::exists("$dir/$baseName.$ext")) {
                $missing[] = ".$ext";
            }
        }

        if (count($missing) > 0) {
            File::deleteDirectory($extractPath);
            return back()->withErrors(['shapefile_zip' => 'Missing required files: ' . implode(', ', $missing)]);
        }

        // 4. Map layer_type to actual database table names
        $targetTable = self::LAYER_TABLES[$request->layer_type];

        // 5. Keep a copy of the current table so the import can be undone.
        $backupTable = $targetTable . '_backup';
        $hasBackup = false;
        if ($this->tableExists($targetTable)) {
            DB::statement("DROP TABLE IF EXISTS {$backupTable}");
            DB::statement("CREATE TABLE {$backupTable} AS TABLE {$targetTable}");
            $hasBackup = true;
        }

        // 6. Execute PostGIS Import via Terminal Commands
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

        // Push SQL to database using psql. ON_ERROR_STOP makes psql exit non-zero on a
        // failed statement; without it a broken import would be reported as a success.
        $importSql = Process::env(['PGPASSWORD' => $dbPass])
            ->input($generateSql->output())
            ->run("psql -v ON_ERROR_STOP=1 -h $dbHost -U $dbUser -d $dbName");

        // 7. Cleanup Temporary Files
        File::deleteDirectory($extractPath);

        if ($importSql->failed()) {
            if ($hasBackup && $this->restoreTableFromBackup($targetTable)) {
                $this->flushMapCache();
                return back()->withErrors(['shapefile_zip' => 'Database import failed. The previous version of the layer was kept.']);
            }
            return back()->withErrors(['shapefile_zip' => 'Database import failed. Check PostgreSQL permissions.']);
        }

        $previous = $this->readHistory()[$request->layer_type] ?? [];
        $this->recordHistory($request->layer_type, [
            'updated_at' => now()->toIso8601String(),
            'updated_by' => $request->user()?->name,
            'file_name'  => $zipFile->getClientOriginalName(),
            'has_backup' => $hasBackup,
            'backup_at'  => $hasBackup ? ($previous['updated_at'] ?? null) : null,
        ]);

        $this->flushMapCache();

        return back()->with('success', 'Map layer updated successfully!');
    }

    public function restoreLayer(Request $request)
    {
        $request->validate([
            'layer_type' => 'required|string|in:' . implode(',', array_keys(self::LAYER_TABLES)),
        ]);

        $targetTable = self::LAYER_TABLES[$request->layer_type];

        if (!$this->tableExists($targetTable . '_backup')) {
            return back()->withErrors(['restore' => 'There is no previous version of this layer to restore.']);
        }
        if (!$this->restoreTableFromBackup($targetTable)) {
            return back()->withErrors(['restore' => 'The previous version could not be restored.']);
        }

        $this->recordHistory($request->layer_type, [
            'updated_at' => now()->toIso8601String(),
            'updated_by' => $request->user()?->name,
            'file_name'  => 'Restored previous version',
            'has_backup' => false,
            'backup_at'  => null,
        ]);

        $this->flushMapCache();

        return back()->with('success', 'Previous layer version restored.');
    }

    public function uploadRasterTiles(Request $request)
    {
        $request->validate([
            'tiles_zip' => 'required|file|mimes:zip|max:204800', // Allow up to 200MB for tile bundles
        ]);

        $zipFile = $request->file('tiles_zip');

        // Define destination in the public directory (accessible to the browser)
        $publicPath = public_path('tiles/clup_tiles');
        $backupPath = $this->tilesBackupPath();

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

            // Move the current tiles aside (instead of deleting them) so the deploy can be undone.
            $hasBackup = false;
            if (File::exists($publicPath)) {
                File::deleteDirectory($backupPath);
                File::ensureDirectoryExists(dirname($backupPath));
                if (!File::moveDirectory($publicPath, $backupPath)) {
                    File::deleteDirectory($stagingPath);
                    return back()->withErrors(['tiles_zip' => 'The current tiles could not be backed up, so nothing was changed.']);
                }
                $hasBackup = true;
            }
            File::ensureDirectoryExists(dirname($publicPath));
            if (!File::moveDirectory($stagingPath, $publicPath)) {
                File::deleteDirectory($stagingPath);
                if ($hasBackup) {
                    File::moveDirectory($backupPath, $publicPath);
                }
                return back()->withErrors(['tiles_zip' => 'The validated tile archive could not be activated. The previous tiles were kept.']);
            }

            $previous = $this->readHistory()[self::TILES_KEY] ?? [];
            $this->recordHistory(self::TILES_KEY, [
                'updated_at' => now()->toIso8601String(),
                'updated_by' => $request->user()?->name,
                'file_name'  => $zipFile->getClientOriginalName(),
                'has_backup' => $hasBackup,
                'backup_at'  => $hasBackup ? ($previous['updated_at'] ?? null) : null,
            ]);

            return back()->with('success', 'CLUP raster map overlay updated successfully!');
        } else {
            return back()->withErrors(['tiles_zip' => 'Failed to open the tile zip archive.']);
        }
    }

    public function restoreRasterTiles(Request $request)
    {
        $publicPath = public_path('tiles/clup_tiles');
        $backupPath = $this->tilesBackupPath();

        if (!File::exists($backupPath)) {
            return back()->withErrors(['restore' => 'There are no previous tiles to restore.']);
        }

        File::deleteDirectory($publicPath);
        if (!File::moveDirectory($backupPath, $publicPath)) {
            return back()->withErrors(['restore' => 'The previous tiles could not be restored.']);
        }

        $this->recordHistory(self::TILES_KEY, [
            'updated_at' => now()->toIso8601String(),
            'updated_by' => $request->user()?->name,
            'file_name'  => 'Restored previous version',
            'has_backup' => false,
            'backup_at'  => null,
        ]);

        return back()->with('success', 'Previous raster tiles restored.');
    }

    // Swaps the `_backup` copy back in. CREATE TABLE AS doesn't copy keys or indexes,
    // so the primary key and spatial index that shp2pgsql normally creates are rebuilt.
    private function restoreTableFromBackup(string $table): bool
    {
        [$schema, $name] = explode('.', $table);
        $backup = $table . '_backup';

        if (!$this->tableExists($backup)) {
            return false;
        }

        try {
            DB::transaction(function () use ($table, $backup, $schema, $name) {
                DB::statement("DROP TABLE IF EXISTS {$table}");
                DB::statement("ALTER TABLE {$backup} RENAME TO {$name}");

                $columns = collect(DB::select(
                    'select column_name from information_schema.columns where table_schema = ? and table_name = ?',
                    [$schema, $name]
                ))->pluck('column_name');

                if ($columns->contains('gid')) {
                    DB::statement("ALTER TABLE {$table} ADD PRIMARY KEY (gid)");
                }
                if ($columns->contains('geom')) {
                    DB::statement("CREATE INDEX ON {$table} USING GIST (geom)");
                }
            });
        } catch (\Throwable $e) {
            report($e);
            return false;
        }

        return true;
    }

    private function tableExists(string $table): bool
    {
        return DB::selectOne('select to_regclass(?) as oid', [$table])->oid !== null;
    }

    private function flushMapCache(): void
    {
        // The map API serves layers from cache; retire it so the next request
        // rebuilds from the table that was just replaced — then rebuild it
        // straight away, after this response is sent, so the next person to open
        // the dashboard isn't the one who waits ~20s for land_use_plan.
        MapController::flushLayerCache();
        dispatch(fn () => MapController::warmLayerCache())->afterResponse();
    }

    private function tilesBackupPath(): string
    {
        return storage_path('app/tiles_backup/clup_tiles');
    }

    // Upload history lives in a small JSON file: one entry per layer plus one for the tiles.
    private function historyPath(): string
    {
        return storage_path('app/settings_layer_history.json');
    }

    private function readHistory(): array
    {
        $path = $this->historyPath();
        if (!File::exists($path)) {
            return [];
        }
        return json_decode(File::get($path), true) ?: [];
    }

    private function recordHistory(string $key, array $entry): void
    {
        $history = $this->readHistory();
        $history[$key] = $entry;
        File::put($this->historyPath(), json_encode($history, JSON_PRETTY_PRINT));
    }
}
