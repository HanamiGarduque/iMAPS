import { useMemo } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import { ZONE_CATEGORIES } from '@/utils/clupZones';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import { getLens, resolveLensValue, computeBandCounts } from '@/utils/diversityTheme';

// Land-use mix for the municipality or the selected barangay, over the rolling
// five-year window picked on the map's timeline (the latest by default). Built
// like the Application Tracking panel so it fits without scrolling: the score
// tiles, one stacked bar of what was filed, and one row of band circles. The
// map does the ranking; clicking a band lights its barangays there.
const Question = ({ children, className = "" }) => (
    <h3 className={`text-[12px] font-semibold leading-snug text-slate-800 ${className}`}>{children}</h3>
);

const CARD = "shrink-0 border-b border-slate-200";
const TOP_ZONES = 3;
// Zones listed under "How much of each zone was filed on?".
const ZONE_ROWS = 4;

const fmtHa = (v) => (v === 0 ? "0" : v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-PH'));
const fmtOfZone = (filed, zoned) => {
    if (zoned <= 0) return "—";
    const p = (filed / zoned) * 100;
    return p < 0.1 ? "<0.1%" : p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
};

export default function DiversityPanel({
    overallDiversity,
    period = null,
    selectedBgy,
    onSelectBgy = () => {},
    bgyStats = {},
    bandFilter = "all",
    onSelectBand = () => {},
    onHoverBgy = () => {},
}) {
    const lens = getLens("mix");
    const isBgy = Boolean(selectedBgy?.name);
    const bgyName = selectedBgy?.name || "";

    const matchedGeoBgy = useMemo(
        () => (bgyName ? ROSARIO_BARANGAYS_DATA.find((b) => b.name.toLowerCase() === bgyName.toLowerCase()) : null),
        [bgyName]
    );
    // The live backend record is authoritative; the click payload is a fallback.
    const bgyStat = useMemo(() => (bgyName ? bgyStats?.[bgyName] || selectedBgy?.data || {} : {}), [bgyStats, bgyName, selectedBgy]);

    const municipalScore = typeof overallDiversity?.score === 'number' ? overallDiversity.score : null;

    // null = too few filings in this period to score.
    const score = isBgy ? (typeof bgyStat.diversity === 'number' ? bgyStat.diversity : null) : municipalScore;
    const headline = resolveLensValue("mix", { diversity: score });
    const animated = useAnimatedNumber(score ?? 0);
    const shown = score == null ? "—" : lens.format(animated);

    const distribution = isBgy ? bgyStat.distribution || matchedGeoBgy?.dist || [] : overallDiversity?.distribution || [];
    const fromRecords = (isBgy ? bgyStat.mixSource : overallDiversity?.source) === 'records';
    const records = isBgy ? bgyStat.mixRecords ?? 0 : overallDiversity?.records ?? 0;
    const planScore = isBgy ? bgyStat.clupTargetDiversity : overallDiversity?.planScore;
    const month = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '');
    // A finished year reads "in 2023"; the current one is still running, so it
    // reads "as of October 2026" (today's month).
    const now = new Date();
    const yearPhrase = !period?.year ? ""
        : period.year === now.getFullYear() ? `, as of ${now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`
        : ` in ${period.year}`;
    const periodLabel = period?.from ? `${month(period.from)} – ${month(period.to)}` : 'the last five years';

    // The bar draws every zone; the chips name the biggest few and fold the rest.
    const segments = useMemo(() => {
        const zones = [...distribution]
            .filter((d) => d.value > 0)
            .sort((a, b) => b.value - a.value)
            .map((d) => ({ ...d, zone: ZONE_CATEGORIES[d.name] || { label: d.name, fill: "#e2e8f0", stroke: "#94a3b8" } }));
        const top = zones.slice(0, TOP_ZONES);
        const rest = zones.slice(TOP_ZONES).reduce((sum, d) => sum + d.value, 0);
        return { zones, chips: rest > 0 ? [...top, { name: "__other", value: Math.round(rest), zone: { label: "Other", fill: "#e2e8f0", stroke: "#94a3b8" } }] : top };
    }, [distribution]);

    const bandCounts = useMemo(() => computeBandCounts("mix", bgyStats), [bgyStats]);

    // A selected barangay's score, band and land use are on its pop-up on the
    // map, so the panel answers the other question: how it compares with its
    // CLUP 2030 plan and with the town.
    // Filings are compared with the plan as filed area ÷ zoned area, not share
    // against share: the plan zones all land, filings are only the lots being
    // developed, so their two splits are not meant to match.
    const planDistribution = isBgy ? bgyStat.baselineDistribution || [] : [];
    const developedHa = bgyStat.developedHa ?? 0;
    const zoneRows = useMemo(() => {
        const rows = segments.zones.map((d) => {
            const filedHa = d.ha ?? (d.value / 100) * developedHa;
            const zonedHa = planDistribution.find((p) => p.name === d.name)?.ha ?? 0;
            // Filings the plan cannot hold: a zone this barangay does not
            // have, or more lot area than the zone has.
            const check = zonedHa === 0
                ? `${fmtHa(filedHa)} ha was filed under ${d.zone.label} zoning, but CLUP 2030 zones no land in ${bgyName} as ${d.zone.label}. Check these filings' zoning codes.`
                : filedHa > zonedHa
                    ? `More lot area was filed under ${d.zone.label} zoning (${fmtHa(filedHa)} ha) than CLUP 2030 zones for it in ${bgyName} (${fmtHa(zonedHa)} ha). The same lot filed more than once, or a wrong zoning code, would do this.`
                    : null;
            return { ...d, filedHa, zonedHa, check };
        }).sort((a, b) => b.filedHa - a.filedHa);
        // The zones with the most land filed on, and any that need checking.
        return rows.filter((r, i) => i < ZONE_ROWS || r.check);
    }, [segments, planDistribution, developedHa, bgyName]);
    const moreZones = segments.zones.length - zoneRows.length;

    // Within 0.05 reads as on par: smaller gaps are noise in a 0–1 index.
    const gap = (diff, what) => (Math.abs(diff) < 0.05
        ? `close to ${what}`
        : `${diff > 0 ? "more" : "less"} mixed than ${what}`);
    const compareLine = score == null ? "" : [
        typeof planScore === 'number' && gap(score - planScore, "its CLUP 2030 target"),
        municipalScore != null && gap(score - municipalScore, "the Rosario average"),
    ].filter(Boolean).join(" and ");

    // Same tiles as the town view: a large headline figure, then the smaller
    // right-aligned comparison tiles.
    const Tile = ({ value, label }) => (
        <div className="shrink-0 min-w-[92px] flex flex-col justify-center rounded-lg border border-slate-200 px-3 py-2 text-right">
            <span className="block text-[15px] font-semibold leading-tight tabular-nums text-slate-800">
                {typeof value === 'number' ? lens.format(value) : "—"}
            </span>
            <span className="block text-[10.5px] leading-tight text-slate-500">{label}</span>
        </div>
    );

    if (isBgy) {
        return (
            <div className="relative shrink-0 flex flex-col bg-white">
                <section className={`${CARD} px-4 pt-3 pb-3`}>
                    <Question className="mb-2">Is {bgyName} on track with the CLUP 2030 plan{yearPhrase}?</Question>
                    <div className="flex items-stretch gap-2">
                        <div className="flex-1 min-w-0 flex items-center rounded-lg border border-slate-200 px-3 py-2">
                            <span className="text-[34px] font-semibold leading-none tabular-nums text-slate-900">{shown}</span>
                        </div>
                        <Tile value={planScore} label="CLUP 2030 plan" />
                        <Tile value={municipalScore} label="All of Rosario" />
                    </div>
                    <p className="mt-2 text-[11.5px] leading-snug text-slate-600">
                        {score == null
                            ? `${records} filing${records === 1 ? "" : "s"} in ${periodLabel}, too few to score.`
                            : `Land use in ${bgyName} is ${compareLine}.`}
                    </p>
                </section>

                {score != null && fromRecords && zoneRows.length > 0 && (
                    <section className={`${CARD} px-4 pt-3 pb-3`}>
                        {/* One row per zone: the whole bar is the land CLUP 2030 zones for
                            that use in the barangay, the filled part is how much of it was
                            filed on. One measure, so the bar and the figure always agree. */}
                        <div className="flex items-baseline justify-between gap-2 mb-2">
                            <Question>How much of each zone was filed on?</Question>
                            <span className="text-[10.5px] text-slate-400">Filed of CLUP zone</span>
                        </div>
                        <ul className="space-y-1.5">
                            {zoneRows.map((r) => {
                                const pct = r.zonedHa > 0 ? Math.min(100, (r.filedHa / r.zonedHa) * 100) : 100;
                                return (
                                    <li
                                        key={r.name}
                                        className="grid grid-cols-[10px_minmax(0,1fr)_minmax(0,1.2fr)_40px] items-center gap-x-2"
                                        title={r.check || `${fmtHa(r.filedHa)} ha filed on, of the ${fmtHa(r.zonedHa)} ha CLUP 2030 zones ${r.zone.label} in ${bgyName}`}
                                    >
                                        <span className="w-2.5 h-2.5 rounded-[2px] border" style={{ backgroundColor: r.zone.fill, borderColor: r.zone.stroke }} aria-hidden="true" />
                                        <span className="min-w-0">
                                            <span className="flex items-center gap-1.5 text-[11.5px] leading-tight text-slate-700">
                                                <span className="truncate">{r.zone.label}</span>
                                                {r.check && (
                                                    <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.05em] px-1 rounded-[3px] bg-amber-100 text-amber-800 border border-amber-300">
                                                        Check
                                                    </span>
                                                )}
                                            </span>
                                            <span className="block text-[10px] leading-tight tabular-nums text-slate-400">
                                                {fmtHa(r.filedHa)} of {r.zonedHa > 0 ? fmtHa(r.zonedHa) : "0"} ha
                                            </span>
                                        </span>
                                        <span className="h-2 rounded-sm bg-slate-100 border border-slate-200 overflow-hidden" aria-hidden="true">
                                            <span
                                                className="block h-full transition-[width] duration-500"
                                                style={{ width: r.filedHa > 0 ? `max(2px, ${pct}%)` : 0, backgroundColor: r.zone.stroke }}
                                            />
                                        </span>
                                        <span className="text-right text-[11.5px] tabular-nums font-semibold text-slate-900">{fmtOfZone(r.filedHa, r.zonedHa)}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        <p className="mt-2 text-[10.5px] leading-snug text-slate-400">
                            Bar = CLUP 2030 zone · fill = filed, {periodLabel}
                            {moreZones > 0 ? ` · +${moreZones} smaller zone${moreZones === 1 ? "" : "s"}` : ""}
                        </p>
                    </section>
                )}
            </div>
        );
    }

    return (
        <div className="relative shrink-0 flex flex-col bg-white">
            <div>
            <section className={`${CARD} px-4 pt-3 pb-3`}>
                <Question className="mb-2">How mixed is land use in {isBgy ? bgyName : "Rosario"}{yearPhrase}?</Question>
                <div className="flex items-stretch gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-[34px] font-semibold leading-none tabular-nums text-slate-900">{shown}</span>
                        <span
                            className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors duration-500"
                            style={{ backgroundColor: headline.color, color: headline.onFill }}
                        >
                            {headline.band.classification}
                        </span>
                    </div>
                    {typeof planScore === 'number' && (
                        <div className="shrink-0 min-w-[104px] flex flex-col justify-center rounded-lg border border-slate-200 px-3 py-2 text-right">
                            <span className="block text-[15px] font-semibold leading-tight tabular-nums text-slate-800">{lens.format(planScore)}</span>
                            <span className="block text-[10.5px] leading-tight text-slate-500">CLUP 2030 plan</span>
                        </div>
                    )}
                </div>
                <p className="mt-2 text-[11.5px] leading-snug text-slate-600">{headline.band.summary}</p>
            </section>

            <section className={`${CARD} px-4 pt-3 pb-3`}>
                <Question className="mb-2">What land use was filed?</Question>
                {score == null || !fromRecords || segments.zones.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-1">
                        Too few filings with a zoning code and lot area in {periodLabel} to show.
                    </p>
                ) : (<>
                    <div className="flex h-3 rounded-sm overflow-hidden bg-slate-100" role="img" aria-label="Share of filed lot area by zone">
                        {segments.zones.map((d) => (
                            <span
                                key={d.name}
                                className="h-full border-r border-white last:border-r-0 transition-[width] duration-500"
                                style={{ width: `${d.value}%`, backgroundColor: d.zone.fill }}
                                title={`${d.zone.label}: ${d.value}%`}
                            />
                        ))}
                    </div>
                    <ul className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                        {segments.chips.map((d) => (
                            <li key={d.name} className="flex items-center gap-1.5 min-w-0 text-[11.5px]">
                                <span className="w-2.5 h-2.5 shrink-0 rounded-[2px] border" style={{ backgroundColor: d.zone.fill, borderColor: d.zone.stroke }} aria-hidden="true" />
                                <span className="truncate text-slate-700">{d.zone.label}</span>
                                <span className="ml-auto tabular-nums font-semibold text-slate-900">{d.value}%</span>
                            </li>
                        ))}
                    </ul>
                    <p className="mt-2 text-[10.5px] leading-snug text-slate-400">
                        Lot area of development clearances, {periodLabel}
                    </p>
                </>)}
            </section>

            {/* Picking a barangay is done on the map; once one is open the town-wide bands step aside. */}
            {!isBgy && (
            <section className={`${CARD} pt-3 pb-3`}>
                <div className="flex items-baseline justify-between gap-2 px-4 pb-2">
                    <Question>How mixed are the barangays?</Question>
                    {bandFilter !== "all" && (
                        <button type="button" onClick={() => onSelectBand("all")} className="text-[10.5px] font-semibold text-[#0b2a5b] hover:underline cursor-pointer">
                            Show all
                        </button>
                    )}
                </div>
                <ol className="relative grid grid-cols-5 px-2">
                    <span className="absolute left-[calc(10%+4px)] right-[calc(10%+4px)] top-[14px] h-px bg-slate-200" aria-hidden="true" />
                    {lens.bands.map((b) => {
                        const count = bandCounts[b.id] ?? 0;
                        const active = bandFilter === b.id;
                        const dimmed = bandFilter !== "all" && !active;
                        return (
                            <li key={b.id} className="relative flex flex-col items-center min-w-0 px-0.5">
                                <button
                                    type="button"
                                    onClick={() => onSelectBand(active ? "all" : b.id)}
                                    disabled={count === 0}
                                    aria-pressed={active}
                                    title={`${b.label}: ${count} barangay${count === 1 ? "" : "s"}`}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-semibold tabular-nums ring-[3px] cursor-pointer disabled:cursor-default transition-opacity ${
                                        active ? "ring-[#0b2a5b]/25" : "ring-white"
                                    } ${dimmed ? "opacity-35" : ""}`}
                                    style={count ? { backgroundColor: b.fill, color: b.onFill, boxShadow: `inset 0 0 0 1px ${b.stroke}` } : { backgroundColor: "#f1f5f9", color: "#94a3b8" }}
                                >
                                    {count}
                                </button>
                                <span className={`mt-1 text-[10px] leading-tight text-center truncate max-w-full ${active ? "font-semibold text-slate-900" : "text-slate-500"}`}>{b.shortLabel}</span>
                            </li>
                        );
                    })}
                </ol>
            </section>
            )}
            </div>
        </div>
    );
}
