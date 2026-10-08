<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;
use ZipArchive;

class ShapefileImportConfigTest extends TestCase
{
    use RefreshDatabase;

    public function test_psql_uses_configured_connection_including_port_and_password(): void
    {
        config(['database.connections.pgsql' => array_merge(config('database.connections.pgsql'), [
            'host' => 'db.example', 'port' => '6543', 'username' => 'gis', 'password' => 's3cret', 'database' => 'gisdb',
        ])]);

        // psql is faked to fail so the test never touches the real layer tables or history file.
        Process::fake([
            '*gdalsrsinfo*' => Process::result('EPSG:4326'),
            'shp2pgsql*' => Process::result('SELECT 1;'),
            '*psql*' => Process::result('', 'boom', 1),
        ]);

        $zipPath = tempnam(sys_get_temp_dir(), 'shp') . '.zip';
        $zip = new ZipArchive;
        $zip->open($zipPath, ZipArchive::CREATE);
        foreach (['shp', 'shx', 'dbf', 'prj', 'cpg'] as $ext) {
            $zip->addFromString("layer.$ext", 'x');
        }
        $zip->close();

        $admin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $this->actingAs($admin)->post('/settings/upload-shapefile', [
            'layer_type' => 'land_parcels',
            'shapefile_zip' => new UploadedFile($zipPath, 'layer.zip', 'application/zip', null, true),
        ]);

        Process::assertRan(function (PendingProcess $process) {
            $cmd = is_array($process->command) ? $process->command : [];

            return ($cmd[0] ?? null) === 'psql'
                && $cmd === ['psql', '-v', 'ON_ERROR_STOP=1', '-h', 'db.example', '-p', '6543', '-U', 'gis', '-d', 'gisdb']
                && ($process->environment['PGPASSWORD'] ?? null) === 's3cret';
        });
    }
}
