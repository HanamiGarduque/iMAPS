// Temporal controller for the LC demand map. Two chips split the quarters into
// Recorded and Forecast, and the slider beside them covers only the chosen
// side, so a forecast quarter never sits on the same track as the records.
// One sentence carries the numbers, compared with the same quarter a year
// earlier (LC filings are seasonal, so that is the fair comparison).
const quarterName = (q) => (q ? `Quarter ${q.quarter}, ${q.year}` : "");

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

    // "205 applications filed · 2% fewer than Quarter 2, 2024"
    const total = series[index]?.total ?? count;
    const prevIdx = quarters.findIndex((q) => active && q.year === active.year - 1 && q.quarter === active.quarter);
    const prev = prevIdx !== -1 ? series[prevIdx]?.total : null;
    let compare = "";
    if (typeof prev === "number" && prev > 0 && typeof total === "number") {
        const pct = Math.round(((total - prev) / prev) * 100);
        const prevLabel = quarterName(quarters[prevIdx]);
        compare = pct === 0 ? `about the same as ${prevLabel}` : `${Math.abs(pct)}% ${pct > 0 ? "more" : "fewer"} than ${prevLabel}`;
    }
    const sentence = summary ?? [
        `${typeof total === "number" ? total : count} application${total === 1 ? "" : "s"} ${isForecast ? "expected" : "filed"}`,
        compare,
    ].filter(Boolean).join(" · ");

    const accent = isForecast ? "#ea580c" : "#0b2a5b";

    return (
        <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 px-3 py-2 bg-[#f5f6f8] border-t border-slate-300" role="group" aria-label={ariaLabel}>
            <div className="shrink-0 flex items-center gap-1">
                <button type="button" className={btn} onClick={() => step(-1)} disabled={index === 0} aria-label="Previous quarter">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                </button>
                <button
                    type="button"
                    className={`${btn} ${playing ? "!bg-[#0b2a5b] !border-[#0b2a5b] !text-white hover:!bg-[#0e3574]" : ""}`}
                    onClick={onTogglePlay}
                    disabled={quarters.length <= 1}
                    aria-label={playing ? "Pause" : "Play through quarters"}
                    aria-pressed={playing}
                >
                    {playing ? (
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                    ) : (
                        <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>
                    )}
                </button>
                <button type="button" className={btn} onClick={() => step(1)} disabled={index === last} aria-label="Next quarter">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>

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

            <div className={`min-w-[220px] px-2 ${isForecast ? "w-[320px] shrink-0 mx-1" : "flex-1"}`}>
                {/* Years (each over its first quarter); the short forecast track names every quarter. */}
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

                <div className="relative h-5">
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
                                className={`absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-px rounded-full ${q.quarter === 1 || isForecast ? "h-3.5 bg-slate-500" : "h-2 bg-slate-400"}`}
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
                        aria-label={isForecast ? "Forecast quarter" : "Recorded quarter"}
                        aria-valuetext={quarterName(active)}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default"
                    />
                </div>
            </div>

            <p className="min-w-0 flex-1 basis-[240px] text-[12px] text-slate-600 tabular-nums truncate">
                <span className="font-semibold text-slate-900">{quarterName(active)}</span>
                {isForecast && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2410c]">Estimate</span>}
                <span className="mx-1.5 text-slate-400">·</span>
                {sentence}
            </p>
        </div>
    );
}
