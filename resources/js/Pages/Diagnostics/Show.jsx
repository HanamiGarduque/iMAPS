import React, { useState } from "react";
import { Link, router, usePage } from "@inertiajs/react";
import { ReportShell, Section, Field, Status, Reporter, Blocks, stamp, control } from "./ReportUi";

export default function Show({ report, context = null, canNotify = false }) {
    const { auth } = usePage().props;
    const isAdmin = auth?.user?.role === "Admin";
    const support = report.report_type === "application_support";
    const [notifying, setNotifying] = useState(false);
    const notify = () => router.post(`/diagnostics/${report.id}/notify-planning-officers`, {}, { preserveScroll: true, onStart: () => setNotifying(true), onFinish: () => setNotifying(false) });
    return <ReportShell title={`${report.reference_code || "Report"} · Reports & Support`}>
        <Link href={`/diagnostics?type=${report.report_type}`} className={control}>← Back to Reports &amp; Support</Link>
        <header><p className="text-sm font-semibold text-blue-700">{support ? "Application Support" : "Technical Issue"}</p><div className="mt-2 flex flex-wrap items-center gap-3"><h1 className="break-words text-2xl font-bold">{report.reference_code || "Unreferenced report"}</h1><Status value={report.status} /><span className="text-xs text-slate-500">Read only</span></div></header>
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
        <p className="text-xs text-slate-500">Report text is displayed as plain text. Credentials and private links are redacted.</p>
    </ReportShell>;
}
