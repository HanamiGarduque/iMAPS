import React from "react";
import Section, { Row, Meter } from "./Section";
import ZoneDelta from "./ZoneDelta";
import { getLens } from "@/utils/diversityTheme";

// "Plan Drift" — the lens iMAPS exists for: is what's actually being permitted
// on the ground pulling away from what CLUP 2030 planned for?
//
// Every figure here comes from MapsController: the live index, the CLUP
// target index, their variance, and the spatial-cluster directive with its
// guideline text.
export default function DriftTab({
    isBgy,
    liveScore,
    clupTarget,
    variance,
    varianceStatus,
    varianceColor,
    cluster,
    municipalDrift,
    baselineDistribution = [],
    liveDistribution = [],
}) {
    const lens = getLens("drift");

    if (!isBgy) {
        const total = Object.values(municipalDrift || {}).reduce((a, b) => a + b, 0) || 1;
        return (
            <>
                <Section title="Municipal Plan Alignment" meta={`${total} barangays`}>
                    <p className="text-[11px] text-slate-600 leading-relaxed mb-3">
                        {lens.caption}
                    </p>
                    {lens.bands.map((band) => {
                        const count = municipalDrift?.[band.id] ?? 0;
                        const pct = Math.round((count / total) * 100);
                        return (
                            <Meter
                                key={band.id}
                                label={band.classification}
                                value={pct}
                                max={100}
                                display={`${count} · ${pct}%`}
                                color={band.fill}
                            />
                        );
                    })}
                </Section>

                <Section>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                        Select a barangay on the map to see its CLUP target, its live mix, and the
                        zoning directive attached to its cluster.
                    </p>
                </Section>
            </>
        );
    }

    const hasVariance = typeof variance === "number";
    const accent = varianceColor || "#64748b";

    return (
        <>
            <Section
                title="Plan vs Reality"
                meta={hasVariance ? `${variance > 0 ? "+" : ""}${variance.toFixed(2)} Δ` : undefined}
            >
                <Meter
                    label="CLUP 2030 target"
                    value={clupTarget}
                    display={typeof clupTarget === "number" ? clupTarget.toFixed(2) : "—"}
                    color="#94a3b8"
                />
                <Meter
                    label="Live on-ground mix"
                    value={liveScore}
                    display={typeof liveScore === "number" ? liveScore.toFixed(2) : "—"}
                    color={accent}
                />

                {varianceStatus && (
                    <div className="mt-3 pt-3 border-t border-slate-200 flex gap-2.5">
                        <span className="w-1 rounded-full shrink-0" style={{ backgroundColor: accent }} />
                        <div className="min-w-0">
                            <span className="text-[11.5px] font-bold block" style={{ color: accent }}>
                                {varianceStatus}
                            </span>
                            <span className="text-[11px] text-slate-600 leading-relaxed">
                                {variance > 0.05
                                    ? "Reality is diversifying ahead of the plan — conversion pressure is outrunning CLUP 2030."
                                    : variance < -0.05
                                    ? "Programmed growth has not materialised here; the area is less mixed than planned."
                                    : "Live mix is tracking the 2030 target within tolerance."}
                            </span>
                        </div>
                    </div>
                )}
            </Section>

            <Section title="Where the gap is" meta="plan vs actual">
                <ZoneDelta baseline={baselineDistribution} live={liveDistribution} />
            </Section>

            {cluster && (
                <Section title="Spatial Cluster" meta={cluster.tag}>
                    <div className="flex items-center gap-2.5 mb-2">
                        <span
                            className="w-8 h-8 rounded-[3px] shrink-0"
                            style={{ backgroundColor: cluster.color }}
                        />
                        <h5 className="text-[12.5px] font-bold text-slate-900 leading-snug">
                            {cluster.name}
                        </h5>
                    </div>

                    <p className="text-[11px] text-slate-600 leading-relaxed">{cluster.description}</p>

                    {cluster.guideline && (
                        <div className="mt-2.5 pt-2.5 border-t border-slate-200">
                            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 block mb-1">
                                Zoning Directive
                            </span>
                            <p className="text-[11.5px] font-semibold text-slate-900 leading-relaxed">
                                {cluster.guideline}
                            </p>
                        </div>
                    )}
                </Section>
            )}
        </>
    );
}
