<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index()
    {
        $total = ZoningApplication::count();
        $recent = ZoningApplication::recentApplications();

        // If no records in database yet, provide interactive sample recent applications
        if ($recent->isEmpty()) {
            $recent = collect([
                [
                    'id' => 101,
                    'reference_number' => 'LC-2026-0814',
                    'applicant_name' => 'Batangas Agro-Industrial Corp.',
                    'application_type' => 'Locational Clearance',
                    'status' => 'Technical Review',
                ],
                [
                    'id' => 102,
                    'reference_number' => 'ZC-2026-0932',
                    'applicant_name' => 'Rosario Heights Realty Dev.',
                    'application_type' => 'Zoning Certification',
                    'status' => 'Under Sangguniang Bayan',
                ],
                [
                    'id' => 103,
                    'reference_number' => 'DP-2026-0419',
                    'applicant_name' => 'Prime Meridian Commercial Hub',
                    'application_type' => 'Development Permit',
                    'status' => 'For Release',
                ],
                [
                    'id' => 104,
                    'reference_number' => 'LC-2026-0775',
                    'applicant_name' => 'Southpoint Grain Silo Corp.',
                    'application_type' => 'Locational Clearance',
                    'status' => 'Released',
                ],
            ]);
            $total = 10;
        }
        
        return Inertia::render('Dashboard', [
            'userName'  => Auth::user()->name,
            'userRole'  => Auth::user()->role,
            'total'     => $total,
            'thisMonth' => ZoningApplication::count() > 0 ? ZoningApplication::countThisMonth() : 3,
            'statusMap' => ZoningApplication::byStatus(),
            'recent'    => $recent,
            'bgyStats'  => ZoningApplication::barangayStats(),
        ]);
    }
}