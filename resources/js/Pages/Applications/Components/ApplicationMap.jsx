// resources/js/Pages/Applications/Components/ApplicationMap.jsx
// View-only map of an application's lots. Editing and drafting tools live in
// the encoder's GIS step; here the map only frames the lots and lets the
// officer pick one.
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { resolveBarangayName } from "@/utils/mapData";
import { MAP_MAX_ZOOM, BASEMAPS, CLUP_TILES, BLANK_TILE } from "@/utils/mapGeometry";
import { ScaleBar } from "@/Components/MapKit";
import MapSkeleton from "@/Components/Dashboard/MapSkeleton";

const NAVY = "#0b2a5b";

function Control({ label, onClick, disabled, children }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={label}
            title={label}
            className="w-8 h-8 flex items-center justify-center text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]"
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

    const fitTo = useCallback(
        (data, maxZoom = 18) => {
            if (!map || !data) return;
            const bounds = L.geoJSON(data).getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [70, 70], maxZoom });
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
                fitTo(targetLot.feature, 18);
            } else if (lotsCollection) {
                fitTo(lotsCollection, 18);
            }
        } else if (!framedLots.current && barangayOutline && mappedLots.length === 0) {
            fitTo(barangayOutline, 15);
        }
    }, [map, mappedLots, lotsCollection, barangayOutline, selectedIndex, fitTo, lots]);

    // Picking a lot in the panel frames it.
    const lastSelected = useRef(null);
    useEffect(() => {
        if (!map || selectedIndex === lastSelected.current) return;
        lastSelected.current = selectedIndex;
        if (selectedIndex !== null && selectedIndex !== undefined) {
            const lot = lots.find((l) => l.index === selectedIndex);
            if (lot?.feature) fitTo(lot.feature, 18);
        } else if (lotsCollection) {
            fitTo(lotsCollection, 18);
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
        map.flyTo(inspectionPoint, 18, { duration: 1.2 });
    }, [map, inspectionPoint, selectedIndex, lots]);

    const lotStyle = (f) => {
        const lot = lots.find((l) => l.index === f.properties.__index);
        const selected = lot?.index === selectedIndex;
        return selected
            ? { color: "#ffffff", weight: 3, opacity: 1, fillColor: NAVY, fillOpacity: 0.35 }
            : { color: lot?.color || "#e2e8f0", weight: 2, opacity: 1, fillColor: lot?.color || "#e2e8f0", fillOpacity: 0.18 };
    };

    const loading = !parcelMapData;

    return (
        <div className="relative h-full bg-slate-800">
            <style>{`
                .app-lot-label { background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 1px 3px rgba(15,23,42,.25); padding: 1px 6px; font: 600 11px/1.4 inherit; color: #0f172a; }
                .app-lot-label.is-selected { background: ${NAVY}; border-color: ${NAVY}; color: #fff; }
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
                        key={`lots-${selectedIndex}-${lotsKey}`}
                        data={lotsCollection}
                        style={lotStyle}
                        onEachFeature={(f, layer) => {
                            const lot = lots.find((l) => l.index === f.properties.__index);
                            if (!lot) return;
                            layer.bindTooltip(lot.code, {
                                permanent: true,
                                direction: "center",
                                className: `app-lot-label${lot.index === selectedIndex ? " is-selected" : ""}`,
                            });
                            layer.on("click", () => onSelectLot(lot.index));
                            layer.on("mouseover", () => layer.setStyle({ weight: 3 }));
                            layer.on("mouseout", () => layer.setStyle(lotStyle(f)));
                        }}
                    />
                )}
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
                <div className="flex bg-white border border-slate-300 rounded-md overflow-hidden shadow-sm" role="group" aria-label="Basemap">
                    {[
                        ["satellite", "Satellite"],
                        ["street", "Map"],
                    ].map(([key, label], i) => (
                        <button
                            key={key}
                            type="button"
                            aria-pressed={basemap === key}
                            onClick={() => setBasemap(key)}
                            className={`h-8 px-3 text-[12px] font-semibold cursor-pointer ${i ? "border-l border-slate-300" : ""} ${
                                basemap === key ? "bg-[#0b2a5b] text-white" : "text-slate-700 hover:bg-slate-50"
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
                <label className="h-8 px-3 flex items-center gap-2 bg-white border border-slate-300 rounded-md shadow-sm text-[12px] font-semibold text-slate-700 cursor-pointer">
                    <input type="checkbox" checked={showClup} onChange={(e) => setShowClup(e.target.checked)} className="accent-[#0b2a5b]" />
                    CLUP 2030
                </label>
            </div>

            {showClup && (
                <div className="absolute top-14 left-3 z-[400] bg-white/95 border border-slate-300 rounded-md shadow-sm px-2.5 py-2 max-h-[45%] overflow-y-auto">
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

            {/* View controls */}
            <div className="absolute bottom-8 right-3 z-[400] flex flex-col bg-white border border-slate-300 rounded-md shadow-sm overflow-hidden divide-y divide-slate-200">
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
                    <p className="px-3 py-1.5 bg-white border border-slate-300 rounded-md shadow-sm text-[12px] text-slate-600">
                        This application's lots are not on the tax map yet.
                    </p>
                </div>
            )}

            <MapSkeleton visible={loading} label="Loading lots…" tone="#e9ecf0" />
        </div>
    );
}
