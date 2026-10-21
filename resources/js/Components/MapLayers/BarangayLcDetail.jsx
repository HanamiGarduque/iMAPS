import { useMemo, useState, useEffect } from 'react';
import { getTrendsDemandColor } from '@/Components/Maps/LeafletMap';

const TITLE = 'text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500';

const shortClass = (label) => label.replace(/ (Demand|Activity)$/, '');

// Greys, like the rest of the panel's quiet chrome: the legend carries the
// names and counts, so the bar only has to show proportions.
const TYPE_SHADES = ['#0f172a', '#64748b', '#cbd5e1', '#e5e9ef'];

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

function Tile({ title, aside, children, note, noteTone = 'text-slate-500', foot }) {
    return (
        <div className="min-w-0 rounded-[4px] border border-slate-200 bg-white px-2.5 py-2">
            <div className="flex items-baseline justify-between gap-1 text-[9.5px] uppercase tracking-[0.06em] text-slate-500">
                <span className="font-bold truncate">{title}</span>
                <span className="shrink-0 tabular-nums normal-case tracking-normal text-[10.5px]">{aside}</span>
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">{children}</div>
            {note && <div className={`mt-1 text-[11px] font-semibold leading-snug ${noteTone}`}>{note}</div>}
            {foot && <div className="mt-2">{foot}</div>}
        </div>
    );
}

function PairBars({ rows }) {
    const max = Math.max(1, ...rows.map((x) => x.v));
    return (
        <div className="space-y-1">
            {rows.map((x) => (
                <div key={x.label} className="flex items-center gap-1.5 text-[10px] text-slate-500">
                    <span className="w-9 shrink-0 tabular-nums">{x.label}</span>
                    <span className="flex-1 h-[7px] rounded-full bg-slate-100 overflow-hidden">
                        <span className="block h-full rounded-full" style={{ width: `${Math.max(x.v ? 6 : 0, (x.v / max) * 100)}%`, backgroundColor: x.tone }} />
                    </span>
                    <span className="w-4 text-right tabular-nums font-semibold text-slate-700">{x.v}</span>
                </div>
            ))}
        </div>
    );
}

const FIGURE = 'text-[20px] leading-none font-semibold tabular-nums text-slate-900';
const UNIT = 'text-[11px] font-medium text-slate-500';

// "9 fewer than Q1 '23": the direction in words, not just an arrow.
const changePhrase = (delta, baseLabel) => {
    if (delta === null || !baseLabel) return { text: '', tone: '' };
    if (delta === 0) return { text: `Same as ${baseLabel}`, tone: 'text-slate-500' };
    return delta > 0
        ? { text: `▲ ${delta} more than ${baseLabel}`, tone: 'text-[#b32a17]' }
        : { text: `▼ ${Math.abs(delta)} fewer than ${baseLabel}`, tone: 'text-[#1f5fa8]' };
};

export default function BarangayLcDetail({
    bgyName,
    bgyStat = {},
    series = [],
    activeIndex = 0,
    activeQuarter = null,
    forecastData = null,
    records = [],
    onSelectQuarter = () => {},
    onOpenRecords,
    recordsOpen = false,
}) {
    const key = bgyName.trim().toLowerCase();
    const isForecast = Boolean(activeQuarter?.isForecast);
    const current = series[activeIndex];

    const countOf = (q, k = key) => q?.byBgy?.[k] || 0;
    const count = countOf(current);
    const cls = getTrendsDemandColor(count);

    // Seasonal comparison: against the same quarter a year earlier, as the
    // ranking list does, since Q1 is always the peak.
    const lastYear = current
        ? series.find((q) => !q.isForecast && q.total !== null && q.year === current.year - 1 && q.quarter === current.quarter) || null
        : null;
    const delta = lastYear ? count - countOf(lastYear) : null;

    // The quarter after this one. Once later quarters are on record (viewing
    // 2021 from 2026) it is simply what was filed; only the quarters the model
    // has forecast show a "~" and its 80% range. At the end of the timeline,
    // where nothing follows, the tile shows this quarter a year earlier instead.
    const following = series[activeIndex + 1];
    const hasFollowing = Boolean(following) && following.total !== null;
    const followingCount = hasFollowing ? countOf(following) : null;
    const followingRow = hasFollowing && following.isForecast
        ? (forecastData?.demand || []).find((d) => Number(d.year) === following.year && Number(d.quarter) === following.quarter && (d.barangay || '').trim().toLowerCase() === key)
        : null;
    const hasRange = followingRow && followingRow.lower != null && followingRow.upper != null;
    // Recorded quarters read against this one; a forecast against the same
    // quarter a year earlier, since Q1 is always the peak.
    const followingBase = !hasFollowing ? null : following.isForecast
        ? series.find((q) => !q.isForecast && q.total !== null && q.year === following.year - 1 && q.quarter === following.quarter) || null
        : current;
    const followingDelta = followingBase ? followingCount - countOf(followingBase) : null;
    const change = changePhrase(followingDelta, followingBase?.label);

    // Each tile compares two quarters with two labelled bars on one scale.
    const thisPair = lastYear
        ? [{ label: lastYear.label, v: countOf(lastYear), tone: '#cfd5dd' }, { label: activeQuarter?.label, v: count, tone: cls.stroke }]
        : null;
    const nextPair = hasFollowing && followingBase
        ? [{ label: followingBase.label, v: countOf(followingBase), tone: '#cfd5dd' }, { label: following.label, v: followingCount, tone: followingDelta > 0 ? '#e0674f' : followingDelta < 0 ? '#5b95c9' : '#94a3b8' }]
        : null;
    const thisSays = changePhrase(delta, 'a year ago');
    const nextSays = changePhrase(followingDelta, followingBase?.label);
    const tile = hasFollowing
        ? {
            title: 'Next quarter',
            value: `${following.isForecast ? '~' : ''}${followingCount}`,
            aside: following.isForecast ? `${following.label} forecast` : following.label,
            ...change,
            ...(hasRange ? { text: `${change.text ? change.text + ' · ' : ''}likely ${Math.round(followingRow.lower)}–${Math.round(followingRow.upper)}` } : {}),
        }
        : lastYear
            ? { title: 'Same quarter last year', value: String(countOf(lastYear)), aside: lastYear.label, text: '', tone: '' }
            : { title: 'Next quarter', value: '—', aside: '', text: 'No later quarter on record', tone: '' };

    // The quarter's filings by land-use class (recorded quarters only).
    const quarterRecords = useMemo(() => {
        if (isForecast || !activeQuarter) return [];
        return records.filter((r) => {
            const d = r.created_at ? new Date(r.created_at) : null;
            return d && !isNaN(d.getTime()) && d.getFullYear() === activeQuarter.year && Math.floor(d.getMonth() / 3) + 1 === activeQuarter.quarter;
        });
    }, [records, isForecast, activeQuarter]);
    const typeCounts = useMemo(() => {
        const tally = {};
        quarterRecords.forEach((r) => {
            const t = r.target_land_use_class || 'Other';
            tally[t] = (tally[t] || 0) + 1;
        });
        const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
        const top = sorted.slice(0, 3);
        const rest = sorted.slice(3).reduce((sum, [, n]) => sum + n, 0);
        return rest ? [...top, ['Other', rest]] : top;
    }, [quarterRecords]);

    // LC per quarter for this barangay, across the whole timeline.
    const trend = useMemo(() => series.map((q) => ({ ...q, value: q.total === null ? null : q.byBgy?.[key] || 0 })), [series, key]);

    return (
        <>
            {/* On a forecast quarter the forecast cards above already say it, so no tiles. */}
            {!isForecast && (
            <div className="shrink-0 grid grid-cols-2 gap-2 px-4 py-3 border-b border-slate-200">
                <Tile
                    title="This quarter"
                    aside={activeQuarter?.label}
                    note={thisSays.text}
                    noteTone={thisSays.tone}
                    foot={thisPair && <PairBars rows={thisPair} />}
                >
                    <span className={FIGURE}>{count}</span>
                    <span className={UNIT}>LC</span>
                    <span
                        className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border"
                        style={{ color: cls.stroke, borderColor: cls.stroke + '55', backgroundColor: cls.color + '33' }}
                    >
                        {shortClass(cls.label)}
                    </span>
                </Tile>
                <Tile
                    title={tile.title}
                    aside={tile.aside}
                    note={nextPair ? nextSays.text : tile.text}
                    noteTone={nextPair ? nextSays.tone : tile.tone}
                    foot={nextPair && <PairBars rows={nextPair} />}
                >
                    <span className={FIGURE}>{tile.value}</span>
                    {tile.value !== '—' && <span className={UNIT}>LC</span>}
                </Tile>
            </div>
            )}

            {!isForecast && quarterRecords.length > 0 && (
                <section className="shrink-0 px-4 pt-3 pb-3 border-b border-slate-200" aria-label="Filings by type">
                    <div className="flex items-baseline mb-1.5">
                        <h3 className={`${TITLE} mr-auto`}>Filings by type · {activeQuarter.label}</h3>
                        <span className="text-[10.5px] text-slate-400 tabular-nums">{quarterRecords.length} total</span>
                    </div>
                    <div className="flex h-2.5 rounded-full overflow-hidden bg-slate-100" role="img" aria-label={typeCounts.map(([t, n]) => `${t} ${n}`).join(', ')}>
                        {typeCounts.map(([t, n], i) => (
                            <span key={t} style={{ width: `${(n / quarterRecords.length) * 100}%`, backgroundColor: TYPE_SHADES[i] }} />
                        ))}
                    </div>
                    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {typeCounts.map(([t, n], i) => (
                            <li key={t} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                                <span className="w-2 h-2 rounded-[2px] border border-black/10" style={{ backgroundColor: TYPE_SHADES[i] }} aria-hidden="true" />
                                {t} · <span className="tabular-nums">{n}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <div className="shrink-0 px-4 pt-3.5 pb-3.5 border-b border-slate-200">
                <div className="flex items-baseline mb-1.5">
                    <h3 className={`${TITLE} mr-auto`}>LC per quarter · {bgyName}</h3>
                    <span className="text-[10.5px] text-slate-400">Click a point to view it</span>
                </div>
                <QuarterTrend points={trend} activeIndex={activeIndex} onSelect={onSelectQuarter} />
            </div>

            {!isForecast && (
                <button
                    type="button"
                    onClick={onOpenRecords}
                    aria-pressed={recordsOpen}
                    className={`shrink-0 w-full flex items-center gap-2 px-4 py-3 text-left border-b border-slate-200 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b] ${recordsOpen ? 'bg-[#eaf0f8]' : 'hover:bg-slate-50'}`}
                >
                    <span className="min-w-0 flex-1">
                        <span className="block text-[12px] font-semibold text-slate-900">LC records</span>
                        <span className="block text-[11px] text-slate-500">{quarterRecords.length} filed in {activeQuarter?.label} · {records.length} in all years</span>
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
