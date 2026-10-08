<?php

namespace App\Support;

use App\Models\ReportEscalation;
use Illuminate\Support\Str;

/**
 * The single question the terminal-action rules ask: does this report have an
 * OPEN escalation episode right now?
 *
 * It exists as its own tiny object so BOTH the page prop and the server-side
 * authorization reach the same answer through one indexed lookup, instead of the
 * rule being written once in React and once in a controller. A forged POST must
 * be refused by the same predicate that hides the button.
 *
 * No caching: an open escalation blocks a terminal response, so a stale answer
 * here would either wrongly block a legitimate resolution or wrongly allow an
 * escalation to race a terminal transition. This mirrors the "never cache
 * current ownership" rule in ReportingVisibility.
 */
class ReportEscalationGate
{
    public function hasOpen(string $reportUuid): bool
    {
        if (! Str::isUuid($reportUuid)) {
            return false;
        }

        return ReportEscalation::query()
            ->where('report_id', $reportUuid)
            ->where('status', ReportEscalation::OPEN)
            ->exists();
    }
}