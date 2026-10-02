<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\SiteInspection;
use App\Support\InspectionOperationsSummary;
use App\Support\InspectionRoundNumbering;
use App\Models\AppNotification;
use Illuminate\Support\Facades\Artisan;

class SiteInspectionController extends Controller
{
    /**
     * PHASE 2B1 runtime fix: the operations summary is injected rather than
     * constructed ad hoc.
     *
     * enrichForOperationsOverview() is a separate method and therefore has no
     * access to a local variable created inside index(). An earlier revision
     * instantiated the service in index() and referenced $summary inside the
     * helper, which raised Undefined variable  and returned HTTP 500
     * on GET /site-inspections.
     *
     * Constructor property promotion matches the existing controller pattern in
     * this codebase (DiagnosticReportController, PublicPortalController,
     * WorkReassignmentController), keeps InspectionOperationsSummary as the single
     * source of summary logic, introduces no static/global state, and leaves the
     * dependency mockable for tests.
     */
    public function __construct(private readonly InspectionOperationsSummary $summary)
    {
    }

    /**
     * Display a listing of the site inspections.
     *
     * A "site inspection" is one field-inspection ROUND belonging to a zoning
     * application. An application can have several rounds, and one applicant can
     * have several applications, so the round identity below is scoped to the
     * application and is never derived from the applicant or from the raw
     * inspection id on its own.
     */
    public function index()
    {
        // Get pending inspections
        $pendingInspections = SiteInspection::with(['zoningApplication', 'inspector'])
            ->whereIn('status', ['assigned', 'pending', 'in-progress'])
            ->orderBy('scheduled_date', 'asc')
            ->get();

        // Get completed inspections
        $completedInspections = SiteInspection::with(['zoningApplication', 'inspector'])
            ->where('status', 'completed')
            ->orderBy('completed_at', 'desc')
            ->get();

        $all = $pendingInspections->concat($completedInspections);

        // PHASE 2B2B: round identity comes from the one canonical source, keyed
        // by (application, parcel) rather than by application alone. The status
        // wording stays deliberately limited to what the LOCAL row can prove: a
        // locally `assigned` inspection is "Assigned", never "Ongoing" or "In
        // Progress", because iMAPS cannot see field progress.
        $this->attachRoundIdentity($all);
        $this->attachDisplayIdentity($all);

        $all = $pendingInspections->concat($completedInspections);

        return Inertia::render('Site Inspections/Index', [
            'pendingInspections' => $pendingInspections,
            'completedInspections' => $completedInspections,
            // PHASE 2B1: read-only operations enrichment + page counters.
            'operations' => $this->enrichForOperationsOverview($all),
            'counters' => $this->summary->counters($all),
        ]);
    }


    /**
     * PHASE 2B1 - read-only enrichment for the Admin operations overview.
     *
     * Every field added here is locally provable. Two things are deliberately
     * NOT added:
     *
     *  - the live FieldSync `status` / `current_step`. iMAPS cannot see field
     *    progress, so a local `assigned` round renders "Assigned" and never
     *    "Ongoing". Inferring live progress here would be inventing data.
     *
     *  - a per-round diagnostic. The remote `diagnostic_reports` table has no
     *    `local_inspection_id` and no `parcel_id`, so no per-round diagnostic is
     *    derivable and none is displayed.
     */
    private function enrichForOperationsOverview($inspections): array
    {
        // Round identity is resolved by InspectionRoundNumbering here, so the
        // overview reads exactly the same round the list and detail pages show.
        // The summary no longer depends on an attribute having been injected by
        // this controller, so it produces the same answer when called directly.
        return collect($this->summary->summarize($inspections))
            ->keyBy('id')
            ->all();
    }

    /**
     * Attach canonical round identity to each row, for presentation.
     *
     * PHASE 2B2B: this delegates to {@see InspectionRoundNumbering}, which
     * groups by (zoning_application_id, parcel_id). The previous per-application
     * derivation lived here and disagreed with the writer path, the delivery
     * supersession rule and itself between two display sites.
     *
     * A row with no recorded parcel is given `round_number = null` and the
     * `Historical Inspection` kind. It is NOT defaulted to 1: doing so is exactly
     * how a parcel-unknown row came to be displayed as a real round.
     *
     * @param  \Illuminate\Support\Collection<int, SiteInspection>  $inspections
     */
    private function attachRoundIdentity($inspections): void
    {
        $rounds = InspectionRoundNumbering::forInspections($inspections);

        foreach ($inspections as $inspection) {
            $round = $rounds[(int) $inspection->id] ?? null;

            if ($round === null) {
                // No chain and no parcel: label it honestly and carry no number.
                $inspection->round_number = null;
                $inspection->round_kind = InspectionRoundNumbering::KIND_HISTORICAL;
                $inspection->round_note = InspectionRoundNumbering::HISTORICAL_NOTE;

                continue;
            }

            $inspection->round_number = $round['round_number'];
            $inspection->round_kind = $round['round_kind'];
            $inspection->round_note = $round['note'];
        }
    }

    /**
     * Attach the locally provable display identity (status wording and the
     * application reference). Split out of round identity so the two concerns
     * cannot drift, and so round handling has exactly one entry point.
     *
     * @param  \Illuminate\Support\Collection<int, SiteInspection>  $inspections
     */
    private function attachDisplayIdentity($inspections): void
    {
        foreach ($inspections as $inspection) {
            $inspection->display_status = $this->displayStatus((string) $inspection->status);
            $inspection->display_reference = $inspection->zoningApplication?->reference_number
                ?: ('Application #' . $inspection->zoning_application_id);
        }
    }

    /**
     * Locally provable status wording for an inspection row.
     *
     * `assigned` (and its legacy `pending` spelling) is reported as "Assigned".
     * It is deliberately never called "Ongoing" or "In Progress": an assignment
     * only records that an inspector owns the task, not that field work has
     * started. Only `completed` is ever described as completed.
     */
    private function displayStatus(string $status): string
    {
        return match (strtolower($status)) {
            'completed', 'submitted' => 'Completed',
            default => 'Assigned',
        };
    }

    /**
     * PHASE 2A - scoped manual reverse sync, ONE inspection round.
     *
     * REPLACES the former unscoped `forceSync()`, which called
     * `Artisan::call('sync:pull-inspections')` with NO --local-inspection-id and
     * could therefore write every completed inspection in the namespace from a
     * single click on the list. That global path is gone from both the route file
     * and this controller, so no unscoped invocation remains.
     *
     * SCOPE: the chosen `local_inspection_id` is passed straight through to the
     * existing command. The command still applies `bridge_source_id` scoping via
     * `SupabaseService::scopedFilters()`, which fails closed when no bridge source
     * is configured, so identity is never resolved by reference_number, by
     * application alone, or by parcel alone.
     *
     * AUTHORITY: this is synchronization, not a business decision. It imports a
     * FieldSync result that already exists. It cannot approve, decline, request a
     * reinspection, assign an inspector, schedule a round, create a round, or edit
     * findings. Those remain Planning Officer / FieldSync responsibilities.
     *
     * FEEDBACK: the outcome is read back from the command's machine-readable
     * result line, so an inspection that was already current is reported as no
     * change rather than as a successful sync.
     */
    public function syncOneFromFieldSync(Request $request, $inspection)
    {
        // Safety 1: the target must exist. A missing id is refused, not a silent no-op.
        $target = SiteInspection::find($inspection);

        if (! $target) {
            return back()->with(
                'error',
                'That inspection round does not exist, so nothing was synced.'
            );
        }

        // Safety 2 and 3: the id is bound to the loaded row and passed through
        // verbatim. No second identity mechanism is introduced, and no other
        // inspection can be reached from this action because the command filters on
        // this exact id.
        $localInspectionId = (int) $target->id;

        try {
            Artisan::call('sync:pull-inspections', [
                '--local-inspection-id' => $localInspectionId,
            ]);

            $output = trim((string) Artisan::output());
        } catch (\Throwable $e) {
            return back()->with(
                'error',
                'Sync from FieldSync failed for Inspection '.$localInspectionId.': '.$e->getMessage()
            );
        }

        return back()->with('success', $this->describeSyncOutcome($output, $localInspectionId));
    }

    /**
     * Turn the command's machine-readable result into honest Admin-facing feedback.
     *
     * A result token is only emitted by the command when it actually knows the
     * answer. Anything unrecognised is reported as unknown rather than as a
     * success, because a sync that could not be proven must never be reported as
     * one.
     */
    private function describeSyncOutcome(string $output, int $localInspectionId): string
    {
        $label = 'Inspection '.$localInspectionId.': ';

        if (str_contains($output, 'SYNC_RESULT=CHANGED')) {
            return $label.'imported the latest completed FieldSync result; local data was updated.';
        }

        if (str_contains($output, 'SYNC_RESULT=NO_CHANGE')) {
            return $label.'already up to date with FieldSync; no local change was required.';
        }

        if (str_contains($output, 'SYNC_RESULT=NO_REMOTE_RESULT')) {
            return $label.'has no completed FieldSync result to import yet; nothing was changed.';
        }

        if (str_contains($output, 'SYNC_RESULT=FAILED')) {
            return $label.'the bridge could not be reached; nothing was changed.';
        }

        return $label.'sync ran but the bridge returned no result that could be interpreted; no change was confirmed.';
    }

    /**
     * Display the specified site inspection.
     */
    public function show($id)
    {
        $inspection = SiteInspection::with([
            'zoningApplication.parcels',
            'inspector',
            'parcel',
        ])->findOrFail($id);

        // PHASE 2B2B: identical round identity to the list page. The helper
        // re-reads the whole (application, parcel) chain from the database, so
        // resolving a single row still yields its true position rather than
        // always reporting Round 1.
        $this->attachRoundIdentity(collect([$inspection]));
        $this->attachDisplayIdentity(collect([$inspection]));

        return Inertia::render('Site Inspections/Show', [
            'inspection' => $inspection,
        ]);
    }
}
