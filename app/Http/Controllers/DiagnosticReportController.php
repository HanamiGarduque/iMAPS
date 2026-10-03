<?php

namespace App\Http\Controllers;

use App\Services\DiagnosticReportReader;
use App\Services\DiagnosticReportHandling;
use App\Support\DiagnosticNotice;
use App\Support\ReportingVisibility;
use App\Support\SupportReportResolution;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DiagnosticReportController extends Controller
{
    public function __construct(private DiagnosticReportReader $reader, private ReportingVisibility $visibility, private SupportReportResolution $resolution) {}

    public function index(Request $request)
    {
        $filters = $request->validate([
            'type' => 'nullable|string', 'application' => 'nullable|uuid',
            'status' => 'nullable|in:submitted,in_review,resolved,wont_fix', 'page' => 'nullable|integer|min:1',
        ]);
        $type = $this->visibility->authorizeRequestedType($request->user(), $filters['type'] ?? null);
        $filters['type'] = $type;
        $result = $this->visibility->scopeVisibleReports($request->user(), $filters);
        $total = count($result['reports']);
        $last = max(1, (int) ceil($total / 20));
        $page = min((int) ($filters['page'] ?? 1), $last);
        return Inertia::render('Diagnostics/Index', [
            'reports' => array_slice($result['reports'], ($page - 1) * 20, 20),
            'counts' => $result['counts'], 'allowedTypes' => $this->visibility->allowedTypes($request->user()),
            'filters' => $filters, 'pagination' => ['page' => $page, 'last' => $last, 'total' => $total],
            'loadError' => $result['message'], 'readOnly' => true,
        ]);
    }

    public function show(Request $request, string $report)
    {
        $row = $this->readReport($report);
        $context = $row['report_type'] === 'application_support' ? $this->resolution->resolve($row) : null;
        abort_unless($this->visibility->canViewReport($request->user(), $row, $context), 403);

        // No escalation/contact block is sent. It was never part of the locked
        // Reports & Support hierarchy and carried no information in this
        // deployment, so the prop is not merely hidden in the view: it is not
        // produced, and no configuration value is read on this path.
        return Inertia::render('Diagnostics/Show', ['report' => $row, 'context' => $context,
            'canNotify' => $this->visibility->canNotify($request->user(), $row, $context ?? []),
            'handlingActions' => $this->visibility->handlingActions($request->user(), $row, $context)]);
    }

    public function handle(Request $request, string $report, DiagnosticReportHandling $handling)
    {
        $result = $handling->handle($request->user(), strtolower($report), $request->only('status', 'response_message'));
        $status = $result['http_status'];
        unset($result['http_status']);
        return response()->json($result, $status);
    }

    public function notifyPlanningOfficers(Request $request, string $report)
    {
        abort_unless(($request->user()?->role ?? null) === 'Admin', 403);
        $row = $this->readReport($report);
        abort_unless($row['report_type'] === 'application_support', 403);
        try {
            $outcome = app(DiagnosticNotice::class)->send($request->user(), $row);
            return back()->with($outcome['notified'] || $outcome['suppressed'] ? 'success' : 'error', $outcome['message']);
        } catch (\Throwable) {
            return back()->with('error', 'The notice could not be sent. The report is unchanged.');
        }
    }

    private function readReport(string $uuid): array
    {
        $result = $this->reader->find($uuid);
        abort_unless($result['ok'], 503, 'The report could not be loaded. Please try again.');
        abort_if($result['report'] === null, 404);
        return $result['report'];
    }
}
