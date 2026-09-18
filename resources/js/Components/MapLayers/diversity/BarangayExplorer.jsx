import React, { useMemo, useState } from "react";
import { getLens, rankByLens, matchesBand } from "@/utils/diversityTheme";

// Ranked list of every barangay under the active lens.
//
// Search and the ranked explorer used to be two separate blocks with two
// different orderings; this is one list that filters as you type, respects the
// legend's band filter, and hovers straight onto the map.
export default function BarangayExplorer({
    lens = "mix",
    bandFilter = "all",
    bgyStats = {},
    selectedName = "",
    onSelectBgy = () => {},
    hoveredBgy = null,
    onHoverBgy = () => {},
}) {
    const [query, setQuery] = useState("");
    const [order, setOrder] = useState("top");

    const activeLens = getLens(lens);
    const ranked = useMemo(() => rankByLens(lens, bgyStats), [lens, bgyStats]);

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase();
        const filtered = ranked.filter((r) => {
            if (!matchesBand(lens, bandFilter, r.stat)) return false;
            if (!q) return true;
            return r.name.toLowerCase().includes(q);
        });
        return order === "top" ? filtered : [...filtered].reverse();
    }, [ranked, query, bandFilter, lens, order]);

    // Scale bars against the largest magnitude in view, so a drift list of
    // small values still reads instead of collapsing into slivers.
    const maxMagnitude = useMemo(
        () => Math.max(...rows.map((r) => Math.abs(r.value)), 0.0001),
        [rows]
    );

    const orderLabel = lens === "drift"
        ? (order === "top" ? "Furthest from plan" : "Closest to plan")
        : (order === "top" ? "Highest first" : "Lowest first");

    return (
        <div className="flex flex-col min-h-0 flex-1">
            <div className="px-4 py-2.5 border-b border-slate-200 shrink-0">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <h4 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        All Barangays
                    </h4>
                    <button
                        type="button"
                        onClick={() => setOrder((o) => (o === "top" ? "bottom" : "top"))}
                        className="text-[10px] font-semibold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                        title="Reverse the ranking"
                    >
                        {orderLabel} ⇅
                    </button>
                </div>

                <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 border border-slate-200 rounded-md">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Filter barangays…"
                        className="bg-transparent text-[11.5px] text-slate-900 placeholder-slate-400 focus:outline-none w-full border-0 p-0 focus:ring-0"
                    />
                    <span className="text-[10px] font-mono tabular-nums text-slate-500 font-bold shrink-0">
                        {rows.length}
                    </span>
                </div>
            </div>

            {rows.length === 0 ? (
                <div className="px-4 py-8 text-center">
                    <p className="text-[11.5px] text-slate-600 font-semibold">No barangays match.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                        {bandFilter !== "all"
                            ? "Try clearing the band filter in the legend."
                            : "Try a different search term."}
                    </p>
                </div>
            ) : (
                <div className="flex-1 overflow-y-auto min-h-0">
                    {rows.map((row, idx) => {
                        const isSelected = selectedName && row.name.toLowerCase() === selectedName.toLowerCase();
                        const isHovered = hoveredBgy && row.name.toLowerCase() === hoveredBgy.toLowerCase();
                        const widthPct = Math.max(3, (Math.abs(row.value) / maxMagnitude) * 100);

                        return (
                            <button
                                key={row.name}
                                type="button"
                                onClick={() => onSelectBgy(row.name)}
                                onMouseEnter={() => onHoverBgy(row.name)}
                                onMouseLeave={() => onHoverBgy(null)}
                                onFocus={() => onHoverBgy(row.name)}
                                onBlur={() => onHoverBgy(null)}
                                className={`w-full text-left px-4 py-2 border-b border-slate-100 transition-colors duration-300 cursor-pointer ${
                                    isSelected
                                        ? "bg-slate-900"
                                        : isHovered
                                        ? "bg-slate-100"
                                        : "bg-white hover:bg-slate-50"
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className={`text-[10px] font-mono tabular-nums w-5 shrink-0 ${isSelected ? "text-slate-500" : "text-slate-300"}`}>
                                            {order === "top" ? idx + 1 : rows.length - idx}
                                        </span>
                                        <span
                                            className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                                            style={{ backgroundColor: row.band.fill, outline: `1px solid ${row.band.stroke}` }}
                                        />
                                        <span className={`text-[11.5px] font-semibold truncate ${isSelected ? "text-white" : "text-slate-900"}`}>
                                            {row.name}
                                        </span>
                                    </div>
                                    <span className={`text-[11px] font-mono tabular-nums font-bold shrink-0 ${isSelected ? "text-white" : "text-slate-700"}`}>
                                        {activeLens.format(row.value)}
                                    </span>
                                </div>

                                <div
                                    className="mt-1.5 ml-7 h-1 rounded-sm overflow-hidden"
                                    style={{ backgroundColor: isSelected ? "rgba(255,255,255,0.15)" : "#e9edf2" }}
                                >
                                    <div
                                        className="h-full rounded-sm transition-[width] duration-500 ease-out"
                                        style={{ width: `${widthPct}%`, backgroundColor: row.band.fill }}
                                    />
                                </div>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
