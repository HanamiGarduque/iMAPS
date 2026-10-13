import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, setWorkerUrl } from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";
import MapSkeleton from "@/Components/Maps/MapSkeleton";
import { DIVERSITY_BLUES, resolveLensValue } from "@/utils/diversityTheme";
import { loadBarangayBoundaries, resolveBarangayName } from "@/utils/mapData";
import { ensureRFC7946Winding } from "@/utils/polygonWinding";

try {
    setWorkerUrl(workerUrl);
} catch (e) {
    console.warn("MapLibre setWorkerUrl fallback:", e);
}

const CANVAS = "#f3f6fb";
// How far a picked barangay rises above its neighbours, in metres.
const LIFT = 450;
const HOVER_LIFT = 90;

// A barangay's colour washed toward the canvas, for everything not picked.
const fade = (hex) => {
    const n = parseInt(hex.slice(1), 16);
    const mix = (c, to) => Math.round(c + (to - c) * 0.72);
    return `rgb(${mix(n >> 16, 226)}, ${mix((n >> 8) & 255, 232)}, ${mix(n & 255, 240)})`;
};

const bboxOf = (geometry) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    const walk = (c) => (typeof c[0] === "number" ? ((w = Math.min(w, c[0])), (e = Math.max(e, c[0])), (s = Math.min(s, c[1])), (n = Math.max(n, c[1]))) : c.forEach(walk));
    walk(geometry.coordinates);
    return [[w, s], [e, n]];
};

// Paint for the prisms given the picked barangay (or none): it stands taller in
// full colour while the rest fade back; hovering any prism lifts and colours it.
const paintFor = (selected) => {
    const isPicked = ["==", ["get", "name"], selected ?? ""];
    const hovered = ["boolean", ["feature-state", "hover"], false];
    return {
        "fill-extrusion-height": ["+", ["get", "h"], selected ? ["case", isPicked, LIFT, 0] : 0, ["case", hovered, HOVER_LIFT, 0]],
        "fill-extrusion-color": selected ? ["case", ["any", isPicked, hovered], ["get", "color"], ["get", "faded"]] : ["get", "color"],
    };
};

// The names follow the pick: its name wins any collision and the rest step back.
const labelFor = (map, selected) => {
    const isPicked = ["==", ["get", "name"], selected ?? ""];
    map.setLayoutProperty("names", "symbol-sort-key", selected ? ["case", isPicked, 0, 1] : 1);
    map.setPaintProperty("names", "text-opacity", selected ? ["case", isPicked, 1, 0.55] : 1);
};

// Rosario's barangays as 3D prisms of their land-use mix (the Maps page's
// diversity lens): height and colour are the score. Hover reads a barangay out,
// a click picks it (or clears it). `onReady(map, boundsOf)` hands the camera to
// the page, which knows where its panels leave room.
export default function Rosario3D({ stats, selected, onSelect, onReady }) {
    const boxRef = useRef(null);
    const mapRef = useRef(null);
    const [state, setState] = useState("loading");
    const [tip, setTip] = useState(null);
    const live = useRef({ selected, onSelect });
    live.current = { selected, onSelect };

    useEffect(() => {
        const map = new MapLibreMap({
            container: boxRef.current,
            // Glyphs are served locally (public/fonts), the same as the Maps page's 3D view.
            style: { version: 8, glyphs: "/fonts/{fontstack}/{range}.pbf", sources: {}, layers: [{ id: "canvas", type: "background", paint: { "background-color": CANVAS } }] },
            center: [121.267, 13.78],
            zoom: 10.5,
            pitch: 55,
            bearing: -18,
            maxPitch: 70,
            antialias: true,
            attributionControl: false,
        });
        let alive = true;
        let hoverId = null;

        Promise.all([loadBarangayBoundaries(), new Promise((resolve) => map.once("load", resolve))])
            .then(([raw]) => {
                if (!alive) return;
                if (!raw?.features?.length) throw new Error("No barangay boundaries returned");

                // Boundary names matched to the page's stats ignoring case.
                const byName = new Map(Object.keys(stats || {}).map((k) => [k.toLowerCase(), k]));
                const bounds = {};
                // Geometry is cloned before re-winding: the parsed layer is shared
                // with the Maps page through mapData's cache.
                const fc = ensureRFC7946Winding({
                    type: "FeatureCollection",
                    features: raw.features.map((f, i) => {
                        const label = resolveBarangayName(f.properties);
                        const name = byName.get(label.toLowerCase()) || label;
                        const stat = stats?.[name];
                        const r = stat ? resolveLensValue("mix", stat) : null;
                        const color = r ? DIVERSITY_BLUES[r.band.id] : "#cbd5e1";
                        bounds[name] = bboxOf(f.geometry);
                        return {
                            type: "Feature",
                            id: i + 1,
                            geometry: structuredClone(f.geometry),
                            properties: { name, known: Boolean(stat), h: r ? r.height : 120, color, faded: fade(color), score: r?.formatted ?? null, tier: r?.band.shortLabel ?? null },
                        };
                    }),
                });

                try {
                    map.setLight({ anchor: "map", color: "#ffffff", intensity: 0.42, position: [1.4, 210, 35] });
                } catch (e) {
                    /* older style spec */
                }
                map.addSource("bgy", { type: "geojson", data: fc });
                // A soft drop shadow: the footprint stamped a few times down and to
                // the right, fainter each step, under the prisms.
                [[5, 7, 0.1], [12, 16, 0.07], [22, 28, 0.045]].forEach(([x, y, a], i) =>
                    map.addLayer({ id: `shadow-${i}`, type: "fill", source: "bgy", paint: { "fill-color": "#1e3a8a", "fill-opacity": a, "fill-translate": [x, y], "fill-antialias": false } })
                );
                map.addLayer({
                    id: "prisms",
                    type: "fill-extrusion",
                    source: "bgy",
                    paint: {
                        // Rises from flat once the page is up (see below).
                        "fill-extrusion-height": 0,
                        "fill-extrusion-color": ["get", "color"],
                        "fill-extrusion-base": 0,
                        "fill-extrusion-opacity": 0.96,
                        "fill-extrusion-vertical-gradient": true,
                        "fill-extrusion-height-transition": { duration: 650, delay: 0 },
                        "fill-extrusion-color-transition": { duration: 350, delay: 0 },
                    },
                });

                // Each barangay's name, placed inside its own shape. Names that would collide
                // drop out at this zoom and come back as the user zooms in.
                map.addLayer({
                    id: "names",
                    type: "symbol",
                    source: "bgy",
                    layout: {
                        "text-field": ["get", "name"],
                        "text-font": ["Noto Sans Regular"],
                        "text-size": ["interpolate", ["linear"], ["zoom"], 10, 9.5, 12, 11.5, 14, 13.5],
                        "text-max-width": 7,
                        "text-padding": 3,
                        "symbol-sort-key": 1,
                    },
                    paint: {
                        "text-color": "#0f172a",
                        "text-halo-color": "rgba(255,255,255,0.92)",
                        "text-halo-width": 1.5,
                        "text-opacity-transition": { duration: 350, delay: 0 },
                    },
                });
                labelFor(map, live.current.selected);

                const rise = () => {
                    if (!alive) return;
                    const paint = paintFor(live.current.selected);
                    Object.entries(paint).forEach(([k, v]) => map.setPaintProperty("prisms", k, v));
                };
                if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) rise();
                else map.once("idle", () => setTimeout(rise, 120));

                map.on("mousemove", "prisms", (e) => {
                    const f = e.features?.[0];
                    if (!f) return;
                    map.getCanvas().style.cursor = f.properties.known ? "pointer" : "";
                    if (hoverId !== f.id) {
                        if (hoverId !== null) map.setFeatureState({ source: "bgy", id: hoverId }, { hover: false });
                        hoverId = f.id;
                        map.setFeatureState({ source: "bgy", id: hoverId }, { hover: true });
                    }
                    setTip({ x: e.point.x, y: e.point.y, name: f.properties.name, score: f.properties.score, tier: f.properties.tier });
                });
                map.on("mouseleave", "prisms", () => {
                    map.getCanvas().style.cursor = "";
                    if (hoverId !== null) map.setFeatureState({ source: "bgy", id: hoverId }, { hover: false });
                    hoverId = null;
                    setTip(null);
                });
                // A click on a barangay picks it (again: clears it); on open ground, clears.
                map.on("click", (e) => {
                    const f = map.queryRenderedFeatures(e.point, { layers: ["prisms"] })[0];
                    const { selected: current, onSelect: pick } = live.current;
                    if (!f?.properties.known) return current && pick?.(null);
                    pick?.(f.properties.name === current ? null : f.properties.name);
                });

                mapRef.current = map;
                onReady?.(map, (name) => bounds[name] || null);
                setState("ready");
            })
            .catch((err) => {
                if (!alive) return;
                console.error("Error loading the 3D diversity model:", err);
                setState("error");
            });

        return () => {
            alive = false;
            mapRef.current = null;
            onReady?.(null, null);
            map.remove();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Re-paint whenever the picked barangay changes, wherever it was picked from.
    useEffect(() => {
        const map = mapRef.current;
        if (map?.getLayer("names")) labelFor(map, selected);
        if (!map || !map.getLayer("prisms") || map.getPaintProperty("prisms", "fill-extrusion-height") === 0) return;
        Object.entries(paintFor(selected)).forEach(([k, v]) => map.setPaintProperty("prisms", k, v));
    }, [selected, state]);

    return (
        <div className="relative w-full h-full overflow-hidden" style={{ backgroundColor: CANVAS }}>
            {/* w/h-full too: maplibre-gl.css makes the container position: relative, which voids inset-0. */}
            <div ref={boxRef} className="absolute inset-0 w-full h-full" />
            {tip && (
                <div
                    className="absolute z-[1001] pointer-events-none rounded-xl bg-white/90 backdrop-blur-md px-3 py-2 shadow-[0_12px_28px_-12px_rgba(15,23,42,0.4)] ring-1 ring-slate-900/[0.06] whitespace-nowrap"
                    style={{ left: tip.x, top: tip.y, transform: "translate(-50%, calc(-100% - 14px))" }}
                >
                    <p className="text-[12px] font-medium text-slate-900">{tip.name}</p>
                    <p className="text-[10.5px] text-slate-500">{tip.score == null ? "No zoning data" : `Mix ${tip.score} · ${tip.tier}`}</p>
                </div>
            )}
            {state === "loading" && <MapSkeleton visible label="Loading Rosario…" tone={CANVAS} />}
            {state === "error" && (
                <p className="absolute inset-0 grid place-items-center px-6 text-center text-[12px] text-slate-500">Couldn't load the 3D map of Rosario. Reload to try again.</p>
            )}
        </div>
    );
}
