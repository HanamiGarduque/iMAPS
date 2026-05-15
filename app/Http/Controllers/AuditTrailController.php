<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use App\Models\AuditTrail;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;

class AuditTrailController extends Controller
{
    public function index(Request $request)
{
    $logs = AuditTrail::withRelations()
        ->when($request->filled('search'), fn($q) => $q->search($request->search))
        ->when($request->filled('action'), fn($q) => $q->ofAction($request->action))
        ->orderByDesc('audit_trail.performed_at')
        ->paginate(20)
        ->withQueryString();

    return Inertia::render('AuditTrail/Index', [
        'logs'    => $logs,
        'actions' => AuditTrail::distinctActions(),
        'stats'   => AuditTrail::topStats(),
        'filters' => $request->only(['search', 'action']),
        'auth'    => ['user' => Auth::user()],
    ]);
}
}