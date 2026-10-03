<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\SiteInspection;
use App\Models\AppNotification;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

class SiteInspectionController extends Controller
{
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
        $rounds = $this->roundNumbersByApplication($all);

        foreach ($all as $inspection) {
            $round = $rounds[$inspection->id] ?? 1;

            // Presentation-safe, locally provable identity. The status wording is
            // deliberately limited to what the LOCAL row can prove: a locally
            // `assigned` inspection is "Assigned", never "Ongoing" or "In
            // Progress", because iMAPS cannot see field progress.
            $inspection->round_number = $round;
            $inspection->round_kind = $round === 1 ? 'Original Inspection' : 'Reinspection';
            $inspection->display_status = $this->displayStatus((string) $inspection->status);
            $inspection->display_reference = $inspection->zoningApplication?->reference_number
                ?: ('Application #' . $inspection->zoning_application_id);
        }

        return Inertia::render('Site Inspections/Index', [
            'pendingInspections' => $pendingInspections,
            'completedInspections' => $completedInspections,
        ]);
    }

    /**
     * Map every inspection id to its 1-based round number WITHIN its own
     * application, ordered by id.
     *
     * This is the true inspection sequence for that application, read from the
     * database rather than from the rows that happen to be on screen, so a
     * round number can never be derived from an unrelated list, from the
     * applicant, or from the inspection id alone. Scoping to
     * `zoning_application_id` is what makes this safe: an applicant with five
     * applications still gets Round 1 for each of them.
     */
    private function roundNumbersByApplication($inspections): array
    {
        $applicationIds = $inspections
            ->pluck('zoning_application_id')
            ->filter()
            ->unique()
            ->values();

        if ($applicationIds->isEmpty()) {
            return [];
        }

        $rows = DB::table('site_inspections')
            ->select('id', 'zoning_application_id')
            ->whereIn('zoning_application_id', $applicationIds)
            ->orderBy('zoning_application_id')
            ->orderBy('id')
            ->get();

        // Built with an explicit loop on purpose. Collecting this with
        // flatMap()/collapse() renumbers integer keys, which silently replaced
        // every inspection id with a positional index and gave two different
        // inspections of the same application the same round number.
        $rounds = [];

        foreach ($rows->groupBy('zoning_application_id') as $group) {
            $round = 0;

            foreach ($group as $row) {
                $rounds[$row->id] = ++$round;
            }
        }

        return $rounds;
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
     * Force a sync from Supabase.
     */
    public function forceSync()
    {
        try {
            Artisan::call('sync:pull-inspections');

            AppNotification::notifyRoles(
                ['Admin', 'Planning Officer'],
                'Field Inspections Synced',
                'Successfully pulled the latest completed site inspections from FieldSync.',
                'inspection_completed',
                '/site-inspections'
            );

            return back()->with('success', 'Successfully pulled the latest completed inspections from Supabase.');
        } catch (\Exception $e) {
            return back()->with('error', 'Failed to sync with Supabase: ' . $e->getMessage());
        }
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

        // Same per-application round identity as the list, so the detail page
        // never has to infer it from the raw inspection id.
        $rounds = $this->roundNumbersByApplication(collect([$inspection]));
        $round = $rounds[$inspection->id] ?? 1;

        $inspection->round_number = $round;
        $inspection->round_kind = $round === 1 ? 'Original Inspection' : 'Reinspection';
        $inspection->display_status = $this->displayStatus((string) $inspection->status);
        $inspection->display_reference = $inspection->zoningApplication?->reference_number
            ?: ('Application #' . $inspection->zoning_application_id);

        return Inertia::render('Site Inspections/Show', [
            'inspection' => $inspection,
        ]);
    }
}
