import { useMemo } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import MixDonut from './diversity/MixDonut';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import { getLens, resolveLensValue, rankByLens, matchesBand, computeDiversityAggregates, findRank } from '@/utils/diversityTheme';

// Land-use mix for the municipality or the selected barangay: the score, what
// the land is made of, and every barangay ranked. Hovering a row lights the
// barangay on the map; clicking opens it.
export default function DiversityPanel({
    overallDiversity,
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
    const municipalMean = typeof overallDiversity?.score === 'number' ? overallDiversity.score : aggregates.mean;
    const rankInfo = useMemo(() => findRank(aggregates.ranked, bgyName), [aggregates, bgyName]);

    const score = isBgy && typeof bgyStat.diversity === 'number' ? bgyStat.diversity : municipalMean;
    const headline = resolveLensValue("mix", { diversity: score });
    const shown = lens.format(useAnimatedNumber(score));

    const distribution = isBgy ? bgyStat.distribution || matchedGeoBgy?.dist || [] : overallDiversity?.distribution || [];
    const areaHa = isBgy ? bgyStat.areaHa ?? matchedGeoBgy?.area_ha ?? 0 : overallDiversity?.totalAreaHa ?? 0;

    const ranking = useMemo(
        () => rankByLens("mix", bgyStats).filter((r) => matchesBand("mix", bandFilter, r.stat)),
        [bgyStats, bandFilter]
    );

    const diff = score - municipalMean;
    const context = isBgy
        ? `${rankInfo ? `Rank ${rankInfo.rank} of ${rankInfo.total} · ` : ""}${diff >= 0 ? "+" : ""}${diff.toFixed(2)} vs Rosario average`
        : `Average of ${aggregates.count} barangays`;

    return (
        <div className="flex-1 min-h-0 flex flex-col bg-white">
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

            <div className="shrink-0 px-4 py-3 border-b border-slate-200">
                <div className="flex items-baseline justify-between mb-2">
                    <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                        Land use · {isBgy ? bgyName : "Rosario"}
                    </h3>
                    <span className="text-[10.5px] tabular-nums text-slate-400">
                        {areaHa ? `${Number(areaHa).toLocaleString('en-PH')} ha · ` : ""}{distribution.length} zones
                    </span>
                </div>
                <MixDonut distribution={distribution} replayKey={bgyName || "__all__"} centerValue={shown} centerLabel="Mix" />
            </div>

            <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">All barangays</h3>
                <span className="text-[10.5px] text-slate-400">Highest mix first</span>
            </div>
            <ol className="flex-1 min-h-0 overflow-y-auto border-t border-slate-200" onMouseLeave={() => onHoverBgy(null)}>
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
            </ol>
        </div>
    );
}
