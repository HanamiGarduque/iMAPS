<?php

namespace App\Http\Controllers;

use App\Jobs\PushInspectionToSupabase;
use App\Models\Parcel;
use App\Models\SiteInspection;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\SupabaseService;
use App\Services\WorkAssignmentService;
use App\Support\InspectorTransferGuard;
use App\Support\ReassignmentReasons;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Work reassignment: business continuity without account sharing.
 *
 * TWO SEPARATE RESPONSIBILITIES, DELIBERATELY NOT MERGED
 *
 *  - Application ownership is Admin-initiated. Admin hands an application to
 *    another active Planning Officer so the work keeps moving. This does NOT
 *    give Admin any Planning Officer decision authority: the new officer makes
 *    the technical decisions, on their own account.
 *  - Inspection-round ownership is Planning-Officer-initiated. A Planning
 *    Officer hands a field round to another active Site Inspector. Admin does
 *    not do this in Phase 1.
 *
 * Nobody ever works under another person's login. There is no impersonation and
 * no "acting as" path anywhere in this controller.
 *
 * The route middleware is the security boundary; the in-method role assertions
 * below are a second, deliberate layer so a future route change cannot silently
 * widen who may reassign.
 */
class WorkReassignmentController extends Controller
{
    public function __construct(
        private readonly WorkAssignmentService $assignments,
        private readonly SupabaseService $supabase,
    ) {
    }

    /**
     * Hand an application to another Planning Officer. Admin only.
     */
    public function reassignPlanningOfficer(Request $request)
    {
        $this->assertRole('Admin', 'Only an Administrator can reassign application ownership.');

        $validated = $request->validate([
            'zoning_application_id'      => 'required|integer|exists:zoning_applications,id',
            'to_planning_officer_id'     => ['required', 'integer', Rule::exists('users', 'id')],
            'reason'                     => ['required', 'string', Rule::in(ReassignmentReasons::all())],
            'reason_note'                => [
                'nullable',
                'string',
                'max:500',
                'required_if:reason,' . ReassignmentReasons::OTHER,
            ],
        ], ReassignmentReasons::validationMessages() + [
            'to_planning_officer_id.exists' => 'Select a valid Planning Officer.',
        ]);

        $application = ZoningApplication::findOrFail($validated['zoning_application_id']);

        $this->assignments->reassignPlanningOfficer(
            $application,
            $request->user(),
            (int) $validated['to_planning_officer_id'],
            $validated['reason'],
            $validated['reason_note'] ?? null,
        );

        return back()->with(
            'success',
            'Application ownership transferred. The application status and its technical review history were not changed.'
        );
    }

    /**
     * Hand ONE inspection round to another Site Inspector. Planning Officer only.
     */
    public function reassignInspector(Request $request)
    {
        $this->assertRole('Planning Officer', 'Only a Planning Officer can reassign a site inspection.');

        $validated = $request->validate([
            'site_inspection_id' => 'required|integer|exists:site_inspections,id',
            'zoning_application_id' => 'required|integer|exists:zoning_applications,id',
            'to_inspector_id'    => ['required', 'integer', Rule::exists('users', 'id')],
            'reason'             => ['required', 'string', Rule::in(ReassignmentReasons::all())],
            'reason_note'        => [
                'nullable',
                'string',
                'max:500',
                'required_if:reason,' . ReassignmentReasons::OTHER,
            ],
        ], ReassignmentReasons::validationMessages() + [
            'to_inspector_id.exists' => 'Select a valid Site Inspector.',
        ]);

        $inspection = SiteInspection::with('parcel')->findOrFail($validated['site_inspection_id']);

        // The round must belong to the application the request claims, and to a
        // parcel of that application. Without this a Planning Officer could name
        // any round id and reassign work outside the application in front of them.
        if ((int) $inspection->zoning_application_id !== (int) $validated['zoning_application_id']) {
            throw ValidationException::withMessages([
                'site_inspection_id' => 'That inspection round does not belong to this application.',
            ]);
        }

        if ($inspection->parcel) {
            $parcelBelongs = Parcel::whereKey($inspection->parcel_id)
                ->where('zoning_application_id', $inspection->zoning_application_id)
                ->exists();

            if (! $parcelBelongs) {
                throw ValidationException::withMessages([
                    'site_inspection_id' => 'That inspection round does not belong to this application.',
                ]);
            }
        }

        // The guard reads the REMOTE job. Local status cannot prove a round is
        // unstarted, so an unreadable remote state is treated as a refusal.
        $remoteState = $this->supabase->fieldJobTransferStates([(int) $inspection->id])[(int) $inspection->id] ?? [];

        $this->assignments->reassignInspector(
            $inspection,
            $request->user(),
            (int) $validated['to_inspector_id'],
            $validated['reason'],
            $validated['reason_note'] ?? null,
            $remoteState,
        );

        // Deliver the new assignment to FieldSync. The push upserts on
        // local_inspection_id, so the SAME job row is handed over — no second
        // job is created and no evidence is rewritten.
        PushInspectionToSupabase::dispatch($inspection->fresh());

        return back()->with(
            'success',
            'Site Inspector reassigned. The inspection round, its status and its evidence were not changed.'
        );
    }

    /**
     * The reasons offered in the reassignment form. Served from the server so
     * the vocabulary has exactly one definition.
     */
    public function reasons()
    {
        $this->assertRole('Admin,Planning Officer', 'Not authorized.');

        return response()->json([
            'reasons'   => ReassignmentReasons::all(),
            'note_for'  => [ReassignmentReasons::OTHER],
        ]);
    }

    /**
     * Reject the request outright unless the caller holds one of the allowed
     * roles. Deliberately redundant with the route middleware.
     *
     * @param  string  $allowed  comma-separated canonical role strings
     */
    private function assertRole(string $allowed, string $message): void
    {
        $roles = array_map('trim', explode(',', $allowed));
        $user = auth()->user();

        if (! $user || ! in_array($user->role, $roles, true)) {
            abort(403, $message);
        }
    }
}
