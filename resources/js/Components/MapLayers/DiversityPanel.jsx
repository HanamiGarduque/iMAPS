import { useEffect, useMemo, useState } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import MixDonut from './diversity/MixDonut';
import { ZONE_CATEGORIES } from '@/utils/clupZones';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import { getLens, resolveLensValue, rankByLens, matchesBand, computeDiversityAggregates, findRank } from '@/utils/diversityTheme';

// Land-use mix for the municipality or the selected barangay, over the rolling
// five-year window picked on the map's timeline (the latest by default): the
// score, how it compares with the CLUP 2030 plan, and what the filed land is
// made of. Every barangay ranked follows, five at a time; hovering a row
// lights the barangay on the map, clicking opens it.
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
    const rankInfo = useMemo(() => findRank(aggregates.ranked, bgyName), [aggregates, bgyName]);

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
    const periodLabel = period?.from ? `${month(period.from)} – ${month(period.to)}` : 'the last five years';

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

    const signed = (v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;
    const context = isBgy
        ? score == null
            ? `${records} filing${records === 1 ? "" : "s"} in this period`
            : `${rankInfo ? `Rank ${rankInfo.rank} of ${rankInfo.total} · ` : ""}${municipalScore == null ? "" : `${signed(score - municipalScore)} vs all of Rosario`}`
        : `All of Rosario · ${aggregates.count} barangays scored`;

    return (
        <div className="relative flex-1 min-h-0 flex flex-col bg-white">
            <div className="flex-1 min-h-0 overflow-y-auto">
            <div className="shrink-0 flex items-stretch border-b border-slate-200">
                <div
                    className="w-[76px] shrink-0 flex flex-col items-center justify-center py-2.5 transition-colors duration-500"
                    style={{ backgroundColor: headline.color, color: headline.onFill }}
                >
                    <span className="text-[20px] font-semibold tabular-nums leading-none">{shown}</span>
                    <span className="text-[9.5px] uppercase tracking-[0.08em] opacity-80 mt-1">Mix score</span>
                </div>
                <div className="flex-1 min-w-0 px-3 py-2">
                    <span className="block text-[12.5px] font-semibold text-slate-900 leading-tight">{headline.band.classification}</span>
                    <span className="block text-[11px] text-slate-500 leading-snug line-clamp-2 mt-0.5">{headline.band.summary}</span>
                    <span className="block text-[10.5px] tabular-nums text-slate-500 mt-1">{context}</span>
                </div>
            </div>

            {typeof planScore === 'number' && (
                <div className="shrink-0 flex items-baseline justify-between gap-2 px-4 py-2 border-b border-slate-200 text-[11px]">
                    <span className="text-slate-500">CLUP 2030 plan mix</span>
                    <span className="tabular-nums text-slate-700">
                        {lens.format(planScore)}
                        {fromRecords && score != null && (
                            <span className="ml-1.5 text-slate-500">({signed(score - planScore)} recorded vs plan)</span>
                        )}
                    </span>
                </div>
            )}

            <div className="shrink-0 px-4 py-3 border-b border-slate-200">
                <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        Filed land use · {isBgy ? bgyName : "Rosario"}
                    </h3>
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

            {fromRecords && score != null && distribution.length > 0 && (
                <div className="shrink-0 border-b border-slate-200">
                    <div className="flex items-baseline justify-between px-4 pt-3 pb-1.5">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">Filed vs CLUP 2030 plan</h3>
                        <span className="text-[10.5px] text-slate-400">Share of area</span>
                    </div>
                    <div className="grid grid-cols-[12px_1fr_46px_46px] gap-x-2 px-4 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.06em] text-slate-400">
                        <span />
                        <span>Zone filed under</span>
                        <span className="text-right">Filed</span>
                        <span className="text-right">Plan</span>
                    </div>
                    <ul className="pb-1">
                        {distribution.map((d) => {
                            const zone = ZONE_CATEGORIES[d.name] || { label: d.name, fill: "#e2e8f0", stroke: "#94a3b8" };
                            const plan = planDistribution.find((p) => p.name === d.name)?.value ?? 0;
                            // Much more filed than the plan sets aside for it.
                            const outOfPlan = d.value >= 10 && plan < 2;
                            return (
                                <li key={d.name} className="grid grid-cols-[12px_1fr_46px_46px] items-center gap-x-2 px-4 py-[3px] text-[12px]">
                                    <span className="w-2.5 h-2.5 rounded-[2px] border" style={{ backgroundColor: zone.fill, borderColor: zone.stroke }} aria-hidden="true" />
                                    <span className="min-w-0 flex items-center gap-1.5 text-slate-700">
                                        <span className="truncate">{zone.label}</span>
                                        {outOfPlan && (
                                            <span
                                                className="shrink-0 text-[8.5px] font-bold uppercase tracking-[0.05em] px-1 rounded-[3px] bg-amber-100 text-amber-800 border border-amber-300"
                                                title={`${d.value}% of the filed lot area is under ${zone.label} zoning, which is ${plan}% of this area in CLUP 2030. Check these filings' zoning codes.`}
                                            >
                                                Check
                                            </span>
                                        )}
                                    </span>
                                    <span className="text-right tabular-nums font-semibold text-slate-900">{d.value}%</span>
                                    <span className="text-right tabular-nums text-slate-500">{plan}%</span>
                                </li>
                            );
                        })}
                    </ul>
                    <p className="px-4 pt-1 pb-3 text-[10.5px] text-slate-400 leading-snug">
                        Lot area of filings over the five years to {period?.label || "the latest filing"} ({periodLabel}
                        {period?.isPartial ? `; records start ${month(period.from)}, so only ${period.quarters} of 20 quarters` : ""}),
                        by the zone each was filed under. A few large lots can outweigh many small ones. Filings without a zoning code
                        or lot area are not counted. The mix score above is the Shannon index of this split ÷ ln 11.
                    </p>
                </div>
            )}

            <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">Diversity by barangay</h3>
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
            </div>
        </div>
    );
}
