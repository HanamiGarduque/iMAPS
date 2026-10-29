<?php

namespace App\Http\Controllers;

use App\Models\AppNotification;
use App\Models\User;
use App\Models\ZoningApplication;
use App\Services\AuditLogger;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Record retention for zoning applications. MPDO keeps these records for 10
 * years, so there is no delete:
 *
 *  - ARCHIVE hides a Released application from the working
 *    registry. It is still counted, mapped, reported and searchable, and can be
 *    unarchived. Admin or the owning Planning Officer.
 *  - VOID marks an application that was encoded by mistake. It drops out of
 *    every count, map, report and search (ZoningApplication::NOT_VOIDED) and is
 *    read only from the registry's Voided view. The owning Planning Officer,
 *    with a reason, and only before any decision, inspection or permit.
 *
 * Both keep the row, its parcels, files and audit history. The route
 * middleware is the first boundary; the checks here are the second.
 */
class ApplicationRecordController extends Controller
{
    public function archive(int $id)
    {
        DB::transaction(function () use ($id) {
            $application = $this->lockForRecordAction($id);

            if (! $application->canBeArchivedBy(Auth::user())) {
                abort(403, 'Only an Administrator or the Planning Officer handling this application can archive it.');
            }
            if ($application->isArchived()) {
                throw ValidationException::withMessages(['archive' => 'This application is already archived.']);
            }
            if (! in_array($application->status, ZoningApplication::ARCHIVABLE_STATUSES, true)) {
                throw ValidationException::withMessages([
                    'archive' => 'Only Released applications can be archived.',
                ]);
            }

            $application->forceFill(['archived_at' => now(), 'archived_by' => Auth::id()])->save();

            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_ARCHIVED',
                performedBy: Auth::id(),
                note: "Application archived ({$application->status})."
            );
        });

        return back()->with('success', 'Application archived. It is still kept and counted in reports.');
    }

    /**
     * Archive several ticked registry rows at once. Same rules as archive():
     * each row is locked and checked on its own, and one that fails (not
     * closed, already archived, not yours) is skipped, never an error for
     * the rest.
     */
    public function bulkArchive(Request $request)
    {
        $ids = $request->validate([
            'ids'   => 'required|array|min:1|max:200',
            'ids.*' => 'integer',
        ])['ids'];

        $archived = 0;

        foreach (array_unique($ids) as $id) {
            DB::transaction(function () use ($id, &$archived) {
                $application = ZoningApplication::withVoided()->lockForUpdate()->find($id);

                if (! $application
                    || $application->voided_at !== null
                    || $application->isArchived()
                    || ! in_array($application->status, ZoningApplication::ARCHIVABLE_STATUSES, true)
                    || ! $application->canBeArchivedBy(Auth::user())) {
                    return;
                }

                $application->forceFill(['archived_at' => now(), 'archived_by' => Auth::id()])->save();

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'APPLICATION_ARCHIVED',
                    performedBy: Auth::id(),
                    note: "Application archived ({$application->status})."
                );
                $archived++;
            });
        }

        $skipped = count(array_unique($ids)) - $archived;

        if ($archived === 0) {
            return back()->with('error', 'Nothing was archived. Only Released applications that you handle can be archived.');
        }

        return back()->with('success', $archived . ' ' . ($archived === 1 ? 'application' : 'applications') . ' archived. They are still kept and counted in reports.'
            . ($skipped > 0 ? " {$skipped} skipped (not Released, already archived or not yours)." : ''));
    }

    public function unarchive(int $id)
    {
        DB::transaction(function () use ($id) {
            $application = $this->lockForRecordAction($id);

            if (! $application->canBeArchivedBy(Auth::user())) {
                abort(403, 'Only an Administrator or the Planning Officer handling this application can unarchive it.');
            }
            if (! $application->isArchived()) {
                throw ValidationException::withMessages(['archive' => 'This application is not archived.']);
            }

            $application->forceFill(['archived_at' => null, 'archived_by' => null])->save();

            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_UNARCHIVED',
                performedBy: Auth::id(),
                note: 'Application returned to the active registry.'
            );
        });

        return back()->with('success', 'Application moved back to the active registry.');
    }

    public function void(Request $request, int $id)
    {
        $validated = $request->validate([
            'reason' => 'required|string|min:10|max:1000',
        ], [
            'reason.required' => 'Give the reason this application is being voided.',
            'reason.min'      => 'Describe the reason in at least 10 characters.',
        ]);
        $reason = trim($validated['reason']);

        $application = DB::transaction(function () use ($id, $reason) {
            $application = $this->lockForRecordAction($id);

            if (! $application->canBeVoidedBy(Auth::user())) {
                abort(403, 'Only the Planning Officer handling this application can void it.');
            }
            if ($blocker = $application->voidBlocker()) {
                throw ValidationException::withMessages(['void' => $blocker]);
            }

            $application->forceFill([
                'voided_at'   => now(),
                'voided_by'   => Auth::id(),
                'void_reason' => $reason,
            ])->save();

            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_VOIDED',
                performedBy: Auth::id(),
                note: "Application voided while {$application->status}. Reason: {$reason}"
            );

            return $application;
        });

        $recipientIds = array_merge(
            User::where('role', 'Admin')->pluck('id')->all(),
            array_filter([$application->assigned_planning_officer_id, $application->encoded_by]),
        );
        AppNotification::notifyUsers(
            $recipientIds,
            'Application Voided',
            "Application {$application->reference_number} was voided. Reason: {$reason}",
            'status_updated',
            "/applications/{$application->id}"
        );

        return back()->with('success', 'Application voided. It is kept on record but no longer counted anywhere.');
    }

    private function lockForRecordAction(int $id): ZoningApplication
    {
        return ZoningApplication::withVoided()->lockForUpdate()->findOrFail($id);
    }
}
