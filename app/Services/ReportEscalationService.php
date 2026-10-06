<?php

namespace App\Services;

use App\Models\ReportEscalation;
use App\Models\User;
use App\Support\ReportEscalationGate;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use Throwable;

/**
 * Admin-mediated internal Development Support escalation episodes.
 *
 * SCOPE, and why it is exactly this narrow
 * ----------------------------------------
 * Technical Issue only. An Application Support concern already has a business
 * owner - the current Planning Officer - so an internal consultation would give
 * it two competing authorities. ReportingVisibility already refuses every
 * non-Admin on technical_issue and every Planning Officer on technical_issue
 * handling, so no Planning Officer can reach any of this.
 *
 * Nonterminal only. A terminal report's official response is immutable and its
 * audit row is unique, so there is nothing left to consult about. The state is
 * re-read from the AUTHORITATIVE REMOTE ROW on every mutation - never from a
 * browser value, a reference code, or a cached projection.
 *
 * THE INVARIANT THIS CLASS EXISTS TO PROTECT
 * ------------------------------------------
 * "terminal report + open escalation" must never be reachable. Three things
 * enforce it, and all three are required:
 *
 *   1. {@see ReportLifecycleLock} serializes every mutation on the report UUID,
 *      including the terminal CAS in DiagnosticReportHandling.
 *   2. Opening and closing revalidate the remote report while holding that lock,
 *      so a terminal transition that commits first makes the escalation
 *      impossible, and an escalation that commits first is seen by the gate.
 *   3. {@see ReportEscalationGate} is consulted by BOTH the page prop and the
 *      server-side authorization, so a forged POST is refused by the same
 *      predicate that hides the button.
 *
 * IMMUTABILITY
 * ------------
 * A recommendation is written once. There is no update path, so "record again"
 * is refused rather than silently overwriting the first answer. A closed row is
 * never reopened and never deleted; a later consultation is a NEW row, which is
 * what the partial unique index permits.
 */
class ReportEscalationService
{
    public function __construct(
        private DiagnosticReportReader $reader,
        private ReportLifecycleLock $lock,
        private ReportEscalationGate $gate,
    ) {}

    /**
     * Open a new escalation episode.
     *
     * `closure_note` is deliberately NOT part of this operation and is not read
     * from the request at all. A closure note describes how an escalation ENDED,
     * so an episode that has just been opened has nothing to describe; accepting
     * the field here would invite a caller to believe a value was stored when it
     * was discarded. Closure notes belong to {@see close()} alone, and the
     * database refuses one on an open row.
     *
     * A second concurrent open is refused by the partial unique index; that
     * refusal is absorbed here and reported as a conflict rather than surfacing
     * as a 500.
     */
    public function open(User $actor, string $reportUuid, array $input): array
    {
        try {
            return DB::transaction(function () use ($actor, $reportUuid) {
                $this->lock->acquire($reportUuid);
                if ($denied = $this->revalidate($actor, $reportUuid)) {
                    return $denied;
                }
                if ($this->gate->hasOpen($reportUuid)) {
                    return $this->outcome('conflict', 409, 'This report already has an open Development Support escalation.');
                }
                try {
                    $row = ReportEscalation::query()->create([
                        'report_id' => strtolower($reportUuid),
                        'status' => ReportEscalation::OPEN,
                        'created_by' => (int) $actor->id,
                        'created_at' => now(),
                    ]);
                } catch (Throwable $e) {
                    // The partial unique index is the real serialization backstop
                    // for two truly concurrent opens.
                    if (! $this->isUniqueViolation($e)) {
                        throw $e;
                    }

                    return $this->outcome('conflict', 409, 'This report already has an open Development Support escalation.');
                }

                return $this->outcome('opened', 201, 'Development Support escalation opened.', ['escalation' => $row]);
            }, 1);
        } catch (ValidationException $e) {
            throw $e;
        }
    }

    /** Record the recommendation once. Never overwrites an existing one. */
    public function recordRecommendation(User $actor, string $reportUuid, int $escalationId, array $input): array
    {
        $text = $this->requiredText($input, 'recommendation', ReportEscalation::MAX_RECOMMENDATION);

        return DB::transaction(function () use ($actor, $reportUuid, $escalationId, $text) {
            $this->lock->acquire($reportUuid);
            if ($denied = $this->revalidate($actor, $reportUuid)) {
                return $denied;
            }
            $row = $this->openEpisodeOf($reportUuid, $escalationId);
            if ($row === null) {
                return $this->outcome('conflict', 409, 'This escalation is not an open episode of this report.');
            }
            if ($row->recommendation !== null) {
                return $this->outcome('conflict', 409,
                    'A recommendation was already recorded for this escalation. Close this episode and open a new one if further consultation changes the guidance.');
            }
            $row->recommendation = $text;
            $row->recommendation_recorded_by = (int) $actor->id;
            $row->recommendation_at = now();
            $row->save();

            return $this->outcome('recommended', 200, 'Recommendation recorded.', ['escalation' => $row->fresh()]);
        }, 1);
    }

    /**
     * Close an episode. No reopen, no delete, no edit of a closed row.
     *
     * The DB CHECK constraints are the authority on explainability; this method
     * simply refuses early with the same rule so the Admin gets a usable message
     * instead of a constraint violation.
     */
    public function close(User $actor, string $reportUuid, int $escalationId, array $input): array
    {
        $note = $this->optionalText($input, 'closure_note', ReportEscalation::MAX_CLOSURE_NOTE);

        return DB::transaction(function () use ($actor, $reportUuid, $escalationId, $note) {
            $this->lock->acquire($reportUuid);
            if ($denied = $this->revalidate($actor, $reportUuid)) {
                return $denied;
            }
            $row = $this->openEpisodeOf($reportUuid, $escalationId);
            if ($row === null) {
                return $this->outcome('conflict', 409, 'This escalation is not an open episode of this report.');
            }
            if ($row->recommendation === null && $note === null) {
                return $this->outcome('invalid', 422,
                    'Closing without a recommendation requires a closure note explaining why the consultation produced none.');
            }
            $row->status = ReportEscalation::CLOSED;
            $row->closed_by = (int) $actor->id;
            $row->closed_at = now();
            $row->closure_note = $note;
            $row->save();

            return $this->outcome('closed', 200, 'Development Support escalation closed.', ['escalation' => $row->fresh()]);
        }, 1);
    }

    /**
     * Re-read the authoritative remote report and prove this escalation is
     * permitted at all. Returns a denial array, or null to continue.
     *
     * @return array<string, mixed>|null
     */
    private function revalidate(User $actor, string $reportUuid): ?array
    {
        if ($actor->role !== 'Admin' || ! $actor->is_active) {
            return $this->outcome('denied', 403, 'Only an Admin may manage a Development Support escalation.');
        }
        if (! Str::isUuid($reportUuid)) {
            return $this->outcome('not_found', 404, 'The report could not be found.');
        }
        $read = $this->reader->find($reportUuid);
        if (! $read['ok']) {
            return $this->outcome('unavailable', 503, 'The report could not be loaded. Please try again.');
        }
        // An absent report is NOT an unavailable remote: the read succeeded and
        // proved there is no such report. Reporting 503 here would invite a retry
        // for a report that will never exist.
        if ($read['report'] === null) {
            return $this->outcome('not_found', 404, 'The report could not be found.');
        }
        $report = $read['report'];
        if (($report['report_type'] ?? null) !== 'technical_issue') {
            return $this->outcome('denied', 403, 'Only a Technical Issue can be escalated to Development Support.');
        }
        if (! in_array($report['status'] ?? null, ['submitted', 'in_review'], true)) {
            return $this->outcome('conflict', 409,
                'This report is already final. Its official response cannot be changed, so there is nothing left to consult about.');
        }

        return null;
    }

    /** An OPEN episode of THIS report, or null. Never a closed or foreign one. */
    private function openEpisodeOf(string $reportUuid, int $escalationId): ?ReportEscalation
    {
        return ReportEscalation::query()
            ->whereKey($escalationId)
            ->where('report_id', strtolower($reportUuid))
            ->where('status', ReportEscalation::OPEN)
            ->first();
    }

    /**
     * Plain-text guard shared by recommendation and closure note.
     *
     * `DiagnosticTextSanitizer` is deliberately NOT applied here. It is built to
     * strip capability-bearing links out of REMOTE inspector free text before it
     * reaches a browser, and an internal developer recommendation legitimately
     * contains links, ticket ids and code references that redaction would corrupt.
     * The text is authored by a trusted Admin and rendered through React `Text`,
     * which escapes by default, so what is actually required is: trimmed,
     * non-blank, bounded, and free of markup.
     */
    private function guard(string $key, mixed $value, int $max, bool $required): ?string
    {
        $raw = is_string($value) ? trim($value) : $value;
        $validated = Validator::make([$key => $raw], [$key => ($required ? 'required' : 'nullable').'|string|max:'.$max])->validate();
        if (! $required && ($validated[$key] === null || $validated[$key] === '')) {
            return null;
        }
        $text = trim((string) $validated[$key]);
        if (! preg_match('/\S/u', $text)) {
            if ($required) {
                throw ValidationException::withMessages([$key => 'Write the text as plain, non-blank content.']);
            }

            return null;
        }
        // MARKUP SHAPE, NOT THE CHARACTER - the same rule DiagnosticReportHandling
        // applies, so "width <10m" stays valid prose while a real tag opener does not.
        if (preg_match('/<\s*[a-z!\/?]/i', $text) || str_contains($text, "\0")) {
            throw ValidationException::withMessages([$key => 'Write this as plain text, without HTML.']);
        }

        return $text;
    }

    private function requiredText(array $input, string $key, int $max): string
    {
        return $this->guard($key, $input[$key] ?? null, $max, true);
    }

    private function optionalText(array $input, string $key, int $max): ?string
    {
        return $this->guard($key, $input[$key] ?? null, $max, false);
    }

    /**
     * Whether this is a duplicate-key violation, on either engine.
     *
     * PostgreSQL reports 23505. SQLite - the test harness - reports the broader
     * 23000 integrity class for the same collision. Both mean "the partial unique
     * index already holds an open episode for this report", which is a conflict
     * to report, not a fault to surface. Any OTHER sqlstate is a real fault and is
     * deliberately not absorbed.
     */
    private function isUniqueViolation(Throwable $e): bool
    {
        $sqlState = $e instanceof \Illuminate\Database\QueryException ? ($e->errorInfo[0] ?? null) : null;

        return in_array($sqlState, ['23505', '23000'], true);
    }

    private function outcome(string $outcome, int $http, string $message, array $extra = []): array
    {
        return $extra + ['outcome' => $outcome, 'http_status' => $http, 'message' => $message];
    }
}