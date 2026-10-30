// Year picker for the diversity index, drawn as a strip of small maps. Each
// thumbnail is Rosario's barangays coloured exactly as the big map would be
// for that year (the mix at the end of the year, scored over the five years of
// filings before it; the last one is the latest quarter, labelled with its year). Picking one
// re-scores the map and the panel. A note underneath flags a year too thin to score.

import { useEffect, useMemo, useState } from "react";
import { loadBarangayBoundaries, resolveBarangayName } from "@/utils/mapData";

const yearOf = (d) => d.slice(0, 4);
const isScored = (v) => v !== null && v !== undefined;
const COLLAPSE_KEY = "imaps.diversityTimeline.collapsed";

const Chevron = ({ open }) => (
    <svg className={`w-3 h-3 shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
);

// Barangay outlines as SVG paths in one shared viewBox. Longitude is scaled
// by cos(latitude) so the shape isn't stretched sideways.
function useOutlines() {
    const [geo, setGeo] = useState(null);
    useEffect(() => {
        let alive = true;
        loadBarangayBoundaries().then((d) => alive && d?.features && setGeo(d)).catch(() => {});
        return () => { alive = false; };
    }, []);

    return useMemo(() => {
        if (!geo) return null;
        const rings = (g) => (g?.type === "Polygon" ? g.coordinates : g?.type === "MultiPolygon" ? g.coordinates.flat() : []);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        geo.features.forEach((f) => rings(f.geometry).forEach((r) => r.forEach(([x, y]) => {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        })));
        if (!Number.isFinite(minX)) return null;
        const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
        const w = (maxX - minX) * k, h = maxY - minY;
        const s = 100 / Math.max(w, h);
        const pt = ([x, y]) => `${(((x - minX) * k) * s).toFixed(2)},${((maxY - y) * s).toFixed(2)}`;
        const shapes = geo.features.map((f) => ({
            name: resolveBarangayName(f.properties),
            d: rings(f.geometry).map((r) => `M${r.map(pt).join("L")}Z`).join(""),
        }));
        return { shapes, viewBox: `-1 -1 ${(w * s + 2).toFixed(2)} ${(h * s + 2).toFixed(2)}` };
    }, [geo]);
}

// Previous / play / next, the same control the LC demand timeline uses. The
// arrows step between the years shown, not the raw quarters underneath.
const BTN = "w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

function PlayControls({ choices, index, onIndex, playing, onTogglePlay }) {
    const prev = [...choices].reverse().find((c) => c < index);
    const next = choices.find((c) => c > index);
    return (
        <div className="flex items-center gap-1">
            <button type="button" className={BTN} onClick={() => onIndex(prev)} disabled={prev === undefined} aria-label="Previous year">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
            </button>
            <button
                type="button"
                className={`${BTN} ${playing ? "!bg-[#0b2a5b] !border-[#0b2a5b] !text-white hover:!bg-[#0e3574]" : ""}`}
                onClick={onTogglePlay}
                disabled={choices.length <= 1}
                aria-label={playing ? "Pause" : "Play through years"}
                aria-pressed={playing}
            >
                {playing ? (
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                ) : (
                    <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                )}
            </button>
            <button type="button" className={BTN} onClick={() => onIndex(next)} disabled={next === undefined} aria-label="Next year">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
            </button>
        </div>
    );
}

function MiniMap({ outlines, scores, bandFor, highlight }) {
    if (!outlines) return <div className="w-full h-full rounded-[2px] bg-slate-100 animate-pulse" aria-hidden="true" />;
    const sel = highlight?.toLowerCase();
    const picked = outlines.shapes.find((s) => s.name.toLowerCase() === sel);
    return (
        <svg viewBox={outlines.viewBox} preserveAspectRatio="xMidYMid meet" className="w-full h-full" aria-hidden="true">
            {outlines.shapes.map((s, i) => {
                const band = bandFor(scores?.[s.name]);
                return <path key={i} d={s.d} fill={band?.fill ?? "#e2e8f0"} stroke="#ffffff" strokeWidth="0.35" strokeLinejoin="round" />;
            })}
            {picked && <path d={picked.d} fill="none" stroke="#0b2a5b" strokeWidth="1.4" strokeLinejoin="round" />}
        </svg>
    );
}

export default function DiversityTimeline({
    steps,
    series = [],
    yearScores = [],
    choices = [],
    index,
    onIndex,
    playing,
    onTogglePlay,
    planScore,
    who = "Rosario",
    selectedName = null,
    bandFor,
}) {
    const outlines = useOutlines();
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; }
    });
    const toggleCollapsed = () => setCollapsed((c) => {
        try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch {}
        return !c;
    });
    const active = steps[index];
    const cur = series[index] || {};
    const last = choices[choices.length - 1];
    const band = (v) => bandFor?.(isScored(v) ? v : null);

    // The score, band and plan comparison are in the side panel; here only a
    // period that can't be scored is called out.
    let sentence = null;
    if (active?.from && !isScored(cur.total)) {
        const span = yearOf(active.from) === yearOf(active.to) ? yearOf(active.to) : `${yearOf(active.from)}–${yearOf(active.to)}`;
        sentence = <><b className="font-semibold text-slate-700">{who}, {span}:</b> not enough filings to score yet.</>;
    }

    const controls = <PlayControls choices={choices} index={index} onIndex={onIndex} playing={playing} onTogglePlay={onTogglePlay} />;

    if (collapsed) {
        return (
            <div className="shrink-0 px-3 py-1.5 bg-[#f5f6f8] border-t border-slate-300 flex items-center gap-3" role="group" aria-label="Diversity index by year">
                <div className="shrink-0">{controls}</div>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    aria-expanded="false"
                    title="Show the year maps"
                    className="shrink-0 flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 hover:text-[#0b2a5b] cursor-pointer"
                >
                    <Chevron open={false} />
                    Mix by year
                    {active?.year != null && <span className="px-1.5 py-px rounded-[3px] bg-[#eaf0f8] text-[#0b2a5b] text-[11px]">{active.year}</span>}
                </button>
                <p className="flex-1 min-w-0 text-[10.5px] text-slate-500 truncate" aria-live="polite">{sentence}</p>
                <button
                    type="button"
                    onClick={toggleCollapsed}
                    className="shrink-0 text-[11px] font-semibold text-slate-600 hover:text-[#0b2a5b] cursor-pointer"
                >
                    Show years
                </button>
            </div>
        );
    }

    return (
        <div className="shrink-0 px-3 pt-2 pb-1.5 bg-[#f5f6f8] border-t border-slate-300" role="group" aria-label="Diversity index by year">
            <div className="flex items-center gap-3">
                <div className="shrink-0 w-[175px] leading-tight">
                    {controls}
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        aria-expanded="true"
                        title="Hide the year maps"
                        className="mt-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 hover:text-[#0b2a5b] cursor-pointer"
                    >
                        <Chevron open />
                        Mix by year
                    </button>
                    <span className="block text-[10.5px] text-slate-500">Each small map is the big map for that year.</span>
                </div>

                <div className="flex-1 min-w-0 flex gap-2" role="listbox" aria-label="Year">
                    {choices.map((i) => {
                        const s = steps[i];
                        const v = series[i]?.total;
                        const selected = i === index;
                        const label = String(s.year);
                        const title = `${i === last ? `Latest (${s.label})` : `End of ${s.year}`}: ${who} ${isScored(v) ? band(v)?.shortLabel : "not enough filings"}`;
                        return (
                            <button
                                key={i}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                title={title}
                                aria-label={title}
                                onClick={() => onIndex(i)}
                                className={`relative flex-1 min-w-0 h-[64px] p-1 bg-white border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b2a5b] ${
                                    selected ? "border-[#0b2a5b] shadow-[inset_0_0_0_1px_#0b2a5b]" : "border-slate-300 hover:border-slate-500"
                                }`}
                            >
                                {/* Small multiples in the print-map way: identical frames,
                                    the map filling each, the year as a corner label. */}
                                <span className={`block w-full h-full transition-opacity ${selected ? "" : "opacity-80"}`}>
                                    <MiniMap outlines={outlines} scores={yearScores[i]} bandFor={band} highlight={selectedName} />
                                </span>
                                <span className={`absolute top-0.5 left-1 text-[10.5px] font-semibold tabular-nums leading-none px-0.5 py-px ${
                                    selected ? "bg-[#0b2a5b] text-white" : "bg-white/85 text-slate-700"
                                }`}>
                                    {label}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            <p className="mt-1 pl-[187px] text-[10.5px] text-slate-500 truncate" aria-live="polite">{sentence}</p>
        </div>
    );
}
