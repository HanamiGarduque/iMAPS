import React, { useEffect, useMemo, useRef, useState } from "react";
import { getZoneInfo } from "@/utils/clupZones";
import useReducedMotion from "@/utils/useReducedMotion";

const RADIUS = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// Land-use mix ring, coloured with the official flat CLUP categories so the
// breakdown here and the parcels on the map read as the same palette.
//
// The ring replays its draw-in entrance every time `replayKey` changes
// (selecting a different barangay, or returning to the municipal view) rather
// than smoothly morphing from the old shape into the new one. A morph reads as
// "the same thing changed slightly"; a fresh draw-in reads as "new data just
// arrived" — the correct signal here, since switching barangays is a context
// switch, not an incremental update. It does NOT replay when the same
// barangay's own numbers refresh live in the background (a permit gets
// approved, say) — only when the selection identity itself changes — so a
// background data refresh doesn't cause a distracting re-draw while someone is
// reading the ring.
export default function MixDonut({ distribution = [], replayKey, centerValue, centerLabel }) {
    const top = distribution.slice(0, 6);
    const reducedMotion = useReducedMotion();
    const [entered, setEntered] = useState(false);
    const rafRef = useRef(null);

    useEffect(() => {
        if (reducedMotion) {
            setEntered(true);
            return;
        }

        setEntered(false);
        // Two rAFs: the first lets the browser actually paint the "undrawn"
        // 0-length state; only then does flipping to `entered` give the CSS
        // transition a starting point to animate away from. Flipping both in
        // the same tick (or via a plain setTimeout race) risks React batching
        // them into one paint, in which case the ring would just pop straight
        // to full instead of drawing in.
        const raf1 = requestAnimationFrame(() => {
            rafRef.current = requestAnimationFrame(() => setEntered(true));
        });
        return () => {
            cancelAnimationFrame(raf1);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [replayKey, reducedMotion]);

    const segments = useMemo(() => {
        let cumulative = 0;
        return top.map((item) => {
            const val = Number(item.value) || 0;
            const dash = (val / 100) * CIRCUMFERENCE;
            const seg = {
                ...item,
                dash,
                remainder: Math.max(0, CIRCUMFERENCE - dash),
                offset: -cumulative,
                zone: getZoneInfo(item.name),
            };
            cumulative += dash;
            return seg;
        });
    }, [top]);

    if (!distribution.length) {
        return (
            <p className="text-[11px] text-slate-400 py-4 text-center">
                No zoning records for this area.
            </p>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <div className="relative shrink-0">
                <svg width="80" height="80" viewBox="0 0 80 80" className="-rotate-90">
                    <circle cx="40" cy="40" r={RADIUS} fill="none" stroke="#e9edf2" strokeWidth="12" />
                    {segments.map((seg, i) => (
                        <circle
                            key={seg.name + i}
                            cx="40"
                            cy="40"
                            r={RADIUS}
                            fill="none"
                            stroke={seg.zone.fill}
                            strokeWidth="12"
                            strokeDasharray={entered ? `${seg.dash} ${seg.remainder}` : `0 ${CIRCUMFERENCE}`}
                            strokeDashoffset={seg.offset}
                            style={{
                                transition: "stroke-dasharray 600ms cubic-bezier(0.16,1,0.3,1)",
                                transitionDelay: `${i * 60}ms`,
                            }}
                        />
                    ))}
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-sm font-bold text-slate-900 font-mono tabular-nums leading-none">
                        {centerValue}
                    </span>
                    <span className="text-[8px] font-bold uppercase tracking-[0.08em] text-slate-400 mt-1">
                        {centerLabel}
                    </span>
                </div>
            </div>

            <div className="flex-1 min-w-0 space-y-1">
                {segments.map((seg, i) => (
                    <div key={seg.name + i} className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span
                                className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                                style={{ backgroundColor: seg.zone.fill, outline: `1px solid ${seg.zone.stroke}` }}
                            />
                            <span className="text-[11px] text-slate-700 truncate" title={seg.zone.label}>
                                {seg.zone.label}
                            </span>
                        </div>
                        <span className="text-[11px] font-mono tabular-nums font-bold text-slate-900 shrink-0">
                            {seg.value}%
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
