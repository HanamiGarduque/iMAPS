<?php

namespace App\Support;

/**
 * Controlled taxonomy for application and parcel rejection causes.
 *
 * Grounded in Philippine LGU zoning and land use planning regulations:
 *  - Comprehensive Land Use Plan (CLUP 2030) & Local Zoning Ordinance
 *  - Water Code of the Philippines (PD 1067) legal easements
 *  - National Building Code of the Philippines (PD 1096) setback & spatial standards
 *  - Road Right-of-Way (ROW) standards & public infrastructure buffers
 *  - Land registration & cadastral boundary verification rules
 *  - FieldSync on-site verification & statutory documentary requirements
 */
final class RejectionReasons
{
    // ── Categories ──
    public const CATEGORY_ZONING = 'Zoning & Land Use Conformity';
    public const CATEGORY_EASEMENT = 'Environmental & Waterway Legal Easements';
    public const CATEGORY_ROW = 'Road Right-of-Way & Access Standards';
    public const CATEGORY_BUILDING = 'Building Code & Spatial Standards';
    public const CATEGORY_BOUNDARY = 'Lot Boundary & Property Verification';
    public const CATEGORY_DOCS = 'Documentary & Legal Deficiencies';
    public const CATEGORY_INSPECTION = 'Site Inspection Discrepancies';
    public const CATEGORY_OTHER = 'Other Regulatory Grounds';

    // ── Reason Codes ──
    // 1. Zoning & Land Use Conformity (Zoning Mismatch)
    public const ZONING_USE_NOT_ALLOWED = 'ZONING_USE_NOT_ALLOWED';
    public const ZONING_DENSITY_EXCEEDED = 'ZONING_DENSITY_EXCEEDED';

    // 2. Environmental & Waterway Legal Easements (Beyond Zoning)
    public const EASEMENT_WATERWAY_VIOLATION = 'EASEMENT_WATERWAY_VIOLATION';
    public const EASEMENT_HAZARD_BUFFER = 'EASEMENT_HAZARD_BUFFER';
    public const EASEMENT_PROTECTED_ZONE = 'EASEMENT_PROTECTED_ZONE';

    // 3. Road Right-of-Way & Access Standards (Beyond Zoning)
    public const ROW_ROAD_ENCROACHMENT = 'ROW_ROAD_ENCROACHMENT';
    public const ROW_NO_LEGAL_ACCESS = 'ROW_NO_LEGAL_ACCESS';
    public const ROW_TRAFFIC_SAFETY_HAZARD = 'ROW_TRAFFIC_SAFETY_HAZARD';

    // 4. Building Code & Spatial Standards (Beyond Zoning)
    public const BUILDING_SETBACK_VIOLATION = 'BUILDING_SETBACK_VIOLATION';
    public const BUILDING_FOOTPRINT_EXCEEDED = 'BUILDING_FOOTPRINT_EXCEEDED';
    public const BUILDING_PARKING_DEFICIENCY = 'BUILDING_PARKING_DEFICIENCY';

    // 5. Lot Boundary & Property Verification (Beyond Zoning)
    public const BOUNDARY_ADJOINING_OVERLAP = 'BOUNDARY_ADJOINING_OVERLAP';
    public const BOUNDARY_SURVEY_DISCREPANCY = 'BOUNDARY_SURVEY_DISCREPANCY';
    public const BOUNDARY_PUBLIC_LAND_OVERLAP = 'BOUNDARY_PUBLIC_LAND_OVERLAP';

    // 6. Documentary & Legal Deficiencies (Beyond Zoning)
    public const DOCS_OWNERSHIP_UNVERIFIED = 'DOCS_OWNERSHIP_UNVERIFIED';
    public const DOCS_AUTHORIZATION_MISSING = 'DOCS_AUTHORIZATION_MISSING';
    public const DOCS_CLEARANCES_MISSING = 'DOCS_CLEARANCES_MISSING';
    public const DOCS_COMPLIANCE_TIMEOUT = 'DOCS_COMPLIANCE_TIMEOUT';

    // 7. Site Inspection Discrepancies (Beyond Zoning)
    public const INSPECTION_ACTUAL_USE_CONTRADICTION = 'INSPECTION_ACTUAL_USE_CONTRADICTION';
    public const INSPECTION_UNAUTHORIZED_CONSTRUCTION = 'INSPECTION_UNAUTHORIZED_CONSTRUCTION';
    public const INSPECTION_SANITATION_DEFICIENCY = 'INSPECTION_SANITATION_DEFICIENCY';

    // 8. Other
    public const OTHER_REGULATORY_GROUND = 'OTHER_REGULATORY_GROUND';

    /**
     * All recognized categories in logical display order.
     *
     * @return array<int, string>
     */
    public static function categories(): array
    {
        return [
            self::CATEGORY_ZONING,
            self::CATEGORY_EASEMENT,
            self::CATEGORY_ROW,
            self::CATEGORY_BUILDING,
            self::CATEGORY_BOUNDARY,
            self::CATEGORY_DOCS,
            self::CATEGORY_INSPECTION,
            self::CATEGORY_OTHER,
        ];
    }

    /**
     * All recognized reason codes.
     *
     * @return array<int, string>
     */
    public static function codes(): array
    {
        return array_keys(self::all());
    }

    /**
     * Complete definition catalog of reasons.
     *
     * @return array<string, array{code: string, category: string, label: string, regulatory_basis: string, description: string, requires_notes: bool}>
     */
    public static function all(): array
    {
        return [
            self::ZONING_USE_NOT_ALLOWED => [
                'code' => self::ZONING_USE_NOT_ALLOWED,
                'category' => self::CATEGORY_ZONING,
                'label' => 'Use not permitted in CLUP zone',
                'regulatory_basis' => 'Comprehensive Land Use Plan (CLUP 2030) / Local Zoning Ordinance',
                'description' => 'Proposed activity or project is not an allowable or compatible use in this zone classification.',
                'requires_notes' => false,
            ],
            self::ZONING_DENSITY_EXCEEDED => [
                'code' => self::ZONING_DENSITY_EXCEEDED,
                'category' => self::CATEGORY_ZONING,
                'label' => 'Allowable zoning density or intensity exceeded',
                'regulatory_basis' => 'Zoning Ordinance Density / Intensity Restrictions',
                'description' => 'Proposed project exceeds maximum allowable dwelling density, floor area ratio (FAR), or commercial intensity.',
                'requires_notes' => false,
            ],

            self::EASEMENT_WATERWAY_VIOLATION => [
                'code' => self::EASEMENT_WATERWAY_VIOLATION,
                'category' => self::CATEGORY_EASEMENT,
                'label' => 'Waterway legal easement violation',
                'regulatory_basis' => 'Water Code of the Philippines (PD 1067)',
                'description' => 'Sited within statutory legal easements along riverbanks, streams, or waterways (3m urban, 20m agricultural, 40m forest).',
                'requires_notes' => false,
            ],
            self::EASEMENT_HAZARD_BUFFER => [
                'code' => self::EASEMENT_HAZARD_BUFFER,
                'category' => self::CATEGORY_EASEMENT,
                'label' => 'Sited within environmental hazard buffer / floodway',
                'regulatory_basis' => 'MGB Geohazard / Disaster Risk Reduction Regulations',
                'description' => 'Lot falls within an active fault buffer, landslide zone, or declared floodway where construction is prohibited.',
                'requires_notes' => false,
            ],
            self::EASEMENT_PROTECTED_ZONE => [
                'code' => self::EASEMENT_PROTECTED_ZONE,
                'category' => self::CATEGORY_EASEMENT,
                'label' => 'Located within protected zone without exemption',
                'regulatory_basis' => 'Protected Agriculture (PTA-SZ-RA) / Forest Reserve Policies',
                'description' => 'Sited inside protected prime agricultural or forest conservation reserve with no exemption clearance.',
                'requires_notes' => false,
            ],

            self::ROW_ROAD_ENCROACHMENT => [
                'code' => self::ROW_ROAD_ENCROACHMENT,
                'category' => self::CATEGORY_ROW,
                'label' => 'Road Right-of-Way (ROW) encroachment',
                'regulatory_basis' => 'DPWH Road ROW Guidelines / Municipal Road Network Standards',
                'description' => 'Perimeter fence, structure, or site improvements encroach into existing or planned public Road Right-of-Way.',
                'requires_notes' => false,
            ],
            self::ROW_NO_LEGAL_ACCESS => [
                'code' => self::ROW_NO_LEGAL_ACCESS,
                'category' => self::CATEGORY_ROW,
                'label' => 'Lack of legal road access or inadequate frontage',
                'regulatory_basis' => 'Subdivision & Access Road Standards (PD 957 / BP 220)',
                'description' => 'Lot lacks accessible public road frontage and has no registered, notarized right-of-way easement.',
                'requires_notes' => false,
            ],
            self::ROW_TRAFFIC_SAFETY_HAZARD => [
                'code' => self::ROW_TRAFFIC_SAFETY_HAZARD,
                'category' => self::CATEGORY_ROW,
                'label' => 'Traffic hazard or sight-line obstruction',
                'regulatory_basis' => 'Traffic Engineering & Municipal Safety Standards',
                'description' => 'Proposed ingress/egress creates traffic conflict, visibility impairment, or hazard at an intersection or blind curve.',
                'requires_notes' => false,
            ],

            self::BUILDING_SETBACK_VIOLATION => [
                'code' => self::BUILDING_SETBACK_VIOLATION,
                'category' => self::CATEGORY_BUILDING,
                'label' => 'National Building Code setback non-compliance',
                'regulatory_basis' => 'National Building Code of the Philippines (PD 1096)',
                'description' => 'Proposed structures fail to meet mandatory minimum front, side, or rear yard setback distances.',
                'requires_notes' => false,
            ],
            self::BUILDING_FOOTPRINT_EXCEEDED => [
                'code' => self::BUILDING_FOOTPRINT_EXCEEDED,
                'category' => self::CATEGORY_BUILDING,
                'label' => 'Building footprint or height limit exceeded',
                'regulatory_basis' => 'PD 1096 (TOSL / USA / Building Height Limits)',
                'description' => 'Percentage of land occupancy exceeds Total Open Space on Lot (TOSL) or allowable maximum building height.',
                'requires_notes' => false,
            ],
            self::BUILDING_PARKING_DEFICIENCY => [
                'code' => self::BUILDING_PARKING_DEFICIENCY,
                'category' => self::CATEGORY_BUILDING,
                'label' => 'Inadequate parking or off-street loading space',
                'regulatory_basis' => 'PD 1096 Parking & Loading Berth Provisions',
                'description' => 'Fails to provide required off-street parking slots or truck loading/unloading bays for commercial/industrial use.',
                'requires_notes' => false,
            ],

            self::BOUNDARY_ADJOINING_OVERLAP => [
                'code' => self::BOUNDARY_ADJOINING_OVERLAP,
                'category' => self::CATEGORY_BOUNDARY,
                'label' => 'Encroachment into adjoining private property / boundary dispute',
                'regulatory_basis' => 'Land Registration Authority (LRA) / Cadastral Survey Guidelines',
                'description' => 'Declared improvements or lot boundaries encroach onto an adjacent titled private lot or unresolved boundary dispute.',
                'requires_notes' => false,
            ],
            self::BOUNDARY_SURVEY_DISCREPANCY => [
                'code' => self::BOUNDARY_SURVEY_DISCREPANCY,
                'category' => self::CATEGORY_BOUNDARY,
                'label' => 'Boundary discrepancy vs. TCT / survey plan',
                'regulatory_basis' => 'Geodetic Survey & Title Verification Standards',
                'description' => 'Actual on-site corners or fencing differ significantly from technical descriptions in the TCT/OCT; relocation survey needed.',
                'requires_notes' => false,
            ],
            self::BOUNDARY_PUBLIC_LAND_OVERLAP => [
                'code' => self::BOUNDARY_PUBLIC_LAND_OVERLAP,
                'category' => self::CATEGORY_BOUNDARY,
                'label' => 'Overlap with public domain or utility easement',
                'regulatory_basis' => 'Public Land Act / DENR Administrative Regulations',
                'description' => 'Site overlaps with public domain, municipal easement, drainage canal, or utility transmission corridor.',
                'requires_notes' => false,
            ],

            self::DOCS_OWNERSHIP_UNVERIFIED => [
                'code' => self::DOCS_OWNERSHIP_UNVERIFIED,
                'category' => self::CATEGORY_DOCS,
                'label' => 'Unverified proof of ownership or lack of title',
                'regulatory_basis' => 'HLURB / DHSUD Locational Clearance Requirements',
                'description' => 'Applicant failed to provide authentic TCT, OCT, valid Deed of Sale, or authenticated Tax Declaration in applicant name.',
                'requires_notes' => false,
            ],
            self::DOCS_AUTHORIZATION_MISSING => [
                'code' => self::DOCS_AUTHORIZATION_MISSING,
                'category' => self::CATEGORY_DOCS,
                'label' => 'Missing owner authorization or uncertified lease',
                'regulatory_basis' => 'Legal Representation & Ownership Authority Rules',
                'description' => 'Representative or lessee failed to provide a valid notarized Special Power of Attorney (SPA) or owner consent.',
                'requires_notes' => false,
            ],
            self::DOCS_CLEARANCES_MISSING => [
                'code' => self::DOCS_CLEARANCES_MISSING,
                'category' => self::CATEGORY_DOCS,
                'label' => 'Missing prerequisite statutory clearance (DAR/DENR/Barangay)',
                'regulatory_basis' => 'DAR Administrative Orders / DENR Environmental Regulations',
                'description' => 'Missing required DAR Land Conversion/Exemption clearance, Environmental Compliance Certificate (ECC/CNC), or LGU permit.',
                'requires_notes' => false,
            ],
            self::DOCS_COMPLIANCE_TIMEOUT => [
                'code' => self::DOCS_COMPLIANCE_TIMEOUT,
                'category' => self::CATEGORY_DOCS,
                'label' => 'Failure to submit required documents within notice period',
                'regulatory_basis' => 'ARTA / Citizen\'s Charter Statutory Processing Timeframes',
                'description' => 'Applicant failed to comply with formal Notice of Deficiencies within the statutory 30-day compliance period.',
                'requires_notes' => false,
            ],

            self::INSPECTION_ACTUAL_USE_CONTRADICTION => [
                'code' => self::INSPECTION_ACTUAL_USE_CONTRADICTION,
                'category' => self::CATEGORY_INSPECTION,
                'label' => 'Actual on-site use contradicts declared purpose',
                'regulatory_basis' => 'FieldSync Site Verification & Zoning Enforcement',
                'description' => 'Field inspection revealed actual site operations or structures materially contradicting the declared project purpose.',
                'requires_notes' => false,
            ],
            self::INSPECTION_UNAUTHORIZED_CONSTRUCTION => [
                'code' => self::INSPECTION_UNAUTHORIZED_CONSTRUCTION,
                'category' => self::CATEGORY_INSPECTION,
                'label' => 'Unauthorized ongoing construction commenced',
                'regulatory_basis' => 'Local Zoning Enforcement / Cease and Desist Protocols',
                'description' => 'Development or construction commenced on site without prior locational clearance and building permit approval.',
                'requires_notes' => false,
            ],
            self::INSPECTION_SANITATION_DEFICIENCY => [
                'code' => self::INSPECTION_SANITATION_DEFICIENCY,
                'category' => self::CATEGORY_INSPECTION,
                'label' => 'Non-compliant drainage or sanitation setup',
                'regulatory_basis' => 'Code on Sanitation of the Philippines (PD 856)',
                'description' => 'Field inspection identified non-compliant waste disposal, lack of septic tank, or illegal runoff discharge into neighbor lots.',
                'requires_notes' => false,
            ],

            self::OTHER_REGULATORY_GROUND => [
                'code' => self::OTHER_REGULATORY_GROUND,
                'category' => self::CATEGORY_OTHER,
                'label' => 'Other specific regulatory ground',
                'regulatory_basis' => 'Applicable Municipal Ordinance / National Law',
                'description' => 'Specific legal or regulatory basis not covered by standard categories (detailed explanation mandatory).',
                'requires_notes' => true,
            ],
        ];
    }

    /**
     * Reasons grouped by category for dropdown and UI select rendering.
     *
     * @return array<string, array<int, array{code: string, label: string, regulatory_basis: string, description: string, requires_notes: bool}>>
     */
    public static function byCategory(): array
    {
        $grouped = [];
        foreach (self::categories() as $category) {
            $grouped[$category] = [];
        }

        foreach (self::all() as $item) {
            $grouped[$item['category']][] = [
                'code' => $item['code'],
                'label' => $item['label'],
                'regulatory_basis' => $item['regulatory_basis'],
                'description' => $item['description'],
                'requires_notes' => $item['requires_notes'],
            ];
        }

        return array_filter($grouped);
    }

    public static function isValidCode(?string $code): bool
    {
        return $code !== null && array_key_exists($code, self::all());
    }

    public static function get(?string $code): ?array
    {
        if ($code === null) {
            return null;
        }

        return self::all()[$code] ?? null;
    }

    /**
     * Format a structured reason and optional notes into a clean, human-readable composite string.
     */
    public static function formatDecisionReason(?string $code, ?string $notes = null): string
    {
        $item = self::get($code);
        $trimmedNotes = trim((string) $notes);

        if ($item === null) {
            return $trimmedNotes;
        }

        $header = "[{$item['category']} - {$item['label']}]";
        if ($trimmedNotes === '') {
            return "{$header} {$item['description']}";
        }

        return "{$header} {$trimmedNotes}";
    }
}
