// The point inside a barangay farthest from its edges (a coarse grid search), so
// a pin or a name always lands on the shape, even for an L-shaped or notched one.
// Coordinates are [lng, lat], as in GeoJSON.
function ringArea(ring) {
    let twice = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) twice += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    return Math.abs(twice / 2);
}

export default function labelPoint(geometry) {
    let ring = null;
    if (geometry?.type === "Polygon") ring = geometry.coordinates[0];
    else if (geometry?.type === "MultiPolygon") {
        let best = -1;
        geometry.coordinates.forEach((poly) => { const a = ringArea(poly[0]); if (a > best) { best = a; ring = poly[0]; } });
    }
    if (!ring || ring.length < 4) return null;

    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    ring.forEach(([x, y]) => { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); });
    const inside = (x, y) => {
        let c = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i], [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
        }
        return c;
    };
    const edgeDist = (x, y) => {
        let d = Infinity;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [ax, ay] = ring[j], [bx, by] = ring[i];
            const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1e-12;
            const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l));
            d = Math.min(d, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
        }
        return d;
    };
    let best = null, bestD = -1;
    const N = 24;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
        const x = w + ((e - w) * i) / N, y = s + ((n - s) * j) / N;
        if (!inside(x, y)) continue;
        const d = edgeDist(x, y);
        if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return best;
}
