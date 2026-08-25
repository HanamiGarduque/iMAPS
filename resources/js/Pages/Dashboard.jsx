import { useState, useEffect, useRef, useMemo } from "react";
import { Head, router } from "@inertiajs/react";
import { Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import StatusPanel from "@/Components/MapLayers/StatusPanel";
import TrendsPanel from "@/Components/MapLayers/TrendsPanel";
import DiversityPanel from "@/Components/MapLayers/DiversityPanel";

// ── Tile Layer Configuration ──
const TILE_PROVIDERS = {
    standard: {
        label: "Standard Street",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
    },
    satellite: {
        label: "Satellite",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community',
        maxZoom: 19,
    },
    hillshade: {
        label: "Terrain Hillshade",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Earthstar Geographics, etc.',
        maxZoom: 17,
    },
};

// ── Stat Bar Component ──
function StatBar({ label, pct, color, bg, count, iconColor }) {
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 150);
        return () => clearTimeout(t);
    }, [pct]);

    return (
        <div className={count !== undefined ? "mb-3.5" : "mb-0"}>
            <div className="flex justify-between items-center mb-1.5">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full inline-block shadow-sm" style={{ background: iconColor || color }} />
                    {label}
                </span>
                {count !== undefined ? (
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-mono text-slate-400">{count} records</span>
                        <span className="text-[11px] font-bold font-mono w-6 text-right" style={{ color }}>
                            {pct}%
                        </span>
                    </div>
                ) : (
                    <span className="text-[11px] font-bold font-mono text-slate-700">{pct}%</span>
                )}
            </div>
            <div className="stat-bar-track" style={{ background: bg || "#e8f0fe" }}>
                <div className="stat-bar-fill" style={{ width: width + "%", background: color }} />
            </div>
        </div>
    );
}

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

// ── Leaflet Map ──
function LeafletMap({ bgyStats, currentLayer, mapStyle, onFeatureClick, onMapClick, appTypeFilter, year, mapZoom, onZoomChange }) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null); // Added for Raster Tiles
    const geoLayerRef = useRef(null);
    const zoningLayerRef = useRef(null);
    const activeFeatureRef = useRef(null);

    const layerRef = useRef(currentLayer);

    useEffect(() => {
        layerRef.current = currentLayer;
    }, [currentLayer]);

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
        
        // Made base weight thinner
        const baseStyle = { color: "#2563eb", weight: 1, opacity: 1 };

        if (layer === "zoning") {
            return { color: "#1e3a8a", weight: 1, fillColor: "transparent", fillOpacity: 0, opacity: 1 };
        }

        if (layer === "status") {
            return { ...baseStyle, fillColor: statusColor(simulatedTotal), fillOpacity: 0.15 };
        }

        if (layer === "trends") {
            const lu = landUseColors[temporalData.landUse] || landUseColors["Residential"];
            return { ...baseStyle, fillColor: lu.fill, fillOpacity: 0.5 };
        }

        return { ...baseStyle, fillColor: diversityColor(temporalData.diversity), fillOpacity: 0.25, dashArray: null };
    };

    // Initialize Map
    useEffect(() => {
        if (mapInstanceRef.current) return;

        import("leaflet").then((L) => {
            import("leaflet/dist/leaflet.css");

            const map = L.default.map(mapRef.current, {
                center: [13.8450, 121.2060],
                zoom: 13,
                minZoom: 12,
                maxZoom: 18,
                zoomControl: false, // Default zoom control disabled
                scrollWheelZoom: true,
                maxBoundsViscosity: 1.0 
            });

            // Map interaction to sync external custom slider state
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
                opacity: 0.9,
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
                fetch("/api/map/rosario_boundary").then((r) => r.ok ? r.json() : null).catch(() => null),
                fetch("/api/map/barangay_boundary").then((r) => r.ok ? r.json() : null).catch(() => null),
            ])
            .then(([rosarioData, barangayData, landUseData]) => {
                if (rosarioData && rosarioData.features) {
                    const rosarioGeo = L.default.geoJSON(rosarioData, {
                        style: {
                            color: "#475569",
                            weight: 3,
                            fillColor: "transparent",
                            opacity: 1
                        },
                        interactive: false
                    }).addTo(map);
                    
                    const rosarioBounds = rosarioGeo.getBounds();
                    map.setMaxBounds(rosarioBounds.pad(0.1));
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
                                fillOpacity: isZoningActive ? 0.50 : 0, // Opacity is now 75%
                                opacity: isZoningActive ? 1 : 0
                            };
                        },
                        onEachFeature: (feature, layer_feature) => {
                            const props = feature.properties || {};
                            const zone = props.lup_2030 || props.LUP_2030 || props.zone_code || props.zone || props.landuse || props.luc || "N/A";
                            const location = props.location || props.LOCATION || props.brgy || "Unknown";

                            layer_feature.bindPopup(`
                                <div class="font-sans min-w-[200px]">
                                    <h3 class="font-bold text-blue-900 text-sm">Zoning Classification</h3>
                                    <p class="text-xs text-slate-600 mt-1">Location: <b>${location}</b></p>
                                    <p class="text-xs text-slate-600">Zone Code: <span class="font-mono font-bold text-blue-700">${zone}</span></p>
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

                                const popupContent = `
                                <div class="min-w-[260px] font-sans">
                                    <div class="mb-3 pb-3 border-b border-slate-100">
                                        <h2 class="text-xl font-black text-blue-900 tracking-tight flex items-center gap-2">
                                            ${name}
                                        </h2>
                                        <p class="text-[10px] text-slate-500 font-bold mt-1 uppercase tracking-widest">
                                            Zone Overview
                                        </p>
                                    </div>
                                    <div class="grid grid-cols-3 gap-2">
                                        <div class="flex flex-col items-center justify-center bg-white rounded-xl py-2 px-1 border border-slate-200 shadow-sm">
                                            <span class="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total</span>
                                            <span class="text-xl font-black text-slate-800 font-mono">${bgyData.total || 0}</span>
                                        </div>
                                        <div class="flex flex-col items-center justify-center bg-amber-50 rounded-xl py-2 px-1 border border-amber-200 shadow-sm">
                                            <span class="text-[9px] font-bold text-amber-600 uppercase tracking-wider">Review</span>
                                            <span class="text-xl font-black text-amber-600 font-mono">${bgyData.review || 0}</span>
                                        </div>
                                        <div class="flex flex-col items-center justify-center bg-emerald-50 rounded-xl py-2 px-1 border border-emerald-200 shadow-sm">
                                            <span class="text-[9px] font-bold text-emerald-600 uppercase tracking-wider">Released</span>
                                            <span class="text-xl font-black text-emerald-600 font-mono">${bgyData.released || 0}</span>
                                        </div>
                                    </div>
                                </div>
                            `;

                                layer_feature.bindPopup(popupContent, {
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
                                        layer_feature.setStyle({ weight: 2, color: "#1e3a8a", fillColor: "#2563eb", fillOpacity: 0.4 });
                                        if (onFeatureClick) onFeatureClick(name, bgyData);
                                    } else if (currentLayerMode === "diversity") {
                                        layer_feature.setStyle({ weight: 2, color: "#b91c1c", fillColor: "#ef4444", fillOpacity: 0.4 });
                                    } else {
                                        const lu = landUseColors[bgyData.landUse] || landUseColors["Residential"];
                                        layer_feature.setStyle({ weight: 2, color: lu.stroke, fillColor: lu.fill, fillOpacity: 0.5 });
                                    }
                                });

                                layer_feature.on("mouseover", () => {
                                    if (layerRef.current === "zoning") return;
                                    layer_feature
                                        .bindTooltip(name, {
                                            permanent: false,
                                            direction: "center",
                                            className: "font-sans text-xs font-semibold bg-white text-slate-800 border-0 shadow-lg px-3 py-1.5 rounded-lg",
                                        })
                                        .openTooltip();

                                    if (activeFeatureRef.current !== layer_feature) {
                                        layer_feature.setStyle({ fillOpacity: 0.35, weight: 1.5 });
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

                    map.fitBounds(geoLayerRef.current.getBounds(), { padding: [30, 30] });
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

    // Listen to changes in zoom level state requested by slider
    useEffect(() => {
        if (mapInstanceRef.current && mapInstanceRef.current.getZoom() !== mapZoom) {
            mapInstanceRef.current.setZoom(mapZoom);
        }
    }, [mapZoom]);

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

    useEffect(() => {
        if (geoLayerRef.current) {
            geoLayerRef.current.setStyle((feature) => getFeatureStyle(feature, currentLayer, appTypeFilter, year));
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
                    fillOpacity: isZoningActive ? 0.75 : 0, // Opacity is now 75%
                    opacity: isZoningActive ? 1 : 0
                };
            });
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
    }, [currentLayer, appTypeFilter, year]);

    return <div ref={mapRef} id="map" className="absolute inset-0 z-0" />;
}

export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats, recent }) {
    const [activeLayer, setActiveLayer] = useState("status");
    const [mapStyle, setMapStyle] = useState("standard");
    const [layerPopupOpen, setLayerPopupOpen] = useState(false);
    const [stylePopupOpen, setStylePopupOpen] = useState(false);
    const [appTypeFilter, setAppTypeFilter] = useState("Zoning Certificate");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [clock, setClock] = useState("");
    const [year, setYear] = useState(2026);
    const [donutLoaded, setDonutLoaded] = useState(false);
    const [selectedBgy, setSelectedBgy] = useState(null);
    const [mapZoom, setMapZoom] = useState(13);

    const review = statusMap?.["Technical Review"] ?? 0;
    const released = statusMap?.["Released"] ?? 0;
    const safeTotal = total || 1;
    const processingPct = Math.round(((safeTotal - review - released) / safeTotal) * 100);
    const reviewPct = Math.round((review / safeTotal) * 100);
    const releasedPct = Math.round((released / safeTotal) * 100);

    useEffect(() => {
        const hasShownWelcome = sessionStorage.getItem("hasShownWelcome");

        if (!hasShownWelcome && userName) {
            Swal.fire({
                toast: true,
                position: "top-end",
                icon: "success",
                title: `Welcome back, ${userName || "Staff"}!`,
                text: "Successfully logged in.",
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

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#1e40af",
            cancelButtonColor: "#ef4444",
            confirmButtonText: "Yes",
            cancelButtonText: "Cancel",
            customClass: {
                popup: "swal-small-modal",
                title: "text-blue-900 font-black",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                Swal.fire({
                    title: "Logged Out!",
                    text: "You have been successfully logged out.",
                    icon: "success",
                    timer: 1500,
                    showConfirmButton: false,
                    customClass: { popup: "swal-small-modal" },
                }).then(() => {
                    router.post("/logout");
                });
            }
        });
    };

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
        if (activeLayer === "diversity") {
            setTimeout(() => setDonutLoaded(true), 150);
        } else {
            setDonutLoaded(false);
        }
        if (activeLayer !== "status") {
            setSelectedBgy(null);
        }
    }, [activeLayer]);

    const rsConfig = {
        status: {
            label: "Application Status",
            title: "Map Overview",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />,
        },
        trends: {
            label: "Time Trends",
            title: "Land Use Analysis",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />,
        },
        diversity: {
            label: "Diversity Index",
            title: "Land Use Mix Analysis",
            icon: (
                <>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </>
            ),
        },
        zoning: {
            label: "Official Zoning Plan",
            title: "Municipal Land Use Plan (2016-2030)",
            icon: <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M19.5 21v-7.5a2.25 2.25 0 00-2.25-2.25H15M19.5 21H6m13.5 0v-7.5a2.25 2.25 0 00-2.25-2.25H15m0 0V16.5" />,
        }
    };

    const trendFactor = 1 + (year - 2020) * 0.15;

    const landUseData = [
        ["Residential", Math.floor(82 * trendFactor), Math.min(100, Math.floor(40 * trendFactor * 0.8)), "#22c55e", "#dcfce7"],
        ["Commercial", Math.floor(34 * trendFactor * 1.5), Math.min(100, Math.floor(17 * trendFactor * 1.2)), "#f59e0b", "#fef3c7"],
        ["Agricultural", Math.floor(44 / trendFactor), Math.floor(22 / trendFactor), "#84cc16", "#ecfccb"],
        ["Agro-industrial", Math.floor(14 * trendFactor * 1.8), Math.min(100, Math.floor(7 * trendFactor * 1.5)), "#8b5cf6", "#f3e8ff"],
        ["Industrial", Math.floor(22 * trendFactor), Math.min(100, Math.floor(11 * trendFactor)), "#ef4444", "#fee2e2"],
        ["Special projects", Math.floor(7 * trendFactor), Math.min(100, Math.floor(3 * trendFactor)), "#64748b", "#f1f5f9"],
    ].sort((a, b) => b[1] - a[1]);

    const hotspots = [
        { rank: 1, name: "San Roque", type: year >= 2023 ? "Commercial" : "Residential", color: year >= 2023 ? "#f59e0b" : "#22c55e", bg: year >= 2023 ? "#fef3c7" : "#dcfce7", count: Math.floor(42 * trendFactor) },
        { rank: 2, name: "Quilib", type: year >= 2024 ? "Industrial" : "Agro-industrial", color: year >= 2024 ? "#ef4444" : "#8b5cf6", bg: year >= 2024 ? "#fee2e2" : "#f3e8ff", count: Math.floor(38 * trendFactor) },
        { rank: 3, name: "San Carlos", type: year >= 2024 ? "Industrial" : "Agro-industrial", color: year >= 2024 ? "#ef4444" : "#8b5cf6", bg: year >= 2024 ? "#fee2e2" : "#f3e8ff", count: Math.floor(35 * trendFactor) },
        { rank: 4, name: "Poblacion B", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: Math.floor(31 * trendFactor) },
        { rank: 5, name: "Pinagsibaan", type: year >= 2023 ? "Residential" : "Agricultural", color: year >= 2023 ? "#22c55e" : "#84cc16", bg: year >= 2023 ? "#dcfce7" : "#ecfccb", count: Math.floor(28 * trendFactor) },
    ];

    return (
        <>
            <Head title="Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                .swal2-container { font-family: 'Poppins', sans-serif !important; }
                .swal-small-toast { width: auto !important; padding: 0.5rem 0.75rem !important; min-height: unset !important; }
                .swal-small-toast .swal2-title { font-size: 0.85rem !important; margin-bottom: 0px !important; }
                .swal-small-toast .swal2-html-container { font-size: 0.75rem !important; margin-top: 0px !important; }
                .swal-small-toast .swal2-icon { transform: scale(0.65); margin: 0 0.5rem 0 0 !important; }
                .swal-small-modal { width: 320px !important; padding: 1.25rem !important; border-radius: 16px !important; }
                .swal-small-modal .swal2-icon { transform: scale(0.8); margin: 0 auto 0.5rem !important; }
                .swal-small-modal .swal2-title { font-size: 1.1rem !important; }
                .swal-small-modal .swal2-html-container { font-size: 0.85rem !important; margin-top: 0.25rem !important; color: #64748b; }
                .swal-small-modal .swal2-actions { margin-top: 1rem !important; gap: 8px !important; }
                .swal-small-modal .swal2-styled { padding: 0.4rem 1.25rem !important; font-size: 0.8rem !important; border-radius: 8px !important; font-weight: 600 !important; }
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                
                #right-sidebar { position: absolute; top: 24px; right: 24px; bottom: 24px; width: 360px; z-index: 500; background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1); border: 1px solid rgba(255,255,255,0.4); border-radius: 16px; display: flex; flex-direction: column; overflow: hidden; transition: transform 0.4s cubic-bezier(0.4,0,0.2,1); }
                #right-sidebar-inner { flex: 1; overflow-y: auto; overflow-x: hidden; background: rgba(250, 250, 250, 0.8); }
                .view-layer-btn { display: flex; align-items: center; gap: 10px; padding: 9px 12px; cursor: pointer; background: transparent; width: 100%; text-align: left; border-radius: 8px; border: none; transition: background 0.2s; }
                .view-layer-btn:hover { background: #f8fafc; }
                .view-layer-radio { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #cbd5e1; background: white; flex-shrink: 0; display: flex; align-items: center; justify-content: center; transition: border-color 0.2s; }
                .view-layer-btn.active .view-layer-radio { border-color: #3b82f6; }
                .view-layer-radio-dot { width: 6px; height: 6px; background: #3b82f6; border-radius: 50%; opacity: 0; transform: scale(0.4); transition: all 0.2s; }
                .view-layer-btn.active .view-layer-radio-dot { opacity: 1; transform: scale(1); }
                .stat-bar-track { height: 6px; background: #e8f0fe; border-radius: 3px; overflow: hidden; margin-top: 6px; }
                .stat-bar-fill { height: 100%; border-radius: 3px; transition: width 1s cubic-bezier(0.34,1.56,0.64,1); }
                
                /* Styled Range Slider */
                .timeline-thumb { -webkit-appearance: none; appearance: none; height: 4px; background: linear-gradient(to right, #3b82f6 var(--val, 100%), #e2e8f0 var(--val, 100%)); border-radius: 2px; outline: none; cursor: pointer; }
                .timeline-thumb::-webkit-slider-thumb { -webkit-appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #3b82f6; border: 2px solid white; box-shadow: 0 0 0 2px rgba(59,130,246,0.25), 0 2px 6px rgba(59,130,246,0.2); cursor: pointer; transition: transform 0.15s, box-shadow 0.15s; }
                .timeline-thumb::-webkit-slider-thumb:hover { transform: scale(1.2); box-shadow: 0 0 0 4px rgba(59,130,246,0.2), 0 2px 8px rgba(59,130,246,0.25); }
                
                .app-table { width: 100%; border-collapse: collapse; font-size: 12px; }
                .app-table th { background: #f8fafc; color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em; padding: 10px; border-bottom: 1px solid #e2e8f0; text-align: left; position: sticky; top: 0; z-index: 10; }
                .app-table td { padding: 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
                .app-table tr:hover td { background: #f8faff; }
                .app-table .view-link { color: #3b82f6; font-weight: 600; cursor: pointer; }
                .app-table .view-link:hover { text-decoration: underline; }
                .metric-card { background: white; border-radius: 12px; padding: 14px; border: 1px solid rgba(226, 232, 240, 0.8); transition: box-shadow 0.2s, transform 0.2s; }
                .metric-card:hover { box-shadow: 0 4px 14px rgba(0,0,0,0.05); transform: translateY(-1px); }
                .panel-section { background: rgba(255, 255, 255, 0.6); border-top: 1px solid rgba(226, 232, 240, 0.6); border-bottom: 1px solid rgba(226, 232, 240, 0.6); margin-bottom: 16px; }
                .rs-section-head { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: #64748b; padding: 16px 16px 8px; }
                .map-overlay-card { background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border-radius: 12px; padding: 14px; }
                .custom-bgy-popup .leaflet-popup-content-wrapper { border-radius: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1); border: 1px solid rgba(226, 232, 240, 0.8); padding: 2px; }
                .custom-bgy-popup .leaflet-popup-content { margin: 14px; }
                .custom-bgy-popup .leaflet-popup-tip { background: white; border: 1px solid rgba(226, 232, 240, 0.8); }
                .custom-bgy-popup .leaflet-popup-close-button { color: #94a3b8 !important; margin-top: 12px !important; margin-right: 12px !important; font-size: 18px !important; transition: color 0.2s; }
                .custom-bgy-popup .leaflet-popup-close-button:hover { color: #1e3a8a !important; background: transparent !important; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} />
                
                <div className="flex flex-1 overflow-hidden relative bg-slate-100">
                    <aside className={`absolute top-40 left-0 w-[220px] h-max max-h-[calc(100vh-10rem)] bg-white z-[600] rounded-r-3xl shadow-[4px_4px_24px_rgba(0,0,0,0.1)] flex flex-col py-5 transition-transform duration-500 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-1/2 -translate-y-1/2 -right-8 w-8 h-12 bg-blue-800 hover:bg-blue-900 text-white rounded-r-xl flex items-center justify-center shadow-md transition-colors focus:outline-none">
        <svg className={`w-4 h-4 transition-transform duration-500 ${!sidebarOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
    </button>

    <div className="px-5 pb-5 pt-1 border-b border-slate-100 flex flex-col items-center justify-center">
        <h1 className="text-3xl font-black text-blue-900 tracking-tighter leading-none">iMAPS</h1>
        <span className="text-[10px] font-bold text-blue-700 tracking-[0.2em] uppercase mt-1">Rosario</span>
    </div>

    <nav className="flex-1 flex flex-col gap-1 py-4 overflow-y-auto pr-4">
        <a href="/dashboard" className="flex items-center gap-3 px-5 py-2.5 bg-blue-800 text-white font-semibold text-sm rounded-r-xl shadow-sm transition-all">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            <span>Dashboard</span>
        </a>
        <a href="/applications" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            <span>Applications</span>
        </a>
        <a href="/inspections" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            <span>Site Inspections</span>
        </a>
        
        {userRole === "Admin" && (
            <>
                <a href="/analytics" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    <span>Analytics</span>
                </a>
                <a href="/users" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    <span>User Management</span>
                </a>
                <a href="/audit-log" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>Audit Trail</span>
                </a>
                <a href="/settings" className="flex items-center gap-3 px-5 py-2.5 text-slate-700 hover:bg-blue-50 hover:text-blue-800 font-medium text-sm rounded-r-xl transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    <span>Settings</span>
                </a>
            </>
        )}
    </nav>

    <div className="border-t border-slate-100 py-3 mt-2">
        <button onClick={handleLogout} className="w-full flex items-center gap-3 px-5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700 font-medium text-sm transition-all rounded-r-xl mr-4">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            <span>Sign Out</span>
        </button>
    </div>
</aside>

                    <main className="flex-1 relative flex flex-col min-w-0">
                        <LeafletMap 
                            bgyStats={bgyStats} 
                            currentLayer={activeLayer} 
                            mapStyle={mapStyle} 
                            appTypeFilter={appTypeFilter} 
                            year={year} 
                            mapZoom={mapZoom}
                            onZoomChange={setMapZoom}
                            onFeatureClick={(name, data) => setSelectedBgy({ name, data })} 
                            onMapClick={() => setSelectedBgy(null)} 
                        />
                        
                        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[650] flex items-center bg-slate-100/90 backdrop-blur-xl p-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-white/60 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] ${activeLayer === "status" ? "opacity-100 translate-y-0 scale-100 pointer-events-auto" : "opacity-0 translate-y-8 scale-95 pointer-events-none"}`}>
                            {[
                                { id: "Zoning Certificate", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg> },
                                { id: "Locational Clearance", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg> },
                                { id: "Development Permit", icon: <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg> },
                            ].map((type) => {
                                const isActive = appTypeFilter === type.id;
                                return (
                                    <button key={type.id} onClick={() => setAppTypeFilter(type.id)} className={`relative flex items-center gap-2 px-5 py-2.5 rounded-full text-[13px] transition-all duration-300 ease-out ${isActive ? "text-blue-800 font-black bg-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] ring-1 ring-black/5" : "text-slate-500 font-semibold hover:text-slate-800 hover:bg-slate-200/50"}`}>
                                        <span className={`transition-transform duration-300 ${isActive ? "scale-110 text-blue-600" : "text-slate-400"}`}>{type.icon}</span>
                                        {type.id}
                                    </button>
                                );
                            })}
                        </div>

                        <div className={`absolute bottom-8 left-1/2 -translate-x-1/2 z-[450] flex flex-col items-center gap-2.5 transition-all duration-700 ease-out ${activeLayer === "trends" ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-8 pointer-events-none"}`}>
                            <div className="flex items-center gap-3 bg-white/70 backdrop-blur-md px-4 py-1.5 rounded-full shadow-sm border border-white/50">
                                <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                                <span className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-600">Land Use Projection</span>
                            </div>
                            <div className="flex items-center p-1.5 bg-white/90 backdrop-blur-xl border border-white rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.1)]">
                                <button className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition-all shadow-sm ring-1 ring-slate-200 group">
                                    <svg className="w-4 h-4 ml-0.5 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                                </button>
                                <div className="w-px h-6 bg-slate-200 mx-2" />
                                <div className="flex items-center gap-1">
                                    {[2020, 2021, 2022, 2023, 2024, 2025, 2026].map((y) => {
                                        const isActive = year === y;
                                        const isPast = y < year;
                                        return (
                                            <button key={y} onClick={() => setYear(y)} className={`relative group px-4 py-2.5 rounded-xl font-mono text-[13px] font-bold transition-all duration-300 ${isActive ? "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-md ring-2 ring-blue-500/20 transform scale-105" : isPast ? "text-slate-600 bg-slate-50 hover:bg-slate-100 hover:text-blue-700" : "text-slate-400 hover:bg-slate-50 hover:text-blue-600"}`}>
                                                {y}
                                                <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full transition-all duration-300 ${isActive ? "bg-white" : isPast ? "bg-blue-300" : "bg-transparent"}`} />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* Map Controls: Layer View, Base Map Style & Zoom Slider */}
                        <div className="absolute bottom-8 left-8 z-[650] flex items-center gap-2">
                            {/* Layer Switcher */}
                            <div className="relative">
                                <div className={`bg-white rounded-xl shadow-xl border border-slate-200 w-[210px] mb-2 absolute bottom-full left-0 overflow-hidden transition-all duration-300 ${layerPopupOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"}`}>
                                    <div className="bg-blue-800 py-2.5 px-4">
                                        <span className="text-[12px] font-semibold text-white tracking-wide">View Layer</span>
                                    </div>
                                    <div className="p-2 space-y-0.5">
                                        {[
                                            { key: "status", label: "Application Status" },
                                            { key: "trends", label: "Time Trends" },
                                            { key: "diversity", label: "Diversity Index" },
                                            { key: "zoning", label: "Official Zoning Plan" },
                                        ].map((l) => (
                                            <button key={l.key} className={`view-layer-btn ${activeLayer === l.key ? "active" : ""}`} onClick={() => { setActiveLayer(l.key); setLayerPopupOpen(false); if (sidebarOpen) setSidebarOpen(false); }}>
                                                <div className="view-layer-radio"><div className="view-layer-radio-dot" /></div>
                                                <span className="text-[12px] font-medium text-slate-700">{l.label}</span>
                                            </button>


                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => { setLayerPopupOpen(!layerPopupOpen); setStylePopupOpen(false); }} className={`w-11 h-11 bg-blue-800 hover:bg-blue-900 text-white rounded-xl shadow-lg flex items-center justify-center transition-all focus:outline-none ${layerPopupOpen ? "ring-4 ring-blue-500/30" : ""}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" /></svg>
                                </button>
                            </div>

                            {/* Base Map Style Switcher */}
                            <div className="relative">
                                <div className={`bg-white rounded-xl shadow-xl border border-slate-200 w-[210px] mb-2 absolute bottom-full left-0 overflow-hidden transition-all duration-300 ${stylePopupOpen ? "opacity-100 translate-y-0 pointer-events-auto" : "opacity-0 translate-y-2 pointer-events-none"}`}>
                                    <div className="bg-slate-900 py-2.5 px-4">
                                        <span className="text-[12px] font-semibold text-white tracking-wide">Base Map Style</span>
                                    </div>
                                    <div className="p-2 space-y-1">
                                        {[
                                            { key: "standard", label: "Standard Street", desc: "OpenStreetMap road view" },
                                            { key: "satellite", label: "Satellite", desc: "Esri high-res aerial imagery" },
                                            { key: "hillshade", label: "Terrain Hillshade", desc: "Grayscale elevation relief" },
                                        ].map((s) => (
                                            <button 
                                                key={s.key} 
                                                onClick={() => { setMapStyle(s.key); setStylePopupOpen(false); }} 
                                                className={`w-full text-left p-2 rounded-lg transition-colors flex flex-col ${mapStyle === s.key ? "bg-blue-50 border border-blue-200" : "hover:bg-slate-50"}`}
                                            >
                                                <span className={`text-[12px] font-bold ${mapStyle === s.key ? "text-blue-800" : "text-slate-700"}`}>{s.label}</span>
                                                <span className="text-[10px] text-slate-400">{s.desc}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <button onClick={() => { setStylePopupOpen(!stylePopupOpen); setLayerPopupOpen(false); }} className={`w-11 h-11 bg-slate-900 hover:bg-black text-white rounded-xl shadow-lg flex items-center justify-center transition-all focus:outline-none ${stylePopupOpen ? "ring-4 ring-slate-400/30" : ""}`}>
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                                </button>
                            </div>

                            {/* Custom Zoom Slider */}
                            <div className="flex items-center bg-white rounded-xl shadow-lg border border-slate-200 px-3 h-11 ml-1 transition-all">
                                <svg className="w-4 h-4 text-slate-400 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" /></svg>
                                <input 
                                    type="range" 
                                    min="12" 
                                    max="18" 
                                    step="1"
                                    value={mapZoom}
                                    onChange={(e) => setMapZoom(parseInt(e.target.value))}
                                    className="w-24 timeline-thumb h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer" 
                                    style={{'--val': `${((mapZoom - 12) / 6) * 100}%`}}
                                />
                            </div>
                        </div>

                        <aside id="right-sidebar">
                            <div className="shrink-0 bg-blue-950 text-white px-5 py-4 flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-blue-300">{rsConfig[activeLayer].label}</p>
                                    <h2 className="text-base font-bold mt-0.5 leading-tight">{rsConfig[activeLayer].title}</h2>
                                </div>
                                <div className="w-9 h-9 rounded-full bg-blue-800 flex items-center justify-center shadow-inner border border-blue-700">
                                    <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{rsConfig[activeLayer].icon}</svg>
                                </div>
                            </div>
                            <div id="right-sidebar-inner">
                                {activeLayer === "status" && <StatusPanel total={total} thisMonth={thisMonth} review={review} released={released} processingPct={processingPct} reviewPct={reviewPct} releasedPct={releasedPct} recent={recent} />}
                                {activeLayer === "trends" && <TrendsPanel landUseData={landUseData} hotspots={hotspots} />}
                                {activeLayer === "diversity" && <DiversityPanel donutLoaded={donutLoaded} />}
                                {activeLayer === "zoning" && (
                                    <div className="p-4 space-y-4 h-full overflow-y-auto">
                                        <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">Primary Zoning Classifications</h3>
                                            <div className="space-y-2 text-xs">
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#22c55e] inline-block" /><span>Residential Zones (R1, R2, MR2)</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#f59e0b] inline-block" /><span>Commercial Zones (C1, C2, C/MP)</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#ef4444] inline-block" /><span>Industrial Zones (I1, I2, I3)</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#8b5cf6] inline-block" /><span>Agro-Industrial Zones</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#84cc16] inline-block" /><span>Agricultural Sub-Zones</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#3b82f6] inline-block" /><span>General Institutional (GI-Z)</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#15803d] inline-block" /><span>Forest & Parks (FZ, PR-Z)</span></div>
                                                <div className="flex items-center gap-2"><span className="w-3 h-3 rounded bg-[#64748b] inline-block" /><span>Road / Infrastructure</span></div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </aside>
                    </main>
                </div>
            </div>
        </>
    );
}