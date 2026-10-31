import { useMemo } from "react";
import { STATUS_MARKER_CONFIG } from "@/Components/MapLayers/StatusPanel";
import { getLens, getScaleSegments, computeBandCounts } from "@/utils/diversityTheme";
import { ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { TILE_PROVIDERS, DEMAND_CLASSES, APP_LOAD_CLASSES, getTrendsDemandColor } from "./LeafletMap";

// Plain names for the Application Tracking map's colour classes.
const APP_LOAD_NAMES = { "11+": "Very High", "6–10": "High", "3–5": "Moderate", "1–2": "Low", "0": "None" };

export const MODULES = [
    { id: "status", key: "1", label: "Application Tracking", desc: "Zoning applications and processing status" },
    { id: "trends", key: "2", label: "LC Demand", desc: "Locational clearance demand by quarter" },
    { id: "diversity", key: "3", label: "Diversity Index", desc: "Land-use mix per barangay" },
];

// Values match zoning_application_types; the server filters on that table, so
// combined filings match too.
export const PERMIT_TYPES = [
    { value: "All", label: "All permit types" },
    { value: "Zoning Certificate", label: "Zoning Certificate" },
    { value: "Locational Clearance", label: "Locational Clearance" },
    { value: "Development Permit", label: "Development Permit" },
];

const FIELD = "w-full py-1.5 pl-3 pr-8 text-[12.5px] leading-5 text-slate-700 bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-[#0b2a5b] focus:ring-2 focus:ring-[#0b2a5b]/15";

const Swatch = ({ color, ring }) => (
    <span
        className="w-3.5 h-3 rounded-[2px] shrink-0 border border-black/15"
        style={{ backgroundColor: color, boxShadow: ring ? `0 0 0 1.5px #fff, 0 0 0 3px ${ring}` : undefined }}
        aria-hidden="true"
    />
);

const GroupTitle = ({ children }) => (
    <h3 className="px-4 pt-4 pb-1.5 text-[13px] font-bold text-[#0b2a5b]">{children}</h3>
);

// One legend row. When `onClick` is given it doubles as a filter, the way
// QGIS lets a categorised layer toggle its own classes.
function LegendRow({ swatch, label, count, active, onClick, highlighted = false }) {
    const body = (
        <>
            {swatch}
            <span className="flex-1 min-w-0 truncate">{label}</span>
            {count !== undefined && <span className={`tabular-nums ${highlighted ? "text-slate-600" : "text-slate-400"}`}>{count}</span>}
        </>
    );
    const cls = "w-full flex items-center gap-2 px-1.5 py-[2px] rounded-[3px] text-[11.5px] text-left transition-colors";
    if (!onClick) {
        return <div className={`${cls} ${highlighted ? "bg-slate-200/70 text-slate-900 font-semibold" : "text-slate-700"}`}>{body}</div>;
    }
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
    statusFilter,
    onStatusFilterChange,
    statusCounts = {},
    activeQuarter,
    demandByBgy = {},
    hoveredBgy = null,
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
    is3D = false,
    showSatellite3D = false,
    onToggleSatellite3D = () => {},
}) {
    const lens = getLens("mix");
    const segments = useMemo(() => [...getScaleSegments("mix")].reverse(), []);
    const bandCounts = useMemo(() => computeBandCounts("mix", bgyStats), [bgyStats]);

    // The demand class of the barangay under the cursor, lit up in the legend.
    const hoveredClass = hoveredBgy ? getTrendsDemandColor(demandByBgy[hoveredBgy.trim().toLowerCase()] || 0) : null;

    const toggleStatus = (id) => onStatusFilterChange(statusFilter === id ? "All" : id);
    const toggleBand = (id) => onSelectBand(diversityBandFilter === id ? "all" : id);

    return (
        <div className="h-full overflow-y-auto pb-4">
            <GroupTitle>Choose a Map View</GroupTitle>
            <div role="radiogroup" aria-label="Analysis layer">
                {MODULES.map((m) => {
                    const active = activeLayer === m.id;
                    return (
                        <div key={m.id} className={`mx-3 mb-1 rounded-lg ${active ? "bg-slate-50 ring-1 ring-slate-200" : ""}`}>
                            <label className={`group flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer ${active ? "" : "hover:bg-slate-50"}`} title={m.desc}>
                                {/* A blue radio circle; keys 1–3 still switch views. */}
                                <input
                                    type="radio"
                                    name="analysis-layer"
                                    checked={active}
                                    onChange={() => onSelectLayer(m.id)}
                                    className="peer sr-only"
                                />
                                <span
                                    className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[10.5px] font-bold tabular-nums transition-colors peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[#0b2a5b] ${
                                        active ? "bg-white ring-2 ring-blue-600" : "bg-white ring-1 ring-slate-300 group-hover:ring-blue-400"
                                    }`}
                                    title={`Shortcut: press ${m.key}`}
                                    aria-hidden="true"
                                >
                                    {active && <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />}
                                </span>
                                <span className={`flex-1 min-w-0 text-[12.5px] ${active ? "font-semibold text-[#0b2a5b]" : "text-slate-800"}`}>{m.label}</span>
                            </label>

                            {active && m.id === "status" && (
                                <div className="px-2.5 pb-3">
                                    <span className="block text-[10.5px] text-slate-500 mb-0.5">Applications per barangay</span>
                                    {APP_LOAD_CLASSES.map((c) => (
                                        <LegendRow
                                            key={c.label}
                                            swatch={<Swatch color={c.color} />}
                                            label={APP_LOAD_NAMES[c.label]}
                                            count={c.label}
                                        />
                                    ))}
                                </div>
                            )}

                            {active && m.id === "trends" && (
                                <div className="px-2.5 pb-3">
                                    <div>
                                        <span className="block text-[10.5px] text-slate-500 mb-0.5">
                                            LC per barangay · {activeQuarter?.label} {activeQuarter?.isForecast ? "(forecast)" : "(filed)"}
                                        </span>
                                        {DEMAND_CLASSES.map((c) => (
                                            <LegendRow
                                                key={c.label}
                                                swatch={<span className="w-3.5 h-3 rounded-[2px] shrink-0 border" style={{ backgroundColor: c.color, borderColor: c.stroke }} aria-hidden="true" />}
                                                label={c.label}
                                                count={c.range}
                                                highlighted={hoveredClass === c}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {active && m.id === "diversity" && (
                                <div className="px-2.5 pb-3 space-y-2">
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
            <div className="px-4 space-y-1">
                <label className="flex items-center gap-2 py-1 text-[12.5px] text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={showClup} onChange={(e) => onToggleClup(e.target.checked)} className="accent-[#0b2a5b]" />
                    CLUP 2030 zoning
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
            {/* Every layer sits on plain white in 2D and 3D, like the LC demand forecast; a basemap is opt-in. */}
            <div className="px-4 space-y-1.5">
                <label className="flex items-center gap-2 py-1 text-[12.5px] text-slate-800 cursor-pointer">
                    <input type="checkbox" checked={showSatellite3D} onChange={(e) => onToggleSatellite3D(e.target.checked)} className="accent-[#0b2a5b]" />
                    Show basemap
                </label>
                {showSatellite3D && !is3D && (
                    <>
                        <label htmlFor="basemap" className="sr-only">Basemap</label>
                        <select id="basemap" value={mapStyle} onChange={(e) => onMapStyle(e.target.value)} className={FIELD}>
                            {Object.entries(TILE_PROVIDERS).map(([key, p]) => (
                                <option key={key} value={key}>{p.label}</option>
                            ))}
                        </select>
                    </>
                )}
                {showSatellite3D && is3D && <p className="text-[11px] text-slate-500 leading-snug">3D shows the satellite imagery.</p>}
            </div>
        </div>
    );
}
