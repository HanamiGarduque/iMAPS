// Temporal controller for the LC demand map. Two chips split the quarters into
// Recorded and Forecast, and the slider beside them covers only the chosen
// side, so a forecast quarter never sits on the same track as the records.
// The quarter on screen and its count sit at the right; comparisons live in the side panel.
// Quarters are named by their months ("Jan–Mar 2021") so nobody has to
// work out what "Quarter 1" covers.
import { useState } from "react";

const MONTHS = ["Jan–Mar", "Apr–Jun", "Jul–Sep", "Oct–Dec"];
const quarterName = (q) => (q ? `${MONTHS[q.quarter - 1]} ${q.year}` : "");

export default function TimelineBar({
    quarters,
    series = [],
    index,
    onIndex,
    playing,
    onTogglePlay,
    count,
    summary,
    describe = (q, total, known) => `${quarterName(q)}${q.isForecast ? " (forecast)" : ""}: ${known ? `${total} applications` : "open to load"}`,
    ariaLabel = "Quarter timeline",
}) {
    const active = quarters[index];
    const last = quarters.length - 1;
    const isForecast = Boolean(active?.isForecast);

    // Global indices of the quarters on each side.
    const recorded = quarters.flatMap((q, i) => (q.isForecast ? [] : [i]));
    const forecast = quarters.flatMap((q, i) => (q.isForecast ? [i] : []));
    const side = isForecast ? forecast : recorded;
    const local = Math.max(0, side.indexOf(index));
    const sideLast = side.length - 1;
    const pos = (k) => (sideLast > 0 ? (k / sideLast) * 100 : 50);

    const step = (delta) => onIndex(Math.min(last, Math.max(0, index + delta)));
    const btn = "w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";
    const chip = (on, tone) => `h-7 px-3 text-[11.5px] font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        on ? (tone === "forecast" ? "bg-[#ea580c] text-white" : "bg-[#0b2a5b] text-white") : "bg-white text-slate-600 hover:bg-slate-50"
    }`;


    const accent = isForecast ? "#ea580c" : "#0b2a5b";

    // Hover preview: which quarter the pointer is over, before any click.
    const [hoverK, setHoverK] = useState(null);
    const onTrackMove = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        setHoverK(sideLast > 0 ? Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * sideLast) : 0);
    };
    const hoverQ = hoverK !== null ? quarters[side[hoverK]] : null;
    const hoverT = hoverK !== null ? series[side[hoverK]]?.total : null;


    return (
        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 pt-2 pb-2.5 bg-[#f5f6f8] border-t border-slate-300" role="group" aria-label={ariaLabel}>
            {/* Recorded / Forecast: Recorded opens on the latest record, Forecast on its first quarter. */}
            <div className="shrink-0 flex border border-slate-300 rounded-[3px] overflow-hidden" role="group" aria-label="Recorded or forecast quarters">
                <button
                    type="button"
                    aria-pressed={!isForecast}
                    disabled={!recorded.length}
                    onClick={() => !isForecast || onIndex(recorded[recorded.length - 1])}
                    className={chip(!isForecast, "recorded")}
                >
                    Recorded
                </button>
                <button
                    type="button"
                    aria-pressed={isForecast}
                    disabled={!forecast.length}
                    onClick={() => isForecast || onIndex(forecast[0])}
                    className={`${chip(isForecast, "forecast")} border-l border-slate-300`}
                >
                    Forecast
                </button>
            </div>

            <div className="shrink-0 flex items-center gap-1">
                <button type="button" className={btn} onClick={() => step(-1)} disabled={index === 0} aria-label="Previous quarter">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                    type="button"
                    className={`${btn} !w-auto px-2.5 gap-1.5 text-[11.5px] font-semibold ${playing ? "!bg-[#0b2a5b] !border-[#0b2a5b] !text-white hover:!bg-[#0e3574]" : ""}`}
                    onClick={onTogglePlay}
                    disabled={quarters.length <= 1}
                    aria-pressed={playing}
                    title="Play the map through every quarter"
                >
                    {playing ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    )}
                    {playing ? "Pause" : "Play"}
                </button>
                <button type="button" className={btn} onClick={() => step(1)} disabled={index === last} aria-label="Next quarter">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
                <span className="ml-2 min-w-[108px] text-[13px] font-semibold text-slate-900 tabular-nums whitespace-nowrap" aria-live="polite">{quarterName(active)}{isForecast && <span className="ml-1.5 text-[11.5px] font-medium text-[#c2410c]">· Projected</span>}</span>
            </div>

            <div className="min-w-[260px] flex-1 px-2">
                {/* The short forecast track names every quarter above it; the records
                    track labels its years below, beside the Q1–Q4 of the selected year. */}
                {isForecast && (
                <div className="relative h-4 text-[10.5px] font-semibold tabular-nums">
                    {side.map((gi, k) => {
                        const q = quarters[gi];
                        if (!isForecast && !(q.quarter === 1 || k === 0)) return null;
                        // Labels at the ends line up with the track's edge instead of spilling past it.
                        const align = sideLast > 0 && k === 0 ? "" : sideLast > 0 && k === sideLast ? "-translate-x-full" : "-translate-x-1/2";
                        return (
                            <span
                                key={`y-${q.year}-${q.quarter}`}
                                className={`absolute ${align} whitespace-nowrap ${isForecast ? "text-[#c2410c]" : "text-slate-500"}`}
                                style={{ left: `${pos(k)}%` }}
                            >
                                {isForecast ? quarterName(q) : q.year}
                            </span>
                        );
                    })}
                </div>
                )}

                <div className="relative h-5">
                    {hoverQ && (
                        <span
                            className="absolute bottom-full mb-1.5 -translate-x-1/2 px-2 py-1 rounded-[3px] bg-slate-900 text-white text-[10.5px] font-semibold whitespace-nowrap pointer-events-none z-10"
                            style={{ left: `${pos(hoverK)}%` }}
                        >
                            {quarterName(hoverQ)} · {typeof hoverT === "number" ? `${hoverT} ${hoverQ.isForecast ? "expected" : "filed"}` : "no data"}
                        </span>
                    )}
                    <div
                        className="absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-full"
                        style={isForecast
                            ? { height: 5, background: "repeating-linear-gradient(45deg,#fd8d3c 0 3px,#fed7b5 3px 6px)" }
                            : { height: 3, background: "#cbd5e1" }}
                    />
                    {!isForecast && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#0b2a5b]" style={{ width: `${pos(local)}%` }} />
                    )}
                    {side.map((gi, k) => {
                        const q = quarters[gi];
                        const t = series[gi]?.total;
                        return (
                            <span
                                key={`${q.year}-${q.quarter}`}
                                title={describe(q, t, t !== null && t !== undefined)}
                                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full ${k === sideLast ? "w-[1.5px] h-2.5 bg-slate-500" : q.quarter === 1 || isForecast ? "w-px h-2.5 bg-slate-400" : "w-px h-1 bg-slate-300"}`}
                                style={{ left: `${pos(k)}%` }}
                            />
                        );
                    })}
                    <span
                        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-[0_1px_4px_rgba(15,23,42,0.4)] pointer-events-none transition-[left] duration-200"
                        style={{ left: `${pos(local)}%`, backgroundColor: accent }}
                        aria-hidden="true"
                    />
                    {/* The real control, invisible over the track: drag, click and keyboard. */}
                    <input
                        type="range"
                        min={0}
                        max={Math.max(0, sideLast)}
                        step={1}
                        value={local}
                        disabled={side.length <= 1}
                        onChange={(e) => onIndex(side[Number(e.target.value)])}
                        onMouseMove={onTrackMove}
                        onMouseLeave={() => setHoverK(null)}
                        aria-label={isForecast ? "Forecast quarter" : "Recorded quarter"}
                        aria-valuetext={quarterName(active)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                    />
                </div>

                {/* Under the track: Q1–Q4 on the selected year's ticks, then every
                    year centred on its own stretch (the selected one in navy). */}
                {!isForecast && (
                    <div className="relative h-2.5 -mt-0.5 text-[8.5px] leading-[10px] tabular-nums pointer-events-none" aria-hidden="true">
                        {side.map((gi, k) => quarters[gi].year === active?.year && (
                            <span key={`q-${gi}`} className={`absolute ${k === 0 ? "" : "-translate-x-1/2"} ${gi === index ? "font-bold text-[#0b2a5b]" : "text-slate-400"}`} style={{ left: `${pos(k)}%` }}>
                                Q{quarters[gi].quarter}
                            </span>
                        ))}
                    </div>
                )}
                {!isForecast && (
                    <div className="relative h-3 text-[10px] leading-3 tabular-nums pointer-events-none" aria-hidden="true">
                        {[...new Set(side.map((gi) => quarters[gi].year))].map((year) => {
                            const ks = side.flatMap((gi, k) => (quarters[gi].year === year ? [k] : []));
                            const mid = (pos(ks[0]) + pos(ks[ks.length - 1])) / 2;
                            return (
                                <span key={`y-${year}`} className={`absolute -translate-x-1/2 whitespace-nowrap ${year === active?.year ? "font-semibold text-[#0b2a5b]" : "text-slate-400"}`} style={{ left: `${mid}%` }}>
                                    {year}
                                </span>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
