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

const STAGES = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released"];
const STAGE_SHORT = { "Under Sangguniang Bayan": "SB" };
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


const NAVY = "#0b2a5b";

function StatusPill({ status }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-slate-200 bg-white text-slate-700 text-[12px] font-medium whitespace-nowrap">
            <span className={`w-2 h-2 rounded-[2px] ${STATUS_DOT[status] || "bg-slate-400"}`} aria-hidden="true" />
            {status || "—"}
        </span>
    );
}

// Five-step stepper for the permit's journey; the current stage is filled.
function StageProgress({ status }) {
    const current = STAGES.indexOf(status);
    const denied = status === "Denied";
    return (
        <ol className="flex items-center w-full" aria-label="Application stage">
            {STAGES.map((s, i) => {
                const done = !denied && (current > i || status === "Released");
                const isCurrent = !denied && current === i && status !== "Released";
                return (
                    <li key={s} className="flex-1 flex flex-col items-center gap-1 relative" aria-current={isCurrent ? "step" : undefined}>
                        {i > 0 && (
                            <span
                                className={`absolute top-[7px] right-1/2 w-full h-[2px] ${done || isCurrent ? "bg-[#0b2a5b]" : "bg-slate-200"}`}
                                aria-hidden="true"
                            />
                        )}
                        <span
                            className={`relative z-[1] w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                done ? "bg-[#0b2a5b] border-[#0b2a5b]" : isCurrent ? "bg-white border-[#0b2a5b]" : "bg-white border-slate-300"
                            }`}
                            aria-hidden="true"
                        >
                            {done && (
                                <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                            )}
                            {isCurrent && <span className="w-1.5 h-1.5 rounded-full bg-[#0b2a5b]" />}
                        </span>
                        <span className={`text-[10.5px] text-center leading-tight ${isCurrent ? "font-semibold text-slate-900" : done ? "text-slate-600" : "text-slate-400"}`}>
                            {STAGE_SHORT[s] || s}
                        </span>
                    </li>
                );
            })}
            {denied && (
                <li className="flex flex-col items-center gap-1 pl-2">
                    <span className="w-4 h-4 rounded-full bg-rose-700 flex items-center justify-center" aria-hidden="true">
                        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="4"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                    </span>
                    <span className="text-[10.5px] font-semibold text-rose-700">Denied</span>
                </li>
            )}
        </ol>
    );
}

// Label / value row used across the record.
function Row({ label, children, mono = false }) {
    const empty = children === null || children === undefined || children === "" || children === false;
    return (
        <div className="grid grid-cols-[128px_1fr] gap-3 py-2 border-b border-slate-100 last:border-b-0">
            <dt className="text-[12px] text-slate-500">{label}</dt>
            <dd className={`text-[12.5px] text-slate-900 break-words ${mono ? "font-mono text-[12px]" : ""}`}>{empty ? <span className="text-slate-400">—</span> : children}</dd>
        </div>
    );
}

// Collapsed group for secondary details, so the record opens on what matters.
function More({ title, children, open = false }) {
    return (
        <details className="group border-t border-slate-200" open={open || undefined}>
            <summary className="flex items-center justify-between py-2.5 cursor-pointer list-none text-[12.5px] font-semibold text-slate-700 hover:text-slate-900">
                {title}
                <svg className="w-4 h-4 text-slate-400 transition-transform group-open:rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
            </summary>
            <dl className="pb-2">{children}</dl>
        </details>
    );
}

const FIELD = "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-800 focus:outline-none focus:border-[#0b2a5b] focus:ring-2 focus:ring-[#0b2a5b]/15";

// Only the transitions the server accepts: the next stage, or Denied
function UpdateStatusDialog({ currentStatus, preset, onClose, onSubmit, saving }) {
    const next = STAGES[STAGES.indexOf(currentStatus) + 1];
    const options = [next, "Denied"].filter(Boolean);
    const [newStatus, setNewStatus] = useState(preset && options.includes(preset) ? preset : options[0] || "");
    const [remarks, setRemarks] = useState("");
    const needsReason = newStatus === "Denied";

    useEffect(() => {
        const onKey = (e) => e.key === "Escape" && onClose();
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40" role="dialog" aria-modal="true" aria-labelledby="status-dialog-title">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
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
                                    <span className="flex justify-center py-2 text-[12.5px] font-semibold text-slate-600 cursor-pointer peer-checked:bg-[#0b2a5b] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[#0b2a5b]">
                                        {s === "Under Sangguniang Bayan" ? "Sangguniang Bayan" : s}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
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
                        disabled={saving || !newStatus || (needsReason && !remarks.trim())}
                        className={`px-4 py-2 rounded-md text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed ${
                            needsReason ? "bg-rose-700 hover:bg-rose-800" : "bg-[#0b2a5b] hover:bg-[#0e3574]"
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
    errors: serverErrors = {},
}) {
    const app = initialApp || alternateApp || {};
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";
    const isAmendment = String(app.application_stream || "").toLowerCase() === "amendment";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [tab, setTab] = useState(app.status === "Technical Review" ? "parcels" : "overview");
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [statusDialog, setStatusDialog] = useState(null); // preset status or null
    const [siteMapOpen, setSiteMapOpen] = useState(false);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [liveStatuses, setLiveStatuses] = useState({});
    const [refs, setRefs] = useState({ sb_ordinance_number: app.sb_ordinance_number || "", dar_clearance_ref: app.dar_clearance_ref || "" });

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
    const backLabel = openedFromTechnicalReview ? "Back to technical review" : "Back to applications";
    const backCrumb = openedFromTechnicalReview ? "Technical Review" : "Applications";

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

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    // ── What's next ──
    const stageStart = useMemo(() => {
        const entries = statusHistory.filter((h) => h.status === app.status);
        return entries.length ? entries[entries.length - 1].created_at : app.updated_at || app.created_at;
    }, [statusHistory, app.status]);
    const daysInStage = workingDaysSince(stageStart);
    const daysSinceFiling = workingDaysSince(app.created_at);
    const overARTA = OFFICE_STAGES.includes(app.status) && daysSinceFiling !== null && daysSinceFiling > ARTA_WORKING_DAYS;

    const pendingInspections = lots.filter((l) => inspectionOpen(l.parcel));
    const undecided = lots.filter((l) => !reviews[l.parcel.id]?.decision);
    const nextStage = STAGES[STAGES.indexOf(app.status) + 1];
    const isFinal = app.status === "Released" || app.status === "Denied";
    const deniedReasons = lots.map((l) => latestReview[l.parcel.id]).filter((r) => r?.decision === "Declined" && r.decision_reason);

    const primaryAction =
        app.status === "Technical Review"
            ? { label: saving ? "Submitting…" : "Submit evaluation", onClick: submitEvaluation, disabled: saving || !canSubmitEvaluation, title: canSubmitEvaluation ? "" : "Waiting on an open site inspection" }
            : app.status === "Received"
            ? { label: "Start technical review", onClick: () => setStatusDialog("Technical Review") }
            : app.status === "Under Sangguniang Bayan"
            ? { label: "Mark for release", onClick: () => setStatusDialog("For Release") }
            : app.status === "For Release"
            ? { label: "Mark as released", onClick: () => setStatusDialog("Released") }
            : null;

    // ── History ──
    const lotCodeById = Object.fromEntries(lots.map((l) => [l.parcel.id, l.code]));
    const history = useMemo(
        () =>
            [
                ...auditTrail.map((a) => ({ at: a.performed_at, who: a.performed_by_name, title: AUDIT_LABELS[a.action] || String(a.action || "").replace(/_/g, " ").toLowerCase(), note: a.note, kind: "audit" })),
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
            ? "Ready for release"
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
        if (app.status === "Under Sangguniang Bayan" && isAmendment) return "Record the SB ordinance number once the petition is approved.";
        if (app.status === "For Release") return `Release mode: ${dash(app.preferred_release_mode)}`;
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

    const tabs = [
        { id: "overview", label: "Summary" },
        { id: "parcels", label: `Lots (${lots.length})` },
        { id: "history", label: "History" },
    ];

    return (
        <>
            <Head title={`${app.reference_number || "Application"} | iMAPS`} />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #dashboard-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                #dashboard-root .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
            `}</style>
            <div id="dashboard-root" className="bg-[#f4f5f7] text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" aria-hidden="true" />}

                    {/* Record bar: where you are and what you can do */}
                    <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3 shrink-0 z-10">
                        <div className="flex items-center gap-3 min-w-0">
                            <Link
                                href={backHref}
                                className="w-8 h-8 flex items-center justify-center rounded-md border border-slate-300 text-slate-600 hover:bg-slate-50 shrink-0"
                                aria-label={backLabel}
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </Link>
                            <div className="min-w-0">
                                <p className="text-[11.5px] text-slate-500 leading-tight">
                                    {backCrumb} / <span className="font-mono text-slate-700">{app.reference_number || `APP-${app.id}`}</span>
                                </p>
                                <h1 className="text-[15px] font-semibold text-slate-900 leading-tight truncate">{app.corporation_name || app.applicant_name || "—"}</h1>
                            </div>
                            <StatusPill status={app.status} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setSiteMapOpen(true)}
                                disabled={!lots.some((l) => l.feature)}
                                className="h-9 px-3 rounded-md border border-slate-300 bg-white text-[12.5px] font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Print site map
                            </button>
                            {!isFinal && app.status !== "Technical Review" && (
                                <button
                                    type="button"
                                    onClick={() => setStatusDialog("Denied")}
                                    className="h-9 px-3 rounded-md border border-slate-300 bg-white text-[12.5px] font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
                                >
                                    Deny
                                </button>
                            )}
                            {primaryAction && (
                                <button
                                    type="button"
                                    onClick={primaryAction.onClick}
                                    disabled={primaryAction.disabled}
                                    title={primaryAction.title || undefined}
                                    className="h-9 px-4 rounded-md bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                                >
                                    {primaryAction.label}
                                </button>
                            )}
                        </div>
                    </div>

                    {toast && (
                        <div className="absolute top-[68px] right-4 z-[999]" role="status">
                            <div className={`flex items-center gap-3 px-4 py-2.5 rounded-md border shadow-lg max-w-sm ${toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-900 text-white border-slate-800"}`}>
                                <p className="text-[12.5px] font-medium flex-1">{toast.msg}</p>
                                <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 cursor-pointer">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                                </button>
                            </div>
                        </div>
                    )}

                    <main className="flex-1 flex flex-col lg:flex-row min-h-0">
                        {/* Map (view only) */}
                        <div className="h-72 lg:h-auto lg:flex-1 border-b lg:border-b-0 lg:border-r border-slate-300 shrink-0 min-w-0">
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

                        {/* Record */}
                        <div className="lg:w-[440px] xl:w-[480px] shrink-0 min-h-0 flex flex-col bg-white">
                            <div className="shrink-0 px-5 pt-4 pb-3 border-b border-slate-200">
                                <p className="text-[12.5px] text-slate-600">
                                    {dash(app.application_type)} · Brgy. {dash(app.barangay)}
                                </p>
                                <div className="mt-3">
                                    <StageProgress status={app.status} />
                                </div>
                                <dl className="mt-3 grid grid-cols-3 border border-slate-200 rounded-md divide-x divide-slate-200">
                                    {[
                                        ["Filed", fmtDate(app.created_at)],
                                        ["In this stage", isFinal ? "—" : daysInStage != null ? `${daysInStage} working day${daysInStage === 1 ? "" : "s"}` : "—"],
                                        ["Assessment fee", peso(app.assessment_fee)],
                                    ].map(([k, v]) => (
                                        <div key={k} className="px-3 py-2 min-w-0">
                                            <dt className="text-[11px] text-slate-500">{k}</dt>
                                            <dd className="text-[12.5px] font-semibold text-slate-900 truncate tabular-nums">{v}</dd>
                                        </div>
                                    ))}
                                </dl>
                            </div>

                            {/* Next step */}
                            <div className={`shrink-0 px-5 py-3 border-b border-slate-200 ${overARTA ? "bg-amber-50" : "bg-[#f7f9fc]"}`}>
                                <p className="text-[11px] text-slate-500">Next step</p>
                                <p className="text-[13px] font-semibold text-slate-900">{nextStep}</p>
                                {nextDetail && <p className="text-[12px] text-slate-600 mt-0.5">{nextDetail}</p>}
                                {overARTA && (
                                    <p className="text-[12px] font-medium text-amber-800 mt-1">
                                        {daysSinceFiling} working days since filing, beyond the {ARTA_WORKING_DAYS}-day processing time for highly technical applications (RA 11032).
                                    </p>
                                )}
                            </div>

                            {/* Tabs */}
                            <div className="shrink-0 flex gap-5 px-5 border-b border-slate-200" role="tablist" aria-label="Record sections">
                                {tabs.map((t) => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        role="tab"
                                        aria-selected={tab === t.id}
                                        onClick={() => setTab(t.id)}
                                        className={`py-2.5 -mb-px border-b-2 text-[13px] cursor-pointer ${
                                            tab === t.id ? "border-[#0b2a5b] text-slate-900 font-semibold" : "border-transparent text-slate-500 hover:text-slate-800"
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>

                            <div className="flex-1 overflow-y-auto px-5 py-3" role="tabpanel">
                                {tab === "overview" && (
                                    <>
                                        <dl>
                                            <Row label="Applicant">{app.applicant_name}</Row>
                                            {app.corporation_name && <Row label="Corporation">{app.corporation_name}</Row>}
                                            <Row label="Contact">
                                                {(app.contact_number || app.email) && (
                                                    <span className="flex flex-col">
                                                        {app.contact_number && (
                                                            <a href={`tel:+63${String(app.contact_number).replace(/^0/, "")}`} className="hover:underline underline-offset-2">
                                                                +63 {app.contact_number}
                                                            </a>
                                                        )}
                                                        {app.email && (
                                                            <a href={`mailto:${app.email}`} className="hover:underline underline-offset-2 break-all">
                                                                {app.email}
                                                            </a>
                                                        )}
                                                    </span>
                                                )}
                                            </Row>
                                            {app.representative_name && (
                                                <Row label="Representative">
                                                    {app.representative_name}
                                                    {(app.representative_contact || app.representative_address) && (
                                                        <span className="block text-[12px] text-slate-500">
                                                            {[app.representative_contact && `+63 ${app.representative_contact}`, app.representative_address].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </Row>
                                            )}
                                            <Row label="Track">{isAmendment ? "Legislative amendment (Track B)" : "Standard clearance (Track A)"}</Row>
                                            {isAmendment && app.target_land_use_class && (
                                                <Row label="Target zoning">
                                                    {app.target_land_use_class}
                                                    <span className="block text-[12px] text-slate-500">{getZoneInfo(app.target_land_use_class).label}</span>
                                                </Row>
                                            )}
                                            <Row label="Purpose">{app.purpose}</Row>
                                        </dl>

                                        {isAmendment && (
                                            <div className="mt-4 mb-2 p-3 rounded-md border border-slate-200 bg-slate-50">
                                                <p className="text-[12.5px] font-semibold text-slate-800 mb-2">Sangguniang Bayan / DAR references</p>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                                    {[
                                                        ["sb_ordinance_number", "SB ordinance no.", "e.g. Ord. No. 2026-014"],
                                                        ["dar_clearance_ref", "DAR clearance ref.", "e.g. DAR-CC-2026-0021"],
                                                    ].map(([field, label, placeholder]) => (
                                                        <div key={field}>
                                                            <label htmlFor={field} className="text-[12px] text-slate-600">{label}</label>
                                                            <input
                                                                id={field}
                                                                type="text"
                                                                maxLength={100}
                                                                value={refs[field]}
                                                                onChange={(e) => setRefs((r) => ({ ...r, [field]: e.target.value }))}
                                                                placeholder={placeholder}
                                                                className={`mt-1 font-mono ${FIELD}`}
                                                            />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="flex justify-end mt-2.5">
                                                    <button
                                                        type="button"
                                                        onClick={saveRefs}
                                                        disabled={saving || (refs.sb_ordinance_number === (app.sb_ordinance_number || "") && refs.dar_clearance_ref === (app.dar_clearance_ref || ""))}
                                                        className="h-8 px-3.5 rounded-md bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                    >
                                                        Save references
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        <div className="mt-3">
                                            <More title="Project details">
                                                <Row label="Project / business">{app.project_type_business_name}</Row>
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
                                                <Row label="Filed">{fmtDate(app.created_at, true)}</Row>
                                                <Row label="Remarks">{app.remarks}</Row>
                                            </More>
                                        </div>

                                        {/* Loop 9C-2, Summary branch (master merge re-home).
                                            The panel is application-level, not parcel-level: it
                                            enumerates every inspection round from the 9C-1
                                            reader, so it must not be nested under a parcel's
                                            latest-only inspection surface.
                                            Mounted INSIDE the Summary tab so it is mutually
                                            exclusive with the Lots-branch mount below: these
                                            tabs are exclusive, so exactly one renders and the
                                            panel is never duplicated on a page.
                                            Not gated on any Planning Officer decision control —
                                            delivery status is shared read-only visibility for
                                            Admin and Planning Officer alike. */}
                                        {/* ── MASTER MERGE CORRECTION §5: APPLICATION-LEVEL
                                            PLANNING OFFICER OWNERSHIP, re-homed into the Summary tab.

                                            Admin-initiated application handover. It is APPLICATION
                                            level, so it deliberately lives outside the parcel list
                                            and outside any inspection-round context: PO ownership
                                            of a record is not a property of a lot or a round.

                                            `canReassignPlanningOfficer` is a SERVER fact (the viewer
                                            is Admin), not a client role guess, and the component
                                            enforces reason requirements itself. No assignment
                                            logic is duplicated on this page. */}
                                        <PlanningOfficerAssignment
                                            current={assignedPlanningOfficer}
                                            candidates={planningOfficers}
                                            history={poAssignmentHistory}
                                            reasons={reassignmentReasons}
                                            canReassign={canReassignPlanningOfficer}
                                            applicationId={app.id}
                                        />

                                        <div className="mt-4 p-5 rounded-md border border-slate-200 bg-white">
                                            <InspectionDeliveryStatusPanel applicationId={app.id} />
                                        </div>
                                    </>
                                )}

                                {tab === "parcels" && (
                                    <>
                                        {/* Loop 9C-2, Lots branch (master merge re-home).
                                            The second mutually exclusive mount site. The two
                                            branches are exclusive tabs, so only one can render
                                            on a given page view, and the panel is passed the
                                            Application model id already supplied to the page. */}
                                        <div className="mb-3 p-5 rounded-md border border-slate-200 bg-white">
                                            <InspectionDeliveryStatusPanel applicationId={app.id} />
                                        </div>

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
                                                    <li key={p.id} className={`rounded-md border ${isOpen ? "border-[#0b2a5b]/40 shadow-sm" : "border-slate-200"}`}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedIndex(l.index)}
                                                            aria-expanded={isOpen}
                                                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer hover:bg-slate-50 rounded-md"
                                                        >
                                                            <span className={`text-[12px] font-semibold px-1.5 py-0.5 rounded ${isOpen ? "bg-[#0b2a5b] text-white" : "bg-slate-100 text-slate-700"}`}>{l.code}</span>
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
                                                            <svg className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                                            </svg>
                                                        </button>

                                                        {isOpen && (
                                                            <div className="px-3 pb-3 border-t border-slate-100">
                                                                <dl className="pt-1">
                                                                    <Row label="Owner">{p.owner_name}</Row>
                                                                    <Row label="Lot no." mono>{p.lot_number}</Row>
                                                                    <Row label="TCT / Tax Dec." mono>{[p.tct_number, p.tax_dec_number].filter(Boolean).join(" · ")}</Row>
                                                                    <Row label="Lot area">
                                                                        <AreaComparison declared={p.lot_area_sqm} feature={l.feature} />
                                                                    </Row>
                                                                    <Row label="CLUP zone">
                                                                        {p.land_use_class && (
                                                                            <>
                                                                                {p.land_use_class}
                                                                                {getZoneInfo(p.land_use_class).label !== p.land_use_class && (
                                                                                    <span className="block text-[12px] text-slate-500">{getZoneInfo(p.land_use_class).label}</span>
                                                                                )}
                                                                            </>
                                                                        )}
                                                                    </Row>
                                                                    <Row label="Zoning check">
                                                                        <span className="inline-flex items-center gap-1.5">
                                                                            <span className="w-2 h-2 rounded-[2px]" style={{ background: l.color }} aria-hidden="true" />
                                                                            {l.feature ? l.check.label : "Lot not on the tax map"}
                                                                        </span>
                                                                    </Row>
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
                                                                                    <span className="flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold text-slate-600 cursor-pointer hover:bg-slate-50 peer-checked:bg-[#0b2a5b] peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-inset peer-focus-visible:ring-[#0b2a5b]">
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
                                                                        <div className="mt-3 px-3 py-2 rounded-md bg-slate-50 border border-slate-200">
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
                                                    className="h-9 px-4 rounded-md bg-[#0b2a5b] hover:bg-[#0e3574] text-white text-[12.5px] font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
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
                                                                h.kind === "review" ? DECISIONS.find((d) => d.value === h.decision)?.dot || "bg-slate-400" : "bg-slate-400"
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
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {statusDialog && <UpdateStatusDialog currentStatus={app.status} preset={statusDialog} onClose={() => setStatusDialog(null)} onSubmit={submitStatus} saving={saving} />}

            <SiteMapPrint open={siteMapOpen} onClose={() => setSiteMapOpen(false)} form={app} parcelMapData={parcelMapData} preparedBy={userName} />
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
                        <button onClick={() => window.location.reload()} className="px-4 py-2 rounded-md bg-[#0b2a5b] text-white text-[12.5px] font-semibold hover:bg-[#0e3574] cursor-pointer">
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
