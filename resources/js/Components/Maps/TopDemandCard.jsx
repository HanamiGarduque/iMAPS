import { getTrendsDemandColor } from "@/Components/Maps/LeafletMap";

// Black or white text, whichever reads on the given hex fill.
const readableOn = (hex) => {
    const n = parseInt(String(hex).replace("#", "").padEnd(6, "0").slice(0, 6), 16);
    const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return lum > 0.6 ? "#1f2937" : "#ffffff";
};

// The five barangays with the most applications in the quarter on screen,
// floating in the map's lower-left corner like the diversity layer's "Most
// mixed". Rows carry the demand colour of the map. Hovering a row lights the
// barangay; clicking opens it.
export default function TopDemandCard({ rows = [], title, compareLabel = null, hoveredBgy = null, onSelect = () => {}, onHover = () => {} }) {
    const top = rows.slice(0, 5);
    if (top.length === 0) return null;

    return (
        <section
            className="absolute bottom-10 left-3 z-[500] w-[200px] bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden"
            aria-label={title}
        >
            <h3 className="px-3 pt-2 pb-1.5 text-[11px] font-semibold leading-snug text-slate-800 border-b border-slate-200">
                {title}
            </h3>
            <ol className="py-0.5" onMouseLeave={() => onHover(null)}>
                {top.map((r, i) => {
                    const cls = getTrendsDemandColor(r.count);
                    const hovered = hoveredBgy && hoveredBgy.toLowerCase() === r.name.toLowerCase();
                    return (
                        <li key={r.name}>
                            <button
                                type="button"
                                onClick={() => onSelect(r.name)}
                                onMouseEnter={() => onHover(r.name)}
                                onFocus={() => onHover(r.name)}
                                className={`w-full grid grid-cols-[14px_1fr_auto_auto] items-center gap-1.5 px-3 py-[3px] text-left cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b] ${
                                    hovered ? "bg-[#eaf0f8] shadow-[inset_3px_0_0_#0b2a5b]" : "hover:bg-slate-50"
                                }`}
                            >
                                <span
                                    className="w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8.5px] font-semibold tabular-nums"
                                    style={{ backgroundColor: cls.color, color: readableOn(cls.color), boxShadow: `inset 0 0 0 1px ${cls.stroke}` }}
                                >
                                    {i + 1}
                                </span>
                                <span className="truncate text-[11px] text-slate-800">{r.name}</span>
                                <span
                                    className={`text-[10px] tabular-nums text-right ${r.delta > 0 ? "text-[#b32a17]" : "text-[#1f5fa8]"}`}
                                    title={compareLabel ? `vs ${compareLabel}` : undefined}
                                >
                                    {r.delta == null || r.delta === 0 ? "" : `${r.delta > 0 ? "+" : "−"}${Math.abs(r.delta)}`}
                                </span>
                                <span className="text-[11px] font-semibold tabular-nums text-slate-900 min-w-[18px] text-right">{r.count}</span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {compareLabel && <p className="px-3 py-1 text-[10px] text-slate-400 border-t border-slate-100">Change vs {compareLabel}</p>}
        </section>
    );
}
