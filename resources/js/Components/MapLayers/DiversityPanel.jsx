import { useEffect, useMemo, useState } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import MixDonut from './diversity/MixDonut';
import { ZONE_CATEGORIES } from '@/utils/clupZones';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import { getLens, resolveLensValue, rankByLens, matchesBand, computeDiversityAggregates } from '@/utils/diversityTheme';

// Land-use mix for the municipality or the selected barangay, over the rolling
// five-year window picked on the map's timeline (the latest by default): the
// score, how it compares with the CLUP 2030 plan, and what the filed land is
// made of. Every barangay ranked follows, five at a time; hovering a row
// lights the barangay on the map, clicking opens it.
const Question = ({ children, className = "" }) => (
    <h3 className={`text-[12px] font-semibold leading-snug text-slate-800 ${className}`}>{children}</h3>
);

export default function DiversityPanel({
    overallDiversity,
    period = null,
    selectedBgy,
    onSelectBgy = () => {},
    bgyStats = {},
    bandFilter = "all",
    hoveredBgy = null,
    onHoverBgy = () => {},
}) {
    const lens = getLens("mix");
    const isBgy = Boolean(selectedBgy?.name);
    const bgyName = selectedBgy?.name || "";
    const PAGE_SIZE = 5;
    const [page, setPage] = useState(0);

    const matchedGeoBgy = useMemo(
        () => (bgyName ? ROSARIO_BARANGAYS_DATA.find((b) => b.name.toLowerCase() === bgyName.toLowerCase()) : null),
        [bgyName]
    );
    // The live backend record is authoritative; the click payload is a fallback.
    const bgyStat = useMemo(() => (bgyName ? bgyStats?.[bgyName] || selectedBgy?.data || {} : {}), [bgyStats, bgyName, selectedBgy]);

    const aggregates = useMemo(
        () => computeDiversityAggregates(Object.entries(bgyStats || {}).map(([name, s]) => ({ name, diversity: s?.diversity }))),
        [bgyStats]
    );
    const municipalScore = typeof overallDiversity?.score === 'number' ? overallDiversity.score : null;

    // null = too few filings in this period to score.
    const score = isBgy ? (typeof bgyStat.diversity === 'number' ? bgyStat.diversity : null) : municipalScore;
    const headline = resolveLensValue("mix", { diversity: score });
    const animated = useAnimatedNumber(score ?? 0);
    const shown = score == null ? "—" : lens.format(animated);

    // The donut is the land-use class of the filings in the selected period,
    // so it moves with the timeline; the plan is only the comparison column.
    const distribution = isBgy ? bgyStat.distribution || matchedGeoBgy?.dist || [] : overallDiversity?.distribution || [];
    const planDistribution = (isBgy ? bgyStat.baselineDistribution : overallDiversity?.planDistribution) || [];
    const fromRecords = (isBgy ? bgyStat.mixSource : overallDiversity?.source) === 'records';
    const records = isBgy ? bgyStat.mixRecords ?? 0 : overallDiversity?.records ?? 0;
    const developedHa = isBgy ? bgyStat.developedHa ?? 0 : overallDiversity?.developedHa ?? 0;
    const planScore = isBgy ? bgyStat.clupTargetDiversity : overallDiversity?.planScore;
    const month = (d) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-PH', { month: 'short', year: 'numeric' }) : '');
    // A finished year reads "in 2023"; the current one is still running, so it
    // reads "as of October 2026" (today's month).
    const now = new Date();
    const yearPhrase = !period?.year ? ""
        : period.year === now.getFullYear() ? `, as of ${now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' })}`
        : ` in ${period.year}`;
    const periodLabel =period?.from ? `${month(period.from)} – ${month(period.to)}` : 'the last five years';

    const ranking = useMemo(
        () => rankByLens("mix", bgyStats).filter((r) => matchesBand("mix", bandFilter, r.stat)),
        [bgyStats, bandFilter]
    );

    useEffect(() => setPage(0), [bandFilter, period?.label]);
    const pageCount = Math.max(1, Math.ceil(ranking.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageStart = safePage * PAGE_SIZE;
    const visibleRanking = ranking.slice(pageStart, pageStart + PAGE_SIZE);

    const unscored = Object.values(bgyStats || {}).filter((st) => typeof st?.diversity !== 'number').length;

    // Every zone that was filed on or is in the plan, most filed first, then
    // by zoned area so zones with no filings still show how much land waits.
    const zoneRows = [...new Set([...distribution, ...planDistribution].map((d) => d.name))]
        .map((name) => {
            const filed = distribution.find((d) => d.name === name);
            return {
                name,
                filedHa: filed ? filed.ha ?? (filed.value / 100) * developedHa : 0,
                zonedHa: planDistribution.find((p) => p.name === name)?.ha ?? 0,
            };
        })
        .sort((a, b) => b.filedHa - a.filedHa || b.zonedHa - a.zonedHa);
    const fmtHa = (v) => (v === 0 ? "0" : v < 1 ? v.toFixed(2) : v < 100 ? v.toFixed(1) : Math.round(v).toLocaleString('en-PH'));
    const fmtOfZone = (filed, zoned) => {
        if (zoned <= 0) return "—";
        if (filed === 0) return "0%";
        const p = (filed / zoned) * 100;
        return p < 0.1 ? "<0.1%" : p < 10 ? `${p.toFixed(1)}%` : `${Math.round(p)}%`;
    };

    const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
    const context = isBgy
        ? score == null
            ? `${records} filing${records === 1 ? "" : "s"} in this period`
            : municipalScore == null ? "" : `${signed(score - municipalScore)} vs all of Rosario`
        : `All of Rosario · ${aggregates.count} barangays scored`;

    return (
        <div className="relative flex-1 min-h-0 flex flex-col bg-white">
            <div className="flex-1 min-h-0 overflow-y-auto">
            {/* Same building blocks as the Application Tracking panel: question
                headings, a big headline figure, bordered tiles, sections split by rules. */}
            <section className="shrink-0 border-b border-slate-200 px-4 pt-3 pb-3">
                <Question className="mb-2">How mixed is land use in {isBgy ? bgyName : "Rosario"}{yearPhrase}?</Question>
                <div className="flex items-stretch gap-2">
                    <div className="flex-1 min-w-0 flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2">
                        <span className="text-[34px] font-semibold leading-none tabular-nums text-slate-900">{shown}</span>
                        <span className="min-w-0">
                            <span
                                className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-md transition-colors duration-500"
                                style={{ backgroundColor: headline.color, color: headline.onFill }}
                            >
                                {headline.band.classification}
                            </span>
                            <span className="block text-[10.5px] text-slate-500 mt-1">Mix score, 0 to 1</span>
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
                <p className="mt-1 text-[10.5px] tabular-nums text-slate-400">{context}</p>
            </section>

            {/* A selected barangay's filed land use is on its pop-up card on the map. */}
            {!isBgy && (
            <div className="shrink-0 px-4 py-3 border-b border-slate-200">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                    <Question>What land use was filed?</Question>
                    {fromRecords && (
                        <span className="text-[10.5px] tabular-nums text-slate-400">
                            {Number(records).toLocaleString('en-PH')} filings · {Number(developedHa).toLocaleString('en-PH')} ha
                        </span>
                    )}
                </div>
                {score == null || !fromRecords || distribution.length === 0 ? (
                    <p className="text-[11px] text-slate-500 py-3 text-center">
                        Too few filings with a zoning code and lot area in {periodLabel} to show.
                    </p>
                ) : (
                    <MixDonut distribution={distribution} replayKey={bgyName || "__all__"} centerValue={shown} centerLabel="Mix" />
                )}
            </div>
            )}

            {/* Filings are compared with the plan as filed area ÷ zoned area, not
                share against share: the plan zones all land, filings are only the
                lots being developed, so their two splits are not meant to match. */}
            {fromRecords && score != null && zoneRows.length > 0 && (
                <div className="shrink-0 border-b border-slate-200">
                    <div className="flex items-baseline justify-between px-4 pt-3 pb-1.5">
                        <Question>How much of each zone was filed on?</Question>
                        <span className="text-[10.5px] text-slate-400">Lot area, ha</span>
                    </div>
                    <div className="grid grid-cols-[12px_1fr_48px_56px_46px] gap-x-1.5 px-4 pb-1 text-[10px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        <span />
                        <span>CLUP zone</span>
                        <span className="text-right">Filed</span>
                        <span className="text-right">Zoned</span>
                        <span className="text-right">Of zone</span>
                    </div>
                    <ul className="pb-1">
                        {zoneRows.map((r) => {
                            const zone = ZONE_CATEGORIES[r.name] || { label: r.name, fill: "#e2e8f0", stroke: "#94a3b8" };
                            const place = isBgy ? bgyName : "Rosario";
                            // Filings the plan cannot hold: a zone this area does not
                            // have, or more lot area than the zone has.
                            const check = r.filedHa > 0 && r.zonedHa === 0
                                ? `${fmtHa(r.filedHa)} ha was filed under ${zone.label} zoning, but CLUP 2030 zones no land in ${place} as ${zone.label}. Check these filings' zoning codes.`
                                : r.filedHa > r.zonedHa
                                    ? `More lot area was filed under ${zone.label} zoning (${fmtHa(r.filedHa)} ha) than CLUP 2030 zones for it in ${place} (${fmtHa(r.zonedHa)} ha). The same lot filed more than once, or a wrong zoning code, would do this.`
                                    : null;
                            return (
                                <li key={r.name} className="grid grid-cols-[12px_1fr_48px_56px_46px] items-center gap-x-1.5 px-4 py-[3px] text-[12px]">
                                    <span className="w-2.5 h-2.5 rounded-[2px] border" style={{ backgroundColor: zone.fill, borderColor: zone.stroke }} aria-hidden="true" />
                                    <span className="min-w-0 flex items-center gap-1.5 text-slate-700">
                                        <span className="truncate">{zone.label}</span>
                                        {check && (
                                            <span
                                                className="shrink-0 text-[10px] font-bold uppercase tracking-[0.05em] px-1 rounded-[3px] bg-amber-100 text-amber-800 border border-amber-300"
                                                title={check}
                                            >
                                                Check
                                            </span>
                                        )}
                                    </span>
                                    <span className={`text-right tabular-nums ${r.filedHa > 0 ? "font-semibold text-slate-900" : "text-slate-400"}`}>{fmtHa(r.filedHa)}</span>
                                    <span className="text-right tabular-nums text-slate-500">{r.zonedHa > 0 ? fmtHa(r.zonedHa) : "—"}</span>
                                    <span className="text-right tabular-nums font-semibold text-slate-700">{fmtOfZone(r.filedHa, r.zonedHa)}</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="px-4 pt-1 pb-3 text-[10.5px] text-slate-400 leading-snug">
                        Filed: lot area of filings over the five years to {period?.label || "the latest filing"} ({periodLabel}
                        {period?.isPartial ? `; records start ${month(period.from)}, so only ${period.quarters} of 20 quarters` : ""}),
                        by the zone each was filed under. Zoned: land CLUP 2030 sets aside for that zone. Of zone: filed ÷ zoned.
                        The plan zones all land and only part of it is developed in five years, so a low share is normal, most of all
                        for farmland and forest. Filings without a zoning code or lot area, and utilities and roads, are not counted. The mix
                        score above is the Shannon index of the filed split ÷ ln 10.
                    </p>
                </div>
            )}

            {/* The ranking is for picking a barangay; once one is open it steps aside. */}
            {!isBgy && (<>
            <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                <Question className="mr-auto">Which barangays are most mixed?</Question>
                <span className="text-[10.5px] text-slate-400">Highest mix first</span>
            </div>
            <ol className="border-t border-slate-200" onMouseLeave={() => onHoverBgy(null)}>
                {ranking.length === 0 && (
                    <li className="px-4 py-6 text-center text-[12px] text-slate-500">No barangays in this band.</li>
                )}
                {visibleRanking.map((r, idx) => {
                    const i = pageStart + idx;
                    const selected = bgyName && r.name.toLowerCase() === bgyName.toLowerCase();
                    const hovered = hoveredBgy && r.name.toLowerCase() === hoveredBgy.toLowerCase();
                    return (
                        <li key={r.name}>
                            <button
                                type="button"
                                onClick={() => onSelectBgy(r.name)}
                                onMouseEnter={() => onHoverBgy(r.name)}
                                onFocus={() => onHoverBgy(r.name)}
                                className={`w-full grid grid-cols-[20px_12px_1fr_64px_34px] items-center gap-2 px-4 py-1.5 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b] ${
                                    selected ? 'bg-[#eaf0f8] shadow-[inset_3px_0_0_#0b2a5b]' : hovered ? 'bg-slate-100' : 'hover:bg-slate-50'
                                }`}
                            >
                                <span className="text-[10.5px] tabular-nums text-slate-400">{i + 1}</span>
                                <span className="w-3 h-3 rounded-[2px] border border-black/15" style={{ backgroundColor: r.band.fill }} aria-hidden="true" />
                                <span className="text-[12px] text-slate-800 truncate">{r.name}</span>
                                <span className="h-1.5 rounded-sm bg-slate-100 overflow-hidden" aria-hidden="true">
                                    <span className="block h-full rounded-sm" style={{ width: `${Math.max(3, r.value * 100)}%`, backgroundColor: r.band.fill }} />
                                </span>
                                <span className="text-[12px] font-semibold tabular-nums text-slate-900 text-right">{lens.format(r.value)}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {ranking.length > PAGE_SIZE && (
                <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-slate-200 bg-slate-50/70">
                        <button
                            type="button"
                            onClick={() => setPage(safePage - 1)}
                            disabled={safePage === 0}
                            aria-label="Previous five barangays"
                            className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>
                    <span className="text-[10.5px] tabular-nums text-slate-500">
                        {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, ranking.length)} of {ranking.length}
                    </span>
                        <button
                            type="button"
                            onClick={() => setPage(safePage + 1)}
                            disabled={safePage >= pageCount - 1}
                            aria-label="Next five barangays"
                            className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                        </button>
                </div>
            )}
            {unscored > 0 && bandFilter === "all" && (
                <p className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
                    {unscored} barangay{unscored === 1 ? "" : "s"} with too few filings in this period, not ranked.
                </p>
            )}
            </>)}
            </div>
        </div>
    );
}
