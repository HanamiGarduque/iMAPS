<?php

namespace App\Http\Controllers;

use App\Services\DiagnosticReportReader;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * LOOP 9E/9F - Admin read-only triage of FieldSync inspector diagnostic reports.
 *
 * WHAT THIS COMPLETES
 * -------------------
 * A FieldSync Site Inspector can already submit a support issue into the remote
 * `diagnostic_reports` table. Before this controller, nothing in iMAPS read it:
 * the architecture record called that an open "CONTRACT/ACCESS WORK REQUIRED"
 * obligation, and the audit confirmed zero iMAPS references. This is that missing
 * Admin half.
 *
 * WHAT THIS IS NOT
 * ----------------
 * - NOT delivery monitoring. That is 9D, on the local `delivery_status` summary.
 *   This controller never reads `site_inspections`, `inspection_delivery_attempts`
 *   or `audit_trail`, and duplicates none of 9D.
 * - NOT a support queue for failed deliveries. A diagnostic report is a
 *   human-submitted bug or issue report about the FieldSync app itself, and it
 *   shares no vocabulary with the delivery state machine.
 * - NOT Technical Review, not Planning Review, not assignment, not retry.
 *
 * THE AUTHORITY BOUNDARY
 * ----------------------
 * Admin only, enforced by route middleware `role:Admin` - the same boundary the
 * architecture record assigns to this triage. The controller itself performs no
 * role check, deliberately: `role` is real, strict and fail-closed
 * (RoleMiddleware compares the canonical role string exactly and aborts 403), so
 * a second, differently-spelled check inside the controller could only ever drift
 * from the route.
 *
 * READ ONLY. There is no store/update/destroy method here and no POST, PATCH or
 * DELETE route. An Admin may read and triage by reading; they may not change a
 * report's status, and no report may be deleted or written from iMAPS at all.
 * The remote table's write path remains the FieldSync client's alone.
 *
 * FREE TEXT
 * ---------
 * Every value reaching a page here has already been through
 * {@see \App\Support\DiagnosticTextSanitizer} inside the reader. The live report
 * on the real database contains a signed Supabase Storage URL - a bearer
 * capability on a private inspection photo - inside its `summary`, so this is not
 * a theoretical concern. The raw value is never fetched into a prop, never
 * returned beside the safe one, and never logged.
 */
class DiagnosticReportController extends Controller
{
    public function __construct(private DiagnosticReportReader $reader)
    {
    }

    /**
     * Admin triage list.
     */
    public function index(Request $request): Response
    {
        $result = $this->reader->all();

        return Inertia::render('Diagnostics/Index', [
            'reports' => $result['reports'],
            'loadError' => $result['message'],
            // Stated on the page itself so the reader's authority is explicit
            // rather than implied by the absence of buttons.
            'readOnly' => true,
        ]);
    }

    /**
     * One report.
     */
    public function show(Request $request, string $report)
    {
        $result = $this->reader->find($report);

        if ($result['message'] !== null) {
            return back()->with('error', $result['message']);
        }

        if ($result['report'] === null) {
            // A malformed id and a genuinely absent report are deliberately
            // indistinguishable to the caller, so this route cannot be used to
            // probe which report ids exist.
            abort(404);
        }

        return Inertia::render('Diagnostics/Show', [
            'report' => $result['report'],
            'readOnly' => true,
        ]);
    }
}
