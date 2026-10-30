import { useEffect, useState } from "react";
import { loadBarangayBoundaries, loadMunicipalBoundary, resolveBarangayName } from "@/utils/mapData";

const W = 70;
const H = 56;
const PAD = 4;
const MAX_POINTS = 140;
const KM_PER_DEG_LAT = 111.32;
const FRAME = "#c62828";

const outerRings = (geometry) => {
    if (!geometry) return [];
    if (geometry.type === "Polygon") return [geometry.coordinates[0]];
    if (geometry.type === "MultiPolygon") return geometry.coordinates.map((p) => p[0]);
    return [];
};

const extent = (rings) => {
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    rings.forEach((ring) => ring.forEach(([x, y]) => {
        w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y);
    }));
    return { w, s, e, n };
};

const dms = (value, pos, neg) => `${Math.abs(value).toFixed(3)}° ${value >= 0 ? pos : neg}`;

// Equirectangular fit of a lon/lat box into the inset, longitude shrunk by
// latitude so shapes keep their proportions.
function projector({ w, s, e, n }) {
    const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const scale = Math.min((W - PAD * 2) / ((e - w) * k || 1e-9), (H - PAD * 2) / ((n - s) || 1e-9));
    const offX = (W - (e - w) * k * scale) / 2;
    const offY = (H - (n - s) * scale) / 2;
    const X = (x) => offX + (x - w) * k * scale;
    const Y = (y) => offY + (n - y) * scale;
    const path = (rings) => rings.map((ring) => {
        const step = Math.max(1, Math.ceil(ring.length / MAX_POINTS));
        const pts = ring.filter((_, i) => i % step === 0).map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`);
        return `M${pts.join("L")}Z`;
    }).join("");
    return { X, Y, path, pxPerKm: scale / KM_PER_DEG_LAT };
}

// A nice round scale-bar length that fits about a third of the inset.
const niceKm = (pxPerKm) => [0.25, 0.5, 1, 2, 5, 10].reduce((best, km) => (km * pxPerKm <= W / 3 ? km : best), 0.25);

const Inset = ({ caption, children }) => (
    <figure className="m-0 min-w-0">
        <div className="border border-slate-800 bg-white">
            <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">{children}</svg>
        </div>
        <figcaption className="mt-0.5 text-[9px] text-slate-500 text-center truncate">{caption}</figcaption>
    </figure>
);

// A locator in the style of a printed zoning map's insets: Rosario with a red
// frame around the barangay, then the barangay itself framed in red, its
// neighbours drawn faintly for context, with a north arrow and a scale bar.
export default function BarangayLocator({ name, color = "#f03b20", onClear = null, compact = false }) {
    const [geo, setGeo] = useState(null);

    useEffect(() => {
        let live = true;
        Promise.all([loadMunicipalBoundary(), loadBarangayBoundaries()]).then(([muni, bgys]) => {
            if (live && muni?.features && bgys?.features) setGeo({ muni, bgys });
        });
        return () => { live = false; };
    }, []);

    if (!geo) return null;

    const muniRings = geo.muni.features.flatMap((f) => outerRings(f.geometry));
    const target = (name || "").trim().toLowerCase();
    const bgy = geo.bgys.features.find((f) => resolveBarangayName(f.properties).toLowerCase() === target);
    const bgyRings = bgy ? outerRings(bgy.geometry) : [];
    const allRings = geo.bgys.features.flatMap((f) => outerRings(f.geometry));

    const town = extent(muniRings);
    if (!Number.isFinite(town.w)) return null;
    const b = extent(bgyRings);
    const hasBgy = Number.isFinite(b.w);

    const t = projector(town);
    // The red frame on the town inset, never smaller than a findable square.
    const fx0 = hasBgy ? t.X(b.w) : 0, fx1 = hasBgy ? t.X(b.e) : 0;
    const fy0 = hasBgy ? t.Y(b.n) : 0, fy1 = hasBgy ? t.Y(b.s) : 0;
    const fw = Math.max(8, fx1 - fx0), fh = Math.max(8, fy1 - fy0);
    const fx = (fx0 + fx1) / 2 - fw / 2 - 1.5, fy = (fy0 + fy1) / 2 - fh / 2 - 1.5;

    // The zoomed inset: the barangay's box with a margin so neighbours show.
    const mx = (b.e - b.w) * 0.18, my = (b.n - b.s) * 0.18;
    const z = hasBgy ? projector({ w: b.w - mx, e: b.e + mx, s: b.s - my, n: b.n + my }) : null;
    const km = z ? niceKm(z.pxPerKm) : 0;
    const barPx = z ? km * z.pxPerKm : 0;

    const lat = hasBgy ? (b.s + b.n) / 2 : null;
    const lng = hasBgy ? (b.w + b.e) / 2 : null;

    return (
        <div
            className="absolute top-3 left-3 z-[500] w-[172px] overflow-hidden rounded-lg bg-white/95 backdrop-blur-sm ring-1 ring-slate-900/10 shadow-[0_4px_16px_rgba(15,23,42,0.14)]"
            role="img"
            aria-label={`${name} within Rosario`}
        >
            <div className="px-2.5 pt-2 pb-1.5">
                <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Location · Rosario</div>
                <div className="text-[12px] font-semibold text-slate-900 leading-tight truncate">{name}</div>
                {hasBgy && <div className="text-[9.5px] tabular-nums text-slate-500">{dms(lat, "N", "S")} · {dms(lng, "E", "W")}</div>}
            </div>

            {!compact && (
                <div className="px-2.5 grid grid-cols-2 gap-1.5">
                    <Inset caption="Rosario">
                        <path d={t.path(muniRings)} fill="#f1f5f9" stroke="#64748b" strokeWidth="0.9" strokeLinejoin="round" />
                        <path d={t.path(allRings)} fill="none" stroke="#cbd5e1" strokeWidth="0.4" strokeLinejoin="round" />
                        {hasBgy && (
                            <>
                                <path d={t.path(bgyRings)} fill={color} stroke="#0f172a" strokeOpacity="0.6" strokeWidth="0.5" />
                                <rect x={fx} y={fy} width={fw + 3} height={fh + 3} fill="none" stroke={FRAME} strokeWidth="1.4" />
                            </>
                        )}
                    </Inset>
                    {z && (
                        <Inset caption={name}>
                            <rect x="0" y="0" width={W} height={H} fill="#f8fafc" />
                            <path d={z.path(allRings)} fill="#ffffff" stroke="#cbd5e1" strokeWidth="0.6" strokeLinejoin="round" />
                            <path d={z.path(bgyRings)} fill={color} stroke="#0f172a" strokeOpacity="0.7" strokeWidth="0.9" strokeLinejoin="round" />
                            <rect x="0.75" y="0.75" width={W - 1.5} height={H - 1.5} fill="none" stroke={FRAME} strokeWidth="1.5" />
                            {/* north arrow */}
                            <g transform={`translate(${W - 9} 5)`}>
                                <path d="M0 0 L3.5 9 L0 7 L-3.5 9 Z" fill="#334155" />
                                <text y="17" textAnchor="middle" fontSize="6" fontWeight="700" fill="#334155">N</text>
                            </g>
                            {/* scale bar */}
                            <g transform={`translate(5 ${H - 9})`}>
                                <rect x="0" y="0" width={barPx / 2} height="2.5" fill="#334155" />
                                <rect x={barPx / 2} y="0" width={barPx / 2} height="2.5" fill="#ffffff" stroke="#334155" strokeWidth="0.5" />
                                <rect x="0" y="0" width={barPx} height="2.5" fill="none" stroke="#334155" strokeWidth="0.5" />
                                <text x={barPx + 3} y="3" fontSize="6" fontWeight="600" fill="#475569">{km} km</text>
                            </g>
                        </Inset>
                    )}
                </div>
            )}

            {onClear ? (
                <button
                    type="button"
                    onClick={onClear}
                    className={`${compact ? "mt-0" : "mt-1.5"} w-full h-7 flex items-center justify-center gap-1 border-t border-slate-200 text-[11px] font-medium text-slate-600 hover:text-[#0b2a5b] hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]`}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    All barangays
                </button>
            ) : <div className="h-2" />}
        </div>
    );
}
