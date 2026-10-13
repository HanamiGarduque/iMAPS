<?php

namespace App\Http\Controllers;

use App\Models\AuditTrail;
use Illuminate\Http\Request;
use Inertia\Inertia;

class AuditTrailController extends Controller
{
    public function index(Request $request)
    {
        $data = $request->validate([
            'search' => 'nullable|string|max:100',
            'action' => 'nullable|string|max:60',
        ]);

        $logs = AuditTrail::withRelations()
            ->when($data['search'] ?? null, fn ($q, $s) => $q->search($s))
            ->when($data['action'] ?? null, fn ($q, $a) => $q->ofAction($a))
            ->orderByDesc('audit_trail.performed_at')
            ->orderByDesc('audit_trail.id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('AuditTrail/Index', [
            'logs' => $logs,
            'actions' => AuditTrail::distinctActions(),
            'filters' => ['search' => $data['search'] ?? '', 'action' => $data['action'] ?? ''],
        ]);
    }
}
