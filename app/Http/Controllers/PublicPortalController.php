<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class PublicPortalController extends Controller
{
    private const PIPELINE = [
        'Received'                => 0,
        'Technical Review'        => 1,
        'Under Sangguniang Bayan' => 2,
        'For Release'             => 3,
        'Released'                => 4,
    ];

    public function index(Request $request)
    {
        $refInput = strtoupper(trim($request->input('ref', '')));
        $result   = null;
        $error    = null;

        if ($refInput !== '') {
            $result = DB::table('zoning_applications')
                ->whereRaw('UPPER(reference_number) = ?', [$refInput])
                ->select(
                    'reference_number',
                    'applicant_name',
                    'application_type',
                    'barangay',
                    'status',
                    'date_of_application',
                    'purpose',
                    'remarks',
                    'created_at'
                )
                ->first();

            if (!$result) {
                $error = 'No application found with that reference number. Please double-check and try again.';
            }
        }

        return Inertia::render('PublicPortal', [
            'refInput'     => $refInput,
            'result'       => $result,
            'error'        => $error,
            'pipeline'     => self::PIPELINE,
            'supabaseUrl'  => config('services.supabase.url'),
            'supabaseKey'  => config('services.supabase.anon_key'),
        ]);
    }
}
