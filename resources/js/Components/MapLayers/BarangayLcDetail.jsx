import { useMemo } from 'react';
import SignedChange from '@/Components/Maps/SignedChange';

const TITLE = 'text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500';

// One line across all quarters: the filled area is what was filed, the dashed
// orange stretch is the forecast, the marked point is the quarter on the map.
// Every quarter is a click target, as the bars were.
function QuarterTrend({ points, activeIndex, onSelect }) {
    const W = 330, H = 92, PX = 8, TOP = 20, BASE = 70;
    const n = points.length;
    if (n < 2) return null;
    const max = Math.max(1, ...points.map((q) => q.value || 0));
    const x = (i) => PX + (i / (n - 1)) * (W - PX * 2);
    const y = (v) => BASE - (v / max) * (BASE - TOP);

    const known = points.map((q, i) => (q.value === null ? null : { i, v: q.value, f: q.isForecast }));
    const recorded = known.filter((k) => k && !k.f);
    const forecast = known.filter((k) => k && k.f);
    const bridge = recorded.length && forecast.length ? [recorded[recorded.length - 1], ...forecast] : forecast;
    const path = (list) => list.map((k, j) => `${j ? 'L' : 'M'}${x(k.i).toFixed(1)},${y(k.v).toFixed(1)}`).join('');
    const area = recorded.length > 1 ? `${path(recorded)}L${x(recorded[recorded.length - 1].i).toFixed(1)},${BASE}L${x(recorded[0].i).toFixed(1)},${BASE}Z` : '';

    const active = known[activeIndex];
    const label = points[activeIndex];
    const bubbleW = 56;
    const bx = active ? Math.min(W - bubbleW / 2 - 2, Math.max(bubbleW / 2 + 2, x(active.i))) : 0;

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="group" aria-label="LC per quarter">
            <defs>
                <linearGradient id="lc-trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6f8fbd" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#6f8fbd" stopOpacity="0.02" />
                </linearGradient>
            </defs>
            {points.map((q, i) => (q.quarter === 1 || i === 0) && (
                <g key={`y${q.year}`}>
                    <line x1={x(i)} y1={TOP - 6} x2={x(i)} y2={BASE} stroke="#e6e9ee" strokeWidth="0.7" />
                    <text x={x(i)} y={BASE + 13} textAnchor="middle" fontSize="8.5" fill="#94a3b8">{`'${String(q.year).slice(-2)}`}</text>
                </g>
            ))}
            <line x1={PX} y1={BASE} x2={W - PX} y2={BASE} stroke="#cfd5dd" strokeWidth="0.8" />
            {area && <path d={area} fill="url(#lc-trend-fill)" />}
            {recorded.length > 1 && <path d={path(recorded)} fill="none" stroke="#5f7fb0" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />}
            {bridge.length > 1 && <path d={path(bridge)} fill="none" stroke="#f08a3c" strokeWidth="1.6" strokeDasharray="3 3" strokeLinecap="round" />}
            {forecast.map((k) => <circle key={`f${k.i}`} cx={x(k.i)} cy={y(k.v)} r="2.6" fill="#fff" stroke="#f08a3c" strokeWidth="1.4" />)}
            {active && (
                <g>
                    <line x1={x(active.i)} y1={TOP - 4} x2={x(active.i)} y2={BASE} stroke="#0b2a5b" strokeWidth="0.8" strokeDasharray="2 2" />
                    <circle cx={x(active.i)} cy={y(active.v)} r="5.5" fill="#fff" stroke="#0b2a5b" strokeWidth="1.6" />
                    <circle cx={x(active.i)} cy={y(active.v)} r="2.4" fill="#0b2a5b" />
                    <g transform={`translate(${bx} 2)`}>
                        <rect x={-bubbleW / 2} y="0" width={bubbleW} height="15" rx="7.5" fill="#0b2a5b" />
                        <text y="10.5" textAnchor="middle" fontSize="8.5" fontWeight="700" fill="#fff">{`${label.label} · ${active.v}`}</text>
                    </g>
                </g>
            )}
            {points.map((q, i) => (
                <rect
                    key={`h${i}`}
                    x={x(i) - (W - PX * 2) / (n - 1) / 2}
                    y="0"
                    width={(W - PX * 2) / (n - 1)}
                    height={H}
                    fill="transparent"
                    className="cursor-pointer"
                    onClick={() => onSelect(i)}
                >
                    <title>{`${q.label}${q.isForecast ? ' (forecast)' : ''}: ${q.value === null ? 'not loaded' : `${q.value} LC`}`}</title>
                </rect>
            ))}
        </svg>
    );
}

export default function BarangayLcDetail({ bgyName, series = [], activeIndex = 0, onSelectQuarter = () => {}, summary = null, activeQuarter = null, onOpenRecords, recordsOpen = false }) {
    const key = bgyName.trim().toLowerCase();

    // LC per quarter for this barangay, across the whole timeline.
    const trend = useMemo(() => series.map((q) => ({ ...q, value: q.total === null ? null : q.byBgy?.[key] || 0 })), [series, key]);

    return (
        <>
            <div className="shrink-0 px-4 pt-3 pb-2.5 border-b border-slate-200">
                <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">Barangay</div>
                <div className="text-[16px] font-semibold text-slate-900 leading-tight truncate">{bgyName}</div>
            </div>

            <div className="shrink-0 px-4 pt-3.5 pb-3.5 border-b border-slate-200">
                <div className="flex items-baseline mb-1.5">
                    <h3 className={`${TITLE} mr-auto`}>LC per quarter</h3>
                    <span className="text-[10.5px] text-slate-400">Click a point to view it</span>
                </div>
                <QuarterTrend points={trend} activeIndex={activeIndex} onSelect={onSelectQuarter} />
            </div>

            {summary?.following && summary.followingCount !== null && (
                <div className="shrink-0 flex items-start gap-3 px-4 py-3 border-b border-slate-200">
                    <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-slate-900">Next quarter</div>
                        <div className="text-[11px] text-slate-500">{summary.following.label}{summary.following.isForecast ? ' · forecast' : ''}</div>
                    </div>
                    <div className="ml-auto text-right">
                        <div className="text-[15px] font-semibold tabular-nums text-slate-900">{summary.following.isForecast ? '~' : ''}{summary.followingCount} <span className="text-[11px] font-medium text-slate-500">LC</span></div>
                        {summary.followingBase && (
                            <div className="text-[11px]"><SignedChange delta={summary.followingDelta} baseLabel={summary.followingBase.label} /></div>
                        )}
                    </div>
                </div>
            )}

            {summary && !summary.isForecast && (
                <button
                    type="button"
                    onClick={onOpenRecords}
                    aria-pressed={recordsOpen}
                    className="shrink-0 w-full flex items-center gap-2 px-4 py-3 text-left border-b border-slate-200 hover:bg-slate-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]"
                >
                    <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-slate-900">LC records</span>
                        <span className="block text-[11px] text-slate-500">{summary.quarterRecordCount} filed in {activeQuarter?.label}</span>
                    </span>
                    <span className="shrink-0 flex items-center gap-1 text-[11.5px] font-semibold text-[#0b2a5b]">
                        View records
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </span>
                </button>
            )}
        </>
    );
}
