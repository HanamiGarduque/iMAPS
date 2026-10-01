// Temporal controller for the LC demand map. Each quarter is a bar sized by
// its LC count, so the trend reads at a glance and any bar jumps the map to
// that quarter. Forecast quarters are hatched so they never read as records.
export default function TimelineBar({ quarters, series = [], index, onIndex, playing, onTogglePlay, count }) {
    const active = quarters[index];
    const last = quarters.length - 1;
    const max = Math.max(1, ...series.map((q) => q.total || 0));

    const step = (delta) => onIndex(Math.min(last, Math.max(0, index + delta)));
    const btn = "w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer";

    return (
        <div className="shrink-0 flex items-end gap-3 px-3 pt-2 pb-1.5 bg-[#f5f6f8] border-t border-slate-300" role="group" aria-label="Quarter timeline">
            <div className="shrink-0 pb-3">
                <div className="flex items-center gap-1">
                    <button type="button" className={btn} onClick={() => step(-1)} disabled={index === 0} aria-label="Previous quarter">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button
                        type="button"
                        className={`${btn} ${playing ? "bg-[#0b2a5b] border-[#0b2a5b] text-white hover:bg-[#0e3574]" : ""}`}
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
                <div className="mt-1.5 leading-tight">
                    <span className="block text-[13px] font-semibold text-slate-900 tabular-nums">
                        {active?.label}
                        {active?.isForecast && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#c2410c]">Forecast</span>}
                    </span>
                    <span className="block text-[10.5px] text-slate-500 tabular-nums">{count} LC {active?.isForecast ? "projected" : "filed"}</span>
                </div>
            </div>

            <div className="flex-1 min-w-0">
                <div className="flex items-end gap-[2px] h-14" role="listbox" aria-label="LC per quarter">
                    {quarters.map((q, i) => {
                        const total = series[i]?.total;
                        const selected = i === index;
                        const known = total !== null && total !== undefined;
                        const h = known ? Math.max(total ? 8 : 2, (total / max) * 100) : 100;
                        const fill = selected
                            ? "#0b2a5b"
                            : q.isForecast
                                ? "repeating-linear-gradient(45deg,#fd8d3c 0 3px,#fed7b5 3px 6px)"
                                : "#9fb1c9";
                        return (
                            <button
                                key={`${q.year}-${q.quarter}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => onIndex(i)}
                                title={`${q.label}${q.isForecast ? " (forecast)" : ""}: ${known ? `${total} LC` : "open to load"}`}
                                className="group flex-1 h-full flex items-end cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                            >
                                <span
                                    className={`block w-full rounded-t-[2px] ${known ? "" : "border border-dashed border-slate-300 bg-transparent"} group-hover:opacity-80`}
                                    style={known ? { height: `${h}%`, background: fill } : { height: "30%" }}
                                />
                            </button>
                        );
                    })}
                </div>
                <div className="flex gap-[2px] border-t border-slate-300 pt-0.5 text-[10px] text-slate-500 tabular-nums">
                    {quarters.map((q, i) => (
                        <span key={`${q.year}-${q.quarter}`} className={`flex-1 text-center overflow-hidden whitespace-nowrap ${q.isForecast ? "text-[#c2410c]" : ""}`}>
                            {q.quarter === 1 || i === 0 ? `'${String(q.year).slice(-2)}` : ""}
                        </span>
                    ))}
                </div>
            </div>
        </div>
    );
}
