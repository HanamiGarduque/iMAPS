<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
// RuntimeException is deliberately NOT imported. It lives in the global
// namespace, so importing it is a no-op and PHP emits
// "The use statement with non-compound name 'RuntimeException' has no
// effect". The guard precedent in
// 2026_09_27_020000_allow_initial_assignment_without_a_reason.php likewise
// throws it unimported.

/**
 * REPORTS & SUPPORT — PHASE 2A.5 CANDIDATE B (DB APPLY GATE)
 * LOCAL iMAPS authoritative report handling audit, with DB-level vocabulary,
 * action/transition coherence, and retry-idempotency constraints.
 *
 * STATUS: CANDIDATE FOR REVIEW. NOT RUN. NOT PLACED IN database/migrations/.
 *
 * WHY A NEW TABLE AND NOT `audit_trail`
 * -------------------------------------
 * `audit_trail` is the repository's existing "who did what, when" convention
 * and this table deliberately copies its SHAPE. It cannot be reused:
 *
 *   - `audit_trail.application_id` is integer NOT NULL and semantically a
 *     zoning application. A Technical Issue has no application, so the row
 *     would need a fabricated id (0) inside an audit table.
 *   - It has no FK on application_id, so the column cannot be relaxed to
 *     nullable without silently changing the meaning of the 166 rows already
 *     stored against it (verified live).
 *   - `AuditTrail::withRelations()` joins zoning_applications and reads
 *     reference_number / applicant_name, meaningless for a report.
 *
 * WHY THE CHECK CONSTRAINTS EXIST
 * ------------------------------
 * This is the AUTHORITATIVE record of who handled a report and how it moved.
 * An audit row that can be written with an unknown action or an impossible
 * transition is worse than no audit row, because it looks like evidence.
 * PHP validation is therefore NOT sufficient on its own: these constraints
 * are the floor, and the application remains above them.
 *
 * WHY NO RESPONSE BODY HERE
 * -------------------------
 * The official response is immutable and stored once on the remote
 * current-state row. A second copy here could drift. from_status / to_status
 * + performed_by + performed_at fully describe WHAT happened; the remote row
 * holds WHAT WAS SAID.
 *
 * CROSS-DATABASE ORDERING (unchanged)
 * -----------------------------------
 * Remote success FIRST, local audit SECOND. The remote UPDATE is the
 * authoritative state change and is protected by an id + expected-previous-
 * status CAS; this audit row is the local evidence of WHO did it. A local
 * insert can therefore legitimately fail or be retried after the remote write
 * has already committed -- see WHY THE TWO UNIQUENESS CONSTRAINTS EXIST.
 *
 * MAXIMUM ROW COUNT PER REPORT: 2. NOT 3.
 * The lifecycle has no reopen and no repeated review, so only two sequences
 * are possible:
 *     submitted -> resolved | wont_fix                      = 1 audit row
 *     submitted -> in_review -> resolved | wont_fix         = 2 audit rows
 * There is no third possibility: a report cannot be reviewed twice, cannot
 * reopen, and cannot reach a terminal outcome twice. A report with 3 or more
 * audit rows is therefore proof of a bug, and the local verification SQL
 * flags count(*) > 2 per report_id as impossible.
 *
 * WHY THE TWO UNIQUENESS CONSTRAINTS EXIST  (2A.2 ADDITION)
 * ---------------------------------------------------------
 * 2A.1 created this table with no uniqueness at all, which left a real
 * ambiguity window open:
 *
 *     remote PATCH commits successfully
 *     -> local INSERT commits
 *     -> client or connection loses the acknowledgement
 *     -> the handler retries the local INSERT
 *     -> a SECOND, duplicate, authoritative audit row now exists
 *
 * A duplicate audit row is not cosmetic: this table is the canonical answer to
 * "who handled this report and when", and two identical rows make that answer
 * ambiguous forever, with no supported way to tell the retry from a genuine
 * second action. The database must make the retry harmless, because only the
 * database can see the whole table. So:
 *
 *   UNIQUE (report_id, action)
 *     Local retry idempotency / one occurrence per action.
 *     Because reports cannot reopen, each action can occur AT MOST ONCE per
 *     report, so this constraint is not a workaround for a data problem -- it
 *     is exactly the truth the lifecycle guarantees. The retry above surfaces
 *     as a constraint violation the handler MAY absorb -- but only after
 *     proving the stored row is the same intended event. See "23505 IS NOT ONE
 *     ERROR, IT IS TWO" below before writing any retry handling.
 *
 *   partial UNIQUE (report_id) WHERE action IN
 *       ('report_resolved','report_wont_fix')
 *     One terminal outcome per report.
 *     The first uniqueness rule already prevents a repeat of the SAME terminal
 *     action; it cannot prevent BOTH report_resolved AND report_wont_fix for
 *     one report. A report that is simultaneously "Resolved" and "Won't fix" is
 *     incoherent, and it must be impossible even for a manual or operator
 *     INSERT, not merely for application code. The partial form is used so
 *     report_review_started is unaffected and the index stays small.
 *
 *   (report_id, performed_at)  [unchanged from 2A.1]
 *     Ordered history. Serves the per-report history read (newest first) and
 *     the two-source reconciliation scan.
 *
 * The three indexes therefore have three DISTINCT purposes and none is a
 * duplicate of another:
 *     (report_id, performed_at)                  -> ordered history
 *     UNIQUE (report_id, action)                 -> retry idempotency;
 *                                                    one occurrence per action
 *     partial UNIQUE (report_id), terminal only  -> one terminal outcome per
 *                                                    report
 * Neither unique index can replace the history index: they are keyed on
 * different columns and only one of them is ordered by time.
 *
 * 23505 IS NOT ONE ERROR, IT IS TWO, AND THEY ARE NOT EQUIVALENT  (2A.3)
 * --------------------------------------------------------------------------
 * Both uniqueness protections raise the same SQLSTATE 23505 unique_violation,
 * but they mean opposite things, and 2A.2's note that "the retry is absorbed
 * as a constraint violation the handler treats as success" was dangerously
 * underspecified -- read literally it authorises swallowing ANY 23505, which
 * would let a report silently end up Resolved and Won't fix at the same time.
 * The two cases must be told apart BY WHICH INDEX raised, and only one of them
 * may ever be absorbed.
 *
 *   23505 on report_action_audit_report_id_action_unique
 *     MEANING: this exact (report_id, action) already exists. The only benign
 *     cause is the lost-acknowledgement retry:
 *         remote PATCH committed -> local INSERT committed -> acknowledgement
 *         lost -> handler retries the INSERT.
 *     HANDLING -- the row must be PROVEN to be the same intended event:
 *       1. Re-read the existing row by exact report_id + action.
 *       2. Compare ALL SIX event fields:
 *            report_id, action, from_status, to_status,
 *            performed_by, performed_by_name
 *       3. If all six match -> the intended event is already durably recorded,
 *          so treat the retry as ALREADY SUCCESSFUL.
 *       4. If ANY of them differs -> this is NOT a retry. Return an audit
 *          conflict and log CRITICAL. The stored row is the authoritative
 *          record of who actually did it; a mismatching retry means either a
 *          different actor or a different transition is claiming an event that
 *          is already taken, and neither may be papered over.
 *     performed_at IS DELIBERATELY NOT COMPARED. The original committed
 *     timestamp is authoritative, a retry computes a fresh now() by
 *     construction, and comparing it could never match. Including it would
 *     turn every legitimate retry into a false conflict.
 *
 *   23505 on report_action_audit_one_terminal_unique
 *     MEANING: the OPPOSITE terminal action already exists for this report --
 *     it is already Won't fix and something is trying to record Resolved, or
 *     the reverse.
 *     HANDLING: NEVER treat this as retry success, under any circumstances, and
 *     do not re-read-and-compare it away. Return an audit conflict /
 *     inconsistency and log CRITICAL. A report cannot be both, so one of the
 *     two attempts is wrong and the operator must decide which. This branch
 *     exists so that the benign case can be absorbed safely WITHOUT opening a
 *     path that swallows the dangerous one.
 *
 * The application must therefore branch on the CONSTRAINT NAME, not on the
 * SQLSTATE alone. Tests 66, 67, 68 and 69 pin exactly this distinction.
 *
 * REPOSITORY CONVENTIONS APPLIED (verified against database/migrations/ and
 * against the live local catalog):
 *   - `$table->id()`  -> bigserial PK (audit_trail, technical_reviews,
 *                                 notifications)
 *   - `$table->uuid()` -> the remote id, deliberately NO foreign key
 *   - foreignId(...)->constrained('users')->onDelete('restrict')  [inline
 *     style of the newest migration, 2026_09_27_create_notifications_table;
 *     RESTRICT copied from technical_reviews.reviewed_by and
 *     application_po_assignments.reassigned_by, the two existing local
 *     pointers whose actor must never vanish]
 *   - `$table->string('action', 60)` [explicit length copied from
 *     audit_trail.action, whose live max(length) is 30]
 *   - `$table->string('performed_by_name')` [default 255, as
 *     notifications.title; local users.name is varchar(255), live-verified]
 *   - `$table->timestamp('performed_at')->useCurrent()` [copied verbatim from
 *     audit_trail.performed_at]
 *   - EXPLICIT index names for the two unique indexes, in the style of
 *     inspection_delivery_attempts_inspection_attempt_unique in
 *     2026_09_28_030000_add_inspection_delivery_monitoring.php, so the names
 *     are deterministic and the local verification SQL can reference them
 *     instead of guessing Laravel's derived spelling.
 *   - partial index via DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS ...'),
 *     the same shape as the existing partial index in 2026_09_28_030000 line
 *     117-123. Blueprint has no partial-index helper in this Laravel version.
 *   - NOT `$table->timestamps()`: the table is append-only, so created_at /
 *     updated_at would be misleading and Eloquent would write updated_at on
 *     every model save. Same reasoning already recorded for
 *     inspection_delivery_attempts.
 *
 * EXACT INDEX SET PRODUCED BY THIS MIGRATION: FOUR, NOT FIVE  (2A.3 CORRECTION)
 * --------------------------------------------------------------------------
 * 2A.2's verification asserted five indexes and, worse, listed
 * `report_action_audit_performed_by_foreign` as if a FOREIGN KEY constraint
 * were an index. It is not. Both parts of that claim are now disproven.
 *
 * PROOF 1 -- LARAVEL DOES NOT EMIT AN INDEX FOR constrained(). Source read
 *   directly from vendor/laravel/framework:
 *     - ForeignIdColumnDefinition::constrained() -> references() ->
 *       $this->blueprint->foreign(...). It adds a command of type 'foreign'
 *       and nothing else.
 *     - Blueprint::addFluentIndexes() scans column attributes for exactly
 *       ['primary','unique','index','fulltext','fullText','spatialIndex',
 *       'vectorIndex']. 'foreign' is not in that list, and foreignId() sets
 *       only autoIncrement, so no index command is ever added.
 *     - Grammar::compileForeign() and PostgresGrammar::compileForeign() emit
 *       only: alter table X add constraint Y foreign key (...) references Z (...)
 *       plus optional deferrable / not valid suffixes. No CREATE INDEX.
 *   So `$table->foreignId('performed_by')->constrained('users')` creates the
 *   column and the FK constraint, and no index.
 *
 * PROOF 2 -- POSTGRESQL DOES NOT CREATE A REFERENCING-COLUMN INDEX. It
 *   automatically indexes PRIMARY KEY, UNIQUE and REFERENCES, but the
 *   REFERENCES case is the REFERENCED side (users.id), which already has the
 *   users primary key. The referencing side is left alone by design.
 *
 * PROOF 3 -- OBSERVED, LIVE, ON THIS DATABASE. Every FK in schema public
 *   cross-checked against pg_index for an index whose key equals the FK
 *   columns: 21 foreign keys, and 12 of them have NO supporting index. The two
 *   closest precedents to this table -- the identical "actor pointer that must
 *   never vanish, ON DELETE RESTRICT" shape -- are among them:
 *       technical_reviews.reviewed_by            -> NO SUPPORTING INDEX
 *       application_po_assignments.reassigned_by -> NO SUPPORTING INDEX
 *   Both are the precedent Candidate B says it copied. So producing a table
 *   with no actor index is repository-consistent, not an oversight.
 *
 * THE FOUR INDEXES THAT WILL ACTUALLY EXIST:
 *   1. report_action_audit_pkey                              UNIQUE   (id)
 *   2. report_action_audit_report_id_performed_at_index      non-unique
 *                                                            (report_id, performed_at)
 *   3. report_action_audit_report_id_action_unique            UNIQUE
 *                                                            (report_id, action)
 *   4. report_action_audit_one_terminal_unique                UNIQUE, partial
 *                                                            (report_id)
 *                                                            WHERE action IN
 *                                                              ('report_resolved','report_wont_fix')
 * Aggregate expectation: unique_indexes = 3, non_unique_indexes = 1.
 *
 * WHY NO INDEX IS ADDED ON performed_by. Deliberate, and it is the "stop and
 * explain" case rather than a silent omission:
 *   - The only access path the FK itself creates is the ON DELETE RESTRICT
 *     probe when a local user is deleted. `users` has 29 rows and
 *     report_action_audit is bounded at 2 rows per report, so that probe is
 *     trivially cheap.
 *   - No planned query filters, joins or sorts by performed_by. The history
 *     read is keyed on report_id; the two-source reconciliation scan is keyed
 *     on report_id.
 *   - The two precedent actor FKs in this schema carry no actor index.
 * Adding one would be speculative indexing whose only justification would be
 * making a wrong verification expectation pass. If "every action this user
 * performed" ever becomes a real query, add the index then, and measure first.
 *
 * TABLE NAME: singular, matching every existing local table (users, parcels,
 * audit_trail, notifications, technical_reviews, site_inspections,
 * zoning_applications, application_status_tracks, sessions, jobs). There is
 * no pluralised local table, so `report_action_audit` is already
 * repository-consistent and no alternative name is warranted.
 *
 * NOTE ON check(): this Laravel version's Blueprint has no check() method, so
 * the four constraints are added with DB::statement inside up() and removed
 * with dropIfExists inside down(). Verified: Blueprint exposes string(),
 * foreignId(), enum(), uuid() but NOT check().
 *
 * down() REFUSES TO DESTROY A NON-EMPTY AUDIT TABLE, UNDER AN EXCLUSIVE LOCK
 * --------------------------------------------------------------------------
 * 2A.3 merely warned in a comment and then dropped unconditionally. A comment
 * is not a control: it is invisible at runtime, unasserted by any test, and
 * skipped entirely by an operator who skips the comments. For the
 * AUTHORITATIVE record of who handled a report, a warning is the wrong
 * mechanism and a hard refusal is the right one.
 *
 * The asymmetry that makes refusal correct: the remote reports these rows
 * describe are already Resolved or Won't fix with an immutable official
 * response. Dropping the local table would leave the inspector-facing record
 * intact while destroying the local evidence of WHO acted and WHEN. That
 * asymmetry is permanent -- the remote state can never be un-applied, so the
 * local evidence can never be regenerated.
 *
 * THE RACE 2A.4 STILL HAD, AND WHY THE LOCK CLOSES IT.  [2A.5]
 * 2A.4 counted rows and then dropped, in that order, with nothing held in
 * between. That is a textbook time-of-check/time-of-use window:
 *     count observes zero rows
 *     -> another transaction INSERTs the first authoritative audit row
 *     -> the DROP obtains its lock afterwards, waits nothing out
 *     -> the audit row is destroyed
 * The DROP taking a lock does not help; by the time it takes one there is
 * nothing left to protect. The empty check and the destructive DROP must be
 * covered by the SAME lock, which is why the table is locked before it is
 * counted and the lock is still held when the DROP runs.
 *
 * WHY ACCESS EXCLUSIVE IS SUFFICIENT. It conflicts with every other lock mode
 * the table can carry, so from the moment it is granted until the transaction
 * ends:
 *     INSERT / UPDATE / DELETE   take ROW EXCLUSIVE  -> blocked
 *     SELECT                     takes ACCESS SHARE  -> blocked
 *     ALTER / DROP / TRUNCATE    take ACCESS EXCLUSIVE -> mutually exclusive,
 *                                                             so competing DDL
 *                                                             cannot interleave
 * PostgreSQL holds table locks until transaction end, so the protection spans
 * the count AND the DROP with no gap. Reads being blocked too is irrelevant
 * here: this is a one-shot guarded rollback that is expected to refuse in
 * production, and correctness of authoritative audit evidence outranks a
 * momentary read pause.
 *
 * TRANSACTION CONTRACT -- PROVEN, NOT ASSUMED.  [2A.5]
 * The lock above is only useful if it is held in the SAME transaction that the
 * DROP joins, and if the transaction is still open when down() runs. Every
 * link was read out of this repository's own vendor tree, Laravel 12.58.0:
 *   1. Migrator::runMigration() wraps the migration method in
 *      $connection->transaction($callback) when the schema grammar reports
 *      supportsSchemaTransactions() AND $migration->withinTransaction is true.
 *   2. Schema\Grammars\PostgresGrammar declares protected $transactions = true,
 *      so supportsSchemaTransactions() returns true for this database.
 *   3. Migration declares public $withinTransaction = true by default, and this
 *      migration does not override it.
 *   4. Migrator::resolveConnection() resolves the default connection when the
 *      migration declares no $connection, and no migration in
 *      database/migrations/ overrides it. DB_CONNECTION is pgsql, confirmed
 *      live: imaps_db_0921 on PostgreSQL.
 *   5. The connection is the SAME OBJECT on both sides. Schema's facade
 *      accessor is 'db.schema', bound to $app['db']->connection()->getSchemaBuilder(),
 *      and DB's accessor is 'db'. DatabaseManager::connection() caches per
 *      name, so both resolve to the same cached Connection and therefore the
 *      same PDO session as the transaction Migrator opened.
 *   6. Connection::transaction() calls beginTransaction(), and on any Throwable
 *      rolls back and rethrows. So the refusal below aborts the transaction,
 *      which releases the lock, and propagates to the caller.
 * Because all six hold, a single DB::statement lock taken before the count is
 * sufficient. No nested transaction is used, because none is needed and adding
 * one would hide a broken contract instead of surfacing it.
 *
 * FAIL-CLOSED ON A CONCURRENT DROP. The table must be checked for existence
 * before it can be locked, so a competing transaction that drops the table in
 * that narrow window would make the LOCK statement fail with 42P01 relation
 * does not exist. That aborts the transaction and the migration fails loudly.
 * Nothing is destroyed and nothing is silently skipped, which is the correct
 * outcome. The alternative -- swallowing that error -- would be strictly worse.
 *
 * ORDER IS THE WHOLE POINT:
 *     1. hasTable()          -- absent table is a safe no-op
 *     2. ACCESS EXCLUSIVE    -- from here nothing can insert/update/delete/DDL
 *     3. count rows          -- authoritative, cannot go stale under the lock
 *     4a. rows > 0  -> refuse; no DDL is executed
 *     4b. rows = 0  -> drop, still holding the lock
 *
 * Three outcomes, no fourth:
 *   table absent            -> return, safely and silently
 *   table present, 0 rows   -> drop it
 *   table present, >=1 row  -> refuse, abort the rollback, change nothing
 *
 * NO force mode. NO "delete the rows first". NO truncate. NO bypass flag. If a
 * future need ever genuinely requires removing populated audit history, that is
 * a deliberate, separately reviewed decision by a human -- it must not be
 * reachable by remembering an argument, and it must never be a parameter of
 * this method.
 *
 * WHY THE REFUSAL LEAVES NOTHING BEHIND. Nothing has been executed at the
 * moment of the refusal except the lock itself, so there is no partial state to
 * clean up; the transaction rollback then releases the lock and discards
 * anything the driver may have staged. Both properties are asserted by the
 * behavioural tests rather than assumed.
 *
 * REPOSITORY CONSISTENCY of the guard. The count-then-refuse shape is copied
 * from the established precedent in
 * 2026_09_27_020000_allow_initial_assignment_without_a_reason.php, which guards
 * its own down() with a query-builder count followed by a RuntimeException.
 * Same shape, same exception class, same message style. No
 * declare(strict_types=1) is added because no migration in
 * database/migrations/ uses one.
 *
 * RECORD ONLY -- NOT ENFORCED BY THE DATABASE  (2A.4)
 * ---------------------------------------------------
 * When a report reaches a terminal outcome, the audit row's from_status must
 * reflect the ACTUAL previous status returned by the successful remote CAS:
 *
 *     no report_review_started row exists -> from_status = 'submitted'
 *     report_review_started row exists    -> from_status = 'in_review'
 *
 * and that value must NEVER come from browser input.
 *
 * This is deliberately NOT implemented as a schema mechanism here. A CHECK
 * constraint cannot reference other rows, so expressing "from_status must be
 * 'in_review' iff a review_started row exists" in this table would require a
 * cross-row trigger -- which cannot be written on a single table at all, since
 * PostgreSQL triggers are row-level and may not query the table they fire on
 * for aggregate state. No repository evidence exists that the application CAS
 * cannot enforce it, so the trigger is not justified. The invariant is carried
 * in the later implementation test contract as case 78 instead, and the
 * two-source reconciliation procedure is where a violation would surface.
 *
 * The transition CHECK below still permits BOTH 'submitted' and 'in_review' as
 * from_status for the terminal actions, because that is correct at the row
 * level: the row cannot know what its siblings are.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_action_audit', function (Blueprint $table) {
            $table->id();

            // Remote public.diagnostic_reports.id. Intentionally NO foreign key:
            // it lives in a different database and a cross-database FK is not
            // possible. A durable reference, not a referential link.
            $table->uuid('report_id');

            // report_review_started | report_resolved | report_wont_fix
            $table->string('action', 60);

            $table->string('from_status', 20);
            $table->string('to_status', 20);

            // Canonical local actor identity. Never from request input.
            $table->foreignId('performed_by')->constrained('users')->onDelete('restrict');

            // Snapshot so the audit record still identifies the actor after a
            // rename. performed_by stays authoritative.
            $table->string('performed_by_name');

            $table->timestamp('performed_at')->useCurrent();

            // Purpose 1 of 3 -- ORDERED HISTORY. Serves the per-report history
            // read (newest first) and the two-source reconciliation scan. A
            // single-column (report_id) index would not also serve the
            // ordering, and no other access pattern is expected, so nothing
            // speculative is added.
            $table->index(['report_id', 'performed_at']);

            // Purpose 2 of 3 -- LOCAL RETRY IDEMPOTENCY / ONE OCCURRENCE PER
            // ACTION. Reports cannot reopen, so each action can occur at most
            // once per report. This turns the ambiguous-acknowledgement retry
            // into a constraint violation the handler can inspect -- and ONLY
            // absorb after proving the stored row is the same intended event.
            // See the "23505 IS NOT ONE ERROR" note in the class docblock.
            $table->unique(
                ['report_id', 'action'],
                'report_action_audit_report_id_action_unique'
            );

            // DELIBERATELY NOT created, and the omission is argued rather than
            // forgotten -- see "EXACT INDEX SET PRODUCED BY THIS MIGRATION":
            //   - an index on performed_by (neither Laravel nor PostgreSQL
            //     creates one for the FK, and no planned query needs it);
            //   - report_type (derivable remotely),
            //   - response_message (immutable remote truth),
            //   - any nullable application_id,
            //   - any escalation column (separate lifecycle).
        });

        // Purpose 3 of 3 -- ONE TERMINAL OUTCOME PER REPORT.
        // Purpose 2 already forbids a repeat of the SAME terminal action but
        // cannot forbid BOTH report_resolved AND report_wont_fix for one
        // report. This partial unique index closes that even against a manual
        // or operator INSERT. Partial, so report_review_started is unaffected
        // and the index only ever holds terminal rows.
        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS report_action_audit_one_terminal_unique'
            . ' ON report_action_audit (report_id)'
            . " WHERE action IN ('report_resolved','report_wont_fix')"
        );

        // -- DB-level vocabulary and coherence ---------------------------
        // Authoritative audit: an impossible row must be unrepresentable, so
        // these constraints are not merely duplicated PHP rules.
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_action_audit
              ADD CONSTRAINT report_action_audit_action_ck
              CHECK (action IN ('report_review_started','report_resolved','report_wont_fix'))
        SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE public.report_action_audit
              ADD CONSTRAINT report_action_audit_from_status_ck
              CHECK (from_status IN ('submitted','in_review'))
        SQL);

        DB::statement(<<<'SQL'
            ALTER TABLE public.report_action_audit
              ADD CONSTRAINT report_action_audit_to_status_ck
              CHECK (to_status IN ('in_review','resolved','wont_fix'))
        SQL);

        // The three valid (action, from_status, to_status) triples, and
        // nothing else:
        //   report_review_started : submitted -> in_review
        //   report_resolved       : submitted|in_review -> resolved
        //   report_wont_fix       : submitted|in_review -> wont_fix
        // This makes in_review->submitted, any reopen, and any
        // action/status mismatch unrepresentable in the audit record.
        // Together with the two uniqueness constraints above it also makes 3+
        // audit rows for one report unrepresentable, which is the maximum
        // this lifecycle can ever produce being 2.
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_action_audit
              ADD CONSTRAINT report_action_audit_transition_ck
              CHECK (
                   (action = 'report_review_started'
                        AND from_status = 'submitted'
                        AND to_status   = 'in_review')
                OR (action = 'report_resolved'
                        AND from_status IN ('submitted','in_review')
                        AND to_status   = 'resolved')
                OR (action = 'report_wont_fix'
                        AND from_status IN ('submitted','in_review')
                        AND to_status   = 'wont_fix')
              )
        SQL);
    }

    public function down(): void
    {
        // DESTRUCTIVE, AND THEREFORE LOCKED AND GUARDED.
        //
        // To inspect the table before deciding:
        //   SELECT count(*) FROM report_action_audit;
        //   SELECT * FROM report_action_audit ORDER BY report_id, performed_at;
        //
        // There is deliberately no force mode and no row-deletion path. If
        // populated audit history ever genuinely must be removed, that is a
        // separate, explicitly reviewed human decision.
        //
        // THE TRANSACTION IS ALREADY OPEN. Laravel wraps this method in a
        // transaction for this PostgreSQL connection, proven link by link in
        // the class docblock. Every statement below therefore joins the same
        // transaction, and the table lock taken in step 2 is held through the
        // DROP in step 4b because PostgreSQL releases table locks only at
        // transaction end.

        // Step 1: absent table is a safe no-op. Nothing to roll back.
        if (! Schema::hasTable('report_action_audit')) {
            return;
        }

        // Step 2: ACCESS EXCLUSIVE, taken BEFORE the count.
        // From here until the transaction ends, INSERT / UPDATE / DELETE take
        // ROW EXCLUSIVE and are blocked, SELECT takes ACCESS SHARE and is
        // blocked, and competing DDL takes ACCESS EXCLUSIVE so it cannot
        // interleave. Without this the sequence below is a time-of-check /
        // time-of-use race: an empty count could be followed by a concurrent
        // first INSERT and then a DROP that destroys it.
        // A concurrent DROP in the narrow window before this statement would
        // make it fail with 42P01; the transaction aborts and the migration
        // fails loudly. That is fail-closed and is the intended behaviour --
        // swallowing that error would be strictly worse.
        DB::statement('LOCK TABLE public.report_action_audit IN ACCESS EXCLUSIVE MODE');

        // Step 3: the authoritative emptiness check, safe from staleness
        // because no writer can commit a row while the lock is held.
        $auditRows = DB::table('report_action_audit')->count();

        // Step 4a: populated means refuse. No DDL runs, the throw aborts the
        // transaction, the lock is released, and the table and its rows are
        // exactly as they were.
        if ($auditRows > 0) {
            throw new RuntimeException(
                "Cannot roll back Reports & Support: refusing to destroy "
                ."{$auditRows} report_action_audit row(s). This table is the "
                .'authoritative record of who handled each Reports & Support '
                .'report and when. The corresponding remote reports are already '
                .'Resolved or Won\'t fix with an immutable official response, so '
                .'dropping these rows would permanently destroy local evidence '
                .'that cannot be reconstructed. Archive or export the rows first, '
                .'or leave the migration applied.'
            );
        }

        // Step 4b: empty and still holding the lock, so no insert can land
        // between the check and the drop. Both unique indexes and the
        // (report_id, performed_at) history index are owned by the table and
        // drop with it, as do the four CHECK constraints and the FK. Nothing is
        // left orphaned.
        Schema::dropIfExists('report_action_audit');
    }
};