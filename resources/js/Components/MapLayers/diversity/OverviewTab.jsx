import React from "react";
import Section, { Row } from "./Section";
import MixDonut from "./MixDonut";
import { getZoneInfo } from "@/utils/clupZones";

// "Overview" = the mix lens. What this place is made of, right now.
export default function OverviewTab({
    isBgy,
    distribution = [],
    score,
    municipalMean,
    totalAreaHa,
    replayKey,
    scoreTheme,
}) {
    const primary = distribution[0];
    const secondary = distribution[1];
    const primaryZone = primary ? getZoneInfo(primary.name) : null;
    const secondaryZone = secondary ? getZoneInfo(secondary.name) : null;
    const diff = score - municipalMean;

    return (
        <>
            <Section title="Land Use Mix" meta="CLUP 2030 + live permits">
                <MixDonut
                    distribution={distribution}
                    replayKey={replayKey}
                    centerValue={Number(score).toFixed(2)}
                    centerLabel="Mix"
                />
            </Section>

            <Section title="Dominant Zones">
                {[
                    { zone: primaryZone, item: primary, rank: "Primary" },
                    { zone: secondaryZone, item: secondary, rank: "Secondary" },
                ].map(({ zone, item, rank }) => (
                    <div key={rank} className="flex items-center gap-2.5 py-1.5">
                        <span
                            className="w-8 h-8 rounded-[3px] shrink-0"
                            style={{
                                backgroundColor: zone ? zone.fill : "#e9edf2",
                                outline: `1px solid ${zone ? zone.stroke : "#cbd5e1"}`,
                            }}
                        />
                        <div className="min-w-0 flex-1">
                            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-slate-400 block">
                                {rank}
                            </span>
                            <span className="text-[11.5px] font-semibold text-slate-900 block truncate">
                                {zone ? zone.label : "Single-zone area"}
                            </span>
                        </div>
                        {item && (
                            <span className="text-xs font-mono tabular-nums font-bold text-slate-900 shrink-0">
                                {item.value}%
                            </span>
                        )}
                    </div>
                ))}
            </Section>

            <Section title="Composition">
                <Row label="Distinct zones present" value={distribution.length} />
                <Row label="Total land area" value={`${totalAreaHa.toLocaleString()} ha`} />
                {isBgy && (
                    <Row
                        label={`vs municipal mean (${municipalMean.toFixed(2)})`}
                        value={`${diff >= 0 ? "+" : ""}${diff.toFixed(2)}`}
                        accent={scoreTheme.stroke}
                    />
                )}
            </Section>
        </>
    );
}
