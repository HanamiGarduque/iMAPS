import React, { useMemo, useState } from "react";
import { getLens, computeBandCounts, getScaleSegments } from "@/utils/diversityTheme";
import { ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";

// One legend for both the 2D and 3D diversity maps.
//
// Two changes from the old version: it renders only the scale the active lens
// is actually painting with (it used to carry a CLUP zone key and a diversity
// key side by side, so clicking a tier dimmed prisms whose colour meant
// something else), and the scale is a row of discrete swatches rather than a
// smooth gradient bar — the data is classified into bands, so the legend
// should look classified too.
//
// The CLUP zone key now appears only when zoning parcels are on screen, which
// is when a barangay is selected.
export default function DiversityLegend({
    lens = "mix",
    bandFilter = "all",
    onSelectBand = () => {},
    bgyStats = {},
    overallDiversity = null,
    is3D = false,
    showZoneKey = false,
}) {
    const [collapsed, setCollapsed] = useState(false);
    const activeLens = getLens(lens);

    const counts = useMemo(() => computeBandCounts(lens, bgyStats), [lens, bgyStats]);
    const steps = useMemo(() => getScaleSegments(lens), [lens]);

    // Municipal average under the active lens. For `mix` the backend ships an
    // authoritative municipal Simpson score; drift averages the per-barangay
    // variance.
    const municipalValue = useMemo(() => {
        if (lens === "mix" && typeof overallDiversity?.score === "number") return overallDiversity.score;
        const values = Object.values(bgyStats || {})
            .map((s) => activeLens.getValue(s))
            .filter((v) => typeof v === "number" && !Number.isNaN(v));
        if (!values.length) return null;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }, [lens, bgyStats, overallDiversity, activeLens]);

    const [domainMin, domainMax] = activeLens.domain;
    const markerPct = municipalValue === null
        ? null
        : Math.min(100, Math.max(0, ((municipalValue - domainMin) / (domainMax - domainMin)) * 100));

    const totalTracked = Object.values(counts).reduce((a, b) => a + b, 0);

    if (collapsed) {
        return (
            <div className="absolute bottom-6 left-6 z-[450] pointer-events-auto">
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-300 rounded-md shadow-sm hover:border-slate-400 transition-colors cursor-pointer animate-in fade-in slide-in-from-bottom-2 duration-200"
                >
                    <span className="flex shrink-0">
                        {steps.map((s) => (
                            <span
                                key={s.id}
                                className="h-2.5"
                                style={{ width: `${Math.max(6, s.weight * 48)}px`, backgroundColor: s.fill }}
                            />
                        ))}
                    </span>
                    <span className="text-[11.5px] font-bold text-slate-900">{activeLens.label}</span>
                    {bandFilter !== "all" && (
                        <span className="text-[9.5px] font-bold text-white bg-slate-900 px-1.5 py-0.5 rounded-sm">
                            Filtered
                        </span>
                    )}
                </button>
            </div>
        );
    }

    return (
        <div className="absolute bottom-6 left-6 z-[450] pointer-events-auto animate-in fade-in slide-in-from-bottom-2 duration-200">
            <div className="bg-white border border-slate-300 rounded-md shadow-sm w-[264px] text-slate-900 overflow-hidden">

                <header className="flex items-start justify-between gap-2 px-3.5 py-2.5 border-b border-slate-200">
                    <div className="min-w-0">
                        <h4 className="text-[11.5px] font-bold text-slate-900 truncate">{activeLens.label}</h4>
                        <p className="text-[10px] text-slate-500 leading-snug mt-0.5">{activeLens.question}</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCollapsed(true)}
                        className="text-slate-400 hover:text-slate-900 p-0.5 rounded transition-colors cursor-pointer shrink-0"
                        title="Collapse legend"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </header>

                <div className="px-3.5 py-2.5 border-b border-slate-200">
                    {/* Discrete stepped scale, low → high */}
                    <div className="relative">
                        <div className="flex h-3 rounded-sm overflow-hidden">
                            {steps.map((step) => (
                                <div
                                    key={step.id}
                                    className="transition-colors duration-300"
                                    style={{ flexGrow: step.weight, flexBasis: 0, backgroundColor: step.fill }}
                                    title={`${step.label} · ${(step.weight * 100).toFixed(0)}% of the scale`}
                                />
                            ))}
                        </div>
                        {markerPct !== null && (
                            <div
                                className="absolute -bottom-1 w-0 h-0 -translate-x-1/2 transition-all duration-500"
                                style={{
                                    left: `${markerPct}%`,
                                    borderLeft: "4px solid transparent",
                                    borderRight: "4px solid transparent",
                                    borderBottom: "5px solid #0f172a",
                                }}
                                title={`Rosario municipal average: ${activeLens.format(municipalValue)}`}
                            />
                        )}
                    </div>
                    <div className="flex justify-between text-[9.5px] font-mono tabular-nums text-slate-400 mt-2">
                        <span>{activeLens.format(domainMin)}</span>
                        {municipalValue !== null && (
                            <span className="text-slate-700 font-bold">
                                avg {activeLens.format(municipalValue)}
                            </span>
                        )}
                        <span>{activeLens.format(domainMax)}</span>
                    </div>
                </div>

                <div className="px-3.5 py-2">
                    <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400">
                            Click to filter
                        </span>
                        {bandFilter !== "all" && (
                            <button
                                type="button"
                                onClick={() => onSelectBand("all")}
                                className="text-[10px] font-bold text-slate-500 hover:text-slate-900 transition-colors cursor-pointer"
                            >
                                Show all
                            </button>
                        )}
                    </div>

                    <div>
                        {activeLens.bands.map((band) => {
                            const isSelected = bandFilter === band.id;
                            const count = counts[band.id] ?? 0;
                            const isEmpty = count === 0 && !isSelected;
                            return (
                                <button
                                    key={band.id}
                                    type="button"
                                    onClick={() => onSelectBand(isSelected ? "all" : band.id)}
                                    disabled={isEmpty}
                                    className={`w-full flex items-center justify-between gap-2 px-1.5 py-1 rounded-sm transition-colors ${
                                        isSelected
                                            ? "bg-slate-900 cursor-pointer"
                                            : isEmpty
                                            ? "cursor-not-allowed"
                                            : "hover:bg-slate-100 cursor-pointer"
                                    }`}
                                    title={isEmpty ? `No barangays in ${band.shortLabel}` : band.summary}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span
                                            className="w-3 h-3 rounded-[2px] shrink-0"
                                            style={{
                                                backgroundColor: band.fill,
                                                outline: `1px solid ${band.stroke}`,
                                                opacity: isEmpty ? 0.35 : 1,
                                            }}
                                        />
                                        <span className={`text-[10.5px] truncate ${
                                            isSelected ? "text-white font-bold" : isEmpty ? "text-slate-300" : "text-slate-700"
                                        }`}>
                                            {band.label}
                                        </span>
                                    </div>
                                    <span className={`text-[10px] font-mono tabular-nums shrink-0 ${
                                        isSelected ? "text-white font-bold" : "text-slate-400"
                                    }`}>
                                        {count}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>

                {/* CLUP zone key, shown only while parcels are actually drawn. */}
                {showZoneKey && (
                    <div className="px-3.5 py-2.5 border-t border-slate-200 bg-slate-50 animate-in fade-in duration-200">
                        <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 block mb-1.5">
                            CLUP 2030 zoning · selected barangay
                        </span>
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                            {ZONE_CATEGORY_LEGEND.map((cat) => (
                                <div key={cat.id} className="flex items-center gap-1.5 min-w-0">
                                    <span
                                        className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                                        style={{ backgroundColor: cat.fill, outline: `1px solid ${cat.stroke}` }}
                                    />
                                    <span className="text-[9.5px] text-slate-600 truncate">{cat.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <footer className="px-3.5 py-2 border-t border-slate-200 flex items-center justify-between text-[9.5px] text-slate-500">
                    <span className="truncate pr-2">
                        {is3D ? activeLens.heightNote : `Fill = ${activeLens.metricLabel}`}
                    </span>
                    <span className="font-mono tabular-nums text-slate-400 shrink-0">{totalTracked} bgys</span>
                </footer>
            </div>
        </div>
    );
}
