import { STATUS_MARKER_CONFIG, getStatusMarkerConfig, isResolved, countStages, RELEASED_LABELS } from "@/Components/MapLayers/StatusPanel";
import { APP_LOAD_CLASSES } from "@/Components/Maps/LeafletMap";

// Application Tracking's card on the selected barangay, laid out like the LC
// card: who it is, how many applications and their load class, then where the
// open ones sit in the process.

const LOAD_NAMES = { "11+": "Very High", "6–10": "High", "3–5": "Moderate", "1–2": "Low", "0": "None" };

function Row({ label, value, tone, dot }) {
    return (
        <div className="flex items-center gap-2 text-[11px]">
            {dot && <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ backgroundColor: dot }} aria-hidden="true" />}
            <span className="text-slate-700 truncate">{label}</span>
            <span className={`ml-auto font-semibold tabular-nums ${tone || "text-slate-900"}`}>{value}</span>
        </div>
    );
}

const Divider = () => <div className="my-2.5 border-t border-slate-200" />;

export default function StatusCallout({ name, apps = [], period = "all", onClose }) {
    const total = apps.length;
    const released = apps.filter((a) => isResolved(a) && getStatusMarkerConfig(a?.status) === STATUS_MARKER_CONFIG.Released).length;
    const stages = countStages(apps);
    const load = APP_LOAD_CLASSES.find((c) => total >= c.min);

    return (
        <div className="relative font-sans w-[272px] text-left rounded-xl bg-white ring-1 ring-slate-900/10 shadow-[0_14px_36px_rgba(15,23,42,0.30)] px-4 pt-3 pb-3.5">
            {/* A leader line to the spot on the barangay the card belongs to. */}
            <span className="absolute top-full w-px bg-slate-500/70" style={{ display: "var(--lc-line, block)", left: "calc(50% - var(--lc-dx, 0px))", height: "var(--lc-leader, 36px)" }} aria-hidden="true" />
            <span className="absolute -ml-[4px] -mt-[1px] w-2 h-2 rounded-full bg-slate-800 ring-2 ring-white" style={{ display: "var(--lc-dot, block)", left: "calc(50% - var(--lc-dx, 0px))", top: "calc(100% + var(--lc-leader, 36px))" }} aria-hidden="true" />
            <div className="flex items-start gap-2">
                <h3 className="text-[17px] leading-tight font-bold truncate text-[#0b2a5b]">{name}</h3>
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
                    <div className="text-[12px] text-slate-600">Applications filed</div>
                    <div className="text-[34px] leading-none font-bold tabular-nums mt-1 text-[#0b2a5b]">{total}</div>
                </div>
                <div className="text-right shrink-0">
                    <div className="text-[12px] text-slate-600">Status</div>
                    <span
                        className="mt-1 inline-block text-[12px] font-bold px-2.5 py-1 rounded-md"
                        style={{ color: total >= 6 ? "#fff" : "#0b2a5b", backgroundColor: load.color, boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.12)" }}
                    >
                        {LOAD_NAMES[load.label]}
                    </span>
                </div>
            </div>

            <Divider />
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                <div className="text-[12px] font-semibold text-slate-900">In process</div>
                <span className="text-[10.5px] tabular-nums text-slate-400">{released} {(RELEASED_LABELS[period] || "Released").toLowerCase()}</span>
            </div>
            <div className="space-y-1">
                {stages.map((s) => <Row key={s.key} label={s.label} value={s.count} dot={s.color} tone={s.count ? undefined : "text-slate-400"} />)}
            </div>
        </div>
    );
}
