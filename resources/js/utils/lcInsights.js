import { getTrendsDemandColor } from "@/Components/Maps/LeafletMap";

// One entry per barangay (keyed by lower-cased name): the demand class the maps
// paint, plus a sentence for hover that adds the change from the same quarter
// a year earlier.
const ordinal = (n) => {
    const v = n % 100;
    return `${n}${["th", "st", "nd", "rd"][(v - 20) % 10] || ["th", "st", "nd", "rd"][v] || "th"}`;
};

export function buildLcView({ names, current, lastYear, total }) {
    const view = {};
    const counts = names.map((n) => current?.byBgy?.[n.trim().toLowerCase()] || 0);
    names.forEach((name) => {
        const key = name.trim().toLowerCase();
        const count = current?.byBgy?.[key] || 0;
        const band = getTrendsDemandColor(count);
        const delta = lastYear ? count - (lastYear.byBgy?.[key] || 0) : null;
        const changeText = delta === null ? "" : delta === 0 ? `unchanged vs ${lastYear.label}` : `${delta > 0 ? "up" : "down"} ${Math.abs(delta)} vs ${lastYear.label}`;
        const rank = 1 + counts.filter((c) => c > count).length;
        const tied = counts.filter((c) => c === count).length > 1;
        view[key] = {
            // For the callout on the map: where it stands, and how it moved.
            meta: `${band.label.replace(/ (Demand|Activity)$/, "")} · ${tied ? "tied " : ""}${ordinal(rank)}${total ? ` of ${total}` : ""}`,
            change: delta === null ? "" : delta === 0 ? `Same as ${lastYear.label}` : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)} ${delta > 0 ? "more" : "fewer"} than ${lastYear.label}`,
            color: band.color,
            stroke: band.stroke,
            min: band.min,
            label: [band.label, changeText].filter(Boolean).join(" · "),
            delta,
        };
    });
    return view;
}

// Half of the quarter's filings come from how many barangays?
export function concentration(counts) {
    const sorted = [...counts].filter((n) => n > 0).sort((a, b) => b - a);
    const total = sorted.reduce((s, n) => s + n, 0);
    if (!total) return null;
    let sum = 0;
    let k = 0;
    while (sum * 2 < total) sum += sorted[k++];
    return { total, k, of: counts.length };
}
