import MixDonut from "@/Components/MapLayers/diversity/MixDonut";
import { getLens, resolveLensValue } from "@/utils/diversityTheme";

// The Diversity Index's card on the selected barangay, built like the LC card:
// the barangay, its mix score and band, then the land use filed there.

const Divider = () => <div className="my-2.5 border-t border-slate-200" />;

export default function DiversityCallout({ name, stat = {}, onClose }) {
    const lens = getLens("mix");
    // null = too few filings in this period to score.
    const score = typeof stat.diversity === "number" ? stat.diversity : null;
    const headline = resolveLensValue("mix", { diversity: score });
    const distribution = stat.distribution || [];
    const fromRecords = stat.mixSource === "records";
    const records = stat.mixRecords ?? 0;
    const developedHa = stat.developedHa ?? 0;
    const status = headline.band.classification;

    return (
        <div className="relative font-sans w-[272px] text-left rounded-xl bg-white ring-1 ring-slate-900/10 shadow-[0_14px_36px_rgba(15,23,42,0.30)] px-4 pt-3 pb-3.5">
            {/* A leader line to the spot on the barangay the card belongs to. */}
            <span className="absolute top-full w-px bg-slate-500/70" style={{ display: "var(--lc-line, block)", left: "calc(50% - var(--lc-dx, 0px))", height: "var(--lc-leader, 36px)" }} aria-hidden="true" />
            <span className="absolute -ml-[4px] -mt-[1px] w-2 h-2 rounded-full bg-slate-800 ring-2 ring-white" style={{ display: "var(--lc-dot, block)", left: "calc(50% - var(--lc-dx, 0px))", top: "calc(100% + var(--lc-leader, 36px))" }} aria-hidden="true" />
            <div className="flex items-start gap-2">
                <h3 className="text-[17px] leading-tight font-bold truncate text-slate-900">{name}</h3>
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
                    <div className="text-[12px] text-slate-600">Mix score</div>
                    <div className="text-[34px] leading-none font-bold tabular-nums mt-1 text-slate-900">{score == null ? "—" : lens.format(score)}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[12px] text-slate-600">Status</div>
                    <span
                        className="mt-1 inline-block text-[12px] font-bold px-2.5 py-1 rounded-md"
                        style={{ color: headline.onFill, backgroundColor: headline.color }}
                    >
                        {status}
                    </span>
                </div>
            </div>

            <Divider />
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="text-[12px] font-semibold text-slate-900">Filed land use</div>
                {fromRecords && (
                    <span className="text-[10.5px] tabular-nums text-slate-400">
                        {Number(records).toLocaleString("en-PH")} filings · {Number(developedHa).toLocaleString("en-PH")} ha
                    </span>
                )}
            </div>
            {score == null || !fromRecords || distribution.length === 0 ? (
                <p className="text-[11.5px] text-slate-500">Too few filings with a zoning code and lot area to show.</p>
            ) : (
                <MixDonut distribution={distribution} replayKey={name} centerValue={lens.format(score)} centerLabel="Mix" />
            )}
        </div>
    );
}
