import { Component, Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Head, Link, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import MapSkeleton from "@/Components/Maps/MapSkeleton";
import { STATUS_MARKER_CONFIG, getStatusMarkerConfig } from "@/Components/MapLayers/StatusPanel";
import { DIVERSITY_BLUES, DIVERSITY_TIERS, getDiversityTheme } from "@/utils/diversityTheme";
import { ZONE_CATEGORIES, getZoneInfo } from "@/utils/clupZones";
import { confirmSignOut } from "@/utils/signOut";

// Rosario's own clock, whatever the viewer's machine is set to.
const TZ = "Asia/Manila";

// Rosario's barangays as 3D prisms of their land-use mix; its own chunk (maplibre-gl).
const Rosario3D = lazy(() => import("@/Components/Maps/Rosario3D"));

// Rosario, Batangas: the extent of its municipal boundary (public.rosario_boundary), [west, south], [east, north].
const ROSARIO_BOUNDS = [
    [121.165, 13.685],
    [121.37, 13.875],
];
const PITCH = 55;
const BEARING = -18;
const WIDE = "(min-width: 1280px)";
const GREETING_MS = 3000;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const ICONS = {
    plus: "M12 4.5v15m7.5-7.5h-15",
    minus: "M19.5 12h-15",
    fit: "M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z",
    search: "M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z",
    draft: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10",
    registry: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
    support: "M16.712 4.33a9.027 9.027 0 011.652 1.306c.51.51.944 1.064 1.306 1.652M16.712 4.33l-3.448 4.138m3.448-4.138a9.014 9.014 0 00-9.424 0M19.67 7.288l-4.138 3.448m4.138-3.448a9.014 9.014 0 010 9.424m-4.138-5.976a3.736 3.736 0 00-.88-1.388 3.737 3.737 0 00-1.388-.88m2.268 2.268a3.765 3.765 0 010 2.528m-2.268-4.796a3.765 3.765 0 00-2.528 0m4.796 4.796c-.181.506-.475.982-.88 1.388a3.736 3.736 0 01-1.388.88m2.268-2.268l4.138 3.448m0 0a9.027 9.027 0 01-1.306 1.652c-.51.51-1.064.944-1.652 1.306m0 0l-3.448-4.138m3.448 4.138a9.014 9.014 0 01-9.424 0m5.976-4.138a3.765 3.765 0 01-2.528 0m0 0a3.736 3.736 0 01-1.388-.88 3.737 3.737 0 01-.88-1.388m2.268 2.268L7.288 19.67m0 0a9.024 9.024 0 01-1.652-1.306 9.027 9.027 0 01-1.306-1.652m0 0l4.138-3.448M4.33 16.712a9.014 9.014 0 010-9.424m4.138 5.976a3.765 3.765 0 010-2.528m0 0c.181-.506.475-.982.88-1.388a3.736 3.736 0 011.388-.88m-2.268 2.268L4.33 7.288m6.406 1.18L7.288 4.33m0 0a9.024 9.024 0 00-1.652 1.306A9.025 9.025 0 004.33 7.288",
    inspect: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
    calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
    clock: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
    expand: "M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15",
    chevron: "M8.25 4.5l7.5 7.5-7.5 7.5",
    chevronDown: "M19.5 8.25l-7.5 7.5-7.5-7.5",
    info: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z",
};

function Icon({ name, className = "w-4 h-4", strokeWidth = 1.8 }) {
    return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={strokeWidth} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
        </svg>
    );
}

const fmt = (date, opts) => new Intl.DateTimeFormat("en-PH", { timeZone: TZ, ...opts }).format(date);
const num = (n) => Number(n || 0).toLocaleString("en-PH");
const plural = (n, word) => `${num(n)} ${word}${n === 1 ? "" : "s"}`;
const qLabel = (q) => `Q${q.quarter} ${q.year}`;
const pct = (s) => (s < 0.01 ? "<1%" : `${Math.round(s * 100)}%`);

const days = (v) => {
    const n = Number(v);
    if (v == null || !Number.isFinite(n)) return "—";
    return n < 1 ? "< 1 day" : plural(Math.round(n), "day");
};

// The same white cards, slate borders and blue accents as the other modules.
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:ring-offset-1 focus-visible:ring-offset-white";
// A pane over the map.
const PANE = "rounded-xl bg-white border border-slate-200 shadow-xs";
// The left column: a slate panel holding white cards, like Settings' side panel.
const PANEL = "rounded-xl bg-slate-50 border border-slate-200 shadow-xs";
// A white card set inside a panel.
const CARD = "rounded-lg bg-white border border-slate-200/90 shadow-2xs";
const CHIP = "inline-flex items-center gap-1.5 h-[26px] px-2.5 rounded-lg bg-white border border-slate-200 shadow-2xs text-[11px] font-semibold text-slate-600";
const BUTTON = "grid place-items-center w-8 h-8 rounded-lg bg-white border border-slate-200/90 shadow-2xs text-slate-600 hover:bg-slate-50 hover:text-blue-700 transition-colors cursor-pointer";
const BLUE_FILL = "bg-blue-600";
// Zoning categories by share, darkest first: one blue family instead of the CLUP palette.
const BLUES = ["#1e3a8a", "#2563eb", "#60a5fa", "#a5c8fb", "#dbe7fd"];

// A WebGL failure in the 3D model must not take the rest of the overview down.
class MapBoundary extends Component {
    state = { failed: false };
    static getDerivedStateFromError() {
        return { failed: true };
    }
    render() {
        if (this.state.failed) {
            return <p className="absolute inset-0 grid place-items-center px-6 text-center text-[12px] text-slate-500">The 3D map of Rosario isn't available on this device.</p>;
        }
        return this.props.children;
    }
}

function PanelHead({ id, title, children }) {
    return (
        <div className="flex items-center justify-between gap-2">
            <h2 id={id} className="text-[13px] font-bold text-slate-900 truncate">
                {title}
            </h2>
            {children}
        </div>
    );
}

const MoreLink = ({ href, children }) => (
    <Link href={href} className={`shrink-0 inline-flex items-center gap-0.5 rounded-md text-[11px] font-semibold text-blue-600 hover:text-blue-800 ${FOCUS}`}>
        {children}
        <Icon name="chevron" className="w-3 h-3" strokeWidth={2.4} />
    </Link>
);

// Zone areas (CLUP code => m²) folded into categories, largest first; past five fold into "Other".
function zoneShares(zones) {
    const byCat = {};
    Object.entries(zones || {}).forEach(([code, area]) => {
        const cat = getZoneInfo(code).category;
        byCat[cat] = (byCat[cat] || 0) + Number(area || 0);
    });
    const sum = Object.values(byCat).reduce((a, b) => a + b, 0);
    if (!sum) return [];
    const rows = Object.entries(byCat)
        .map(([id, area]) => ({ id, label: ZONE_CATEGORIES[id]?.label || id, share: area / sum }))
        .sort((a, b) => b.share - a.share);
    const top = rows.length <= 5 ? rows : [...rows.slice(0, 4), { id: "other", label: "Other zones", share: rows.slice(4).reduce((a, r) => a + r.share, 0) }];
    return top.map((r, i) => ({ ...r, fill: BLUES[i] }));
}

// Applications per stage as columns that fill whatever height the panel leaves;
// the busiest stage carries the accent and a callout.
function PipelineChart({ pipeline }) {
    const max = Math.max(1, ...pipeline.map((s) => s.count));
    const peak = pipeline.reduce((a, s) => (s.count > a.count ? s : a), pipeline[0]);

    return (
        <ol className="flex-1 min-h-0 flex items-stretch gap-0.5" aria-label="Applications by stage">
            {pipeline.map((s) => {
                const top = s === peak && s.count > 0;
                return (
                    <li key={s.key} className="flex-1 min-w-0">
                        <Link
                            href={`/applications?status=${encodeURIComponent(s.key)}`}
                            aria-label={`${s.label}: ${num(s.count)}`}
                            className={`group h-full flex flex-col items-center gap-1 rounded-lg ${FOCUS}`}
                        >
                            {/* Bar and spacer split the column by flex-grow, so bars scale with whatever height the panel has */}
                            <span className="w-full flex-1 min-h-0 flex flex-col items-center" aria-hidden="true">
                                <span className="basis-0" style={{ flexGrow: 1 - s.count / max }} />
                                <span
                                    className={`mb-1 tabular-nums text-[10.5px] ${
                                        top ? "rounded-md bg-blue-50 border border-blue-200/60 px-1.5 font-bold text-blue-700" : "font-semibold text-slate-500"
                                    }`}
                                >
                                    {num(s.count)}
                                </span>
                                <span
                                    className={`w-full max-w-[24px] basis-0 min-h-[3px] rounded-md transition-[flex-grow,background-color] duration-500 ${
                                        top ? BLUE_FILL : "bg-blue-100 group-hover:bg-blue-200"
                                    }`}
                                    style={{ flexGrow: s.count / max }}
                                />
                            </span>
                            <span className={`w-full h-[22px] text-center text-[9.5px] leading-[1.15] line-clamp-2 ${top ? "font-semibold text-slate-900" : "text-slate-500 group-hover:text-slate-800"}`} aria-hidden="true">
                                {s.shortLabel}
                            </span>
                        </Link>
                    </li>
                );
            })}
        </ol>
    );
}

// Zoning composition as a ring, with its legend beside it.
function ZoningDonut({ shares }) {
    let offset = 0;
    return (
        <div className="flex items-center gap-4">
            <svg viewBox="0 0 42 42" className="w-[68px] h-[68px] short:w-[56px] short:h-[56px] shrink-0 -rotate-90" aria-hidden="true">
                <circle cx="21" cy="21" r="15.915" fill="none" stroke="#f1f5f9" strokeWidth="7" />
                {shares.map((s) => {
                    const len = s.share * 100;
                    const seg = (
                        <circle
                            key={s.id}
                            cx="21"
                            cy="21"
                            r="15.915"
                            fill="none"
                            stroke={s.fill}
                            strokeWidth="7"
                            strokeDasharray={`${Math.max(0, len - 0.8)} ${100 - len + 0.8}`}
                            strokeDashoffset={-offset}
                        />
                    );
                    offset += len;
                    return seg;
                })}
            </svg>
            <ul className="flex-1 min-w-0 flex flex-col gap-[3px] text-[11px]">
                {shares.map((s) => (
                    <li key={s.id} className="flex items-center gap-2 min-w-0">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: s.fill }} aria-hidden="true" />
                        <span className="text-slate-600 truncate">{s.label}</span>
                        <span className="ml-auto font-semibold text-slate-900 tabular-nums">{pct(s.share)}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// Filings per quarter as a smooth line, continued dashed by the latest model run's
// next quarters; hovering a quarter reads it out. The counts come from the MPDO's
// imported filing record (historical_data: LC, zoning certificates and development
// permits since 2021, ~1,000-1,200 a year), the history the forecast trains on. It is
// not the iMAPS registry, which only holds applications encoded here, so the two
// don't add up and the chart says where its numbers come from.
function FilingsChart({ area, quarterly, forecast }) {
    const [hover, setHover] = useState(null);
    const last = quarterly[quarterly.length - 1];
    const ahead = (forecast?.quarters || []).filter((q) => !last || q.year * 4 + q.quarter > last.year * 4 + last.quarter);
    const pts = [...quarterly.map((q) => ({ ...q, projected: false })), ...ahead.map((q) => ({ ...q, projected: true }))];
    const max = Math.max(1, ...pts.map((p) => p.count));
    // A round axis fitted to the data: four equal steps of 1, 2, 2.5 or 5 × a power of ten
    // (whole numbers only, these are counts), with a little headroom over the peak.
    const raw = (max * 1.05) / 4;
    const mag = 10 ** Math.floor(Math.log10(raw || 1));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw && Number.isInteger(s)) || Math.ceil(raw);
    const ceil = step * 4;

    const xy = pts.map((p, i) => ({ ...p, x: pts.length > 1 ? 4 + (i / (pts.length - 1)) * 92 : 50, y: 100 - (p.count / ceil) * 100 }));
    const curve = (list) =>
        list.reduce((d, p, i) => {
            if (!i) return `M${p.x} ${p.y}`;
            const prev = list[i - 1];
            const mid = (prev.x + p.x) / 2;
            return `${d} C${mid} ${prev.y}, ${mid} ${p.y}, ${p.x} ${p.y}`;
        }, "");
    const filed = xy.filter((p) => !p.projected);
    const projected = filed.length ? [filed[filed.length - 1], ...xy.filter((p) => p.projected)] : [];
    const active = xy[hover ?? (ahead.length ? quarterly.length : quarterly.length - 1)];
    const metric = (label, v, f) => (v == null || !Number.isFinite(Number(v)) ? null : `${label} ${f(Number(v))}`);
    const metrics = forecast && [metric("R²", forecast.r2, (n) => n.toFixed(2)), metric("WMAPE", forecast.wmape, (n) => `${n.toFixed(1)}%`)].filter(Boolean);

    return (
        <section aria-labelledby="filings-heading" className={`${PANE} w-full px-4 pt-3.5 pb-3 flex flex-col min-w-0 h-[260px] xl:h-[clamp(196px,30vh,290px)]`}>
            <PanelHead id="filings-heading" title={<>Filings per quarter <span className="font-normal text-slate-400">· {area}</span></>}>
                <span className="flex items-center gap-3 text-[10.5px] text-slate-500">
                    <span className="hidden sm:inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" aria-hidden="true" />
                        Filed
                    </span>
                    {ahead.length > 0 && (
                        <span className="hidden sm:inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-indigo-400" aria-hidden="true" />
                            Projected
                        </span>
                    )}
                    {pts.length > 0 && (
                        <span className="inline-flex items-center h-[24px] px-2.5 rounded-lg bg-slate-100 border border-slate-200/60 text-[10.5px] font-semibold text-slate-600">{`${qLabel(pts[0])} – ${qLabel(pts[pts.length - 1])}`}</span>
                    )}
                </span>
            </PanelHead>
            <p className="mt-0.5 flex items-center gap-1 text-[10.5px] text-slate-500">
                MPDO filing record · all types
                {/* The full note on hover or keyboard focus, read out as the button's description */}
                <span className="group relative inline-flex">
                    <button type="button" aria-describedby="filings-source" className={`grid place-items-center rounded-full text-slate-400 hover:text-blue-600 cursor-help ${FOCUS}`}>
                        <Icon name="info" className="w-3.5 h-3.5" strokeWidth={2} />
                        <span className="sr-only">About this data</span>
                    </button>
                    <span
                        id="filings-source"
                        role="tooltip"
                        className="invisible opacity-0 transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100 absolute left-1/2 top-full z-20 mt-1.5 w-60 -translate-x-1/2 rounded-lg bg-slate-900 px-2.5 py-2 text-[10.5px] leading-snug text-white shadow-lg"
                    >
                        Every filing in the MPDO's record: locational clearances, zoning certificates and development permits. It is separate from the applications encoded in iMAPS, so the totals differ.
                    </span>
                </span>
            </p>

            {pts.length ? (
                <>
                    <ul className="sr-only" aria-label={`Filings per quarter, ${area}`}>
                        {pts.map((p) => (
                            <li key={`${p.year}-${p.quarter}`}>{`${qLabel(p)}: ${p.projected ? `about ${num(p.count)} projected` : `${num(p.count)} filed`}`}</li>
                        ))}
                    </ul>

                    <div className="mt-3 flex-1 min-h-0 flex gap-2" aria-hidden="true">
                        <div className="w-8 flex flex-col justify-between text-right text-[10px] text-slate-400 tabular-nums -my-1.5">
                            {[4, 3, 2, 1, 0].map((k) => (
                                <span key={k}>{num(step * k)}</span>
                            ))}
                        </div>
                        <div className="relative flex-1 min-w-0">
                            {/* Gridlines at each axis step */}
                            {[0, 1, 2, 3, 4].map((k) => (
                                <span key={k} className={`absolute inset-x-0 h-px ${k === 4 ? "bg-slate-200" : "bg-slate-100"}`} style={{ top: `${(k / 4) * 100}%` }} />
                            ))}

                            {/* Hover columns, one per quarter */}
                            <div className="absolute inset-0 flex" onMouseLeave={() => setHover(null)}>
                                {xy.map((p, i) => (
                                    <span key={`${p.year}-${p.quarter}`} className="flex-1 h-full" onMouseEnter={() => setHover(i)} />
                                ))}
                            </div>

                            <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 w-full h-full overflow-visible pointer-events-none">
                                <defs>
                                    <linearGradient id="filings-area" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0" stopColor="#2563eb" stopOpacity="0.16" />
                                        <stop offset="1" stopColor="#2563eb" stopOpacity="0" />
                                    </linearGradient>
                                </defs>
                                {filed.length > 1 && <path d={`${curve(filed)} L${filed[filed.length - 1].x} 100 L${filed[0].x} 100 Z`} fill="url(#filings-area)" />}
                                {filed.length > 1 && <path d={curve(filed)} fill="none" stroke="#2563eb" strokeWidth="1.75" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                                {projected.length > 1 && <path d={curve(projected)} fill="none" stroke="#818cf8" strokeWidth="1.75" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />}
                                {active && <line x1={active.x} x2={active.x} y1="0" y2="100" stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />}
                            </svg>

                            {/* The marker as HTML so it stays round on a stretched chart */}
                            {active && (
                                <span
                                    className={`absolute w-2.5 h-2.5 -ml-[5px] -mt-[5px] rounded-full ring-2 ring-white shadow pointer-events-none ${active.projected ? "bg-indigo-400" : "bg-blue-600"}`}
                                    style={{ left: `${active.x}%`, top: `${active.y}%` }}
                                />
                            )}

                            {active && (
                                <div
                                    className="absolute z-10 pointer-events-none rounded-lg bg-white border border-slate-200 px-3 py-2 shadow-sm whitespace-nowrap"
                                    style={{
                                        left: `${active.x}%`,
                                        top: `${Math.min(Math.max(active.y, 30), 62)}%`,
                                        transform: `translate(${active.x > 70 ? "calc(-100% - 12px)" : "12px"}, -50%)`,
                                    }}
                                >
                                    <p className="text-[10px] font-semibold text-slate-500">{qLabel(active)}</p>
                                    <p className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-500">
                                        <span className={`w-1.5 h-1.5 rounded-full ${active.projected ? "bg-indigo-400" : "bg-blue-600"}`} />
                                        <b className="font-bold text-slate-900 tabular-nums">{`${active.projected ? "~" : ""}${num(active.count)}`}</b>
                                        {active.projected ? "projected" : "filed"}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="mt-1.5 ml-10 relative h-[18px] text-[10px] text-slate-400 tabular-nums" aria-hidden="true">
                        {xy.map((p) => (
                            <span
                                key={`${p.year}-${p.quarter}`}
                                className={`absolute top-0 -translate-x-1/2 whitespace-nowrap leading-[18px] ${
                                    active === p ? "px-2 rounded-md bg-blue-50 font-semibold text-blue-700" : p.projected ? "text-indigo-500" : ""
                                }`}
                                style={{ left: `${p.x}%` }}
                            >
                                {p.quarter === 1 || p === xy[0] ? `Q${p.quarter} '${String(p.year).slice(2)}` : `Q${p.quarter}`}
                            </span>
                        ))}
                    </div>
                </>
            ) : (
                <p className="flex-1 grid place-items-center text-[12px] text-slate-500">No recorded filings yet.</p>
            )}

            <p className="mt-1.5 flex items-center gap-2 min-w-0 text-[10.5px] text-slate-500">
                {forecast ? (
                    <>
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" aria-hidden="true" />
                        <span className="truncate">
                            XGBoost run {fmt(new Date(forecast.generated_at), { month: "short", day: "numeric" })}
                            {metrics.length > 0 && ` · ${metrics.join(" · ")}`}
                        </span>
                    </>
                ) : (
                    <>
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" aria-hidden="true" />
                        <span className="truncate">No forecast run yet</span>
                    </>
                )}
                <span className="ml-auto">
                    <MoreLink href="/maps">{forecast ? "Forecast on Maps" : "Run it on Maps"}</MoreLink>
                </span>
            </p>
        </section>
    );
}

export default function Overview({
    statusCounts = {},
    quarterly = [],
    topBarangays = [],
    forecast = null,
    bgyStats = {},
    municipalDiversity = 0,
    municipalPlanDiversity = null,
    municipalZones = {},
    unreadCount = 0,
    latestUnread = null,
    draftCount = null,
    upcomingInspections = null,
    releaseTime = { median_days: null, released: 0 },
    inspections = null,
}) {
    const { auth } = usePage().props;
    const userName = auth?.user?.name || "Staff";
    const userRole = auth?.user?.role || "Planning Officer";
    const isAdmin = userRole === "Admin";
    const firstName = userName.trim().split(/\s+/)[0];

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 30000);
        return () => clearInterval(id);
    }, []);
    const headerClock = `${fmt(now, { month: "short", day: "numeric", year: "numeric" })} · ${fmt(now, { hour: "2-digit", minute: "2-digit" })}`;
    const hour = Number(fmt(now, { hour: "numeric", hourCycle: "h23" }));
    const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

    // The title greets the user first, then settles on "Overview".
    const [greetingShown, setGreetingShown] = useState(true);
    useEffect(() => {
        const id = setTimeout(() => setGreetingShown(false), GREETING_MS);
        return () => clearTimeout(id);
    }, []);

    // The 3D map, once its model is built; the page owns its camera and the map bar's buttons.
    const [map, setMap] = useState(null);
    const [boundsOf, setBoundsOf] = useState(null);
    // The panels around the map, measured so the model sits in the gap they leave.
    const stageRef = useRef(null);
    const titleRef = useRef(null);
    const asideRef = useRef(null);
    const rightRef = useRef(null);
    const bottomRef = useRef(null);

    const fitPadding = () => {
        if (!window.matchMedia(WIDE).matches) return { top: 16, bottom: 16, left: 16, right: 16 };
        const s = stageRef.current.getBoundingClientRect();
        const r = (ref) => ref.current.getBoundingClientRect();
        return {
            top: r(titleRef).bottom - s.top + 12,
            bottom: s.bottom - r(bottomRef).top + 12,
            left: r(asideRef).right - s.left + 16,
            right: s.right - r(rightRef).left + 16,
        };
    };

    // Frames the picked barangay, else all of Rosario.
    const frame = (animate) => {
        if (!map) return;
        const target = (selectedBgy && boundsOf?.(selectedBgy.name)) || ROSARIO_BOUNDS;
        // Null when the panels leave no room at all; the camera then stays put.
        const cam = map.cameraForBounds(target, { padding: fitPadding(), bearing: BEARING });
        if (!cam) return;
        // The fit is computed top-down; tilted, the model looks shorter, so win back some zoom. Only
        // the wide layout is height-bound enough to take a full level (the boundary is also well inside
        // its bounding box); a phone is width-bound.
        // A single barangay is pulled back instead: its prism is as tall as the town's, so a tight
        // fit fills the screen and loses the neighbours it is being compared with.
        const boost = target !== ROSARIO_BOUNDS ? -0.9 : window.matchMedia(WIDE).matches ? 1 : 0.1;
        const view = { ...cam, zoom: Math.min(cam.zoom + boost, 12.4), bearing: BEARING, pitch: PITCH };
        if (animate && !reducedMotion()) map.easeTo({ ...view, duration: 700 });
        else map.jumpTo(view);
    };

    // Reframe once the map exists, whenever the pick changes, and after every
    // resize, since the panels (and so the gap) change with the window.
    const framed = useRef(false);
    useEffect(() => {
        if (!map) return;
        frame(framed.current);
        framed.current = true;
        let timer;
        const onResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => frame(false), 200);
        };
        window.addEventListener("resize", onResize);
        return () => {
            window.removeEventListener("resize", onResize);
            clearTimeout(timer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, selectedBgy]);

    // Escape steps back out to all of Rosario.
    useEffect(() => {
        if (!selectedBgy) return;
        const onKey = (e) => e.key === "Escape" && !sidebarOpen && setSelectedBgy(null);
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [selectedBgy, sidebarOpen]);

    // Everything the panels show, for all of Rosario or for the picked barangay.
    const bgyNames = useMemo(() => Object.keys(bgyStats || {}).sort((a, b) => a.localeCompare(b)), [bgyStats]);
    const mixRank = useMemo(() => Object.entries(bgyStats || {}).sort((a, b) => b[1].diversity - a[1].diversity).map(([n]) => n), [bgyStats]);
    const stat = selectedBgy ? bgyStats?.[selectedBgy.name] : null;
    const view = stat
        ? { area: selectedBgy.name, ...stat, forecast: forecast && { ...forecast, quarters: stat.forecast } }
        : { area: "All of Rosario", statusCounts, quarterly, forecast, releaseTime, diversity: municipalDiversity, planDiversity: municipalPlanDiversity, zones: municipalZones };

    // Raw status strings grouped the same way the map and registry colour them.
    const pipeline = useMemo(() => {
        const keyByConfig = new Map(Object.entries(STATUS_MARKER_CONFIG).map(([k, v]) => [v, k]));
        const counts = {};
        Object.entries(view.statusCounts || {}).forEach(([status, n]) => {
            const key = keyByConfig.get(getStatusMarkerConfig(status));
            counts[key] = (counts[key] || 0) + Number(n || 0);
        });
        return Object.keys(STATUS_MARKER_CONFIG).map((key) => ({ key, ...STATUS_MARKER_CONFIG[key], count: counts[key] || 0 }));
    }, [view.statusCounts]);

    const total = pipeline.reduce((sum, s) => sum + s.count, 0);
    const reviewCount = pipeline.find((s) => s.key === "Technical Review")?.count || 0;
    const releasedCount = pipeline.find((s) => s.key === "Released")?.count || 0;
    const tier = view.diversity == null ? null : getDiversityTheme(view.diversity);
    const shares = zoneShares(view.zones);
    // Filing records spell barangays their own way; match them to zoning names ignoring case.
    const mapName = useMemo(() => new Map(Object.keys(bgyStats || {}).map((k) => [k.toLowerCase(), k])), [bgyStats]);
    const topMax = Math.max(1, ...topBarangays.map((r) => Number(r.count)));
    const pick = (name) => setSelectedBgy(name ? { name } : null);

    // Each role only gets the shortcuts it can open (drafts are Planning Officer-only, inspections Admin-only).
    // Shortcut badges stay municipal: they count the queues the pages open on.
    const actions = isAdmin
        ? [
              { href: "/applications", icon: "registry", label: "Registry" },
              { href: "/site-inspections", icon: "inspect", label: "Inspections", count: upcomingInspections },
              { href: "/diagnostics", icon: "support", label: "Support Desk" },
          ]
        : [
              { href: "/applications/encode", icon: "plus", label: "Encode" },
              { href: "/site-inspections", icon: "inspect", label: "Inspections", count: upcomingInspections },
              { href: "/applications/drafts", icon: "draft", label: "Drafts", count: draftCount },
          ];

    const attention = [
        { href: "/technical-review", label: "In technical review", count: reviewCount },
        { href: "/notifications", label: "Unread notifications", count: unreadCount, sub: unreadCount > 0 ? latestUnread : null },
        ...(inspections
            ? [
                  {
                      href: "/site-inspections",
                      label: "Inspections open",
                      count: inspections.open,
                      sub: `${num(inspections.synced)} synced${inspections.failed > 0 ? ` · ${num(inspections.failed)} failed to send` : ""}`,
                      subTone: inspections.failed > 0 ? "text-rose-600" : "",
                  },
              ]
            : []),
    ];

    return (
        <>
            <Head title="Overview | iMAPS" />

            <div id="overview-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={headerClock}
                    onLogout={confirmSignOut}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="overview"
                />

                <div className="flex-1 relative overflow-hidden flex flex-col min-w-0 min-h-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={confirmSignOut}
                        activePage="overview"
                    />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200" aria-hidden="true" />}

                    {/* Wide screens: one framed stage, Rosario in 3D filling it and every panel
                        floating over it, sized to fit without scrolling. Smaller screens: the map
                        is a block and the panels stack beneath it. */}
                    <main className="relative flex-1 min-h-0 overflow-y-auto xl:overflow-hidden p-3 sm:p-4 xl:p-2.5">
                        <div
                            ref={stageRef}
                            className="flex flex-col gap-3 xl:block xl:relative xl:h-full xl:rounded-xl xl:overflow-hidden xl:bg-white xl:border xl:border-slate-200 [--l:300px] [--r:288px] 2xl:[--l:332px] 2xl:[--r:316px]"
                        >
                            {/* ── Title over the map: the greeting, then the page's name ── */}
                            <div ref={titleRef} className="xl:absolute xl:z-10 xl:top-5 xl:left-[calc(var(--l)+30px)] xl:pointer-events-none">
                                <h1 className="grid text-xl sm:text-2xl leading-tight font-bold tracking-tight text-slate-900">
                                    <span
                                        aria-hidden="true"
                                        className={`[grid-area:1/1] whitespace-nowrap transition duration-700 ease-out motion-reduce:transition-none ${greetingShown ? "opacity-100" : "opacity-0 -translate-y-2 pointer-events-none"}`}
                                    >
                                        {greeting}, <span className="text-blue-600">{firstName}</span>
                                    </span>
                                    <span className={`[grid-area:1/1] whitespace-nowrap transition duration-700 ease-out motion-reduce:transition-none ${greetingShown ? "opacity-0 translate-y-2" : "opacity-100"}`}>
                                        Overview
                                    </span>
                                </h1>
                                <div className="mt-2 flex flex-wrap items-center gap-2 xl:pointer-events-auto">
                                    {/* The keyboard's way to the same pick a click on the map makes */}
                                    <label className={`${CHIP} relative !pr-2 focus-within:ring-2 focus-within:ring-blue-500/60`}>
                                        <Icon name="inspect" className="w-3.5 h-3.5 text-blue-600" strokeWidth={2} />
                                        <span className="sr-only">Area shown</span>
                                        <select
                                            value={selectedBgy?.name ?? ""}
                                            onChange={(e) => pick(e.target.value)}
                                            className="appearance-none bg-none bg-transparent border-0 p-0 pr-5 text-[11px] font-semibold text-slate-600 focus:ring-0 focus:outline-none cursor-pointer"
                                        >
                                            <option value="">All of Rosario</option>
                                            {bgyNames.map((n) => (
                                                <option key={n} value={n}>
                                                    {n}
                                                </option>
                                            ))}
                                        </select>
                                        <Icon name="chevronDown" className="absolute right-2.5 w-3 h-3 text-slate-400 pointer-events-none" strokeWidth={2.4} />
                                    </label>
                                    <span className={CHIP}>
                                        <Icon name="calendar" className="w-3.5 h-3.5 text-blue-600" strokeWidth={2} />
                                        {fmt(now, { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                                    </span>
                                    {!selectedBgy && <span className="hidden xl:inline text-xs text-slate-500">Click a barangay to focus on it</span>}
                                </div>
                            </div>

                            {/* ── The map ── */}
                            <div className="relative isolate shrink-0 h-[380px] rounded-xl overflow-hidden bg-white border border-slate-200 xl:absolute xl:inset-0 xl:h-auto xl:rounded-none xl:border-0">
                                <MapBoundary>
                                    <Suspense fallback={<MapSkeleton visible label="Loading Rosario…" tone="#f8fafc" />}>
                                        <Rosario3D
                                            stats={bgyStats}
                                            selected={selectedBgy?.name ?? null}
                                            onSelect={pick}
                                            onReady={(m, b) => {
                                                setMap(m);
                                                setBoundsOf(() => b);
                                            }}
                                        />
                                    </Suspense>
                                </MapBoundary>
                            </div>

                            {/* ── Left column: the registry and the area's zoning ── */}
                            <aside
                                ref={asideRef}
                                aria-label={`Summary, ${view.area}`}
                                className={`${PANEL} p-3 short:p-2.5 flex flex-col gap-2 short:gap-1.5 xl:absolute xl:z-10 xl:top-2.5 xl:bottom-2.5 xl:left-2.5 xl:w-[var(--l)] xl:overflow-hidden`}
                            >
                                <div className="px-1 pt-0.5 pb-2 short:pb-1.5 border-b border-slate-200">
                                    <div className="flex items-center justify-between gap-2">
                                        <h2 className="text-[13px] font-bold text-slate-900 truncate">Application overview</h2>
                                        <span className="shrink-0 inline-flex items-center h-[22px] px-2 rounded-lg bg-white border border-slate-200 shadow-2xs text-[10px] font-semibold text-slate-600">
                                            {stat ? view.area : userRole}
                                        </span>
                                    </div>
                                    <dl className="mt-2 short:mt-1.5">
                                        <dt className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500">Applications on file</dt>
                                        <dd className="mt-1 text-[32px] short:text-[26px] leading-none font-bold tracking-tight tabular-nums text-slate-900">{num(total)}</dd>
                                    </dl>
                                </div>

                                {/* Takes whatever height the column has left, so the bars grow on tall screens */}
                                <section aria-labelledby="pipeline-heading" className={`${CARD} p-3 short:p-2.5 flex-1 min-h-[150px] short:min-h-[96px] flex flex-col`}>
                                    <PanelHead id="pipeline-heading" title="Pipeline">
                                        <MoreLink href="/applications">Registry</MoreLink>
                                    </PanelHead>
                                    <div className="relative mt-2 flex-1 min-h-0 flex flex-col">
                                        <PipelineChart pipeline={pipeline} />
                                        {total === 0 && <p className="absolute inset-x-0 top-1/3 text-center text-[11.5px] text-slate-400">No applications on file in {view.area}</p>}
                                    </div>
                                </section>

                                <dl className="shrink-0 grid grid-cols-2 gap-2.5 short:gap-2">
                                    {[
                                        ["clock", "To release", view.releaseTime?.released ? days(view.releaseTime.median_days) : "—"],
                                        ["registry", "Released", num(releasedCount)],
                                    ].map(([icon, label, value]) => (
                                        <div key={label} className={`${CARD} px-3 py-2.5 short:py-1.5`}>
                                            <dt className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500">
                                                <span className="grid place-items-center w-5 h-5 rounded-md bg-blue-50 text-blue-600">
                                                    <Icon name={icon} className="w-3 h-3" strokeWidth={2.2} />
                                                </span>
                                                {label}
                                            </dt>
                                            <dd className="mt-1.5 short:mt-1 text-[18px] short:text-[15px] font-bold tracking-tight tabular-nums text-slate-900 whitespace-nowrap">{value}</dd>
                                        </div>
                                    ))}
                                </dl>

                                <section aria-labelledby="zoning-heading" className={`${CARD} shrink-0 p-3 short:p-2.5`}>
                                    <PanelHead id="zoning-heading" title="Zoning composition">
                                        <span className="text-[10.5px] font-medium text-slate-400 truncate">{stat ? view.area : "CLUP 2030"}</span>
                                    </PanelHead>
                                    <div className="mt-2 short:mt-1.5">{shares.length ? <ZoningDonut shares={shares} /> : <p className="text-[11.5px] text-slate-500">No CLUP zones mapped here.</p>}</div>
                                </section>
                            </aside>

                            {/* ── Bottom centre: the map's key and controls over the filings trend ── */}
                            <div
                                ref={bottomRef}
                                className="flex flex-col gap-2.5 xl:absolute xl:z-10 xl:bottom-2.5 xl:left-[calc(var(--l)+20px)] xl:right-[calc(var(--r)+20px)]"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div
                                    className={`${PANE} hidden sm:flex items-center gap-2.5 px-3 h-11`}
                                    role="img"
                                    aria-label="Map key: land-use mix, from specialized farming (light) to high mix (dark)"
                                >
                                    <span className="text-[11px] font-semibold text-slate-700">Land-use mix</span>
                                    <span className="text-[10.5px] text-slate-500">Low</span>
                                    <span className="flex h-2.5 rounded-full overflow-hidden ring-1 ring-slate-200">
                                        {[...DIVERSITY_TIERS].reverse().map((t) => (
                                            <span key={t.id} className="w-6 h-full" style={{ background: DIVERSITY_BLUES[t.id] }} />
                                        ))}
                                    </span>
                                    <span className="text-[10.5px] text-slate-500">High</span>
                                </div>
                                <div role="group" aria-label="Map controls" className={`${PANE} flex flex-wrap items-center gap-1.5 p-1.5 ml-auto`}>
                                    <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-semibold text-slate-700">
                                        <Icon name="inspect" className="w-3.5 h-3.5 text-blue-600" strokeWidth={2} />
                                        {stat ? `${view.area}, Rosario` : "Rosario, Batangas"}
                                    </span>
                                    <span className="h-5 w-px bg-slate-200" aria-hidden="true" />
                                    {[
                                        { icon: "minus", label: "Zoom out", run: () => map?.zoomOut() },
                                        { icon: "plus", label: "Zoom in", run: () => map?.zoomIn() },
                                        { icon: "fit", label: stat ? `Fit ${view.area} in view` : "Fit Rosario in view", run: () => frame(true) },
                                    ].map((b) => (
                                        <button
                                            key={b.icon}
                                            type="button"
                                            onClick={b.run}
                                            aria-label={b.label}
                                            title={b.label}
                                            className={`${BUTTON} ${FOCUS}`}
                                        >
                                            <Icon name={b.icon} className="w-4 h-4" strokeWidth={2} />
                                        </button>
                                    ))}
                                    <Link
                                        href="/maps"
                                        aria-label="Open in Maps"
                                        title="Open in Maps"
                                        className={`${BUTTON} ${FOCUS}`}
                                    >
                                        <Icon name="expand" className="w-4 h-4" strokeWidth={2} />
                                    </Link>
                                </div>
                                </div>

                                <FilingsChart area={view.area} quarterly={view.quarterly} forecast={view.forecast} />
                            </div>

                            {/* ── Right column: shortcuts on top; what needs you, where filings come from
                                and the area in focus at the bottom ── */}
                            <div ref={rightRef} className="flex flex-col gap-3 xl:gap-2.5 short:gap-2 xl:absolute xl:z-10 xl:top-2.5 xl:bottom-2.5 xl:right-2.5 xl:w-[var(--r)]">
                                <nav aria-label="Quick actions" className={`${PANE} shrink-0 p-3 short:p-2.5`}>
                                    <div className="px-0.5">
                                        <span className="text-[13px] font-bold text-slate-900">Quick actions</span>
                                    </div>
                                    <ul className="mt-2.5 short:mt-2 grid grid-cols-3 gap-2">
                                        {actions.map((a) => (
                                            <li key={a.href}>
                                                <Link
                                                    href={a.href}
                                                    className={`group relative h-[58px] short:h-[44px] flex flex-col items-center justify-center gap-1.5 short:gap-1 rounded-lg bg-white border border-slate-200 shadow-2xs text-[11px] font-semibold text-slate-700 transition-all hover:border-blue-300 hover:bg-blue-50/40 hover:text-blue-700 hover:shadow-sm ${FOCUS}`}
                                                >
                                                    <Icon name={a.icon} className="w-[18px] h-[18px] text-slate-700 group-hover:text-blue-600" strokeWidth={1.8} />
                                                    {a.label}
                                                    {a.count > 0 && (
                                                        <span className="absolute top-1.5 right-1.5 min-w-[18px] h-[18px] px-1 grid place-items-center rounded-full bg-blue-600 text-[9.5px] font-semibold text-white tabular-nums">
                                                            {a.count > 99 ? "99+" : a.count}
                                                        </span>
                                                    )}
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </nav>

                                <div className="flex flex-col gap-3 xl:gap-2.5 short:gap-2 xl:flex-1 xl:min-h-0">
                                    <section aria-labelledby="attention-heading" className={`${PANE} shrink-0 p-3 short:p-2.5`}>
                                        <PanelHead id="attention-heading" title="Needs attention">
                                            <span className="inline-flex items-center gap-1 h-[20px] rounded-full bg-blue-600 px-2 text-[10px] font-semibold text-white">
                                                <span className="w-1.5 h-1.5 rounded-full bg-white motion-safe:animate-pulse" aria-hidden="true" />
                                                Live
                                            </span>
                                        </PanelHead>
                                        <ul className="mt-1.5 flex flex-col divide-y divide-slate-100">
                                            {attention.map((a) => (
                                                <li key={a.label}>
                                                    <Link href={a.href} className={`group flex items-center gap-3 rounded-lg px-1.5 -mx-1.5 py-1.5 short:py-[3px] hover:bg-slate-50 transition-colors ${FOCUS}`}>
                                                        <span className="flex-1 min-w-0">
                                                            <span className="block text-[11.5px] text-slate-600 group-hover:text-slate-900 truncate">{a.label}</span>
                                                            {a.sub && <span className={`block text-[10px] truncate short:hidden ${a.subTone || "text-slate-400"}`}>{a.sub}</span>}
                                                        </span>
                                                        <span className="text-[15px] font-bold tracking-tight tabular-nums text-slate-900">{num(a.count)}</span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>

                                    {/* Fills the column between the attention list and In focus; its rows stay
                                        packed at the top. Rows that don't fit wrap into a second column the card
                                        clips, so a short screen shows fewer whole rows, never half of one. */}
                                    <section aria-labelledby="busiest-heading" className={`${PANE} shrink-0 p-3 short:p-2.5 flex flex-col xl:flex-1 xl:min-h-0 xl:overflow-hidden`}>
                                        <PanelHead id="busiest-heading" title="Busiest barangays">
                                            <span className="text-[10.5px] font-medium text-slate-400">{plural(quarterly.length, "quarter")}</span>
                                        </PanelHead>
                                        {topBarangays.length ? (
                                            <ol className="mt-1.5 flex flex-col xl:flex-1 xl:min-h-0 xl:flex-wrap xl:content-start xl:overflow-hidden">
                                                {topBarangays.map((r, i) => {
                                                    const name = mapName.get(String(r.name).toLowerCase());
                                                    const picked = Boolean(name) && selectedBgy?.name === name;
                                                    const row = (
                                                        <>
                                                            <span className="flex items-baseline justify-between gap-2">
                                                                <span className={`text-[11.5px] truncate ${i === 0 || picked ? "font-semibold text-slate-900" : "text-slate-600"}`}>{r.name}</span>
                                                                <span className="text-[11.5px] font-semibold tabular-nums text-slate-900">{num(r.count)}</span>
                                                            </span>
                                                            <span className="mt-1 block h-[5px] rounded-full bg-slate-100 overflow-hidden" aria-hidden="true">
                                                                <span
                                                                    className={`block h-full rounded-full ${i === 0 || picked ? "bg-blue-600" : "bg-blue-200"}`}
                                                                    style={{ width: `${(Number(r.count) / topMax) * 100}%` }}
                                                                />
                                                            </span>
                                                        </>
                                                    );
                                                    return (
                                                        <li key={r.name} className="w-full">
                                                            {name ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => pick(picked ? null : name)}
                                                                    aria-pressed={picked}
                                                                    title={picked ? "Back to all of Rosario" : `Focus on ${name}`}
                                                                    className={`block w-full text-left rounded-lg px-1.5 py-1 short:py-0.5 cursor-pointer transition-colors ${picked ? "bg-blue-50" : "hover:bg-slate-50"} ${FOCUS}`}
                                                                >
                                                                    {row}
                                                                </button>
                                                            ) : (
                                                                <div className="px-1.5 py-1 short:py-0.5">{row}</div>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ol>
                                        ) : (
                                            <p className="mt-1.5 text-[11.5px] text-slate-500">No recorded filings in these quarters.</p>
                                        )}
                                    </section>

                                    <section aria-labelledby="focus-heading" className={`${PANE} shrink-0 p-3 short:p-2.5`} aria-live="polite">
                                        <PanelHead id="focus-heading" title="In focus">
                                            <MoreLink href="/maps">Maps</MoreLink>
                                        </PanelHead>
                                        <div className="mt-2 short:mt-1.5 flex items-center gap-3">
                                            <div
                                                className="w-[64px] h-[64px] short:w-[56px] short:h-[56px] shrink-0 rounded-lg grid place-items-center transition-colors duration-500"
                                                style={{ background: tier ? DIVERSITY_BLUES[tier.id] : "#cbd5e1", color: tier?.onFill || "#fff" }}
                                            >
                                                <span className="text-[17px] font-bold tracking-tight tabular-nums">{view.diversity == null ? "—" : Number(view.diversity).toFixed(2)}</span>
                                            </div>
                                            <dl className="flex-1 min-w-0 flex flex-col gap-1 short:gap-0 text-[11px]">
                                                {[
                                                    ["Area", view.area],
                                                    ["Mix", tier ? tier.shortLabel : "No zoning data"],
                                                    // Recorded mix (last five years of filings) against the CLUP 2030 plan.
                                                    ["Plan mix", view.planDiversity == null ? "—" : `${Number(view.planDiversity).toFixed(2)} (${view.diversity - view.planDiversity >= 0 ? "+" : ""}${(view.diversity - view.planDiversity).toFixed(2)})`],
                                                    stat ? ["Mix rank", `#${mixRank.indexOf(selectedBgy.name) + 1} of ${mixRank.length}`] : ["Barangays", num(bgyNames.length)],
                                                    ["Applications", num(total)],
                                                    ["Mostly", shares[0] ? `${shares[0].label} ${pct(shares[0].share)}` : "—"],
                                                ].map(([label, value]) => (
                                                    <div key={label} className="flex justify-between gap-2">
                                                        <dt className="text-slate-500">{label}</dt>
                                                        <dd className="font-semibold text-slate-900 tabular-nums truncate">{value}</dd>
                                                    </div>
                                                ))}
                                            </dl>
                                        </div>
                                    </section>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
