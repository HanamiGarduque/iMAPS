import React, { useEffect, useRef, useState, useCallback } from "react";
import {
    Map as MapLibreMap,
    AttributionControl,
    Popup as MapLibrePopup,
    setWorkerUrl,
} from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { DIVERSITY_TIERS, getDiversityTheme } from "@/utils/diversityTheme";

// Configure MapLibre Web Worker for Vite bundling
try {
    setWorkerUrl(workerUrl);
} catch (e) {
    console.warn("MapLibre setWorkerUrl fallback:", e);
}

// Official Center & Geographic Bounds for Rosario, Batangas
const ROSARIO_BOUNDS = [
    [121.1648, 13.6892],
    [121.3685, 13.8783],
];
const ROSARIO_CENTER = [121.258, 13.805];

// High-Resolution Aerial Satellite Basemap
const SATELLITE_TILE = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Official CLUP 2030 Master Zoning Categories for Legend
const CLUP_ZONING_LEGEND = [
    { label: "Agricultural Sub-Zone", code: "PDA-SZ / PTA", color: "#94d180", desc: "Crop cultivation & rice protection" },
    { label: "Forest & Protection Zone", code: "FZ / THSP", color: "#5bb93c", desc: "Forest reserve & watershed buffers" },
    { label: "Residential Zones", code: "R1-Z / R2-Z", color: "#fffc2b", desc: "Low & medium-density housing" },
    { label: "Commercial Core Zones", code: "C1-Z / C2-Z", color: "#eb3356", desc: "Trade, retail & service centers" },
    { label: "Industrial & Manufacturing", code: "I1-Z", color: "#de29c0", desc: "Agri-industrial & light manufacturing" },
];

// RFC 7946 Right-Hand Rule Polygon Winding Fix for MapLibre 3D
function signedArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        sum += (p2[0] - p1[0]) * (p2[1] + p1[1]);
    }
    return sum;
}

function ensureRFC7946Winding(geojson) {
    if (!geojson || !geojson.features) return geojson;

    for (const f of geojson.features) {
        if (!f.geometry || !f.geometry.coordinates) continue;
        const coords = f.geometry.coordinates;

        if (f.geometry.type === "Polygon") {
            if (coords.length > 0 && signedArea(coords[0]) > 0) coords[0].reverse();
            for (let i = 1; i < coords.length; i++) {
                if (signedArea(coords[i]) < 0) coords[i].reverse();
            }
        } else if (f.geometry.type === "MultiPolygon") {
            for (const poly of coords) {
                if (poly.length > 0 && signedArea(poly[0]) > 0) poly[0].reverse();
                for (let i = 1; i < poly.length; i++) {
                    if (signedArea(poly[i]) < 0) poly[i].reverse();
                }
            }
        }
    }
    return geojson;
}

// Diversity score range never literally serializes Infinity into a MapLibre
// expression, so clamp the open ends of the tier scale to safe finite bounds.
function tierBounds(tier) {
    return [tier.min === -Infinity ? -1 : tier.min, tier.max === Infinity ? 2 : tier.max];
}

// Builds a MapLibre boolean expression matching features whose "diversity"
// property falls inside the given tier's range, or null when no tier is active.
function buildTierMatchExpr(tierId) {
    if (!tierId || tierId === "all") return null;
    const tier = DIVERSITY_TIERS.find((t) => t.id === tierId);
    if (!tier) return null;
    const [min, max] = tierBounds(tier);
    return ["all", [">=", ["get", "diversity"], min], ["<", ["get", "diversity"], max]];
}

export default function MapLibre3DView({
    selectedBgy,
    onFeatureClick,
    onMapClick,
    bgyStats = {},
    overallDiversity = null,
    rightPanelOpen,
    diversityTierFilter = "all",
    onSelectDiversityTier = () => {},
}) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);
    const geojsonDataRef = useRef(null);
    const hoveredFeatureIdRef = useRef(null);
    const selectedFeatureIdRef = useRef(null);
    const standingPopupRef = useRef(null);
    const orbitIntervalRef = useRef(null);
    const diversityTierRef = useRef(diversityTierFilter);

    const [isOrbiting, setIsOrbiting] = useState(false);
    const [currentBearing, setCurrentBearing] = useState(-18);
    const [currentPitch, setCurrentPitch] = useState(58);
    const [hoverInfo, setHoverInfo] = useState(null);
    const [isLegendCollapsed, setIsLegendCollapsed] = useState(false);
    const [loadState, setLoadState] = useState("loading"); // "loading" | "ready" | "error"

    useEffect(() => {
        diversityTierRef.current = diversityTierFilter;
        const map = mapRef.current;
        if (map && map.isStyleLoaded()) {
            applyTierFilterStyle(map, diversityTierFilter);
            updatePrismHeights(map.getPitch(), selectedBgy?.name || null);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [diversityTierFilter]);

    // Smooth cinematic flight with sinusoidal deceleration
    const smoothFlyToCentroid = useCallback(
        (coords, targetZoom = 12.8) => {
            const map = mapRef.current;
            if (!map || !coords) return;

            map.flyTo({
                center: coords,
                zoom: targetZoom,
                pitch: 56,
                bearing: map.getBearing(),
                speed: 0.8,
                curve: 1.4,
                padding: {
                    top: 80,
                    bottom: 110, // accommodate bottom camera dock
                    left: 80,
                    right: rightPanelOpen ? 430 : 80,
                },
                easing: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t), // Sinusoidal ease-in-out
                essential: true,
            });
        },
        [rightPanelOpen]
    );

    // Update 3D prism heights: Top-down flattening vs isolated standing mode.
    // Also dims prisms that fall outside the active diversity tier filter.
    const updatePrismHeights = useCallback((pitchVal, bgyMatchName = null) => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded() || !map.getLayer("diversity-3d-prisms")) return;

        const isTopDown = pitchVal < 30;
        const tierMatch = buildTierMatchExpr(diversityTierRef.current);

        if (isTopDown) {
            // Planar 2D choropleth view: flattens heights to 0 to prevent muddy overlapping borders
            map.setPaintProperty("diversity-3d-prisms", "fill-extrusion-height", 0);
            map.setPaintProperty(
                "diversity-3d-prisms",
                "fill-extrusion-opacity",
                tierMatch ? ["case", tierMatch, 0.92, 0.12] : 0.88
            );
        } else {
            // 3D Oblique View
            if (bgyMatchName) {
                // Isolated standing prism mode: clicked barangay stands proud, others lower smoothly
                map.setPaintProperty("diversity-3d-prisms", "fill-extrusion-height", [
                    "case",
                    ["==", ["get", "name"], bgyMatchName],
                    ["*", ["coalesce", ["get", "height"], 700], 1.25],
                    40, // Unselected blocks lower smoothly to subtle base
                ]);
                map.setPaintProperty("diversity-3d-prisms", "fill-extrusion-opacity", [
                    "case",
                    ["==", ["get", "name"], bgyMatchName],
                    0.96,
                    0.45,
                ]);
            } else {
                map.setPaintProperty("diversity-3d-prisms", "fill-extrusion-height", [
                    "coalesce",
                    ["get", "height"],
                    500,
                ]);
                map.setPaintProperty(
                    "diversity-3d-prisms",
                    "fill-extrusion-opacity",
                    tierMatch ? ["case", tierMatch, 0.94, 0.10] : 0.94
                );
            }
        }
    }, []);

    // Recolors the barangay footprint outlines to the active diversity tier's
    // stroke color, dimming everything outside the filter. Mirrors the 2D map's
    // boundary-tinting behavior so the two map modes read as one visual system.
    const applyTierFilterStyle = (map, tierFilter) => {
        if (!map || !map.getLayer("diversity-3d-footprints")) return;
        const tierMatch = buildTierMatchExpr(tierFilter);
        const tier = DIVERSITY_TIERS.find((t) => t.id === tierFilter);

        if (!tierMatch || !tier) {
            map.setPaintProperty("diversity-3d-footprints", "line-color", "#ffffff");
            map.setPaintProperty("diversity-3d-footprints", "line-width", 2.0);
            map.setPaintProperty("diversity-3d-footprints", "line-opacity", 0.95);
            return;
        }

        map.setPaintProperty("diversity-3d-footprints", "line-color", ["case", tierMatch, tier.stroke, "#ffffff"]);
        map.setPaintProperty("diversity-3d-footprints", "line-width", ["case", tierMatch, 3, 1.1]);
        map.setPaintProperty("diversity-3d-footprints", "line-opacity", ["case", tierMatch, 1, 0.18]);
    };

    // Setup 3D GeoJSON source, extrusion layer, and centroid labels
    const setup3DLayers = (map, geoData) => {
        if (!map || !geoData) return;

        // Clean up any existing layers and sources first to prevent collision errors
        if (map.getLayer("diversity-3d-labels")) map.removeLayer("diversity-3d-labels");
        if (map.getLayer("diversity-3d-footprints")) map.removeLayer("diversity-3d-footprints");
        if (map.getLayer("diversity-3d-prisms")) map.removeLayer("diversity-3d-prisms");
        if (map.getSource("diversity-centroids-source")) map.removeSource("diversity-centroids-source");
        if (map.getSource("diversity-3d-source")) map.removeSource("diversity-3d-source");

        // 1. Add 3D Extruded Polygons Source
        map.addSource("diversity-3d-source", {
            type: "geojson",
            data: geoData,
            promoteId: "id",
        });

        // 2. Add Centroid Labels Source
        const centroidFeatures = geoData.features.map((f) => {
            let center = f.properties?.centroid;
            if (!center && f.geometry) {
                const geomCoords =
                    f.geometry.type === "Polygon"
                        ? f.geometry.coordinates[0]
                        : f.geometry.coordinates[0]?.[0] || [];
                let sx = 0, sy = 0;
                geomCoords.forEach((p) => { sx += p[0]; sy += p[1]; });
                center = geomCoords.length ? [sx / geomCoords.length, sy / geomCoords.length] : ROSARIO_CENTER;
            }
            return {
                type: "Feature",
                id: f.id || f.properties?.id,
                geometry: {
                    type: "Point",
                    coordinates: center,
                },
                properties: {
                    name: f.properties?.name,
                    diversity: f.properties?.diversity || 0.5,
                    primaryZone: f.properties?.primaryZone || "PDA-SZ",
                    zoneLabel: f.properties?.zoneLabel || "Agricultural",
                    color: f.properties?.color || "#94d180",
                    centroid: center,
                },
            };
        });

        map.addSource("diversity-centroids-source", {
            type: "geojson",
            data: {
                type: "FeatureCollection",
                features: centroidFeatures,
            },
            promoteId: "id",
        });

        // 3. Add 3D Extrusion Prisms Layer with CLUP 2030 Official Colors
        if (!map.getLayer("diversity-3d-prisms")) {
            map.addLayer({
                id: "diversity-3d-prisms",
                type: "fill-extrusion",
                source: "diversity-3d-source",
                paint: {
                    "fill-extrusion-height": ["coalesce", ["get", "height"], 500],
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false],
                        "#38bdf8",
                        ["boolean", ["feature-state", "hover"], false],
                        "#67e8f9",
                        ["coalesce", ["get", "color"], "#94d180"],
                    ],
                    "fill-extrusion-opacity": 0.94,
                    "fill-extrusion-vertical-gradient": true,
                    "fill-extrusion-height-transition": { duration: 900, delay: 0 },
                    "fill-extrusion-color-transition": { duration: 400, delay: 0 },
                },
            });
        }

        // 4. Luminous Barangay Boundary Footprint Outlines
        if (!map.getLayer("diversity-3d-footprints")) {
            map.addLayer({
                id: "diversity-3d-footprints",
                type: "line",
                source: "diversity-3d-source",
                paint: {
                    "line-color": "#ffffff",
                    "line-width": 2.0,
                    "line-opacity": 0.95,
                },
            });
        }

        // 5. Crisp Centroid Labels with Dynamic High-Contrast Halo
        if (!map.getLayer("diversity-3d-labels")) {
            map.addLayer({
                id: "diversity-3d-labels",
                type: "symbol",
                source: "diversity-centroids-source",
                layout: {
                    "text-field": ["get", "name"],
                    "text-font": ["Noto Sans Regular"],
                    "text-size": [
                        "interpolate",
                        ["linear"],
                        ["zoom"],
                        11, 10,
                        13, 12,
                        15, 14,
                    ],
                    "text-offset": [0, -1.2],
                    "text-anchor": "bottom",
                    "text-allow-overlap": false,
                    "text-ignore-placement": false,
                    "text-max-width": 8,
                },
                paint: {
                    "text-color": "#ffffff",
                    "text-halo-color": "#050b14",
                    "text-halo-width": 3.5,
                    "text-halo-blur": 1,
                },
            });
        }

        // 6. Interactive Mouse Events
        map.on("mousemove", "diversity-3d-prisms", (e) => {
            if (e.features && e.features.length > 0) {
                map.getCanvas().style.cursor = "pointer";
                const feat = e.features[0];

                if (hoveredFeatureIdRef.current !== null && hoveredFeatureIdRef.current !== feat.id) {
                    map.setFeatureState(
                        { source: "diversity-3d-source", id: hoveredFeatureIdRef.current },
                        { hover: false }
                    );
                }

                hoveredFeatureIdRef.current = feat.id;
                map.setFeatureState(
                    { source: "diversity-3d-source", id: feat.id },
                    { hover: true }
                );

                setHoverInfo({
                    x: e.point.x,
                    y: e.point.y,
                    properties: feat.properties,
                });
            }
        });

        map.on("mouseleave", "diversity-3d-prisms", () => {
            map.getCanvas().style.cursor = "";
            if (hoveredFeatureIdRef.current !== null) {
                map.setFeatureState(
                    { source: "diversity-3d-source", id: hoveredFeatureIdRef.current },
                    { hover: false }
                );
                hoveredFeatureIdRef.current = null;
            }
            setHoverInfo(null);
        });

        map.on("click", "diversity-3d-prisms", (e) => {
            if (e.features && e.features.length > 0) {
                const feat = e.features[0];
                const bgyName = feat.properties.name;
                const centroid = feat.properties.centroid || [e.lngLat.lng, e.lngLat.lat];

                if (onFeatureClick) {
                    onFeatureClick(bgyName, feat.properties);
                }

                smoothFlyToCentroid(centroid);
            }
        });
    };

    // Initialize MapLibre 3D Scene with Aerial Satellite basemap
    useEffect(() => {
        if (!mapContainerRef.current) return;

        const initialStyle = {
            version: 8,
            glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
            sources: {
                "base-raster-satellite": {
                    type: "raster",
                    tiles: [SATELLITE_TILE],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://www.esri.com/">Esri</a> &mdash; Aerial Satellite Imagery',
                },
            },
            layers: [
                {
                    id: "base-layer-satellite",
                    type: "raster",
                    source: "base-raster-satellite",
                    minzoom: 0,
                    maxzoom: 19,
                },
            ],
        };

        const map = new MapLibreMap({
            container: mapContainerRef.current,
            style: initialStyle,
            center: ROSARIO_CENTER,
            zoom: 11.5,
            pitch: 58,
            bearing: -18,
            maxPitch: 75,
            antialias: true,
            attributionControl: false,
        });

        map.addControl(new AttributionControl({ compact: true }), "bottom-right");
        mapRef.current = map;

        fetch("/geojson/rosario_3d_diversity_extrusions.geojson")
            .then((res) => {
                if (!res.ok) throw new Error("HTTP " + res.status);
                return res.json();
            })
            .then((rawGeoData) => {
                const geoData = ensureRFC7946Winding(rawGeoData);
                geojsonDataRef.current = geoData;

                let readyFired = false;
                const onReady = () => {
                    if (readyFired) return;
                    if (!mapRef.current) return;
                    readyFired = true;

                    // Enhanced 3D Sun Lighting: warm directional light for distinct building facets & roofs
                    if (map.setLight) {
                        try {
                            map.setLight({
                                anchor: "viewport",
                                color: "#ffffff",
                                intensity: 0.95,
                                position: [1.8, 135, 55],
                            });
                        } catch (e) {}
                    }

                    setup3DLayers(map, geoData);
                    applyTierFilterStyle(map, diversityTierRef.current);
                    setLoadState("ready");

                    try {
                        const cam = map.cameraForBounds(ROSARIO_BOUNDS, {
                            padding: {
                                top: 60,
                                bottom: 90,
                                left: 60,
                                right: rightPanelOpen ? 400 : 60,
                            },
                        });

                        if (cam) {
                            map.easeTo({
                                center: cam.center,
                                zoom: Math.min(cam.zoom, 11.8),
                                pitch: 58,
                                bearing: -18,
                                duration: 1000,
                            });
                        }
                    } catch (e) {}
                };

                if (map.isStyleLoaded()) {
                    onReady();
                } else {
                    map.once("styledata", onReady);
                    map.once("load", onReady);
                }
            })
            .catch((err) => {
                console.error("Error loading 3D GeoJSON:", err);
                setLoadState("error");
            });

        // Click outside to deselect
        map.on("click", (e) => {
            const features = map.queryRenderedFeatures(e.point, {
                layers: ["diversity-3d-prisms", "diversity-3d-labels"].filter((id) => !!map.getLayer(id)),
            });

            if (features.length === 0) {
                if (selectedFeatureIdRef.current !== null) {
                    map.setFeatureState(
                        { source: "diversity-3d-source", id: selectedFeatureIdRef.current },
                        { selected: false }
                    );
                    selectedFeatureIdRef.current = null;
                }
                if (standingPopupRef.current) {
                    standingPopupRef.current.remove();
                    standingPopupRef.current = null;
                }
                updatePrismHeights(map.getPitch(), null);
                if (onMapClick) onMapClick();
            }
        });

        map.on("rotate", () => setCurrentBearing(Math.round(map.getBearing())));
        map.on("pitch", () => {
            const p = Math.round(map.getPitch());
            setCurrentPitch(p);
            updatePrismHeights(p, selectedBgy?.name);
        });

        return () => {
            if (orbitIntervalRef.current) clearInterval(orbitIntervalRef.current);
            if (standingPopupRef.current) {
                standingPopupRef.current.remove();
                standingPopupRef.current = null;
            }
            map.remove();
        };
    }, []);

    // Handle container resize & camera re-centering when right panel toggles
    useEffect(() => {
        const timer = setTimeout(() => {
            if (mapRef.current) {
                mapRef.current.resize();
                if (selectedBgy && selectedBgy.name && geojsonDataRef.current) {
                    const match = geojsonDataRef.current.features?.find(
                        (f) => f.properties?.name?.toLowerCase() === selectedBgy.name.toLowerCase()
                    );
                    if (match && match.properties?.centroid) {
                        smoothFlyToCentroid(match.properties.centroid);
                    }
                }
            }
        }, 320);
        return () => clearTimeout(timer);
    }, [rightPanelOpen, selectedBgy, smoothFlyToCentroid]);

    // Handle selectedBgy changes: smooth elevation and sleek anchor badge
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !map.isStyleLoaded() || !geojsonDataRef.current) return;

        if (selectedBgy && selectedBgy.name) {
            const targetName = selectedBgy.name.toLowerCase();
            const features = geojsonDataRef.current.features || [];
            const match = features.find(
                (f) => f.properties?.name?.toLowerCase() === targetName || f.properties?.ADM4_EN?.toLowerCase() === targetName
            );

            if (match) {
                if (selectedFeatureIdRef.current !== null) {
                    map.setFeatureState(
                        { source: "diversity-3d-source", id: selectedFeatureIdRef.current },
                        { selected: false }
                    );
                }
                selectedFeatureIdRef.current = match.id;
                map.setFeatureState(
                    { source: "diversity-3d-source", id: match.id },
                    { selected: true }
                );

                updatePrismHeights(map.getPitch(), match.properties.name);

                // Show standing pillar 3D badge directly anchored above clicked barangay
                if (standingPopupRef.current) {
                    standingPopupRef.current.remove();
                    standingPopupRef.current = null;
                }

                const centroid = match.properties.centroid || ROSARIO_CENTER;
                const clupColor = match.properties.color || "#94d180";
                const popupEl = document.createElement("div");
                popupEl.className =
                    "flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/97 text-slate-800 border border-cyan-300 shadow-[0_12px_32px_rgba(0,0,0,0.22)] backdrop-blur-md ring-1 ring-cyan-100";
                popupEl.innerHTML = `
                    <span class="w-2.5 h-2.5 rounded-full shrink-0 shadow-sm" style="background-color: ` + clupColor + `; box-shadow: 0 0 8px ` + clupColor + `"></span>
                    <span class="font-black text-xs text-slate-900 tracking-wide">Brgy. ` + match.properties.name + `</span>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-cyan-50 text-cyan-700 font-bold border border-cyan-200">
                        Index: ` + (Number(match.properties.diversity) || 0).toFixed(2) + `
                    </span>
                    <span class="text-[9.5px] font-bold px-1.5 py-0.5 rounded border" style="background-color: ` + clupColor + `20; border-color: ` + clupColor + `50; color: ` + clupColor + `">
                        ` + (match.properties.zoneLabel || match.properties.primaryZone || "CLUP Zone") + `
                    </span>
                `;

                standingPopupRef.current = new MapLibrePopup({
                    closeButton: false,
                    closeOnClick: false,
                    anchor: "bottom",
                    offset: [0, -32],
                    className: "standing-pillar-popup pointer-events-none",
                })
                    .setLngLat(centroid)
                    .setDOMContent(popupEl)
                    .addTo(map);

                smoothFlyToCentroid(centroid);
            }
        } else {
            if (selectedFeatureIdRef.current !== null) {
                map.setFeatureState(
                    { source: "diversity-3d-source", id: selectedFeatureIdRef.current },
                    { selected: false }
                );
                selectedFeatureIdRef.current = null;
            }

            updatePrismHeights(map.getPitch(), null);

            if (standingPopupRef.current) {
                standingPopupRef.current.remove();
                standingPopupRef.current = null;
            }
        }
    }, [selectedBgy, smoothFlyToCentroid, updatePrismHeights]);

    // Camera perspective presets
    const setCameraPerspective = (pitch, bearing) => {
        const map = mapRef.current;
        if (!map) return;
        map.easeTo({
            pitch,
            bearing,
            duration: 900,
            easing: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
        });
    };

    // Reset camera to default municipal view
    const resetToInitialView = () => {
        const map = mapRef.current;
        if (!map) return;
        map.flyTo({
            center: ROSARIO_CENTER,
            zoom: 11.5,
            pitch: 58,
            bearing: -18,
            speed: 0.8,
            duration: 1100,
            easing: (t) => 0.5 - 0.5 * Math.cos(Math.PI * t),
            padding: {
                top: 60,
                bottom: 90,
                left: 60,
                right: rightPanelOpen ? 400 : 60,
            },
        });
    };

    // Toggle 360-degree continuous rotation
    const toggleCinematicOrbit = () => {
        const map = mapRef.current;
        if (!map) return;

        if (isOrbiting) {
            clearInterval(orbitIntervalRef.current);
            orbitIntervalRef.current = null;
            setIsOrbiting(false);
        } else {
            setIsOrbiting(true);
            orbitIntervalRef.current = setInterval(() => {
                if (!mapRef.current) return;
                map.rotateTo((map.getBearing() + 0.35) % 360, { duration: 0 });
            }, 30);
        }
    };

    return (
        <div className="relative w-full h-full overflow-hidden bg-slate-100">
            {/* Custom CSS overrides to eliminate MapLibre default white popup card */}
            <style>{`
                .standing-pillar-popup .maplibregl-popup-content {
                    background: transparent !important;
                    padding: 0 !important;
                    border: none !important;
                    box-shadow: none !important;
                }
                .standing-pillar-popup .maplibregl-popup-tip {
                    border-top-color: rgba(255, 255, 255, 0.97) !important;
                    margin-top: -1px;
                }
            `}</style>

            {/* MapLibre WebGL Canvas Container */}
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

            {/* Loading / Error Overlay */}
            {loadState !== "ready" && (
                <div className="absolute inset-0 z-[950] flex items-center justify-center bg-white/90 backdrop-blur-sm pointer-events-none">
                    {loadState === "loading" ? (
                        <div className="flex flex-col items-center gap-3 text-slate-800">
                            <div className="w-9 h-9 rounded-full border-2 border-cyan-200 border-t-cyan-600 animate-spin" />
                            <span className="text-xs font-bold tracking-wide text-slate-500">Loading 3D Diversity Extrusions...</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-center px-6 max-w-xs">
                            <div className="w-9 h-9 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-black">!</div>
                            <span className="text-xs font-bold text-rose-600">Couldn't load the 3D diversity layer</span>
                            <span className="text-[10.5px] text-slate-500">Check your connection and switch back to 2D, or reload the page to try again.</span>
                        </div>
                    )}
                </div>
            )}

            {/* BOTTOM-MIDDLE FLOATING DOCK (Camera Perspectives + Orbit + Reset) */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[450] flex items-center justify-center gap-2 p-2 rounded-2xl bg-white/95 backdrop-blur-xl border border-slate-200/80 shadow-[0_16px_40px_rgba(0,0,0,0.18)] pointer-events-auto">

                {/* Camera Perspectives */}
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button
                        onClick={() => setCameraPerspective(58, -18)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentPitch >= 45 && currentPitch <= 62
                                ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                                : "text-slate-500 hover:bg-white hover:text-slate-900"
                        }`}
                        title="Standard 3D Oblique Perspective (58°)"
                    >
                        Standard 3D
                    </button>

                    <button
                        onClick={() => setCameraPerspective(70, -32)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentPitch > 62
                                ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                                : "text-slate-500 hover:bg-white hover:text-slate-900"
                        }`}
                        title="Dramatic Aerial Angle (70°)"
                    >
                        Dramatic
                    </button>

                    <button
                        onClick={() => setCameraPerspective(20, 0)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            currentPitch < 35
                                ? "bg-blue-600 text-white shadow-sm ring-1 ring-blue-400"
                                : "text-slate-500 hover:bg-white hover:text-slate-900"
                        }`}
                        title="Top-Down Planimetric View (Flattens 3D borders)"
                    >
                        2D Flat
                    </button>
                </div>

                <div className="w-[1px] h-5 bg-slate-200" />

                {/* Action Tools: Orbit & Reset */}
                <div className="flex items-center gap-1">
                    <button
                        onClick={toggleCinematicOrbit}
                        className={`p-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer border ${
                            isOrbiting
                                ? "bg-purple-600 text-white border-purple-400 animate-pulse"
                                : "bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-900"
                        }`}
                        title={isOrbiting ? "Stop 360° Orbit" : "Start 360° Continuous Orbit"}
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        <span className="hidden sm:inline">{isOrbiting ? "Orbiting" : "Orbit"}</span>
                    </button>

                    <button
                        onClick={resetToInitialView}
                        className="p-1.5 px-2.5 rounded-xl text-xs font-bold flex items-center gap-1.5 bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100 hover:text-slate-900 transition-all cursor-pointer"
                        title="Reset Camera to Municipal Overview"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span className="hidden sm:inline">Reset</span>
                    </button>
                </div>
            </div>

            {/* BOTTOM-LEFT 3D LEGEND (CLUP 2030 Colors + Collapsible) */}
            <div className="absolute bottom-6 left-6 z-[450] pointer-events-auto">
                {isLegendCollapsed ? (
                    <button
                        type="button"
                        onClick={() => setIsLegendCollapsed(false)}
                        className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/95 text-slate-800 border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.12)] backdrop-blur-md hover:bg-white transition-all cursor-pointer"
                    >
                        <div className="w-2.5 h-2.5 rounded-full bg-cyan-500 animate-pulse" />
                        <span className="text-xs font-bold tracking-wide">CLUP 2030 Legend</span>
                        <span className="text-slate-400 text-xs font-mono">▲ Expand</span>
                    </button>
                ) : (
                    <div className="bg-white/95 backdrop-blur-xl rounded-2xl border border-slate-200/80 shadow-[0_12px_32px_rgba(0,0,0,0.15)] p-4 w-72 text-slate-800 transition-all">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                            <div className="flex items-center gap-2">
                                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-600 flex items-center justify-center shadow">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <div>
                                    <h4 className="text-xs font-bold text-slate-900 tracking-wide">
                                        CLUP 2030 Master Zoning
                                    </h4>
                                    <span className="text-[10px] text-cyan-700 font-mono">
                                        Extruded by Diversity Index
                                    </span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsLegendCollapsed(true)}
                                className="text-slate-400 hover:text-slate-900 text-xs p-1 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                                title="Collapse Legend"
                            >
                                ✕
                            </button>
                        </div>

                        {/* Standing Barangay Selection Indicator */}
                        {selectedBgy?.name ? (
                            <div className="mb-2.5 p-2 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-between text-[11px]">
                                <div className="flex items-center gap-1.5 truncate">
                                    <span className="w-2 h-2 rounded-full bg-cyan-500 shrink-0 animate-ping" />
                                    <span className="font-bold text-cyan-800 truncate">
                                        Brgy. {selectedBgy.name}
                                    </span>
                                </div>
                                <span className="text-[9px] font-mono text-cyan-700 shrink-0 font-bold">
                                    3D Pillar Standing
                                </span>
                            </div>
                        ) : (
                            <div className="mb-2.5 px-2 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-[10.5px] text-slate-500 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500" />
                                <span>Click any barangay to elevate 3D prism</span>
                            </div>
                        )}

                        {/* CLUP 2030 Official Color Swatches */}
                        <div className="space-y-1.5 mb-3">
                            {CLUP_ZONING_LEGEND.map((item) => (
                                <div key={item.label} className="flex items-center justify-between text-[11px]">
                                    <div className="flex items-center gap-2 truncate pr-1">
                                        <span
                                            className="w-3.5 h-3.5 rounded shadow-xs shrink-0 border border-black/10"
                                            style={{ backgroundColor: item.color }}
                                        />
                                        <span className="font-semibold text-slate-700 truncate">
                                            {item.label}
                                        </span>
                                    </div>
                                    <span className="font-mono text-[9.5px] text-slate-400 shrink-0">
                                        {item.code}
                                    </span>
                                </div>
                            ))}
                        </div>

                        {/* Diversity Mix Spectrum: same Viridis scale & tier filter as the 2D map legend */}
                        <div className="pt-2.5 border-t border-slate-100 space-y-1.5">
                            <div className="flex items-center justify-between text-[9.5px] text-slate-500 font-bold uppercase tracking-wider">
                                <span>Mix Spectrum · Click to Filter</span>
                                {diversityTierFilter !== "all" && (
                                    <button
                                        type="button"
                                        onClick={() => onSelectDiversityTier("all")}
                                        className="text-cyan-700 hover:text-cyan-800 underline cursor-pointer normal-case font-bold"
                                    >
                                        Show All
                                    </button>
                                )}
                            </div>

                            <div className="h-2 w-full rounded-full shadow-inner bg-gradient-to-r from-[#440154] via-[#3b528b] via-[#21918c] via-[#5ec962] to-[#fde725] relative">
                                {overallDiversity && typeof overallDiversity.score === "number" && (
                                    <div
                                        className="absolute -top-0.5 w-3 h-3 bg-white border-2 border-[#21918c] rounded-full shadow-md -translate-x-1/2 cursor-help"
                                        style={{ left: `${Math.min(100, Math.max(0, overallDiversity.score * 100))}%` }}
                                        title={`Rosario Municipal Score: ${overallDiversity.score.toFixed(2)}`}
                                    />
                                )}
                            </div>

                            <div className="grid grid-cols-1 gap-1">
                                {DIVERSITY_TIERS.map((tier) => {
                                    const isSelected = diversityTierFilter === tier.id;
                                    return (
                                        <button
                                            key={tier.id}
                                            type="button"
                                            onClick={() => onSelectDiversityTier(isSelected ? "all" : tier.id)}
                                            className={`w-full flex items-center gap-1.5 px-2 py-1 rounded-lg text-left transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-slate-900 ring-1 ring-slate-900"
                                                    : "hover:bg-slate-100"
                                            }`}
                                            title={`Filter 3D map to ${tier.label}`}
                                        >
                                            <span
                                                className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10"
                                                style={{ backgroundColor: tier.fill }}
                                            />
                                            <span className={`text-[10px] truncate ${isSelected ? "font-bold text-white" : "text-slate-600"}`}>
                                                {tier.label}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Z-Axis Metric Note */}
                        <div className="pt-2 mt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                            <span className="flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-purple-500" />
                                Height = Mix (0.00 – 1.00)
                            </span>
                            <span className="font-mono text-cyan-700 font-bold">
                                Aerial 3D
                            </span>
                        </div>
                    </div>
                )}
            </div>

            {/* Hover Tooltip in 3D Space */}
            {hoverInfo && hoverInfo.properties && (
                <div
                    className="absolute pointer-events-none z-[900] -translate-x-1/2 -translate-y-full mb-3"
                    style={{ left: hoverInfo.x, top: hoverInfo.y }}
                >
                    <div className="bg-white/97 backdrop-blur-xl border border-slate-200 rounded-xl p-3 shadow-2xl min-w-[210px] text-slate-800 animate-fade-in ring-1 ring-cyan-100">
                        <div className="flex items-center justify-between mb-1.5 pb-1 border-b border-slate-100">
                            <h5 className="font-black text-sm text-slate-900">
                                {hoverInfo.properties.name}
                            </h5>
                            <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: hoverInfo.properties.color || "#94d180" }}
                            />
                        </div>

                        <div className="space-y-1 text-xs">
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-[11px]">CLUP Zone:</span>
                                <span className="font-bold text-slate-700">
                                    {hoverInfo.properties.zoneLabel || hoverInfo.properties.primaryZone}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-[11px]">Simpson's Mix:</span>
                                <span
                                    className="font-mono font-bold px-1.5 rounded text-white"
                                    style={{ backgroundColor: getDiversityTheme(hoverInfo.properties.diversity).stroke }}
                                >
                                    {Number(hoverInfo.properties.diversity || 0).toFixed(2)}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-slate-500 text-[11px]">Tier:</span>
                                <span className="font-bold text-slate-700">
                                    {getDiversityTheme(hoverInfo.properties.diversity).classification}
                                </span>
                            </div>
                        </div>

                        <div className="mt-2 pt-1.5 border-t border-slate-100 text-[9.5px] text-cyan-700 font-bold flex items-center justify-between">
                            <span>Click to elevate 3D pillar</span>
                            <span>→</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
