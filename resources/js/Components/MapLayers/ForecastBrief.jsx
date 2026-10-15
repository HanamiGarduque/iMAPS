import { getTrendsDemandColor } from "@/Components/Maps/LeafletMap";

const CARD = "shrink-0 rounded-md border shadow-[0_2px_10px_rgba(15,23,42,0.14)] overflow-hidden";
const pct = (f) => `${Math.abs(Math.round(f * 100))}%`;

// A change as an arrow and a percentage. More filings read red (more work for
// the office), fewer read blue; a change under half a percent reads as flat.
function Change({ value, className = "" }) {
    if (value === null || value === undefined) return null;
    if (Math.abs(value) < 0.005) return <span className={`tabular-nums text-slate-500 ${className}`}>no change</span>;
    return (
        <span className={`font-semibold tabular-nums ${value > 0 ? "text-[#b32a17]" : "text-[#1f5fa8]"} ${className}`}>
            {value > 0 ? "▲" : "▼"} {pct(value)}
        </span>
    );
}

const CardTitle = ({ children, tone = "slate" }) => (
    <h3
        className={`px-3 pt-2 pb-1.5 text-[9.5px] font-bold uppercase tracking-[0.08em] border-b ${
            tone === "orange" ? "text-[#a8521a] border-[#f3d6bd]/70" : "text-slate-500 border-slate-100"
        }`}
    >
        {children}
    </h3>
);

const Footnote = ({ children }) => <p className="px-1.5 pt-1 text-[10px] leading-snug text-slate-400">{children}</p>;

// The LC demand map's title and readout: the quarter shown, its town-wide
// total and how that compares, and whichever barangay is under the cursor.
function QuarterSummary({ quarter, count, watch, hovered, selectedName, onClearSelection, onSelectQuarter }) {
    const isForecast = Boolean(quarter?.isForecast);
    const outlook = watch?.outlook || [];
    return (
        <div className={`${CARD} border-slate-300 bg-white/95 backdrop-blur-sm`}>
            <div className="px-3 pt-2.5 pb-2.5">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-[13px] font-semibold text-slate-900 leading-tight">LC Demand Forecast</h2>
                    <span
                        className={`text-[9.5px] font-bold uppercase tracking-[0.06em] px-1.5 py-[1px] rounded-full border ${
                            isForecast ? "text-[#a8521a] bg-[#fff3e6] border-[#f3c9a5]" : "text-slate-600 bg-slate-100 border-slate-200"
                        }`}
                    >
                        {isForecast ? "Forecast" : "Recorded"}
                    </span>
                </div>

                {/* Every quarter the run forecast, so the whole outlook is one glance
                    (and one click) away. */}
                {outlook.length > 1 ? (
                    <div className="mt-2 grid gap-1 p-0.5 rounded-[5px] bg-slate-100" style={{ gridTemplateColumns: `repeat(${outlook.length}, minmax(0, 1fr))` }} role="group" aria-label="Forecast quarters">
                        {outlook.map((o) => (
                            <button
                                key={o.label}
                                type="button"
                                aria-pressed={o.active}
                                onClick={() => onSelectQuarter?.(o)}
                                className={`px-2 py-1 rounded-[4px] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b] ${
                                    o.active ? "bg-white shadow-[0_1px_2px_rgba(15,23,42,0.12)]" : "hover:bg-white/60"
                                }`}
                            >
                                <span className={`block text-[10px] font-semibold ${o.active ? "text-[#0b2a5b]" : "text-slate-500"}`}>{o.label}</span>
                                <span className="flex items-baseline gap-1">
                                    <span className="text-[12.5px] font-semibold tabular-nums text-slate-900">{o.total}</span>
                                    <Change value={o.yoy} className="text-[9.5px]" />
                                </span>
                            </button>
                        ))}
                    </div>
                ) : (
                    <span className="block text-[11px] font-medium text-slate-500 tabular-nums">{quarter?.label}</span>
                )}

                {count ? (
                    <div className="mt-2 flex items-baseline gap-1.5">
                        <span className="text-[26px] font-semibold leading-none tabular-nums text-slate-900">{count}</span>
                        <span className="text-[11px] text-slate-500">LC {isForecast ? "projected" : "filed"} in {quarter?.label}</span>
                    </div>
                ) : (
                    <p className="mt-1.5 text-[11px] text-slate-500">
                        No LC {isForecast ? "forecast available" : "records"} for this quarter.
                    </p>
                )}

                {watch && (
                    <dl className="mt-2 space-y-[3px] text-[11px]">
                        {watch.lastYear && (
                            <div className="flex items-baseline gap-2">
                                <dt className="flex-1 text-slate-500">vs {watch.lastYear.label}</dt>
                                <dd className="tabular-nums text-slate-700">{watch.lastYear.total}</dd>
                                <dd className="w-[52px] text-right"><Change value={watch.lastYear.change} /></dd>
                            </div>
                        )}
                        {watch.seasonal && watch.seasonal.years > 1 && (
                            <div className="flex items-baseline gap-2">
                                <dt className="flex-1 text-slate-500">vs {watch.seasonal.span} average</dt>
                                <dd className="tabular-nums text-slate-700">{Math.round(watch.seasonal.total)}</dd>
                                <dd className="w-[52px] text-right">
                                    <Change value={watch.seasonal.total > 0 ? (watch.total - watch.seasonal.total) / watch.seasonal.total : null} />
                                </dd>
                            </div>
                        )}
                        <div className="flex items-baseline gap-2">
                            <dt className="flex-1 text-slate-500">Weekly intake</dt>
                            <dd className="tabular-nums font-semibold text-slate-800">≈ {Math.round(watch.perWeek)} a week</dd>
                        </div>
                    </dl>
                )}
                {watch?.seasonShare != null && (
                    <p className="mt-2 text-[10.5px] leading-snug text-slate-500">
                        Q{quarter.quarter} usually brings <b className="text-slate-700 tabular-nums">{pct(watch.seasonShare)}</b> of a
                        year's LC filings{watch.seasonShare >= 0.35 ? ", the busiest quarter" : watch.seasonShare <= 0.12 ? ", the quietest quarter" : ""}.
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

// One clickable barangay row: name, an optional tag, then a figure.
function WatchRow({ name, tag, tagTone = "info", value, valueClass, title, onSelect, onHover }) {
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
                className="w-full flex items-center gap-1.5 px-1.5 py-[3px] rounded-[3px] text-[11.5px] text-left text-slate-700 hover:bg-[#fff3e6] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
            >
                <span className="min-w-0 truncate">{name}</span>
                {tag && (
                    <span
                        className={`shrink-0 text-[8.5px] font-bold uppercase tracking-[0.05em] px-1 rounded-[3px] ${
                            tagTone === "caution" ? "bg-amber-100 text-amber-800 border border-amber-300" : "bg-[#0b2a5b] text-white"
                        }`}
                    >
                        {tag}
                    </span>
                )}
                <span className={`ml-auto tabular-nums font-semibold shrink-0 ${valueClass}`}>{value}</span>
            </button>
        </li>
    );
}

const WatchTitle = ({ children, aside, title }) => (
    <div className="flex items-baseline justify-between gap-2 px-1.5 mb-0.5" title={title}>
        <span className="text-[10.5px] font-medium text-slate-600">{children}</span>
        {aside != null && <span className="text-[10px] tabular-nums text-slate-400">{aside}</span>}
    </div>
);

const signed = (n) => `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

// What a forecast quarter asks of the office: where demand concentrates,
// which barangays move against their usual level for the season, and which
// rising ones CLUP 2030 keeps almost entirely agricultural or protected.
function ForecastWatchlist({ watch, quarterLabel, onSelectBgy, onHoverBgy }) {
    const shown = watch.rising.slice(0, 5);
    const usual = watch.seasonal ? (watch.seasonal.years > 1 ? `their ${watch.seasonal.span} average` : watch.seasonal.span) : null;
    return (
        <section className={`${CARD} border-[#ecc9a8] bg-[#fffaf5]`} aria-label="What to prepare for">
            <CardTitle tone="orange">What to prepare for</CardTitle>
            <div className="px-1 py-1.5 space-y-2">
                {watch.topShare !== null && (
                    <p className="px-1.5 text-[11px] leading-snug text-slate-600">
                        The top 5 barangays take <b className="tabular-nums text-slate-900">{pct(watch.topShare)}</b> of expected demand.
                    </p>
                )}

                {watch.seasonal ? (
                    <div>
                        <WatchTitle aside={watch.rising.length || null} title={`Expected at least ${watch.margin.toFixed(1)} LC above ${usual}.`}>
                            Busier than usual for Q{quarterLabel}
                        </WatchTitle>
                        {shown.length > 0 ? (
                            <ul>
                                {shown.map((r) => (
                                    <WatchRow
                                        key={r.name}
                                        name={r.name}
                                        tag={r.noHistory ? "No history" : r.isNew ? "New" : null}
                                        tagTone={r.noHistory ? "caution" : "info"}
                                        value={signed(r.change)}
                                        valueClass="text-[#b32a17]"
                                        title={
                                            r.noHistory
                                                ? `${r.name}: ${r.count} LC expected, but no LC filing has ever been recorded here. The figure comes from neighbouring barangays and land use; treat it with caution.`
                                                : `${r.name}: ${r.count} LC expected, usually ${r.usual.toFixed(1)}${r.isNew ? " (little or no activity this quarter in past years)" : ""}`
                                        }
                                        onSelect={onSelectBgy}
                                        onHover={onHoverBgy}
                                    />
                                ))}
                            </ul>
                        ) : (
                            <p className="px-1.5 text-[11px] text-slate-500">No barangay beyond the model's usual error.</p>
                        )}
                        {watch.rising.length > shown.length && (
                            <p className="px-1.5 pt-0.5 text-[10.5px] text-slate-400">+{watch.rising.length - shown.length} more in the barangay list</p>
                        )}

                        {watch.easing.length > 0 && (
                            <p className="px-1.5 pt-1.5 text-[11px] leading-snug text-slate-600">
                                <span className="font-medium">Quieter than usual:</span>{" "}
                                {watch.easing.slice(0, 3).map((r, i) => (
                                    <span key={r.name}>
                                        {i > 0 && ", "}
                                        <button
                                            type="button"
                                            onClick={() => onSelectBgy?.(r.name)}
                                            onMouseEnter={() => onHoverBgy?.(r.name)}
                                            onMouseLeave={() => onHoverBgy?.(null)}
                                            className="hover:underline cursor-pointer"
                                        >
                                            {r.name}
                                        </button>{" "}
                                        <span className="tabular-nums font-semibold text-[#1f5fa8]">{signed(r.change)}</span>
                                    </span>
                                ))}
                                {watch.easing.length > 3 && <span className="text-slate-400"> and {watch.easing.length - 3} more</span>}
                            </p>
                        )}
                    </div>
                ) : null}

                {watch.zoningFlags.length > 0 && (
                    <div className="pt-1.5 border-t border-[#f3d6bd]/70">
                        <WatchTitle title="Busier-than-usual barangays whose CLUP 2030 area is almost entirely agricultural or protected.">
                            Zoning check · mostly agri/protected land
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
                        <Footnote>Review new applications here against the zoning.</Footnote>
                    </div>
                )}

                {watch.seasonal && (
                    <Footnote>
                        Compared with {usual}. Changes under ±{watch.margin.toFixed(1)} LC, the model's typical miss per barangay, are left out.
                        {watch.rising.some((r) => r.noHistory) && " “No history”: no LC has ever been filed there, so the figure is the model's estimate from neighbouring barangays."}
                    </Footnote>
                )}
            </div>
        </section>
    );
}

// The kinds of land the expected applications will likely be on, so
// reviewers can be lined up before the filings arrive.
function ExpectedMix({ mix }) {
    return (
        <section className={`${CARD} border-slate-300 bg-white/95 backdrop-blur-sm`} aria-label="Expected application mix">
            <CardTitle>Expected applications by zone</CardTitle>
            <div className="px-1 py-1.5">
                <div className="mx-1.5 mb-1.5 flex h-2.5 rounded-[3px] overflow-hidden ring-1 ring-black/10" aria-hidden="true">
                    {mix.map((m) => (
                        <span key={m.id} style={{ width: `${m.share * 100}%`, backgroundColor: m.fill }} title={`${m.label}: ${pct(m.share)}`} />
                    ))}
                </div>
                <ul>
                    {mix.slice(0, 6).map((m) => (
                        <li key={m.id} className="flex items-center gap-2 px-1.5 py-[2px] text-[11.5px]">
                            <span className="w-2.5 h-2.5 rounded-[2px] shrink-0 border" style={{ backgroundColor: m.fill, borderColor: m.stroke }} aria-hidden="true" />
                            <span className={`flex-1 min-w-0 truncate ${m.id === "none" ? "text-slate-400" : "text-slate-700"}`}>{m.label}</span>
                            <span className="tabular-nums text-slate-500">≈ {Math.round(m.count)}</span>
                            <span className="w-[34px] text-right tabular-nums font-semibold text-slate-800">{pct(m.share)}</span>
                        </li>
                    ))}
                </ul>
                <Footnote>Each barangay's forecast split by the zones of its own LC filings over the last two years.</Footnote>
            </div>
        </section>
    );
}

// Floats over the left of the map on the LC demand layer, beside the Layers
// panel: the quarter on screen, the barangay under the cursor, and on a
// forecast quarter what it asks of the office. It replaces the map title card
// there, so the right-hand panel keeps the metrics and the full ranking.
export default function ForecastBrief({ quarter, count, demandByBgy = {}, hoveredBgy, selectedName, onClearSelection, watch, onSelectBgy, onHoverBgy, onSelectQuarter }) {
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
                onSelectQuarter={onSelectQuarter}
            />
            {watch && <ForecastWatchlist watch={watch} quarterLabel={quarter.quarter} onSelectBgy={onSelectBgy} onHoverBgy={onHoverBgy} />}
            {watch?.mix?.length > 0 && <ExpectedMix mix={watch.mix} />}
        </div>
    );
}
