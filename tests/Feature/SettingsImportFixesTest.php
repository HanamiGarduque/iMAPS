<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Tests\TestCase;
use ZipArchive;

class SettingsImportFixesTest extends TestCase
{
    use RefreshDatabase;

    private string $sandbox;

    protected function setUp(): void
    {
        parent::setUp();

        // Real tiles, backups and the history file must never be touched.
        $this->sandbox = sys_get_temp_dir() . '/imaps_settings_' . uniqid();
        File::ensureDirectoryExists("{$this->sandbox}/public");
        File::ensureDirectoryExists("{$this->sandbox}/storage/app");
        $this->app->usePublicPath("{$this->sandbox}/public");
        $this->app->useStoragePath("{$this->sandbox}/storage");
    }

    protected function tearDown(): void
    {
        @chmod("{$this->sandbox}/storage/app/tiles_backup", 0755);
        File::deleteDirectory($this->sandbox);
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Admin', 'is_active' => true]);
    }

    private function shapefileUpload(array $exts, array $contents = []): UploadedFile
    {
        $path = $this->sandbox . '/layer.zip';
        $zip = new ZipArchive;
        $zip->open($path, ZipArchive::CREATE);
        foreach ($exts as $ext) {
            $zip->addFromString("layer.$ext", $contents[$ext] ?? 'x');
        }
        $zip->close();

        return new UploadedFile($path, 'layer.zip', 'application/zip', null, true);
    }

    private function upload(array $exts = ['shp', 'shx', 'dbf', 'prj', 'cpg'], array $contents = [])
    {
        return $this->actingAs($this->admin())->post('/settings/upload-shapefile', [
            'layer_type' => 'land_parcels',
            'shapefile_zip' => $this->shapefileUpload($exts, $contents),
        ]);
    }

    private function fakeProcesses(string $gdalOutput, int $gdalExit = 0): void
    {
        // psql fails so nothing real is imported and no history/cache side effects occur.
        Process::fake([
            '*gdalsrsinfo*' => Process::result($gdalOutput, '', $gdalExit),
            'shp2pgsql*' => Process::result('SELECT 1;'),
            '*psql*' => Process::result('', 'boom', 1),
        ]);
    }

    private function assertShp2pgsqlRanWith(string $fragment): void
    {
        Process::assertRan(fn (PendingProcess $p) => is_string($p->command)
            && str_starts_with($p->command, 'shp2pgsql')
            && str_contains($p->command, $fragment));
    }

    public function test_prs92_shapefile_is_reprojected_to_wgs84(): void
    {
        $this->fakeProcesses("Confidence in this match: 90 %\n\nEPSG:3123\n");

        $this->upload();

        $this->assertShp2pgsqlRanWith('-s 3123:4326 ');
    }

    public function test_wgs84_shapefile_keeps_plain_srid(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n");

        $this->upload();

        $this->assertShp2pgsqlRanWith('-s 4326 ');
    }

    public function test_unidentifiable_crs_is_rejected_without_importing(): void
    {
        $this->fakeProcesses('ERROR 1: failed to load SRS definition', 0);

        $this->upload()->assertSessionHasErrors('shapefile_zip');

        Process::assertNotRan(fn (PendingProcess $p) => is_string($p->command) && str_starts_with($p->command, 'shp2pgsql'));
    }

    public function test_shapefile_without_cpg_is_accepted(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n");

        $this->upload(['shp', 'shx', 'dbf', 'prj']);

        Process::assertRan(fn (PendingProcess $p) => is_string($p->command)
            && str_starts_with($p->command, 'shp2pgsql')
            && !str_contains($p->command, '-W'));
    }

    public function test_cpg_when_present_sets_the_attribute_encoding(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n");

        $this->upload(['shp', 'shx', 'dbf', 'prj', 'cpg'], ['cpg' => "1252\n"]);

        $this->assertShp2pgsqlRanWith("-W 'CP1252'");
    }

    public function test_unsafe_cpg_content_is_ignored(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n");

        $this->upload(['shp', 'shx', 'dbf', 'prj', 'cpg'], ['cpg' => '"; rm -rf / #']);

        Process::assertRan(fn (PendingProcess $p) => is_string($p->command)
            && str_starts_with($p->command, 'shp2pgsql')
            && !str_contains($p->command, '-W'));
    }

    public function test_shapefile_without_prj_is_rejected(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n");

        $this->upload(['shp', 'shx', 'dbf', 'cpg'])
            ->assertSessionHasErrors(['shapefile_zip' => 'Missing required files: .prj']);
    }

    public function test_restore_tiles_swaps_in_the_backup(): void
    {
        File::ensureDirectoryExists(public_path('tiles/clup_tiles'));
        File::put(public_path('tiles/clup_tiles/new.png'), 'new');
        File::ensureDirectoryExists(storage_path('app/tiles_backup/clup_tiles'));
        File::put(storage_path('app/tiles_backup/clup_tiles/old.png'), 'old');

        $this->actingAs($this->admin())->post('/settings/restore-tiles')->assertSessionHasNoErrors();

        $this->assertFileExists(public_path('tiles/clup_tiles/old.png'));
        $this->assertFileDoesNotExist(public_path('tiles/clup_tiles/new.png'));
        $this->assertDirectoryDoesNotExist(public_path('tiles/clup_tiles.replaced'));
    }

    public function test_failed_tile_restore_keeps_current_tiles(): void
    {
        if (function_exists('posix_geteuid') && posix_geteuid() === 0) {
            $this->markTestSkipped('Root ignores directory permissions, so the move cannot be made to fail.');
        }

        File::ensureDirectoryExists(public_path('tiles/clup_tiles'));
        File::put(public_path('tiles/clup_tiles/new.png'), 'new');
        File::ensureDirectoryExists(storage_path('app/tiles_backup/clup_tiles'));
        File::put(storage_path('app/tiles_backup/clup_tiles/old.png'), 'old');
        // A read-only parent makes renaming the backup out of it fail.
        chmod(storage_path('app/tiles_backup'), 0555);

        $this->actingAs($this->admin())->post('/settings/restore-tiles')->assertSessionHasErrors('restore');

        $this->assertFileExists(public_path('tiles/clup_tiles/new.png'));
        $this->assertDirectoryDoesNotExist(public_path('tiles/clup_tiles.replaced'));
    }

    private function assertAudited(string $action, string $noteFragment): void
    {
        $this->assertDatabaseHas('audit_trail', ['action' => $action]);
        $this->assertStringContainsString($noteFragment, \DB::table('audit_trail')->where('action', $action)->value('note'));
    }

    public function test_successful_layer_import_is_audited_but_failed_one_is_not(): void
    {
        $this->fakeProcesses("\nEPSG:4326\n"); // psql fails
        $this->upload();
        $this->assertDatabaseCount('audit_trail', 0);

        Process::fake([
            '*gdalsrsinfo*' => Process::result("\nEPSG:4326\n"),
            'shp2pgsql*' => Process::result('SELECT 1;'),
            '*psql*' => Process::result(''),
        ]);
        $this->upload();

        $this->assertAudited('Map Layer Imported', 'Land Parcels map layer from layer.zip');
    }

    public function test_layer_restore_is_audited(): void
    {
        \DB::statement('DROP TABLE IF EXISTS public.land_parcels_backup');
        \DB::statement('CREATE TABLE public.land_parcels_backup AS TABLE public.land_parcels');

        $this->actingAs($this->admin())->post('/settings/restore-layer', ['layer_type' => 'land_parcels'])
            ->assertSessionHasNoErrors();

        $this->assertAudited('Map Layer Restored', 'Land Parcels map layer');
    }

    public function test_tile_upload_and_restore_are_audited(): void
    {
        $png = $this->sandbox . '/tile.png';
        imagepng(imagecreatetruecolor(1, 1), $png);
        $zipPath = $this->sandbox . '/tiles.zip';
        $zip = new ZipArchive;
        $zip->open($zipPath, ZipArchive::CREATE);
        $zip->addFile($png, '0/0/0.png');
        $zip->close();

        $admin = $this->admin();
        $this->actingAs($admin)->post('/settings/upload-tiles', [
            'tiles_zip' => new UploadedFile($zipPath, 'tiles.zip', 'application/zip', null, true),
        ])->assertSessionHasNoErrors();
        $this->assertAudited('Map Tiles Uploaded', 'tiles.zip');

        // A second upload creates the backup that a restore needs.
        $this->actingAs($admin)->post('/settings/upload-tiles', [
            'tiles_zip' => new UploadedFile($zipPath, 'tiles.zip', 'application/zip', null, true),
        ]);
        $this->actingAs($admin)->post('/settings/restore-tiles')->assertSessionHasNoErrors();

        $this->assertAudited('Map Tiles Restored', 'CLUP raster map tiles');
    }

    public function test_settings_change_notifies_other_admins_and_planning_officers_only(): void
    {
        $actor = User::factory()->create(['role' => 'Admin', 'is_active' => true, 'name' => 'Jane Admin']);
        $otherAdmin = User::factory()->create(['role' => 'Admin', 'is_active' => true]);
        $po = User::factory()->create(['role' => 'Planning Officer', 'is_active' => true]);
        $inactivePo = User::factory()->create(['role' => 'Planning Officer', 'is_active' => false]);
        $inspector = User::factory()->create(['role' => 'Site Inspector', 'is_active' => true]);

        \DB::statement('DROP TABLE IF EXISTS public.land_parcels_backup');
        \DB::statement('CREATE TABLE public.land_parcels_backup AS TABLE public.land_parcels');
        $this->actingAs($actor)->post('/settings/restore-layer', ['layer_type' => 'land_parcels']);

        $notified = \DB::table('notifications')->where('title', 'Map Settings Changed')->pluck('user_id')->all();
        $this->assertEqualsCanonicalizing([$otherAdmin->id, $po->id], $notified);
        $this->assertStringContainsString(
            'Jane Admin: Restored the previous version of the Land Parcels map layer.',
            \DB::table('notifications')->where('user_id', $po->id)->value('message'),
        );
    }
}
