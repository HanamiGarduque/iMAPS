<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Services\AuditLogger;
use App\Models\ApplicationSequence;
use App\Services\ApplicationStatusTracker;
use App\Services\SmsNotifier;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;

class ApplicationController extends Controller
{
    private const STATUS_ORDER = [
        'Received'                => 0,
        'Technical Review'        => 1,
        'Under Sangguniang Bayan' => 2,
        'For Release'             => 3,
        'Released'                => 4,
        'Denied'                  => 5,
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // INDEX — List applications with filters + pagination
    // ─────────────────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $query = ZoningApplication::query()
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.date_of_application',
                'zoning_applications.application_type',
                'zoning_applications.land_use_class',      // ← add
                'zoning_applications.status',
                'zoning_applications.applicant_name',
                'zoning_applications.barangay',
                'zoning_applications.street_address',      // ← add
                'zoning_applications.lot_number',          // ← add
                'zoning_applications.tct_number',          // ← add
                'zoning_applications.area_sqm',            // ← add
                'zoning_applications.contact_number',      // ← add
                'zoning_applications.latitude',            // ← add
                'zoning_applications.longitude',           // ← add
                'zoning_applications.assessment_fee',
                'zoning_applications.or_number',           // ← add
                'zoning_applications.remarks',             // ← add
                'zoning_applications.created_at',
                'users.name as encoded_by_name'
            );

        if ($request->filled('barangay'))
            $query->where('zoning_applications.barangay', $request->barangay);

        if ($request->filled('status'))
            $query->where('zoning_applications.status', $request->status);

        if ($request->filled('application_type'))
            $query->where('zoning_applications.application_type', $request->application_type);

        if ($request->filled('date_from'))
            $query->where('zoning_applications.date_of_application', '>=', $request->date_from);

        if ($request->filled('date_to'))
            $query->where('zoning_applications.date_of_application', '<=', $request->date_to);

        if ($request->filled('search'))
            $query->where(function ($q) use ($request) {
                $q->whereILike('zoning_applications.applicant_name', '%' . $request->search . '%')
                    ->orWhereILike('zoning_applications.reference_number', '%' . $request->search . '%');
            });

        $applications = $query
            ->orderByDesc('zoning_applications.date_of_application')
            ->orderByDesc('zoning_applications.id')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Applications/Index', [
            'applications' => $applications,
            'filters'      => $request->only(['barangay', 'status', 'application_type', 'date_from', 'date_to', 'search']),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // CREATE — Show encode form
    // ─────────────────────────────────────────────────────────────────────────
    public function create()
    {
        return Inertia::render('Applications/Create');
        // auth is shared globally via HandleInertiaRequests middleware
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STORE — Validate and persist new application
    // ─────────────────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        if (Auth::user()->role !== 'Planning Officer') {
            return back()->withErrors(['auth' => 'You are not authorized to perform this action.']);
        }

        $validated = $request->validate([
            'date_of_application' => 'required|date|before_or_equal:today',
            'application_type'    => 'required|in:Locational Clearance,Zoning Certification,Development Permit,Special Land Use Permit',
            'land_use_class'      => 'required|string',
            'purpose'             => 'required|string',
            'applicant_name'      => 'required|string|max:255',
            'contact_number'      => ['required', 'regex:/^9\d{9}$/'],
            'email'               => 'nullable|email',
            'representative_name' => 'nullable|string|max:255',
            'barangay'            => 'required|string',
            'street_address'      => 'nullable|string',
            'lot_number'          => 'nullable|string',
            'tct_number'          => 'nullable|string',
            'area_sqm'            => 'nullable|numeric|min:0',
            'coordinates'         => ['nullable', 'regex:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/'],
            'assessment_fee'      => 'required|numeric|min:0',
            'or_number'           => 'nullable|string',
            'remarks'             => 'nullable|string',
        ]);

        // Parse coordinates
        $lat = null;
        $lng = null;
        if (!empty($validated['coordinates'])) {
            [$lat, $lng] = array_map('trim', explode(',', $validated['coordinates'], 2));
            $lat = (float) $lat;
            $lng = (float) $lng;
        }

        // Generate reference number
        $referenceNumber = $this->generateReferenceNumber(
            $validated['application_type'],
            $validated['date_of_application']
        );

        DB::beginTransaction();
        try {
            $application = ZoningApplication::create([
                'reference_number'    => $referenceNumber,
                'date_of_application' => $validated['date_of_application'],
                'application_type'    => $validated['application_type'],
                'land_use_class'      => $validated['land_use_class'],
                'status'              => 'Received',
                'purpose'             => $validated['purpose'],
                'applicant_name'      => $validated['applicant_name'],
                'contact_number'      => preg_replace('/\D/', '', $validated['contact_number']),
                'email'               => $validated['email'] ?? null,
                'representative_name' => $validated['representative_name'] ?? null,
                'barangay'            => $validated['barangay'],
                'street_address'      => $validated['street_address'] ?? null,
                'lot_number'          => $validated['lot_number'] ?? null,
                'tct_number'          => $validated['tct_number'] ?? null,
                'area_sqm'            => $validated['area_sqm'] ?? null,
                'latitude'            => $lat,
                'longitude'           => $lng,
                'assessment_fee'      => $validated['assessment_fee'],
                'or_number'           => $validated['or_number'] ?? null,
                'remarks'             => $validated['remarks'] ?? null,
                'encoded_by'          => Auth::id(),
            ]);

            SMSNotifier::applicationCreated(
                $application->contact_number,
                $application->reference_number,
                $application->applicant_name
            );

            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                $application->status
            );


            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_CREATED',
                performedBy: Auth::id(),
                note: 'Application encoded by staff.'
            );

            DB::commit();
            return back()
                ->with('success', 'Application encoded successfully. SMS message sent to the applicant')
                ->with('reference_number', $referenceNumber);
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['db' => 'Database error: ' . $e->getMessage()]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHOW — View single application
    // ─────────────────────────────────────────────────────────────────────────
    public function show(int $id)
    {
        $application = ZoningApplication::query()
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->select('zoning_applications.*', 'users.name as encoded_by_name')
            ->where('zoning_applications.id', $id)
            ->firstOrFail();

        $auditTrail = DB::table('audit_trail')
            ->leftJoin('users', 'users.id', '=', 'audit_trail.performed_by')
            ->select('audit_trail.*', 'users.name as performed_by_name')
            ->where('audit_trail.application_id', $id)
            ->orderByDesc('audit_trail.performed_at')
            ->get();

        return Inertia::render('Applications/Show', [
            'application' => $application,
            'auditTrail'  => $auditTrail,
            'statusOrder' => self::STATUS_ORDER,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE STATUS
    // ─────────────────────────────────────────────────────────────────────────
    public function updateStatus(Request $request)
    {
        $request->validate([
            'id'         => 'required|integer',
            'new_status' => 'required|string',
            'remarks'    => 'nullable|string',
        ]);

        $allowed = array_keys(self::STATUS_ORDER);
        if (!in_array($request->new_status, $allowed, true)) {
            return back()->withErrors(['status' => 'Invalid status.']);
        }

        DB::beginTransaction();
        try {
            $application = ZoningApplication::findOrFail($request->id);
            $currentStatus = $application->status;

            $transitionError = $this->getTransitionError($currentStatus, $request->new_status);
            if ($transitionError) {
                DB::rollBack();
                return back()->withErrors(['status' => $transitionError]);
            }

            $application->update(['status' => $request->new_status]);

            $note = "Status changed from \"{$currentStatus}\" to \"{$request->new_status}\"";
            if ($request->filled('remarks')) {
                $note .= ". Remarks: {$request->remarks}";
            }

            AuditLogger::log(
                applicationId: $application->id,
                action: 'STATUS_UPDATE',
                performedBy: Auth::id(),
                note: $note
            );
            
            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                $application->status
            );

            DB::commit();


            return back()->with('success', 'Status updated successfully.');
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['db' => 'Database error occurred.']);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVATE HELPERS
    // ─────────────────────────────────────────────────────────────────────────
    private function getTransitionError(string $from, string $to): ?string
    {
        if ($from === $to)
            return "Status is already \"{$from}\".";

        $fromRank = self::STATUS_ORDER[$from] ?? -1;
        $toRank   = self::STATUS_ORDER[$to]   ?? -1;

        if ($fromRank === -1 || $toRank === -1)
            return "Unrecognised status value.";

        if ($from === 'Released' || $from === 'Denied')
            return "Cannot change status of a \"{$from}\" application.";

        if ($to === 'Denied')
            return null;

        if ($toRank < $fromRank)
            return "Cannot revert status from \"{$from}\" back to \"{$to}\".";

        if ($toRank > $fromRank + 1) {
            $order = array_flip(self::STATUS_ORDER);
            $next  = $order[$fromRank + 1] ?? 'the next step';
            return "Cannot skip steps. Next allowed status is \"{$next}\".";
        }

        return null;
    }

    private function generateReferenceNumber(string $type, string $date): string
    {
        $typeCodes = [
            'Locational Clearance'    => 'LC',
            'Zoning Certification'    => 'ZC',
            'Development Permit'      => 'DP',
            'Special Land Use Permit' => 'SP',
        ];

        $code = $typeCodes[$type] ?? 'ZA';
        $year = (new \DateTime($date))->format('Y');
        $seq  = $this->getNextSequence($code, $year);

        return sprintf('%s-%s-%05d', $code, $year, $seq);
    }

    private function getNextSequence(string $typeCode, string $year): int
    {
        DB::table('application_sequences')->upsert(
            [
                'type_code' => $typeCode,
                'year'      => $year,
                'last_seq'  => 1,
            ],
            ['type_code', 'year'],
            ['last_seq' => DB::raw('application_sequences.last_seq + 1')]
        );

        return (int) DB::table('application_sequences')
            ->where('type_code', $typeCode)
            ->where('year', $year)
            ->value('last_seq');
    }
}
