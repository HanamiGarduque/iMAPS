// resources/js/Pages/Applications/Components/ApplicationMap.jsx
// View-only map of an application's lots. Editing and drafting tools live in
// the encoder's GIS step; here the map only frames the lots and lets the
// officer pick one.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Marker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { resolveBarangayName } from "@/utils/mapData";
import { MAP_MAX_ZOOM, LOT_FOCUS_ZOOM, BASEMAPS, CLUP_TILES, BLANK_TILE, featureArea, insidePoint } from "@/utils/mapGeometry";
import { ScaleBar } from "@/Components/MapKit";
import MapSkeleton from "@/Components/Dashboard/MapSkeleton";

const LOT_LINE = "#f97316"; // survey-plan orange for the lot in focus

// Outer rings of a (Multi)Polygon as [{lat, lng}] without the closing duplicate point
const outerRings = (geometry) => {
    const polys = geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];
    return polys.map((rings) => {
        const ring = (rings[0] || []).map(([lng, lat]) => ({ lat, lng }));
        const [first, last] = [ring[0], ring[ring.length - 1]];
        return first && last && first.lat === last.lat && first.lng === last.lng ? ring.slice(0, -1) : ring;
    });
};

// Text-only map label; any rotation is part of its own style, so it survives re-renders
const textIcon = (html, className, rotate = 0) =>
    L.divIcon({
        className: "",
        html: `<span class="${className}"${rotate ? ` style="transform:translate(-50%,-50%) rotate(${rotate.toFixed(1)}deg)"` : ""}>${html}</span>`,
        iconSize: [0, 0],
    });

// Side lengths drawn along each edge, kept upright, like a lot plan
function LotPlan({ lot, showSides }) {
    const rings = useMemo(() => outerRings(lot.feature.geometry), [lot.feature]);
    const area = useMemo(() => featureArea(lot.feature), [lot.feature]);
    const center = useMemo(() => insidePoint(lot.feature), [lot.feature]);
    const top = rings.flat().reduce((best, p) => (!best || p.lat > best.lat ? p : best), null);

    const sides = showSides
        ? rings.flatMap((ring) =>
              ring.map((a, i) => {
                  const b = ring[(i + 1) % ring.length];
                  const meters = L.latLng(a).distanceTo(L.latLng(b));
                  // On-screen angle of the edge; flipped so the text never reads upside down
                  let angle = (Math.atan2(b.lat - a.lat, (b.lng - a.lng) * Math.cos((a.lat * Math.PI) / 180)) * 180) / Math.PI;
                  if (angle > 90) angle -= 180;
                  if (angle < -90) angle += 180;
                  return { key: `${a.lat},${a.lng}`, at: { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 }, meters, angle };
              })
          ).filter((side) => side.meters >= 2)
        : [];

    return (
        <>
            {rings.flat().map((p, i) => (
                <CircleMarker key={`v${i}`} center={p} radius={3.5} interactive={false} pathOptions={{ color: "#7c2d12", weight: 1.5, fillColor: "#ffffff", fillOpacity: 1 }} />
            ))}
            {sides.map((side) => (
                <Marker
                    key={side.key}
                    position={side.at}
                    interactive={false}
                    // the label runs along its edge
                    icon={textIcon(`${side.meters.toFixed(1)} m`, "lot-side", -side.angle)}
                />
            ))}
            {center && area > 0 && (
                <Marker position={center} interactive={false} icon={textIcon(`${Math.round(area).toLocaleString()} m²`, "lot-area")} />
            )}
            {top && <Marker position={top} interactive={false} icon={textIcon(lot.code, "lot-code")} />}
        </>
    );
}

function Control({ label, onClick, disabled, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600"
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                {children}
            </svg>
        </button>
    );
}

/**
 * lots: [{ index, code, pin, feature, check: { key, label }, color }]
 */
/**
 * ── LOOP 7 CONFIRMED-COORDINATE CONTRACT (restored by the master merge) ──
 *
 * Application Detail may focus the map on the GPS position an inspector
 * actually CONFIRMED in the field. That position is the only coordinate source
 * trusted for this purpose, and it is validated before Leaflet ever sees it.
 *
 * These helpers are intentionally strict. An unvalidated coordinate must never
 * reach the map layer: `null`, `undefined`, an empty string, `NaN`, any
 * non-finite number, and any value outside its valid range all collapse to
 * `null`, and a point is produced only when BOTH coordinates are individually
 * valid. A half-valid pair is no point at all.
 */
const toValidCoordinate = (value, min, max) => {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= min && number <= max ? number : null;
};

const toInspectionPoint = (inspection) => {
    const latitude = toValidCoordinate(inspection?.confirmed_latitude, -90, 90);
    const longitude = toValidCoordinate(inspection?.confirmed_longitude, -180, 180);
    return latitude !== null && longitude !== null ? [latitude, longitude] : null;
};

export default function ApplicationMap({ lots, parcelMapData, brgyMapData, barangay, selectedIndex, inspectionPoint, onSelectLot, onPrint }) {
    const [map, setMap] = useState(null);
    const [basemap, setBasemap] = useState("satellite");
    const [showClup, setShowClup] = useState(false);

    const mappedLots = lots.filter((l) => l.feature);
    const lotsKey = mappedLots.map((l) => `${l.pin}:${l.check.key}`).join("|");
    const lotsCollection = useMemo(
        () => ({ type: "FeatureCollection", features: mappedLots.map((l) => ({ ...l.feature, properties: { ...l.feature.properties, __index: l.index } })) }),
        [lotsKey]
    );

    // Only the application's own barangay is outlined, for context.
    const barangayOutline = useMemo(() => {
        if (!brgyMapData?.features || !barangay) return null;
        const target = barangay.trim().toLowerCase();
        const features = brgyMapData.features.filter((f) => (resolveBarangayName(f.properties) || "").trim().toLowerCase() === target);
        return features.length ? { type: "FeatureCollection", features } : null;
    }, [brgyMapData, barangay]);

    // Later moves glide quickly; the first framing on page load is instant (no fly-in from the whole town)
    const fitTo = useCallback(
        (data, maxZoom = 18, animate = true) => {
            if (!map || !data) return;
            const bounds = L.geoJSON(data).getBounds();
            if (!bounds.isValid()) return;
            if (animate) map.flyToBounds(bounds, { padding: [48, 48], maxZoom, duration: 0.35, easeLinearity: 0.5 });
            else map.fitBounds(bounds, { padding: [48, 48], maxZoom, animate: false });
        },
        [map]
    );

    const framedLots = useRef(false);
    useEffect(() => {
        if (!map) return;
        if (mappedLots.length > 0 && !framedLots.current) {
            framedLots.current = true;
            const targetLot = lots.find((l) => l.index === selectedIndex && l.feature) || mappedLots[0];
            if (targetLot?.feature) {
                fitTo(targetLot.feature, LOT_FOCUS_ZOOM, false);
            } else if (lotsCollection) {
                fitTo(lotsCollection, LOT_FOCUS_ZOOM, false);
            }
        } else if (!framedLots.current && barangayOutline && mappedLots.length === 0) {
            fitTo(barangayOutline, 15, false);
        }
    }, [map, mappedLots, lotsCollection, barangayOutline, selectedIndex, fitTo, lots]);

    // Picking a lot in the panel frames it.
    const lastSelected = useRef(null);
    useEffect(() => {
        if (!map || selectedIndex === lastSelected.current) return;
        lastSelected.current = selectedIndex;
        if (selectedIndex !== null && selectedIndex !== undefined) {
            const lot = lots.find((l) => l.index === selectedIndex);
            if (lot?.feature) fitTo(lot.feature, LOT_FOCUS_ZOOM);
        } else if (lotsCollection) {
            fitTo(lotsCollection, LOT_FOCUS_ZOOM);
        }
    }, [selectedIndex, map, fitTo, lots, lotsCollection]);

    // ── LOOP 7: focus the CONFIRMED inspection point, at LOWEST priority ────
    //
    // Master's parcel/lot framing above always wins: if a lot has been picked,
    // the map is already framed on it and must not be dragged away. Only when
    // no lot is selected AND a validated confirmed point exists does the map
    // fly to the inspected site. Otherwise the initial framing above stands.
    //
    // `inspectionPoint` is already validated by `toInspectionPoint` in the
    // parent, so nothing unchecked reaches Leaflet here.
    const focusedInspection = useRef(false);
    useEffect(() => {
        if (!map || !inspectionPoint) return;
        if (selectedIndex !== null && selectedIndex !== undefined && lots.some((l) => l.index === selectedIndex)) return;
        if (focusedInspection.current) return;
        focusedInspection.current = true;
        map.flyTo(inspectionPoint, 18, { duration: 0.6 });
    }, [map, inspectionPoint, selectedIndex, lots]);

    const lotStyle = (f) => {
        const lot = lots.find((l) => l.index === f.properties.__index);
        const focused = lot && focusLot && lot.index === focusLot.index;
        return focused
            ? { color: LOT_LINE, weight: 3, opacity: 1, fillColor: LOT_LINE, fillOpacity: 0.14 }
            : { color: lot?.color || "#e2e8f0", weight: 2, opacity: 1, fillColor: lot?.color || "#e2e8f0", fillOpacity: 0.12 };
    };

    const [zoom, setZoom] = useState(11);
    useEffect(() => {
        if (!map) return;
        const onZoom = () => setZoom(map.getZoom());
        onZoom();
        map.on("zoomend", onZoom);
        return () => map.off("zoomend", onZoom);
    }, [map]);

    // The lot drawn as a plan: the selected one, else the first lot on the map
    const focusLot = mappedLots.find((l) => l.index === selectedIndex) || mappedLots[0] || null;

    const loading = !parcelMapData;

    return (
        <div className="relative h-full bg-slate-800">
            <style>{`
                .lot-side, .lot-area, .lot-code { position: absolute; white-space: nowrap; pointer-events: none; transform: translate(-50%, -50%); }
                .lot-side { font: 600 10.5px/1 ui-sans-serif, system-ui, sans-serif; color: #7c2d12; text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff; }
                .lot-area { font: 600 11.5px/1 ui-sans-serif, system-ui, sans-serif; color: #0f172a; background: rgba(255,255,255,.88); padding: 3px 6px; border-radius: 4px; }
                .lot-code { transform: translate(-50%, calc(-100% - 8px)); font: 700 11px/1 ui-sans-serif, system-ui, sans-serif; color: #fff; background: ${LOT_LINE}; padding: 4px 7px; border-radius: 4px; box-shadow: 0 1px 3px rgba(15,23,42,.3); }
                .app-lot-label { background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; padding: 1px 6px; font: 600 11px/1.4 inherit; color: #0f172a; }
                .app-lot-label::before { display: none; }
            `}</style>

            <MapContainer ref={setMap} center={[13.7850, 121.2500]} zoom={11} minZoom={11} maxBounds={[[13.65, 121.12], [13.92, 121.36]]} maxBoundsViscosity={1.0} maxZoom={MAP_MAX_ZOOM} zoomControl={false} attributionControl={false} style={{ width: "100%", height: "100%" }}>
                <TileLayer key={basemap} url={BASEMAPS[basemap].url} subdomains="0123" maxZoom={MAP_MAX_ZOOM} maxNativeZoom={BASEMAPS[basemap].maxNativeZoom} keepBuffer={4} />
                {showClup && (
                    <TileLayer url={CLUP_TILES.url} maxZoom={MAP_MAX_ZOOM} maxNativeZoom={CLUP_TILES.maxNativeZoom} opacity={0.55} zIndex={10} errorTileUrl={BLANK_TILE} />
                )}
                {barangayOutline && (
                    <GeoJSON key={`bgy-${barangay}`} data={barangayOutline} interactive={false} style={{ color: "#ffffff", weight: 2, opacity: 0.9, dashArray: "6 5", fill: false }} />
                )}
                {mappedLots.length > 0 && (
                    <GeoJSON
                        key={`lots-${focusLot?.index}-${lotsKey}`}
                        data={lotsCollection}
                        style={lotStyle}
                        onEachFeature={(f, layer) => {
                            const lot = lots.find((l) => l.index === f.properties.__index);
                            if (!lot) return;
                            // The lot in focus is labelled by its plan; other lots keep a small code label
                            if (!focusLot || lot.index !== focusLot.index) {
                                layer.bindTooltip(lot.code, { permanent: true, direction: "center", className: "app-lot-label" });
                            }
                            layer.on("click", () => onSelectLot(lot.index));
                            layer.on("mouseover", () => layer.setStyle({ weight: 3 }));
                            layer.on("mouseout", () => layer.setStyle(lotStyle(f)));
                        }}
                    />
                )}
                {focusLot && <LotPlan key={focusLot.index} lot={focusLot} showSides={zoom >= 17} />}
                {/* LOOP 7: the confirmed inspection site, marked only when both
                    coordinates validated. */}
                {inspectionPoint && (
                    <CircleMarker
                        center={inspectionPoint}
                        radius={8}
                        pathOptions={{ color: "#ef4444", fillColor: "#ef4444", fillOpacity: 0.9, weight: 2 }}
                    />
                )}
                <ScaleBar />
            </MapContainer>

            {/* Basemap and overlay */}
            <div className="absolute top-3 left-3 z-[400] flex items-center gap-2">
                <div className="flex gap-0.5 p-0.5 bg-slate-900/65 backdrop-blur-md ring-1 ring-white/10 rounded-lg shadow-lg" role="group" aria-label="Basemap">
                    {[
                        ["satellite", "Satellite"],
                        ["street", "Map"],
                    ].map(([key, label]) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={basemap === key}
                            onClick={() => setBasemap(key)}
                            className={`h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-white ${
                                basemap === key ? "bg-white text-slate-900 shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className={`h-8 px-3 flex items-center gap-2 backdrop-blur-md rounded-lg shadow-lg text-[12px] font-medium cursor-pointer transition-colors focus-within:outline-2 focus-within:outline-white ${
                    showClup ? "bg-blue-600 text-white ring-1 ring-blue-400/50" : "bg-slate-900/65 text-white/85 ring-1 ring-white/10 hover:text-white"
                }`}>
                    <input type="checkbox" checked={showClup} onChange={(e) => setShowClup(e.target.checked)} className="w-3.5 h-3.5 rounded accent-white" />
                    CLUP 2030
                </label>
            </div>

            {showClup && (
                <div className="absolute top-14 left-3 z-[400] bg-white/95 backdrop-blur border border-slate-200 rounded-md shadow-sm px-2.5 py-2 max-h-[45%] overflow-y-auto">
                    <ul className="space-y-0.5" aria-label="CLUP 2030 legend">
                        {ZONE_CATEGORY_LEGEND.map((z) => (
                            <li key={z.id} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                <span className="w-3 h-2.5 border shrink-0" style={{ background: z.fill, borderColor: z.stroke }} aria-hidden="true" />
                                {z.label}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* North arrow (the map is always north-up) */}
            <div className="absolute top-3 right-3 z-[400] w-8 h-10 flex flex-col items-center justify-center bg-white/95 backdrop-blur border border-slate-200 rounded-md shadow-sm" aria-label="North is up" role="img">
                <span className="text-[10px] font-bold leading-none text-slate-800">N</span>
                <svg className="w-3.5 h-4 text-slate-800" viewBox="0 0 14 16" fill="currentColor" aria-hidden="true">
                    <path d="M7 0l6 15-6-4-6 4z" />
                </svg>
            </div>

            {/* View controls */}
            <div className="absolute bottom-8 right-3 z-[400] flex flex-col bg-white/95 backdrop-blur border border-slate-200 rounded-md shadow-sm overflow-hidden divide-y divide-slate-100">
                <Control label="Zoom in" onClick={() => map?.zoomIn()}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 5v14m7-7H5" />
                </Control>
                <Control label="Zoom out" onClick={() => map?.zoomOut()}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 12H5" />
                </Control>
                <Control label="Fit to this application's lots" disabled={!mappedLots.length} onClick={() => fitTo(lotsCollection)}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4M20 8V4h-4M4 16v4h4M20 16v4h-4" />
                </Control>
                {onPrint && (
                    <Control label="Print site & zoning map" disabled={!mappedLots.length} onClick={onPrint}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" />
                    </Control>
                )}
            </div>

            {!loading && !mappedLots.length && (
                <div className="absolute inset-x-0 bottom-8 z-[400] flex justify-center pointer-events-none">
                    <p className="px-3 py-1.5 bg-white/95 border border-slate-200 rounded-md shadow-sm text-[12px] text-slate-600">
                        This application's lots are not on the tax map yet.
                    </p>
                </div>
            )}

            <MapSkeleton visible={loading} label="Loading lots…" tone="#e9ecf0" />
        </div>
    );
}
