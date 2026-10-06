<?php

namespace App\Http\Controllers;

use App\Services\ReportEscalationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * Admin-only Development Support escalation endpoints.
 *
 * These routes are deliberately NOT inside the shared
 * `['auth', 'role:Admin,Planning Officer']` diagnostics group. They are their
 * own `role:Admin` group, because "can see /diagnostics" and "may run internal
 * support workflow" are different questions. A Planning Officer who can open a
 * report detail page must never be one POST away from internal escalation
 * authority - {@see ReportingVisibility::allowedTypes()} already refuses them
 * every Technical Issue, and this route group refuses them before the service
 * is even constructed.
 *
 * Every mutation returns plain JSON with its own classification, mirroring
 * DiagnosticReportController::handle(). No Inertia mutation is used, so a
 * refused escalation can never leave the browser in a half-applied state, and
 * the partial-success shape stays honest.
 */
class DiagnosticReportEscalationController extends Controller
{
    public function __construct(private ReportEscalationService $escalations) {}

    public function store(Request $request, string $report)
    {
        return $this->respond($this->escalations->open($request->user(), strtolower($report), $request->all()));
    }

    public function recordRecommendation(Request $request, string $report, string $escalation)
    {
        return $this->respond($this->escalations->recordRecommendation(
            $request->user(), strtolower($report), $this->escalationId($escalation), $request->all()
        ));
    }

    public function close(Request $request, string $report, string $escalation)
    {
        return $this->respond($this->escalations->close(
            $request->user(), strtolower($report), $this->escalationId($escalation), $request->all()
        ));
    }

    private function escalationId(string $value): int
    {
        Validator::make(['escalation' => $value], ['escalation' => 'required|integer|min:1'])->validate();

        return (int) $value;
    }

    /**
     * Serialize the outcome.
     *
     * `details` is intentionally absent: the caller refreshes the report page and
     * reads the same rows through the ordinary Inertia prop. Returning the episode
     * twice would create two renderings of one authoritative record.
     */
    private function respond(array $result)
    {
        unset($result['escalation']);
        $status = $result['http_status'];
        unset($result['http_status']);

        return response()->json($result, $status);
    }
}