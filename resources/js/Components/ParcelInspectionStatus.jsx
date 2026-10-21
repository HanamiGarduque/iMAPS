// resources/js/Components/ParcelInspectionStatus.jsx
import React, { useState, useEffect, useRef } from "react";
import { fetchParcelInspection } from "@/utils/supabaseApi";
import downloadPhoto from "./downloadPhoto";

// ── Badge Configuration ──
const STATUS_CONFIG = {
    Pending: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    Ongoing: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    Completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

export const getInspectionStatusLabel = (status) => ({
    assigned: "Pending",
    Pending: "Pending",
    pending: "Pending",
    in_progress: "Ongoing",
    "in-progress": "Ongoing",
    ongoing: "Ongoing",
    completed: "Completed",
    Completed: "Completed",
    submitted: "Completed",
}[status] ?? status);

const RESULT_CONFIG = {
    Compliant: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    "For Review": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    "With Discrepancy": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    "Requires Reinspection": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
};

function StatusBadge({ label, type = "status", compact = false }) {
    if (!label) return null;
    const cfg = type === "status"
        ? STATUS_CONFIG[label] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" }
        : RESULT_CONFIG[label] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };

    return (
        <span className={compact
            ? `inline-flex items-center gap-1.5 h-5 px-2 rounded-full text-[11.5px] font-medium whitespace-nowrap ${cfg.bg} ${cfg.text} border ${cfg.border}`
            : `inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
            {label}
        </span>
    );
}

function SectionLabel({ children }) {
    return <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{children}</p>;
}

// Compact mode's label/value pair, matching the lot record's field style on Applications/Show.
function Field({ label, children }) {
    return (
        <div className="min-w-0">
            <dt className="text-[10.5px] font-medium uppercase tracking-wide text-slate-400">{label}</dt>
            <dd className="mt-0.5 text-[12.5px] text-slate-900 break-words">{children}</dd>
        </div>
    );
}

// The report's result notice (standard alert: coloured rule, tinted field, icon): one tone per inspection result.
const VERDICT_TONE = {
    Compliant: { rule: "border-emerald-700", soft: "bg-emerald-50", ink: "text-emerald-700", path: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" },
    "With Discrepancy": { rule: "border-red-700", soft: "bg-red-50", ink: "text-red-700", path: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" },
    "For Review": { rule: "border-amber-500", soft: "bg-amber-50", ink: "text-amber-700", path: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
    "Requires Reinspection": { rule: "border-orange-600", soft: "bg-orange-50", ink: "text-orange-700", path: "M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" },
    open: { rule: "border-blue-600", soft: "bg-blue-50", ink: "text-blue-600", path: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" },
    neutral: { rule: "border-slate-500", soft: "bg-slate-50", ink: "text-slate-600", path: "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" },
};

// Inline photo viewer (no modal): a sliding track of the photos, arrows over the photo,
// thumbnails below. ← / → step through them while the viewer has focus.
function PhotoViewer({ photos, formatDate, formatTime, className = "" }) {
    const [index, setIndex] = useState(0);
    const count = photos.length;
    const current = Math.min(index, count - 1);
    const photo = photos[current];
    const go = (step) => setIndex((current + step + count) % count);

    const onKey = (e) => {
        if (count < 2) return;
        if (e.key === "ArrowRight") go(1);
        else if (e.key === "ArrowLeft") go(-1);
        else return;
        e.preventDefault();
    };

    const ARROW = "absolute top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/90 text-slate-800 shadow-md shadow-slate-900/20 grid place-items-center hover:bg-white hover:scale-105 active:scale-95 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500";

    return (
        <div className={`focus:outline-none ${className}`} tabIndex={count > 1 ? 0 : undefined} onKeyDown={onKey} aria-roledescription="carousel" aria-label="Field photographs">
            {/* Stage: every photo sits on one track that slides to the current one */}
            <div className="relative aspect-[4/3] max-h-[440px] w-full rounded-lg overflow-hidden bg-slate-900">
                <div
                    className="flex h-full transition-transform duration-500 ease-[cubic-bezier(.22,.8,.24,1)] motion-reduce:transition-none"
                    style={{ transform: `translateX(-${current * 100}%)` }}
                >
                    {photos.map((p, i) => (
                        <div key={p.id} className="w-full h-full shrink-0 grid place-items-center" aria-hidden={i !== current}>
                            <img
                                src={p.signed_url}
                                alt={`Field photograph ${i + 1} of ${count}`}
                                className={`max-w-full max-h-full object-contain transition-[opacity,transform] duration-500 motion-reduce:transition-none ${i === current ? "opacity-100 scale-100" : "opacity-40 scale-[.96]"}`}
                                draggable="false"
                            />
                        </div>
                    ))}
                </div>

                {count > 1 && (
                    <>
                        <button type="button" onClick={() => go(-1)} className={`${ARROW} left-3`} aria-label="Previous photo">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                        <button type="button" onClick={() => go(1)} className={`${ARROW} right-3`} aria-label="Next photo">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                            </svg>
                        </button>
                        <span className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-slate-900/70 text-white text-[11px] font-medium tabular-nums" aria-live="polite">
                            {current + 1} / {count}
                        </span>
                    </>
                )}
            </div>

            <p className="mt-1.5 text-[11.5px] text-slate-500 tabular-nums">
                <span className="font-medium text-slate-700">Photo {current + 1}</span>
                {photo.captured_at && ` · ${formatDate(photo.captured_at)}, ${formatTime(photo.captured_at)}`}
                {" · "}
                <button
                    type="button"
                    onClick={() => downloadPhoto(photo.signed_url, { index: current, capturedAt: photo.captured_at })}
                    className="font-medium text-blue-600 hover:text-blue-700 hover:underline cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                >
                    Download
                </button>
            </p>

            {count > 1 && (
                <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                    {photos.map((p, i) => (
                        <button
                            type="button"
                            key={p.id}
                            onClick={() => setIndex(i)}
                            className={`shrink-0 w-16 h-12 rounded-md overflow-hidden border-2 transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${i === current ? "border-blue-600" : "border-transparent opacity-60 hover:opacity-100"}`}
                            aria-label={`Show photo ${i + 1}`}
                            aria-current={i === current}
                        >
                            <img src={p.signed_url} alt="" className="w-full h-full object-cover" />
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

// The inspector's written sections, most decision-relevant first.
const REPORT_SECTIONS = [
    ["discrepancies", "Discrepancies"],
    ["findings", "Findings"],
    ["observations", "Observations"],
    ["recommendations", "Recommendations"],
    ["inspector_notes", "Inspector notes"],
];

// `report` is the open-on-arrival layout of an application's review desk: a verdict
// band, then the inspector's own words, then the photos, then the reference data.
// It renders the server's copy at once and merges the FieldSync copy when it lands.
// Same data, fetch and callbacks as the full layout.
// `wide` (report only) sets the photos beside the written report on extra-wide screens.
export default function ParcelInspectionStatus({ inspectionId, localInspection = null, localParcel = null, onStatusFetched, onInspectionDataFetched, report = false, wide = false }) {
    const [inspection, setInspection] = useState(localInspection);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(null);
    const onStatusFetchedRef = useRef(onStatusFetched);
    const onInspectionDataFetchedRef = useRef(onInspectionDataFetched);
    const localInspectionRef = useRef(localInspection);

    onStatusFetchedRef.current = onStatusFetched;
    onInspectionDataFetchedRef.current = onInspectionDataFetched;
    localInspectionRef.current = localInspection;

    useEffect(() => {
        const getInspection = async () => {
            setLoading(true);
            setLoadError(null);

            try {
                const remoteInspection = await fetchParcelInspection(inspectionId);
                const local = localInspectionRef.current;
                const data = remoteInspection
                    ? { ...local, ...remoteInspection }
                    : local;
                setInspection(data);

                if (data && onStatusFetchedRef.current) {
                    onStatusFetchedRef.current(data.status);
                }
                if (data && onInspectionDataFetchedRef.current) {
                    onInspectionDataFetchedRef.current(data);
                }
            } catch (error) {
                setLoadError(error.message || 'Inspection evidence is temporarily unavailable.');
            } finally {
                setLoading(false);
            }
        };

        if (inspectionId) {
            getInspection();
        } else {
            setLoading(false);
        }
    }, [inspectionId]);
    
    // The report layout never waits on the sync when the server already sent a copy.
    const showWhileSyncing = report && Boolean(inspection);

    if (loading && !showWhileSyncing) {
        if (report) {
            return (
                <div className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3 animate-pulse" aria-busy="true" aria-label="Loading inspection report">
                    <div className="h-16 rounded-xl bg-slate-100" />
                    <div className="h-3 w-1/3 rounded bg-slate-100" />
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                </div>
            );
        }
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-xl animate-pulse">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <span className="text-[12px] font-bold uppercase tracking-widest text-slate-400">Syncing Field Data...</span>
            </div>
        );
    }

    if (loadError && !showWhileSyncing) {
        return (
            <div className={`${report ? "px-5 py-4 rounded-2xl" : "p-6 rounded-xl"} bg-amber-50 border border-amber-200`}>
                <h4 className="text-[13px] font-bold text-amber-800">Inspection evidence unavailable</h4>
                <p className="text-[12px] text-amber-700 mt-0.5">{loadError}</p>
            </div>
        );
    }

    if (!inspection) {
        return (
            <div className={`${report ? "px-5 py-4 rounded-2xl" : "p-6 rounded-xl"} bg-slate-50 border border-slate-200 flex items-start gap-3`}>
                <svg className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                    <h4 className="text-[13px] font-bold text-slate-700">No Field Inspection Record</h4>
                    <p className="text-[12px] text-slate-500 mt-0.5">This parcel has not been assigned to a site inspector yet, or the data is unavailable.</p>
                </div>
            </div>
        );
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return "—";
        return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' });
    };

    // Prepare text blocks dynamically to only render those with content
    const textBlocks = [
        { label: "Observations", value: inspection.observations },
        { label: "Findings", value: inspection.findings },
        { label: "Discrepancies", value: inspection.discrepancies },
        { label: "Recommendations", value: inspection.recommendations },
        { label: "Inspector Notes", value: inspection.inspector_notes },
    ].filter(block => block.value);

    // The Laravel reader returns only authorized, short-lived signed URLs.
    // Legacy raw photo paths are intentionally not rendered directly.
    const photosToRender = (inspection.field_job_photos || []).filter((photo) => photo.signed_url);

    // Parcel Pin is FieldSync GPS-verification evidence, not the encoded
    // parcel/application location. Both display surfaces use the confirmed
    // pair as soon as it is synced, without waiting for inspection completion.
    const toValidCoordinate = (value, min, max) => {
        if (typeof value !== 'number' && typeof value !== 'string') return null;
        if (typeof value === 'string' && value.trim() === '') return null;
        const n = Number(value);
        return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };

    // Cadastral identity stays separate; a remote fallback must match this parcel.
    const remotePropertyIndexNumber = inspection.supabase_parcels?.local_parcel_id === localParcel?.id
        ? inspection.supabase_parcels?.property_index_number
        : null;
    const displayPropertyIndexNumber = localParcel?.property_index_number || remotePropertyIndexNumber || 'N/A';

    // Neither display may substitute localParcel.latitude/longitude for GPS evidence.
    const confirmedLatitude = toValidCoordinate(inspection?.confirmed_latitude, -90, 90);
    const confirmedLongitude = toValidCoordinate(inspection?.confirmed_longitude, -180, 180);
    const hasConfirmedPoint = confirmedLatitude !== null && confirmedLongitude !== null;
    const displayConfirmedPoint = hasConfirmedPoint
        ? `${confirmedLatitude.toFixed(6)}, ${confirmedLongitude.toFixed(6)}`
        : null;
    const displayParcelPin = displayConfirmedPoint ?? 'N/A';

    const actualPhotoCount = photosToRender.length;

    const complianceValue = inspection.is_compliant !== null ? (
        <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${inspection.is_compliant ? 'text-emerald-600' : 'text-red-600'}`}>
            {inspection.is_compliant ? 'Compliant' : 'Non-Compliant'}
        </span>
    ) : (
        <span className="text-[13px] font-medium text-slate-400">Pending</span>
    );

    if (report) {
        const checklistDone = inspection.checklist_completed_count || 0;
        const checklistTotal = inspection.checklist_total_count || 0;
        const statusLabel = getInspectionStatusLabel(inspection.status);
        const submitted = ["completed", "submitted"].includes(String(inspection.status || "").toLowerCase());
        const result = inspection.inspection_result;
        const tone = !submitted ? VERDICT_TONE.open : VERDICT_TONE[result] || VERDICT_TONE.neutral;
        const compliance = inspection.is_compliant === true ? "Compliant" : inspection.is_compliant === false ? "Non-Compliant" : null;
        const verdict = !submitted
            ? `Inspection ${String(statusLabel || "pending").toLowerCase()}`
            : result || compliance || "Report submitted";
        const byline = submitted
            ? [inspection.inspector?.name && `Inspected by ${inspection.inspector.name}`, inspection.submitted_at && `Submitted ${formatDate(inspection.submitted_at)}`]
            : [inspection.inspector?.name && `Assigned to ${inspection.inspector.name}`, inspection.deadline_date && `Due ${formatDate(inspection.deadline_date)}`];
        // Discrepancies and findings carry the decision; the rest is supporting detail, set in a ruled table.
        const sections = REPORT_SECTIONS.map(([key, label]) => ({ key, label, value: inspection[key] })).filter((s) => s.value);
        const primary = sections.filter((s) => s.key === "discrepancies" || s.key === "findings");
        const secondary = sections.filter((s) => !primary.includes(s));
        const checks = [
            checklistTotal ? `Checklist ${checklistDone} of ${checklistTotal} completed` : "No checklist recorded",
            `${actualPhotoCount} field photograph${actualPhotoCount === 1 ? "" : "s"}`,
            displayConfirmedPoint ? "GPS location confirmed" : "GPS location not captured",
        ];

        // Not submitted yet: only who, when and what has come in so far. Findings, the PIN
        // and the reference bar wait for the report.
        if (!submitted && sections.length === 0) {
            // Calendar days, from local YYYY-MM-DD strings, so time zones never shift a day.
            const day = (v) => {
                const s = String(v || "").split("T")[0];
                return /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 864e5 : null;
            };
            const todayDay = day(new Date().toLocaleDateString("en-CA"));
            const dueDay = day(inspection.deadline_date);
            const daysLeft = dueDay !== null ? dueDay - todayDay : null;
            const overdue = daysLeft !== null && daysLeft < 0;
            const started = statusLabel === "Ongoing";
            const countdown =
                daysLeft === null ? null
                : overdue ? `${-daysLeft} day${daysLeft === -1 ? "" : "s"} overdue`
                : daysLeft === 0 ? "Due today"
                : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`;
            // What the inspector has synced so far; shown only once something has come in
            const fieldData = [
                ["Checklist", checklistTotal ? `${checklistDone} of ${checklistTotal}` : null, checklistDone > 0],
                ["Photos", actualPhotoCount ? String(actualPhotoCount) : null, actualPhotoCount > 0],
                ["GPS point", displayConfirmedPoint ? "Captured" : null, !!displayConfirmedPoint],
            ];
            const anyFieldData = fieldData.some(([, , done]) => done);

            return (
                // An empty report slot: dashed outline and a document icon say "the report goes here, not in yet".
                <article className="rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 overflow-hidden" aria-label="Site inspection report, not submitted yet">
                    <div className="px-6 pt-7 pb-6 flex flex-col items-center text-center">
                        <span className="relative w-12 h-12 rounded-xl bg-white border border-slate-200 shadow-sm grid place-items-center text-slate-500" aria-hidden="true">
                            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            {/* Clock badge: it's on its way */}
                            <span className={`absolute -right-1.5 -bottom-1.5 w-5 h-5 rounded-full grid place-items-center text-white ring-2 ring-slate-50 ${overdue ? "bg-rose-600" : "bg-blue-600"}`}>
                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l4 2" />
                                </svg>
                            </span>
                        </span>

                        <h3 className="mt-3.5 text-[15px] font-semibold tracking-tight text-slate-900">Site inspection report not submitted yet</h3>
                        {/* Only the assignment is known for sure, not whether the inspector is on site */}
                        <p className="mt-0.5 text-[12px] text-slate-500 [text-wrap:balance]">Findings, photos and the GPS point will appear here once submitted.</p>

                        {/* Who and when in one bar: the inspector leads, labelled by role like the dates beside it */}
                        {(inspection.inspector?.name || inspection.scheduled_date || inspection.deadline_date) && (
                            <div className="mt-4 inline-flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 px-4 py-2 rounded-full bg-white border border-slate-200 text-[12px] text-slate-600 tabular-nums">
                                {inspection.inspector?.name && (
                                    <>
                                        <span>Site inspector <span className="font-semibold text-slate-900">{inspection.inspector.name}</span></span>
                                        <span className="w-px h-3.5 bg-slate-200" aria-hidden="true" />
                                    </>
                                )}
                                {inspection.scheduled_date && <span>Scheduled <span className="font-medium text-slate-800">{formatDate(inspection.scheduled_date)}</span></span>}
                                {inspection.deadline_date && <span>Due <span className={`font-medium ${overdue ? "text-rose-700" : "text-slate-800"}`}>{formatDate(inspection.deadline_date)}</span></span>}
                                {countdown && (
                                    <span className={`font-semibold ${overdue ? "text-rose-700" : daysLeft <= 2 ? "text-amber-700" : "text-blue-700"}`}>{countdown}</span>
                                )}
                            </div>
                        )}

                        {/* What the inspector has synced so far, once anything has come in */}
                        {anyFieldData && (
                            <ul className="mt-3 flex flex-wrap justify-center gap-1.5 text-[11.5px]">
                                {fieldData.map(([label, value, done]) => (
                                    <li key={label} className={`px-2.5 py-1 rounded-full ${done ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-500"}`}>
                                        {label}: {value || "not yet"}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    {loadError && (
                        <p className="px-5 pb-2 text-[11.5px] text-amber-700" role="status">{`${loadError} Showing the copy saved in iMAPS.`}</p>
                    )}

                    {photosToRender.length > 0 && (
                        <PhotoViewer photos={photosToRender} formatDate={formatDate} formatTime={formatTime} className="px-5 pb-4" />
                    )}
                </article>
            );
        }

        return (
            <article className="rounded-lg border border-slate-200 bg-white overflow-hidden" aria-label="Site inspection report">
                {/* Document title bar */}
                <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 px-5 py-2 border-b border-slate-200 bg-slate-50">
                    <h3 className="text-[10.5px] font-semibold text-slate-500 uppercase tracking-wide">Site inspection report</h3>
                    <p className="text-[11.5px] text-slate-600">{byline.filter(Boolean).join(" · ")}</p>
                </header>

                {/* Result: the inspector's conclusion, as a standard notice */}
                <div className={`mx-5 mt-2.5 border-l-[5px] ${tone.rule} ${tone.soft} px-3.5 py-2 flex items-start gap-2.5`}>
                    <svg className={`w-5 h-5 mt-px shrink-0 ${tone.ink}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d={tone.path} />
                    </svg>
                    <div className="min-w-0">
                        <p className="text-[14px] font-semibold leading-snug text-slate-900">
                            {submitted ? "Result: " : ""}
                            {verdict}
                            {submitted && result && compliance && <span className="font-semibold text-slate-700"> — {compliance}</span>}
                        </p>
                        <p className="text-[12px] text-slate-700">{checks.join(" · ")}</p>
                    </div>
                </div>

                {(loading || loadError) && (
                    <p className={`mx-5 mt-1.5 flex items-center gap-2 text-[11.5px] ${loadError ? "text-amber-700" : "text-slate-500"}`} role="status">
                        {loading ? (
                            <>
                                <span className="w-3 h-3 border-[1.5px] border-slate-200 border-t-blue-600 rounded-full animate-spin" aria-hidden="true" />
                                Syncing the latest field data…
                            </>
                        ) : (
                            `${loadError} Showing the copy saved in iMAPS.`
                        )}
                    </p>
                )}

                <div className={wide && photosToRender.length > 0 ? "xl:grid xl:grid-cols-[minmax(0,1fr)_340px]" : ""}>
                {/* The inspector's own words: the decisive sections at reading size, the rest in a ruled table */}
                {sections.length > 0 ? (
                    <div className="px-5 pt-2 pb-2.5 space-y-2">
                        {/* Red stays with the result notice; Discrepancies carries the one marker, a rule beside its text */}
                        {primary.map((s) => {
                            const alert = s.key === "discrepancies";
                            return (
                                <section key={s.key} className={alert ? "border-l-2 border-red-600 pl-2.5" : ""}>
                                    <h4 className="text-[12.5px] font-semibold text-slate-900">{s.label}</h4>
                                    <p className="mt-0.5 text-[13.5px] leading-snug text-slate-900 whitespace-pre-wrap break-words">{s.value}</p>
                                </section>
                            );
                        })}
                        {secondary.length > 0 && (
                            <table className="w-full border border-slate-200 text-[12.5px]">
                                <tbody>
                                    {secondary.map((s) => (
                                        <tr key={s.key} className="border-t border-slate-200 first:border-t-0 align-top">
                                            <th scope="row" className="w-[140px] bg-slate-50 px-2.5 py-1 text-left text-[11.5px] font-semibold text-slate-600">{s.label}</th>
                                            <td className="px-2.5 py-1 leading-snug text-slate-700 whitespace-pre-wrap break-words">{s.value}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                ) : (
                    <p className="px-5 py-3 text-[12.5px] text-slate-600">
                        {submitted ? "The inspector submitted this report without written findings." : "The inspector's findings will appear here once the report is submitted."}
                    </p>
                )}

                {photosToRender.length > 0 && (
                    <section className={`px-5 pb-3 ${wide ? "xl:pl-0 xl:pt-2.5" : ""}`}>
                        <h4 className="text-[11.5px] font-semibold text-slate-600">Annex · Field photographs ({actualPhotoCount})</h4>
                        <PhotoViewer photos={photosToRender} formatDate={formatDate} formatTime={formatTime} className="mt-1.5" />
                    </section>
                )}
                </div>

                {/* Reference data on one line: schedule, identifiers and the FieldSync GPS point (never the encoded parcel location) */}
                <dl className="border-t border-slate-200 bg-slate-50 px-5 py-1 flex flex-wrap gap-x-6 gap-y-1 text-[11.5px]">
                    {[
                        ["Scheduled", formatDate(inspection.scheduled_date)],
                        ["Deadline", formatDate(inspection.deadline_date)],
                        ["Property index no.", <span className="tabular-nums">{displayPropertyIndexNumber}</span>],
                        [
                            "GPS point",
                            displayConfirmedPoint ? (
                                <span className="tabular-nums">{displayConfirmedPoint}</span>
                            ) : (
                                <span
                                    className="text-slate-500"
                                    title="Parcel Pin becomes available once FieldSync GPS verification is captured and synced; the inspection does not need to be completed first. The encoded parcel/application location is separate."
                                >
                                    Not captured yet
                                </span>
                            ),
                        ],
                    ].map(([label, value]) => (
                        <div key={label} className="flex items-baseline gap-1.5 min-w-0">
                            <dt className="font-semibold text-slate-600">{label}:</dt>
                            <dd className="text-slate-800 truncate">{value}</dd>
                        </div>
                    ))}
                </dl>
            </article>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            {/* Header Section */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-[14px] font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Site Inspection Report
                    </h3>
                    <div className="h-4 w-px bg-slate-300 hidden sm:block" />
                    <StatusBadge label={getInspectionStatusLabel(inspection.status)} type="status" />
                    {inspection.inspection_result && <StatusBadge label={inspection.inspection_result} type="result" />}
                </div>
                
                {inspection.submitted_at && (
                    <div className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Submitted: {formatDate(inspection.submitted_at)}
                    </div>
                )}
            </div>

            <div className="p-5 space-y-6">
                {/* Admin/PO audit: the detail page previously showed only a raw
                    inspector_id, so a Planning Officer could not tell who was
                    assigned. The controller now eager-loads the EXISTING
                    `siteInspection.inspector` users relation, so the name is
                    simply displayed here — it is never duplicated into another
                    database column, and this stays read-only. */}
                {inspection.inspector?.name && (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-6 -mt-1">
                        <div>
                            <SectionLabel>Assigned Inspector</SectionLabel>
                            <p className="text-[13px] font-bold text-slate-800">
                                {inspection.inspector.name}
                            </p>
                        </div>
                    </div>
                )}

                {/* Meta Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
                    <div>
                        <SectionLabel>Scheduled Date</SectionLabel>
                        <p className="text-[13px] font-semibold text-slate-800">{formatDate(inspection.scheduled_date)}</p>
                    </div>
                    <div>
                        <SectionLabel>Deadline</SectionLabel>
                        <p className="text-[13px] font-semibold text-slate-800">{formatDate(inspection.deadline_date)}</p>
                    </div>
                    <div>
                        <SectionLabel>Parcel PIN</SectionLabel>
                        {/* Captured and synced GPS evidence, independent of completion status. */}
                        <p className="text-[12px] font-mono font-medium text-slate-700 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-200">
                            {displayParcelPin}
                        </p>
                    </div>
                    <div>
                        <SectionLabel>Property Index No.</SectionLabel>
                        <p className="text-[12px] font-mono font-medium text-slate-700 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-200">
                            {displayPropertyIndexNumber}
                        </p>
                    </div>
                    <div>
                        <SectionLabel>Compliance Status</SectionLabel>
                        {inspection.is_compliant !== null ? (
                            <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${inspection.is_compliant ? 'text-emerald-600' : 'text-red-600'}`}>
                                {inspection.is_compliant ? 'Compliant' : 'Non-Compliant'}
                            </span>
                        ) : (
                            <span className="text-[13px] font-medium text-slate-400">Pending</span>
                        )}
                    </div>
                </div>

                {/* Same FieldSync evidence as Parcel Pin; never the encoded parcel location. */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3.5 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <SectionLabel>Confirmed Inspection Point (FieldSync)</SectionLabel>
                        {displayConfirmedPoint ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
                                GPS confirmed
                            </span>
                        ) : null}
                    </div>

                    {displayConfirmedPoint ? (
                        <p className="text-[12px] font-mono font-medium text-slate-700 mt-0.5">
                            {displayConfirmedPoint}
                        </p>
                    ) : (
                        <p className="text-[12px] text-slate-500 mt-0.5">
                            Not yet captured. Parcel Pin becomes available once
                            FieldSync GPS verification is captured and synced; the
                            inspection does not need to be completed first. The
                            encoded parcel/application location is separate.
                        </p>
                    )}
                </div>

                {/* Progress & Media Metrics */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                    <div className="flex-1 flex items-center gap-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Checklist Progress</p>
                            <p className="text-[13px] font-black text-slate-800">
                                {inspection.checklist_completed_count || 0} / {inspection.checklist_total_count || 0} <span className="font-medium text-slate-500 text-[11px]">Completed</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center gap-3 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Field Evidence</p>
                            <p className="text-[13px] font-black text-slate-800">
                                {actualPhotoCount} <span className="font-medium text-slate-500 text-[11px]">Photos Uploaded</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Detailed Text Blocks */}
                {textBlocks.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        {textBlocks.map((block, idx) => (
                            <div key={idx}>
                                <SectionLabel>{block.label}</SectionLabel>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                                    {block.value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Field Photos Grid */}
                {photosToRender.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                        <SectionLabel>Attached Field Photos</SectionLabel>
                        <PhotoViewer photos={photosToRender} formatDate={formatDate} formatTime={formatTime} className="mt-2 max-w-[640px]" />
                    </div>
                )}
            </div>
        </div>
    );
}
