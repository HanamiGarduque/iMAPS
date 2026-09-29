// Map settings and geometry helpers shared by the encoder's GIS step and the printable site map.
import L from "leaflet";

// maxNativeZoom lets Leaflet upscale the last available tiles instead of leaving the canvas blank
// when zoomed past the imagery's native resolution. mt0–mt3 spread requests across hosts.
export const MAP_MAX_ZOOM = 20;
export const BASEMAPS = {
    satellite: { label: "Google Satellite", url: "https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}", maxNativeZoom: 18 },
    street: { label: "Google Road", url: "https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}", maxNativeZoom: 20 },
};
export const CLUP_TILES = { url: "/tiles/clup_tiles/{z}/{x}/{y}.png", maxNativeZoom: 19 };
export const BLANK_TILE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const formatDistance = (m) => (m >= 1000 ? `${(m / 1000).toFixed(3)} km` : `${m.toFixed(2)} m`);
export const formatArea = (m2) => (m2 >= 10000 ? `${(m2 / 10000).toFixed(4)} ha (${Math.round(m2).toLocaleString()} m²)` : `${m2.toFixed(1)} m²`);

// Zone code as stored by the CLUP shapefile (older exports used other field names)
export const zoneCodeOf = (p = {}) => String(p.lup_2030 || p.LUP_2030 || p.zone_code || p.zone || "").trim();

// Spherical polygon area in m² (same approximation Leaflet.draw uses for geodesic area)
export function geodesicArea(latlngs) {
    if (latlngs.length < 3) return 0;
    const R = 6378137;
    const d2r = Math.PI / 180;
    let area = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const p1 = latlngs[i];
        const p2 = latlngs[(i + 1) % latlngs.length];
        area += (p2.lng - p1.lng) * d2r * (2 + Math.sin(p1.lat * d2r) + Math.sin(p2.lat * d2r));
    }
    return Math.abs((area * R * R) / 2);
}

const polygonsOf = (geometry) =>
    geometry?.type === "Polygon" ? [geometry.coordinates] : geometry?.type === "MultiPolygon" ? geometry.coordinates : [];

// Area of a GeoJSON (Multi)Polygon feature in m², holes subtracted
export function featureArea(feature) {
    const ringArea = (ring) => geodesicArea(ring.map(([lng, lat]) => ({ lat, lng })));
    return polygonsOf(feature?.geometry).reduce(
        (sum, rings) => sum + ringArea(rings[0]) - rings.slice(1).reduce((h, r) => h + ringArea(r), 0),
        0
    );
}

// Point-in-polygon (ray casting) for GeoJSON Polygon / MultiPolygon, holes respected
function ringContains(ring, x, y) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}
export function featureContains(feature, latlng) {
    const inPolygon = (rings) => ringContains(rings[0], latlng.lng, latlng.lat) && !rings.slice(1).some((h) => ringContains(h, latlng.lng, latlng.lat));
    return polygonsOf(feature?.geometry).some(inPolygon);
}

// Bounding-box centre of any (Multi)Polygon, used as a label anchor
export function labelPoint(geometry) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const walk = (c) => {
        if (typeof c[0] === "number") {
            if (c[0] < minX) minX = c[0];
            if (c[0] > maxX) maxX = c[0];
            if (c[1] < minY) minY = c[1];
            if (c[1] > maxY) maxY = c[1];
        } else c.forEach(walk);
    };
    if (!geometry?.coordinates) return null;
    walk(geometry.coordinates);
    return Number.isFinite(minX) ? L.latLng((minY + maxY) / 2, (minX + maxX) / 2) : null;
}

// A label point guaranteed to fall inside the shape (irregular zones often have their bbox centre outside)
export function insidePoint(feature) {
    const centre = labelPoint(feature?.geometry);
    if (centre && featureContains(feature, centre)) return centre;
    for (const rings of polygonsOf(feature?.geometry)) {
        const ring = rings[0];
        const mean = ring.reduce((a, [x, y]) => [a[0] + x / ring.length, a[1] + y / ring.length], [0, 0]);
        for (const t of [0.5, 0.3, 0.15]) {
            for (let i = 0; i < ring.length; i += Math.max(1, Math.floor(ring.length / 24))) {
                const p = L.latLng(ring[i][1] + (mean[1] - ring[i][1]) * t, ring[i][0] + (mean[0] - ring[i][0]) * t);
                if (featureContains(feature, p)) return p;
            }
        }
    }
    return null;
}

// Declared (Tax Declaration) vs mapped area; flagged beyond ±5%, the usual sign of a subdivided or wrong lot
export const AREA_TOLERANCE = 0.05;
export function areaCheck(declaredSqm, feature) {
    const declared = Number(declaredSqm);
    const mapped = feature ? featureArea(feature) : 0;
    if (!(declared > 0) || !(mapped > 0)) return null;
    const diff = (mapped - declared) / declared;
    return { declared, mapped, diff, flagged: Math.abs(diff) > AREA_TOLERANCE };
}
export const formatAreaDiff = (diff) => `${diff >= 0 ? "+" : ""}${(diff * 100).toFixed(1)}%`;
