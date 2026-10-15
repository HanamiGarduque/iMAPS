import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { getTrendsDemandColor } from '@/Components/Maps/LeafletMap';

// The service reports validation_wmape as a percentage (e.g. 42.3).
const formatWmape = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(1) + '%';
};

// Share of a barangay's CLUP 2030 area zoned agricultural or protected at
// which rising demand there is worth a zoning check. Most of Rosario is
// agricultural (35 of 48 barangays are 60%+), so only near-total shares
// single a barangay out.
const AGRI_FLAG_PCT = 90;

const formatR2 = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(2);
};

function MetricCard({ label, value, tooltip, align = 'center', hasBorder = true }) {
    const [open, setOpen] = useState(false);

    return (
        <div
            className={`relative px-2 py-2 group hover:bg-slate-50/80 transition-colors cursor-pointer select-none ${
                hasBorder ? 'border-l border-slate-200' : ''
            }`}
            onClick={() => setOpen((prev) => !prev)}
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            tabIndex={0}
            role="button"
            aria-expanded={open}
            title={tooltip ? `${tooltip.title}: ${tooltip.explanation}` : undefined}
        >
            <span className="block text-[15px] sm:text-[16px] font-semibold tabular-nums leading-none text-slate-900 truncate">
                {value}
            </span>
            <div className="flex items-center gap-0.5 mt-1 text-slate-500">
                <span className="block text-[9px] sm:text-[9.5px] font-medium uppercase tracking-[0.03em] truncate">
                    {label}
                </span>
                <svg
                    className="w-2.5 h-2.5 text-slate-400 group-hover:text-[#0b2a5b] transition-colors shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
            </div>

            {open && tooltip && (
                <div
                    className={`absolute z-[999] top-full mt-1.5 w-64 p-2.5 bg-slate-900/95 text-white rounded-md shadow-xl backdrop-blur-xs text-left pointer-events-none transition-all duration-150 ${
                        align === 'left' ? 'left-0' : align === 'right' ? 'right-0' : 'left-1/2 -translate-x-1/2'
                    }`}
                    role="tooltip"
                >
                    <div className="flex items-center justify-between gap-1.5 pb-1 mb-1.5 border-b border-slate-700/60">
                        <div className="min-w-0">
                            <span className="block text-[11px] font-bold text-white leading-tight truncate">{tooltip.title}</span>
                            {tooltip.subtitle && (
                                <span className="block text-[9px] text-slate-400 leading-tight truncate">{tooltip.subtitle}</span>
                            )}
                        </div>
                        {tooltip.badge && (
                            <span className="text-[8px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 shrink-0">
                                {tooltip.badge}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-200">
                        {tooltip.explanation}
                    </p>
                    {tooltip.takeaway && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[9.5px] text-slate-300/90 leading-normal">
                            <span className="font-semibold text-amber-300/90">In plain terms: </span>
                            {tooltip.takeaway}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export default function TrendsPanel({
    urbanGrowthData = null,
    activeQuarter = null,
    forecastMetrics = null,
    forecastData = null,
    forecastOutdated = null,
    selectedBgy = null,
    onSelectBgy,
    onHoverBgy = () => {},
    onForecastGenerated = null,
    activePins = [],
    series = [],
    activeIndex = 0,
    onSelectQuarter = () => {},
}) {
    const isBgy = Boolean(selectedBgy?.name);
    const bgyName = selectedBgy?.name || '';
    const isForecast = Boolean(activeQuarter?.isForecast);

    // Model intake state
    const [isExecuting, setIsExecuting] = useState(false);
    const [intakeError, setIntakeError] = useState(null);

    // Run the forecast once if there is no run to show yet.
    useEffect(() => {
        if (!forecastData) handleExecuteForecast(true);
    }, []);

    // Ranking for the active quarter: the model's predicted count per barangay
    // on a forecast quarter, filings on a recorded one.
    const ranking = useMemo(() => {
        if (isForecast) {
            return (forecastData?.demand || [])
                .filter((d) => Number(d.year) === Number(activeQuarter?.year) && Number(d.quarter) === Number(activeQuarter?.quarter))
                .map((d) => ({ name: d.barangay, count: Math.round(Number(d.predicted) || 0) }))
                .sort((a, b) => b.count - a.count);
        }

        const counts = {};
        (activePins || []).forEach((pin) => {
            const name = (pin.barangay || '').trim();
            if (name) counts[name] = (counts[name] || 0) + 1;
        });
        return Object.entries(counts)
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    }, [activePins, isForecast, forecastData, activeQuarter]);

    const rankingMax = Math.max(1, ...ranking.map((r) => r.count));
    const quarterTotal = ranking.reduce((sum, r) => sum + r.count, 0);

    // Change against the quarter before, when that quarter is known.
    const previous = activeIndex > 0 ? series[activeIndex - 1] : null;
    const deltaFor = (name) => {
        if (!previous || previous.total === null) return null;
        const key = name.trim().toLowerCase();
        return (series[activeIndex]?.byBgy?.[key] || 0) - (previous.byBgy?.[key] || 0);
    };

    // The selected barangay tracked across every quarter on the timeline.
    const bgyTrend = useMemo(() => {
        if (!isBgy) return [];
        const key = bgyName.trim().toLowerCase();
        return series.map((q) => ({ ...q, value: q.total === null ? null : q.byBgy?.[key] || 0 }));
    }, [series, isBgy, bgyName]);
    const bgyTrendMax = Math.max(1, ...bgyTrend.map((q) => q.value || 0));

    // Historical LC records for the selected barangay
    const bgyRecords = useMemo(() => {
        if (!isBgy) return [];
        const target = bgyName.trim().toLowerCase();
        const records = [];
        Object.values(urbanGrowthData?.historicalPins || {}).forEach((pins) => {
            (pins || []).forEach((pin) => {
                if ((pin.barangay || '').trim().toLowerCase() === target) records.push(pin);
            });
        });
        return records.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    }, [urbanGrowthData, isBgy, bgyName]);

    // Whatever the model measured on its own holdout quarters, or nothing.
    const { mae = null, wmape = null, r2 = null } = forecastMetrics || {};

    // The guess a planner would make without the model: each barangay's
    // average over the last four recorded quarters before the forecast.
    const baseline = useMemo(() => {
        const firstForecast = series.findIndex((q) => q.isForecast);
        const recorded = series.slice(0, firstForecast === -1 ? series.length : firstForecast).slice(-4);
        if (recorded.length === 0) return null;
        const byBgy = {};
        recorded.forEach((q) => {
            Object.entries(q.byBgy || {}).forEach(([k, n]) => {
                byBgy[k] = (byBgy[k] || 0) + n / recorded.length;
            });
        });
        return {
            byBgy,
            total: recorded.reduce((sum, q) => sum + (q.total || 0), 0) / recorded.length,
            span: recorded.length > 1 ? `${recorded[0].label}–${recorded[recorded.length - 1].label}` : recorded[0].label,
        };
    }, [series]);

    // Barangays the model expects to rise above their usual level. A rise
    // smaller than the model's own typical miss (MAE) could be noise, so it
    // does not count.
    const riseMargin = Math.max(1, mae ?? 1);
    const watchlist = useMemo(() => {
        if (!isForecast || !baseline) return [];
        return ranking
            .map((r) => {
                const avg = baseline.byBgy[r.name.trim().toLowerCase()] || 0;
                return { ...r, avg, rise: r.count - avg };
            })
            .filter((r) => r.rise >= riseMargin)
            .sort((a, b) => b.rise - a.rise);
    }, [isForecast, baseline, ranking, riseMargin]);

    // Rising barangays whose land CLUP 2030 keeps almost all agricultural (the
    // controller groups forest, water and protection zones under it too).
    // The model predicts how many filings, not what kind, so this only says
    // where new applications deserve a closer zoning check.
    const zoningFlags = useMemo(() => {
        const byName = {};
        Object.entries(urbanGrowthData?.byBarangay || {}).forEach(([name, b]) => {
            byName[name.trim().toLowerCase()] = b;
        });
        return watchlist
            .map((r) => {
                const row = (byName[r.name.trim().toLowerCase()]?.breakdown || []).find(([cat]) => cat === 'Agricultural');
                return { name: r.name, pct: row ? Number(row[2]) : null };
            })
            .filter((r) => r.pct !== null && r.pct >= AGRI_FLAG_PCT);
    }, [watchlist, urbanGrowthData]);

    const topShare = quarterTotal > 0
        ? ranking.slice(0, 5).reduce((sum, r) => sum + r.count, 0) / quarterTotal
        : null;
    const totalChange = baseline?.total > 0 ? (quarterTotal - baseline.total) / baseline.total : null;

    const handleExecuteForecast = async (isAutoRun = false) => {
        setIsExecuting(true);
        setIntakeError(null);
        try {
            const response = await axios.post('/api/forecast/generate');

            if (response.data?.status === 'success') {
                onForecastGenerated?.(response.data.data);
            } else if (!isAutoRun) {
                setIntakeError(response.data?.message || 'Failed to run the forecast.');
            }
        } catch (err) {
            if (!isAutoRun) {
                console.error('Forecast intake error:', err);
                setIntakeError(err.response?.data?.message || 'Error running the forecast model.');
            }
        } finally {
            setIsExecuting(false);
        }
    };

    const metricsConfig = [
        {
            label: isForecast ? 'Projected LC' : 'LC filed',
            value: quarterTotal,
            align: 'left',
            tooltip: {
                title: isForecast ? 'Expected Applications' : 'Actual Clearances Filed',
                subtitle: isForecast ? 'Town-wide Quarterly Total' : 'Recorded Historical Total',
                badge: isForecast ? 'Town volume' : 'Recorded volume',
                explanation: isForecast
                    ? 'How many locational clearances we expect people to apply for this quarter across the entire municipality.'
                    : 'The actual number of clearance applications officially filed and recorded with the zoning office during this past quarter.',
                takeaway: isForecast
                    ? 'Tells you how busy the zoning office will be so you can assign site inspectors and prepare fee collection ahead of time.'
                    : 'Compare against other quarters to see whether building activity in town is growing or slowing down.',
            },
        },
        {
            label: 'MAE',
            value: mae != null ? Number(mae).toFixed(2) : '—',
            align: 'center',
            tooltip: {
                title: 'Average Miss per Barangay',
                subtitle: 'Mean Absolute Error (MAE)',
                badge: 'Smaller is better',
                explanation: mae != null
                    ? `On average, the prediction is off by about ±${Number(mae).toFixed(1)} clearances per barangay (usually just 1 application up or down).`
                    : 'Shows how many clearance applications the prediction typically misses by in each individual barangay.',
                takeaway: 'Smaller is better. Use this as a ±1 clearance safety buffer when planning barangay inspection schedules.',
            },
        },
        {
            label: 'WMAPE',
            value: wmape != null ? formatWmape(wmape) : '—',
            align: 'center',
            tooltip: {
                title: 'Town-wide Error Rate',
                subtitle: 'Weighted Error Rate (WMAPE)',
                badge: 'Lower is better',
                explanation: 'The overall percentage margin of error for the entire municipality. It shows how close the town-wide total forecast was to reality.',
                takeaway: 'Lower is better. Any score below 40% means the town-wide forecast is dependable enough for municipal budgeting and annual planning.',
            },
        },
        {
            label: 'R-squared',
            value: r2 != null ? formatR2(r2) : '—',
            align: 'right',
            tooltip: {
                title: 'Forecast Trust Score',
                subtitle: 'R-squared (R²)',
                badge: 'Closer to 1.0 is better',
                explanation: r2 != null
                    ? `A score from 0 to 1 (or 0% to 100%) showing how closely future demand follows past records. A score of ${formatR2(r2)} means about ${Math.round(Number(r2) * 100)}% of the variation in filings is explained by historical trends.`
                    : 'Shows how trustworthy this forecast is based on historical zoning patterns (scale of 0 to 1).',
                takeaway: 'Higher is better. A score above 0.70 means past growth in Rosario is consistent and predictable, so you can trust this forecast for official decision-making.',
            },
        },
    ];

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            <div className="shrink-0 grid grid-cols-4 border-b border-slate-200">
                {metricsConfig.map((k, i) => (
                    <MetricCard
                        key={k.label}
                        label={k.label}
                        value={k.value}
                        tooltip={k.tooltip}
                        align={k.align}
                        hasBorder={i > 0}
                    />
                ))}
            </div>

            {isBgy ? (
                <>
                    <div className="shrink-0 px-4 pt-2.5 pb-3 border-b border-slate-200">
                        <div className="flex items-baseline mb-1.5">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">LC per quarter · {bgyName}</h3>
                            <span className="text-[10.5px] text-slate-400">Click a bar to view it</span>
                        </div>
                        <div className="flex items-end gap-[2px] h-12">
                            {bgyTrend.map((q, i) => {
                                const known = q.value !== null;
                                const selected = i === activeIndex;
                                return (
                                    <button
                                        key={`${q.year}-${q.quarter}`}
                                        type="button"
                                        onClick={() => onSelectQuarter(i)}
                                        title={`${q.label}${q.isForecast ? ' (forecast)' : ''}: ${known ? `${q.value} LC` : 'not loaded'}`}
                                        aria-label={`${q.label}, ${known ? `${q.value} LC` : 'not loaded'}`}
                                        className="flex-1 h-full flex items-end cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                                    >
                                        <span
                                            className={`block w-full rounded-t-[2px] ${known ? '' : 'border border-dashed border-slate-300'}`}
                                            style={known
                                                ? { height: `${Math.max(q.value ? 10 : 3, (q.value / bgyTrendMax) * 100)}%`, background: selected ? '#0b2a5b' : q.isForecast ? '#fd8d3c' : '#9fb1c9' }
                                                : { height: '25%' }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">LC records · {bgyName}</h3>
                        <span className="text-[10.5px] text-slate-400 tabular-nums">{bgyRecords.length} on file</span>
                    </div>
                    <ul className="flex-1 min-h-0 overflow-y-auto border-t border-slate-200">
                        {bgyRecords.length === 0 && (
                            <li className="px-4 py-6 text-center text-[12px] text-slate-500">No locational clearance records for this barangay.</li>
                        )}
                        {bgyRecords.map((item, idx) => (
                            <li key={item.id || `${item.reference_number}-${idx}`} className="px-4 py-2 border-b border-slate-100">
                                <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-[12px] font-semibold text-slate-900 truncate">{item.applicant_name || 'Applicant'}</span>
                                    <span className="text-[10.5px] tabular-nums text-slate-500 shrink-0">
                                        {item.created_at ? new Date(item.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                                    </span>
                                </div>
                                <div className="text-[10.5px] text-slate-500 truncate">
                                    <span className="font-mono">{item.reference_number || '—'}</span>
                                    {' · '}{item.target_land_use_class || item.zoning_code || 'Locational clearance'}
                                    {item.lot_area_sqm ? ` · ${item.lot_area_sqm} sqm` : ''}
                                </div>
                            </li>
                        ))}
                    </ul>
                </>
            ) : (
                <>
                    {isForecast && ranking.length > 0 && (
                        <section className="shrink-0 px-4 pt-2.5 pb-3 border-b border-slate-200 bg-[#fff7ef]" aria-label="Forecast watchlist">
                            <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#a8521a] mb-1">
                                What to prepare for · {activeQuarter?.label}
                            </h3>
                            <p className="text-[12px] text-slate-800 leading-snug">
                                <span className="font-semibold tabular-nums">{quarterTotal} LC</span> expected town-wide
                                {baseline && (
                                    <>
                                        {', against '}
                                        <span className="tabular-nums">{Math.round(baseline.total)}</span>
                                        {' a quarter over '}{baseline.span}
                                        {totalChange !== null && Math.abs(totalChange) >= 0.005 && (
                                            <span className={`font-semibold tabular-nums ${totalChange > 0 ? 'text-[#b32a17]' : 'text-[#1f5fa8]'}`}>
                                                {' '}({totalChange > 0 ? '+' : '−'}{Math.abs(Math.round(totalChange * 100))}%)
                                            </span>
                                        )}
                                    </>
                                )}
                                .
                                {topShare !== null && ranking.length > 5 && (
                                    <> The top 5 barangays account for <span className="font-semibold tabular-nums">{Math.round(topShare * 100)}%</span> of it.</>
                                )}
                            </p>
                            {baseline && (
                                <>
                                    <p
                                        className="mt-2 text-[11px] text-slate-600"
                                        title={`Rising: the forecast is at least ${riseMargin.toFixed(1)} LC above the barangay's average for ${baseline.span}. Smaller rises are within the model's usual error.`}
                                    >
                                        {watchlist.length > 0
                                            ? `${watchlist.length} barangay${watchlist.length === 1 ? '' : 's'} expected above their usual level:`
                                            : `No barangay is expected to rise beyond the model's usual error (±${riseMargin.toFixed(1)} LC).`}
                                    </p>
                                    {watchlist.length > 0 && (
                                        <ul className="mt-1 flex flex-wrap gap-1">
                                            {watchlist.slice(0, 6).map((r) => (
                                                <li key={r.name}>
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectBgy?.(r.name)}
                                                        onMouseEnter={() => onHoverBgy(r.name)}
                                                        onMouseLeave={() => onHoverBgy(null)}
                                                        title={`${r.name}: ${r.count} LC expected, usually ${r.avg.toFixed(1)}`}
                                                        className="inline-flex items-baseline gap-1 h-6 px-2 rounded-[3px] border border-[#f3c9a5] bg-white text-[11px] text-slate-800 hover:border-[#a8521a] cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                                                    >
                                                        <span className="truncate max-w-[120px]">{r.name}</span>
                                                        <span className="font-semibold tabular-nums text-[#b32a17]">+{Math.round(r.rise)}</span>
                                                    </button>
                                                </li>
                                            ))}
                                            {watchlist.length > 6 && (
                                                <li className="h-6 px-1 inline-flex items-center text-[11px] text-slate-500">+{watchlist.length - 6} more below</li>
                                            )}
                                        </ul>
                                    )}
                                    {zoningFlags.length > 0 && (
                                        <p className="mt-2 text-[11px] text-slate-700 leading-snug">
                                            <span className="font-semibold text-[#a8521a]">Zoning check: </span>
                                            {zoningFlags.map((f, i) => (
                                                <span key={f.name}>
                                                    {i > 0 && ', '}
                                                    <button
                                                        type="button"
                                                        onClick={() => onSelectBgy?.(f.name)}
                                                        className="underline decoration-dotted underline-offset-2 hover:text-[#0b2a5b] cursor-pointer"
                                                    >
                                                        {f.name}
                                                    </button>
                                                    <span className="tabular-nums text-slate-500"> ({Math.round(f.pct)}%)</span>
                                                </span>
                                            ))}
                                            {zoningFlags.length === 1 ? ' is' : ' are'} rising but almost entirely agricultural or protected land in CLUP 2030.
                                            Review new applications there against the zoning.
                                        </p>
                                    )}
                                </>
                            )}
                        </section>
                    )}
                    <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">
                            {isForecast ? 'Projected demand by barangay' : 'Filings by barangay'}
                        </h3>
                        <span className="text-[10.5px] text-slate-400">
                            {isForecast ? 'Predicted clearances' : 'Click to open'}
                        </span>
                    </div>
                    <ol className="flex-1 min-h-0 overflow-y-auto border-t border-slate-200" onMouseLeave={() => onHoverBgy(null)}>
                        {isExecuting && ranking.length === 0 && [0, 1, 2, 3, 4, 5].map((n) => (
                            <li key={n} className="px-4 py-2 flex items-center gap-2 animate-pulse" aria-hidden="true">
                                <span className="w-3 h-2.5 rounded-sm bg-slate-200" />
                                <span className="flex-1">
                                    <span className="block h-2.5 rounded-sm bg-slate-200" style={{ width: `${70 - n * 8}%` }} />
                                    <span className="block h-1 mt-1.5 rounded-sm bg-slate-100" style={{ width: `${60 - n * 8}%` }} />
                                </span>
                                <span className="w-5 h-2.5 rounded-sm bg-slate-200" />
                            </li>
                        ))}
                        {!isExecuting && ranking.length === 0 && (
                            <li className="px-4 py-6 text-center text-[12px] text-slate-500">
                                {!isForecast
                                    ? 'No locational clearances were filed this quarter.'
                                    : forecastOutdated
                                        ? `The last forecast run covers ${forecastOutdated}, which is already recorded. Run the model again below.`
                                        : 'No forecast output for this quarter yet. Run the model below.'}
                            </li>
                        )}
                        {ranking.map((r, i) => {
                            const cls = getTrendsDemandColor(r.count);
                            const delta = deltaFor(r.name);
                            return (
                                <li key={r.name}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectBgy?.(r.name)}
                                        onMouseEnter={() => onHoverBgy(r.name)}
                                        onFocus={() => onHoverBgy(r.name)}
                                        className="w-full grid grid-cols-[20px_1fr_28px_auto] items-center gap-2 px-4 py-1.5 text-left hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]"
                                    >
                                        <span className="text-[10.5px] tabular-nums text-slate-400">{i + 1}</span>
                                        <span className="min-w-0">
                                            <span className="block text-[12px] text-slate-800 truncate">{r.name}</span>
                                            <span className="block h-1 mt-1 rounded-sm bg-slate-100">
                                                <span className="block h-full rounded-sm" style={{ width: `${(r.count / rankingMax) * 100}%`, backgroundColor: cls.color, boxShadow: `inset 0 0 0 1px ${cls.stroke}` }} />
                                            </span>
                                        </span>
                                        <span
                                            className={`text-[10.5px] tabular-nums text-right ${delta > 0 ? 'text-[#b32a17]' : 'text-slate-400'}`}
                                            title={previous ? `vs ${previous.label}` : undefined}
                                        >
                                            {delta === null || delta === 0 ? '' : `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`}
                                        </span>
                                        <span className="text-[12px] font-semibold tabular-nums text-slate-900 whitespace-nowrap text-right">
                                            {r.count}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}

            <details className="group shrink-0 border-t border-slate-200">
                <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none hover:bg-slate-50 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">
                    Model data
                    <svg className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </summary>
                <div className="px-4 pb-3.5 space-y-2">
                    <p className="text-[11px] text-slate-500">
                        The forecast is trained on the locational clearances recorded in iMAPS. It runs on those
                        records only — there is no dataset to swap in.
                    </p>
                    <button
                        type="button"
                        onClick={() => handleExecuteForecast(false)}
                        disabled={isExecuting}
                        className="w-full h-7 rounded-[3px] text-[11.5px] font-semibold bg-[#0b2a5b] hover:bg-[#0e3574] text-white disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                    >
                        {isExecuting ? 'Running model…' : 'Run forecast model'}
                    </button>
                    {intakeError && (
                        <p role="alert" className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-[3px] px-2 py-1.5">{intakeError}</p>
                    )}
                    {forecastData?.summary && (
                        <dl className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                            {Object.entries(forecastData.summary).map(([k, v]) => {
                                const label = k.replace(/_total$/, '').replace('_', ' ').toUpperCase();
                                return (
                                    <div key={k}>
                                        <dt className="text-slate-500">{label}</dt>
                                        <dd className="font-semibold tabular-nums text-slate-900">{v ?? '—'}</dd>
                                    </div>
                                );
                            })}
                        </dl>
                    )}
                </div>
            </details>
        </div>
    );
}
