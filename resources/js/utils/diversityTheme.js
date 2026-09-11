// Single source of truth for the Simpson's Diversity Index visual language.
// Used by Dashboard.jsx (2D map), MapLibre3DView.jsx (3D map), MapLegend.jsx,
// and DiversityPanel.jsx so the Viridis color scale + tier thresholds never drift apart.

export const DIVERSITY_TIERS = [
    {
        id: "high",
        tier: "high",
        min: 0.75,
        max: Infinity,
        label: "High Mix (≥ 0.75)",
        shortLabel: "High Mix",
        fill: "#fde725",
        stroke: "#ca8a04",
        classification: "High Urban Mix",
        badgeBg: "bg-yellow-50 text-yellow-950 border-yellow-300",
        lightBg: "#fefce8",
        summary: "Core commercial and residential district with balanced integration of retail, institutional, and high-density housing.",
    },
    {
        id: "diverse",
        tier: "diverse",
        min: 0.60,
        max: 0.75,
        label: "Diverse (0.60–0.74)",
        shortLabel: "Diverse",
        fill: "#5ec962",
        stroke: "#16a34a",
        classification: "Diverse Growth Node",
        badgeBg: "bg-emerald-50 text-emerald-950 border-emerald-300",
        lightBg: "#ecfdf5",
        summary: "Active growth corridor integrating residential subdivisions, institutional facilities, and commercial activities.",
    },
    {
        id: "moderate",
        tier: "moderate",
        min: 0.40,
        max: 0.60,
        label: "Balanced (0.40–0.59)",
        shortLabel: "Balanced",
        fill: "#21918c",
        stroke: "#0f766e",
        classification: "Balanced Agro-Town",
        badgeBg: "bg-teal-50 text-teal-950 border-teal-300",
        lightBg: "#f0fdfa",
        summary: "Agro-urban settlement characterized by agricultural land coexisting with established residential communities.",
    },
    {
        id: "developing",
        tier: "developing",
        min: 0.20,
        max: 0.40,
        label: "Rural (0.20–0.39)",
        shortLabel: "Rural",
        fill: "#3b528b",
        stroke: "#1e3a8a",
        classification: "Rural Agro-Community",
        badgeBg: "bg-indigo-50 text-indigo-950 border-indigo-300",
        lightBg: "#eef2ff",
        summary: "Predominantly rural agricultural landscape with low-density residential settlements.",
    },
    {
        id: "monoculture",
        tier: "monoculture",
        min: -Infinity,
        max: 0.20,
        label: "Specialized Ag (< 0.20)",
        shortLabel: "Specialized Ag",
        fill: "#440154",
        stroke: "#3b0764",
        classification: "Specialized Agriculture",
        badgeBg: "bg-purple-50 text-purple-950 border-purple-300",
        lightBg: "#faf5ff",
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
