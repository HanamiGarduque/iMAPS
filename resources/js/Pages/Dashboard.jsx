import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import StatusPanel, { getSLAInfo, getZoningConformity } from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import ZoningPanel from "@/Components/MapLayers/ZoningPanel";
import MapLegend from "@/Components/MapLayers/MapLegend";
import MapLibre3DView from "@/Components/MapLayers/MapLibre3DView";
import { ROSARIO_GROWTH_ESTABLISHMENTS, getEstablishmentsForYear, YEAR_MILESTONES } from "@/data/rosarioEstablishments";
import { getDiversityTheme } from "@/utils/diversityTheme";

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

// ── Realistic Temporal Data Engine (Rosario, Batangas) ──
const getTemporalData = (baseData, name, year) => {
    const urbanCore = ["Poblacion A", "Poblacion B", "Poblacion C", "Poblacion D", "Poblacion E", "Poblacion", "San Roque", "Namunga", "Quilib"];
    const industrialCorridor = ["San Carlos", "Bagong Pook", "San Jose", "Inica", "Cahigam", "Calantas"];
    const residentialSprawl = ["Itlugan", "Masaya", "Bayawang", "Pinagsibaan", "Antipolo", "Bulihan", "Maligaya"];

    let currentLandUse = baseData?.landUse || baseData?.Primary_Zone || baseData?.primaryZone;
    if (!currentLandUse) {
        if (urbanCore.includes(name)) currentLandUse = "Commercial";
        else if (industrialCorridor.includes(name)) currentLandUse = "Agro-industrial";
        else if (residentialSprawl.includes(name)) currentLandUse = "Residential";
        else currentLandUse = "Agricultural";
    }

    const data = baseData || {
        total: Math.floor(Math.random() * 5) + 2,
        review: 1,
        released: 2,
        landUse: currentLandUse,
        diversity: 0.3,
    };
    const yearDiff = year - 2020;
    let growthRate = 1.2;

    if (urbanCore.includes(name)) {
        growthRate = 4.5;
        if (year >= 2022 && currentLandUse === "Residential") currentLandUse = "Commercial";
    } else if (industrialCorridor.includes(name)) {
        growthRate = 3.8;
        if (year >= 2021 && currentLandUse === "Agricultural") currentLandUse = "Agro-industrial";
        if (year >= 2024 && currentLandUse === "Agro-industrial") currentLandUse = "Industrial";
    } else if (residentialSprawl.includes(name)) {
        growthRate = 2.8;
        if (year >= 2023 && currentLandUse === "Agricultural") currentLandUse = "Residential";
    }

    const newTotal = Math.max(1, Math.floor((data.Total ?? data.total ?? 3) + yearDiff * growthRate));

    return {
        ...data,
        total: newTotal,
        review: Math.floor(newTotal * 0.2),
        released: Math.floor(newTotal * 0.7),
        landUse: currentLandUse,
        diversity: data.diversity,
    };
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

// ── Smart Application Status Pin Configuration ──
const STATUS_MARKER_CONFIG = {
    "Received": {
        label: "Received",
        color: "#10b981", // Emerald Green
        border: "#059669",
        badgeBg: "#ecfdf5",
        badgeText: "#065f46",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>`
    },
    "Technical Review": {
        label: "Technical Review",
        color: "#f59e0b", // Amber Gold
        border: "#d97706",
        badgeBg: "#fffbeb",
        badgeText: "#92400e",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
    },
    "Under Sangguniang Bayan": {
        label: "Under SB Hearing",
        color: "#8b5cf6", // Purple
        border: "#7c3aed",
        badgeBg: "#f5f3ff",
        badgeText: "#5b21b6",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="21" x2="21" y2="21"/><line x1="3" y1="10" x2="21" y2="10"/><polyline points="5 6 12 3 19 6"/><line x1="4" y1="10" x2="4" y2="21"/><line x1="20" y1="10" x2="20" y2="21"/><line x1="8" y1="14" x2="8" y2="17"/><line x1="12" y1="14" x2="12" y2="17"/><line x1="16" y1="14" x2="16" y2="17"/></svg>`
    },
    "For Release": {
        label: "For Release",
        color: "#0ea5e9", // Sky Blue
        border: "#0284c7",
        badgeBg: "#f0f9ff",
        badgeText: "#075985",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`
    },
    "Released": {
        label: "Released",
        color: "#4f46e5", // Royal Indigo
        border: "#4338ca",
        badgeBg: "#eef2ff",
        badgeText: "#3730a3",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`
    },
    "Denied": {
        label: "Denied",
        color: "#f43f5e", // Rose Red
        border: "#e11d48",
        badgeBg: "#fff1f2",
        badgeText: "#9f1239",
        iconSvg: `<svg xmlns="http://www.w3.org/2000/svg" class="w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
    },
};

const getStatusMarkerConfig = (status) => {
    if (!status) return STATUS_MARKER_CONFIG["Received"];
    const s = String(status).trim();
    if (STATUS_MARKER_CONFIG[s]) return STATUS_MARKER_CONFIG[s];
    if (s.toLowerCase().includes("review")) return STATUS_MARKER_CONFIG["Technical Review"];
    if (s.toLowerCase().includes("sangguniang") || s.toLowerCase().includes("bayan")) return STATUS_MARKER_CONFIG["Under Sangguniang Bayan"];
    if (s.toLowerCase().includes("for release")) return STATUS_MARKER_CONFIG["For Release"];
    if (s.toLowerCase().includes("release") || s.toLowerCase().includes("approved")) return STATUS_MARKER_CONFIG["Released"];
    if (s.toLowerCase().includes("denied") || s.toLowerCase().includes("reject")) return STATUS_MARKER_CONFIG["Denied"];
    return STATUS_MARKER_CONFIG["Received"];
};

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

const createApplicationPopupHtml = (app) => {
    const config = getStatusMarkerConfig(app?.status);
    const sla = getSLAInfo(app?.created_at, app?.status);
    const refNo = app?.reference_number || `APP-${app?.id || '001'}`;
    const applicant = app?.applicant_name || 'Individual Applicant';
    const appType = app?.application_type || 'Zoning Clearance';
    const barangay = app?.barangay || 'Rosario';
    const landUse = app?.land_use_class || 'General Zone';
    const dateStr = app?.created_at ? new Date(app.created_at).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent Filing';
    const conformity = getZoningConformity(app, landUse);

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
    year,
    mapZoom,
    onZoomChange,
    clupOpacity = 0.85,
    resetTrigger,
    searchTargetBgy,
    diversityTierFilter = "all",
    showDiversityLabels = false,
    rightPanelOpen = true,
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null);
    const geoLayerRef = useRef(null);
    const zoningLayerRef = useRef(null);
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
    const yearRef = useRef(year);
    const diversityTierRef = useRef(diversityTierFilter);
    const showLabelsRef = useRef(showDiversityLabels);
    const rightPanelOpenRef = useRef(rightPanelOpen);
    const selectedBgyRef = useRef(selectedBgy);
    const popupTimerRef = useRef(null);

    useEffect(() => { layerRef.current = currentLayer; }, [currentLayer]);
    useEffect(() => { opacityRef.current = clupOpacity; }, [clupOpacity]);
    useEffect(() => { appFilterRef.current = appTypeFilter; }, [appTypeFilter]);
    useEffect(() => { yearRef.current = year; }, [year]);
    useEffect(() => { diversityTierRef.current = diversityTierFilter; }, [diversityTierFilter]);
    useEffect(() => { showLabelsRef.current = showDiversityLabels; }, [showDiversityLabels]);
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

    const landUseColors = {
        Residential: { fill: "#22c55e", stroke: "#16a34a" },
        Agricultural: { fill: "#84cc16", stroke: "#65a30d" },
        Commercial: { fill: "#f59e0b", stroke: "#d97706" },
        Industrial: { fill: "#ef4444", stroke: "#dc2626" },
        "Agro-industrial": { fill: "#8b5cf6", stroke: "#7c3aed" },
        Special: { fill: "#64748b", stroke: "#475569" },
    };

    const zoningPlanColors = {
        "R1-Z": { fill: "#fffc2b", stroke: "#e6e326" },
        "R2-Z": { fill: "#fffc2b", stroke: "#e6e326" },
        "MR2-SZ": { fill: "#ffc92b", stroke: "#e5b426" },
        "BR2-SZ": { fill: "#ffc92b", stroke: "#e5b426" },
        "C1-Z": { fill: "#eb3356", stroke: "#d32e4d" },
        "C2-Z": { fill: "#eb3356", stroke: "#d32e4d" },
        "C/MP-Z": { fill: "#36ff39", stroke: "#30e533" },
        "I1-Z": { fill: "#de29c0", stroke: "#c725ac" },
        "I2-Z": { fill: "#de29c0", stroke: "#c725ac" },
        "I3-Z": { fill: "#de29c0", stroke: "#c725ac" },
        "AgIndZ": { fill: "#ff7cae", stroke: "#e56f9c" },
        "AgIndZ-PTR": { fill: "#ff7cae", stroke: "#e56f9c" },
        "AgIndZ-PGR": { fill: "#ff7cae", stroke: "#e56f9c" },
        "PDA-SZ": { fill: "#94d180", stroke: "#85bc73" },
        "PTA-SZ-RA": { fill: "#94d180", stroke: "#85bc73" },
        "5491-APDA-SZ": { fill: "#61631f", stroke: "#57591c" },
        "FZ": { fill: "#5bb93c", stroke: "#51a636" },
        "FR-SZ": { fill: "#5bb93c", stroke: "#51a636" },
        "GI-Z": { fill: "#6146db", stroke: "#573fc5" },
        "UTS-Z": { fill: "#969696", stroke: "#878787" },
        "CMRF": { fill: "#969696", stroke: "#878787" },
        "PR-Z": { fill: "#36ff39", stroke: "#30e533" },
        "T-Z": { fill: "#ffa97a", stroke: "#e5986d" },
        "ECT-Z": { fill: "#ffa97a", stroke: "#e5986d" },
        "THSP-SZ": { fill: "#5bb93c", stroke: "#51a636" },
        "WZ": { fill: "#2dcacd", stroke: "#28b5b8" },
        "ROAD": { fill: "#969696", stroke: "#878787" },
        "PROPOSED ROAD": { fill: "#969696", stroke: "#878787" },
        "DEFAULT": { fill: "#cbd5e1", stroke: "#94a3b8" }
    };

    const getZoneDisplayInfo = (code) => {
        const c = String(code || "").trim();
        const config = zoningPlanColors[c] || zoningPlanColors["DEFAULT"];
        const labels = {
            "R1-Z": "Low-Density Residential (R-1)",
            "R2-Z": "Medium-Density Residential (R-2)",
            "MR2-SZ": "Maximum R-2 Sub-Zone",
            "BR2-SZ": "Basic R-2 Sub-Zone",
            "C1-Z": "Commercial-1 Zone (C-1)",
            "C2-Z": "Commercial-2 Zone (C-2)",
            "C/MP-Z": "Cemetery / Memorial Park",
            "I1-Z": "Light Industrial (I-1)",
            "I2-Z": "Medium Industrial (I-2)",
            "I3-Z": "Heavy Industrial (I-3)",
            "AgIndZ": "Agri-Industrial Zone",
            "AgIndZ-PTR": "Agri-Industrial Poultry",
            "AgIndZ-PGR": "Agri-Industrial Piggery",
            "PDA-SZ": "Production Agricultural Sub-Zone",
            "PTA-SZ-RA": "Protection Agricultural Rice Area",
            "5491-APDA-SZ": "Buffer / Greenbelt Sub-Zone",
            "FZ": "Forest Zone",
            "FR-SZ": "Forest Reserve Sub-Zone",
            "GI-Z": "General Institutional Zone",
            "UTS-Z": "Utilities & Transport Zone",
            "CMRF": "Materials Recovery Facility",
            "PR-Z": "Parks & Recreation Zone",
            "T-Z": "Tourism Zone",
            "ECT-Z": "Eco-Tourism Zone",
            "THSP-SZ": "Tombol Hill Special Protection",
            "WZ": "Water Zone",
            "ROAD": "Road Network",
            "PROPOSED ROAD": "Proposed Bypass Network",
        };
        return {
            label: labels[c] || c || "Zoning Parcel",
            code: c,
            fill: config.fill,
            stroke: config.stroke,
        };
    };

    const buildDiversityXRayPopup = (name, divScore, theme, bgyData) => {
        const munDiff = Math.round((divScore - 0.62) * 100);
        const diffLabel = munDiff >= 0 ? `+${munDiff}% vs Town Avg (0.62)` : `${munDiff}% vs Town Avg (0.62)`;
        const cleanId = name.replace(/[^a-zA-Z0-9]/g, "-");
        const distribution = bgyData?.distribution || [];
        const topDist = distribution.slice(0, 4);

        const distributionHtml = topDist.length > 0 ? topDist.map((item) => {
            const zInfo = getZoneDisplayInfo(item.name);
            return `
                <div class="flex items-center justify-between px-2 py-1 rounded border text-[10px] bg-slate-50/80 border-slate-200">
                    <div class="flex items-center gap-1.5 min-w-0 truncate">
                        <span class="w-2 h-2 rounded-xs shrink-0 ring-1 ring-black/10" style="background-color: ${zInfo.fill};"></span>
                        <span class="font-semibold text-slate-800 truncate">${zInfo.label}</span>
                    </div>
                    <span class="font-mono font-bold text-slate-900 shrink-0 ml-1.5">${item.value}%</span>
                </div>
            `;
        }).join("") : `<div class="text-[10px] text-slate-400 font-medium py-0.5">No zoning records available.</div>`;

        return `
            <div class="p-2.5 font-sans min-w-[240px] max-w-[275px]">
                <div class="flex items-center justify-between gap-1.5 pb-1.5 border-b border-slate-200">
                    <div>
                        <span class="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">
                            CLUP 2030 Land Use
                        </span>
                        <h4 class="text-xs font-bold text-slate-900 leading-tight">
                            Brgy. ${name}
                        </h4>
                    </div>
                    <span class="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded text-white shrink-0" style="background-color: ${theme.fill};">
                        Index: ${Number(divScore).toFixed(2)}
                    </span>
                </div>

                <div class="mt-1.5 py-1 px-2 rounded bg-slate-50 border border-slate-200 flex items-center justify-between text-[10px]">
                    <span class="font-bold text-slate-700 truncate mr-1">${theme.classification}</span>
                    <span class="font-mono font-semibold text-slate-600 text-[9px] shrink-0">
                        ${diffLabel}
                    </span>
                </div>

                <!-- Internal Micro-Zoning Classification Mix -->
                <div class="mt-1.5 pt-1.5 border-t border-slate-100">
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-[8px] font-bold uppercase tracking-wider text-slate-400">
                            Land Use Mix:
                        </span>
                        <span class="text-[8px] font-medium text-slate-400">
                            CLUP 2030
                        </span>
                    </div>
                    <div class="space-y-0.5">
                        ${distributionHtml}
                    </div>
                </div>

                <!-- Footer action -->
                <div class="mt-2 pt-1.5 border-t border-slate-100">
                    <button id="bgy-clear-btn-${cleanId}" class="w-full py-1 px-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold text-[10.5px] transition-colors cursor-pointer border border-slate-200 text-center">
                        Deselect Barangay
                    </button>
                </div>
            </div>
        `;
    };

    const attachPopupButtons = (name, bgyData) => {
        const cleanId = name.replace(/[^a-zA-Z0-9]/g, "-");
        setTimeout(() => {
            const clearBtn = document.getElementById(`bgy-clear-btn-${cleanId}`);
            if (clearBtn) {
                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (onMapClick) onMapClick();
                };
            }
        }, 50);
    };

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

        // Horizontally: center in the open map area (accounting for the ~390px right intelligence panel)
        const sidebarWidth = rightPanelOpenRef.current ? 390 : 0;
        const targetScreenX = Math.max(140, (w - sidebarWidth) / 2);
        // Vertically: position centroid in the lower 60% of viewport so the upward popup has plenty of clearance below header
        const targetScreenY = Math.min(h - 100, Math.max(300, 100 + (h - 100) * 0.62));

        import("leaflet").then((L) => {
            const centroidPoint = mapInstanceRef.current.project(centroid, targetZoom);
            const screenCenter = size.divideBy(2);
            const targetScreen = L.default.point(targetScreenX, targetScreenY);
            const offset = screenCenter.subtract(targetScreen);
            const newCenterPoint = centroidPoint.add(offset);
            const newCenter = mapInstanceRef.current.unproject(newCenterPoint, targetZoom);

            const isZoomChanging = Math.abs(currentZoom - targetZoom) > 0.15;
            if (isZoomChanging) {
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

            if (layerRef.current === "diversity") {
                const divScore = bgyData?.diversity ?? 0;
                const theme = getDiversityTheme(divScore);
                const popupContent = buildDiversityXRayPopup(name, divScore, theme, bgyData);

                targetLayer.bindPopup(popupContent, {
                    className: "custom-app-popup",
                    maxWidth: 280,
                    autoPan: false,
                    closeButton: true,
                });

                // Open popup smoothly as camera reaches position to prevent DOM reflow jitter during pan
                popupTimerRef.current = setTimeout(() => {
                    if (mapInstanceRef.current && selectedBgyRef.current && selectedBgyRef.current.name?.toLowerCase() === name.toLowerCase()) {
                        targetLayer.openPopup();
                        attachPopupButtons(name, bgyData);
                    }
                }, 420);

                targetLayer.off("popupclose");
                targetLayer.on("popupclose", () => {
                    if (selectedBgyRef.current && selectedBgyRef.current.name?.toLowerCase() === name.toLowerCase()) {
                        if (onMapClick) onMapClick();
                    }
                });
            } else {
                mapInstanceRef.current.closePopup();
            }
        });
    };

    const getFeatureStyle = (feature, layer, filter, currentYear) => {
        const props = feature.properties || {};
        const name = (
            props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || ""
        ).trim();
        const bgyData = staticBgyData[name] || { total: 0, landUse: "Residential", diversity: 0.5 };
        const temporalData = getTemporalData(bgyData, name, currentYear);

        const activeTotal = bgyData.total || 0;
        const baseStyle = { color: "#2563eb", weight: 1.2, opacity: 0.9 };

        if (layer === "zoning") {
            return { color: "#1e3a8a", weight: 1.2, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
        }

        if (layer === "diversity") {
            const isSelected = selectedBgy && selectedBgy.name && selectedBgy.name.trim().toLowerCase() === name.toLowerCase();
            const activeTier = diversityTierRef.current || "all";
            const divScore = bgyData?.diversity ?? 0;
            const theme = getDiversityTheme(divScore);
            const matchesTier = activeTier === "all" || theme.tier === activeTier;

            if (isSelected) {
                return {
                    color: "#1e3a8a",           // Bold Navy administrative border
                    weight: 3.5,
                    dashArray: null,
                    fillColor: "transparent",   // 100% transparent so official CLUP zoning underneath is crystal clear
                    fillOpacity: 0,
                    opacity: 1,
                };
            }

            // Clean administrative boundary over the CLUP master zoning map: NO solid purple covers
            return {
                color: matchesTier ? (activeTier === "all" ? "#334155" : theme.stroke) : "#94a3b8",
                weight: matchesTier ? (activeTier === "all" ? 1.2 : 2.5) : 0.6,
                dashArray: activeTier !== "all" && matchesTier ? null : "3, 3",
                fillColor: "transparent",       // No solid purple covers: let CLUP render clearly
                fillOpacity: 0,
                opacity: matchesTier ? (activeTier === "all" ? 0.85 : 0.95) : 0.25,
            };
        }

        if (layer === "status") {
            return { ...baseStyle, fillColor: statusColor(activeTotal), fillOpacity: activeTotal > 0 ? 0.35 : 0.15 };
        }

        if (layer === "trends") {
            const isSelected = selectedBgy && selectedBgy.name && selectedBgy.name.trim().toLowerCase() === name.toLowerCase();
            return {
                color: isSelected ? "#2563eb" : "#1e40af",
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
                const sidebarWidth = rightPanelOpenRef.current ? 390 : 0;
                mapInstanceRef.current.flyToBounds(rosarioBoundsRef.current, {
                    paddingTopLeft: [50, 90],
                    paddingBottomRight: [sidebarWidth + 20, 40],
                    duration: 1.0,
                    easeLinearity: 0.15,
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
            const name = (
                props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || ""
            ).trim();

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
            const isTrends = currentLayer === "trends";
            const isDiversity = currentLayer === "diversity";
            matchedLayer.setStyle({
                weight: isStatus ? 2.5 : 3.5,
                color: isStatus ? "#2563eb" : (isTrends ? "#2563eb" : (isDiversity ? "#1e3a8a" : "#1e3a8a")),
                fillColor: isStatus ? "#3b82f6" : (isTrends ? "#3b82f6" : (isDiversity ? "transparent" : "#2563eb")),
                fillOpacity: isStatus ? 0.08 : (isTrends ? 0.12 : (isDiversity ? 0.02 : 0.6)),
                dashArray: "",
            });
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
    }, [selectedBgy, currentLayer, applications, staticBgyData]);

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

            applicationsLayerRef.current = L.default.layerGroup().addTo(map);
            establishmentsLayerRef.current = L.default.layerGroup().addTo(map);
            diversityLabelsLayerRef.current = L.default.layerGroup().addTo(map);

            Promise.all([
                fetch("/api/map/rosario_boundary").then((r) => (r.ok ? r.json() : null)).catch(() => null),
                fetch("/api/map/barangay_boundary").then((r) => (r.ok ? r.json() : null)).catch(() => null),
                fetch("/api/map/land_use_plan").then((r) => (r.ok ? r.json() : null)).catch(() => null),
            ])
            .then(([rosarioData, barangayData, landUseData]) => {
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

                if (landUseData && landUseData.features) {
                    zoningLayerRef.current = L.default.geoJSON(landUseData, {
                        style: (feature) => {
                            const props = feature.properties || {};
                            const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                            const zoneCode = String(rawZone).trim();
                            const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];
                            const isZoningActive = layerRef.current === "zoning";
                            const isTrendsActive = layerRef.current === "trends";
                            const isLandUsePlanVisible = isZoningActive || isTrendsActive;

                            return {
                                color: colorConfig.stroke,
                                weight: isTrendsActive ? 1 : 1.5,
                                fillColor: colorConfig.fill,
                                fillOpacity: isTrendsActive ? 0.65 : (isZoningActive ? opacityRef.current : 0),
                                opacity: isLandUsePlanVisible ? 0.9 : 0
                            };
                        }
                    }).addTo(map);
                }

                if (barangayData && barangayData.features) {
                    geoLayerRef.current = L.default
                        .geoJSON(barangayData, {
                            style: (feature) => getFeatureStyle(feature, layerRef.current, appTypeFilter, year),
                            onEachFeature: (feature, layer_feature) => {
                                const props = feature.properties || {};
                                const name = (
                                    props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || "Unknown"
                                ).trim();

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
                                        const divScore = bgyData?.diversity ?? 0;
                                        const theme = getDiversityTheme(divScore);
                                        tooltipContent = `
                                            <div class="font-sans px-1 py-0.5">
                                                <div class="flex items-center gap-1.5">
                                                    <span class="w-2.5 h-2.5 rounded-full shadow-xs" style="background-color: ${theme.fill}"></span>
                                                    <span class="font-bold text-slate-900">${name}</span>
                                                    <span class="font-mono text-[10px] font-black px-1.5 py-0.2 rounded text-white" style="background-color: ${theme.fill}">
                                                        ${Number(divScore).toFixed(2)}
                                                    </span>
                                                </div>
                                                <div class="text-[10px] font-semibold text-slate-500 mt-0.5">
                                                    ${theme.classification} · <span class="text-slate-400 font-normal">${dominantZoneText}</span>
                                                </div>
                                            </div>
                                        `;
                                    }

                                    layer_feature
                                        .bindTooltip(tooltipContent, {
                                            permanent: false,
                                            direction: "center",
                                            className: isDiversity
                                                ? "font-sans text-xs bg-white/95 text-slate-900 border border-slate-200 shadow-xl px-3 py-1.5 rounded-xl backdrop-blur-md"
                                                : "font-sans text-xs font-bold bg-white/95 text-slate-800 border border-slate-200 shadow-xl px-3 py-1.5 rounded-xl backdrop-blur-md",
                                        })
                                        .openTooltip();

                                    if (activeFeatureRef.current !== layer_feature) {
                                        if (isDiversity) {
                                            const divScore = bgyData?.diversity ?? 0;
                                            const theme = getDiversityTheme(divScore);
                                            layer_feature.setStyle({ fillOpacity: 0.90, weight: 3, color: theme.stroke });
                                        } else {
                                            const hoverOpacity = isTrends ? 0.08 : 0.45;
                                            const hoverColor = isTrends ? "#2563eb" : undefined;
                                            layer_feature.setStyle({ fillOpacity: hoverOpacity, weight: 2.5, ...(hoverColor ? { color: hoverColor } : {}) });
                                        }
                                    }
                                });

                                layer_feature.on("mouseout", () => {
                                    layer_feature.closeTooltip();
                                    if (activeFeatureRef.current !== layer_feature) {
                                        geoLayerRef.current.resetStyle(layer_feature);
                                    }
                                });
                            },
                        })
                        .addTo(map);

                    map.fitBounds(geoLayerRef.current.getBounds(), { padding: [25, 25] });
                }
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
        });
    }, [mapStyle]);

    // Live update GeoJSON styling when filters or active data change
    useEffect(() => {
        if (activeFeatureRef.current && geoLayerRef.current) {
            geoLayerRef.current.resetStyle(activeFeatureRef.current);
            activeFeatureRef.current = null;
        }

        if (geoLayerRef.current) {
            geoLayerRef.current.eachLayer((layer_feature) => {
                layer_feature.setStyle(getFeatureStyle(layer_feature.feature, currentLayer, appTypeFilter, year));
            });
        }

        const isZoningActive = currentLayer === "zoning";
        const isTrendsActive = currentLayer === "trends";
        const isDiversityActive = currentLayer === "diversity";
        const isLandUsePlanVisible = isZoningActive || isTrendsActive || isDiversityActive;

        if (zoningLayerRef.current) {
            zoningLayerRef.current.setStyle((feature) => {
                const props = feature.properties || {};
                const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                const zoneCode = String(rawZone).trim();
                const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];

                return {
                    color: colorConfig.stroke,
                    weight: isTrendsActive ? 1 : 1.5,
                    fillColor: colorConfig.fill,
                    fillOpacity: isTrendsActive ? 0.65 : (isDiversityActive ? 0.85 : (isZoningActive ? clupOpacity : 0)),
                    opacity: isLandUsePlanVisible ? 0.9 : 0
                };
            });
        }

        if (clupTileLayerRef.current) {
            clupTileLayerRef.current.setOpacity(clupOpacity);
        }

        // Raster tiles are rendered for CLUP 2030, Urban Growth, AND Diversity Index layer
        if (isZoningActive || isTrendsActive || isDiversityActive) {
            if (clupTileLayerRef.current && mapInstanceRef.current && !mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
                mapInstanceRef.current.addLayer(clupTileLayerRef.current);
            }
            if (clupTileLayerRef.current) {
                clupTileLayerRef.current.setOpacity(
                    isDiversityActive ? 0.85 : (isTrendsActive ? 0.65 : clupOpacity)
                );
            }
        } else {
            if (clupTileLayerRef.current && mapInstanceRef.current && mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
                mapInstanceRef.current.removeLayer(clupTileLayerRef.current);
            }
        }

        if (isLandUsePlanVisible) {
            if (zoningLayerRef.current) zoningLayerRef.current.bringToFront();
            if (geoLayerRef.current) geoLayerRef.current.bringToFront();
        }
    }, [currentLayer, appTypeFilter, year, clupOpacity, staticBgyData, diversityTierFilter, showDiversityLabels, selectedBgy]);

    // Render floating score chips on each barangay centroid when diversity layer labels are enabled
    useEffect(() => {
        if (!diversityLabelsLayerRef.current || !geoLayerRef.current) return;
        diversityLabelsLayerRef.current.clearLayers();

        if (currentLayer !== "diversity" || !showDiversityLabels) return;

        import("leaflet").then((L) => {
            geoLayerRef.current.eachLayer((layer_feature) => {
                const props = layer_feature.feature?.properties || {};
                const name = (
                    props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || ""
                ).trim();
                const bgyData = staticBgyData[name] || {};
                const divScore = bgyData.diversity ?? 0;
                const theme = getDiversityTheme(divScore);
                const activeTier = diversityTierRef.current || "all";
                const matchesTier = activeTier === "all" || theme.tier === activeTier;

                if (!matchesTier) return;
                // If a barangay is selected in diversity mode, skip its centroid badge to avoid overlapping the X-Ray popup
                if (selectedBgy && selectedBgy.name && selectedBgy.name.toLowerCase() === name.toLowerCase()) return;

                const center = layer_feature.getBounds().getCenter();
                const labelIcon = L.default.divIcon({
                    className: "diversity-centroid-chip",
                    html: `
                        <div style="
                            display: inline-flex;
                            align-items: center;
                            gap: 4px;
                            padding: 2.5px 7px;
                            border-radius: 9999px;
                            background-color: ${theme.fill};
                            color: white;
                            font-family: ui-sans-serif, system-ui, sans-serif;
                            font-size: 10px;
                            font-weight: 800;
                            box-shadow: 0 4px 14px rgba(0,0,0,0.35);
                            border: 1.5px solid white;
                            white-space: nowrap;
                            pointer-events: auto;
                            cursor: pointer;
                            transform: translate(-50%, -50%);
                        " title="${name}: ${Number(divScore).toFixed(2)} (${theme.classification})">
                            <span>${name}</span>
                            <span style="background: rgba(0,0,0,0.28); padding: 1px 4.5px; border-radius: 4px; font-family: monospace; font-size: 9.5px; font-weight: 900;">${Number(divScore).toFixed(2)}</span>
                        </div>
                    `,
                    iconSize: [0, 0],
                });

                const marker = L.default.marker(center, { icon: labelIcon, interactive: true });
                marker.on("click", (e) => {
                    L.default.DomEvent.stopPropagation(e);
                    layer_feature.fire("click");
                });
                diversityLabelsLayerRef.current.addLayer(marker);
            });
        });
    }, [currentLayer, showDiversityLabels, diversityTierFilter, staticBgyData, selectedBgy]);

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

                            const popupHtml = createApplicationPopupHtml(app);
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

    // Live update Urban Growth Establishments & Landmark Pins for the active year
    useEffect(() => {
        if (!establishmentsLayerRef.current || !mapInstanceRef.current) return;
        establishmentsLayerRef.current.clearLayers();
        establishmentMarkersRef.current = {};

        if (currentLayer === "trends") {
            import("leaflet").then((L) => {
                const activeEsts = getEstablishmentsForYear(year);

                activeEsts.forEach((est) => {
                    const isNewThisYear = est.year === year;

                    const getIconSvg = (type) => {
                        if (type === "mall" || type === "supermarket") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" /></svg>`;
                        }
                        if (type === "dining") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>`;
                        }
                        if (type === "residential") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>`;
                        }
                        if (type === "agro-industrial" || type === "logistics") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>`;
                        }
                        if (type === "healthcare") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4" /></svg>`;
                        }
                        if (type === "infrastructure") {
                            return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>`;
                        }
                        return `<svg class="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3" /></svg>`;
                    };

                    const iconHtml = `
                        <div class="relative group cursor-pointer">
                            ${isNewThisYear ? `
                                <span class="absolute -top-1.5 -right-1.5 flex h-4 w-4 z-20">
                                    <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-80"></span>
                                    <span class="relative inline-flex rounded-full h-4 w-4 bg-amber-500 border border-white text-[8px] text-white font-black items-center justify-center shadow-xs">★</span>
                                </span>
                            ` : ''}
                            <div class="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg border-2 border-white transition-all transform hover:scale-125 duration-200" style="background-color: ${est.color};">
                                ${getIconSvg(est.type)}
                            </div>
                        </div>
                    `;

                    const customIcon = L.default.divIcon({
                        html: iconHtml,
                        className: "custom-app-marker-container",
                        iconSize: [32, 32],
                        iconAnchor: [16, 16],
                        popupAnchor: [0, -18],
                    });

                    const marker = L.default.marker(est.coords, { icon: customIcon });

                    const popupHtml = `
                        <div class="w-64 p-3 font-sans">
                            <div class="flex items-center justify-between gap-1.5 pb-2 border-b border-slate-100">
                                <span class="text-[9.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full" style="background-color: ${est.bg}; color: ${est.color};">
                                    ${est.badge}
                                </span>
                                <span class="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                    ${isNewThisYear ? `✨ Added in ${est.year}` : `Active since ${est.year}`}
                                </span>
                            </div>
                            <h4 class="text-xs font-black text-slate-900 mt-2 leading-snug">
                                ${est.name}
                            </h4>
                            <p class="text-[11px] font-medium text-slate-500 mt-1 leading-relaxed">
                                ${est.description}
                            </p>
                            <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                                <span class="font-bold text-slate-700">📍 Brgy. ${est.barangay}</span>
                                <button id="est-popup-btn-${est.id}" class="text-blue-600 hover:text-blue-800 font-bold underline cursor-pointer">
                                    Inspect Brgy &rarr;
                                </button>
                            </div>
                        </div>
                    `;

                    marker.bindPopup(popupHtml, {
                        className: "custom-app-popup",
                        maxWidth: 280,
                    });

                    marker.on("popupopen", () => {
                        const btn = document.getElementById(`est-popup-btn-${est.id}`);
                        if (btn) {
                            btn.onclick = () => {
                                if (onFeatureClick) {
                                    onFeatureClick(est.barangay, staticBgyData[est.barangay] || {});
                                }
                            };
                        }
                    });

                    establishmentsLayerRef.current.addLayer(marker);
                    establishmentMarkersRef.current[est.id] = marker;
                });

                if (!mapInstanceRef.current.hasLayer(establishmentsLayerRef.current)) {
                    mapInstanceRef.current.addLayer(establishmentsLayerRef.current);
                }
            });
        } else {
            if (mapInstanceRef.current.hasLayer(establishmentsLayerRef.current)) {
                mapInstanceRef.current.removeLayer(establishmentsLayerRef.current);
            }
        }
    }, [currentLayer, year, staticBgyData]);

    return <div ref={mapRef} id="map" className="absolute inset-0 z-0" />;
}

export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats, recent, filters, overallDiversity, urbanGrowthData }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("standard");
    const [stylePopupOpen, setStylePopupOpen] = useState(false);
    const [appTypeFilter, setAppTypeFilter] = useState(filters?.application_type || "Zoning Certificate");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [rightPanelOpen, setRightPanelOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [year, setYear] = useState(2026);
    const [isPlaying, setIsPlaying] = useState(false);
    const [clupOpacity, setClupOpacity] = useState(0.85);
    const [donutLoaded, setDonutLoaded] = useState(false);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [mapZoom, setMapZoom] = useState(13);
    const [resetTrigger, setResetTrigger] = useState(0);
    const [searchTargetBgy, setSearchTargetBgy] = useState(null);
    const [inspectedApp, setInspectedApp] = useState(null);
    const [statusFilter, setStatusFilter] = useState("All");
    const [hoveredAppId, setHoveredAppId] = useState(null);
    const [flyToTarget, setFlyToTarget] = useState(null);
    const [statusSearchQuery, setStatusSearchQuery] = useState("");
    const [diversityTierFilter, setDiversityTierFilter] = useState("all");
    const [diversityLens, setDiversityLens] = useState("diversity");
    const [showDiversityLabels, setShowDiversityLabels] = useState(false);
    const [is3DMode, setIs3DMode] = useState(false);

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

    const isBgyActive = Boolean(selectedBgy);
    const displayTotal = isBgyActive ? (selectedBgy.data.Total ?? selectedBgy.data.total ?? 0) : (total || 0);
    const displayReview = isBgyActive
        ? (selectedBgy.data["Technical Review"] ?? selectedBgy.data.review ?? 0)
        : (statusMap?.["Technical Review"] ?? 0);
    const displayReleased = isBgyActive
        ? (selectedBgy.data["Released"] ?? selectedBgy.data.released ?? 0)
        : (statusMap?.["Released"] ?? 0);
    const displayThisMonth = isBgyActive ? null : thisMonth;

    const safeTotal = displayTotal || 1;
    const processingPct = Math.round(((safeTotal - displayReview - displayReleased) / safeTotal) * 100);
    const reviewPct = Math.round((displayReview / safeTotal) * 100);
    const releasedPct = Math.round((displayReleased / safeTotal) * 100);

    const handleSelectApp = useCallback((app) => {
        if (!app) return;
        setInspectedApp(app);
        const coords = getAppCoordinates(app);
        if (app.barangay) {
            const bgyName = app.barangay.trim();
            const bgyData = (bgyStats && bgyStats[bgyName]) ? bgyStats[bgyName] : { total: 1 };
            setSelectedBgy({ name: bgyName, data: bgyData });
        }
        setHoveredAppId(app.id);
        setFlyToTarget({ coords, zoom: 17, appId: app.id, openPopup: true, timestamp: Date.now() });
    }, [bgyStats]);

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

    const displayRecent = useMemo(() => {
        const list = Array.isArray(recent) ? recent : [];
        if (isBgyActive && selectedBgy?.name) {
            return list.filter((r) => (r.barangay || "").trim().toLowerCase() === selectedBgy.name.trim().toLowerCase()).slice(0, 5);
        }
        return list.slice(0, 5);
    }, [recent, isBgyActive, selectedBgy]);

    // Real per-tier barangay counts for the diversity legend (replaces hardcoded counts)
    const diversityTierCounts = useMemo(() => {
        const counts = { high: 0, diverse: 0, moderate: 0, developing: 0, monoculture: 0 };
        Object.values(bgyStats || {}).forEach((stat) => {
            const score = stat?.diversity;
            if (typeof score !== "number") return;
            const tier = getDiversityTheme(score).tier;
            if (counts[tier] !== undefined) counts[tier] += 1;
        });
        return counts;
    }, [bgyStats]);

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
        let interval = null;
        if (isPlaying && activeLayer === "trends") {
            interval = setInterval(() => {
                setYear((prev) => (prev >= 2026 ? 2020 : prev + 1));
            }, 1400);
        } else if (activeLayer !== "trends") {
            setIsPlaying(false);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isPlaying, activeLayer]);

    useEffect(() => {
        if (activeLayer === "diversity") {
            setTimeout(() => setDonutLoaded(true), 150);
            setIs3DMode(true);
        } else {
            setDonutLoaded(false);
            setDiversityTierFilter("all");
            setDiversityLens("diversity");
            setShowDiversityLabels(false);
            setIs3DMode(false);
        }
        setSelectedBgy(null);
        setSearchTargetBgy(null);
    }, [activeLayer]);

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
    }, [sidebarOpen]);

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
            label: "Urban Growth",
            title: "Land Use Projections",
            desc: "Multi-year urban expansion & zoning growth simulation",
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
            desc: "Balance of commercial, residential & industrial activities",
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

    const trendFactor = 1 + (year - 2020) * 0.15;

    const landUseData = useMemo(() => [
        ["Residential", Math.floor(82 * trendFactor), Math.min(100, Math.floor(40 * trendFactor * 0.8)), "#22c55e", "#dcfce7"],
        ["Commercial", Math.floor(34 * trendFactor * 1.5), Math.min(100, Math.floor(17 * trendFactor * 1.2)), "#f59e0b", "#fef3c7"],
        ["Agricultural", Math.floor(44 / trendFactor), Math.floor(22 / trendFactor), "#84cc16", "#ecfccb"],
        ["Agro-industrial", Math.floor(14 * trendFactor * 1.8), Math.min(100, Math.floor(7 * trendFactor * 1.5)), "#8b5cf6", "#f3e8ff"],
        ["Industrial", Math.floor(22 * trendFactor), Math.min(100, Math.floor(11 * trendFactor)), "#ef4444", "#fee2e2"],
        ["Special projects", Math.floor(7 * trendFactor), Math.min(100, Math.floor(3 * trendFactor)), "#64748b", "#f1f5f9"],
    ].sort((a, b) => b[1] - a[1]), [trendFactor]);

    const hotspots = useMemo(() => [
        { rank: 1, name: "San Roque", type: year >= 2023 ? "Commercial" : "Residential", color: year >= 2023 ? "#f59e0b" : "#22c55e", bg: year >= 2023 ? "#fef3c7" : "#dcfce7", count: Math.floor(42 * trendFactor) },
        { rank: 2, name: "Quilib", type: year >= 2024 ? "Industrial" : "Agro-industrial", color: year >= 2024 ? "#ef4444" : "#8b5cf6", bg: year >= 2024 ? "#fee2e2" : "#f3e8ff", count: Math.floor(38 * trendFactor) },
        { rank: 3, name: "San Carlos", type: year >= 2024 ? "Industrial" : "Agro-industrial", color: year >= 2024 ? "#ef4444" : "#8b5cf6", bg: year >= 2024 ? "#fee2e2" : "#f3e8ff", count: Math.floor(35 * trendFactor) },
        { rank: 4, name: "Poblacion B", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: Math.floor(31 * trendFactor) },
        { rank: 5, name: "Pinagsibaan", type: year >= 2023 ? "Residential" : "Agricultural", color: year >= 2023 ? "#22c55e" : "#84cc16", bg: year >= 2023 ? "#dcfce7" : "#ecfccb", count: Math.floor(28 * trendFactor) },
    ], [trendFactor, year]);

    return (
        <>
            <Head title="GIS Spatial Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Plus Jakarta Sans', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'JetBrains Mono', monospace !important; }
                #map, .leaflet-container { background: #f8fafc !important; }
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
            `}</style>

            <div id="dashboard-root" className="bg-slate-900 font-sans text-slate-800 h-screen flex flex-col overflow-hidden select-none">
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
                        activePage="dashboard"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                            title="Click to collapse sidebar"
                        />
                    )}

                    <main className="absolute inset-0 flex flex-col min-w-0 h-full overflow-hidden">
                        {is3DMode && activeLayer === "diversity" ? (
                            <MapLibre3DView
                                selectedBgy={selectedBgy}
                                onFeatureClick={(name, data) => {
                                    setSelectedBgy({ name, data });
                                    if (!rightPanelOpen) setRightPanelOpen(true);
                                }}
                                onMapClick={() => setSelectedBgy(null)}
                                bgyStats={bgyStats}
                                overallDiversity={overallDiversity}
                                rightPanelOpen={rightPanelOpen}
                                diversityTierFilter={diversityTierFilter}
                                onSelectDiversityTier={setDiversityTierFilter}
                            />
                        ) : (
                            <LeafletMap
                                bgyStats={bgyStats}
                                applications={recent}
                                currentLayer={activeLayer}
                                mapStyle={mapStyle}
                                appTypeFilter={appTypeFilter}
                                statusFilter={statusFilter}
                                searchFilter={statusSearchQuery}
                                hoveredAppId={hoveredAppId}
                                selectedBgy={selectedBgy}
                                flyToTarget={flyToTarget}
                                year={year}
                                mapZoom={mapZoom}
                                clupOpacity={clupOpacity}
                                resetTrigger={resetTrigger}
                                searchTargetBgy={searchTargetBgy}
                                diversityTierFilter={diversityTierFilter}
                                showDiversityLabels={showDiversityLabels}
                                rightPanelOpen={rightPanelOpen}
                                onZoomChange={setMapZoom}
                                onInspectApp={setInspectedApp}
                                onFeatureClick={(name, data) => {
                                    setSelectedBgy({ name, data });
                                    if (!rightPanelOpen) setRightPanelOpen(true);
                                }}
                                onMapClick={() => setSelectedBgy(null)}
                            />
                        )}

                        {(!is3DMode || activeLayer !== "diversity") && (
                            <MapLegend
                                activeLayer={activeLayer}
                                year={year}
                                diversityTierFilter={diversityTierFilter}
                                onSelectDiversityTier={setDiversityTierFilter}
                                meanScore={overallDiversity?.score ?? 0}
                                tierCounts={diversityTierCounts}
                            />
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
                                        badge: total,
                                        icon: (
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                            </svg>
                                        ),
                                    },
                                    {
                                        id: "trends",
                                        label: "Urban Growth",
                                        shortLabel: "Growth",
                                        key: "2",
                                        badge: year,
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
                                        badge: "0.78",
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
                                        badge: "Official",
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

                        {/* Trends Mode: Time-Machine Player */}
                        <div
                            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[600] flex flex-col items-center gap-2 transition-all duration-500 ease-out ${
                                activeLayer === "trends"
                                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                                    : "opacity-0 translate-y-8 scale-95 pointer-events-none"
                            }`}
                        >
                            <div className="flex items-center gap-2.5 bg-slate-900/80 backdrop-blur-md px-3.5 py-1 rounded-full text-white shadow-lg border border-white/10">
                                <span className="flex h-2 w-2 relative">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                </span>
                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300">
                                    {year === 2020 ? 'Baseline CLUP Horizon · Year 2020' : year <= 2022 ? `Growth Pole Designation · Year ${year}` : year <= 2025 ? `Corridor Expansion Phase · Year ${year}` : `Active Permitting Horizon · Year ${year}`}
                                </span>
                            </div>

                            <div className="flex items-center p-1.5 bg-white/90 backdrop-blur-xl border border-white/80 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)]">
                                <button
                                    onClick={() => setIsPlaying(!isPlaying)}
                                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all shadow-sm ${
                                        isPlaying
                                            ? "bg-amber-500 text-white hover:bg-amber-600 ring-2 ring-amber-400/30"
                                            : "bg-blue-800 text-white hover:bg-blue-900 ring-2 ring-blue-700/30"
                                    }`}
                                    title={isPlaying ? "Pause Simulation" : "Auto-Play Timeline"}
                                >
                                    {isPlaying ? (
                                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                                        </svg>
                                    ) : (
                                        <svg className="w-4 h-4 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                                            <path d="M8 5v14l11-7z" />
                                        </svg>
                                    )}
                                </button>

                                <div className="w-px h-5 bg-slate-200 mx-2" />

                                <div className="flex items-center gap-1">
                                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => {
                                        const isActive = year === y;
                                        const isPast = y < year;
                                        return (
                                            <button
                                                key={y}
                                                onClick={() => {
                                                    setYear(y);
                                                    setIsPlaying(false);
                                                }}
                                                className={`relative px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all duration-300 ${
                                                    isActive
                                                        ? "bg-blue-800 text-white shadow-md ring-2 ring-blue-600/30 scale-105"
                                                        : isPast
                                                        ? "text-slate-700 bg-slate-100 hover:bg-slate-200"
                                                        : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                                                }`}
                                            >
                                                {y}
                                                <div
                                                    className={`absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all ${
                                                        isActive
                                                            ? "bg-white"
                                                            : isPast
                                                            ? "bg-blue-400"
                                                            : "bg-transparent"
                                                    }`}
                                                />
                                            </button>
                                        );
                                    })}
                                </div>
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

                        {/* Bottom-Left Quick GIS Toolbar (Leaflet 2D only) */}
                        {(!is3DMode || activeLayer !== "diversity") && (
                            <>
                                <div className="absolute bottom-6 left-6 z-[600] flex items-center gap-2 transition-all duration-300">
                                    <div className="relative">
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

                                <div className="absolute bottom-1.5 left-6 z-[400] pointer-events-none text-[9px] font-mono text-slate-600 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-md border border-slate-200/50 shadow-xs flex items-center gap-1.5">
                                    <span className="font-bold text-blue-700">Z{mapZoom}</span>
                                    <span className="text-slate-300">·</span>
                                    <span>13.8450° N, 121.2060° E</span>
                                </div>
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
                                            {activeLayer === "status" ? `${displayTotal} Apps` : activeLayer === "trends" ? `Year ${year}` : activeLayer === "diversity" ? `${Number(overallDiversity?.score ?? 0).toFixed(2)} Mix` : "CLUP 2030"}
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
                            className={`absolute right-4 top-4 bottom-4 w-full sm:w-[320px] lg:w-[350px] xl:w-[375px] max-w-[calc(100vw-2rem)] z-[500] bg-white/98 backdrop-blur-2xl shadow-2xl border border-slate-200/90 rounded-3xl flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                                rightPanelOpen ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)] pointer-events-none"
                            }`}
                        >
                            <button
                                onClick={() => setRightPanelOpen(!rightPanelOpen)}
                                className="absolute top-6 -left-10 w-10 h-11 bg-white/95 backdrop-blur-xl border-l border-y border-slate-200/80 shadow-lg text-slate-600 hover:text-blue-700 rounded-l-2xl flex items-center justify-center transition-all focus:outline-none z-10 pointer-events-auto"
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

                            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/70">
                                {activeLayer === "status" && (
                                    <StatusPanel
                                        total={displayTotal}
                                        thisMonth={displayThisMonth}
                                        review={displayReview}
                                        released={displayReleased}
                                        processingPct={processingPct}
                                        reviewPct={reviewPct}
                                        releasedPct={releasedPct}
                                        recent={recent || []}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        bgyStats={bgyStats}
                                        statusMap={statusMap}
                                        statusFilter={statusFilter}
                                        onStatusFilterChange={handleStatusFilterChange}
                                        searchQuery={statusSearchQuery}
                                        onSearchQueryChange={setStatusSearchQuery}
                                        hoveredAppId={hoveredAppId}
                                        onHoverApp={setHoveredAppId}
                                        onSelectApp={handleSelectApp}
                                        onLocateApp={handleLocateApp}
                                    />
                                )}

                                {activeLayer === "trends" && (
                                    <TrendsPanel
                                        urbanGrowthData={urbanGrowthData}
                                        landUseData={landUseData}
                                        hotspots={hotspots}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        onLocateEstablishment={handleLocateEstablishment}
                                        year={year}
                                    />
                                )}

                                {activeLayer === "diversity" && (
                                    <DiversityPanel
                                        donutLoaded={donutLoaded}
                                        overallDiversity={overallDiversity}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                        bgyStats={bgyStats}
                                        diversityTierFilter={diversityTierFilter}
                                        onSelectDiversityTier={setDiversityTierFilter}
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