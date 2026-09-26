import React, { useMemo } from "react";
import { getZoneInfo } from "@/utils/clupZones";

// Which zones have moved away from the CLUP 2030 plan, and by how much.
//
// The drift tab could previously only say "the index is 0.03 above target".
// This says *which* zones account for it, by joining the backend's
// `baselineDistribution` (the plan's zone mix) against `distribution` (the live
// mix, permits folded in) and ranking by movement.
//
// Note the deltas are genuinely small: an approved permit adds a few hundred
// square metres to a zone measured in hectares, so a barangay typically shifts
// by tenths of a percentage point. Rounding that to "0%" would make the panel
// look broken, so sub-0.1pp movement is reported at the precision it actually
// has, and a barangay with no measurable movement says so in words.
const EPSILON = 0.05;

export default function ZoneDelta({ baseline = [], live = [], limit = 5 }) {
    const rows = useMemo(() => {
        const byZone = new Map();

        (baseline || []).forEach((item) => {
            byZone.set(item.name, { name: item.name, target: Number(item.value) || 0, actual: 0 });
        });
        (live || []).forEach((item) => {
            const existing = byZone.get(item.name);
            if (existing) existing.actual = Number(item.value) || 0;
            else byZone.set(item.name, { name: item.name, target: 0, actual: Number(item.value) || 0 });
        });

        return [...byZone.values()]
            .map((r) => ({ ...r, delta: r.actual - r.target, zone: getZoneInfo(r.name) }))
            .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    }, [baseline, live]);

    const movers = rows.filter((r) => Math.abs(r.delta) >= EPSILON).slice(0, limit);
    const maxDelta = Math.max(...movers.map((r) => Math.abs(r.delta)), EPSILON);

    if (!baseline.length) {
        return (
            <p className="text-[11px] text-slate-400 py-2">
                No CLUP baseline recorded for this barangay.
            </p>
        );
    }

    if (!movers.length) {
        return (
            <p className="text-[11px] text-slate-600 leading-relaxed py-1">
                No zone has moved measurably from the plan. Approved permits here cover too
                little ground to shift the zone mix — the barangay is following CLUP 2030 at
                the resolution this index can see.
            </p>
        );
    }

    return (
        <div className="space-y-2">
            {movers.map((row) => {
                const grew = row.delta > 0;
                const width = (Math.abs(row.delta) / maxDelta) * 50; // half-width, diverging from centre
                return (
                    <div key={row.name}>
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                                    style={{ backgroundColor: row.zone.fill, outline: `1px solid ${row.zone.stroke}` }}
                                />
                                <span className="text-[11px] text-slate-700 truncate" title={row.zone.label}>
                                    {row.zone.label}
                                </span>
                            </div>
                            <span
                                className="text-[11px] font-mono tabular-nums font-bold shrink-0"
                                style={{ color: grew ? "#8c3936" : "#345080" }}
                            >
                                {grew ? "+" : "−"}{Math.abs(row.delta).toFixed(1)}pp
                            </span>
                        </div>

                        {/* Diverging bar: right of centre means the zone grew past
                            the plan, left means it fell short. */}
                        <div className="relative h-1.5 bg-[#e9edf2] rounded-sm overflow-hidden">
                            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300 z-10" />
                            <div
                                className="absolute inset-y-0 rounded-sm transition-[width] duration-500 ease-out"
                                style={{
                                    backgroundColor: grew ? "#c0504d" : "#4a6fa5",
                                    left: grew ? "50%" : `${50 - width}%`,
                                    width: `${width}%`,
                                }}
                            />
                        </div>

                        <div className="flex justify-between text-[9.5px] font-mono tabular-nums text-slate-400 mt-0.5">
                            <span>plan {row.target.toFixed(1)}%</span>
                            <span>actual {row.actual.toFixed(1)}%</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
