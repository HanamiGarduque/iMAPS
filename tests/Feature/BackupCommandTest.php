<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class BackupCommandTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('backups');
        config([
            'backup.disk' => 'backups',
            'backup.path' => 'backups',
            'backup.keep_days' => [
                'database' => 14,
                'files' => 28,
            ],
            'backup.pg_dump' => 'pg_dump',
        ]);
    }

    public function test_backup_run_dumps_database_and_uploads_to_backup_disk(): void
    {
        $exitCode = Artisan::call('backup:run');
        $this->assertSame(0, $exitCode, 'backup:run exited with failure: ' . Artisan::output());

        $disk = Storage::disk('backups');
        $files = $disk->files('backups/database');

        $this->assertCount(1, $files, 'Expected exactly one database backup file in backups/database');
        $backupPath = $files[0];
        $this->assertStringStartsWith('backups/database/imaps-db-', $backupPath);
        $this->assertStringEndsWith('.dump', $backupPath);
        $this->assertGreaterThan(0, $disk->size($backupPath));
    }

    public function test_backup_run_files_archives_storage_and_uploads_to_backup_disk(): void
    {
        $exitCode = Artisan::call('backup:run', ['--files' => true]);
        $this->assertSame(0, $exitCode, 'backup:run --files exited with failure: ' . Artisan::output());

        $disk = Storage::disk('backups');
        $files = $disk->files('backups/files');

        $this->assertCount(1, $files, 'Expected exactly one files backup archive in backups/files');
        $backupPath = $files[0];
        $this->assertStringStartsWith('backups/files/imaps-storage-', $backupPath);
        $this->assertStringEndsWith('.tar.gz', $backupPath);
        $this->assertGreaterThan(0, $disk->size($backupPath));
    }

    public function test_backup_pruning_removes_old_backups_beyond_retention(): void
    {
        $disk = Storage::disk('backups');

        // Create an old backup file dated 30 days ago
        $oldPath = 'backups/database/imaps-db-old.dump';
        $disk->put($oldPath, 'dummy-dump-content');

        // Manually backdate the modification time of the old file
        $storageRoot = $disk->path('');
        $oldFilePath = $storageRoot . '/' . $oldPath;
        if (file_exists($oldFilePath)) {
            touch($oldFilePath, now()->subDays(30)->getTimestamp());
        }

        $exitCode = Artisan::call('backup:run', ['--keep' => 14]);
        $this->assertSame(0, $exitCode);

        // The old backup should have been pruned
        $this->assertFalse($disk->exists($oldPath), 'Old backup older than 14 days was not pruned.');

        // The newly created backup should still exist
        $files = $disk->files('backups/database');
        $this->assertCount(1, $files);
    }
}
