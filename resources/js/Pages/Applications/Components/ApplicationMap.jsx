// resources/js/Pages/Applications/Components/ApplicationMap.jsx
// Read-only QGIS-style map of an application's lots, with the same tools as the encoder's GIS step.
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getZoneInfo, ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { resolveBarangayName } from "@/utils/mapData";
import { MAP_MAX_ZOOM, BASEMAPS, CLUP_TILES, BLANK_TILE, formatDistance, formatArea, zoneCodeOf, featureContains, labelPoint, insidePoint } from "@/utils/mapGeometry";
import {
    PARCEL_FIELD_ALIASES,
    BARANGAY_LINE,
    PARCEL_MIN_ZOOM,
    ZONE_LINE_MIN_ZOOM,
    UNLABELLED_ZONES,
    NO_LABELS,
    buildMapTip,
    ScaleBar,
    MapLabels,
    MeasureLayer,
    IdentifyClick,
    MapResizeTrigger,
    MapStatusBar,
    ToolButton,
    LayerRow,
} from "@/Components/MapKit";

const SELECTED_LOT = { color: "#facc15", fillColor: "#fde047" };

/**
 * lots: [{ index, code, pin, feature, check: { key, label }, color }]
 */
export default function ApplicationMap({ lots, parcelMapData, brgyMapData, barangay, selectedIndex, onSelectLot, onPrint }) {
    const [map, setMap] = useState(null);
    const [tool, setTool] = useState("identify");
    const isMeasuring = tool === "measure" || tool === "measureArea";
    const [layersOpen, setLayersOpen] = useState(false);
    const [dockTab, setDockTab] = useState("layers");
    const [basemap, setBasemap] = useState("satellite");
    const [showClup, setShowClup] = useState(true);
    const [clupOpacity, setClupOpacity] = useState(0.4);
    const [showZoneLines, setShowZoneLines] = useState(true);
    const [showParcels, setShowParcels] = useState(true);
    const [showBarangays, setShowBarangays] = useState(true);
    const [zoom, setZoom] = useState(12);
    const [zones, setZones] = useState(null);
    const [identify, setIdentify] = useState(null);
    const [measure, setMeasure] = useState(null);
    const identifyHitRef = useRef(null);
    const identifySeq = useRef(0);
    const mapTipRef = useRef(null);
    if (!mapTipRef.current) mapTipRef.current = L.tooltip({ direction: "top", offset: [0, -10], opacity: 0.95 });

    const mappedLots = lots.filter((l) => l.feature);
    const selectedLot = lots.find((l) => l.index === selectedIndex);

    useEffect(() => {
        if (!map) return;
        const onZoom = () => setZoom(map.getZoom());
        onZoom();
        map.on("zoomend", onZoom);
        return () => map.off("zoomend", onZoom);
    }, [map]);

    useEffect(() => {
        if (map) map.getContainer().style.cursor = tool === "pan" ? "" : "crosshair";
    }, [map, tool]);

    const fitTo = useCallback(
        (data, padding = 60, maxZoom = 18) => {
            if (!map || !data) return;
            const bounds = L.geoJSON(data).getBounds();
            if (bounds.isValid()) map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
        },
        [map]
    );
    const lotsCollection = useMemo(() => ({ type: "FeatureCollection", features: mappedLots.map((l) => l.feature) }), [mappedLots.map((l) => l.pin).join("|")]);

    // Frame all of the application's lots once they're known
    const framed = useRef(false);
    useEffect(() => {
        if (framed.current || !map || !mappedLots.length) return;
        framed.current = true;
        fitTo(lotsCollection, 70);
    }, [map, lotsCollection]);

    // Selecting a lot in the panel zooms to it (never zooms out if already closer)
    const lastSelected = useRef(selectedIndex);
    useEffect(() => {
        if (!map || selectedIndex === lastSelected.current) return;
        lastSelected.current = selectedIndex;
        if (selectedLot?.feature) fitTo(selectedLot.feature, 80, Math.max(map.getZoom(), 18));
    }, [selectedIndex, map]);

    // Exact zone boundaries of the application's barangay
    useEffect(() => {
        if (!barangay) return;
        let cancelled = false;
        fetch(`/api/map/land_use_plan?barangay=${encodeURIComponent(barangay)}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => !cancelled && setZones(data))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [barangay]);

    const zoneLabels = useMemo(
        () =>
            (zones?.features || [])
                .map((f, i) => {
                    const code = zoneCodeOf(f.properties);
                    const latlng = code && !UNLABELLED_ZONES.has(code) ? insidePoint(f) : null;
                    return latlng ? { key: `z-${i}`, text: code, latlng } : null;
                })
                .filter(Boolean),
        [zones]
    );
    const parcelLabels = useMemo(
        () =>
            (parcelMapData?.features || [])
                .map((f) => {
                    const pin = f.properties?.property_index_number?.trim();
                    const latlng = pin && labelPoint(f.geometry);
                    return latlng ? { key: pin, text: pin, latlng } : null;
                })
                .filter(Boolean),
        [parcelMapData]
    );
    const brgyLabels = useMemo(
        () =>
            (brgyMapData?.features || [])
                .map((f, i) => {
                    const name = resolveBarangayName(f.properties);
                    const latlng = name && labelPoint(f.geometry);
                    return latlng ? { key: `${name}-${i}`, text: name, latlng } : null;
                })
                .filter(Boolean),
        [brgyMapData]
    );
    const badges = useMemo(
        () =>
            mappedLots
                .map((l) => {
                    const latlng = labelPoint(l.feature.geometry);
                    return latlng ? { key: l.pin, text: `${l.code} · ${l.check.label}`, latlng, color: l.color } : null;
                })
                .filter(Boolean),
        [mappedLots.map((l) => `${l.pin}:${l.check.key}`).join("|")]
    );

    const identifyBrgy = useMemo(
        () => (identify ? (brgyMapData?.features || []).find((f) => featureContains(f, identify.latlng)) : null),
        [identify?.latlng, brgyMapData]
    );

    const handleIdentify = (latlng, feature) => {
        const seq = ++identifySeq.current;
        setIdentify({ latlng, feature, zone: undefined });
        setDockTab("identify");
        setLayersOpen(true);
        if (feature) {
            fitTo(feature, 80, Math.max(map?.getZoom() ?? 18, 18));
            const pin = feature.properties?.property_index_number?.trim();
            const lot = lots.find((l) => l.pin === pin);
            if (lot) onSelectLot(lot.index);
        }
        fetch(`/api/map/zoning-lookup?lat=${latlng.lat}&lng=${latlng.lng}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, zone: data?.lup_2030 ?? null })))
            .catch(() => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, zone: null, zoneFailed: true })));
    };

    // Hover map tip + outline, shared by the context parcels and the application's lots
    const latest = useRef({});
    latest.current = { tool, map };
    const bindLot = (feature, layer, restyle) => {
        layer.on({
            click: () => (identifyHitRef.current = feature),
            mouseover: (e) => {
                const { tool: t, map: m } = latest.current;
                if (t === "measure" || t === "measureArea" || !m) return;
                layer.setStyle({ weight: 3, color: "#0f172a" });
                mapTipRef.current.setLatLng(e.latlng).setContent(buildMapTip(feature.properties || {})).openOn(m);
            },
            mousemove: (e) => mapTipRef.current.isOpen() && mapTipRef.current.setLatLng(e.latlng),
            mouseout: () => {
                layer.setStyle(restyle(feature));
                mapTipRef.current.close();
            },
        });
    };
    const contextStyle = () => ({ color: "#2563eb", weight: 1.2, opacity: 0.8, fillColor: "#3b82f6", fillOpacity: 0.12 });
    const lotStyle = useCallback(
        (f) => {
            const lot = lots.find((l) => l.pin === f.properties?.property_index_number?.trim());
            const selected = lot?.index === selectedIndex;
            const color = lot?.color || "#2563eb";
            return selected
                ? { color: SELECTED_LOT.color, weight: 3.5, opacity: 1, fillColor: SELECTED_LOT.fillColor, fillOpacity: 0.4 }
                : { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: zoom >= PARCEL_MIN_ZOOM ? 0.15 : 0.45 };
        },
        [lots, selectedIndex, zoom]
    );

    const statusMessage =
        tool === "measure"
            ? measure && measure.count > 1
                ? `Measure: total ${formatDistance(measure.total)} · last segment ${formatDistance(measure.last)} · right-click or Esc to clear`
                : "Measure line: click to add points"
            : tool === "measureArea"
            ? measure && measure.count > 2
                ? `Area ${formatArea(measure.area)} · perimeter ${formatDistance(measure.total)} · right-click or Esc to clear`
                : "Measure area: click at least 3 corners"
            : !parcelMapData
            ? "Loading land parcels…"
            : !mappedLots.length
            ? "This application's lots are not on the tax map"
            : tool === "identify"
            ? `Identify: click the map · ${mappedLots.length} lot${mappedLots.length === 1 ? "" : "s"} in this application`
            : "Pan: drag to move the map";

    return (
        <div className="relative h-full flex flex-col bg-slate-200">
            {/* Toolbar */}
            <div className="h-9 shrink-0 px-1.5 bg-slate-50 border-b border-slate-300 flex items-center gap-0.5 z-20" role="toolbar" aria-label="Map tools">
                <ToolButton label="Toggle Layers panel" active={layersOpen} onClick={() => setLayersOpen((o) => !o)}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />
                </ToolButton>
                <span className="w-px h-5 bg-slate-300 mx-1" />
                <ToolButton label="Pan map" active={tool === "pan"} onClick={() => setTool("pan")}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.05 4.575a1.575 1.575 0 10-3.15 0v3m3.15-3v-1.5a1.575 1.575 0 013.15 0v1.5m-3.15 0l.075 5.925m3.075.75V4.575m0 0a1.575 1.575 0 013.15 0V15M6.9 7.575a1.575 1.575 0 10-3.15 0v8.175a6.75 6.75 0 006.75 6.75h2.018a5.25 5.25 0 003.712-1.538l1.732-1.732a5.25 5.25 0 001.538-3.712l.003-2.024a.668.668 0 01.198-.471 1.575 1.575 0 10-2.228-2.228 3.818 3.818 0 00-1.12 2.687M6.9 7.575V12m6.27 4.318A4.49 4.49 0 0116.35 15m.002 0h-.002" />
                </ToolButton>
                <ToolButton label="Identify features" active={tool === "identify"} onClick={() => setTool("identify")}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </ToolButton>
                <ToolButton label="Measure line" active={tool === "measure"} onClick={() => setTool("measure")}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 16.5l12.75-12.75 3.75 3.75L7.5 20.25 3.75 16.5zM7.5 12.75l1.5 1.5M10.5 9.75l1.5 1.5M13.5 6.75l1.5 1.5" />
                </ToolButton>
                <ToolButton label="Measure area" active={tool === "measureArea"} onClick={() => setTool("measureArea")}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 7.5l6-3.75 9 4.5-1.5 9.75-10.5 1.5L4.5 7.5z" />
                </ToolButton>
                <span className="w-px h-5 bg-slate-300 mx-1" />
                <ToolButton label="Zoom in" onClick={() => map?.zoomIn()}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                </ToolButton>
                <ToolButton label="Zoom out" onClick={() => map?.zoomOut()}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                </ToolButton>
                <ToolButton label="Zoom to this application's lots" disabled={!mappedLots.length} onClick={() => fitTo(lotsCollection, 70)}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </ToolButton>
                <span className="w-px h-5 bg-slate-300 mx-1" />
                <ToolButton label="Print site & zoning map" disabled={!mappedLots.length || !onPrint} onClick={onPrint}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" />
                </ToolButton>
            </div>

            <div className="relative flex-1 min-h-0">
                <div className="absolute inset-0 z-0 [&_.leaflet-bottom]:bottom-7">
                    <MapContainer ref={setMap} center={[13.8475, 121.2058]} zoom={12} maxZoom={MAP_MAX_ZOOM} preferCanvas zoomControl={false} attributionControl={false} style={{ width: "100%", height: "100%" }}>
                        <TileLayer
                            key={basemap}
                            url={BASEMAPS[basemap].url}
                            subdomains="0123"
                            maxZoom={MAP_MAX_ZOOM}
                            maxNativeZoom={BASEMAPS[basemap].maxNativeZoom}
                            keepBuffer={4}
                            updateWhenZooming={false}
                            zIndex={1}
                        />
                        {showClup && (
                            <TileLayer
                                url={CLUP_TILES.url}
                                maxZoom={MAP_MAX_ZOOM}
                                maxNativeZoom={CLUP_TILES.maxNativeZoom}
                                opacity={clupOpacity}
                                keepBuffer={4}
                                updateWhenZooming={false}
                                zIndex={10}
                                errorTileUrl={BLANK_TILE}
                            />
                        )}
                        {showZoneLines && zones && zoom >= ZONE_LINE_MIN_ZOOM && (
                            <>
                                <GeoJSON data={zones} interactive={false} style={{ color: "#0f172a", weight: 4, opacity: 0.45, fill: false }} />
                                <GeoJSON data={zones} interactive={false} style={(f) => ({ color: getZoneInfo(zoneCodeOf(f.properties)).stroke, weight: 2, opacity: 1, fill: false })} />
                            </>
                        )}
                        {showBarangays && brgyMapData && <GeoJSON data={brgyMapData} style={BARANGAY_LINE} smoothFactor={BARANGAY_LINE.smoothFactor} interactive={false} />}
                        {showParcels && parcelMapData && zoom >= PARCEL_MIN_ZOOM && (
                            <GeoJSON data={parcelMapData} style={contextStyle} onEachFeature={(f, layer) => bindLot(f, layer, contextStyle)} />
                        )}
                        {mappedLots.length > 0 && (
                            <GeoJSON
                                key={`lots-${selectedIndex}-${zoom >= PARCEL_MIN_ZOOM}-${lots.map((l) => l.check.key).join("")}`}
                                data={lotsCollection}
                                style={lotStyle}
                                onEachFeature={(f, layer) => bindLot(f, layer, lotStyle)}
                            />
                        )}
                        <IdentifyClick active={tool === "identify"} hitRef={identifyHitRef} onIdentify={handleIdentify} />
                        <MeasureLayer key={tool} active={isMeasuring} mode={tool === "measureArea" ? "area" : "line"} onMeasure={setMeasure} />
                        {tool === "identify" && identify && (
                            <CircleMarker center={identify.latlng} radius={8} pathOptions={{ color: "#dc2626", weight: 2.5, fillOpacity: 0 }} interactive={false} />
                        )}
                        <ScaleBar />
                        <MapResizeTrigger watch={layersOpen} />
                    </MapContainer>
                </div>

                {/* Docked Layers / Identify Results panel */}
                {layersOpen && (
                    <div className="absolute top-0 left-0 bottom-7 z-10 w-64 bg-white/95 backdrop-blur-sm border-r border-slate-300 flex flex-col text-slate-700">
                        <div className="h-7 pl-1 pr-1.5 flex items-end justify-between border-b border-slate-300 bg-slate-100" role="tablist" aria-label="Map panels">
                            <div className="flex items-end gap-0.5">
                                {[
                                    { id: "layers", label: "Layers" },
                                    { id: "identify", label: "Identify Results" },
                                ].map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={dockTab === t.id}
                                        onClick={() => setDockTab(t.id)}
                                        className={`h-6 px-2 text-[11px] border border-b-0 rounded-t cursor-pointer ${
                                            dockTab === t.id ? "bg-white border-slate-300 text-slate-900 font-semibold -mb-px" : "border-transparent text-slate-500 hover:text-slate-800"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                            <button type="button" onClick={() => setLayersOpen(false)} aria-label="Close panel" className="mb-1 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer">
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        {dockTab === "identify" ? (
                            <div className="flex-1 overflow-y-auto p-1.5 text-[11px]">
                                {!identify ? (
                                    <p className="px-1.5 py-2 text-slate-400">Choose the Identify tool and click the map.</p>
                                ) : (
                                    <>
                                        <p className="px-1.5 pb-1.5 font-mono text-slate-500">
                                            {identify.latlng.lat.toFixed(6)}, {identify.latlng.lng.toFixed(6)}
                                        </p>
                                        <details open className="mb-1">
                                            <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">CLUP 2030 zoning</summary>
                                            <div className="px-1.5 pl-5 py-1 text-slate-800">
                                                {identify.zone === undefined ? (
                                                    "Loading…"
                                                ) : identify.zoneFailed ? (
                                                    "Lookup failed"
                                                ) : identify.zone ? (
                                                    <span className="inline-flex items-start gap-1.5">
                                                        <span className="mt-0.5 w-2.5 h-2.5 border shrink-0" style={{ background: getZoneInfo(identify.zone).fill, borderColor: getZoneInfo(identify.zone).stroke }} aria-hidden="true" />
                                                        <span>
                                                            <b>{identify.zone}</b>
                                                            <span className="block text-slate-500">{getZoneInfo(identify.zone).label}</span>
                                                        </span>
                                                    </span>
                                                ) : (
                                                    <i className="text-slate-400">NULL</i>
                                                )}
                                            </div>
                                        </details>
                                        <details open className="mb-1">
                                            <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">Barangay boundaries</summary>
                                            <div className="px-1.5 pl-5 py-1 text-slate-800">{identifyBrgy ? resolveBarangayName(identifyBrgy.properties) : <i className="text-slate-400">Outside Rosario</i>}</div>
                                        </details>
                                        {identify.feature ? (
                                            <details open>
                                                <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">Land parcels</summary>
                                                <dl className="px-1.5 pl-5 py-1 space-y-0.5">
                                                    {PARCEL_FIELD_ALIASES.filter(([k]) => k in (identify.feature.properties || {})).map(([k, label]) => {
                                                        const v = identify.feature.properties[k];
                                                        return (
                                                            <div key={k} className="grid grid-cols-[88px_1fr] gap-x-2">
                                                                <dt className="text-slate-400">{label}</dt>
                                                                <dd className={`text-slate-800 break-words ${k === "property_index_number" ? "font-mono" : ""}`}>
                                                                    {v === null || v === "" ? <i className="text-slate-400">NULL</i> : String(v)}
                                                                </dd>
                                                            </div>
                                                        );
                                                    })}
                                                </dl>
                                            </details>
                                        ) : (
                                            <p className="px-1.5 py-1 text-slate-400">No land parcel at this point.</p>
                                        )}
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                                <LayerRow checked={showParcels} onChange={setShowParcels} swatch="bg-blue-500/20 border-blue-600">
                                    Land parcels (zoom in)
                                </LayerRow>
                                <div className="pl-7 pb-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span className="w-2.5 h-2.5 bg-yellow-300/60 border border-yellow-400" aria-hidden="true" /> Selected lot
                                </div>
                                <LayerRow checked={showZoneLines} onChange={setShowZoneLines} swatch="bg-transparent border-2 border-slate-700">
                                    Zoning boundaries (exact)
                                </LayerRow>
                                <LayerRow checked={showBarangays} onChange={setShowBarangays} swatch="bg-transparent border-slate-600">
                                    Barangay boundaries
                                </LayerRow>
                                <LayerRow checked={showClup} onChange={setShowClup} swatch="bg-gradient-to-br from-yellow-300 via-rose-400 to-fuchsia-500 border-slate-400">
                                    CLUP 2030 zoning
                                </LayerRow>
                                {showClup && (
                                    <>
                                        <div className="pl-7 pr-2 pb-1.5 flex items-center gap-2">
                                            <input
                                                type="range"
                                                min="0.1"
                                                max="1"
                                                step="0.05"
                                                value={clupOpacity}
                                                onChange={(e) => setClupOpacity(Number(e.target.value))}
                                                aria-label="CLUP zoning opacity"
                                                className="flex-1 accent-slate-700 cursor-pointer"
                                            />
                                            <span className="font-mono text-[10px] text-slate-500 w-8 text-right">{Math.round(clupOpacity * 100)}%</span>
                                        </div>
                                        <ul className="pl-7 pr-2 pb-1.5 space-y-0.5" aria-label="CLUP zoning legend">
                                            {ZONE_CATEGORY_LEGEND.map((z) => (
                                                <li key={z.id} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                                                    <span className="w-3 h-2.5 border shrink-0" style={{ background: z.fill, borderColor: z.stroke }} aria-hidden="true" />
                                                    {z.label}
                                                </li>
                                            ))}
                                        </ul>
                                    </>
                                )}
                                <div className="pt-1.5 mt-1 border-t border-slate-200" role="radiogroup" aria-label="Base map">
                                    {Object.entries(BASEMAPS).map(([key, b]) => (
                                        <label key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer">
                                            <input type="radio" name="record-basemap" checked={basemap === key} onChange={() => setBasemap(key)} className="w-3.5 h-3.5 accent-slate-700 cursor-pointer" />
                                            <span className="text-[11px] text-slate-700">{b.label}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <MapLabels
                    map={map}
                    badges={badges}
                    zoneLabels={showZoneLines ? zoneLabels : NO_LABELS}
                    parcelLabels={parcelLabels}
                    brgyLabels={brgyLabels}
                    selectedPin={selectedLot?.pin}
                    showParcels={showParcels}
                    showBarangays={showBarangays}
                />

                {/* North arrow */}
                <div className="absolute top-2 right-2 z-10 w-9 h-11 rounded-md bg-white/90 border border-slate-300 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
                    <span className="text-[10px] font-bold leading-none text-slate-800">N</span>
                    <svg className="w-4 h-5" viewBox="0 0 16 20">
                        <path d="M8 1 L14 19 L8 15 Z" fill="#0f172a" />
                        <path d="M8 1 L2 19 L8 15 Z" fill="#ffffff" stroke="#0f172a" strokeWidth="1" />
                    </svg>
                </div>

                <MapStatusBar map={map} message={statusMessage} />
            </div>
        </div>
    );
}
