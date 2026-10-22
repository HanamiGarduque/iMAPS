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
            change: delta === null ? "" : delta === 0 ? `Same as ${lastYear.label}` : `${delta > 0 ? "+" : "−"}${Math.abs(delta)} from ${lastYear.label}`,
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

// Everything the map callout says about one barangay in the quarter on screen:
// its count and band, the change from a year earlier, what was filed, and the
// quarter that follows.
export function summarizeBarangay({ name, series, activeIndex, activeQuarter, records }) {
    const key = name.trim().toLowerCase();
    const current = series[activeIndex];
    const countOf = (q) => q?.byBgy?.[key] || 0;
    const count = countOf(current);
    const isForecast = Boolean(activeQuarter?.isForecast);

    const lastYear = current
        ? series.find((q) => !q.isForecast && q.total !== null && q.year === current.year - 1 && q.quarter === current.quarter) || null
        : null;
    const delta = lastYear ? count - countOf(lastYear) : null;

    // The quarter after this one. A recorded quarter reads against this one; a
    // forecast against the same quarter a year earlier, since Q1 is the peak.
    const following = series[activeIndex + 1];
    const hasFollowing = Boolean(following) && following.total !== null;
    const followingCount = hasFollowing ? countOf(following) : null;
    const followingBase = !hasFollowing ? null : following.isForecast
        ? series.find((q) => !q.isForecast && q.total !== null && q.year === following.year - 1 && q.quarter === following.quarter) || null
        : current;
    const followingDelta = followingBase ? followingCount - countOf(followingBase) : null;

    const quarterRecords = isForecast || !activeQuarter ? [] : records.filter((r) => {
        const d = r.created_at ? new Date(r.created_at) : null;
        return d && !isNaN(d.getTime()) && d.getFullYear() === activeQuarter.year && Math.floor(d.getMonth() / 3) + 1 === activeQuarter.quarter;
    });
    const tally = {};
    quarterRecords.forEach((r) => {
        const t = r.target_land_use_class || "Other";
        tally[t] = (tally[t] || 0) + 1;
    });
    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    const rest = sorted.slice(3).reduce((sum, [, n]) => sum + n, 0);
    const typeCounts = rest ? [...sorted.slice(0, 3), ["Other", rest]] : sorted.slice(0, 3);

    return {
        count,
        band: getTrendsDemandColor(count),
        isForecast,
        lastYear,
        delta,
        following: hasFollowing ? following : null,
        followingCount,
        followingBase,
        followingDelta,
        typeCounts,
        quarterRecordCount: quarterRecords.length,
    };
}
