/**
 * Rosario, Batangas Grounded Establishment Registry (2020 - 2026)
 * Sourced from Google Maps landmarks, municipal planning records, and CLUP 2030 development horizon.
 */
export const ROSARIO_GROWTH_ESTABLISHMENTS = [
    // ── 2020: Baseline CLUP Horizon ──
    {
        id: "est-1",
        name: "Puregold Rosario",
        category: "Commercial Retail",
        type: "supermarket",
        barangay: "Poblacion C",
        coords: [13.8488, 121.2062],
        year: 2020,
        description: "Primary supermarket anchor along the Rosario-San Juan-Candelaria Road.",
        badge: "Supermarket",
        color: "#f59e0b",
        bg: "#fef3c7",
    },
    {
        id: "est-2",
        name: "Jollibee Rosario Gualberto",
        category: "Commercial Dining",
        type: "dining",
        barangay: "Poblacion B",
        coords: [13.8472, 121.2052],
        year: 2020,
        description: "Flagship quick-service dining center at Gualberto St. corner Carandang St.",
        badge: "Fast Food",
        color: "#ef4444",
        bg: "#fee2e2",
    },
    {
        id: "est-3",
        name: "McDonald's Rosario",
        category: "Commercial Dining",
        type: "dining",
        barangay: "Poblacion A",
        coords: [13.8462, 121.2038],
        year: 2020,
        description: "High-volume commercial restaurant serving the central Poblacion district.",
        badge: "Fast Food",
        color: "#ef4444",
        bg: "#fee2e2",
    },
    {
        id: "est-4",
        name: "BatStateU Rosario Campus",
        category: "Institutional",
        type: "education",
        barangay: "Namunga",
        coords: [13.8410, 121.2135],
        year: 2020,
        description: "Premier state university educational campus and technical innovation hub.",
        badge: "University",
        color: "#6366f1",
        bg: "#e0e7ff",
    },
    {
        id: "est-5",
        name: "Blue Diamond Feed Mills",
        category: "Agro-Industrial",
        type: "agro-industrial",
        barangay: "San Carlos",
        coords: [13.8615, 121.2190],
        year: 2020,
        description: "Large-scale animal feed manufacturing and agro-processing facility.",
        badge: "Feed Mill",
        color: "#8b5cf6",
        bg: "#f3e8ff",
    },
    {
        id: "est-6",
        name: "Sto. Rosario Hospital",
        category: "Healthcare",
        type: "healthcare",
        barangay: "Poblacion D",
        coords: [13.8492, 121.2082],
        year: 2020,
        description: "Central community general healthcare and emergency medical hospital.",
        badge: "Hospital",
        color: "#ec4899",
        bg: "#fce7f3",
    },

    // ── 2021: Post-Pandemic Regional Corridor Recovery ──
    {
        id: "est-7",
        name: "Lumina Homes Rosario (Phase 1)",
        category: "Residential Community",
        type: "residential",
        barangay: "Quilib",
        coords: [13.8675, 121.1945],
        year: 2021,
        description: "Affordable master-planned residential housing expansion community in Quilib.",
        badge: "Subdivision",
        color: "#10b981",
        bg: "#d1fae5",
    },
    {
        id: "est-8",
        name: "Nutrimeal Agri-Business Plant",
        category: "Agro-Industrial",
        type: "agro-industrial",
        barangay: "San Ignacio",
        coords: [13.8325, 121.2085],
        year: 2021,
        description: "Modernized agricultural feeds logistics and distribution node.",
        badge: "Agri-Industry",
        color: "#8b5cf6",
        bg: "#f3e8ff",
    },

    // ── 2022: Highway Transit & Residential Sprawl ──
    {
        id: "est-9",
        name: "Jollibee Rosario Highway",
        category: "Commercial Dining",
        type: "dining",
        barangay: "Namunga",
        coords: [13.8385, 121.2165],
        year: 2022,
        description: "Drive-thru highway transit branch along the Lipa-Rosario arterial route.",
        badge: "Drive-Thru",
        color: "#ef4444",
        bg: "#fee2e2",
    },
    {
        id: "est-10",
        name: "Lumina Rosario Phase 2 Expansion",
        category: "Residential Community",
        type: "residential",
        barangay: "Quilib",
        coords: [13.8690, 121.1955],
        year: 2022,
        description: "Additional 350-unit residential expansion cluster with commercial spaces.",
        badge: "Housing Expansion",
        color: "#10b981",
        bg: "#d1fae5",
    },

    // ── 2023: Major Commercial Landmark & Bypass Road ──
    {
        id: "est-11",
        name: "Citimart Rosario Shopping Complex",
        category: "Commercial Mall",
        type: "mall",
        barangay: "Namunga",
        coords: [13.8395, 121.2142],
        year: 2023,
        description: "Grand opened Dec 15, 2023. Premier 3-story shopping mall and supermarket hub in eastern Batangas.",
        badge: "Major Mall",
        color: "#f43f5e",
        bg: "#ffe4e6",
        isMajorLandmark: true,
    },
    {
        id: "est-12",
        name: "Rosario Bypass Road (Namunga-Namuco)",
        category: "Infrastructure",
        type: "infrastructure",
        barangay: "Namunga",
        coords: [13.8480, 121.2210],
        year: 2023,
        description: "Key traffic-diversion arterial bypass connecting commercial traffic around town center.",
        badge: "Bypass Road",
        color: "#2563eb",
        bg: "#dbeafe",
        isMajorLandmark: true,
    },

    // ── 2024: Public Facilities & Modern Sports Infrastructure ──
    {
        id: "est-13",
        name: "New Rosario Modern Public Market",
        category: "Commercial / Public",
        type: "market",
        barangay: "San Roque",
        coords: [13.8550, 121.1990],
        year: 2024,
        description: "State-of-the-art multi-zone municipal public market and agricultural trade facility.",
        badge: "Public Market",
        color: "#ea580c",
        bg: "#ffedd5",
        isMajorLandmark: true,
    },
    {
        id: "est-14",
        name: "Rosario Municipal Sports Stadium",
        category: "Civic / Sports",
        type: "civic",
        barangay: "San Roque",
        coords: [13.8570, 121.1970],
        year: 2024,
        description: "Major municipal stadium and regional athletic complex in San Roque.",
        badge: "Sports Stadium",
        color: "#059669",
        bg: "#d1fae5",
        isMajorLandmark: true,
    },
    {
        id: "est-15",
        name: "Town & Country Rosario (Active Group)",
        category: "Residential Community",
        type: "residential",
        barangay: "Bagong Pook",
        coords: [13.8340, 121.2310],
        year: 2024,
        description: "High-end master-planned subdivision development by Active Group broke ground.",
        badge: "Master-Planned",
        color: "#10b981",
        bg: "#d1fae5",
    },

    // ── 2025: Regional Healthcare & Connecting Arterials ──
    {
        id: "est-16",
        name: "Rosario District Hospital Complex",
        category: "Healthcare",
        type: "healthcare",
        barangay: "Santa Cruz",
        coords: [13.8820, 121.1885],
        year: 2025,
        description: "Comprehensive multi-specialty district hospital expanding healthcare reach.",
        badge: "District Hospital",
        color: "#dc2626",
        bg: "#fee2e2",
        isMajorLandmark: true,
    },
    {
        id: "est-17",
        name: "Rosario - Taysan Bypass Connector",
        category: "Infrastructure",
        type: "infrastructure",
        barangay: "Mavalor",
        coords: [13.8510, 121.2225],
        year: 2025,
        description: "Arterial link easing inter-municipal transit and industrial hauling.",
        badge: "Arterial Link",
        color: "#2563eb",
        bg: "#dbeafe",
    },

    // ── 2026: Modern Logistics & Active Permitting Horizon ──
    {
        id: "est-18",
        name: "Bagong Pook Commercial & Logistics Strip",
        category: "Commercial / Logistics",
        type: "logistics",
        barangay: "Bagong Pook",
        coords: [13.8360, 121.2275],
        year: 2026,
        description: "New commercial lots, logistics hubs, and service facilities fronting the bypass.",
        badge: "Logistics Strip",
        color: "#d97706",
        bg: "#fef3c7",
    },
];

/**
 * Get establishments active in or prior to a target year
 */
export const getEstablishmentsForYear = (year) => {
    return ROSARIO_GROWTH_ESTABLISHMENTS.filter((est) => est.year <= year);
};

/**
 * Get establishments specifically added in the current year
 */
export const getNewEstablishmentsForYear = (year) => {
    return ROSARIO_GROWTH_ESTABLISHMENTS.filter((est) => est.year === year);
};

/**
 * Annual growth milestones narrative
 */
export const YEAR_MILESTONES = {
    2020: {
        title: "CLUP 2030 Baseline Adoption",
        desc: "Foundational baseline zoning with central commercial anchors in Poblacion and university node in Namunga.",
        highlightBrgy: "Poblacion B",
        color: "#2563eb",
    },
    2021: {
        title: "Post-Pandemic Corridor Recovery",
        desc: "Groundbreaking of Lumina Homes in Quilib and agro-industrial feedmill expansion in San Ignacio.",
        highlightBrgy: "Quilib",
        color: "#10b981",
    },
    2022: {
        title: "Highway Commercial Strip Expansion",
        desc: "Drive-thru commercial development in Namunga and suburban housing phase 2 in Quilib.",
        highlightBrgy: "Namunga",
        color: "#f59e0b",
    },
    2023: {
        title: "Citimart Mall & Bypass Road",
        desc: "Opening of the landmark Citimart Shopping Complex (Dec 15) and construction of the Namunga-Namuco Bypass.",
        highlightBrgy: "Namunga",
        color: "#f43f5e",
    },
    2024: {
        title: "Sports Stadium & Public Market",
        desc: "Major civic expansion with the new Modern Public Market, Municipal Sports Stadium, and Town & Country development.",
        highlightBrgy: "San Roque",
        color: "#ea580c",
    },
    2025: {
        title: "District Hospital & Regional Links",
        desc: "Rosario District Hospital in Sta. Cruz and arterial connections to Taysan and San Juan.",
        highlightBrgy: "Santa Cruz",
        color: "#dc2626",
    },
    2026: {
        title: "Active Permitting & Logistics Horizon",
        desc: "Current multi-zone growth with 18 major development nodes across commercial, logistics, and residential sectors.",
        highlightBrgy: "Bagong Pook",
        color: "#8b5cf6",
    },
};
