// Single source of truth for the Diversity Index visual language, shared by the
// 2D map, the 3D map, the legend and the intelligence panel.
//
// Palette note: this module used to carry the Viridis ramp, whose bright end
// (#fde725) is unreadable on the light canvas this view now uses, and whose
// smooth gradient implied a continuum the stepped legend never delivered. The
// scale below is a flat, print-safe five-step sequential ramp (ColorBrewer
// Purples). Each map layer has its own hue family so a glance tells them
// apart: LC demand is YlOrRd, application load YlGnBu, diversity purple.
// As on the LC demand map, the lowest class is near-white and carries a
// coloured outline, so it stays visible against the canvas.
//
// It is deliberately a *sequential* scale, not the categorical CLUP palette:
// the diversity index is a continuous 0–1 score, while CLUP codes are zone
// types. CLUP colours live in clupZones.js and paint the zoning parcels; this
// ramp paints the score. Keeping the two separate is what stops the map's
// colour and the legend's filter from meaning two different things.

// Cut-offs are on the normalised Shannon index (0–1 over the 10 CLUP
// categories counted; utilities and roads are left out). Entropy runs lower than the Simpson index the bands were first
// drawn for, so they sit lower: across Rosario's barangays the recorded mix
// spans roughly 0.10–0.70.
export const DIVERSITY_TIERS = [
    {
        id: "high",
        tier: "high",
        min: 0.60,
        max: Infinity,
        label: "High Mix (≥ 0.60)",
        shortLabel: "High Mix",
        fill: "#14476b",
        stroke: "#0c2f48",
        onFill: "#ffffff",
        classification: "High Urban Mix",
        summary: "Main commercial and residential area with a good mix of shops, public facilities, and housing.",
    },
    {
        id: "diverse",
        tier: "diverse",
        min: 0.45,
        max: 0.60,
        label: "Diverse (0.45–0.59)",
        shortLabel: "Diverse",
        fill: "#2f8a99",
        stroke: "#226673",
        onFill: "#ffffff",
        classification: "Active Growth Area",
        summary: "Growing area that mixes housing subdivisions, public facilities, and businesses.",
    },
    {
        id: "moderate",
        tier: "moderate",
        min: 0.30,
        max: 0.45,
        label: "Balanced (0.30–0.44)",
        shortLabel: "Balanced",
        fill: "#6fbcb8",
        stroke: "#4c9592",
        onFill: "#0f172a",
        classification: "Balanced Town",
        summary: "An area where farms and established housing communities exist together.",
    },
    {
        id: "developing",
        tier: "developing",
        min: 0.15,
        max: 0.30,
        label: "Rural (0.15–0.29)",
        shortLabel: "Rural",
        fill: "#b9dfdc",
        stroke: "#86bdb9",
        onFill: "#0f172a",
        classification: "Rural Community",
        summary: "Mostly farming area with scattered houses.",
    },
    {
        id: "monoculture",
        tier: "monoculture",
        min: -Infinity,
        max: 0.15,
        label: "Specialized Ag (< 0.15)",
        shortLabel: "Specialized Ag",
        fill: "#eef6f6",
        stroke: "#a9cfcd",
        onFill: "#0f172a",
        classification: "Farming Area",
        summary: "Protected farming area with very few buildings for other uses.",
    },
];

// The same five tiers as a single blue family, for the Overview page's all-blue
// palette. Keyed by tier id; each tier's `onFill` still reads on these.
export const DIVERSITY_BLUES = {
    high: "#1e3a8a",
    diverse: "#1d4ed8",
    moderate: "#3b82f6",
    developing: "#93c5fd",
    monoculture: "#dbeafe",
};

// A period with too few filings to score. Drawn grey, never as a low score.
export const NO_DATA_TIER = {
    id: "nodata",
    tier: "nodata",
    label: "Too few records",
    shortLabel: "No data",
    fill: "#e2e8f0",
    stroke: "#94a3b8",
    onFill: "#334155",
    classification: "Too few records",
    summary: "Fewer than five filings with a lot area in this period, too few to score.",
};

export function getDiversityTheme(score) {
    const s = typeof score === "number" ? score : parseFloat(score) || 0;
    return DIVERSITY_TIERS.find((t) => s >= t.min) || DIVERSITY_TIERS[DIVERSITY_TIERS.length - 1];
}

export function getDiversityColor(score) {
    return getDiversityTheme(score).fill;
}

export function getTierById(tierId) {
    return DIVERSITY_TIERS.find((t) => t.id === tierId) || null;
}

// Aggregates a list of { name, diversity } entries (e.g. bgyStats) into
// municipal mean / rank helpers so panels never have to hardcode a mean score.
export function computeDiversityAggregates(entries) {
    const list = (entries || []).filter((e) => typeof e?.diversity === "number" && !Number.isNaN(e.diversity));
    if (list.length === 0) {
        return { mean: 0, count: 0, ranked: [] };
    }
    const ranked = [...list].sort((a, b) => b.diversity - a.diversity);
    const mean = ranked.reduce((sum, e) => sum + e.diversity, 0) / ranked.length;
    return { mean, count: ranked.length, ranked };
}

export function findRank(rankedList, name) {
    if (!name) return null;
    const idx = rankedList.findIndex((e) => (e.name || "").toLowerCase() === name.toLowerCase());
    if (idx === -1) return null;
    return { rank: idx + 1, total: rankedList.length, percentile: Math.round((1 - idx / rankedList.length) * 100) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Lenses
//
// A lens binds one backend metric to a colour scale, a prism height, and the
// copy that explains it, so the map, the legend and the side panel can never
// disagree. The mix lens reads the normalised Shannon index LandUseMixService
// computes from recorded filings (the CLUP 2030 plan mix is its baseline). A
// null score means too few records, and resolves to NO_DATA_TIER.
// ─────────────────────────────────────────────────────────────────────────────

// Prism heights in metres, kept low enough that the town reads as a massing
// model rather than a forest of towers.
const HEIGHT_FLOOR = 140;
const HEIGHT_CEIL = 1250;

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function lerpHeight(t) {
    return Math.round(HEIGHT_FLOOR + clamp(t, 0, 1) * (HEIGHT_CEIL - HEIGHT_FLOOR));
}

const isScore = (value) => typeof value === "number" && !Number.isNaN(value);

function toNumber(value, fallback = 0) {
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

export const DIVERSITY_LENSES = [
    {
        id: "mix",
        label: "Land Use Mix",
        shortLabel: "Mix",
        tabLabel: "Overview",
        metricLabel: "Mix Score",
        question: "How varied is the land being developed in this barangay?",
        caption: "Mix Score (normalised Shannon index over 10 CLUP land-use categories; utilities and roads not counted) of the lot area recorded in clearances, certificates and permits, compared with the CLUP 2030 plan mix.",
        heightNote: "Height & colour = recorded mix (0.00 – 1.00)",
        bands: DIVERSITY_TIERS,
        domain: [0, 1],
        getValue: (stat) => {
            const v = stat?.diversity;
            return v === null || v === undefined || v === "" ? null : toNumber(v);
        },
        format: (value) => (isScore(value) ? value.toFixed(2) : "—"),
        getBand: (value) => (isScore(value) ? getDiversityTheme(value) : NO_DATA_TIER),
        // No score: a flat footprint rather than the shortest prism.
        getHeight: (value) => (isScore(value) ? lerpHeight(clamp(value, 0, 1)) : 20),
    },
];

export function getLens(lensId) {
    return DIVERSITY_LENSES.find((l) => l.id === lensId) || DIVERSITY_LENSES[0];
}

// The same swatches, each carrying the fraction of the lens domain it actually
// covers.
//
// The legend used to draw every band at equal width while positioning the
// municipal-average marker proportionally along the domain, so the two
// disagreed: drift's `on_target` spans ±0.05 of a −0.3…+0.3 domain (17%) but was
// drawn at 33%, which could park the marker over `sprawl` while the town was in
// fact on target. Weighting each step by its real span makes the marker land on
// the band it belongs to.
export function getScaleSegments(lensId) {
    const lens = getLens(lensId);
    const [domainMin, domainMax] = lens.domain;
    const span = domainMax - domainMin || 1;

    // bands run high → low; walk them in that order to find each one's ceiling.
    const withRanges = lens.bands.map((band, i) => {
        const upper = i === 0 ? domainMax : lens.bands[i - 1].min;
        const lower = band.min;
        return {
            band,
            lo: clamp(lower === -Infinity ? domainMin : lower, domainMin, domainMax),
            hi: clamp(upper === Infinity ? domainMax : upper, domainMin, domainMax),
        };
    });

    return withRanges
        .map((r) => ({ ...r.band, lo: r.lo, hi: r.hi, weight: Math.max(0.0001, (r.hi - r.lo) / span) }))
        .reverse();
}

// Resolves a barangay stat record into everything the map needs to draw it
// under the active lens: the raw metric, its band, its colour and its height.
export function resolveLensValue(lensId, stat) {
    const lens = getLens(lensId);
    const value = lens.getValue(stat);
    const band = lens.getBand(value);
    return {
        lens,
        value,
        band,
        color: band.fill,
        stroke: band.stroke,
        onFill: band.onFill || "#ffffff",
        height: lens.getHeight(value),
        formatted: lens.format(value),
    };
}

// Band membership for the legend's click-to-filter, across every lens.
export function matchesBand(lensId, bandId, stat) {
    if (!bandId || bandId === "all") return true;
    const lens = getLens(lensId);
    return lens.getBand(lens.getValue(stat)).id === bandId;
}

// Per-band barangay counts for the active lens, so legend chips show real
// numbers instead of the hardcoded counts the old legend carried.
export function computeBandCounts(lensId, bgyStats) {
    const lens = getLens(lensId);
    const counts = {};
    lens.bands.forEach((b) => { counts[b.id] = 0; });
    Object.values(bgyStats || {}).forEach((stat) => {
        if (!stat) return;
        const raw = lens.getValue(stat);
        if (typeof raw !== "number" || Number.isNaN(raw)) return;
        const band = lens.getBand(raw);
        if (counts[band.id] !== undefined) counts[band.id] += 1;
    });
    return counts;
}

// Ranks every barangay by the lens's metric, high → low.
export function rankByLens(lensId, bgyStats) {
    const lens = getLens(lensId);
    const rows = Object.entries(bgyStats || {})
        .map(([name, stat]) => {
            const raw = lens.getValue(stat);
            if (typeof raw !== "number" || Number.isNaN(raw)) return null;
            return { name, value: raw, stat, band: lens.getBand(raw) };
        })
        .filter(Boolean);

    return rows.sort((a, b) => b.value - a.value);
}
