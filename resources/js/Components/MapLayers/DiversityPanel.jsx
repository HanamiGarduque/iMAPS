import { useEffect, useMemo, useState } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import MixDonut from './diversity/MixDonut';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import { getLens, resolveLensValue, rankByLens, matchesBand, computeDiversityAggregates, findRank } from '@/utils/diversityTheme';

// Land-use mix for the municipality or the selected barangay, over the rolling
// five-year window picked on the map's timeline (the latest by default): the
// score, how it compares with the CLUP 2030 plan, and what the filed land is
// made of. Every barangay ranked sits behind a button, in a view that covers
// the panel; hovering a row lights the barangay on the map, clicking opens it.
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
    const [showRanking, setShowRanking] = useState(false);

    // Opening a barangay (from the map or the list) shows its summary.
    useEffect(() => { if (bgyName) setShowRanking(false); }, [bgyName]);

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

    const distribution = isBgy ? bgyStat.distribution || matchedGeoBgy?.dist || [] : overallDiversity?.distribution || [];
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
                        {fromRecords && score != null ? (
                            <span className="ml-1.5 text-slate-500">({signed(score - planScore)} recorded vs plan)</span>
                        ) : (
                            <span className="ml-1.5 text-slate-500">(insufficient data for plan drift)</span>
                        )}
                    </span>
                </div>
            )}

            <div className="shrink-0 px-4 py-3 border-b border-slate-200">
                <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        {fromRecords ? "Recorded development" : "CLUP 2030 zoning"} · {isBgy ? bgyName : "Rosario"}
                    </h3>
                    <span className="text-[10.5px] tabular-nums text-slate-400">
                        {fromRecords
                            ? `${Number(records).toLocaleString('en-PH')} filings · ${Number(developedHa).toLocaleString('en-PH')} ha`
                            : `${distribution.length} categories`}
                    </span>
                </div>
                {score == null ? (
                    <p className="text-[11px] text-slate-500 py-3 text-center">
                        Too few filings with a lot area in {periodLabel} to score.
                    </p>
                ) : (
                    <MixDonut distribution={distribution} replayKey={bgyName || "__all__"} centerValue={shown} centerLabel="Mix" />
                )}
                <p className="mt-2 text-[10.5px] text-slate-400 leading-snug">
                    {fromRecords
                        ? `Lot area filed per CLUP land-use category over the five years to ${period?.label || "the latest filing"} (${periodLabel}${period?.isPartial ? `; records start ${month(period.from)}, so only ${period.quarters} of 20 quarters` : ""}). Score: Shannon index ÷ ln 11.`
                        : "Too few recorded filings in the last five years; showing the plan."}
                </p>
            </div>

            <div className="px-4 py-3">
                <button
                    type="button"
                    onClick={() => setShowRanking(true)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-[4px] border border-slate-300 bg-white text-left cursor-pointer hover:bg-slate-50 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#0b2a5b]"
                >
                    <span className="min-w-0">
                        <span className="block text-[12px] font-semibold text-slate-800">See all barangays ranked</span>
                        <span className="block text-[10.5px] text-slate-500">{ranking.length} barangays, highest mix first</span>
                    </span>
                    <svg className="w-4 h-4 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                </button>
            </div>
            </div>

            {showRanking && (
                <div className="absolute inset-0 z-10 flex flex-col bg-white" role="dialog" aria-label="All barangays ranked">
                    <div className="shrink-0 flex items-center gap-2 px-2 py-2 border-b border-slate-200">
                        <button
                            type="button"
                            onClick={() => setShowRanking(false)}
                            className="flex items-center gap-1 px-2 py-1 rounded-[3px] text-[12px] font-semibold text-slate-700 cursor-pointer hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            Back
                        </button>
                        <h3 className="text-[12px] font-semibold text-slate-800 mr-auto">All barangays</h3>
                        <span className="pr-2 text-[10.5px] text-slate-400">Highest mix first</span>
                    </div>
                    <ol className="flex-1 min-h-0 overflow-y-auto" onMouseLeave={() => onHoverBgy(null)}>
                        {ranking.length === 0 && (
                            <li className="px-4 py-6 text-center text-[12px] text-slate-500">No barangays in this band.</li>
                        )}
                        {ranking.map((r, i) => {
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
                        {unscored > 0 && bandFilter === "all" && (
                            <li className="px-4 py-2 text-[11px] text-slate-500 border-t border-slate-100">
                                {unscored} barangay{unscored === 1 ? "" : "s"} with too few filings in this period, not ranked.
                            </li>
                        )}
                    </ol>
                </div>
            )}
        </div>
    );
}
