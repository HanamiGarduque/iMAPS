import SignedChange from "@/Components/Maps/SignedChange";

// The card attached to the isolated barangay on the 3D map: who it is, how busy
// it is and how that moved, what was filed, and what comes next. The side panel
// keeps only the trend, so each number lives in one place.

const TYPE_SHADES = ["#0f172a", "#64748b", "#a8b3c2", "#d3d9e1"];

function Row({ label, value, tone, dot }) {
    return (
        <div className="flex items-center gap-2 text-[12.5px]">
            {dot && <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />}
            <span className="text-slate-600 truncate">{label}</span>
            <span className={`ml-auto font-semibold tabular-nums ${tone || "text-slate-900"}`}>{value}</span>
        </div>
    );
}

const Divider = () => <div className="my-2.5 border-t border-slate-200" />;

export default function LcCallout({ name, summary, quarter, onClose }) {
    if (!summary) return null;
    const { count, band, delta, lastYear, isForecast, typeCounts } = summary;
    const status = band.label.replace(/ (Demand|Activity)$/, "");

    return (
        <div className="relative font-sans w-[272px] text-left rounded-xl bg-white ring-1 ring-slate-900/10 shadow-[0_14px_36px_rgba(15,23,42,0.30)] px-4 pt-3 pb-3.5">
            {/* A leader line to the spot on the barangay the card belongs to. */}
            <span className="absolute top-full w-px bg-slate-500/70" style={{ display: "var(--lc-line, block)", left: "calc(50% - var(--lc-dx, 0px))", height: "var(--lc-leader, 36px)" }} aria-hidden="true" />
            <span className="absolute -ml-[4px] -mt-[1px] w-2 h-2 rounded-full bg-slate-800 ring-2 ring-white" style={{ display: "var(--lc-dot, block)", left: "calc(50% - var(--lc-dx, 0px))", top: "calc(100% + var(--lc-leader, 36px))" }} aria-hidden="true" />
            <div className="flex items-start gap-2">
                <h3 className="text-[17px] leading-tight font-bold truncate text-[#a3152f]">{name}</h3>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Clear barangay selection"
                    className="ml-auto -mr-1 -mt-0.5 w-6 h-6 shrink-0 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
            </div>

            <div className="mt-2.5 flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <div className="text-[12px] text-slate-600">{isForecast ? "LC forecast" : "Total LC filed"} · {quarter?.label}</div>
                    <div className="text-[34px] leading-none font-bold tabular-nums mt-1 text-[#a3152f]">{isForecast ? "~" : ""}{count}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[12px] text-slate-600">Status</div>
                    <span
                        className="mt-1 inline-block text-[12px] font-bold px-2.5 py-1 rounded-md"
                        style={{ color: band.stroke, backgroundColor: band.color + "33" }}
                    >
                        {status}
                    </span>
                </div>
            </div>
            <div className="mt-1.5 text-[12px]"><SignedChange delta={delta} baseLabel={lastYear?.label} /></div>

            {!isForecast && typeCounts.length > 0 && (
                <>
                    <Divider />
                    <div className="text-[12px] font-semibold text-slate-900 mb-1.5">Filings by type</div>
                    <div className="space-y-1">
                        {typeCounts.map(([t, n], i) => <Row key={t} label={t} value={n} dot={TYPE_SHADES[i]} />)}
                    </div>
                </>
            )}

        </div>
    );
}
