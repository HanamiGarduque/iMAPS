// Official CLUP 2030 zoning codes → label, category and map colour.
//
// Single source of truth for zone colour. Dashboard.jsx used to keep its own
// `zoningPlanColors` table in parallel with the panel's `ZONE_MAP`, so the same
// parcel could render one colour on the map and another in the breakdown.
//
// The palette uses the official QGIS render colours (#fffc2b, #eb3356, #de29c0, #36ff39) 
// to ensure the map exactly matches the printed CLUP plan.
//
// These are *categorical* colours for zone types. The diversity score has its
// own sequential scale in diversityTheme.js; the two never share a swatch.

export const ZONE_CATEGORIES = {
    agricultural: { label: "Agricultural", fill: "#94d180", stroke: "#73a562" },
    forest: { label: "Forest & Protection", fill: "#5bb93c", stroke: "#479330" },
    residential: { label: "Residential", fill: "#fffc2b", stroke: "#ccca22" },
    commercial: { label: "Commercial", fill: "#eb3356", stroke: "#bc2945" },
    industrial: { label: "Industrial", fill: "#de29c0", stroke: "#b2219a" },
    agroIndustrial: { label: "Agro-Industrial", fill: "#ff7cae", stroke: "#cc638b" },
    institutional: { label: "Institutional", fill: "#6146db", stroke: "#4e38af" },
    parks: { label: "Parks & Cemetery", fill: "#36ff39", stroke: "#2bcc2e" },
    tourism: { label: "Tourism", fill: "#ffa97a", stroke: "#cc8762" },
    water: { label: "Water", fill: "#2dcacd", stroke: "#24a2a4" },
    utilities: { label: "Utilities & Roads", fill: "#969696", stroke: "#787878" },
};

export const ZONE_MAP = {
    // Agricultural production & protection
    "PDA-SZ": { label: "Production Agricultural Sub-Zone", category: "agricultural", fill: "#94d180", stroke: "#73a562" },
    "PTA-SZ-RA": { label: "Protection Agricultural Rice Area", category: "agricultural", fill: "#94d180", pattern: "pattern-gray-line-94d180", stroke: "#73a562" },
    "5491-APDA-SZ": { label: "Buffer / Greenbelt Sub-Zone", category: "agricultural", fill: "#61631f", stroke: "#4a4c18" },

    // Forest, watershed & special protection
    "FZ": { label: "Forest Zone", category: "forest", fill: "#5bb93c", stroke: "#479330" },
    "FR-SZ": { label: "Forest Reserve Sub-Zone", category: "forest", fill: "#5bb93c", pattern: "pattern-darkgreen-line-5bb93c", stroke: "#479330" },
    "THSP-SZ": { label: "Tombol Hill Special Protection", category: "forest", fill: "#5bb93c", pattern: "pattern-darkgreen-line-5bb93c", stroke: "#479330" },

    // Water
    "WZ": { label: "Water Zone", category: "water", fill: "#2dcacd", stroke: "#24a2a4" },

    // Residential
    "R1-Z": { label: "Low-Density Residential (R-1)", category: "residential", fill: "#fffc2b", stroke: "#ccca22" },
    "R2-Z": { label: "Medium-Density Residential (R-2)", category: "residential", fill: "#fffc2b", stroke: "#ccca22" },
    "BR2-SZ": { label: "Basic R-2 Sub-Zone", category: "residential", fill: "#ffc92b", pattern: "pattern-gray-line-ffc92b", stroke: "#cca122" },
    "MR2-SZ": { label: "Maximum R-2 Sub-Zone", category: "residential", fill: "#ffc92b", pattern: "pattern-gray-line-ffc92b", stroke: "#cca122" },
    "Residential": { label: "Residential Zone", category: "residential", fill: "#fffc2b", stroke: "#ccca22" },

    // Commercial
    "C1-Z": { label: "Commercial-1 Zone (C-1)", category: "commercial", fill: "#eb3356", stroke: "#bc2945" },
    "C2-Z": { label: "Commercial-2 Zone (C-2)", category: "commercial", fill: "#eb3356", stroke: "#bc2945" },

    // Industrial
    "I1-Z": { label: "Light Industrial (I-1)", category: "industrial", fill: "#de29c0", stroke: "#b2219a" },
    "I2-Z": { label: "Medium Industrial (I-2)", category: "industrial", fill: "#de29c0", stroke: "#b2219a" },
    "I3-Z": { label: "Heavy Industrial (I-3)", category: "industrial", fill: "#de29c0", stroke: "#b2219a" },

    // Agro-industrial
    "AgIndZ": { label: "Agri-Industrial Zone", category: "agroIndustrial", fill: "#ff7cae", stroke: "#cc638b" },
    "AgIndZ-PTR": { label: "Agri-Industrial Poultry", category: "agroIndustrial", fill: "#ff7cae", stroke: "#cc638b" },
    "AgIndZ-PGR": { label: "Agri-Industrial Piggery", category: "agroIndustrial", fill: "#ff7cae", stroke: "#cc638b" },

    // Institutional
    "GI-Z": { label: "General Institutional Zone", category: "institutional", fill: "#6146db", stroke: "#4e38af" },

    // Parks, recreation & cemetery
    "PR-Z": { label: "Parks & Recreation Zone", category: "parks", fill: "#36ff39", stroke: "#2bcc2e" },
    "C/MP-Z": { label: "Cemetery / Memorial Park", category: "parks", fill: "#36ff39", stroke: "#2bcc2e" },

    // Tourism
    "T-Z": { label: "Tourism Zone", category: "tourism", fill: "#ffa97a", stroke: "#cc8762" },
    "ECT-Z": { label: "Eco-Tourism Zone", category: "tourism", fill: "#ffa97a", stroke: "#cc8762" },

    // Utilities, facilities & road network
    "UTS-Z": { label: "Utilities & Transport Zone", category: "utilities", fill: "#969696", stroke: "#787878" },
    "CMRF": { label: "Materials Recovery Facility", category: "utilities", fill: "#969696", stroke: "#787878" },
    "ROAD": { label: "Road Network", category: "utilities", fill: "#969696", stroke: "#787878" },
    "PROPOSED ROAD": { label: "Proposed Bypass Network", category: "utilities", fill: "#969696", pattern: "pattern-gray-line-969696", stroke: "#787878" },
};

const UNDESIGNATED = { label: "Undesignated", code: "", category: "utilities", fill: "#cbd5e1", stroke: "#94a3b8" };

export function getZoneInfo(code) {
    const key = String(code || "").trim();
    if (!key) return { ...UNDESIGNATED };

    const entry = ZONE_MAP[key];
    if (!entry) {
        // Unknown code: show it verbatim rather than silently mislabelling it.
        return { ...UNDESIGNATED, label: key, code: key };
    }

    const category = ZONE_CATEGORIES[entry.category] || ZONE_CATEGORIES.utilities;
    return {
        label: entry.label,
        code: key,
        category: entry.category,
        categoryLabel: category.label,
        fill: entry.fill || category.fill,
        stroke: entry.stroke || category.stroke,
        pattern: entry.pattern,
    };
}

// Compact key for the legend: one swatch per category rather than one per code,
// since the full 30-code table is unreadable at legend size.
export const ZONE_CATEGORY_LEGEND = [
    "agricultural",
    "forest",
    "residential",
    "commercial",
    "industrial",
    "agroIndustrial",
    "institutional",
    "parks",
    "tourism",
    "water",
    "utilities",
].map((id) => ({ id, ...ZONE_CATEGORIES[id] }));
