// resources/js/Pages/Applications/Components/SiteMapPrint.jsx
// One-page site & zoning map (A4 landscape) for filing with the application.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Tooltip, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { getZoneInfo } from "@/utils/clupZones";
import { BASEMAPS, CLUP_TILES, BLANK_TILE, MAP_MAX_ZOOM, zoneCodeOf, labelPoint, areaCheck, formatAreaDiff } from "@/utils/mapGeometry";

const LOT_STYLE = { color: "#facc15", weight: 3, opacity: 1, fillColor: "#fde047", fillOpacity: 0.25 };
const LOT_CASING = { color: "#0f172a", weight: 5, opacity: 0.6, fill: false };

// Fit the frame to the application's lots once the map exists; also reports the scale for the title block
function FrameLots({ lots, onScale }) {
    const map = useMap();
    useEffect(() => {
        const bounds = L.geoJSON({ type: "FeatureCollection", features: lots.map((l) => l.feature) }).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48], maxZoom: 19 });
        const control = L.control.scale({ position: "bottomleft", imperial: false, maxWidth: 140 }).addTo(map);
        const report = () => {
            const mpp = (156543.03392 * Math.cos((map.getCenter().lat * Math.PI) / 180)) / Math.pow(2, map.getZoom());
            onScale(Math.round(mpp * 3779.5));
        };
        report();
        map.on("zoomend moveend", report);
        return () => {
            control.remove();
            map.off("zoomend moveend", report);
        };
    }, [map]);
    return null;
}

export default function SiteMapPrint({ open, onClose, form, parcelMapData, preparedBy }) {
    const [basemap, setBasemap] = useState("satellite");
    const [zones, setZones] = useState(null);
    const [loadingTiles, setLoadingTiles] = useState({});
    const [scale, setScale] = useState(null);
    const printButtonRef = useRef(null);

    // Verified lots with a mapped shape, plus the details printed in the lot table
    const lots = useMemo(() => {
        const byPin = new Map((parcelMapData?.features || []).map((f) => [f.properties?.property_index_number?.trim(), f]));
        return (form.parcels || [])
            .filter((p) => p.property_index_number?.trim())
            .map((p, i) => ({
                code: p.parcel_code || `P-${String(i + 1).padStart(2, "0")}`,
                parcel: p,
                feature: byPin.get(p.property_index_number.trim()) || null,
            }));
    }, [form.parcels, parcelMapData]);
    const mappedLots = lots.filter((l) => l.feature);

    const barangay = form.barangay?.trim() || "";
    useEffect(() => {
        if (!open || !barangay) return;
        let cancelled = false;
        fetch(`/api/map/land_use_plan?barangay=${encodeURIComponent(barangay)}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => !cancelled && setZones(data))
            .catch(() => !cancelled && setZones(null));
        return () => {
            cancelled = true;
        };
    }, [open, barangay]);

    // Focus once on open; Escape reads the latest onClose through a ref (the parent passes a new function each render)
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!open) return;
        printButtonRef.current?.focus();
        const onKey = (e) => e.key === "Escape" && onCloseRef.current();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open]);

    // Zone categories in view, for the legend
    const legendZones = useMemo(() => {
        const seen = new Map();
        (zones?.features || []).forEach((f) => {
            const info = getZoneInfo(zoneCodeOf(f.properties));
            if (info.code && !seen.has(info.code)) seen.set(info.code, info);
        });
        const lotZones = new Set(lots.map((l) => l.parcel.land_use_class?.trim()).filter(Boolean));
        // Zones the lots sit in first, then the rest of the barangay's
        return [...seen.values()].sort((a, b) => Number(lotZones.has(b.code)) - Number(lotZones.has(a.code))).slice(0, 10);
    }, [zones, lots]);

    const tilesBusy = Object.values(loadingTiles).some(Boolean);
    const trackTiles = (name) => ({
        loading: () => setLoadingTiles((s) => ({ ...s, [name]: true })),
        load: () => setLoadingTiles((s) => ({ ...s, [name]: false })),
    });

    if (!open) return null;

    const today = new Date().toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
    const dash = (v) => (v && String(v).trim() ? v : "—");

    return createPortal(
        <div className="fixed inset-0 z-[2000] bg-slate-900/70 overflow-auto print:bg-white print:overflow-visible animate-fade-in duration-150 print:animate-none" role="dialog" aria-modal="true" aria-label="Site and zoning map">
            <style>{`
                @media print {
                    @page { size: A4 landscape; margin: 10mm; }
                    body * { visibility: hidden !important; }
                    #site-map-print, #site-map-print * { visibility: visible !important; }
                    #site-map-print { position: fixed !important; left: 0; top: 0; margin: 0 !important; box-shadow: none !important; }
                    .leaflet-control-scale-line { background: #fff !important; }
                }
            `}</style>

            {/* Controls (not printed) */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-2.5 bg-white border-b border-slate-200 print:hidden">
                <div className="flex items-center gap-3 text-xs">
                    <span className="font-bold text-slate-800">Site & Zoning Map</span>
                    <span className="text-slate-500">Drag or zoom the map to frame it, then print.</span>
                    <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-full" role="radiogroup" aria-label="Base map">
                        {Object.entries(BASEMAPS).map(([key, b]) => (
                            <button
                                key={key}
                                type="button"
                                role="radio"
                                aria-checked={basemap === key}
                                onClick={() => setBasemap(key)}
                                className={`px-3 py-1 rounded-full text-[11px] font-semibold cursor-pointer ${basemap === key ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                            >
                                {b.label.replace("Google ", "")}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {tilesBusy && <span className="text-[11px] text-slate-500">Loading map tiles…</span>}
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        Close
                    </button>
                    <button
                        ref={printButtonRef}
                        type="button"
                        onClick={() => window.print()}
                        disabled={tilesBusy || mappedLots.length === 0}
                        className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                    >
                        Print
                    </button>
                </div>
            </div>

            {/* A4 landscape sheet: same size on screen and paper so the map frame doesn't shift when printing */}
            <div
                id="site-map-print"
                className="mx-auto my-6 bg-white text-slate-900 shadow-2xl flex flex-col border border-slate-400 print:my-0 print:border-slate-900"
                style={{ width: "277mm", height: "190mm" }}
            >
                {/* Title block */}
                <div className="flex items-end justify-between px-4 py-2 border-b-2 border-slate-900 shrink-0">
                    <div className="leading-tight">
                        <p className="text-[8pt] uppercase tracking-widest text-slate-600">Republic of the Philippines · Province of Batangas</p>
                        <p className="text-[12pt] font-extrabold uppercase">Municipality of Rosario</p>
                        <p className="text-[8pt] font-semibold uppercase text-slate-700">Municipal Planning and Development Office</p>
                    </div>
                    <div className="text-right leading-tight">
                        <p className="text-[14pt] font-extrabold uppercase tracking-tight">Site and Zoning Map</p>
                        <p className="text-[8pt] text-slate-700">
                            Form No. {dash(form.form_number)} · {today}
                        </p>
                    </div>
                </div>

                <div className="flex-1 flex min-h-0">
                    {/* Map frame */}
                    <div className="relative flex-1 border-r border-slate-900">
                        {mappedLots.length > 0 ? (
                            <MapContainer
                                center={[13.8475, 121.2058]}
                                zoom={17}
                                maxZoom={MAP_MAX_ZOOM}
                                zoomControl={false}
                                attributionControl={false}
                                style={{ width: "100%", height: "100%" }}
                            >
                                <TileLayer
                                    key={basemap}
                                    url={BASEMAPS[basemap].url}
                                    subdomains="0123"
                                    maxZoom={MAP_MAX_ZOOM}
                                    maxNativeZoom={BASEMAPS[basemap].maxNativeZoom}
                                    eventHandlers={trackTiles("base")}
                                />
                                <TileLayer
                                    url={CLUP_TILES.url}
                                    maxZoom={MAP_MAX_ZOOM}
                                    maxNativeZoom={CLUP_TILES.maxNativeZoom}
                                    opacity={0.4}
                                    errorTileUrl={BLANK_TILE}
                                    eventHandlers={trackTiles("clup")}
                                />
                                {zones && (
                                    <>
                                        <GeoJSON data={zones} interactive={false} style={{ color: "#0f172a", weight: 3.5, opacity: 0.45, fill: false }} />
                                        <GeoJSON
                                            data={zones}
                                            interactive={false}
                                            style={(f) => ({ color: getZoneInfo(zoneCodeOf(f.properties)).stroke, weight: 1.8, opacity: 1, fill: false })}
                                        />
                                    </>
                                )}
                                {mappedLots.map((l) => (
                                    <React.Fragment key={l.code}>
                                        <GeoJSON data={l.feature} interactive={false} style={LOT_CASING} />
                                        <GeoJSON data={l.feature} interactive={false} style={LOT_STYLE} />
                                        {labelPoint(l.feature.geometry) && (
                                            <CircleMarker center={labelPoint(l.feature.geometry)} radius={0} opacity={0} interactive={false}>
                                                <Tooltip permanent direction="center" className="!bg-white/90 !border-slate-900 !shadow-none !px-1.5 !py-0.5">
                                                    <span className="text-[8pt] font-bold">{l.code}</span>
                                                </Tooltip>
                                            </CircleMarker>
                                        )}
                                    </React.Fragment>
                                ))}
                                <FrameLots lots={mappedLots} onScale={setScale} />
                            </MapContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-sm text-slate-500 p-6 text-center">
                                No mapped lot yet. Verify a lot on the map (Step 1) to print its site map.
                            </div>
                        )}

                        {/* North arrow */}
                        <div className="absolute top-2 right-2 z-[500] w-9 h-11 rounded bg-white/90 border border-slate-900 flex flex-col items-center justify-center pointer-events-none" aria-hidden="true">
                            <span className="text-[9px] font-bold leading-none">N</span>
                            <svg className="w-4 h-5" viewBox="0 0 16 20">
                                <path d="M8 1 L14 19 L8 15 Z" fill="#0f172a" />
                                <path d="M8 1 L2 19 L8 15 Z" fill="#ffffff" stroke="#0f172a" strokeWidth="1" />
                            </svg>
                        </div>
                    </div>

                    {/* Information column */}
                    <div className="w-[82mm] shrink-0 p-3 flex flex-col gap-2.5 text-[8pt] leading-snug overflow-hidden">
                        <section>
                            <h3 className="text-[7pt] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-300 mb-1">Application</h3>
                            <dl className="grid grid-cols-[26mm_1fr] gap-x-2 gap-y-0.5">
                                <dt className="text-slate-500">Applicant</dt>
                                <dd className="font-semibold">{dash(form.corporation_name || form.applicant_name)}</dd>
                                <dt className="text-slate-500">Application</dt>
                                <dd className="font-semibold">{dash(form.application_type)}</dd>
                                <dt className="text-slate-500">Location</dt>
                                <dd className="font-semibold">{barangay ? `Brgy. ${barangay}, Rosario, Batangas` : "—"}</dd>
                                {form.application_stream === "amendment" && (
                                    <>
                                        <dt className="text-slate-500">Target zoning</dt>
                                        <dd className="font-semibold">{dash(form.target_land_use_class)}</dd>
                                    </>
                                )}
                            </dl>
                        </section>

                        <section>
                            <h3 className="text-[7pt] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-300 mb-1">Lots</h3>
                            <table className="w-full text-[7.5pt]">
                                <thead>
                                    <tr className="text-left text-slate-500">
                                        <th className="font-semibold pr-1">Lot</th>
                                        <th className="font-semibold pr-1">PIN / Lot No.</th>
                                        <th className="font-semibold pr-1 text-right">Area</th>
                                        <th className="font-semibold text-right">CLUP</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lots.map((l) => {
                                        const check = areaCheck(l.parcel.lot_area_sqm, l.feature);
                                        return (
                                            <tr key={l.code} className="align-top border-t border-slate-200">
                                                <td className="font-bold pr-1">{l.code}</td>
                                                <td className="pr-1">
                                                    <span className="font-mono">{l.parcel.property_index_number}</span>
                                                    <span className="block text-slate-500">{dash(l.parcel.lot_number)}</span>
                                                </td>
                                                <td className="pr-1 text-right whitespace-nowrap">
                                                    {l.parcel.lot_area_sqm ? `${Number(l.parcel.lot_area_sqm).toLocaleString()} m²` : "—"}
                                                    {check?.flagged && <span className="block text-amber-700">map {formatAreaDiff(check.diff)}</span>}
                                                </td>
                                                <td className="text-right font-semibold">{dash(l.parcel.land_use_class)}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </section>

                        <section>
                            <h3 className="text-[7pt] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-300 mb-1">Legend</h3>
                            <ul className="space-y-0.5">
                                <li className="flex items-center gap-1.5">
                                    <span className="w-4 h-2.5 border-2 shrink-0" style={{ borderColor: LOT_STYLE.color, background: "rgba(253,224,71,0.25)" }} aria-hidden="true" />
                                    Subject lot(s)
                                </li>
                                {legendZones.map((z) => (
                                    <li key={z.code} className="flex items-center gap-1.5">
                                        <span className="w-4 h-2.5 border shrink-0" style={{ background: z.fill, borderColor: z.stroke }} aria-hidden="true" />
                                        <span>
                                            <b>{z.code}</b> {z.label !== z.code && `· ${z.label}`}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>

                        <p className="text-[6.5pt] text-slate-500 mt-auto">
                            Zoning per CLUP 2030 of the Municipality of Rosario. Lot boundaries from the municipal tax map, for reference only.
                            {scale ? ` Map scale approx. 1:${scale.toLocaleString()} at print size.` : ""}
                        </p>

                        <div className="grid grid-cols-2 gap-3 pt-5">
                            <div className="text-center">
                                <div className="border-t border-slate-900 pt-0.5 font-semibold">{dash(preparedBy)}</div>
                                <div className="text-[7pt] text-slate-500">Prepared by</div>
                            </div>
                            <div className="text-center">
                                <div className="border-t border-slate-900 pt-0.5">&nbsp;</div>
                                <div className="text-[7pt] text-slate-500">Zoning Administrator</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
