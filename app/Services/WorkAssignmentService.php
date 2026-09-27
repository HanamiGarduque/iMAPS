<?php

namespace App\Services;

use App\Models\ApplicationPoAssignment;
use App\Models\SiteInspection;
use App\Models\SiteInspectionAssignment;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Support\InspectorTransferGuard;
use App\Support\ReassignmentReasons;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * The single guarded path for changing who owns work.
 *
 * Every ownership change — first assignment or reassignment — goes through this
 * service. Nothing else is permitted to write `inspector_id` or
 * `assigned_planning_officer_id`, which is what stops a handover from
 * overwriting the previous owner without a record.
 *
 * WHAT THIS SERVICE GUARANTEES
 *
 *  1. The receiving employee is an ACTIVE account with the correct role. A
 *     suspended account is never selectable and never accepted, so work can
 *     never be parked on someone who cannot log in.
 *  2. The receiver works on their OWN account. No impersonation, no shared
 *     credentials, and no "acting as" substitution is modelled anywhere.
 *  3. The previous owner is preserved. `*_assignments` is append-only history;
 *     the current owner is a separate pointer. Changing the pointer never
 *     destroys the record of who held the work before.
 *  4. The change is attributable. Actor, reason and timestamp are stored, and
 *     an audit_trail row is written IN THE SAME TRANSACTION, so a handover can
 *     never succeed without its audit record.
 *  5. Nothing else moves. The application status, the technical review history
 *     and the encoder are all left exactly as they were — a handover is a
 *     continuity action, not a business decision.
 */
class WorkAssignmentService
{
    /**
     * Planning Officers who may RECEIVE an application.
     *
     * Delegates to the model scope so the picker, the validation rule and this
     * service can never disagree about who is eligible.
     */
    public function activePlanningOfficers(): array
    {
        return User::activePlanningOfficers()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->all();
    }

    /**
     * Site Inspectors who may RECEIVE a round.
     *
     * Requires all three: the right role, an active account, and a FieldSync
     * handshake key. The handshake key is what proves the person can actually
     * receive field work in the app; without it there is no Supabase profile to
     * deliver the job to.
     */
    public function activeSiteInspectors(): array
    {
        return User::activeSiteInspectors()
            ->orderBy('name')
            ->get(['id', 'name'])
            ->all();
    }

    /**
     * Change the Planning Officer currently responsible for an application.
     *
     * Admin-initiated business continuity. This grants NO technical decision
     * authority: the new officer gains ownership of the work, not the ability to
     * make Planning Officer decisions on the Admin's behalf.
     */
    public function reassignPlanningOfficer(
        ZoningApplication $application,
        User $actor,
        int $toPlanningOfficerId,
        string $reason,
        ?string $reasonNote = null,
    ): ApplicationPoAssignment {
        $target = $this->resolveActivePlanningOfficer($toPlanningOfficerId);

        $fromId = $application->assigned_planning_officer_id
            ? (int) $application->assigned_planning_officer_id
            : null;

        // Re-pointing at the officer who already owns it is not a reassignment.
        // Silently writing a history row for a no-op would put a fabricated
        // handover in the accountability record.
        if ($fromId !== null && $fromId === (int) $target->id) {
            throw ValidationException::withMessages([
                'to_planning_officer_id' => 'That Planning Officer already owns this application.',
            ]);
        }

        return DB::transaction(function () use ($application, $actor, $target, $fromId, $reason, $reasonNote) {
            $now = now();

            $history = ApplicationPoAssignment::create([
                'zoning_application_id'    => $application->id,
                'assignment_type'          => $fromId === null
                    ? ApplicationPoAssignment::TYPE_INITIAL
                    : ApplicationPoAssignment::TYPE_REASSIGNMENT,
                'from_planning_officer_id' => $fromId,
                'to_planning_officer_id'   => $target->id,
                'reason'                   => $reason,
                'reason_note'              => $reasonNote,
                'reassigned_by'            => $actor->id,
                'reassigned_at'            => $now,
            ]);

            // The current pointer. ONLY this column moves: status, encoded_by and
            // the technical review rows are deliberately untouched.
            $application->assigned_planning_officer_id = $target->id;
            $application->save();

            $this->writeAuditTrail(
                applicationId: $application->id,
                action: 'PLANNING_OFFICER_REASSIGNED',
                actor: $actor,
                note: $this->describe($fromId, $target->id, $target->name, $reason, $reasonNote),
            );

            return $history;
        });
    }

    /**
     * Change the Site Inspector on ONE inspection round.
     *
     * Planning-Officer-initiated. Refused unless the round is provably untouched
     * in the field: see {@see InspectorTransferGuard} for why local state alone
     * cannot be trusted here.
     *
     * @param  array<string, mixed>  $remoteState  the FieldSync job state, or [] when unreadable
     */
    public function reassignInspector(
        SiteInspection $inspection,
        User $actor,
        int $toInspectorId,
        string $reason,
        ?string $reasonNote = null,
        array $remoteState = [],
    ): SiteInspectionAssignment {
        $target = $this->resolveActiveSiteInspector($toInspectorId);

        $fromId = $inspection->inspector_id ? (int) $inspection->inspector_id : null;

        if ($fromId !== null && $fromId === (int) $target->id) {
            throw ValidationException::withMessages([
                'to_inspector_id' => 'That Site Inspector already holds this inspection round.',
            ]);
        }

        $decision = InspectorTransferGuard::evaluate([
            'local_status'            => $inspection->status,
            'remote_readable'         => $remoteState !== [],
            'remote_status'           => $remoteState['status'] ?? null,
            'gps_confirmed_at'        => $remoteState['gps_confirmed_at'] ?? null,
            'checklist_completed_count' => $remoteState['checklist_completed_count'] ?? 0,
            'photo_count'             => $remoteState['photo_count'] ?? 0,
        ]);

        if (! $decision['allowed']) {
            throw ValidationException::withMessages([
                'inspector_id' => $decision['reason'],
            ]);
        }

        $history = DB::transaction(function () use ($inspection, $actor, $target, $fromId, $reason, $reasonNote) {
            $now = now();

            $row = SiteInspectionAssignment::create([
                'site_inspection_id' => $inspection->id,
                'assignment_type'    => $fromId === null
                    ? SiteInspectionAssignment::TYPE_INITIAL
                    : SiteInspectionAssignment::TYPE_REASSIGNMENT,
                'from_inspector_id'  => $fromId,
                'to_inspector_id'    => $target->id,
                'reason'             => $reason,
                'reason_note'        => $reasonNote,
                'reassigned_by'      => $actor->id,
                'reassigned_at'      => $now,
            ]);

            // Only the inspector pointer moves. The lifecycle status is NOT reset:
            // the guard has already proven the round is unstarted, and forcing a
            // reset here would be exactly the silent overwrite this service exists
            // to prevent. Findings, submitted_at and evidence stay untouched.
            $inspection->inspector_id = $target->id;
            $inspection->save();

            // The system-wide audit entry. Written in the same transaction as the
            // change, so a handover can never commit without its record.
            $this->writeAuditTrail(
                applicationId: (int) $inspection->zoning_application_id,
                action: 'SITE_INSPECTOR_REASSIGNED',
                actor: $actor,
                note: sprintf(
                    'Inspector for inspection round %d moved from %s to %s (%s). Reason: %s. The round status and any evidence already collected were not changed.',
                    $inspection->id,
                    $fromId === null ? 'no assigned inspector' : (string) $fromId,
                    $target->name,
                    (string) $target->id,
                    $this->reasonWithNote($reason, $reasonNote),
                ),
            );

            return $row;
        });

        return $history;
    }

    /**
     * Record the very first inspector assignment for a brand new round.
     *
     * Kept separate from reassignment on purpose: a new round has no previous
     * owner, so there is nothing to protect and nothing to check. The history
     * row is still written, so the round's ownership story starts from its first
     * entry rather than from a gap.
     */
    public function recordInitialInspectorAssignment(
        SiteInspection $inspection,
        User $actor,
        string $reason = ReassignmentReasons::WORKLOAD_TRANSFER,
    ): void {
        SiteInspectionAssignment::firstOrCreate(
            [
                'site_inspection_id' => $inspection->id,
                'assignment_type'    => SiteInspectionAssignment::TYPE_INITIAL,
            ],
            [
                'from_inspector_id' => null,
                'to_inspector_id'   => $inspection->inspector_id,
                'reason'            => $reason,
                'reason_note'       => null,
                'reassigned_by'     => $actor->id,
                'reassigned_at'     => now(),
            ]
        );
    }

    /**
     * An active Planning Officer, or a plain refusal.
     *
     * The message names the three real requirements so an officer who cannot be
     * chosen knows which one failed, without the page ever offering a suspended
     * or wrong-role account in the first place.
     */
    public function resolveActivePlanningOfficer(int $id): User
    {
        $user = User::find($id);

        if (! $user) {
            throw ValidationException::withMessages([
                'to_planning_officer_id' => 'Select a valid Planning Officer.',
            ]);
        }

        if ($user->role !== 'Planning Officer') {
            throw ValidationException::withMessages([
                'to_planning_officer_id' => 'The new owner must be a Planning Officer.',
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'to_planning_officer_id' => 'That Planning Officer account is suspended and cannot receive work.',
            ]);
        }

        return $user;
    }

    /**
     * An active Site Inspector with a FieldSync account, or a plain refusal.
     */
    public function resolveActiveSiteInspector(int $id): User
    {
        $user = User::find($id);

        if (! $user) {
            throw ValidationException::withMessages([
                'to_inspector_id' => 'Select a valid Site Inspector.',
            ]);
        }

        if ($user->role !== 'Site Inspector') {
            throw ValidationException::withMessages([
                'to_inspector_id' => 'The new owner must be a Site Inspector.',
            ]);
        }

        if (! $user->is_active) {
            throw ValidationException::withMessages([
                'to_inspector_id' => 'That Site Inspector account is suspended and cannot receive work.',
            ]);
        }

        if (blank($user->handshake_key)) {
            throw ValidationException::withMessages([
                'to_inspector_id' => 'That Site Inspector has no FieldSync account, so field work cannot be delivered to them.',
            ]);
        }

        return $user;
    }

    /**
     * Write the system-wide audit entry.
     *
     * Deliberately NOT routed through AuditLogger: that helper swallows write
     * failures on purpose, which is right for general activity logging but wrong
     * here. A handover must never be able to commit without its accountability
     * record, so this runs inside the caller's transaction and a failure rolls
     * the whole change back.
     */
    private function writeAuditTrail(
        int $applicationId,
        string $action,
        User $actor,
        string $note,
    ): void {
        DB::table('audit_trail')->insert([
            'application_id' => $applicationId,
            'action'         => $action,
            'performed_by'   => $actor->id,
            'note'           => $note,
            'performed_at'   => now(),
        ]);
    }

    private function describe(
        ?int $fromId,
        int $toId,
        string $toName,
        string $reason,
        ?string $reasonNote,
    ): string {
        return sprintf(
            'Planning Officer ownership moved from %s to %s (%s). Reason: %s. The application status, encoder and technical review history were not changed.',
            $fromId === null ? 'no assigned officer' : (string) $fromId,
            $toName,
            (string) $toId,
            $this->reasonWithNote($reason, $reasonNote),
        );
    }

    /**
     * Render the reason for a human-readable audit note, appending the
     * explanation when one was required and given.
     */
    private function reasonWithNote(string $reason, ?string $reasonNote): string
    {
        if (ReassignmentReasons::noteIsRequired($reason) && filled($reasonNote)) {
            return $reason . ' (' . trim((string) $reasonNote) . ')';
        }

        return $reason;
    }
}
