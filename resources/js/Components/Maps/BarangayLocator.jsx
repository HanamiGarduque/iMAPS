import { useEffect, useState } from "react";
import { loadBarangayBoundaries, loadMunicipalBoundary, resolveBarangayName } from "@/utils/mapData";

const W = 148;
const H = 96;
const PAD = 8;
const MAX_POINTS = 140;
const SCALE_KM = 5;
const KM_PER_DEG_LAT = 111.32;

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

// A locator inset in the usual cartographic way: the town with every barangay
// boundary drawn faintly, the selected one filled and ringed so even a small
// barangay can be found, a graticule, a north arrow and a scale bar. It has no
// interaction of its own beyond the way back to the whole town.
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

    const { w, s, e, n } = extent(muniRings);
    if (!Number.isFinite(w)) return null;

    // Equirectangular, with longitude shrunk by latitude so the town keeps its shape.
    const k = Math.cos((((s + n) / 2) * Math.PI) / 180);
    const spanX = (e - w) * k;
    const spanY = n - s;
    const scale = Math.min((W - PAD * 2) / spanX, (H - PAD * 2) / spanY);
    const offX = (W - spanX * scale) / 2;
    const offY = (H - spanY * scale) / 2;
    const X = (x) => offX + (x - w) * k * scale;
    const Y = (y) => offY + (n - y) * scale;
    const px = ([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`;

    const toPath = (rings) => rings.map((ring) => {
        const step = Math.max(1, Math.ceil(ring.length / MAX_POINTS));
        const pts = ring.filter((_, i) => i % step === 0).map(px);
        return `M${pts.join("L")}Z`;
    }).join("");

    // The ring that calls out the barangay, sized to it but never smaller than
    // a thumb-sized target, so Santa Cruz is as findable as Calantas.
    const b = extent(bgyRings);
    const hasBgy = Number.isFinite(b.w);
    const cx = hasBgy ? X((b.w + b.e) / 2) : 0;
    const cy = hasBgy ? Y((b.s + b.n) / 2) : 0;
    const half = hasBgy ? Math.hypot(X(b.e) - X(b.w), Y(b.s) - Y(b.n)) / 2 : 0;
    const ringR = Math.max(9, half + 4);
    const showRing = hasBgy && half < 18;

    const lat = hasBgy ? (b.s + b.n) / 2 : null;
    const lng = hasBgy ? (b.w + b.e) / 2 : null;
    const scaleBarPx = (SCALE_KM * scale) / KM_PER_DEG_LAT;

    return (
        <div
            className="absolute top-3 left-3 z-[500] w-[164px] overflow-hidden rounded-lg bg-white/95 backdrop-blur-sm ring-1 ring-slate-900/10 shadow-[0_4px_16px_rgba(15,23,42,0.14)]"
            role="img"
            aria-label={`${name} within Rosario`}
        >
            <div className="px-3 pt-2.5 pb-2">
                <div className="text-[9px] font-semibold uppercase tracking-[0.1em] text-slate-400">Location · Rosario</div>
                <div className="text-[13px] font-semibold text-slate-900 leading-tight truncate">{name}</div>
                {hasBgy && <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">{dms(lat, "N", "S")} · {dms(lng, "E", "W")}</div>}
            </div>

            {!compact && <div className="mx-2 rounded-[5px] border border-slate-200 bg-[#f7f8fa] overflow-hidden">
                <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block">
                    {/* graticule */}
                    <g stroke="#e3e6ea" strokeWidth="0.5" strokeDasharray="2 3">
                        {[1, 2, 3].map((i) => <line key={`v${i}`} x1={(W / 4) * i} y1="0" x2={(W / 4) * i} y2={H} />)}
                        {[1, 2].map((i) => <line key={`h${i}`} x1="0" y1={(H / 3) * i} x2={W} y2={(H / 3) * i} />)}
                    </g>
                    <path d={toPath(muniRings)} fill="#ffffff" stroke="#aeb5bd" strokeWidth="1" strokeLinejoin="round" />
                    <path d={toPath(allRings)} fill="none" stroke="#d5dae0" strokeWidth="0.5" strokeLinejoin="round" />
                    {hasBgy && (
                        <>
                            <path d={toPath(bgyRings)} fill={color} stroke="#0f172a" strokeOpacity="0.75" strokeWidth="0.8" strokeLinejoin="round" />
                            {showRing && (
                                <>
                                    <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#ffffff" strokeWidth="3" />
                                    <circle cx={cx} cy={cy} r={ringR} fill="none" stroke="#0b2a5b" strokeWidth="1.2" />
                                </>
                            )}
                        </>
                    )}
                    {/* north arrow */}
                    <g transform={`translate(${W - 13} 6)`}>
                        <path d="M0 0 L4 11 L0 8.5 L-4 11 Z" fill="#334155" />
                        <text y="21" textAnchor="middle" fontSize="7" fontWeight="700" fill="#334155">N</text>
                    </g>
                    {/* scale bar */}
                    <g transform={`translate(7 ${H - 11})`}>
                        <rect x="0" y="0" width={scaleBarPx / 2} height="3" fill="#334155" />
                        <rect x={scaleBarPx / 2} y="0" width={scaleBarPx / 2} height="3" fill="#ffffff" stroke="#334155" strokeWidth="0.6" />
                        <rect x="0" y="0" width={scaleBarPx} height="3" fill="none" stroke="#334155" strokeWidth="0.6" />
                        <text x={scaleBarPx + 4} y="3.5" fontSize="7" fontWeight="600" fill="#475569">{SCALE_KM} km</text>
                    </g>
                </svg>
            </div>}

            {onClear ? (
                <button
                    type="button"
                    onClick={onClear}
                    className={`${compact ? "mt-0" : "mt-2"} w-full h-8 flex items-center justify-center gap-1 border-t border-slate-200 text-[11.5px] font-medium text-slate-600 hover:text-[#0b2a5b] hover:bg-slate-50 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b]`}
                >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                    All barangays
                </button>
            ) : <div className="h-2" />}
        </div>
    );
}
