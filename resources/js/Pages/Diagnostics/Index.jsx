import React, { useRef, useState } from "react";
import { Link, router } from "@inertiajs/react";
import { ReportShell, Status, Reporter, BlockingBadge, Ago, control, statuses, typeLabels } from "./ReportUi";

/**
 * ONE REQUEST IN FLIGHT AT A TIME, ON PURPOSE.
 *
 * Inertia does NOT cancel a superseded `router.get`, and it applies whichever
 * response arrives last. So two rapid tab switches could land out of order and
 * paint the older, already-abandoned failure over the newer success - which is
 * exactly the "stale error after switching tabs" symptom. Serializing here means
 * a second switch is ignored while one is in flight, so only one response is ever
 * in a position to be applied. This changes no authorization and no data.
 */
export default function Index({ reports = [], counts = {}, allowedTypes = [], filters = {}, pagination = {}, loadError = null }) {
    const [loading, setLoading] = useState(false);
    const inFlight = useRef(false);
    const support = filters.type === "application_support";
    const visit = (changes) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setLoading(true);
        router.get("/diagnostics", { ...filters, page: 1, ...changes }, {
            preserveState: true, preserveScroll: true,
            onFinish: () => { inFlight.current = false; setLoading(false); },
        });
    };
    const meta = (report) => support
        ? [report.context?.resolved ? report.context.application.reference_number : "Application context unavailable",
            report.context?.resolved && report.context.application.applicant_name,
            report.support_category_label,
            `Planning Officer: ${report.context?.resolved ? report.context.owner?.name || "Not assigned" : "Unavailable"}`]
        : [`Module / screen: ${report.module || "Not provided"}`];

    return <ReportShell>
        <header className="flex flex-wrap items-end justify-between gap-2">
            <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Reports &amp; Support</h1>
                <p className="mt-1 text-sm text-slate-500">Inspector-submitted reports from FieldSync. Open a report to review its details and available handling actions.</p></div>
        </header>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            {allowedTypes.length > 1
                ? <nav aria-label="Report types" className="flex gap-6 overflow-x-auto border-b border-slate-200 px-4 sm:px-5">{allowedTypes.map(type => {
                    const active = filters.type === type;
                    return <button
                        key={type}
                        type="button"
                        disabled={loading}
                        aria-current={active ? "page" : undefined}
                        onClick={() => visit({ type })}
                        className={`-mb-px inline-flex min-h-12 items-center gap-2 whitespace-nowrap border-b-2 px-1 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600 disabled:opacity-60 ${active ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"}`}
                    >{typeLabels[type]}<span className={`rounded-full px-2 py-0.5 text-xs ${active ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{loadError ? "—" : counts[type] ?? 0}</span></button>;
                })}</nav>
                : <h2 className="border-b border-slate-200 px-4 py-3 text-sm font-semibold text-slate-900 sm:px-5">Application Support</h2>}

            <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-600">Status
                    <select value={filters.status || ""} disabled={loading} onChange={e => visit({ status: e.target.value })} className="min-h-10 rounded-lg border-slate-300 py-1.5 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"><option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                {filters.application && <span className="inline-flex items-center gap-2 rounded-full bg-blue-50 py-1 pl-3 pr-1 text-sm text-blue-800">Filtered to one application
                    <button type="button" className="rounded-full px-2 py-0.5 text-xs font-semibold hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600" onClick={() => visit({ application: "" })}>Clear application filter</button></span>}
                <span className="ml-auto text-sm text-slate-500" aria-live="polite">{loading ? "Loading reports…" : !loadError ? `${pagination.total ?? 0} report(s)` : ""}</span>
            </div>

            {loadError
                ? <div role="alert" className="m-4 rounded-lg border border-amber-200 bg-amber-50 p-5 text-amber-800 sm:m-5"><p>{loadError}</p><button className={`${control} mt-3`} onClick={() => visit({})} disabled={loading}>Try again</button></div>
                : reports.length === 0
                    ? <div className="px-6 py-14 text-center"><h3 className="font-semibold text-slate-900">{support ? "No support reports for this selection." : "No technical issues reported."}</h3><p className="mt-2 text-sm text-slate-500">{support ? "Application Support requests will appear here when they are available to you." : "Try another status filter or check again later."}</p></div>
                    : <ul className={`divide-y divide-slate-100 transition-opacity ${loading ? "opacity-60" : ""}`} aria-busy={loading}>{reports.map(report => {
                        const blocking = report.blocks_field_work === true;
                        const closed = ["resolved", "wont_fix"].includes(report.status);
                        return <li key={report.id}><Link href={`/diagnostics/${report.id}`} className={`block border-l-4 px-4 py-3.5 transition hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600 sm:px-5 ${blocking ? "border-l-red-500" : "border-l-transparent"} ${closed ? "bg-slate-50/60" : ""}`}>
                            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs font-semibold text-slate-500">{report.reference_code || "Unreferenced"}</span>{blocking && <BlockingBadge />}</div>
                                    <h3 className={`mt-1 break-words font-semibold ${closed ? "text-slate-600" : "text-slate-900"}`}>{report.title || "Untitled report"}</h3>
                                </div>
                                <div className="flex shrink-0 items-center gap-3 text-xs text-slate-500"><Status value={report.status} />{support
                                    ? <Ago value={report.created_at} label="Submitted" />
                                    : <Ago value={report.occurred_at || report.created_at} label={report.occurred_at ? "Occurred" : "Submitted"} />}</div>
                            </div>
                            <p className="mt-1.5 break-words text-sm text-slate-500">{meta(report).filter(Boolean).join(" · ")} · Reported by <Reporter report={report} /></p>
                        </Link></li>;
                    })}</ul>}

            {!loadError && pagination.last > 1 && <nav aria-label="Report pagination" className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 sm:px-5"><button className={control} disabled={loading || pagination.page <= 1} onClick={() => visit({ page: pagination.page - 1 })}>Previous</button><span className="text-sm text-slate-600">Page {pagination.page} of {pagination.last}</span><button className={control} disabled={loading || pagination.page >= pagination.last} onClick={() => visit({ page: pagination.page + 1 })}>Next</button></nav>}
        </div>
    </ReportShell>;
}
