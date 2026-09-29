// resources/js/Components/MapKit.jsx
// QGIS-style map building blocks shared by the encoder's GIS step and the application record map.
import React, { useState, useEffect } from "react";
import { Polyline, Polygon, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { MAP_MAX_ZOOM, formatDistance, formatArea, geodesicArea, areaCheck, formatAreaDiff } from "@/utils/mapGeometry";

// Friendly field names shown first in Identify Results (QGIS field aliases); raw fields stay under "All fields"
export const PARCEL_FIELD_ALIASES = [
    ["property_index_number", "PIN"],
    ["owner_name", "Owner"],
    ["barangay", "Barangay"],
    ["lot_number", "Lot no."],
    ["survey_number", "Survey no."],
    ["lot_area_sqm", "Area (m²)"],
    ["land_use_class", "Assessor class"],
    ["arp_number", "ARP no."],
    ["tax_dec_number", "TD no."],
    ["tct_number", "TCT no."],
    ["location_address", "Address"],
];

export const SCALE_PRESETS = [500, 1000, 2500, 5000, 10000, 25000, 50000];

// Administrative boundary: one thin unfilled line. smoothFactor simplifies in screen pixels,
// so borders are coarser when zoomed out and exact when zoomed in, without breaking shared edges.
export const BARANGAY_LINE = { color: "#334155", weight: 1.2, opacity: 0.75, fill: false, lineJoin: "round", smoothFactor: 2 };

// Lots are only drawn from this zoom (~1:9,000); below it they're sub-pixel dots
export const PARCEL_MIN_ZOOM = 16;

// Vector zone boundaries (exact, per barangay) from ~1:18,000; zone codes labelled from ~1:9,000
export const ZONE_LINE_MIN_ZOOM = 15;
export const ZONE_LABEL_MIN_ZOOM = 16;
export const UNLABELLED_ZONES = new Set(["ROAD", "PROPOSED ROAD"]);
export const NO_LABELS = []; // stable identity so hidden label sets don't re-trigger label layout

export const CHECK_COLORS = {
    unverified: "#94a3b8",
    verified: "#16a34a",
    consistent: "#16a34a",
    mismatch: "#d97706",
    amendment: "#2563eb",
};

// Scale-dependent labelling, like QGIS "Show label only between scales"
export const PARCEL_LABEL_MIN_ZOOM = 18;
export const BARANGAY_LABEL_ZOOM = [12, 16];
export const MAX_LABELS = 300;

// Map tip content built as DOM nodes (textContent), never HTML strings from the database
export function buildMapTip(props) {
    const root = document.createElement("div");
    const rows = [
        ["PIN", props.property_index_number],
        ["Lot", props.lot_number || props.lot_no],
        ["Area", props.lot_area_sqm != null && props.lot_area_sqm !== "" ? `${Number(props.lot_area_sqm).toLocaleString()} m²` : null],
        ["Barangay", props.barangay],
    ];
    rows.forEach(([k, v]) => {
        if (v == null || v === "") return;
        const row = document.createElement("div");
        const key = document.createElement("span");
        key.textContent = `${k} `;
        key.style.color = "#94a3b8";
        const val = document.createElement("span");
        val.textContent = String(v);
        val.style.fontWeight = "600";
        if (k === "PIN") val.style.fontFamily = "ui-monospace, monospace";
        row.append(key, val);
        root.append(row);
    });
    return root;
}

export function ScaleBar() {
    const map = useMap();
    useEffect(() => {
        const control = L.control.scale({ position: "bottomright", imperial: false, maxWidth: 120 }).addTo(map);
        return () => control.remove();
    }, [map]);
    return null;
}

// Collision-aware labels drawn over the map (QGIS-style halo text). Recomputed per animation frame while panning.
export function MapLabels({ map, badges = NO_LABELS, zoneLabels = NO_LABELS, parcelLabels, brgyLabels, selectedPin, showParcels, showBarangays }) {
    const [labels, setLabels] = useState([]);

    useEffect(() => {
        if (!map) return;
        let frame = 0;

        const compute = () => {
            frame = 0;
            const zoom = map.getZoom();
            const size = map.getSize();
            const placed = [];
            const out = [];

            const place = (item, kind) => {
                if (out.length >= MAX_LABELS) return;
                const anchor = map.latLngToContainerPoint(item.latlng);
                // Badges float above their lot so the lot's own PIN label can still show beneath
                const pt = kind === "badge" ? { x: anchor.x, y: anchor.y - 22 } : anchor;
                const w = item.text.length * (kind === "brgy" ? 7 : 6) + (kind === "badge" ? 24 : 10);
                const h = kind === "badge" ? 20 : 16;
                const box = [pt.x - w / 2, pt.y - h / 2, pt.x + w / 2, pt.y + h / 2];
                if (box[2] < 0 || box[3] < 0 || box[0] > size.x || box[1] > size.y) return;
                if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return;
                placed.push(box);
                out.push({ key: `${kind}-${item.key}`, kind, text: item.text, color: item.color, x: pt.x, y: pt.y, selected: kind === "parcel" && item.key === selectedPin });
            };

            badges.forEach((b) => place(b, "badge"));

            if (showParcels && zoom >= PARCEL_LABEL_MIN_ZOOM) {
                const selected = selectedPin && parcelLabels.find((l) => l.key === selectedPin);
                if (selected) place(selected, "parcel");
                parcelLabels.forEach((l) => l !== selected && place(l, "parcel"));
            }
            // Zone codes after lot PINs: a PIN matters more than the zone name, which the colour already shows
            if (zoom >= ZONE_LABEL_MIN_ZOOM) zoneLabels.forEach((l) => place(l, "zone"));
            if (showBarangays && zoom >= BARANGAY_LABEL_ZOOM[0] && zoom <= BARANGAY_LABEL_ZOOM[1]) {
                brgyLabels.forEach((l) => place(l, "brgy"));
            }
            setLabels(out);
        };

        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(compute);
        };
        const hide = () => setLabels([]);

        compute();
        map.on("move resize", schedule);
        map.on("zoomstart", hide);
        map.on("zoomend", schedule);
        return () => {
            cancelAnimationFrame(frame);
            map.off("move resize", schedule);
            map.off("zoomstart", hide);
            map.off("zoomend", schedule);
        };
    }, [map, badges, zoneLabels, parcelLabels, brgyLabels, selectedPin, showParcels, showBarangays]);

    return (
        <div className="absolute inset-0 z-[5] pointer-events-none overflow-hidden" aria-hidden="true">
            {labels.map((l) =>
                l.kind === "badge" ? (
                    <span
                        key={l.key}
                        style={{ left: l.x, top: l.y }}
                        className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white border border-slate-300 shadow text-[10px] font-semibold text-slate-800"
                    >
                        <span className="w-2 h-2 rounded-full" style={{ background: l.color }} />
                        {l.text}
                    </span>
                ) : (
                <span
                    key={l.key}
                    style={{ left: l.x, top: l.y }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap leading-none ${
                        l.kind === "brgy"
                            ? "text-[11px] font-bold uppercase tracking-wider text-slate-900 [text-shadow:0_0_2px_#fff,0_0_2px_#fff,0_0_3px_#fff]"
                            : l.kind === "zone"
                            ? "text-[10px] font-bold italic text-slate-800 [text-shadow:0_0_2px_#fff,0_0_2px_#fff,0_0_3px_#fff]"
                            : l.selected
                                ? "px-1 py-0.5 rounded-sm bg-yellow-300 text-[10px] font-mono font-bold text-slate-900 shadow"
                                : "text-[10px] font-mono font-semibold text-slate-900 [text-shadow:0_0_2px_#fff,0_0_2px_#fff,0_0_2px_#fff]"
                    }`}
                >
                    {l.text}
                </span>
                )
            )}
        </div>
    );
}

// Mirrors the progression-lock comparison: Assessor classification vs spatial CLUP zone.
export function getZoningCheck(parcel, isAmendmentStream) {
    if (!parcel.is_verified) return { key: "unverified", label: "Not verified", dot: "bg-slate-300" };
    const cadastral = parcel.cadastral_zone?.trim().toLowerCase();
    const clup = parcel.land_use_class?.trim().toLowerCase();
    if (!cadastral || !clup) return { key: "verified", label: "Verified", dot: "bg-emerald-500" };
    if (cadastral === clup) return { key: "consistent", label: "Consistent", dot: "bg-emerald-500" };
    if (isAmendmentStream) return { key: "amendment", label: "Amendment track", dot: "bg-blue-500" };
    const isAgri = cadastral.includes("agri") || cadastral.includes("agind");
    return {
        key: "mismatch",
        label: "Mismatch",
        dot: "bg-amber-500",
        action: isAgri
            ? { label: "Switch to Reclassification", type: "Petition for Reclassification" }
            : { label: "Switch to Rezoning", type: "Petition for Rezoning" },
    };
}

// Approximate map scale (1:n) at 96 dpi: web-mercator metres per pixel × pixels per metre
export const scaleAtZoom0 = (lat) => 156543.03392 * Math.cos((lat * Math.PI) / 180) * 3779.5;
export function getScale(map) {
    return Math.round(scaleAtZoom0(map.getCenter().lat) / Math.pow(2, map.getZoom()));
}
export function zoomForScale(map, scale) {
    return Math.min(MAP_MAX_ZOOM, Math.max(map.getMinZoom(), Math.round(Math.log2(scaleAtZoom0(map.getCenter().lat) / scale))));
}

// QGIS-style "Measure Line" / "Measure Area": click to add vertices, right-click or Esc to clear
export function MeasureLayer({ active, mode = "line", onMeasure }) {
    const [points, setPoints] = useState([]);
    const map = useMapEvents({
        click(e) {
            if (active) setPoints((p) => [...p, e.latlng]);
        },
        contextmenu() {
            if (active) setPoints([]);
        },
    });

    useEffect(() => {
        if (!active) {
            setPoints([]);
            return;
        }
        map.doubleClickZoom.disable();
        const onKey = (e) => e.key === "Escape" && setPoints([]);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("keydown", onKey);
            map.doubleClickZoom.enable();
        };
    }, [active, map]);

    const isArea = mode === "area";
    let total = 0;
    for (let i = 1; i < points.length; i++) total += map.distance(points[i - 1], points[i]);
    const closing = isArea && points.length > 2 ? map.distance(points[points.length - 1], points[0]) : 0;
    const area = isArea ? geodesicArea(points) : 0;

    useEffect(() => {
        const last = points.length > 1 ? map.distance(points[points.length - 2], points[points.length - 1]) : 0;
        onMeasure(points.length ? { mode, total: total + closing, last, area, count: points.length } : null);
    }, [points, map, onMeasure]);

    if (!points.length) return null;
    const style = { color: "#dc2626", weight: 2, dashArray: "6 4" };
    const label = isArea ? (points.length > 2 ? formatArea(area) : null) : points.length > 1 ? formatDistance(total) : null;
    return (
        <>
            {isArea && points.length > 2 ? (
                <Polygon positions={points} pathOptions={{ ...style, fillColor: "#dc2626", fillOpacity: 0.12 }} interactive={false} />
            ) : (
                <Polyline positions={points} pathOptions={style} interactive={false} />
            )}
            {points.map((p, i) => (
                <CircleMarker key={i} center={p} radius={3.5} pathOptions={{ color: "#dc2626", weight: 2, fillColor: "#ffffff", fillOpacity: 1 }} interactive={false}>
                    {i === points.length - 1 && label && (
                        <Tooltip permanent direction="right" offset={[8, 0]}>
                            <span className="font-mono text-[11px] font-semibold">{label}</span>
                        </Tooltip>
                    )}
                </CircleMarker>
            ))}
        </>
    );
}

// Map click in Identify mode. A parcel click fires first (see onEachFeature) and leaves its feature in hitRef.
export function IdentifyClick({ active, hitRef, onIdentify }) {
    useMapEvents({
        click(e) {
            const feature = hitRef.current;
            hitRef.current = null;
            if (active) onIdentify(e.latlng, feature);
        },
    });
    return null;
}

export function MapResizeTrigger({ watch }) {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        const timers = [50, 200, 400].map((ms) => setTimeout(() => map.invalidateSize(), ms));
        return () => timers.forEach(clearTimeout);
    }, [watch, map]);
    return null;
}

// Own state so mouse moves don't re-render the whole step
export function MapStatusBar({ map, message }) {
    const [coord, setCoord] = useState(null);
    const [view, setView] = useState(null);

    useEffect(() => {
        if (!map) return;
        let frame = 0;
        let pending = null;
        // At most one coordinate update per animation frame
        const onMove = (e) => {
            pending = e.latlng;
            if (!frame) frame = requestAnimationFrame(() => {
                frame = 0;
                setCoord(pending);
            });
        };
        const onOut = () => setCoord(null);
        const onView = () => setView({ zoom: map.getZoom(), scale: getScale(map) });
        onView();
        map.on("mousemove", onMove);
        map.on("mouseout", onOut);
        map.on("zoomend moveend", onView);
        return () => {
            cancelAnimationFrame(frame);
            map.off("mousemove", onMove);
            map.off("mouseout", onOut);
            map.off("zoomend moveend", onView);
        };
    }, [map]);

    return (
        <div className="absolute bottom-0 left-0 right-0 z-20 h-7 px-2 bg-slate-50 border-t border-slate-300 flex items-center gap-3 text-[11px] text-slate-600 select-none">
            <span className="min-w-0 truncate flex-1" aria-live="polite">{message}</span>
            <span className="hidden sm:flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400">Coordinate</span>
                <span className="font-mono w-[136px]">{coord ? `${coord.lat.toFixed(5)}, ${coord.lng.toFixed(5)}` : "—"}</span>
            </span>
            <span className="h-4 w-px bg-slate-300 shrink-0" />
            <label className="flex items-center gap-1.5 shrink-0">
                <span className="text-slate-400">Scale</span>
                <select
                    value=""
                    onChange={(e) => e.target.value && map?.setZoom(zoomForScale(map, Number(e.target.value)))}
                    disabled={!map}
                    className="h-5 pl-1 pr-5 py-0 border border-slate-300 rounded bg-white font-mono text-[11px] text-slate-700 cursor-pointer focus:outline-none focus:border-blue-500"
                >
                    <option value="">{view ? `1:${view.scale.toLocaleString()}` : "—"}</option>
                    {SCALE_PRESETS.map((s) => (
                        <option key={s} value={s}>1:{s.toLocaleString()}</option>
                    ))}
                </select>
            </label>
            <span className="h-4 w-px bg-slate-300 shrink-0 hidden md:block" />
            <span className="font-mono shrink-0 hidden md:block">EPSG:4326</span>
            <span className="text-slate-400 shrink-0 hidden lg:block">© Google</span>
        </div>
    );
}

export function ToolButton({ label, active = false, disabled = false, onClick, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            aria-pressed={active}
            title={label}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed ${
                active ? "bg-slate-200 text-slate-900 ring-1 ring-inset ring-slate-300" : "text-slate-600 hover:bg-slate-200/70"
            }`}
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                {children}
            </svg>
        </button>
    );
}

export function LayerRow({ checked, onChange, swatch, children }) {
    return (
        <label className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer">
            <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-3.5 h-3.5 accent-slate-700 cursor-pointer" />
            <span className={`w-3 h-3 border shrink-0 ${swatch}`} aria-hidden="true" />
            <span className="text-[11px] text-slate-700 truncate">{children}</span>
        </label>
    );
}

// Tax Declaration area vs the area of the lot's mapped shape; a large gap usually means a subdivided lot,
// an outdated record, or the wrong lot
export function AreaComparison({ declared, feature }) {
    const declaredNum = Number(declared);
    const check = areaCheck(declared, feature);
    if (!check) {
        return declaredNum > 0 ? `${declaredNum.toLocaleString()} m² (declared)` : null;
    }
    const fmt = (v) => `${Math.round(v).toLocaleString()} m²`;
    return (
        <span>
            {fmt(check.declared)} declared · {fmt(check.mapped)} mapped
            <span className={`block text-[11px] font-normal ${check.flagged ? "text-amber-700" : "text-slate-400"}`}>
                {check.flagged
                    ? `Differs by ${formatAreaDiff(check.diff)}: confirm the lot and the Tax Declaration`
                    : `Within ±5% (${formatAreaDiff(check.diff)})`}
            </span>
        </span>
    );
}

export function Attr({ label, children, mono = false }) {
    return (
        <div className="grid grid-cols-[108px_1fr] gap-2 py-1.5 border-b border-slate-100 last:border-b-0">
            <dt className="text-slate-400">{label}</dt>
            <dd className={`text-slate-800 font-medium break-words ${mono ? "font-mono text-[11px]" : ""}`}>{children || "—"}</dd>
        </div>
    );
}
