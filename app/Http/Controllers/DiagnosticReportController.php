<?php

namespace App\Http\Controllers;

use App\Models\ReportEscalation;
use App\Services\DiagnosticReportReader;
use App\Services\DiagnosticReportHandling;
use App\Services\ReportEscalationService;
use App\Support\DiagnosticNotice;
use App\Support\ReportingVisibility;
use App\Support\SupportReportResolution;
use Illuminate\Http\Request;
use Inertia\Inertia;

class DiagnosticReportController extends Controller
{
    public function __construct(private DiagnosticReportReader $reader, private ReportingVisibility $visibility, private SupportReportResolution $resolution,
        private ReportEscalationService $escalations) {}

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

        // DEVELOPMENT SUPPORT is internal MPDO/support workflow, so the prop is
        // produced for an Admin viewing a Technical Issue and for nobody else.
        // A Planning Officer and an Application Support report both get null -
        // not merely a hidden section - and no configuration value is read on
        // those paths. The contact block carries only the four documented safe
        // fields from config/imaps.php; it can never contain a key or token.
        return Inertia::render('Diagnostics/Show', ['report' => $row, 'context' => $context,
            'canNotify' => $this->visibility->canNotify($request->user(), $row, $context ?? []),
            'handlingActions' => $this->visibility->handlingActions($request->user(), $row, $context),
            'developmentSupport' => $this->developmentSupport($request->user(), $row)]);
    }

    /**
     * The internal escalation panel's data, or null when it must not exist.
     *
     * Returns the open episode, the read-only closed history, and the configured
     * contact. `contactConfigured` is computed from the four safe fields so the
     * view can say the contact is unconfigured instead of rendering an empty box -
     * and so no fabricated address can ever appear.
     */
    private function developmentSupport($viewer, array $row): ?array
    {
        if (($viewer?->role ?? null) !== 'Admin' || ($row['report_type'] ?? null) !== 'technical_issue') {
            return null;
        }
        $escalatable = in_array($row['status'] ?? null, ['submitted', 'in_review'], true);
        $contact = (array) config('imaps.contact', []);
        $safe = [];
        foreach (['name', 'email', 'channel', 'instructions'] as $key) {
            $value = $contact[$key] ?? null;
            $safe[$key] = is_string($value) && trim($value) !== '' ? $value : null;
        }
        $episodes = $escalatable
            ? ReportEscalation::query()->where('report_id', (string) $row['id'])->orderByDesc('created_at')->get()
            : collect();

        return [
            'open' => $episodes->firstWhere('status', ReportEscalation::OPEN)?->only([
                'id', 'status', 'created_at', 'recommendation', 'recommendation_at', 'closure_note',
            ]) ?? null,
            'closed' => $episodes->where('status', ReportEscalation::CLOSED)->values()
                ->map(fn ($e) => $e->only(['id', 'created_at', 'closed_at', 'recommendation']))->all(),
            'contact' => $safe,
            'contactConfigured' => (bool) array_filter($safe),
            'escalatable' => $escalatable,
        ];
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
