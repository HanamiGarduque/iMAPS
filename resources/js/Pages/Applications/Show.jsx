// resources/js/Pages/Applications/Show.jsx
// Application record: a view-only map of the lots (left) and Summary / Lots / History (right).
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, Head, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
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
const STATUS_DOT = {
    Received: "bg-emerald-500",
    "Technical Review": "bg-amber-500",
    "Under Sangguniang Bayan": "bg-purple-500",
    "For Release": "bg-sky-500",
    Released: "bg-blue-600",
    Denied: "bg-rose-500",
};
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
    if (d === REINSPECTION_DECISION) return "Schedule Reinspection";
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
const today = () => new Date().toISOString().split("T")[0];



// Tinted badge per stage (soft background, matching text and dot)
const STATUS_TONE = {
    Received: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
    "Technical Review": "bg-amber-50 text-amber-800 ring-amber-600/20",
    "Under Sangguniang Bayan": "bg-purple-50 text-purple-700 ring-purple-600/20",
    "For Release": "bg-sky-50 text-sky-700 ring-sky-600/20",
    Released: "bg-blue-50 text-blue-700 ring-blue-600/20",
    Denied: "bg-rose-50 text-rose-700 ring-rose-600/20",
};

function StatusPill({ status }) {
    return (
        <span className={`inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full ring-1 ring-inset text-[12px] font-medium whitespace-nowrap ${STATUS_TONE[status] || "bg-slate-50 text-slate-600 ring-slate-500/20"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || "bg-slate-400"}`} aria-hidden="true" />
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
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
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

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4500);
    };

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
    const canRecordPlanningDecision = userRole === "Planning Officer";

    // ── RESTORED BY THE MASTER MERGE: ORIGIN-AWARE BACK NAVIGATION ─────────
    // The Technical Review queue opens a record with `?from=technical-review`.
    // Master read only the URL path, so that origin was silently dropped and the
    // back control always claimed the registry — an officer working the review
    // queue had no way back to the queue they came from.
    //
    // This restores the origin in the smallest possible way: read the query
    // flag and point the existing back control and breadcrumb at the right
    // module. Normal entry from the registry is unchanged.
    const openedFromTechnicalReview = usePage().url?.split("?")[1]?.includes("from=technical-review");
    const backHref = openedFromTechnicalReview ? "/technical-review" : "/applications";
    const backLabel = openedFromTechnicalReview ? "Back to technical review" : "Back to registry";

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
            const r = latestReview[p.id] || {};
            const si = p.site_inspection || {};
            init[p.id] = {
                decision: r.decision || "",
                decision_reason: r.decision_reason || "",
                findings: r.findings || "",
                inspector_id: si.inspector_id || "",
                scheduled_date: si.scheduled_date ? String(si.scheduled_date).split("T")[0] : "",
                deadline_date: si.deadline_date ? String(si.deadline_date).split("T")[0] : "",
                assigned_notes: si.assigned_notes || "",
            };
        });
        return init;
    });
    const setReview = (parcelId, field, value) => setReviews((prev) => ({ ...prev, [parcelId]: { ...prev[parcelId], [field]: value } }));
    // PO-only action, so the role is part of eligibility, not just of the
    // per-lot radio visibility.
    const canSubmitEvaluation = canRecordPlanningDecision && parcels.length > 0 && parcels.every((p) => !inspectionOpen(p));

    const submitEvaluation = () => {
        for (const [i, p] of parcels.entries()) {
            const r = reviews[p.id] || {};
            const code = lots[i].code;
            const problem = !r.decision
                ? `Choose an evaluation decision for ${code}.`
                : r.decision === "Declined" && !r.decision_reason?.trim()
                ? `Give the reason for declining ${code}.`
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
            if (problem) {
                setTab("parcels");
                setSelectedIndex(i);
                showToast(problem, "error");
                return;
            }
        }
        setSaving(true);
        router.post(
            "/technical-review/submit-batch",
            { application_id: app.id, reviews },
            {
                preserveScroll: true,
                onSuccess: () => showToast("Evaluation submitted."),
                onError: (errs) => showToast(Object.values(errs)[0] || "Evaluation could not be submitted.", "error"),
                onFinish: () => setSaving(false),
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

    // ── What's next ──
    const daysSinceFiling = workingDaysSince(app.created_at);
    const overARTA = OFFICE_STAGES.includes(app.status) && daysSinceFiling !== null && daysSinceFiling > ARTA_WORKING_DAYS;

    const pendingInspections = lots.filter((l) => inspectionOpen(l.parcel));
    const undecided = lots.filter((l) => !reviews[l.parcel.id]?.decision);
    const isFinal = app.status === "Released" || app.status === "Denied";
    const deniedReasons = lots.map((l) => latestReview[l.parcel.id]).filter((r) => r?.decision === "Declined" && r.decision_reason);

    const primaryAction =
        app.status === "Technical Review"
            ? { label: saving ? "Submitting…" : "Submit evaluation", onClick: submitEvaluation, disabled: saving || !canSubmitEvaluation, title: canSubmitEvaluation ? "" : "Waiting on an open site inspection" }
            : app.status === "Received"
            ? { label: "Start technical review", onClick: () => setStatusDialog("Technical Review") }
            : app.status === "Under Sangguniang Bayan"
            ? {
                label: "Mark for release",
                onClick: () => {
                    if (!app.sb_ordinance_number?.trim()) {
                        Swal.fire({
                            title: "SB Ordinance Required",
                            text: "Record and save the approved Sangguniang Bayan Ordinance Number in the Next step panel before marking this application for release.",
                            icon: "warning",
                            confirmButtonColor: "#2563eb",
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
                        Swal.fire({
                            title: "Cannot Mark as Released",
                            html: `<div class="text-left space-y-3 font-sans">
                                <p class="text-xs text-slate-600">The application type <strong>${app.application_type}</strong> requires the following permit document(s) to be generated before release:</p>
                                <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
                                    ${missingPermits.map((p) => `<div class="text-xs font-bold text-amber-900 flex items-center gap-2"><span>${p.icon || '📄'}</span><span>${p.label}</span></div>`).join("")}
                                </div>
                                <p class="text-xs text-slate-500">Generate the required permit document(s) in the Next step panel before marking this application as released.</p>
                            </div>`,
                            icon: "warning",
                            confirmButtonColor: "#2563eb",
                            confirmButtonText: "OK",
                            customClass: {
                                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                                title: "text-base font-bold text-slate-900",
                                confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                            },
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

    const fees = [
        ["Zoning certificate", app.zoning_certificate_fee],
        ["Locational clearance", app.locational_clearance_fee],
        ["Development permit", app.development_permit_fee],
        ["Other fees", app.other_fees],
        ["Penalty", app.penalty_fee],
    ].filter(([, v]) => Number(v) > 0);

    const canExport = app.status === "For Release" || app.status === "Released";
    const showRefs = isAmendment || hasSbRouting;
    const refsInNextStep = showRefs && app.status === "Under Sangguniang Bayan";
    const refsDirty = refs.sb_ordinance_number !== (app.sb_ordinance_number || "") || refs.dar_clearance_ref !== (app.dar_clearance_ref || "");
    const refsForm = (
        <div className="flex flex-col sm:flex-row sm:items-end gap-2.5">
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
                        onChange={(e) => setRefs((r) => ({ ...r, [field]: e.target.value }))}
                        placeholder={placeholder}
                        className={`mt-1 font-mono ${FIELD.replace("py-2", "py-1.5")}`}
                    />
                </div>
            ))}
            <button
                type="button"
                onClick={saveRefs}
                disabled={saving || !refsDirty}
                className="h-[34px] px-3.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed shrink-0"
            >
                Save references
            </button>
        </div>
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
                #dashboard-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
            `}</style>
            <div id="dashboard-root" className="bg-[#f4f5f7] text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" aria-hidden="true" />}

                    {/* Record bar: which record this is and its stage (actions live in the status card) */}
                    <div className="h-14 bg-white border-b border-slate-200 px-5 flex items-center gap-3.5 shrink-0 z-10">
                        <Link
                            href={backHref}
                            className="w-9 h-9 flex items-center justify-center rounded-full text-slate-500 bg-slate-100/70 hover:bg-slate-200/70 hover:text-slate-900 transition-colors shrink-0 focus-visible:outline-2 focus-visible:outline-blue-600"
                            aria-label={backLabel}
                            title={backLabel}
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </Link>
                        <div className="min-w-0">
                            <div className="flex items-center gap-2.5 min-w-0">
                                <h1 className="text-[16px] font-semibold tracking-tight text-slate-900 leading-tight truncate">{app.corporation_name || app.applicant_name || "—"}</h1>
                                <StatusPill status={app.status} />
                            </div>
                            <p className="mt-0.5 font-mono text-[11.5px] text-slate-400 leading-tight">{app.reference_number || `APP-${app.id}`}</p>
                        </div>
                    </div>

                    {toast && (
                        <div className="absolute top-[68px] right-4 z-[999] animate-in fade-in slide-in-from-top-2 duration-150" role="status">
                            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-md border shadow-lg max-w-sm ${toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-900 text-white border-slate-800"}`}>
                                <p className="text-[12.5px] font-medium flex-1">{toast.msg}</p>
                                <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 cursor-pointer">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                                </button>
                            </div>
                        </div>
                    )}

                    <main className="flex-1 flex flex-col lg:flex-row min-h-0">
                        {/* Work column: this stage's status and action, then the record's tabs.
                            The column is the single scroll area, so short windows scroll the page as a whole
                            (the tab bar sticks to the top) instead of squeezing the tab content into its own box. */}
                        <div className="flex-1 min-h-0 overflow-y-auto bg-[#f7f9fc] min-w-0">
                            <div className="px-6 pt-3 pb-2.5">
                                {/* Status: where the record is and what happens next, in one place */}
                                <div className={`rounded-xl border shadow-sm overflow-hidden ${overARTA ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
                                    <div className="px-5 pt-3 pb-3">
                                    {(() => {
                                        const checklist = app.status === "For Release" ? getPermitChecklist(app, savedPermits) : null;
                                        const total = checklist?.required.length || 0;
                                        const left = total - (checklist?.readyCount || 0);
                                        return (
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="min-w-0">
                                                    <h2 className="text-[15px] font-semibold tracking-tight text-slate-900">{nextStep}</h2>
                                                    {total > 0 && left > 0 ? (
                                                        <p className="text-[12.5px] text-slate-500 mt-0.5">
                                                            {left} more required permit{left === 1 ? "" : "s"} before release
                                                        </p>
                                                    ) : (
                                                        nextDetail && <p className="text-[12.5px] text-slate-500 mt-0.5">{nextDetail}</p>
                                                    )}
                                                </div>
                                                {total > 0 && (
                                                    <div
                                                        className="shrink-0 flex items-center gap-2 pt-1"
                                                        role="progressbar"
                                                        aria-valuemin={0}
                                                        aria-valuemax={total}
                                                        aria-valuenow={total - left}
                                                        aria-label="Required permits ready"
                                                    >
                                                        <span className="flex gap-1" aria-hidden="true">
                                                            {Array.from({ length: total }, (_, i) => (
                                                                <span key={i} className={`w-6 h-1.5 rounded-full transition-colors duration-300 ${i < total - left ? "bg-emerald-500" : "bg-slate-200"}`} />
                                                            ))}
                                                        </span>
                                                        <span className={`text-[12px] font-medium tabular-nums ${left === 0 ? "text-emerald-700" : "text-slate-500"}`}>
                                                            {total - left}/{total}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })()}
                                    {refsInNextStep && <div className="mt-2.5">{refsForm}</div>}
                                    {app.status === "For Release" && (
                                        <div className="mt-2.5">
                                            <PermitExportPanel app={app} part="generate" savedPermits={savedPermits} onSavedPermitsChange={setSavedPermits} />
                                        </div>
                                    )}
                                    {overARTA && (
                                        <p className="text-[12px] font-medium text-amber-800 mt-2">
                                            {daysSinceFiling} working days since filing, beyond the {ARTA_WORKING_DAYS}-day processing time for highly technical applications (RA 11032).
                                        </p>
                                    )}
                                    </div>

                                    {/* This stage's decision: a footer bar — quiet Deny left, the one main action right */}
                                    {(primaryAction || (!isFinal && app.status !== "Technical Review")) && (
                                        <div className={`px-5 py-2 border-t flex items-center justify-between gap-3 ${overARTA ? "border-amber-200 bg-amber-100/40" : "border-slate-100 bg-slate-50/70"}`}>
                                            {!isFinal && app.status !== "Technical Review" ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setStatusDialog("Denied")}
                                                    className="h-8 px-2 -ml-2 inline-flex items-center gap-1.5 rounded-md text-[12.5px] font-medium text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-rose-600"
                                                >
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                                    </svg>
                                                    Deny application
                                                </button>
                                            ) : (
                                                <span />
                                            )}
                                            {primaryAction && (
                                                <button
                                                    type="button"
                                                    onClick={primaryAction.onClick}
                                                    disabled={primaryAction.disabled}
                                                    title={primaryAction.title || undefined}
                                                    className="h-9 px-4 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold shadow-sm shadow-blue-600/20 cursor-pointer transition-colors disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                                                >
                                                    {primaryAction.label}
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Tabs */}
                            <div className="sticky top-0 z-10 flex gap-6 px-6 bg-[#f7f9fc]/95 backdrop-blur border-b border-slate-200" role="tablist" aria-label="Record sections">
                                {tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`py-2 -mb-px border-b-2 text-[13px] cursor-pointer transition-colors duration-150 ${
                                            tab === t.id ? "border-blue-600 text-slate-900 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div key={tab} className="px-6 pt-2.5 pb-4 animate-in fade-in slide-in-from-bottom-1 duration-150" role="tabpanel">
                                {tab === "overview" && (
                                    <>

                                        {showRefs && !refsInNextStep && (
                                            <div className="mb-3 p-3.5 rounded-lg border border-slate-200 bg-slate-50">
                                                <p className="mb-2 text-[12.5px] font-semibold text-slate-800">Sangguniang Bayan / DAR references</p>
                                                {refsForm}
                                            </div>
                                        )}

                                        <div className="rounded-xl border border-slate-200 bg-white px-4 shadow-sm [&>details:first-child]:border-t-0">
                                            <More title="Project details">
                                                <Row label="Business Name">{app.business_name ?? app.project_type_business_name}</Row>
                                                <Row label="Building area">{app.building_area && `${Number(app.building_area).toLocaleString()} m²`}</Row>
                                                <Row label="Area to develop">{app.area_to_develop && `${Number(app.area_to_develop).toLocaleString()} m²`}</Row>
                                                {app.number_of_saleable_lots != null && <Row label="Saleable lots">{String(app.number_of_saleable_lots)}</Row>}
                                                <Row label="Project cost">{app.project_cost && peso(app.project_cost)}</Row>
                                                <Row label="Tenure">{app.project_tenure}</Row>
                                                <Row label="Right over land">{app.right_over_land}</Row>
                                            </More>
                                            <More title="Fees & receipt">
                                                {fees.map(([label, v]) => (
                                                    <Row key={label} label={label} mono>{peso(v)}</Row>
                                                ))}
                                                <Row label="Total" mono>{peso(app.assessment_fee)}</Row>
                                                <Row label="OR no." mono>{app.or_number}</Row>
                                                <Row label="Date of receipt">{app.date_of_receipt && fmtDate(app.date_of_receipt)}</Row>
                                                <Row label="Release mode">{app.preferred_release_mode}</Row>
                                            </More>
                                            <More title="Record">
                                                <Row label="Form no." mono>{app.form_number}</Row>
                                                <Row label="Encoded by">{app.encoded_by_name}</Row>
                                                <Row label="Remarks">{app.remarks}</Row>
                                            </More>
                                        </div>

                                        {/* Loop 9C-2, Summary branch (master merge re-home).
                                            The panel is application-level, not parcel-level: it
                                            enumerates every inspection round from the 9C-1
                                            reader, so it must not be nested under a parcel's
                                            latest-only inspection surface.
                                            Mounted exactly once, in the Details tab (never in
                                            the Lots tab), so the panel is never duplicated on a page.
                                            Not gated on any Planning Officer decision control —
                                            delivery status is shared read-only visibility for
                                            Admin and Planning Officer alike. */}
                                        {/* ── MASTER MERGE CORRECTION §5: APPLICATION-LEVEL
                                            PLANNING OFFICER OWNERSHIP, in the Details tab.

                                            Admin-initiated application handover. It is APPLICATION
                                            level, so it deliberately lives outside the parcel list
                                            and outside any inspection-round context: PO ownership
                                            of a record is not a property of a lot or a round.

                                            `canReassignPlanningOfficer` is a SERVER fact (the viewer
                                            is Admin), not a client role guess, and the component
                                            enforces reason requirements itself. No assignment
                                            logic is duplicated on this page. */}
                                        <details className="group mt-3 rounded-xl border border-slate-200 bg-white px-4 shadow-sm">
                                            <summary className="flex items-center justify-between py-2 cursor-pointer list-none text-[12.5px] font-semibold text-slate-700 hover:text-slate-900">
                                                Assignment &amp; inspection delivery
                                                <svg className="w-4 h-4 text-slate-400 transition-transform duration-200 ease-out group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                </svg>
                                            </summary>
                                        <PlanningOfficerAssignment
                                            current={assignedPlanningOfficer}
                                            candidates={planningOfficers}
                                            history={poAssignmentHistory}
                                            reasons={reassignmentReasons}
                                            canReassign={canReassignPlanningOfficer}
                                            applicationId={app.id}
                                        />

                                        <div className="mt-4 mb-3 p-5 rounded-md border border-slate-200 bg-white">
                                            <InspectionDeliveryStatusPanel applicationId={app.id} />
                                        </div>
                                        </details>
                                    </>
                                )}

                                {tab === "parcels" && (
                                    <>
                                        {/* The FieldSync delivery panel is application-level and lives only in Summary. */}
                                        {app.status === "Technical Review" && !canRecordPlanningDecision && (
                                            <p className="mb-3 px-3 py-2 rounded-md bg-slate-50 border border-slate-200 text-[12px] text-slate-600">
                                                Technical-review decisions are recorded by a Planning Officer. The recorded decisions below are read-only here.
                                            </p>
                                        )}
                                        {app.status === "Technical Review" && canRecordPlanningDecision && !canSubmitEvaluation && (
                                            <p className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-[12px] text-amber-900">
                                                Decisions are locked for lots with an open site inspection. The evaluation can be submitted once every inspection report is in.
                                            </p>
                                        )}
                                        <ul className="space-y-2">
                                            {lots.map((l) => {
                                                const p = l.parcel;
                                                const isOpen = selectedIndex === l.index;
                                                const review = reviews[p.id] || {};
                                                const latest = latestReview[p.id];
                                                const locked = inspectionOpen(p);
                                                // Role AND workflow must both permit a decision:
                                                // a Planning Officer, on a Technical Review
                                                // application, with no open site inspection.
                                                const editable = canRecordPlanningDecision && app.status === "Technical Review" && !locked;
                                                const shownDecision = app.status === "Technical Review" ? review.decision : latest?.decision;
                                                const decisionDot = DECISIONS.find((d) => d.value === shownDecision)?.dot || "bg-slate-300";
                                                return (
                                                    <li key={p.id} className={`rounded-xl border bg-white ${isOpen ? "border-blue-300 shadow-sm" : "border-slate-200"}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedIndex(selectedIndex === l.index ? null : l.index)}
                                                            aria-expanded={isOpen}
                                                            className="w-full flex items-center gap-3 px-3 py-1.5 text-left cursor-pointer hover:bg-slate-50 rounded-md"
                                                        >
                                                            <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${isOpen ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700"}`}>{l.code}</span>
                                                            <span className="flex-1 min-w-0">
                                                                <span className="block font-mono text-[12px] text-slate-800 truncate">{l.pin || "No PIN"}</span>
                                                                <span className="flex items-center gap-3 text-[11.5px] text-slate-500">
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <span className="w-2 h-2 rounded-[2px]" style={{ background: l.color }} aria-hidden="true" />
                                                                        {l.check.label}
                                                                    </span>
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <span className={`w-2 h-2 rounded-full ${decisionDot}`} aria-hidden="true" />
                                                                        {locked ? "Inspection open" : shownDecision || "No decision"}
                                                                    </span>
                                                                </span>
                                                            </span>
                                                            <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 ease-out ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        {isOpen && (
                                                            <div className="px-3 pb-2.5 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-150">
                                                                <dl className="py-2.5 grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-5 gap-y-2.5">
                                                                    <Spec label="Owner">{p.owner_name}</Spec>
                                                                    <Spec label="Lot no." mono>{p.lot_number}</Spec>
                                                                    <Spec label="TCT / Tax Dec." mono>{[p.tct_number, p.tax_dec_number].filter(Boolean).join(" · ")}</Spec>
                                                                    <Spec label="Lot area">
                                                                        <AreaComparison declared={p.lot_area_sqm} feature={l.feature} />
                                                                    </Spec>
                                                                    <Spec label="CLUP zone">
                                                                        {p.land_use_class && (
                                                                            <>
                                                                                {p.land_use_class}
                                                                                {getZoneInfo(p.land_use_class).label !== p.land_use_class && (
                                                                                    <span className="block text-[11.5px] text-slate-500">{getZoneInfo(p.land_use_class).label}</span>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </Spec>
                                                                    <Spec label="Zoning check">
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-[2px]" style={{ background: l.color }} aria-hidden="true" />
                                                                            {l.feature ? l.check.label : "Lot not on the tax map"}
                                                                        </span>
                                                                    </Spec>
                                                                </dl>
                                                                <More title="More lot details">
                                                                    <Row label="PIN" mono>{l.pin}</Row>
                                                                    <Row label="Survey no." mono>{p.survey_number}</Row>
                                                                    <Row label="ARP no." mono>{p.arp_number}</Row>
                                                                    <Row label="Address">{p.location_address}</Row>
                                                                    <Row label="Assessor class">{l.assessor}</Row>
                                                                </More>

                                                                {p.site_inspection?.id && (
                                                                    <div className="mt-2">
                                                                        {/* Local parcel supplies cadastral identity;
                                                                            Parcel Pin uses only confirmed inspection GPS. */}
                                                                        <ParcelInspectionStatus
                                                                            inspectionId={p.site_inspection.id}
                                                                            localInspection={p.site_inspection}
                                                                            localParcel={p}
                                                                            onStatusFetched={onInspectionStatus(p.id)}
                                                                            onInspectionDataFetched={onInspectionDataFetched(p.id)}
                                                                        />

                                                                        {/* ── MASTER MERGE CORRECTION §6: SITE INSPECTOR ROUND
                                                                            ASSIGNMENT, re-homed into master's expanded-lot layout.

                                                                            This is the per-ROUND control: only a Planning Officer may
                                                                            hand an inspection round to another Site Inspector, and only
                                                                            while the server says the round is provably untouched. Every
                                                                            one of those rules lives server-side (InspectorTransferGuard,
                                                                            WorkReassignmentController, ReassignmentReasons); this page
                                                                            only mounts the established component and passes the
                                                                            server-authored facts.

                                                                            Deliberately NOT at application level: PO handover belongs in
                                                                            the round context beside the inspection status it governs. */}
                                                                        <InspectorRoundAssignment
                                                                            state={inspectorRoundState?.[p.site_inspection.id]}
                                                                            history={inspectionHistory?.[p.site_inspection.id]}
                                                                            candidates={inspectors}
                                                                            reasons={reassignmentReasons}
                                                                            canReassign={canReassignInspector}
                                                                            applicationId={app.id}
                                                                        />
                                                                    </div>
                                                                )}

                                                                {editable ? (
                                                                    <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                                                                        <p className="text-[12.5px] font-semibold text-slate-800">Evaluation decision</p>
                                                                        <div role="radiogroup" aria-label={`Evaluation decision for ${l.code}`} className="grid grid-cols-3 border border-slate-300 rounded-md overflow-hidden">
                                                                            {/* LOOP 4: the canonical fourth decision, offered instead of
                                                                                "Needs Site Inspection" once the lot has already been
                                                                                inspected. Same three-cell layout master uses. */}
                                                                            {decisionOptions(hasCompletedInspection(p)).map((d, di) => (
                                                                                <label key={d} className={`relative ${di ? "border-l border-slate-300" : ""}`}>
                                                                                    <input
                                                                                        type="radio"
                                                                                        name={`decision-${p.id}`}
                                                                                        value={d}
                                                                                        checked={review.decision === d}
                                                                                        onChange={() => setReview(p.id, "decision", d)}
                                                                                        className="peer sr-only"
                                                                                    />
                                                                                    <span className="flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 peer-checked:bg-blue-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-blue-500">
                                                                                        <span className={`w-2 h-2 rounded-full ${DECISION_DOT[d] || "bg-slate-300"}`} aria-hidden="true" />
                                                                                        {decisionLabel(d)}
                                                                                    </span>
                                                                                </label>
                                                                            ))}
                                                                        </div>

                                                                        {review.decision === "Declined" && (
                                                                            <div>
                                                                                <label htmlFor={`reason-${p.id}`} className="text-[12px] font-semibold text-slate-700">
                                                                                    Reason for declining <span className="text-rose-600">*</span>
                                                                                </label>
                                                                                <textarea
                                                                                    id={`reason-${p.id}`}
                                                                                    rows={2}
                                                                                    value={review.decision_reason}
                                                                                    onChange={(e) => setReview(p.id, "decision_reason", e.target.value)}
                                                                                    placeholder="Regulatory basis for declining this lot…"
                                                                                    className={`mt-1 resize-none ${FIELD}`}
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {review.decision === "Needs Site Inspection" && (
                                                                            <div className="grid grid-cols-2 gap-2.5">
                                                                                <div className="col-span-2">
                                                                                    <label htmlFor={`inspector-${p.id}`} className="text-[12px] font-semibold text-slate-700">
                                                                                        Inspector <span className="text-rose-600">*</span>
                                                                                    </label>
                                                                                    <select id={`inspector-${p.id}`} value={review.inspector_id} onChange={(e) => setReview(p.id, "inspector_id", e.target.value)} className={`mt-1 ${FIELD}`}>
                                                                                        <option value="">Choose inspector</option>
                                                                                        {inspectors.map((i) => (
                                                                                            <option key={i.id} value={i.id}>{i.name}</option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <label htmlFor={`sched-${p.id}`} className="text-[12px] font-semibold text-slate-700">
                                                                                        Inspection date <span className="text-rose-600">*</span>
                                                                                    </label>
                                                                                    <input id={`sched-${p.id}`} type="date" min={today()} value={review.scheduled_date} onChange={(e) => setReview(p.id, "scheduled_date", e.target.value)} className={`mt-1 ${FIELD}`} />
                                                                                </div>
                                                                                <div>
                                                                                    <label htmlFor={`deadline-${p.id}`} className="text-[12px] font-semibold text-slate-700">
                                                                                        Deadline <span className="text-rose-600">*</span>
                                                                                    </label>
                                                                                    <input id={`deadline-${p.id}`} type="date" min={review.scheduled_date || today()} value={review.deadline_date} onChange={(e) => setReview(p.id, "deadline_date", e.target.value)} className={`mt-1 ${FIELD}`} />
                                                                                </div>
                                                                                <div className="col-span-2">
                                                                                    {/* LOOP 4: reinspection REQUIRES explicit instructions.
                                                                                        Without them the officer is sent back to a lot
                                                                                        with no idea what to re-verify, so the field is
                                                                                        mandatory for this decision only. */}
                                                                                    <label htmlFor={`notes-${p.id}`} className="text-[12px] font-semibold text-slate-700">
                                                                                        Instructions for the inspector
                                                                                        {review.decision === REINSPECTION_DECISION && <span className="text-rose-600">*</span>}
                                                                                    </label>
                                                                                    <textarea id={`notes-${p.id}`} rows={2} value={review.assigned_notes} onChange={(e) => setReview(p.id, "assigned_notes", e.target.value)} placeholder="What to verify on site…" className={`mt-1 resize-none ${FIELD}`} aria-required={review.decision === REINSPECTION_DECISION} />
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        <div>
                                                                            <label htmlFor={`findings-${p.id}`} className="text-[12px] font-semibold text-slate-700">Evaluation notes (optional)</label>
                                                                            <textarea id={`findings-${p.id}`} rows={2} value={review.findings} onChange={(e) => setReview(p.id, "findings", e.target.value)} placeholder="Findings recorded with the decision…" className={`mt-1 resize-none ${FIELD}`} />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    latest && (
                                                                        <div className="mt-2 px-3 py-1.5 rounded-md bg-slate-50 border border-slate-200">
                                                                            <p className="text-[12.5px] font-semibold text-slate-900">
                                                                                {latest.decision}
                                                                                <span className="font-normal text-slate-500">
                                                                                    {" "}· {dash(latest.reviewed_by_name)} · {fmtDate(latest.reviewed_at)}
                                                                                    {latest.review_round > 1 && ` · round ${latest.review_round}`}
                                                                                </span>
                                                                            </p>
                                                                            {latest.decision_reason && <p className="text-[12px] text-slate-600 mt-0.5">{latest.decision_reason}</p>}
                                                                            {latest.findings && <p className="text-[12px] text-slate-600 mt-0.5">{latest.findings}</p>}
                                                                        </div>
                                                                    )
                                                                )}
                                                            </div>
                                                        )}
                                                    </li>
                                                );
                                            })}
                                        </ul>

                                        {app.status === "Technical Review" && (
                                            <div className="sticky bottom-0 -mx-5 mt-3 px-5 py-2.5 bg-white border-t border-slate-200 flex items-center justify-end gap-3">
                                                <span className="text-[12px] text-slate-500">{lots.length - undecided.length} of {lots.length} decided</span>
                                                <button
                                                    type="button"
                                                    onClick={submitEvaluation}
                                                    disabled={saving || !canSubmitEvaluation}
                                                    className="h-9 px-4 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                                                >
                                                    {saving ? "Submitting…" : "Submit evaluation"}
                                                </button>
                                            </div>
                                        )}
                                    </>
                                )}

                                {tab === "history" && (
                                    <>
                                        {history.length === 0 ? (
                                            <p className="text-[12.5px] text-slate-500 py-2">No recorded activity yet.</p>
                                        ) : (
                                            <ol className="relative border-l border-slate-200 ml-1.5 mt-1 space-y-4">
                                                {history.map((h, i) => (
                                                    <li key={i} className="ml-4">
                                                        <span
                                                            className={`absolute -left-[5px] mt-1.5 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                                                h.kind === "review"
                                                                    ? DECISIONS.find((d) => d.value === h.decision)?.dot || "bg-slate-400"
                                                                    : h.action === "TECHNICAL_REVIEW_APPROVED"
                                                                    ? "bg-emerald-500"
                                                                    : ["TECHNICAL_REVIEW_NEEDS_SITE_INSPECTION", "SITE_INSPECTION_ASSIGNED"].includes(h.action)
                                                                    ? "bg-amber-500"
                                                                    : h.action === "TECHNICAL_REVIEW_REQUIRES_REINSPECTION"
                                                                    ? "bg-violet-500"
                                                                    : h.action === "TECHNICAL_REVIEW_DECLINED"
                                                                    ? "bg-rose-500"
                                                                    : "bg-slate-400"
                                                            }`}
                                                            aria-hidden="true"
                                                        />
                                                        <p className="text-[12.5px] font-semibold text-slate-900 first-letter:uppercase">{h.title}</p>
                                                        <p className="text-[11.5px] text-slate-500">
                                                            {fmtDate(h.at, true)}
                                                            {h.who && ` · ${h.who}`}
                                                        </p>
                                                        {h.note && <p className="text-[12px] text-slate-600 mt-0.5 whitespace-pre-line">{h.note}</p>}
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </>
                                )}

                                {tab === "export" && (
                                    <PermitExportPanel
                                        app={app}
                                        part="documents"
                                        savedPermits={savedPermits}
                                        onSavedPermitsChange={setSavedPermits}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Context column: the case at a glance, visible on every tab */}
                        <aside className="order-first lg:order-none lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-l border-slate-200 bg-[#f7f9fc] lg:overflow-y-auto p-4 space-y-4">
                            <div className="h-64 lg:h-[21rem] rounded-xl overflow-hidden border border-slate-200 bg-slate-200 shadow-sm">
                                <ApplicationMap
                                    lots={lots}
                                    parcelMapData={parcelMapData}
                                    brgyMapData={brgyMapData}
                                    barangay={app.barangay}
                                    selectedIndex={selectedIndex}
                                    inspectionPoint={inspectionPoint}
                                    onSelectLot={(i) => {
                                        setSelectedIndex(i);
                                        setTab("parcels");
                                    }}
                                    onPrint={() => setSiteMapOpen(true)}
                                />
                            </div>
                            <section aria-labelledby="case-glance" className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                                <div className="px-4 pt-3.5 pb-3 border-b border-slate-100">
                                    <h2 id="case-glance" className="text-[14px] font-semibold tracking-tight text-slate-900 leading-snug">Application</h2>
                                    <p className="mt-0.5 text-[12px] text-slate-500 tabular-nums">
                                        Brgy. {dash(app.barangay)} · Filed {fmtDate(app.created_at, true)}
                                    </p>
                                </div>
                                {/* Same label-above-value style as the lot record */}
                                <dl className="px-4 py-3.5 grid grid-cols-2 gap-x-4 gap-y-3">
                                    {app.corporation_name && (
                                        <div className="col-span-2"><Spec label="Contact person">{app.applicant_name}</Spec></div>
                                    )}
                                    <div className="col-span-2">
                                        <Spec label="Contact">
                                            {(app.contact_number || app.email) && (
                                                <span className="flex flex-col min-w-0">
                                                    {app.contact_number && (
                                                        <a href={`tel:+63${String(app.contact_number).replace(/^0/, "")}`} className="hover:text-blue-700 hover:underline underline-offset-2">
                                                            +63 {app.contact_number}
                                                        </a>
                                                    )}
                                                    {app.email && (
                                                        <a href={`mailto:${app.email}`} title={app.email} className="block truncate hover:text-blue-700 hover:underline underline-offset-2">
                                                            {app.email}
                                                        </a>
                                                    )}
                                                </span>
                                            )}
                                        </Spec>
                                    </div>
                                    {app.representative_name && (
                                        <div className="col-span-2">
                                            <Spec label="Representative">
                                                {app.representative_name}
                                                {(app.representative_contact || app.representative_address) && (
                                                    <span className="block text-[11.5px] text-slate-500">
                                                        {[app.representative_contact && `+63 ${app.representative_contact}`, app.representative_address].filter(Boolean).join(" · ")}
                                                    </span>
                                                )}
                                            </Spec>
                                        </div>
                                    )}
                                    <Spec label="Type">{dash(app.application_type)}</Spec>
                                    <Spec label="Track">{isAmendment ? "Rezoning / reclassification (needs SB approval)" : hasSbRouting ? "Standard clearance (SB routed)" : "Standard clearance"}</Spec>
                                    {isAmendment && app.target_land_use_class ? (
                                        <Spec label="Target zoning">
                                            {app.target_land_use_class}
                                            <span className="block text-[11.5px] text-slate-500">{getZoneInfo(app.target_land_use_class).label}</span>
                                        </Spec>
                                    ) : (
                                        <Spec label="Purpose">{app.purpose}</Spec>
                                    )}
                                    {isAmendment && app.target_land_use_class && (
                                        <div className="col-span-2"><Spec label="Purpose">{app.purpose}</Spec></div>
                                    )}
                                </dl>
                            </section>
                        </aside>
                    </main>
                </div>
            </div>

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
