import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import BarangayLcDetail from '@/Components/MapLayers/BarangayLcDetail';

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

    const quarterTotal = ranking.reduce((sum, r) => sum + r.count, 0);

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
                ranking.length === 0 && (
                <section className="border-b border-slate-200" aria-label="Demand by barangay">
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
                    </ol>
                </section>
                )
            )}

            {footer && <div style={after(4)}>{footer}</div>}

            {isForecast && intakeError && (
                <p role="alert" className="shrink-0 mx-4 my-2 text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-[3px] px-2 py-1.5">{intakeError}</p>
            )}
        </div>
    );
}
