// Single source of truth for the Diversity Index visual language, shared by the
// 2D map, the 3D map, the legend and the intelligence panel.
//
// Palette note: this module used to carry the Viridis ramp, whose bright end
// (#fde725) is unreadable on the light canvas this view now uses, and whose
// smooth gradient implied a continuum the stepped legend never delivered. The
// scale below is a flat, print-safe five-step sequential ramp (ColorBrewer
// YlGnBu with its lightest class dropped, so the low end stays visible
// against #F8F9FA).
//
// It is deliberately a *sequential* scale, not the categorical CLUP palette:
// the diversity index is a continuous 0–1 score, while CLUP codes are zone
// types. CLUP colours live in clupZones.js and paint the zoning parcels; this
// ramp paints the score. Keeping the two separate is what stops the map's
// colour and the legend's filter from meaning two different things.

export const DIVERSITY_TIERS = [
    {
        id: "high",
        tier: "high",
        min: 0.75,
        max: Infinity,
        label: "High Mix (≥ 0.75)",
        shortLabel: "High Mix",
        fill: "#253494",
        stroke: "#1a2570",
        onFill: "#ffffff",
        classification: "High Urban Mix",
        summary: "Core commercial and residential district with balanced integration of retail, institutional, and high-density housing.",
    },
    {
        id: "diverse",
        tier: "diverse",
        min: 0.60,
        max: 0.75,
        label: "Diverse (0.60–0.74)",
        shortLabel: "Diverse",
        fill: "#2a76ab",
        stroke: "#1d5578",
        onFill: "#ffffff",
        classification: "Diverse Growth Node",
        summary: "Active growth corridor integrating residential subdivisions, institutional facilities, and commercial activities.",
    },
    {
        id: "moderate",
        tier: "moderate",
        min: 0.40,
        max: 0.60,
        label: "Balanced (0.40–0.59)",
        shortLabel: "Balanced",
        fill: "#31a0a9",
        stroke: "#217680",
        onFill: "#0f172a",
        classification: "Balanced Agro-Town",
        summary: "Agro-urban settlement characterized by agricultural land coexisting with established residential communities.",
    },
    {
        id: "developing",
        tier: "developing",
        min: 0.20,
        max: 0.40,
        label: "Rural (0.20–0.39)",
        shortLabel: "Rural",
        fill: "#7fcdbb",
        stroke: "#4aa392",
        onFill: "#0f172a",
        classification: "Rural Agro-Community",
        summary: "Predominantly rural agricultural landscape with low-density residential settlements.",
    },
    {
        id: "monoculture",
        tier: "monoculture",
        min: -Infinity,
        max: 0.20,
        label: "Specialized Ag (< 0.20)",
        shortLabel: "Specialized Ag",
        fill: "#c7e9b4",
        stroke: "#7ab648",
        onFill: "#0f172a",
        classification: "Specialized Agriculture",
        summary: "Dedicated agricultural production zone under CLUP 2030 protection with minimal non-agricultural land uses.",
    },
];

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
// drift apart. Both lenses read fields DashboardController already computes:
//   mix   → diversity   (live Simpson index, permit-integrated)
//   drift → variance    (live index − CLUP 2030 target index)
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

function toNumber(value, fallback = 0) {
    if (typeof value === "number" && !Number.isNaN(value)) return value;
    const parsed = parseFloat(value);
    return Number.isNaN(parsed) ? fallback : parsed;
}

// Flat diverging set for plan drift. Ordered high → low so `find(v >= band.min)`
// resolves the same way DIVERSITY_TIERS does.
//
// The midpoint is a warm neutral, not a green. This scale was red/amber/green
// until a colour-vision check showed `sprawl` and `on_target` collapsing to an
// RGB distance of 43 under deuteranopia — the two most operationally opposite
// states on the map becoming indistinguishable for roughly 8% of men. A
// diverging scale's midpoint should be neutral anyway: saturated ends mean
// "something is happening in this direction", and the middle means "nothing to
// see here". Red ↔ neutral ↔ blue keeps the ends 96 apart under both
// deuteranopia and protanopia.
export const DRIFT_BANDS = [
    {
        id: "sprawl",
        min: 0.05,
        label: "Commercial Sprawl (> +0.05)",
        shortLabel: "Sprawl",
        fill: "#c0504d",
        stroke: "#8c3936",
        onFill: "#ffffff",
        classification: "Commercial Sprawl Alert",
        summary: "On-the-ground permitting is diversifying faster than CLUP 2030 anticipated — conversion pressure is outrunning the plan.",
    },
    {
        id: "on_target",
        min: -0.05,
        label: "On Target (±0.05)",
        shortLabel: "On Target",
        fill: "#cfc9bd",
        stroke: "#a49c8c",
        onFill: "#0f172a",
        classification: "On-Target Alignment",
        summary: "Live land-use mix is tracking the CLUP 2030 target within tolerance. No corrective action indicated.",
    },
    {
        id: "lagging",
        min: -Infinity,
        label: "Development Lagging (< −0.05)",
        shortLabel: "Lagging",
        fill: "#4a6fa5",
        stroke: "#345080",
        onFill: "#ffffff",
        classification: "Development Lagging",
        summary: "Actual mix is less diverse than the plan calls for — programmed growth has not materialised on the ground.",
    },
];

function bandFor(bands, value) {
    const v = toNumber(value);
    return bands.find((b) => v >= b.min) || bands[bands.length - 1];
}

export const DIVERSITY_LENSES = [
    {
        id: "mix",
        label: "Land Use Mix",
        shortLabel: "Mix",
        tabLabel: "Overview",
        metricLabel: "Simpson's Index",
        question: "How varied is this barangay's land use right now?",
        caption: "Live Simpson's Diversity Index, recomputed from CLUP 2030 areas plus every approved zoning permit.",
        heightNote: "Height & colour = live mix (0.00 – 1.00)",
        bands: DIVERSITY_TIERS,
        domain: [0, 1],
        getValue: (stat) => toNumber(stat?.diversity),
        format: (value) => toNumber(value).toFixed(2),
        getBand: (value) => getDiversityTheme(value),
        getHeight: (value) => lerpHeight(clamp(toNumber(value), 0, 1)),
    },
    {
        id: "drift",
        label: "CLUP Plan Drift",
        shortLabel: "Drift",
        tabLabel: "Plan Drift",
        metricLabel: "Variance vs CLUP 2030",
        question: "Is permitting on the ground pulling away from the 2030 plan?",
        caption: "Live mix minus the CLUP 2030 target mix. Positive means reality is diversifying ahead of the plan; negative means programmed growth has not arrived.",
        heightNote: "Height = size of the gap · colour = its direction",
        bands: DRIFT_BANDS,
        domain: [-0.3, 0.3],
        getValue: (stat) => toNumber(stat?.variance),
        format: (value) => {
            const v = toNumber(value);
            return (v > 0 ? "+" : "") + v.toFixed(2);
        },
        getBand: (value) => bandFor(DRIFT_BANDS, value),
        // Height encodes magnitude only — direction is carried by colour, so a
        // badly lagging barangay stands as tall as a badly sprawling one.
        getHeight: (value) => lerpHeight(clamp(Math.abs(toNumber(value)) / 0.3, 0, 1)),
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

// Ranks every barangay by the active lens's metric. `drift` ranks by absolute
// gap (worst offenders first, in either direction); `mix` ranks high → low.
export function rankByLens(lensId, bgyStats) {
    const lens = getLens(lensId);
    const rows = Object.entries(bgyStats || {})
        .map(([name, stat]) => {
            const raw = lens.getValue(stat);
            if (typeof raw !== "number" || Number.isNaN(raw)) return null;
            return { name, value: raw, stat, band: lens.getBand(raw) };
        })
        .filter(Boolean);

    const score = lensId === "drift" ? (r) => Math.abs(r.value) : (r) => r.value;
    return rows.sort((a, b) => score(b) - score(a));
}
