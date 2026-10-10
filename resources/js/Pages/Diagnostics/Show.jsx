import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { Link, router, usePage } from "@inertiajs/react";
import { ReportShell, Status, Reporter, BlockingBadge, stamp, control, typeLabels } from "./ReportUi";
import DevelopmentSupport from "./DevelopmentSupport";

const glyph = {
    person: "M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z",
    office: "M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0 0 12 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18",
    support: "M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z",
    technical: "M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437",
    check: "m4.5 12.75 6 6 9-13.5",
    xmark: "M6 18 18 6M6 6l12 12",
    clock: "M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
    pen: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z",
    eye: "M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
    back: "M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18",
    send: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
};
function Icon({ d, className = "h-5 w-5", width = 1.8 }) {
    return <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={width}><path strokeLinecap="round" strokeLinejoin="round" d={d} /></svg>;
}
/** Initials avatar; falls back to a person glyph when there is no real name to abbreviate. */
function Avatar({ name, className = "h-6 w-6 text-[10px]", tone = "bg-slate-200 text-slate-700" }) {
    const initials = (name || "").split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase();
    return <span aria-hidden="true" className={`grid shrink-0 place-items-center rounded-full font-semibold ${tone} ${className}`}>{initials || <Icon d={glyph.person} className="h-3.5 w-3.5" />}</span>;
}
function day(value) {
    const date = value && new Date(value);
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString("en-PH", { dateStyle: "long" }) : null;
}

/** A run of chat bubbles from one sender: the inspector on the left, the office on the right. The avatar sits beside the last bubble. */
function ChatGroup({ side, avatar, name, footer, children }) {
    const mine = side === "right";
    return <li className={`flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
        <span className={`shrink-0 ${footer ? "mb-[1.3rem]" : ""}`}>{avatar}</span>
        <div className={`flex min-w-0 max-w-[min(32rem,80%)] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
            <div className={`flex flex-wrap items-center gap-x-2 px-1 text-[11px] ${mine ? "justify-end" : ""}`}>{name}</div>
            {children}
            {footer && <div className={`flex flex-wrap items-center gap-x-3 gap-y-0.5 px-1 text-[10.5px] text-slate-500 ${mine ? "justify-end" : ""}`}>{footer}</div>}
        </div>
    </li>;
}
/** A flat bubble; `time` prints inside it, bottom-right, like a messenger. */
function Bubble({ side, label, value, time }) {
    const mine = side === "right";
    return <div className={`max-w-full rounded-2xl px-3.5 py-2 ${mine ? "rounded-br-md bg-blue-600 text-white" : "rounded-bl-md bg-slate-100 text-slate-900"}`}>
        {label && <p className={`text-[10.5px] font-medium ${mine ? "text-blue-100" : "text-slate-500"}`}>{label}</p>}
        <p className={`whitespace-pre-wrap break-words text-[13px] leading-relaxed ${value ? "" : mine ? "italic text-blue-100" : "italic text-slate-400"}`}>{value || "Not provided"}</p>
        {time && <p className={`mt-1 text-right text-[10.5px] tabular-nums ${mine ? "text-blue-100" : "text-slate-500"}`}>{time}</p>}
    </div>;
}
/** A centred system line across the chat (status changes). */
function SystemNote({ icon, tone, children }) {
    return <li className="relative flex justify-center">
        <span aria-hidden="true" className="absolute inset-x-0 top-1/2 h-px bg-slate-200/70" />
        <p className="relative inline-flex max-w-full flex-wrap items-center justify-center gap-x-1.5 rounded-md bg-blue-50 px-2.5 py-0.5 text-[11px] text-blue-800 ring-4 ring-white">
            <span className={`grid h-4 w-4 place-items-center rounded-full ${tone}`}><Icon d={icon} className="h-2.5 w-2.5" width={3} /></span>{children}
        </p>
    </li>;
}
/** One look for every "this could not be resolved" message. */
function Unavailable({ children }) {
    return <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-inset ring-amber-200">{children}</p>;
}
const sideIcon = {
    module: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
    signal: "M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z",
    app: "m21 7.5-9-5.25L3 7.5m18 0-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9",
    device: "M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3",
    hash: "M5.25 8.25h15m-16.5 7.5h15m-1.8-13.5-3.9 19.5m-2.1-19.5-3.9 19.5",
    pin: "M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z",
    inspection: "M9 12.75 11.25 15 15 9.75M21 12c0 1.268-.63 2.39-1.593 3.068a3.745 3.745 0 0 1-1.043 3.296 3.745 3.745 0 0 1-3.296 1.043A3.745 3.745 0 0 1 12 21c-1.268 0-2.39-.63-3.068-1.593a3.746 3.746 0 0 1-3.296-1.043 3.745 3.745 0 0 1-1.043-3.296A3.745 3.745 0 0 1 3 12c0-1.268.63-2.39 1.593-3.068a3.745 3.745 0 0 1 1.043-3.296 3.746 3.746 0 0 1 3.296-1.043A3.746 3.746 0 0 1 12 3c1.268 0 2.39.63 3.068 1.593a3.746 3.746 0 0 1 3.296 1.043 3.746 3.746 0 0 1 1.043 3.296A3.745 3.745 0 0 1 21 12Z",
    warn: "M12 9v3.75m0 3.75h.008M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z",
};
/** One attribute row in the details pane: icon + label on the left, the value right-aligned so every row ends on one edge. */
function Attr({ icon, label, children }) {
    return <div className="flex items-start justify-between gap-3 py-1.5">
        <dt className="flex shrink-0 items-start gap-2 whitespace-nowrap text-xs text-slate-500"><Icon d={icon} className="mt-px h-3.5 w-3.5 shrink-0 text-slate-400" />{label}</dt>
        <dd className="min-w-0 break-words text-right text-xs font-semibold text-slate-900">{children}</dd>
    </div>;
}
/** Details-pane section below a hairline, titled like "Notes". */
function Panel({ id, title, children }) {
    return <section aria-labelledby={id} className="mt-3 border-t border-slate-100 pt-3">
        <h2 id={id} className="mb-2 text-xs font-semibold text-slate-600">{title}</h2>
        {children}
    </section>;
}
// Compact composer buttons. One flat blue for actions; disabled is plain grey so it never looks clickable.
const buttonSm = "inline-flex h-7 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed";
const ghostSm = `${buttonSm} bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:text-slate-900 disabled:bg-slate-50 disabled:text-slate-400`;
const primarySm = `${buttonSm} bg-blue-600 text-white shadow-[0_6px_14px_-6px_rgba(37,99,235,.7)] hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none`;
const finalNote = "Final: the response can’t be edited afterward";
const dot = (tone) => <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />;
const stateTones = {
    emerald: { bar: "bg-emerald-50/70 text-emerald-900", icon: "bg-emerald-600 text-white", d: glyph.check },
    blue: { bar: "bg-blue-50/70 text-blue-900", icon: "bg-blue-600 text-white", d: glyph.pen },
    amber: { bar: "bg-amber-50/70 text-amber-900", icon: "bg-amber-500 text-white", d: glyph.clock },
    slate: { bar: "bg-slate-50 text-slate-700", icon: "bg-slate-500 text-white", d: glyph.eye },
};

/** The standalone report page (deep links, notifications, narrow screens). */
export default function Show(props) {
    const { report } = props;
    const crumb = "rounded font-medium hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600";
    return <ReportShell fill title={`${report.reference_code || "Report"} · Support Desk`}>
        <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 px-1">
            <Link href={`/diagnostics?type=${report.report_type}`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] font-semibold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"><Icon d={glyph.back} className="h-4 w-4" width={2} />Back to Support Desk</Link>
            <nav aria-label="Breadcrumb"><ol className="flex flex-wrap items-center gap-1.5 text-[13px] text-slate-500">
                <li><Link href={`/diagnostics?type=${report.report_type}`} className={crumb}>{typeLabels[report.report_type] || "Reports"}</Link></li>
                <li aria-hidden="true" className="text-slate-300">/</li>
                <li aria-current="page" className="font-semibold tabular-nums text-slate-700">{report.reference_code || "Unreferenced report"}</li>
            </ol></nav>
        </div>
        {/* —— WORKSPACE: fills the viewport; only the inner panes scroll —— */}
        <div className="report-reveal flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04),0_4px_16px_-8px_rgba(15,23,42,0.08)] lg:min-h-0 lg:flex-1 lg:flex-row">
            <ReportWorkspace {...props} reload={["report", "context", "canNotify", "handlingActions"]} />
        </div>
    </ReportShell>;
}

/**
 * Conversation + details for one report. Also embedded in the Support Desk
 * list, which passes `onClose` and its own `reload` prop names.
 */
const notified = ["delivered", "already_present", "not_applicable"];
/** True when the result banner would carry a warning the officer must read. */
const needsReading = (data) => (data.remote_updated && !data.audit_recorded) || (data.notification_status && !notified.includes(data.notification_status));

/**
 * `onHandled(status, freshProps)` runs after a clean Resolve / Won't fix has reloaded, so an
 * embedding list can move on; any warning keeps the officer on this report.
 */
export function ReportWorkspace({ report, context = null, canNotify = false, handlingActions = [], developmentSupport = null, reload, onClose, onHandled }) {
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
    const canTriage = handlingActions.includes("in_review") && report.status === "submitted";
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
                    // Preloaded lists/reports now hold the old status; drop them.
                    router.flushAll();
                    const done = data.outcome === "success" && status !== "in_review" && !needsReading(data);
                    router.reload({ only: reload, preserveScroll: true, onSuccess: (page) => { if (done) onHandled?.(status, page.props); } });
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
    const muted = (value) => value || <span className="font-normal text-slate-400">Not provided</span>;
    const responder = report.responded_by_name || "An unrecorded officer";
    // The one-line answer to "what does this page need from me?" (who/when already shows in the conversation)
    const state = terminal
        ? report.status === "resolved"
            ? { tone: "emerald", label: "Answered", text: "No further action needed." }
            : { tone: "slate", label: "Closed as won’t fix", text: "No further action needed." }
        : canRespond
            // Same words and colour as the status badge, so the banner never contradicts it.
            ? report.status === "in_review"
                ? { tone: "amber", label: "In review", text: "Write the official response below to close this report." }
                : { tone: "blue", label: "Needs your response", text: canTriage ? "Mark it in review, or write the official response below." : "Read the inspector’s report, then write the official response below." }
            : handlingActions.length
                ? { tone: "amber", label: "Waiting for a Planning Officer", text: "A current Planning Officer must be assigned before an official response can be issued." }
                : { tone: "slate", label: "Awaiting response", text: "No official response yet. You can view this report but not respond to it." };
    const tone = stateTones[state.tone];
    const visible = <span className="inline-flex items-center gap-1 text-[11px] text-slate-500"><Icon d={glyph.eye} className="h-3.5 w-3.5" />Visible to inspector</span>;
    const blocks = report.blocks_field_work;
    const fields = support
        ? [["Description / summary", report.summary], ["Requested correction / clarification", report.requested_change]]
        : [["What happened / summary", report.summary], ["Expected behavior", report.expected_behavior], ["Reproduction steps (inspector-authored)", report.repro_steps]];
    // Only fields with content get a bubble. While the report is open, the empty ones are named in
    // one quiet line so the officer knows what is missing; once closed that is only noise.
    // (If the inspector sent nothing at all, a single "Not provided" bubble stands in.)
    const filled = fields.filter(([, value]) => value);
    const bubbles = filled.length ? filled : [[null, null]];
    const missing = fields.filter(([, value]) => !value).map(([label]) => label);
    const hasReview = Boolean(report.technical_description || report.affected_file || report.recommended_action);
    const blocksRow = <Attr icon={sideIcon.warn} label="Blocks field work"><span className={`inline-flex items-center gap-1.5 ${blocks === true ? "text-red-700" : blocks === false ? "text-emerald-700" : "font-normal text-slate-400"}`}>{dot(blocks === true ? "bg-red-500" : blocks === false ? "bg-emerald-500" : "bg-slate-300")}{blocks === true ? "Yes" : blocks === false ? "No" : "Not provided"}</span></Attr>;

    return <>
            {/* —— LEFT: chat header, conversation, composer —— */}
            <div className="flex min-w-0 flex-1 flex-col bg-white lg:min-h-0">
                {result && <div role={result.outcome === "success" ? "status" : "alert"} className={`m-3 mb-0 shrink-0 rounded-xl border px-4 py-3 text-sm ${result.outcome === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                    {result.remote_updated && !result.audit_recorded && <p className="font-bold">Report updated — audit reconciliation required</p>}
                    {result.notification_status && !notified.includes(result.notification_status) && <p className="font-bold">Inspector notification not confirmed</p>}
                    <p>{result.message}</p>
                    {blocked && <Link href={`/diagnostics/${report.id}`} preserveState={false} className={`${control} mt-2`}>Refresh report</Link>}
                </div>}
                <header className="shrink-0 border-b border-slate-200">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-600 text-white"><Icon d={support ? glyph.support : glyph.technical} className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <h1 className="break-words text-sm font-semibold tracking-tight text-slate-900">{report.title || "Untitled report"}</h1>
                                <span className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-px text-[11px] font-medium tabular-nums text-slate-600">{report.reference_code || "Unreferenced"}</span>
                            </div>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                <span>{support ? "Application support request" : "Technical issue report"}</span>
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Status value={report.status} />{blocks === true && <BlockingBadge />}
                            {canTriage && <button type="button" className={control} disabled={pending || blocked} onClick={() => handle("in_review")}><Icon d={glyph.clock} className="h-4 w-4" />Mark In Review</button>}
                            {onClose && <button type="button" onClick={onClose} aria-label="Close report" className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600"><Icon d={glyph.xmark} className="h-5 w-5" width={2} /></button>}
                        </div>
                    </div>
                    <div className={`flex items-center gap-2.5 border-t border-slate-100 px-4 py-1.5 text-xs ${tone.bar}`}>
                        <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full ${tone.icon}`}><Icon d={tone.d} className="h-2.5 w-2.5" width={2.5} /></span>
                        <p className="min-w-0"><strong className="font-semibold">{state.label}</strong><span className="mx-2 opacity-30" aria-hidden="true">|</span><span className="opacity-80">{state.text}</span></p>
                    </div>
                </header>

                {/* Conversation */}
                <div className="custom-scrollbar flex-1 lg:min-h-0 lg:overflow-y-auto">
                    <ol aria-label="Conversation" className="mx-auto max-w-4xl space-y-4 px-4 py-4 sm:px-6">
                        {day(report.created_at) && <li aria-hidden="true" className="flex items-center gap-3 text-[11px] font-medium text-slate-400"><span className="h-px flex-1 bg-slate-200/70" />{day(report.created_at)}<span className="h-px flex-1 bg-slate-200/70" /></li>}

                        <ChatGroup side="left"
                            avatar={report.inspector?.resolved ? <Avatar name={report.inspector.label} className="h-7 w-7 text-[10px]" /> : <Avatar className="h-7 w-7" />}
                            name={<h2 className="font-semibold text-slate-800"><Reporter report={report} /><span className="sr-only">: {support ? "What the inspector reported" : "Problem"}</span></h2>}
                            footer={<span>Inspector, sent via FieldSync</span>}>
                            {support && <dl className="flex flex-wrap gap-1.5 text-[10.5px]">
                                <div className="rounded-md bg-blue-50 px-2.5 py-1 ring-1 ring-inset ring-blue-100"><dt className="inline text-blue-700/80">Support category: </dt><dd className="inline font-semibold text-blue-900">{report.support_category_label || "Not provided"}</dd></div>
                                <div className="rounded-md bg-white px-2.5 py-1 ring-1 ring-inset ring-slate-200"><dt className="inline text-slate-500">Affected information: </dt><dd className="inline font-semibold text-slate-800">{report.affected_field || "Not provided"}</dd></div>
                            </dl>}
                            {/* The send time sits on the last bubble shown. */}
                            {bubbles.map(([label, value], i) => <Bubble key={label || "empty"} label={label} value={value} time={i === bubbles.length - 1 ? stamp(report.created_at) : undefined} />)}
                            {!terminal && filled.length > 0 && missing.length > 0 && <p className="px-1 text-[11px] italic text-slate-400">Not provided: {missing.join(", ")}</p>}
                        </ChatGroup>

                        {report.status === "in_review" && <SystemNote icon={glyph.clock} tone="bg-amber-500 text-white">Report moved to <span className="font-semibold text-blue-950">In review</span></SystemNote>}
                        {terminal && <SystemNote icon={report.status === "resolved" ? glyph.check : glyph.xmark} tone={report.status === "resolved" ? "bg-emerald-600 text-white" : "bg-slate-500 text-white"}>
                            {report.status === "resolved" ? "Resolved" : "Closed as won’t fix"} by <span className="font-semibold text-blue-950">{responder}</span><span className="text-blue-700/70">{stamp(report.responded_at)}</span>
                        </SystemNote>}

                        {/* Who and when are on the divider above; the avatar is that same officer,
                            or the office itself when no officer was recorded. */}
                        {terminal && <ChatGroup side="right"
                            avatar={report.responded_by_name
                                ? <Avatar name={report.responded_by_name} className="h-7 w-7 text-[10px]" tone="bg-blue-700 text-white" />
                                : <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-blue-700 text-white"><Icon d={glyph.office} className="h-3.5 w-3.5" /></span>}
                            name={<h2 id="official-heading" className="font-semibold text-slate-800">Official response</h2>}
                            footer={<span className="inline-flex items-center gap-1"><Icon d={glyph.eye} className="h-3 w-3" />Visible to inspector</span>}>
                            <Bubble side="right" value={report.response_message} time={stamp(report.responded_at)} />
                        </ChatGroup>}
                    </ol>
                </div>

                {/* Composer: only while the report is open and the viewer may act */}
                {!terminal && handlingActions.length > 0 && <section aria-labelledby="handling-heading" className="shrink-0 px-4 pb-4 pt-1 sm:px-6">
                    <h2 id="handling-heading" className="sr-only">Handling</h2>
                    <div className="mx-auto max-w-4xl">
                        {canRespond && <form onSubmit={event => { event.preventDefault(); setConfirming(event.nativeEvent.submitter?.value || "resolved"); }}>
                            <div className="overflow-hidden rounded-xl bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05),0_10px_28px_-14px_rgba(15,23,42,0.22)] ring-1 ring-slate-200 transition focus-within:ring-2 focus-within:ring-blue-500/50">
                                <label htmlFor="official-response" className="flex items-center gap-1.5 px-3 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-slate-400"><Icon d={glyph.pen} className="h-3 w-3" width={2} />Official response</label>
                                <textarea id="official-response" value={response} onChange={event => setResponse(event.target.value)} required rows={2} disabled={pending || blocked} readOnly={Boolean(confirming)} placeholder="Write the reply the inspector will see…"
                                    aria-invalid={Boolean(errors.response_message)} aria-describedby="response-help response-error" className="custom-scrollbar block w-full resize-none border-0 px-3 pb-1.5 pt-0.5 text-[13px] leading-relaxed placeholder:text-slate-400 focus:ring-0 disabled:opacity-60 read-only:bg-slate-50" />
                                {confirming
                                    ? <div role="group" aria-labelledby="confirm-heading" className="flex flex-wrap items-center justify-between gap-2 border-t border-amber-200 bg-amber-50 px-3 py-2">
                                        <div><p id="confirm-heading" className="text-xs font-semibold text-amber-900">{actionLabel[confirming]} this report?</p>
                                            <p className="text-[11px] text-amber-800">This is final. The inspector will see this response and it cannot be edited afterward.</p></div>
                                        <div className="flex flex-wrap gap-1.5"><button type="button" className={ghostSm} disabled={pending} onClick={() => setConfirming(null)}>Cancel</button>
                                            <button ref={confirmButton} type="button" className={primarySm} disabled={pending || blocked} onClick={() => handle(confirming)}>Confirm {actionLabel[confirming].toLowerCase()}</button></div>
                                    </div>
                                    : <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 bg-slate-50/70 px-2 py-2">
                                        <span className="pl-1">{visible}</span>
                                        <span className="ml-auto flex flex-wrap gap-1.5">{handlingActions.includes("wont_fix") && <button type="submit" value="wont_fix" title={finalNote} className={ghostSm} disabled={pending || blocked || !response.trim()}><Icon d={glyph.xmark} className="h-3.5 w-3.5" width={2} />Won’t fix</button>}
                                            {handlingActions.includes("resolved") && <button type="submit" value="resolved" title={finalNote} className={primarySm} disabled={pending || blocked || !response.trim()}>Resolve<Icon d={glyph.send} className="h-3.5 w-3.5" width={2} /></button>}</span>
                                    </div>}
                            </div>
                            {/* Finality is spelled out on the buttons' tooltips and in the confirm step; screen readers hear it here. */}
                            <p id="response-help" className="sr-only">Resolving or marking Won’t fix is final; the response cannot be edited afterward.</p>
                            <p id="response-error" role={errors.response_message ? "alert" : undefined} className="px-1 text-sm text-red-700">{errors.response_message?.[0]}</p>
                        </form>}
                        {!canRespond && <p className="flex items-center justify-center gap-2 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-500 ring-1 ring-inset ring-slate-200/70"><Icon d={glyph.eye} className="h-4 w-4" />Administrative triage only.</p>}
                        {errors.status && <p role="alert" className="mt-2 text-sm text-red-700">{errors.status[0]}</p>}
                        <p aria-live="polite" className="px-1 text-sm text-slate-500">{pending ? "Updating report…" : ""}</p>
                    </div>
                </section>}
            </div>

            {/* —— RIGHT: contact-style details: name, then icon · label · value rows —— */}
            <aside aria-label="Report details" className="flex shrink-0 flex-col border-t border-slate-200 bg-white lg:min-h-0 lg:w-72 lg:border-l lg:border-t-0 xl:w-80">
                {/* The scroll thumb only appears while the pointer is over the panel. */}
                <div className="custom-scrollbar flex-1 px-4 pb-4 lg:overflow-y-auto [&:not(:hover)::-webkit-scrollbar-thumb]:bg-transparent">
                    <section aria-labelledby="summary-heading" className="pt-4">
                        <h2 id="summary-heading" className="sr-only">Report identity</h2>
                        <div className="flex flex-col items-center rounded-xl bg-gradient-to-b from-slate-50 to-white px-3 py-4 text-center ring-1 ring-inset ring-slate-100">
                            {report.inspector?.resolved ? <Avatar name={report.inspector.label} className="h-11 w-11 text-sm shadow-sm ring-4 ring-white" /> : <Avatar className="h-11 w-11 shadow-sm ring-4 ring-white" />}
                            <dl className="mt-2 min-w-0"><dt className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Reporter</dt><dd className="mt-0.5 break-words text-[13px] font-semibold text-slate-900"><Reporter report={report} /></dd>
                                {/* The one place the unmatched account's ID appears, for whoever traces it. */}
                                {!report.inspector?.resolved && report.inspector?.short_uuid && <><dt className="sr-only">Account ID</dt><dd className="mt-0.5 text-[11px] text-slate-400">ID <span className="font-mono">{report.inspector.short_uuid}…</span></dd></>}</dl>
                        </div>
                        <dl className="mt-3">
                            {/* Dates together first, in the order they happened; yes/no states come last. */}
                            {!support && <Attr icon={glyph.clock} label="Occurred at">{stamp(report.occurred_at)}</Attr>}
                            <Attr icon={glyph.send} label="Submitted">{stamp(report.created_at)}</Attr>
                            {support && <Attr icon={glyph.person} label="Planning Officer">{context?.resolved && context.owner?.name ? <span className="inline-flex items-center gap-1.5"><Avatar name={context.owner.name} className="h-5 w-5 text-[9px]" />{context.owner.name}</span> : context?.resolved ? "No current Planning Officer assigned." : "Unavailable"}</Attr>}
                            {support && blocksRow}
                        </dl>
                    </section>

                    {support
                        ? <section aria-labelledby="application-heading">
                            <h2 id="application-heading" className="sr-only">Application</h2>
                            {context?.resolved ? <>
                                <dl>
                                    <Attr icon={sideIcon.hash} label="Application reference"><span className="tabular-nums">{muted(context.application.reference_number)}</span></Attr>
                                    <Attr icon={sideIcon.pin} label="Barangay">{muted(context.application.barangay)}</Attr>
                                    <Attr icon={glyph.person} label="Applicant">{muted(context.application.applicant_name)}</Attr>
                                    <Attr icon={sideIcon.inspection} label="Originating inspection">{context.origin?.label || "Unavailable"}</Attr>
                                </dl>
                                <p className="mt-2 text-[11px] text-slate-500">Ownership reflects the current application assignment.</p>
                                {isAdmin && canNotify && context.owner && <div className="mt-4 border-t border-slate-100 pt-4"><button className={`${control} w-full`} disabled={notifying} onClick={notify}>{notifying ? "Notifying…" : `Notify ${context.owner.name}`}</button><p className="mt-2 text-[11px] text-slate-500">The current owner is checked again when you send. The response confirms who was notified.</p></div>}
                            </> : <div className="mt-2"><Unavailable>Application context unavailable. Notification unavailable.</Unavailable></div>}
                        </section>
                        : <>
                            <section aria-labelledby="context-heading">
                                <h2 id="context-heading" className="sr-only">Issue context</h2>
                                <dl>
                                    <Attr icon={sideIcon.module} label="Module / screen">{muted(report.module)}</Attr>
                                    <Attr icon={sideIcon.app} label="App version">{muted(report.app_version)}</Attr>
                                    <Attr icon={sideIcon.device} label="OS version">{muted(report.os_version)}</Attr>
                                    {blocksRow}
                                    <Attr icon={sideIcon.signal} label="Connectivity state">{report.connectivity_state
                                        ? <span className="inline-flex items-center gap-1.5">{dot(/offline/i.test(report.connectivity_state) ? "bg-amber-500" : /online/i.test(report.connectivity_state) ? "bg-emerald-500" : "bg-slate-400")}{report.connectivity_state}</span>
                                        : muted(null)}</Attr>
                                </dl>
                            </section>
                            {/* A closed report with no review recorded has nothing to show here. */}
                            {(!terminal || hasReview) && <Panel id="review-heading" title="Technical review">
                                {hasReview
                                    ? <dl className="space-y-3">
                                        {[["Technical description", report.technical_description], ["Affected file", report.affected_file], ["Recommended action", report.recommended_action]].map(([label, value]) => <div key={label} className="min-w-0">
                                            <dt className="text-xs font-semibold text-slate-900">{label}</dt>
                                            <dd className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-600">{!value ? <span className="text-slate-400">Not provided</span>
                                                : label === "Affected file" ? <code className="break-all rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">{value}</code> : value}</dd>
                                        </div>)}
                                    </dl>
                                    : <p className="text-xs text-slate-400">No technical review yet</p>}
                            </Panel>}
                        </>}
                    {/* Internal only. The server sends this prop for an Admin viewing a
                        Technical Issue and null for every Planning Officer and every
                        Application Support report, so the section cannot exist elsewhere -
                        and it sits outside the inspector-facing "Official response" block. */}
                    {developmentSupport && <div className="mt-4 border-t border-slate-100 pt-4"><DevelopmentSupport report={report} panel={developmentSupport} /></div>}
                </div>
            </aside>
    </>;
}
