import { getTrendsDemandColor } from "@/Components/Maps/LeafletMap";

const CARD = "shrink-0 bg-white border-b border-slate-200";
const QUARTER_MONTHS = { 1: "January–March", 2: "April–June", 3: "July–September", 4: "October–December" };
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

// Each section opens on the question it answers, in plain sentence case.
const Question = ({ children, className = "" }) => (
    <h3 className={`text-[12px] font-semibold leading-snug text-slate-800 ${className}`}>{children}</h3>
);

// Section heading inside a card: a question, an optional count.
const SectionTitle = ({ children, aside, title }) => (
    <div className="flex items-baseline justify-between gap-2 px-4 pt-3 pb-1" title={title}>
        <Question>{children}</Question>
        {aside != null && <span className="text-[10px] tabular-nums text-slate-400">{aside}</span>}
    </div>
);

const Footnote = ({ children, title }) => (
    <p className="px-4 pt-1 pb-3 text-[10.5px] leading-snug text-slate-400" title={title}>
        {children}
    </p>
);

// One comparison tile: what the quarter is measured against, the change, and
// the figure it is measured from.
function Compare({ label, value, base }) {
    return (
        <div className="min-w-0 px-3 py-2">
            <dt className="text-[10.5px] text-slate-500 truncate">{label}</dt>
            <dd className="mt-1 flex items-baseline gap-1.5">
                {value != null ? <Change value={value} className="text-[12px]" /> : <span className="text-[12px] text-slate-400">—</span>}
                <span className="text-[10.5px] tabular-nums text-slate-400 truncate">from {base}</span>
            </dd>
        </div>
    );
}

// The LC demand map's title and readout: the quarter shown, its town-wide
// total and how that compares, and whichever barangay is under the cursor.
function QuarterSummary({ quarter, count, watch, hovered, selectedName, onClearSelection, onSelectQuarter }) {
    const isForecast = Boolean(quarter?.isForecast);
    const outlook = watch?.outlook || [];
    const seasonal = watch?.seasonal && watch.seasonal.years > 1 ? watch.seasonal : null;
    const share = watch?.seasonShare;
    return (
        <div className={`${CARD} pb-3`}>
            <div className="px-4 pt-3">
                {isForecast && <Question className="mb-2">How many applications should we expect?</Question>}
                {/* The answer first: how many, and what that means per week. */}
                {count ? (
                    <div className="flex items-end justify-between gap-3">
                        <div className="flex items-baseline gap-2 min-w-0">
                            <span className="text-[34px] font-semibold leading-none tabular-nums text-slate-900">{count}</span>
                            <span className="text-[11.5px] leading-tight text-slate-500">
                                {isForecast ? "applications expected" : "applications filed"}
                                <br />
                                in {quarter?.label}
                            </span>
                        </div>
                        {watch && (
                            <span className="shrink-0 text-right text-[11px] leading-tight text-slate-500">
                                <b className="block text-[15px] font-semibold tabular-nums text-slate-800">≈ {Math.round(watch.perWeek)}</b>
                                a week
                            </span>
                        )}
                    </div>
                ) : (
                    <p className="text-[11px] text-slate-500">
                        {isForecast ? "No estimate available" : "No applications on record"} for this quarter.
                    </p>
                )}
            </div>

            {watch && (watch.lastYear || seasonal) && (
                <Question className="px-4 mt-3.5">Is that more or less than usual?</Question>
            )}
            {watch && (watch.lastYear || seasonal) && (
                <dl className="mx-4 mt-2 grid grid-cols-2 divide-x divide-slate-200 rounded-lg border border-slate-200">
                    {watch.lastYear && <Compare label={`Than last year (${watch.lastYear.label})`} value={watch.lastYear.change} base={watch.lastYear.total} />}
                    {seasonal && (
                        <Compare
                            label={`Than usual (${seasonal.span} avg)`}
                            value={seasonal.total > 0 ? (watch.total - seasonal.total) / seasonal.total : null}
                            base={Math.round(seasonal.total)}
                        />
                    )}
                </dl>
            )}

            {share != null && (
                <p className="px-4 pt-3 text-[11px] leading-snug text-slate-500">
                    {QUARTER_MONTHS[quarter.quarter] ?? `Q${quarter.quarter}`} usually brings <b className="text-slate-700 tabular-nums">{pct(share)}</b> of a year's applications
                    {share >= 0.35 ? ", the busiest months of the year" : share <= 0.12 ? ", the quietest months of the year" : ""}.
                </p>
            )}

            {/* The barangay under the cursor; absent until there is one. */}
            <div aria-live="polite">
                {hovered && (
                    <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200">
                        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0 border" style={{ backgroundColor: hovered.cls.color, borderColor: hovered.cls.stroke }} aria-hidden="true" />
                        <span className="flex-1 min-w-0 text-[11.5px] font-medium text-slate-800 truncate">{hovered.name}</span>
                        <span className="text-[11.5px] tabular-nums text-slate-900 shrink-0">
                            <b>{hovered.count}</b> <span className="text-slate-500">applications</span>
                        </span>
                    </div>
                )}
            </div>

            {selectedName && (
                <div className="mx-4 mt-3 flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#eaf0f8]">
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
                title={title}
                className="w-full flex items-center gap-1.5 px-4 py-[5px] text-[12px] text-left text-slate-700 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
            >
                <span className="min-w-0 truncate">{name}</span>
                {tag && (
                    <span
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-[0.05em] px-1 rounded-[3px] ${
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

const signed = (n) => `${n > 0 ? "+" : "−"}${Math.abs(Math.round(n))}`;

// What a forecast quarter asks of the office: where demand concentrates,
// which barangays move against their usual level for the season, and which
// rising ones CLUP 2030 keeps almost entirely agricultural or protected.
function ForecastWatchlist({ watch, quarterLabel, onSelectBgy, onHoverBgy }) {
    const shown = watch.rising.slice(0, 5);
    const usual = watch.seasonal ? (watch.seasonal.years > 1 ? `their ${watch.seasonal.span} average` : watch.seasonal.span) : null;
    const usualShort = watch.seasonal ? (watch.seasonal.years > 1 ? `${watch.seasonal.span} avg` : watch.seasonal.span) : null;
    return (
        <section className={CARD} aria-label="What to prepare for">
            <div className="px-4 pt-3">
                <Question>What should we prepare for?</Question>
                {watch.topShare !== null && (
                    <p className="mt-1 text-[11.5px] leading-snug text-slate-700">
                        The top 5 barangays will bring <b className="tabular-nums text-slate-900">{pct(watch.topShare)}</b> of the applications expected.
                    </p>
                )}
            </div>

            {watch.seasonal ? (
                <div>
                    <SectionTitle aside={watch.rising.length || null} title={`At least ${watch.margin.toFixed(1)} more applications than ${usual}.`}>
                        Which barangays will be busier than usual?
                    </SectionTitle>
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
                                            ? `${r.name}: about ${r.count} expected, but no application has ever been filed here. The figure comes from nearby barangays and land use, so treat it with caution.`
                                            : `${r.name}: about ${r.count} expected, usually ${r.usual.toFixed(1)}${r.isNew ? " (little or no activity in these months in past years)" : ""}`
                                    }
                                    onSelect={onSelectBgy}
                                    onHover={onHoverBgy}
                                />
                            ))}
                        </ul>
                    ) : (
                        <p className="px-4 text-[11px] text-slate-500">No barangay is expected to be clearly busier than usual.</p>
                    )}
                    {watch.rising.length > shown.length && (
                        <p className="px-4 pt-0.5 text-[10.5px] text-slate-400">+{watch.rising.length - shown.length} more in the barangay list</p>
                    )}

                    {watch.easing.length > 0 && (
                        <p className="px-4 pt-2 text-[11px] leading-snug text-slate-600">
                            <span className="font-medium">Which will be quieter?</span>{" "}
                            {watch.easing.slice(0, 3).map((r, i) => (
                                <span key={r.name}>
                                    {i > 0 && ", "}
                                    <button
                                        type="button"
                                        onClick={() => onSelectBgy?.(r.name)}
                                        className="cursor-pointer"
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
                <div className="mt-2.5 border-t border-slate-100">
                    <SectionTitle title="Busier-than-usual barangays whose CLUP 2030 area is almost entirely farmland or protected land.">
                        Which busy areas need a zoning check?
                    </SectionTitle>
                    <ul>
                        {watch.zoningFlags.map((f) => (
                            <WatchRow
                                key={f.name}
                                name={f.name}
                                value={`${Math.round(f.pct)}%`}
                                valueClass="text-[#4d7c0f]"
                                title={`${f.name}: ${Math.round(f.pct)}% of its CLUP 2030 area is farmland or protected land`}
                                onSelect={onSelectBgy}
                                onHover={onHoverBgy}
                            />
                        ))}
                    </ul>
                    <p className="px-4 pt-0.5 text-[10.5px] text-slate-500">Mostly farmland or protected land. Check new applications here against the zoning.</p>
                </div>
            )}

            {watch.seasonal ? (
                <Footnote title={`Compared with ${usual}. Changes under ±${watch.margin.toFixed(1)}, the estimate's usual miss per barangay, are left out.`}>
                    Compared with {usualShort}. Small changes (under ±{watch.margin.toFixed(1)}) are left out.
                    {watch.rising.some((r) => r.noHistory) && " “No history”: no application ever filed there, so the figure comes from nearby barangays."}
                </Footnote>
            ) : (
                <div className="pb-2.5" />
            )}
        </section>
    );
}

// The kinds of land the expected applications will likely be on, so
// reviewers can be lined up before the filings arrive.
function ExpectedMix({ mix }) {
    return (
        <section className={CARD} aria-label="Expected application mix">
            <SectionTitle>What kind of land will they be on?</SectionTitle>
            <div className="mx-4 mt-1 mb-2 flex h-2 rounded-full overflow-hidden ring-1 ring-black/5" aria-hidden="true">
                {mix.map((m) => (
                    <span key={m.id} style={{ width: `${m.share * 100}%`, backgroundColor: m.fill }} title={`${m.label}: ${pct(m.share)}`} />
                ))}
            </div>
            <ul>
                {mix.slice(0, 6).map((m) => (
                    <li key={m.id} className="flex items-center gap-2 px-4 py-[3px] text-[12px]" title={m.lower != null ? `${m.label}: most likely ${m.lower}–${m.upper} applications` : undefined}>
                        <span className="w-2.5 h-2.5 rounded-[2px] shrink-0 border" style={{ backgroundColor: m.fill, borderColor: m.stroke }} aria-hidden="true" />
                        <span className={`flex-1 min-w-0 truncate ${m.id === "none" ? "text-slate-400" : "text-slate-700"}`}>{m.label}</span>
                        <span className="tabular-nums text-slate-500">≈ {Math.round(m.count)}</span>
                        <span className="w-[34px] text-right tabular-nums font-semibold text-slate-800">{pct(m.share)}</span>
                    </li>
                ))}
            </ul>
            <Footnote>Based on how past applications in each barangay were zoned since 2021. Barangays with few past applications follow the town-wide pattern.</Footnote>
        </section>
    );
}

const hoveredFor = (hoveredBgy, demandByBgy) => {
    if (!hoveredBgy) return null;
    const n = demandByBgy[hoveredBgy.trim().toLowerCase()] || 0;
    return { name: hoveredBgy, count: n, cls: getTrendsDemandColor(n) };
};

// Heads the right-hand panel on the LC demand layer: the quarter on screen,
// how it compares, and the barangay under the cursor.
export function ForecastSummary({ quarter, count, demandByBgy = {}, hoveredBgy, selectedName, onClearSelection, watch, onSelectQuarter }) {
    return (
        <QuarterSummary
            quarter={quarter}
            count={count}
            watch={watch}
            hovered={hoveredFor(hoveredBgy, demandByBgy)}
            selectedName={selectedName}
            onClearSelection={onClearSelection}
            onSelectQuarter={onSelectQuarter}
        />
    );
}

// What a forecast quarter asks of the office, shown after the ranking.
export function ForecastInsights({ quarter, watch, onSelectBgy, onHoverBgy }) {
    if (!watch) return null;
    return (
        <>
            <ForecastWatchlist watch={watch} quarterLabel={quarter.quarter} onSelectBgy={onSelectBgy} onHoverBgy={onHoverBgy} />
            {watch.mix?.length > 0 && <ExpectedMix mix={watch.mix} />}
        </>
    );
}
