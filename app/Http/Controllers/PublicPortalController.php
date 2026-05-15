<?php

namespace App\Http\Controllers;

use App\Services\SupabaseService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class PublicPortalController extends Controller
{
    public function __construct(private SupabaseService $supabase) {}

    public function index(Request $request)
{
    $refInput = strtoupper(trim($request->input('ref', '')));
    $result   = null;
    $error    = null;

    if ($refInput !== '') {
        $result = $this->supabase->getApplicationByReference($refInput);

        if (!$result) {
            $error = 'No application found with that reference number. Please double-check and try again.';
        }
    }

    return Inertia::render('PublicPortal', array_merge(
        [
            'refInput' => $refInput,
            'result'   => $result,
            'error'    => $error,
        ],
        $this->supabase->clientCredentials()
    ));
}
}