import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import StatusPanel from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import MapLegend from "@/Components/MapLayers/MapLegend";

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

// ── CLUP Categorized Classification Map ──
const ZONING_CATEGORIES = [
    {
        name: "Residential Zones",
        color: "#22c55e",
        items: [
            { code: "R1-Z", label: "Low Density Residential", color: "#22c55e" },
            { code: "R2-Z", label: "Medium Density Residential", color: "#4ade80" },
            { code: "MR2-SZ", label: "Medium-Rise Residential", color: "#86efac" },
            { code: "BR2-SZ", label: "Basic Residential Sub-Zone", color: "#bbf7d0" },
        ]
    },
    {
        name: "Commercial Zones",
        color: "#f59e0b",
        items: [
            { code: "C1-Z", label: "Commercial 1 (Neighborhood)", color: "#fcd34d" },
            { code: "C2-Z", label: "Commercial 2 (Central Business)", color: "#f59e0b" },
            { code: "C/MP-Z", label: "Commercial / Multi-Purpose", color: "#d97706" },
        ]
    },
    {
        name: "Industrial & Agro-Industrial",
        color: "#ef4444",
        items: [
            { code: "I1-Z", label: "Light Industrial", color: "#fca5a5" },
            { code: "I2-Z", label: "Medium Industrial", color: "#ef4444" },
            { code: "I3-Z", label: "Heavy Industrial", color: "#b91c1c" },
            { code: "AgIndZ", label: "Agro-Industrial Zone", color: "#a78bfa" },
            { code: "AgIndZ-PTR", label: "Agro-Industrial Processing", color: "#8b5cf6" },
            { code: "AgIndZ-PGR", label: "Agro-Industrial Grazing", color: "#7c3aed" },
        ]
    },
    {
        name: "Agricultural Sub-Zones",
        color: "#84cc16",
        items: [
            { code: "PDA-SZ", label: "Production Agricultural", color: "#84cc16" },
            { code: "PTA-SZ-RA", label: "Protected Agricultural Area", color: "#a3e635" },
            { code: "5491-APDA-SZ", label: "Special Agricultural Zone", color: "#bef264" },
        ]
    },
    {
        name: "Institutional & Utilities",
        color: "#3b82f6",
        items: [
            { code: "GI-Z", label: "General Institutional", color: "#3b82f6" },
            { code: "UTS-Z", label: "Utilities & Transportation", color: "#06b6d4" },
            { code: "CMRF", label: "Cemetery / Waste Facility", color: "#0ea5e9" },
        ]
    },
    {
        name: "Forest, Parks & Water",
        color: "#15803d",
        items: [
            { code: "FZ", label: "Forest Zone", color: "#15803d" },
            { code: "FR-SZ", label: "Forest Reserve Sub-Zone", color: "#166534" },
            { code: "PR-Z", label: "Parks & Recreation", color: "#10b981" },
            { code: "WZ", label: "Water Zone / River Corridor", color: "#38bdf8" },
        ]
    },
    {
        name: "Special & Tourism",
        color: "#f472b6",
        items: [
            { code: "T-Z", label: "Tourism Zone", color: "#f472b6" },
            { code: "ECT-Z", label: "Eco-Tourism Zone", color: "#fb7185" },
            { code: "THSP-SZ", label: "Heritage & Special Purpose", color: "#fda4af" },
        ]
    },
    {
        name: "Roads & Infrastructure",
        color: "#64748b",
        items: [
            { code: "ROAD", label: "Existing Road Network", color: "#64748b" },
            { code: "PROPOSED ROAD", label: "Proposed Road Corridor", color: "#94a3b8" },
        ]
    }
];

// ── Realistic Temporal Data Engine (Rosario, Batangas) ──
const getTemporalData = (baseData, name, year) => {
    const urbanCore = ["Poblacion A", "Poblacion B", "Poblacion C", "Poblacion D", "Poblacion E", "Poblacion", "San Roque", "Namunga", "Quilib"];
    const industrialCorridor = ["San Carlos", "Bagong Pook", "San Jose", "Inica", "Cahigam", "Calantas"];
    const residentialSprawl = ["Itlugan", "Masaya", "Bayawang", "Pinagsibaan", "Antipolo", "Bulihan", "Maligaya"];

    let currentLandUse = baseData?.landUse;
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

    const newTotal = Math.max(1, Math.floor(data.total + yearDiff * growthRate));

    return {
        ...data,
        total: newTotal,
        review: Math.floor(newTotal * 0.2),
        released: Math.floor(newTotal * 0.7),
        landUse: currentLandUse,
        diversity: Math.min(0.95, (data.diversity || 0.4) + yearDiff * 0.05),
    };
};

// ── Leaflet Map Component ──
function LeafletMap({
    bgyStats,
    currentLayer,
    mapStyle,
    onFeatureClick,
    onMapClick,
    appTypeFilter,
    year,
    mapZoom,
    onZoomChange,
    clupOpacity = 0.85,
    resetTrigger,
    searchTargetBgy,
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null);
    const geoLayerRef = useRef(null);
    const zoningLayerRef = useRef(null);
    const rosarioBoundsRef = useRef(null);
    const activeFeatureRef = useRef(null);

    const layerRef = useRef(currentLayer);
    const opacityRef = useRef(clupOpacity);

    useEffect(() => {
        layerRef.current = currentLayer;
    }, [currentLayer]);

    useEffect(() => {
        opacityRef.current = clupOpacity;
    }, [clupOpacity]);

    // Live search fly-to listener with exact-match priority
    useEffect(() => {
        if (searchTargetBgy && geoLayerRef.current && mapInstanceRef.current) {
            let exactMatch = null;
            let partialMatch = null;

            geoLayerRef.current.eachLayer((l) => {
                const props = l.feature?.properties || {};
                const name = (
                    props.LOCATION ||
                    props.location ||
                    props.ADM4_EN ||
                    props.name ||
                    props.NAME ||
                    props.BRGY ||
                    props.brgy ||
                    ""
                ).trim();

                if (name.toLowerCase() === searchTargetBgy.toLowerCase()) {
                    exactMatch = l;
                } else if (!partialMatch && (searchTargetBgy.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(searchTargetBgy.toLowerCase()))) {
                    partialMatch = l;
                }
            });

            const foundLayer = exactMatch || partialMatch;

            if (foundLayer) {
                const bounds = foundLayer.getBounds();
                mapInstanceRef.current.flyToBounds(bounds, {
                    padding: [80, 80],
                    maxZoom: 16,
                    duration: 1.2,
                });
                if (activeFeatureRef.current && geoLayerRef.current) {
                    geoLayerRef.current.resetStyle(activeFeatureRef.current);
                }
                activeFeatureRef.current = foundLayer;
                foundLayer.setStyle({
                    weight: 3.5,
                    color: "#2563eb",
                    fillOpacity: 0.85,
                    dashArray: "",
                });
                foundLayer.bringToFront();
            }
        }
    }, [searchTargetBgy]);

    const staticBgyData = useMemo(() => {
        const map = {};
        Object.entries(bgyStats ?? {}).forEach(([name, stat]) => {
            map[name] = {
                total: stat.Total ?? 0,
                review: stat["Technical Review"] ?? 0,
                released: stat.Released ?? 0,
                landUse: "Residential",
                diversity: 0.5,
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
        "R1-Z": { fill: "#22c55e", stroke: "#16a34a" },
        "R2-Z": { fill: "#4ade80", stroke: "#22c55e" },
        "MR2-SZ": { fill: "#86efac", stroke: "#4ade80" },
        "BR2-SZ": { fill: "#bbf7d0", stroke: "#86efac" },
        "C1-Z": { fill: "#fcd34d", stroke: "#fbbf24" },
        "C2-Z": { fill: "#f59e0b", stroke: "#d97706" },
        "C/MP-Z": { fill: "#d97706", stroke: "#b45309" },
        "I1-Z": { fill: "#fca5a5", stroke: "#f87171" },
        "I2-Z": { fill: "#ef4444", stroke: "#dc2626" },
        "I3-Z": { fill: "#b91c1c", stroke: "#991b1b" },
        "AgIndZ": { fill: "#a78bfa", stroke: "#8b5cf6" },
        "AgIndZ-PTR": { fill: "#8b5cf6", stroke: "#7c3aed" },
        "AgIndZ-PGR": { fill: "#7c3aed", stroke: "#6d28d9" },
        "PDA-SZ": { fill: "#84cc16", stroke: "#65a30d" },
        "PTA-SZ-RA": { fill: "#a3e635", stroke: "#84cc16" },
        "5491-APDA-SZ": { fill: "#bef264", stroke: "#a3e635" },
        "FZ": { fill: "#15803d", stroke: "#166534" },
        "FR-SZ": { fill: "#166534", stroke: "#14532d" },
        "GI-Z": { fill: "#3b82f6", stroke: "#2563eb" },
        "UTS-Z": { fill: "#06b6d4", stroke: "#0891b2" },
        "CMRF": { fill: "#0ea5e9", stroke: "#0284c7" },
        "PR-Z": { fill: "#10b981", stroke: "#059669" },
        "T-Z": { fill: "#f472b6", stroke: "#db2777" },
        "ECT-Z": { fill: "#fb7185", stroke: "#e11d48" },
        "THSP-SZ": { fill: "#fda4af", stroke: "#f43f5e" },
        "WZ": { fill: "#38bdf8", stroke: "#0284c7" },
        "ROAD": { fill: "#64748b", stroke: "#475569" },
        "PROPOSED ROAD": { fill: "#94a3b8", stroke: "#64748b" },
        "DEFAULT": { fill: "#cbd5e1", stroke: "#94a3b8" }
    };

    const diversityColor = (score) => {
        const v = Math.round(255 - score * 180);
        return `rgba(${v},${v},${v})`;
    };

    const getFeatureStyle = (feature, layer, filter, currentYear) => {
        const props = feature.properties || {};
        const name = (
            props.LOCATION ||
            props.location ||
            props.ADM4_EN ||
            props.name ||
            props.NAME ||
            props.BRGY ||
            props.brgy ||
            ""
        ).trim();
        const temporalData = getTemporalData(staticBgyData[name], name, currentYear);

        const multipliers = {
            "Zoning Certificate": 1,
            "Locational Clearance": 0.4,
            "Development Permit": 0.8,
        };

        const simulatedTotal = Math.max(1, Math.floor(temporalData.total * (multipliers[filter] || 1)));
        const baseStyle = { color: "#2563eb", weight: 1.2, opacity: 0.9 };

        if (layer === "zoning") {
            return { color: "#1e3a8a", weight: 1.2, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
        }

        if (layer === "status") {
            return { ...baseStyle, fillColor: statusColor(simulatedTotal), fillOpacity: 0.25 };
        }

        if (layer === "trends") {
            const lu = landUseColors[temporalData.landUse] || landUseColors["Residential"];
            return { ...baseStyle, fillColor: lu.fill, fillOpacity: 0.55 };
        }

        return { ...baseStyle, fillColor: diversityColor(temporalData.diversity), fillOpacity: 0.35 };
    };

    
    // ── Dynamic Popup HTML Builder ──
const buildPopupHtml = (name, rawData, currentLayerMode, currentYear, filter) => {
    const temporalData = getTemporalData(rawData, name, currentYear);

    // Apply the same multipliers used for coloring
    const multipliers = {
        "Zoning Certificate": 1,
        "Locational Clearance": 0.4,
        "Development Permit": 0.8,
    };
    const simulatedTotal = Math.max(1, Math.floor(temporalData.total * (multipliers[filter] || 1)));
    const simReview = Math.floor(simulatedTotal * 0.2);
    const simReleased = Math.floor(simulatedTotal * 0.7);

    let dynamicBody = "";

    if (currentLayerMode === "status") {
        dynamicBody = `
        <div class="grid grid-cols-3 gap-1.5 text-center">
            <div class="bg-slate-50 rounded-xl py-2 px-1 border border-slate-200 shadow-sm"><span class="text-[8px] font-bold text-slate-500 uppercase tracking-wider block">Total</span><span class="text-base font-black text-slate-800 font-mono">${simulatedTotal}</span></div>
            <div class="bg-amber-50 rounded-xl py-2 px-1 border border-amber-200 shadow-sm"><span class="text-[8px] font-bold text-amber-700 uppercase tracking-wider block">Review</span><span class="text-base font-black text-amber-700 font-mono">${simReview}</span></div>
            <div class="bg-emerald-50 rounded-xl py-2 px-1 border border-emerald-200 shadow-sm"><span class="text-[8px] font-bold text-emerald-700 uppercase tracking-wider block">Released</span><span class="text-base font-black text-emerald-700 font-mono">${simReleased}</span></div>
        </div>`;
    } else if (currentLayerMode === "trends") {
        dynamicBody = `
        <div class="bg-indigo-50 border border-indigo-100 rounded-xl p-2.5 flex items-center justify-between shadow-sm">
            <span class="text-[10px] font-bold text-indigo-800 uppercase tracking-wider">Year ${currentYear}</span>
            <span class="text-xs font-black text-indigo-900 bg-indigo-200/50 px-2 py-0.5 rounded-md border border-indigo-200">${temporalData.landUse}</span>
        </div>`;
    } else if (currentLayerMode === "diversity") {
        const pct = Math.round(temporalData.diversity * 100);
        dynamicBody = `
        <div class="bg-purple-50 border border-purple-100 rounded-xl p-2.5 shadow-sm">
            <div class="flex items-end justify-between mb-1.5">
                <span class="text-[10px] font-bold text-purple-800 uppercase tracking-wider">Mix Score</span>
                <span class="text-sm font-black text-purple-900 font-mono">${pct}%</span>
            </div>
            <div class="w-full h-1.5 bg-purple-200/50 rounded-full overflow-hidden">
                <div class="h-full bg-gradient-to-r from-purple-400 to-indigo-500 rounded-full" style="width: ${pct}%"></div>
            </div>
        </div>`;
    } else {
        dynamicBody = `
        <div class="bg-blue-50 border border-blue-100 rounded-xl p-2.5 shadow-sm">
            <div class="flex items-center gap-1.5 mb-1">
                <svg class="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.963 11.963 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                <span class="text-[10px] font-bold text-blue-900 uppercase tracking-wider">CLUP 2030 Context</span>
            </div>
            <p class="text-[10px] text-blue-800 leading-tight mt-1">Refer to active map overlay for official zoning bounds.</p>
        </div>`;
    }

    return `
    <div class="min-w-[240px] font-sans p-1">
        <div class="mb-3 pb-2.5 border-b border-slate-100 flex items-center justify-between">
            <div>
                <h2 class="text-base font-black text-slate-900 tracking-tight flex items-center gap-1.5">${name}</h2>
                <p class="text-[9px] text-blue-700 font-bold uppercase tracking-widest mt-0.5">Barangay Overview</p>
            </div>
            ${currentLayerMode !== 'trends' ? `<span class="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">${temporalData.landUse}</span>` : ''}
        </div>
        ${dynamicBody}
    </div>
    `;
};

    // Initialize Leaflet Map
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
                maxBoundsViscosity: 1.0,
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

            // Fetch Boundary and Land Use layers concurrently
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
                    map.setMaxBounds(rosarioBounds.pad(0.15));
                }

                if (landUseData && landUseData.features) {
                    zoningLayerRef.current = L.default.geoJSON(landUseData, {
                        style: (feature) => {
                            const props = feature.properties || {};
                            const zoneCode = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                            const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];
                            const isZoningActive = layerRef.current === "zoning";

                            return {
                                color: colorConfig.stroke,
                                weight: 1.5,
                                fillColor: colorConfig.fill,
                                fillOpacity: isZoningActive ? opacityRef.current : 0,
                                opacity: isZoningActive ? 0.9 : 0
                            };
                        },
                        onEachFeature: (feature, layer_feature) => {
                            const props = feature.properties || {};
                            const zone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "N/A";
                            const location = props.location || props.LOCATION || props.brgy || "Unknown";

                            layer_feature.bindPopup(`
                                <div class="font-sans min-w-[210px] p-1">
                                    <div class="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                                        <span class="w-2 h-2 rounded-full bg-blue-600"></span>
                                        <h3 class="font-bold text-slate-800 text-xs uppercase tracking-wider">CLUP Classification</h3>
                                    </div>
                                    <div class="mt-2 space-y-1 text-xs">
                                        <p class="text-slate-600">Location: <b class="text-slate-800">${location}</b></p>
                                        <p class="text-slate-600">Zone Code: <span class="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">${zone}</span></p>
                                    </div>
                                </div>
                            `);
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
                                    props.LOCATION ||
                                    props.location ||
                                    props.ADM4_EN ||
                                    props.name ||
                                    props.NAME ||
                                    props.BRGY ||
                                    props.brgy ||
                                    "Unknown"
                                ).trim();

                                const bgyData = staticBgyData[name] || {
                                    total: 0,
                                    review: 0,
                                    released: 0,
                                    landUse: "Residential",
                                    diversity: 0.5,
                                };

                                layer_feature.bindPopup(buildPopupHtml(name, bgyData, layerRef.current, year, appTypeFilter), {
    className: "custom-bgy-popup",
    closeButton: true,
    autoPanPadding: [50, 50],
});

                                layer_feature.on("click", (e) => {
                                    L.default.DomEvent.stopPropagation(e);
                                    if (activeFeatureRef.current && geoLayerRef.current) {
                                        geoLayerRef.current.resetStyle(activeFeatureRef.current);
                                    }
                                    activeFeatureRef.current = layer_feature;
                                    const currentLayerMode = layerRef.current;

                                    if (currentLayerMode === "zoning") return;

                                    if (currentLayerMode === "status") {
                                        layer_feature.setStyle({ weight: 2.5, color: "#1e3a8a", fillColor: "#2563eb", fillOpacity: 0.5 });
                                        if (onFeatureClick) onFeatureClick(name, bgyData);
                                    } else if (currentLayerMode === "diversity") {
                                        layer_feature.setStyle({ weight: 2.5, color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.5 });
                                    } else {
                                        const lu = landUseColors[bgyData.landUse] || landUseColors["Residential"];
                                        layer_feature.setStyle({ weight: 2.5, color: lu.stroke, fillColor: lu.fill, fillOpacity: 0.65 });
                                    }
                                });

                                layer_feature.on("mouseover", () => {
                                    if (layerRef.current === "zoning") return;
                                    layer_feature
                                        .bindTooltip(name, {
                                            permanent: false,
                                            direction: "center",
                                            className: "font-sans text-xs font-bold bg-white/95 text-slate-800 border border-slate-200 shadow-xl px-3 py-1.5 rounded-xl backdrop-blur-md",
                                        })
                                        .openTooltip();

                                    if (activeFeatureRef.current !== layer_feature) {
                                        layer_feature.setStyle({ fillOpacity: 0.45, weight: 2 });
                                    }
                                });

                                layer_feature.on("mouseout", () => {
                                    if (layerRef.current === "zoning") return;
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

    // Auto-zoom closer when switching to the CLUP Zoning layer
    useEffect(() => {
        if (mapInstanceRef.current && rosarioBoundsRef.current && currentLayer === "zoning") {
            mapInstanceRef.current.flyToBounds(rosarioBoundsRef.current, {
                padding: [5, 5], // Tighter padding brings the zoom level closer (e.g., to Z12)
                duration: 0.8,   // Smooth camera animation
            });
        }
    }, [currentLayer]);
    // Sync Zoom slider
    useEffect(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.getZoom() !== mapZoom) {
            mapInstanceRef.current.setZoom(mapZoom);
        }
    }, [mapZoom]);

    // Handle Reset Camera Trigger
    useEffect(() => {
        if (!mapInstanceRef.current || resetTrigger === 0) return;
        if (rosarioBoundsRef.current) {
            mapInstanceRef.current.fitBounds(rosarioBoundsRef.current, { padding: [30, 30] });
        } else {
            mapInstanceRef.current.setView([13.8450, 121.2060], 13);
        }
    }, [resetTrigger]);

    // Switch Base Map Style
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

    // Update GeoJSON & CLUP layers on activeLayer / filters / opacity change
    useEffect(() => {
        if (geoLayerRef.current) {
        geoLayerRef.current.eachLayer((layer_feature) => {
                    const props = layer_feature.feature.properties || {};
                    const name = (props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || "Unknown").trim();
                    const bgyData = staticBgyData[name] || { total: 0, review: 0, released: 0, landUse: "Residential", diversity: 0.5 };
                    
                    layer_feature.setPopupContent(buildPopupHtml(name, bgyData, currentLayer, year, appTypeFilter));
                });
                    if (activeFeatureRef.current) activeFeatureRef.current = null;
        }

        if (zoningLayerRef.current) {
            zoningLayerRef.current.setStyle((feature) => {
                const props = feature.properties || {};
                const zoneCode = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];
                const isZoningActive = currentLayer === "zoning";
                return {
                    color: colorConfig.stroke,
                    weight: 1.5,
                    fillColor: colorConfig.fill,
                    fillOpacity: isZoningActive ? clupOpacity : 0,
                    opacity: isZoningActive ? 0.9 : 0
                };
            });
        }

        if (clupTileLayerRef.current) {
            clupTileLayerRef.current.setOpacity(clupOpacity);
        }

        if (currentLayer === "zoning") {
            if (clupTileLayerRef.current && mapInstanceRef.current && !mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
                mapInstanceRef.current.addLayer(clupTileLayerRef.current);
            }
            if (zoningLayerRef.current) zoningLayerRef.current.bringToFront();
            if (geoLayerRef.current) geoLayerRef.current.bringToFront();
        } else {
            if (clupTileLayerRef.current && mapInstanceRef.current && mapInstanceRef.current.hasLayer(clupTileLayerRef.current)) {
                mapInstanceRef.current.removeLayer(clupTileLayerRef.current);
            }
        }
    }, [currentLayer, appTypeFilter, year, clupOpacity]);

    return <div ref={mapRef} id="map" className="absolute inset-0 z-0" />;
}

export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats, recent }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("standard");
    const [stylePopupOpen, setStylePopupOpen] = useState(false);
    const [appTypeFilter, setAppTypeFilter] = useState("Zoning Certificate");
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
    const [zoningSearch, setZoningSearch] = useState("");

    const review = statusMap?.["Technical Review"] ?? 0;
    const released = statusMap?.["Released"] ?? 0;
    const safeTotal = total || 1;
    const processingPct = Math.round(((safeTotal - review - released) / safeTotal) * 100);
    const reviewPct = Math.round((review / safeTotal) * 100);
    const releasedPct = Math.round((released / safeTotal) * 100);

    // Welcome Toast
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

    // Live Clock
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

    // Time-Machine Auto Playback Engine
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

    // Layer Switch Reset
    useEffect(() => {
        if (activeLayer === "diversity") {
            setTimeout(() => setDonutLoaded(true), 150);
        } else {
            setDonutLoaded(false);
        }
        if (activeLayer !== "status") {
            setSelectedBgy(null);
        }
    }, [activeLayer]);

    const [searchTargetBgy, setSearchTargetBgy] = useState(null);

    const handleSelectLocation = (loc) => {
        if (!loc || !loc.label) return;
        setSearchTargetBgy(loc.label);
        const data = bgyStats[loc.label] || { total: 0 };
        setSelectedBgy({ name: loc.label, data });
        setRightPanelOpen(true);
    };

    // Keyboard Shortcuts (1-4 for Layers, Escape to clear selection, I to toggle drawer, F for fullscreen)
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
            if (e.key === '1') { e.preventDefault(); setActiveLayer('status'); }
            if (e.key === '2') { e.preventDefault(); setActiveLayer('trends'); }
            if (e.key === '3') { e.preventDefault(); setActiveLayer('diversity'); }
            if (e.key === '4') { e.preventDefault(); setActiveLayer('zoning'); }
            if (e.key.toLowerCase() === 'i') { e.preventDefault(); setRightPanelOpen((prev) => !prev); }
            if (e.key.toLowerCase() === 'f') {
                e.preventDefault();
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => {});
                } else {
                    document.exitFullscreen().catch(() => {});
                }
            }
            if (e.key === 'Escape' && !sidebarOpen) {
                setSelectedBgy(null);
                setStylePopupOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
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
            label: "Spatial Distribution",
            title: "Application Density",
            desc: "Active zoning & clearance workload per barangay",
            gradient: "from-blue-900 to-indigo-950",
            icon: (
                <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
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

    // Filtered Zoning categories
    const [selectedZoningTab, setSelectedZoningTab] = useState('All');

    const filteredZoningCategories = useMemo(() => {
        let cats = ZONING_CATEGORIES;
        if (selectedZoningTab !== 'All') {
            cats = cats.filter(cat => cat.name.toLowerCase().includes(selectedZoningTab.toLowerCase()));
        }
        if (!zoningSearch.trim()) return cats;
        const q = zoningSearch.toLowerCase();
        return cats.map((cat) => ({
            ...cat,
            items: cat.items.filter(
                (it) => it.code.toLowerCase().includes(q) || it.label.toLowerCase().includes(q)
            ),
        })).filter((cat) => cat.items.length > 0);
    }, [zoningSearch, selectedZoningTab]);

    return (
        <>
            <Head title="GIS Spatial Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Plus Jakarta Sans', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'JetBrains Mono', monospace !important; }
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
            `}</style>

            <div id="dashboard-root" className="bg-slate-900 font-sans text-slate-800 h-screen flex flex-col overflow-hidden select-none">
                {/* Unified Header */}
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
                    {/* Collapsible Left Navigation Sidebar (Absolute overlay) */}
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="dashboard"
                    />

                    {/* Transparent Click-Outside Backdrop for Open Sidebar */}
                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                            title="Click to collapse sidebar"
                        />
                    )}

                    {/* Main Interactive Map Viewport (100% Full Bleed - Zero Sidebar disruption) */}
                    <main className="absolute inset-0 flex flex-col min-w-0 h-full overflow-hidden">
                        <LeafletMap
                            bgyStats={bgyStats}
                            currentLayer={activeLayer}
                            mapStyle={mapStyle}
                            appTypeFilter={appTypeFilter}
                            year={year}
                            mapZoom={mapZoom}
                            clupOpacity={clupOpacity}
                            resetTrigger={resetTrigger}
                            searchTargetBgy={searchTargetBgy}
                            onZoomChange={setMapZoom}
                            onFeatureClick={(name, data) => {
                                setSelectedBgy({ name, data });
                                if (!rightPanelOpen) setRightPanelOpen(true);
                            }}
                            onMapClick={() => setSelectedBgy(null)}
                        />

                        {/* Interactive Floating Map Legend for Active Layer */}
                        <MapLegend activeLayer={activeLayer} year={year} />

                        {/* ── TOP-LEFT FLOATING LAYER DOCK ── */}
                        <div className="absolute top-4 left-4 z-[600] pointer-events-auto">
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
                                            onClick={() => {
                                                setActiveLayer(item.id);
                                            }}
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

                        {/* ── CONTEXTUAL BOTTOM CONTROLS ── */}

                        {/* 1. Status Mode: Application Type Filter Deck */}
                        <div
                            className={`absolute bottom-6 left-1/2 -translate-x-1/2 z-[600] flex items-center bg-white/90 backdrop-blur-xl p-1.5 rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.12)] border border-white/80 transition-all duration-500 ease-out ${
                                activeLayer === "status"
                                    ? "opacity-100 translate-y-0 scale-100 pointer-events-auto"
                                    : "opacity-0 translate-y-8 scale-95 pointer-events-none"
                            }`}
                        >
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
                                        onClick={() => setAppTypeFilter(type.id)}
                                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-300 ${
                                            isActive
                                                ? "text-blue-900 bg-blue-50 border border-blue-200/80 shadow-sm"
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

                        {/* 2. Trends Mode: Interactive Time-Machine Player */}
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
                                    Temporal Simulation Active · Year {year}
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

                        {/* 3. Zoning Mode: CLUP Overlay Opacity Controller */}
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

                        {/* ── DOCKED QUICK GIS TOOLBAR (BOTTOM RIGHT NEAR PANEL) ── */}
                        {/* ── BOTTOM-LEFT QUICK GIS TOOLBAR ── */}
                        <div className="absolute bottom-6 left-6 z-[600] flex items-center gap-2">
                            {/* Base Map Style Menu */}
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
                                                        <span
                                                            className={`text-xs font-bold ${
                                                                isSelected ? "text-blue-900" : "text-slate-800"
                                                            }`}
                                                        >
                                                            {item.label}
                                                        </span>
                                                        {isSelected && (
                                                            <span className="w-2 h-2 rounded-full bg-blue-600" />
                                                        )}
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

                            {/* Zoom In & Out Tools */}
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

                            {/* Center Rosario Tool */}
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

                            {/* Fullscreen Toggle Tool */}
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

                        {/* Unobtrusive Micro Coordinate HUD (Bottom Left subtle label) */}
                        <div className="absolute bottom-1.5 left-6 z-[400] pointer-events-none text-[9px] font-mono text-slate-600 bg-white/80 backdrop-blur-sm px-2 py-0.5 rounded-md border border-slate-200/50 shadow-xs flex items-center gap-1.5">
                            <span className="font-bold text-blue-700">Z{mapZoom}</span>
                            <span className="text-slate-300">·</span>
                            <span>13.8450° N, 121.2060° E</span>
                        </div>

                        {/* ── FLOATING RESTORE BUBBLE (Appears when Intelligence Panel is closed) ── */}
                        {!rightPanelOpen && (
                            <button
                                onClick={() => setRightPanelOpen(true)}
                                className="absolute top-4 right-4 z-[500] group flex items-center gap-2.5 p-1.5 pr-3.5 bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_12px_36px_rgba(0,0,0,0.15)] hover:shadow-2xl border border-white/80 hover:border-blue-200 transition-all duration-300 hover:scale-[1.03] animate-in fade-in slide-in-from-right-4 text-left"
                                title="Open Intelligence Panel"
                            >
                                {/* Dynamic Icon & Pulse Indicator */}
                                <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${rsConfig[activeLayer].gradient} text-white flex items-center justify-center shadow-md relative shrink-0`}>
                                    {rsConfig[activeLayer].icon}
                                    <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500 ring-2 ring-white" />
                                    </span>
                                </div>

                                {/* Informative Label */}
                                <div className="flex flex-col">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold uppercase tracking-widest text-blue-600">
                                            Intelligence Panel
                                        </span>
                                        <span className="text-[9px] font-mono font-bold bg-slate-100 group-hover:bg-blue-50 text-slate-600 group-hover:text-blue-700 px-1.5 py-0.2 rounded">
                                            {activeLayer === 'status' ? `${total} Apps` : activeLayer === 'trends' ? `Year ${year}` : activeLayer === 'diversity' ? '0.78 Mix' : 'CLUP 2030'}
                                        </span>
                                    </div>
                                    <span className="text-xs font-black text-slate-800 group-hover:text-blue-900 leading-tight">
                                        {rsConfig[activeLayer].title}
                                    </span>
                                </div>
                            </button>
                        )}

                        {/* ── COLLAPSIBLE RIGHT INTELLIGENCE PANEL ── */}
                        <div
                            id="right-sidebar"
                            className={`absolute right-4 top-4 bottom-4 w-full sm:w-[320px] lg:w-[350px] xl:w-[375px] max-w-[calc(100vw-2rem)] z-[500] bg-white/98 backdrop-blur-2xl shadow-2xl border border-slate-200/90 rounded-3xl flex flex-col overflow-hidden transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
                                rightPanelOpen ? "translate-x-0" : "translate-x-[calc(100%+1.5rem)] pointer-events-none"
                            }`}
                        >
                            {/* Collapse / Expand Tab */}
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

                            {/* Header with Dynamic Gradient Accent */}
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

                            {/* Scrollable Intelligence Content Body */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden bg-slate-50/70">
                                {activeLayer === "status" && (
                                    <StatusPanel
                                        total={total}
                                        thisMonth={thisMonth}
                                        review={review}
                                        released={released}
                                        processingPct={processingPct}
                                        reviewPct={reviewPct}
                                        releasedPct={releasedPct}
                                        recent={recent}
                                        selectedBgy={selectedBgy}
                                        onClearBgy={() => setSelectedBgy(null)}
                                    />
                                )}

                                {activeLayer === "trends" && (
                                    <TrendsPanel
                                        landUseData={landUseData}
                                        hotspots={hotspots}
                                        onSelectBgy={(name) => handleSelectLocation({ label: name })}
                                    />
                                )}

                                {activeLayer === "diversity" && (
                                    <DiversityPanel donutLoaded={donutLoaded} />
                                )}

                                {activeLayer === "zoning" && (
                                    <div className="p-3.5 space-y-3">
                                        {/* Search Filter for Zoning Legend */}
                                        <div className="relative">
                                            <svg
                                                className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                                fill="none"
                                                viewBox="0 0 24 24"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                            </svg>
                                            <input
                                                type="text"
                                                placeholder="Filter zone code or classification..."
                                                value={zoningSearch}
                                                onChange={(e) => setZoningSearch(e.target.value)}
                                                className="w-full bg-white border border-slate-200/80 rounded-xl pl-9 pr-8 py-2 text-xs font-medium placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm"
                                            />
                                            {zoningSearch && (
                                                <button
                                                    onClick={() => setZoningSearch("")}
                                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>

                                        {/* Quick Category Filter Chips */}
                                        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                                            {['All', 'Residential', 'Commercial', 'Industrial', 'Agricultural', 'Institutional', 'Special'].map((tab) => (
                                                <button
                                                    key={tab}
                                                    onClick={() => setSelectedZoningTab(tab)}
                                                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold whitespace-nowrap transition-all ${
                                                        selectedZoningTab === tab
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-white border border-slate-200/80 text-slate-600 hover:bg-slate-50'
                                                    }`}
                                                >
                                                    {tab}
                                                </button>
                                            ))}
                                        </div>

                                        {/* Categorized Zoning System List */}
                                        <div className="space-y-2.5">
                                            {filteredZoningCategories.length === 0 ? (
                                                <div className="py-6 text-center text-xs text-slate-400 bg-white rounded-2xl border border-slate-200/80">
                                                    No matching zoning classifications found.
                                                </div>
                                            ) : (
                                                filteredZoningCategories.map((category) => (
                                                    <div
                                                        key={category.name}
                                                        className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-sm"
                                                    >
                                                        <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                                                            <div className="flex items-center gap-2">
                                                                <span
                                                                    className="w-2.5 h-2.5 rounded-full"
                                                                    style={{ background: category.color }}
                                                                />
                                                                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                                                                    {category.name}
                                                                </h4>
                                                            </div>
                                                            <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-100 px-1.5 py-0.2 rounded">
                                                                {category.items.length}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {category.items.map((item) => (
                                                                <div
                                                                    key={item.code}
                                                                    className="flex items-center justify-between text-xs p-1.5 rounded-lg hover:bg-slate-50 transition-colors"
                                                                >
                                                                    <div className="flex items-center gap-2 min-w-0 pr-2">
                                                                        <span
                                                                            className="w-3.5 h-3.5 rounded-md shrink-0 shadow-sm border border-black/10"
                                                                            style={{ background: item.color }}
                                                                        />
                                                                        <span className="text-slate-700 font-medium truncate">
                                                                            {item.label}
                                                                        </span>
                                                                    </div>
                                                                    <span className="font-mono text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                                                        {item.code}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                    </main>
                </div>
            </div>
        </>
    );
}