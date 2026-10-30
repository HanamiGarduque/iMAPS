import { useMemo } from "react";
import { getLens, rankByLens, matchesBand } from "@/utils/diversityTheme";

// The five most mixed barangays, floating in the map's lower-left corner so the
// side panel stays short. Built from the side panel's pieces: a question
// heading and rows marked with their band colour. Hovering a row lights the
// barangay; clicking opens it. With a band picked, it lists that band's top five.
export default function TopMixedCard({ bgyStats = {}, bandFilter = "all", hoveredBgy = null, onSelect = () => {}, onHover = () => {} }) {
    const lens = getLens("mix");
    const top = useMemo(
        () => rankByLens("mix", bgyStats).filter((r) => matchesBand("mix", bandFilter, r.stat)).slice(0, 5),
        [bgyStats, bandFilter]
    );
    if (top.length === 0) return null;

    return (
        <section
            className="absolute bottom-10 left-3 z-[500] w-[184px] bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
            aria-label="Most mixed barangays"
        >
            <h3 className="px-3 pt-2 pb-1.5 text-[11px] font-semibold leading-snug text-slate-800 border-b border-slate-200">
                Most mixed
            </h3>
            <ol className="py-0.5" onMouseLeave={() => onHover(null)}>
                {top.map((r, i) => {
                    const hovered = hoveredBgy && hoveredBgy.toLowerCase() === r.name.toLowerCase();
                    return (
                        <li key={r.name}>
                            <button
                                type="button"
                                onClick={() => onSelect(r.name)}
                                onMouseEnter={() => onHover(r.name)}
                                onFocus={() => onHover(r.name)}
                                className={`w-full grid grid-cols-[14px_1fr_auto] items-center gap-1.5 px-3 py-[3px] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b] ${
                                    hovered ? "bg-[#eaf0f8] shadow-[inset_3px_0_0_#0b2a5b]" : "hover:bg-slate-50"
                                }`}
                            >
                                <span
                                    className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8.5px] font-semibold tabular-nums"
                                    style={{ backgroundColor: r.band.fill, color: r.band.onFill, boxShadow: `inset 0 0 0 1px ${r.band.stroke}` }}
                                >
                                    {i + 1}
                                </span>
                                <span className="truncate text-[11px] text-slate-800">{r.name}</span>
                                <span className="text-[11px] font-semibold tabular-nums text-slate-900">{lens.format(r.value)}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
