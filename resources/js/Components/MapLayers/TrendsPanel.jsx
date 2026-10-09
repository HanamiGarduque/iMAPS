import { useMemo, useState, useEffect } from 'react';
import axios from 'axios';
import { getTrendsDemandColor } from '@/Components/Dashboard/LeafletMap';

const formatWmape = (val) => {
    const n = Number(val);
    if (!Number.isFinite(n)) return '—';
    return (n > 1 ? n.toFixed(1) : (n * 100).toFixed(1)) + '%';
};

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
    selectedBgy = null,
    onSelectBgy,
    onHoverBgy = () => {},
    onForecastGenerated = null,
    activePins = [],
    series = [],
    loading = false,
    activeIndex = 0,
    onSelectQuarter = () => {},
}) {
    const isBgy = Boolean(selectedBgy?.name);
    const bgyName = selectedBgy?.name || '';
    const isForecast = Boolean(activeQuarter?.isForecast);

    // Model intake state
    const [selectedFile, setSelectedFile] = useState(null);
    const [isExecuting, setIsExecuting] = useState(false);
    const [intakeResult, setIntakeResult] = useState(() => {
        try {
            const saved = localStorage.getItem('imaps_forecast_data');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    });
    const [intakeError, setIntakeError] = useState(null);

    const effectiveForecast = forecastData || intakeResult;

    // Run the default forecast once if nothing is cached yet.
    useEffect(() => {
        if (!intakeResult) handleExecuteForecast(true);
    }, []);

    // Forecast details lookup for the active forecast quarter
    const forecastByBgy = useMemo(() => {
        if (!isForecast) return {};
        const list = effectiveForecast?.forecasts;
        if (!Array.isArray(list)) return {};
        const map = {};
        const expectedLabel = activeQuarter ? `${activeQuarter.year} Q${activeQuarter.quarter}` : null;
        list.forEach((fc) => {
            if (expectedLabel && fc.Quarter_Label && fc.Quarter_Label !== expectedLabel) return;
            const b = (fc.Barangay || '').trim().toLowerCase();
            if (b) map[b] = fc;
        });
        return map;
    }, [isForecast, effectiveForecast, activeQuarter]);

    // Ranking for the active quarter.
    // In forecast mode: reflects predicted ranges (Lower_80 – Upper_80) from microservice.
    // In historical mode: counts filings from the active pins.
    const ranking = useMemo(() => {
        if (isForecast && Object.keys(forecastByBgy).length > 0) {
            return Object.values(forecastByBgy).map((fc) => {
                const count = Number(fc.Predicted_Quarterly_Clearances ?? fc.Expected ?? 0);
                const lower = fc.Lower_80 != null ? Number(fc.Lower_80) : null;
                const upper = fc.Upper_80 != null ? Number(fc.Upper_80) : null;
                const range = (lower != null && upper != null) ? `${lower} – ${upper}` : null;
                return {
                    name: fc.Barangay,
                    count: Math.round(count),
                    expected: fc.Expected != null ? Number(fc.Expected) : count,
                    lower,
                    upper,
                    range,
                    confidence: fc.Confidence || null,
                };
            }).sort((a, b) => b.count - a.count || (b.upper ?? 0) - (a.upper ?? 0));
        }

        const counts = {};
        const meta = {};
        (activePins || []).forEach((pin) => {
            const name = (pin.barangay || '').trim();
            if (name) {
                counts[name] = (counts[name] || 0) + 1;
                if (!meta[name] && (pin.lower_80 != null || pin.upper_80 != null)) {
                    meta[name] = {
                        lower: pin.lower_80,
                        upper: pin.upper_80,
                        expected: pin.expected,
                        confidence: pin.confidence,
                    };
                }
            }
        });
        return Object.entries(counts)
            .map(([name, count]) => {
                const m = meta[name];
                const lower = m?.lower != null ? Number(m.lower) : null;
                const upper = m?.upper != null ? Number(m.upper) : null;
                const range = (lower != null && upper != null) ? `${lower} – ${upper}` : null;
                return {
                    name,
                    count,
                    lower,
                    upper,
                    range,
                    expected: m?.expected,
                    confidence: m?.confidence,
                };
            })
            .sort((a, b) => b.count - a.count);
    }, [activePins, isForecast, forecastByBgy]);

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
        return series.map((q) => {
            const val = q.total === null ? null : q.byBgy?.[key] || 0;
            let range = null;
            if (q.isForecast) {
                const rawForecasts = effectiveForecast?.forecasts;
                if (Array.isArray(rawForecasts)) {
                    const match = rawForecasts.find(
                        (f) =>
                            (f.Quarter_Label === q.label || (f.Date && f.Date.startsWith(String(q.year)))) &&
                            (f.Barangay || '').trim().toLowerCase() === key
                    );
                    if (match && match.Lower_80 != null && match.Upper_80 != null) {
                        range = `${match.Lower_80} – ${match.Upper_80}`;
                    }
                }
            }
            return { ...q, value: val, range };
        });
    }, [series, isBgy, bgyName, effectiveForecast]);
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

    const mae = forecastMetrics?.mae ?? effectiveForecast?.metrics?.validation_mae;
    const wmape = forecastMetrics?.wmape ?? effectiveForecast?.metrics?.validation_wmape;
    const r2 = forecastMetrics?.r2 ?? effectiveForecast?.metrics?.validation_r2;

    const handleExecuteForecast = async (isAutoRun = false) => {
        setIsExecuting(true);
        setIntakeError(null);
        try {
            const formData = new FormData();
            if (selectedFile) formData.append('file', selectedFile);

            const response = await axios.post('/api/forecast/generate', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });

            if (response.data?.status === 'success') {
                const resData = response.data.data;
                setIntakeResult(resData);
                try {
                    localStorage.setItem('imaps_forecast_data', JSON.stringify(resData));
                } catch (e) {}
                onForecastGenerated?.(resData);
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
                    ? `A score from 0 to 1 (or 0% to 100%) showing how closely future demand follows past records. A score of ${formatR2(r2)} means 79% of future filings follow clear historical trends.`
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
                                        title={`${q.label}${q.isForecast ? ' (forecast)' : ''}: ${
                                            q.range
                                                ? `${q.range} LC projected (expected ${q.value})`
                                                : (known ? `${q.value} LC` : 'not loaded')
                                        }`}
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
                    <div className="shrink-0 flex items-baseline px-4 pt-2.5 pb-2">
                        <h3 className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 mr-auto">
                            {isForecast ? 'Projected demand by barangay' : 'Filings by barangay'}
                        </h3>
                        <span className="text-[10.5px] text-slate-400">
                            {isForecast ? 'Range (80% confidence)' : 'Click to open'}
                        </span>
                    </div>
                    <ol className="flex-1 min-h-0 overflow-y-auto border-t border-slate-200" onMouseLeave={() => onHoverBgy(null)}>
                        {loading && ranking.length === 0 && [0, 1, 2, 3, 4, 5].map((n) => (
                            <li key={n} className="px-4 py-2 flex items-center gap-2 animate-pulse" aria-hidden="true">
                                <span className="w-3 h-2.5 rounded-sm bg-slate-200" />
                                <span className="flex-1">
                                    <span className="block h-2.5 rounded-sm bg-slate-200" style={{ width: `${70 - n * 8}%` }} />
                                    <span className="block h-1 mt-1.5 rounded-sm bg-slate-100" style={{ width: `${60 - n * 8}%` }} />
                                </span>
                                <span className="w-5 h-2.5 rounded-sm bg-slate-200" />
                            </li>
                        ))}
                        {!loading && ranking.length === 0 && (
                            <li className="px-4 py-6 text-center text-[12px] text-slate-500">
                                {isForecast ? 'No forecast output for this quarter yet. Run the model below.' : 'No locational clearances were filed this quarter.'}
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
                                        <span
                                            className="text-[12px] font-semibold tabular-nums text-slate-900 whitespace-nowrap text-right"
                                            title={
                                                isForecast && r.range
                                                    ? `Estimated range: ${r.range} clearances (Most likely: ${r.expected ?? r.count}${r.confidence ? ` · Confidence: ${r.confidence}` : ''})`
                                                    : undefined
                                            }
                                        >
                                            {isForecast && r.range ? r.range : r.count}
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
                        The forecast is trained on historical zoning applications. Upload a CSV to retrain it on a different dataset.
                    </p>
                    <div className="flex items-center gap-1.5">
                        <label
                            htmlFor="historical-csv-file"
                            className="flex-1 min-w-0 h-7 px-2 flex items-center text-[11.5px] bg-white border border-slate-300 rounded-[3px] cursor-pointer hover:bg-slate-50 truncate focus-within:ring-1 focus-within:ring-[#0b2a5b]"
                        >
                            <input
                                id="historical-csv-file"
                                type="file"
                                accept=".csv"
                                onChange={(e) => {
                                    if (e.target.files?.[0]) {
                                        setSelectedFile(e.target.files[0]);
                                        setIntakeError(null);
                                    }
                                }}
                                className="sr-only"
                            />
                            <span className="truncate">{selectedFile ? selectedFile.name : 'Default dataset (2021–2026)'}</span>
                        </label>
                        {selectedFile && (
                            <button
                                type="button"
                                onClick={() => setSelectedFile(null)}
                                className="h-7 px-2 text-[11px] text-slate-600 border border-slate-300 rounded-[3px] hover:bg-slate-50 cursor-pointer"
                            >
                                Reset
                            </button>
                        )}
                    </div>
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
                    {intakeResult?.summary && (
                        <dl className="grid grid-cols-3 gap-2 text-[11px] pt-1">
                            {Object.entries(intakeResult.summary).map(([k, v]) => {
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
