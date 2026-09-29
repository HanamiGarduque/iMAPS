// resources/js/Pages/Applications/Show.jsx
// Application record: map of the lots (left) and Overview / Parcels & evaluation / History (right).
import React, { useState, useEffect, useMemo, useRef } from "react";
import { Link, Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import ParcelInspectionStatus from "@/Components/ParcelInspectionStatus";
import { getZoningCheck, CHECK_COLORS, AreaComparison, Attr } from "@/Components/MapKit";
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

function StatusPill({ status }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold whitespace-nowrap">
            <span className={`w-1.5 h-1.5 rounded-full ${STATUS_DOT[status] || "bg-slate-400"}`} aria-hidden="true" />
            {status || "—"}
        </span>
    );
}

function StageProgress({ status }) {
    const current = STAGES.indexOf(status);
    const denied = status === "Denied";
    return (
        <ol className="hidden xl:flex items-center gap-1 text-[11px]" aria-label="Application stage">
            {STAGES.map((s, i) => {
                const done = !denied && current > i;
                const isCurrent = !denied && current === i;
                return (
                    <li key={s} className="flex items-center gap-1" aria-current={isCurrent ? "step" : undefined}>
                        {i > 0 && <span className={`w-4 h-px ${done || isCurrent ? "bg-slate-500" : "bg-slate-300"}`} aria-hidden="true" />}
                        <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ${
                                isCurrent ? "bg-slate-800 text-white font-semibold" : done ? "text-slate-700 font-medium" : "text-slate-400"
                            }`}
                        >
                            {done && "✓ "}
                            {STAGE_SHORT[s] || s}
                        </span>
                    </li>
                );
            })}
            {denied && (
                <li className="flex items-center gap-1">
                    <span className="w-4 h-px bg-rose-300" aria-hidden="true" />
                    <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white font-semibold">Denied</span>
                </li>
            )}
        </ol>
    );
}

function Section({ title, children, action }) {
    return (
        <section className="rounded-xl border border-slate-200 bg-white">
            <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</h3>
                {action}
            </div>
            <dl className="px-4 py-1 text-xs">{children}</dl>
        </section>
    );
}

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
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                    <h3 id="status-dialog-title" className="text-base font-bold text-slate-900">Update application status</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Currently {currentStatus}. Applications move one stage at a time, or can be denied.</p>
                </div>
                <div className="p-5 space-y-4">
                    <fieldset>
                        <legend className="text-xs font-semibold text-slate-700 mb-1.5">New status</legend>
                        <div className="grid grid-cols-2 gap-1 p-1 rounded-full bg-slate-100">
                            {options.map((s) => (
                                <label key={s} className="relative">
                                    <input type="radio" name="new-status" value={s} checked={newStatus === s} onChange={() => setNewStatus(s)} className="peer sr-only" />
                                    <span className="flex justify-center py-1.5 rounded-full text-xs font-semibold text-slate-500 cursor-pointer peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
                                        {s === "Under Sangguniang Bayan" ? "Sangguniang Bayan" : s}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>
                    <div>
                        <label htmlFor="status-remarks" className="text-xs font-semibold text-slate-700">
                            {needsReason ? "Reason for denial" : "Remarks (optional)"} {needsReason && <span className="text-rose-500">*</span>}
                        </label>
                        <textarea
                            id="status-remarks"
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder={needsReason ? "Regulatory basis for denying this application…" : "Notes recorded in the history…"}
                            className="mt-1.5 w-full rounded-2xl border border-slate-200 px-4 py-2.5 text-xs text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-none"
                        />
                    </div>
                </div>
                <div className="px-5 py-3.5 border-t border-slate-100 flex justify-end gap-2">
                    <button type="button" onClick={onClose} className="px-4 py-2 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onSubmit({ new_status: newStatus, remarks })}
                        disabled={saving || !newStatus || (needsReason && !remarks.trim())}
                        className={`px-5 py-2 rounded-full text-white text-xs font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed ${
                            needsReason ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"
                        }`}
                    >
                        {saving ? "Saving…" : needsReason ? "Deny application" : `Move to ${newStatus === "Under Sangguniang Bayan" ? "SB" : newStatus}`}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function Show({
    auth,
    application: initialApp,
    app: alternateApp,
    inspectors = [],
    technicalReviews = [],
    auditTrail = [],
    statusHistory = [],
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
    const [landUseMapData, setLandUseMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(0);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const rosarioCenter = [13.845, 121.2063];

    useEffect(() => {
        fetch("/geojson/rosario_brgy_map.geojson")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(sanitizeGeoJSON(data)))
            .catch(() => {});

        fetch("/geojson/land_use_plan.geojson")
            .then((res) => res.json())
            .then((data) => setLandUseMapData(sanitizeGeoJSON(data)))
            .catch(() => {});

        fetch("/api/map/land_parcels")
            .then((res) => {
                if (!res.ok) throw new Error("Unable to load land parcel layer");
                return res.json();
            })
            .then((data) => {
                const sanitized = sanitizeGeoJSON(data);
                setParcelMapData(sanitized);

                const lookupMap = {};
                (sanitized?.features || []).forEach((feature) => {
                    const pin = feature?.properties?.property_index_number?.trim();
                    if (!pin) return;
                    lookupMap[pin] = feature;
                });
                setPinLookupMap(lookupMap);
            })
            .catch(() => {});
    }, []);

    useEffect(() => {
        if (uniqueParcels && uniqueParcels.length > 0) {
            const currentParcel = uniqueParcels[activeParcelIndex] || uniqueParcels[0];
            const targetPin = currentParcel?.property_index_number?.trim();
            if (targetPin && pinLookupMap[targetPin]) {
                setActiveParcelFeature(pinLookupMap[targetPin]);
            } else {
                setActiveParcelFeature(null);
            }
        }
    }, [pinLookupMap, activeParcelIndex, app, uniqueParcels]);

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

    // Stable per-parcel callbacks: ParcelInspectionStatus refetches whenever its callback identity changes
    const statusCallbacks = useRef({});
    const onInspectionStatus = (parcelId) =>
        (statusCallbacks.current[parcelId] ||= (status) => setLiveStatuses((prev) => (prev[parcelId] === status ? prev : { ...prev, [parcelId]: status })));

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
    const canSubmitEvaluation = parcels.length > 0 && parcels.every((p) => !inspectionOpen(p));

    const submitEvaluation = () => {
        for (const [i, p] of parcels.entries()) {
            const r = reviews[p.id] || {};
            const code = lots[i].code;
            const problem = !r.decision
                ? `Choose an evaluation decision for ${code}.`
                : r.decision === "Declined" && !r.decision_reason?.trim()
                ? `Give the reason for declining ${code}.`
                : r.decision === "Needs Site Inspection" && (!r.inspector_id || !r.scheduled_date || !r.deadline_date)
                ? `Choose the inspector, inspection date and deadline for ${code}.`
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

    return (
        <>
            <Head title={`${app.reference_number || "Application"} | iMAPS`} />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                #record-root { font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
                .font-mono { font-family: 'JetBrains Mono', monospace !important; }
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
            `}</style>

            <div id="record-root" className="bg-slate-50 text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />
                    {sidebarOpen && <div onClick={() => setSidebarOpen(false)} className="absolute inset-0 bg-slate-950/20 z-[750]" />}

                    {/* Top bar */}
                    <div className="h-12 bg-white border-b border-slate-200 px-4 flex items-center justify-between gap-3 shrink-0 z-10">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <Link href="/applications" className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold text-slate-600 hover:bg-slate-100">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                                All records
                            </Link>
                            <span className="text-slate-300" aria-hidden="true">/</span>
                            <span className="font-mono text-xs font-semibold text-slate-800">{app.reference_number || `APP-${app.id}`}</span>
                            <StatusPill status={app.status} />
                            <span className="h-4 w-px bg-slate-200 mx-1 hidden xl:block" aria-hidden="true" />
                            <StageProgress status={app.status} />
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setSiteMapOpen(true)}
                                disabled={!lots.some((l) => l.feature)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M7 9V3h10v6M7 17H5a2 2 0 01-2-2v-4a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2h-2M7 14h10v7H7z" />
                                </svg>
                                <span className="hidden sm:inline">Site map</span>
                            </button>
                            {!isFinal && app.status !== "Technical Review" && (
                                <button
                                    type="button"
                                    onClick={() => setStatusDialog("Denied")}
                                    className="px-3 py-1.5 rounded-full border border-slate-200 text-xs font-semibold text-rose-700 hover:bg-rose-50 cursor-pointer"
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
                                    className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
                                >
                                    {primaryAction.label}
                                </button>
                            )}
                        </div>
                    </div>

                    {toast && (
                        <div className="absolute top-16 right-4 z-[999]" role="status">
                            <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl max-w-sm ${toast.type === "error" ? "bg-rose-50 border-rose-200 text-rose-800" : "bg-slate-900 text-white border-slate-800"}`}>
                                <p className="font-semibold text-xs flex-1">{toast.msg}</p>
                                <button type="button" onClick={() => setToast(null)} aria-label="Dismiss" className="opacity-60 hover:opacity-100 cursor-pointer">
                                    ✕
                                </button>
                            </div>
                        </div>
                    )}

                    <main className="flex-1 flex flex-col lg:flex-row min-h-0">
                        {/* Map */}
                        <div className="h-72 lg:h-auto lg:w-[55%] border-b lg:border-b-0 lg:border-r border-slate-300 shrink-0">
                            <ApplicationMap
                                lots={lots}
                                parcelMapData={parcelMapData}
                                brgyMapData={brgyMapData}
                                barangay={app.barangay}
                                selectedIndex={selectedIndex}
                                onSelectLot={(i) => {
                                    setSelectedIndex(i);
                                    setTab("parcels");
                                }}
                                onPrint={() => setSiteMapOpen(true)}
                            />
                        </div>

                        {/* Record panel */}
                        <div className="flex-1 min-w-0 flex flex-col bg-white">
                            <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h1 className="text-lg font-bold text-slate-900 leading-tight truncate">{app.corporation_name || app.applicant_name || "—"}</h1>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            {dash(app.application_type)} · Brgy. {dash(app.barangay)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-[10px] uppercase tracking-wider text-slate-400">Assessment fee</p>
                                        <p className="font-mono text-sm font-bold text-slate-900">{peso(app.assessment_fee)}</p>
                                    </div>
                                </div>
                                <div className="mt-3 grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-full" role="tablist" aria-label="Record sections">
                                    {[
                                        { id: "overview", label: "Overview" },
                                        { id: "parcels", label: `Parcels & evaluation (${lots.length})` },
                                        { id: "history", label: "History" },
                                    ].map((t) => (
                                        <button
                                            key={t.id}
                                            type="button"
                                            role="tab"
                                            aria-selected={tab === t.id}
                                            onClick={() => setTab(t.id)}
                                            className={`py-1.5 rounded-full text-xs font-semibold cursor-pointer ${tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
                                        >
                                            {t.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5 space-y-4">
                                {tab === "overview" && (
                                    <>
                                        {/* What's next */}
                                        <section className={`rounded-xl border p-4 ${overARTA ? "border-amber-300 bg-amber-50/40" : "border-slate-200 bg-slate-50"}`}>
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">What's next</p>
                                                    <p className="text-sm font-bold text-slate-900 mt-0.5">
                                                        {app.status === "Technical Review"
                                                            ? pendingInspections.length
                                                                ? "Waiting on site inspection"
                                                                : "Record the evaluation"
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
                                                            : "—"}
                                                    </p>
                                                </div>
                                                {!isFinal && (
                                                    <div className="text-right shrink-0">
                                                        <p className="text-lg font-bold text-slate-900 leading-none">{daysInStage ?? "—"}</p>
                                                        <p className="text-[10px] text-slate-500">working days in stage</p>
                                                    </div>
                                                )}
                                            </div>
                                            <ul className="mt-2.5 space-y-1 text-xs text-slate-700">
                                                {app.status === "Technical Review" &&
                                                    pendingInspections.map((l) => {
                                                        const si = l.parcel.site_inspection;
                                                        const overdue = si?.deadline_date && String(si.deadline_date).split("T")[0] < today();
                                                        return (
                                                            <li key={l.code}>
                                                                <b>{l.code}</b>: inspection by {inspectorName(si.inspector_id)}, due {fmtDate(si.deadline_date)}
                                                                {overdue && <span className="ml-1 font-semibold text-rose-700">· overdue</span>}
                                                            </li>
                                                        );
                                                    })}
                                                {app.status === "Technical Review" && !pendingInspections.length && undecided.length > 0 && (
                                                    <li>
                                                        Choose a decision for {undecided.map((l) => l.code).join(", ")} in <b>Parcels & evaluation</b>, then <b>Submit evaluation</b>.
                                                    </li>
                                                )}
                                                {app.status === "Under Sangguniang Bayan" && isAmendment && <li>Record the SB ordinance number below once the petition is approved.</li>}
                                                {app.status === "For Release" && <li>Release mode: {dash(app.preferred_release_mode)}</li>}
                                                {app.status === "Denied" &&
                                                    deniedReasons.map((r) => (
                                                        <li key={r.id}>
                                                            <b>{lotCodeById[r.parcel_id]}</b>: {r.decision_reason}
                                                        </li>
                                                    ))}
                                                <li className="text-slate-500">
                                                    Filed {fmtDate(app.created_at)}
                                                    {daysSinceFiling !== null && ` · ${daysSinceFiling} working days ago`}
                                                    {overARTA && (
                                                        <span className="block font-semibold text-amber-800 mt-0.5">
                                                            Beyond the {ARTA_WORKING_DAYS}-working-day processing time for highly technical applications (RA 11032).
                                                        </span>
                                                    )}
                                                </li>
                                            </ul>
                                        </section>

                                        <Section title="Applicant">
                                            <Attr label="Name">{app.applicant_name}</Attr>
                                            {app.corporation_name && <Attr label="Corporation">{app.corporation_name}</Attr>}
                                            <Attr label="Phone">
                                                {app.contact_number && (
                                                    <a href={`tel:+63${String(app.contact_number).replace(/^0/, "")}`} className="font-mono underline underline-offset-2 hover:text-blue-700">
                                                        +63 {app.contact_number}
                                                    </a>
                                                )}
                                            </Attr>
                                            <Attr label="Email">
                                                {app.email && (
                                                    <a href={`mailto:${app.email}`} className="underline underline-offset-2 hover:text-blue-700 break-all">
                                                        {app.email}
                                                    </a>
                                                )}
                                            </Attr>
                                            <Attr label="Right over land">{app.right_over_land}</Attr>
                                            {app.representative_name && (
                                                <Attr label="Representative">
                                                    {app.representative_name}
                                                    {(app.representative_contact || app.representative_address) && (
                                                        <span className="block text-[11px] font-normal text-slate-500">
                                                            {[app.representative_contact && `+63 ${app.representative_contact}`, app.representative_address].filter(Boolean).join(" · ")}
                                                        </span>
                                                    )}
                                                </Attr>
                                            )}
                                        </Section>

                                        <Section title="Application">
                                            <Attr label="Category">{app.application_type}</Attr>
                                            <Attr label="Track">{isAmendment ? "Legislative amendment (Track B)" : "Standard clearance (Track A)"}</Attr>
                                            {isAmendment && (
                                                <Attr label="Target zoning">
                                                    {app.target_land_use_class && (
                                                        <span>
                                                            {app.target_land_use_class}
                                                            <span className="block text-[11px] font-normal text-slate-400">{getZoneInfo(app.target_land_use_class).label}</span>
                                                        </span>
                                                    )}
                                                </Attr>
                                            )}
                                            <Attr label="Form no." mono>{app.form_number}</Attr>
                                            <Attr label="Purpose">{app.purpose}</Attr>
                                        </Section>

                                        {isAmendment && (
                                            <section className="rounded-xl border border-slate-200 bg-white">
                                                <div className="px-4 py-2.5 border-b border-slate-100">
                                                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Sangguniang Bayan / DAR</h3>
                                                </div>
                                                <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                    {[
                                                        ["sb_ordinance_number", "SB ordinance no.", "e.g. Ord. No. 2026-014"],
                                                        ["dar_clearance_ref", "DAR clearance ref.", "e.g. DAR-CC-2026-0021"],
                                                    ].map(([field, label, placeholder]) => (
                                                        <div key={field}>
                                                            <label htmlFor={field} className="text-xs font-semibold text-slate-700">
                                                                {label}
                                                            </label>
                                                            <input
                                                                id={field}
                                                                type="text"
                                                                maxLength={100}
                                                                value={refs[field]}
                                                                onChange={(e) => setRefs((r) => ({ ...r, [field]: e.target.value }))}
                                                                placeholder={placeholder}
                                                                className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-xs font-mono text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10"
                                                            />
                                                        </div>
                                                    ))}
                                                    <div className="sm:col-span-2 flex justify-end">
                                                        <button
                                                            type="button"
                                                            onClick={saveRefs}
                                                            disabled={saving || (refs.sb_ordinance_number === (app.sb_ordinance_number || "") && refs.dar_clearance_ref === (app.dar_clearance_ref || ""))}
                                                            className="px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold cursor-pointer disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed"
                                                        >
                                                            Save references
                                                        </button>
                                                    </div>
                                                </div>
                                            </section>
                                        )}

                                        <Section title="Project">
                                            <Attr label="Project / business">{app.project_type_business_name}</Attr>
                                            <Attr label="Building area">{app.building_area && `${Number(app.building_area).toLocaleString()} sq.m`}</Attr>
                                            <Attr label="Area to develop">{app.area_to_develop && `${Number(app.area_to_develop).toLocaleString()} sq.m`}</Attr>
                                            {app.number_of_saleable_lots != null && <Attr label="Saleable lots">{String(app.number_of_saleable_lots)}</Attr>}
                                            <Attr label="Project cost">{app.project_cost && peso(app.project_cost)}</Attr>
                                            <Attr label="Tenure">{app.project_tenure}</Attr>
                                        </Section>

                                        <Section title="Fees & receipt">
                                            {[
                                                ["Zoning certificate", app.zoning_certificate_fee],
                                                ["Locational clearance", app.locational_clearance_fee],
                                                ["Development permit", app.development_permit_fee],
                                                ["Other fees", app.other_fees],
                                                ["Penalty", app.penalty_fee],
                                            ]
                                                .filter(([, v]) => Number(v) > 0)
                                                .map(([label, v]) => (
                                                    <Attr key={label} label={label} mono>
                                                        {peso(v)}
                                                    </Attr>
                                                ))}
                                            <Attr label="Total" mono>
                                                {peso(app.assessment_fee)}
                                            </Attr>
                                            <Attr label="OR no." mono>
                                                {app.or_number}
                                            </Attr>
                                            <Attr label="Date of receipt">{app.date_of_receipt && fmtDate(app.date_of_receipt)}</Attr>
                                            <Attr label="Release mode">{app.preferred_release_mode}</Attr>
                                        </Section>

                                        <Section title="Record">
                                            <Attr label="Encoded by">{app.encoded_by_name}</Attr>
                                            <Attr label="Filed">{fmtDate(app.created_at, true)}</Attr>
                                            <Attr label="Remarks">{app.remarks}</Attr>
                                        </Section>
                                    </>
                                )}

                                {tab === "parcels" && (
                                    <>
                                        {app.status === "Technical Review" && !canSubmitEvaluation && (
                                            <p className="text-xs text-slate-600 pl-3 border-l-2 border-amber-400">
                                                Decisions are locked for lots with an open site inspection. The evaluation can be submitted once every inspection report is in.
                                            </p>
                                        )}
                                        <ul className="rounded-xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
                                            {lots.map((l) => {
                                                const p = l.parcel;
                                                const isOpen = selectedIndex === l.index;
                                                const review = reviews[p.id] || {};
                                                const latest = latestReview[p.id];
                                                const locked = inspectionOpen(p);
                                                const editable = app.status === "Technical Review" && !locked;
                                                const shownDecision = app.status === "Technical Review" ? review.decision : latest?.decision;
                                                const decisionDot = DECISIONS.find((d) => d.value === shownDecision)?.dot || "bg-slate-300";
                                                return (
                                                    <li key={p.id} className={isOpen ? "bg-white" : "bg-slate-50/60"}>
                                                        <button
                                                            type="button"
                                                            onClick={() => setSelectedIndex(l.index)}
                                                            aria-expanded={isOpen}
                                                            className="w-full flex items-center gap-3 px-4 py-2.5 text-left cursor-pointer hover:bg-slate-50"
                                                        >
                                                            <span className={`text-[11px] font-bold w-9 shrink-0 ${isOpen ? "text-slate-900" : "text-slate-500"}`}>{l.code}</span>
                                                            <span className="font-mono text-[11px] text-slate-700 truncate">{l.pin || "No PIN"}</span>
                                                            <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-600 shrink-0">
                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                                                                {l.check.label}
                                                            </span>
                                                            <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 shrink-0">
                                                                <span className={`w-1.5 h-1.5 rounded-full ${decisionDot}`} aria-hidden="true" />
                                                                {locked ? "Inspection open" : shownDecision || "No decision"}
                                                            </span>
                                                        </button>

                                                        {isOpen && (
                                                            <div className="px-4 pb-4 space-y-4">
                                                                <div>
                                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Attributes</p>
                                                                    <dl className="text-xs rounded-lg border border-slate-200 px-3">
                                                                        <Attr label="Owner">{p.owner_name}</Attr>
                                                                        <Attr label="Lot / Survey" mono>
                                                                            {[p.lot_number, p.survey_number].filter(Boolean).join(" · ")}
                                                                        </Attr>
                                                                        <Attr label="ARP / TD / TCT" mono>
                                                                            {[p.arp_number, p.tax_dec_number, p.tct_number].filter(Boolean).join(" · ")}
                                                                        </Attr>
                                                                        <Attr label="Address">{p.location_address}</Attr>
                                                                        <Attr label="Lot area">
                                                                            <AreaComparison declared={p.lot_area_sqm} feature={l.feature} />
                                                                        </Attr>
                                                                        <Attr label="Assessor class">{l.assessor}</Attr>
                                                                        <Attr label="CLUP zone">
                                                                            {p.land_use_class && (
                                                                                <span>
                                                                                    {p.land_use_class}
                                                                                    {getZoneInfo(p.land_use_class).label !== p.land_use_class && (
                                                                                        <span className="block text-slate-400 font-normal">{getZoneInfo(p.land_use_class).label}</span>
                                                                                    )}
                                                                                </span>
                                                                            )}
                                                                        </Attr>
                                                                        <Attr label="Zoning check">
                                                                            <span className="inline-flex items-center gap-1.5">
                                                                                <span className="w-1.5 h-1.5 rounded-full" style={{ background: l.color }} aria-hidden="true" />
                                                                                {l.feature ? l.check.label : "Lot not on the tax map"}
                                                                            </span>
                                                                        </Attr>
                                                                    </dl>
                                                                </div>

                                                                {p.site_inspection?.id && (
                                                                    <ParcelInspectionStatus inspectionId={p.site_inspection.id} onStatusFetched={onInspectionStatus(p.id)} />
                                                                )}

                                                                {editable ? (
                                                                    <div className="space-y-3">
                                                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Evaluation decision</p>
                                                                        <div role="radiogroup" aria-label={`Evaluation decision for ${l.code}`} className="grid grid-cols-3 gap-1 p-1 rounded-full bg-slate-100">
                                                                            {DECISIONS.map((d) => (
                                                                                <label key={d.value} className="relative">
                                                                                    <input
                                                                                        type="radio"
                                                                                        name={`decision-${p.id}`}
                                                                                        value={d.value}
                                                                                        checked={review.decision === d.value}
                                                                                        onChange={() => setReview(p.id, "decision", d.value)}
                                                                                        className="peer sr-only"
                                                                                    />
                                                                                    <span className="flex items-center justify-center gap-1.5 py-1.5 rounded-full text-[11px] font-semibold text-slate-500 cursor-pointer hover:text-slate-800 peer-checked:bg-white peer-checked:text-slate-900 peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-blue-500">
                                                                                        <span className={`w-1.5 h-1.5 rounded-full ${d.dot}`} aria-hidden="true" />
                                                                                        {d.value === "Needs Site Inspection" && DONE_INSPECTION.includes(inspectionStatusOf(p)) ? "Re-inspect" : d.label}
                                                                                    </span>
                                                                                </label>
                                                                            ))}
                                                                        </div>

                                                                        {review.decision === "Declined" && (
                                                                            <div>
                                                                                <label htmlFor={`reason-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                    Reason for declining <span className="text-rose-500">*</span>
                                                                                </label>
                                                                                <textarea
                                                                                    id={`reason-${p.id}`}
                                                                                    rows={2}
                                                                                    value={review.decision_reason}
                                                                                    onChange={(e) => setReview(p.id, "decision_reason", e.target.value)}
                                                                                    placeholder="Regulatory basis for declining this lot…"
                                                                                    className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-xs outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 resize-none"
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {review.decision === "Needs Site Inspection" && (
                                                                            <div className="grid grid-cols-2 gap-2.5">
                                                                                <div className="col-span-2">
                                                                                    <label htmlFor={`inspector-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                        Inspector <span className="text-rose-500">*</span>
                                                                                    </label>
                                                                                    <select
                                                                                        id={`inspector-${p.id}`}
                                                                                        value={review.inspector_id}
                                                                                        onChange={(e) => setReview(p.id, "inspector_id", e.target.value)}
                                                                                        className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-xs bg-white outline-none focus:border-blue-500"
                                                                                    >
                                                                                        <option value="">Choose inspector</option>
                                                                                        {inspectors.map((i) => (
                                                                                            <option key={i.id} value={i.id}>
                                                                                                {i.name}
                                                                                            </option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <label htmlFor={`sched-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                        Inspection date <span className="text-rose-500">*</span>
                                                                                    </label>
                                                                                    <input
                                                                                        id={`sched-${p.id}`}
                                                                                        type="date"
                                                                                        min={today()}
                                                                                        value={review.scheduled_date}
                                                                                        onChange={(e) => setReview(p.id, "scheduled_date", e.target.value)}
                                                                                        className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-xs outline-none focus:border-blue-500"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <label htmlFor={`deadline-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                        Deadline <span className="text-rose-500">*</span>
                                                                                    </label>
                                                                                    <input
                                                                                        id={`deadline-${p.id}`}
                                                                                        type="date"
                                                                                        min={review.scheduled_date || today()}
                                                                                        value={review.deadline_date}
                                                                                        onChange={(e) => setReview(p.id, "deadline_date", e.target.value)}
                                                                                        className="mt-1 w-full rounded-full border border-slate-200 px-4 py-2 text-xs outline-none focus:border-blue-500"
                                                                                    />
                                                                                </div>
                                                                                <div className="col-span-2">
                                                                                    <label htmlFor={`notes-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                        Instructions for the inspector
                                                                                    </label>
                                                                                    <textarea
                                                                                        id={`notes-${p.id}`}
                                                                                        rows={2}
                                                                                        value={review.assigned_notes}
                                                                                        onChange={(e) => setReview(p.id, "assigned_notes", e.target.value)}
                                                                                        placeholder="What to verify on site…"
                                                                                        className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-xs outline-none focus:border-blue-500 resize-none"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        <div>
                                                                            <label htmlFor={`findings-${p.id}`} className="text-xs font-semibold text-slate-700">
                                                                                Evaluation notes (optional)
                                                                            </label>
                                                                            <textarea
                                                                                id={`findings-${p.id}`}
                                                                                rows={2}
                                                                                value={review.findings}
                                                                                onChange={(e) => setReview(p.id, "findings", e.target.value)}
                                                                                placeholder="Findings recorded with the decision…"
                                                                                className="mt-1 w-full rounded-2xl border border-slate-200 px-4 py-2 text-xs outline-none focus:border-blue-500 resize-none"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    latest && (
                                                                        <div className="rounded-lg border border-slate-200 px-3 py-2 text-xs">
                                                                            <p className="font-semibold text-slate-800">
                                                                                {latest.decision}
                                                                                <span className="font-normal text-slate-500">
                                                                                    {" "}
                                                                                    · {dash(latest.reviewed_by_name)} · {fmtDate(latest.reviewed_at)}
                                                                                    {latest.review_round > 1 && ` · round ${latest.review_round}`}
                                                                                </span>
                                                                            </p>
                                                                            {latest.decision_reason && <p className="text-slate-600 mt-0.5">{latest.decision_reason}</p>}
                                                                            {latest.findings && <p className="text-slate-600 mt-0.5">{latest.findings}</p>}
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
                                            <div className="flex items-center justify-end gap-3">
                                                <span className="text-[11px] text-slate-500">
                                                    {lots.length - undecided.length} of {lots.length} decided
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={submitEvaluation}
                                                    disabled={saving || !canSubmitEvaluation}
                                                    className="px-5 py-2 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer disabled:bg-slate-300 disabled:cursor-not-allowed"
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
                                            <p className="text-xs text-slate-500">No recorded activity yet.</p>
                                        ) : (
                                            <ol className="relative border-l border-slate-200 ml-2 space-y-4">
                                                {history.map((h, i) => (
                                                    <li key={i} className="ml-4">
                                                        <span
                                                            className={`absolute -left-[5px] mt-1 w-2.5 h-2.5 rounded-full border-2 border-white ${
                                                                h.kind === "review" ? DECISIONS.find((d) => d.value === h.decision)?.dot || "bg-slate-400" : "bg-slate-400"
                                                            }`}
                                                            aria-hidden="true"
                                                        />
                                                        <p className="text-xs font-semibold text-slate-900 first-letter:uppercase">{h.title}</p>
                                                        <p className="text-[11px] text-slate-500">
                                                            {fmtDate(h.at, true)}
                                                            {h.who && ` · ${h.who}`}
                                                        </p>
                                                        {h.note && <p className="text-[11px] text-slate-600 mt-0.5 whitespace-pre-line">{h.note}</p>}
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
