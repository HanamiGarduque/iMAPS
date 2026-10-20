import React, { useEffect, useRef, useState, useCallback } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import { getLens, resolveLensValue, DIVERSITY_LENSES } from "@/utils/diversityTheme";
import { getZoneInfo } from "@/utils/clupZones";
import MapSkeleton from "@/Components/Maps/MapSkeleton";
import useReducedMotion from "@/utils/useReducedMotion";
import { getTrendsDemandColor, DEMAND_CLASSES, APP_LOAD_CLASSES } from "@/Components/Maps/LeafletMap";
import { loadBarangayBoundaries, loadMunicipalBoundary, resolveBarangayName } from "@/utils/mapData";
import { ensureRFC7946Winding } from "@/utils/polygonWinding";

// Configure MapLibre Web Worker for Vite bundling
try {
    setWorkerUrl(workerUrl);
} catch (e) {
    console.warn("MapLibre setWorkerUrl fallback:", e);
}

// Official Center for Rosario, Batangas — also the fixed idle/deselected framing.
const ROSARIO_CENTER = [121.258, 13.805];
// While hidden behind the 2D map the camera rests top-down (flat, like 2D).
// Switching to 3D tilts it to the oblique angle and raises the prisms; switching
// back does the reverse.
const DEFAULT_PITCH = 0;
const DEFAULT_BEARING = 0;
const OBLIQUE_PITCH = 54;
const OBLIQUE_BEARING = -18;
const TILT_MS = 1100;
const MIN_ZOOM = 11;
// How long the 3D map takes to fade in over 2D before it starts to tilt.
const FADE_IN_MS = 650;

// Same keyless Esri imagery the 2D map uses.
const SATELLITE_TILES = "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

// Esri satellite imagery sits under the prisms; CANVAS only shows while tiles load.
const CANVAS = "#f8f9fa";
const GROUND = "#eef1f4";
const INK = "#0f172a";

const SRC_PRISMS = "diversity-source";
const SRC_PARCELS = "clup-parcels";
const SRC_MUNI = "municipal-outline";
const SRC_MASK = "municipal-mask";
const LYR_PRISMS = "diversity-prisms";
const LYR_FOOTPRINTS = "diversity-footprints";
const LYR_PARCELS = "clup-parcels-extrusion";
const LYR_PARCEL_LINES = "clup-parcels-lines";

// Motion constants, so the whole scene shares one rhythm.
const MORPH_MS = 650;
const FADE_MS = 260;
const FLIGHT_MS = 1100;
const PARCEL_HEIGHT = 190;

const easeSine = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);

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
//
// The LC demand and application layers ride the same property scheme under the
// pseudo-lens ids "trends" and "status", so every layer shares one set of
// prisms and a layer switch is just another height/colour morph.
const HEIGHT_FLOOR = 140;
const HEIGHT_CEIL = 1250;
const countHeight = (count, ref) => (count > 0 ? Math.round(HEIGHT_FLOOR + Math.min(1, count / ref) * (HEIGHT_CEIL - HEIGHT_FLOOR)) : 20);

//
// Double-buffered for motion: a data-driven value never transitions when the
// source data changes, only when a paint property's expression does. So each
// value is written to two slots (`h_mix_0`, `h_mix_1`); a refresh puts the new
// data in the idle slot, keeps the old data in the other, and then flips the
// paint expressions to read the idle slot. That flip is what the declared
// height and colour transitions animate, so stepping a timeline morphs the
// prisms instead of snapping them.
const SLOTTED = /^(?:[hcbl]|cls)_/;
function buildFeatures(baseGeo, bgyStats, demandCounts, slot = 0, prevProps = null) {
    const features = (baseGeo?.features || []).map((f, idx) => {
        const name = resolveBarangayName(f.properties);
        const stat = bgyStats?.[name] || {};
        const centroid = polygonCentroid(f);

        const vals = {};
        const props = {
            name,
            permitCount: stat.permitCount ?? stat.Total ?? 0,
            clusterName: stat.cluster?.name || "",
            clusterColor: stat.cluster?.color || "#64748b",
            primaryZone: stat.Primary_Zone || "",
            cx: centroid[0],
            cy: centroid[1],
        };

        const demand = demandCounts?.[name.trim().toLowerCase()] || 0;
        const demandClass = getTrendsDemandColor(demand);
        vals.h_trends = countHeight(demand, 16);
        vals.c_trends = demandClass.color;
        vals.b_trends = demandClass.min === 0 ? "minimal" : String(demandClass.min);
        vals.l_trends = demand ? `${demand} LC` : "";
        vals.cls_trends = demandClass.label;

        const total = stat.Total ?? stat.total ?? 0;
        const loadClass = APP_LOAD_CLASSES.find((c) => total >= c.min);
        vals.h_status = countHeight(total, 11);
        vals.c_status = loadClass.color;
        vals.b_status = total ? String(loadClass.min) : "none";
        vals.l_status = total ? String(total) : "";
        vals.cls_status = total ? `${total} application${total === 1 ? "" : "s"}` : "No applications";

        DIVERSITY_LENSES.forEach((lensDef) => {
            const r = resolveLensValue(lensDef.id, stat);
            vals[`h_${lensDef.id}`] = r.height;
            vals[`c_${lensDef.id}`] = r.color;
            vals[`b_${lensDef.id}`] = r.band.id;
            vals[`l_${lensDef.id}`] = r.formatted;
            vals[`cls_${lensDef.id}`] = r.band.classification;
        });

        const prev = prevProps?.[name];
        Object.entries(vals).forEach(([key, value]) => {
            props[`${key}_${slot}`] = value;
            const old = prev?.[`${key}_${1 - slot}`];
            props[`${key}_${1 - slot}`] = old === undefined ? value : old;
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
    // "mix" for the diversity index, or "trends" / "status" for the other layers.
    lens = "mix",
    // LC demand per barangay (lower-cased name -> count), for the trends lens.
    demandCounts = null,
    bandFilter = "all",
    hoveredBgy = null,
    onHoverBgy = () => {},
    onParcelsVisible = () => {},
    // Overrides for embedding in a smaller canvas (the Overview card); the
    // defaults are the Maps page's framing.
    baseZoom = 11.5,
    framePadding = null,
    insets = null,
    // The 2D map's { get, set } view, so a 2D/3D switch starts from the same
    // centre and zoom (MapLibre's zoom is Leaflet's minus one) and hands it back.
    syncRef = null,
    // Filled with { zoomBy, reset } for the page's toolbar.
    controlRef = null,
    showLabels = true,
}) {
    const mapContainerRef = useRef(null);
    const mapRef = useRef(null);

    const baseGeoRef = useRef(null);
    // Rosario's extent, for the same whole-municipality framing as the 2D map.
    const muniBoundsRef = useRef(null);
    // Which data slot the paint expressions currently read (see buildFeatures).
    const slotRef = useRef(0);
    const labelsRef = useRef({});
    const showLabelsRef = useRef(showLabels);
    showLabelsRef.current = showLabels;
    const lastPropsRef = useRef(null);
    const activeRef = useRef(active);
    activeRef.current = active;
    const demandRef = useRef(demandCounts);
    demandRef.current = demandCounts;
    const insetsRef = useRef(insets);
    insetsRef.current = insets;
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
    const isFlatRef = useRef(DEFAULT_PITCH < 12);
    const hasEnteredRef = useRef(false);

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

    const [hoverCard, setHoverCard] = useState(null);
    const [loadState, setLoadState] = useState("loading");

    useEffect(() => { reducedRef.current = prefersReducedMotion; }, [prefersReducedMotion]);

    // ── Paint expressions ────────────────────────────────────────────────────
    // Each is applied once per user action, never per animation frame — that
    // per-frame re-authoring is what used to make the prisms crawl.

    const heightExpression = useCallback((lensId, flat) => {
        if (flat) return 0;
        return ["to-number", ["get", `h_${lensId}_${slotRef.current}`]];
    }, []);

    const colorExpression = useCallback((lensId) => [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        INK,
        ["coalesce", ["get", `c_${lensId}_${slotRef.current}`], "#94a3b8"],
    ], []);

    const opacityExpression = useCallback((lensId, band, hasSelection) => {
        if (hasSelection) {
            // Isolation: the selected prism remains fully visible while
            // everything else disappears rather than staying visible underneath 
            // — the band filter is moot while one barangay has the floor.
            return ["case", ["boolean", ["feature-state", "selected"], false], 0.98, 0];
        }
        if (!band || band === "all") {
            // Flat (top-down): translucent so the satellite imagery reads through.
            // Same strengths as the 2D layers on imagery: the lowest class
            // all but clears instead of greying the ground.
            const flat = isFlatRef.current;
            return [
                "case",
                ["boolean", ["feature-state", "hover"], false], flat ? 0.85 : 0.98,
                flat
                    ? ["case",
                        ["==", ["get", `b_${lensId}_${slotRef.current}`], "none"], 0.04,
                        ["in", ["get", `b_${lensId}_${slotRef.current}`], ["literal", ["monoculture", "minimal"]]], 0.28,
                        0.66]
                    : 0.92,
            ];
        }
        return [
            "case",
            ["boolean", ["feature-state", "selected"], false], 0.98,
            ["==", ["get", `b_${lensId}_${slotRef.current}`], band], 0.95,
            0.12,
        ];
    }, []);

    // Label text, isolation, band dimming and overlap culling. Like the 2D map,
    // the labels with the highest values are placed first and any that would
    // overlap one already placed are hidden.
    const refreshLabels = useCallback(() => {
        const map = mapRef.current;
        const entries = labelsRef.current;
        const props = lastPropsRef.current;
        if (!map || !props) return;
        const key = `${lensRef.current}_${slotRef.current}`;
        const band = bandRef.current;
        const selected = (selectedNameRef.current || "").toLowerCase();

        const candidates = Object.entries(entries).map(([name, { marker }]) => {
            const p = props[name] || {};
            return { name, value: p[`l_${key}`] || "", rank: Number(p[`h_${key}`]) || 0, band: p[`b_${key}`], point: map.project(marker.getLngLat()) };
        }).sort((a, b) => b.rank - a.rank);

        const placed = [];
        candidates.forEach(({ name, value, band: b, point }) => {
            const { el, valueEl } = entries[name];
            valueEl.textContent = value;
            valueEl.style.display = value ? "" : "none";
            let target = 1;
            if (selected) target = name.toLowerCase() === selected ? 1 : 0;
            else if (band && band !== "all" && b !== band) target = 0.15;
            if (target > 0.5) {
                const w = Math.max(name.length, value.length) * 6.2 + 10;
                const h = value ? 30 : 16;
                const box = { l: point.x - w / 2, r: point.x + w / 2, t: point.y - h / 2, b: point.y + h / 2 };
                if (placed.some((q) => box.l < q.r && box.r > q.l && box.t < q.b && box.b > q.t)) target = 0;
                else placed.push(box);
            }
            el.style.opacity = showLabelsRef.current ? String(target) : "0";
        });
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
                    ? ["case", ["boolean", ["feature-state", "hover"], false], 1, 0.8]
                    : ["case", ["boolean", ["feature-state", "selected"], false], 1, 0]
            );
        }

        refreshLabels();
    }, [heightExpression, colorExpression, opacityExpression, refreshLabels]);

    const syncSourceData = useCallback(() => {
        const map = mapRef.current;
        if (!map || !styleReadyRef.current || !baseGeoRef.current) return;
        const src = map.getSource(SRC_PRISMS);
        if (!src) return;

        const nextSlot = 1 - slotRef.current;
        const fc = buildFeatures(baseGeoRef.current, bgyStats, demandRef.current, nextSlot, lastPropsRef.current);

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
        slotRef.current = nextSlot;
        lastPropsRef.current = Object.fromEntries(fc.features.map((f) => [f.properties.name, f.properties]));

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
        if (framePadding) return framePadding;
        // The analysis panel and attribute table float over the canvas, so the
        // camera pads for exactly what they cover; the map then sits centred in
        // the part of the canvas that is still visible.
        const map = mapRef.current;
        const w = map ? map.getCanvas().clientWidth : 1000;
        return {
            top: 0,
            bottom: insetsRef.current?.bottom || 0,
            left: 0,
            right: rightPanelOpen ? Math.min(panelWidth, w * 0.6) : 0,
        };
    }, [rightPanelOpen, panelWidth, framePadding]);

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
            pitch: activeRef.current ? OBLIQUE_PITCH : DEFAULT_PITCH,
            bearing: activeRef.current ? OBLIQUE_BEARING : DEFAULT_BEARING,
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

    // Read from effects that must not re-run when the panel opens or closes.
    const cameraPaddingRef = useRef(cameraPadding);
    cameraPaddingRef.current = cameraPadding;

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
        const pitch = activeRef.current ? OBLIQUE_PITCH : DEFAULT_PITCH;
        const bearing = activeRef.current ? OBLIQUE_BEARING : DEFAULT_BEARING;
        let target = { center: ROSARIO_CENTER, zoom: baseZoom, pitch, bearing };
        target.padding = cameraPadding();
        // Maps page: fit Rosario with the 2D map's home padding (48px, plus the
        // attribute table when it is open) so both views open on the same frame.
        if (!framePadding && muniBoundsRef.current) {
            // Fit the zoom to the visible area; the centre is the municipality's
            // own, shown at the middle of the padded (visible) region.
            const pad = cameraPadding();
            const padding = { top: 48, left: 48, right: 48 + pad.right, bottom: 48 + pad.bottom };
            const cam = map.cameraForBounds(muniBoundsRef.current, { padding, bearing });
            const [[w, s], [e, n]] = muniBoundsRef.current;
            if (cam) target = { center: [(w + e) / 2, (s + n) / 2], zoom: Math.max(MIN_ZOOM, cam.zoom), pitch, bearing, padding: pad };
        }

        if (!animate || reducedRef.current) {
            map.jumpTo(target);
            return;
        }
        map.stop();
        map.easeTo({ ...target, duration: FLIGHT_MS, easing: easeSine, essential: true });
    }, [cameraPadding, baseZoom, framePadding]);

    // ── Layer setup ──────────────────────────────────────────────────────────

    const setupLayers = useCallback((map) => {
        const fc = buildFeatures(baseGeoRef.current, bgyStats, demandRef.current, 0, null);
        slotRef.current = 0;
        lastPropsRef.current = Object.fromEntries(fc.features.map((f) => [f.properties.name, f.properties]));

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
        if (!map.getSource(SRC_PARCELS)) map.addSource(SRC_PARCELS, { type: "geojson", data: EMPTY_FC });

        if (!map.getSource(SRC_MUNI)) map.addSource(SRC_MUNI, { type: "geojson", data: EMPTY_FC });
        if (!map.getSource(SRC_MASK)) map.addSource(SRC_MASK, { type: "geojson", data: EMPTY_FC });

        // Ground plate: a flat wash under the municipality so the prisms have
        // something to stand on rather than floating on the page.
        if (!map.getLayer("diversity-ground")) {
            map.addLayer({
                id: "diversity-ground",
                type: "fill",
                source: SRC_PRISMS,
                paint: { "fill-color": GROUND, "fill-opacity": 0 },
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

        // Land outside Rosario is dimmed so the study area lifts off the imagery.
        if (!map.getLayer("municipal-mask")) {
            map.addLayer({
                id: "municipal-mask",
                type: "fill",
                source: SRC_MASK,
                paint: { "fill-color": "#020617", "fill-opacity": 0.2 },
            }, LYR_PRISMS);
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
                    // White boundaries, matching the 2D layers over satellite.
                    "line-color": "#ffffff",
                    "line-width": [
                        "case",
                        ["boolean", ["feature-state", "selected"], false], 2.4,
                        ["boolean", ["feature-state", "hover"], false], 3,
                        1.2,
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

        // Rosario's outline: a soft dark halo under a crisp white line.
        if (!map.getLayer("municipal-halo")) {
            map.addLayer({
                id: "municipal-halo",
                type: "line",
                source: SRC_MUNI,
                layout: { "line-join": "round" },
                paint: { "line-color": "#020617", "line-width": 7, "line-opacity": 0.45, "line-blur": 1 },
            });
            map.addLayer({
                id: "municipal-line",
                type: "line",
                source: SRC_MUNI,
                layout: { "line-join": "round" },
                paint: { "line-color": "#ffffff", "line-width": 2.4, "line-opacity": 1 },
            });
        }

        loadMunicipalBoundary().then((data) => {
            if (!data?.features || mapRef.current !== map) return;
            const muni = ensureRFC7946Winding(data);
            map.getSource(SRC_MUNI)?.setData(muni);
            const holes = [];
            muni.features.forEach((ft) => {
                const g = ft.geometry;
                if (!g) return;
                if (g.type === "Polygon") holes.push(g.coordinates[0]);
                else if (g.type === "MultiPolygon") g.coordinates.forEach((p) => holes.push(p[0]));
            });
            let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
            holes.forEach((ring) => ring.forEach(([x, y]) => {
                w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
            }));
            if (Number.isFinite(w)) {
                const first = !muniBoundsRef.current;
                muniBoundsRef.current = [[w, s], [e, n]];
                if (first && !selectedNameRef.current && !syncRef) frameMunicipality(false);
            }
            map.getSource(SRC_MASK)?.setData({
                type: "FeatureCollection",
                features: [{
                    type: "Feature",
                    properties: {},
                    geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...holes] },
                }],
            });
        }).catch(() => {});

        // Barangay labels are HTML, styled exactly like the 2D map's, so both
        // views read the same.
        Object.values(labelsRef.current).forEach(({ marker }) => marker.remove());
        labelsRef.current = {};
        fc.features.forEach((f) => {
            const el = document.createElement("div");
            el.className = "imaps3d-label";
            const nameEl = document.createElement("span");
            nameEl.textContent = f.properties.name;
            const valueEl = document.createElement("b");
            el.append(nameEl, valueEl);
            const marker = new Marker({ element: el, anchor: "center" })
                .setLngLat([f.properties.cx, f.properties.cy])
                .addTo(map);
            labelsRef.current[f.properties.name] = { el, valueEl, marker };
        });
        refreshLabels();
    }, [bgyStats, colorExpression, frameMunicipality, refreshLabels]);

    // ── Init ─────────────────────────────────────────────────────────────────

    useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return;

        const map = new MapLibreMap({
            container: mapContainerRef.current,
            // No raster sources at all: a solid background layer is the entire
            // basemap.
            style: {
                version: 8,
                glyphs: "/fonts/{fontstack}/{range}.pbf",
                sources: {
                    satellite: { type: "raster", tiles: [SATELLITE_TILES], tileSize: 256, maxzoom: 19 },
                },
                layers: [
                    { id: "canvas", type: "background", paint: { "background-color": CANVAS } },
                    { id: "satellite", type: "raster", source: "satellite" },
                ],
            },
            center: ROSARIO_CENTER,
            zoom: baseZoom,
            pitch: DEFAULT_PITCH,
            bearing: DEFAULT_BEARING,
            maxPitch: 60,
            // Zooming out stops at the 2D map's minimum (Leaflet 12 is MapLibre 11).
            minZoom: MIN_ZOOM,
            antialias: true,
            attributionControl: false,
        });

        mapRef.current = map;

        loadBarangayBoundaries()
            .then((raw) => {
                if (!raw || !raw.features || !raw.features.length) {
                    throw new Error("Unable to load barangay boundary geometry from Map API");
                }
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
                    if (!syncRef) frameMunicipality(!reducedRef.current);

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
            const layers = [LYR_PRISMS, LYR_PARCELS].filter((id) => map.getLayer(id));
            if (!layers.length) return;
            if (map.queryRenderedFeatures(e.point, { layers }).length === 0) callbacksRef.current.onMapClick?.();
        };

        map.on("mousemove", LYR_PRISMS, handleMove);
        map.on("mouseleave", LYR_PRISMS, handleLeave);
        map.on("click", LYR_PRISMS, handleClick);
        map.on("click", handleBackgroundClick);

        map.on("moveend", () => {
            refreshLabels();
            const p = Math.round(map.getPitch());

            // Flatten only when the view has actually settled top-down, with
            // hysteresis so grazing the threshold mid-flight doesn't collapse
            // the whole town. One transition, not sixty.
            const flat = isFlatRef.current ? p < 25 : p < 12;
            if (flat !== isFlatRef.current) {
                isFlatRef.current = flat;
                applyPaint();
            }
        });

        return () => {
            if (hoverRafRef.current !== null) cancelAnimationFrame(hoverRafRef.current);
            styleReadyRef.current = false;
            Object.values(labelsRef.current).forEach(({ marker }) => marker.remove());
            labelsRef.current = {};
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
    }, [bgyStats, demandCounts, syncSourceData, applyPaint]);

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
        // CLUP parcels are intentionally not shown on selection.
        hadSelectionRef.current = true;

        // Fly only when the selection itself changed. This effect also re-runs
        // on lens change, and must not yank the camera back on those passes.
        if (lastFlownRef.current !== name) {
            lastFlownRef.current = name;
            flyToBarangay(name);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedBgy?.name, lens, applyPaint, showParcelsFor, frameMunicipality]);

    useEffect(() => { refreshLabels(); }, [showLabels, refreshLabels]);

    useEffect(() => {
        if (!controlRef) return;
        controlRef.current = {
            zoomBy: (delta) => {
                const map = mapRef.current;
                if (map) map.easeTo({ zoom: map.getZoom() + delta, duration: reducedRef.current ? 0 : 400, easing: easeSine, essential: true });
            },
            reset: () => frameMunicipality(true),
        };
    }, [controlRef, frameMunicipality]);

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
            if (!activeRef.current) return;
            map.resize();
            if (reducedRef.current) map.jumpTo({ padding: cameraPadding() });
            else map.easeTo({ padding: cameraPadding(), duration: 420, easing: easeSine });
        }, 300);
        return () => clearTimeout(timer);
    }, [rightPanelOpen, insets?.bottom, cameraPadding]);

    // The view stays mounted when hidden so returning to it is instant. On
    // reappearing it re-measures in case the window or the panel changed size
    // in the meantime, then tilts up out of the flat top-down frame (prisms
    // rising with it); on hiding it settles back flat so the 2D crossfade
    // starts from a matching view.
    useEffect(() => {
        const map = mapRef.current;
        if (!map || loadState !== "ready") return;
        const instant = reducedRef.current;
        const noPadding = { top: 0, bottom: 0, left: 0, right: 0 };
        let timer = null;
        let onEnd = null;

        if (active) {
            map.resize();
            map.stop();
            const view = syncRef?.current?.get();
            if (view) {
                // Land exactly on what the 2D map shows, flat, so the fade is
                // between two identical pictures.
                map.jumpTo({ center: view.center, zoom: view.zoom - 1, pitch: 0, bearing: 0, padding: noPadding });
            }
            const tilt = () => {
                isFlatRef.current = false;
                applyPaint();
                // Padding eases in with the tilt, sliding the map out from under
                // the panel into the visible area.
                const target = { pitch: OBLIQUE_PITCH, bearing: OBLIQUE_BEARING, padding: cameraPaddingRef.current() };
                if (instant) map.jumpTo(target);
                else map.easeTo({ ...target, duration: TILT_MS, easing: easeSine, essential: true });
            };
            if (instant) tilt(); else timer = setTimeout(tilt, FADE_IN_MS);
        } else {
            // Level out and lower the prisms; once flat, give the 2D map the
            // view we ended on (it is already showing underneath).
            isFlatRef.current = true;
            applyPaint();
            const handBack = () => {
                const c = map.getCenter();
                syncRef?.current?.set({ center: [c.lng, c.lat], zoom: map.getZoom() + 1 });
            };
            if (instant || (Math.abs(map.getPitch()) < 1 && Math.abs(map.getBearing()) < 1)) {
                map.jumpTo({ pitch: 0, bearing: 0, padding: noPadding });
                handBack();
            } else {
                map.stop();
                onEnd = () => { onEnd = null; handBack(); };
                map.once("moveend", onEnd);
                map.easeTo({ pitch: 0, bearing: 0, padding: noPadding, duration: TILT_MS, easing: easeSine, essential: true });
            }
        }
        return () => {
            if (timer) clearTimeout(timer);
            if (onEnd) map.off("moveend", onEnd);
        };
    }, [active, loadState, applyPaint]);

    const metricLabel = lens === "trends" ? "LC applications forecast"
        : lens === "status" ? "Permit applications filed"
        : getLens(lens).metricLabel;

    return (
        <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: CANVAS }}>
            <div ref={mapContainerRef} className="absolute inset-0 w-full h-full" />
            <style>{`
.imaps3d-label { display: flex; flex-direction: column; align-items: center; line-height: 1.15; white-space: nowrap; pointer-events: none; transition: opacity 200ms ease;
  text-shadow: 0 0 2px rgba(2, 6, 23, 0.9), 0 0 3px rgba(2, 6, 23, 0.8), 0 1px 4px rgba(2, 6, 23, 0.6); }
.imaps3d-label span { font-size: 10.5px; font-weight: 600; color: #f8fafc; }
.imaps3d-label b { font-size: 11.5px; font-weight: 700; color: #fde68a; font-variant-numeric: tabular-nums; }
`}</style>

            {loadState !== "ready" && (
                <div
                    className="absolute inset-0 z-[950] flex items-center justify-center pointer-events-none"
                    style={{ backgroundColor: CANVAS }}
                >
                    {loadState === "loading" ? (
                        <MapSkeleton visible label="Building 3D model…" tone={CANVAS} />
                    ) : (
                        <div className="flex flex-col items-center gap-2 text-center px-6 max-w-xs">
                            <div className="w-8 h-8 rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center text-rose-600 font-bold">!</div>
                            <span className="text-[11.5px] font-bold text-rose-600">Couldn't load the 3D layer</span>
                            <span className="text-[11px] text-slate-500">Switch to 2D from the toolbar above, or reload to try again.</span>
                        </div>
                    )}
                </div>
            )}

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
                                style={{ backgroundColor: hoverCard[`c_${lens}_${slotRef.current}`], color: "#fff" }}
                            >
                                {hoverCard[`l_${lens}_${slotRef.current}`]}
                            </span>
                        </div>
                        <div className="px-2.5 py-1.5 space-y-0.5">
                            <div className="text-[11px] font-semibold text-slate-700">{hoverCard[`cls_${lens}_${slotRef.current}`]}</div>
                            <div className="text-[10px] text-slate-500">{metricLabel}</div>
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
