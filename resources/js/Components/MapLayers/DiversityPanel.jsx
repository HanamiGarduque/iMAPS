import React, { useMemo } from 'react';
import ROSARIO_BARANGAYS_DATA from './rosario_barangays_data.json';
import OverviewTab from './diversity/OverviewTab';
import DriftTab from './diversity/DriftTab';
import BarangayExplorer from './diversity/BarangayExplorer';
import useAnimatedNumber from '@/utils/useAnimatedNumber';
import {
    DIVERSITY_LENSES,
    getLens,
    resolveLensValue,
    computeBandCounts,
    computeDiversityAggregates,
    findRank,
} from '@/utils/diversityTheme';

// Intelligence panel for the diversity layer.
//
// The panel's tabs ARE the map's lenses: picking "Plan Drift" here repaints the
// map, and picking the drift lens on the map opens this tab. The panel and the
// map always answer the same question, which is the point of the lens model.
//
// Presentation: this is a docked, fully opaque surface. It previously floated
// over the map with a translucent blur, which put body text on top of whatever
// colour the map happened to be showing underneath.
export default function DiversityPanel({
    overallDiversity,
    selectedBgy,
    onClearBgy,
    onSelectBgy,
    bgyStats = {},
    lens = "mix",
    onSelectLens = () => {},
    bandFilter = "all",
    onSelectBand = () => {},
    hoveredBgy = null,
    onHoverBgy = () => {},
}) {
    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || "";
    const activeLens = getLens(lens);

    // Static geometry index, used only for area and as a name fallback.
    const matchedGeoBgy = useMemo(() => {
        if (!bgyName) return null;
        return ROSARIO_BARANGAYS_DATA.find((b) => b.name.toLowerCase() === bgyName.toLowerCase());
    }, [bgyName]);

    // The live backend record is authoritative; the click payload is a fallback.
    const bgyStat = useMemo(() => {
        if (!bgyName) return {};
        return bgyStats?.[bgyName] || selectedBgy?.data || {};
    }, [bgyStats, bgyName, selectedBgy]);

    const mergedForAggregates = useMemo(
        () => Object.entries(bgyStats || {}).map(([name, s]) => ({ name, diversity: s?.diversity })),
        [bgyStats]
    );
    const aggregates = useMemo(() => computeDiversityAggregates(mergedForAggregates), [mergedForAggregates]);
    const municipalMean = typeof overallDiversity?.score === 'number' ? overallDiversity.score : aggregates.mean;
    const rankInfo = useMemo(() => findRank(aggregates.ranked, bgyName), [aggregates, bgyName]);

    const driftCounts = useMemo(() => computeBandCounts("drift", bgyStats), [bgyStats]);

    // Headline figure: the active lens's value for the selection, or the
    // municipal figure when nothing is selected.
    const headline = useMemo(() => {
        if (isBgy) return resolveLensValue(lens, bgyStat);
        if (lens === "mix") return resolveLensValue("mix", { diversity: municipalMean });

        const values = Object.values(bgyStats || {})
            .map((s) => activeLens.getValue(s))
            .filter((v) => typeof v === "number" && !Number.isNaN(v));
        const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        return resolveLensValue(lens, { variance: mean });
    }, [isBgy, lens, bgyStat, municipalMean, bgyStats, activeLens]);

    const liveScore = typeof bgyStat.diversity === 'number' ? bgyStat.diversity : municipalMean;
    const distribution = useMemo(() => {
        if (isBgy) return bgyStat.distribution || matchedGeoBgy?.dist || [];
        return overallDiversity?.distribution || [];
    }, [isBgy, bgyStat, matchedGeoBgy, overallDiversity]);

    // Real area, from MapsController's `land_area` column (PostGIS's own
    // boundary layer). This used to be a hardcoded municipal total — 14700,
    // literally in this file — that was 54% below the real ~22,666 ha, plus a
    // bundled static-fixture fallback per barangay that was also wrong (e.g.
    // Alupay: fixture 502 ha vs real 567 ha). `matchedGeoBgy?.area_ha` stays as
    // a last-resort fallback only for a barangay somehow missing from bgyStats.
    const totalAreaHa = isBgy
        ? (bgyStat.areaHa ?? matchedGeoBgy?.area_ha ?? 0)
        : (overallDiversity?.totalAreaHa ?? 0);
    const activeBand = activeLens.bands.find((b) => b.id === bandFilter);

    // Two replay keys, deliberately different scopes.
    //
    // `identityKey` changes only when the SELECTION itself changes (a
    // different barangay, or back to the municipal view) — it drives the
    // name/label block, which has nothing to do with which lens tab is open.
    //
    // `contentKey` also changes on a lens switch, since the classification,
    // summary and tab body all genuinely depend on which question is active.
    // The tab body used to key on `lens` alone, so switching barangays under
    // the same lens never replayed anything — the numbers just snapped.
    const identityKey = bgyName || "__municipal__";
    const contentKey = `${identityKey}:${lens}`;

    // The headline digits tween toward the new value instead of popping to it.
    // Colour and classification still come from the real target (`headline`
    // itself), never from this intermediate — a badge shouldn't flicker
    // through bands it doesn't actually belong to just because the tween is
    // passing through their numeric range on the way to the real value.
    const animatedHeadlineValue = useAnimatedNumber(headline.value);
    const headlineDisplay = activeLens.format(animatedHeadlineValue);

    return (
        <div className="flex flex-col h-full bg-white">

            {/* Identity + headline. A solid colour block carries the band, so the
                score reads at a glance without tinting the whole panel. */}
            <header className="shrink-0 border-b border-slate-200">
                <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
                    <div key={identityKey} className="min-w-0 animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400 block">
                            {isBgy ? "Barangay" : "Municipality"}
                        </span>
                        <h3 className="text-[17px] font-bold text-slate-900 tracking-tight leading-tight mt-0.5 truncate">
                            {isBgy ? bgyName : "Rosario"}
                        </h3>
                        <span className="text-[11px] text-slate-500">
                            {isBgy ? "Batangas · CLUP 2030" : `Batangas · ${aggregates.count} barangays`}
                        </span>
                    </div>

                    {isBgy && onClearBgy && (
                        <button
                            type="button"
                            onClick={onClearBgy}
                            className="shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Back to the municipal view"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                <div className="flex items-stretch border-t border-slate-200">
                    <div
                        className="w-[84px] shrink-0 flex flex-col items-center justify-center py-2.5 transition-colors duration-500"
                        style={{ backgroundColor: headline.color, color: headline.onFill }}
                    >
                        <span className="text-xl font-bold font-mono tabular-nums leading-none">
                            {headlineDisplay}
                        </span>
                        <span className="text-[8.5px] font-bold uppercase tracking-[0.08em] opacity-80 mt-1">
                            {activeLens.shortLabel}
                        </span>
                    </div>

                    <div key={contentKey} className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center animate-in fade-in slide-in-from-bottom-1 duration-200">
                        <span className="text-[12px] font-bold text-slate-900 block leading-tight">
                            {headline.band.classification}
                        </span>
                        <span className="text-[10.5px] text-slate-500 leading-snug line-clamp-2 mt-0.5">
                            {headline.band.summary}
                        </span>
                        {isBgy && rankInfo && lens === "mix" && (
                            <span className="text-[10px] font-mono tabular-nums text-slate-500 mt-1">
                                Rank #{rankInfo.rank} of {rankInfo.total} · top {rankInfo.percentile}%
                            </span>
                        )}
                    </div>
                </div>
            </header>



            {activeBand && (
                <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 bg-slate-50">
                    <div className="flex items-center gap-2 min-w-0">
                        <span
                            className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                            style={{ backgroundColor: activeBand.fill, outline: `1px solid ${activeBand.stroke}` }}
                        />
                        <span className="text-[11px] font-semibold text-slate-700 truncate">
                            Map filtered to {activeBand.shortLabel}
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => onSelectBand("all")}
                        className="text-[10.5px] font-bold text-slate-500 hover:text-slate-900 shrink-0 transition-colors cursor-pointer"
                    >
                        Clear
                    </button>
                </div>
            )}

            {/* Scrolling body */}
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
                {/* Was keyed on `lens` alone, so switching barangays under the
                    same lens never replayed this fade — the whole tab body
                    just snapped to the new barangay's numbers. Keying on
                    `contentKey` (selection + lens) replays it on either. */}
                <div key={contentKey} className="animate-in fade-in duration-200">
                    <div className="px-4 pt-3 pb-1">
                        <p className="text-[11px] text-slate-500 leading-relaxed">{activeLens.caption}</p>
                    </div>

                    {lens === "mix" && (
                        <OverviewTab
                            isBgy={isBgy}
                            distribution={distribution}
                            score={isBgy ? liveScore : municipalMean}
                            municipalMean={municipalMean}
                            totalAreaHa={totalAreaHa}
                            replayKey={identityKey}
                            scoreTheme={headline.band}
                        />
                    )}

                    {lens === "drift" && (
                        <DriftTab
                            isBgy={isBgy}
                            liveScore={liveScore}
                            clupTarget={bgyStat.clupTargetDiversity}
                            variance={bgyStat.variance}
                            varianceStatus={bgyStat.varianceStatus}
                            varianceColor={bgyStat.varianceColor}
                            cluster={bgyStat.cluster}
                            municipalDrift={driftCounts}
                            baselineDistribution={bgyStat.baselineDistribution || []}
                            liveDistribution={distribution}
                        />
                    )}
                </div>

                <BarangayExplorer
                    lens={lens}
                    bandFilter={bandFilter}
                    bgyStats={bgyStats}
                    selectedName={bgyName}
                    onSelectBgy={onSelectBgy}
                    hoveredBgy={hoveredBgy}
                    onHoverBgy={onHoverBgy}
                />
            </div>
        </div>
    );
}
