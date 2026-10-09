import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, router, usePage } from "@inertiajs/react";
import { ReportShell, Section, Field, Status, Reporter, Blocks, BlockingBadge, stamp, control, primary } from "./ReportUi";
import DevelopmentSupport from "./DevelopmentSupport";

const card = "rounded-xl border border-slate-200 bg-white shadow-sm";
const cardTitle = "border-b border-slate-100 px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-5";

/** The inspector's own words, given more weight than metadata. */
function Quote({ label, value }) {
    return <div><h3 className="text-xs font-medium text-slate-500">{label}</h3>{value
        ? <blockquote className="mt-1.5 whitespace-pre-wrap break-words border-l-4 border-blue-200 pl-4 text-[15px] leading-relaxed text-slate-900">{value}</blockquote>
        : <p className="mt-1.5 text-sm text-slate-400">Not provided</p>}</div>;
}
function Row({ label, children }) {
    return <div className="flex items-start justify-between gap-4 py-2.5 text-sm"><dt className="shrink-0 text-slate-500">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-slate-900">{children}</dd></div>;
}

export default function Show({ report, context = null, canNotify = false, handlingActions = [], developmentSupport = null }) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === "Admin";
    const support = report.report_type === "application_support";
    const [notifying, setNotifying] = useState(false);
    const [response, setResponse] = useState("");
    const [pending, setPending] = useState(false);
    const [result, setResult] = useState(null);
    const [errors, setErrors] = useState({});
    const [blocked, setBlocked] = useState(false);
    const [confirming, setConfirming] = useState(null);
    const confirmButton = useRef(null);
    const inFlight = useRef(false);
    const terminal = ["resolved", "wont_fix"].includes(report.status);
    const canRespond = !terminal && handlingActions.some(action => ["resolved", "wont_fix"].includes(action));
    useEffect(() => { if (confirming) confirmButton.current?.focus(); }, [confirming]);
    const handle = async (status) => {
        if (inFlight.current || blocked || terminal) return;
        inFlight.current = true;
        setPending(true); setErrors({}); setResult(null); setConfirming(null);
        try {
            const reply = await axios.post(`/diagnostics/${report.id}/handle`, {
                status, response_message: status === "in_review" ? null : response,
            }, { headers: { Accept: "application/json" }, validateStatus: () => true });
            const data = reply.data;
            if (reply.status === 422) {
                setErrors(data.errors || {});
            } else if (data?.outcome) {
                setResult(data);
                // Partial/uncertain writes must not invite a repeat terminal action.
                setBlocked(data.outcome !== "success");
                if (data.remote_updated || data.outcome === "conflict") {
                    if (data.remote_updated) setResponse("");
                    router.reload({ only: ["report", "context", "canNotify", "handlingActions"], preserveScroll: true });
                }
            } else {
                setBlocked(true);
                setResult({ outcome: "error", message: reply.status === 403
                    ? "You no longer have authority to handle this report. Refresh to see its current owner."
                    : "The request could not be completed. Refresh to check the report before taking further action." });
            }
        } catch {
            setBlocked(true);
            setResult({ outcome: "error", message: "The update could not be confirmed. Refresh to check the report before taking further action." });
        } finally {
            inFlight.current = false; setPending(false);
        }
    };
    const notify = () => router.post(`/diagnostics/${report.id}/notify-planning-officers`, {}, { preserveScroll: true, onStart: () => setNotifying(true), onFinish: () => setNotifying(false) });
    const actionLabel = { resolved: "Resolve", wont_fix: "Won’t fix" };

    return <ReportShell title={`${report.reference_code || "Report"} · Reports & Support`}>
        <Link href={`/diagnostics?type=${report.report_type}`} className="inline-flex items-center gap-1 rounded text-sm font-semibold text-slate-600 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">← Back to Reports &amp; Support</Link>

        <header>
            <p className="text-xs font-bold uppercase tracking-wider text-blue-700">{support ? "Application Support" : "Technical Issue"}<span className="mx-2 text-slate-300">·</span><span className="font-mono normal-case tracking-normal text-slate-500">{report.reference_code || "Unreferenced report"}</span></p>
            <h1 className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900">{report.title || "Untitled report"}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2"><Status value={report.status} />{report.blocks_field_work === true && <BlockingBadge />}{!handlingActions.length && <span className="text-xs text-slate-500">Read only</span>}</div>
        </header>

        {result && <div role={result.outcome === "success" ? "status" : "alert"} className={`rounded-xl border p-4 text-sm ${result.outcome === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {result.remote_updated && !result.audit_recorded && <p className="mb-1 font-bold">Report updated — audit reconciliation required</p>}
            {result.notification_status && !["delivered", "already_present", "not_applicable"].includes(result.notification_status) && <p className="mb-1 font-bold">Inspector notification not confirmed</p>}
            <p>{result.message}</p>
            {blocked && <Link href={`/diagnostics/${report.id}`} preserveState={false} className={`${control} mt-3`}>Refresh report</Link>}
        </div>}

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
            <div className="min-w-0 space-y-5">
                {support ? <>
                    <section className={card} aria-labelledby="concern-heading">
                        <h2 id="concern-heading" className={cardTitle}>What the inspector reported</h2>
                        <div className="space-y-5 p-4 sm:p-5">
                            <dl className="flex flex-wrap gap-2 text-sm">
                                <div className="rounded-full bg-slate-100 px-3 py-1"><dt className="sr-only">Support category</dt><dd className="font-semibold text-slate-700">{report.support_category_label}</dd></div>
                                <div className="rounded-full bg-slate-100 px-3 py-1"><dt className="inline text-slate-500">Affected information: </dt><dd className="inline font-semibold text-slate-700">{report.affected_field || "Not provided"}</dd></div>
                            </dl>
                            <Quote label="Description / summary" value={report.summary} />
                            <Quote label="Requested correction / clarification" value={report.requested_change} />
                        </div>
                    </section>
                    <Section title="Application">{context?.resolved ? <><Field label="Application reference" value={context.application.reference_number} /><Field label="Applicant" value={context.application.applicant_name} /><Field label="Barangay" value={context.application.barangay} /><Field label="Originating inspection" value={context.origin?.label || "Unavailable"} /></> : <p className="text-sm text-amber-800 sm:col-span-2">Application context unavailable.</p>}</Section>
                </> : <>
                    <section className={card} aria-labelledby="problem-heading">
                        <h2 id="problem-heading" className={cardTitle}>Problem</h2>
                        <div className="space-y-5 p-4 sm:p-5">
                            <Quote label="What happened / summary" value={report.summary} />
                            <Quote label="Expected behavior" value={report.expected_behavior} />
                            <Quote label="Reproduction steps (inspector-authored)" value={report.repro_steps} />
                        </div>
                    </section>
                    <Section title="Issue context"><Field label="Module / screen" value={report.module} /><Field label="Occurred at" value={stamp(report.occurred_at)} /><Field label="Connectivity state" value={report.connectivity_state} /><Field label="App version" value={report.app_version} /><Field label="OS version" value={report.os_version} /></Section>
                    <Section title="Technical review"><Field label="Technical description" value={report.technical_description} /><Field label="Affected file" value={report.affected_file} /><div className="sm:col-span-2"><Field label="Recommended action" value={report.recommended_action} /></div></Section>
                </>}
                {/* Internal only. The server sends this prop for an Admin viewing a
                    Technical Issue and null for every Planning Officer and every
                    Application Support report, so the section cannot exist elsewhere -
                    and it sits outside the inspector-facing "Official response" block. */}
                {developmentSupport && <DevelopmentSupport report={report} panel={developmentSupport} />}
            </div>

            <aside className="space-y-5" aria-label="Report status and handling">
                <section className={card} aria-labelledby="summary-heading">
                    <h2 id="summary-heading" className={cardTitle}>Report identity</h2>
                    <dl className="divide-y divide-slate-100 px-4 sm:px-5">
                        <Row label="Status"><Status value={report.status} /></Row>
                        <Row label="Reporter"><Reporter report={report} /></Row>
                        <Row label="Submitted">{stamp(report.created_at)}</Row>
                        <Row label="Blocks field work"><Blocks value={report.blocks_field_work} /></Row>
                        {support && <Row label="Planning Officer">{context?.resolved ? context.owner?.name || "No current Planning Officer assigned." : "Unavailable"}</Row>}
                    </dl>
                    {support && <div className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:px-5">{context?.resolved
                        ? <>Ownership reflects the current application assignment.
                            {isAdmin && canNotify && context.owner && <div className="mt-3"><button className={`${control} w-full`} disabled={notifying} onClick={notify}>{notifying ? "Notifying…" : `Notify ${context.owner.name}`}</button><p className="mt-2">The current owner is checked again when you send. The response confirms who was notified.</p></div>}</>
                        : <span className="text-amber-800">Application context unavailable. Notification unavailable.</span>}</div>}
                </section>

                {terminal && <section className="rounded-xl border border-emerald-200 bg-white shadow-sm" aria-labelledby="official-heading">
                    <h2 id="official-heading" className="border-b border-emerald-100 bg-emerald-50/60 px-4 py-3 text-xs font-bold uppercase tracking-wider text-emerald-800 sm:px-5">Official response</h2>
                    <div className="space-y-3 p-4 sm:p-5">
                        <p className={`whitespace-pre-wrap break-words text-sm ${report.response_message ? "text-slate-900" : "text-slate-400"}`}>{report.response_message || "Not provided"}</p>
                        <dl className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3"><Field label="Responded by" value={report.responded_by_name} /><Field label="Responded at" value={stamp(report.responded_at)} /></dl>
                    </div>
                </section>}

                {!terminal && handlingActions.length > 0 && <section aria-labelledby="handling-heading" className={card}>
                    <h2 id="handling-heading" className={cardTitle}>Handling</h2>
                    <div className="p-4 sm:p-5">
                        {handlingActions.includes("in_review") && report.status === "submitted" && <div className={canRespond ? "mb-5 border-b border-slate-100 pb-5" : ""}><button type="button" className={`${control} w-full`} disabled={pending || blocked} onClick={() => handle("in_review")}>Mark In Review</button>
                            {!canRespond && <p className="mt-2 text-sm text-slate-500">Administrative triage only. A current Planning Officer must be assigned before an official response can be issued.</p>}</div>}
                        {canRespond && <form onSubmit={event => { event.preventDefault(); setConfirming(event.nativeEvent.submitter?.value || "resolved"); }}>
                            <label htmlFor="official-response" className="block text-sm font-semibold text-slate-800">Official response</label>
                            <p id="response-help" className="mt-1 text-xs text-slate-500">Write the inspector-facing response in plain text. Resolving or marking Won’t fix is final; the response cannot be edited afterward.</p>
                            <textarea id="official-response" value={response} onChange={event => setResponse(event.target.value)} required rows={6} disabled={pending || blocked} readOnly={Boolean(confirming)}
                                aria-invalid={Boolean(errors.response_message)} aria-describedby="response-help response-error" className="mt-3 w-full rounded-lg border-slate-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60 read-only:bg-slate-50" />
                            <p id="response-error" role={errors.response_message ? "alert" : undefined} className="mt-1 text-sm text-red-700">{errors.response_message?.[0]}</p>
                            {confirming
                                ? <div role="group" aria-labelledby="confirm-heading" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                                    <p id="confirm-heading" className="text-sm font-semibold text-amber-900">{actionLabel[confirming]} this report?</p>
                                    <p className="mt-1 text-xs text-amber-800">This is final. The inspector will see this response and it cannot be edited afterward.</p>
                                    <div className="mt-3 flex flex-wrap gap-2"><button ref={confirmButton} type="button" className={primary} disabled={pending || blocked} onClick={() => handle(confirming)}>Confirm {actionLabel[confirming].toLowerCase()}</button>
                                        <button type="button" className={control} disabled={pending} onClick={() => setConfirming(null)}>Cancel</button></div>
                                </div>
                                : <div className="mt-3 flex flex-wrap gap-2">{handlingActions.includes("resolved") && <button type="submit" value="resolved" className={primary} disabled={pending || blocked || !response.trim()}>Resolve</button>}
                                    {handlingActions.includes("wont_fix") && <button type="submit" value="wont_fix" className={control} disabled={pending || blocked || !response.trim()}>Won’t fix</button>}</div>}
                        </form>}
                        {errors.status && <p role="alert" className="mt-3 text-sm text-red-700">{errors.status[0]}</p>}
                        <p aria-live="polite" className="mt-2 text-sm text-slate-500">{pending ? "Updating report…" : ""}</p>
                    </div>
                </section>}
            </aside>
        </div>
        <p className="text-xs text-slate-500">Report text is displayed as plain text. Credentials and private links are redacted.</p>
    </ReportShell>;
}
