import React, { useEffect, useRef, useState, useCallback } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { getLens, resolveLensValue, DIVERSITY_LENSES } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import useReducedMotion from "@/utils/useReducedMotion";
import { loadBarangayBoundaries, resolveBarangayName } from "@/utils/mapData";

// Configure MapLibre Web Worker for Vite bundling
try {
    setWorkerUrl(workerUrl);
} catch (e) {
    console.warn("MapLibre setWorkerUrl fallback:", e);
}

// Official Center for Rosario, Batangas — also the fixed idle/deselected framing.
const ROSARIO_CENTER = [121.258, 13.805];
const DEFAULT_PITCH = 54;
const DEFAULT_BEARING = -18;

// The canvas is a flat, solid ground plane. There is no basemap: aerial
// imagery underneath coloured prisms competed with the very fills that carry
// the meaning, and left the view looking like two maps fighting. Rosario's
// barangays now sit isolated on a clean sheet.
const CANVAS = "#f8f9fa";
const GROUND = "#eef1f4";
const INK = "#0f172a";
const HAIRLINE = "#cbd5e1";

const SRC_PRISMS = "diversity-source";
const SRC_LABELS = "diversity-centroids";
const SRC_PARCELS = "clup-parcels";
const LYR_PRISMS = "diversity-prisms";
const LYR_FOOTPRINTS = "diversity-footprints";
const LYR_LABELS = "diversity-labels";
const LYR_PARCELS = "clup-parcels-extrusion";
const LYR_PARCEL_LINES = "clup-parcels-lines";

// Motion constants, so the whole scene shares one rhythm.
const MORPH_MS = 650;
const FADE_MS = 260;
const FLIGHT_MS = 1100;
const ORBIT_DEG_PER_SEC = 7.5;
const PARCEL_HEIGHT = 190;

const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

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

// Area-weighted centroid of a polygon ring (the standard shoelace formula).
//
// Replaces a plain average of the ring's vertices, which pulls the point toward
// whichever edge happens to be most finely sampled — noticeable on barangays
// with one detailed boundary and three straight ones, where labels drifted off
// centre and the camera framed the wrong part of the shape.
function ringCentroid(ring) {
    let twiceArea = 0;
    let x = 0;
    let y = 0;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [x0, y0] = ring[j];
        const [x1, y1] = ring[i];
        const cross = x0 * y1 - x1 * y0;
        twiceArea += cross;
        x += (x0 + x1) * cross;
        y += (y0 + y1) * cross;
    }

    if (twiceArea === 0) {
        // Degenerate ring (collinear or a single point): fall back to the mean.
        const sum = ring.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]], [0, 0]);
        return [sum[0] / ring.length, sum[1] / ring.length];
    }

    return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function ringArea(ring) {
    let twiceArea = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        twiceArea += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    }
    return Math.abs(twiceArea / 2);
}

function polygonCentroid(feature) {
    const stored = feature.properties?.centroid;
    if (Array.isArray(stored) && stored.length === 2) return stored;

    const geom = feature.geometry;
    if (!geom || !geom.coordinates) return ROSARIO_CENTER;

    // For a MultiPolygon take the largest part: a barangay with an offshore
    // sliver should be labelled on its mainland, not between the two.
    let ring;
    if (geom.type === "Polygon") {
        ring = geom.coordinates[0];
    } else if (geom.type === "MultiPolygon") {
        let best = null;
        let bestArea = -1;
        geom.coordinates.forEach((poly) => {
            const outer = poly[0];
            if (!outer || outer.length < 3) return;
            const a = ringArea(outer);
            if (a > bestArea) { bestArea = a; best = outer; }
        });
        ring = best;
    }

    if (!ring || ring.length < 3) return ROSARIO_CENTER;
    return ringCentroid(ring);
}

const EMPTY_FC = { type: "FeatureCollection", features: [] };

// Builds the rendered FeatureCollection from the raw geometry plus the live
// backend stats.
//
// Note it is *lens-independent*: every lens's height, colour, band and label
// are baked in side by side (`h_mix`/`h_drift`, `c_mix`/`c_drift`, …) and the
// paint expressions pick which pair to read. That matters for motion — MapLibre
// only animates `fill-extrusion-height-transition` when the *paint property*
// changes, not when the source data changes, so rebuilding the data on every
// lens switch made all 48 prisms jump to their new heights instantly. Switching
// an expression against stable data lets the GPU morph them, and leaves
// feature-state (selection, hover) untouched.
//
// The geometry file still ships a baked `diversity`/`height`/`color` from the
// day it was exported; none of it is read. Everything derives from bgyStats,
// which MapsController recomputes on every request — so the prisms and the
// side panel can never disagree about a barangay's score.
//
// Every value written into `properties` is a scalar: MapLibre serialises nested
// arrays and objects to JSON strings on the way out of queryRenderedFeatures.
function buildFeatures(baseGeo, bgyStats) {
    const features = (baseGeo?.features || []).map((f, idx) => {
        const name = resolveBarangayName(f.properties);
        const stat = bgyStats?.[name] || {};
        const centroid = polygonCentroid(f);

        const props = {
            name,
            permitCount: stat.permitCount ?? stat.Total ?? 0,
            clusterName: stat.cluster?.name || "",
            clusterColor: stat.cluster?.color || "#64748b",
            primaryZone: stat.Primary_Zone || "",
            cx: centroid[0],
            cy: centroid[1],
        };

        DIVERSITY_LENSES.forEach((lensDef) => {
            const r = resolveLensValue(lensDef.id, stat);
            props[`h_${lensDef.id}`] = r.height;
            props[`c_${lensDef.id}`] = r.color;
            props[`b_${lensDef.id}`] = r.band.id;
            props[`l_${lensDef.id}`] = r.formatted;
            props[`cls_${lensDef.id}`] = r.band.classification;
        });

        return {
            type: "Feature",
            // `gid` is the boundary table's primary key; stable ids matter
            // because feature-state (hover, selection) is keyed by them.
            id: f.properties?.gid ?? (typeof f.id === "number" ? f.id : idx + 1),
            geometry: f.geometry,
            properties: props,
        };
    });

    return { type: "FeatureCollection", features };
}

function toCentroidCollection(fc) {
    return {
        type: "FeatureCollection",
        features: fc.features.map((f) => ({
            type: "Feature",
            id: f.id,
            geometry: { type: "Point", coordinates: [f.properties.cx, f.properties.cy] },
            properties: { ...f.properties },
        })),
    };
}


// Parcels of one barangay, coloured by official flat CLUP category.
//
// The endpoint already scopes by barangay, so the filter below is a defensive
// fallback for the case where the query parameter is dropped and the full
// municipal set comes back.
function buildParcelFeatures(parcelGeo, barangayName) {
    if (!parcelGeo?.features || !barangayName) return EMPTY_FC;
    const target = barangayName.trim().toLowerCase();

    const features = parcelGeo.features
        .filter((f) => {
            const p = f.properties || {};
            const loc = (p.location || p.LOCATION || p.barangay || "").trim().toLowerCase();
            return loc === target;
        })
        .map((f, idx) => {
            const p = f.properties || {};
            const code = p.lup_2030 || p.LUP_2030 || p.zone_code || p.zone || "";
            const zone = getZoneInfo(code);
            return {
                type: "Feature",
                id: idx + 1,
                geometry: f.geometry,
                properties: {
                    zoneCode: zone.code,
                    zoneLabel: zone.label,
                    fill: zone.fill,
                    stroke: zone.stroke,
                },
            };
        });

    return { type: "FeatureCollection", features };
}

export default function MapLibre3DView({
    // False while the view is kept mounted but hidden behind the 2D map.
    active = true,
    selectedBgy,
    onFeatureClick,
    onMapClick,
    bgyStats = {},
    rightPanelOpen,
    panelWidth = 380,
    lens = "mix",
    bandFilter = "all",
    hoveredBgy = null,
    onHoverBgy = () => {},
    onParcelsVisible = () => {},
}) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);

    const baseGeoRef = useRef(null);
    const parcelCacheRef = useRef({});
    const parcelFetchRef = useRef({});
    const featureIndexRef = useRef({});
    const hoveredIdRef = useRef(null);
    const selectedIdRef = useRef(null);
    const selectedNameRef = useRef(null);

    const lensRef = useRef(lens);
    const bandRef = useRef(bandFilter);
    const reducedRef = useRef(false);
    const styleReadyRef = useRef(false);
    const flightTargetRef = useRef(null);
    const lastFlownRef = useRef(null);
    // Tracks whether a barangay was selected a moment ago, so the deselect
    // branch above can tell "just cleared" apart from "already empty".
    const hadSelectionRef = useRef(false);
    const isFlatRef = useRef(false);
    const hasEnteredRef = useRef(false);

    const orbitRafRef = useRef(null);
    const orbitLastTsRef = useRef(0);

    // Hover position is written straight to the DOM node; only the *content*
    // lives in React state, keyed by barangay, so moving the mouse across one
    // prism re-renders nothing.
    const hoverElRef = useRef(null);
    const hoverRafRef = useRef(null);
    const hoverPointRef = useRef({ x: 0, y: 0 });

    // The map's event handlers are bound once, in the init effect. Reading the
    // callbacks through a ref keeps them current; captured directly, a click
    // would forever see the first render's props (which, for `rightPanelOpen`,
    // meant the panel re-opened itself every time even after being closed).
    const callbacksRef = useRef({});
    callbacksRef.current = { onFeatureClick, onMapClick, onHoverBgy, onParcelsVisible };

    const prefersReducedMotion = useReducedMotion();

    const [isOrbiting, setIsOrbiting] = useState(false);
    const [currentBearing, setCurrentBearing] = useState(DEFAULT_BEARING);
    const [currentPitch, setCurrentPitch] = useState(DEFAULT_PITCH);
    const [hoverCard, setHoverCard] = useState(null);
    const [loadState, setLoadState] = useState("loading");

    useEffect(() => { reducedRef.current = prefersReducedMotion; }, [prefersReducedMotion]);

    // ── Paint expressions ────────────────────────────────────────────────────
    // Each is applied once per user action, never per animation frame — that
    // per-frame re-authoring is what used to make the prisms crawl.

    const heightExpression = useCallback((lensId, flat) => {
        if (flat) return 0;
        return ["to-number", ["get", `h_${lensId}`]];
    }, []);

    const colorExpression = useCallback((lensId) => [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        INK,
        ["coalesce", ["get", `c_${lensId}`], "#94a3b8"],
    ], []);

    const opacityExpression = useCallback((lensId, band, hasSelection) => {
        if (hasSelection) {
            // Isolation: the selected prism remains fully visible while
            // everything else disappears rather than staying visible underneath 
            // — the band filter is moot while one barangay has the floor.
            return ["case", ["boolean", ["feature-state", "selected"], false], 0.98, 0];
        }
        if (!band || band === "all") {
            return [
                "case",
                ["boolean", ["feature-state", "hover"], false], 0.98,
                0.92,
            ];
        }
        return [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.98,
            ["==", ["get", `b_${lensId}`], band], 0.95,
            0.12,
        ];
    }, []);

    // One place that pushes the active lens and band filter into the layers.
    // Switching expressions against stable data is what lets the declared
    // transitions animate the change.
    const applyPaint = useCallback(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current || !map.getLayer(LYR_PRISMS)) return;

        const lensId = lensRef.current;
        const band = bandRef.current;
        const selectedName = selectedNameRef.current;
        const hasSelection = Boolean(selectedName);

        map.setPaintProperty(LYR_PRISMS, "fill-extrusion-height", heightExpression(lensId, isFlatRef.current));
        map.setPaintProperty(LYR_PRISMS, "fill-extrusion-color", colorExpression(lensId));
        map.setPaintProperty(LYR_PRISMS, "fill-extrusion-opacity", opacityExpression(lensId, band, hasSelection));

        // Parcels have to flatten with everything else. Pinned at a constant
        // height they stayed standing as 190m blocks over an otherwise flat map
        // whenever the camera went top-down with a barangay selected.
        if (map.getLayer(LYR_PARCELS)) {
            map.setPaintProperty(
                LYR_PARCELS,
                "fill-extrusion-height",
                0
            );
        }

        if (map.getLayer(LYR_FOOTPRINTS)) {
            // Boundary hairlines follow the same isolation as the fill — a
            // ghost outline of every other barangay would still be "showing"
            // them, just faintly.
            //
            // In Oblique/Dramatic the hairlines are also hidden outright, even
            // with nothing selected. Real barangay boundaries frequently follow
            // rivers, so at full height the pale hairline tangles into a
            // distracting network of light lines threading across the terrain
            // — and it's redundant there anyway, since the prisms' own walls
            // and height differences already separate one barangay from the
            // next. Top-Down keeps them: flattened to a choropleth, the walls
            // are gone, and the boundary is the only thing left marking where
            // one barangay ends and another begins.
            const showAllBoundaries = isFlatRef.current && !hasSelection;
            map.setPaintProperty(
                LYR_FOOTPRINTS,
                "line-opacity",
                showAllBoundaries
                    ? 0.95
                    : ["case", ["boolean", ["feature-state", "selected"], false], 1, 0]
            );
        }

        if (map.getLayer(LYR_LABELS)) {
            // Layout properties don't transition, but the label text has to
            // follow the lens or the number beside a barangay would be stale.
            map.setLayoutProperty(LYR_LABELS, "text-field", [
                "concat", ["get", "name"], "   ", ["get", `l_${lensId}`],
            ]);
            // The centroid-labels source never receives feature-state (only
            // the prisms source does — feature-state is scoped per source, not
            // shared across them even when the ids line up), so isolation here
            // compares the label's own `name` property against the selected
            // name directly rather than reading `feature-state.selected`.
            map.setPaintProperty(
                LYR_LABELS,
                "text-opacity",
                hasSelection
                    ? ["case", ["==", ["get", "name"], selectedName], 1, 0]
                    : (!band || band === "all" ? 1 : ["case", ["==", ["get", `b_${lensId}`], band], 1, 0.15])
            );
        }
    }, [heightExpression, colorExpression, opacityExpression]);

    const syncSourceData = useCallback(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current || !baseGeoRef.current) return;
        const src = map.getSource(SRC_PRISMS);
        const labelSrc = map.getSource(SRC_LABELS);
        if (!src) return;

        const fc = buildFeatures(baseGeoRef.current, bgyStats);

        const index = {};
        fc.features.forEach((f) => {
            let bounds = null;
            if (f.geometry) {
                const coords = f.geometry.type === "Polygon" ? f.geometry.coordinates : (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.flat(1) : []);
                if (coords.length > 0) {
                    let totalArea = 0;
                    coords.forEach(ring => {
                        let ringArea = 0;
                        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                            ringArea += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
                        }
                        totalArea += Math.abs(ringArea / 2);
                    });

                    const effectiveSize = Math.max(Math.sqrt(totalArea), 0.001);

                    // Base zoom 12.6 fits ~0.05 degrees effective size.
                    let optimalZoom = 12.6 - Math.log2(effectiveSize / 0.05);

                    // Cap zoom to prevent super-zooming into small barangays
                    optimalZoom = Math.max(12.0, Math.min(13.2, optimalZoom - 0.3));
                    bounds = { optimalZoom };
                }
            }

            index[f.properties.name.toLowerCase()] = {
                id: f.id,
                centroid: [f.properties.cx, f.properties.cy],
                bounds,
                properties: f.properties,
            };
        });
        featureIndexRef.current = index;

        src.setData(fc);
        if (labelSrc) labelSrc.setData(toCentroidCollection(fc));

        // setData clears every feature-state on the source, which would silently
        // drop the selected prism's state on a data refresh.
        if (selectedIdRef.current !== null) {
            map.setFeatureState({ source: SRC_PRISMS, id: selectedIdRef.current }, { selected: true });
        }
        if (hoveredIdRef.current !== null) {
            map.setFeatureState({ source: SRC_PRISMS, id: hoveredIdRef.current }, { hover: true });
        }
    }, [bgyStats]);

    // Parcel geometry is fetched per barangay, lazily, and cached by name.
    //
    // This used to pull every parcel in the municipality (513 of them) and
    // filter client-side on each click. The endpoint now scopes in PostGIS, so
    // a selection transfers only that barangay's parcels — 13 for Alupay rather
    // than 513 — and there is no full scan per selection.
    const fetchParcelsFor = useCallback((name) => {
        const key = name.toLowerCase();
        const cached = parcelCacheRef.current[key];
        if (cached) return Promise.resolve(cached);

        const inFlight = parcelFetchRef.current[key];
        if (inFlight) return inFlight;

        const req = fetch(`/api/map/land_use_plan?barangay=${encodeURIComponent(name)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((data) => {
                const parcels = data ? buildParcelFeatures(ensureRFC7946Winding(data), name) : EMPTY_FC;
                parcelCacheRef.current[key] = parcels;
                return parcels;
            })
            .catch(() => {
                // Parcels are an enhancement; the prisms still work without them.
                parcelCacheRef.current[key] = EMPTY_FC;
                return EMPTY_FC;
            })
            .finally(() => {
                delete parcelFetchRef.current[key];
            });

        parcelFetchRef.current[key] = req;
        return req;
    }, []);

    const showParcelsFor = useCallback((name) => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current) return;
        const src = map.getSource(SRC_PARCELS);
        if (!src) return;

        if (!name) {
            src.setData(EMPTY_FC);
            callbacksRef.current.onParcelsVisible?.(false);
            return;
        }

        fetchParcelsFor(name).then((parcels) => {
            // The selection may have moved on while the request was in flight.
            if (selectedNameRef.current !== name) return;
            const stillThere = mapRef.current && mapRef.current.getSource(SRC_PARCELS);
            if (!stillThere) return;
            stillThere.setData(parcels);
            callbacksRef.current.onParcelsVisible?.(parcels.features.length > 0);
        });
    }, [fetchParcelsFor]);

    // ── Camera ───────────────────────────────────────────────────────────────

    const cameraPadding = useCallback(() => {
        const map = mapRef.current;
        const w = map ? map.getCanvas().clientWidth : 1000;
        const h = map ? map.getCanvas().clientHeight : 800;

        return {
            top: Math.min(100, h * 0.2),
            bottom: Math.min(120, h * 0.2),
            left: Math.min(320, w * 0.35),
            right: Math.min(rightPanelOpen ? panelWidth + 50 : 70, w * 0.45),
        };
    }, [rightPanelOpen, panelWidth]);

    const flyToBarangay = useCallback((name) => {
        const map = mapRef.current;
        if (!map) return;
        const entry = featureIndexRef.current[(name || "").toLowerCase()];
        if (!entry) return;

        if (flightTargetRef.current === entry.id) return;
        flightTargetRef.current = entry.id;

        let calculatedZoom = 13.5;
        if (entry.bounds && entry.bounds.optimalZoom) {
            calculatedZoom = entry.bounds.optimalZoom;
        }

        const target = {
            center: entry.centroid,
            zoom: calculatedZoom,
            pitch: 0,
            bearing: 0,
            padding: cameraPadding(),
        };

        if (reducedRef.current) {
            map.jumpTo(target);
            flightTargetRef.current = null;
            return;
        }

        map.stop();
        map.easeTo({ ...target, duration: FLIGHT_MS, easing: easeSine, essential: true });
        map.once("moveend", () => { flightTargetRef.current = null; });
    }, [cameraPadding]);

    const frameMunicipality = useCallback((animate = true) => {
        const map = mapRef.current;
        if (!map) return;
        // Always the same fixed idle framing — the exact center/zoom/pitch/
        // bearing the view opens at on load. This used to be recomputed on
        // every deselect via cameraForBounds(ROSARIO_BOUNDS, { padding }),
        // which pulls the zoom in further (more zoomed OUT) whenever the
        // right panel is open and eating into that padding — so clicking
        // empty space to deselect would zoom out further than the map's own
        // resting size. A fixed target makes "deselected" always look like
        // the initial view, regardless of panel state.
        const target = { center: ROSARIO_CENTER, zoom: 11.5, pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING };
        target.padding = cameraPadding();

        if (!animate || reducedRef.current) {
            map.jumpTo(target);
            return;
        }
        map.stop();
        map.easeTo({ ...target, duration: FLIGHT_MS, easing: easeSine, essential: true });
    }, [cameraPadding]);

    // ── Layer setup ──────────────────────────────────────────────────────────

    const setupLayers = useCallback((map) => {
        const fc = buildFeatures(baseGeoRef.current, bgyStats);

        const index = {};
        fc.features.forEach((f) => {
            let bounds = null;
            if (f.geometry) {
                const coords = f.geometry.type === "Polygon" ? f.geometry.coordinates : (f.geometry.type === "MultiPolygon" ? f.geometry.coordinates.flat(1) : []);
                if (coords.length > 0) {
                    let totalArea = 0;
                    coords.forEach(ring => {
                        let ringArea = 0;
                        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
                            ringArea += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
                        }
                        totalArea += Math.abs(ringArea / 2);
                    });

                    const effectiveSize = Math.max(Math.sqrt(totalArea), 0.001);
                    let optimalZoom = 12.6 - Math.log2(effectiveSize / 0.05);
                    // Cap zoom to prevent super-zooming into small barangays
                    optimalZoom = Math.max(12.0, Math.min(13.2, optimalZoom - 0.3));
                    bounds = { optimalZoom };
                }
            }

            index[f.properties.name.toLowerCase()] = {
                id: f.id,
                centroid: [f.properties.cx, f.properties.cy],
                bounds,
                properties: f.properties,
            };
        });
        featureIndexRef.current = index;

        if (!map.getSource(SRC_PRISMS)) map.addSource(SRC_PRISMS, { type: "geojson", data: fc });
        if (!map.getSource(SRC_LABELS)) map.addSource(SRC_LABELS, { type: "geojson", data: toCentroidCollection(fc) });
        if (!map.getSource(SRC_PARCELS)) map.addSource(SRC_PARCELS, { type: "geojson", data: EMPTY_FC });

        // Ground plate: a flat wash under the municipality so the prisms have
        // something to stand on rather than floating on the page.
        if (!map.getLayer("diversity-ground")) {
            map.addLayer({
                id: "diversity-ground",
                type: "fill",
                source: SRC_PRISMS,
                paint: { "fill-color": GROUND, "fill-opacity": 1 },
            });
        }

        if (!map.getLayer(LYR_PRISMS)) {
            map.addLayer({
                id: LYR_PRISMS,
                type: "fill-extrusion",
                source: SRC_PRISMS,
                paint: {
                    // Starts flat so the town can rise out of the ground once.
                    "fill-extrusion-height": 0,
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": colorExpression(lensRef.current),
                    "fill-extrusion-opacity": 0.92,
                    "fill-extrusion-vertical-gradient": true,
                    // Declared once. Nothing re-authors these at runtime.
                    "fill-extrusion-height-transition": { duration: MORPH_MS, delay: 0 },
                    "fill-extrusion-color-transition": { duration: MORPH_MS, delay: 0 },
                    "fill-extrusion-opacity-transition": { duration: FADE_MS, delay: 0 },
                },
            });
        }

        // Selected barangay's CLUP parcels, standing where its prism was.
        if (!map.getLayer(LYR_PARCELS)) {
            map.addLayer({
                id: LYR_PARCELS,
                type: "fill-extrusion",
                source: SRC_PARCELS,
                paint: {
                    "fill-extrusion-height": isFlatRef.current ? 0 : PARCEL_HEIGHT,
                    "fill-extrusion-base": 0,
                    "fill-extrusion-color": ["coalesce", ["get", "fill"], "#cbd5e1"],
                    "fill-extrusion-opacity": 0.95,
                    "fill-extrusion-vertical-gradient": true,
                    "fill-extrusion-height-transition": { duration: MORPH_MS, delay: 120 },
                },
            });
        }

        if (!map.getLayer(LYR_PARCEL_LINES)) {
            map.addLayer({
                id: LYR_PARCEL_LINES,
                type: "line",
                source: SRC_PARCELS,
                paint: { "line-color": "#ffffff", "line-width": 0.6, "line-opacity": 0.55 },
            });
        }

        if (!map.getLayer(LYR_FOOTPRINTS)) {
            map.addLayer({
                id: LYR_FOOTPRINTS,
                type: "line",
                source: SRC_PRISMS,
                paint: {
                    // Dark hairlines, not the white ones the satellite basemap
                    // needed — on a light canvas white boundaries vanish.
                    "line-color": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false], INK,
                        HAIRLINE,
                    ],
                    "line-width": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false], 2.4,
                        ["boolean", ["feature-state", "hover"], false], 1.8,
                        0.9,
                    ],
                    // Starts hidden (matches applyPaint's Oblique/Dramatic
                    // case) since the scene opens at DEFAULT_PITCH, which is
                    // oblique. applyPaint's first pass — fired once the style
                    // settles — is what actually reveals them if the camera
                    // starts or moves into Top-Down.
                    "line-opacity": 0,
                    "line-width-transition": { duration: FADE_MS, delay: 0 },
                    "line-color-transition": { duration: FADE_MS, delay: 0 },
                    // Without this, toggling Top-Down <-> Oblique/Dramatic pops
                    // the boundaries in and out instantly instead of fading —
                    // the only opacity property in this layer that was missing
                    // its matching transition.
                    "line-opacity-transition": { duration: FADE_MS, delay: 0 },
                },
            });
        }

        if (!map.getLayer(LYR_LABELS)) {
            map.addLayer({
                id: LYR_LABELS,
                type: "symbol",
                source: SRC_LABELS,
                layout: {
                    "text-field": ["concat", ["get", "name"], "   ", ["get", "valueLabel"]],
                    "text-font": ["Noto Sans Regular"],
                    "text-size": ["interpolate", ["linear"], ["zoom"], 11, 10, 13, 11.5, 15, 13],
                    "text-offset": [0, -1.1],
                    "text-anchor": "bottom",
                    "text-allow-overlap": false,
                    "text-max-width": 9,
                },
                paint: {
                    // Dark ink with a light halo, inverted for the light canvas.
                    "text-color": INK,
                    "text-halo-color": CANVAS,
                    "text-halo-width": 2,
                    "text-halo-blur": 0.4,
                    "text-opacity": 1,
                    "text-opacity-transition": { duration: FADE_MS, delay: 0 },
                },
            });
        }
    }, [bgyStats, colorExpression]);

    // ── Init ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = new MapLibreMap({
            container: mapContainerRef.current,
            // No raster sources at all: a solid background layer is the entire
            // basemap.
            style: {
                version: 8,
                glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
                sources: {},
                layers: [{ id: "canvas", type: "background", paint: { "background-color": CANVAS } }],
            },
            center: ROSARIO_CENTER,
            zoom: 11.5,
            pitch: DEFAULT_PITCH,
            bearing: DEFAULT_BEARING,
            maxPitch: 75,
            antialias: true,
            attributionControl: false,
        });

        mapRef.current = map;

        loadBarangayBoundaries()
            .then((raw) => {
                if (raw && raw.features && raw.features.length) return raw;
                // Fall back to the bundled export if PostGIS is unreachable, so
                // the view still renders rather than showing an error card.
                console.warn("Falling back to bundled barangay geometry");
                return fetch("/geojson/rosario_3d_diversity_extrusions.geojson").then((r) => r.json());
            })
            .then((raw) => {
                if (!raw || !raw.features) throw new Error("No barangay geometry");
                baseGeoRef.current = ensureRFC7946Winding(raw);

                let fired = false;
                const onReady = () => {
                    if (fired || !mapRef.current) return;
                    fired = true;
                    styleReadyRef.current = true;

                    if (map.setLight) {
                        try {
                            // Softer, higher-key lighting to suit a light ground
                            // plane; the old warm key was tuned for satellite.
                            map.setLight({ anchor: "viewport", color: "#ffffff", intensity: 0.55, position: [1.5, 200, 40] });
                        } catch (e) { /* older style spec */ }
                    }

                    setupLayers(map);
                    setLoadState("ready");
                    frameMunicipality(!reducedRef.current);

                    const enter = () => {
                        if (hasEnteredRef.current || !mapRef.current) return;
                        hasEnteredRef.current = true;
                        applyPaint();
                    };
                    map.once("idle", enter);
                    setTimeout(enter, 1800);
                };

                if (map.isStyleLoaded()) onReady();
                else {
                    map.once("styledata", onReady);
                    map.once("load", onReady);
                }
            })
            .catch((err) => {
                console.error("Error loading 3D diversity geometry:", err);
                setLoadState("error");
            });

        // ── Interaction ──────────────────────────────────────────────────────

        const handleMove = (e) => {
            if (!e.features || !e.features.length) return;
            const feat = e.features[0];
            const name = feat.properties.name;

            if (selectedNameRef.current && selectedNameRef.current.toLowerCase() !== name.toLowerCase()) {
                handleLeave();
                return;
            }

            map.getCanvas().style.cursor = "pointer";

            hoverPointRef.current = { x: e.point.x, y: e.point.y };
            if (hoverRafRef.current === null) {
                hoverRafRef.current = requestAnimationFrame(() => {
                    hoverRafRef.current = null;
                    const el = hoverElRef.current;
                    if (!el) return;
                    const { x, y } = hoverPointRef.current;
                    const rect = map.getCanvas().getBoundingClientRect();
                    const flipX = x > rect.width - 150;
                    const flipY = y < 180;
                    el.style.transform = `translate3d(${x}px, ${y}px, 0) translate(${flipX ? "-100%" : "-50%"}, ${flipY ? "14px" : "-100%"})`;
                });
            }

            if (hoveredIdRef.current === feat.id) return;

            if (hoveredIdRef.current !== null) {
                map.setFeatureState({ source: SRC_PRISMS, id: hoveredIdRef.current }, { hover: false });
            }
            hoveredIdRef.current = feat.id;
            map.setFeatureState({ source: SRC_PRISMS, id: feat.id }, { hover: true });

            setHoverCard(feat.properties);
            callbacksRef.current.onHoverBgy?.(feat.properties.name);
        };

        const handleLeave = () => {
            map.getCanvas().style.cursor = "";
            if (hoveredIdRef.current !== null) {
                map.setFeatureState({ source: SRC_PRISMS, id: hoveredIdRef.current }, { hover: false });
                hoveredIdRef.current = null;
            }
            setHoverCard(null);
            callbacksRef.current.onHoverBgy?.(null);
        };

        const handleClick = (e) => {
            if (!e.features || !e.features.length) return;
            const name = e.features[0].properties.name;
            // Any click that lands on a prism selects that barangay directly —
            // including switching straight from one selected barangay to
            // another. This used to treat "clicked a different barangay than
            // the one already selected" as a background click, which deselected
            // and flew the camera all the way back out to the municipal view
            // instead of flying to the newly-clicked one.
            // Selection is state; the camera reacts to state in one place. This
            // handler deliberately does not move the camera itself.
            callbacksRef.current.onFeatureClick?.(name);
        };

        const handleBackgroundClick = (e) => {
            const layers = [LYR_PRISMS, LYR_LABELS, LYR_PARCELS].filter((id) => map.getLayer(id));
            if (!layers.length) return;
            if (map.queryRenderedFeatures(e.point, { layers }).length === 0) callbacksRef.current.onMapClick?.();
        };

        map.on("mousemove", LYR_PRISMS, handleMove);
        map.on("mouseleave", LYR_PRISMS, handleLeave);
        map.on("click", LYR_PRISMS, handleClick);
        map.on("click", handleBackgroundClick);

        map.on("moveend", () => {
            setCurrentBearing(Math.round(map.getBearing()));
            const p = Math.round(map.getPitch());
            setCurrentPitch(p);

            // Flatten only when the view has actually settled top-down, with
            // hysteresis so grazing the threshold mid-flight doesn't collapse
            // the whole town. One transition, not sixty.
            const flat = isFlatRef.current ? p < 25 : p < 12;
            if (flat !== isFlatRef.current) {
                isFlatRef.current = flat;
                applyPaint();
            }
        });

        const stopOrbitOnInput = () => {
            if (orbitRafRef.current !== null) {
                cancelAnimationFrame(orbitRafRef.current);
                orbitRafRef.current = null;
                setIsOrbiting(false);
            }
        };
        const canvas = map.getCanvas();
        canvas.addEventListener("mousedown", stopOrbitOnInput);
        canvas.addEventListener("wheel", stopOrbitOnInput, { passive: true });
        canvas.addEventListener("touchstart", stopOrbitOnInput, { passive: true });

        const handleVisibility = () => { if (document.hidden) stopOrbitOnInput(); };
        document.addEventListener("visibilitychange", handleVisibility);

        return () => {
            if (orbitRafRef.current !== null) cancelAnimationFrame(orbitRafRef.current);
            if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
            canvas.removeEventListener("mousedown", stopOrbitOnInput);
            canvas.removeEventListener("wheel", stopOrbitOnInput);
            canvas.removeEventListener("touchstart", stopOrbitOnInput);
            document.removeEventListener("visibilitychange", handleVisibility);
            styleReadyRef.current = false;
            map.remove();
            mapRef.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Lens switch: repaint only. Because every lens's values are already in the
    // source, this is a paint-property change, which the declared height and
    // colour transitions animate — the town re-forms over MORPH_MS instead of
    // snapping to the new metric.
    useEffect(() => {
        lensRef.current = lens;
        if (!styleReadyRef.current) return;
        applyPaint();
    }, [lens, applyPaint]);

    // Live stats changed (a new permit, a fresh request): rebuild the source.
    useEffect(() => {
        if (!styleReadyRef.current) return;
        syncSourceData();
        applyPaint();
    }, [bgyStats, syncSourceData, applyPaint]);

    useEffect(() => {
        bandRef.current = bandFilter;
        if (!styleReadyRef.current) return;
        applyPaint();
    }, [bandFilter, applyPaint]);

    // Selection: feature-state drives the paint, parcels replace the prism, and
    // this is the only place the camera flies — in either direction. Clicking
    // a barangay flies in (flyToBarangay); clicking empty space used to clear
    // the selection and drop the parcels but leave the camera sitting on the
    // now-empty ground, with no way back except the manual Reset button. The
    // 2D map already flew back to the municipal bounds on deselect; this makes
    // 3D match it.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current) return;

        const name = selectedBgy?.name || null;
        selectedNameRef.current = name;

        if (selectedIdRef.current !== null) {
            map.setFeatureState({ source: SRC_PRISMS, id: selectedIdRef.current }, { selected: false });
            selectedIdRef.current = null;
        }

        if (!name) {
            lastFlownRef.current = null;
            showParcelsFor(null);
            applyPaint();
            // Fly back only on an actual deselection (there was a barangay a
            // moment ago), not on every render where nothing is selected —
            // this effect also re-runs on lens change, and re-centring the
            // camera every time someone switches lenses while browsing the
            // municipal view would be its own new annoyance.
            if (hadSelectionRef.current) {
                frameMunicipality(!reducedRef.current);
            }
            hadSelectionRef.current = false;
            return;
        }

        const entry = featureIndexRef.current[name.toLowerCase()];
        if (!entry) return;

        selectedIdRef.current = entry.id;
        map.setFeatureState({ source: SRC_PRISMS, id: entry.id }, { selected: true });
        applyPaint();
        showParcelsFor(name);
        hadSelectionRef.current = true;

        // Fly only when the selection itself changed. This effect also re-runs
        // on lens change, and must not yank the camera back on those passes.
        if (lastFlownRef.current !== name) {
            lastFlownRef.current = name;
            flyToBarangay(name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBgy?.name, lens, applyPaint, showParcelsFor, frameMunicipality]);

    // Mirror the panel's hover onto the map, so the explorer list and the
    // prisms behave like one instrument.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current) return;

        if (hoveredIdRef.current !== null) {
            map.setFeatureState({ source: SRC_PRISMS, id: hoveredIdRef.current }, { hover: false });
            hoveredIdRef.current = null;
        }
        if (!hoveredBgy) return;

        const entry = featureIndexRef.current[hoveredBgy.toLowerCase()];
        if (!entry) return;
        hoveredIdRef.current = entry.id;
        map.setFeatureState({ source: SRC_PRISMS, id: entry.id }, { hover: true });
    }, [hoveredBgy]);

    // Panel toggle: resize and re-pad only. This used to re-fly the camera to
    // the selection, which yanked the view mid-interaction.
    useEffect(() => {
        const timer = setTimeout(() => {
            const map = mapRef.current;
            if (!map) return;
            map.resize();
            if (reducedRef.current) map.jumpTo({ padding: cameraPadding() });
            else map.easeTo({ padding: cameraPadding(), duration: 420, easing: easeSine });
        }, 300);
        return () => clearTimeout(timer);
    }, [rightPanelOpen, cameraPadding]);

    // The view stays mounted when hidden so returning to it is instant. While
    // hidden it must not keep spinning the camera (the orbit loop would burn
    // frames nobody sees), and on reappearing it re-measures in case the window
    // or the panel changed size in the meantime.
    useEffect(() => {
        const map = mapRef.current;
        if (!active) {
            if (orbitRafRef.current !== null) {
                cancelAnimationFrame(orbitRafRef.current);
                orbitRafRef.current = null;
                setIsOrbiting(false);
            }
            return;
        }
        if (map) requestAnimationFrame(() => mapRef.current && mapRef.current.resize());
    }, [active]);

    // ── Controls ─────────────────────────────────────────────────────────────

    const setCameraPerspective = (pitch, bearing) => {
        const map = mapRef.current;
        if (!map) return;
        if (reducedRef.current) {
            map.jumpTo({ pitch, bearing });
            return;
        }
        map.stop();
        map.easeTo({ pitch, bearing, duration: 800, easing: easeSine, essential: true });
    };

    const toggleOrbit = () => {
        const map = mapRef.current;
        if (!map) return;

        if (orbitRafRef.current !== null) {
            cancelAnimationFrame(orbitRafRef.current);
            orbitRafRef.current = null;
            setIsOrbiting(false);
            return;
        }

        setIsOrbiting(true);
        orbitLastTsRef.current = 0;

        // Delta-time stepping: a fixed degrees-per-second regardless of frame
        // rate, instead of the old fixed 0.35°-per-tick setInterval that
        // drifted whenever the machine was busy.
        const step = (ts) => {
            const m = mapRef.current;
            if (!m) return;
            const last = orbitLastTsRef.current || ts;
            const dt = Math.min(64, ts - last);
            orbitLastTsRef.current = ts;
            m.setBearing((m.getBearing() + (ORBIT_DEG_PER_SEC * dt) / 1000) % 360);
            orbitRafRef.current = requestAnimationFrame(step);
        };
        orbitRafRef.current = requestAnimationFrame(step);
    };

    const activeLens = getLens(lens);

    return (
        <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: CANVAS }}>
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />

            {loadState !== "ready" && (
                <div
                    className="absolute inset-0 z-[950] flex items-center justify-center pointer-events-none"
                    style={{ backgroundColor: CANVAS }}
                >
                    {loadState === "loading" ? (
                        <div className="flex flex-col items-center gap-3">
                            <div className="w-8 h-8 rounded-full border-2 border-slate-200 border-t-slate-900 animate-spin" />
                            <span className="text-[11.5px] font-semibold text-slate-500">Building massing model…</span>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-center px-6 max-w-xs">
                            <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-bold">!</div>
                            <span className="text-[11.5px] font-bold text-rose-600">Couldn't load the 3D layer</span>
                            <span className="text-[11px] text-slate-500">Switch to 2D from the toolbar above, or reload to try again.</span>
                        </div>
                    )}
                </div>
            )}

            {/* Camera dock */}
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[450] flex items-center bg-white border border-slate-300 rounded-md shadow-sm pointer-events-auto overflow-hidden">
                {[
                    { label: "Oblique", pitch: DEFAULT_PITCH, bearing: DEFAULT_BEARING, active: currentPitch >= 40 && currentPitch <= 64 },
                    { label: "Dramatic", pitch: 70, bearing: -32, active: currentPitch > 64 },
                    { label: "Top-Down", pitch: 0, bearing: 0, active: currentPitch < 40 },
                ].map((preset, idx) => (
                    <button
                        key={preset.label}
                        onClick={() => setCameraPerspective(preset.pitch, preset.bearing)}
                        className={`px-3 py-1.5 text-[11.5px] font-bold transition-colors cursor-pointer ${
                            idx > 0 ? "border-l border-slate-300" : ""
                        } ${preset.active ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900"}`}
                        title={`${preset.label} view (${preset.pitch}°)`}
                    >
                        {preset.label}
                    </button>
                ))}

                <button
                    onClick={toggleOrbit}
                    disabled={prefersReducedMotion}
                    className={`px-3 py-1.5 text-[11.5px] font-bold border-l border-slate-300 flex items-center gap-1.5 transition-colors ${
                        prefersReducedMotion
                            ? "bg-white text-slate-300 cursor-not-allowed"
                            : isOrbiting
                            ? "bg-slate-900 text-white cursor-pointer"
                            : "bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
                    }`}
                    title={prefersReducedMotion ? "Disabled while your system requests reduced motion" : isOrbiting ? "Stop orbit" : "Slowly orbit the municipality"}
                >
                    <svg className={`w-3.5 h-3.5 ${isOrbiting ? "animate-spin" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="hidden sm:inline">Orbit</span>
                </button>

                <button
                    onClick={() => frameMunicipality(true)}
                    className="px-3 py-1.5 text-[11.5px] font-bold border-l border-slate-300 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer"
                    title="Frame the whole municipality"
                >
                    Reset
                </button>

                <span className="px-3 py-1.5 text-[10px] font-mono tabular-nums text-slate-400 border-l border-slate-300 hidden lg:block">
                    {currentPitch}° / {currentBearing}°
                </span>
            </div>

            {/* Hover card. Position is written to this node on a rAF; only the
                content below is React state, keyed by barangay. */}
            <div
                ref={hoverElRef}
                className="absolute top-0 left-0 pointer-events-none z-[900] will-change-transform"
                style={{ visibility: hoverCard ? "visible" : "hidden" }}
            >
                {hoverCard && (
                    <div className="bg-white border border-slate-300 rounded-md shadow-md min-w-[200px] mb-3 overflow-hidden animate-in fade-in duration-150">
                        <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-slate-200">
                            <span className="text-[12px] font-bold text-slate-900 truncate">{hoverCard.name}</span>
                            <span
                                className="text-[11px] font-mono tabular-nums font-bold px-1.5 rounded-sm shrink-0"
                                style={{ backgroundColor: hoverCard[`c_${lens}`], color: "#fff" }}
                            >
                                {hoverCard[`l_${lens}`]}
                            </span>
                        </div>
                        <div className="px-2.5 py-1.5 space-y-0.5">
                            <div className="text-[11px] font-semibold text-slate-700">{hoverCard[`cls_${lens}`]}</div>
                            <div className="text-[10px] text-slate-500">{activeLens.metricLabel}</div>
                            {hoverCard.clusterName && (
                                <div className="flex items-center gap-1.5 pt-1 mt-1 border-t border-slate-200">
                                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: hoverCard.clusterColor }} />
                                    <span className="text-[10px] text-slate-500 truncate">{hoverCard.clusterName}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
