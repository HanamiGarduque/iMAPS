const CARD = "shrink-0 bg-white border-b border-slate-200";
const QUARTER_MONTHS = { 1: "January–March", 2: "April–June", 3: "July–September", 4: "October–December" };
const pct = (f) => `${Math.abs(Math.round(f * 100))}%`;

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

// The LC demand map's title and readout: the quarter shown, its town-wide
// total and how that compares.
function QuarterSummary({ quarter, count, watch, selectedName, onClearSelection, onSelectQuarter }) {
    const isForecast = Boolean(quarter?.isForecast);
    const outlook = watch?.outlook || [];
    const seasonal = watch?.seasonal && watch.seasonal.years > 1 ? watch.seasonal : null;
    const share = watch?.seasonShare;
    // The figure the quarter is read against: its usual level, else last year's.
    const reference = seasonal
        ? { value: Math.round(seasonal.total), label: `${seasonal.span} avg` }
        : watch?.lastYear
          ? { value: watch.lastYear.total, label: watch.lastYear.label }
          : null;
    const summary = [];
    if (watch) {
        const ly = watch.lastYear;
        const vsLastYear =
            ly && ly.change != null && seasonal
                ? Math.abs(ly.change) < 0.005
                    ? `, the same as ${ly.label} (${ly.total})`
                    : `, ${pct(ly.change)} ${ly.change > 0 ? "more" : "fewer"} than ${ly.label} (${ly.total})`
                : "";
        summary.push(`About ${Math.round(watch.perWeek)} a week${vsLastYear}.`);
    }
    if (share != null) {
        const months = QUARTER_MONTHS[quarter.quarter] ?? `Q${quarter.quarter}`;
        const note = share >= 0.35 ? ", the busiest months of the year" : share <= 0.12 ? ", the quietest months of the year" : "";
        summary.push(`${months} usually brings ${pct(share)} of a year's applications${note}.`);
    }
    return (
        <div className={`${CARD} px-4 pt-3 pb-3`}>
            <Question className="mb-2">
                {isForecast ? "How many applications should we expect" : "How many applications were filed"} in {quarter?.label}?
            </Question>
            {count ? (
                <div className="flex items-stretch gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-[34px] font-semibold leading-none tabular-nums text-slate-900">{count}</span>
                        <span className="text-[12px] font-medium leading-tight text-slate-600">
                            {isForecast ? "Forecasted applications" : "Applications filed"}
                        </span>
                    </div>
                    {reference && (
                        <div className="shrink-0 min-w-[104px] flex flex-col justify-center rounded-lg border border-slate-200 px-3 py-2 text-right">
                            <span className="block text-[15px] font-semibold leading-tight tabular-nums text-slate-800">{reference.value}</span>
                            <span className="block text-[10.5px] leading-tight text-slate-500">{reference.label}</span>
                        </div>
                    )}
                </div>
            ) : (
                <p className="text-[11px] text-slate-500">
                    {isForecast ? "No estimate available" : "No applications on record"} for this quarter.
                </p>
            )}
            {count && summary.length > 0 ? <p className="mt-2 text-[11.5px] leading-snug text-slate-600">{summary.join(" ")}</p> : null}

            {selectedName && (
                <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-md bg-[#eaf0f8]">
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
            <div className="px-4 pt-3 pb-3">
                <Question>What should we prepare for?</Question>
                {watch.topShare !== null && (
                    <p className="mt-1 text-[11.5px] leading-snug text-slate-600">
                        The top 5 barangays will bring <b className="tabular-nums text-slate-900">{pct(watch.topShare)}</b> of the applications expected.
                    </p>
                )}
            </div>

            {watch.seasonal ? (
                <>
                    <div className="border-t border-slate-100 pb-2">
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
                            <p className="px-4 pt-1 text-[11px] text-slate-500">No barangay is expected to be clearly busier than usual.</p>
                        )}
                        {watch.rising.length > shown.length && (
                            <p className="px-4 pt-0.5 text-[10.5px] text-slate-400">+{watch.rising.length - shown.length} more in the barangay list</p>
                        )}
                    </div>

                    {watch.easing.length > 0 && (
                        <div className="border-t border-slate-100 pb-2">
                            <SectionTitle aside={watch.easing.length} title={`At least ${watch.margin.toFixed(1)} fewer applications than ${usual}.`}>
                                Which barangays will be quieter?
                            </SectionTitle>
                            <ul>
                                {watch.easing.slice(0, 3).map((r) => (
                                    <WatchRow
                                        key={r.name}
                                        name={r.name}
                                        value={signed(r.change)}
                                        valueClass="text-[#1f5fa8]"
                                        title={`${r.name}: about ${r.count} expected, usually ${r.usual.toFixed(1)}`}
                                        onSelect={onSelectBgy}
                                        onHover={onHoverBgy}
                                    />
                                ))}
                            </ul>
                            {watch.easing.length > 3 && (
                                <p className="px-4 pt-0.5 text-[10.5px] text-slate-400">+{watch.easing.length - 3} more in the barangay list</p>
                            )}
                        </div>
                    )}
                </>
            ) : null}

            {watch.zoningFlags.length > 0 && (
                <div className="border-t border-slate-100 pb-2">
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
function ExpectedMix({ mix, bgyName }) {
    return (
        <section className={`${CARD} px-4 pt-3 pb-3`} aria-label="Expected application mix">
            <Question className="mb-2">{bgyName ? `What kind of land will they be on in ${bgyName}?` : "What kind of land will they be on?"}</Question>
            <div className="flex h-3 rounded-sm overflow-hidden bg-slate-100" role="img" aria-label="Share of expected applications by zone">
                {mix.map((m) => (
                    <span
                        key={m.id}
                        className="h-full border-r border-white last:border-r-0"
                        style={{ width: `${m.share * 100}%`, backgroundColor: m.fill }}
                        title={`${m.label}: ${pct(m.share)}`}
                    />
                ))}
            </div>
            <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                {mix.slice(0, 6).map((m) => (
                    <li
                        key={m.id}
                        className="flex items-center gap-1.5 min-w-0 text-[11.5px]"
                        title={m.lower != null ? `${m.label}: about ${Math.round(m.count)} applications, most likely ${m.lower}–${m.upper}` : `${m.label}: about ${Math.round(m.count)} applications`}
                    >
                        <span className="w-2.5 h-2.5 shrink-0 rounded-[2px] border" style={{ backgroundColor: m.fill, borderColor: m.stroke }} aria-hidden="true" />
                        <span className={`truncate ${m.id === "none" ? "text-slate-400" : "text-slate-700"}`}>{m.label}</span>
                        <span className="ml-auto tabular-nums font-semibold text-slate-900">{pct(m.share)}</span>
                    </li>
                ))}
            </ul>
            <p className="mt-2 text-[10.5px] leading-snug text-slate-400">
                {bgyName
                    ? "Based on how past applications here were zoned since 2021. With few past applications, it leans toward the town-wide pattern."
                    : "Based on how past applications in each barangay were zoned since 2021. Barangays with few past applications follow the town-wide pattern."}
            </p>
        </section>
    );
}

// Heads the right-hand panel on the LC demand layer: the quarter on screen
// and how it compares.
export function ForecastSummary({ quarter, count, selectedName, onClearSelection, watch, onSelectQuarter }) {
    return (
        <QuarterSummary
            quarter={quarter}
            count={count}
            watch={watch}
            selectedName={selectedName}
            onClearSelection={onClearSelection}
            onSelectQuarter={onSelectQuarter}
        />
    );
}

// What a forecast quarter asks of the office, shown after the ranking.
export function ForecastInsights({ quarter, watch, selectedName, onSelectBgy, onHoverBgy }) {
    if (!watch) return null;
    // With a barangay open, only its own land-use split applies; the town-wide
    // watchlist steps aside.
    if (selectedName) {
        const own = watch.mixByBgy?.[selectedName.trim().toLowerCase()];
        return own?.length > 0 ? <ExpectedMix mix={own} bgyName={selectedName} /> : null;
    }
    return (
        <>
            <ForecastWatchlist watch={watch} quarterLabel={quarter.quarter} onSelectBgy={onSelectBgy} onHoverBgy={onHoverBgy} />
            {watch.mix?.length > 0 && <ExpectedMix mix={watch.mix} />}
        </>
    );
}
