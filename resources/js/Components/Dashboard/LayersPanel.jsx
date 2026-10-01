import { useMemo } from "react";
import { STATUS_MARKER_CONFIG } from "@/Components/MapLayers/StatusPanel";
import { getLens, getScaleSegments, computeBandCounts } from "@/utils/diversityTheme";
import { ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { TILE_PROVIDERS, DEMAND_CLASSES, APP_LOAD_CLASSES } from "./LeafletMap";

export const MODULES = [
    { id: "status", key: "1", label: "Application Tracking", desc: "Zoning applications and processing status" },
    { id: "trends", key: "2", label: "LC Demand Forecast", desc: "Locational clearance demand by quarter" },
    { id: "diversity", key: "3", label: "Diversity Index", desc: "Land-use mix per barangay" },
];

// Values match what is stored on applications ("Zoning Certification", not
// "Certificate"); the server filters with LIKE, so combined filings match too.
export const PERMIT_TYPES = [
    { value: "All", label: "All permit types" },
    { value: "Zoning Certification", label: "Zoning Certification" },
    { value: "Locational Clearance", label: "Locational Clearance" },
    { value: "Development Permit", label: "Development Permit" },
];

const FIELD = "w-full py-1 pl-2 pr-7 text-[12px] leading-5 bg-white border border-slate-300 rounded-[3px] focus:outline-none focus:border-[#0b2a5b] focus:ring-1 focus:ring-[#0b2a5b]";

const Swatch = ({ color, ring }) => (
    <span
        className="w-3.5 h-3 rounded-[2px] shrink-0 border border-black/15"
        style={{ backgroundColor: color, boxShadow: ring ? `0 0 0 1.5px #fff, 0 0 0 3px ${ring}` : undefined }}
        aria-hidden="true"
    />
);

const GroupTitle = ({ children }) => (
    <h3 className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500">{children}</h3>
);

// One legend row. When `onClick` is given it doubles as a filter, the way
// QGIS lets a categorised layer toggle its own classes.
function LegendRow({ swatch, label, count, active, onClick }) {
    const body = (
        <>
            {swatch}
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {count !== undefined && <span className="tabular-nums text-slate-400">{count}</span>}
        </>
    );
    const cls = "w-full flex items-center gap-2 px-1.5 py-[2px] rounded-[3px] text-[11.5px] text-left";
    if (!onClick) return <div className={`${cls} text-slate-700`}>{body}</div>;
    return (
        <button
            type="button"
            aria-pressed={active}
            onClick={onClick}
            className={`${cls} cursor-pointer focus-visible:outline-2 focus-visible:outline-[#0b2a5b] ${
                active ? "bg-[#dce6f3] text-[#0b2a5b] font-semibold" : "text-slate-700 hover:bg-slate-200/60"
            }`}
        >
            {body}
        </button>
    );
}

export default function LayersPanel({
    activeLayer,
    onSelectLayer,
    appTypeFilter,
    onAppTypeChange,
    statusFilter,
    onStatusFilterChange,
    statusCounts = {},
    activeQuarter,
    diversityBandFilter,
    onSelectBand,
    bgyStats,
    parcelsVisible,
    showClup,
    onToggleClup,
    clupOpacity,
    onClupOpacity,
    showLabels,
    onToggleLabels,
    mapStyle,
    onMapStyle,
}) {
    const lens = getLens("mix");
    const segments = useMemo(() => [...getScaleSegments("mix")].reverse(), []);
    const bandCounts = useMemo(() => computeBandCounts("mix", bgyStats), [bgyStats]);

    const toggleStatus = (id) => onStatusFilterChange(statusFilter === id ? "All" : id);
    const toggleBand = (id) => onSelectBand(diversityBandFilter === id ? "all" : id);

    return (
        <div className="h-full overflow-y-auto pb-4">
            <GroupTitle>Analysis</GroupTitle>
            <div role="radiogroup" aria-label="Analysis layer">
                {MODULES.map((m) => {
                    const active = activeLayer === m.id;
                    return (
                        <div key={m.id} className={active ? "bg-white border-y border-slate-200" : ""}>
                            <label className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer ${active ? "" : "hover:bg-slate-200/50"}`} title={m.desc}>
                                <input
                                    type="radio"
                                    name="analysis-layer"
                                    checked={active}
                                    onChange={() => onSelectLayer(m.id)}
                                    className="accent-[#0b2a5b]"
                                />
                                <span className={`flex-1 min-w-0 text-[12.5px] ${active ? "font-semibold text-[#0b2a5b]" : "text-slate-800"}`}>{m.label}</span>
                                <kbd className="text-[10px] text-slate-400 border border-slate-300 rounded-[3px] px-1 leading-4 bg-white">{m.key}</kbd>
                            </label>

                            {active && m.id === "status" && (
                                <div className="pl-8 pr-3 pb-2.5 space-y-2">
                                    <div>
                                        <label htmlFor="permit-type" className="sr-only">Permit type</label>
                                        <select
                                            id="permit-type"
                                            value={appTypeFilter}
                                            onChange={(e) => onAppTypeChange(e.target.value)}
                                            className={FIELD}
                                        >
                                            {PERMIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <span className="block text-[10.5px] text-slate-500 mb-0.5">Applications per barangay</span>
                                        <div className="flex">
                                            {[...APP_LOAD_CLASSES].reverse().map((c) => (
                                                <div key={c.label} className="flex-1 text-center">
                                                    <div className="h-2.5 border-y border-black/10" style={{ backgroundColor: c.color }} />
                                                    <span className="text-[9.5px] tabular-nums text-slate-500">{c.label}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline justify-between text-[10.5px] text-slate-500 mb-0.5">
                                            <span title="Markers appear when you zoom in or select a barangay; close in they become the lot outline">Application markers</span>
                                            {statusFilter !== "All" && (
                                                <button type="button" onClick={() => onStatusFilterChange("All")} className="text-[#0b2a5b] hover:underline cursor-pointer">All</button>
                                            )}
                                        </div>
                                        {Object.entries(STATUS_MARKER_CONFIG).map(([id, cfg]) => (
                                            <LegendRow
                                                key={id}
                                                swatch={<span className="w-2.5 h-2.5 rounded-[1px] shrink-0 shadow-[0_0_0_1px_#fff,0_0_0_2px_rgba(15,23,42,.45)]" style={{ backgroundColor: cfg.color }} />}
                                                label={cfg.label}
                                                count={statusCounts[id] || 0}
                                                active={statusFilter === id}
                                                onClick={() => toggleStatus(id)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {active && m.id === "trends" && (
                                <div className="pl-8 pr-3 pb-3">
                                    <span className="block text-[10.5px] text-slate-500 mb-0.5">
                                        LC per barangay · {activeQuarter?.label} {activeQuarter?.isForecast ? "(forecast)" : "(filed)"}
                                    </span>
                                    {DEMAND_CLASSES.map((c) => (
                                        <LegendRow key={c.label} swatch={<span className="w-3.5 h-3 rounded-[2px] shrink-0 border" style={{ backgroundColor: c.color, borderColor: c.stroke }} aria-hidden="true" />} label={c.label} count={c.range} />
                                    ))}
                                </div>
                            )}

                            {active && m.id === "diversity" && (
                                <div className="pl-8 pr-3 pb-3 space-y-2">
                                    <div>
                                        <div className="flex items-baseline justify-between text-[10.5px] text-slate-500 mb-0.5">
                                            <span>{lens.metricLabel}</span>
                                            {diversityBandFilter !== "all" && (
                                                <button type="button" onClick={() => onSelectBand("all")} className="text-[#0b2a5b] hover:underline cursor-pointer">Show all</button>
                                            )}
                                        </div>
                                        {segments.map((b) => (
                                            <LegendRow
                                                key={b.id}
                                                swatch={<Swatch color={b.fill} />}
                                                label={b.label}
                                                count={bandCounts[b.id] ?? 0}
                                                active={diversityBandFilter === b.id}
                                                onClick={() => toggleBand(b.id)}
                                            />
                                        ))}
                                    </div>
                                    {parcelsVisible && (
                                        <div>
                                            <span className="block text-[10.5px] text-slate-500 mb-0.5">CLUP zones in selected barangay</span>
                                            {ZONE_CATEGORY_LEGEND.map((z) => (
                                                <LegendRow key={z.id} swatch={<Swatch color={z.fill} />} label={z.label} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <GroupTitle>Overlays</GroupTitle>
            <div className="px-3 space-y-1">
                <label className="flex items-center gap-2 py-1 text-[12.5px] text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={showClup} onChange={(e) => onToggleClup(e.target.checked)} className="accent-[#0b2a5b]" />
                    CLUP 2030 zoning
                    <kbd className="ml-auto text-[10px] text-slate-400 border border-slate-300 rounded-[3px] px-1 leading-4 bg-white">4</kbd>
                </label>
                {showClup && (
                    <div className="pl-6 pb-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                            <label htmlFor="clup-opacity" className="text-[10.5px] text-slate-500 shrink-0">Opacity</label>
                            <input
                                id="clup-opacity"
                                type="range"
                                min="0.1"
                                max="1"
                                step="0.05"
                                value={clupOpacity}
                                onChange={(e) => onClupOpacity(parseFloat(e.target.value))}
                                className="flex-1 accent-[#0b2a5b]"
                            />
                            <span className="text-[10.5px] tabular-nums text-slate-600 w-8 text-right">{Math.round(clupOpacity * 100)}%</span>
                        </div>
                        {ZONE_CATEGORY_LEGEND.map((z) => (
                            <LegendRow key={z.id} swatch={<Swatch color={z.fill} />} label={z.label} />
                        ))}
                    </div>
                )}
                <label className="flex items-center gap-2 py-1 text-[12.5px] text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={showLabels} onChange={(e) => onToggleLabels(e.target.checked)} className="accent-[#0b2a5b]" />
                    Barangay labels
                </label>
            </div>

            <GroupTitle>Basemap</GroupTitle>
            <div className="px-3">
                <label htmlFor="basemap" className="sr-only">Basemap</label>
                <select
                    id="basemap"
                    value={mapStyle}
                    onChange={(e) => onMapStyle(e.target.value)}
                    className={FIELD}
                >
                    {Object.entries(TILE_PROVIDERS).map(([key, p]) => (
                        <option key={key} value={key}>{p.label}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}
