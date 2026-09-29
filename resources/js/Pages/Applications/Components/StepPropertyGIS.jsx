// resources/js/Pages/Applications/Components/StepPropertyGIS.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, Polyline, Polygon, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Input } from "./FormControls";
import Swal from "sweetalert2";
import { getZoneInfo, ZONE_CATEGORY_LEGEND } from "@/utils/clupZones";
import { resolveBarangayName } from "@/utils/mapData";
import {
    MAP_MAX_ZOOM,
    BASEMAPS,
    CLUP_TILES,
    BLANK_TILE,
    formatDistance,
    formatArea,
    zoneCodeOf,
    geodesicArea,
    featureContains,
    labelPoint,
    insidePoint,
    areaCheck,
    formatAreaDiff,
} from "@/utils/mapGeometry";
import { PARCEL_FIELD_ALIASES, BARANGAY_LINE,PARCEL_MIN_ZOOM, ZONE_LINE_MIN_ZOOM, UNLABELLED_ZONES, NO_LABELS, CHECK_COLORS, buildMapTip, ScaleBar, MapLabels, getZoningCheck, MeasureLayer, IdentifyClick, MapResizeTrigger, MapStatusBar, ToolButton, LayerRow, AreaComparison, Attr } from "@/Components/MapKit";


// QGIS-style locator bar: search lots by PIN / lot no. / owner, or jump to a barangay. Ctrl+K focuses it.
function Locator({ parcelIndex, brgyIndex, attachedCodes, onPickParcel, onPickBarangay, onLookupPin }) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState(false);
    const [hi, setHi] = useState(0);
    const inputRef = useRef(null);
    const boxRef = useRef(null);

    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
                e.preventDefault();
                inputRef.current?.focus();
                setOpen(true);
            }
        };
        const onDown = (e) => boxRef.current && !boxRef.current.contains(e.target) && setOpen(false);
        window.addEventListener("keydown", onKey);
        document.addEventListener("mousedown", onDown);
        return () => {
            window.removeEventListener("keydown", onKey);
            document.removeEventListener("mousedown", onDown);
        };
    }, []);

    const results = useMemo(() => {
        const query = q.trim().toLowerCase();
        if (query.length < 2) return [];
        const items = [];
        for (const p of parcelIndex) {
            if (!p.hay.includes(query)) continue;
            items.push({ type: "parcel", key: `p-${p.pin}`, title: p.pin, sub: [p.lot, p.owner, p.brgy].filter(Boolean).join(" · "), item: p });
            if (items.length >= 6) break;
        }
        brgyIndex
            .filter((b) => b.hay.includes(query))
            .slice(0, 3)
            .forEach((b) => items.push({ type: "brgy", key: `b-${b.key}`, title: `Brgy. ${b.name}`, sub: "Zoom to barangay", item: b }));
        const exact = parcelIndex.some((p) => p.pin.toLowerCase() === query);
        if (/\d/.test(query) && query.length >= 6 && !exact) {
            items.push({ type: "lookup", key: "lookup", title: `Look up PIN “${q.trim()}”`, sub: "Not on the map — search Assessor records" });
        }
        return items;
    }, [q, parcelIndex, brgyIndex]);

    useEffect(() => setHi(0), [q]);

    const choose = (r) => {
        if (!r) return;
        if (r.type === "parcel") onPickParcel(r.item.feature);
        else if (r.type === "brgy") onPickBarangay(r.item.feature);
        else onLookupPin(q.trim());
        setOpen(false);
        if (r.type !== "lookup") setQ(r.type === "parcel" ? r.title : "");
    };

    const showList = open && q.trim().length >= 2;

    return (
        <div ref={boxRef} className="relative w-72 max-w-[40vw]">
            <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
                ref={inputRef}
                type="search"
                value={q}
                onChange={(e) => {
                    setQ(e.target.value);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setHi((h) => Math.min(h + 1, results.length - 1));
                    } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setHi((h) => Math.max(h - 1, 0));
                    } else if (e.key === "Enter") {
                        e.preventDefault();
                        choose(results[hi]);
                    } else if (e.key === "Escape") {
                        setOpen(false);
                    }
                }}
                data-no-advance="true"
                role="combobox"
                aria-expanded={showList}
                aria-controls="map-locator-results"
                aria-activedescendant={showList && results[hi] ? `locator-${results[hi].key}` : undefined}
                aria-label="Search PIN, lot number, owner or barangay"
                placeholder="Search PIN, lot, owner, barangay…  Ctrl+K"
                className="w-full h-7 pl-7 pr-2 rounded-md border border-slate-300 bg-white text-[11px] text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
            />
            {showList && (
                <ul id="map-locator-results" role="listbox" className="absolute left-0 right-0 top-full mt-1 z-50 max-h-80 overflow-y-auto bg-white border border-slate-300 rounded-md shadow-lg py-1">
                    {results.length === 0 ? (
                        <li className="px-3 py-2 text-[11px] text-slate-400">No matching lot or barangay</li>
                    ) : (
                        results.map((r, i) => (
                            <li
                                key={r.key}
                                id={`locator-${r.key}`}
                                role="option"
                                aria-selected={i === hi}
                                onMouseEnter={() => setHi(i)}
                                onMouseDown={(e) => {
                                    e.preventDefault();
                                    choose(r);
                                }}
                                className={`px-3 py-1.5 cursor-pointer ${i === hi ? "bg-slate-100" : ""}`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 w-10 shrink-0">
                                        {r.type === "parcel" ? "Lot" : r.type === "brgy" ? "Brgy" : "Lookup"}
                                    </span>
                                    <span className={`text-[11px] font-semibold text-slate-800 truncate ${r.type === "parcel" ? "font-mono" : ""}`}>{r.title}</span>
                                    {r.type === "parcel" && attachedCodes[r.item.pin] && (
                                        <span className="ml-auto text-[10px] text-slate-500 shrink-0">✓ {attachedCodes[r.item.pin]}</span>
                                    )}
                                </div>
                                <p className="pl-12 text-[10px] text-slate-500 truncate">{r.sub}</p>
                            </li>
                        ))
                    )}
                </ul>
            )}
        </div>
    );
}

// Fields filled by a PIN lookup; cleared whenever the PIN changes so stale data never stays "verified".
const LOOKUP_RESET = {
    is_verified: false,
    owner_name: "",
    cadastral_zone: "",
    land_use_class: "",
    lot_number: "",
    survey_number: "",
    arp_number: "",
    tct_number: "",
    tax_dec_number: "",
    lot_area_sqm: "",
    barangay: "",
    coordinates: "",
};

export default function StepPropertyGIS({
    form,
    setForm,
    setParcelField,
    addParcel,
    removeParcel,
    handlePinLookup,
    pinLoading = {},
    errors = {},
    totalLotArea = 0,
    activeParcelIndex = 0,
    setActiveParcelIndex = () => {},
    activeParcelFeature = null,
    setActiveParcelFeature = () => {},
    brgyMapData = null,
    parcelMapData = null,
    rosarioCenter = [13.8475, 121.2058],
    getParcelStyle,
    handleSelectMapParcel,
    MapController,
    handleNext,
    formRef,
    onPrintSiteMap,
}) {
    const [map, setMap] = useState(null);
    const [tool, setTool] = useState("identify");
    const isMeasuring = tool === "measure" || tool === "measureArea";
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [layersOpen, setLayersOpen] = useState(true);
    const [basemap, setBasemap] = useState("satellite");
    const [showClup, setShowClup] = useState(true);
    const [clupOpacity, setClupOpacity] = useState(0.4);
    const [showBarangays, setShowBarangays] = useState(true);
    const [showParcels, setShowParcels] = useState(true);
    const [showZoneLines, setShowZoneLines] = useState(true);
    const [zoneData, setZoneData] = useState(null); // { key, name, data } for the barangay in focus
    const zoneCache = useRef(new Map());
    // Once unlocked the parcel panel stays for the session: by the first verified lot, by manual encoding
    // (PIN missing from the tax map), or for restored drafts that already carry a PIN.
    const [panelUnlocked, setPanelUnlocked] = useState(() => (form.parcels || []).some((p) => p.property_index_number?.trim()));
    const [pendingEncode, setPendingEncode] = useState(null);
    const [lastLookupIndex, setLastLookupIndex] = useState(null);
    const [guideDismissed, setGuideDismissed] = useState(false);
    const [dockTab, setDockTab] = useState("layers");
    const [identify, setIdentify] = useState(null);
    const [measure, setMeasure] = useState(null);
    const [zoom, setZoom] = useState(12);
    const identifyHitRef = useRef(null);
    const identifyMarkerRef = useRef(null);
    const identifySeq = useRef(0);
    const parcelLayerRef = useRef(null);
    const parcelStyleRef = useRef(getParcelStyle);
    parcelStyleRef.current = getParcelStyle;
    // Stable identity: react-leaflet re-applies setStyle to every polygon whenever the style prop changes
    const stableParcelStyle = useCallback((feature) => parcelStyleRef.current(feature), []);

    // Label anchors computed once per dataset
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

    // Search indexes for the locator
    const parcelIndex = useMemo(
        () =>
            (parcelMapData?.features || [])
                .map((f) => {
                    const p = f.properties || {};
                    const pin = p.property_index_number?.trim();
                    if (!pin) return null;
                    const lot = p.lot_number || "";
                    const owner = p.owner_name || "";
                    const brgy = p.barangay || "";
                    return { pin, lot, owner, brgy, feature: f, hay: `${pin} ${lot} ${owner} ${brgy}`.toLowerCase() };
                })
                .filter(Boolean),
        [parcelMapData]
    );
    const brgyIndex = useMemo(
        () =>
            (brgyMapData?.features || [])
                .map((f, i) => {
                    const name = resolveBarangayName(f.properties);
                    return name ? { key: `${name}-${i}`, name, feature: f, hay: name.toLowerCase() } : null;
                })
                .filter(Boolean),
        [brgyMapData]
    );

    // One shared map tip (QGIS "Map Tips") instead of a tooltip bound to every polygon
    const mapTipRef = useRef(null);
    if (!mapTipRef.current) mapTipRef.current = L.tooltip({ direction: "top", offset: [0, -10], opacity: 0.95 });

    const parcels = form.parcels || [];
    const selectedIndex = Math.min(activeParcelIndex ?? 0, Math.max(parcels.length - 1, 0));
    const selectedParcel = parcels[selectedIndex];
    const isVerifying = Object.values(pinLoading || {}).some(Boolean);

    const isAmendmentStream = form.application_stream === "amendment";

    // Any parcel with a verified Assessor-vs-CLUP mismatch blocks progression outside the amendment stream
    const isProgressionLocked = parcels.some((p) => {
        const cadastral = p.cadastral_zone?.trim().toLowerCase();
        const clup = p.land_use_class?.trim().toLowerCase();
        return p.is_verified && cadastral && clup && cadastral !== clup;
    }) && !isAmendmentStream;

    const verifiedCount = parcels.filter((p) => p.is_verified).length;

    // The parcel panel stays hidden until a lot is verified (or manual encoding is chosen); until then the map is full screen
    const showPanel = verifiedCount > 0 || panelUnlocked;
    const mapFull = !showPanel || isMapExpanded;

    // Next parcel to encode: the first unverified one, otherwise a new parcel
    const nextTargetIndex = parcels.findIndex((p) => !p.is_verified);
    const nextTargetCode =
        nextTargetIndex === -1
            ? `P-${String(parcels.length + 1).padStart(2, "0")}`
            : parcels[nextTargetIndex].parcel_code || `P-${String(nextTargetIndex + 1).padStart(2, "0")}`;
    const attachedCodes = useMemo(() => {
        const codes = {};
        parcels.forEach((p, i) => {
            const pin = p.property_index_number?.trim();
            if (pin && p.is_verified) codes[pin] = p.parcel_code || `P-${String(i + 1).padStart(2, "0")}`;
        });
        return codes;
    }, [parcels]);
    const lookupError = lastLookupIndex != null ? errors[`parcels.${lastLookupIndex}.property_index_number`] : null;
    // Pressing Next/Enter before any lot is verified: the panel is hidden, so explain on the map
    const stepBlocked = !showPanel && Object.keys(errors).some((k) => k === "barangay" || k.startsWith("parcels"));

    // Map layer click handlers are bound once per GeoJSON mount, so read live values through a ref
    const latest = useRef({});
    latest.current = { parcels, tool, map };

    useEffect(() => {
        if (verifiedCount > 0) setPanelUnlocked(true);
    }, [verifiedCount]);

    useEffect(() => {
        if (lastLookupIndex != null && parcels[lastLookupIndex]?.is_verified) setLastLookupIndex(null);
    }, [parcels, lastLookupIndex]);

    // Encoding runs once the target parcel exists and is selected in Create.jsx's state,
    // because handleSelectMapParcel / handlePinLookup read that state from their own closures.
    useEffect(() => {
        if (!pendingEncode) return;
        const target = parcels[pendingEncode.index];
        if (!target) return;
        if (pendingEncode.type === "pin") {
            if (target.property_index_number !== pendingEncode.pin) return;
            setPendingEncode(null);
            handlePinLookup(pendingEncode.index);
        } else {
            if (activeParcelIndex !== pendingEncode.index) return;
            setPendingEncode(null);
            const p = pendingEncode.feature.properties || {};
            handleSelectMapParcel(p.property_index_number?.trim(), p.lot_number || p.lot_no, p.lot_area_sqm || p.area, p.barangay, pendingEncode.feature);
        }
    }, [pendingEncode, parcels, activeParcelIndex]);

    const startEncode = (payload) => {
        let index = nextTargetIndex;
        if (index === -1) {
            addParcel();
            index = parcels.length;
        }
        setActiveParcelIndex(index);
        if (payload.type === "pin") setParcelField(index, "property_index_number")({ target: { value: payload.pin } });
        setLastLookupIndex(index);
        setPendingEncode({ ...payload, index });
    };

    useEffect(() => {
        if (map) map.getContainer().style.cursor = tool === "pan" ? "" : "crosshair";
    }, [map, tool]);

    // Restyle the existing parcel layer on selection instead of rebuilding every polygon
    const activePin = activeParcelFeature?.properties?.property_index_number;
    const showParcelLayer = showParcels && zoom >= PARCEL_MIN_ZOOM;
    useEffect(() => {
        const layer = parcelLayerRef.current;
        if (!layer) return;
        mapTipRef.current.close();
        layer.setStyle(parcelStyleRef.current);
        layer.eachLayer((l) => {
            if (activePin && l.feature?.properties?.property_index_number === activePin) l.bringToFront();
        });
        // Canvas hands a click to the last-drawn shape, so keep the Identify marker above re-added / raised lots
        identifyMarkerRef.current?.bringToFront();
    }, [activePin, showParcelLayer, parcelMapData]);

    // Zoom drives which layers are worth drawing; only updated when a zoom finishes
    useEffect(() => {
        if (!map) return;
        const onZoom = () => setZoom(map.getZoom());
        onZoom();
        map.on("zoomend", onZoom);
        return () => map.off("zoomend", onZoom);
    }, [map]);

    // Parcels in this application, drawn at every zoom with their zoning-check colour
    const featureByPin = useMemo(() => new Map(parcelIndex.map((p) => [p.pin, p.feature])), [parcelIndex]);
    const attached = useMemo(
        () =>
            parcels
                .map((p, i) => {
                    const pin = p.property_index_number?.trim();
                    const feature = p.is_verified && pin ? featureByPin.get(pin) : null;
                    if (!feature) return null;
                    const check = getZoningCheck(p, isAmendmentStream);
                    return { index: i, pin, code: p.parcel_code || `P-${String(i + 1).padStart(2, "0")}`, feature, check };
                })
                .filter(Boolean),
        [parcels, featureByPin, isAmendmentStream]
    );
    const attachedData = useMemo(
        () => ({
            type: "FeatureCollection",
            features: attached.map((a) => ({ ...a.feature, properties: { ...a.feature.properties, __check: a.check.key } })),
        }),
        [attached]
    );
    const attachedKey = attached.map((a) => `${a.pin}:${a.check.key}`).join("|");
    const attachedBadges = useMemo(
        () =>
            attached
                .map((a) => {
                    const latlng = labelPoint(a.feature.geometry);
                    return latlng ? { key: a.pin, text: `${a.code} · ${a.check.label}`, latlng, color: CHECK_COLORS[a.check.key] } : null;
                })
                .filter(Boolean),
        [attached]
    );

    // Keep CLUP tile requests inside the municipality instead of 404-ing on every tile beyond it
    const municipalBounds = useMemo(() => {
        if (!brgyMapData) return null;
        const b = L.geoJSON(brgyMapData).getBounds();
        return b.isValid() ? b.pad(0.05) : null;
    }, [brgyMapData]);

    // QGIS Identify: parcel attributes (if a lot was hit) plus the CLUP zone under the clicked point
    const handleIdentify = (latlng, feature) => {
        const seq = ++identifySeq.current;
        setIdentify({ latlng, feature, zone: undefined });
        setDockTab("identify");
        setLayersOpen(true);
        if (feature) zoomToLot(feature);
        fetch(`/api/map/zoning-lookup?lat=${latlng.lat}&lng=${latlng.lng}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, zone: data?.lup_2030 ?? null })))
            .catch(() => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, zone: null, zoneFailed: true })));

        // Same area-overlap lookup the encoder uses, so the preview matches the check the parcel will get
        const pin = feature?.properties?.property_index_number?.trim();
        if (!pin) return;
        fetch(`/api/map/zoning-area-lookup?pin=${encodeURIComponent(pin)}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, areaZone: data?.lup_2030 ?? null })))
            .catch(() => seq === identifySeq.current && setIdentify((prev) => ({ ...prev, areaZone: null })));
    };

    // Mirrors Create.jsx handleSelectMapParcel: CLUP falls back to the Assessor class, then "Unmapped in CLUP"
    // Barangay containing the identified point (shown in Identify Results; the red marker zooms to it)
    const identifyBrgy = useMemo(
        () => (identify ? brgyIndex.find((b) => featureContains(b.feature, identify.latlng)) || null : null),
        [identify?.latlng, brgyIndex]
    );

    // Exact zone boundaries for the barangay being worked in: the identified point's, else the selected lot's
    const focusBarangay = identifyBrgy?.name || selectedParcel?.barangay?.trim() || form.barangay?.trim() || "";
    useEffect(() => {
        if (!showZoneLines || !focusBarangay) return;
        const key = focusBarangay.toLowerCase();
        if (zoneCache.current.has(key)) {
            setZoneData({ key, name: focusBarangay, data: zoneCache.current.get(key) });
            return;
        }
        let cancelled = false;
        fetch(`/api/map/land_use_plan?barangay=${encodeURIComponent(focusBarangay)}`, { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then((data) => {
                zoneCache.current.set(key, data);
                if (!cancelled) setZoneData({ key, name: focusBarangay, data });
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [focusBarangay, showZoneLines]);

    const zoneLabels = useMemo(
        () =>
            (zoneData?.data?.features || [])
                .map((f, i) => {
                    const code = zoneCodeOf(f.properties);
                    const latlng = code && !UNLABELLED_ZONES.has(code) ? insidePoint(f) : null;
                    return latlng ? { key: `${zoneData.key}-${i}`, text: code, latlng } : null;
                })
                .filter(Boolean),
        [zoneData]
    );

    const identifyPreview = (() => {
        if (!identify?.feature || identify.areaZone === undefined) return null;
        const assessor = identify.feature.properties?.land_use_class || "";
        const clup = identify.areaZone || assessor || "Unmapped in CLUP";
        return { assessor, clup, check: getZoningCheck({ is_verified: true, cadastral_zone: assessor, land_use_class: clup }, isAmendmentStream) };
    })();

    // When validation adds errors (not when the user clears them), bring the first failing parcel into view
    const prevErrorCount = useRef(0);
    useEffect(() => {
        const keys = Object.keys(errors).filter((k) => k.startsWith("parcels") || k === "barangay");
        const grew = keys.length > prevErrorCount.current;
        prevErrorCount.current = keys.length;
        if (!grew) return;
        setGuideDismissed(false);
        const firstParcelError = keys.find((k) => k.startsWith("parcels."));
        if (firstParcelError) {
            const idx = Number(firstParcelError.split(".")[1]);
            if (!Number.isNaN(idx)) setActiveParcelIndex(idx);
        }
    }, [errors]);

    const findFeatureByPin = (pin) =>
        pin && parcelMapData?.features
            ? parcelMapData.features.find((f) => f.properties?.property_index_number?.trim() === pin.trim()) || null
            : null;

    const fitGeoJSON = (data, padding = 30, maxZoom = 18) => {
        if (!map || !data) return;
        const bounds = L.geoJSON(data).getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [padding, padding], maxZoom });
    };

    // Zoom to a lot without zooming out when the officer is already closer in
    const zoomToLot = (feature) => fitGeoJSON(feature, 80, Math.max(map?.getZoom() ?? 18, 18));

    const selectParcel = (index) => {
        setActiveParcelIndex(index);
        setActiveParcelFeature(findFeatureByPin(parcels[index]?.property_index_number));
    };

    const handleRemoveParcel = (index) => {
        removeParcel(index);
        // Create.jsx clears the selection only when the removed parcel was selected; keep later selections aligned
        if (activeParcelIndex != null && index < activeParcelIndex) setActiveParcelIndex(activeParcelIndex - 1);
    };

    const handleAddParcel = () => {
        addParcel();
        setActiveParcelIndex(parcels.length);
        setActiveParcelFeature(null);
    };

    const handlePinChange = (index, value) => {
        if (!value.trim() || parcels[index]?.is_verified) {
            setForm((prev) => ({
                ...prev,
                parcels: prev.parcels.map((p, i) => (i === index ? { ...p, ...LOOKUP_RESET, property_index_number: value } : p)),
            }));
            if (selectedIndex === index) setActiveParcelFeature(null);
        } else {
            setParcelField(index, "property_index_number")({ target: { value } });
        }
    };

    // Identify only inspects (encoding is an explicit "Use as P-0x" action); a lot already in the application gets selected
    const handleMapFeatureClick = (feature) => {
        const { parcels: current, tool: activeTool } = latest.current;
        if (activeTool !== "identify") return;
        const pin = (feature?.properties?.property_index_number || "").trim();
        const existing = pin ? current.findIndex((row) => row.property_index_number?.trim() === pin) : -1;
        if (existing !== -1) {
            setActiveParcelIndex(existing);
            setActiveParcelFeature(feature);
        }
    };

    // QGIS "flash feature": blink the located geometry a few times
    const flashFeature = (feature) => {
        if (!map || !feature) return;
        const flash = L.geoJSON(feature, { interactive: false, style: { color: "#dc2626", weight: 4, fillColor: "#dc2626", fillOpacity: 0.15 } }).addTo(map);
        let ticks = 0;
        const timer = setInterval(() => {
            ticks += 1;
            flash.setStyle({ opacity: ticks % 2 ? 0 : 1, fillOpacity: ticks % 2 ? 0 : 0.15 });
            if (ticks >= 6) {
                clearInterval(timer);
                flash.remove();
            }
        }, 220);
    };

    const locateParcel = (feature) => {
        flashFeature(feature);
        const point = labelPoint(feature.geometry);
        if (point) handleIdentify(point, feature);
    };

    const locateBarangay = (feature) => {
        fitGeoJSON(feature, 20);
        flashFeature(feature);
    };

    const handleSwitchStream = async (newType, parcelIndex) => {
        // Amendment files carry only the triggering parcel, renumbered as P-01 — confirm before dropping the rest
        const dropped = parcels.filter((_, i) => i !== parcelIndex).map((p, i) => p.parcel_code || `P-${String(i + 1).padStart(2, "0")}`);
        const list = document.createElement("div");
        const intro = document.createElement("p");
        intro.textContent = `This application will become a ${newType}, covering only ${parcels[parcelIndex]?.parcel_code || "this lot"}.`;
        list.append(intro);
        if (dropped.length) {
            const warn = document.createElement("p");
            warn.style.marginTop = "0.5rem";
            warn.textContent = `${dropped.join(", ")} will be removed from this application. File them separately if they still need a clearance.`;
            list.append(warn);
        }
        const { isConfirmed } = await Swal.fire({
            title: `Switch to ${newType}?`,
            html: list,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Switch",
            cancelButtonText: "Cancel",
            focusCancel: true,
        });
        if (!isConfirmed) return;

        const triggeringParcel = { ...form.parcels[parcelIndex], parcel_code: "P-01" };
        setForm((prev) => ({
            ...prev,
            application_stream: "amendment",
            application_type: newType,
            parcels: [triggeringParcel],
        }));
        setActiveParcelIndex(0);
    };

    const statusMessage = tool === "measure" ? (
        measure && measure.count > 1
            ? `Measure: total ${formatDistance(measure.total)} · last segment ${formatDistance(measure.last)} · right-click or Esc to clear`
            : "Measure line: click to add points"
    ) : tool === "measureArea" ? (
        measure && measure.count > 2
            ? `Area ${formatArea(measure.area)} · perimeter ${formatDistance(measure.total)} · right-click or Esc to clear`
            : "Measure area: click at least 3 corners"
    ) :!parcelMapData ? (
        <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            Loading land parcels…
        </span>
    ) : isVerifying || pendingEncode ? (
        <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-3 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            Checking PIN against municipal records…
        </span>
    ) : tool === "identify" && showParcels && zoom < PARCEL_MIN_ZOOM ? (
        "Zoom in to see individual lots, or search a PIN (Ctrl+K)"
    ) : tool === "identify" ? (
        `Identify: click a lot, or search a PIN (Ctrl+K) · ${verifiedCount} of ${parcels.length} parcel${parcels.length === 1 ? "" : "s"} verified`
    ) : selectedParcel?.is_verified ? (
        `Selected ${selectedParcel.parcel_code} · ${selectedParcel.property_index_number}`
    ) : (
        "Pan: drag to move the map"
    );

    return (
        <div className="relative w-full h-full flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* ── LEFT: GIS MAP (QGIS-style canvas) ── */}
            <div
                className={`bg-slate-200 relative overflow-hidden flex flex-col ${
                    mapFull ? "w-full h-full flex-1" : "hidden lg:flex lg:w-[58%] w-full h-full border-r border-slate-300"
                }`}
            >
                {/* Map toolbar */}
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
                        <circle cx="4.5" cy="7.5" r="1.2" fill="currentColor" />
                        <circle cx="10.5" cy="3.75" r="1.2" fill="currentColor" />
                        <circle cx="19.5" cy="8.25" r="1.2" fill="currentColor" />
                        <circle cx="18" cy="18" r="1.2" fill="currentColor" />
                        <circle cx="7.5" cy="19.5" r="1.2" fill="currentColor" />
                    </ToolButton>
                    <span className="w-px h-5 bg-slate-300 mx-1" />
                    <ToolButton label="Zoom in" onClick={() => map?.zoomIn()}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM10.5 7.5v6m3-3h-6" />
                    </ToolButton>
                    <ToolButton label="Zoom out" onClick={() => map?.zoomOut()}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607zM13.5 10.5h-6" />
                    </ToolButton>
                    <ToolButton label="Zoom full (municipality)" onClick={() => (brgyMapData ? fitGeoJSON(brgyMapData) : map?.setView(rosarioCenter, 12))}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </ToolButton>
                    <ToolButton label="Zoom to selected lot" disabled={!activeParcelFeature} onClick={() => fitGeoJSON(activeParcelFeature, 60)}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </ToolButton>
                    <span className="w-px h-5 bg-slate-300 mx-1" />
                    <ToolButton label={attached.length ? "Print site & zoning map" : "Print site map (attach a lot first)"} disabled={!attached.length || !onPrintSiteMap} onClick={onPrintSiteMap}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" />
                    </ToolButton>

                    <span className="w-px h-5 bg-slate-300 mx-1" />
                    <Locator
                        parcelIndex={parcelIndex}
                        brgyIndex={brgyIndex}
                        attachedCodes={attachedCodes}
                        onPickParcel={locateParcel}
                        onPickBarangay={locateBarangay}
                        onLookupPin={(pin) => startEncode({ type: "pin", pin })}
                    />

                    <div className="ml-auto flex items-center gap-1">
                        {showPanel ? (
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded((prev) => !prev)}
                                className="h-7 px-2.5 rounded-md text-[11px] font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
                            >
                                {isMapExpanded ? "Show parcels" : "Maximize"}
                            </button>
                        ) : (
                            <span className="hidden xl:inline text-[11px] text-slate-500 mr-1">Step 1 of 5 · Property Map & Zoning</span>
                        )}
                    </div>
                </div>

                <div className="relative flex-1 min-h-0">
                    {/* Leaflet's bottom controls (scale bar) sit above the status bar */}
                    <div className="absolute inset-0 z-0 [&_.leaflet-bottom]:bottom-7">
                        {/* preferCanvas: one canvas for all parcels instead of an SVG node per polygon */}
                        <MapContainer
                            ref={setMap}
                            center={rosarioCenter}
                            zoom={12}
                            maxZoom={MAP_MAX_ZOOM}
                            preferCanvas={true}
                            zoomControl={false}
                            attributionControl={false}
                            scrollWheelZoom={true}
                        >
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
                                    key={municipalBounds ? "clup-bounded" : "clup"}
                                    bounds={municipalBounds || undefined}
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

                            {showZoneLines && zoneData && zoom >= ZONE_LINE_MIN_ZOOM && (
                                <>
                                    <GeoJSON key={`${zoneData.key}-casing`} data={zoneData.data} interactive={false} style={{ color: "#0f172a", weight: 4, opacity: 0.45, fill: false }} />
                                    <GeoJSON
                                        key={`${zoneData.key}-line`}
                                        data={zoneData.data}
                                        interactive={false}
                                        style={(f) => ({ color: getZoneInfo(zoneCodeOf(f.properties)).stroke, weight: 2, opacity: 1, fill: false })}
                                    />
                                </>
                            )}

                            {showBarangays && brgyMapData && (
                                <GeoJSON data={brgyMapData} style={BARANGAY_LINE} smoothFactor={BARANGAY_LINE.smoothFactor} interactive={false} />
                            )}
                            {showParcelLayer && parcelMapData && (
                                <GeoJSON
                                    ref={parcelLayerRef}
                                    data={parcelMapData}
                                    style={stableParcelStyle}
                                    onEachFeature={(feature, layer) => {
                                        layer.on({
                                            click: () => {
                                                identifyHitRef.current = feature;
                                                setTimeout(() => handleMapFeatureClick(feature), 10);
                                            },
                                            mouseover: (e) => {
                                                const { tool: activeTool, map: m } = latest.current;
                                                if (activeTool === "measure" || activeTool === "measureArea" || !m) return;
                                                layer.setStyle({ weight: 3, color: "#0f172a" });
                                                mapTipRef.current.setLatLng(e.latlng).setContent(buildMapTip(feature.properties || {})).openOn(m);
                                            },
                                            mousemove: (e) => mapTipRef.current.isOpen() && mapTipRef.current.setLatLng(e.latlng),
                                            mouseout: () => {
                                                layer.setStyle(parcelStyleRef.current(feature));
                                                mapTipRef.current.close();
                                            },
                                        });
                                    }}
                                />
                            )}
                            {showParcels && attached.length > 0 && (
                                <GeoJSON
                                    key={attachedKey}
                                    data={attachedData}
                                    interactive={false}
                                    style={(f) => {
                                        const color = CHECK_COLORS[f.properties.__check] || CHECK_COLORS.unverified;
                                        return { color, weight: 3, opacity: 1, fillColor: color, fillOpacity: zoom >= PARCEL_MIN_ZOOM ? 0.08 : 0.45 };
                                    }}
                                />
                            )}
                            <IdentifyClick active={tool === "identify"} hitRef={identifyHitRef} onIdentify={handleIdentify} />
                            <MeasureLayer key={tool} active={isMeasuring} mode={tool === "measureArea" ? "area" : "line"} onMeasure={setMeasure} />
                            {tool === "identify" && identify && (
                                <CircleMarker
                                    ref={identifyMarkerRef}
                                    key={`${identify.latlng.lat},${identify.latlng.lng}-${identify.feature ? "lot" : "point"}`}
                                    center={identify.latlng}
                                    radius={9}
                                    // Transparent fill so the whole ring is clickable, not just its outline
                                    pathOptions={{ color: "#dc2626", weight: 2.5, fillColor: "#dc2626", fillOpacity: 0.08 }}
                                    interactive={Boolean(identify.feature)}
                                    eventHandlers={{
                                        click: (e) => {
                                            // Don't let the map treat this as a new Identify click
                                            L.DomEvent.stopPropagation(e);
                                            if (identify.feature) zoomToLot(identify.feature);
                                        },
                                    }}
                                >
                                    {identify.feature && (
                                        <Tooltip direction="top" offset={[0, -10]}>
                                            Zoom to this lot
                                        </Tooltip>
                                    )}
                                </CircleMarker>
                            )}
                            <ScaleBar />
                            {MapController && <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />}
                            <MapResizeTrigger watch={mapFull} />
                        </MapContainer>
                    </div>

                    {/* Layers panel (docked, like QGIS) */}
                    {layersOpen && (
                        <div className="absolute top-0 left-0 bottom-7 z-10 w-72 bg-white/95 backdrop-blur-sm border-r border-slate-300 flex flex-col text-slate-700">
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
                                <button
                                    type="button"
                                    onClick={() => setLayersOpen(false)}
                                    aria-label="Close panel"
                                    className="mb-1 w-5 h-5 rounded flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-200 cursor-pointer"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {dockTab === "identify" ? (
                                <div className="flex-1 overflow-y-auto p-1.5 text-[11px]">
                                    {!identify ? (
                                        <div className="px-1.5 py-2 space-y-2 text-slate-500">
                                            <p>Click a lot with the Identify tool, or search its PIN in the toolbar.</p>
                                            <button type="button" onClick={() => setPanelUnlocked(true)} className="text-slate-700 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
                                                Lot not on the map? Encode the PIN manually
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Action: attach the identified lot to the application */}
                                            {identify.feature && (() => {
                                                const pin = identify.feature.properties?.property_index_number?.trim();
                                                const attached = pin && attachedCodes[pin];
                                                return (
                                                    <div className="m-1 mb-2 p-2.5 rounded-md border border-slate-300 bg-slate-50">
                                                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Identified lot</p>
                                                        <p className="font-mono font-semibold text-slate-900 text-xs break-all">{pin || "No PIN on this lot"}</p>
                                                        {pin && (
                                                            <div className="mt-2 pt-2 border-t border-slate-200">
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <span className="text-slate-500">Zoning check</span>
                                                                    {identifyPreview ? (
                                                                        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
                                                                            <span className="w-2 h-2 rounded-full" style={{ background: CHECK_COLORS[identifyPreview.check.key] }} aria-hidden="true" />
                                                                            {identifyPreview.check.label}
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-slate-400">Checking…</span>
                                                                    )}
                                                                </div>
                                                                {identifyPreview && (
                                                                    <p className="mt-0.5 text-[10px] text-slate-500">
                                                                        Assessor <b className="text-slate-700">{identifyPreview.assessor || "—"}</b> · CLUP <b className="text-slate-700">{identifyPreview.clup}</b>
                                                                    </p>
                                                                )}
                                                                {identifyPreview?.check.key === "mismatch" && !attached && (
                                                                    <p className="mt-1 text-[10px] text-amber-800">
                                                                        Using this lot will require a {identifyPreview.check.action.type === "Petition for Reclassification" ? "reclassification" : "rezoning"} petition.
                                                                    </p>
                                                                )}
                                                            </div>
                                                        )}
                                                        {pin && (
                                                            <div className="mt-2 pt-2 border-t border-slate-200 flex items-start justify-between gap-2">
                                                                <span className="text-slate-500 shrink-0">Area</span>
                                                                <span className="text-right text-slate-800 font-semibold">
                                                                    <AreaComparison declared={identify.feature.properties?.lot_area_sqm} feature={identify.feature} />
                                                                </span>
                                                            </div>
                                                        )}
                                                        {attached ? (
                                                            <p className="mt-1.5 text-slate-600">✓ Attached to this application as {attached}</p>
                                                        ) : pin ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => startEncode({ type: "map", feature: identify.feature })}
                                                                disabled={isVerifying || !!pendingEncode}
                                                                className="mt-2 w-full h-8 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                                                            >
                                                                {pendingEncode || isVerifying ? "Checking…" : `Use as ${nextTargetCode} for this application`}
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                );
                                            })()}
                                            <div className="px-1.5 pb-1.5 flex items-center justify-between gap-2">
                                                <span className="font-mono text-slate-500">
                                                    {identify.latlng.lat.toFixed(6)}, {identify.latlng.lng.toFixed(6)}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        const btn = e.currentTarget;
                                                        navigator.clipboard
                                                            ?.writeText(`${identify.latlng.lat.toFixed(6)}, ${identify.latlng.lng.toFixed(6)}`)
                                                            .then(() => {
                                                                btn.textContent = "Copied";
                                                                setTimeout(() => (btn.textContent = "Copy"), 1500);
                                                            })
                                                            .catch(() => {});
                                                    }}
                                                    className="text-[10px] font-semibold text-slate-500 underline underline-offset-2 hover:text-slate-900 cursor-pointer"
                                                >
                                                    Copy
                                                </button>
                                            </div>
                                            <details open className="mb-1">
                                                <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">Barangay boundaries</summary>
                                                <div className="px-1.5 pl-5 py-1 text-slate-800">
                                                    {identifyBrgy ? identifyBrgy.name : <i className="text-slate-400">Outside Rosario</i>}
                                                </div>
                                            </details>
                                            <details open className="mb-1">
                                                <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">CLUP 2030 zoning</summary>
                                                <div className="grid grid-cols-[84px_1fr] gap-x-2 px-1.5 pl-5 py-1">
                                                    <span className="text-slate-400">lup_2030</span>
                                                    <span className="font-medium text-slate-800 break-words">
                                                        {identify.zone === undefined ? (
                                                            "Loading…"
                                                        ) : identify.zoneFailed ? (
                                                            "Lookup failed"
                                                        ) : identify.zone ? (
                                                            <span className="inline-flex items-start gap-1.5">
                                                                <span
                                                                    className="mt-0.5 w-2.5 h-2.5 border shrink-0"
                                                                    style={{ background: getZoneInfo(identify.zone).fill, borderColor: getZoneInfo(identify.zone).stroke }}
                                                                    aria-hidden="true"
                                                                />
                                                                <span>
                                                                    {identify.zone}
                                                                    <span className="block text-slate-500 font-normal">{getZoneInfo(identify.zone).label}</span>
                                                                </span>
                                                            </span>
                                                        ) : (
                                                            <i className="text-slate-400">NULL</i>
                                                        )}
                                                    </span>
                                                </div>
                                            </details>
                                            {identify.feature ? (
                                                <details open>
                                                    <summary className="px-1.5 py-1 font-semibold text-slate-800 cursor-pointer hover:bg-slate-100 rounded">Land parcels</summary>
                                                    <dl className="px-1.5 pl-5 py-1 space-y-0.5">
                                                        {PARCEL_FIELD_ALIASES.filter(([k]) => k in (identify.feature.properties || {})).map(([k, label]) => {
                                                            const v = identify.feature.properties[k];
                                                            return (
                                                                <div key={k} className="grid grid-cols-[96px_1fr] gap-x-2">
                                                                    <dt className="text-slate-400">{label}</dt>
                                                                    <dd className={`text-slate-800 break-words ${k === "property_index_number" ? "font-mono" : ""}`}>
                                                                        {v === null || v === "" ? <i className="text-slate-400">NULL</i> : String(v)}
                                                                    </dd>
                                                                </div>
                                                            );
                                                        })}
                                                    </dl>
                                                    <details className="pl-3.5">
                                                        <summary className="px-1.5 py-1 text-slate-500 cursor-pointer hover:bg-slate-100 rounded">
                                                            All fields ({Object.keys(identify.feature.properties || {}).length})
                                                        </summary>
                                                        <dl className="px-1.5 pl-5 py-1 space-y-0.5">
                                                            {Object.entries(identify.feature.properties || {}).map(([k, v]) => (
                                                                <div key={k} className="grid grid-cols-[96px_1fr] gap-x-2">
                                                                    <dt className="text-slate-400 truncate font-mono text-[10px]" title={k}>{k}</dt>
                                                                    <dd className="text-slate-800 break-words">
                                                                        {v === null || v === "" ? <i className="text-slate-400">NULL</i> : String(v)}
                                                                    </dd>
                                                                </div>
                                                            ))}
                                                        </dl>
                                                    </details>
                                                </details>
                                            ) : (
                                                <p className="px-1.5 py-1 text-slate-400">No land parcel at this point.</p>
                                            )}
                                        </>
                                    )}
                                </div>
                            ) : (
                            <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                                <LayerRow checked={showParcels} onChange={setShowParcels} swatch="bg-blue-500/25 border-blue-600">
                                    Land parcels
                                </LayerRow>
                                <div className="pl-7 pb-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                                    <span className="w-2.5 h-2.5 bg-yellow-300/60 border border-yellow-400" aria-hidden="true" /> Selected lot
                                </div>
                                <LayerRow checked={showBarangays} onChange={setShowBarangays} swatch="bg-transparent border-slate-600">
                                    Barangay boundaries
                                </LayerRow>
                                <LayerRow checked={showZoneLines} onChange={setShowZoneLines} swatch="bg-transparent border-2 border-slate-700">
                                    Zoning boundaries (exact)
                                </LayerRow>
                                {showZoneLines && (
                                    <p className="pl-7 pb-1 text-[10px] text-slate-500">
                                        {!focusBarangay
                                            ? "Identify a point or select a lot to load its barangay"
                                            : zoom < ZONE_LINE_MIN_ZOOM
                                            ? `Brgy. ${focusBarangay} · zoom in to show`
                                            : zoneData?.key === focusBarangay.toLowerCase()
                                            ? `Brgy. ${focusBarangay} · ${zoneData.data?.features?.length || 0} zones`
                                            : `Loading Brgy. ${focusBarangay}…`}
                                    </p>
                                )}
                                <LayerRow checked={showClup} onChange={setShowClup} swatch="bg-gradient-to-br from-yellow-300 via-rose-400 to-fuchsia-500 border-slate-400">
                                    CLUP 2030 zoning
                                </LayerRow>
                                {showClup && (
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
                                )}
                                {showClup && (
                                    <ul className="pl-7 pr-2 pb-1.5 space-y-0.5" aria-label="CLUP zoning legend">
                                        {ZONE_CATEGORY_LEGEND.map((z) => (
                                            <li key={z.id} className="flex items-center gap-1.5 text-[10px] text-slate-600">
                                                <span className="w-3 h-2.5 border shrink-0" style={{ background: z.fill, borderColor: z.stroke }} aria-hidden="true" />
                                                {z.label}
                                            </li>
                                        ))}
                                    </ul>
                                )}

                                <div className="pt-1.5 mt-1 border-t border-slate-200" role="radiogroup" aria-label="Base map">
                                    {Object.entries(BASEMAPS).map(([key, b]) => (
                                        <label key={key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-100 cursor-pointer">
                                            <input
                                                type="radio"
                                                name="basemap"
                                                checked={basemap === key}
                                                onChange={() => setBasemap(key)}
                                                className="w-3.5 h-3.5 accent-slate-700 cursor-pointer"
                                            />
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
                        badges={showParcels ? attachedBadges : NO_LABELS}
                        zoneLabels={showZoneLines ? zoneLabels : NO_LABELS}
                        parcelLabels={parcelLabels}
                        brgyLabels={brgyLabels}
                        selectedPin={activePin}
                        showParcels={showParcels}
                        showBarangays={showBarangays}
                    />

                    {/* QGIS-style message bar */}
                    {(lookupError || stepBlocked || (!showPanel && !guideDismissed && !identify)) && !pendingEncode && !isVerifying && (
                        <div
                            role="status"
                            className={`absolute top-0 right-14 z-20 flex items-center gap-3 px-3 py-2 border-b border-x rounded-b-md text-[11px] shadow-sm ${
                                layersOpen ? "left-72" : "left-0"
                            } ${lookupError ? "bg-amber-50 border-amber-200 text-amber-900" : "bg-white/95 border-slate-300 text-slate-700"}`}
                        >
                            <span className="flex-1 min-w-0">
                                {lookupError ? (
                                    <>
                                        <b>PIN not found.</b> {lookupError}
                                    </>
                                ) : stepBlocked ? (
                                    <>
                                        <b>No lot verified yet.</b> Find the applicant's lot and choose <b>Use as {nextTargetCode}</b> before continuing.
                                    </>
                                ) : (
                                    <>
                                        <b>Find the applicant's lot.</b> Search its PIN (Ctrl+K) or click it with Identify, then choose <b>Use as {nextTargetCode}</b>.
                                    </>
                                )}
                            </span>
                            {lookupError && (
                                <button type="button" onClick={() => setPanelUnlocked(true)} className="shrink-0 h-6 px-2.5 rounded border border-amber-300 bg-white font-semibold hover:bg-amber-100 cursor-pointer">
                                    Encode manually
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => (lookupError ? setLastLookupIndex(null) : setGuideDismissed(true))}
                                aria-label="Dismiss message"
                                className="shrink-0 w-5 h-5 rounded flex items-center justify-center opacity-60 hover:opacity-100 cursor-pointer"
                            >
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                    )}

                    {/* North arrow decoration */}
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

            {/* ── RIGHT: PARCEL PANEL ── */}
            <div
                ref={formRef}
                className={!showPanel || isMapExpanded ? "hidden" : "flex-1 lg:w-[42%] w-full flex flex-col p-5 overflow-y-auto bg-white"}
            >
                <div className="flex-1 flex flex-col justify-between gap-4">
                    <div className="space-y-4">
                        {/* Header */}
                        <div className="flex items-end justify-between gap-3">
                            <div>
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Step 1 of 5</span>
                                <h3 className="text-base font-bold text-slate-900 tracking-tight">Property Map & Zoning</h3>
                            </div>
                            {totalLotArea > 0 && (
                                <span className="text-xs text-slate-500 shrink-0">
                                    Total area <span className="font-mono font-semibold text-slate-800">{totalLotArea.toLocaleString()} m²</span>
                                </span>
                            )}
                        </div>

                        <div className="space-y-3">
                                <button
                                    type="button"
                                    onClick={() => setIsMapExpanded(true)}
                                    className="lg:hidden w-full p-2.5 rounded-full border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50"
                                >
                                    Open map
                                </button>
                                {/* Parcel list header */}
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-800">
                                        Parcels <span className="text-slate-400 font-normal">· {verifiedCount} of {parcels.length} verified</span>
                                    </span>
                                    {form.barangay && <span className="text-slate-500">Brgy. {form.barangay}</span>}
                                </div>
                                {errors.barangay && <p className="text-xs font-medium text-rose-500 -mt-1.5">Verify a PIN to detect the barangay.</p>}

                                {/* Parcel rows */}
                                <ul className="rounded-xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
                                    {parcels.map((parcel, index) => {
                                        const isOpen = selectedIndex === index;
                                        const check = getZoningCheck(parcel, isAmendmentStream);
                                        const pinError = errors[`parcels.${index}.property_index_number`];
                                        const hasRowError = Object.keys(errors).some((k) => k.startsWith(`parcels.${index}.`));
                                        const code = parcel.parcel_code || `P-${String(index + 1).padStart(2, "0")}`;

                                        return (
                                            <li key={index} className={isOpen ? "bg-white" : "bg-slate-50/60"}>
                                                {/* Row summary */}
                                                <div className="flex items-center pr-1.5">
                                                    <button
                                                        type="button"
                                                        onClick={() => selectParcel(index)}
                                                        aria-expanded={isOpen}
                                                        className="flex-1 min-w-0 flex items-center gap-3 px-3.5 py-2.5 text-left cursor-pointer hover:bg-slate-50"
                                                    >
                                                        <span className={`text-[11px] font-bold w-9 shrink-0 ${isOpen ? "text-slate-900" : "text-slate-500"}`}>{code}</span>
                                                        <span className={`font-mono text-[11px] truncate ${parcel.property_index_number ? "text-slate-700" : "text-slate-400"}`}>
                                                            {parcel.property_index_number || "No PIN yet"}
                                                        </span>
                                                        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-600 shrink-0">
                                                            {hasRowError && <span className="text-rose-500 font-semibold">Needs attention ·</span>}
                                                            <span className={`w-1.5 h-1.5 rounded-full ${check.dot}`} aria-hidden="true" />
                                                            {check.label}
                                                        </span>
                                                        <svg className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                        </svg>
                                                    </button>
                                                    {parcels.length > 1 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveParcel(index)}
                                                            aria-label={`Remove ${code}`}
                                                            title={`Remove ${code}`}
                                                            className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                                                        >
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>

                                                {isOpen && (
                                                    <div className="px-3.5 pb-3.5 space-y-3.5">
                                                        {/* PIN input */}
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    type="text"
                                                                    value={parcel.property_index_number || ""}
                                                                    onChange={(e) => handlePinChange(index, e.target.value)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key !== "Enter") return;
                                                                        e.preventDefault();
                                                                        if (!parcel.is_verified && parcel.property_index_number?.trim() && !pinLoading[index]) handlePinLookup(index);
                                                                    }}
                                                                    data-no-advance="true"
                                                                    placeholder="PIN from Tax Declaration"
                                                                    aria-label={`PIN from Tax Declaration for ${code}`}
                                                                    className="flex-1 font-mono uppercase"
                                                                    hasError={!!pinError}
                                                                />
                                                                {parcel.is_verified ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 text-xs font-semibold text-slate-600 whitespace-nowrap">
                                                                        <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                        </svg>
                                                                        Verified
                                                                    </span>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handlePinLookup(index)}
                                                                        disabled={pinLoading[index] || !parcel.property_index_number?.trim()}
                                                                        className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-all bg-slate-800 hover:bg-slate-900 text-white active:scale-98 cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                                    >
                                                                        {pinLoading[index] && <span className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />}
                                                                        {pinLoading[index] ? "Checking…" : "Verify"}
                                                                    </button>
                                                                )}
                                                            </div>
                                                            {pinError ? (
                                                                <p className="text-xs font-medium text-rose-500 mt-1">{pinError}</p>
                                                            ) : !parcel.is_verified ? (
                                                                <p className="text-[11px] text-slate-400 mt-1.5">Press Enter to verify, or use Identify on the map.</p>
                                                            ) : null}
                                                        </div>

                                                        {/* Identify results */}
                                                        {parcel.is_verified && (
                                                            <div>
                                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Attributes</p>
                                                                <dl className="text-xs rounded-lg border border-slate-200 px-3">
                                                                    <Attr label="Owner">{parcel.owner_name}</Attr>
                                                                    <Attr label="Barangay">{parcel.barangay}</Attr>
                                                                    <Attr label="Lot / Survey" mono>{[parcel.lot_number, parcel.survey_number].filter(Boolean).join(" · ")}</Attr>
                                                                    <Attr label="ARP No." mono>{parcel.arp_number}</Attr>
                                                                    <Attr label="Lot area">
                                                                        <AreaComparison declared={parcel.lot_area_sqm} feature={featureByPin.get(parcel.property_index_number?.trim())} />
                                                                    </Attr>
                                                                    <Attr label="Assessor class">{parcel.cadastral_zone}</Attr>
                                                                    <Attr label="CLUP zone">
                                                                        {parcel.land_use_class && (
                                                                            <span>
                                                                                {parcel.land_use_class}
                                                                                {getZoneInfo(parcel.land_use_class).label !== parcel.land_use_class && (
                                                                                    <span className="block text-slate-400 font-normal">{getZoneInfo(parcel.land_use_class).label}</span>
                                                                                )}
                                                                            </span>
                                                                        )}
                                                                    </Attr>
                                                                    <Attr label="Zoning check">
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <span className={`w-1.5 h-1.5 rounded-full ${check.dot}`} aria-hidden="true" />
                                                                            {check.label}
                                                                        </span>
                                                                    </Attr>
                                                                </dl>

                                                                {check.key === "mismatch" && (
                                                                    <div className="mt-2 pl-3 border-l-2 border-amber-400 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                                        <p className="text-[11px] text-slate-600 leading-relaxed">
                                                                            Recorded use doesn't match the zoning plan, so this can't proceed as a clearance.
                                                                        </p>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleSwitchStream(check.action.type, index)}
                                                                            className="shrink-0 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                                                                        >
                                                                            {check.action.label}
                                                                        </button>
                                                                    </div>
                                                                )}
                                                                {check.key === "amendment" && (
                                                                    <p className="mt-2 text-[11px] text-slate-500">Handled through the legislative amendment track.</p>
                                                                )}
                                                            </div>
                                                        )}

                                                    </div>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>

                                <button
                                    type="button"
                                    onClick={handleAddParcel}
                                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                                >
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                    </svg>
                                    Add parcel
                                </button>
                        </div>
                        {errors.parcels && <p className="text-xs font-medium text-rose-500">{errors.parcels}</p>}
                    </div>

                    {/* Bottom Navigation */}
                    <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                        {isProgressionLocked && (
                            <span className="text-[11px] text-slate-500 text-right">Resolve the zoning mismatch to continue</span>
                        )}
                        <button
                            type="button"
                            onClick={handleNext}
                            disabled={isProgressionLocked}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-xs font-semibold shadow-sm transition-all bg-blue-600 hover:bg-blue-700 active:scale-98 cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
                        >
                            Next: Application details
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
