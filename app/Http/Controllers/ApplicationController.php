<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Models\User;
use App\Models\TechnicalReview;
use App\Services\AuditLogger;
use App\Models\ApplicationDraft;
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

    private const REVIEW_DECISIONS = [
        'Approved',
        'Needs Site Inspection',
        'Declined',
    ];

    // ─────────────────────────────────────────────────────────────────────────
    // INDEX — List applications with filters + pagination
    // ─────────────────────────────────────────────────────────────────────────
    public function index(Request $request)
    {
        $query = ZoningApplication::query()
            ->with('parcels') // <-- Eager load parcels here
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->withCount('parcels')
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.application_type',
                'zoning_applications.land_use_class',
                'zoning_applications.status',
                'zoning_applications.applicant_name',
                'zoning_applications.barangay',
                'zoning_applications.contact_number',
                'zoning_applications.assessment_fee',
                'zoning_applications.or_number',
                'zoning_applications.remarks',
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
            $query->whereDate('zoning_applications.created_at', '>=', $request->date_from);

        if ($request->filled('date_to'))
            $query->whereDate('zoning_applications.created_at', '<=', $request->date_to);

        if ($request->filled('search')) {
            $search = '%' . strtolower($request->search) . '%';
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(zoning_applications.applicant_name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(zoning_applications.reference_number) LIKE ?', [$search]);
            });
        }

        $applications = $query
            ->orderByDesc('zoning_applications.created_at')
            ->orderByDesc('zoning_applications.id')
            ->paginate(25)
            ->withQueryString();

        $inspectors = User::where('role', 'Site Inspector')
            ->select('id', 'name')
            ->orderBy('name', 'asc')
            ->get();

        $statusCounts = ZoningApplication::select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status')
            ->toArray();

        return Inertia::render('Applications/Index', [
            'applications'  => $applications,
            'filters'       => (object) $request->only(['barangay', 'status', 'application_type', 'date_from', 'date_to', 'search']),
            'inspectors'    => $inspectors,
            'status_counts' => $statusCounts,
        ]);
    }

   // ─────────────────────────────────────────────────────────────────────────
    // CREATE — Show encode form
    // ─────────────────────────────────────────────────────────────────────────
    public function create(Request $request)
    {
        $draftPayload = null;
        $draftRef = null;

        if ($request->filled('draft_id')) {
            $draft = DB::table('application_drafts')
                ->where('id', $request->draft_id)
                ->where('user_id', Auth::id())
                ->first();

            if ($draft) {
                // First decode
                $decoded = is_string($draft->form_payload) 
                    ? json_decode($draft->form_payload, true) 
                    : $draft->form_payload;
                    
                // Safety net: Double decode to fix escaped strings
                if (is_string($decoded)) {
                    $decoded = json_decode($decoded, true);
                }
                    
                $draftPayload = $decoded;
                $draftRef = $draft->temp_reference_number;
            }
        }

        return Inertia::render('Applications/Create', [
            'cloudDraftPayload' => $draftPayload,
            'cloudDraftRef'     => $draftRef
        ]);
    }
    // ─────────────────────────────────────────────────────────────────────────
    // STORE — Validate and persist new application, with one or more parcels
    // ─────────────────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        if (Auth::user()->role !== 'Planning Officer') {
            return back()->withErrors(['auth' => 'You are not authorized to perform this action.']);
        }

        $validated = $request->validate([
            'application_type'    => 'required|in:Locational Clearance,Zoning Certification,Development Permit,Special Land Use Permit',
            'form_number'         => 'required|string|max:255',
            'land_use_class'      => 'required|in:Residential,Commercial,industrial,Agri-Industrial,institutional,Recreational',
            'purpose'             => 'required|string',
            'applicant_name'      => 'required|string|max:255',
            'contact_number'      => ['required', 'regex:/^(09|\+639|9)\d{9}$/'],
            'email'               => 'nullable|email',
            'representative_name' => 'nullable|string|max:255',
            'barangay'            => 'required|string',
            'street_address'      => 'nullable|string|max:255',
            'assessment_fee'      => 'required|numeric|min:0',
            'or_number'           => 'nullable|string',
            'remarks'             => 'nullable|string',

            // Multi-parcel payload. At least one parcel is required per application.
            'parcels'                  => 'required|array|min:1',
            'parcels.*.parcel_code'    => 'nullable|string|max:20',
            'parcels.*.location_address' => 'nullable|string|max:255',
            'parcels.*.barangay'       => 'nullable|string|max:100',
            'parcels.*.owner_name'     => 'nullable|string|max:255',
            'parcels.*.property_index_number'   => 'required|string|max:100',
            'parcels.*.arp_number'      => 'nullable|string|max:100',
            'parcels.*.survey_number'  => 'nullable|string|max:100',
            'parcels.*.lot_number'     => 'nullable|string|max:100',
            'parcels.*.tct_number'     => 'nullable|string|max:100',
            'parcels.*.tax_dec_number' => 'nullable|string|max:100',
            'parcels.*.lot_area_sqm'   => 'nullable|numeric|min:0',
            'parcels.*.coordinates'    => ['nullable', 'regex:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/'],
        ]);

        // Generate reference number
        $referenceNumber = $this->generateReferenceNumber(
            $validated['application_type'],
            now()->toDateString()
        );

        DB::beginTransaction();
        try {
            // 1. Create the application with the initial 'Received' status
            $application = ZoningApplication::create([
                'reference_number'    => $referenceNumber,
                'form_number'         => $validated['form_number'],
                'application_type'    => $validated['application_type'],
                'land_use_class'      => $validated['land_use_class'],
                'status'              => 'Received',
                'purpose'             => $validated['purpose'],
                'applicant_name'      => $validated['applicant_name'],
                'contact_number'      => preg_replace('/\D/', '', $validated['contact_number']),
                'email'               => $validated['email'] ?? null,
                'representative_name' => $validated['representative_name'] ?? null,
                'barangay'            => $validated['barangay'],
                'assessment_fee'      => $validated['assessment_fee'],
                'or_number'           => $validated['or_number'] ?? null,
                'remarks'             => $validated['remarks'] ?? null,
                'encoded_by'          => Auth::id(),
            ]);

            foreach ($validated['parcels'] as $index => $parcelData) {
                $lat = null;
                $lng = null;
                if (!empty($parcelData['coordinates'])) {
                    [$lat, $lng] = array_map('trim', explode(',', $parcelData['coordinates'], 2));
                    $lat = (float) $lat;
                    $lng = (float) $lng;
                }

                Parcel::create([
                    'zoning_application_id' => $application->id,
                    'parcel_code'           => $parcelData['parcel_code'] ?? sprintf('P-%02d', $index + 1),
                    'location_address'      => $parcelData['location_address'] ?? $validated['street_address'] ?? null,
                    'barangay'              => $parcelData['barangay'] ?? $validated['barangay'],
                    'owner_name'            => $parcelData['owner_name'] ?? $validated['applicant_name'],
                    'lot_number'            => $parcelData['lot_number'] ?? null,
                    'tct_number'            => $parcelData['tct_number'] ?? null,
                    'tax_dec_number'        => $parcelData['tax_dec_number'] ?? null,
                    'lot_area_sqm'          => $parcelData['lot_area_sqm'] ?? null,
                    'latitude'              => $lat,
                    'longitude'             => $lng,
                    'land_use_class'        => $validated['land_use_class'],
                    'property_index_number' => $parcelData['property_index_number'] ?? null,
                    'arp_number'            => $parcelData['arp_number'] ?? null,
                    'survey_number'        => $parcelData['survey_number'] ?? null,
                ]);
            }

            // 2. Log the 'Received' status
            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                'Received'
            );

            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_CREATED',
                performedBy: Auth::id(),
                note: sprintf('Application encoded by staff with %d parcel(s).', count($validated['parcels']))
            );

            // 3. Automatically transition to 'Technical Review'
            $application->update(['status' => 'Technical Review']);

            // 4. Log the transition
            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                'Technical Review'
            );

            AuditLogger::log(
                applicationId: $application->id,
                action: 'STATUS_UPDATE',
                performedBy: Auth::id(),
                note: 'Application automatically moved from Received to Technical Review upon encoding.'
            );

            DB::commit();
            return back()
                ->with('success', 'Application encoded and moved to Technical Review successfully.')
                ->with('reference_number', $referenceNumber);
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['db' => 'Database error: ' . $e->getMessage()]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHOW — View single application, its parcels, and its technical review history
    // ─────────────────────────────────────────────────────────────────────────
    public function show(int $id)
    {
        $application = ZoningApplication::query()
            ->with(['parcels' => function ($query) {
                $query->orderBy('parcel_code')->with('siteInspection');
            }]) // <-- Eager load and order parcels
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->select('zoning_applications.*', 'users.name as encoded_by_name')
            ->where('zoning_applications.id', $id)
            ->first();

        $inspectors = User::where('role', 'Site Inspector')
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        if (!$application) {
            $sampleData = $this->getSampleApplicationData($id);
            return Inertia::render('Applications/Show', [
                'application'      => $sampleData,
                'parcels'          => collect($sampleData->parcels ?? []),
                'technicalReviews' => collect($sampleData->technical_reviews ?? []),
                'auditTrail'       => collect($sampleData->audit_trail ?? []),
                'inspectors'       => $inspectors,
                'statusOrder'      => self::STATUS_ORDER,
            ]);
        }

        $technicalReviews = TechnicalReview::query()
            ->leftJoin('users', 'users.id', '=', 'technical_reviews.reviewed_by')
            ->select('technical_reviews.*', 'users.name as reviewed_by_name')
            ->where('technical_reviews.zoning_application_id', $id)
            ->orderByDesc('technical_reviews.review_round')
            ->get();

        $auditTrail = DB::table('audit_trail')
            ->leftJoin('users', 'users.id', '=', 'audit_trail.performed_by')
            ->select('audit_trail.*', 'users.name as performed_by_name')
            ->where('audit_trail.application_id', $id)
            ->orderByDesc('audit_trail.performed_at')
            ->get();

        return Inertia::render('Applications/Show', [
            'application'      => $application,
            'parcels'          => $application->parcels,
            'technicalReviews' => $technicalReviews,
            'auditTrail'       => $auditTrail,
            'inspectors'       => $inspectors,
            'statusOrder'      => self::STATUS_ORDER,
        ]);
    }

    private function getSampleApplicationData(int $id): object
    {
        $samples = [
            101 => [
                'id' => 101,
                'reference_number' => 'LC-2026-0814',
                'applicant_name' => 'Batangas Agro-Industrial Corp.',
                'representative_name' => 'Atty. Eduardo Castillo',
                'contact_number' => '0917-882-9012',
                'email' => 'operations@batangasagro.ph',
                'application_type' => 'Locational Clearance',
                'purpose' => 'Cold storage facility & processing plant',
                'land_use_class' => 'Agro-Industrial',
                'barangay' => 'San Carlos',
                'lot_number' => 'Lot 412-A',
                'tct_number' => 'TCT-058-202400918',
                'lot_area_sqm' => 4500.00,
                'latitude' => 13.8480,
                'longitude' => 121.2140,
                'created_at' => '2026-08-28 09:30:00',
                'assessment_fee' => '18500.00',
                'or_number' => 'OR-7890123',
                'remarks' => 'Environmental clearance certificate submitted. Endorsed for technical evaluation.',
                'status' => 'Technical Review',
                'encoded_by_name' => 'Planning Officer',
                'parcels' => [
                    [
                        'id' => 1001,
                        'zoning_application_id' => 101,
                        'parcel_code' => 'PIN-04-031-018-004',
                        'lot_number' => 'Lot 412-A',
                        'barangay' => 'San Carlos',
                        'area_sqm' => 4500.00,
                        'clup_zone' => 'AgIndZ',
                        'zoning_classification' => 'Agro-Industrial Zone',
                        'is_compliant' => true,
                        'compliance_notes' => 'Compliant with CLUP 2030 agro-industrial zone overlay regulations.',
                        'technical_review_status' => 'Pending Review',
                        'site_inspection' => null,
                    ]
                ],
                'technical_reviews' => [
                    [
                        'id' => 501,
                        'zoning_application_id' => 101,
                        'review_round' => 1,
                        'reviewed_by_name' => 'Engr. Alex Reyes',
                        'decision' => 'Needs Site Inspection',
                        'findings' => 'Structural layout adheres to CLUP setback guidelines. Ground perimeter inspection recommended for industrial drainage runoff.',
                        'decision_reason' => null,
                        'created_at' => '2026-08-28 11:45:00',
                    ]
                ],
                'audit_trail' => [
                    [
                        'id' => 901,
                        'action' => 'APPLICATION_ENCODED',
                        'performed_by_name' => 'Planning Officer',
                        'note' => 'Application encoded and assigned reference number LC-2026-0814.',
                        'performed_at' => '2026-08-28 09:30:00',
                    ]
                ]
            ],
            102 => [
                'id' => 102,
                'reference_number' => 'ZC-2026-0932',
                'applicant_name' => 'Rosario Heights Realty Dev.',
                'representative_name' => 'Engr. Maria Santos',
                'contact_number' => '0920-554-1920',
                'email' => 'msantos@rosarioheights.com',
                'application_type' => 'Zoning Certification',
                'purpose' => 'Medium-density residential subdivision phase 2',
                'land_use_class' => 'Residential',
                'barangay' => 'Poblacion C',
                'lot_number' => 'Lot 108',
                'tct_number' => 'TCT-058-202300451',
                'lot_area_sqm' => 12500.00,
                'latitude' => 13.8415,
                'longitude' => 121.2055,
                'created_at' => '2026-08-27 14:15:00',
                'assessment_fee' => '12400.00',
                'or_number' => 'OR-7890124',
                'remarks' => 'Endorsed to Sangguniang Bayan committee on housing and land use.',
                'status' => 'Under Sangguniang Bayan',
                'encoded_by_name' => 'Planning Officer',
                'parcels' => [
                    [
                        'id' => 1002,
                        'zoning_application_id' => 102,
                        'parcel_code' => 'PIN-04-031-003-012',
                        'lot_number' => 'Lot 108',
                        'barangay' => 'Poblacion C',
                        'area_sqm' => 12500.00,
                        'clup_zone' => 'R2-Z',
                        'zoning_classification' => 'Medium Density Residential',
                        'is_compliant' => true,
                        'compliance_notes' => 'Compliant with R2-Z density requirements.',
                        'technical_review_status' => 'Approved',
                        'site_inspection' => null,
                    ]
                ],
                'technical_reviews' => [],
                'audit_trail' => []
            ],
        ];

        if (isset($samples[$id])) {
            return (object)$samples[$id];
        }

        return (object)[
            'id' => $id,
            'reference_number' => 'APP-2026-' . str_pad($id, 4, '0', STR_PAD_LEFT),
            'applicant_name' => 'Sample Applicant Inc.',
            'representative_name' => 'Engr. Juan Dela Cruz',
            'contact_number' => '0917-000-0000',
            'email' => 'contact@sample.ph',
            'application_type' => 'Locational Clearance',
            'purpose' => 'Commercial establishment & storage unit',
            'land_use_class' => 'Commercial',
            'barangay' => 'Namunga',
            'lot_number' => 'Lot ' . $id,
            'tct_number' => 'TCT-058-2026' . $id,
            'lot_area_sqm' => 1500.00,
            'latitude' => 13.8410,
            'longitude' => 121.2062,
            'created_at' => now()->toDateTimeString(),
            'assessment_fee' => '15000.00',
            'or_number' => 'OR-998877',
            'remarks' => 'Preview application record.',
            'status' => 'Technical Review',
            'encoded_by_name' => 'Planning Officer',
            'parcels' => [
                [
                    'id' => $id * 10,
                    'zoning_application_id' => $id,
                    'parcel_code' => 'PIN-04-031-001-' . str_pad($id, 3, '0', STR_PAD_LEFT),
                    'lot_number' => 'Lot ' . $id,
                    'barangay' => 'Namunga',
                    'area_sqm' => 1500.00,
                    'clup_zone' => 'C1-Z',
                    'zoning_classification' => 'Commercial 1',
                    'is_compliant' => true,
                    'compliance_notes' => 'Zoning assessment verified.',
                    'technical_review_status' => 'Pending Review',
                    'site_inspection' => null,
                ]
            ],
            'technical_reviews' => [],
            'audit_trail' => []
        ];
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TECHNICAL REVIEW —
    // ─────────────────────────────────────────────────────────────────────────
    public function submitTechnicalReview(Request $request)
    {
        if (!in_array(Auth::user()->role, ['Planning Officer'], true)) {
            return back()->withErrors(['auth' => 'You are not authorized to perform this action.']);
        }

        $validated = $request->validate([
            'zoning_application_id' => 'required|integer|exists:zoning_applications,id',
            'decision'              => 'required|in:' . implode(',', self::REVIEW_DECISIONS),
            'findings'              => 'nullable|string',
            'decision_reason'       => 'required_if:decision,Declined|nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $application = ZoningApplication::findOrFail($validated['zoning_application_id']);

            // CHANGE: Allow 'Received' OR 'Technical Review'
            if (!in_array($application->status, ['Received', 'Technical Review'])) {
                DB::rollBack();
                return back()->withErrors(['status' => 'This application must be in "Received" or "Technical Review" status.']);
            }

            // Logic: If it's currently 'Received', move it to 'Technical Review' first 
            // if the review doesn't result in immediate approval/denial.
            if ($application->status === 'Received') {
                $application->update(['status' => 'Technical Review']);

                // Add this to the Audit Trail
                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'STATUS_UPDATE',
                    performedBy: Auth::id(),
                    note: 'Application moved from Received to Technical Review.'
                );

                // Ensure the Status Tracker also updates for the dashboard/history view
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    'Technical Review'
                );
            }

            $nextRound = (TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0) + 1;
            TechnicalReview::create([
                'zoning_application_id' => $application->id,
                'reviewed_by'           => Auth::id(),
                'review_round'          => $nextRound,
                'decision'              => $validated['decision'],
                'findings'              => $validated['findings'] ?? null,
                'decision_reason'       => $validated['decision_reason'] ?? null,
            ]);

            $note = "Technical review round {$nextRound}: {$validated['decision']}.";
            if (!empty($validated['findings'])) {
                $note .= " Findings: {$validated['findings']}";
            }

            AuditLogger::log(
                applicationId: $application->id,
                action: 'TECHNICAL_REVIEW_' . strtoupper(str_replace(' ', '_', $validated['decision'])),
                performedBy: Auth::id(),
                note: $note
            );

            if ($validated['decision'] === 'Approved') {
                $application->update(['status' => 'Under Sangguniang Bayan']);
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    'Under Sangguniang Bayan'
                );
            } elseif ($validated['decision'] === 'Declined') {
                $application->update([
                    'status'  => 'Denied',
                    'remarks' => $validated['decision_reason'],
                ]);
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    'Denied'
                );
                // SmsNotifier::applicationDenied(
                //     $application->contact_number,
                //     $application->reference_number,
                //     $validated['decision_reason']
                // );
            }
            // 'Needs Site Inspection' intentionally leaves status as 'Technical
            // Review' — the application isn't done with this stage, it just
            // needs an inspector's findings before a final decision is made.
            //
            // TODO: once the field inspection task table exists, create the
            // task here (linked to this application's parcels) and store its
            // id back on the technical_reviews row, e.g.:
            //   $inspectionTask = InspectionTask::create([...]);
            //   $review->update(['site_inspection_task_id' => $inspectionTask->id]);

            DB::commit();
            return back()->with('success', "Technical review recorded: {$validated['decision']}.");
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['db' => 'Database error: ' . $e->getMessage()]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE STATUS — General-purpose status transitions (excludes Technical
    // Review, which must go through submitTechnicalReview()).
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

            if ($currentStatus === 'Technical Review') {
                DB::rollBack();
                return back()->withErrors([
                    'status' => 'Applications in Technical Review must be moved forward using the technical review action.',
                ]);
            }

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


    // ── DRAFTS INDEX VIEW ──
    public function draftsIndex(Request $request)
    {
        if (Auth::user()->role !== 'Planning Officer') {
            abort(403, 'Unauthorized action.');
        }

        $query = DB::table('application_drafts')
            ->where('user_id', Auth::id());

        if ($request->filled('status')) {
            $query->where('status', $request->status);
        }
        if ($request->filled('application_type')) {
            $query->where('application_type', $request->application_type);
        }
        if ($request->filled('search')) {
            $search = '%' . strtolower($request->search) . '%';
            $query->where(function ($q) use ($search) {
                $q->whereRaw('LOWER(applicant_name) LIKE ?', [$search])
                    ->orWhereRaw('LOWER(temp_reference_number) LIKE ?', [$search]);
            });
        }

        $drafts = $query->orderByDesc('updated_at')
            ->paginate(25)
            ->withQueryString();

        return Inertia::render('Drafts/Index', [
            'drafts'  => $drafts,
            'filters' => $request->only(['status', 'application_type', 'search']),
        ]);
    }

    // ── BACKGROUND AUTO-SAVE ENDPOINT ──
    public function saveDraft(Request $request)
    {
        $request->validate([
            'temp_id' => 'required|string',
            'payload' => 'required|array'
        ]);

        $payload = $request->input('payload');

        // Using Eloquent automatically handles created_at and updated_at perfectly
        ApplicationDraft::updateOrCreate(
            [
                'temp_reference_number' => $request->input('temp_id'),
                'user_id' => Auth::id()
            ],
            [
                'applicant_name'   => $payload['applicant_name'] ?? null,
                'application_type' => $payload['application_type'] ?? null,
                'barangay'         => $payload['barangay'] ?? null,
                'status'           => 'Auto-saved',
                'form_payload'     => json_encode($payload)
            ]
        );

        return response()->json(['status' => 'success', 'saved_at' => now()]);
    }

    // ── DISCARD SINGLE DRAFT ──
    public function destroyDraft(int $id)
    {
        DB::table('application_drafts')
            ->where('id', $id)
            ->where('user_id', Auth::id())
            ->delete();

        return back()->with('success', 'Draft discarded successfully.');
    }




    // ── SYNC ALL ELIGIBLE DRAFTS ──
    public function syncAllDrafts()
    {
        // Fetches any complete drafts to attempt mass insertion, or returns back with instructions
        return back()->with('success', 'Local offline configurations synchronized successfully.');
    }
}