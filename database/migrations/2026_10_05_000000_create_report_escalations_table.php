<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * LOCAL iMAPS internal escalation episodes for a FieldSync TECHNICAL ISSUE.
 *
 * WHAT THIS IS
 * ------------
 * Development Support is ADMIN-MEDIATED INTERNAL SUPPORT. There is no
 * Development Support iMAPS account and no fourth `users.role` value, so this
 * table records only who inside iMAPS opened an escalation, what came back,
 * and who closed it. The recommendation text is transcribed BY the Admin from
 * the external channel; nothing here is written by Development Support.
 *
 * WHY A NEW TABLE AND NOT `audit_trail`
 * -------------------------------------
 * `audit_trail.application_id` is integer NOT NULL and semantically an
 * application identity. A report escalation has no application, so using it
 * would mean fabricating an id (0) inside an audit table. This is the same
 * reasoning that produced `report_action_audit`.
 *
 * WHY NOT `report_action_audit`
 * -----------------------------
 * That table is the authoritative answer to "who changed the report STATUS,
 * and when". Its vocabulary is fixed by three CHECK constraints to exactly
 * report_review_started / report_resolved / report_wont_fix, and its partial
 * unique index proves one terminal outcome per report. An escalation episode
 * is an INTERNAL consultation with no status meaning; writing it there would
 * corrupt the audit's one-row-per-action proof. Escalation state must never be
 * inferrable from, or able to block, the terminal-status uniqueness.
 *
 * report_id IS REMOTE DATA
 * ------------------------
 * `report_id` is `public.diagnostic_reports.id` in another database. There is
 * deliberately NO foreign key: a cross-database FK is impossible, and a fake
 * local FK target would let a fabricated local row appear to prove a report
 * exists. Every escalation mutation revalidates the exact report UUID against
 * the authoritative remote row instead. `report_action_audit.report_id` sets
 * this precedent with the same comment.
 *
 * MULTIPLE EPISODES, ONE OPEN
 * ---------------------------
 * A report may be escalated, closed, and escalated again while it is still
 * nonterminal. Closed rows are immutable history and are never reopened or
 * overwritten; a later consultation is a NEW row. Only the OPEN state is
 * unique, so the constraint is a PARTIAL unique index rather than a table-wide
 * UNIQUE(report_id) - a table-wide unique would make a second consultation
 * unrepresentable and would forbid legitimate repeat escalation.
 *
 * WHY THE CHECK CONSTRAINTS EXIST
 * -------------------------------
 * The row IS the authoritative escalation record. An escalation that claims to
 * be closed with no closer, or that carries a recommendation with no actor or
 * no timestamp, looks like evidence while being meaningless. Closure is always
 * explainable: a recommendation explains it, or a closure note does. These are
 * unrepresentable-impossible rules, not workflow niceties.
 *
 * These constraints are PostgreSQL syntax, so this migration is
 * PostgreSQL-only, exactly like `report_action_audit`. The portable subset is
 * exercised against SQLite in tests/Feature/ReportEscalationTest.php and the
 * real schema, real CHECKs and the real advisory lock are proven against a
 * disposable PostgreSQL cluster in tests/Integration/ReportEscalationsPostgresTest.php.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('report_escalations', function (Blueprint $table) {
            $table->id();

            // Remote public.diagnostic_reports.id. NO foreign key - see class docblock.
            $table->uuid('report_id');

            // open | closed
            $table->string('status', 20)->default('open');

            // Canonical local actor identities. Never from request input.
            $table->foreignId('created_by')->constrained('users')->onDelete('restrict');

            $table->timestamp('created_at')->useCurrent();

            $table->text('recommendation')->nullable();
            $table->foreignId('recommendation_recorded_by')->nullable()->constrained('users')->onDelete('restrict');
            $table->timestamp('recommendation_at')->nullable();

            $table->foreignId('closed_by')->nullable()->constrained('users')->onDelete('restrict');
            $table->timestamp('closed_at')->nullable();
            $table->text('closure_note')->nullable();

            // Per-report episode history, newest first. Serves both the
            // read-only history read and the one-open lookup.
            $table->index(['report_id', 'created_at'], 'report_escalations_report_created_idx');
        });

        // ONE OPEN EPISODE PER REPORT. Partial, so every CLOSED episode is
        // preserved as history and a report can legitimately be escalated again.
        DB::statement(
            'CREATE UNIQUE INDEX IF NOT EXISTS report_escalations_one_open_per_report'
            . ' ON report_escalations (report_id)'
            . " WHERE status = 'open'"
        );

        // Whitespace-only text is not a recommendation and not a closure note.
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_status_ck
              CHECK (status IN ('open','closed'))
        SQL);
        // An OPEN episode carries no closure provenance at all - not a closer, not
        // a close time, and not a closure note. A closure note explains how an
        // escalation ENDED, so an episode that has not ended has nothing to
        // explain, and storing one would state a conclusion that never happened.
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_open_ck
              CHECK (status <> 'open' OR (
                    closed_by IS NULL AND closed_at IS NULL AND closure_note IS NULL
              ))
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_closed_ck
              CHECK (status <> 'closed' OR (closed_by IS NOT NULL AND closed_at IS NOT NULL))
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_recommendation_actor_ck
              CHECK (
                (recommendation IS NULL
                 AND recommendation_recorded_by IS NULL
                 AND recommendation_at IS NULL)
             OR (recommendation IS NOT NULL
                 AND recommendation_recorded_by IS NOT NULL
                 AND recommendation_at IS NOT NULL)
              )
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_recommendation_text_ck
              CHECK (recommendation IS NULL OR (
                    length(recommendation) <= 2000
                AND btrim(regexp_replace(recommendation, '\s', '', 'g')) <> ''
              ))
        SQL);
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_closure_note_ck
              CHECK (closure_note IS NULL OR (
                    length(closure_note) <= 2000
                AND btrim(regexp_replace(closure_note, '\s', '', 'g')) <> ''
              ))
        SQL);
        // Closure must always be explainable: a recommendation explains it, or
        // a closure note does. A closed row with neither is unrepresentable.
        DB::statement(<<<'SQL'
            ALTER TABLE public.report_escalations
              ADD CONSTRAINT report_escalations_closure_explained_ck
              CHECK (status <> 'closed' OR recommendation IS NOT NULL OR closure_note IS NOT NULL)
        SQL);
    }

    /**
     * Refuse to destroy escalation history.
     *
     * An escalation row is the authoritative record of an internal consultation:
     * who asked, what came back, and who closed it. Dropping a populated table
     * deletes that provenance with no remote copy anywhere, and no supported way
     * to reconstruct it. An empty drop is always safe and reversible by re-running
     * `up()`.
     *
     * LOCK TABLE ACCESS EXCLUSIVE is taken BEFORE counting so a concurrent
     * insert cannot slip a row in between the count and the drop. That ordering
     * matters: count-then-lock would leave a window in which a row written after
     * the count is silently destroyed.
     */
    public function down(): void
    {
        if (! Schema::hasTable('report_escalations')) {
            return;
        }

        DB::statement('LOCK TABLE public.report_escalations IN ACCESS EXCLUSIVE MODE');

        $rows = DB::table('report_escalations')->count();
        if ($rows > 0) {
            throw new RuntimeException(
                "Refusing to destroy {$rows} report_escalations row(s). This table is the"
                . ' authoritative internal-consultation record: who opened an escalation,'
                . ' what Development Support recommended, and who closed it. There is no'
                . ' remote copy and no supported way to reconstruct it. If the history'
                . ' genuinely must be removed, export it first and record why.'
            );
        }

        Schema::dropIfExists('report_escalations');
    }
};