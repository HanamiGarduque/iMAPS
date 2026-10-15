<?php

return [

    /*
    | Off-site backups written by `php artisan backup:run`. The disk should be
    | outside Railway (the private backups R2 bucket by default) so losing the
    | project or a volume doesn't take the backups with it.
    */

    'disk' => env('BACKUP_DISK', 'backups'),

    'path' => env('BACKUP_PATH', 'backups'),

    // Days to keep each kind of backup before the next run deletes it.
    'keep_days' => [
        'database' => (int) env('BACKUP_KEEP_DATABASE_DAYS', 14),
        'files' => (int) env('BACKUP_KEEP_FILES_DAYS', 28),
    ],

    // Must match the server's major version (PostGIS service runs 16); the Docker
    // image installs postgresql-client-16 and points this at it.
    'pg_dump' => env('PG_DUMP_PATH', 'pg_dump'),

];
