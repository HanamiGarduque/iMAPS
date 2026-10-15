<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Contracts\Filesystem\Filesystem;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

class RunBackup extends Command
{
    protected $signature = 'backup:run
        {--files : Archive storage/app (uploads, permits) instead of dumping the database}
        {--keep= : Days to keep backups of this kind (defaults to config/backup.php)}';

    protected $description = 'Uploads a database dump (or a storage/app archive) to the backup disk and prunes old ones';

    public function handle(): int
    {
        $kind = $this->option('files') ? 'files' : 'database';
        $disk = Storage::disk(config('backup.disk'));
        $dir = trim(config('backup.path'), '/').'/'.$kind;
        $name = $kind === 'files'
            ? 'imaps-storage-'.now()->format('Y-m-d_His').'.tar.gz'
            : 'imaps-db-'.now()->format('Y-m-d_His').'.dump';
        $local = tempnam(sys_get_temp_dir(), 'imaps-backup-');

        try {
            $kind === 'files' ? $this->archiveStorage($local) : $this->dumpDatabase($local);

            $size = filesize($local);
            if (! $size) {
                throw new RuntimeException('Backup file is empty.');
            }

            $stream = fopen($local, 'r');
            $disk->writeStream("{$dir}/{$name}", $stream);
            if (is_resource($stream)) {
                fclose($stream);
            }

            if ($disk->size("{$dir}/{$name}") !== $size) {
                throw new RuntimeException('Uploaded backup size does not match the local file.');
            }
        } catch (\Throwable $e) {
            $this->error("Backup failed: {$e->getMessage()}");
            report($e);

            return self::FAILURE;
        } finally {
            @unlink($local);
        }

        $this->info(sprintf('Uploaded %s/%s (%.1f MB).', $dir, $name, $size / 1048576));

        $keep = (int) ($this->option('keep') ?? config("backup.keep_days.{$kind}"));
        $pruned = $this->prune($disk, $dir, "{$dir}/{$name}", $keep);
        if ($pruned) {
            $this->line("Deleted {$pruned} backup(s) older than {$keep} days.");
        }

        return self::SUCCESS;
    }

    private function dumpDatabase(string $target): void
    {
        $db = config('database.connections.'.config('database.default'));

        // Custom format: compressed, and pg_restore can restore single tables from it.
        // Owners/grants are left out so it restores into any Postgres role.
        $args = [config('backup.pg_dump'), '--format=custom', '--no-owner', '--no-acl', '--file='.$target];
        $args = array_merge($args, filled($db['url'] ?? null)
            ? ['--dbname='.$db['url']]
            : ['-h', $db['host'], '-p', (string) $db['port'], '-U', $db['username'], '-d', $db['database']]);

        $result = Process::timeout(1800)
            ->env(['PGPASSWORD' => (string) $db['password']])
            ->run($args);

        if ($result->failed()) {
            throw new RuntimeException('pg_dump failed: '.trim($result->errorOutput()));
        }
    }

    private function archiveStorage(string $target): void
    {
        // storage/app is a symlink to /data/app on Railway; archive what it points at.
        // Skipped: templates/ (start.sh copies it from the image on every boot), upload
        // staging dirs, the tile rollback copy, and backups written to a local disk.
        $source = realpath(storage_path('app'));
        $exclude = ['templates', 'temp', 'temp_shapefiles', 'temp_tiles', 'tiles_backup', 'private/backups'];

        $result = Process::timeout(1800)->run([
            'tar', '-czf', $target, '--warning=no-file-changed',
            ...array_map(fn ($dir) => "--exclude=./{$dir}", $exclude),
            '-C', $source, '.',
        ]);

        // Exit 1 means a file changed while it was read (e.g. a permit being written); the rest is intact.
        if ($result->exitCode() > 1) {
            throw new RuntimeException('tar failed: '.trim($result->errorOutput()));
        }
    }

    private function prune(Filesystem $disk, string $dir, string $current, int $keepDays): int
    {
        if ($keepDays < 1) {
            return 0;
        }

        $cutoff = now()->subDays($keepDays)->getTimestamp();
        $deleted = 0;

        foreach ($disk->files($dir) as $path) {
            if ($path !== $current && $disk->lastModified($path) < $cutoff) {
                $disk->delete($path);
                $deleted++;
            }
        }

        return $deleted;
    }
}
