<?php

namespace App\Http\Controllers;

use App\Services\DiagnosticReportReader;
use App\Support\DiagnosticNotice;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
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
 * READ access is Admin + Planning Officer, enforced by route middleware
 * `role:Admin,Planning Officer`. A Site Inspector is refused: they submit
 * through FieldSync only and get no iMAPS read path.
 *
 * The Planning Officer is included because they are the role that resolves
 * day-to-day operational issues inside MPDO, and denying them read access left
 * the person best placed to act on a report unable to read it. Inclusion is
 * READ ONLY and does NOT make the Planning Officer an author: the remote
 * report's summary, technical description, reproduction steps and submitted
 * metadata remain immutable in iMAPS for both roles.
 *
 * The controller itself performs no role check, deliberately: `role` is real,
 * strict and fail-closed (RoleMiddleware compares the canonical role strings
 * exactly and aborts 403), so a second, differently-spelled check inside the
 * controller could only ever drift from the route.
 *
 * READ ONLY. There is no store/update/destroy method here and no POST, PATCH or
 * DELETE route against a REPORT. An Admin and a Planning Officer may read and
 * triage by reading; neither may change a report's status, and no report may be
 * deleted or written from iMAPS at all. The remote table's write path remains
 * the FieldSync client's alone.
 *
 * THE ONE EXCEPTION IS NOT AN EXCEPTION TO THAT
 * ---------------------------------------------
 * `notifyPlanningOfficers` is a POST, but it writes ONLY to the local
 * `notifications` table: an in-app reminder for the Planning Officers. It
 * performs no remote write, changes no report field, and does not resolve
 * anything. It is Admin-only and is the only POST under `diagnostics`.
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
     * Diagnostic report list (Admin + Planning Officer, read only).
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
     * One report (Admin + Planning Officer, read only).
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
            'escalation' => $this->escalationFor($request),
        ]);
    }

    /**
     * Admin → Notify Planning Officers, for one diagnostic report.
     *
     * WHAT THIS IS
     * ------------
     * A reminder in the existing in-app notification channel. A FieldSync Site
     * Inspector reported an issue; an Admin has seen it; this tells the active
     * Planning Officers, who are the role that resolves the issue inside MPDO.
     *
     * WHAT IT DELIBERATELY DOES NOT DO
     * --------------------------------
     * * It does NOT write to the remote report. No status change, no edit, no
     *   delete. The report's summary, technical description, reproduction
     *   steps and submitted metadata stay immutable, which is why the report
     *   surface itself is still GET-only.
     * * It does NOT mark the report resolved. A notice is a reminder; whether
     *   FieldSync has resolved anything is a remote fact this application must
     *   not invent.
     *
     * AUTHORITY
     * ---------
     * `role:Admin` on the route is the whole boundary, and the role is re-read
     * from the authenticated session here as well. Re-checking is not a second
     * policy: it is the same exact comparison the middleware already made, and
     * it keeps this method safe if it is ever called from another route. A
     * Planning Officer reaching the page sees no button AND is refused 403 if
     * they post the request directly.
     *
     * A Site Inspector is refused twice over: they are not in `role:Admin`, and
     * they have no iMAPS web diagnostics access at all.
     *
     * CONTENT SAFETY
     * --------------
     * The message is built entirely by {@see DiagnosticNotice} from the
     * ALREADY-SANITIZED report shape. It carries the reference code, module, a
     * short safe headline and a relative in-app link, and never the report's
     * free text, which is where the live signed Storage URL lives. No service
     * key, token, handshake key or raw remote payload is read here.
     */
    public function notifyPlanningOfficers(Request $request, string $report)
    {
        if (($request->user()?->role ?? null) !== 'Admin') {
            abort(403);
        }

        $result = $this->reader->find($report);

        // A malformed id, a report that does not exist, and a read failure are
        // reported the same way the detail route reports them, so this endpoint
        // cannot be used to probe which report ids exist.
        if ($result['report'] === null) {
            abort(404);
        }

        try {
            $outcome = DiagnosticNotice::send($result['report']);
        } catch (Throwable $e) {
            // The notification is an aid, not the work. A failure here must not
            // look like the report changed, and must not leak a driver message.
            Log::error('[Diagnostics] Planning Officer notice failed.', [
                'report_id' => $result['report']['id'] ?? null,
            ]);

            return back()->with(
                'error',
                'The notice could not be sent. The diagnostic report is unchanged.'
            );
        }

        return back()->with('success', $outcome['message']);
    }

    /**
     * The developer/support escalation block, for an Admin only.
     *
     * RESPONSIBILITY SPLIT
     * -------------------
     * A Planning Officer assesses and resolves the operational issue inside
     * MPDO. If they cannot, an ADMIN contacts the development/support team.
     * So the escalation detail is the Admin's, and giving it to a Planning
     * Officer would blur exactly the line this controller is meant to keep
     * clear: an Admin coordinates escalation, they do not take over the
     * Planning Officer's workflow decisions.
     *
     * CONFIGURATION-BACKED, NEVER INVENTED
     * ----------------------------------
     * Every value comes from `config('imaps.contact')`, which is null until an
     * operator sets the matching environment variables. No name, address or
     * phone number is hardcoded or guessed; an unconfigured deployment renders
     * a placeholder instead of a fabricated contact.
     *
     * SAFE FIELDS ONLY
     * ----------------
     * Contact name, email, contact channel and support instructions. No
     * password, API key, service-role key, token or other private credential
     * is read here, and the page renders these as inert text rather than
     * links, so a value can never become an unintended navigation target.
     *
     * @return array{name: ?string, email: ?string, channel: ?string, instructions: ?string}
     */
    private function escalationFor(Request $request): array
    {
        $isAdmin = ($request->user()?->role ?? null) === 'Admin';

        $configured = (array) config('imaps.contact', []);

        $safe = [
            'name' => $isAdmin ? ($configured['name'] ?? null) : null,
            'email' => $isAdmin ? ($configured['email'] ?? null) : null,
            'channel' => $isAdmin ? ($configured['channel'] ?? null) : null,
            'instructions' => $isAdmin ? ($configured['instructions'] ?? null) : null,
        ];

        // An all-empty block is not worth sending to the browser at all.
        return array_filter($safe, fn ($value) => $value !== null && $value !== '') !== []
            ? $safe
            : ['name' => null, 'email' => null, 'channel' => null, 'instructions' => null];
    }
}
