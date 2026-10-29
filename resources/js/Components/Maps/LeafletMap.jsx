import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import { getStatusMarkerConfig, matchesAppFilters } from "@/Components/MapLayers/StatusPanel";
import { resolveLensValue, matchesBand } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import { loadBarangayBoundaries, loadNeighborMunicipalities, loadMunicipalBoundary, loadLandUsePlan, resolveBarangayName } from "@/utils/mapData";
import useReducedMotion from "@/utils/useReducedMotion";
import labelPoint from "@/utils/labelPoint";
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

// Esri basemaps use Esri's public keyless tile endpoint by default. Set
// VITE_ARCGIS_TILES_KEYED=true (with VITE_ARCGIS_API_KEY) to use the keyed
// static-tiles service instead (public API key, restricted to our referrers
// and the Static basemap tiles privilege).
const ESRI_KEY = import.meta.env.VITE_ARCGIS_TILES_KEYED === "true" ? (import.meta.env.VITE_ARCGIS_API_KEY || "") : "";
const ESRI_TILES = "https://static-map-tiles-api.arcgis.com/arcgis/rest/services/static-basemap-tiles-service/v1";
const ESRI_PUBLIC = "https://services.arcgisonline.com/ArcGIS/rest/services";
const esriUrl = (keyed, publicService) => ESRI_KEY
    ? `${ESRI_TILES}/arcgis/${keyed}/static/tile/{z}/{y}/{x}?token=${ESRI_KEY}`
    : `${ESRI_PUBLIC}/${publicService}/MapServer/tile/{z}/{y}/{x}`;

// ── Tile Layer Configuration ──
export const TILE_PROVIDERS = {
    // OpenStreetMap drawn in greyscale: a muted canvas that stays sharp to
    // street level (Esri's gray canvas stops at zoom 16).
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
    // Default. Imagery is busy, so the thematic layers switch to a lighter
    // touch on it (see `imagery` in getFeatureStyle).
    satellite: {
        label: "Satellite Imagery",
        desc: "Esri high-resolution aerial imagery",
        url: esriUrl("imagery", "World_Imagery"),
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP',
        maxZoom: 18,
        className: "imaps-tiles-imagery",
        imagery: true,
    },
    topo: {
        label: "Topographic",
        desc: "Relief shading with roads and place names",
        url: esriUrl("topographic", "World_Topo_Map"),
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

// Application load per barangay, shown under the status lot outlines. A
// green-to-deep-blue ramp (YlGnBu) that reads on both the street and imagery basemaps.
export const APP_LOAD_CLASSES = [
    { min: 11, color: "#253494", label: "11+" },
    { min: 6, color: "#1d91c0", label: "6–10" },
    { min: 3, color: "#7fcdbb", label: "3–5" },
    { min: 1, color: "#c7e9b4", label: "1–2" },
    { min: 0, color: "#f7fbff", label: "0" },
];

export const getAppLoadColor = (count) => APP_LOAD_CLASSES.find((c) => (count || 0) >= c.min).color;

// Shared outline colours: selection is iMAPS navy, hover a dark slate. Dark
// strokes vanish into imagery, so there both turn white and differ by weight.
const SELECT_STROKE = "#0b2a5b";
const HOVER_STROKE = "#1f2937";
const isImageryStyle = (style) => Boolean(TILE_PROVIDERS[style]?.imagery);
const selectStroke = (imagery) => (imagery ? "#ffffff" : SELECT_STROKE);
const hoverStyle = (imagery) => (imagery ? { weight: 3, color: "#ffffff", opacity: 1 } : { weight: 2.5, color: HOVER_STROKE });

// Rosario's outline is drawn twice, a soft halo under a crisp line, and the
// land outside it is dimmed by a mask with the municipality cut out, so the
// study area lifts off the basemap without a frame around it.
const PLAIN_LINE = "#b9b4ab";
export const boundaryStyles = (imagery, plain = false) => plain ? ({
    halo: { stroke: false, fill: false },
    line: { color: PLAIN_LINE, weight: 1.4, opacity: 1, fill: false, lineJoin: "round" },
    mask: { stroke: false, fill: false },
}) : ({
    halo: { color: imagery ? "#020617" : "#ffffff", weight: imagery ? 7 : 6, opacity: imagery ? 0.45 : 0.8, fill: false, lineJoin: "round" },
    line: { color: imagery ? "#ffffff" : "#1f2937", weight: imagery ? 2.4 : 2.2, opacity: imagery ? 1 : 0.9, fill: false, lineJoin: "round" },
    mask: { stroke: false, fill: true, fillColor: "#020617", fillOpacity: imagery ? 0.2 : 0.1 },
});
// Comfortably past maxBounds at every zoom.
const MASK_OUTER = [[12.8, 120.2], [12.8, 122.4], [14.8, 122.4], [14.8, 120.2]];

export const buildOutsideMask = (L, data, pane, style) => {
    const holes = [];
    data.features.forEach((f) => {
        const g = f.geometry;
        const polys = g?.type === "Polygon" ? [g.coordinates] : g?.type === "MultiPolygon" ? g.coordinates : [];
        polys.forEach((p) => holes.push(L.GeoJSON.coordsToLatLngs(p[0])));
    });
    if (!holes.length) return null;
    return L.polygon([MASK_OUTER, ...holes], { pane, interactive: false, ...style });
};

// Base tiles are drawn 1px oversize so neighbours overlap. At fractional
// display scaling the browser rounds tile edges apart, and the container
// background shows through as hairline seams.
let SeamlessTileLayer = null;
const createBaseLayer = (L, mapStyle) => {
    SeamlessTileLayer ??= L.TileLayer.extend({
        _initTile(tile) {
            L.TileLayer.prototype._initTile.call(this, tile);
            const size = this.getTileSize();
            tile.style.width = `${size.x + 1}px`;
            tile.style.height = `${size.y + 1}px`;
        },
    });
    const provider = TILE_PROVIDERS[mapStyle] || TILE_PROVIDERS.light;
    return new SeamlessTileLayer(provider.url, {
        attribution: provider.attribution,
        maxNativeZoom: provider.maxZoom,
        maxZoom: 19,
        className: provider.className || "",
    });
};

const BLANK_TILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
// Zooming out past this closes the open application (Maps.jsx).
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
    clupOpacity = 1,
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
    demandCounts = {},
    // Per-barangay colour override for the LC layer (see utils/lcInsights).
    lcColors = null,
    // The LC layer's plain white page: no basemap, light linework, names only.
    plain = false,
    // A React card shown above the selected barangay on the plain LC map.
    callout = null,
    // Filled with { get, set } so the 3D view can start from, and hand back,
    // exactly the view the person is looking at.
    viewRef = null,
}) {
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const tileLayerRef = useRef(null);
    const neighborLayerRef = useRef(null);
    const clupTileLayerRef = useRef(null);
    const geoLayerRef = useRef(null);
    const municipalLayerRef = useRef(null);
    const municipalHaloRef = useRef(null);
    const outsideMaskRef = useRef(null);
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
    // Space the floating right panel and attribute table cover, so framing
    // keeps the subject in the visible part of the canvas.
    const insetsRef = useRef(insets);
    insetsRef.current = insets;
    // A short canvas gets a smaller card, and room for it above the barangay.
    const calloutScale = () => {
        const h = mapInstanceRef.current?.getSize().y || 700;
        return Math.max(0.6, Math.min(1, (h * 0.5) / 330));
    };
    const calloutRoom = () => Math.round(285 * calloutScale());
    const calloutOnRef = useRef(false);
    calloutOnRef.current = Boolean(callout);
    const framePadding = () => ({
        // room above the barangay for its card
        paddingTopLeft: [48, 48 + (calloutOnRef.current ? calloutRoom() : 0)],
        paddingBottomRight: [48 + (insetsRef.current.right || 0), 48 + (insetsRef.current.bottom || 0)],
    });
    // Whole-municipality view: balanced left and right so Rosario sits in the
    // middle of the canvas (the pan limits leave room on every side for this).
    const homePadding = () => ({
        // a little more room above, where the title card sits
        paddingTopLeft: [48, 72],
        paddingBottomRight: [48, 48 + (insetsRef.current.bottom || 0)],
    });
    const lotsByZoom = (mapZoom ?? 0) >= LOT_ZOOM;

    const staticBgyData = useMemo(() => {
        const map = {};
        Object.entries(bgyStats ?? {}).forEach(([name, stat]) => {
            map[name] = {
                total: stat.Total ?? 0,
                landUse: stat.Primary_Zone || stat.primaryZone || "",
                // null = too few records to score; the lens draws it as no data.
                diversity: stat.diversity ?? null,
                distribution: stat.distribution || [],
                variance: stat.variance ?? null,
                varianceStatus: stat.varianceStatus || "",
                clupTargetDiversity: stat.clupTargetDiversity ?? null,
            };
        });
        return map;
    }, [bgyStats]);

    // Leaflet keeps the style and event callbacks it was given at creation, so
    // they read the latest props through this ref rather than a stale closure.
    const live = useRef({});
    live.current = {
        currentLayer, selectedBgy, showClup, showLabels, imagery: isImageryStyle(mapStyle) && !plain, plain,
        diversityLens, diversityBandFilter, staticBgyData, bgyDemandCounts: demandCounts,
        onFeatureClick, onMapClick, onHoverBgy, onCursorMove, onZoomChange, onInspectApp, onHoverApp,
    };

    const featureName = (feature) => resolveBarangayName(feature?.properties || {}) || "";
    const statFor = (name) => live.current.staticBgyData[name] || EMPTY_STAT;
    const demandFor = (name) => live.current.bgyDemandCounts[name.trim().toLowerCase()] || 0;

    const getFeatureStyle = (feature) => {
        const { currentLayer: layer, selectedBgy: sel, showClup: clup, diversityLens: lensId, diversityBandFilter: band, imagery } = live.current;
        const name = featureName(feature);
        const stat = statFor(name);
        const selName = (sel?.name || "").trim().toLowerCase();
        const isSelected = Boolean(selName) && selName === name.toLowerCase();
        // On imagery: thin translucent white edges, and fills light enough to
        // let the ground texture through, so the colour reads as part of the
        // land rather than a sheet laid over it.
        const edge = imagery ? { color: "#ffffff", weight: 1.2, opacity: 0.8 } : { color: "#ffffff", weight: 1, opacity: 1 };

        if (layer === "diversity") {
            // As in the other modules: the selected barangay gets a heavier
            // outline, and its neighbours stay in view with a lighter fill.
            const resolved = resolveLensValue(lensId, stat);
            if (band !== "all" && resolved.band.id !== band) {
                return imagery
                    ? { color: "#ffffff", weight: 0.8, opacity: 0.55, dashArray: "3 3", fill: true, fillColor: "#020617", fillOpacity: 0.35, className: "" }
                    : { color: "#b8c0cc", weight: 0.8, opacity: 0.9, dashArray: "3 3", fill: true, fillColor: "#e2e8f0", fillOpacity: 0.4, className: "" };
            }
            // Drawn like the LC demand map: each class outlined in its own
            // darker shade, the same fill strength, and on imagery the
            // near-white lowest class fades rather than greying the ground.
            const lowest = resolved.band.id === "monoculture";
            return {
                color: isSelected ? selectStroke(imagery) : imagery ? edge.color : resolved.stroke || "#ffffff",
                weight: isSelected ? (imagery ? 3 : 2.6) : imagery ? edge.weight : 1.2,
                opacity: isSelected ? 1 : edge.opacity,
                dashArray: null,
                fill: true,
                fillColor: resolved.color,
                fillOpacity: (clup ? 0.25 : imagery ? (lowest ? 0.28 : 0.66) : 0.82) * (selName && !isSelected ? 0.4 : 1),
                className: "",
            };
        }

        const demand = layer === "trends" ? (lcColors?.[name.trim().toLowerCase()] || getTrendsDemandColor(demandFor(name))) : null;
        if (live.current.plain && layer === "trends") {
            // White page: opaque fills in the legend's colours, hairline borders.
            return {
                color: isSelected ? "#0b2a5b" : PLAIN_LINE,
                weight: isSelected ? 3 : 0.9,
                opacity: 1,
                dashArray: null,
                fill: true,
                fillColor: demand.color,
                fillOpacity: selName && !isSelected ? 0.35 : 1,
                className: "",
            };
        }
        const fillColor = demand ? demand.color : getAppLoadColor(stat.total);
        let base = clup ? 0.25 : layer === "trends" ? 0.82 : 0.62;
        // The lowest class is near-white; on imagery it fades out (all but
        // clear for zero applications) instead of washing the ground grey.
        if (imagery && !clup) {
            base = demand ? (demand.min === 0 ? 0.28 : 0.66) : stat.total ? 0.6 : 0.04;
        }
        return {
            color: isSelected ? selectStroke(imagery) : imagery ? edge.color : demand ? demand.stroke : "#ffffff",
            weight: isSelected ? (imagery ? 3.4 : 3) : imagery ? edge.weight : demand ? 1.2 : 1,
            opacity: isSelected ? 1 : edge.opacity,
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
                zoom: 12,
                // Finer than whole steps, and low enough that the whole town fits a short window.
                minZoom: 11,
                zoomSnap: 0.25,
                zoomDelta: 1,
                maxZoom: 19,
                maxBounds: [[13.6, 121.12], [13.92, 121.55]],
                maxBoundsViscosity: 1.0,
                zoomControl: false,
            });
            mapInstanceRef.current = map;
            if (viewRef) {
                viewRef.current = {
                    get: () => { const c = map.getCenter(); return { center: [c.lng, c.lat], zoom: map.getZoom() }; },
                    set: ({ center, zoom }) => map.setView([center[1], center[0]], Math.min(19, Math.max(11, zoom)), { animate: false }),
                };
            }

            // Mask sits between the base tiles and the barangays; the
            // municipal outline above every polygon but under the labels.
            map.createPane("maskPane").style.zIndex = "350";
            // CLUP tiles sit above the choropleth polygons (overlayPane, 400) so
            // the zoning colours are never tinted by the shading beneath them.
            map.createPane("clupPane").style.zIndex = "410";
            map.getPane("clupPane").style.pointerEvents = "none";
            map.createPane("boundaryPane").style.zIndex = "420";
            map.getPane("maskPane").style.pointerEvents = "none";
            map.getPane("boundaryPane").style.pointerEvents = "none";
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

            mapRef.current.classList.toggle("is-imagery", isImageryStyle(mapStyle));
            tileLayerRef.current = createBaseLayer(L, mapStyle);
            if (!live.current.plain) tileLayerRef.current.addTo(map);
            mapRef.current.classList.toggle("is-plain", Boolean(live.current.plain));

            map.createPane("neighborPane").style.zIndex = "300";
            map.getPane("neighborPane").style.pointerEvents = "none";
            loadNeighborMunicipalities().then((data) => {
                if (mapInstanceRef.current !== map || !data?.features) return;
                neighborLayerRef.current = L.geoJSON(data, {
                    pane: "neighborPane",
                    interactive: false,
                    style: { color: "#c4c0b8", weight: 1, dashArray: "4 4", opacity: 0.9, fill: true, fillColor: "#f4f2ee", fillOpacity: 0.55 },
                });
                if (live.current.plain) neighborLayerRef.current.addTo(map);
            });

            clupTileLayerRef.current = L.tileLayer("/tiles/clup_tiles/{z}/{x}/{y}.png", {
                maxZoom: 22,
                maxNativeZoom: 19,
                opacity: clupOpacity,
                pane: "clupPane",
                zIndex: 10,
                errorTileUrl: BLANK_TILE,
            });

            applicationsLayerRef.current = L.layerGroup().addTo(map);
            labelsLayerRef.current = L.layerGroup().addTo(map);
            verifiedParcelLayerRef.current = L.layerGroup().addTo(map);

            // The docks around the map open and close, so the canvas re-measures
            // whenever its box changes, not just on window resize.
            // The opening view shows the whole town. The docks around the canvas settle
            // after first paint, so it is re-fitted whenever the canvas changes size,
            // until the person pans or zooms for themselves.
            const touched = { current: false };
            map.on("dragstart", () => { touched.current = true; });
            mapRef.current.addEventListener("wheel", () => { touched.current = true; }, { passive: true });
            resizeObserver = new ResizeObserver(() => {
                map.invalidateSize({ pan: false });
                if (!touched.current && !live.current.selectedBgy?.name && rosarioBoundsRef.current) {
                    map.fitBounds(rosarioBoundsRef.current, { ...homePadding(), animate: false });
                }
            });
            resizeObserver.observe(mapRef.current);

            // Each layer draws the moment its own data arrives; the loaders are
            // cached promises shared with the 3D view.
            loadMunicipalBoundary().then((data) => {
                if (mapInstanceRef.current !== map || !data?.features) return;
                const styles = boundaryStyles(live.current.imagery, live.current.plain);
                outsideMaskRef.current = buildOutsideMask(L, data, "maskPane", styles.mask)?.addTo(map) ?? null;
                municipalHaloRef.current = L.geoJSON(data, { pane: "boundaryPane", interactive: false, style: styles.halo }).addTo(map);
                municipalLayerRef.current = L.geoJSON(data, { pane: "boundaryPane", interactive: false, style: styles.line }).addTo(map);
                rosarioBoundsRef.current = municipalLayerRef.current.getBounds();
                // Extra room east, west and south, where the info panel and attribute
                // table cover the canvas: framing a barangay there pans past the
                // edge, and a tight limit makes the camera snap back (a twitch).
                const b = rosarioBoundsRef.current.pad(0.15);
                const w = b.getEast() - b.getWest();
                const h = b.getNorth() - b.getSouth();
                map.setMaxBounds([[b.getSouth() - h * 0.25, b.getWest() - w * 0.6], [b.getNorth() + h * 0.4, b.getEast() + w * 0.6]]);
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
                                    lf.setStyle(hoverStyle(live.current.imagery));
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
                    map.fitBounds(geo.getBounds(), homePadding());
                    setBarangaysReady(true);

                    // Spend the idle time after first paint preparing what the
                    // next clicks need: the parcels and the 3D chunk.
                    whenIdle(() => {
                        if (mapInstanceRef.current !== map) return;
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

        // CLUP parcels are not drawn on selection for now; the pipeline below
        // stays wired, so re-enabling is just this condition.
        const needsParcels = false;
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
    }, [currentLayer, selectedBgy, showClup, clupOpacity, staticBgyData, demandCounts, lcColors, diversityLens, diversityBandFilter, zoningReady, barangaysReady, mapStyle, plain]);

    // ── Callout card on the selected barangay ──
    const calloutMarkerRef = useRef(null);
    const [calloutHost, setCalloutHost] = useState(null);
    useEffect(() => {
        const map = mapInstanceRef.current;
        const drop = () => {
            calloutMarkerRef.current?.remove();
            calloutMarkerRef.current = null;
            setCalloutHost(null);
        };
        if (!map || !geoLayerRef.current || !callout || !selectedBgy?.name) return drop();
        const target = selectedBgy.name.trim().toLowerCase();
        let match = null;
        geoLayerRef.current.eachLayer((lf) => { if (featureName(lf.feature).toLowerCase() === target) match = lf; });
        if (!match) return drop();
        import("leaflet").then((mod) => {
            if (mapInstanceRef.current !== map) return;
            const L = mod.default;
            calloutMarkerRef.current?.remove();
            const b = match.getBounds();
            // The pin is a point inside the barangay, always on the shape; the card
            // floats above the shape's top edge and its leader line runs down to the pin.
            const pt = labelPoint(match.feature?.geometry);
            const pin = pt ? L.latLng(pt[1], pt[0]) : b.getCenter();
            const marker = L.marker(pin, {
                pane: "popupPane",
                interactive: false,
                keyboard: false,
                icon: L.divIcon({ className: "imaps-callout-wrap", iconSize: [0, 0], html: "" }),
            }).addTo(map);
            const host = document.createElement("div");
            host.className = "imaps-callout-host";
            L.DomEvent.disableClickPropagation(host);
            L.DomEvent.disableScrollPropagation(host);
            marker.getElement().appendChild(host);
            // The dot is a real map point, so it sits exactly on the pin at every zoom;
            // the card only draws the line down to it.
            host.style.setProperty("--lc-dot", "none");
            host.style.setProperty("--lc-line", "none");
            // The leader is drawn from the pin itself, straight up to the card, so it
            // can never overshoot the dot.
            const stem = document.createElement("div");
            stem.className = "imaps-callout-stem";
            marker.getElement().appendChild(stem);
            const dot = L.circleMarker(pin, { pane: "popupPane", interactive: false, radius: 5, color: "#ffffff", weight: 2, fillColor: "#1e293b", fillOpacity: 1 }).addTo(map);
            marker.once("remove", () => dot.remove());
            const place = () => {
                const k = calloutScale();
                // pixels from the pin up to the top of the shape, plus a gap
                const rise = Math.max(0, map.latLngToContainerPoint(pin).y - map.latLngToContainerPoint([b.getNorth(), pin.lng]).y) + 26;
                // hold the card above the dot even when the pin is high up in the shape
                host.style.setProperty("--lc-leader", `${Math.round(rise / k)}px`);
                stem.style.height = `${Math.round(rise)}px`;
                // The card scales about the pin, so its own offset is the unscaled distance (rise / k).
                host.style.transform = `translate(-50%, calc(-100% - ${Math.round(rise / k)}px)) scale(${k.toFixed(2)})`;
                host.style.transformOrigin = `50% calc(100% + ${Math.round(rise / k)}px)`;
            };
            place();
            map.on("zoom move resize", place);
            marker.once("remove", () => map.off("zoom move resize", place));
            calloutMarkerRef.current = marker;
            setCalloutHost(host);
        });
        return undefined;
    }, [selectedBgy?.name, Boolean(callout), barangaysReady]);

    // ── Camera follows the selected barangay ──
    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !geoLayerRef.current) return;

        if (!selectedBgy?.name) {
            if (hadSelectionRef.current && rosarioBoundsRef.current) {
                if (prefersReducedMotion) map.fitBounds(rosarioBoundsRef.current, homePadding());
                else map.flyToBounds(rosarioBoundsRef.current, { ...homePadding(), duration: 0.9, easeLinearity: 0.15 });
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
        if (rosarioBoundsRef.current) map.fitBounds(rosarioBoundsRef.current, homePadding());
        else map.setView([13.785, 121.25], 12);
    }, [resetTrigger]);

    useEffect(() => {
        const map = mapInstanceRef.current;
        if (!map || !tileLayerRef.current) return;
        import("leaflet").then((mod) => {
            if (mapInstanceRef.current !== map) return;
            tileLayerRef.current.remove();
            tileLayerRef.current = createBaseLayer(mod.default, mapStyle);
            // Plain white: no basemap, the neighbouring towns as faint outlines.
            if (plain) {
                if (neighborLayerRef.current && !map.hasLayer(neighborLayerRef.current)) neighborLayerRef.current.addTo(map);
            } else {
                tileLayerRef.current.addTo(map).bringToBack();
                if (neighborLayerRef.current && map.hasLayer(neighborLayerRef.current)) map.removeLayer(neighborLayerRef.current);
            }

            const imagery = isImageryStyle(mapStyle) && !plain;
            const styles = boundaryStyles(imagery, plain);
            mapRef.current?.classList.toggle("is-imagery", imagery);
            mapRef.current?.classList.toggle("is-plain", plain);
            outsideMaskRef.current?.setStyle(styles.mask);
            municipalHaloRef.current?.setStyle(styles.halo);
            municipalLayerRef.current?.setStyle(styles.line);
        });
    }, [mapStyle, plain]);

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

        const { currentLayer: layer, diversityLens: lensId, diversityBandFilter: band, showLabels: on } = live.current;
        if (!on) return;

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
                    value = rank && !live.current.plain ? `${rank} LC` : "";
                } else {
                    rank = stat.total;
                    value = rank ? String(rank) : "";
                }
                candidates.push({ name, value, rank, center: lf.getBounds().getCenter() });
            });
            candidates.sort((a, b) => b.rank - a.rank);

            const placed = [];
            const namesOnly = live.current.plain && layer === "trends";
            candidates.forEach(({ name, value, center }) => {
                const pt = map.latLngToContainerPoint(center);
                const w = namesOnly ? name.length * 6.6 + 12 : Math.max(name.length, value.length) * 6.2 + 10;
                const h = namesOnly ? 18 : value ? 30 : 16;
                const box = { l: pt.x - w / 2, r: pt.x + w / 2, t: pt.y - h / 2, b: pt.y + h / 2 };
                // Names that would collide are skipped (busiest first) and appear on zoom-in.
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
                            html: `<div class="imaps-label${namesOnly ? " imaps-label-name" : ""}"><span>${escapeHtml(name)}</span>${value ? `<b>${escapeHtml(value)}</b>` : ""}</div>`,
                        }),
                    })
                );
            });
        });
    }, []);

    useEffect(() => {
        renderLabels();
    }, [currentLayer, diversityLens, diversityBandFilter, selectedBgy, showLabels, staticBgyData, demandCounts, barangaysReady, renderLabels, plain]);

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
        hit.setStyle(hoverStyle(live.current.imagery));
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

    // ── Application lots (tracking mode) ──
    // No point markers: an application shows only as its matched lot outline,
    // close in. Applications without a lot stay in the table and barangay counts.
    useEffect(() => {
        const map = mapInstanceRef.current;
        const group = applicationsLayerRef.current;
        if (!map || !group) return;
        group.clearLayers();
        if (currentLayer !== "status" || !lotsByZoom) return;
        const selName = (selectedBgy?.name || "").trim().toLowerCase();
        const visible = (applications || []).filter(
            (app) => app.parcels?.[0]?.outline
                && matchesAppFilters(app, appTypeFilter, statusFilter)
                && (!selName || (app?.barangay || "").trim().toLowerCase() === selName)
        );

        let stale = false;
        import("leaflet").then((mod) => {
            if (stale) return;
            const L = mod.default;

            visible.forEach((app) => {
                const isSelected = selectedAppId === app.id;
                const isHovered = hoveredAppId === app.id;
                const cfg = getStatusMarkerConfig(app.status);
                const layer = L.geoJSON(app.parcels[0].outline, {
                    pane: "appsPane",
                    style: () => ({
                        color: isSelected ? SELECT_STROKE : cfg.border,
                        weight: isSelected || isHovered ? 2.6 : 1.6,
                        fillColor: cfg.color,
                        fillOpacity: isHovered || isSelected ? 0.55 : 0.35,
                    }),
                });

                layer.on("click", (e) => {
                    L.DomEvent.stopPropagation(e);
                    live.current.onInspectApp?.(app);
                });
                layer.on("mouseover", () => live.current.onHoverApp?.(app.id));
                layer.on("mouseout", () => live.current.onHoverApp?.(null));
                group.addLayer(layer);
            });
        });
        return () => {
            stale = true;
        };
    }, [currentLayer, applications, appTypeFilter, statusFilter, selectedBgy, hoveredAppId, selectedAppId, barangaysReady, lotsByZoom]);

    return (
        <>
            <style>{MAP_CSS}</style>
            {calloutHost && callout && createPortal(callout, calloutHost)}
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
        </>
    );
}

const MAP_CSS = `
.imaps-map.leaflet-container { background: #f2f3f5; font: inherit; }
.imaps-map.is-imagery.leaflet-container { background: #0f172a; }
.imaps-map.is-plain.leaflet-container { background: radial-gradient(ellipse at 50% 45%, #ffffff 0%, #ffffff 52%, #f3f1ed 100%); }
.imaps-callout-wrap { background: transparent; border: 0; }
.imaps-callout-stem { position: absolute; left: 0; bottom: 0; width: 1px; margin-left: -0.5px; background: rgba(71, 85, 105, 0.7); pointer-events: none; }
.imaps-callout-host { position: absolute; left: 0; top: 0; transform: translate(-50%, calc(-100% - 26px)); pointer-events: auto; }
.imaps-label-name { font-family: "Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif; text-shadow: none; }
.imaps-label-name span { font-size: 11px; font-weight: 600; color: #1e293b; paint-order: stroke fill; -webkit-text-stroke: 3px rgba(255, 255, 255, 0.88); }
.imaps-tiles-gray { filter: grayscale(1) brightness(1.06) contrast(0.88); }
.imaps-tiles-imagery { filter: saturate(0.85) contrast(1.05) brightness(0.95); }
.imaps-map .leaflet-interactive { transition: fill 240ms ease, fill-opacity 240ms ease, stroke-width 160ms ease; }
.imaps-map .leaflet-interactive.imaps-deadspace { pointer-events: none !important; }

.imaps-pin-wrap, .imaps-label-wrap { background: transparent; border: 0; }
.leaflet-marker-icon:focus-visible { outline: 2px solid #0b2a5b; outline-offset: 2px; }
.imaps-label { transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; line-height: 1.15; white-space: nowrap; pointer-events: none;
  text-shadow: 0 0 2px #fff, 0 0 2px #fff, 0 0 3px #fff, 0 0 4px #fff; }
.imaps-label span { font-size: 10.5px; font-weight: 600; color: #1f2937; }
.imaps-label b { font-size: 11.5px; font-weight: 700; color: #0b2a5b; font-variant-numeric: tabular-nums; }
.is-imagery .imaps-label { text-shadow: 0 0 2px rgba(2, 6, 23, 0.9), 0 0 3px rgba(2, 6, 23, 0.8), 0 1px 4px rgba(2, 6, 23, 0.6); }
.is-imagery .imaps-label span { color: #f8fafc; }
.is-imagery .imaps-label b { color: #fde68a; }

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
  .imaps-map .leaflet-interactive, .imaps-skeleton { transition: none; animation: none; }
}
`;
