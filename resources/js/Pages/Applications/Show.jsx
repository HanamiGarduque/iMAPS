// resources/js/Pages/Applications/Show.jsx
// Application record: a view-only map of the lots (left) and Summary / Lots / History (right).
import React, { useState, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Link, Head, router, usePage } from "@inertiajs/react";
import dialog, { esc, notify, tight } from "@/utils/dialog";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import ParcelInspectionStatus from "@/Components/ParcelInspectionStatus";
import InspectionDeliveryStatusPanel from "@/Components/InspectionDeliveryStatusPanel";
import { PlanningOfficerAssignment, InspectorRoundAssignment } from "@/Components/WorkAssignment";
import { getZoningCheck, CHECK_COLORS, AreaComparison } from "@/Components/MapKit";
import { getZoneInfo } from "@/utils/clupZones";
import { loadBarangayBoundaries } from "@/utils/mapData";
import ApplicationMap from "./Components/ApplicationMap";
import SiteMapPrint from "./Components/SiteMapPrint";
import { PermitExportPanel, getMissingRecommendedPermits, getPermitChecklist } from "./Components/GeneratePermitModal";
import { confirmSignOut } from "@/utils/signOut";

const STANDARD_STAGES = ["Received", "Technical Review", "For Release", "Released"];
const SB_STAGES = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released"];
const STAGES = SB_STAGES;
const DECISIONS = [
    { value: "Approved", label: "Approve", dot: "bg-emerald-500" },
    { value: "Needs Site Inspection", label: "Site inspection", dot: "bg-amber-500" },
    { value: "Declined", label: "Decline", dot: "bg-rose-500" },
];
const DONE_INSPECTION = ["completed", "submitted"];

// ── LOOP 4: "Requires Reinspection" restored by the master merge ───────────────
// The canonical `technical_reviews.decision` CHECK constraint admits FOUR values
// — Approved, Needs Site Inspection, Requires Reinspection, Declined — and the
// branch ships migration
// 2026_09_21_000000_allow_requires_reinspection_technical_review_decision to
// establish that. Live canonical data already contains rows using it. A UI
// offering only three options silently made a canonical business decision
// unreachable, so the fourth is restored here rather than papered over.
//
// A completed inspection is what makes reinpection the correct next step: if the
// lot has already been inspected, "Needs Site Inspection" is wrong and
// "Requires Reinspection" is the canonical replacement.
const REINSPECTION_DECISION = "Requires Reinspection";
const decisionOptions = (hasCompletedInspection) =>
    ["Approved", hasCompletedInspection ? REINSPECTION_DECISION : "Needs Site Inspection", "Declined"];
const DECISION_DOT = {
    Approved: "bg-emerald-500",
    "Needs Site Inspection": "bg-amber-500",
    [REINSPECTION_DECISION]: "bg-violet-500",
    Declined: "bg-rose-500",
};
const decisionLabel = (d) => {
    if (d === REINSPECTION_DECISION) return "Schedule reinspection";
    if (d === "Approved") return "Approve";
    if (d === "Declined") return "Decline";
    if (d === "Needs Site Inspection") return "Site inspection";
    return d;
};

// Ease of Doing Business (RA 11032) processing time for highly technical applications, in working days.
// Only stages the office controls count against it (SB deliberation is legislative).
const ARTA_WORKING_DAYS = 20;
const OFFICE_STAGES = ["Received", "Technical Review", "For Release"];

const AUDIT_LABELS = {
    APPLICATION_CREATED: "Application encoded",
    STATUS_UPDATE: "Status changed",
    AMENDMENT_REFS_UPDATED: "SB / DAR references updated",
    TECHNICAL_REVIEW_APPROVED: "Technical review approved",
    TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION: "Site inspection flagged",
    TECHNICAL_REVIEW_REQUIRES_REINSPECTION: "Reinspection flagged",
    TECHNICAL_REVIEW_DECLINED: "Technical review declined",
    SITE_INSPECTION_ASSIGNED: "Site inspection assigned",
    BATCH_TECHNICAL_REVIEW_UPDATED: "Batch review updated",
    BATCH_TECHNICAL_REVIEW_COMPLETED: "Batch review completed",
    APPLICATION_ARCHIVED: "Application archived",
    APPLICATION_UNARCHIVED: "Application unarchived",
    APPLICATION_VOIDED: "Application voided",
    PERMIT_DELETED: "Saved permit removed",
};

// Mon–Fri days elapsed (national holidays not excluded)
function workingDaysSince(from, to = new Date()) {
    if (!from) return null;
    const d = new Date(from);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    let n = 0;
    while (d < end) {
        d.setDate(d.getDate() + 1);
        const w = d.getDay();
        if (w !== 0 && w !== 6) n++;
    }
    return n;
}

const fmtDate = (d, withTime = false) => {
    if (!d) return "—";
    const date = new Date(d);
    if (isNaN(date.getTime())) return "—";
    const day = date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    return withTime ? `${day} · ${date.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : day;
};
const peso = (v) => `₱ ${Number(v || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dash = (v) => (v !== null && v !== undefined && String(v).trim() !== "" ? v : "—");
const today = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date()).map(({ type, value }) => [type, value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
};



// Tinted badge per stage (soft background, matching text and dot)
// Same badge as the Registry's (Applications/Index): iMAPS blue for every stage, red only for Denied.
function StatusPill({ status }) {
    const denied = status === "Denied";
    return (
        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11.5px] font-medium whitespace-nowrap ${denied ? "bg-red-50 text-red-700 border-red-200" : "bg-blue-50 text-blue-700 border-blue-200"}`}>
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${denied ? "bg-red-500" : "bg-blue-600"}`} aria-hidden="true" />
            {status || "—"}
        </span>
    );
}

// Label / value row used across the record.
function Row({ label, children, mono = false }) {
    const empty = children === null || children === undefined || children === "" || children === false;
    return (
        <div className="grid grid-cols-[104px_1fr] gap-3 py-1.5 border-b border-slate-100 last:border-b-0">
            <dt className="text-[12px] text-slate-500">{label}</dt>
            <dd className={`text-[12.5px] text-slate-900 break-words ${mono ? "font-mono text-[12px]" : ""}`}>{empty ? <span className="text-slate-400">—</span> : children}</dd>
        </div>
    );
}

// Lot record field: label above value, laid out in an even grid with no row rules.
function Spec({ label, children, mono = false }) {
    const empty = children === null || children === undefined || children === "" || children === false;
    return (
        <div className="min-w-0">
            <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className={`mt-0.5 text-[12.5px] text-slate-900 break-words ${mono ? "font-mono text-[12px]" : ""}`}>{empty ? <span className="text-slate-400">—</span> : children}</dd>
        </div>
    );
}

// One cell of the lot record sheet (cells sit on a 1px slate grid, so the gaps read as rules).
function SheetCell({ label, children, mono = false }) {
    return (
        <div className="bg-white px-3.5 py-2.5 min-w-0">
            <Spec label={label} mono={mono}>{children}</Spec>
        </div>
    );
}

// Shared header bar for the cards inside an expanded lot (lot record, decision).
function CardHeader({ icon, title, children, tone = "slate" }) {
    return (
        <div className={`px-4 py-2.5 border-b flex items-center gap-2 ${tone === "blue" ? "bg-blue-50/70 border-blue-100" : "bg-slate-50/70 border-slate-100"}`}>
            <svg className="w-4 h-4 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
            </svg>
            <h3 className="text-[12.5px] font-semibold text-slate-900">{title}</h3>
            {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
        </div>
    );
}

// Inspection status wording for the lot brief (same labels the inspection report uses).
const inspectionStatusText = (s) =>
    ({ assigned: "Pending", pending: "Pending", in_progress: "Ongoing", "in-progress": "Ongoing", ongoing: "Ongoing", completed: "Completed", submitted: "Completed" })[String(s || "").toLowerCase()] || s || "—";

// Slide-over panel with tabbed views: a lot's record and inspection report on the
// classic layout, the case file (map, application, history) on the review desk.
// It stays mounted while closed, only sliding out of view, so a report inside keeps
// reporting its live status, which gates decisions and submission.
// Built like the Registry's quick-preview panel (Applications/Index): grey header strip with
// the reference above a bold title, the Registry's folder tabs, then white content.
// `flush` drops the content padding for views made of full-width PanelSections.
// Without a `title` the header is just the tabs, with the close button beside them; `label` then names the dialog.
function SidePanel({ open, title, subtitle, label, view, views, onView, onClose, flush = false, children }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    const closeButton = (
        <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-slate-500 hover:text-slate-800 hover:bg-white transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${title ? "-mr-2" : "ml-auto -mr-1 self-center"}`}
        >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
    );

    return createPortal(
        <div className={`imaps-drawer fixed inset-0 z-[880] ${open ? "" : "pointer-events-none"}`} aria-hidden={!open} inert={open ? undefined : ""}>
            <div onClick={onClose} className={`absolute inset-0 bg-slate-950/30 transition-opacity duration-300 ${open ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
            <aside
                role="dialog"
                aria-modal="true"
                aria-label={title || label}
                className={`absolute right-0 top-0 h-full w-full max-w-[680px] bg-white border-l border-slate-200 shadow-2xl flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:transition-none ${
                    open ? "transform-none" : "translate-x-full"
                }`}
            >
                <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
                    {title && (
                        <div className="px-5 pt-3 flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                {subtitle && <p className="font-mono text-[11px] text-slate-500 truncate">{subtitle}</p>}
                                <h2 className="mt-0.5 text-[15px] font-bold leading-snug text-slate-900">{title}</h2>
                            </div>
                            {closeButton}
                        </div>
                    )}
                    {/* The Registry's folder tabs */}
                    <div className={`flex items-end gap-1 px-4 overflow-x-auto overflow-y-hidden ${title ? "pt-2.5" : "pt-3"}`} role="tablist">
                        {views.map((v) => {
                            const active = view === v.id;
                            return (
                                <button
                                    key={v.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={active}
                                    onClick={() => onView(v.id)}
                                    className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                        active ? "bg-white border-slate-200 border-b-white text-blue-700" : "bg-slate-50 border-slate-200/70 text-slate-500 hover:text-slate-800 hover:bg-white/70"
                                    }`}
                                >
                                    {v.icon && (
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d={v.icon} />
                                        </svg>
                                    )}
                                    {v.label}
                                    {v.count != null && (
                                        <span className={`text-[10.5px] font-bold tabular-nums px-1.5 py-px rounded-full ${active ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>{v.count}</span>
                                    )}
                                </button>
                            );
                        })}
                        {!title && closeButton}
                    </div>
                </div>
                <div className={`flex-1 overflow-y-auto custom-scrollbar ${flush ? "" : "p-5"}`}>{children}</div>
            </aside>
        </div>,
        // Rendered at the document root: an animated (transformed) ancestor would otherwise
        // become the containing block of this fixed panel and squeeze it inside a lot card.
        document.body
    );
}

// A section of a panel, as in the Registry's quick preview: small uppercase label, content, a hairline below.
function PanelSection({ title, aside, children }) {
    return (
        <section className="px-5 py-3 border-b border-slate-100 last:border-b-0">
            <div className="mb-1.5 flex items-center justify-between gap-3">
                <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">{title}</h4>
                {aside}
            </div>
            {children}
        </section>
    );
}

const hasValue = (v) => v !== null && v !== undefined && v !== false && String(v).trim?.() !== "";

// Compact two-up variant: label above value, two facts per row; `{ full: true }` spans the row.
// rows: [label, value, { mono, full }?] — rows without a value are left out.
function InfoGrid({ rows }) {
    const shown = rows.filter((r) => r && hasValue(r[1]));
    if (!shown.length) return null;
    return (
        <dl className="grid grid-cols-2 gap-x-5 gap-y-2">
            {shown.map(([label, value, opts]) => (
                <div key={label} className={`min-w-0 ${opts?.full ? "col-span-2" : ""}`}>
                    <dt className="text-[11px] text-slate-500">{label}</dt>
                    <dd className={`text-slate-900 break-words leading-snug ${opts?.mono ? "font-mono text-[11.5px]" : "text-[12.5px]"}`}>{value}</dd>
                </div>
            ))}
        </dl>
    );
}

// One fact in a lot's brief: the few things an officer weighs before deciding.
function BriefCell({ label, children, sub }) {
    return (
        <div className="px-4 py-3 min-w-0">
            <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-1 text-[13px] font-medium text-slate-900">{children}</dd>
            {sub && <dd className="mt-0.5 text-[11.5px] text-slate-500 truncate">{sub}</dd>}
        </div>
    );
}

// What each zoning check result means, in plain words, under its label.
const CHECK_MEANING = {
    consistent: "Tax map class matches the CLUP zone.",
    verified: "Verified; no tax map class to compare.",
    amendment: "Zone change requested; needs Sangguniang Bayan approval.",
    mismatch: "Tax map class differs from the CLUP zone.",
    unverified: "Lot not verified yet.",
    checking: "Checking the zoning…",
    unmapped: "Check the PIN against the tax map.",
};

// What each choice does, in plain words, under its label.
const DECISION_HINT = {
    Approved: "The lot passes technical review.",
    "Needs Site Inspection": "Send an inspector to check the lot first.",
    [REINSPECTION_DECISION]: "Send an inspector back for another round.",
    Declined: "Refuse this lot. You will give the reason.",
};

// A decision already on record, read-only.
function RecordedDecision({ review, label = "Recorded decision" }) {
    return (
        <div className="rounded-md border border-slate-300 bg-white overflow-hidden">
            <CardHeader icon={ICON_DECISION} title={label} />
            <div className="px-4 py-3">
                <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                    <span className={`w-2 h-2 rounded-full ${DECISION_DOT[review.decision] || "bg-slate-300"}`} aria-hidden="true" />
                    {review.decision}
                </p>
                <p className="mt-0.5 text-[11.5px] text-slate-500">
                    {dash(review.reviewed_by_name)} · {fmtDate(review.reviewed_at)}
                    {review.review_round > 1 && ` · round ${review.review_round}`}
                </p>
                {review.decision_reason && <p className="mt-2 pl-2.5 border-l-2 border-slate-200 text-[12px] text-slate-600">{review.decision_reason}</p>}
                {review.findings && <p className="mt-2 pl-2.5 border-l-2 border-slate-200 text-[12px] text-slate-600">{review.findings}</p>}
            </div>
        </div>
    );
}

const ICON_LOT ="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z";
const ICON_DECISION = "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z";

// Collapsed group for secondary details, so the record opens on what matters.
function More({ title, children, open = false }) {
    return (
        <details className="group border-t border-slate-200" open={open || undefined}>
            <summary className="flex items-center justify-between py-2 cursor-pointer list-none text-[12.5px] font-semibold text-slate-700 hover:text-slate-900">
                {title}
                <svg className="w-4 h-4 text-slate-400 transition-transform duration-200 ease-out group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <dl className="pb-2 animate-in fade-in slide-in-from-top-1 duration-150">{children}</dl>
        </details>
    );
}

const FIELD = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";
// The review desk's denser form controls
const FIELD_SM = FIELD.replace("py-2", "py-1.5");
const LABEL = "text-[11.5px] font-semibold text-slate-700";

// Only the transitions the server accepts: the next stage, or Denied
function UpdateStatusDialog({ currentStatus, preset, onClose, onSubmit, saving, missingPermits = [], stages = SB_STAGES }) {
    const next = stages[stages.indexOf(currentStatus) + 1];
    const options = [next, "Denied"].filter(Boolean);
    const [newStatus, setNewStatus] = useState(preset && options.includes(preset) ? preset : options[0] || "");
    const [remarks, setRemarks] = useState("");
    const needsReason = newStatus === "Denied";
    const releaseBlocked = newStatus === "Released" && missingPermits.length > 0;

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40 animate-fade-in duration-150" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="px-5 pt-4 pb-3">
                    <h3 id="status-dialog-title" className="text-[15px] font-semibold text-slate-900">Update application status</h3>
                    <p className="text-[12.5px] text-slate-500 mt-0.5">Currently {currentStatus}. Applications move one stage at a time, or can be denied.</p>
                </div>
                <div className="px-5 pb-4 space-y-4">
                    <fieldset>
                        <legend className="text-[12px] font-semibold text-slate-700 mb-1.5">New status</legend>
                        <div className="grid grid-cols-2 border border-slate-300 rounded-md overflow-hidden">
                            {options.map((s, i) => (
                                <label key={s} className={`relative ${i ? "border-l border-slate-300" : ""}`}>
                                    <input type="radio" name="new-status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} className="peer sr-only" />
                                    <span className="flex justify-center py-2 text-[12.5px] font-semibold text-slate-600 cursor-pointer peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-blue-500">
                                        {s === "Under Sangguniang Bayan" ? "Sangguniang Bayan" : s}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {releaseBlocked && (
                        <div className="rounded-lg bg-amber-50/80 border border-amber-200 p-3 text-xs text-amber-900">
                            <div className="flex items-center gap-1.5 font-semibold text-amber-900">
                                <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                </svg>
                                <span>Permit documents required before release</span>
                            </div>
                            <p className="mt-1 text-[11.5px] text-amber-800">
                                Generate the required documents in the Next step panel before marking as Released:
                            </p>
                            <ul className="mt-1 list-disc list-inside font-semibold text-[11.5px] text-amber-900">
                                {missingPermits.map((p) => (
                                    <li key={p.type}>{p.label}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    <div>
                        <label htmlFor="status-remarks" className="text-[12px] font-semibold text-slate-700">
                            {needsReason ? "Reason for denial" : "Remarks (optional)"} {needsReason && <span className="text-rose-600">*</span>}
                        </label>
                        <textarea
                            id="status-remarks"
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder={needsReason ? "Regulatory basis for denying this application…" : "Notes recorded in the history…"}
                            className={`mt-1.5 resize-none ${FIELD}`}
                        />
                    </div>
                </div>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-md border border-slate-300 bg-white text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onSubmit({ new_status: newStatus, remarks })}
                        disabled={saving || !newStatus || (needsReason && !remarks.trim()) || releaseBlocked}
                        className={`px-4 py-2 rounded-md text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed ${
                            needsReason ? "bg-rose-700 hover:bg-rose-800" : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                        {saving ? "Saving…" : needsReason ? "Deny application" : `Move to ${newStatus === "Under Sangguniang Bayan" ? "SB" : newStatus}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Last look before the evaluation is recorded: every lot's decision and what goes with it.
function ConfirmEvaluationDialog({ items, officer, saving, onCancel, onConfirm }) {
    const panel = useRef(null);
    useEffect(() => {
        const opener = document.activeElement;
        panel.current?.focus();
        return () => opener?.focus?.();
    }, []);
    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && !saving && onCancel();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onCancel, saving]);

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40 animate-fade-in duration-150" role="dialog" aria-modal="true" aria-labelledby="confirm-eval-title" aria-describedby="confirm-eval-note">
            <div ref={panel} tabIndex={-1} className="bg-white rounded-lg shadow-xl w-full max-w-md max-h-[calc(100vh-2rem)] flex flex-col border border-slate-200 overflow-hidden outline-none animate-in fade-in zoom-in-95 duration-200">
                <div className="px-5 pt-4 pb-3">
                    <h3 id="confirm-eval-title" className="text-[15px] font-semibold text-slate-900">Submit the evaluation?</h3>
                    <p className="text-[12.5px] text-slate-600 mt-0.5">Check {items.length === 1 ? "the decision" : `the ${items.length} decisions`} below before submitting.</p>
                </div>
                <ul className="px-5 pb-3 space-y-2 overflow-y-auto">
                    {items.map((it) => (
                        <li key={it.code} className="rounded-md border border-slate-200 px-3 py-2.5">
                            <p className="flex items-center gap-2 text-[13px] font-semibold text-slate-900">
                                <span className="h-5 px-1.5 rounded-md bg-blue-600 text-white grid place-items-center text-[11px] font-semibold">{it.code}</span>
                                {it.label}
                            </p>
                            {it.rows.length > 0 && (
                                <dl className="mt-1.5 grid grid-cols-[88px_minmax(0,1fr)] gap-x-2 gap-y-0.5 text-[12px]">
                                    {it.rows.map(([k, v]) => (
                                        <React.Fragment key={k}>
                                            <dt className="text-slate-500">{k}</dt>
                                            <dd className="text-slate-800 whitespace-pre-wrap break-words">{v}</dd>
                                        </React.Fragment>
                                    ))}
                                </dl>
                            )}
                        </li>
                    ))}
                </ul>
                <p id="confirm-eval-note" className="px-5 pb-3 text-[12px] text-slate-600">
                    This is recorded under your name, {officer}, in the application history.
                </p>
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
                    <button type="button" onClick={onCancel} disabled={saving} className="px-4 py-2 rounded-md border border-slate-300 bg-white text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
                        Go back
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={saving}
                        className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                    >
                        {saving ? "Submitting…" : "Confirm and submit"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function ShowInner({
    auth,
    application: initialApp,
    app: alternateApp,
    inspectors = [],
    technicalReviews = [],
    auditTrail = [],
    statusHistory = [],
    // ── Work assignment props (restored by the master merge, §5/§6) ─────────
    // The backend has always sent these (ApplicationController@show) and the
    // routes have always existed. Master's tab-based Show.jsx simply stopped
    // passing them to the page, which orphaned WorkAssignment.jsx and made
    // Admin/PO handover unreachable. They are accepted again here so the two
    // established components can be re-mounted in master's layout.
    assignedPlanningOfficer = null,
    planningOfficers = [],
    poAssignmentHistory = [],
    inspectorRoundState = {},
    inspectionHistory = {},
    reassignmentReasons = [],
    canReassignPlanningOfficer = false,
    canReassignInspector = false,
    recordRetention = {},
    hasSbRouting: propHasSbRouting = false,
    errors: serverErrors = {},
}) {
    const app = initialApp || alternateApp || {};
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";
    const isAmendment = String(app.application_stream || "").toLowerCase() === "amendment";

    const hasSbRouting = useMemo(() => {
        if (propHasSbRouting) return true;
        if (app.has_sb_routing || app.hasSbRouting) return true;
        if (String(app.application_stream || "").toLowerCase() === "amendment") return true;
        if (app.status === "Under Sangguniang Bayan") return true;
        if (Boolean(app.sb_ordinance_number?.trim())) return true;
        if (statusHistory?.some((h) => h.status === "Under Sangguniang Bayan")) return true;
        if (auditTrail?.some((a) => {
            const text = `${a.action || ""} ${a.note || ""}`.toLowerCase();
            return text.includes("sangguniang bayan") || text.includes("route to sb") || text.includes("routed to sb");
        })) return true;
        if (Boolean(app.route_to_sb)) return true;
        return false;
    }, [propHasSbRouting, app, statusHistory, auditTrail]);

    const stages = useMemo(() => {
        return hasSbRouting ? SB_STAGES : STANDARD_STAGES;
    }, [hasSbRouting]);

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [tab, setTab] = useState(app.status === "For Release" || app.status === "Released" ? "export" : "parcels");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [drawer, setDrawer] = useState(null); // { parcelId, view: "inspection" | "lot" } while a lot's full record is open
    // Review desk side panel. `opened` keeps its content mounted after the first open so it can slide out with it.
    const [caseFile, setCaseFile] = useState({ open: false, view: "application", opened: false });
    const openCaseFile = (view) => setCaseFile({ open: true, view, opened: true });
    const [notesOpen, setNotesOpen] = useState({}); // parcelId -> evaluation notes field shown
    const [confirmOpen, setConfirmOpen] = useState(false); // evaluation confirmation dialog
    // Stable, so the dialog's Escape listener isn't re-bound on every render
    const closeConfirm = useRef(() => setConfirmOpen(false)).current;
    const [saving, setSaving] = useState(false);
    const [statusDialog, setStatusDialog] = useState(null); // preset status or null
    const [siteMapOpen, setSiteMapOpen] = useState(false);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [liveStatuses, setLiveStatuses] = useState({});
    const [refs, setRefs] = useState({ sb_ordinance_number: app.sb_ordinance_number || "", dar_clearance_ref: app.dar_clearance_ref || "" });
    const [savedPermits, setSavedPermits] = useState(app.generated_permits || app.generatedPermits || []);

    useEffect(() => {
        setSavedPermits(app.generated_permits || app.generatedPermits || []);
    }, [app.generated_permits, app.generatedPermits]);

    const missingPermits = useMemo(
        () => getMissingRecommendedPermits(app, savedPermits),
        [app, savedPermits]
    );

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(`${now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })} · ${now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}`);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        loadBarangayBoundaries().then((d) => d && setBrgyMapData(d));
        fetch("/api/map/land_parcels", { headers: { Accept: "application/json" } })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then(setParcelMapData)
            .catch(() => {});
    }, []);

    const flashSuccess = usePage().props?.flash?.success;
    const seenSuccessFlash = useRef(null);

    useEffect(() => {
        if (flashSuccess && seenSuccessFlash.current !== flashSuccess) {
            seenSuccessFlash.current = flashSuccess;
            showToast(flashSuccess, "success");
        }
    }, [flashSuccess]);

    useEffect(() => {
        const first = Object.values(serverErrors || {})[0];
        if (first) showToast(String(first), "error");
    }, [serverErrors]);

    const showToast = (msg, type = "success") => notify(msg, type, { timer: 4500 });

    const parcels = useMemo(() => {
        const byId = new Map();
        (app.parcels || []).forEach((p) => byId.set(p.id, p));
        return [...byId.values()];
    }, [app.parcels]);

    // Latest review round per parcel (reviews come from the controller, newest round first)
    const latestReview = useMemo(() => {
        const out = {};
        [...technicalReviews]
            .sort((a, b) => (b.review_round || 0) - (a.review_round || 0) || new Date(b.reviewed_at) - new Date(a.reviewed_at))
            .forEach((r) => {
                if (r.parcel_id != null && !out[r.parcel_id]) out[r.parcel_id] = r;
            });
        return out;
    }, [technicalReviews]);

    const featureByPin = useMemo(() => new Map((parcelMapData?.features || []).map((f) => [f.properties?.property_index_number?.trim(), f])), [parcelMapData]);

    // Lots with their mapped shape and zoning check (Assessor class from the tax map vs the stored CLUP zone)
    const lots = useMemo(
        () =>
            parcels.map((p, i) => {
                const pin = p.property_index_number?.trim() || "";
                const feature = pin ? featureByPin.get(pin) || null : null;
                const assessor = feature?.properties?.land_use_class || "";
                const check = getZoningCheck({ is_verified: true, cadastral_zone: assessor, land_use_class: p.land_use_class || "" }, isAmendment);
                return { index: i, parcel: p, code: p.parcel_code || `P-${String(i + 1).padStart(2, "0")}`, pin, feature, assessor, check, color: CHECK_COLORS[check.key] };
            }),
        [parcels, featureByPin, isAmendment]
    );

    const inspectorName = (id) => inspectors.find((i) => String(i.id) === String(id))?.name || (id ? `Inspector #${id}` : "—");
    const inspectionStatusOf = (p) => (liveStatuses[p.id] || p.site_inspection?.status || "").toLowerCase();
    const inspectionOpen = (p) => Boolean(p.site_inspection) && !DONE_INSPECTION.includes(inspectionStatusOf(p));
    // LOOP 4: a lot that has already been inspected is reinstpected rather than
    // sent for a first site inspection, so this drives which decision is offered.
    const hasCompletedInspection = (p) => Boolean(p.site_inspection) && DONE_INSPECTION.includes(inspectionStatusOf(p));

    // ── RESTORED BY THE MASTER MERGE: PLANNING OFFICER DECISION AUTHORITY ────
    // Technical-review decision controls are Planning-Officer-only actions. The
    // backend has always refused them for every other role (the
    // technical-review routes are `role:Planning Officer`), but the page
    // used to render them to anyone who could open Application Detail, so an
    // Admin saw officer controls and only discovered on submit that they were
    // forbidden.
    //
    // This is a PRESENTATION gate, exactly like the server-side one: no
    // middleware is weakened and the server remains authoritative. A read-only
    // role still sees every recorded decision, reviewer, date and note; it simply
    // is not offered controls it cannot use.
    // A voided record is read-only; the server refuses every action on it too.
    const isVoided = Boolean(recordRetention.voided_at);
    const isArchived = Boolean(recordRetention.archived_at);
    const canRecordPlanningDecision = userRole === "Planning Officer" && !isVoided;

    const backHref = "/applications";
    const backLabel = "Back to registry";

    // Stable per-parcel callbacks: ParcelInspectionStatus refetches whenever its callback identity changes
    const statusCallbacks = useRef({});
    const onInspectionStatus = (parcelId) =>
        (statusCallbacks.current[parcelId] ||= (status) => setLiveStatuses((prev) => (prev[parcelId] === status ? prev : { ...prev, [parcelId]: status })));

    // ── LOOP 7 CONFIRMED-COORDINATE CONTRACT (restored by the master merge) ──
    //
    // `ParcelInspectionStatus` hands back the merged local+remote inspection
    // record, which carries the coordinates the inspector CONFIRMED in the
    // field. Those are the only coordinates this page will focus the map on.
    //
    // The same strict validation the Loop 7 helper used is applied here, and
    // before any value can reach Leaflet:
    //   null / undefined / '' / NaN / non-finite / out of range  ->  null
    // and a point is produced only when BOTH coordinates are valid.
    // A half-valid pair yields no point at all, so the map is never handed a
    // not-a-number pair or a half-coordinate.
    const [liveInspectionData, setLiveInspectionData] = useState({});
    const toValidCoordinate = (value, min, max) => {
        if (value === null || value === undefined || value === "") return null;
        const number = Number(value);
        return Number.isFinite(number) && number >= min && number <= max ? number : null;
    };
    const toInspectionPoint = (inspection) => {
        const latitude = toValidCoordinate(inspection?.confirmed_latitude, -90, 90);
        const longitude = toValidCoordinate(inspection?.confirmed_longitude, -180, 180);
        return latitude !== null && longitude !== null ? [latitude, longitude] : null;
    };

    const dataCallbacks = useRef({});
    const onInspectionDataFetched = (parcelId) =>
        (dataCallbacks.current[parcelId] ||= (data) =>
            setLiveInspectionData((prev) =>
                prev[parcelId] === data ? prev : { ...prev, [parcelId]: data }
            ));

    // ── Evaluation (Technical Review) ──
    const [reviews, setReviews] = useState(() => {
        const init = {};
        (app.parcels || []).forEach((p) => {
            // A new evaluation is a draft, not a replay of the previous round.
            init[p.id] = {
                decision: "",
                decision_reason: "",
                findings: "",
                inspector_id: "",
                scheduled_date: "",
                deadline_date: "",
                assigned_notes: "",
            };
        });
        return init;
    });
    const setReview = (parcelId, field, value) => setReviews((prev) => ({ ...prev, [parcelId]: { ...prev[parcelId], [field]: value } }));
    // PO-only action, so the role is part of eligibility, not just of the
    // per-lot radio visibility.
    const canSubmitEvaluation = canRecordPlanningDecision && parcels.length > 0 && parcels.every((p) => !inspectionOpen(p));

    // What still stops a lot's evaluation from being submitted, or null. Drives Submit and the review desk's hint.
    const reviewProblem = (r, code) =>
        !r.decision
                ? `Choose an evaluation decision for ${code}.`
                : r.decision === "Declined" && !r.decision_reason?.trim()
                ? `Give the reason for declining ${code}.`
                : r.decision === REINSPECTION_DECISION && !r.decision_reason?.trim()
                ? `Give the reason for reinspection of ${code}.`
                : // LOOP 4: scheduling a reinspection needs the same inspector
                  // / date / deadline as a first inspection, AND explicit
                  // instructions — otherwise the officer is sent back to a lot
                  // with nothing to re-verify.
                  [ "Needs Site Inspection", REINSPECTION_DECISION ].includes(r.decision)
                  && (!r.inspector_id || !r.scheduled_date || !r.deadline_date)
                ? `Choose the inspector, inspection date and deadline for ${code}.`
                : r.decision === REINSPECTION_DECISION && !r.assigned_notes?.trim()
                ? `Give instructions for the reinspection of ${code}.`
                : null;

    // Submit checks every lot, then asks for confirmation: the decision is recorded under the officer's name.
    const submitEvaluation = () => {
        for (const [i, p] of parcels.entries()) {
            const problem = reviewProblem(reviews[p.id] || {}, lots[i].code);
            if (problem) {
                setTab("parcels");
                setSelectedIndex(i);
                setDrawer(null);
                showToast(problem, "error");
                return;
            }
        }
        setConfirmOpen(true);
    };

    const sendEvaluation = () => {
        const evaluationReviews = Object.fromEntries(Object.entries(reviews).map(([parcelId, r]) => [
            parcelId,
            ["Needs Site Inspection", REINSPECTION_DECISION].includes(r.decision)
                ? r
                : { decision: r.decision, decision_reason: r.decision_reason, findings: r.findings },
        ]));
        setSaving(true);
        router.post(
            "/technical-review/submit-batch",
            { application_id: app.id, reviews: evaluationReviews },
            {
                preserveScroll: true,
                onSuccess: () => showToast("Evaluation submitted."),
                onError: (errs) => showToast(Object.values(errs)[0] || "Evaluation could not be submitted.", "error"),
                onFinish: () => {
                    setSaving(false);
                    setConfirmOpen(false);
                },
            }
        );
    };

    const submitStatus = ({ new_status, remarks }) => {
        if (new_status === "Released" && missingPermits.length > 0) {
            showToast(
                `Cannot mark as Released. The required permit(s) (${missingPermits.map((p) => p.label).join(", ")}) must be generated first.`,
                "error"
            );
            return;
        }
        setSaving(true);
        router.post(
            "/applications/update-status",
            { id: app.id, new_status, remarks },
            {
                preserveScroll: true,
                onSuccess: () => {
                    setStatusDialog(null);
                    showToast(`Application moved to ${new_status}.`);
                },
                onError: (errs) => showToast(Object.values(errs)[0] || "Status could not be updated.", "error"),
                onFinish: () => setSaving(false),
            }
        );
    };

    const saveRefs = () => {
        setSaving(true);
        router.post(`/applications/${app.id}/amendment-refs`, refs, {
            preserveScroll: true,
            onSuccess: () => showToast("SB / DAR references saved."),
            onError: (errs) => showToast(Object.values(errs)[0] || "References could not be saved.", "error"),
            onFinish: () => setSaving(false),
        });
    };

    const handleLogout = confirmSignOut;

    // ── Record retention: archive / unarchive / void (nothing is deleted) ──
    const postRecordAction = (action, data, done) => {
        setSaving(true);
        router.post(`/applications/${app.id}/${action}`, data, {
            preserveScroll: true,
            onSuccess: () => showToast(done),
            onError: (errs) => showToast(Object.values(errs)[0] || "The record could not be updated.", "error"),
            onFinish: () => setSaving(false),
        });
    };

    const archiveRecord = () =>
        dialog.fire({
            icon: "question",
            title: "Archive this application?",
            text: "It moves out of the active registry into Archived. It is still kept, counted in reports and searchable, and you can unarchive it.",
            showCancelButton: true,
            confirmButtonText: "Archive",
        }).then((r) => r.isConfirmed && postRecordAction("archive", {}, "Application archived."));

    const unarchiveRecord = () => postRecordAction("unarchive", {}, "Application moved back to the active registry.");

    const voidRecord = () =>
        dialog.fire({
            icon: "warning",
            danger: true,
            title: "Void this application?",
            html: tight(`<p>Use this only for an application encoded by mistake. It stays on record for the retention period but is no longer counted in reports, maps or search, and it can no longer be worked on.</p>
                <p style="margin-top:8px">Its form number <strong>${esc(app.form_number || "—")}</strong> can then be used for the corrected encoding.</p>`),
            input: "textarea",
            inputLabel: "Reason",
            inputPlaceholder: "e.g. Duplicate of 2026-LC-0123, encoded twice",
            inputAttributes: { maxlength: "1000", "aria-label": "Reason for voiding" },
            inputValidator: (v) => (String(v || "").trim().length < 10 ? "Describe the reason in at least 10 characters." : undefined),
            showCancelButton: true,
            confirmButtonText: "Void application",
            focusCancel: true,
        }).then((r) => r.isConfirmed && postRecordAction("void", { reason: String(r.value).trim() }, "Application voided."));

    // ── What's next ──
    const daysSinceFiling = workingDaysSince(app.created_at);
    const overARTA = OFFICE_STAGES.includes(app.status) && daysSinceFiling !== null && daysSinceFiling > ARTA_WORKING_DAYS;

    const pendingInspections = lots.filter((l) => inspectionOpen(l.parcel));
    const undecided = lots.filter((l) => !reviews[l.parcel.id]?.decision);
    const isFinal = app.status === "Released" || app.status === "Denied";
    const deniedReasons = lots.map((l) => latestReview[l.parcel.id]).filter((r) => r?.decision === "Declined" && r.decision_reason);

    const primaryAction =
        app.status === "Received"
            ? { label: "Start technical review", onClick: () => setStatusDialog("Technical Review") }
            : app.status === "Under Sangguniang Bayan"
            ? {
                label: "Mark for release",
                onClick: () => {
                    if (!app.sb_ordinance_number?.trim()) {
                        dialog.fire({
                            title: "SB Ordinance Required",
                            text: "Record and save the approved Sangguniang Bayan Ordinance Number (under the next step, at the top of the page) before marking this application for release.",
                            icon: "warning",
                            width: 380,
                            confirmButtonText: "Go to input field",
                            showCancelButton: true,
                            cancelButtonText: "Close",
                        }).then((result) => {
                            if (result.isConfirmed) document.getElementById("sb_ordinance_number")?.focus();
                        });
                        return;
                    }
                    setStatusDialog("For Release");
                },
                disabled: saving,
                title: app.sb_ordinance_number?.trim()
                    ? "Proceed to release clearance"
                    : "Requires approved Sangguniang Bayan Ordinance Number",
            }
            : app.status === "For Release"
            ? {
                label: "Mark as released",
                onClick: () => {
                    if (missingPermits.length > 0) {
                        dialog.fire({
                            title: "Cannot Mark as Released",
                            html: tight(`<div class="text-left space-y-3">
                                <p>The application type <strong class="text-slate-900">${esc(app.application_type)}</strong> requires the following permit document(s) to be generated before release:</p>
                                <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                                    ${missingPermits.map((p) => `<div class="text-xs font-semibold text-amber-900 flex items-center gap-2"><span>${p.icon || '📄'}</span><span>${esc(p.label)}</span></div>`).join("")}
                                </div>
                                <p class="text-slate-500">Generate the required permit document(s) under Generate permits before marking this application as released.</p>
                            </div>`),
                            icon: "warning",
                            width: 400,
                        });
                        return;
                    }
                    setStatusDialog("Released");
                },
                disabled: saving,
                title: missingPermits.length > 0
                    ? `Requires generating: ${missingPermits.map((p) => p.label).join(", ")}`
                    : "Mark application as released to applicant",
            }
            : null;

    // ── History ──
    const lotCodeById = Object.fromEntries(lots.map((l) => [l.parcel.id, l.code]));
    const history = useMemo(
        () =>
            [
                ...auditTrail.map((a) => ({ at: a.performed_at, who: a.performed_by_name, title: AUDIT_LABELS[a.action] || String(a.action || "").replace(/_/g, " ").toLowerCase(), note: a.note, kind: "audit", action: a.action })),
                ...technicalReviews.map((r) => ({
                    at: r.reviewed_at,
                    who: r.reviewed_by_name,
                    title: `${lotCodeById[r.parcel_id] || "Lot"} evaluated: ${r.decision}${r.review_round > 1 ? ` (round ${r.review_round})` : ""}`,
                    note: [r.decision_reason, r.findings].filter(Boolean).join(" · "),
                    kind: "review",
                    decision: r.decision,
                })),
            ].sort((a, b) => new Date(b.at) - new Date(a.at)),
        [auditTrail, technicalReviews, lots]
    );

    const selectedLot = lots[selectedIndex];

    // The confirmed inspection point for the lot currently in view. Live remote
    // data wins over the server-rendered copy so a just-confirmed position is
    // picked up without a page reload; both are validated identically.
    const selectedInspectionData = selectedLot
        ? liveInspectionData[selectedLot.parcel?.id] || selectedLot.parcel?.site_inspection || null
        : null;
    const inspectionPoint = useMemo(
        () => toInspectionPoint(selectedInspectionData),
        [selectedInspectionData]
    );

    const nextStep =
        app.status === "Technical Review"
            ? pendingInspections.length
                ? "Waiting on site inspection"
                : undecided.length
                ? "Record the evaluation"
                : "Submit the evaluation"
            : app.status === "Received"
            ? "Start the technical review"
            : app.status === "Under Sangguniang Bayan"
            ? "Awaiting Sangguniang Bayan action"
            : app.status === "For Release"
            ? missingPermits.length > 0
                ? "Generate required permits"
                : "Ready for release"
            : app.status === "Released"
            ? "Released to the applicant"
            : app.status === "Denied"
            ? "Application denied"
            : "—";

    const nextDetail = (() => {
        if (app.status === "Technical Review" && pendingInspections.length) {
            return pendingInspections
                .map((l) => {
                    const si = l.parcel.site_inspection;
                    const late = si?.deadline_date && String(si.deadline_date).split("T")[0] < today();
                    return `${l.code}: ${inspectorName(si.inspector_id)}, due ${fmtDate(si.deadline_date)}${late ? " (overdue)" : ""}`;
                })
                .join(" · ");
        }
        if (app.status === "Technical Review" && undecided.length) return `Decide on ${undecided.map((l) => l.code).join(", ")} in the Lots tab.`;
        if (app.status === "Under Sangguniang Bayan" && (isAmendment || hasSbRouting)) {
            return app.sb_ordinance_number?.trim()
                ? `SB Ordinance ${app.sb_ordinance_number} recorded. Ready to mark for release.`
                : "Record the SB ordinance number once the petition is approved.";
        }
        if (app.status === "For Release") {
            if (missingPermits.length > 0) {
                return null; // the release checklist below says what is missing
            }
            return `All required permits generated. Release mode: ${dash(app.preferred_release_mode)}`;
        }
        if (app.status === "Denied" && deniedReasons.length) return deniedReasons.map((r) => `${lotCodeById[r.parcel_id]}: ${r.decision_reason}`).join(" · ");
        return null;
    })();

    // Technical Review opens on the review desk: the inspection report and the decision, nothing else.
    // Every other stage keeps the record layout (status card, tabs, map).
    const deskMode = app.status === "Technical Review";
    const deskLot = lots.length ? lots[Math.min(Math.max(selectedIndex ?? 0, 0), lots.length - 1)] : null;

    const fees = [
        ["Zoning certificate", app.zoning_certificate_fee],
        ["Locational clearance", app.locational_clearance_fee],
        ["Development permit", app.development_permit_fee],
        ["Other fees", app.other_fees],
        ["Penalty", app.penalty_fee],
    ].filter(([, v]) => Number(v) > 0);

    const canExport = !isVoided && (app.status === "For Release" || app.status === "Released");
    const showRefs = isAmendment || hasSbRouting;
    const refsInNextStep = showRefs && app.status === "Under Sangguniang Bayan";
    const refsDirty = refs.sb_ordinance_number !== (app.sb_ordinance_number || "") || refs.dar_clearance_ref !== (app.dar_clearance_ref || "");
    // row: fields side by side (the SB next-step bar); otherwise stacked (Full record → Application)
    const refsFields = (row) => (
        <div className={row ? "flex flex-col sm:flex-row sm:items-end gap-2.5" : "flex flex-col gap-2.5"}>
            {[
                ["sb_ordinance_number", "SB ordinance no.", "e.g. Ord. No. 2026-014"],
                ["dar_clearance_ref", "DAR clearance ref.", "e.g. DAR-CC-2026-0021"],
            ].map(([field, label, placeholder]) => (
                <div key={field} className="flex-1 min-w-0">
                    <label htmlFor={field} className="text-[12px] font-medium text-slate-700">{label}</label>
                    <input
                        id={field}
                        type="text"
                        maxLength={100}
                        value={refs[field]}
                        disabled={!canRecordPlanningDecision}
                        onChange={(e) => setRefs((r) => ({ ...r, [field]: e.target.value }))}
                        placeholder={placeholder}
                        className={`mt-1 font-mono ${FIELD.replace("py-2", "py-1.5")}`}
                    />
                </div>
            ))}
            {canRecordPlanningDecision && <button
                type="button"
                onClick={saveRefs}
                disabled={saving || !refsDirty}
                className={`${row ? "" : "self-start "}h-[34px] px-3.5 rounded-md border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:cursor-not-allowed shrink-0`}
            >
                Save references
            </button>}
        </div>
    );
    const refsForm = refsFields(false);


    const historyView =
        history.length === 0 ? (
            <p className="text-[12.5px] text-slate-500 py-2">No recorded activity yet.</p>
        ) : (
            // Drawn like the Registry's progress steps: iMAPS blue throughout, red only for a decline
            <ol>
                {history.map((h, i) => {
                    const last = i === history.length - 1;
                    const declined = (h.kind === "review" && h.decision === "Declined") || h.action === "TECHNICAL_REVIEW_DECLINED";
                    return (
                        <li key={i} className="flex gap-2.5">
                            <div className="flex flex-col items-center pt-px">
                                <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 ${declined ? "bg-red-500" : "bg-blue-600"}`} aria-hidden="true">
                                    <svg className="w-2 h-2 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={declined ? "M6 18L18 6M6 6l12 12" : "M4.5 12.75l6 6 9-13.5"} />
                                    </svg>
                                </span>
                                {!last && <span className="w-px flex-1 min-h-[10px] bg-slate-200" aria-hidden="true" />}
                            </div>
                            <div className={`min-w-0 ${last ? "" : "pb-3"}`}>
                                <p className="text-[12.5px] leading-[16px] font-semibold text-slate-900 first-letter:uppercase">{h.title}</p>
                                <p className="text-[11px] text-slate-500">
                                    {fmtDate(h.at, true)}
                                    {h.who && ` · ${h.who}`}
                                </p>
                                {h.note && <p className="mt-0.5 text-[12px] text-slate-600 whitespace-pre-line break-words">{h.note}</p>}
                            </div>
                        </li>
                    );
                })}
            </ol>
        );

    // ── Review desk ──
    const inspectorRoundPanel = (p) =>
        p.site_inspection?.id && inspectorRoundState?.[p.site_inspection.id] ? (
            // ── MASTER MERGE CORRECTION §6: SITE INSPECTOR ROUND ASSIGNMENT, beside the
            // inspection report it governs. Only a Planning Officer may hand a round to another
            // Site Inspector, and only while the server says the round is provably untouched.
            // Every rule lives server-side (InspectorTransferGuard, WorkReassignmentController,
            // ReassignmentReasons); this page only mounts the established component.
            <details className="group rounded-lg border border-slate-200 bg-white" open={(canReassignInspector && inspectorRoundState[p.site_inspection.id].allowed) || undefined}>
                <summary className="flex items-center justify-between px-3.5 py-1 cursor-pointer list-none text-[11.5px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-50 rounded-lg">
                    <span className="flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        Inspector assignment
                        <span className="font-normal text-slate-500">· Visit {inspectorRoundState[p.site_inspection.id].round_number}</span>
                    </span>
                    <svg className="w-4 h-4 text-slate-400 transition-transform duration-200 ease-out group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                    </svg>
                </summary>
                <div className="px-2 pb-2">
                    <InspectorRoundAssignment
                        state={inspectorRoundState?.[p.site_inspection.id]}
                        history={inspectionHistory?.[p.site_inspection.id]}
                        candidates={inspectors}
                        reasons={reassignmentReasons}
                        canReassign={canReassignInspector}
                        applicationId={app.id}
                    />
                </div>
            </details>
        ) : null;

    // Right column: the decision for the lot in view (a form, a lock while the inspector is out, or a read-only record).
    const decisionView = (l) => {
        const p = l.parcel;
        const review = reviews[p.id] || {};
        const latest = latestReview[p.id];
        const locked = inspectionOpen(p);
        const insp = p.site_inspection ? liveInspectionData[p.id] || p.site_inspection : null;
        const splitFields = ["Needs Site Inspection", REINSPECTION_DECISION].includes(review.decision);

        if (!canRecordPlanningDecision) {
            return (
                <>
                    <h2 className="text-[15px] font-bold tracking-tight text-slate-900 leading-snug">Evaluation of Lot {l.code}</h2>
                    <p className="mt-2 mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-[12px] text-slate-600">
                        Technical-review decisions are recorded by a Planning Officer. You are viewing this lot read-only.
                    </p>
                    {latest ? <RecordedDecision review={latest} /> : <p className="text-[12.5px] text-slate-500">No decision recorded for {l.code} yet.</p>}
                </>
            );
        }

        if (locked) {
            // One quiet line: the decision has nothing to show until the inspection is done.
            const sentBy = ["Needs Site Inspection", REINSPECTION_DECISION].includes(latest?.decision) ? latest : null;
            return (
                <>
                    <div className="mt-1 px-4 py-8 rounded-lg border border-dashed border-slate-300 bg-slate-50/60 flex flex-col items-center text-center">
                        <span className="w-10 h-10 rounded-full bg-white border border-slate-200 grid place-items-center text-slate-400" aria-hidden="true">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                            </svg>
                        </span>
                        <p className="mt-3 max-w-[15rem] text-[13px] text-slate-600 [text-wrap:balance]">Your evaluation will be here when the inspection is done.</p>
                    </div>

                    {latest && !sentBy && (
                        <div className="mt-3">
                            <RecordedDecision review={latest} label="Last recorded decision" />
                        </div>
                    )}
                </>
            );
        }

        return (
            <>
                <h2 className="text-[15px] font-bold tracking-tight text-slate-900 leading-snug">What is your evaluation of Lot {l.code}?</h2>
                <p className="text-[12px] text-slate-600">
                    {p.site_inspection ? "Base it on the site inspection report. Select one." : "Base it on the zoning check and lot area under Full record → Property. Select one."}
                </p>

                <div role="radiogroup" aria-label={`Evaluation decision for ${l.code}`} className="mt-3 space-y-1.5">
                    {/* LOOP 4: the canonical fourth decision, offered instead of
                        "Needs Site Inspection" once the lot has already been inspected. */}
                    {decisionOptions(hasCompletedInspection(p)).map((d) => {
                        const checked = review.decision === d;
                        // Once a choice is made, the others step back to a single quiet line.
                        const dim = Boolean(review.decision) && !checked;
                        return (
                            <label key={d} className="relative block">
                                <input
                                    type="radio"
                                    name={`decision-${p.id}`}
                                    value={d}
                                    checked={checked}
                                    onChange={() => {
                                        setReview(p.id, "decision", d);
                                        // On short screens the fields this choice reveals start below the fold
                                        requestAnimationFrame(() =>
                                            document.getElementById(`reveal-${p.id}`)?.scrollIntoView({
                                                block: "nearest",
                                                behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
                                            })
                                        );
                                    }}
                                    className="peer sr-only"
                                />
                                {/* Standard radio (GOV.UK / USWDS tile): circle first, bold label, plain hint */}
                                <span
                                    className={`flex items-start gap-2.5 px-3 rounded-lg cursor-pointer transition-[background-color,border-color,color] duration-150 peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500 peer-focus-visible:ring-offset-1 ${
                                        checked
                                            ? "border-2 border-blue-600 bg-blue-50/60 text-slate-900 py-[7px]"
                                            : dim
                                            ? "border border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:text-slate-900 py-1.5"
                                            : "border border-slate-300 bg-white text-slate-900 hover:border-slate-500 py-2"
                                    }`}
                                >
                                    <span className={`mt-0.5 w-[18px] h-[18px] shrink-0 rounded-full grid place-items-center border-2 bg-white transition-colors ${checked ? "border-blue-600" : "border-slate-500"}`} aria-hidden="true">
                                        {checked && <span className="w-2 h-2 rounded-full bg-blue-600" />}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className={`block leading-snug ${dim ? "text-[12.5px] font-medium" : "text-[13px] font-semibold"}`}>{decisionLabel(d)}</span>
                                        {!dim && <span className="block text-[11.5px] leading-snug text-slate-600">{DECISION_HINT[d]}</span>}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>

                {/* What the chosen decision needs, revealed under the choices */}
                <div id={`reveal-${p.id}`} className="scroll-mb-4 space-y-2.5 empty:hidden mt-3">
                {["Declined", REINSPECTION_DECISION].includes(review.decision) && (
                    <div key={`reason-${review.decision}`} className="lot-reveal">
                        <label htmlFor={`reason-${p.id}`} className={LABEL}>
                            {review.decision === REINSPECTION_DECISION ? "Reason for reinspection" : "Reason for declining"} <span className="text-rose-600">*</span>
                        </label>
                        <textarea
                            id={`reason-${p.id}`}
                            rows={2}
                            required
                            aria-required={true}
                            value={review.decision_reason}
                            onChange={(e) => setReview(p.id, "decision_reason", e.target.value)}
                            placeholder={review.decision === REINSPECTION_DECISION ? "Why does this lot need another inspection round?" : "Regulatory basis for declining this lot…"}
                            className={`mt-1 resize-none ${FIELD_SM}`}
                        />
                    </div>
                )}

                {splitFields && (
                    <div key={`schedule-${review.decision}`} role="group" aria-label="Inspection schedule" className="lot-reveal space-y-2.5">
                        {/* Who and when on one row */}
                        <div className="grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.075fr)_minmax(0,1.075fr)] gap-2">
                            <div>
                                <label htmlFor={`inspector-${p.id}`} className={LABEL}>
                                    Inspector <span className="text-rose-600">*</span>
                                </label>
                                <select id={`inspector-${p.id}`} required value={review.inspector_id} onChange={(e) => setReview(p.id, "inspector_id", e.target.value)} className={`mt-1 pr-7 ${FIELD_SM}`}>
                                    <option value="">Choose</option>
                                    {inspectors.map((i) => (
                                        <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label htmlFor={`sched-${p.id}`} className={LABEL}>
                                    Date <span className="text-rose-600">*</span>
                                </label>
                                <input id={`sched-${p.id}`} type="date" required min={today()} value={review.scheduled_date} onChange={(e) => setReview(p.id, "scheduled_date", e.target.value)} className={`mt-1 px-1.5 ${FIELD_SM}`} />
                            </div>
                            <div>
                                <label htmlFor={`deadline-${p.id}`} className={LABEL}>
                                    Deadline <span className="text-rose-600">*</span>
                                </label>
                                <input id={`deadline-${p.id}`} type="date" required min={review.scheduled_date || today()} value={review.deadline_date} onChange={(e) => setReview(p.id, "deadline_date", e.target.value)} className={`mt-1 px-1.5 ${FIELD_SM}`} />
                            </div>
                        </div>
                        <div>
                            {/* LOOP 4: reinspection REQUIRES explicit instructions, so the
                                officer is never sent back with nothing to re-verify. */}
                            <label htmlFor={`notes-${p.id}`} className={LABEL}>
                                Instructions for the inspector {review.decision === REINSPECTION_DECISION ? <span className="text-rose-600">*</span> : <span className="font-normal text-slate-500">(optional)</span>}
                            </label>
                            <textarea id={`notes-${p.id}`} rows={2} value={review.assigned_notes} onChange={(e) => setReview(p.id, "assigned_notes", e.target.value)} placeholder="What to verify on site…" className={`mt-1 resize-none ${FIELD_SM}`} required={review.decision === REINSPECTION_DECISION} aria-required={review.decision === REINSPECTION_DECISION} />
                        </div>
                    </div>
                )}
                </div>

                {/* Optional notes stay out of the way until asked for */}
                {notesOpen[p.id] || review.findings ? (
                    <div className="mt-2.5 lot-reveal">
                        <label htmlFor={`findings-${p.id}`} className={LABEL}>
                            Evaluation notes <span className="font-normal text-slate-500">(optional)</span>
                        </label>
                        <textarea id={`findings-${p.id}`} rows={2} autoFocus={Boolean(notesOpen[p.id]) && !review.findings} value={review.findings} onChange={(e) => setReview(p.id, "findings", e.target.value)} placeholder="Findings recorded with the decision…" className={`mt-1 resize-none ${FIELD_SM}`} />
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setNotesOpen((o) => ({ ...o, [p.id]: true }))}
                        className="mt-2 -ml-1 h-7 px-1 inline-flex items-center gap-1 rounded text-[12px] font-medium text-blue-700 hover:text-blue-800 hover:bg-blue-50 cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
                        </svg>
                        Add evaluation notes <span className="font-normal text-slate-500">(optional)</span>
                    </button>
                )}

            </>
        );
    };

    const caseFileViews = [
        { id: "application", label: "Application" },
        { id: "lot", label: "Property" },
        { id: "history", label: "History" },
    ];
    const nextUndecided = deskLot ? lots.find((x) => x !== deskLot && !reviews[x.parcel.id]?.decision && !inspectionOpen(x.parcel)) : null;
    // The lot in view speaks first, so the hint names what is missing where the officer is looking.
    const firstProblem = [deskLot, ...lots.filter((x) => x !== deskLot)]
        .filter(Boolean)
        .map((x) => reviewProblem(reviews[x.parcel.id] || {}, x.code))
        .find(Boolean);
    const deskReady = canSubmitEvaluation && !firstProblem;
    // Silent while the lot in view is still undecided: its question heading already asks for that.
    const deskHint = !canSubmitEvaluation
        ? // The lot in view already shows the "waiting on the inspection" notice
          deskLot && inspectionOpen(deskLot.parcel)
            ? null
            : "Submitting opens once every inspection report is in."
        : deskLot && !reviews[deskLot.parcel.id]?.decision
        ? null
        : firstProblem || (lots.length > 1 ? "Every lot is ready. Submit when you are." : "Ready to submit.");

    // What the confirmation dialog lists for each lot
    const confirmItems = lots.map((x) => {
        const r = reviews[x.parcel.id] || {};
        const scheduling = ["Needs Site Inspection", REINSPECTION_DECISION].includes(r.decision);
        return {
            code: x.code,
            label: decisionLabel(r.decision),
            rows: [
                ["Declined", REINSPECTION_DECISION].includes(r.decision) && r.decision_reason?.trim() && ["Reason", r.decision_reason.trim()],
                scheduling && ["Inspector", inspectorName(r.inspector_id)],
                scheduling && ["Schedule", `${fmtDate(r.scheduled_date)}, due ${fmtDate(r.deadline_date)}`],
                scheduling && r.assigned_notes?.trim() && ["Instructions", r.assigned_notes.trim()],
                r.findings?.trim() && ["Notes", r.findings.trim()],
            ].filter(Boolean),
        };
    });

    const caseFileIcon = (id) =>
        id === "lot"
            ? ICON_LOT
            : id === "application"
            ? "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            : "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z";

    // The review desk is built from the Registry's parts (Applications/Index): the same page frame,
    // a work card with the grey header strip and folder tabs, and a side panel like its quick preview.
    // Header strip shared by every stage, as on the Registry: back, reference, stage, Full record,
    // and (several lots) folder tabs labelled with each lot's state.
    const applicantStrip = (() => {
        const name = app.corporation_name || app.applicant_name;
        const address = [app.applicant_street, app.applicant_barangay].filter(Boolean).join(", ") || app.corporation_address || "";
        const phone = String(app.contact_number || app.corporation_contact || "");
        const email = app.email || "";
        return name || address || phone || email ? { name: name || "Applicant", address, phone, email } : null;
    })();

    const deskHeader = (showLots, lotState) => (
        <div className="bg-slate-100/80 border-b border-slate-200 shrink-0">
            <div className={`px-5 pt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 min-w-0 ${showLots ? "" : "pb-2"}`}>
                <Link
                    href={backHref}
                    aria-label={backLabel}
                    title={backLabel}
                    className="w-9 h-9 shrink-0 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 grid place-items-center text-slate-600 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                </Link>
                {/* One line: the reference, then the stage. The applicant strip sits beneath;
                    the back button is the way to the Registry. */}
                <div className="min-w-0 flex items-center gap-2.5">
                    <h1 className="font-mono text-[14px] font-semibold text-slate-900 truncate">{app.reference_number || `APP-${app.id}`}</h1>
                    <StatusPill status={app.status} />
                </div>

                <div className="ml-auto flex flex-wrap items-center gap-2 shrink-0">
                    {overARTA && (
                        <span
                            title={`${daysSinceFiling} working days since filing, beyond the ${ARTA_WORKING_DAYS}-day processing time for highly technical applications (RA 11032).`}
                            className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-[11.5px] font-medium whitespace-nowrap"
                        >
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden="true" />
                            {daysSinceFiling} working days · past RA 11032
                        </span>
                    )}
                    {recordRetention.can_archive && (
                        <button type="button" onClick={archiveRecord} disabled={saving} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                            </svg>
                            Archive
                        </button>
                    )}
                    {recordRetention.can_unarchive && (
                        <button type="button" onClick={unarchiveRecord} disabled={saving} className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 whitespace-nowrap transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                            Unarchive
                        </button>
                    )}
                    {recordRetention.can_void && (
                        <button
                            type="button"
                            onClick={voidRecord}
                            disabled={saving || Boolean(recordRetention.void_blocker)}
                            title={recordRetention.void_blocker || "Void an application encoded by mistake"}
                            className="inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border border-rose-200 bg-white text-[13px] font-semibold text-rose-700 hover:bg-rose-50 hover:border-rose-300 whitespace-nowrap transition-colors cursor-pointer disabled:text-slate-400 disabled:border-slate-200 disabled:bg-white disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:ring-offset-2"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                            Void
                        </button>
                    )}
                    {/* One button for everything that is not the report or the decision (styled as the Registry's
                        Drafts button). The panel it opens has the Application / Property / History tabs and
                        reopens on the tab last used. */}
                    <button
                        type="button"
                        onClick={() => openCaseFile(caseFile.view)}
                        aria-haspopup="dialog"
                        aria-expanded={caseFile.open}
                        title="Application details, property and history"
                        className={`group inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border shadow-sm shadow-slate-900/5 text-[13px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${
                            caseFile.open ? "border-blue-200 bg-blue-50 text-blue-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900"
                        }`}
                    >
                        <svg className={`w-4 h-4 transition-colors ${caseFile.open ? "text-blue-600" : "text-slate-500 group-hover:text-slate-700"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
                        </svg>
                        Full record
                    </button>
                </div>
            </div>

            {/* Who the application is for, at every stage: name, address, how to reach them */}
            {applicantStrip && (
                <div className={`px-5 flex flex-wrap items-center gap-x-5 gap-y-1 min-w-0 text-[12.5px] text-slate-600 ${showLots ? "pt-2" : "pb-2.5"}`}>
                    <span className="inline-flex items-center gap-1.5 min-w-0 text-[13px] font-semibold text-slate-900">
                        <svg className="w-4 h-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                        </svg>
                        <span className="truncate">{applicantStrip.name}</span>
                    </span>
                    {applicantStrip.address && (
                        <span className="inline-flex items-center gap-1.5 min-w-0" title={applicantStrip.address}>
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                            </svg>
                            <span className="truncate">{applicantStrip.address}</span>
                        </span>
                    )}
                    {applicantStrip.phone && (
                        <a href={`tel:+63${applicantStrip.phone.replace(/^0/, "")}`} className="inline-flex items-center gap-1.5 hover:text-blue-700 hover:underline underline-offset-2">
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                            </svg>
                            +63 {applicantStrip.phone.replace(/^0/, "")}
                        </a>
                    )}
                    {applicantStrip.email && (
                        <a href={`mailto:${applicantStrip.email}`} title={applicantStrip.email} className="inline-flex items-center gap-1.5 min-w-0 hover:text-blue-700 hover:underline underline-offset-2">
                            <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            <span className="truncate">{applicantStrip.email}</span>
                        </a>
                    )}
                </div>
            )}

            {(isVoided || isArchived) && (
                <div className={`mx-5 mb-2.5 mt-0.5 rounded-lg border px-3.5 py-2 text-[12.5px] ${isVoided ? "border-rose-200 bg-rose-50 text-rose-900" : "border-slate-200 bg-white text-slate-700"}`}>
                    {isVoided ? (
                        <>
                            <span className="font-semibold">Voided</span> {fmtDate(recordRetention.voided_at, true)}
                            {recordRetention.voided_by ? ` by ${recordRetention.voided_by}` : ""}. Kept on record, read-only, and not counted anywhere.
                            {recordRetention.void_reason && <span className="block mt-0.5 text-rose-800">Reason · {recordRetention.void_reason}</span>}
                        </>
                    ) : (
                        <>
                            <span className="font-semibold">Archived</span> {fmtDate(recordRetention.archived_at, true)}
                            {recordRetention.archived_by ? ` by ${recordRetention.archived_by}` : ""}. Still counted in reports and kept for the retention period.
                        </>
                    )}
                </div>
            )}

            {/* More than one lot: folder tabs, as the Registry's status tabs; both cards follow the lot picked */}
            {showLots && (
                <div className="flex items-end gap-1 px-4 pt-2.5 overflow-x-auto overflow-y-hidden" role="group" aria-label="Lots">
                    {lots.map((x) => {
                        const active = x === deskLot;
                        const state = lotState(x);
                        return (
                            <button
                                key={x.parcel.id}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setSelectedIndex(x.index)}
                                className={`relative -mb-px flex items-center gap-2 px-4 py-2.5 rounded-t-xl border text-[12.5px] font-semibold whitespace-nowrap transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                                    active ? "bg-white border-slate-200 border-b-white text-blue-700" : "bg-slate-50 border-slate-200/70 text-slate-500 hover:text-slate-800 hover:bg-white/70"
                                }`}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_LOT} />
                                </svg>
                                Lot {x.code}
                                <span className={`text-[10.5px] font-bold px-1.5 py-px rounded-full ${active ? "bg-blue-700 text-white" : "bg-slate-200 text-slate-600"}`}>{state}</span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );

    const deskMain = (
        <main className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="p-3 sm:p-4 lg:py-3 flex-1 min-h-0 flex flex-col lg:flex-row gap-3 lg:gap-4 max-w-[1580px] mx-auto w-full">
                {/* —— WORK CARD: the record and its inspection report —— */}
                <section aria-label="Inspection report" className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 flex flex-col lg:min-h-0 overflow-hidden">
                    {/* Header strip, as on the Registry */}
                    {deskHeader(lots.length > 1, (x) => {
                        const chosen = reviews[x.parcel.id]?.decision;
                        return inspectionOpen(x.parcel) ? "Inspection open" : chosen ? decisionLabel(chosen) : canRecordPlanningDecision ? "To decide" : latestReview[x.parcel.id]?.decision || "No decision";
                    })}

                    {/* Body: the report for the lot in view. The lot's identity, zoning check and area
                        live in Case file → Property. */}
                    <div className="flex-1 lg:overflow-y-auto [scrollbar-gutter:stable] px-5 pt-3 pb-2 space-y-2.5">

                        {/* Every lot's report stays mounted (hidden when not in view): each one reports
                            its live inspection status, which gates that lot's decision and the submit. */}
                        {lots.map((x) =>
                            x.parcel.site_inspection?.id ? (
                                <div key={x.parcel.id} className={x === deskLot ? "space-y-2" : "hidden"}>
                                    {/* Local parcel supplies cadastral identity;
                                        Parcel Pin uses only confirmed inspection GPS. */}
                                    <ParcelInspectionStatus
                                        report
                                        wide
                                        inspectionId={x.parcel.site_inspection.id}
                                        localInspection={x.parcel.site_inspection}
                                        localParcel={x.parcel}
                                        onStatusFetched={onInspectionStatus(x.parcel.id)}
                                        onInspectionDataFetched={onInspectionDataFetched(x.parcel.id)}
                                    />
                                    {inspectorRoundPanel(x.parcel)}
                                </div>
                            ) : null
                        )}

                        {deskLot && !deskLot.parcel.site_inspection?.id && (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center">
                                <span className="mx-auto w-11 h-11 rounded-xl bg-white border border-slate-200 text-slate-500 grid place-items-center" aria-hidden="true">
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08M8.25 8.25H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                                    </svg>
                                </span>
                                <p className="mt-3 text-[14px] font-semibold text-slate-900">No site inspection on {deskLot.code} yet</p>
                                <p className="mt-1 max-w-sm mx-auto text-[12.5px] text-slate-500">
                                    {canRecordPlanningDecision
                                        ? "Check the zoning and lot area under Full record → Property, or choose Site inspection to send an inspector first."
                                        : "Once an inspector is sent and submits a report, it appears here."}
                                </p>
                            </div>
                        )}
                    </div>
                </section>

                {/* —— EVALUATION PANEL, built like the Registry's quick preview ——
                    Submit follows the form directly, and sticks to the foot of the card only once the form scrolls.
                    Hidden while the lot in view waits on its inspection report: there is nothing to decide yet,
                    and the report card takes the full width. */}
                {!(deskLot && inspectionOpen(deskLot.parcel)) && (
                <aside aria-label="Evaluation decision" className="lg:w-[400px] shrink-0 bg-white rounded-xl border border-slate-200 lg:min-h-0 lg:overflow-y-auto [scrollbar-gutter:stable]">
                    <div key={deskLot?.parcel.id} className="animate-in fade-in duration-150">
                        <div className="px-5 pt-3.5 pb-3">
                            <h4 className="mb-1.5 text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Evaluation</h4>
                            {deskLot && decisionView(deskLot)}
                        </div>
                    </div>

                    {canRecordPlanningDecision && (
                        <div className="sticky bottom-0 p-3 border-t border-slate-100 bg-white">
                            {(deskHint || lots.length > 1) && (
                                <div className="mb-2 px-1 flex items-center justify-between gap-3">
                                    {deskHint ? <p className={`text-[12px] leading-snug ${deskReady ? "text-emerald-700 font-medium" : "text-slate-600"}`}>{deskHint}</p> : <span />}
                                    {lots.length > 1 && (
                                        <div className="shrink-0 flex items-center gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={lots.length} aria-valuenow={lots.length - undecided.length} aria-label="Lots decided">
                                            {lots.map((x) => (
                                                <span key={x.parcel.id} className={`w-4 h-1.5 rounded-full transition-colors duration-300 ${reviews[x.parcel.id]?.decision ? "bg-blue-600" : "bg-slate-200"}`} aria-hidden="true" />
                                            ))}
                                            <span className="ml-0.5 text-[11.5px] text-slate-600 tabular-nums">{lots.length - undecided.length}/{lots.length}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            <div className="flex gap-2">
                                {nextUndecided && reviews[deskLot?.parcel.id]?.decision && (
                                    <button
                                        type="button"
                                        onClick={() => setSelectedIndex(nextUndecided.index)}
                                        className="h-9 px-3.5 rounded-lg border border-slate-300 bg-white shadow-sm shadow-slate-900/5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 hover:border-slate-400 hover:text-slate-900 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                    >
                                        Next: {nextUndecided.code}
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={submitEvaluation}
                                    // Grey until every lot has a decision chosen; missing reasons or dates are caught on click
                                    disabled={saving || !canSubmitEvaluation || undecided.length > 0}
                                    title={undecided.length > 0 ? `Choose a decision for ${undecided.map((x) => x.code).join(", ")} first` : undefined}
                                    className="flex-1 h-9 px-4 rounded-lg border border-blue-600 bg-blue-600 shadow-sm shadow-blue-900/10 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold cursor-pointer transition-colors disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                                >
                                    {saving ? "Submitting…" : "Submit evaluation"}
                                </button>
                            </div>
                        </div>
                    )}
                </aside>
                )}
            </div>
        </main>
    );

    // ── Every other stage, on the same desk as Technical Review ──
    // Work card (left): what this stage is about — the permits at release, each lot's evaluation otherwise.
    // Next-step panel (right): where the record stands and its one action. Everything else is in Full record.
    const releaseStage = canExport;
    const stageLotState = (x) => (inspectionOpen(x.parcel) ? "Inspection open" : latestReview[x.parcel.id]?.decision || "No decision");
    const permitChecklist = app.status === "For Release" ? getPermitChecklist(app, savedPermits) : null;
    const permitsTotal = permitChecklist?.required.length || 0;
    const permitsLeft = permitsTotal - (permitChecklist?.readyCount || 0);
    const canAct = canRecordPlanningDecision && !isFinal;

    // One lot's evaluation: the facts it turned on, the recorded decision, then the inspector's report
    const lotEvaluation = (l) => {
        const p = l.parcel;
        const latest = latestReview[p.id];
        const open = inspectionOpen(p);
        return (
            <div className="space-y-3">
                <dl className="grid sm:grid-cols-3 rounded-lg border border-slate-200 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
                    <BriefCell label="Zoning check" sub={p.land_use_class && [p.land_use_class, getZoneInfo(p.land_use_class).label !== p.land_use_class && getZoneInfo(p.land_use_class).label].filter(Boolean).join(" · ")}>
                        <span className="inline-flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: l.feature ? l.color : "#cbd5e1" }} aria-hidden="true" />
                            {l.feature ? l.check.label : "Not on the tax map"}
                        </span>
                    </BriefCell>
                    <BriefCell label="Lot area">
                        <AreaComparison declared={p.lot_area_sqm} feature={l.feature} />
                    </BriefCell>
                    <BriefCell label="Decision" sub={latest && [latest.reviewed_by_name, fmtDate(latest.reviewed_at)].filter(Boolean).join(" · ")}>
                        {open ? (
                            <span className="inline-flex items-center gap-1.5 text-amber-800">
                                <span className="w-2 h-2 rounded-full bg-amber-500" aria-hidden="true" />
                                Inspection open
                            </span>
                        ) : latest ? (
                            <span className="inline-flex items-center gap-1.5">
                                <span className={`w-2 h-2 rounded-full ${DECISION_DOT[latest.decision] || "bg-slate-300"}`} aria-hidden="true" />
                                {latest.decision}
                            </span>
                        ) : (
                            <span className="text-slate-400">Not evaluated yet</span>
                        )}
                    </BriefCell>
                </dl>

                {/* The officer's own words, when they gave any */}
                {latest && (latest.decision_reason || latest.findings) && (
                    <div className="px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-1">
                        {latest.decision_reason && <p className="text-[12.5px] text-slate-800"><span className="text-slate-500">Reason · </span>{latest.decision_reason}</p>}
                        {latest.findings && <p className="text-[12.5px] text-slate-800"><span className="text-slate-500">Notes · </span>{latest.findings}</p>}
                    </div>
                )}

                {p.site_inspection?.id && (
                    <>
                        <ParcelInspectionStatus
                            report
                            wide
                            inspectionId={p.site_inspection.id}
                            localInspection={p.site_inspection}
                            localParcel={p}
                            onStatusFetched={onInspectionStatus(p.id)}
                            onInspectionDataFetched={onInspectionDataFetched(p.id)}
                        />
                        {inspectorRoundPanel(p)}
                    </>
                )}
            </div>
        );
    };

    // Every stage reads the same way, top to bottom: the header, one next-step bar (what to do now,
    // with its buttons), then the stage's content. No side panel; Full record holds the rest.
    const denied = app.status === "Denied";
    // Under SB: Mark for release waits for the SB ordinance number. Typed but not yet saved, it is saved first.
    const underSb = app.status === "Under Sangguniang Bayan";
    const sbNumberTyped = Boolean(refs.sb_ordinance_number?.trim());
    const markForRelease = () => {
        if (!refsDirty) return primaryAction.onClick();
        setSaving(true);
        router.post(`/applications/${app.id}/amendment-refs`, refs, {
            preserveScroll: true,
            onSuccess: () => setStatusDialog("For Release"),
            onError: (errs) => showToast(Object.values(errs)[0] || "References could not be saved.", "error"),
            onFinish: () => setSaving(false),
        });
    };
    const nextStepBar = app.status !== "Released" && (
        <div className={`rounded-lg border px-4 py-3 ${denied ? "border-rose-200 bg-rose-50/60" : "border-slate-200 bg-slate-50/70"}`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                <div className="min-w-0 flex-1">
                    <p className={`text-[14px] font-semibold tracking-tight ${denied ? "text-rose-900" : "text-slate-900"}`}>{nextStep}</p>
                    {permitsTotal > 0 && permitsLeft > 0 ? (
                        <p className="text-[12px] text-slate-600">
                            {permitsLeft} more required permit{permitsLeft === 1 ? "" : "s"} before release
                        </p>
                    ) : (
                        nextDetail && <p className={`text-[12px] ${denied ? "text-rose-800" : "text-slate-600"}`}>{nextDetail}</p>
                    )}
                    {!canRecordPlanningDecision && !isFinal && <p className="text-[11.5px] text-slate-500">A Planning Officer moves this stage on.</p>}
                </div>

                {/* For Release: required permits, one segment each */}
                {permitsTotal > 0 && (
                    <div className="w-40 flex items-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={permitsTotal} aria-valuenow={permitsTotal - permitsLeft} aria-label="Required permits ready">
                        <span className="flex-1 flex gap-1" aria-hidden="true">
                            {Array.from({ length: permitsTotal }, (_, i) => (
                                <span key={i} className={`flex-1 h-1.5 rounded-full transition-colors duration-300 ${i < permitsTotal - permitsLeft ? "bg-emerald-500" : "bg-slate-200"}`} />
                            ))}
                        </span>
                        <span className={`text-[12px] font-medium tabular-nums ${permitsLeft === 0 ? "text-emerald-700" : "text-slate-500"}`}>
                            {permitsTotal - permitsLeft}/{permitsTotal}
                        </span>
                    </div>
                )}

                {/* A quiet Deny, then the one main action. For Release has neither here: releasing
                    follows the permits, so its button sits at the foot of the card. */}
                {canAct && app.status !== "For Release" && (
                    <div className="flex items-center gap-1.5">
                        {!underSb && <button
                            type="button"
                            onClick={() => setStatusDialog("Denied")}
                            className="h-9 px-3 rounded-lg text-[12.5px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
                        >
                            Deny
                        </button>}
                        {primaryAction && (
                            <button
                                type="button"
                                onClick={underSb ? markForRelease : primaryAction.onClick}
                                disabled={primaryAction.disabled || (underSb && !sbNumberTyped)}
                                title={primaryAction.title || undefined}
                                className="h-9 px-4 rounded-lg border border-blue-600 bg-blue-600 shadow-sm shadow-blue-900/10 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                                {primaryAction.label}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Under SB: the references the release depends on, right under the step that needs them */}
            {refsInNextStep && canRecordPlanningDecision && <div className="mt-3 pt-3 border-t border-slate-200">{refsFields(true)}</div>}
        </div>
    );

    const sectionTitle = (text) => <h3 className="mb-2.5 text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">{text}</h3>;

    const stageMain = (
        <main className="flex-1 w-full min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
            <div className="p-3 sm:p-4 lg:py-3 flex-1 min-h-0 flex flex-col max-w-[1580px] mx-auto w-full">
                <section aria-label={app.status} className="flex-1 min-w-0 bg-white rounded-xl border border-slate-200 flex flex-col lg:min-h-0 overflow-hidden">
                    {deskHeader(!releaseStage && lots.length > 1, stageLotState)}

                    <div className="flex-1 lg:overflow-y-auto [scrollbar-gutter:stable] px-5 pt-3.5 pb-5 space-y-5">
                        {nextStepBar}

                        {releaseStage ? (
                            <>
                                {/* Generating permits is For Release's work, so the gallery comes first */}
                                {app.status === "For Release" && canRecordPlanningDecision && (
                                    <section>
                                        {sectionTitle("Generate permits")}
                                        <PermitExportPanel app={app} part="generate" savedPermits={savedPermits} onSavedPermitsChange={setSavedPermits} />
                                    </section>
                                )}
                                <PermitExportPanel app={app} part="documents" savedPermits={savedPermits} onSavedPermitsChange={setSavedPermits} />
                            </>
                        ) : deskLot ? (
                            <section key={deskLot.parcel.id} className="animate-in fade-in duration-150">
                                {sectionTitle(lots.length === 1 ? `Evaluation · Lot ${deskLot.code}` : "Evaluation")}
                                {lotEvaluation(deskLot)}
                            </section>
                        ) : (
                            <p className="py-10 text-center text-[12.5px] text-slate-500">No lots on this application.</p>
                        )}
                    </div>

                    {/* For Release: the last step, after the permits. Blue only once every required permit is generated. */}
                    {app.status === "For Release" && canAct && primaryAction && (
                        <div className="shrink-0 px-5 py-3 border-t border-slate-200 bg-slate-50/70 flex items-center justify-end gap-4">
                            <p className={`text-[12px] ${missingPermits.length ? "text-slate-500" : "text-emerald-700 font-medium"}`}>
                                {missingPermits.length ? "Generate the required permits to release." : "All required permits are ready."}
                            </p>
                            <button
                                type="button"
                                onClick={primaryAction.onClick}
                                disabled={primaryAction.disabled || missingPermits.length > 0}
                                title={primaryAction.title || undefined}
                                className="h-9 px-4 rounded-lg border border-blue-600 bg-blue-600 shadow-sm shadow-blue-900/10 hover:bg-blue-700 hover:border-blue-700 active:bg-blue-800 text-white text-[13px] font-semibold whitespace-nowrap cursor-pointer transition-colors disabled:bg-slate-200 disabled:border-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                            >
                                {primaryAction.label}
                            </button>
                        </div>
                    )}
                </section>
            </div>
        </main>
    );


    // ── Case file contents, organised into Registry-style sections (empty rows are left out) ──
    const caseFileLot = deskLot
        ? (() => {
              const l = deskLot;
              const p = l.parcel;
              const zone = p.land_use_class ? getZoneInfo(p.land_use_class).label : "";
              // Registry numbers; empty ones are left out
              const records = [
                  ["Property index no.", l.pin],
                  ["Lot no.", p.lot_number],
                  ["TCT no.", p.tct_number],
                  ["Tax Dec. no.", p.tax_dec_number],
                  ["Survey no.", p.survey_number],
                  ["ARP no.", p.arp_number],
              ].filter(([, v]) => hasValue(v));
              return (
                  <>
                      {/* Where it is: a compact locator map, the address laid over its foot */}
                      <section className="px-5 pt-3.5 pb-3">
                          <div className="relative h-44 rounded-xl overflow-hidden border border-slate-200 bg-slate-200">
                              <ApplicationMap
                                  variant="locator"
                                  lots={lots}
                                  parcelMapData={parcelMapData}
                                  brgyMapData={brgyMapData}
                                  barangay={app.barangay}
                                  selectedIndex={selectedIndex}
                                  inspectionPoint={inspectionPoint}
                                  onSelectLot={(i) => setSelectedIndex(i)}
                                  onPrint={() => setSiteMapOpen(true)}
                              />
                          </div>
                          {p.location_address && (
                              <p className="mt-2 flex items-start gap-1.5 text-[12.5px] leading-snug text-slate-700">
                                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                  </svg>
                                  {p.location_address}
                              </p>
                          )}
                      </section>

                      {/* Zoning: result and the facts behind it in one card */}
                      <PanelSection title="Zoning">
                          <div className="rounded-lg border border-slate-200 overflow-hidden">
                              <div className="px-3.5 py-2 flex items-baseline gap-2 border-b border-slate-100" style={{ boxShadow: `inset 3px 0 0 ${l.feature ? l.color : "#cbd5e1"}` }}>
                                  <span className="text-[13px] font-semibold text-slate-900 shrink-0">{l.feature ? l.check.label : "Not on the tax map"}</span>
                                  <span className="text-[11.5px] text-slate-500 truncate">{l.feature ? CHECK_MEANING[l.check.key] : CHECK_MEANING.unmapped}</span>
                              </div>
                              <dl className="grid grid-cols-3 divide-x divide-slate-100">
                                  {[
                                      ["CLUP zone", p.land_use_class, zone && zone !== p.land_use_class ? zone : null],
                                      ["Assessor", l.assessor],
                                      ["Lot area", (Number(p.lot_area_sqm) > 0 || l.feature) && <AreaComparison declared={p.lot_area_sqm} feature={l.feature} />],
                                  ].map(([label, value, sub]) => (
                                      <div key={label} className="px-3.5 py-2 min-w-0">
                                          <dt className="text-[11px] text-slate-500">{label}</dt>
                                          <dd className="text-[12.5px] text-slate-900 leading-snug break-words">{hasValue(value) ? value : "—"}</dd>
                                          {sub && <dd className="text-[11px] text-slate-500 leading-snug">{sub}</dd>}
                                      </div>
                                  ))}
                              </dl>
                          </div>
                      </PanelSection>

                      {/* Owner, then the registry numbers two to a row */}
                      <PanelSection title="Ownership & records">
                          {p.owner_name && <p className="text-[13.5px] font-semibold text-slate-900">{p.owner_name}</p>}
                          {records.length > 0 && (
                              <dl className={`${p.owner_name ? "mt-2" : ""} grid grid-cols-2 gap-x-5 gap-y-1.5`}>
                                  {records.map(([label, value]) => (
                                      <div key={label} className="min-w-0">
                                          <dt className="text-[11px] text-slate-500">{label}</dt>
                                          <dd className="font-mono text-[11.5px] text-slate-900 break-all">{value}</dd>
                                      </div>
                                  ))}
                              </dl>
                          )}
                      </PanelSection>
                  </>
              );
          })()
        : null;

    const projectRows = [
        ["Business name", app.business_name ?? app.project_type_business_name],
        ["Building area", app.building_area && `${Number(app.building_area).toLocaleString()} m²`],
        ["Area to develop", app.area_to_develop && `${Number(app.area_to_develop).toLocaleString()} m²`],
        ["Saleable lots", app.number_of_saleable_lots != null && String(app.number_of_saleable_lots)],
        ["Project cost", app.project_cost && peso(app.project_cost), { mono: true }],
        ["Tenure", app.project_tenure],
        ["Right over land", app.right_over_land],
    ];

    const caseFileApplication = (
        <>
            <PanelSection title="Applicant">
                {/* Who: name first, how to reach them on one line beneath */}
                <p className="text-[14px] font-semibold text-slate-900 leading-snug">{app.corporation_name || app.applicant_name || "—"}</p>
                {app.corporation_name && app.applicant_name && <p className="text-[12px] text-slate-500">Contact person: {app.applicant_name}</p>}
                {(app.contact_number || app.email) && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-700">
                        {app.contact_number && (
                            <a href={`tel:+63${String(app.contact_number).replace(/^0/, "")}`} className="inline-flex items-center gap-1.5 hover:text-blue-700 hover:underline underline-offset-2">
                                <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                </svg>
                                +63 {app.contact_number}
                            </a>
                        )}
                        {app.email && (
                            <a href={`mailto:${app.email}`} title={app.email} className="inline-flex items-center gap-1.5 min-w-0 hover:text-blue-700 hover:underline underline-offset-2">
                                <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                </svg>
                                <span className="truncate">{app.email}</span>
                            </a>
                        )}
                    </div>
                )}
                {app.representative_name && (
                    <div className="mt-2.5 pt-2.5 border-t border-slate-100 text-[12.5px]">
                        <span className="text-slate-500">Representative</span>
                        <p className="text-slate-900">{app.representative_name}</p>
                        {(app.representative_contact || app.representative_address) && (
                            <p className="text-[11.5px] text-slate-600">
                                {[app.representative_contact && `+63 ${app.representative_contact}`, app.representative_address].filter(Boolean).join(" · ")}
                            </p>
                        )}
                    </div>
                )}
            </PanelSection>

            <PanelSection
                title="Application"
                aside={
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ring-1 ring-inset ${isAmendment ? "bg-amber-50 text-amber-800 ring-amber-200" : "bg-slate-50 text-slate-600 ring-slate-200"}`}>
                        {isAmendment ? "Rezoning · needs SB approval" : hasSbRouting ? "Standard · SB routed" : "Standard clearance"}
                    </span>
                }
            >
                {/* What was applied for, one chip per permit */}
                {app.application_type && (
                    <div className="flex flex-wrap gap-1.5">
                        {String(app.application_type)
                            .split(",")
                            .map((t) => t.trim())
                            .filter(Boolean)
                            .map((t) => (
                                <span key={t} className="text-[12px] font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded-md">
                                    {t}
                                </span>
                            ))}
                    </div>
                )}
                {isAmendment && app.target_land_use_class && (
                    <div className="mt-2.5 flex items-baseline gap-2 text-[12.5px]">
                        <span className="text-slate-500">Rezone to</span>
                        <span className="font-semibold text-slate-900">{app.target_land_use_class}</span>
                        <span className="text-slate-500 truncate">{getZoneInfo(app.target_land_use_class).label}</span>
                    </div>
                )}
                <div className="mt-3">
                    <InfoGrid
                        rows={[
                            ["Purpose", app.purpose],
                            ["Barangay", app.barangay],
                            ["Filed", app.created_at && fmtDate(app.created_at, true)],
                            ["Form no.", app.form_number, { mono: true }],
                            ["Encoded by", app.encoded_by_name],
                            ["Remarks", app.remarks, { full: true }],
                        ]}
                    />
                </div>
            </PanelSection>

            {projectRows.some((r) => hasValue(r[1])) && (
                <PanelSection title="Project">
                    <InfoGrid rows={projectRows} />
                </PanelSection>
            )}

            <PanelSection title="Fees & receipt">
                {/* Receipt-style: items with right-aligned amounts, total ruled off */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-2.5">
                    <dl className="space-y-1 text-[12.5px]">
                        {fees.map(([label, v]) => (
                            <div key={label} className="flex items-baseline justify-between gap-3">
                                <dt className="text-slate-600">{label}</dt>
                                <dd className="font-mono text-[12px] text-slate-800 tabular-nums">{peso(v)}</dd>
                            </div>
                        ))}
                        <div className={`flex items-baseline justify-between gap-3 ${fees.length ? "mt-1.5 pt-1.5 border-t border-dashed border-slate-300" : ""}`}>
                            <dt className="font-semibold text-slate-900">Total</dt>
                            <dd className="font-mono text-[13px] font-semibold text-slate-900 tabular-nums">{peso(app.assessment_fee)}</dd>
                        </div>
                    </dl>
                </div>
                <div className="mt-3">
                    <InfoGrid
                        rows={[
                            ["OR no.", app.or_number, { mono: true }],
                            ["Date of receipt", app.date_of_receipt && fmtDate(app.date_of_receipt)],
                            ["Release mode", app.preferred_release_mode],
                        ]}
                    />
                </div>
            </PanelSection>

            {showRefs && !refsInNextStep && (canRecordPlanningDecision || app.sb_ordinance_number || app.dar_clearance_ref) && (
                <PanelSection title="SB / DAR references">{refsForm}</PanelSection>
            )}

            {/* Loop 9C-2 + MASTER MERGE CORRECTION §5 (see detailsView): application-level PO
                ownership and the inspection delivery panel, mounted exactly once on the page
                (here on the review desk). Server-authored facts only; no assignment logic here. */}
            <section className="border-b border-slate-100 last:border-b-0">
                <details className="group">
                    <summary className="px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer list-none hover:bg-slate-50/70">
                        <h4 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Assignment &amp; inspection delivery</h4>
                        <svg className="w-4 h-4 text-slate-500 transition-transform duration-200 ease-out group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </summary>
                    <div className="px-5 pb-4 space-y-3">
                        <PlanningOfficerAssignment
                            current={assignedPlanningOfficer}
                            candidates={planningOfficers}
                            history={poAssignmentHistory}
                            reasons={reassignmentReasons}
                            canReassign={canReassignPlanningOfficer && !isVoided}
                            applicationId={app.id}
                        />
                        <div className="rounded-lg border border-slate-200 bg-white p-4">
                            <InspectionDeliveryStatusPanel applicationId={app.id} />
                        </div>
                    </div>
                </details>
            </section>
        </>
    );

    const tabs = [
        // Work → output → reference → audit trail
        { id: "parcels", label: `Lots (${lots.length})` },
        ...(canExport ? [{ id: "export", label: `Documents (${savedPermits.length})` }] : []),
        { id: "overview", label: "Details" },
        { id: "history", label: "History" },
    ];

    return (
        <>
            <Head title={`${app.reference_number || "Application"} | iMAPS`} />

            <style>{`
                #dashboard-root, .imaps-drawer { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono, .imaps-drawer .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
                /* Same thin, rounded scrollbars as the Registry (Applications/Index) */
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                /* Fields that appear once a decision is chosen settle in rather than pop */
                @keyframes lot-reveal { from { opacity: 0; transform: translate3d(0, -4px, 0); } to { opacity: 1; transform: none; } }
                .lot-reveal { animation: lot-reveal 200ms cubic-bezier(0.2, 0, 0, 1) both; }
                @media (prefers-reduced-motion: reduce) { .lot-reveal { animation: none; } }
            `}</style>
            <div id="dashboard-root" className="bg-slate-50 text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" aria-hidden="true" />}

                    {deskMode ? deskMain : stageMain}

                    {/* Full record: the case file, out of the way until asked for (every stage) */}
                    {(
                        <SidePanel
                            open={caseFile.open}
                            label="Full record"
                            view={caseFile.view}
                            views={caseFileViews.map((v) => ({ ...v, icon: caseFileIcon(v.id), count: v.id === "history" ? history.length : undefined }))}
                            onView={openCaseFile}
                            onClose={() => setCaseFile((c) => ({ ...c, open: false }))}
                            flush
                        >
                            {caseFile.opened && caseFile.view === "lot" && caseFileLot}
                            {caseFile.opened && caseFile.view === "application" && caseFileApplication}
                            {caseFile.opened && caseFile.view === "history" && (
                                <PanelSection title="Activity">{historyView}</PanelSection>
                            )}
                        </SidePanel>
                    )}
                </div>
            </div>

            {confirmOpen && (
                <ConfirmEvaluationDialog
                    items={confirmItems}
                    officer={userName}
                    saving={saving}
                    onCancel={closeConfirm}
                    onConfirm={sendEvaluation}
                />
            )}
            {statusDialog && (
                <UpdateStatusDialog
                    currentStatus={app.status}
                    preset={statusDialog}
                    stages={stages}
                    onClose={() => setStatusDialog(null)}
                    onSubmit={submitStatus}
                    saving={saving}
                    missingPermits={missingPermits}
                />
            )}
            {siteMapOpen && <SiteMapPrint open={siteMapOpen} onClose={() => setSiteMapOpen(false)} form={app} parcelMapData={parcelMapData} preparedBy={userName} />}
        </>
    );
}


class ShowErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, errorInfo) {
        console.error("Show component crashed:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-lg shadow-lg border border-slate-200 p-6 text-center">
                        <h2 className="text-[15px] font-semibold text-slate-900 mb-1">Failed to load application record</h2>
                        <p className="text-[12.5px] text-slate-500 mb-4">{this.state.error?.message || "An unexpected error occurred while rendering this application."}</p>
                        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-md bg-blue-600 text-white text-[12.5px] font-semibold hover:bg-blue-700 cursor-pointer">
                            Reload page
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default function Show(props) {
    return (
        <ShowErrorBoundary>
            <ShowInner {...props} />
        </ShowErrorBoundary>
    );
}
