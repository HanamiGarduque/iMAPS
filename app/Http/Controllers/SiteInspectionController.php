<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Inertia\Inertia;
use App\Models\SiteInspection;
use Illuminate\Support\Facades\Artisan;

class SiteInspectionController extends Controller
{
    /**
     * Display a listing of the site inspections.
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

        return Inertia::render('Site Inspections/Index', [
            'pendingInspections' => $pendingInspections,
            'completedInspections' => $completedInspections,
        ]);
    }

    /**
     * Force a sync from Supabase.
     */
    public function forceSync()
    {
        try {
            Artisan::call('sync:pull-inspections');
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

        return Inertia::render('Site Inspections/Show', [
            'inspection' => $inspection,
        ]);
    }
}
