import { getTrendsDemandColor } from "@/Components/Maps/LeafletMap";

// The LC demand map's title and readout: the quarter shown, its town-wide
// total, and whichever barangay is under the cursor or selected.
function QuarterSummary({ quarter, count, watch, hovered, selectedName, onClearSelection }) {
    const isForecast = Boolean(quarter?.isForecast);
    return (
        <div className="shrink-0 rounded-md border border-slate-300 bg-white/95 backdrop-blur-sm shadow-[0_2px_10px_rgba(15,23,42,0.14)] overflow-hidden">
            <div className="px-3 pt-2.5 pb-2.5">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-semibold text-slate-900 leading-tight">LC Demand Forecast</h2>
                    <span
                        className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-1.5 py-[1px] rounded-full border ${
                            isForecast
                                ? "text-[#a8521a] bg-[#fff3e6] border-[#f3c9a5]"
                                : "text-slate-600 bg-slate-100 border-slate-200"
                        }`}
                    >
                        {isForecast ? "Forecast" : "Recorded"}
                    </span>
                </div>
                <span className="block text-[11px] font-medium text-slate-500 tabular-nums">{quarter?.label}</span>
                {count ? (
                    <div className="mt-1.5 flex items-baseline gap-1.5">
                        <span className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">{count}</span>
                        <span className="text-[11px] text-slate-500">LC {isForecast ? "projected" : "filed"} town-wide</span>
                    </div>
                ) : (
                    <p className="mt-1 text-[11px] text-slate-500">
                        No LC {isForecast ? "forecast available" : "records"} for this quarter.
                    </p>
                )}
                {watch?.baseline && (
                    <p className="mt-1.5 text-[10.5px] leading-snug text-slate-500">
                        {watch.change !== null && Math.abs(watch.change) >= 0.005 && (
                            <span className={`font-semibold tabular-nums ${watch.change > 0 ? "text-[#b32a17]" : "text-[#1f5fa8]"}`}>
                                {watch.change > 0 ? "▲" : "▼"} {Math.abs(Math.round(watch.change * 100))}%{" "}
                            </span>
                        )}
                        vs <span className="tabular-nums">{Math.round(watch.baseline.total)}</span> a quarter over {watch.baseline.span}
                    </p>
                )}
            </div>

            <div className="flex items-center gap-2 min-h-[30px] px-3 py-1.5 border-t border-slate-100 bg-slate-50/80" aria-live="polite">
                {hovered ? (
                    <>
                        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0 border" style={{ backgroundColor: hovered.cls.color, borderColor: hovered.cls.stroke }} aria-hidden="true" />
                        <span className="flex-1 min-w-0 text-[11.5px] font-medium text-slate-800 truncate">{hovered.name}</span>
                        <span className="text-[11.5px] tabular-nums text-slate-900 shrink-0">
                            <b>{hovered.count}</b> <span className="text-slate-500">LC</span>
                        </span>
                    </>
                ) : (
                    <span className="text-[11px] text-slate-400">Hover a barangay · click to open it</span>
                )}
            </div>

            {selectedName && (
                <div className="flex items-center gap-2 px-3 py-1.5 border-t border-[#d5e0ee] bg-[#eaf0f8]">
                    <span className="flex-1 min-w-0 text-[11.5px] text-[#0b2a5b] truncate"><b>{selectedName}</b> selected</span>
                    <button
                        type="button"
                        onClick={onClearSelection}
                        className="text-[11px] font-semibold text-[#0b2a5b] hover:underline cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                    >
                        Clear
                    </button>
                </div>
            )}
        </div>
    );
}

// One clickable barangay row in the watchlist: name, then a figure.
function WatchRow({ name, value, valueClass, title, onSelect, onHover }) {
    return (
        <li>
            <button
                type="button"
                onClick={() => onSelect?.(name)}
                onMouseEnter={() => onHover?.(name)}
                onMouseLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(name)}
                onBlur={() => onHover?.(null)}
                title={title}
                className="w-full flex items-center gap-2 px-1.5 py-[3px] rounded-[3px] text-[11.5px] text-left text-slate-700 hover:bg-[#fff3e6] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
            >
                <span className="flex-1 min-w-0 truncate">{name}</span>
                <span className={`tabular-nums font-semibold shrink-0 ${valueClass}`}>{value}</span>
            </button>
        </li>
    );
}

const WatchTitle = ({ children, aside, title }) => (
    <div className="flex items-baseline justify-between gap-2 px-1.5 mb-0.5" title={title}>
        <span className="text-[10.5px] text-slate-500">{children}</span>
        {aside != null && <span className="text-[10px] tabular-nums text-slate-400">{aside}</span>}
    </div>
);

// What a forecast quarter asks of the office: where demand concentrates,
// which barangays are rising past their usual level, and which of those
// CLUP 2030 keeps almost entirely agricultural or protected.
function ForecastWatchlist({ watch, onSelectBgy, onHoverBgy }) {
    const shown = watch.rising.slice(0, 5);
    return (
        <section className="shrink-0 rounded-md border border-[#ecc9a8] bg-[#fffaf5] shadow-[0_2px_10px_rgba(15,23,42,0.14)] overflow-hidden" aria-label="What to prepare for">
            <h4 className="px-3 pt-2 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-[#a8521a] border-b border-[#f3d6bd]/70">
                What to prepare for
            </h4>
            <div className="px-1 py-1.5 space-y-2">
                {watch.topShare !== null && (
                    <p className="px-1.5 text-[11px] leading-snug text-slate-600">
                        The top 5 barangays take <b className="tabular-nums text-slate-900">{Math.round(watch.topShare * 100)}%</b> of expected demand.
                    </p>
                )}

                {watch.baseline && (
                    <div>
                        <WatchTitle
                            aside={watch.rising.length || null}
                            title={`Rising: at least ${watch.riseMargin.toFixed(1)} LC above the barangay's average for ${watch.baseline.span}. Smaller rises are within the model's usual error.`}
                        >
                            Rising above usual level
                        </WatchTitle>
                        {shown.length > 0 ? (
                            <ul>
                                {shown.map((r) => (
                                    <WatchRow
                                        key={r.name}
                                        name={r.name}
                                        value={`+${Math.round(r.rise)}`}
                                        valueClass="text-[#b32a17]"
                                        title={`${r.name}: ${r.count} LC expected, usually ${r.avg.toFixed(1)}`}
                                        onSelect={onSelectBgy}
                                        onHover={onHoverBgy}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <p className="px-1.5 text-[11px] text-slate-500">
                                None beyond the model's usual error (±{watch.riseMargin.toFixed(1)} LC).
                            </p>
                        )}
                        {watch.rising.length > shown.length && (
                            <p className="px-1.5 pt-0.5 text-[10.5px] text-slate-400">
                                +{watch.rising.length - shown.length} more in the barangay list
                            </p>
                        )}
                    </div>
                )}

                {watch.zoningFlags.length > 0 && (
                    <div className="pt-1.5 border-t border-[#f3d6bd]/70">
                        <WatchTitle title="Rising barangays whose CLUP 2030 area is almost entirely agricultural or protected. Review new applications there against the zoning.">
                            Zoning check · mostly agri/protected
                        </WatchTitle>
                        <ul>
                            {watch.zoningFlags.map((f) => (
                                <WatchRow
                                    key={f.name}
                                    name={f.name}
                                    value={`${Math.round(f.pct)}%`}
                                    valueClass="text-[#4d7c0f]"
                                    title={`${f.name}: ${Math.round(f.pct)}% of its CLUP 2030 area is agricultural or protected`}
                                    onSelect={onSelectBgy}
                                    onHover={onHoverBgy}
                                />
                            ))}
                        </ul>
                        <p className="px-1.5 pt-1 text-[10.5px] leading-snug text-slate-500">
                            Review new applications here against the zoning.
                        </p>
                    </div>
                )}
            </div>
        </section>
    );
}

// Floats over the left of the map on the LC demand layer, beside the Layers
// panel: the quarter on screen, the barangay under the cursor, and on a
// forecast quarter what it asks of the office. It replaces the map title card
// there, so the right-hand panel keeps the metrics and the full ranking.
export default function ForecastBrief({ quarter, count, demandByBgy = {}, hoveredBgy, selectedName, onClearSelection, watch, onSelectBgy, onHoverBgy }) {
    const hovered = hoveredBgy
        ? (() => {
            const n = demandByBgy[hoveredBgy.trim().toLowerCase()] || 0;
            return { name: hoveredBgy, count: n, cls: getTrendsDemandColor(n) };
        })()
        : null;

    return (
        <div className="flex flex-col gap-2 max-h-full overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]">
            <QuarterSummary
                quarter={quarter}
                count={count}
                watch={watch}
                hovered={hovered}
                selectedName={selectedName}
                onClearSelection={onClearSelection}
            />
            {watch && <ForecastWatchlist watch={watch} onSelectBgy={onSelectBgy} onHoverBgy={onHoverBgy} />}
        </div>
    );
}
