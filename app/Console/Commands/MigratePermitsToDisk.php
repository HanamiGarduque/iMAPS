<?php

namespace App\Console\Commands;

use App\Models\GeneratedPermit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Storage;

class MigratePermitsToDisk extends Command
{
    protected $signature = 'permits:migrate-disk
        {--from=local : Disk the permit files currently live on}
        {--to=r2 : Disk to copy them to}
        {--delete-source : Remove each file from the source disk after a verified copy}';

    protected $description = 'Copies stored permit files between filesystem disks, keeping the same paths';

    public function handle(): int
    {
        $from = Storage::disk($this->option('from'));
        $to = Storage::disk($this->option('to'));

        $copied = $skipped = $missing = 0;

        GeneratedPermit::query()->orderBy('id')->each(function (GeneratedPermit $permit) use ($from, $to, &$copied, &$skipped, &$missing) {
            $path = $permit->file_path;

            if (! $from->exists($path)) {
                $this->warn("Missing on source, skipped: {$path}");
                $missing++;

                return;
            }

            if ($to->exists($path)) {
                $skipped++;
            } else {
                $stream = $from->readStream($path);
                $to->writeStream($path, $stream);
                if (is_resource($stream)) {
                    fclose($stream);
                }
                $copied++;
            }

            if ($this->option('delete-source') && $to->size($path) === $from->size($path)) {
                $from->delete($path);
            }
        });

        $this->info("Copied {$copied}, already present {$skipped}, missing on source {$missing}.");

        return self::SUCCESS;
    }
}
