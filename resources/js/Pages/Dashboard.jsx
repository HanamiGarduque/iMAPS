import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import StatusPanel from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";
import ZoningPanel from "@/Components/MapLayers/ZoningPanel";
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
    const appFilterRef = useRef(appTypeFilter);
    const yearRef = useRef(year);

    useEffect(() => { layerRef.current = currentLayer; }, [currentLayer]);
    useEffect(() => { opacityRef.current = clupOpacity; }, [clupOpacity]);
    useEffect(() => { appFilterRef.current = appTypeFilter; }, [appTypeFilter]);
    useEffect(() => { yearRef.current = year; }, [year]);

    useEffect(() => {
        if (searchTargetBgy && geoLayerRef.current && mapInstanceRef.current) {
            let exactMatch = null;
            let partialMatch = null;

            geoLayerRef.current.eachLayer((l) => {
                const props = l.feature?.properties || {};
                const name = (
                    props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || ""
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
                    padding: [60, 60],
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
                    fillOpacity: layerRef.current === "diversity" ? 0 : 0.85,
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

    const getFeatureStyle = (feature, layer, filter, currentYear) => {
        const props = feature.properties || {};
        const name = (
            props.LOCATION || props.location || props.ADM4_EN || props.name || props.NAME || props.BRGY || props.brgy || ""
        ).trim();
        const bgyData = staticBgyData[name] || { total: 0, landUse: "Residential", diversity: 0.5 };
        const temporalData = getTemporalData(bgyData, name, currentYear);

        const activeTotal = bgyData.total || 0;
        const baseStyle = { color: "#2563eb", weight: 1.2, opacity: 0.9 };

        if (layer === "zoning" || layer === "diversity") {
            return { color: "#1e3a8a", weight: 1.2, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
        }

        if (layer === "status") {
            return { ...baseStyle, fillColor: statusColor(activeTotal), fillOpacity: activeTotal > 0 ? 0.35 : 0.15 };
        }

        if (layer === "trends") {
            const lu = landUseColors[temporalData.landUse] || landUseColors["Residential"];
            return { ...baseStyle, fillColor: lu.fill, fillOpacity: 0.55 };
        }

        return { ...baseStyle, fillColor: "transparent", fillOpacity: 0, opacity: 0.8 };
    };

    useEffect(() => {
        if (mapInstanceRef.current) return;

        import("leaflet").then((L) => {
            import("leaflet/dist/leaflet.css");

            const map = L.default.map(mapRef.current, {
                center: [13.8450, 121.2060],
                zoom: 13,
                minZoom: 12,
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
                            const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                            const zoneCode = String(rawZone).trim();
                            const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];
                            const isZoningActive = layerRef.current === "zoning";
                            const isDiversityActive = layerRef.current === "diversity";
                            const isLandUsePlanVisible = isZoningActive || isDiversityActive;

                            return {
                                color: colorConfig.stroke,
                                weight: 1.5,
                                fillColor: colorConfig.fill,
                                fillOpacity: isDiversityActive ? 1.0 : (isZoningActive ? opacityRef.current : 0),
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
                                    if (activeFeatureRef.current && geoLayerRef.current) {
                                        geoLayerRef.current.resetStyle(activeFeatureRef.current);
                                    }
                                    activeFeatureRef.current = layer_feature;

                                    if (mapInstanceRef.current) {
                                        mapInstanceRef.current.flyToBounds(layer_feature.getBounds(), {
                                            padding: [60, 60],
                                            maxZoom: 16,
                                            duration: 1.0,
                                        });
                                    }

                                    const currentLayerMode = layerRef.current;
                                    
                                    if (currentLayerMode === "status") {
                                        layer_feature.setStyle({ weight: 2.5, color: "#1e3a8a", fillColor: "#2563eb", fillOpacity: 0.5 });
                                    } else if (currentLayerMode === "diversity") {
                                        layer_feature.setStyle({ weight: 3, color: "#9333ea", fillColor: "transparent", fillOpacity: 0 });
                                    } else if (currentLayerMode === "trends") {
                                        layer_feature.setStyle({ weight: 3, color: "#16a34a", fillOpacity: 0.65 });
                                    }

                                    if (onFeatureClick) onFeatureClick(name, bgyData);
                                });

                                layer_feature.on("mouseover", () => {
                                    layer_feature
                                        .bindTooltip(name, {
                                            permanent: false,
                                            direction: "center",
                                            className: "font-sans text-xs font-bold bg-white/95 text-slate-800 border border-slate-200 shadow-xl px-3 py-1.5 rounded-xl backdrop-blur-md",
                                        })
                                        .openTooltip();

                                    if (activeFeatureRef.current !== layer_feature) {
                                        const hoverOpacity = layerRef.current === "diversity" ? 0 : 0.45;
                                        layer_feature.setStyle({ fillOpacity: hoverOpacity, weight: 2 });
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
        if (mapInstanceRef.current && rosarioBoundsRef.current && (currentLayer === "zoning" || currentLayer === "diversity")) {
            mapInstanceRef.current.flyToBounds(rosarioBoundsRef.current, {
                padding: [5, 5],
                duration: 0.8,
            });
        }
    }, [currentLayer]);

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
        const isDiversityActive = currentLayer === "diversity";
        const isLandUsePlanVisible = isZoningActive || isDiversityActive;

        if (zoningLayerRef.current) {
            zoningLayerRef.current.setStyle((feature) => {
                const props = feature.properties || {};
                const rawZone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "DEFAULT";
                const zoneCode = String(rawZone).trim();
                const colorConfig = zoningPlanColors[zoneCode] || zoningPlanColors["DEFAULT"];

                return {
                    color: colorConfig.stroke,
                    weight: 1.5,
                    fillColor: colorConfig.fill,
                    fillOpacity: isDiversityActive ? 1.0 : (isZoningActive ? clupOpacity : 0),
                    opacity: isLandUsePlanVisible ? 0.9 : 0
                };
            });
        }

        if (clupTileLayerRef.current) {
            clupTileLayerRef.current.setOpacity(clupOpacity);
        }

        if (isLandUsePlanVisible) {
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
    }, [currentLayer, appTypeFilter, year, clupOpacity, staticBgyData]);

    return <div ref={mapRef} id="map" className="absolute inset-0 z-0" />;
}

export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats, recent, filters, overallDiversity }) {
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

    const displayRecent = useMemo(() => {
        const list = Array.isArray(recent) ? recent : [];
        if (isBgyActive && selectedBgy?.name) {
            return list.filter((r) => (r.barangay || "").trim().toLowerCase() === selectedBgy.name.trim().toLowerCase()).slice(0, 5);
        }
        return list.slice(0, 5);
    }, [recent, isBgyActive, selectedBgy]);

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
        } else {
            setDonutLoaded(false);
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

                        <MapLegend activeLayer={activeLayer} year={year} />

                        {/* Top-Left Mode Selector */}
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

                        {/* Status Mode: Bottom Filter Bar */}
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
                                        onClick={() => handleAppTypeChange(type.id)}
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

                        {/* Bottom-Left Quick GIS Toolbar */}
                        <div className="absolute bottom-6 left-6 z-[600] flex items-center gap-2">
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
                                            {activeLayer === "status" ? `${displayTotal} Apps` : activeLayer === "trends" ? `Year ${year}` : activeLayer === "diversity" ? "0.78 Mix" : "CLUP 2030"}
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
                                        recent={displayRecent}
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
                                    <DiversityPanel 
                                        donutLoaded={donutLoaded} 
                                        overallDiversity={overallDiversity}
                                        selectedBgy={selectedBgy}
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
        </>
    );
}