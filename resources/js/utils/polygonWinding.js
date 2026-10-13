// RFC 7946 right-hand rule for polygon rings, which MapLibre's 3D extrusions
// rely on: outer rings counter-clockwise, holes clockwise. Rewinds in place.
function signedArea(ring) {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        const p1 = ring[i];
        const p2 = ring[i + 1];
        sum += (p2[0] - p1[0]) * (p2[1] + p1[1]);
    }
    return sum;
}

function rewindPolygon(rings) {
    if (rings.length > 0 && signedArea(rings[0]) > 0) rings[0].reverse();
    for (let i = 1; i < rings.length; i++) {
        if (signedArea(rings[i]) < 0) rings[i].reverse();
    }
}

export function ensureRFC7946Winding(geojson) {
    if (!geojson || !geojson.features) return geojson;

    for (const f of geojson.features) {
        const coords = f.geometry?.coordinates;
        if (!coords) continue;
        if (f.geometry.type === "Polygon") rewindPolygon(coords);
        else if (f.geometry.type === "MultiPolygon") coords.forEach(rewindPolygon);
    }
    return geojson;
}
