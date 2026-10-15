// Year picker for the diversity index, drawn as a strip of small maps. Each
// thumbnail is Rosario's barangays coloured exactly as the big map would be
// for that year (the mix at the end of the year, scored over the five years of
// filings before it; the last one is the latest quarter, labelled with its year). Picking one
// re-scores the map and the panel. One sentence underneath says what changed.

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
    const hasPlan = typeof planScore === "number" && !Number.isNaN(planScore);
    const last = choices[choices.length - 1];
    const band = (v) => bandFor?.(isScored(v) ? v : null);

    // "Rosario, 2021–2026: High Mix (0.70), more mixed than the CLUP plan."
    let sentence = null;
    if (active?.from) {
        const span = yearOf(active.from) === yearOf(active.to) ? yearOf(active.to) : `${yearOf(active.from)}–${yearOf(active.to)}`;
        if (!isScored(cur.total)) {
            sentence = <><b className="font-semibold text-slate-700">{who}, {span}:</b> not enough filings to score yet.</>;
        } else {
            let vsPlan = "";
            if (hasPlan) {
                const d = cur.total - planScore;
                vsPlan = Math.abs(d) < 0.05 ? ", about the same as the CLUP plan" : d > 0 ? ", more mixed than the CLUP plan" : ", less mixed than the CLUP plan";
            }
            sentence = (
                <>
                    <b className="font-semibold text-slate-700">{who}, {span}:</b> {band(cur.total)?.shortLabel} ({cur.total.toFixed(2)}){vsPlan}.
                    {active.isPartial && <span className="text-slate-400"> Fewer than five years of records.</span>}
                </>
            );
        }
    }

    // Barangays whose colour changed since the previous thumbnail.
    let change = null;
    const pos = choices.indexOf(index);
    if (pos > 0) {
        const prev = choices[pos - 1];
        const a = yearScores[prev] || {}, b = yearScores[index] || {};
        let up = 0, down = 0;
        Object.keys(b).forEach((name) => {
            if (!isScored(a[name]) || !isScored(b[name])) return;
            const ba = band(a[name]), bb = band(b[name]);
            if (ba?.id === bb?.id) return;
            if (b[name] > a[name]) up += 1; else down += 1;
        });
        const prevLabel = String(steps[prev]?.year);
        const n = (k) => `${k} barangay${k === 1 ? "" : "s"}`;
        change = up || down
            ? ` Since ${prevLabel}: ${[up && `${n(up)} more mixed`, down && `${n(down)} less mixed`].filter(Boolean).join(", ")}.`
            : ` No barangay changed colour since ${prevLabel}.`;
    }

    if (collapsed) {
        return (
            <div className="shrink-0 px-3 py-1.5 bg-[#f5f6f8] border-t border-slate-300 flex items-center gap-3" role="group" aria-label="Diversity index by year">
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
                <p className="flex-1 min-w-0 text-[10.5px] text-slate-500 truncate" aria-live="polite">{sentence}{change}</p>
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
                    <button
                        type="button"
                        onClick={toggleCollapsed}
                        aria-expanded="true"
                        title="Hide the year maps"
                        className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-800 hover:text-[#0b2a5b] cursor-pointer"
                    >
                        <Chevron open />
                        Mix by year
                    </button>
                    <span className="block text-[10.5px] text-slate-500">Each small map is the big map for that year. Click one to open it.</span>
                </div>

                <div className="flex-1 min-w-0 flex gap-1.5" role="listbox" aria-label="Year">
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
                                className={`flex-1 min-w-0 flex flex-col items-stretch gap-0.5 p-1 rounded-[4px] border cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b2a5b] ${
                                    selected ? "bg-[#eaf0f8] border-[#0b2a5b] shadow-[inset_0_0_0_1px_#0b2a5b]" : "bg-white border-slate-300 hover:border-slate-400 hover:bg-slate-50"
                                }`}
                            >
                                <span className="block h-[52px]">
                                    <MiniMap outlines={outlines} scores={yearScores[i]} bandFor={band} highlight={selectedName} />
                                </span>
                                <span className={`text-[11.5px] font-semibold text-center whitespace-nowrap ${selected ? "text-[#0b2a5b]" : "text-slate-600"}`}>{label}</span>
                            </button>
                        );
                    })}
                </div>

                <button
                    type="button"
                    onClick={onTogglePlay}
                    disabled={choices.length <= 1}
                    aria-pressed={playing}
                    className={`shrink-0 h-9 px-3 flex items-center gap-1.5 rounded-[4px] border text-[11.5px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                        playing ? "bg-[#0b2a5b] border-[#0b2a5b] text-white" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"
                    }`}
                >
                    {playing ? (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    )}
                    {playing ? "Pause" : "Play"}
                </button>
            </div>

            <p className="mt-1 pl-[187px] text-[10.5px] text-slate-500 truncate" aria-live="polite">{sentence}{change}</p>
        </div>
    );
}
