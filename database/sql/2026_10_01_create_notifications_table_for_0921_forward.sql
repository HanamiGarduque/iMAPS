-- =====================================================================
-- Post-Loop 9 - notifications table for the existing canonical 0921 database
-- =====================================================================
--
-- name: 2026_10_01_create_notifications_table_for_0921_forward.sql
-- target: iMAPS PostgreSQL, existing 0921-based database (ledger present)
-- status: PLANNED / NOT APPLIED. Awaiting explicit user DB approval.
--
-- DO NOT RUN `php artisan migrate` to apply this. See "WHY FORWARD SQL"
-- below. Apply only with an explicit, reviewed psql invocation.
--
--
-- WHY THIS IS NEEDED
-- ------------------
-- `App\Models\AppNotification` declares `protected $table = 'notifications'`
-- and is used by SIX already-shipped production call sites. The table does
-- not exist in the canonical 0921 database, so every one of those sites
-- raises:
--
--     SQLSTATE[42P01]: Undefined table: 7
--     ERROR:  relation "notifications" does not exist
--
-- This is a PRE-EXISTING master-side schema inconsistency, not something the
-- diagnostics work introduced. Six existing features already depend on it:
--
--     ApplicationController::store            (new application encoded)
--     RegisteredUserController::store         (new user registered)
--     SiteInspectionController::forceSync     (FieldSync sync completed)
--     TechnicalReviewController::assignInspector   (inspection assigned)
--     TechnicalReviewController::submitBatch x2   (review decision / SI flagged)
--
-- Plus the read surfaces: NotificationController::index, ::getUnread (the
-- header bell, polled every 30s on every authenticated page), ::markAsRead,
-- ::markAllAsRead, ::destroy, ::clearAll.
--
--
-- WHY FORWARD SQL AND NOT `php artisan migrate`
-- ---------------------------------------------
-- Per `docs/CANONICAL_DATABASE_SCHEMA.md` sections 1, 2 and 12:
--
--   * The repository's consolidated `2026_09_19_000000_create_initial_schema`
--     is still recorded as Pending while the live tables already exist, so a
--     global `php artisan migrate` fails with `relation "users" already exists`.
--   * The 0921 path is explicitly documented as "preserve ledger, apply
--     forward updates in order", and explicitly forbids manually inserting
--     ledger records on that path.
--
-- So this file is a forward SQL artifact in the same style as
-- `2026_09_26_canonical_schema_reconciliation_0921_forward.sql` and
-- `2026_09_28_add_delivery_attempt_queue_correlation.sql`.
--
-- NO `migrations` LEDGER ROW IS INSERTED BY THIS SCRIPT. Per section 2 the
-- ledger is never edited by hand on the 0921 path. Reconciling the ledger
-- (including the unresolved `2026_09_27_000000` prefix collision shared by
-- `create_notifications_table` and
-- `add_reviewed_site_inspection_id_to_technical_reviews_table`) remains a
-- separate, explicitly-tracked decision.
--
--
-- MIGRATION LEDGER TIMESTAMP COLLISION (pre-existing, recorded, not fixed here)
-- ----------------------------------------------------------------------------
-- Two repository migrations share the prefix `2026_09_27_000000`:
--     2026_09_27_000000_create_notifications_table.php
--     2026_09_27_000000_add_reviewed_site_inspection_id_to_technical_reviews_table.php
-- Laravel keys the ledger by migration NAME, not by filename, so both would be
-- recorded and both would run, but the shared prefix makes execution ORDER
-- ambiguous. This is why the notifications table is absent from the canonical
-- database today. Renaming a migration is a repository-history change and is
-- deliberately NOT performed by this forward-SQL plan.
--
--
-- TABLE CONTRACT (identical to database/migrations/2026_09_27_000000_create_notifications_table.php)
-- ------------------------------------------------------------------------------------------------
--   id           bigserial      PRIMARY KEY            (Laravel $table->id())
--   user_id      bigint         NULL, FK -> users(id) ON DELETE CASCADE
--                                             (Laravel $table->foreignId(...)->constrained('users')->onDelete('cascade'))
--   title        varchar(255)   NOT NULL               (Laravel $table->string)
--   message      text           NOT NULL               (Laravel $table->text)
--   type         varchar(255)   NOT NULL DEFAULT 'system_alert'   (Laravel $table->string->default)
--   action_url   varchar(255)   NULL                   (Laravel $table->string->nullable)
--   is_read      boolean        NOT NULL DEFAULT false (Laravel $table->boolean->default)
--   read_at      timestamp(0)   without time zone, NULL (Laravel $table->timestamp->nullable)
--   created_at   timestamp(0)   without time zone, NULL (Laravel $table->timestamps)
--   updated_at   timestamp(0)   without time zone, NULL (Laravel $table->timestamps)
--
-- `user_id` is NULLABLE BY DESIGN: `AppNotification::notifyAll()` writes a
-- broadcast row with `user_id = NULL`, and `scopeForUser()` includes NULL
-- (`user_id = ? OR user_id IS NULL`). The FK must therefore permit NULL.
--
-- `type` carries NO CHECK constraint. The migration's own comment enumerates
-- `application_created, status_updated, inspection_assigned,
-- inspection_completed, forecast_generated, user_registered` as examples
-- ("e.g."), not as an exhaustive set, and `AppNotification::notifyUser`
-- accepts any string. Adding an enum/CHECK would reject legitimate new types
-- and would diverge from the shipped migration, so it is deliberately omitted.
--
-- `title`/`message`/`type`/`action_url` carry no CHECK either; there is no
-- business invariant to enforce and text is sanitized at the diagnostic layer,
-- not here.
--
-- TIMESTAMPS
-- ---------
-- Laravel's `$table->timestamps()` on PostgreSQL produces two NULLABLE
-- `timestamp(0) without time zone` columns with NO default. The model does not
-- set them automatically, so a row written by `AppNotification::create()` has
-- both columns NULL unless the writer supplies them.
--
-- This is reproduced EXACTLY rather than "improved":
--   * The existing reads are `orderByDesc('created_at')` (NotificationController
--     index and getUnread) and the header bell's "5 most recent". A populated
--     default would be a silent behaviour change to ordering.
--   * A NOT NULL default would make the shipped migration's own definition
--     diverge from the table, and would fail any writer that omits them.
-- NULLABLE + no default is what the migration specifies, so that is what is
-- created. This is recorded as a known cosmetic weakness, deliberately not
-- silently repaired.
--
--
-- IDEMPOTENCE AND COMPATIBILITY GUARD
-- -----------------------------------
-- The script is additive and safe to re-run. It uses `IF NOT EXISTS`
-- throughout, wraps everything in a single transaction, and ABORTS LOUDLY
-- rather than silently reconciling if a pre-existing `notifications`
-- relation is present but structurally incompatible. Silently "fixing" or
-- overwriting an unexpected existing table could destroy notification history
-- that this repository knows nothing about, so a mismatch is a hard error for
-- a human to resolve.
--
-- `users` (id bigint) is the FK target and is verified present first; the
-- script refuses to run without it.
--
--
-- SAFETY
-- ------
-- Additive only. No DROP, no TRUNCATE, no data rewrite, no UPDATE of any
-- existing row, no business-table change, no migration-ledger edit, no
-- sequence reset. Creates exactly one table (10 columns), one foreign key,
-- and three explicit indexes (plus the primary-key index).
--
-- The three indexes are: the migration-named composite on (user_id, is_read),
-- a partial index for the broadcast (user_id IS NULL) branch that the
-- composite cannot serve, and a (created_at DESC) index matching the actual
-- newest-first read order.
--
-- Post-condition to verify: all business-table row counts and fingerprints
-- are UNCHANGED, and the migration ledger is still 16 rows.

BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Preconditions. Fail loudly rather than proceeding on a wrong shape.
-- ---------------------------------------------------------------------------

-- 0a. The FK target must exist. users(id) is the documented target.
DO $$
BEGIN
    IF to_regclass('public.users') IS NULL THEN
        RAISE EXCEPTION
            'ABORT: public.users is absent, so notifications_user_id_foreign cannot be created. Apply the canonical schema first.';
    END IF;
END $$;

-- 0b. A pre-existing `notifications` relation must be either absent, or
--     structurally compatible. Anything else is a hard error, never a
--     silent repair: this repository may not be the only writer of that table.
DO $$
DECLARE
    have_id        boolean;
    have_user_id   boolean;
    have_title     boolean;
    have_message   boolean;
    have_type      boolean;
    have_action    boolean;
    have_is_read   boolean;
    have_read_at   boolean;
    have_created   boolean;
    have_updated   boolean;
BEGIN
    IF to_regclass('public.notifications') IS NULL THEN
        RETURN;                     -- absent: this is the expected case
    END IF;

    SELECT
        count(*) FILTER (WHERE column_name = 'id')         > 0,
        count(*) FILTER (WHERE column_name = 'user_id')   > 0,
        count(*) FILTER (WHERE column_name = 'title')     > 0,
        count(*) FILTER (WHERE column_name = 'message')   > 0,
        count(*) FILTER (WHERE column_name = 'type')      > 0,
        count(*) FILTER (WHERE column_name = 'action_url')> 0,
        count(*) FILTER (WHERE column_name = 'is_read')   > 0,
        count(*) FILTER (WHERE column_name = 'read_at')   > 0,
        count(*) FILTER (WHERE column_name = 'created_at')> 0,
        count(*) FILTER (WHERE column_name = 'updated_at')> 0
    INTO
        have_id, have_user_id, have_title, have_message, have_type,
        have_action, have_is_read, have_read_at, have_created, have_updated
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notifications';

    IF NOT (have_id AND have_user_id AND have_title AND have_message AND have_type
            AND have_action AND have_is_read AND have_read_at AND have_created AND have_updated) THEN
        RAISE EXCEPTION
            'ABORT: a relation public.notifications already exists but is missing one or more required columns. Refusing to alter or replace it: it may hold notification history this repository did not write. Resolve by hand.';
    END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1. The table. Mirrors the shipped migration exactly.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
    id          bigserial    NOT NULL,
    user_id     bigint       NULL,
    title       varchar(255) NOT NULL,
    message     text         NOT NULL,
    type        varchar(255) NOT NULL DEFAULT 'system_alert',
    action_url  varchar(255) NULL,
    is_read     boolean      NOT NULL DEFAULT false,
    read_at     timestamp(0) without time zone NULL,
    created_at  timestamp(0) without time zone NULL,
    updated_at  timestamp(0) without time zone NULL,
    CONSTRAINT notifications_pkey PRIMARY KEY (id),
    -- NULL is meaningful here: notifyAll() writes a broadcast row with
    -- user_id = NULL, and scopeForUser() deliberately matches NULL.
    CONSTRAINT notifications_user_id_foreign
        FOREIGN KEY (user_id) REFERENCES public.users (id) ON DELETE CASCADE
);

COMMENT ON TABLE public.notifications IS
    'In-app notifications. user_id NULL = broadcast to every user (AppNotification::notifyAll). Rows are written by App\Models\AppNotification; created_at/updated_at are nullable with no default, matching the shipped migration.';

COMMENT ON COLUMN public.notifications.user_id IS
    'Receiving user. NULL means broadcast to all users; scopeForUser() matches both the user id and NULL.';
COMMENT ON COLUMN public.notifications.is_read IS
    'Unread until marked. The header bell polls the unread count every 30 seconds.';
COMMENT ON COLUMN public.notifications.read_at IS
    'Set when the notification is first marked read. NULL while unread.';
COMMENT ON COLUMN public.notifications.action_url IS
    'In-app path the notification links to, e.g. /applications/144. A relative path only; never an external or signed URL.';
COMMENT ON COLUMN public.notifications.type IS
    'Free-form category chosen by the writer, e.g. application_created, status_updated, inspection_assigned, inspection_completed, forecast_generated, user_registered, user_registered. No CHECK constraint: the shipped model accepts any string.';

-- ---------------------------------------------------------------------------
-- 2. Indexes.
--
-- 2a. The composite index named by the migration, which serves the two hot
--     paths: the unread badge count and "my notifications, newest first".
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS notifications_user_id_is_read_index
    ON public.notifications (user_id, is_read);

-- 2b. Broadcast-row support. Every `WHERE user_id IS NULL` broadcast lookup
--     (scopeForUser's OR branch, and any future moderation query) cannot use
--     the composite above, because NULLs are not indexed by it. Small and
--     cheap, and it keeps the shared reader from degrading into a scan.
CREATE INDEX IF NOT EXISTS notifications_broadcast_index
    ON public.notifications (user_id) WHERE user_id IS NULL;

-- 2c. Newest-first ordering. `orderByDesc('created_at')` is the default read
--     order on both the notifications page and the header bell. created_at is
--     nullable, and PostgreSQL sorts NULLs LAST on DESC by default, which is
--     the correct presentation order here, so the index matches the query
--     as written rather than reordering rows.
CREATE INDEX IF NOT EXISTS notifications_created_at_index
    ON public.notifications (created_at DESC);

COMMIT;

-- =====================================================================
-- POST-APPLY VERIFICATION (run separately, read-only)
-- =====================================================================
--
--   -- 1. table present, 11 rows of metadata expected
--   SELECT count(*) FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notifications';
--
--   -- 2. exact column contract
--   SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='notifications'
--    ORDER BY ordinal_position;
--
--   -- 3. constraints: primary key + the single foreign key
--   SELECT conname, pg_get_constraintdef(oid)
--     FROM pg_constraint
--    WHERE conrelid='public.notifications'::regclass
--    ORDER BY conname;
--
--   -- 4. all three indexes
--   SELECT indexname, indexdef FROM pg_indexes
--    WHERE schemaname='public' AND tablename='notifications'
--    ORDER BY indexname;
--
--   -- 5. the table is now usable (expect 0 rows on a fresh apply)
--   SELECT count(*) FROM notifications;
--
--   -- 6. migration ledger must STILL be 16 rows, unedited by this script
--   SELECT count(*) FROM migrations;
--
--   -- 7. business row counts must be UNCHANGED
--   SELECT
--     (SELECT count(*) FROM zoning_applications)            AS zoning_applications,  -- 73
--     (SELECT count(*) FROM site_inspections)               AS site_inspections,     -- 38
--     (SELECT count(*) FROM technical_reviews)              AS technical_reviews,    -- 79
--     (SELECT count(*) FROM inspection_delivery_attempts)   AS delivery_attempts,    --  8
--     (SELECT count(*) FROM audit_trail)                    AS audit_trail,          -- 162
--     (SELECT count(*) FROM users)                          AS users,                --  7
--     (SELECT count(*) FROM failed_jobs)                    AS failed_jobs;          -- 14
--
--   -- 8. business fingerprints must be UNCHANGED
--   SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) AS zoning_applications_fp
--     FROM (SELECT * FROM zoning_applications) t;   -- cf1bc99afe8b2d7f90ca5d179f1d700b
--   SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) AS site_inspections_fp
--     FROM (SELECT * FROM site_inspections) t;      -- 222f3a3cbe3e90b5246f58585e5a8504
--   SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) AS technical_reviews_fp
--     FROM (SELECT * FROM technical_reviews) t;     -- 4024d7cf21533bea82af2d26023bf2b5
--   SELECT md5(string_agg(t::text, ',' ORDER BY t.id)) AS audit_trail_fp
--     FROM (SELECT * FROM audit_trail) t;           -- 11a22c9d6b5689f3bb094808689f6930
--
--   -- 9. the header bell read path now works (expect 0 / [])
--   --    GET /api/notifications as any authenticated user
--
--
-- ROLLBACK / RECOVERY
-- ------------------
--   -- Before any notification has been written (the current state):
--   DROP TABLE IF EXISTS public.notifications;   -- drops its indexes and FK
--   -- ...and the migration ledger is still 16 rows, untouched throughout.
--
--   -- After rows exist, do NOT drop: notification history would be lost and
--   -- the header bell would break again. Prefer a forward repair.
--
-- Backup first, as the 0921 procedure requires:
--   pg_dump -d imaps_db_0921 -f backup_before_notifications.sql
-- =====================================================================
