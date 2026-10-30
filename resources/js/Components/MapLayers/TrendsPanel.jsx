import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { getTrendsDemandColor } from '@/Components/Maps/LeafletMap';
import BarangayLcDetail from '@/Components/MapLayers/BarangayLcDetail';
import useBarangayNames from '@/utils/useBarangayNames';
import { concentration } from '@/utils/lcInsights';

// The service reports validation_wmape as a percentage (e.g. 42.3).
const formatWmape = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(1) + '%';
};

const formatR2 = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return n.toFixed(2);
};

const SHOW_FORECAST_ACCURACY = false;

function MetricCard({ label, value, tooltip, align = 'center', hasBorder = true }) {
    const [open, setOpen] = useState(false);

    return (
        <div
            className={`relative px-3 py-2.5 group hover:bg-slate-50/80 transition-colors cursor-pointer select-none ${
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
            <span className="block text-[15px] sm:text-[15px] font-semibold tabular-nums leading-none text-slate-900 truncate">
                {value}
            </span>
            <div className="flex items-center gap-0.5 mt-1 text-slate-500">
                <span className="block text-[10px] font-medium uppercase tracking-[0.04em] truncate">
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
                                <span className="block text-[10px] text-slate-400 leading-tight truncate">{tooltip.subtitle}</span>
                            )}
                        </div>
                        {tooltip.badge && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-400/30 shrink-0">
                                {tooltip.badge}
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] leading-relaxed text-slate-200">
                        {tooltip.explanation}
                    </p>
                    {tooltip.takeaway && (
                        <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[10px] text-slate-300/90 leading-normal">
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
    lcSummary = null,
    onOpenRecords = null,
    recordsOpen = false,
    onSelectBgy,
    onHoverBgy = () => {},
    onForecastGenerated = null,
    activePins = [],
    series = [],
    activeIndex = 0,
    onSelectQuarter = () => {},
    header = null,
    footer = null,
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

    // Projected demand is paged five barangays at a time, recorded filings seven.
    const PAGE_SIZE = isForecast ? 5 : 7;
    const [page, setPage] = useState(0);
    useEffect(() => setPage(0), [activeQuarter?.year, activeQuarter?.quarter, isForecast]);
    const pageCount = Math.max(1, Math.ceil(ranking.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount - 1);
    const pageStart = safePage * PAGE_SIZE;
    const visibleRanking = ranking.slice(pageStart, pageStart + PAGE_SIZE);

    const barangayNames = useBarangayNames();
    // Whether the quarter's demand sits in a few barangays or is spread out.
    const spread = useMemo(
        () => (barangayNames.length ? concentration([...ranking.map((r) => r.count), ...Array(Math.max(0, barangayNames.length - ranking.length)).fill(0)]) : null),
        [ranking, barangayNames]
    );
    const rankingMax = Math.max(1, ...ranking.map((r) => r.count));
    const quarterTotal = ranking.reduce((sum, r) => sum + r.count, 0);

    // Change per barangay. LC filings are strongly seasonal (Q1 is always the
    // peak, Q3 the trough), so it is against the same quarter a year earlier,
    // not the quarter just before.
    const current = series[activeIndex];
    const previous = current
        ? series.find((q) => !q.isForecast && q.year === current.year - 1 && q.quarter === current.quarter) || null
        : null;
    const deltaFor = (name) => {
        if (!previous || previous.total === null) return null;
        const key = name.trim().toLowerCase();
        return (series[activeIndex]?.byBgy?.[key] || 0) - (previous.byBgy?.[key] || 0);
    };

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
            label: isForecast ? 'Projected' : 'Filed',
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
            label: 'R²',
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

    // On a recorded quarter a barangay's own detail leads and the town-wide forecast
    // cards follow. On a forecast quarter the panel keeps its forecast layout:
    // accuracy, the town summary, then this barangay's quarter chart.
    const after = (n) => (isBgy && !isForecast ? { order: n } : undefined);

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Accuracy metrics are kept in code but hidden from users; flip to true to restore. */}
            {SHOW_FORECAST_ACCURACY && isForecast && (
            <section className="border-b border-slate-200" style={after(2)} aria-label="Forecast accuracy">
                <h3 className="px-4 pt-3.5 pb-2 text-[12px] font-semibold leading-snug text-slate-800">Forecast accuracy</h3>
                <div className="grid grid-cols-4 border-t border-slate-200">
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
            </section>
            )}

            {header && <div style={after(3)}>{header}</div>}

            {isBgy ? (
                <div className="shrink-0 flex flex-col" style={after(1)}>
                <BarangayLcDetail
                    bgyName={bgyName}
                    series={series}
                    activeIndex={activeIndex}
                    onSelectQuarter={onSelectQuarter}
                    summary={lcSummary}
                    activeQuarter={activeQuarter}
                    onOpenRecords={onOpenRecords}
                    recordsOpen={recordsOpen}
                />
                </div>
            ) : (
                <section className="border-b border-slate-200" aria-label="Demand by barangay">
                    <div className="shrink-0 flex items-baseline px-4 pt-3.5 pb-2">
                        {isForecast ? (
                            <h3 className="text-[12px] font-semibold text-slate-800 mr-auto">Where will they come from?</h3>
                        ) : (
                            <h3 className="text-[12px] font-semibold leading-snug text-slate-800 mr-auto">Applications by barangay</h3>
                        )}
                        <span className="text-[10.5px] text-slate-400">
                            {previous ? `Compared with ${previous.label}` : isForecast ? 'Expected applications' : 'Click to open'}
                        </span>
                    </div>
                    {spread && (
                        <p className="px-4 pb-2 text-[11px] leading-snug text-slate-500">
                            Half of the quarter's {spread.total} applications {isForecast ? 'expected' : 'filed'} come from <b className="text-slate-700">{spread.k} of {spread.of}</b> barangays.
                        </p>
                    )}
                    <ol>
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
                        {visibleRanking.map((r, idx) => {
                            const i = pageStart + idx;
                            const cls = getTrendsDemandColor(r.count);
                            const delta = deltaFor(r.name);
                            return (
                                <li key={r.name}>
                                    <button
                                        type="button"
                                        onClick={() => onSelectBgy?.(r.name)}
                                        className="w-full grid grid-cols-[20px_1fr_28px_auto] items-center gap-2 px-4 py-2 text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]"
                                    >
                                        <span className="text-[10.5px] tabular-nums text-slate-400">{i + 1}</span>
                                        <span className="min-w-0">
                                            <span className="block text-[12px] text-slate-800 truncate">{r.name}</span>
                                            <span className="block h-1 mt-1 rounded-sm bg-slate-100">
                                                <span className="block h-full rounded-sm" style={{ width: `${(r.count / rankingMax) * 100}%`, backgroundColor: cls.color, boxShadow: `inset 0 0 0 1px ${cls.stroke}` }} />
                                            </span>
                                        </span>
                                        <span
                                            className={`text-[10.5px] tabular-nums text-right ${delta > 0 ? 'text-[#b32a17]' : 'text-[#1f5fa8]'}`}
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
                    {ranking.length > PAGE_SIZE && (
                        <div className="shrink-0 flex items-center justify-between px-4 py-1.5 border-t border-slate-200 bg-slate-50/70">
                            <button
                                type="button"
                                onClick={() => setPage(safePage - 1)}
                                disabled={safePage === 0}
                                aria-label={`Previous ${PAGE_SIZE} barangays`}
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
                                aria-label={`Next ${PAGE_SIZE} barangays`}
                                className="w-7 h-7 flex items-center justify-center rounded-[3px] border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b]"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                            </button>
                        </div>
                    )}
                </section>
            )}

            {footer && <div style={after(4)}>{footer}</div>}

            {isForecast && (
            <details className="group shrink-0 border-b border-slate-200" style={after(5)}>
                <summary className="flex items-center justify-between px-4 py-2.5 cursor-pointer list-none hover:bg-slate-50 text-[12px] font-semibold text-slate-800">
                    How is this estimated?
                    <svg className="w-3.5 h-3.5 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </summary>
                <div className="px-4 pb-3.5 space-y-2">
                    <p className="text-[11px] text-slate-500">
                        It's an estimate, worked out from the locational clearance applications already recorded in
                        iMAPS. No other data goes into it.
                    </p>
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
            )}
        </div>
    );
}
