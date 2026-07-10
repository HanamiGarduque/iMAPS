<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Models\TechnicalReview;
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
                'zoning_applications.street_address',
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

        if ($request->filled('search'))
            $query->where(function ($q) use ($request) {
                $q->whereILike('zoning_applications.applicant_name', '%' . $request->search . '%')
                    ->orWhereILike('zoning_applications.reference_number', '%' . $request->search . '%');
            });

        $applications = $query
            ->orderByDesc('zoning_applications.created_at')
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
            'land_use_class'      => 'required|string',
            'purpose'             => 'required|string',
            'applicant_name'      => 'required|string|max:255',
            'contact_number'      => ['required', 'regex:/^9\d{9}$/'],
            'email'               => 'nullable|email',
            'representative_name' => 'nullable|string|max:255',
            'barangay'            => 'required|string',
            'street_address'      => 'nullable|string',
            'assessment_fee'      => 'required|numeric|min:0',
            'or_number'           => 'nullable|string',
            'remarks'             => 'nullable|string',

            // Multi-parcel payload. At least one parcel is required per application.
            'parcels'                  => 'required|array|min:1',
            'parcels.*.parcel_code'    => 'nullable|string|max:20',
            'parcels.*.property_index_number'   => 'required|string|max:100', // <-- ADD THIS
            'parcels.*.lot_number'     => 'nullable|string|max:100',
            'parcels.*.tct_number'     => 'nullable|string|max:100',
            'parcels.*.tax_dec_number' => 'nullable|string|max:100',
            'parcels.*.lot_area_sqm'       => 'nullable|numeric|min:0',
            'parcels.*.coordinates'    => ['nullable', 'regex:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/'],
        ]);

        // Generate reference number
        $referenceNumber = $this->generateReferenceNumber(
            $validated['application_type'],
            now()->toDateString()
        );

        DB::beginTransaction();
        try {
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
                'street_address'      => $validated['street_address'] ?? null,
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
                    'lot_number'            => $parcelData['lot_number'] ?? null,
                    'tct_number'            => $parcelData['tct_number'] ?? null,
                    'tax_dec_number'        => $parcelData['tax_dec_number'] ?? null,
                    'lot_area_sqm'              => $parcelData['lot_area_sqm'] ?? null,
                    'latitude'              => $lat,
                    'longitude'             => $lng,
                    'land_use_class'        => $validated['land_use_class'],
                    'property_index_number' => $parcelData['property_index_number'] ?? null,
                ]);
            }

            // SMSNotifier::applicationCreated(
            //     $application->contact_number,
            //     $application->reference_number,
            //     $application->applicant_name
            // );

            ApplicationStatusTracker::log(
                $application->reference_number,
                $application->applicant_name,
                $application->status
            );

            AuditLogger::log(
                applicationId: $application->id,
                action: 'APPLICATION_CREATED',
                performedBy: Auth::id(),
                note: sprintf('Application encoded by staff with %d parcel(s).', count($validated['parcels']))
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
    // SHOW — View single application, its parcels, and its technical review history
    // ─────────────────────────────────────────────────────────────────────────
    public function show(int $id)
    {
        $application = ZoningApplication::query()
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->select('zoning_applications.*', 'users.name as encoded_by_name')
            ->where('zoning_applications.id', $id)
            ->firstOrFail();

        $parcels = Parcel::where('zoning_application_id', $id)
            ->orderBy('parcel_code')
            ->get();

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
            'parcels'          => $parcels,
            'technicalReviews' => $technicalReviews,
            'auditTrail'       => $auditTrail,
            'statusOrder'      => self::STATUS_ORDER,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // TECHNICAL REVIEW — Record a review decision: Approved, Needs Site
    // Inspection, or Declined. This is the only path that can move an
    // application out of the "Technical Review" status.
    // ─────────────────────────────────────────────────────────────────────────
    public function submitTechnicalReview(Request $request)
    {
        if (!in_array(Auth::user()->role, ['Planning Officer', 'Admin'], true)) {
            return back()->withErrors(['auth' => 'You are not authorized to perform this action.']);
        }

        $validated = $request->validate([
            'zoning_application_id' => 'required|integer|exists:zoning_applications,id',
            'decision'              => 'required|in:' . implode(',', self::REVIEW_DECISIONS),
            'zoning_compliant'      => 'nullable|boolean',
            'documents_complete'    => 'nullable|boolean',
            'land_use_compliant'    => 'nullable|boolean',
            'findings'              => 'nullable|string',
            'decision_reason'       => 'required_if:decision,Declined|nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $application = ZoningApplication::findOrFail($validated['zoning_application_id']);

            if ($application->status !== 'Technical Review') {
                DB::rollBack();
                return back()->withErrors(['status' => 'This application is not currently in Technical Review.']);
            }

            $nextRound = (TechnicalReview::where('zoning_application_id', $application->id)->max('review_round') ?? 0) + 1;

            TechnicalReview::create([
                'zoning_application_id' => $application->id,
                'reviewed_by'           => Auth::id(),
                'review_round'          => $nextRound,
                'decision'              => $validated['decision'],
                'zoning_compliant'      => $validated['zoning_compliant'] ?? null,
                'documents_complete'    => $validated['documents_complete'] ?? null,
                'land_use_compliant'    => $validated['land_use_compliant'] ?? null,
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
                SmsNotifier::applicationDenied(
                    $application->contact_number,
                    $application->reference_number,
                    $validated['decision_reason']
                );
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
}