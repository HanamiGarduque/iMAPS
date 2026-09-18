// Shared, cached loaders for the map geometry both diversity views need.
//
// The 2D and 3D maps are mounted exclusively — you see one or the other — so
// each used to fetch its own copy of the barangay outlines, and toggling
// dimension paid for the download again. Worse, they were fetching *different
// geometry*: 2D read `/api/map/barangay_boundary` while 3D read a static
// `rosario_3d_diversity_extrusions.geojson` exported by hand, so a boundary
// corrected in PostGIS would show in one view and not the other.
//
// One source, fetched once per page load.

const cache = new Map();

// Caches the in-flight promise, so two components asking at once share one
// request. A failed request is evicted, though — caching the failure would pin
// the layer to "missing" for the rest of the session, with no way to retry
// short of a reload.
//
// Freshness is the server's job: the map API answers with an ETag and
// `no-cache`, so the browser revalidates and gets a body-less 304 when the
// geometry hasn't changed since the last visit.
function cachedJson(key, url) {
    if (cache.has(key)) return cache.get(key);

    const request = fetch(url, { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)
        .then((data) => {
            if (data === null) cache.delete(key);
            return data;
        });

    cache.set(key, request);
    return request;
}

// All 48 barangay outlines, authoritative from PostGIS.
//
// `location` is the barangay name and matches the keys of `bgyStats`, which the
// controller builds from the same column.
export function loadBarangayBoundaries() {
    return cachedJson("barangay_boundary", "/api/map/barangay_boundary");
}

export function loadMunicipalBoundary() {
    return cachedJson("rosario_boundary", "/api/map/rosario_boundary");
}

// Every zoning parcel in the municipality. Only the layers that render the
// whole plan at once (CLUP 2030, Urban Growth) need this; the diversity view
// asks for one barangay at a time via `?barangay=`.
export function loadLandUsePlan() {
    return cachedJson("land_use_plan", "/api/map/land_use_plan");
}

// Resolves a barangay name from whichever property the source happens to use.
// The boundary table calls it `location`; older exports used `name`, `ADM4_EN`
// or `BRGY`, and some carry uppercase variants.
export function resolveBarangayName(properties) {
    const p = properties || {};
    return String(
        p.location || p.LOCATION || p.name || p.NAME || p.ADM4_EN || p.brgy || p.BRGY || ""
    ).trim();
}
