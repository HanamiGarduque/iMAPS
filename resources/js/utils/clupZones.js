// Official CLUP 2030 zoning codes → label, category and map colour.
//
// Single source of truth for zone colour. Dashboard.jsx used to keep its own
// `zoningPlanColors` table in parallel with the panel's `ZONE_MAP`, so the same
// parcel could render one colour on the map and another in the breakdown.
//
// The palette is a flattened, muted reading of the official CLUP scheme, tuned
// for the light #F8F9FA canvas. The previous values were raw QGIS render
// colours (#fffc2b, #eb3356, #de29c0, #36ff39) — fully saturated neon that
// vibrated against each other and blew out any data drawn on top. Hues are
// preserved so the map still matches the printed plan; only the saturation and
// value are brought down to a flat cartographic range.
//
// These are *categorical* colours for zone types. The diversity score has its
// own sequential scale in diversityTheme.js; the two never share a swatch.

export const ZONE_CATEGORIES = {
    agricultural: { label: "Agricultural", fill: "#a8c68f", stroke: "#7d9c66" },
    forest: { label: "Forest & Protection", fill: "#6e9b5f", stroke: "#4f7343" },
    residential: { label: "Residential", fill: "#e8c86a", stroke: "#bb9c3f" },
    commercial: { label: "Commercial", fill: "#c4574d", stroke: "#963f37" },
    industrial: { label: "Industrial", fill: "#9b6a9b", stroke: "#744d74" },
    agroIndustrial: { label: "Agro-Industrial", fill: "#c08aa0", stroke: "#98657b" },
    institutional: { label: "Institutional", fill: "#7a72b5", stroke: "#57508c" },
    parks: { label: "Parks & Cemetery", fill: "#8fbf8f", stroke: "#679467" },
    tourism: { label: "Tourism", fill: "#d9a07a", stroke: "#ad7a56" },
    water: { label: "Water", fill: "#7fb3c4", stroke: "#578b9c" },
    utilities: { label: "Utilities & Roads", fill: "#a3a3a3", stroke: "#7d7d7d" },
};

export const ZONE_MAP = {
    // Agricultural production & protection
    "PDA-SZ": { label: "Production Agricultural Sub-Zone", category: "agricultural" },
    "PTA-SZ-RA": { label: "Protection Agricultural Rice Area", category: "agricultural" },
    "5491-APDA-SZ": { label: "Buffer / Greenbelt Sub-Zone", category: "agricultural" },

    // Forest, watershed & special protection
    "FZ": { label: "Forest Zone", category: "forest" },
    "FR-SZ": { label: "Forest Reserve Sub-Zone", category: "forest" },
    "THSP-SZ": { label: "Tombol Hill Special Protection", category: "forest" },

    // Water
    "WZ": { label: "Water Zone", category: "water" },

    // Residential
    "R1-Z": { label: "Low-Density Residential (R-1)", category: "residential" },
    "R2-Z": { label: "Medium-Density Residential (R-2)", category: "residential" },
    "BR2-SZ": { label: "Basic R-2 Sub-Zone", category: "residential" },
    "MR2-SZ": { label: "Maximum R-2 Sub-Zone", category: "residential" },
    "Residential": { label: "Residential Zone", category: "residential" },

    // Commercial
    "C1-Z": { label: "Commercial-1 Zone (C-1)", category: "commercial" },
    "C2-Z": { label: "Commercial-2 Zone (C-2)", category: "commercial" },

    // Industrial
    "I1-Z": { label: "Light Industrial (I-1)", category: "industrial" },
    "I2-Z": { label: "Medium Industrial (I-2)", category: "industrial" },
    "I3-Z": { label: "Heavy Industrial (I-3)", category: "industrial" },

    // Agro-industrial
    "AgIndZ": { label: "Agri-Industrial Zone", category: "agroIndustrial" },
    "AgIndZ-PTR": { label: "Agri-Industrial Poultry", category: "agroIndustrial" },
    "AgIndZ-PGR": { label: "Agri-Industrial Piggery", category: "agroIndustrial" },

    // Institutional
    "GI-Z": { label: "General Institutional Zone", category: "institutional" },

    // Parks, recreation & cemetery
    "PR-Z": { label: "Parks & Recreation Zone", category: "parks" },
    "C/MP-Z": { label: "Cemetery / Memorial Park", category: "parks" },

    // Tourism
    "T-Z": { label: "Tourism Zone", category: "tourism" },
    "ECT-Z": { label: "Eco-Tourism Zone", category: "tourism" },

    // Utilities, facilities & road network
    "UTS-Z": { label: "Utilities & Transport Zone", category: "utilities" },
    "CMRF": { label: "Materials Recovery Facility", category: "utilities" },
    "ROAD": { label: "Road Network", category: "utilities" },
    "PROPOSED ROAD": { label: "Proposed Bypass Network", category: "utilities" },
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
        fill: category.fill,
        stroke: category.stroke,
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
