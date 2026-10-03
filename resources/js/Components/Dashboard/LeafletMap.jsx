import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getStatusMarkerConfig, matchesAppFilters } from "@/Components/MapLayers/StatusPanel";
import { resolveLensValue, matchesBand } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import { loadBarangayBoundaries, loadMunicipalBoundary, loadLandUsePlan, resolveBarangayName } from "@/utils/mapData";
import useReducedMotion from "@/utils/useReducedMotion";
import MapSkeleton from "./MapSkeleton";

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
export const TILE_PROVIDERS = {
    // Default. OpenStreetMap drawn in greyscale: a muted canvas that stays
    // sharp to street level (Esri's gray canvas stops at zoom 16).
    light: {
        label: "Light Gray",
        desc: "Muted canvas, best for thematic layers",
        url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        className: "imaps-tiles-gray",
    },
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
        maxZoom: 18,
    },
    topo: {
        label: "Topographic",
        desc: "Relief shading with roads and place names",
        url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
        attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, USGS',
        maxZoom: 17,
    },
};

// ── Approximate Barangay Centroid Coordinates for Rosario, Batangas ──
const ROSARIO_BGY_COORDS = {
    "Alupay": [13.84346, 121.29952],
    "Antipolo": [13.701158, 121.309776],
    "Bagong Pook": [13.842048, 121.220057],
    "Balibago": [13.856026, 121.285638],
    "Bayawang": [13.78683, 121.274808],
    "Baybayin": [13.823794, 121.259792],
    "Bulihan": [13.79896, 121.231218],
    "Cahigam": [13.804697, 121.24899],
    "Calantas": [13.738286, 121.309791],
    "Colongan": [13.79965, 121.178059],
    "Itlugan": [13.821013, 121.204872],
    "Lumbangan": [13.81617, 121.265373],
    "Maalas-As": [13.810805, 121.210822],
    "Maalas-as": [13.810805, 121.210822],
    "Mabato": [13.810309, 121.29777],
    "Mabunga": [13.78219, 121.301525],
    "Macalamcam A": [13.857334, 121.304114],
    "Macalamcam B": [13.864017, 121.328145],
    "Malaya": [13.851361, 121.170562],
    "Maligaya": [13.816244, 121.274164],
    "Marilag": [13.852664, 121.175876],
    "Masaya": [13.833319, 121.188454],
    "Matamis": [13.719224, 121.32661],
    "Mavalor": [13.818024, 121.229358],
    "Mayuro": [13.787706, 121.263903],
    "Namuco": [13.837477, 121.204089],
    "Namunga": [13.842826, 121.195858],
    "Natu": [13.84223, 121.269031],
    "Nasi": [13.776993, 121.30647],
    "Palakpak": [13.706859, 121.331414],
    "Pinagsibaan": [13.846126, 121.318286],
    "Poblacion": [13.845343, 121.209673],
    "Poblacion A": [13.845343, 121.209673],
    "Poblacion B": [13.845555, 121.207314],
    "Poblacion C": [13.847057, 121.203706],
    "Poblacion D": [13.843953, 121.203891],
    "Poblacion E": [13.84138, 121.205727],
    "Barangay A (Pob.)": [13.845343, 121.209673],
    "Barangay B (Pob.)": [13.845555, 121.207314],
    "Barangay C (Pob.)": [13.847057, 121.203706],
    "Barangay D (Pob.)": [13.843953, 121.203891],
    "Barangay E (Pob.)": [13.84138, 121.205727],
    "Putingkahoy": [13.829277, 121.318763],
    "Quilib": [13.86018, 121.200275],
    "Salao": [13.862531, 121.351559],
    "San Carlos": [13.854922, 121.258434],
    "San Ignacio": [13.831425, 121.181783],
    "San Isidro": [13.810613, 121.30566],
    "San Jose": [13.841924, 121.230089],
    "San Roque": [13.851798, 121.204468],
    "Santa Cruz": [13.855122, 121.183384],
    "Timbugan": [13.802944, 121.185884],
    "Tiquiwan": [13.8311, 121.247385],
    "Leviste (Tubahan)": [13.77351, 121.278392],
    "Leviste": [13.77351, 121.278392],
    "Tulos": [13.717689, 121.289354],
};

export const getAppCoordinates = (app) => {
    const parcel = app?.parcels && app.parcels.length > 0 ? app.parcels[0] : null;
    const lat = parseFloat(parcel?.latitude);
    const lng = parseFloat(parcel?.longitude);

    if (!isNaN(lat) && !isNaN(lng) && lat >= 13.70 && lat <= 13.98 && lng >= 121.10 && lng <= 121.35) {
        return [lat, lng];
    }

    const bgy = (app?.barangay || "Poblacion").trim();
    return ROSARIO_BGY_COORDS[bgy] || ROSARIO_BGY_COORDS["Poblacion"] || [13.845343, 121.209673];
};

const escapeHtml = (value) =>
    String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// LC demand classes — the original choropleth: fixed count thresholds on a
// YlOrRd ramp, each with its own outline colour. The legend reads this list.
export const DEMAND_CLASSES = [
    { min: 16, color: "#800026", stroke: "#4a0016", label: "Very High Demand", range: "16+" },
    { min: 10, color: "#f03b20", stroke: "#990000", label: "High Demand", range: "10–15" },
    { min: 6, color: "#feb24c", stroke: "#d97706", label: "Moderate Demand", range: "6–9" },
    { min: 3, color: "#fed976", stroke: "#b45309", label: "Low Demand", range: "3–5" },
    { min: 0, color: "#ffffcc", stroke: "#ca8a04", label: "Minimal Activity", range: "0–2" },
];

export const getTrendsDemandColor = (count) => DEMAND_CLASSES.find((c) => (count || 0) >= c.min);

// Application load per barangay, shown under the status pins. One muted hue
// so the pins keep the colour.
export const APP_LOAD_CLASSES = [
    { min: 11, color: "#4f74a8", label: "11+" },
    { min: 6, color: "#7f9cc2", label: "6–10" },
    { min: 3, color: "#aebfd8", label: "3–5" },
    { min: 1, color: "#d5deeb", label: "1–2" },
    { min: 0, color: "#f1f4f8", label: "0" },
];

export const getAppLoadColor = (count) => APP_LOAD_CLASSES.find((c) => (count || 0) >= c.min).color;

// Shared outline colours: selection is iMAPS navy, hover a dark slate.
const SELECT_STROKE = "#0b2a5b";
const HOVER_STROKE = "#1f2937";

const BLANK_TILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
// Below this zoom the tracking map shows shaded barangays only; individual
// applications appear when zoomed in or when a barangay is selected.
export const PIN_ZOOM = 15;
// From here in, an application with a matched lot draws its real outline.
const LOT_ZOOM = 17;

const EMPTY_STAT = { total: 0, diversity: 0, variance: 0, distribution: [], landUse: "" };

// ── Leaflet Map Component ──
export default function LeafletMap({
    bgyStats,
    applications = [],
    currentLayer,
    mapStyle,
    onFeatureClick,
    onMapClick,
    onInspectApp,
    appTypeFilter,
    statusFilter = "All",
    hoveredAppId = null,
    selectedAppId = null,
    selectedBgy = null,
    flyToTarget = null,
    mapZoom,
    onZoomChange,
    showClup = false,
    clupOpacity = 0.7,
    showLabels = true,
    resetTrigger,
    diversityLens = "mix",
    diversityBandFilter = "all",
    hoveredBgy = null,
    onHoverBgy = () => {},
    onParcelsVisible = () => {},
    onCursorMove = () => {},
    onHoverApp = () => {},
    insets = { right: 0, bottom: 0 },
    verifiedParcel = null,
    historicalPins = [],
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null);
    const geoLayerRef = useRef(null);
    const municipalLayerRef = useRef(null);
    const verifiedParcelLayerRef = useRef(null);
    const zoningLayerRef = useRef(null);
    const zoningPromiseRef = useRef(null);
    const applicationsLayerRef = useRef(null);
    const labelsLayerRef = useRef(null);
    const labelsRunRef = useRef(0);
    const rosarioBoundsRef = useRef(null);
    const hadSelectionRef = useRef(false);

    // Set once the barangays are drawn; effects that style or label them
    // re-run on it, since the geometry arrives after first render.
    const [barangaysReady, setBarangaysReady] = useState(false);
    const [zoningReady, setZoningReady] = useState(false);

    const prefersReducedMotion = useReducedMotion();
    const pinsByZoom = (mapZoom ?? 0) >= PIN_ZOOM;
    // Space the floating right panel and attribute table cover, so framing
    // keeps the subject in the visible part of the canvas.
    const insetsRef = useRef(insets);
    insetsRef.current = insets;
    const framePadding = () => ({
        paddingTopLeft: [48, 48],
        paddingBottomRight: [48 + (insetsRef.current.right || 0), 48 + (insetsRef.current.bottom || 0)],
    });
    const lotsByZoom = (mapZoom ?? 0) >= LOT_ZOOM;

    const staticBgyData = useMemo(() => {
        const map = {};
        Object.entries(bgyStats ?? {}).forEach(([name, stat]) => {
            map[name] = {
                total: stat.Total ?? 0,
                landUse: stat.Primary_Zone || stat.primaryZone || "",
                diversity: stat.diversity ?? 0,
                distribution: stat.distribution || [],
                variance: stat.variance ?? 0,
                varianceStatus: stat.varianceStatus || "",
                clupTargetDiversity: stat.clupTargetDiversity ?? null,
            };
        });
        return map;
    }, [bgyStats]);

    const bgyDemandCounts = useMemo(() => {
        const counts = {};
        (historicalPins || []).forEach((pin) => {
            const b = (pin.barangay || "").trim().toLowerCase();
            if (b) counts[b] = (counts[b] || 0) + 1;
        });
        return counts;
    }, [historicalPins]);

    // Leaflet keeps the style and event callbacks it was given at creation, so
    // they read the latest props through this ref rather than a stale closure.
    const live = useRef({});
    live.current = {
        currentLayer, selectedBgy, showClup, showLabels,
        diversityLens, diversityBandFilter, staticBgyData, bgyDemandCounts,
        onFeatureClick, onMapClick, onHoverBgy, onCursorMove, onZoomChange, onInspectApp, onHoverApp,
    };

    const featureName = (feature) => resolveBarangayName(feature?.properties || {}) || "";
    const statFor = (name) => live.current.staticBgyData[name] || EMPTY_STAT;
    const demandFor = (name) => live.current.bgyDemandCounts[name.trim().toLowerCase()] || 0;

    const getFeatureStyle = (feature) => {
        const { currentLayer: layer, selectedBgy: sel, showClup: clup, diversityLens: lensId, diversityBandFilter: band } = live.current;
        const name = featureName(feature);
        const stat = statFor(name);
        const selName = (sel?.name || "").trim().toLowerCase();
        const isSelected = Boolean(selName) && selName === name.toLowerCase();

        if (layer === "diversity") {
            // A selected barangay opens up to show its CLUP parcels, so it
            // draws as an outline and every other barangay steps out of the way.
            // `fill: false` (not zero opacity) so the fill is not hit-tested.
            if (isSelected) return { color: SELECT_STROKE, weight: 2.6, opacity: 1, fill: false, dashArray: null, className: "" };
            if (selName) return { weight: 0, opacity: 0, fill: true, fillOpacity: 0, className: "imaps-deadspace" };

            const resolved = resolveLensValue(lensId, stat);
            if (band !== "all" && resolved.band.id !== band) {
                return { color: "#b8c0cc", weight: 0.8, opacity: 0.9, dashArray: "3 3", fill: true, fillColor: "#e2e8f0", fillOpacity: 0.4, className: "" };
            }
            return { color: "#ffffff", weight: 1, opacity: 1, dashArray: null, fill: true, fillColor: resolved.color, fillOpacity: clup ? 0.35 : 0.9, className: "" };
        }

        const demand = layer === "trends" ? getTrendsDemandColor(demandFor(name)) : null;
        const fillColor = demand ? demand.color : getAppLoadColor(stat.total);
        const base = clup ? 0.25 : layer === "trends" ? 0.82 : 0.62;
        return {
            color: isSelected ? SELECT_STROKE : demand ? demand.stroke : "#ffffff",
            weight: isSelected ? 3 : demand ? 1.2 : 1,
            opacity: 1,
            dashArray: null,
            fill: true,
            fillColor,
            fillOpacity: selName && !isSelected ? base * 0.4 : base,
            className: "",
        };
    };

    const restyleBarangays = () => {
        if (!geoLayerRef.current) return;
        geoLayerRef.current.eachLayer((lf) => {
            const style = getFeatureStyle(lf.feature);
            lf.setStyle(style);
            lf._path?.classList.toggle("imaps-deadspace", style.className === "imaps-deadspace");
        });
    };

    const raiseSelected = () => {
        const name = (live.current.selectedBgy?.name || "").toLowerCase();
        if (name && geoLayerRef.current) {
            geoLayerRef.current.eachLayer((lf) => {
                if (featureName(lf.feature).toLowerCase() === name) lf.bringToFront();
            });
        }
        municipalLayerRef.current?.bringToFront();
    };

    // CLUP parcels, drawn only inside the selected barangay of the diversity
    // view. The land-use plan is the heaviest file on the page, so it is built
    // on demand (or during idle time) and attached only while it is shown.
    const parcelZone = (feature) => {
        const p = feature.properties || {};
        return getZoneInfo(String(p.lup_2030 || p.LUP_2030 || p.zone_code || p.zone || p.landuse || p.luc || "").trim());
    };
    const parcelVisible = (feature) => {
        const p = feature.properties || {};
        const sel = (live.current.selectedBgy?.name || "").trim().toLowerCase();
        return live.current.currentLayer === "diversity" && Boolean(sel)
            && (p.location || p.LOCATION || p.barangay || "").trim().toLowerCase() === sel;
    };
    const parcelStyle = (feature) => {
        const zone = parcelZone(feature);
        const on = parcelVisible(feature);
        return {
            color: "#ffffff",
            weight: on ? 0.6 : 0,
            opacity: on ? 0.7 : 0,
            fillColor: zone.pattern ? `url(#${zone.pattern})` : zone.fill,
            fillOpacity: on ? 0.92 : 0,
        };
    };

    const ensureZoningLayer = () => {
        if (zoningLayerRef.current) return Promise.resolve(zoningLayerRef.current);
        if (zoningPromiseRef.current) return zoningPromiseRef.current;

        zoningPromiseRef.current = Promise.all([loadLandUsePlan(), import("leaflet")])
            .then(([data, mod]) => {
                const L = mod.default;
                if (!mapInstanceRef.current || !data?.features) {
                    zoningPromiseRef.current = null; // allow a retry on next need
                    return null;
                }
                zoningLayerRef.current = L.geoJSON(data, {
                    style: parcelStyle,
                    onEachFeature: (feature, parcel) => {
                        const zone = parcelZone(feature);
                        parcel.on("mouseover", (e) => {
                            if (!parcelVisible(feature)) return;
                            L.DomEvent.stopPropagation(e);
                            parcel
                                .bindTooltip(
                                    `<div class="imaps-tt-head"><i style="background:${zone.fill}"></i><b>${escapeHtml(zone.label)}</b></div><div class="imaps-tt-sub">${escapeHtml(zone.code || "—")} · ${escapeHtml(zone.categoryLabel || "")}</div>`,
                                    { className: "imaps-tooltip", sticky: true, opacity: 1 }
                                )
                                .openTooltip(e.latlng);
                            parcel.setStyle({ weight: 1.6, color: SELECT_STROKE, opacity: 1 });
                        });
                        parcel.on("mouseout", () => {
                            parcel.closeTooltip();
                            zoningLayerRef.current?.resetStyle(parcel);
                        });
                    },
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

    // ── Map setup ──
    useEffect(() => {
        let cancelled = false;
        let resizeObserver = null;
        let cursorFrame = null;

        import("leaflet").then((mod) => {
            const L = mod.default;
            import("leaflet/dist/leaflet.css");
            if (cancelled || !mapRef.current || mapInstanceRef.current) return;

            const map = L.map(mapRef.current, {
                center: [13.785, 121.25],
                zoom: 11,
                minZoom: 11,
                maxZoom: 19,
                maxBounds: [[13.65, 121.12], [13.92, 121.36]],
                maxBoundsViscosity: 1.0,
                zoomControl: false,
            });
            mapInstanceRef.current = map;

            map.createPane("labelsPane").style.zIndex = "450";
            map.createPane("appsPane").style.zIndex = "470";
            L.control.scale({ position: "bottomleft", metric: true, imperial: false, maxWidth: 120 }).addTo(map);

            map.on("zoomend", () => live.current.onZoomChange?.(map.getZoom()));
            map.on("click", () => live.current.onMapClick?.());
            map.on("mousemove", (e) => {
                if (cursorFrame) return;
                cursorFrame = requestAnimationFrame(() => {
                    cursorFrame = null;
                    live.current.onCursorMove?.(e.latlng);
                });
            });
            map.on("mouseout", () => live.current.onCursorMove?.(null));

            const provider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.light;
            tileLayerRef.current = L.tileLayer(provider.url, {
                attribution: provider.attribution,
                maxNativeZoom: provider.maxZoom,
                maxZoom: 19,
                className: provider.className || "",
            }).addTo(map);

            clupTileLayerRef.current = L.tileLayer("/tiles/clup_tiles/{z}/{x}/{y}.png", {
                maxZoom: 22,
                maxNativeZoom: 19,
                opacity: clupOpacity,
                zIndex: 10,
                errorTileUrl: BLANK_TILE,
            });

            applicationsLayerRef.current = L.layerGroup().addTo(map);
            labelsLayerRef.current = L.layerGroup().addTo(map);
            verifiedParcelLayerRef.current = L.layerGroup().addTo(map);

            // The docks around the map open and close, so the canvas re-measures
            // whenever its box changes, not just on window resize.
            resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
            resizeObserver.observe(mapRef.current);

            // Each layer draws the moment its own data arrives; the loaders are
            // cached promises shared with the 3D view.
            loadMunicipalBoundary().then((data) => {
                if (mapInstanceRef.current !== map || !data?.features) return;
                municipalLayerRef.current = L.geoJSON(data, {
                    interactive: false,
                    style: { color: "#1f2937", weight: 2.2, opacity: 0.9, fill: false },
                }).addTo(map);
                rosarioBoundsRef.current = municipalLayerRef.current.getBounds();
                map.setMaxBounds(rosarioBoundsRef.current.pad(0.15));
            });

            loadBarangayBoundaries()
                .then((data) => {
                    if (mapInstanceRef.current !== map || !data?.features) return;
                    const geo = L.geoJSON(data, {
                        style: getFeatureStyle,
                        onEachFeature: (feature, lf) => {
                            const name = featureName(feature);
                            lf.on("click", (e) => {
                                L.DomEvent.stopPropagation(e);
                                live.current.onFeatureClick?.(name, statFor(name));
                            });
                            lf.on("mouseover", () => {
                                live.current.onHoverBgy?.(name);
                                if ((live.current.selectedBgy?.name || "").toLowerCase() !== name.toLowerCase()) {
                                    lf.setStyle({ weight: 2.5, color: HOVER_STROKE });
                                    lf.bringToFront();
                                    raiseSelected();
                                }
                            });
                            lf.on("mouseout", () => {
                                live.current.onHoverBgy?.(null);
                                geo.resetStyle(lf);
                                raiseSelected();
                            });
                        },
                    }).addTo(map);
                    geoLayerRef.current = geo;
                    municipalLayerRef.current?.bringToFront();
                    map.fitBounds(geo.getBounds(), { padding: [24, 24] });
                    setBarangaysReady(true);

                    // Spend the idle time after first paint preparing what the
                    // next clicks need: the parcels and the 3D chunk.
                    whenIdle(() => {
                        if (mapInstanceRef.current !== map) return;
                        ensureZoningLayer();
                        import("@/Components/MapLayers/MapLibre3DView").catch(() => {});
                    });
                })
                .catch((err) => console.warn("GeoJSON load error:", err));
        });

        return () => {
            cancelled = true;
            resizeObserver?.disconnect();
            if (cursorFrame) cancelAnimationFrame(cursorFrame);
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, []);

    // ── Styling, parcels and the CLUP overlay ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        restyleBarangays();

        const needsParcels = currentLayer === "diversity" && Boolean(selectedBgy?.name);
        if (needsParcels && !zoningLayerRef.current) ensureZoningLayer();
        const parcels = zoningLayerRef.current;
        if (parcels) {
            if (needsParcels && !map.hasLayer(parcels)) map.addLayer(parcels);
            if (!needsParcels && map.hasLayer(parcels)) map.removeLayer(parcels);
            if (needsParcels) {
                parcels.setStyle(parcelStyle);
                parcels.bringToFront();
            }
        }
        onParcelsVisible(needsParcels && Boolean(parcels));

        const clup = clupTileLayerRef.current;
        if (clup) {
            if (showClup && !map.hasLayer(clup)) map.addLayer(clup);
            if (!showClup && map.hasLayer(clup)) map.removeLayer(clup);
            clup.setOpacity(clupOpacity);
        }

        geoLayerRef.current?.bringToFront();
        raiseSelected();
    }, [currentLayer, selectedBgy, showClup, clupOpacity, staticBgyData, bgyDemandCounts, diversityLens, diversityBandFilter, zoningReady, barangaysReady]);

    // ── Camera follows the selected barangay ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !geoLayerRef.current) return;

        if (!selectedBgy?.name) {
            if (hadSelectionRef.current && rosarioBoundsRef.current) {
                if (prefersReducedMotion) map.fitBounds(rosarioBoundsRef.current, framePadding());
                else map.flyToBounds(rosarioBoundsRef.current, { ...framePadding(), duration: 0.9, easeLinearity: 0.15 });
            }
            hadSelectionRef.current = false;
            return;
        }

        hadSelectionRef.current = true;
        const target = selectedBgy.name.trim().toLowerCase();
        let match = null;
        geoLayerRef.current.eachLayer((lf) => {
            if (featureName(lf.feature).toLowerCase() === target) match = lf;
        });
        if (!match) return;

        const opts = { ...framePadding(), maxZoom: 14.5 };
        if (prefersReducedMotion) map.fitBounds(match.getBounds(), opts);
        else map.flyToBounds(match.getBounds(), { ...opts, duration: 0.9, easeLinearity: 0.15 });
    }, [selectedBgy, barangaysReady]);

    // Declared after the selection effect so an explicit fly-to (a located
    // application or a verified parcel) wins over the barangay framing.
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !flyToTarget?.coords) return;
        const z = flyToTarget.zoom || 16;
        // Aim at the middle of the uncovered area, not the whole canvas.
        const { right = 0, bottom = 0 } = insetsRef.current;
        const target = map.unproject(map.project(flyToTarget.coords, z).add([right / 2, bottom / 2]), z);
        if (prefersReducedMotion) map.setView(target, z);
        else map.flyTo(target, z, { duration: 0.9, easeLinearity: 0.25 });
    }, [flyToTarget]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (map && map.getZoom() !== mapZoom) map.setZoom(mapZoom);
    }, [mapZoom]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || resetTrigger === 0) return;
        if (rosarioBoundsRef.current) map.fitBounds(rosarioBoundsRef.current, framePadding());
        else map.setView([13.785, 121.25], 11);
    }, [resetTrigger]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !tileLayerRef.current) return;
        import("leaflet").then((mod) => {
            if (mapInstanceRef.current !== map) return;
            const provider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.light;
            tileLayerRef.current.remove();
            tileLayerRef.current = mod.default.tileLayer(provider.url, {
                attribution: provider.attribution,
                maxNativeZoom: provider.maxZoom,
                maxZoom: 19,
                className: provider.className || "",
            });
            tileLayerRef.current.addTo(map).bringToBack();
        });
    }, [mapStyle]);

    // ── Barangay labels ──
    // Name plus the active mode's value, placed strongest-first and skipped
    // when they would overlap, so zooming in reveals more of them.
    const renderLabels = useCallback(() => {
        const map = mapInstanceRef.current;
        const group = labelsLayerRef.current;
        const geo = geoLayerRef.current;
        if (!map || !group || !geo) return;
        const run = ++labelsRunRef.current;
        group.clearLayers();

        const { currentLayer: layer, diversityLens: lensId, diversityBandFilter: band, selectedBgy: sel, showLabels: on } = live.current;
        if (!on || (layer === "diversity" && sel?.name)) return;

        import("leaflet").then((mod) => {
            if (run !== labelsRunRef.current || mapInstanceRef.current !== map) return;
            const L = mod.default;

            const candidates = [];
            geo.eachLayer((lf) => {
                const name = featureName(lf.feature);
                if (!name) return;
                const stat = statFor(name);
                let value = "";
                let rank = 0;
                if (layer === "diversity") {
                    if (!matchesBand(lensId, band, stat)) return;
                    const r = resolveLensValue(lensId, stat);
                    value = r.formatted;
                    rank = r.value;
                } else if (layer === "trends") {
                    rank = demandFor(name);
                    value = rank ? `${rank} LC` : "";
                } else {
                    rank = stat.total;
                    value = rank ? String(rank) : "";
                }
                candidates.push({ name, value, rank, center: lf.getBounds().getCenter() });
            });
            candidates.sort((a, b) => b.rank - a.rank);

            const placed = [];
            candidates.forEach(({ name, value, center }) => {
                const pt = map.latLngToContainerPoint(center);
                const w = Math.max(name.length, value.length) * 6.2 + 10;
                const h = value ? 30 : 16;
                const box = { l: pt.x - w / 2, r: pt.x + w / 2, t: pt.y - h / 2, b: pt.y + h / 2 };
                if (placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) return;
                placed.push(box);

                group.addLayer(
                    L.marker(center, {
                        pane: "labelsPane",
                        interactive: false,
                        keyboard: false,
                        icon: L.divIcon({
                            className: "imaps-label-wrap",
                            iconSize: [0, 0],
                            html: `<div class="imaps-label"><span>${escapeHtml(name)}</span>${value ? `<b>${escapeHtml(value)}</b>` : ""}</div>`,
                        }),
                    })
                );
            });
        });
    }, []);

    useEffect(() => {
        renderLabels();
    }, [currentLayer, diversityLens, diversityBandFilter, selectedBgy, showLabels, staticBgyData, bgyDemandCounts, barangaysReady, renderLabels]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map) return;
        map.on("zoomend", renderLabels);
        return () => map.off("zoomend", renderLabels);
    }, [barangaysReady, renderLabels]);

    // Mirror the side panel's hover onto the polygons (the 3D view does too).
    useEffect(() => {
        const geo = geoLayerRef.current;
        if (!geo || !hoveredBgy) return;
        const target = hoveredBgy.toLowerCase();
        if ((selectedBgy?.name || "").toLowerCase() === target) return;

        let hit = null;
        geo.eachLayer((lf) => {
            if (featureName(lf.feature).toLowerCase() === target) hit = lf;
        });
        if (!hit) return;
        hit.setStyle({ weight: 2.5, color: HOVER_STROKE });
        hit.bringToFront();
        return () => {
            geo.resetStyle(hit);
            raiseSelected();
        };
    }, [hoveredBgy]);

    // A parcel found from the header search: its lot outline (or a ring when
    // no geometry is on file), filled in its CLUP zone colour.
    useEffect(() => {
        const group = verifiedParcelLayerRef.current;
        if (!group) return;
        group.clearLayers();
        if (!verifiedParcel) return;

        let stale = false;
        import("leaflet").then((mod) => {
            if (stale || !verifiedParcelLayerRef.current) return;
            const L = mod.default;
            const { lat, lng, zoneInfo, geometry } = verifiedParcel;
            const fill = zoneInfo?.fill || "#93c5fd";

            if (geometry) {
                L.geoJSON(geometry, {
                    interactive: false,
                    style: { color: SELECT_STROKE, weight: 3, opacity: 1, fillColor: fill, fillOpacity: 0.55, dashArray: null },
                }).addTo(group);
            }
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                L.marker([lat, lng], {
                    interactive: false,
                    zIndexOffset: 3000,
                    icon: L.divIcon({
                        className: "imaps-pin-wrap",
                        html: `<div style="width:16px;height:16px;border-radius:50%;background:${fill};border:3px solid ${SELECT_STROKE};box-shadow:0 0 0 2px #fff,0 2px 6px rgba(15,23,42,.4)"></div>`,
                        iconSize: [16, 16],
                        iconAnchor: [8, 8],
                    }),
                }).addTo(group);
            }
        });
        return () => {
            stale = true;
        };
    }, [verifiedParcel]);

    // ── Application pins (tracking mode) ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        const group = applicationsLayerRef.current;
        if (!map || !group) return;
        group.clearLayers();
        const selName = (selectedBgy?.name || "").trim().toLowerCase();
        if (currentLayer !== "status" || !(selName || pinsByZoom)) return;
        const visible = (applications || []).filter(
            (app) => matchesAppFilters(app, appTypeFilter, statusFilter)
                && (!selName || (app?.barangay || "").trim().toLowerCase() === selName)
        );

        let stale = false;
        import("leaflet").then((mod) => {
            if (stale) return;
            const L = mod.default;

            // Applications sharing a spot are laid out in a small grid around it,
            // so each stays clickable without a ring of markers.
            const groups = {};
            visible.forEach((app) => {
                const c = getAppCoordinates(app);
                const key = `${c[0].toFixed(4)},${c[1].toFixed(4)}`;
                (groups[key] ||= { center: c, apps: [] }).apps.push(app);
            });

            const STEP = 0.00032; // ~35 m between neighbours in a group
            Object.values(groups).forEach(({ center, apps }) => {
                const cols = Math.ceil(Math.sqrt(apps.length));
                const rows = Math.ceil(apps.length / cols);
                apps.forEach((app, idx) => {
                    const coords = apps.length > 1
                        ? [center[0] + ((rows - 1) / 2 - Math.floor(idx / cols)) * STEP, center[1] + ((idx % cols) - (cols - 1) / 2) * STEP]
                        : center;
                    const isSelected = selectedAppId === app.id;
                    const isHovered = hoveredAppId === app.id;
                    const cfg = getStatusMarkerConfig(app.status);
                    const outline = app.parcels?.[0]?.outline;

                    let layer;
                    if (lotsByZoom && outline) {
                        // Close in: the lot itself, outlined in its status colour.
                        layer = L.geoJSON(outline, {
                            pane: "appsPane",
                            style: () => ({
                                color: isSelected ? SELECT_STROKE : cfg.border,
                                weight: isSelected || isHovered ? 2.6 : 1.6,
                                fillColor: cfg.color,
                                fillOpacity: isHovered || isSelected ? 0.55 : 0.35,
                            }),
                        });
                    } else {
                        layer = L.marker(coords, {
                            pane: "appsPane",
                            keyboard: true,
                            zIndexOffset: isSelected ? 3000 : isHovered ? 2000 : 1000,
                            icon: L.divIcon({
                                className: "imaps-pin-wrap",
                                iconSize: [14, 14],
                                iconAnchor: [7, 7],
                                html: `<span class="imaps-sq${isSelected ? " is-selected" : ""}${isHovered ? " is-hovered" : ""}" style="--sq:${cfg.color}"></span>`,
                            }),
                        });
                        layer.on("add", () => {
                            layer.getElement()?.setAttribute("aria-label", `${app.applicant_name || "Applicant"}, ${cfg.label}`);
                        });
                    }

                    layer.on("click", (e) => {
                        L.DomEvent.stopPropagation(e);
                        live.current.onInspectApp?.(app);
                    });
                    layer.on("mouseover", () => live.current.onHoverApp?.(app.id));
                    layer.on("mouseout", () => live.current.onHoverApp?.(null));
                    group.addLayer(layer);
                });
            });
        });
        return () => {
            stale = true;
        };
    }, [currentLayer, applications, appTypeFilter, statusFilter, selectedBgy, hoveredAppId, selectedAppId, barangaysReady, pinsByZoom, lotsByZoom]);

    return (
        <>
            <style>{MAP_CSS}</style>
            <svg style={{ position: "absolute", width: 0, height: 0 }} aria-hidden="true">
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
            <div
                ref={mapRef}
                className="absolute inset-0 z-0 imaps-map"
                role="application"
                aria-label="Map of Rosario, Batangas"
                aria-busy={!barangaysReady}
            />
            <MapSkeleton visible={!barangaysReady} label="Loading barangay boundaries…" />
            {currentLayer === "diversity" && selectedBgy?.name && !zoningReady && (
                <div className="absolute top-0 inset-x-0 z-[450] h-0.5 overflow-hidden bg-slate-200" role="progressbar" aria-label="Loading CLUP parcels">
                    <div className="imaps-loading-bar h-full w-1/3 bg-[#0b2a5b]" />
                </div>
            )}
        </>
    );
}

const MAP_CSS = `
.imaps-map.leaflet-container { background: #f2f3f5; font: inherit; }
.imaps-tiles-gray { filter: grayscale(1) brightness(1.06) contrast(0.88); }
.imaps-map .leaflet-interactive { transition: fill 240ms ease, fill-opacity 240ms ease, stroke-width 160ms ease; }
.imaps-map .leaflet-interactive.imaps-deadspace { pointer-events: none !important; }

.imaps-pin-wrap, .imaps-label-wrap { background: transparent; border: 0; }
.imaps-sq { display: block; width: 10px; height: 10px; margin: 2px; background: var(--sq); border-radius: 1px; box-shadow: 0 0 0 1.5px #fff, 0 0 0 2.5px rgba(15, 23, 42, 0.55); transition: transform 120ms ease; cursor: pointer; }
.imaps-sq.is-hovered { transform: scale(1.35); }
.imaps-sq.is-selected { transform: scale(1.45); box-shadow: 0 0 0 1.5px #fff, 0 0 0 3.5px #0b2a5b; }
.leaflet-marker-icon:focus-visible { outline: 2px solid #0b2a5b; outline-offset: 2px; }
.imaps-label { transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; line-height: 1.15; white-space: nowrap; pointer-events: none;
  text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff; }
.imaps-label span { font-size: 10.5px; font-weight: 600; color: #1f2937; }
.imaps-label b { font-size: 11.5px; font-weight: 700; color: #0b2a5b; font-variant-numeric: tabular-nums; }

.imaps-tooltip { background: #fff; border: 1px solid #cbd5e1; border-radius: 3px; box-shadow: 0 2px 8px rgba(15, 23, 42, 0.14); padding: 6px 8px; color: #111827; }
.imaps-tooltip::before { display: none; }
.imaps-tt-head { display: flex; align-items: center; gap: 6px; font-size: 12px; }
.imaps-tt-head i { width: 10px; height: 10px; border-radius: 2px; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.15); flex-shrink: 0; }
.imaps-tt-head span { margin-left: 8px; font-weight: 700; font-variant-numeric: tabular-nums; color: #0b2a5b; }
.imaps-tt-sub { font-size: 11px; color: #64748b; margin-top: 2px; }
.imaps-popup .leaflet-popup-content-wrapper { border-radius: 3px; box-shadow: 0 2px 10px rgba(15, 23, 42, 0.18); }
.imaps-popup .leaflet-popup-content { margin: 8px 10px; }

.imaps-map .leaflet-control-scale-line { border-color: #374151; color: #111827; background: rgba(255, 255, 255, 0.85); font-size: 10px; }
.imaps-map .leaflet-control-attribution { font-size: 9.5px; }
@media (prefers-reduced-motion: reduce) {
  .imaps-map .leaflet-interactive, .imaps-skeleton, .imaps-sq { transition: none; animation: none; }
}
`;
