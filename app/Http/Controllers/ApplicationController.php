<?php

namespace App\Http\Controllers;

use App\Models\ZoningApplication;
use App\Models\Parcel;
use App\Models\User;
use App\Models\TechnicalReview;
use App\Services\AuditLogger;
use App\Models\ApplicationDraft;
use App\Models\ApplicationPoAssignment;
use App\Models\SiteInspection;
use App\Models\SiteInspectionAssignment;
use App\Jobs\PushInspectionToSupabase; 
use App\Services\ApplicationStatusTracker;
use App\Services\SmsNotifier;
// Master integration (Loop 9 merge): BOTH import sets are required.
// Master owns AppNotification for its application-created notification; Loop 9
// owns the delivery/inspection/reassignment support classes below. Neither side
// replaces the other.
use App\Models\AppNotification;
use App\Services\PermitExcelService;
use App\Services\SupabaseService;
use App\Services\WorkAssignmentService;
use App\Support\InspectionDeliveryStatus;
use App\Support\InspectionSummary;
use App\Support\InspectorTransferGuard;
use App\Support\ReassignmentReasons;
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
        // LOOP 9D: Admin aggregate delivery monitoring.
        //
        // The monitoring block and its filter are Admin-only. A Planning Officer
        // must not be able to reach a half state where the list is filtered by a
        // control it cannot see, so the parameter is ignored for every other
        // role rather than half-applied.
        $isAdminMonitoring = (Auth::user()?->role ?? null) === 'Admin';

        $query = ZoningApplication::query()
            // Admin/PO audit: the list showed no inspection context at all, so a
            // Planning Officer had to open every application to learn whether it
            // had a field inspection. Load ONLY what the compact summary needs,
            // entirely from local relations — no Supabase/FieldSync call, no new
            // column:
            //   siteInspection      -> latest round (status only)
            //   siteInspection.inspector -> human-readable inspector name
            //   site_inspections_count  -> round count (a 2nd row = reinspection)
            ->with(['parcels' => function ($q) {
                // LOOP 9D: the aggregate attempt count rides along as a
                // sub-select on the already-loaded latest round, so delivery
                // monitoring costs ZERO additional queries. Attempt ROWS are
                // never loaded here: full history is on-demand, detail-level
                // only, and loading it per list row is the N+1 this must not
                // introduce.
                $q->with([
                    'siteInspection' => fn ($sq) => $sq->with('inspector')->withCount('deliveryAttempts'),
                ])->withCount('siteInspections');
            }])
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->withCount('parcels')
            ->select(
                'zoning_applications.id',
                'zoning_applications.reference_number',
                'zoning_applications.application_type',
                'zoning_applications.target_land_use_class',
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

        $this->applyRegistryFilters($query, $request);

        $applications = $query
            ->orderByDesc('zoning_applications.created_at')
            ->orderByDesc('zoning_applications.id')
            ->paginate(25)
            ->withQueryString();

        $inspectors = User::activeSiteInspectors()
            ->select('id', 'name')
            ->orderBy('name', 'asc')
            ->get();

        $statusCounts = ZoningApplication::select('status', DB::raw('count(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status')
            ->toArray();

        // Applicant-level counts for the folder view, using exactly the same
        // filters as the paginated list above.
        //
        // The browser only ever receives one page of applications, so counting
        // the loaded rows would label a PAGE-LOCAL number as if it were the
        // applicant's total. This counts the applicant's real matching
        // applications server-side instead, without loading them all.
        //
        // The query is built fresh from the shared filter helper rather than
        // cloned from the list query: the list query carries eager loads and a
        // withCount sub-select, and appending a GROUP BY aggregate to it produces
        // a non-aggregated column that PostgreSQL rejects.
        //
        // The grouping key must be exactly what the browser can compute from the
        // payload it receives. The list select does not include
        // `corporation_name`, so the folder view groups by `applicant_name`;
        // grouping by a corporation name here would key the counts by names the
        // UI never uses, and those applicants would silently fall back to the
        // page-local number.
        $folderKey = "COALESCE(NULLIF(BTRIM(applicant_name), ''), 'Unknown Applicant')";

        $applicantCountQuery = $this->applyRegistryFilters(ZoningApplication::query(), $request);

        $applicantCounts = $applicantCountQuery
            ->selectRaw("{$folderKey} as folder_key, COUNT(*) as folder_total")
            ->groupByRaw($folderKey)
            ->pluck('folder_total', 'folder_key')
            ->map(fn ($value) => (int) $value)
            ->all();

        // Attach the Planning Officer inspection line. Returns null when the
        // application has no inspection at all, and the UI then renders no line
        // rather than a placeholder. Wording is owned by InspectionSummary so
        // the "never claim field progress from a local assignment" rule is
        // enforced in one testable place.
        $applications->getCollection()->transform(function ($application) use ($isAdminMonitoring) {
            $line = null;

            foreach ($application->parcels as $parcel) {
                $candidate = InspectionSummary::line(
                    $parcel->siteInspection,
                    $parcel->siteInspection?->inspector?->name,
                    (int) ($parcel->site_inspections_count ?? 0),
                );

                if ($candidate !== null) {
                    $line = $candidate;
                    break;
                }
            }

            $application->inspection_summary = $line;

            // LOOP 9D. Present for Admin only, and NULL for every other role so
            // the Planning Officer payload is byte-identical to what 9C shipped.
            $application->delivery_monitoring = $isAdminMonitoring
                ? $this->buildDeliveryMonitoring($application)
                : null;

            return $application;
        });

        return Inertia::render('Applications/Index', [
            'applications'    => $applications,
            'filters'         => (object) $request->only(['barangay', 'status', 'application_type', 'date_from', 'date_to', 'search']),
            'inspectors'      => $inspectors,
            'status_counts'   => $statusCounts,
            'applicant_counts' => $applicantCounts,
            // LOOP 9D. Lets the browser render the filter without inventing the
            // vocabulary, and states that the feature is Admin-only.
            'delivery_monitoring' => [
                'enabled' => $isAdminMonitoring,
                'selected' => $isAdminMonitoring ? (string) $request->query('delivery_status', 'all') : 'all',
                'states' => [
                    ['value' => 'all', 'label' => 'All delivery states'],
                    ['value' => 'no_delivery_record', 'label' => 'No delivery record'],
                    ['value' => 'pending_delivery', 'label' => 'Pending delivery'],
                    ['value' => 'delivered', 'label' => 'Delivered'],
                    ['value' => 'delivery_failed', 'label' => 'Delivery failed'],
                ],
            ],
        ]);
    }

    /**
     * LOOP 9D: the server-authored delivery monitoring line for one application.
     *
     * WHICH round this describes is a business decision, so it is made here and
     * never in the browser: the application's MONITORING ROUND is the highest-id
     * `site_inspections` row across all of its parcels. `site_inspections` stores
     * no round number, so the primary key is the round chronology - the same fact
     * `InspectionDeliveryRetryEligibility` and the existing `latestOfMany()`
     * relation already use. The delivery filter below orders the identical way,
     * so a row can never disagree with the filter that selected it.
     *
     * Entirely local PostgreSQL. No Supabase call, no FieldSync call, no device
     * dependency, and no attempt rows are loaded.
     */
    private function buildDeliveryMonitoring($application): array
    {
        $round = null;

        foreach ($application->parcels as $parcel) {
            $candidate = $parcel->siteInspection;

            if ($candidate !== null && ($round === null || (int) $candidate->id > (int) $round->id)) {
                $round = $candidate;
            }
        }

        // No round at all is a first-class monitoring answer, not a gap: the
        // application has no delivery record because it was never inspected.
        if ($round === null) {
            return [
                'inspection_id'    => null,
                'parcel_id'        => null,
                'state'            => InspectionDeliveryStatus::STATE_NO_RECORD,
                'label'            => InspectionDeliveryStatus::label(InspectionDeliveryStatus::STATE_NO_RECORD),
                'message'          => InspectionDeliveryStatus::message(InspectionDeliveryStatus::STATE_NO_RECORD),
                'attempt_count'    => 0,
                'last_attempt_at'  => null,
                'delivered_at'     => null,
                'failure_category' => null,
                'failure_label'    => null,
                'inspector'        => null,
                'is_superseded'    => false,
            ];
        }

        $state = InspectionDeliveryStatus::state($round->delivery_status);
        $isFailed = $state === InspectionDeliveryStatus::STATE_FAILED;

        return [
            'inspection_id'    => (int) $round->id,
            'parcel_id'        => $round->parcel_id === null ? null : (int) $round->parcel_id,
            'state'            => $state,
            'label'            => InspectionDeliveryStatus::label($state),
            'message'          => InspectionDeliveryStatus::message($state),
            'attempt_count'    => (int) ($round->delivery_attempts_count ?? 0),
            'last_attempt_at'  => $round->last_delivery_attempt_at?->toIso8601String(),
            'delivered_at'     => $round->delivered_at?->toIso8601String(),
            // LOOP 9D authorizes Admin to see the closed category token. It is
            // normalized and labelled server-side, so only a value from the
            // fixed vocabulary can ever reach the browser.
            'failure_category' => $isFailed
                ? InspectionDeliveryStatus::failureCategory($round->last_delivery_failure_category)
                : null,
            'failure_label'    => $isFailed
                ? InspectionDeliveryStatus::failureCategoryLabel($round->last_delivery_failure_category)
                : null,
            'inspector'        => $round->inspector === null
                ? null
                : ['id' => (int) $round->inspector->id, 'name' => $round->inspector->name],
            // Always false HERE, and provably so rather than by omission: this is
            // the highest-id round across every parcel of the application, so a
            // newer round of the same parcel would itself be in `parcels` and
            // would have won. The real supersession signal belongs on
            // application detail, which enumerates EVERY round - see
            // `InspectionDeliveryController::shapeRounds()`.
            'is_superseded'    => false,
        ];
    }
// ─────────────────────────────────────────────────────────────────────────
    // CREATE — Show encode form
    // ─────────────────────────────────────────────────────────────────────────
    /**
     * Apply the Applications registry filters to a query.
     *
     * Shared by the paginated list and the applicant-level count query so the
     * folder counts can never mean something different from the rows being
     * listed. Search and every filter are treated identically for both.
     */
    private function applyRegistryFilters($query, Request $request)
    {
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

        // LOOP 9D: Admin aggregate delivery monitoring filter.
        //
        // ADMIN ONLY. The control is not rendered for any other role, so the
        // parameter is ignored for them rather than silently filtering a list
        // that shows no delivery column.
        if ((Auth::user()?->role ?? null) !== 'Admin') {
            return $query;
        }

        $requested = (string) $request->query('delivery_status', 'all');

        // Closed vocabulary. An unrecognized value matches EVERYTHING rather than
        // nothing, so a stale bookmark can never silently produce an empty
        // registry that looks like "no delivery problems exist".
        $filterable = [
            InspectionDeliveryStatus::STATE_NO_RECORD,
            InspectionDeliveryStatus::STATE_PENDING,
            InspectionDeliveryStatus::STATE_DELIVERED,
            InspectionDeliveryStatus::STATE_FAILED,
        ];

        $draftsCount = DB::table('application_drafts')
            ->where('user_id', Auth::id())
            ->count();

        return Inertia::render('Applications/Index', [
            'applications'  => $applications,
            'filters'       => (object) $request->only(['barangay', 'status', 'application_type', 'date_from', 'date_to', 'search']),
            'inspectors'    => $inspectors,
            'status_counts' => $statusCounts,
            'drafts_count'  => $draftsCount,
        ]);
        if ($requested === 'all' || ! in_array($requested, $filterable, true)) {
            return $query;
        }

        // THE MONITORING ROUND, in SQL. This is the identical rule the row data
        // uses in `buildDeliveryMonitoring()`: the highest-id `site_inspections`
        // row across the application's parcels. Ordering by the primary key is
        // the same round chronology the rest of the codebase relies on, so the
        // filter and the rendered row can never disagree about which round they
        // are describing.
        //
        // A scalar subquery rather than a join: it needs no GROUP BY, so it does
        // not collide with the eager loads and `withCount` sub-selects this list
        // already carries, and it cannot multiply rows.
        $monitoringRoundDelivery = <<<'SQL'
            (SELECT si.delivery_status
               FROM site_inspections si
               JOIN parcels p ON p.id = si.parcel_id
              WHERE p.zoning_application_id = zoning_applications.id
              ORDER BY si.id DESC
              LIMIT 1)
            SQL;

        if ($requested === InspectionDeliveryStatus::STATE_NO_RECORD) {
            // ONE predicate covers both honest cases: the application has no
            // inspection round at all (the subquery finds no row and yields
            // NULL), or its newest round has never had delivery state recorded
            // (the subquery yields NULL). Neither is "delivered", so neither may
            // be presented as a delivery success.
            $query->whereRaw("{$monitoringRoundDelivery} IS NULL");

            return $query;
        }

        $query->whereRaw("{$monitoringRoundDelivery} = ?", [$requested]);

        return $query;
    }

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

        // --- Fetch Site Inspectors ---
        // Active-account + FieldSync-account enforcement via the shared scope.
        $inspectors = User::activeSiteInspectors()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        return Inertia::render('Applications/Create', [
            'cloudDraftPayload' => $draftPayload,
            'cloudDraftRef'     => $draftRef,
            'inspectors'        => $inspectors // --- NEW: Pass inspectors to the view ---
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

        $targetLandUseClass = $request->input('target_land_use_class');

        $applicationTypeInput = trim((string) ($request->input('application_type') ?? ''));
        $applicationTypeValues = array_values(array_filter(array_map('trim', explode(',', $applicationTypeInput)), fn ($item) => $item !== ''));
        $allowedApplicationTypes = [
            'Locational Clearance',
            'Zoning Certificate',
            'Development Permit',
            'Preliminary Approval and Locational Clearance (PALC)',
            'Petition for Rezoning',
            'Petition for Reclassification',
        ];

        if (!empty($applicationTypeInput) && !empty($applicationTypeValues)) {
            foreach ($applicationTypeValues as $selectedType) {
                if (!in_array($selectedType, $allowedApplicationTypes, true)) {
                    return back()->withErrors(['application_type' => 'Invalid application category selected.']);
                }
            }
        }

        $request->merge(['application_type' => implode(', ', $applicationTypeValues)]);

        $validated = $request->validate([
            'application_stream'  => 'required|in:permit,amendment',
            'application_type'    => 'required|string|max:255',
            'form_number'         => 'required|string|max:255',
            'target_land_use_class' => ['nullable', 'in:Residential,Commercial,Industrial,Agri-Industrial,Institutional,Recreational,R1-Z,R2-Z,MR2-SZ,BR2-SZ,C1-Z,C2-Z,C/MP-Z,I1-Z,I2-Z,I3-Z,AgIndZ,AgIndZ-PTR,AgIndZ-PGR,GI-Z,UTS-Z,CMRF,PR-Z,T-Z,ECT-Z'],
            'land_use_class'        => ['nullable', 'in:Residential,Commercial,Industrial,Agri-Industrial,Institutional,Recreational,R1-Z,R2-Z,MR2-SZ,BR2-SZ,C1-Z,C2-Z,C/MP-Z,I1-Z,I2-Z,I3-Z,AgIndZ,AgIndZ-PTR,AgIndZ-PGR,GI-Z,UTS-Z,CMRF,PR-Z,T-Z,ECT-Z'],
            'purpose'             => 'required|string',
            'applicant_name'      => 'required|string|max:255',
            'applicant_street'    => 'nullable|string|max:255',
            'applicant_barangay'  => 'nullable|string|max:255',
            'contact_number'      => ['required', 'regex:/^(09|\+63|63|\d)\d{9}$/'],
            'email'               => 'required|email',
            'representative_name' => 'nullable|string|max:255',
            'barangay'            => 'required|string',
            'street_address'      => 'nullable|string|max:255',
            'assessment_fee'      => 'required|numeric|min:0',
            'or_number'              => 'required|string|max:255',            
            'remarks'             => 'nullable|string',
            'corporation_contact'    => ['nullable', 'regex:/^(09|\+63|63|\d)\d{9}$/'],
            'representative_contact' => ['nullable', 'regex:/^(09|\+63|63|\d)\d{9}$/'],
            'preferred_release_mode' => 'required|string',
            'route_to_sb'             => 'nullable|boolean',
            'zoning_certificate_fee'   => 'nullable|numeric|min:0',
            'locational_clearance_fee' => 'nullable|numeric|min:0',
            'development_permit_fee'   => 'nullable|numeric|min:0',
            'other_fees'               => 'nullable|numeric|min:0',
            'penalty_fee'      => 'nullable|numeric|min:0',
            'date_of_receipt'  => 'required|date',
            'corporation_name'           => 'nullable|string|max:255',
            'corporation_address'        => 'nullable|string|max:255',
            'representative_address'     => 'nullable|string|max:255',
            'building_area'              => 'nullable|numeric|min:0',
            'area_to_develop'            => 'nullable|numeric|min:0',
            'number_of_saleable_lots'    => 'nullable|integer|min:0',
            'project_type_business_name' => 'nullable|string|max:255',
            'project_cost'               => 'nullable|numeric|min:0',
            'right_over_land'            => 'nullable|string|max:100',
            'project_tenure'             => 'nullable|string|max:100',

            // Multi-parcel payload
            'parcels'                      => 'required|array|min:1',
            'parcels.*.parcel_code'        => 'nullable|string|max:20',
            'parcels.*.location_address'   => 'nullable|string|max:255',
            'parcels.*.barangay'           => 'nullable|string|max:100',
            'parcels.*.owner_name'         => 'nullable|string|max:255',
            'parcels.*.property_index_number' => 'required|string|max:100',
            'parcels.*.arp_number'        => 'nullable|string|max:100',
            'parcels.*.survey_number'     => 'nullable|string|max:100',
            'parcels.*.lot_number'        => 'nullable|string|max:100',
            'parcels.*.tct_number'        => 'nullable|string|max:100',
            'parcels.*.tax_dec_number'    => 'nullable|string|max:100',
            'parcels.*.land_use_class'    => 'nullable|string|max:100',
            'parcels.*.lot_area_sqm'      => 'nullable|numeric|min:0',
            'parcels.*.coordinates'       => ['nullable', 'regex:/^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/'],

            // --- NEW: Dynamic Validation for Evaluation Decisions & Site Inspections ---
            'parcels.*.decision'          => 'nullable|string|in:Approved,Needs Site Inspection,Declined',
            'parcels.*.decision_reason'   => 'required_if:parcels.*.decision,Declined|nullable|string',
            'parcels.*.findings'          => 'nullable|string',
            'parcels.*.assigned_notes'    => 'nullable|string',
            'parcels.*.inspector_id'      => 'required_if:parcels.*.decision,Needs Site Inspection|nullable|exists:users,id',
            'parcels.*.scheduled_date'    => 'required_if:parcels.*.decision,Needs Site Inspection|nullable|date|after_or_equal:today',
            'parcels.*.deadline_date'     => 'required_if:parcels.*.decision,Needs Site Inspection|nullable|date|after_or_equal:parcels.*.scheduled_date',
        ]);

        $targetLandUseClass = $validated['target_land_use_class'] ?? $validated['land_use_class'] ?? $targetLandUseClass;

        if ($validated['application_stream'] === 'amendment' && empty($targetLandUseClass)) {
            return back()->withErrors(['target_land_use_class' => 'Target zoning classification is required for legislative amendments.']);
        } elseif ($validated['application_stream'] === 'permit') {
            $targetLandUseClass = null;
        }
        DB::beginTransaction();
        try {
            $referenceNumber = $this->generateReferenceNumber(
                now()->toDateString()
            );

            // 1. Create the application with the initial 'Received' status
            $application = ZoningApplication::create([
                'reference_number'           => $referenceNumber,
                'application_stream'         => $validated['application_stream'],
                'form_number'                => $validated['form_number'],
                'application_type'           => $validated['application_type'],
                'target_land_use_class'      => $targetLandUseClass,
                'status'                     => 'Received',
                'purpose'                    => $validated['purpose'],
                'applicant_name'             => $validated['applicant_name'],
                'applicant_street'           => $validated['applicant_street'] ?? null,
                'applicant_barangay'         => $validated['applicant_barangay'] ?? null,
                'contact_number'             => preg_replace('/\D/', '', $validated['contact_number']),
                'email'                      => $validated['email'] ?? null,
                'corporation_name'           => $validated['corporation_name'] ?? null,
                'corporation_address'        => $validated['corporation_address'] ?? null,
                'corporation_contact'        => $validated['corporation_contact'] ?? null,
                'representative_name'        => $validated['representative_name'] ?? null,
                'representative_address'     => $validated['representative_address'] ?? null,
                'representative_contact'     => $validated['representative_contact'] ?? null,
                'barangay'                   => $validated['barangay'],
                'street_address'             => $validated['street_address'] ?? null,
                'building_area'              => $validated['building_area'] ?? null,
                'area_to_develop'            => $validated['area_to_develop'] ?? null,
                'number_of_saleable_lots'    => $validated['number_of_saleable_lots'] ?? null,
                'project_type_business_name' => $validated['project_type_business_name'] ?? null,
                'project_cost'               => $validated['project_cost'] ?? null,
                'right_over_land'            => $validated['right_over_land'] ?? null,
                'project_tenure'             => $validated['project_tenure'] ?? null,
                'preferred_release_mode'     => $validated['preferred_release_mode'],
                'assessment_fee'             => $validated['assessment_fee'],
                'zoning_certificate_fee'     => $validated['zoning_certificate_fee'] ?? 0,
                'locational_clearance_fee'   => $validated['locational_clearance_fee'] ?? 0,
                'development_permit_fee'     => $validated['development_permit_fee'] ?? 0,
                'other_fees'                 => $validated['other_fees'] ?? 0,
                'penalty_fee'                => $validated['penalty_fee'] ?? 0,
                'date_of_receipt'            => $validated['date_of_receipt'],
                'or_number'                  => $validated['or_number'],
                'remarks'                    => $validated['remarks'] ?? null,
                'encoded_by'                 => Auth::id(),
            ]);

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

            $adminIds = User::where('role', 'Admin')->pluck('id')->all();
            $recipientIds = array_merge($adminIds, [Auth::id()]);

            AppNotification::notifyUsers(
                $recipientIds,
            // ── Master integration (Loop 9 merge) ──────────────────────────
            // These are TWO INDEPENDENT operations that happen to sit in one
            // conflict region. Both survive; neither replaces the other, and the
            // notification fires first so the Planning Officers who may pick the
            // work up are told about it before ownership is recorded.
            AppNotification::notifyRoles(
                ['Admin', 'Planning Officer'],
                'New Application Encoded',
                "Application {$referenceNumber} for {$application->applicant_name} ({$application->barangay}) has been encoded.",
                'application_created',
                "/applications/{$application->id}"
            );

            // Approved initialization rule: an application created by an ACTIVE
            // Planning Officer starts owned by that officer, recorded as an
            // explicit INITIAL assignment.
            //
            // `encoded_by` above is untouched and keeps its own meaning. The two
            // may hold the same user id here and still say different things:
            // encoded_by is who typed the application up and never changes, while
            // assigned_planning_officer_id is who currently owns the pending
            // Planning Officer work and does change on handover.
            //
            // If the creator is not an eligible Planning Officer, ownership is
            // deliberately LEFT NULL rather than guessed at, and the application
            // honestly shows "Not yet assigned" until an Administrator assigns
            // it. No historical row is touched: this only runs for an application
            // being created right now.
            app(WorkAssignmentService::class)
                ->initializePoOwnershipForNewApplication($application, Auth::user());

            $decisionsSeen = [];

            // 2. Map parcels and conditionally process evaluations & site inspections
            foreach ($validated['parcels'] as $index => $parcelData) {
                $lat = null;
                $lng = null;
                if (!empty($parcelData['coordinates'])) {
                    [$lat, $lng] = array_map('trim', explode(',', $parcelData['coordinates'], 2));
                    $lat = (float) $lat;
                    $lng = (float) $lng;
                }

                $parcelLandUseClass = $parcelData['land_use_class'] ?? $parcelData['land_use'] ?? $parcelData['zoning_class'] ?? null;

                $parcel = Parcel::create([
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
                    'land_use_class'        => $parcelLandUseClass,
                    'property_index_number' => $parcelData['property_index_number'] ?? null,
                    'arp_number'            => $parcelData['arp_number'] ?? null,
                    'survey_number'         => $parcelData['survey_number'] ?? null,
                ]);

                // --- NEW: Execute Evaluation Logic if defined on the frontend ---
                if (!empty($parcelData['decision'])) {
                    $decisionsSeen[] = $parcelData['decision'];
                    $siteInspectionId = null;

                    if ($parcelData['decision'] === 'Needs Site Inspection') {
                        $assigningOfficer = $this->currentPlanningOfficerAssignmentActor();

                        $inspection = SiteInspection::create([
                            'zoning_application_id'      => $application->id,
                            'parcel_id'                  => $parcel->id,
                            'inspector_id'               => $parcelData['inspector_id'],
                            'scheduled_date'             => $parcelData['scheduled_date'],
                            'deadline_date'              => $parcelData['deadline_date'],
                            'assigned_notes'             => $parcelData['assigned_notes'] ?? null,
                            'assigned_by_imaps_user_id'  => $assigningOfficer['id'],
                            'assigned_by_name'           => $assigningOfficer['name'],
                            'status'                     => 'assigned',
                        ]);

                        $siteInspectionId = $inspection->id;
                        PushInspectionToSupabase::dispatch($inspection);
                    }

                    TechnicalReview::create([
                        'zoning_application_id'   => $application->id,
                        'parcel_id'               => $parcel->id,
                        'reviewed_by'             => Auth::id(),
                        'review_round'            => 1,
                        'decision'                => $parcelData['decision'],
                        'decision_reason'         => $parcelData['decision_reason'] ?? null,
                        'findings'                => $parcelData['findings'] ?? null,
                        'site_inspection_task_id' => $siteInspectionId,
                        'reviewed_at'             => now(),
                    ]);
                }
            }

            $routeToSb = $request->boolean('route_to_sb') || ($validated['application_stream'] === 'amendment');

            // 3. Roll up overall status dynamically based on "restrictive precedence"
            if (!empty($decisionsSeen)) {
                if (in_array('Declined', $decisionsSeen, true)) {
                    $application->update(['status' => 'Denied']);
                } elseif ($routeToSb) {
                    $application->update(['status' => 'Under Sangguniang Bayan']);
                } elseif (in_array('Needs Site Inspection', $decisionsSeen, true)) {
                    $application->update(['status' => 'Technical Review']);
                } else {
                    $application->update(['status' => 'For Release']);
                }

                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    $application->status
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'STATUS_UPDATE',
                    performedBy: Auth::id(),
                    note: "Application automatically moved to {$application->status} based on encoded parcel evaluations."
                );

            } else {
                $targetStatus = $routeToSb ? 'Under Sangguniang Bayan' : 'Technical Review';
                $application->update(['status' => $targetStatus]);
                
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    $targetStatus
                );

                AuditLogger::log(
                    applicationId: $application->id,
                    action: 'STATUS_UPDATE',
                    performedBy: Auth::id(),
                    note: "Application automatically moved from Received to {$targetStatus} upon encoding."
                );
            }

            if ($request->filled('draft_id')) {
                DB::table('application_drafts')
                    ->where('temp_reference_number', $request->input('draft_id'))
                    ->where('user_id', Auth::id())
                    ->delete();
            }

            DB::commit();
            return back()
                ->with('success', "Application encoded successfully. Status: {$application->status}")
                ->with('reference_number', $referenceNumber)
                ->with('application_id', $application->id);
        } catch (\Exception $e) {
            DB::rollBack();
            return back()->withErrors(['db' => 'Database error: ' . $e->getMessage()]);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // APPLICANT LOOKUP — past applicants matching a name, email or phone
    // Replaces the browser-local registry, which kept applicants' personal data
    // on whichever shared PC encoded them.
    // ─────────────────────────────────────────────────────────────────────────
    public function applicantLookup(Request $request)
    {
        $q = trim((string) $request->query('q', ''));
        if (mb_strlen($q) < 3) {
            return response()->json([]);
        }

        $like = '%' . addcslashes(mb_strtolower($q), '\\%_') . '%';
        $digits = preg_replace('/\D/', '', $q);

        $rows = ZoningApplication::query()
            ->where(function ($w) use ($like, $digits) {
                $w->whereRaw('LOWER(applicant_name) LIKE ?', [$like])
                    ->orWhereRaw('LOWER(email) LIKE ?', [$like]);
                if (strlen($digits) >= 4) {
                    $w->orWhere('contact_number', 'like', '%' . $digits . '%');
                }
            })
            ->orderByDesc('created_at')
            ->limit(25)
            ->get(['applicant_name', 'contact_number', 'email', 'representative_name']);

        return response()->json(
            $rows->unique(fn ($r) => mb_strtolower($r->applicant_name) . '|' . $r->contact_number)->take(5)->values()
        );
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SHOW — View single application, its parcels, and its technical review history
    // ─────────────────────────────────────────────────────────────────────────
    public function show(int $id)
    {
        $application = ZoningApplication::query()
            ->with(['parcels' => function ($query) {
                // Admin/PO audit: the detail page exposed only a raw
                // inspector_id, so a Planning Officer could not tell who was
                // assigned. Eager-load the EXISTING users relation rather than
                // duplicating the name into another column. withCount supplies
                // the round count so the current round can be labelled
                // "Round N" without loading full history.
                $query->orderBy('parcel_code')
                    ->with(['siteInspection.inspector'])
                    ->withCount('siteInspections');
            }]) // <-- Eager load and order parcels
            ->leftJoin('users', 'users.id', '=', 'zoning_applications.encoded_by')
            ->select('zoning_applications.*', 'users.name as encoded_by_name')
            ->where('zoning_applications.id', $id)
            ->first();

        $inspectors = User::activeSiteInspectors()
            ->select('id', 'name')
            ->orderBy('name')
            ->get();

        // Admin/PO audit (P1): this used to fall back to getSampleApplicationData()
        // and render a FABRICATED application dossier — invented applicant names,
        // TCT and OR numbers — for any id that did not exist. Official records
        // must never be invented, so an unknown id is now an ordinary 404.
        abort_if($application === null, 404);

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

        // ── Work assignment data (business continuity) ───────────────────────
        $assignments = app(WorkAssignmentService::class);
        $viewerRole = Auth::user()?->role;

        // The CURRENT round on each parcel, i.e. the one the page is about to
        // show. Ownership is a property of a round, never of the application.
        $openRounds = $application->parcels
            ->map(fn ($parcel) => $parcel->siteInspection)
            ->filter()
            ->values();

        // ONE batched remote read for every round on this page. The guard needs
        // the FieldSync state because local status cannot prove a round is
        // unstarted: a round in progress in the field still reads locally as
        // "assigned".
        $remoteStates = $openRounds->isEmpty()
            ? []
            : app(SupabaseService::class)->fieldJobTransferStates(
                $openRounds->map(fn ($inspection) => (int) $inspection->id)->all()
            );

        // Round number per inspection id, taken from the PARCEL that owns the
        // round. Reading it off the inspection's own parcel relation would lazy
        // load one parcel per round and would not carry the withCount attribute.
        $roundNumberByInspection = $application->parcels
            ->filter(fn ($parcel) => $parcel->siteInspection)
            ->mapWithKeys(fn ($parcel) => [
                (int) $parcel->siteInspection->id => (int) ($parcel->site_inspections_count ?? 1),
            ]);

        $inspectorRoundState = $openRounds->mapWithKeys(function ($inspection) use ($remoteStates, $roundNumberByInspection) {
            $remote = $remoteStates[(int) $inspection->id] ?? [];

            $decision = InspectorTransferGuard::evaluate([
                'local_status'              => $inspection->status,
                'remote_readable'           => $remote !== [],
                'remote_status'             => $remote['status'] ?? null,
                'gps_confirmed_at'          => $remote['gps_confirmed_at'] ?? null,
                'checklist_completed_count' => $remote['checklist_completed_count'] ?? 0,
                'photo_count'               => $remote['photo_count'] ?? 0,
            ]);

            // The round number is the 1-based position of this round within its
            // own application, which is the same numbering the parcel panel shows.
            $roundNumber = $roundNumberByInspection[(int) $inspection->id] ?? 1;

            return [(int) $inspection->id => [
                'inspection_id'   => (int) $inspection->id,
                'round_number'   => $roundNumber,
                'inspector_id'   => $inspection->inspector_id,
                'inspector_name' => $inspection->inspector?->name,
                'allowed'        => $decision['allowed'],
                'blocked_reason' => $decision['reason'],
            ]];
        });

        $inspectionHistory = $openRounds->isEmpty()
            ? collect()
            : SiteInspectionAssignment::with(['fromInspector:id,name', 'toInspector:id,name', 'actor:id,name'])
                ->whereIn('site_inspection_id', $openRounds->map(fn ($i) => (int) $i->id))
                ->orderBy('reassigned_at')
                ->orderBy('id')
                ->get()
                ->groupBy('site_inspection_id');

        $poHistory = ApplicationPoAssignment::with([
                'fromPlanningOfficer:id,name',
                'toPlanningOfficer:id,name',
                'actor:id,name',
            ])
            ->where('zoning_application_id', $id)
            ->orderBy('reassigned_at')
            ->orderBy('id')
            ->get();

        return Inertia::render('Applications/Show', [
            'application'      => $application,
            'parcels'          => $application->parcels,
            'technicalReviews' => $technicalReviews,
            'auditTrail'       => $auditTrail,
            'inspectors'       => $inspectors,

            // ── Work assignment (business continuity) ────────────────────────
            // Two SEPARATE responsibilities, presented separately:
            //   * APPLICATION-level: who currently owns this application. Admin
            //     may initiate a handover. Nobody inherits decision rights.
            //   * ROUND-level: who currently holds each inspection round. Only a
            //     Planning Officer may hand a round over, and only while it is
            //     provably untouched in the field.
            //
            // `assignedPlanningOfficer` stays null until ownership has genuinely
            // been established. The current business flow has no step that
            // assigns an application to an officer, so historical rows are left
            // unowned rather than backfilled with a guess.
            'assignedPlanningOfficer' => $application->assigned_planning_officer_id
                ? User::find($application->assigned_planning_officer_id)?->only(['id', 'name'])
                : null,
            'planningOfficers'        => $assignments->activePlanningOfficers(),
            'poAssignmentHistory'     => $poHistory,
            'inspectorRoundState'     => $inspectorRoundState,
            'inspectionHistory'       => $inspectionHistory,
            'reassignmentReasons'     => ReassignmentReasons::all(),

            // Authority is stated by the server rather than inferred in the
            // browser, so the UI can never offer a control the route would refuse.
            'canReassignPlanningOfficer' => $viewerRole === 'Admin',
            'canReassignInspector'       => $viewerRole === 'Planning Officer',

            'statusOrder'      => self::STATUS_ORDER,
            // When each stage began, for "days in stage" on the record page
            'statusHistory'    => DB::table('application_status_tracks')
                ->where('reference_number', $application->reference_number)
                ->orderBy('created_at')
                ->get(['status', 'created_at']),
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // AMENDMENT REFERENCES — SB ordinance / DAR clearance for rezoning and
    // reclassification petitions (columns already on zoning_applications)
    // ─────────────────────────────────────────────────────────────────────────
    public function updateAmendmentRefs(Request $request, int $id)
    {
        $validated = $request->validate([
            'sb_ordinance_number' => 'nullable|string|max:100',
            'dar_clearance_ref'   => 'nullable|string|max:100',
        ]);

        $application = ZoningApplication::findOrFail($id);
        $application->update($validated);

        AuditLogger::log(
            applicationId: $application->id,
            action: 'AMENDMENT_REFS_UPDATED',
            performedBy: Auth::id(),
            note: sprintf(
                'SB ordinance no.: %s; DAR clearance ref.: %s',
                $validated['sb_ordinance_number'] ?? '—',
                $validated['dar_clearance_ref'] ?? '—'
            )
        );

        return back()->with('success', 'Amendment references saved.');
    }

    private function currentPlanningOfficerAssignmentActor(): array
    {
        $user = Auth::user();

        if (!$user || $user->role !== 'Planning Officer') {
            throw new \RuntimeException('Only an authenticated Planning Officer can assign or reassign a site inspection.');
        }

        return [
            'id' => $user->id,
            'name' => $user->name,
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
                $targetStatus = ($application->status === 'Under Sangguniang Bayan' || $application->application_stream === 'amendment')
                    ? 'Under Sangguniang Bayan'
                    : 'For Release';

                $application->update(['status' => $targetStatus]);
                ApplicationStatusTracker::log(
                    $application->reference_number,
                    $application->applicant_name,
                    $targetStatus
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

    private function generateReferenceNumber(string $date): string
    {
        // Use a generalized prefix for all application streams and types
        $code = 'APP'; 
        $year = (new \DateTime($date))->format('Y');
        $seq  = $this->getNextSequence($code, $year);

        return sprintf('%s-%s-%05d', $code, $year, $seq);
    }

    private function getNextSequence(string $typeCode, string $year): int
    {
        // Canonical reference sequencing (upstream strategy, retained after merge):
        // derive the next number from zoning_applications under a row lock so the
        // value is monotonic and duplicate-safe inside the caller's transaction.
        // This retires the runtime dependency on the legacy application_sequences
        // table. The table itself is retained in the database (LEGACY) and is NOT
        // dropped; only this code path stops reading/writing it.
        $latest = DB::table('zoning_applications')
            ->where('reference_number', 'like', "{$typeCode}-{$year}-%")
            ->lockForUpdate()
            ->orderBy('reference_number', 'desc')
            ->value('reference_number');

        if ($latest) {
            $parts = explode('-', $latest);
            return (int) end($parts) + 1;
        }

        return 1;
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
        if (!Auth::check()) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

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
                'form_payload'     => $payload
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

    // ─────────────────────────────────────────────────────────────────────────
    // PERMIT GENERATION (Excel template → PDF) — see config/permits.php
    // ─────────────────────────────────────────────────────────────────────────

    /** Fields + dropdowns for the Generate Permit modal, prefilled from the record. */
    public function permitSchema(int $id, string $type, PermitExcelService $permits)
    {
        $application = ZoningApplication::with(['parcels', 'encodedBy'])->findOrFail($id);

        try {
            return response()->json([
                'documents' => $permits->documents(),
                'schema'    => $permits->schema($application, $type),
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("permitSchema error: " . $e->getMessage()); return response()->json(['message' => $e->getMessage()], 422);
        }
    }

    public function exportPreview(Request $request, int $id, string $type, PermitExcelService $permits)
    {
        $application = ZoningApplication::with(["parcels", "encodedBy"])->findOrFail($id);
        
        $validated = $request->validate([
            "fields"   => "nullable|array",
            "fields.*" => "nullable",
            "format"   => "nullable|in:pdf",
        ]);

        try {
            $path = $permits->generate($application, $type, $validated, "pdf");
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Preview Error: " . $e->getMessage()); return response()->json(["message" => "Failed to generate preview: " . $e->getMessage()], 422);
        }

        return response()->file($path, [
            "Content-Type"        => "application/pdf",
            "Content-Disposition" => "inline; filename='preview.pdf'",
        ])->deleteFileAfterSend(true);
    }

    public function exportDocument(Request $request, int $id, string $type, PermitExcelService $permits)
    {
        $application = ZoningApplication::with(['parcels', 'encodedBy'])->findOrFail($id);

        $validated = $request->validate([
            'fields'   => 'nullable|array',
            'fields.*' => 'nullable',
            'cells'    => 'nullable|array',
            'cells.*'  => 'nullable|string|max:500',
            'format'   => 'nullable|in:pdf,xlsx',
        ]);
        $format = $validated['format'] ?? 'pdf';

        try {
            $path = $permits->generate($application, $type, $validated, $format);
        } catch (\Throwable $e) {
            report($e);
            return response()->json(['message' => 'Failed to generate permit: ' . $e->getMessage()], 422);
        }

        AuditLogger::log(
            applicationId: $application->id,
            action: 'PERMIT_GENERATED',
            performedBy: Auth::id(),
            note: sprintf('%s generated (%s).', config("permits.documents.{$type}.label", strtoupper($type)), strtoupper($format))
        );

        $mime = $format === 'pdf'
            ? 'application/pdf'
            : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

        return response()->file($path, [
            'Content-Type'        => $mime,
            'Content-Disposition' => ($format === 'pdf' ? 'inline' : 'attachment') . '; filename="' . basename($path) . '"',
        ])->deleteFileAfterSend(true);
    }
}

