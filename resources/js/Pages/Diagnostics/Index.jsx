import React, { useRef, useState } from "react";
import { Link, router } from "@inertiajs/react";
import { ReportShell, Status, Reporter, Blocks, stamp, control, statuses, typeLabels } from "./ReportUi";

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
    return <ReportShell><header><h1 className="text-2xl font-bold text-slate-900">Reports &amp; Support</h1>
        <p className="mt-1 text-sm text-slate-500">Inspector-submitted reports from FieldSync. Report content and status are read only.</p></header>
        {allowedTypes.length > 1 ? <nav aria-label="Report types" className="flex flex-wrap gap-2">{allowedTypes.map(type => <button
            key={type}
            type="button"
            disabled={loading}
            aria-current={filters.type === type ? "page" : undefined}
            onClick={() => visit({ type })}
            className={`${control} ${filters.type === type ? "ring-2 ring-blue-600" : ""}`}
        >{typeLabels[type]} <span className="ml-2 rounded bg-white px-2">{loadError ? "—" : counts[type] ?? 0}</span></button>)}</nav> : <h2 className="text-lg font-semibold">Application Support</h2>}
        <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-semibold text-slate-600">Status <select value={filters.status || ""} disabled={loading} onChange={e => visit({ status: e.target.value })} className="ml-2 min-h-10 rounded-lg border-slate-300 text-sm"><option value="">All statuses</option>{Object.entries(statuses).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
            {filters.application && <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600"><span>Filtered to one application</span><button className={control} onClick={() => visit({ application: "" })}>Clear application filter</button></div>}
            <span className="text-sm text-slate-500" aria-live="polite">{loading ? "Loading reports…" : !loadError ? `${pagination.total ?? 0} report(s)` : ""}</span></div>
        {loadError ? <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-800"><p>{loadError}</p><button className={`${control} mt-3`} onClick={() => visit({})} disabled={loading}>Try again</button></div> : reports.length === 0 ? <div className="rounded-xl border border-slate-200 bg-white p-10 text-center"><h3 className="font-semibold">{support ? "No support reports for this selection." : "No technical issues reported."}</h3><p className="mt-2 text-sm text-slate-500">{support ? "Application Support requests will appear here when they are available to you." : "Try another status filter or check again later."}</p></div> :
            <ul className="space-y-3" aria-busy={loading}>{reports.map(report => <li key={report.id}><Link href={`/diagnostics/${report.id}`} className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">
                <div className="flex flex-wrap items-center justify-between gap-2"><span className="break-words font-bold text-slate-900">{report.reference_code || "Unreferenced"}</span><Status value={report.status} /></div>
                <h3 className="mt-2 break-words font-semibold">{report.title || "Untitled report"}</h3>
                {support ? <><p className="mt-2 text-sm font-semibold text-blue-800">{report.context?.resolved ? report.context.application.reference_number : "Application context unavailable"}</p>
                    {report.context?.resolved && <p className="mt-1 break-words text-sm text-slate-600">{report.context.application.applicant_name}</p>}
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><span>Category: {report.support_category_label}</span><span>Current Planning Officer: {report.context?.resolved ? report.context.owner?.name || "Not assigned" : "Unavailable"}</span><span>Reported by: <Reporter report={report} /></span><span>Submitted: {stamp(report.created_at)}</span></div></> :
                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><span>Module / screen: {report.module || "Not provided"}</span><span>Reported by: <Reporter report={report} /></span><span>{report.occurred_at ? "Occurred" : "Submitted"}: {stamp(report.occurred_at || report.created_at)}</span><span>Blocks field work: <Blocks value={report.blocks_field_work} /></span></div>}
                <span className="mt-4 inline-block text-sm font-semibold text-blue-700">View report →</span>
            </Link></li>)}</ul>}
        {!loadError && pagination.last > 1 && <nav aria-label="Report pagination" className="flex flex-wrap items-center justify-between gap-3"><button className={control} disabled={loading || pagination.page <= 1} onClick={() => visit({ page: pagination.page - 1 })}>Previous</button><span className="text-sm">Page {pagination.page} of {pagination.last}</span><button className={control} disabled={loading || pagination.page >= pagination.last} onClick={() => visit({ page: pagination.page + 1 })}>Next</button></nav>}
    </ReportShell>;
}
