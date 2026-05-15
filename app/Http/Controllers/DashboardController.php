<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class DashboardController extends Controller
{
    public function index()
    {
        
        return Inertia::render('Dashboard', [
            'userName'  => Auth::user()->name,
            'userRole'  => Auth::user()->role,
            'total'     => ZoningApplication::count(),
            'thisMonth' => ZoningApplication::countThisMonth(),
            'statusMap' => ZoningApplication::byStatus(),
            'recent'    => ZoningApplication::recentApplications(),
            'bgyStats'  => ZoningApplication::barangayStats(),
        ]);
    }
}