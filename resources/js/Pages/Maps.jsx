import { Component, useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import StatusPanel, { getSLAInfo, getZoningConformity, STATUS_MARKER_CONFIG, getStatusMarkerConfig } from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import ZoningPanel from "@/Components/MapLayers/ZoningPanel";
import MapLegend from "@/Components/MapLayers/MapLegend";
import DiversityLegend from "@/Components/MapLayers/DiversityLegend";
import DiversityControls from "@/Components/MapLayers/DiversityControls";
import { getLens, resolveLensValue, matchesBand, DIVERSITY_LENSES } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import { loadBarangayBoundaries, loadMunicipalBoundary, loadLandUsePlan, resolveBarangayName } from "@/utils/mapData";
import useReducedMotion from "@/utils/useReducedMotion";

// The 3D view is split into its own chunk. It pulls in maplibre-gl, which made
// up most of a 1.2 MB Dashboard bundle that every user downloaded on every
// visit — including the many who never open 3D. It now loads on first use, and
// is warmed during idle time after first paint so that first use is instant.
const MapLibre3DView = lazy(() => import("@/Components/MapLayers/MapLibre3DView"));

// Placeholder while a lazily-loaded map chunk arrives. Solid and on the same
// canvas colour as the maps, so the swap-in doesn't flash.
function MapLoadingState({ label }) {
    return (
        <div className="absolute inset-0 flex items-center justify-center" style={{ backgroundColor: "#f8f9fa" }}>
            <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                <span className="text-[11.5px] font-semibold text-slate-500">{label}</span>
            </div>
        </div>
    );
}

// Width of the docked diversity panel. Must stay in step with the literal
// `sm:w-[380px]` on the panel element — Tailwind's JIT only sees literal class
// strings, so this constant cannot generate it. It exists so both maps can
// offset their camera by the right amount.
const DIVERSITY_PANEL_WIDTH = 380;

// Runs `fn` when the browser is idle, so background preparation never competes
// with first paint or with the user's first interactions. Safari has no
// requestIdleCallback, hence the timeout fallback.
function whenIdle(fn) {
    if (typeof window !== "undefined" && "requestIdleCallback" in window) {
        window.requestIdleCallback(fn, { timeout: 2500 });
    } else {
        setTimeout(fn, 600);
    }
}

// ── Tile Layer Configuration ──
const TILE_PROVIDERS = {
    standard: {
        label: "Standard Street",
        desc: "OpenStreetMap road network",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    },
    satellite: {
        label: "Satellite Imagery",
        desc: "Esri high-resolution aerial imagery",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
        maxZoom: 19,
    },
    hillshade: {
        label: "Terrain Hillshade",
        desc: "Grayscale elevation relief",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Earthstar Geographics, etc.',
        maxZoom: 17,
    },
};

// ── Approximate Barangay Centroid Coordinates for Rosario, Batangas ──
const ROSARIO_BGY_COORDS = {
    "Alupay": [13.8820, 121.2560],
    "Antipolo": [13.8850, 121.2150],
    "Bagong Pook": [13.8350, 121.2290],
    "Balibago": [13.8950, 121.2420],
    "Bayawang": [13.8420, 121.2520],
    "Baybayin": [13.8640, 121.2370],
    "Bulihan": [13.8180, 121.2240],
    "Cahigam": [13.8240, 121.2410],
    "Calantas": [13.8750, 121.1820],
    "Colongan": [13.8480, 121.1680],
    "Itlugan": [13.8410, 121.1850],
    "Lumbangan": [13.8540, 121.2480],
    "Maalas-as": [13.8320, 121.1980],
    "Mabato": [13.8690, 121.2460],
    "Mabunga": [13.8280, 121.2610],
    "Macalamcam A": [13.8980, 121.2510],
    "Macalamcam B": [13.9020, 121.2580],
    "Malaya": [13.8580, 121.1760],
    "Maligaya": [13.8460, 121.1790],
    "Marilag": [13.8680, 121.1730],
    "Masaya": [13.8510, 121.1820],
    "Matamis": [13.8150, 121.2720],
    "Mavalor": [13.8520, 121.2210],
    "Mayuro": [13.8390, 121.2380],
    "Namuco": [13.8580, 121.2270],
    "Namunga": [13.8390, 121.2150],
    "Natu": [13.8780, 121.2360],
    "Nazi": [13.8360, 121.2670],
    "Palakpak": [13.7980, 121.2650],
    "Pinagsibaan": [13.8820, 121.2310],
    "Poblacion A": [13.8460, 121.2040],
    "Poblacion B": [13.8470, 121.2050],
    "Poblacion C": [13.8485, 121.2065],
    "Poblacion D": [13.8490, 121.2080],
    "Poblacion E": [13.8500, 121.2095],
    "Poblacion": [13.8475, 121.2058],
    "Putingkahoy": [13.8720, 121.2680],
    "Quilib": [13.8680, 121.1940],
    "Salao": [13.8890, 121.2740],
    "San Carlos": [13.8612, 121.2185],
    "San Ignacio": [13.8320, 121.2080],
    "San Isidro": [13.8560, 121.2580],
    "San Jose": [13.8590, 121.2120],
    "San Roque": [13.8560, 121.1980],
    "Santa Cruz": [13.8810, 121.1890],
    "Timbugan": [13.8310, 121.1920],
    "Tugtugin": [13.8210, 121.2060],
};

// Status pin color/style now lives in one place: STATUS_MARKER_CONFIG,
// imported above from StatusPanel.jsx (shared with chips, popups, and the legend).

const getAppCoordinates = (app) => {
    const parcel = app?.parcels && app.parcels.length > 0 ? app.parcels[0] : null;
    const lat = parseFloat(parcel?.latitude);
    const lng = parseFloat(parcel?.longitude);

    if (!isNaN(lat) && !isNaN(lng) && lat >= 13.70 && lat <= 13.98 && lng >= 121.10 && lng <= 121.35) {
        return [lat, lng];
    }

    const bgy = (app?.barangay || "Poblacion").trim();
    return ROSARIO_BGY_COORDS[bgy] || ROSARIO_BGY_COORDS["Poblacion"] || [13.8475, 121.2058];
};

const createNumberedPinIcon = (number, color, borderColor, L, isHovered = false, tooltipText = "") => {
    const Leaflet = L?.default || L;

    return Leaflet.divIcon({
        className: 'custom-numbered-pin-container',
        html: `
            <div class="relative group cursor-pointer select-none transition-transform duration-150" 
                 style="transform: translate(-50%, -100%) ${isHovered ? 'scale(1.28)' : 'scale(1)'}; z-index: ${isHovered ? 9999 : 1000};">
                
                <!-- Ground Drop Shadow -->
                <div class="w-3.5 h-1 rounded-full bg-slate-950/30 blur-[1px] absolute -bottom-0.5 left-1/2 -translate-x-1/2 pointer-events-none"></div>

                <!-- Active / Hover halo glow ring -->
                ${isHovered ? `<div class="absolute -inset-1 rounded-full bg-blue-500/60 blur-[2px] animate-ping pointer-events-none"></div>` : ''}

                <!-- Teardrop Pin Marker -->
                <div class="relative flex flex-col items-center">
                    <!-- Circular pin head containing the number -->
                    <div class="w-7 h-7 rounded-full flex items-center justify-center font-black text-white text-[11.5px] font-mono shadow-md transition-shadow" 
                         style="background: linear-gradient(135deg, ${color} 0%, ${borderColor} 100%); border: 2px solid #ffffff; box-shadow: 0 3px 10px ${color}60;">
                        ${number}
                    </div>
                    <!-- Pointer Tip pointing down to ground -->
                    <div class="w-2.5 h-2.5 rotate-45 -mt-1 shadow-2xs" 
                         style="background-color: ${borderColor}; border-right: 1.5px solid #ffffff; border-bottom: 1.5px solid #ffffff;"></div>
                </div>

                <!-- Floating Tooltip on Hover Only (Invisible otherwise) -->
                ${tooltipText ? `
                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-0.5 rounded-md bg-slate-900/95 text-white text-[9.5px] font-semibold whitespace-nowrap shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none z-[9999]">
                        ${tooltipText}
                    </div>
                ` : ''}
            </div>
        `,
        iconSize: [28, 36],
        iconAnchor: [14, 36],
        popupAnchor: [0, -36],
    });
};

const createApplicationPopupHtml = (app, zoneValue) => {
    const config = getStatusMarkerConfig(app?.status);
    const sla = getSLAInfo(app?.created_at, app?.status);
    const refNo = app?.reference_number || `APP-${app?.id || '001'}`;
    const applicant = app?.applicant_name || 'Individual Applicant';
    const appType = app?.application_type || 'Zoning Clearance';
    const barangay = app?.barangay || 'Rosario';
    const landUse = app?.land_use_class || 'General Zone';
    const dateStr = app?.created_at ? new Date(app.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent Filing';
    // Compares the applied-for use against the barangay's actual CLUP zone
    // (a real, independent value) rather than against itself.
    const conformity = getZoningConformity(landUse, zoneValue);

    return `
        <div class="font-sans min-w-[260px] max-w-[295px] p-1">
            <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                <span class="text-[10.5px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    ${refNo}
                </span>
                <span class="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full" style="background-color: ${config.badgeBg}; color: ${config.badgeText}; border: 1px solid ${config.color}40;">
                    ● ${config.label}
                </span>
            </div>

            <div class="mt-2.5 space-y-2 text-xs">
                <div>
                    <h4 class="font-black text-slate-900 text-sm leading-tight">${applicant}</h4>
                    <p class="text-[11px] font-semibold text-blue-700 mt-0.5">${appType}</p>
                </div>

                <!-- CLUP Zoning Conformity Badge -->
                <div class="p-1.5 rounded-lg border text-[10.5px] flex items-center justify-between ${conformity.badgeClass}">
                    <span class="font-bold flex items-center gap-1.5">
                        <span class="w-2 h-2 rounded-full ${conformity.dotClass}"></span>
                        <span>${conformity.label}</span>
                    </span>
                    <span class="text-[9px] font-mono font-bold opacity-85 uppercase tracking-wider">
                        ${conformity.isConforming ? 'Conforming' : 'Action Req.'}
                    </span>
                </div>

                <div class="pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[11px]">
                    <div>
                        <span class="text-slate-400 block text-[9px] font-bold uppercase">Barangay</span>
                        <span class="font-bold text-slate-800 truncate block">${barangay}</span>
                    </div>
                    <div>
                        <span class="text-slate-400 block text-[9px] font-bold uppercase">Zone Class</span>
                        <span class="font-semibold text-slate-700 truncate block">${landUse}</span>
                    </div>
                </div>

                <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border font-medium ${sla.color}">
                        ${sla.label}
                    </span>
                    <span class="text-slate-400 font-mono text-[9.5px]">Filed: ${dateStr}</span>
                </div>

                <!-- Quick Action Buttons for Planning Officers -->
                <div class="pt-2 border-t border-slate-100 flex items-center gap-1.5">
                    <button 
                        type="button"
                        onclick="window.dispatchEvent(new CustomEvent('imaps:inspect-app', { detail: ${app?.id} }))"
                        class="flex-1 py-1.5 px-2 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-[10.5px] font-bold transition-all text-center cursor-pointer flex items-center justify-center gap-1"
                    >
                        <span>📋</span>
                        <span>View Dossier</span>
                    </button>
                    <a 
                        href="/applications/${app?.id}"
                        target="_blank"
                        rel="noreferrer"
                        class="py-1.5 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 text-[10.5px] font-bold transition-all text-center"
                        title="Open full application in new tab"
                    >
                        ↗
                    </a>
                </div>
            </div>
        </div>
    `;
};

// ── Leaflet Map Component ──
function LeafletMap({
    bgyStats,
    applications = [],
    recent = [],
    currentLayer,
    mapStyle,
    onFeatureClick,
    onMapClick,
    onInspectApp,
    appTypeFilter,
    statusFilter = "All",
    searchFilter = "",
    hoveredAppId = null,
    selectedBgy = null,
    flyToTarget = null,
    mapZoom,
    onZoomChange,
    clupOpacity = 0.85,
    resetTrigger,
    searchTargetBgy,
    diversityLens = "mix",
    diversityBandFilter = "all",
    hoveredBgy = null,
    onHoverBgy = () => {},
    rightPanelOpen = true,
    panelWidth = 380,
    onParcelsVisible = () => {},
    verifiedParcel = null,
    historicalPins = [],
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null);
    const geoLayerRef = useRef(null);
    const verifiedParcelLayerRef = useRef(null);
    const zoningLayerRef = useRef(null);
    const zoningPromiseRef = useRef(null);
    // Declared up here, ahead of every effect: these are read in dependency
    // arrays, which evaluate during render, so declaring them lower down would
    // throw a temporal-dead-zone ReferenceError on the first render.
    const [zoningReady, setZoningReady] = useState(false);
    // Effects that style the barangay polygons must re-run once they exist;
    // with progressive loading they can now arrive after those effects fire.
    const [barangaysReady, setBarangaysReady] = useState(false);
    const applicationsLayerRef = useRef(null);
    const establishmentsLayerRef = useRef(null);
    const diversityLabelsLayerRef = useRef(null);
    const markersByAppIdRef = useRef({});
    const establishmentMarkersRef = useRef({});
    const prevSelectedBgyRef = useRef(null);
    const rosarioBoundsRef = useRef(null);
    const activeFeatureRef = useRef(null);

    const layerRef = useRef(currentLayer);
    const opacityRef = useRef(clupOpacity);
    const appFilterRef = useRef(appTypeFilter);
    const diversityLensRef = useRef(diversityLens);
    const diversityBandRef = useRef(diversityBandFilter);
    const rightPanelOpenRef = useRef(rightPanelOpen);
    const selectedBgyRef = useRef(selectedBgy);
    const popupTimerRef = useRef(null);

    // Matches the 3D view: when the OS asks for reduced motion the camera
    // jumps instead of flying.
    const prefersReducedMotion = useReducedMotion();
    const reducedMotionRef = useRef(prefersReducedMotion);
    useEffect(() => { reducedMotionRef.current = prefersReducedMotion; }, [prefersReducedMotion]);

    useEffect(() => { layerRef.current = currentLayer; }, [currentLayer]);
    useEffect(() => { opacityRef.current = clupOpacity; }, [clupOpacity]);
    useEffect(() => { appFilterRef.current = appTypeFilter; }, [appTypeFilter]);
    useEffect(() => { diversityLensRef.current = diversityLens; }, [diversityLens]);
    useEffect(() => { diversityBandRef.current = diversityBandFilter; }, [diversityBandFilter]);
    useEffect(() => { rightPanelOpenRef.current = rightPanelOpen; }, [rightPanelOpen]);
    useEffect(() => { selectedBgyRef.current = selectedBgy; }, [selectedBgy]);

    const staticBgyData = useMemo(() => {
        const map = {};
        Object.entries(bgyStats ?? {}).forEach(([name, stat]) => {
            map[name] = {
                total: stat.Total ?? 0,
                Total: stat.Total ?? 0,
                review: stat["Technical Review"] ?? stat.review ?? 0,
                'Technical Review': stat["Technical Review"] ?? stat.review ?? 0,
                released: stat.Released ?? stat.released ?? 0,
                'Released': stat.Released ?? stat.released ?? 0,
                Primary_Zone: stat.Primary_Zone || stat.primaryZone || "Residential",
                primaryZone: stat.Primary_Zone || stat.primaryZone || "Residential",
                landUse: stat.Primary_Zone || stat.primaryZone || "Residential",
                diversity: stat.diversity ?? 0.0,
                distribution: stat.distribution || [],
                // Carried through so the 2D map can resolve either lens from the
                // same record the 3D map and the side panel use.
                variance: stat.variance ?? 0,
                varianceStatus: stat.varianceStatus || "",
                clupTargetDiversity: stat.clupTargetDiversity ?? null,
                pressure: stat.pressure || null,
                cluster: stat.cluster || null,
                permitCount: stat.permitCount ?? stat.Total ?? 0,
            };
        });
        return map;
    }, [bgyStats]);

    const statusColor = (total) => {
        if (total >= 25) return "#1e3a8a";
        if (total >= 18) return "#1d4ed8";
        if (total >= 12) return "#2563eb";
        if (total >= 8) return "#60a5fa";
        if (total >= 4) return "#93c5fd";
        return "#dbeafe";
    };


    // Zone colour and label both come from the shared CLUP dictionary now.
    // This file used to keep its own `zoningPlanColors` table in parallel with
    // the panel's, in raw QGIS neon, so the same parcel could render one colour
    // on the map and a different one in the breakdown beside it.
    const getZoneDisplayInfo = (code) => getZoneInfo(code);

    // The barangay X-Ray popup that used to live here is gone. It was a
    // translucent card floating on the map, which put its text over whatever
    // colour happened to be underneath; everything it showed — score, tier,
    // land-use mix — now lives in the docked panel on the right, with more
    // room and a solid background.

    // Smoothly focus on any clicked barangay with silky smooth panning/zooming and zero header overlap
    const focusBarangayOnMap = (targetLayer, name, bgyData) => {
        if (!mapInstanceRef.current || !targetLayer) return;

        const centroid = targetLayer.getBounds().getCenter();
        const currentZoom = mapInstanceRef.current.getZoom();
        // Keep municipal perspective of Rosario: if already at comfortable municipal zoom (12.0 - 12.6), preserve it
        const targetZoom = Math.min(12.5, Math.max(12.0, currentZoom));

        const size = mapInstanceRef.current.getSize();
        const w = size.x || 1000;
        const h = size.y || 700;

        // Horizontally: centre in whatever map area the docked panel leaves open.
        const sidebarWidth = rightPanelOpenRef.current ? panelWidth : 0;
        const targetScreenX = Math.max(140, (w - sidebarWidth) / 2);
        // Vertically: centre it. With the popup gone there is nothing that needs
        // clearance below the header, so the barangay sits in the middle.
        const targetScreenY = h / 2;

        import("leaflet").then((L) => {
            const centroidPoint = mapInstanceRef.current.project(centroid, targetZoom);
            const screenCenter = size.divideBy(2);
            const targetScreen = L.default.point(targetScreenX, targetScreenY);
            const offset = screenCenter.subtract(targetScreen);
            const newCenterPoint = centroidPoint.add(offset);
            const newCenter = mapInstanceRef.current.unproject(newCenterPoint, targetZoom);

            const isZoomChanging = Math.abs(currentZoom - targetZoom) > 0.15;
            if (reducedMotionRef.current) {
                mapInstanceRef.current.setView(newCenter, targetZoom, { animate: false });
            } else if (isZoomChanging) {
                mapInstanceRef.current.flyTo(newCenter, targetZoom, {
                    duration: 1.1,
                    easeLinearity: 0.15,
                });
            } else {
                mapInstanceRef.current.panTo(newCenter, {
                    duration: 0.9,
                    easeLinearity: 0.15,
                });
            }

            if (popupTimerRef.current) {
                clearTimeout(popupTimerRef.current);
                popupTimerRef.current = null;
            }

            // No popup in diversity mode any more — the docked panel is the
            // detail surface, so the map just frames the barangay.
            mapInstanceRef.current.closePopup();
        });
    };

    const getFeatureStyle = (feature, layer, filter) => {
        const props = feature.properties || {};
        const name = resolveBarangayName(props);
        const bgyData = staticBgyData[name] || { total: 0, landUse: "Residential", diversity: 0.5 };

        const activeTotal = bgyData.total || 0;
        const baseStyle = { color: "#8b0000", weight: 1.2, opacity: 0.9 };

        if (layer === "zoning") {
            return { color: "#8b0000", weight: 1.2, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
        }

        if (layer === "diversity") {
            // Read the selection from the ref, not the `selectedBgy` prop.
            // Leaflet's L.geoJSON freezes the `style` function it's given at
            // layer-creation time (mount, inside a `[]`-deps effect) and reuses
            // that exact closure forever on every `resetStyle()` call — e.g. on
            // mouseout. A closure over the prop would forever see whatever
            // `selectedBgy` was AT MOUNT (null, on first load), so isolation
            // would silently stop working the moment a barangay was hovered and
            // un-hovered. `selectedBgyRef` is a ref: reading `.current` always
            // gets the live value regardless of which render's closure asks.
            const selName = (selectedBgyRef.current?.name || "").trim().toLowerCase();
            const anySelected = Boolean(selName);
            const isSelected = anySelected && selName === name.toLowerCase();
            const activeBand = diversityBandRef.current || "all";
            const resolved = resolveLensValue(diversityLensRef.current, bgyData);
            const inBand = activeBand === "all" || resolved.band.id === activeBand;

            // This layer used to paint every barangay with a fully transparent
            // fill, so the "Diversity Index map" showed no diversity at all —
            // just boundaries floating over the CLUP raster. It is now a real
            // choropleth of the active lens, with the plan still legible
            // underneath through the fill.
            // Outline only: the selected barangay opens up to show its CLUP
            // parcels underneath, so its own fill steps out of the way.
            //
            // `fill: false` rather than `fillOpacity: 0` — an invisible fill is
            // still hit-tested, and since the barangay outlines render above the
            // parcels it would swallow every hover meant for the zones inside.
            if (isSelected) {
                return {
                    color: "#8b0000",
                    weight: 2.4,
                    dashArray: null,
                    fill: false,
                    opacity: 1,
                    className: "",
                };
            }

            // Isolation: while one barangay is open, every other barangay goes
            // fully invisible rather than staying colored underneath, so its
            // parcels are the only thing left competing for attention. The
            // shape is still there and still clickable — hovering shows its
            // tooltip and clicking it switches the selection — it just doesn't
            // render, the same way the selected barangay's own fill doesn't.
            if (anySelected) {
                return {
                    color: "#8b0000",
                    weight: 0,
                    fillColor: "transparent",
                    fillOpacity: 0,
                    opacity: 0,
                    className: "imaps-deadspace",
                };
            }

            if (!inBand) {
                return {
                    color: "#94a3b8",
                    weight: 0.6,
                    dashArray: "3, 3",
                    fillColor: "#e2e8f0",
                    fillOpacity: 0.12,
                    opacity: 0.35,
                    className: "",
                };
            }

            return {
                color: resolved.stroke,
                weight: activeBand === "all" ? 1.2 : 2.2,
                dashArray: null,
                fillColor: resolved.color,
                fillOpacity: 0.68,
                opacity: 0.9,
                className: "",
            };
        }

        if (layer === "status") {
            return { ...baseStyle, fillColor: statusColor(activeTotal), fillOpacity: activeTotal > 0 ? 0.35 : 0.15 };
        }

        if (layer === "trends") {
            const isSelected = selectedBgy && selectedBgy.name && selectedBgy.name.trim().toLowerCase() === name.toLowerCase();
            return {
                color: isSelected ? "#8b0000" : "#8b0000",
                weight: isSelected ? 3.5 : 1.8,
                dashArray: isSelected ? null : "3, 3",
                fillColor: isSelected ? "#3b82f6" : "transparent",
                fillOpacity: isSelected ? 0.12 : 0,
                opacity: 0.95
            };
        }

        return { ...baseStyle, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
    };

    // Unified Selected Barangay Polygon & Map Camera Synchronization
    useEffect(() => {
        if (!geoLayerRef.current || !mapInstanceRef.current) return;

        // When barangay selection is cleared, reset polygon style, close popups, and return to full Rosario overview
        if (!selectedBgy || !selectedBgy.name) {
            if (popupTimerRef.current) {
                clearTimeout(popupTimerRef.current);
                popupTimerRef.current = null;
            }
            if (mapInstanceRef.current) {
                mapInstanceRef.current.closePopup();
            }
            if (activeFeatureRef.current) {
                geoLayerRef.current.resetStyle(activeFeatureRef.current);
                activeFeatureRef.current = null;
            }
            if (prevSelectedBgyRef.current && rosarioBoundsRef.current && mapInstanceRef.current) {
                // Match the real docked-panel width (same prop `focusBarangayOnMap`
                // uses below) instead of a separate guessed constant, so the
                // reset-to-municipal view centres against the panel that is
                // actually on screen rather than one ~10px narrower than it.
                const sidebarWidth = rightPanelOpenRef.current ? panelWidth : 0;
                mapInstanceRef.current.flyToBounds(rosarioBoundsRef.current, {
                    paddingTopLeft: [50, 90],
                    paddingBottomRight: [sidebarWidth + 20, 40],
                    duration: 1.0,
                    easeLinearity: 0.15,
                    animate: !reducedMotionRef.current,
                });
            }
            prevSelectedBgyRef.current = null;
            return;
        }

        prevSelectedBgyRef.current = selectedBgy;
        const targetName = selectedBgy.name.trim().toLowerCase();
        let matchedLayer = null;

        geoLayerRef.current.eachLayer((l) => {
            const props = l.feature?.properties || {};
            const name = resolveBarangayName(props);

            if (name && name.toLowerCase() === targetName) {
                matchedLayer = l;
            }
        });

        if (matchedLayer) {
            if (activeFeatureRef.current && activeFeatureRef.current !== matchedLayer) {
                geoLayerRef.current.resetStyle(activeFeatureRef.current);
            }
            activeFeatureRef.current = matchedLayer;

            const isStatus = currentLayer === "status";
            const isDiversity = currentLayer === "diversity";
            const isZoning = currentLayer === "zoning";
            if (isDiversity || isZoning) {
                // Outline only — on the diversity layer the barangay's CLUP
                // parcels render inside it, and on the CLUP 2030 layer itself
                // the whole point is the zone-classification colours already
                // painted there by the separate zoning tile layer. A solid
                // selection fill (this used to apply the same 60%-opacity blue
                // wash zoning got here as every other non-diversity layer) would
                // paint straight over both, hiding the one thing being shown.
                // `fill: false` rather than `fillOpacity: 0` also keeps the
                // shape clickable/hoverable instead of swallowing events.
                matchedLayer.setStyle({
                    weight: 2.4,
                    color: "#8b0000",
                    fill: false,
                    opacity: 1,
                    dashArray: "",
                });
            } else {
                // Status and Trends: a real highlight fill is fine here, neither
                // layer has finer-grained colour underneath that this would hide.
                matchedLayer.setStyle({
                    weight: isStatus ? 2.5 : 3.5,
                    color: "#8b0000",
                    fillColor: "#ef4444",
                    fillOpacity: isStatus ? 0.08 : 0.12,
                    dashArray: "",
                });
            }
            matchedLayer.bringToFront();

            const bgyData = staticBgyData[selectedBgy.name] || selectedBgy.data || {};

            if (isStatus) {
                const bgyApps = Array.isArray(applications)
                    ? applications.filter((app) => (app?.barangay || "").trim().toLowerCase() === targetName)
                    : [];

                if (bgyApps.length === 1) {
                    const singleApp = bgyApps[0];
                    const coords = getAppCoordinates(singleApp);
                    mapInstanceRef.current.flyTo(coords, 16, { duration: 0.9 });
                    setTimeout(() => {
                        if (markersByAppIdRef.current[singleApp.id]) {
                            markersByAppIdRef.current[singleApp.id].openPopup();
                        }
                    }, 950);
                } else if (bgyApps.length > 1) {
                    const appCoords = bgyApps.map((a) => getAppCoordinates(a));
                    import("leaflet").then((L) => {
                        const bounds = L.default.latLngBounds(appCoords);
                        mapInstanceRef.current.flyToBounds(bounds, { padding: [60, 60], maxZoom: 15, duration: 0.9 });
                    });
                } else {
                    focusBarangayOnMap(matchedLayer, selectedBgy.name, bgyData);
                }
            } else {
                focusBarangayOnMap(matchedLayer, selectedBgy.name, bgyData);
            }
        }
    }, [selectedBgy, currentLayer, applications, staticBgyData, barangaysReady]);

    // The land-use plan is the heaviest thing on this page (513 parcels,
    // ~830 KB compressed) and only the CLUP 2030 and Urban Growth layers, plus a
    // selected barangay in the diversity view, ever show it. It used to be
    // fetched and attached at mount on every visit.
    //
    // Now it is *built* on demand — or during idle time right after first paint,
    // so it is usually ready before anyone clicks — and *attached* only while a
    // layer shows it (see the style-sync effect). Attachment matters as much as
    // loading: an attached Leaflet layer re-projects and redraws every path on
    // every pan and zoom even at zero opacity, so the Status map was quietly
    // redrawing 513 invisible polygons whenever it moved.

    const ensureZoningLayer = () => {
        if (zoningLayerRef.current) return Promise.resolve(zoningLayerRef.current);
        if (zoningPromiseRef.current) return zoningPromiseRef.current;

        zoningPromiseRef.current = Promise.all([loadLandUsePlan(), import("leaflet")])
            .then(([landUseData, L]) => {
                if (!mapInstanceRef.current || !landUseData || !landUseData.features) {
                    zoningPromiseRef.current = null; // allow a retry on next need
                    return null;
                }
                zoningLayerRef.current = L.default.geoJSON(landUseData, {
                    style: (feature) => {
                        const props = feature.properties || {};
                        const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                        const zoneCode = String(rawZone).trim();
                        const colorConfig = getZoneInfo(zoneCode);
                        const isZoningActive = layerRef.current === "zoning";
                        const isTrendsActive = layerRef.current === "trends";
                        const isLandUsePlanVisible = isZoningActive || isTrendsActive;

                        return {
                            color: colorConfig.stroke,
                            weight: isTrendsActive ? 1 : 1.5,
                            fillColor: colorConfig.pattern ? `url(#${colorConfig.pattern})` : colorConfig.fill,
                            fillOpacity: isTrendsActive ? 0.65 : (isZoningActive ? opacityRef.current : 0),
                            opacity: isLandUsePlanVisible ? 0.9 : 0
                        };
                    },
                    onEachFeature: (feature, parcelLayer) => {
                        // Identify the zones a diversity click reveals. Without
                        // this the parcels are legible as colour but anonymous,
                        // and the legend key only names categories, not the
                        // specific sub-zone under the cursor.
                        const props = feature.properties || {};
                        const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || "";
                        const zone = getZoneInfo(String(rawZone).trim());

                        parcelLayer.on("mouseover", (e) => {
                            if (layerRef.current !== "diversity") return;
                            // Only the revealed barangay's parcels are interactive;
                            // the rest are invisible and must not answer the mouse.
                            const parcelBgy = (props.location || props.LOCATION || props.barangay || "").trim().toLowerCase();
                            const sel = (selectedBgyRef.current?.name || "").trim().toLowerCase();
                            if (!sel || parcelBgy !== sel) return;

                            L.default.DomEvent.stopPropagation(e);
                            parcelLayer
                                .bindTooltip(
                                    `<div class="font-sans">
                                        <div class="font-bold text-slate-900">${zone.label}</div>
                                        <div class="text-[10px] text-slate-500 font-mono">${zone.code || "—"} · ${zone.categoryLabel || ""}</div>
                                    </div>`,
                                    { className: "diversity-tooltip font-sans text-xs", sticky: true }
                                )
                                .openTooltip(e.latlng);
                            parcelLayer.setStyle({ weight: 1.6, color: "#0f172a", opacity: 1 });
                        });

                        parcelLayer.on("mouseout", () => {
                            parcelLayer.closeTooltip();
                            if (layerRef.current === "diversity") {
                                parcelLayer.setStyle({ weight: 0.6, color: "#ffffff", opacity: 0.55 });
                            }
                        });
                    }
                });
                setZoningReady(true);
                return zoningLayerRef.current;
            })
            .catch((err) => {
                zoningPromiseRef.current = null;
                console.warn("Land-use plan load error:", err);
                return null;
            });

        return zoningPromiseRef.current;
    };

    useEffect(() => {
        if (mapInstanceRef.current) return;

        import("leaflet").then((L) => {
            import("leaflet/dist/leaflet.css");

            const map = L.default.map(mapRef.current, {
                center: [13.8450, 121.2060],
                zoom: 13,
                minZoom: 11,
                maxZoom: 19,
                zoomControl: false,
                scrollWheelZoom: true,
                maxBoundsViscosity: 0.6,
            });

            map.on("zoomend", () => {
                if (onZoomChange) onZoomChange(map.getZoom());
            });

            const initialProvider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.standard;
            tileLayerRef.current = L.default
                .tileLayer(initialProvider.url, {
                    attribution: initialProvider.attribution,
                    maxZoom: initialProvider.maxZoom,
                    className: "map-tiles",
                })
                .addTo(map);

            clupTileLayerRef.current = L.default.tileLayer('/tiles/clup_tiles/{z}/{x}/{y}.png', {
                maxZoom: 22,
                maxNativeZoom: 19,
                opacity: clupOpacity,
                zIndex: 10,
                errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
            });

            mapInstanceRef.current = map;

            map.on("click", () => {
                if (onMapClick) onMapClick();
                if (activeFeatureRef.current && geoLayerRef.current) {
                    geoLayerRef.current.resetStyle(activeFeatureRef.current);
                    activeFeatureRef.current = null;
                }
            });

            if (!map.getPane("pinsPane")) {
                const pinsPane = map.createPane("pinsPane");
                pinsPane.style.zIndex = "650";
            }

            applicationsLayerRef.current = L.default.layerGroup().addTo(map);
            establishmentsLayerRef.current = L.default.layerGroup().addTo(map);
            diversityLabelsLayerRef.current = L.default.layerGroup().addTo(map);
            verifiedParcelLayerRef.current = L.default.layerGroup().addTo(map);

            // Each layer draws the moment its own data arrives.
            //
            // This was a single Promise.all over the boundary, the barangays and
            // the land-use plan, with all drawing inside one `.then()` — so the
            // 24 KB municipal outline and the 161 KB barangays sat waiting on the
            // land-use plan, which on a cold server took ~20s to build. The map
            // stayed blank the whole time. The land-use plan is no longer part of
            // first paint at all (see ensureZoningLayer).
            //
            // The loaders are cached module-level promises shared with the 3D
            // view, so toggling 2D/3D never refetches geometry.
            loadMunicipalBoundary().then((rosarioData) => {
                if (mapInstanceRef.current !== map) return; // unmounted meanwhile
                if (rosarioData && rosarioData.features) {
                    const rosarioGeo = L.default.geoJSON(rosarioData, {
                        style: {
                            color: "#1e3a8a",
                            weight: 3,
                            fillColor: "transparent",
                            opacity: 0.85,
                            dashArray: "4, 4"
                        },
                        interactive: false
                    }).addTo(map);

                    const rosarioBounds = rosarioGeo.getBounds();
                    rosarioBoundsRef.current = rosarioBounds;
                    map.setMaxBounds(rosarioBounds.pad(0.75));
                }
            });

            loadBarangayBoundaries().then((barangayData) => {
                if (mapInstanceRef.current !== map) return;
                if (barangayData && barangayData.features) {
                    geoLayerRef.current = L.default
                        .geoJSON(barangayData, {
                            style: (feature) => getFeatureStyle(feature, layerRef.current, appTypeFilter),
                            onEachFeature: (feature, layer_feature) => {
                                const props = feature.properties || {};
                                const name = resolveBarangayName(props);

                                const bgyData = staticBgyData[name] || {
                                    total: 0,
                                    Total: 0,
                                    review: 0,
                                    'Technical Review': 0,
                                    released: 0,
                                    'Released': 0,
                                    Primary_Zone: "Residential",
                                    primaryZone: "Residential",
                                    landUse: "Residential",
                                    diversity: 0.0,
                                    distribution: [],
                                };

                                layer_feature.on("click", (e) => {
                                    L.default.DomEvent.stopPropagation(e);
                                    if (onFeatureClick) onFeatureClick(name, bgyData);
                                });

                                layer_feature.on("mouseover", () => {
                                    const isTrends = layerRef.current === "trends";
                                    const isDiversity = layerRef.current === "diversity";
                                    const dominantZoneText = bgyData?.primaryZone || bgyData?.Primary_Zone || bgyData?.landUse || "";
                                    let tooltipContent = name;
                                    if (isTrends && dominantZoneText) {
                                        tooltipContent = `<div class="font-bold text-slate-800">${name}</div><div class="text-[10px] text-blue-600 font-medium">${dominantZoneText} Zone</div>`;
                                    } else if (isDiversity) {
                                        const activeLens = getLens(diversityLensRef.current);
                                        const resolved = resolveLensValue(diversityLensRef.current, bgyData);
                                        tooltipContent = `
                                            <div class="font-sans px-1 py-0.5">
                                                <div class="flex items-center gap-1.5">
                                                    <span class="w-2.5 h-2.5 rounded-full shadow-xs" style="background-color: ${resolved.color}"></span>
                                                    <span class="font-bold text-slate-900">${name}</span>
                                                    <span class="font-mono text-[10px] font-black px-1.5 py-0.2 rounded text-white" style="background-color: ${resolved.stroke}">
                                                        ${resolved.formatted}
                                                    </span>
                                                </div>
                                                <div class="text-[10px] font-semibold text-slate-500 mt-0.5">
                                                    ${resolved.band.classification} · <span class="text-slate-400 font-normal">${activeLens.metricLabel}</span>
                                                </div>
                                            </div>
                                        `;
                                    }

                                    layer_feature
                                        .bindTooltip(tooltipContent, {
                                            permanent: false,
                                            direction: "center",
                                            className: isDiversity
                                                ? "diversity-tooltip font-sans text-xs"
                                                : "font-sans text-xs font-bold bg-white/95 text-slate-800 border border-slate-200 shadow-xl px-3 py-1.5 rounded-xl backdrop-blur-md",
                                        })
                                        .openTooltip();

                                    if (isDiversity) onHoverBgy(name);

                                    if (activeFeatureRef.current !== layer_feature) {
                                        if (isDiversity) {
                                            // While a barangay is isolated, every other shape stays
                                            // invisible even on hover — lighting one up would defeat
                                            // the isolation. It still gets a tooltip and still switches
                                            // the selection on click, so it's discoverable without
                                            // being visible.
                                            const isolated = Boolean(selectedBgyRef.current?.name);
                                            if (!isolated) {
                                                // Lift the fill and thicken the edge. The old version
                                                // raised fillOpacity on a fill that was transparent,
                                                // so hovering a barangay did nothing visible at all.
                                                const resolved = resolveLensValue(diversityLensRef.current, bgyData);
                                                layer_feature.setStyle({
                                                    fillColor: resolved.color,
                                                    fillOpacity: 0.9,
                                                    weight: 3,
                                                    color: "#0f172a",
                                                    opacity: 1,
                                                });
                                                layer_feature.bringToFront();
                                            }
                                        } else {
                                            const hoverOpacity = isTrends ? 0.08 : 0.45;
                                            const hoverColor = isTrends ? "#2563eb" : undefined;
                                            layer_feature.setStyle({ fillOpacity: hoverOpacity, weight: 2.5, ...(hoverColor ? { color: hoverColor } : {}) });
                                        }
                                    }
                                });

                                layer_feature.on("mouseout", () => {
                                    layer_feature.closeTooltip();
                                    if (layerRef.current === "diversity") onHoverBgy(null);
                                    if (activeFeatureRef.current !== layer_feature) {
                                        geoLayerRef.current.resetStyle(layer_feature);
                                    }
                                });
                            },
                        })
                        .addTo(map);

                    map.fitBounds(geoLayerRef.current.getBounds(), { padding: [25, 25] });
                    setBarangaysReady(true);
                }

                // The map is usable now. Spend the idle time that follows getting
                // every other layer ready, so the first click on CLUP 2030, Urban
                // Growth or the 3D diversity view opens fully formed instead of
                // starting a download.
                whenIdle(() => {
                    if (mapInstanceRef.current !== map) return;
                    ensureZoningLayer();
                    // Warms the lazily-split 3D chunk (maplibre-gl) into the
                    // module cache; React.lazy then resolves it instantly.
                    import("@/Components/MapLayers/MapLibre3DView").catch(() => {});
                });
            })
            .catch((err) => console.warn("GeoJSON load error:", err));
        });

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!selectedBgy && mapInstanceRef.current && rosarioBoundsRef.current && (currentLayer === "zoning" || currentLayer === "diversity")) {
            mapInstanceRef.current.flyToBounds(rosarioBoundsRef.current, {
                padding: [5, 5],
                duration: 0.8,
            });
        }
    }, [currentLayer, selectedBgy]);

    useEffect(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.getZoom() !== mapZoom) {
            mapInstanceRef.current.setZoom(mapZoom);
        }
    }, [mapZoom]);

    useEffect(() => {
        if (!mapInstanceRef.current || resetTrigger === 0) return;
        if (rosarioBoundsRef.current) {
            mapInstanceRef.current.fitBounds(rosarioBoundsRef.current, { padding: [30, 30] });
        } else {
            mapInstanceRef.current.setView([13.8450, 121.2060], 13);
        }
    }, [resetTrigger]);

    useEffect(() => {
        if (!mapInstanceRef.current || !tileLayerRef.current) return;

        import("leaflet").then((L) => {
            const provider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.standard;
            tileLayerRef.current.remove();
            tileLayerRef.current = L.default
                .tileLayer(provider.url, {
                    attribution: provider.attribution,
                    maxZoom: provider.maxZoom,
                    className: "map-tiles",
                })
                .addTo(mapInstanceRef.current);
            if (layerRef.current === "diversity") tileLayerRef.current.remove();
        });
    }, [mapStyle]);

    // The diversity module has no basemap at all: the barangays sit isolated on
    // a solid canvas. Street tiles and aerial imagery both competed with the
    // choropleth that carries the meaning, so they come off entirely here and
    // go straight back for every other layer.
    useEffect(() => {
        const map = mapInstanceRef.current;
        const tiles = tileLayerRef.current;
        if (!map || !tiles) return;

        if (currentLayer === "diversity") {
            if (map.hasLayer(tiles)) map.removeLayer(tiles);
        } else if (!map.hasLayer(tiles)) {
            tiles.addTo(map);
            tiles.bringToBack();
        }
    }, [currentLayer]);

    // Live update GeoJSON styling when filters or active data change
    useEffect(() => {
        if (activeFeatureRef.current && geoLayerRef.current) {
            geoLayerRef.current.resetStyle(activeFeatureRef.current);
            activeFeatureRef.current = null;
        }

        if (geoLayerRef.current) {
            geoLayerRef.current.eachLayer((layer_feature) => {
                const style = getFeatureStyle(layer_feature.feature, currentLayer, appTypeFilter);
                layer_feature.setStyle(style);
                
                if (layer_feature._path) {
                    if (style.className === "imaps-deadspace") {
                        layer_feature._path.classList.add("imaps-deadspace");
                    } else {
                        layer_feature._path.classList.remove("imaps-deadspace");
                    }
                }
            });
        }

        const isZoningActive = currentLayer === "zoning";
        const isTrendsActive = currentLayer === "trends";
        const isDiversityActive = currentLayer === "diversity";
        const isLandUsePlanVisible = isZoningActive || isTrendsActive || isDiversityActive;

        // In diversity mode the CLUP parcels are drawn for the *selected*
        // barangay only. Spreading them under the whole municipality turned the
        // choropleth to mud; confined to one barangay they answer the obvious
        // follow-up question — "what is this place actually made of?" — and
        // match the mix breakdown in the panel swatch for swatch.
        const selectedName = (selectedBgy?.name || "").trim().toLowerCase();

        // Attach the parcels only while something shows them. If they are
        // needed before the idle-time prefetch finished, start (or join) the
        // build now; `zoningReady` re-runs this effect when it lands.
        // Trends relies on the pre-rendered CLUP raster below instead of this
        // vector layer — drawing both at once doubled the render cost for a
        // layer that visually reads identically to Zoning either way.
        const needsParcels = isZoningActive || (isDiversityActive && Boolean(selectedName));
        const map = mapInstanceRef.current;
        if (needsParcels && !zoningLayerRef.current) {
            ensureZoningLayer();
        }
        if (map && zoningLayerRef.current) {
            const attached = map.hasLayer(zoningLayerRef.current);
            if (needsParcels && !attached) map.addLayer(zoningLayerRef.current);
            if (!needsParcels && attached) map.removeLayer(zoningLayerRef.current);
        }

        if (zoningLayerRef.current && needsParcels) {
            zoningLayerRef.current.setStyle((feature) => {
                const props = feature.properties || {};
                const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "";
                const zone = getZoneInfo(String(rawZone).trim());

                if (isDiversityActive) {
                    const parcelBgy = (props.location || props.LOCATION || props.barangay || "").trim().toLowerCase();
                    const inSelected = selectedName && parcelBgy === selectedName;
                    return {
                        color: "#ffffff",
                        weight: inSelected ? 0.6 : 0,
                        fillColor: zone.fill,
                        fillOpacity: inSelected ? 0.92 : 0,
                        opacity: inSelected ? 0.55 : 0,
                    };
                }

                return {
                    color: zone.stroke,
                    weight: 1.5,
                    fillColor: zone.fill,
                    fillOpacity: isZoningActive ? clupOpacity : 0,
                    opacity: isLandUsePlanVisible ? 0.9 : 0
                };
            });
        }

        // The pre-rendered CLUP raster stays off in diversity mode — it is a
        // picture of the whole plan and cannot be clipped to one barangay.
        if (isZoningActive || isTrendsActive) {
            if (clupTileLayerRef.current && mapInstanceRef.current && !mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
                mapInstanceRef.current.addLayer(clupTileLayerRef.current);
            }
            if (clupTileLayerRef.current) {
                clupTileLayerRef.current.setOpacity(isTrendsActive ? 0.65 : clupOpacity);
            }
        } else if (clupTileLayerRef.current && mapInstanceRef.current && mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
            mapInstanceRef.current.removeLayer(clupTileLayerRef.current);
        }

        if (isDiversityActive) {
            // Only claim the parcels are on screen once they really are, so the
            // legend's zone key doesn't appear ahead of the zones it keys.
            onParcelsVisible(Boolean(selectedName) && Boolean(zoningLayerRef.current));
        }

        if (isLandUsePlanVisible) {
            if (zoningLayerRef.current && needsParcels) zoningLayerRef.current.bringToFront();
            if (geoLayerRef.current) geoLayerRef.current.bringToFront();
        }

        // Barangay outlines draw above the parcels, but the selected barangay's
        // fill would hide them, so it renders as an outline only.
        if (isDiversityActive && selectedName && geoLayerRef.current) {
            geoLayerRef.current.eachLayer((lf) => {
                const p = lf.feature?.properties || {};
                const n = resolveBarangayName(p);
                if (n.toLowerCase() === selectedName) {
                    lf.setStyle({ fill: false, weight: 2.4, color: "#8b0000", opacity: 1 });
                    lf.bringToFront();
                }
            });
        }
    }, [currentLayer, appTypeFilter, clupOpacity, staticBgyData, diversityLens, diversityBandFilter, selectedBgy, zoningReady, barangaysReady]);

    // Centroid score chips for the 2D map, with greedy collision decluttering.
    //
    // MapLibre declutters symbol layers for free (`text-allow-overlap: false`),
    // which is why the 3D view can label all 48 barangays at any zoom. Leaflet
    // has no equivalent, so this used to hide every label below zoom 13 rather
    // than show 48 overlapping chips. Instead, place chips in priority order
    // (strongest value under the active lens first) and skip any whose box
    // would overlap one already placed. Zooming in frees space, so more labels
    // appear — the same behaviour, done by hand.
    const renderDiversityChips = useCallback(() => {
        const map = mapInstanceRef.current;
        if (!map || !diversityLabelsLayerRef.current || !geoLayerRef.current) return;
        diversityLabelsLayerRef.current.clearLayers();

        if (layerRef.current !== "diversity") return;

        const activeBand = diversityBandRef.current || "all";
        const lensId = diversityLensRef.current;
        const selectedName = (selectedBgyRef.current?.name || "").toLowerCase();

        // While a barangay is isolated every other shape is invisible, so a
        // floating score chip hovering over blank canvas would be an orphaned
        // label with nothing underneath it. The selected barangay's own name
        // and score already live in the docked panel, so nothing needs a chip.
        if (selectedName) return;

        import("leaflet").then((L) => {
            if (!diversityLabelsLayerRef.current || !geoLayerRef.current || !mapInstanceRef.current) return;

            const candidates = [];
            geoLayerRef.current.eachLayer((layer_feature) => {
                const name = resolveBarangayName(layer_feature.feature?.properties);
                if (!name) return;
                const bgyData = staticBgyData[name] || {};
                if (!matchesBand(lensId, activeBand, bgyData)) return;
                if (selectedName && name.toLowerCase() === selectedName) return;

                const resolved = resolveLensValue(lensId, bgyData);
                candidates.push({ name, bgyData, resolved, layer_feature });
            });

            // Priority: the barangays a planner most needs to see. Drift ranks
            // by distance from the plan in either direction; mix by score.
            candidates.sort((a, b) =>
                lensId === "drift"
                    ? Math.abs(b.resolved.value) - Math.abs(a.resolved.value)
                    : b.resolved.value - a.resolved.value
            );

            const placed = [];
            const CHAR_PX = 6.1;   // approx width per character at the chip's size
            const PAD_PX = 34;     // chip padding + the value badge
            const HEIGHT_PX = 20;
            const GUTTER = 3;

            candidates.forEach(({ name, resolved, layer_feature }) => {
                const center = layer_feature.getBounds().getCenter();
                const pt = mapInstanceRef.current.latLngToContainerPoint(center);
                const w = name.length * CHAR_PX + PAD_PX;
                const box = {
                    left: pt.x - w / 2 - GUTTER,
                    right: pt.x + w / 2 + GUTTER,
                    top: pt.y - HEIGHT_PX / 2 - GUTTER,
                    bottom: pt.y + HEIGHT_PX / 2 + GUTTER,
                };

                const collides = placed.some(
                    (q) => box.left < q.right && box.right > q.left && box.top < q.bottom && box.bottom > q.top
                );
                if (collides) return;
                placed.push(box);

                const labelIcon = L.default.divIcon({
                    className: "diversity-centroid-chip",
                    html: `
                        <div class="diversity-chip-inner" style="background-color: ${resolved.stroke};" title="${name}: ${resolved.formatted} (${resolved.band.classification})">
                            <span>${name}</span>
                            <span class="diversity-chip-value">${resolved.formatted}</span>
                        </div>
                    `,
                    iconSize: [0, 0],
                });

                const marker = L.default.marker(center, { icon: labelIcon, interactive: true });
                marker.on("click", (e) => {
                    L.default.DomEvent.stopPropagation(e);
                    layer_feature.fire("click");
                });
                marker.on("mouseover", () => onHoverBgy(name));
                marker.on("mouseout", () => onHoverBgy(null));
                diversityLabelsLayerRef.current.addLayer(marker);
            });
        });
    }, [staticBgyData, onHoverBgy]);

    useEffect(() => {
        renderDiversityChips();
    }, [currentLayer, diversityLens, diversityBandFilter, staticBgyData, selectedBgy, renderDiversityChips, barangaysReady]);

    // Which labels fit depends on the current viewport, so re-place them once
    // the camera settles.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        const onSettled = () => renderDiversityChips();
        map.on("moveend", onSettled);
        map.on("zoomend", onSettled);
        return () => {
            map.off("moveend", onSettled);
            map.off("zoomend", onSettled);
        };
    }, [renderDiversityChips]);

    // Mirror the side panel's hover onto the 2D polygons, so the explorer list
    // and the map behave like one instrument (the 3D view does the same).
    useEffect(() => {
        if (currentLayer !== "diversity" || !geoLayerRef.current) return;

        let hoveredLayer = null;
        geoLayerRef.current.eachLayer((layer_feature) => {
            const props = layer_feature.feature?.properties || {};
            const name = resolveBarangayName(props);

            if (hoveredBgy && name.toLowerCase() === hoveredBgy.toLowerCase()) {
                hoveredLayer = layer_feature;
            }
        });

        if (!hoveredLayer || hoveredLayer === activeFeatureRef.current) return;

        const bgyData = staticBgyData[hoveredBgy] || {};
        const resolved = resolveLensValue(diversityLens, bgyData);
        hoveredLayer.setStyle({ fillColor: resolved.color, fillOpacity: 0.9, weight: 3, color: "#8b0000", opacity: 1 });
        hoveredLayer.bringToFront();

        return () => {
            if (hoveredLayer && geoLayerRef.current && hoveredLayer !== activeFeatureRef.current) {
                geoLayerRef.current.resetStyle(hoveredLayer);
            }
        };
    }, [hoveredBgy, currentLayer, diversityLens, staticBgyData]);

    // Smooth Fly-To handler when selecting application or barangay cluster
    useEffect(() => {
        if (!mapInstanceRef.current || !flyToTarget) return;
        const { coords, zoom, appId, openPopup } = flyToTarget;
        if (coords && Array.isArray(coords) && coords.length === 2) {
            mapInstanceRef.current.flyTo(coords, zoom || 16, {
                duration: 0.9,
                easeLinearity: 0.25,
            });

            if (openPopup && appId) {
                const triggerPopup = () => {
                    if (markersByAppIdRef.current[appId]) {
                        markersByAppIdRef.current[appId].openPopup();
                    } else if (establishmentMarkersRef.current[appId]) {
                        establishmentMarkersRef.current[appId].openPopup();
                    }
                };
                setTimeout(triggerPopup, 300);
                setTimeout(triggerPopup, 950);
            }
        }
    }, [flyToTarget]);

    // Plot the CLUP zone found by "Verify Parcel" directly on the map: a
    // pulsing ring colour-coded by the resolved zone category (same palette
    // as the CLUP 2030 layer), so the check and the map stay visually tied
    // together instead of the result only living in the side panel.
    useEffect(() => {
        if (!verifiedParcelLayerRef.current) return;
        verifiedParcelLayerRef.current.clearLayers();
        if (!verifiedParcel) return;

        import("leaflet").then((L) => {
            if (!verifiedParcelLayerRef.current) return;
            const Leaflet = L.default || L;
            const { lat, lng, zoneInfo, conformity, parcel } = verifiedParcel;
            if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) return;

            const ringColor = zoneInfo?.stroke || "#2563eb";
            const fillColor = zoneInfo?.fill || "#93c5fd";

            const icon = Leaflet.divIcon({
                className: "verified-parcel-marker",
                html: `
                    <div class="relative" style="transform: translate(-50%, -50%);">
                        <div class="absolute inset-0 rounded-full animate-ping" style="background-color: ${ringColor}66; width: 34px; height: 34px; margin: -7px 0 0 -7px;"></div>
                        <div class="rounded-full shadow-lg" style="width: 20px; height: 20px; background-color: ${fillColor}; border: 3px solid ${ringColor};"></div>
                    </div>
                `,
                iconSize: [20, 20],
                iconAnchor: [10, 10],
            });

            const marker = Leaflet.marker([lat, lng], { icon, zIndexOffset: 3000 });
            const zoneLabel = zoneInfo?.code ? `${zoneInfo.categoryLabel || zoneInfo.label} (${zoneInfo.code})` : (zoneInfo?.label || "Undesignated");
            marker.bindPopup(`
                <div class="font-sans min-w-[200px] p-1">
                    <div class="text-[10px] font-bold uppercase tracking-wider text-slate-400">CLUP Zone</div>
                    <div class="text-sm font-black text-slate-900">${zoneLabel}</div>
                    <div class="mt-1.5 pt-1.5 border-t border-slate-100 text-[11px] font-bold ${conformity?.isConforming ? "text-emerald-700" : "text-amber-700"}">
                        ${conformity?.title || ""}
                    </div>
                    ${parcel?.tct_number ? `<div class="text-[10px] text-slate-500 mt-0.5">TCT ${parcel.tct_number}</div>` : ""}
                </div>
            `, { className: "custom-app-popup", closeButton: true, maxWidth: 240 });

            marker.addTo(verifiedParcelLayerRef.current);
        });
    }, [verifiedParcel]);

    // Live update Application Status Pins & Barangay Workload Clusters: ONLY for Permit & Status layer ("status")
    useEffect(() => {
        if (!applicationsLayerRef.current || !mapInstanceRef.current) return;

        applicationsLayerRef.current.clearLayers();
        markersByAppIdRef.current = {};

        if (currentLayer === "status" && Array.isArray(applications) && applications.length > 0) {
            import("leaflet").then((L) => {
                // 1. Filter applications by appTypeFilter, statusFilter, and searchFilter
                const filtered = applications.filter((app) => {
                    if (appTypeFilter && appTypeFilter !== "All") {
                        if (!(app?.application_type || "").toLowerCase().includes(appTypeFilter.toLowerCase())) {
                            return false;
                        }
                    }
                    if (statusFilter && statusFilter !== "All") {
                        const s = (app?.status || "").toLowerCase();
                        const f = statusFilter.toLowerCase();
                        if (f === "overdue") {
                            const sla = getSLAInfo(app?.created_at, app?.status);
                            if (sla.days <= 7 || sla.status === "completed") return false;
                        } else if (f === "received") {
                            if (!s.includes("received") && (s.includes("review") || s.includes("release") || s.includes("denied"))) return false;
                        } else if (f.includes("review")) {
                            if (!s.includes("review")) return false;
                        } else if (f.includes("sangguniang") || f.includes("sb")) {
                            if (!s.includes("sangguniang") && !s.includes("bayan") && !s.includes("hearing")) return false;
                        } else if (f.includes("for release")) {
                            if (!s.includes("for release")) return false;
                        } else if (f.includes("released")) {
                            if (!s.includes("released") && !s.includes("approved")) return false;
                        } else if (f.includes("denied")) {
                            if (!s.includes("denied") && !s.includes("reject")) return false;
                        } else if (!s.includes(f)) {
                            return false;
                        }
                    }
                    if (searchFilter && searchFilter.trim()) {
                        const q = searchFilter.toLowerCase().trim();
                        const applicant = (app?.applicant_name || "").toLowerCase();
                        const refNo = (app?.reference_number || "").toLowerCase();
                        const bgy = (app?.barangay || "").toLowerCase();
                        const appType = (app?.application_type || "").toLowerCase();
                        const lotNo = (app?.parcels?.[0]?.lot_number || "").toLowerCase();
                        const taxDec = (app?.parcels?.[0]?.tax_dec_number || "").toLowerCase();
                        if (!applicant.includes(q) && !refNo.includes(q) && !bgy.includes(q) && !appType.includes(q) && !lotNo.includes(q) && !taxDec.includes(q)) {
                            return false;
                        }
                    }
                    return true;
                });

                // 2. Determine whether to show Municipal Workload Badges or Individual Pins
                const isClusterMode = mapZoom <= 13 && !selectedBgy;

                if (isClusterMode) {
                    // Group filtered applications by barangay
                    const bgyCounts = {};
                    filtered.forEach((app) => {
                        const bgy = (app?.barangay || "Poblacion").trim();
                        if (!bgyCounts[bgy]) {
                            bgyCounts[bgy] = { name: bgy, count: 0, review: 0, received: 0, released: 0, overdue: 0, warning: 0 };
                        }
                        bgyCounts[bgy].count += 1;
                        const s = (app?.status || "").toLowerCase();
                        if (s.includes("review")) bgyCounts[bgy].review += 1;
                        else if (s.includes("release") || s.includes("approved")) bgyCounts[bgy].released += 1;
                        else bgyCounts[bgy].received += 1;

                        const isResolved = s.includes("release") || s.includes("approved");
                        if (!isResolved) {
                            const sla = getSLAInfo(app?.created_at, app?.status);
                            if (sla.days > 14) {
                                bgyCounts[bgy].overdue += 1;
                            } else if (sla.days > 5) {
                                bgyCounts[bgy].warning += 1;
                            }
                        }
                    });

                    // Spatial proximity clustering: merge barangays within 0.010 degrees (~1.1 km)
                    // This cleans up and merges Poblacion sub-barangays (Poblacion, Poblacion A-E) so badges never overlap!
                    const clusters = [];
                    const CLUSTER_PROXIMITY = 0.010;

                    Object.values(bgyCounts).forEach((bgyItem) => {
                        const coord = ROSARIO_BGY_COORDS[bgyItem.name] || ROSARIO_BGY_COORDS["Poblacion"] || [13.8475, 121.2058];
                        
                        let foundCluster = null;
                        for (const cl of clusters) {
                            const dLat = cl.center[0] - coord[0];
                            const dLng = cl.center[1] - coord[1];
                            const dist = Math.sqrt(dLat * dLat + dLng * dLng);
                            if (dist < CLUSTER_PROXIMITY) {
                                foundCluster = cl;
                                break;
                            }
                        }

                        if (foundCluster) {
                            foundCluster.barangays.push(bgyItem.name);
                            foundCluster.count += bgyItem.count;
                            foundCluster.review += bgyItem.review;
                            foundCluster.received += bgyItem.received;
                            foundCluster.released += bgyItem.released;
                            foundCluster.overdue += bgyItem.overdue;
                            foundCluster.warning += bgyItem.warning;
                            foundCluster.totalWeight += bgyItem.count;
                            foundCluster.center = [
                                (foundCluster.center[0] * (foundCluster.totalWeight - bgyItem.count) + coord[0] * bgyItem.count) / foundCluster.totalWeight,
                                (foundCluster.center[1] * (foundCluster.totalWeight - bgyItem.count) + coord[1] * bgyItem.count) / foundCluster.totalWeight,
                            ];
                        } else {
                            clusters.push({
                                center: [...coord],
                                totalWeight: bgyItem.count,
                                barangays: [bgyItem.name],
                                count: bgyItem.count,
                                review: bgyItem.review,
                                received: bgyItem.received,
                                released: bgyItem.released,
                                overdue: bgyItem.overdue,
                                warning: bgyItem.warning,
                            });
                        }
                    });

                    // Render non-overlapping numbered pin markers (NO horizontal pills)
                    clusters.forEach((cl) => {
                        let displayName = cl.barangays[0];
                        if (cl.barangays.length > 1) {
                            const hasPoblacion = cl.barangays.some((b) => b.toLowerCase().includes("poblacion"));
                            if (hasPoblacion) {
                                displayName = "Poblacion";
                            } else {
                                displayName = `${cl.barangays[0]} +${cl.barangays.length - 1}`;
                            }
                        }

                        let pinColor = "#2563eb";
                        let pinBorder = "#1d4ed8";

                        if (cl.review > 0 && cl.received === 0 && cl.released === 0) {
                            pinColor = "#f59e0b";
                            pinBorder = "#d97706";
                        } else if (cl.received > 0 && cl.review === 0 && cl.released === 0) {
                            pinColor = "#10b981";
                            pinBorder = "#059669";
                        }

                        const icon = createNumberedPinIcon(
                            cl.count,
                            pinColor,
                            pinBorder,
                            L,
                            false,
                            `${displayName} · ${cl.count} application${cl.count !== 1 ? 's' : ''}`
                        );

                        const marker = L.default.marker(cl.center, {
                            icon,
                            zIndexOffset: 1100,
                        });

                        marker.on("click", (e) => {
                            L.default.DomEvent.stopPropagation(e);
                            if (mapInstanceRef.current) {
                                mapInstanceRef.current.flyTo(cl.center, 15, { duration: 0.9 });
                            }
                            if (cl.barangays.length === 1 && onFeatureClick) {
                                const bgyName = cl.barangays[0];
                                const bgyData = staticBgyData[bgyName] || { total: cl.count };
                                onFeatureClick(bgyName, bgyData);
                            }
                        });

                        applicationsLayerRef.current.addLayer(marker);
                    });
                } else {
                    // Individual Pins Mode with Radial Spiderfy Distribution for co-located points
                    const appsToRender = selectedBgy && selectedBgy.name
                        ? filtered.filter((app) => (app?.barangay || "").trim().toLowerCase() === selectedBgy.name.trim().toLowerCase())
                        : filtered;

                    const appIndexMap = new Map();
                    appsToRender.forEach((app, idx) => {
                        appIndexMap.set(app.id, idx + 1);
                    });

                    const coordGroups = {};
                    appsToRender.forEach((app) => {
                        const baseCoord = getAppCoordinates(app);
                        const key = `${baseCoord[0].toFixed(4)},${baseCoord[1].toFixed(4)}`;
                        if (!coordGroups[key]) {
                            coordGroups[key] = { center: baseCoord, apps: [] };
                        }
                        coordGroups[key].apps.push(app);
                    });

                    Object.values(coordGroups).forEach((group) => {
                        const count = group.apps.length;
                        group.apps.forEach((app, idx) => {
                            let coords = group.center;
                            if (count > 1) {
                                const angle = (idx * 2 * Math.PI) / count;
                                const radius = 0.00085; // ~90 meters on ground
                                coords = [
                                    group.center[0] + radius * Math.sin(angle),
                                    group.center[1] + radius * Math.cos(angle)
                                ];
                            }

                            const isHovered = hoveredAppId === app.id;
                            const config = getStatusMarkerConfig(app?.status);
                            const pinColor = config.color;
                            const pinBorder = config.border;

                            const pinNumber = appIndexMap.get(app.id) || (idx + 1);
                            const tooltipText = `${app?.reference_number || `APP-${app.id}`} · ${app?.applicant_name || 'Applicant'}`;

                            const markerIcon = createNumberedPinIcon(
                                pinNumber,
                                pinColor,
                                pinBorder,
                                L,
                                isHovered,
                                tooltipText
                            );

                            const marker = L.default.marker(coords, {
                                icon: markerIcon,
                                zIndexOffset: isHovered ? 2000 : 1200,
                            });

                            const bgyZoneValue = app?.barangay ? staticBgyData?.[app.barangay.trim()]?.Primary_Zone : null;
                            const popupHtml = createApplicationPopupHtml(app, bgyZoneValue);
                            marker.bindPopup(popupHtml, {
                                className: "custom-app-popup",
                                closeButton: true,
                                maxWidth: 295,
                            });

                            marker.on("click", (e) => {
                                L.default.DomEvent.stopPropagation(e);
                                if (app?.barangay && onFeatureClick) {
                                    const bgyName = app.barangay.trim();
                                    const bgyData = staticBgyData[bgyName] || { total: 1 };
                                    onFeatureClick(bgyName, bgyData);
                                }
                                if (onInspectApp) {
                                    onInspectApp(app);
                                }
                                const cardEl = document.getElementById(`app-card-${app.id}`);
                                if (cardEl) {
                                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                }
                            });

                            applicationsLayerRef.current.addLayer(marker);
                            markersByAppIdRef.current[app.id] = marker;
                        });
                    });
                }

                if (!mapInstanceRef.current.hasLayer(applicationsLayerRef.current)) {
                    mapInstanceRef.current.addLayer(applicationsLayerRef.current);
                }
            });
        } else {
            if (mapInstanceRef.current.hasLayer(applicationsLayerRef.current)) {
                mapInstanceRef.current.removeLayer(applicationsLayerRef.current);
            }
        }
    }, [currentLayer, appTypeFilter, statusFilter, searchFilter, applications, staticBgyData, mapZoom, selectedBgy, hoveredAppId]);

    // Live update Urban Growth Establishments & Landmark Pins for the active year using historical Locational Clearance data
    useEffect(() => {
        if (!establishmentsLayerRef.current || !mapInstanceRef.current) return;

        if (currentLayer === "trends") {
            const map = mapInstanceRef.current;
            if (!map.getPane("pinsPane")) {
                const pinsPane = map.createPane("pinsPane");
                pinsPane.style.zIndex = "650";
            }

            const L_Obj = L.default || L;
            const pinsToRender = selectedBgy && selectedBgy.name
                ? (historicalPins || []).filter(p => (p.barangay || "").trim().toLowerCase() === selectedBgy.name.trim().toLowerCase())
                : (historicalPins || []);

            const canvasRenderer = L_Obj.canvas({ pane: 'pinsPane' });
            const newMarkers = [];
            const newMarkersRef = {};

            pinsToRender.forEach((pin) => {
                if (!pin.latitude || !pin.longitude) return;
                const coords = [pin.latitude, pin.longitude];

                const cat = pin.target_land_use_class || 'Commercial';
                
                let dotColor = '#64748b';
                let dotBg = '#f1f5f9';
                if (pin.isForecast) {
                    dotColor = '#2563eb';
                    dotBg = '#dbeafe';
                } else {
                    if (cat === 'Commercial') { dotColor = '#f59e0b'; dotBg = '#fef3c7'; }
                    else if (cat === 'Industrial') { dotColor = '#ef4444'; dotBg = '#fee2e2'; }
                    else if (cat === 'Agro-industrial') { dotColor = '#8b5cf6'; dotBg = '#f3e8ff'; }
                    else if (cat === 'Residential') { dotColor = '#10b981'; dotBg = '#dcfce7'; }
                }

                const marker = L_Obj.circleMarker(coords, {
                    pane: 'pinsPane',
                    renderer: canvasRenderer,
                    radius: pin.isForecast ? 6 : 4.5,
                    color: '#ffffff',
                    weight: 1.5,
                    fillColor: dotColor,
                    fillOpacity: 0.95,
                });

                const dateStr = pin.created_at ? new Date(pin.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '';

                const popupHtml = pin.isForecast ? `
                    <div class="font-sans min-w-[240px] max-w-[285px] p-1">
                        <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span class="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                                ${pin.reference_number || 'FC-2026-001'}
                            </span>
                            <span class="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">
                                ● FORECASTED
                            </span>
                        </div>
                        <div class="mt-2 space-y-1.5 text-xs">
                            <h4 class="font-black text-slate-900 text-sm leading-tight">${pin.applicant_name || 'Forecasted Application'}</h4>
                            <p class="text-[11px] font-semibold text-blue-700">Locational Clearance (Spatial Model)</p>
                            <p class="text-[10.5px] text-slate-600">${pin.purpose || ''}</p>
                            <div class="pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[10.5px]">
                                <div>
                                    <span class="text-slate-400 block text-[9px] font-bold uppercase">Barangay</span>
                                    <span class="font-bold text-slate-800 truncate block">Brgy. ${pin.barangay || '—'}</span>
                                </div>
                                <div>
                                    <span class="text-slate-400 block text-[9px] font-bold uppercase">Land Use Category</span>
                                    <span class="font-bold text-slate-800 truncate block">${cat}</span>
                                </div>
                            </div>
                            <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                <span class="text-blue-600 font-bold font-mono">Target: ${pin.year || 2026} Q${pin.quarter || 4}</span>
                                ${pin.lot_area_sqm ? `<span class="text-slate-500 font-mono font-bold">${pin.lot_area_sqm} sqm</span>` : ''}
                            </div>
                        </div>
                    </div>
                ` : `
                    <div class="font-sans min-w-[240px] max-w-[285px] p-1">
                        <div class="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span class="text-[10px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                ${pin.reference_number || 'U-000000'}
                            </span>
                            <span class="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style="background-color: ${dotBg}; color: ${dotColor}; border: 1px solid ${dotColor}40;">
                                ● ${pin.zoning_code || cat}
                            </span>
                        </div>
                        <div class="mt-2 space-y-1.5 text-xs">
                            <h4 class="font-black text-slate-900 text-sm leading-tight">${pin.applicant_name || 'Applicant'}</h4>
                            <p class="text-[11px] font-semibold text-blue-700">${pin.application_type || 'Locational Clearance'}</p>
                            <p class="text-[10.5px] text-slate-600">${pin.purpose || ''}</p>
                            <div class="pt-1.5 border-t border-slate-100 grid grid-cols-2 gap-1.5 text-[10.5px]">
                                <div>
                                    <span class="text-slate-400 block text-[9px] font-bold uppercase">Barangay</span>
                                    <span class="font-bold text-slate-800 truncate block">${pin.barangay || '—'}</span>
                                </div>
                                <div>
                                    <span class="text-slate-400 block text-[9px] font-bold uppercase">Category</span>
                                    <span class="font-bold text-slate-800 truncate block">${cat}</span>
                                </div>
                            </div>
                            <div class="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                <span class="text-slate-400 font-mono">Date: ${dateStr}</span>
                                ${pin.lot_area_sqm ? `<span class="text-slate-500 font-mono font-bold">${pin.lot_area_sqm} sqm</span>` : ''}
                            </div>
                        </div>
                    </div>
                `;

                marker.bindPopup(popupHtml, {
                    className: "custom-app-popup",
                    closeButton: true,
                    maxWidth: 285,
                });

                newMarkers.push(marker);
                newMarkersRef[pin.id || Math.random()] = marker;
            });

            // Single synchronous swap — 0 blank frames, 0 blinking
            establishmentsLayerRef.current.clearLayers();
            newMarkers.forEach(m => establishmentsLayerRef.current.addLayer(m));
            establishmentMarkersRef.current = newMarkersRef;

            if (!mapInstanceRef.current.hasLayer(establishmentsLayerRef.current)) {
                mapInstanceRef.current.addLayer(establishmentsLayerRef.current);
            }
        } else {
            establishmentsLayerRef.current.clearLayers();
            establishmentMarkersRef.current = {};
            if (mapInstanceRef.current.hasLayer(establishmentsLayerRef.current)) {
                mapInstanceRef.current.removeLayer(establishmentsLayerRef.current);
            }
        }
    }, [currentLayer, historicalPins, selectedBgy]);

    return (
        <>
            <svg style={{ position: 'absolute', width: 0, height: 0 }}>
                <defs>
                    <pattern id="pattern-gray-line-969696" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill="#969696" />
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#d1d5db" strokeWidth="2" />
                    </pattern>
                    <pattern id="pattern-gray-line-ffc92b" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill="#ffc92b" />
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#969696" strokeWidth="2" />
                    </pattern>
                    <pattern id="pattern-gray-line-94d180" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill="#94d180" />
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#969696" strokeWidth="2" />
                    </pattern>
                    <pattern id="pattern-darkgreen-line-5bb93c" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
                        <rect width="8" height="8" fill="#5bb93c" />
                        <line x1="0" y1="0" x2="0" y2="8" stroke="#1c4714" strokeWidth="2" />
                    </pattern>
                </defs>
            </svg>
            <div ref={mapRef} id="map" className="absolute inset-0 z-0" />
        </>
    );
}

class MapsErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        this.setState({ errorInfo });
        console.error("MapsErrorBoundary caught an error", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '2rem', background: '#fee2e2', color: '#991b1b', minHeight: '100vh', fontFamily: 'monospace' }}>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Dashboard component crashed!</h2>
                    <br />
                    <strong style={{ fontSize: '1.2rem' }}>{this.state.error && this.state.error.toString()}</strong>
                    <br /><br />
                    <pre style={{ background: 'rgba(255,255,255,0.5)', padding: '1rem', whiteSpace: 'pre-wrap' }}>
                        {this.state.errorInfo && this.state.errorInfo.componentStack}
                    </pre>
                </div>
            );
        }
        return this.props.children;
    }
}

// Builds the years an urban-growth timeline can scrub through: the CLUP
// baseline year through whichever is later, 2026 or the newest real permit
// on file. The range never shrinks below 2020-2026 (matching the original
// slider's span), but widens automatically if filings ever reach past it.
// Years with zero permits simply show zero — nothing here is invented.
const TIMELINE_BASELINE_YEAR = 2021;
function buildTimelineQuarters() {
    const quarters = [];
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentQuarter = Math.floor(now.getMonth() / 3) + 1;

    for (let y = 2021; y <= currentYear; y++) {
        for (let q = 1; q <= 4; q++) {
            if (y === currentYear && q > currentQuarter) break;
            quarters.push({ year: y, quarter: q, label: `Q${q} '${y.toString().slice(-2)}`, isForecast: false });
        }
    }
    
    let fy = currentYear;
    let fq = currentQuarter + 1;
    if (fq > 4) { fq = 1; fy++; }
    quarters.push({ year: fy, quarter: fq, label: `Q${fq} '${fy.toString().slice(-2)}`, isForecast: true });
    
    fq++;
    if (fq > 4) { fq = 1; fy++; }
    quarters.push({ year: fy, quarter: fq, label: `Q${fq} '${fy.toString().slice(-2)}`, isForecast: true });

    return quarters;
}

function DashboardInner({ userName, userRole, total, thisMonth, statusMap, bgyStats, recent, filters, overallDiversity, urbanGrowthData }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("standard");
    const [stylePopupOpen, setStylePopupOpen] = useState(false);
    const [appTypeFilter, setAppTypeFilter] = useState(filters?.application_type || "Zoning Certificate");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [clupOpacity, setClupOpacity] = useState(0.85);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [mapZoom, setMapZoom] = useState(13);
    const [resetTrigger, setResetTrigger] = useState(0);
    const [searchTargetBgy, setSearchTargetBgy] = useState(null);
    const [inspectedApp, setInspectedApp] = useState(null);
    const [statusFilter, setStatusFilter] = useState("All");
    const [hoveredAppId, setHoveredAppId] = useState(null);
    const [flyToTarget, setFlyToTarget] = useState(null);
    const [verifiedParcel, setVerifiedParcel] = useState(null);
    const [diversityBandFilter, setDiversityBandFilter] = useState("all");
    const [diversityLens, setDiversityLens] = useState("mix");
    // Urban Growth time machine — scrubs cumulative real permits across a
    // 2020-2026+ year range (widening only if filings ever go past 2026).
    // Years with no filings show zero; nothing is simulated.
    const timelineQuarters = useMemo(() => buildTimelineQuarters(), []);
    const [activeQuarterIndex, setActiveQuarterIndex] = useState(() => timelineQuarters.length - 1);
    const [isTimelinePlaying, setIsTimelinePlaying] = useState(false);
    
    useEffect(() => {
        setActiveQuarterIndex((i) => Math.min(i, timelineQuarters.length - 1));
    }, [timelineQuarters]);
    
    const activeQuarter = timelineQuarters[activeQuarterIndex] || timelineQuarters[timelineQuarters.length - 1];
    const activeYear = activeQuarter?.year;
    
    const [apiQuarterData, setApiQuarterData] = useState({ pins: [], metrics: null });
    const [customForecastData, setCustomForecastData] = useState(() => {
        try {
            const saved = localStorage.getItem('imaps_forecast_data');
            if (saved) return JSON.parse(saved);
        } catch (e) {}
        return null;
    });

    const handleForecastGenerated = (data) => {
        if (!data) return;
        setCustomForecastData(data);
        try {
            localStorage.setItem('imaps_forecast_data', JSON.stringify(data));
        } catch (e) {}
    };

    useEffect(() => {
        if (!activeQuarter) return;
        fetch(`/api/forecast/${activeQuarter.year}/${activeQuarter.quarter}`)
            .then(res => res.json())
            .then(res => {
                if (res.status === 'success') {
                    setApiQuarterData(res.data);
                } else {
                    setApiQuarterData({ pins: [], metrics: null });
                }
            })
            .catch(err => {
                console.error("Forecast API error", err);
                setApiQuarterData({ pins: [], metrics: null });
            });
    }, [activeQuarter]);

    const activeHistoricalPins = useMemo(() => {
        if (activeQuarter?.isForecast) {
            if (customForecastData && Array.isArray(customForecastData.pins) && customForecastData.pins.length > 0) {
                const qPins = customForecastData.pins.filter(p => {
                    if (p.year && p.quarter) {
                        return p.year === activeQuarter.year && p.quarter === activeQuarter.quarter;
                    }
                    return true;
                });
                return qPins.length > 0 ? qPins : customForecastData.pins;
            }
            return apiQuarterData.pins || [];
        }
        const pinsByYear = urbanGrowthData?.historicalPins ?? {};
        if (!activeQuarter) return [];
        
        const cutoffMonth = activeQuarter.quarter * 3;
        const cutoffDate = new Date(activeQuarter.year, cutoffMonth, 0, 23, 59, 59, 999);

        const accumulated = [];
        for (let y = 2021; y <= activeQuarter.year; y++) {
            const yearPins = pinsByYear[y] ?? [];
            yearPins.forEach(p => {
                const pDate = p?.created_at ? new Date(p.created_at) : null;
                if (pDate && !isNaN(pDate.getTime()) && pDate <= cutoffDate) {
                    accumulated.push(p);
                }
            });
        }
        return accumulated;
    }, [urbanGrowthData, activeQuarter, apiQuarterData, customForecastData]);

    const activePermitsCount = useMemo(() => {
        return activeHistoricalPins.length;
    }, [activeHistoricalPins]);

    const forecastMetrics = useMemo(() => {
        if (customForecastData?.metrics) {
            const m = customForecastData.metrics;
            return {
                mae: Number(m.validation_mae ?? m.mae ?? 2.155),
                wmape: Number(m.validation_wmape ?? m.wmape ?? 0.302),
            };
        }
        return apiQuarterData.metrics || { mae: 2.155, wmape: 0.302 };
    }, [customForecastData, apiQuarterData]);

    const timelineCutoff = useMemo(() => {
        if (!activeQuarter) return null;
        // end of quarter
        const month = activeQuarter.quarter * 3 - 1; 
        const date = new Date(activeQuarter.year, month + 1, 0, 23, 59, 59, 999);
        return date;
    }, [activeQuarter]);
    
    const timelineRecent = useMemo(() => {
        if (!timelineCutoff) return recent || [];
        return (recent || []).filter((app) => {
            const d = app?.created_at ? new Date(app.created_at) : null;
            return d && !isNaN(d.getTime()) && d <= timelineCutoff;
        });
    }, [recent, timelineCutoff]);
    const [is3DMode, setIs3DMode] = useState(true);
    const show3D = is3DMode && activeLayer === "diversity";
    // Once the 3D view has been created it stays mounted (hidden when not in
    // use), so returning to it is instant rather than a WebGL rebuild.
    const [has3DMounted, setHas3DMounted] = useState(false);
    useEffect(() => {
        if (show3D) setHas3DMounted(true);
    }, [show3D]);
    const [hoveredBgy, setHoveredBgy] = useState(null);
    // True while CLUP parcels are actually drawn, so the legend only shows the
    // zone key when there are zones on screen to key.
    // Each map reports its own parcels. With both maps kept mounted, a shared
    // flag let the hidden one overwrite the visible one's answer. Declared
    // before `parcelsVisible` below reads them — as a plain `const`, reading
    // either one earlier is a temporal-dead-zone ReferenceError on every render
    // (this shipped broken once already: it crashed the whole dashboard white).
    const [parcels2D, setParcels2D] = useState(false);
    const [parcels3D, setParcels3D] = useState(false);
    const parcelsVisible = show3D ? parcels3D : parcels2D;

    // Listen for custom inspect events dispatched by Leaflet popup buttons
    useEffect(() => {
        const handleInspectEvent = (e) => {
            const appId = e.detail;
            if (!appId || !recent) return;
            const found = recent.find((a) => a.id === appId);
            if (found) {
                setInspectedApp(found);
            }
        };
        window.addEventListener("imaps:inspect-app", handleInspectEvent);
        return () => window.removeEventListener("imaps:inspect-app", handleInspectEvent);
    }, [recent]);

    const handleStatusFilterChange = useCallback((newFilter) => {
        setStatusFilter(newFilter);
    }, []);

    // The diversity module gets the docked, opaque treatment; the other layers
    // keep the floating panel until they get their own design pass.
    const isDiversityModule = activeLayer === "diversity";

    const isBgyActive = Boolean(selectedBgy);
    const displayTotal = isBgyActive ? (selectedBgy.data.Total ?? selectedBgy.data.total ?? 0) : (total || 0);
    const displayReview = isBgyActive
        ? (selectedBgy.data["Technical Review"] ?? selectedBgy.data.review ?? 0)
        : (statusMap?.["Technical Review"] ?? 0);
    const displayReleased = isBgyActive
        ? (selectedBgy.data["Released"] ?? selectedBgy.data.released ?? 0)
        : (statusMap?.["Released"] ?? 0);
    const displayThisMonth = isBgyActive ? null : thisMonth;


    const handleLocateApp = useCallback((app) => {
        if (!app) return;
        const coords = getAppCoordinates(app);
        if (app.barangay) {
            const bgyName = app.barangay.trim();
            const bgyData = (bgyStats && bgyStats[bgyName]) ? bgyStats[bgyName] : { total: 1 };
            setSelectedBgy({ name: bgyName, data: bgyData });
        }
        setHoveredAppId(app.id);
        setFlyToTarget({ coords, zoom: 17, appId: app.id, openPopup: true, timestamp: Date.now() });
    }, [bgyStats]);

    const handleLocateEstablishment = useCallback((est) => {
        if (!est || !est.coords) return;
        if (est.barangay) {
            const bgyName = est.barangay.trim();
            const bgyData = (bgyStats && bgyStats[bgyName]) ? bgyStats[bgyName] : { total: 1 };
            setSelectedBgy({ name: bgyName, data: bgyData });
        }
        setFlyToTarget({ coords: est.coords, zoom: 17, appId: est.id, openPopup: true, timestamp: Date.now() });
    }, [bgyStats]);

    // Connects the map layer's "Verify Parcel" search to the map itself: the
    // moment a TCT/Tax Dec check resolves, the camera flies to that parcel and
    // its CLUP zone is plotted (pulsing ring) at that spot — no separate
    // "Locate" click needed.
    const handleVerifyResult = useCallback((result) => {
        const { parcel, conformity, zoneValue } = result || {};
        const lat = parseFloat(parcel?.latitude);
        const lng = parseFloat(parcel?.longitude);
        if (Number.isNaN(lat) || Number.isNaN(lng)) return;

        if (parcel.barangay) {
            const bgyName = parcel.barangay.trim();
            const bgyData = (bgyStats && bgyStats[bgyName]) ? bgyStats[bgyName] : { total: 1 };
            setSelectedBgy({ name: bgyName, data: bgyData });
        }
        setVerifiedParcel({ lat, lng, zoneInfo: getZoneInfo(zoneValue), conformity, parcel });
        setFlyToTarget({ coords: [lat, lng], zoom: 18, timestamp: Date.now() });
    }, [bgyStats]);

    const displayRecent = useMemo(() => {
        const list = Array.isArray(recent) ? recent : [];
        if (isBgyActive && selectedBgy?.name) {
            return list.filter((r) => (r.barangay || "").trim().toLowerCase() === selectedBgy.name.trim().toLowerCase()).slice(0, 5);
        }
        return list.slice(0, 5);
    }, [recent, isBgyActive, selectedBgy]);

    // Switching lens invalidates the active band id (a "diverse" band has no
    // meaning under the drift lens), so the filter resets with the question.
    const handleSelectLens = useCallback((lensId) => {
        setDiversityLens(lensId);
        setDiversityBandFilter("all");
    }, []);

    const municipalMean = useMemo(() => {
        if (typeof overallDiversity?.score === "number") return overallDiversity.score;
        const values = Object.values(bgyStats || {})
            .map((s) => s?.diversity)
            .filter((v) => typeof v === "number");
        if (!values.length) return 0;
        return values.reduce((a, b) => a + b, 0) / values.length;
    }, [overallDiversity, bgyStats]);

    const handleAppTypeChange = (type) => {
        setAppTypeFilter(type);
        router.get(
            window.location.pathname,
            { application_type: type },
            { preserveState: true, preserveScroll: true, only: ["total", "thisMonth", "statusMap", "bgyStats", "recent"] }
        );
    };

    useEffect(() => {
        const hasShownWelcome = sessionStorage.getItem("hasShownWelcome");
        if (!hasShownWelcome && userName) {
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Welcome back, ${userName || "Staff"}!`,
                text: "iMAPS GIS Spatial Dashboard is ready.",
                showConfirmButton: false,
                timer: 3000,
                timerProgressBar: true,
                customClass: { popup: "swal-small-toast" },
                didOpen: (toast) => {
                    toast.onmouseenter = Swal.stopTimer;
                    toast.onmouseleave = Swal.resumeTimer;
                },
            });
            sessionStorage.setItem("hasShownWelcome", "true");
        }
    }, [userName]);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " · " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (activeLayer !== "diversity") {
            setDiversityBandFilter("all");
            setDiversityLens("mix");
        }
        if (activeLayer !== "trends") {
            setIsTimelinePlaying(false);
        }
        setSelectedBgy(null);
        setSearchTargetBgy(null);
        setHoveredBgy(null);
        setParcels2D(false);
        setParcels3D(false);
    }, [activeLayer]);

    useEffect(() => {
        if (!isTimelinePlaying || activeLayer !== "trends" || timelineQuarters.length <= 1) return;
        const id = setInterval(() => {
            setActiveQuarterIndex((i) => (i >= timelineQuarters.length - 1 ? 0 : i + 1));
        }, 1400);
        return () => clearInterval(id);
    }, [isTimelinePlaying, activeLayer, timelineQuarters.length]);

    const handleSelectLocation = (loc) => {
        if (!loc || !loc.label) return;
        setSearchTargetBgy(loc.label);
        const data = bgyStats[loc.label] || { total: 0, Total: 0, review: 0, 'Technical Review': 0, released: 0, 'Released': 0 };
        setSelectedBgy({ name: loc.label, data });
        setRightPanelOpen(true);
    };

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
            if (e.key === "1") { e.preventDefault(); setActiveLayer("status"); }
            if (e.key === "2") { e.preventDefault(); setActiveLayer("trends"); }
            if (e.key === "3") { e.preventDefault(); setActiveLayer("diversity"); }
            if (e.key === "4") { e.preventDefault(); setActiveLayer("zoning"); }
            if (e.key.toLowerCase() === "i") { e.preventDefault(); setRightPanelOpen((prev) => !prev); }
            if (e.key.toLowerCase() === "l" && activeLayer === "diversity") {
                e.preventDefault();
                const ids = DIVERSITY_LENSES.map((l) => l.id);
                const next = ids[(ids.indexOf(diversityLens) + 1) % ids.length];
                setDiversityLens(next);
                setDiversityBandFilter("all");
            }
            if (e.key.toLowerCase() === "f") {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            }
            if (e.key === "Escape" && !sidebarOpen) {
                setSelectedBgy(null);
                setStylePopupOpen(false);
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [sidebarOpen, activeLayer, diversityLens]);

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    const rsConfig = {
        status: {
            label: "Operations & Permitting",
            title: "Permit & Status Docket",
            desc: "Active zoning applications, SLA tracking & spatial triage",
            gradient: "from-blue-900 to-indigo-950",
            icon: (
                <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
            ),
        },
        trends: {
            label: "LC Demand Forecasting",
            title: "Development Corridors",
            desc: "Ranked barangay growth pressure from live zoning permits",
            gradient: "from-emerald-900 to-teal-950",
            icon: (
                <svg className="w-4 h-4 text-emerald-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            ),
        },
        diversity: {
            label: "Diversity Index",
            title: "Land Use & Economic Mix",
            desc: "Balance of commercial, residential & Industrial activities",
            gradient: "from-purple-900 to-indigo-950",
            icon: (
                <svg className="w-4 h-4 text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
            ),
        },
        zoning: {
            label: "Comprehensive Plan",
            title: "CLUP Zoning (2016-2030)",
            desc: "Official Municipal Zoning Classification System",
            gradient: "from-slate-900 to-blue-950",
            icon: (
                <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M19.5 21v-7.5a2.25 2.25 0 00-2.25-2.25H15M19.5 21H6m13.5 0v-7.5a2.25 2.25 0 00-2.25-2.25H15m0 0V16.5" />
                </svg>
            ),
        },
    };



    return (
        <>
            <Head title="Maps" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Plus Jakarta Sans', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'JetBrains Mono', monospace !important; }
                #map, .leaflet-container { background: #f8fafc !important; }
                /* Diversity module: barangays sit isolated on a solid canvas. */
                .diversity-canvas .leaflet-container { background: #f8f9fa !important; }
                /* Solid tooltips. Translucent cards over live map colour put
                   their text on an unpredictable background. */
                .diversity-tooltip {
                    background: #ffffff !important;
                    border: 1px solid #cbd5e1 !important;
                    border-radius: 4px !important;
                    box-shadow: 0 2px 6px rgba(15,23,42,0.12) !important;
                    backdrop-filter: none !important;
                    padding: 6px 9px !important;
                    color: #0f172a !important;
                }
                .diversity-tooltip::before { display: none !important; }
                .swal-small-toast { width: auto !important; padding: 0.5rem 0.75rem !important; min-height: unset !important; border-radius: 12px !important; }
                .swal-small-modal { width: 340px !important; padding: 1.5rem !important; border-radius: 20px !important; }
                ::-webkit-scrollbar { width: 5px; height: 5px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                .custom-bgy-popup .leaflet-popup-content-wrapper { border-radius: 18px; box-shadow: 0 20px 30px -10px rgba(0, 0, 0, 0.15), 0 0 0 1px rgba(255, 255, 255, 0.8); backdrop-filter: blur(12px); background: rgba(255, 255, 255, 0.96); padding: 4px; }
                .custom-bgy-popup .leaflet-popup-content { margin: 12px; }
                .custom-bgy-popup .leaflet-popup-tip { background: rgba(255, 255, 255, 0.96); }
                .custom-bgy-popup .leaflet-popup-close-button { color: #94a3b8 !important; margin-top: 10px !important; margin-right: 10px !important; font-size: 16px !important; }
                .custom-app-popup .leaflet-popup-content-wrapper { border-radius: 18px; box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.18), 0 0 0 1px rgba(255, 255, 255, 0.9); backdrop-filter: blur(16px); background: rgba(255, 255, 255, 0.98); padding: 4px; }
                .custom-app-popup .leaflet-popup-content { margin: 10px 12px; }
                .custom-app-popup .leaflet-popup-tip { background: rgba(255, 255, 255, 0.98); }
                .custom-app-popup .leaflet-popup-close-button { color: #94a3b8 !important; margin-top: 8px !important; margin-right: 8px !important; font-size: 16px !important; }
                .custom-app-marker-container { background: transparent !important; border: none !important; }

                /* Leaflet redraws SVG paths by setting attributes, so filter and
                   hover changes snapped instantly. Transitioning the presentation
                   attributes lets the 2D choropleth cross-fade the way the 3D
                   prisms do. */
                .leaflet-interactive {
                    transition: fill 260ms ease, fill-opacity 260ms ease, stroke 200ms ease, stroke-width 200ms ease, stroke-opacity 200ms ease;
                }
                .diversity-centroid-chip { background: transparent !important; border: none !important; }
                .diversity-chip-inner {
                    display: inline-flex; align-items: center; gap: 4px;
                    padding: 2.5px 7px; border-radius: 9999px;
                    color: #fff; font-size: 10px; font-weight: 800; white-space: nowrap;
                    border: 1.5px solid #fff; box-shadow: 0 4px 14px rgba(0,0,0,0.35);
                    transform: translate(-50%, -50%); cursor: pointer;
                    animation: imaps-fade-in 200ms ease both;
                }
                .diversity-chip-value {
                    background: rgba(0,0,0,0.28); padding: 1px 4.5px; border-radius: 4px;
                    font-family: 'JetBrains Mono', monospace; font-size: 9.5px; font-weight: 900;
                }
                @media (prefers-reduced-motion: reduce) {
                    .leaflet-interactive { transition: none; }
                    .diversity-chip-inner { animation: none; }
                }
                .leaflet-interactive.imaps-deadspace { pointer-events: none !important; }
            `}</style>

            <div
                id="dashboard-root"
                className={`bg-slate-900 font-sans text-slate-800 h-screen flex flex-col overflow-hidden select-none ${
                    isDiversityModule ? "diversity-canvas" : ""
                }`}
            >
                <Header 
                    userName={userName} 
                    userRole={userRole} 
                    clock={clock} 
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen} 
                    onSelectLocation={handleSelectLocation}
                />

                <div className="flex-1 overflow-hidden relative bg-slate-950">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="maps"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                            title="Click to collapse sidebar"
                        />
                    )}

                    <main className="absolute inset-0 flex flex-col min-w-0 h-full overflow-hidden">
                        {/* Both maps stay mounted once created and are shown or hidden,
                            instead of an either/or conditional. The conditional
                            destroyed the Leaflet map — and every layer built on it,
                            including the idle-prepared land-use parcels — each time
                            someone opened the 3D diversity view, then rebuilt it all
                            on the way back. Hidden with `visibility` rather than
                            `display: none` so each keeps its real size and never
                            needs re-measuring when it reappears. */}
                        <div
                            className="absolute inset-0"
                            style={{ visibility: show3D ? "hidden" : "visible" }}
                            aria-hidden={show3D}
                        >
                            <LeafletMap
                                bgyStats={bgyStats}
                                applications={recent}
                                recent={timelineRecent}
                                currentLayer={activeLayer}
                                mapStyle={mapStyle}
                                appTypeFilter={appTypeFilter}
                                statusFilter={statusFilter}
                                hoveredAppId={hoveredAppId}
                                selectedBgy={selectedBgy}
                                flyToTarget={flyToTarget}
                                verifiedParcel={verifiedParcel}
                                mapZoom={mapZoom}
                                clupOpacity={clupOpacity}
                                resetTrigger={resetTrigger}
                                searchTargetBgy={searchTargetBgy}
                                diversityLens={diversityLens}
                                diversityBandFilter={diversityBandFilter}
                                hoveredBgy={hoveredBgy}
                                onHoverBgy={setHoveredBgy}
                                onParcelsVisible={setParcels2D}
                                rightPanelOpen={rightPanelOpen}
                                panelWidth={DIVERSITY_PANEL_WIDTH}
                                onZoomChange={setMapZoom}
                                onInspectApp={setInspectedApp}
                                historicalPins={activeHistoricalPins}
                                onFeatureClick={(name, data) => {
                                    setSelectedBgy({ name, data });
                                    if (!rightPanelOpen) setRightPanelOpen(true);
                                }}
                                onMapClick={() => setSelectedBgy(null)}
                            />
                        </div>

                        {has3DMounted && (
                            <div
                                className="absolute inset-0"
                                style={{ visibility: show3D ? "visible" : "hidden" }}
                                aria-hidden={!show3D}
                            >
                                <Suspense fallback={<MapLoadingState label="Loading 3D view…" />}>
                                    <MapLibre3DView
                                        active={show3D}
                                        selectedBgy={selectedBgy}
                                        onFeatureClick={(name) => {
                                            // Always resolve against the live backend record rather
                                            // than the map feature's own properties, so the panel and
                                            // the map can never show two different scores.
                                            setSelectedBgy({ name, data: bgyStats?.[name] || {} });
                                            if (!rightPanelOpen) setRightPanelOpen(true);
                                        }}
                                        onMapClick={() => setSelectedBgy(null)}
                                        bgyStats={bgyStats}
                                        rightPanelOpen={rightPanelOpen}
                                        panelWidth={DIVERSITY_PANEL_WIDTH}
                                        lens={diversityLens}
                                        bandFilter={diversityBandFilter}
                                        hoveredBgy={hoveredBgy}
                                        onHoverBgy={setHoveredBgy}
                                        onParcelsVisible={setParcels3D}
                                    />
                                </Suspense>
                            </div>
                        )}

                        {activeLayer === "diversity" ? (
                            <>

                                <DiversityLegend
                                    lens={diversityLens}
                                    activeBand={diversityBandFilter}
                                    onSelectBand={setDiversityBandFilter}
                                    bgyStats={bgyStats}
                                    overallDiversity={overallDiversity}
                                    is3D={is3DMode}
                                    showZoneKey={parcelsVisible}
                                />
                            </>
                        ) : (
                            <MapLegend activeLayer={activeLayer} urbanGrowthData={urbanGrowthData} />
                        )}

                        {/* Top-Left Mode Selector & 2D/3D Diversity Switcher */}
                        <div className="absolute top-4 left-4 z-[800] pointer-events-auto flex items-center gap-2">
                            <div className="flex items-center gap-1 p-1 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_8px_30px_rgba(0,0,0,0.12)]">
                                {[
                                    {
                                        id: "status",
                                        label: "Permits & Status",
                                        shortLabel: "Status",
                                        key: "1",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "trends",
                                        label: "LC Demand Forecasting",
                                        shortLabel: "Growth",
                                        key: "2",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "diversity",
                                        label: "Diversity Index",
                                        shortLabel: "Diversity",
                                        key: "3",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "zoning",
                                        label: "CLUP 2030",
                                        shortLabel: "CLUP",
                                        key: "4",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M19.5 21v-7.5a2.25 2.25 0 00-2.25-2.25H15M19.5 21H6m13.5 0v-7.5a2.25 2.25 0 00-2.25-2.25H15m0 0V16.5" />
                                            </svg>
                                        ),
                                    },
                                ].map((item) => {
                                    const isActive = activeLayer === item.id;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => setActiveLayer(item.id)}
                                            className={`relative flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold transition-all duration-200 ${
                                                isActive
                                                    ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
                                            }`}
                                            title={`Press ${item.key} to switch layer`}
                                        >
                                            <span className={isActive ? "text-white" : "text-slate-500"}>
                                                {item.icon}
                                            </span>
                                            <span className="hidden md:inline whitespace-nowrap">{item.label}</span>
                                            <span className="inline md:hidden whitespace-nowrap">{item.shortLabel}</span>
                                            {item.badge !== undefined && item.badge !== null && (
                                                <span
                                                    className={`hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded-md font-bold ${
                                                        isActive
                                                            ? "bg-white/20 text-white"
                                                            : "bg-slate-100 text-slate-600"
                                                    }`}
                                                >
                                                    {item.badge}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Status Mode: Bottom Filter Bar & SLA Radar Toggle */}
                        <div
                            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[600] flex items-center gap-2 bg-white/90 backdrop-blur-xl p-1.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-white/80 transition-all duration-500 ease-out ${
                                activeLayer === "status"
                                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                                    : "opacity-0 translate-y-8 scale-95 pointer-events-none"
                            }`}
                        >
                            <div className="flex items-center gap-1">
                                {[
                                    {
                                        id: "Zoning Certificate",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "Locational Clearance",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "Development Permit",
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                            </svg>
                                        ),
                                    },
                                ].map((type) => {
                                    const isActive = appTypeFilter === type.id;
                                    return (
                                        <button
                                            key={type.id}
                                            onClick={() => handleAppTypeChange(type.id)}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all duration-300 ${
                                                isActive
                                                    ? "text-blue-900 bg-blue-50 border border-blue-200/80 shadow-2xs"
                                                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/60"
                                            }`}
                                        >
                                            <span className={isActive ? "text-blue-600" : "text-slate-400"}>
                                                {type.icon}
                                            </span>
                                            <span>{type.id}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>



                        {/* Zoning Mode: Opacity Slider */}
                        <div
                            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[600] flex items-center gap-3 bg-white/90 backdrop-blur-xl px-4 py-2 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-white/80 transition-all duration-500 ease-out ${
                                activeLayer === "zoning"
                                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                                    : "opacity-0 translate-y-8 scale-95 pointer-events-none"
                            }`}
                        >
                            <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                </svg>
                                <span>CLUP Opacity:</span>
                            </span>
                            <input
                                type="range"
                                min="0.1"
                                max="1.0"
                                step="0.05"
                                value={clupOpacity}
                                onChange={(e) => setClupOpacity(parseFloat(e.target.value))}
                                className="w-28 h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-700"
                            />
                            <span className="text-xs font-mono font-bold text-blue-700 w-10 text-right">
                                {Math.round(clupOpacity * 100)}%
                            </span>
                            <button
                                onClick={() => setClupOpacity(0.85)}
                                className="text-[10px] font-bold text-slate-400 hover:text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md transition-colors"
                            >
                                Reset
                            </button>
                        </div>

                        {/* Trends Mode: Time Machine — scrubs real & forecasted permits by quarter */}
                        <div
                            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[600] flex flex-col items-center gap-2 transition-all duration-500 ease-out ${
                                activeLayer === "trends"
                                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                                    : "opacity-0 translate-y-8 scale-95 pointer-events-none"
                            }`}
                        >
                            {/* Header Badge */}
                            <div className={`flex items-center gap-2.5 backdrop-blur-md px-3.5 py-1 rounded-full text-white shadow-lg border ${
                                activeQuarter?.isForecast 
                                    ? "bg-blue-950/90 border-blue-500/40" 
                                    : "bg-slate-900/85 border-white/10"
                            }`}>
                                <span className="flex h-2 w-2 relative">
                                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                                        activeQuarter?.isForecast ? "bg-blue-400" : "bg-emerald-400"
                                    }`} />
                                    <span className={`relative inline-flex rounded-full h-2 w-2 ${
                                        activeQuarter?.isForecast ? "bg-blue-500" : "bg-emerald-500"
                                    }`} />
                                </span>
                                <span className={`text-[10px] font-mono font-bold uppercase tracking-widest ${
                                    activeQuarter?.isForecast ? "text-blue-300" : "text-emerald-300"
                                }`}>
                                    As of {activeQuarter?.label || '—'} · {activePermitsCount} {activeQuarter?.isForecast ? 'Forecasted LC Projects' : ('LC Permit' + (activePermitsCount === 1 ? '' : 's') + ' Filed')}
                                </span>
                            </div>

                            {/* Main Scrubber Control Panel */}
                            <div className="flex items-center gap-3 p-2.5 px-4 bg-white/95 backdrop-blur-xl border border-slate-200/90 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] w-[460px] sm:w-[520px]">
                                {/* Step Back */}
                                <button
                                    onClick={() => {
                                        setActiveQuarterIndex((i) => Math.max(0, i - 1));
                                        setIsTimelinePlaying(false);
                                    }}
                                    disabled={activeQuarterIndex === 0}
                                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 transition-all shrink-0 cursor-pointer"
                                    title="Previous Quarter"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>

                                {/* Play / Pause */}
                                <button
                                    onClick={() => setIsTimelinePlaying((p) => !p)}
                                    disabled={timelineQuarters.length <= 1}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all shadow-sm shrink-0 cursor-pointer disabled:opacity-40 ${
                                        isTimelinePlaying
                                            ? "bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-400/30"
                                            : activeQuarter?.isForecast
                                            ? "bg-blue-600 text-white hover:bg-blue-700 ring-2 ring-blue-500/30"
                                            : "bg-blue-900 text-white hover:bg-blue-950 ring-2 ring-blue-800/30"
                                    }`}
                                    title={isTimelinePlaying ? "Pause Timeline" : "Auto-Play Timeline"}
                                >
                                    {isTimelinePlaying ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    )}
                                </button>

                                {/* Step Forward */}
                                <button
                                    onClick={() => {
                                        setActiveQuarterIndex((i) => Math.min(timelineQuarters.length - 1, i + 1));
                                        setIsTimelinePlaying(false);
                                    }}
                                    disabled={activeQuarterIndex === timelineQuarters.length - 1}
                                    className="w-8 h-8 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30 transition-all shrink-0 cursor-pointer"
                                    title="Next Quarter"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                    </svg>
                                </button>

                                <div className="w-px h-6 bg-slate-200" />

                                {/* Range Scrubber Track & Year Ticks */}
                                <div className="flex-1 flex flex-col justify-center gap-1 min-w-0">
                                    <div className="flex items-center justify-between text-[11px] font-mono font-bold">
                                        <span className={activeQuarter?.isForecast ? "text-blue-600 flex items-center gap-1.5" : "text-slate-800"}>
                                            {activeQuarter?.isForecast && (
                                                <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-md bg-blue-100 text-blue-700 uppercase tracking-wide">
                                                    Forecast
                                                </span>
                                            )}
                                            {activeQuarter?.label}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-semibold">
                                            {activeQuarterIndex + 1} of {timelineQuarters.length}
                                        </span>
                                    </div>

                                    <input
                                        type="range"
                                        min={0}
                                        max={timelineQuarters.length - 1}
                                        value={activeQuarterIndex}
                                        onChange={(e) => {
                                            setActiveQuarterIndex(Number(e.target.value));
                                            setIsTimelinePlaying(false);
                                        }}
                                        className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600 focus:outline-none"
                                    />

                                    <div className="flex justify-between text-[9px] font-mono font-bold text-slate-400 px-0.5">
                                        <span>'21</span>
                                        <span>'22</span>
                                        <span>'23</span>
                                        <span>'24</span>
                                        <span>'25</span>
                                        <span>'26</span>
                                        <span className="text-blue-600 font-extrabold">Forecast</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Quick GIS Toolbar (Leaflet 2D only). In diversity mode the
                            lens legend owns the bottom-left corner, so the toolbar
                            moves to bottom-centre; the base-map switcher is dropped
                            there because that module has no basemap to switch. */}
                        {(!is3DMode || activeLayer !== "diversity") && (
                            <>
                                <div className={`absolute bottom-6 z-[600] flex items-center gap-2 transition-all duration-300 ${
                                    isDiversityModule ? "left-1/2 -translate-x-1/2" : "left-6"
                                }`}>
                                    <div className={`relative ${isDiversityModule ? "hidden" : ""}`}>
                                        <div
                                            className={`bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-200/80 w-[240px] mb-3 absolute bottom-full left-0 overflow-hidden transition-all duration-300 ${
                                                stylePopupOpen
                                                    ? "opacity-100 translate-y-0 pointer-events-auto"
                                                    : "opacity-0 translate-y-3 pointer-events-none"
                                            }`}
                                        >
                                            <div className="bg-gradient-to-r from-slate-900 to-blue-950 py-3 px-4 flex items-center justify-between">
                                                <span className="text-xs font-bold text-white tracking-wide">
                                                    Base Map Provider
                                                </span>
                                                <span className="text-[9px] font-mono text-blue-300 font-bold bg-white/10 px-1.5 py-0.5 rounded">
                                                    GIS
                                                </span>
                                            </div>
                                            <div className="p-2 space-y-1">
                                                {Object.entries(TILE_PROVIDERS).map(([key, item]) => {
                                                    const isSelected = mapStyle === key;
                                                    return (
                                                        <button
                                                            key={key}
                                                            onClick={() => {
                                                                setMapStyle(key);
                                                                setStylePopupOpen(false);
                                                            }}
                                                            className={`w-full text-left p-2.5 rounded-xl transition-all flex flex-col ${
                                                                isSelected
                                                                    ? "bg-blue-50 border border-blue-200 shadow-sm"
                                                                    : "hover:bg-slate-50 border border-transparent"
                                                            }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <span className={`text-xs font-bold ${isSelected ? "text-blue-900" : "text-slate-800"}`}>
                                                                    {item.label}
                                                                </span>
                                                                {isSelected && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 mt-0.5">
                                                                {item.desc}
                                                            </span>
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setStylePopupOpen(!stylePopupOpen)}
                                            className={`h-11 px-3.5 bg-white/90 hover:bg-white text-slate-700 rounded-2xl shadow-lg border border-white/80 backdrop-blur-xl flex items-center gap-2 transition-all focus:outline-none ${
                                                stylePopupOpen ? "ring-2 ring-blue-600 bg-white" : ""
                                            }`}
                                            title="Switch Base Map Style"
                                        >
                                            <svg className="w-5 h-5 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                            </svg>
                                            <span className="text-xs font-bold hidden sm:inline text-slate-800">
                                                {TILE_PROVIDERS[mapStyle]?.label || "Base Map"}
                                            </span>
                                        </button>
                                    </div>

                                    <div className="flex items-center bg-white/90 backdrop-blur-xl rounded-2xl shadow-lg border border-white/80 p-1">
                                        <button
                                            onClick={() => setMapZoom((z) => Math.min(19, z + 1))}
                                            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 hover:text-blue-800 transition-colors"
                                            title="Zoom In"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                            </svg>
                                        </button>
                                        <div className="w-px h-4 bg-slate-200" />
                                        <button
                                            onClick={() => setMapZoom((z) => Math.max(11, z - 1))}
                                            className="w-9 h-9 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-100 hover:text-blue-800 transition-colors"
                                            title="Zoom Out"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                                            </svg>
                                        </button>
                                    </div>

                                    <button
                                        onClick={() => setResetTrigger((t) => t + 1)}
                                        className="w-11 h-11 bg-white/90 hover:bg-white text-slate-700 hover:text-blue-800 rounded-2xl shadow-lg border border-white/80 backdrop-blur-xl flex items-center justify-center transition-all focus:outline-none"
                                        title="Center on Rosario, Batangas"
                                    >
                                        <svg className="w-5 h-5 text-blue-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <circle cx="12" cy="12" r="8" strokeLinecap="round" strokeLinejoin="round" />
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2v3m0 14v3M2 12h3m14 0h3" />
                                            <circle cx="12" cy="12" r="2" fill="currentColor" />
                                        </svg>
                                    </button>

                                    <button
                                        onClick={() => {
                                            if (!document.fullscreenElement) {
                                                document.documentElement.requestFullscreen().catch(() => {});
                                            } else {
                                                document.exitFullscreen().catch(() => {});
                                            }
                                        }}
                                        className="w-11 h-11 bg-white/90 hover:bg-white text-slate-700 hover:text-blue-800 rounded-2xl shadow-lg border border-white/80 backdrop-blur-xl flex items-center justify-center transition-all focus:outline-none"
                                        title="Toggle Fullscreen Map View"
                                    >
                                        <svg className="w-4 h-4 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                        </svg>
                                    </button>
                                </div>

                                {/* The coordinate readout shares the bottom-left corner
                                    with the diversity legend, so it stands down there. */}
                                {activeLayer !== "diversity" && (
                                    <div className="absolute bottom-1.5 left-6 z-[400] pointer-events-none text-[9px] font-mono text-slate-600 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-md border border-slate-200/50 shadow-xs flex items-center gap-1.5">
                                        <span className="font-bold text-blue-700">Z{mapZoom}</span>
                                        <span className="text-slate-300">·</span>
                                        <span>13.8450° N, 121.2060° E</span>
                                    </div>
                                )}
                            </>
                        )}

                        {/* Floating Restore Bubble */}
                        {!rightPanelOpen && (
                            <button
                                onClick={() => setRightPanelOpen(true)}
                                className="absolute top-4 right-4 z-[500] group flex items-center gap-2.5 p-1.5 pr-3.5 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.15)] hover:shadow-2xl border border-white/80 hover:border-blue-200 transition-all duration-300 hover:scale-[1.03] animate-in fade-in slide-in-from-right-4 text-left"
                                title="Open Intelligence Panel"
                            >
                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${rsConfig[activeLayer].gradient} text-white flex items-center justify-center shadow-md relative shrink-0`}>
                                    {rsConfig[activeLayer].icon}
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 ring-2 ring-white" />
                                    </span>
                                </div>

                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-600">
                                            Intelligence Panel
                                        </span>
                                        <span className="text-[9px] font-mono font-bold bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-700 px-1.5 py-0.2 rounded">
                                            {activeLayer === "status" ? `${displayTotal} Apps` : activeLayer === "trends" ? `${Object.values(urbanGrowthData?.historicalPermits?.[activeYear] ?? {}).reduce((a, b) => a + b, 0)} LC thru ${activeYear || "—"}` : activeLayer === "diversity" ? `${Number(overallDiversity?.score ?? 0).toFixed(2)} Mix` : "CLUP 2030"}
                                        </span>
                                    </div>
                                    <span className="text-xs font-black text-slate-800 group-hover:text-blue-900 leading-tight">
                                        {rsConfig[activeLayer].title}
                                    </span>
                                </div>
                            </button>
                        )}

                        {/* Collapsible Right Intelligence Panel */}
                        <div
                            id="right-sidebar"
                            className={`absolute z-[500] flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                                isDiversityModule
                                    // Docked: flush to the right edge, fully opaque, square
                                    // corners. It used to float inset with a backdrop blur,
                                    // which put panel text over live map colour and wasted
                                    // the screen edge.
                                    ? `right-0 top-0 bottom-0 w-full sm:w-[380px] max-w-full bg-white border-l border-slate-200 shadow-[-1px_0_0_0_rgba(15,23,42,0.04)] ${
                                          rightPanelOpen ? "translate-x-0" : "translate-x-full pointer-events-none"
                                      }`
                                    : `right-4 top-4 bottom-4 w-full sm:w-[320px] lg:w-[350px] xl:w-[375px] max-w-[calc(100vw-2rem)] bg-white/98 backdrop-blur-2xl shadow-2xl border border-slate-200/90 rounded-3xl ${
                                          rightPanelOpen ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)] pointer-events-none"
                                      }`
                            }`}
                        >
                            <button
                                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                                className={`absolute top-6 -left-9 w-9 h-10 flex items-center justify-center transition-colors focus:outline-none z-10 pointer-events-auto ${
                                    isDiversityModule
                                        ? "bg-white border border-r-0 border-slate-200 rounded-l-md text-slate-500 hover:text-slate-900"
                                        : "bg-white/95 backdrop-blur-xl border-l border-y border-slate-200/80 shadow-lg text-slate-600 hover:text-blue-700 rounded-l-2xl"
                                }`}
                                title={rightPanelOpen ? "Collapse Intelligence Panel" : "Expand Intelligence Panel"}
                            >
                                <svg
                                    className={`w-4 h-4 transition-transform duration-500 ${
                                        rightPanelOpen ? "rotate-180" : ""
                                    }`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2.5"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>

                            {isDiversityModule ? (
                                // Solid module header. The gradient/glass treatment the
                                // other layers use would fight the docked panel's flat
                                // surface, and its own identity block sits right below.
                                <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 bg-slate-900 text-white">
                                    <div className="min-w-0">
                                        <span className="text-[9.5px] font-bold uppercase tracking-[0.1em] text-slate-400 block">
                                            {rsConfig.diversity.label}
                                        </span>
                                        <h2 className="text-[13px] font-bold tracking-tight leading-tight truncate">
                                            {rsConfig.diversity.title}
                                        </h2>
                                    </div>
                                    <button
                                        onClick={() => setRightPanelOpen(false)}
                                        className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
                                        title="Collapse panel"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            ) : (
                                <div
                                    className={`shrink-0 bg-gradient-to-r ${rsConfig[activeLayer].gradient} text-white px-5 py-4 flex items-center justify-between border-b border-white/10`}
                                >                        
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-blue-200">
                                                {rsConfig[activeLayer].label}
                                            </span>
                                        </div>
                                        <h2 className="text-lg font-black tracking-tight mt-0.5 leading-tight text-white">
                                            {rsConfig[activeLayer].title}
                                        </h2>
                                        <p className="text-[11px] text-slate-300 mt-0.5 font-medium leading-tight">
                                            {rsConfig[activeLayer].desc}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <div className="w-9 h-9 rounded-xl bg-white/10 backdrop-blur-md flex items-center justify-center shadow-inner border border-white/20 shrink-0">
                                            {rsConfig[activeLayer].icon}
                                        </div>
                                        <button
                                            onClick={() => setRightPanelOpen(false)}
                                            className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white flex items-center justify-center transition-colors shrink-0 ml-1"
                                            title="Collapse Panel"
                                        >
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* The diversity panel manages its own sticky header and
                                scroll region, so it gets a plain flex container rather
                                than this wrapper's scroller (which would nest two). */}
                            <div className={`flex-1 min-h-0 overflow-x-hidden ${
                                isDiversityModule
                                    ? "overflow-hidden flex flex-col bg-white"
                                    : "overflow-y-auto bg-slate-50/70"
                            }`}>
                                {activeLayer === "status" && (
                                    <StatusPanel
                                        total={displayTotal}
                                        thisMonth={displayThisMonth}
                                        review={displayReview}
                                        released={displayReleased}
                                        recent={recent || []}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        bgyStats={bgyStats}
                                        statusMap={statusMap}
                                        statusFilter={statusFilter}
                                        onStatusFilterChange={handleStatusFilterChange}
                                        onLocateApp={handleLocateApp}
                                        onVerifyResult={handleVerifyResult}
                                    />
                                )}

                                {activeLayer === "trends" && (
                                    <TrendsPanel
                                        activeQuarter={activeQuarter}
                                        forecastMetrics={forecastMetrics}
                                        urbanGrowthData={urbanGrowthData}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        onLocateApp={handleLocateApp}
                                        recent={timelineRecent}
                                        onForecastGenerated={handleForecastGenerated}
                                    />
                                )}

                                {activeLayer === "diversity" && (
                                    <DiversityPanel
                                        overallDiversity={overallDiversity}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        bgyStats={bgyStats}
                                        lens={diversityLens}
                                        onSelectLens={handleSelectLens}
                                        bandFilter={diversityBandFilter}
                                        onSelectBand={setDiversityBandFilter}
                                        hoveredBgy={hoveredBgy}
                                        onHoverBgy={setHoveredBgy}
                                    />
                                )}

                                {activeLayer === "zoning" && (
                                    <ZoningPanel />
                                )}
                            </div>
                        </div>

                    </main>
                </div>
            </div>

            {/* Concise Application Dossier Modal */}
            {inspectedApp && (() => {
                const sla = getSLAInfo(inspectedApp.created_at, inspectedApp.status);
                const progressPct = Math.min(100, Math.round((sla.days / 15) * 100));
                const isOverdue = sla.days > 15;
                const conformity = getZoningConformity(inspectedApp, inspectedApp.land_use_class || "Residential");

                return (
                    <div 
                        onClick={() => setInspectedApp(null)}
                        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/45 backdrop-blur-xs animate-in fade-in duration-150"
                    >
                        <div 
                            onClick={(e) => e.stopPropagation()}
                            className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/90 overflow-hidden animate-in zoom-in-95 duration-150"
                        >
                            {/* Header */}
                            <div className="px-5 py-3.5 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-lg border border-slate-200">
                                        {inspectedApp.reference_number || `APP-${inspectedApp.id}`}
                                    </span>
                                    <span 
                                        className="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                                        style={{
                                            backgroundColor: getStatusMarkerConfig(inspectedApp.status).badgeBg,
                                            color: getStatusMarkerConfig(inspectedApp.status).badgeText,
                                            border: `1px solid ${getStatusMarkerConfig(inspectedApp.status).color}40`,
                                        }}
                                    >
                                        ● {getStatusMarkerConfig(inspectedApp.status).label}
                                    </span>
                                </div>
                                <button
                                    onClick={() => setInspectedApp(null)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
                                    title="Close"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                </button>
                            </div>

                            {/* Body */}
                            <div className="p-5 space-y-3.5">
                                <div>
                                    <h3 className="text-base font-black text-slate-900 tracking-tight leading-snug">
                                        {inspectedApp.applicant_name}
                                    </h3>
                                    <p className="text-xs font-semibold text-blue-600 mt-0.5">
                                        {inspectedApp.application_type}
                                    </p>
                                </div>

                                {/* CLUP Zoning Conformity & Permitting Classification */}
                                <div className={`p-3 rounded-2xl border text-xs ${conformity.badgeClass}`}>
                                    <div className="flex items-center justify-between font-bold">
                                        <span className="flex items-center gap-1.5">
                                            <span className={`w-2.5 h-2.5 rounded-full ${conformity.dotClass}`} />
                                            <span>CLUP Zoning Conformity</span>
                                        </span>
                                        <span className="font-mono text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-white/80">
                                            {conformity.label}
                                        </span>
                                    </div>
                                    <p className="text-[11px] mt-1.5 leading-relaxed opacity-90">
                                        {conformity.desc}
                                    </p>
                                </div>

                                {/* SLA Ageing & Citizen's Charter Compliance Card */}
                                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                                        <span className="text-slate-700 flex items-center gap-1.5">
                                            <span className={`w-2 h-2 rounded-full ${sla.dot}`} />
                                            <span>Processing Ageing Tracker</span>
                                        </span>
                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${sla.color}`}>
                                            {sla.label}
                                        </span>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden mt-2 relative">
                                        <div 
                                            className={`h-full transition-all duration-500 ${isOverdue ? 'bg-rose-500' : sla.days <= 5 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                            style={{ width: `${progressPct}%` }}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between text-[9.5px] font-medium text-slate-400 mt-1.5">
                                        <span>Filed: {inspectedApp.created_at ? new Date(inspectedApp.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "Recent"}</span>
                                        <span>Target SLA: 15 Working Days</span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2.5 p-3 rounded-2xl bg-slate-50 border border-slate-100">
                                    <div>
                                        <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Location
                                        </span>
                                        <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                                            {inspectedApp.barangay || "Rosario, Batangas"}
                                        </p>
                                    </div>
                                    <div>
                                        <span className="text-[9.5px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Zoning Class
                                        </span>
                                        <p className="text-xs font-bold text-slate-800 mt-0.5 truncate">
                                            {inspectedApp.land_use_class || "General Zone"}
                                        </p>
                                    </div>

                                    {inspectedApp.parcels && inspectedApp.parcels.length > 0 && (
                                        <div className="col-span-2 pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2 text-[10.5px]">
                                            <div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                                    Lot Number
                                                </span>
                                                <span className="font-mono font-semibold text-slate-700">
                                                    Lot {inspectedApp.parcels[0].lot_number || "N/A"}
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                                                    Tax Dec Number
                                                </span>
                                                <span className="font-mono font-semibold text-slate-700">
                                                    {inspectedApp.parcels[0].tax_dec_number || "N/A"}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {inspectedApp.purpose && (
                                    <div className="text-[11px] text-slate-500 bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                                        <span className="font-bold text-slate-600 block text-[9.5px] uppercase">Declared Purpose:</span>
                                        <p className="italic text-slate-700 mt-0.5 truncate max-w-[340px]" title={inspectedApp.purpose}>
                                            "{inspectedApp.purpose}"
                                        </p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            <div className="px-5 py-3.5 bg-slate-50/60 border-t border-slate-100 flex items-center justify-between gap-3">
                                <button
                                    onClick={() => setInspectedApp(null)}
                                    className="px-3.5 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
                                >
                                    Dismiss
                                </button>
                                <Link
                                    href={`/applications/${inspectedApp.id}`}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 rounded-xl transition-all cursor-pointer"
                                >
                                    <span>Open Application Dossier</span>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                    </svg>
                                </Link>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </>
    );
}

export default function Dashboard(props) {
    return (
        <MapsErrorBoundary>
            <DashboardInner {...props} />
        </MapsErrorBoundary>
    );
}