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

export const REJECTION_CATEGORIES = [
    'Zoning & Land Use Conformity',
    'Environmental & Waterway Legal Easements',
    'Road Right-of-Way & Access Standards',
    'Building Code & Spatial Standards',
    'Lot Boundary & Property Verification',
    'Documentary & Legal Deficiencies',
    'Site Inspection Discrepancies',
    'Other Regulatory Grounds',
];

export const REJECTION_REASONS = {
    ZONING_USE_NOT_ALLOWED: {
        code: 'ZONING_USE_NOT_ALLOWED',
        category: 'Zoning & Land Use Conformity',
        label: 'Use not permitted in CLUP zone',
        regulatory_basis: 'Comprehensive Land Use Plan (CLUP 2030) / Local Zoning Ordinance',
        description: 'Proposed activity or project is not an allowable or compatible use in this zone classification.',
        requires_notes: false,
    },
    ZONING_DENSITY_EXCEEDED: {
        code: 'ZONING_DENSITY_EXCEEDED',
        category: 'Zoning & Land Use Conformity',
        label: 'Allowable zoning density or intensity exceeded',
        regulatory_basis: 'Zoning Ordinance Density / Intensity Restrictions',
        description: 'Proposed project exceeds maximum allowable dwelling density, floor area ratio (FAR), or commercial intensity.',
        requires_notes: false,
    },
    EASEMENT_WATERWAY_VIOLATION: {
        code: 'EASEMENT_WATERWAY_VIOLATION',
        category: 'Environmental & Waterway Legal Easements',
        label: 'Waterway legal easement violation',
        regulatory_basis: 'Water Code of the Philippines (PD 1067)',
        description: 'Sited within statutory legal easements along riverbanks, streams, or waterways (3m urban, 20m agricultural, 40m forest).',
        requires_notes: false,
    },
    EASEMENT_HAZARD_BUFFER: {
        code: 'EASEMENT_HAZARD_BUFFER',
        category: 'Environmental & Waterway Legal Easements',
        label: 'Sited within environmental hazard buffer / floodway',
        regulatory_basis: 'MGB Geohazard / Disaster Risk Reduction Regulations',
        description: 'Lot falls within an active fault buffer, landslide zone, or declared floodway where construction is prohibited.',
        requires_notes: false,
    },
    EASEMENT_PROTECTED_ZONE: {
        code: 'EASEMENT_PROTECTED_ZONE',
        category: 'Environmental & Waterway Legal Easements',
        label: 'Located within protected zone without exemption',
        regulatory_basis: 'Protected Agriculture (PTA-SZ-RA) / Forest Reserve Policies',
        description: 'Sited inside protected prime agricultural or forest conservation reserve with no exemption clearance.',
        requires_notes: false,
    },
    ROW_ROAD_ENCROACHMENT: {
        code: 'ROW_ROAD_ENCROACHMENT',
        category: 'Road Right-of-Way & Access Standards',
        label: 'Road Right-of-Way (ROW) encroachment',
        regulatory_basis: 'DPWH Road ROW Guidelines / Municipal Road Network Standards',
        description: 'Perimeter fence, structure, or site improvements encroach into existing or planned public Road Right-of-Way.',
        requires_notes: false,
    },
    ROW_NO_LEGAL_ACCESS: {
        code: 'ROW_NO_LEGAL_ACCESS',
        category: 'Road Right-of-Way & Access Standards',
        label: 'Lack of legal road access or inadequate frontage',
        regulatory_basis: 'Subdivision & Access Road Standards (PD 957 / BP 220)',
        description: 'Lot lacks accessible public road frontage and has no registered, notarized right-of-way easement.',
        requires_notes: false,
    },
    ROW_TRAFFIC_SAFETY_HAZARD: {
        code: 'ROW_TRAFFIC_SAFETY_HAZARD',
        category: 'Road Right-of-Way & Access Standards',
        label: 'Traffic hazard or sight-line obstruction',
        regulatory_basis: 'Traffic Engineering & Municipal Safety Standards',
        description: 'Proposed ingress/egress creates traffic conflict, visibility impairment, or hazard at an intersection or blind curve.',
        requires_notes: false,
    },
    BUILDING_SETBACK_VIOLATION: {
        code: 'BUILDING_SETBACK_VIOLATION',
        category: 'Building Code & Spatial Standards',
        label: 'National Building Code setback non-compliance',
        regulatory_basis: 'National Building Code of the Philippines (PD 1096)',
        description: 'Proposed structures fail to meet mandatory minimum front, side, or rear yard setback distances.',
        requires_notes: false,
    },
    BUILDING_FOOTPRINT_EXCEEDED: {
        code: 'BUILDING_FOOTPRINT_EXCEEDED',
        category: 'Building Code & Spatial Standards',
        label: 'Building footprint or height limit exceeded',
        regulatory_basis: 'PD 1096 (TOSL / USA / Building Height Limits)',
        description: 'Percentage of land occupancy exceeds Total Open Space on Lot (TOSL) or allowable maximum building height.',
        requires_notes: false,
    },
    BUILDING_PARKING_DEFICIENCY: {
        code: 'BUILDING_PARKING_DEFICIENCY',
        category: 'Building Code & Spatial Standards',
        label: 'Inadequate parking or off-street loading space',
        regulatory_basis: 'PD 1096 Parking & Loading Berth Provisions',
        description: 'Fails to provide required off-street parking slots or truck loading/unloading bays for commercial/industrial use.',
        requires_notes: false,
    },
    BOUNDARY_ADJOINING_OVERLAP: {
        code: 'BOUNDARY_ADJOINING_OVERLAP',
        category: 'Lot Boundary & Property Verification',
        label: 'Encroachment into adjoining private property / boundary dispute',
        regulatory_basis: 'Land Registration Authority (LRA) / Cadastral Survey Guidelines',
        description: 'Declared improvements or lot boundaries encroach onto an adjacent titled private lot or unresolved boundary dispute.',
        requires_notes: false,
    },
    BOUNDARY_SURVEY_DISCREPANCY: {
        code: 'BOUNDARY_SURVEY_DISCREPANCY',
        category: 'Lot Boundary & Property Verification',
        label: 'Boundary discrepancy vs. TCT / survey plan',
        regulatory_basis: 'Geodetic Survey & Title Verification Standards',
        description: 'Actual on-site corners or fencing differ significantly from technical descriptions in the TCT/OCT; relocation survey needed.',
        requires_notes: false,
    },
    BOUNDARY_PUBLIC_LAND_OVERLAP: {
        code: 'BOUNDARY_PUBLIC_LAND_OVERLAP',
        category: 'Lot Boundary & Property Verification',
        label: 'Overlap with public domain or utility easement',
        regulatory_basis: 'Public Land Act / DENR Administrative Regulations',
        description: 'Site overlaps with public domain, municipal easement, drainage canal, or utility transmission corridor.',
        requires_notes: false,
    },
    DOCS_OWNERSHIP_UNVERIFIED: {
        code: 'DOCS_OWNERSHIP_UNVERIFIED',
        category: 'Documentary & Legal Deficiencies',
        label: 'Unverified proof of ownership or lack of title',
        regulatory_basis: 'HLURB / DHSUD Locational Clearance Requirements',
        description: 'Applicant failed to provide authentic TCT, OCT, valid Deed of Sale, or authenticated Tax Declaration in applicant name.',
        requires_notes: false,
    },
    DOCS_AUTHORIZATION_MISSING: {
        code: 'DOCS_AUTHORIZATION_MISSING',
        category: 'Documentary & Legal Deficiencies',
        label: 'Missing owner authorization or uncertified lease',
        regulatory_basis: 'Legal Representation & Ownership Authority Rules',
        description: 'Representative or lessee failed to provide a valid notarized Special Power of Attorney (SPA) or owner consent.',
        requires_notes: false,
    },
    DOCS_CLEARANCES_MISSING: {
        code: 'DOCS_CLEARANCES_MISSING',
        category: 'Documentary & Legal Deficiencies',
        label: 'Missing prerequisite statutory clearance (DAR/DENR/Barangay)',
        regulatory_basis: 'DAR Administrative Orders / DENR Environmental Regulations',
        description: 'Missing required DAR Land Conversion/Exemption clearance, Environmental Compliance Certificate (ECC/CNC), or LGU permit.',
        requires_notes: false,
    },
    DOCS_COMPLIANCE_TIMEOUT: {
        code: 'DOCS_COMPLIANCE_TIMEOUT',
        category: 'Documentary & Legal Deficiencies',
        label: 'Failure to submit required documents within notice period',
        regulatory_basis: 'ARTA / Citizen\'s Charter Statutory Processing Timeframes',
        description: 'Applicant failed to comply with formal Notice of Deficiencies within the statutory 30-day compliance period.',
        requires_notes: false,
    },
    INSPECTION_ACTUAL_USE_CONTRADICTION: {
        code: 'INSPECTION_ACTUAL_USE_CONTRADICTION',
        category: 'Site Inspection Discrepancies',
        label: 'Actual on-site use contradicts declared purpose',
        regulatory_basis: 'FieldSync Site Verification & Zoning Enforcement',
        description: 'Field inspection revealed actual site operations or structures materially contradicting the declared project purpose.',
        requires_notes: false,
    },
    INSPECTION_UNAUTHORIZED_CONSTRUCTION: {
        code: 'INSPECTION_UNAUTHORIZED_CONSTRUCTION',
        category: 'Site Inspection Discrepancies',
        label: 'Unauthorized ongoing construction commenced',
        regulatory_basis: 'Local Zoning Enforcement / Cease and Desist Protocols',
        description: 'Development or construction commenced on site without prior locational clearance and building permit approval.',
        requires_notes: false,
    },
    INSPECTION_SANITATION_DEFICIENCY: {
        code: 'INSPECTION_SANITATION_DEFICIENCY',
        category: 'Site Inspection Discrepancies',
        label: 'Non-compliant drainage or sanitation setup',
        regulatory_basis: 'Code on Sanitation of the Philippines (PD 856)',
        description: 'Field inspection identified non-compliant waste disposal, lack of septic tank, or illegal runoff discharge into neighbor lots.',
        requires_notes: false,
    },
    OTHER_REGULATORY_GROUND: {
        code: 'OTHER_REGULATORY_GROUND',
        category: 'Other Regulatory Grounds',
        label: 'Other specific regulatory ground',
        regulatory_basis: 'Applicable Municipal Ordinance / National Law',
        description: 'Specific legal or regulatory basis not covered by standard categories (detailed explanation mandatory).',
        requires_notes: true,
    },
};

export const REJECTION_REASONS_BY_CATEGORY = REJECTION_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = Object.values(REJECTION_REASONS).filter(r => r.category === cat);
    return acc;
}, {});

export function getReason(code) {
    if (!code) return null;
    return REJECTION_REASONS[code] || null;
}

export function formatDecisionReason(code, notes = '') {
    const item = getReason(code);
    const trimmedNotes = (notes || '').trim();

    if (!item) {
        return trimmedNotes;
    }

    const header = `[${item.category} - ${item.label}]`;
    if (!trimmedNotes) {
        return `${header} ${item.description}`;
    }

    return `${header} ${trimmedNotes}`;
}
