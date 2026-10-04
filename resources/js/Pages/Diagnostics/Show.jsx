import React, { useRef, useState } from "react";
import axios from "axios";
import { Link, router, usePage } from "@inertiajs/react";
import { ReportShell, Section, Field, Status, Reporter, Blocks, stamp, control } from "./ReportUi";
import DevelopmentSupport from "./DevelopmentSupport";

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
    const inFlight = useRef(false);
    const terminal = ["resolved", "wont_fix"].includes(report.status);
    const canRespond = !terminal && handlingActions.some(action => ["resolved", "wont_fix"].includes(action));
    const handle = async (status) => {
        if (inFlight.current || blocked || terminal) return;
        inFlight.current = true;
        setPending(true); setErrors({}); setResult(null);
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
    return <ReportShell title={`${report.reference_code || "Report"} · Reports & Support`}>
        <Link href={`/diagnostics?type=${report.report_type}`} className={control}>← Back to Reports &amp; Support</Link>
        <header><p className="text-sm font-semibold text-blue-700">{support ? "Application Support" : "Technical Issue"}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-bold">{report.reference_code || "Unreferenced report"}</h1><Status value={report.status} />{!handlingActions.length && <span className="text-xs text-slate-500">Read only</span>}</div></header>
        {result && <div role={result.outcome === "success" ? "status" : "alert"} className={`rounded-xl border p-4 text-sm ${result.outcome === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
            {result.remote_updated && !result.audit_recorded && <p className="mb-1 font-bold">Report updated — audit reconciliation required</p>}
                {result.notification_status && !["delivered", "already_present", "not_applicable"].includes(result.notification_status) && <p className="mb-1 font-bold">Inspector notification not confirmed</p>}
            <p>{result.message}</p>
            {blocked && <Link href={`/diagnostics/${report.id}`} preserveState={false} className={`${control} mt-3`}>Refresh report</Link>}
        </div>}
        <Section title="Report identity"><Field label="Report reference" value={report.reference_code} /><Field label="Status" value={<Status value={report.status} />} /><Field label="Reporter" value={<Reporter report={report} />} /><Field label="Submitted" value={stamp(report.created_at)} /></Section>
        {support ? <>
            <Section title="Application">{context?.resolved ? <><Field label="Application reference" value={context.application.reference_number} /><Field label="Applicant" value={context.application.applicant_name} /><Field label="Barangay" value={context.application.barangay} /><Field label="Originating inspection" value={context.origin?.label || "Unavailable"} /></> : <p className="text-sm text-amber-800">Application context unavailable.</p>}<Field label="Reporter" value={<Reporter report={report} />} /></Section>
            <Section title="Support concern"><Field label="Support category" value={report.support_category_label} /><Field label="Affected information" value={report.affected_field} /><Field label="Title" value={report.title} /><Field label="Description / summary" value={report.summary} /><Field label="Requested correction / clarification" value={report.requested_change} /><Field label="Blocks field work" value={<Blocks value={report.blocks_field_work} />} /></Section>
            <Section title="Planning Officer">{context?.resolved ? <><Field label="Current Planning Officer" value={context.owner?.name || "No current Planning Officer assigned."} /><div className="text-sm text-slate-500">Ownership reflects the current application assignment.</div>
                {isAdmin && canNotify && context.owner && <div className="sm:col-span-2"><button className={control} disabled={notifying} onClick={notify}>{notifying ? "Notifying…" : `Notify ${context.owner.name}`}</button><p className="mt-2 text-xs text-slate-500">The current owner is checked again when you send. The response confirms who was notified.</p></div>}</> : <p className="text-sm text-amber-800">Application context unavailable. Notification unavailable.</p>}</Section>
        </> : <>
            <Section title="Issue context"><Field label="Module / screen" value={report.module} /><Field label="Occurred at" value={stamp(report.occurred_at)} /><Field label="Connectivity state" value={report.connectivity_state} /><Field label="App version" value={report.app_version} /><Field label="OS version" value={report.os_version} /><Field label="Blocks field work" value={<Blocks value={report.blocks_field_work} />} /></Section>
            <Section title="Problem"><Field label="Title" value={report.title} /><Field label="What happened / summary" value={report.summary} /><Field label="Expected behavior" value={report.expected_behavior} /><Field label="Reproduction steps (inspector-authored)" value={report.repro_steps} /></Section>
            <Section title="Technical review"><Field label="Technical description" value={report.technical_description} /><Field label="Affected file" value={report.affected_file} /><Field label="Recommended action" value={report.recommended_action} /></Section>
        </>}
        {/* Internal only. The server sends this prop for an Admin viewing a
            Technical Issue and null for every Planning Officer and every
            Application Support report, so the section cannot exist elsewhere -
            and it sits outside the inspector-facing "Official response" block. */}
        {developmentSupport && <DevelopmentSupport report={report} panel={developmentSupport} />}
        {terminal && <Section title="Official response"><div className="sm:col-span-2"><Field label="Response" value={report.response_message} /></div><Field label="Responded by" value={report.responded_by_name} /><Field label="Responded at" value={stamp(report.responded_at)} /></Section>}
        {!terminal && handlingActions.length > 0 && <section aria-labelledby="handling-heading" className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <h2 id="handling-heading" className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Handling</h2>
            {handlingActions.includes("in_review") && report.status === "submitted" && <div className="mb-4"><button type="button" className={control} disabled={pending || blocked} onClick={() => handle("in_review")}>Mark In Review</button>
                {!canRespond && <p className="mt-2 text-sm text-slate-500">Administrative triage only. A current Planning Officer must be assigned before an official response can be issued.</p>}</div>}
            {canRespond && <form onSubmit={event => { event.preventDefault(); handle(event.nativeEvent.submitter?.value || "resolved"); }}>
                <label htmlFor="official-response" className="block text-sm font-semibold text-slate-700">Official response</label>
                <p id="response-help" className="mt-1 text-sm text-slate-500">Write the inspector-facing response in plain text. Resolving or marking Won’t fix is final; the response cannot be edited afterward.</p>
                <textarea id="official-response" value={response} onChange={event => setResponse(event.target.value)} required rows={5} disabled={pending || blocked}
                    aria-invalid={Boolean(errors.response_message)} aria-describedby="response-help response-error" className="mt-3 w-full rounded-lg border-slate-300 text-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-60" />
                <p id="response-error" role={errors.response_message ? "alert" : undefined} className="mt-1 text-sm text-red-700">{errors.response_message?.[0]}</p>
                <div className="mt-3 flex flex-wrap gap-3">{handlingActions.includes("resolved") && <button type="submit" value="resolved" className={control} disabled={pending || blocked || !response.trim()}>Resolve</button>}
                    {handlingActions.includes("wont_fix") && <button type="submit" value="wont_fix" className={control} disabled={pending || blocked || !response.trim()}>Won’t fix</button>}</div>
            </form>}
            {errors.status && <p role="alert" className="mt-3 text-sm text-red-700">{errors.status[0]}</p>}
            <p aria-live="polite" className="mt-2 text-sm text-slate-500">{pending ? "Updating report…" : ""}</p>
        </section>}
        <p className="text-xs text-slate-500">Report text is displayed as plain text. Credentials and private links are redacted.</p>
    </ReportShell>;
}
