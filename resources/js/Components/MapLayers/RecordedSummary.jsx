import { useMemo } from 'react';
import SignedChange from '@/Components/Maps/SignedChange';

export const ord = (n) => `${n}${['th', 'st', 'nd', 'rd'][n] || 'th'}`;

// Year-to-date totals, one point per year: each is January up to the selected
// quarter (Jan–Sep on a 3rd quarter), so every year is measured over the same
// months. One line, a number on every point, the selected year in navy.
export const MONTH_SPAN = ['Jan–Mar', 'Jan–Jun', 'Jan–Sep', 'Jan–Dec'];

export function TownTrend({ pts, activeIndex, onSelect }) {
    const active = pts.find((p) => p.i === activeIndex);
    if (!active) return null;
    const rows = [...new Set(pts.map((p) => p.year))]
        .filter((yr) => yr <= active.year)
        .map((yr) => {
            const qs = pts.filter((p) => p.year === yr && p.quarter <= active.quarter);
            return qs.length === active.quarter ? { year: yr, total: qs.reduce((s, p) => s + p.total, 0), i: qs[qs.length - 1].i } : null;
        })
        .filter(Boolean);
    if (rows.length < 2) return null;
    const W = 330, H = 78, PX = 20, TOP = 18, BASE = 58;
    const max = Math.max(1, ...rows.map((r) => r.total));
    const x = (j) => PX + (j / (rows.length - 1)) * (W - PX * 2);
    const y = (v) => BASE - (v / max) * (BASE - TOP);
    const line = rows.map((r, j) => `${j ? 'L' : 'M'}${x(j).toFixed(1)},${y(r.total).toFixed(1)}`).join('');
    const area = `${line}L${x(rows.length - 1).toFixed(1)},${BASE}L${x(0).toFixed(1)},${BASE}Z`;
    const slot = (W - PX * 2) / (rows.length - 1);
    const span = MONTH_SPAN[active.quarter - 1];

    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="group" aria-label={`${span} applications, each year`}>
            <defs>
                <linearGradient id="town-trend-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0b2a5b" stopOpacity="0.14" />
                    <stop offset="100%" stopColor="#0b2a5b" stopOpacity="0" />
                </linearGradient>
            </defs>
            <line x1={PX} y1={BASE} x2={W - PX} y2={BASE} stroke="#d5dbe3" strokeWidth="0.8" />
            <path d={area} fill="url(#town-trend-fill)" />
            <path d={line} fill="none" stroke="#0b2a5b" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {rows.map((r, j) => {
                const on = r.year === active.year;
                return (
                    <g key={r.year} className="cursor-pointer" onClick={() => onSelect(r.i)}>
                        <rect x={x(j) - slot / 2} y="0" width={slot} height={H} fill="transparent" />
                        <circle cx={x(j)} cy={y(r.total)} r={on ? 4.5 : 3} fill={on ? '#0b2a5b' : '#fff'} stroke="#0b2a5b" strokeWidth="1.6" />
                        <text x={x(j)} y={y(r.total) - 8} textAnchor="middle" fontSize={on ? 10 : 9} fontWeight={on ? 700 : 600} fill={on ? '#0b2a5b' : '#64748b'}>{r.total.toLocaleString()}</text>
                        <text x={x(j)} y={BASE + 13} textAnchor="middle" fontSize="9" fontWeight={on ? 700 : 400} fill={on ? '#0b2a5b' : '#94a3b8'}>{r.year}</text>
                        <title>{`${span} ${r.year}: ${r.total} LC`}</title>
                    </g>
                );
            })}
        </svg>
    );
}

// A recorded quarter with no barangay open: the quarter in one sentence, the
// town's trend, and the few barangays worth opening first. Change is always
// against the quarter just before.
export default function RecordedSummary({ ranking = [], series = [], activeIndex = 0, onSelectQuarter = () => {}, onSelectBgy, onHoverBgy = () => {}, totalBarangays = 0 }) {
    const current = series[activeIndex];
    // Compared with the quarter just before this one.
    const prevQ = series[activeIndex - 1];
    const lastQuarter = prevQ && !prevQ.isForecast && prevQ.total !== null ? prevQ : null;
    const total = ranking.reduce((sum, r) => sum + r.count, 0);
    // Every recorded quarter, so the chart shows the whole history.
    const trendPts = series.map((q, i) => ({ ...q, i })).filter((q) => !q.isForecast && q.total !== null);
    const deltaFor = (name) => (lastQuarter ? (current?.byBgy?.[name.trim().toLowerCase()] || 0) - (lastQuarter.byBgy?.[name.trim().toLowerCase()] || 0) : null);


    // Busiest, biggest rise, biggest drop — each barangay listed once.
    const flags = useMemo(() => {
        const rows = ranking.map((r) => ({ ...r, delta: deltaFor(r.name) }));
        const out = [];
        const add = (r, reason) => r && !out.some((o) => o.name === r.name) && out.push({ ...r, reason });
        add(rows[0], 'Busiest this quarter');
        add([...rows].filter((r) => r.delta > 0).sort((a, b) => b.delta - a.delta)[0], 'Biggest rise');
        add([...rows].filter((r) => r.delta < 0).sort((a, b) => a.delta - b.delta)[0], 'Biggest drop');
        // Nothing to compare with (the first quarter on record), or no rise or
        // drop: fill the list with the next busiest so it never looks empty.
        rows.slice(1).forEach((r, k) => out.length < 3 && add(r, `${ord(k + 2)} busiest`));
        return out;
    }, [ranking, series, activeIndex]);


    if (!current || total === 0) return null;
    const longLabel = (q) => `the ${ord(q.quarter)} quarter of ${q.year}`;
    const H3 = 'text-[12.5px] font-semibold text-slate-800';

    return (
        <>
            <section className="shrink-0 px-4 py-3 border-b border-slate-200" aria-label="This quarter">
                <h3 className={H3}>How many applied in {longLabel(current)}?</h3>
                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50/70 px-3 py-2.5">
                <div className="flex items-baseline gap-1.5">
                    <span className="text-[22px] font-semibold tabular-nums leading-none text-slate-900">{total}</span>
                    <span className="text-[12px] text-slate-600 mr-auto">LC filed</span>
                    <SignedChange delta={lastQuarter ? total - lastQuarter.total : null} baseLabel={lastQuarter ? "last quarter" : null} className="text-[11px]" />
                </div>
                {!lastQuarter && (
                    <p className="mt-2 pt-2 border-t border-slate-200 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 16v-4M12 8h.01" /></svg>
                        First quarter on record, so there's nothing to compare with yet.
                    </p>
                )}
                </div>
            </section>

            {flags.length > 0 && (
                <section className="shrink-0 pt-3 pb-1.5 border-b border-slate-200" aria-label="Barangays that stand out">
                    <h3 className={`${H3} px-4 pb-1`}>Which barangays stand out?</h3>
                    <ul>
                        {flags.map((f) => (
                            <li key={f.name}>
                                <button
                                    type="button"
                                    onClick={() => onSelectBgy?.(f.name)}
                                    onMouseEnter={() => onHoverBgy(f.name)}
                                    onMouseLeave={() => onHoverBgy(null)}
                                    title={`Open ${f.name} on the map`}
                                    className="w-full grid grid-cols-[84px_1fr_auto_auto] items-center gap-2 px-4 py-1.5 text-left cursor-pointer hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]"
                                >
                                    <span className="text-[10.5px] text-slate-500">{f.reason.replace(' this quarter', '')}</span>
                                    <span className="text-[12px] font-semibold text-slate-900 truncate">{f.name}</span>
                                    <span className="text-[11px] tabular-nums text-right whitespace-nowrap">
                                        <b className="font-semibold text-slate-900">{f.count}</b>
                                        {f.delta ? <span className={`ml-1.5 font-semibold ${f.delta > 0 ? 'text-[#1f9d55]' : 'text-[#d1342a]'}`}>{f.delta > 0 ? '+' : '−'}{Math.abs(f.delta)}</span> : null}
                                    </span>
                                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {lastQuarter && <p className="px-4 pt-0.5 text-[10px] text-slate-400">Change vs last quarter</p>}
                </section>
            )}

            {trendPts.length > 0 && current.year > trendPts[0].year && (
            <section className="shrink-0 px-4 pt-3 pb-2" aria-label="Town trend">
                <h3 className={H3}>How does this year compare?</h3>
                <p className="mb-1.5 text-[11px] text-slate-500">Applications from {MONTH_SPAN[current.quarter - 1]} of each year.</p>
                <TownTrend pts={trendPts} activeIndex={activeIndex} onSelect={onSelectQuarter} />
            </section>
            )}
        </>
    );
}

