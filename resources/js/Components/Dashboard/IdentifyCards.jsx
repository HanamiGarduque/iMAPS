import { Link } from "@inertiajs/react";
import { getSLAInfo, getZoningConformity, getStatusMarkerConfig } from "@/Components/MapLayers/StatusPanel";
import { getDiversityTheme } from "@/utils/diversityTheme";
import { getTrendsDemandColor } from "./LeafletMap";

const CloseButton = ({ onClick, label }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="w-6 h-6 flex items-center justify-center rounded-[3px] text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 cursor-pointer shrink-0"
    >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
    </button>
);

const Field = ({ label, children, mono }) => (
    <div className="min-w-0">
        <dt className="text-[10.5px] text-slate-500">{label}</dt>
        <dd className={`text-[12px] text-slate-900 truncate ${mono ? "font-mono" : ""}`}>{children}</dd>
    </div>
);

// Identify result for a clicked application pin or work-queue row. It sits in
// the dock instead of a modal, so the parcel stays visible on the map.
export function ApplicationDetails({ app, barangayZone, onClose }) {
    const cfg = getStatusMarkerConfig(app.status);
    const sla = getSLAInfo(app.created_at, app.status);
    const requestedUse = app.target_land_use_class || app.land_use_class;
    // No requested use on file means there is nothing to check yet, not a variance.
    const conformity = requestedUse ? getZoningConformity(requestedUse, barangayZone) : null;
    const open = sla.status !== "completed";
    const pct = Math.min(100, Math.round((sla.days / 15) * 100));
    const parcel = app.parcels?.[0];

    return (
        <section className="shrink-0 border-b-4 border-slate-200 bg-white" aria-label="Selected application">
            <header className="flex items-center gap-2 px-4 py-2 bg-[#eef1f5] border-b border-slate-200">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} aria-hidden="true" />
                <span className="text-[11px] font-semibold text-slate-700">{cfg.label}</span>
                <span className="font-mono text-[11px] text-slate-500 truncate">{app.reference_number || `APP-${app.id}`}</span>
                <span className="ml-auto" />
                <CloseButton onClick={onClose} label="Close application details" />
            </header>

            <div className="px-4 py-2.5 space-y-2.5">
                <div>
                    <h3 className="text-[14px] font-semibold text-slate-900 leading-snug">{app.applicant_name || "Unnamed applicant"}</h3>
                    <p className="text-[11.5px] text-slate-500">{app.application_type}</p>
                </div>

                {open && (
                    <div>
                        <div className="flex items-baseline justify-between text-[11px]">
                            <span className="text-slate-600">Processing time</span>
                            <span className="tabular-nums font-semibold text-slate-900">
                                {sla.days} of 15 days
                            </span>
                        </div>
                        <div className="h-1.5 mt-1 rounded-sm bg-slate-100 overflow-hidden">
                            <div
                                className="h-full bg-[#4f74a8]"
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                    </div>
                )}

                {conformity ? (
                    <div className={`rounded-[3px] border px-2.5 py-1.5 ${conformity.badgeClass}`} title={conformity.desc}>
                        <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
                            <span className={`w-2 h-2 rounded-full ${conformity.dotClass}`} aria-hidden="true" />
                            CLUP: {conformity.title}
                        </div>
                    </div>
                ) : (
                    barangayZone && <p className="text-[11.5px] text-slate-600">Barangay zone: {barangayZone}</p>
                )}

                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                    <Field label="Barangay">{app.barangay || "—"}</Field>
                    <Field label="Requested use">{requestedUse || "—"}</Field>
                    <Field label="Filed">
                        {app.created_at ? new Date(app.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—"}
                    </Field>
                    <Field label="Lot number" mono>{parcel?.lot_number || "—"}</Field>
                    {parcel?.tax_dec_number && <Field label="Tax declaration" mono>{parcel.tax_dec_number}</Field>}
                </dl>

                {app.purpose && (
                    <p className="text-[11.5px] text-slate-600 truncate" title={app.purpose}>
                        <span className="text-slate-500">Purpose: </span>{app.purpose}
                    </p>
                )}

                <Link
                    href={`/applications/${app.id}`}
                    className="flex items-center justify-center h-8 rounded-[3px] text-[12px] font-semibold text-white bg-[#0b2a5b] hover:bg-[#0e3574]"
                >
                    Open application
                </Link>
            </div>
        </section>
    );
}

// One barangay seen through all three modules at once. Each row switches the
// map to that module, so the numbers here are also the way in.
export function BarangayCard({ name, stat = {}, apps = {}, demand = 0, activeQuarter, activeLayer, onSwitch, onClose }) {
    const diversity = typeof stat.diversity === "number" ? stat.diversity : null;
    const tier = diversity !== null ? getDiversityTheme(diversity) : null;
    const demandClass = getTrendsDemandColor(demand);

    const rows = [
        {
            id: "status",
            label: "Applications",
            value: apps.total ?? 0,
            detail: `${apps.pending ?? 0} in process`,
        },
        {
            id: "trends",
            label: "LC demand",
            value: demand,
            detail: `${activeQuarter?.label || ""} ${activeQuarter?.isForecast ? "forecast" : "filed"} · ${demandClass.label}`,
            swatch: demandClass.color,
        },
        {
            id: "diversity",
            label: "Land-use mix",
            value: diversity !== null ? diversity.toFixed(2) : "—",
            detail: tier ? tier.classification : "No score on record",
            swatch: tier?.fill,
        },
    ];

    return (
        <section className="shrink-0 border-b-4 border-slate-200 bg-white" aria-label={`Barangay ${name}`}>
            <header className="flex items-center gap-2 px-4 py-2 bg-[#eef1f5] border-b border-slate-200">
                <div className="min-w-0">
                    <span className="block text-[10px] uppercase tracking-[0.08em] text-slate-500">Barangay</span>
                    <h3 className="text-[14px] font-semibold text-slate-900 leading-tight truncate">{name}</h3>
                </div>
                <span className="ml-auto text-[11px] text-slate-500 text-right truncate">
                    {stat.Primary_Zone ? `Zone: ${stat.Primary_Zone}` : ""}
                </span>
                <CloseButton onClick={onClose} label="Clear barangay selection" />
            </header>
            <ul>
                {rows.map((r) => {
                    const active = activeLayer === r.id;
                    return (
                        <li key={r.id}>
                            <button
                                type="button"
                                onClick={() => onSwitch(r.id)}
                                aria-current={active ? "true" : undefined}
                                className={`w-full grid grid-cols-[1fr_auto] items-center gap-2 px-4 py-2 text-left border-b border-slate-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[#0b2a5b] ${
                                    active ? "bg-[#eaf0f8] shadow-[inset_3px_0_0_#0b2a5b]" : "hover:bg-slate-50"
                                }`}
                            >
                                <span className="min-w-0">
                                    <span className="block text-[11.5px] text-slate-600">{r.label}</span>
                                    <span className="block text-[10.5px] text-slate-500 truncate">{r.detail}</span>
                                </span>
                                <span className="flex items-center gap-1.5">
                                    {r.swatch && <span className="w-3 h-3 rounded-[2px] border border-black/15" style={{ backgroundColor: r.swatch }} aria-hidden="true" />}
                                    <span className={`text-[16px] font-semibold tabular-nums text-slate-900`}>{r.value}</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </section>
    );
}
