// resources/js/Pages/Site Inspections/Show.jsx
import React, { useState, useEffect } from "react";
import { Link, Head, router, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import Modal from "@/Components/Modal";
import { resolveBackTarget, readRegistryQuery } from "@/Components/folderOrigin";
import PhotoLightbox from "@/Components/PhotoLightbox";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import MapSkeleton from "@/Components/Dashboard/MapSkeleton";
import { confirmSignOut } from "@/utils/signOut";

// ── Status Badge Configuration ──
const STATUS_LABELS = {
    assigned:      "Assigned",
    in_progress:   "In Progress",
    completed:     "Completed",
};

const formatStatus = (status) => {
    const key = (status || "").toLowerCase().replace(/-/g, "_");
    return STATUS_LABELS[key] || status || "Unknown";
};

const STATUS_CONFIG = {
    assigned:       { bg: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
    in_progress:    { bg: "bg-blue-50 text-blue-700 border-blue-200/70", dot: "bg-blue-500" },
    completed:      { bg: "bg-emerald-50 text-emerald-700 border-emerald-200/70", dot: "bg-emerald-500" },
};

function StatusBadge({ status }) {
    const key = (status || "").toLowerCase().replace(/-/g, "_");
    const cfg = STATUS_CONFIG[key] || { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {formatStatus(status)}
        </span>
    );
}

// ── GeoJSON Sanitizer Utility ──
const hasValidCoords = (coords) => {
    if (!coords) return false;
    if (Array.isArray(coords)) {
        if (coords.length === 2 && typeof coords[0] === "number") {
            return !isNaN(coords[0]) && !isNaN(coords[1]);
        }
        return coords.length > 0 && coords.every(hasValidCoords);
    }
    return false;
};

const sanitizeGeoJSON = (geojson) => {
    if (!geojson || !geojson.features) return geojson;
    const validFeatures = geojson.features.filter((feature) => {
        try {
            if (!feature.geometry || !hasValidCoords(feature.geometry.coordinates)) {
                return false;
            }
            const layer = L.geoJSON(feature);
            const bounds = layer.getBounds();
            const sw = bounds?.getSouthWest();
            const ne = bounds?.getNorthEast();

            return sw && ne && !isNaN(sw.lat) && !isNaN(sw.lng) && !isNaN(ne.lat) && !isNaN(ne.lng);
        } catch (e) {
            return false;
        }
    });
    return { ...geojson, features: validFeatures };
};

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();

    useEffect(() => {
        try {
            if (activeParcelFeature) {
                const layer = L.geoJSON(activeParcelFeature);
                const bounds = layer.getBounds();
                if (bounds.isValid()) {
                    map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 18, duration: 1.2 });
                    map.once("moveend", () => {
                        map.dragging.disable();
                        map.touchZoom.disable();
                        map.doubleClickZoom.disable();
                        map.scrollWheelZoom.disable();
                        map.boxZoom.disable();
                        map.keyboard.disable();
                        if (map.tap) map.tap.disable();
                    });
                }
            } else if (brgyData) {
                const layer = L.geoJSON(brgyData);
                const bounds = layer.getBounds();
                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }
        } catch (error) {}
    }, [brgyData, activeParcelFeature, map]);

    return null;
}

// ── Sync outcome tone ──
/**
 * Pick the banner tone for a scoped-sync outcome message.
 *
 * The controller reports every completed run through the SUCCESS flash key,
 * because the ACTION succeeded. That is not the same as the DATA changing:
 * "no completed FieldSync result available" and "already up to date" both mean
 * nothing was imported, and showing those in a green success banner would
 * claim a change that did not happen.
 *
 * Classified on the message the server sent, so this stays in step with
 * describeSyncOutcome() instead of restating the outcome vocabulary here.
 */
function outcomeTone(message) {
    const m = String(message || "").toLowerCase();
    if (m.includes("could not") || m.includes("failed")) return "error";
    if (
        m.includes("nothing was changed") ||
        m.includes("no local change") ||
        m.includes("no change was confirmed") ||
        m.includes("could not be interpreted")
    ) {
        return "info";
    }
    return "ok";
}

// ── Info Row Helper ──
function InfoRow({ label, value, mono = false }) {
    return (
        <div>
            <dt className="text-[11px] text-slate-500">{label}</dt>
            <dd className={`mt-0.5 text-[13px] font-medium text-slate-900 ${mono ? "font-mono text-[12px]" : ""}`}>{value || "—"}</dd>
        </div>
    );
}

// ── Section heading used by every block in the scroll region ──
function SectionTitle({ children, aside = null }) {
    return (
        <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{children}</h3>
            {aside}
        </div>
    );
}

// ── Main Page Component ──
export default function Show({ auth, inspection, applicationSupport = null }) {
    const ins = inspection || {};
    const app = ins.zoning_application || {};
    const inspector = ins.inspector || {};
    const parcel = ins.parcel || {};

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    // PHASE 2B2B: round identity comes from the server, which resolves it as one
    // PARCEL's visit sequence via InspectionRoundNumbering. This page computes
    // NOTHING about the round. `round_number` is null for a historical row whose
    // parcel was never recorded: no round is displayed, and the record says so.
    const roundNumber = ins.round_number ?? null;
    const roundLabel = ins.round_kind || "Inspection";
    const roundNote = ins.round_note || null;
    const isHistoricalRound = roundNumber === null && roundLabel === "Historical Inspection";

    // PHASE 2B2C: server-resolved Planning Officer review visibility for THIS
    // round. Read, never derived here.
    const review = usePage().props?.poReview || null;

    // PHASE 2B2D: read-only operations context, all server-resolved.
    //   delivery     - canonical delivery condition + attempt evidence
    //   roundHistory - THIS parcel's canonical chain, navigable
    // The global diagnostics count the server may still send is deliberately
    // NOT read: it has no application-specific meaning on one lot's record.
    const { delivery = null, roundHistory = null } = usePage().props || {};

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");

    // Where this round was opened from, taken from the query string rather than
    // inferred from browser history, so a refresh or a pasted link behaves the
    // same as a click. A folder origin returns to THAT applicant folder; no origin
    // falls back to the registry root and invents nothing.
    const registryQuery = readRegistryQuery(usePage().url || "");
    const backTarget = resolveBackTarget({
        search: usePage().url || "",
        registryPath: "/site-inspections",
        rootLabel: "All Inspections",
        // Opened from the list view: return to the list with its filters intact.
        origins: {
            list: {
                path: registryQuery ? `/site-inspections?${registryQuery}` : "/site-inspections",
                label: "All Inspections",
            },
        },
        // Restore the registry filters and page, minus the origin markers.
        registryQuery,
    });
    const [activeTab, setActiveTab] = useState("inspection");

    // Geospatial state. The map exists to locate THIS parcel, so nothing is
    // loaded for a round with no parcel on record.
    const targetPin = parcel?.property_index_number?.trim() || "";
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const rosarioCenter = [13.7850, 121.2500];

    useEffect(() => {
        if (!targetPin) return;

        fetch("/api/map/barangay_boundary")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(sanitizeGeoJSON(data)))
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
    }, [targetPin]);

    useEffect(() => {
        if (targetPin && pinLookupMap[targetPin]) {
            setActiveParcelFeature(pinLookupMap[targetPin]);
        } else {
            setActiveParcelFeature(null);
        }
    }, [pinLookupMap, targetPin]);

    const mapLoading = Boolean(targetPin) && (!parcelMapData || !brgyMapData);
    const parcelNotOnMap = Boolean(targetPin) && Boolean(parcelMapData) && !activeParcelFeature;

    const [inspectionPhotos, setInspectionPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Scoped sync confirmation + outcome feedback. The confirmation is the
    // shared in-app Modal, not window.confirm(): the native dialog cannot show
    // the note about what this action does and does not do.
    const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

    // Outcome banner state. `info` is the neutral tone: NO_REMOTE_RESULT and
    // NO_CHANGE mean "nothing was changed", which is not a success.
    const [syncOutcome, setSyncOutcome] = useState(null);

    // Full-size viewer state, plus per-thumbnail load failures so a dead image
    // reports itself instead of rendering as a browser broken-image icon.
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [brokenPhotos, setBrokenPhotos] = useState({});
    const markPhotoBroken = (idx) => setBrokenPhotos((prev) => ({ ...prev, [idx]: true }));

    useEffect(() => {
        if (!ins.id) return;
        setLoadingPhotos(true);
        fetch(`/api/inspections/${ins.id}/supabase-data`)
            .then((res) => {
                if (!res.ok) throw new Error("Failed to fetch");
                return res.json();
            })
            .then((data) => {
                if (data && data.field_job_photos) {
                    setInspectionPhotos(data.field_job_photos);
                } else {
                    setInspectionPhotos([]);
                }
                setBrokenPhotos({});
            })
            .catch((err) => {
                console.error("Failed to fetch inspection photos:", err);
                setInspectionPhotos([]);
            })
            .finally(() => setLoadingPhotos(false));
    }, [ins.id]);

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " · " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const handleLogout = confirmSignOut;

    /**
     * Issue the scoped sync and surface the outcome.
     *
     * Every completion path must leave the Admin with a visible answer. The
     * outcome is read from the flash the controller already sets, so the server
     * stays the single source of truth for the wording. `onFinish` clears the
     * busy state on success AND on failure; `onError` covers a refusal or a
     * network failure, where no flash exists at all.
     */
    const runScopedSync = () => {
        setSyncConfirmOpen(false);
        setSyncing(true);
        setSyncOutcome(null);

        router.post(`/site-inspections/${ins.id}/sync-from-fieldsync`, {}, {
            preserveScroll: true,
            onSuccess: (page) => {
                const f = page?.props?.flash;
                const message = f?.error || f?.success;
                if (message) {
                    // The controller reports "nothing was changed" through the
                    // SUCCESS key, because the action completed correctly. The
                    // wording still has to read as neutral, not as a win.
                    setSyncOutcome({
                        tone: f?.error ? "error" : outcomeTone(message),
                        message,
                    });
                } else {
                    // Completed, but the server sent no outcome at all. That is
                    // not a success and must not be presented as one.
                    setSyncOutcome({
                        tone: "warn",
                        message:
                            "Sync ran but no outcome was reported. Nothing was changed.",
                    });
                }
            },
            onError: () => {
                setSyncOutcome({
                    tone: "error",
                    message:
                        "Sync from FieldSync could not be completed. Nothing was changed.",
                });
            },
            onFinish: () => setSyncing(false),
        });
    };

    const formatDate = (d) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    };

    const brgyStyle = {
        color: "#2563eb",
        weight: 1.5,
        opacity: 0.6,
        fillOpacity: 0.03,
        fillColor: "#3b82f6",
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties?.property_index_number === feature.properties?.property_index_number;
        return {
            color: isActive ? "#dc2626" : "#94a3b8",
            weight: isActive ? 2.5 : 0.8,
            opacity: isActive ? 1 : 0.7,
            fillOpacity: isActive ? 0.35 : 0.04,
            fillColor: isActive ? "#ef4444" : "#64748b",
        };
    };

    // ── Lifecycle of this round, from recorded facts only ──
    // Each step reads one stored field or the canonical delivery state. A step
    // with no evidence is shown as not reached; nothing is inferred.
    const isCompleted = (ins.status || "").toLowerCase() === "completed";
    const deliveryStep = !delivery
        ? { state: "todo", sub: "No delivery data" }
        : delivery.is_failure
          ? { state: "error", sub: delivery.label }
          : delivery.state === "delivered"
            ? { state: "done", sub: delivery.delivered_at || delivery.label }
            : delivery.state === "pending_delivery"
              ? { state: "current", sub: delivery.label }
              : { state: "todo", sub: delivery.label };
    const steps = [
        { label: "Assigned", state: "done", sub: ins.scheduled_date ? `Scheduled ${formatDate(ins.scheduled_date)}` : "No schedule set" },
        { label: "Sent to FieldSync", ...deliveryStep },
        { label: "Report submitted", state: ins.submitted_at ? "done" : "todo", sub: ins.submitted_at ? formatDate(ins.submitted_at) : "Not yet" },
        { label: "Completed", state: isCompleted || ins.completed_at ? "done" : "todo", sub: ins.completed_at ? formatDate(ins.completed_at) : isCompleted ? "Completed" : "Not yet" },
    ];

    const hasFindings = Boolean(
        ins.findings || ins.recommendation || ins.remarks || ins.inspection_result || ins.observations ||
        ins.discrepancies || ins.recommendations || ins.inspector_notes
    );

    const TABS = [
        { key: "inspection", label: "Overview" },
        { key: "photos", label: "Photos", count: loadingPhotos ? null : inspectionPhotos.length },
        { key: "parcel", label: "Parcel" },
        { key: "application", label: "Application" },
    ];

    const inspectorInitials = String(inspector.name || "")
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((part, i, all) => (i === 0 || i === all.length - 1 ? part[0] : ""))
        .join("")
        .toUpperCase();

    return (
        <>
            <Head title={`Inspection: ${ins.id || "Detail"} | iMAPS`} />
            <style>{`

                #dashboard-root {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
                .leaflet-container { width: 100%; height: 100%; z-index: 0; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── UNIFIED NAVBAR ── */}
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="site-inspections"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-950/20 backdrop-blur-[1px] z-[750] transition-opacity duration-300"
                        />
                    )}

                    {/* ── SUB-NAVBAR ── */}
                    <div className="h-12 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center gap-3 shrink-0 z-10">
                        {/* The back control returns to the list view or the applicant
                            folder this round was opened from, and says so. With no
                            origin in the URL it falls back to the registry root. */}
                        <Link
                            href={backTarget.href}
                            className="inline-flex items-center gap-1.5 h-8 px-2.5 -ml-2.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 text-[13px] font-medium transition-colors group cursor-pointer shrink-0"
                            title={
                                backTarget.folder
                                    ? `Return to the ${backTarget.folder} folder`
                                    : "Return to All Inspections"
                            }
                        >
                            <svg className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                            </svg>
                            <span className="max-w-[190px] truncate">{backTarget.label}</span>
                        </Link>
                        <span className="text-slate-300" aria-hidden="true">/</span>
                        {/* Identity is the APPLICATION reference, which is what an
                            officer recognises; the round gives the inspection context,
                            and the INS id stays a quiet secondary key. */}
                        <div className="flex items-center gap-2.5 min-w-0">
                            {app.reference_number ? (
                                <span className="font-mono text-[12px] font-semibold text-slate-800">
                                    {app.reference_number}
                                </span>
                            ) : (
                                <span className="font-mono text-[12px] font-semibold text-slate-600">
                                    Application #{ins.zoning_application_id}
                                </span>
                            )}
                            {/* `whitespace-nowrap` is load-bearing: without it the space
                                in "Historical Inspection" is consumed as a line break and
                                reads as "HistoricalInspection". */}
                            <span className="hidden sm:inline text-[13px] text-slate-500 whitespace-nowrap">
                                {/* No fabricated "Round N" for a historical row:
                                    it is labelled and explained instead. */}
                                {roundNumber
                                    ? `Round ${roundNumber} · ${roundLabel}`
                                    : isHistoricalRound
                                      ? `${roundLabel} · ${roundNote || "Parcel not recorded"}`
                                      : roundLabel}
                            </span>
                            <span
                                className="hidden md:inline text-[11px] font-mono text-slate-400"
                                title="Internal inspection record id"
                            >
                                INS-{ins.id || "—"}
                            </span>
                        </div>
                    </div>

                    {/* ── THE INSPECTION CASE FILE ── */}
                    <main id="inspection-record" className="flex-1 w-full flex flex-col relative overflow-hidden min-h-0">
                        {/* Case header: who, what, where it stands - kept to two slim rows */}
                        <div className="bg-white border-b border-slate-200 shrink-0">
                            <div className="max-w-[1440px] mx-auto w-full px-5 sm:px-6 pt-3">
                                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                                    <div className="min-w-0 flex items-center gap-2.5 flex-wrap">
                                        <h1 className="text-[17px] font-bold text-slate-900 tracking-tight truncate">{app.applicant_name || "—"}</h1>
                                        <StatusBadge status={ins.status} />
                                        <span className="text-[13px] text-slate-500 truncate">
                                            {[app.application_type, app.barangay && `Brgy. ${app.barangay}`].filter(Boolean).join(" · ")}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="w-7 h-7 rounded-full bg-blue-50 text-blue-700 ring-1 ring-blue-100 text-[11px] font-bold flex items-center justify-center" aria-hidden="true">
                                            {inspectorInitials || "?"}
                                        </span>
                                        <p className="text-[13px] text-slate-500">
                                            Inspector <span className="font-semibold text-slate-900">{inspector.name || "Unassigned"}</span>
                                        </p>
                                    </div>
                                </div>

                                {/* Progress of this round, from recorded facts only. One line. */}
                                <ol className="mt-2.5 mb-1 flex flex-wrap items-center gap-x-2 gap-y-1.5" aria-label="Inspection progress">
                                    {steps.map((step, idx) => (
                                        <li key={step.label} className="flex items-center gap-2 min-w-0" aria-current={step.state === "current" ? "step" : undefined}>
                                            <span
                                                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                                                    step.state === "done"
                                                        ? "bg-blue-600 text-white"
                                                        : step.state === "error"
                                                          ? "bg-rose-500 text-white"
                                                          : step.state === "current"
                                                            ? "bg-white border-2 border-blue-600"
                                                            : "bg-white border-2 border-slate-300"
                                                }`}
                                                aria-hidden="true"
                                            >
                                                {step.state === "done" && (
                                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                                )}
                                                {step.state === "error" && (
                                                    <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                )}
                                            </span>
                                            <span className="text-[12px] whitespace-nowrap">
                                                <span className={`font-semibold ${step.state === "error" ? "text-rose-700" : step.state === "todo" ? "text-slate-400" : "text-slate-800"}`}>{step.label}</span>
                                                <span className={step.state === "error" ? "text-rose-600" : "text-slate-400"}> · {step.sub}</span>
                                            </span>
                                            {idx < steps.length - 1 && (
                                                <span className={`hidden md:block w-8 h-px ${step.state === "done" ? "bg-blue-600" : "bg-slate-300"}`} aria-hidden="true" />
                                            )}
                                        </li>
                                    ))}
                                </ol>
                            </div>

                            {/* ── Tab Bar ── */}
                            <div className="max-w-[1440px] mx-auto w-full px-5 pt-2 flex gap-1 shrink-0" role="tablist" aria-label="Inspection record">
                                {TABS.map((tab) => {
                                    const isActive = activeTab === tab.key;
                                    return (
                                        <button
                                            key={tab.key}
                                            type="button"
                                            role="tab"
                                            aria-selected={isActive}
                                            onClick={() => setActiveTab(tab.key)}
                                            className={`-mb-px inline-flex items-center gap-1.5 px-2.5 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-t ${
                                                isActive
                                                    ? "border-blue-600 text-blue-700"
                                                    : "border-transparent text-slate-500 hover:text-slate-800"
                                            }`}
                                        >
                                            {tab.label}
                                            {tab.count != null && (
                                                <span className={`text-[11px] font-semibold tabular-nums px-1.5 rounded-full ${isActive ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"}`}>
                                                    {tab.count}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* ── The ONE scroll owner of the case file ──
                            Everything below scrolls together, so no section can be
                            clipped. Nothing in here may carry shrink-0. */}
                        <div className="flex-1 min-h-0 overflow-y-auto relative">
                            <div className="max-w-[1440px] mx-auto w-full grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 lg:p-5">
                                {/* ── PRIMARY RECORD: the reason this page exists ── */}
                                <div className="min-w-0 w-full max-w-2xl mx-auto p-5 lg:max-w-none lg:p-0">

                                    {/* ── Overview Tab ── */}
                                    {activeTab === "inspection" && (
                                        <div className="space-y-4">
                                            {/* The inspector's report */}
                                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                <SectionTitle
                                                    aside={ins.is_compliant != null && (
                                                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${ins.is_compliant ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-rose-50 text-rose-700 border-rose-200"}`}>
                                                            {ins.is_compliant ? "Compliant" : "Not compliant"}
                                                        </span>
                                                    )}
                                                >
                                                    Inspection report
                                                </SectionTitle>

                                                {hasFindings ? (
                                                    <div className="divide-y divide-slate-100">
                                                        {[
                                                            ["Inspection Result", ins.inspection_result, false],
                                                            ["Findings", ins.findings, false],
                                                            ["Observations", ins.observations, false],
                                                            ["Discrepancies", ins.discrepancies, true],
                                                            ["Recommendation", ins.recommendation, false],
                                                            ["Recommendations", ins.recommendations, false],
                                                            ["Remarks", ins.remarks, false],
                                                            ["Inspector Notes", ins.inspector_notes, false],
                                                        ].filter(([, value]) => value).map(([label, value, alert]) => (
                                                            <div key={label} className="py-3 first:pt-0 last:pb-0">
                                                                <p className={`text-[12px] font-medium ${alert ? "text-rose-700" : "text-slate-500"}`}>{label}</p>
                                                                <p className={`mt-0.5 text-[14px] leading-relaxed whitespace-pre-line ${alert ? "text-rose-900" : "text-slate-800"}`}>{value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <div className="flex items-start gap-3 rounded-lg bg-slate-50 px-3.5 py-3">
                                                        <span className="w-9 h-9 rounded-lg bg-white border border-slate-200 text-slate-400 flex items-center justify-center" aria-hidden="true">
                                                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.6"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                                        </span>
                                                        <div>
                                                            <p className="text-[13px] font-semibold text-slate-800">No inspection report yet</p>
                                                            <p className="text-[13px] text-slate-500 mt-0.5 leading-relaxed">
                                                                Findings, photos and GPS confirmation appear here once the inspector submits the report from FieldSync.
                                                            </p>
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="grid gap-4 xl:grid-cols-2">
                                            {/* Schedule */}
                                            <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                <SectionTitle>Schedule</SectionTitle>
                                                <dl className="grid grid-cols-3 gap-y-3 gap-x-4">
                                                    <InfoRow label="Scheduled" value={ins.scheduled_date ? formatDate(ins.scheduled_date) : null} />
                                                    <InfoRow label="Deadline" value={ins.deadline_date ? formatDate(ins.deadline_date) : null} />
                                                    <InfoRow label="Assigned by" value={ins.assigned_by_name} />
                                                </dl>
                                                {ins.assigned_notes && (
                                                    <p className="mt-4 text-[13px] text-slate-700 leading-relaxed bg-slate-50 px-3.5 py-3 rounded-lg">
                                                        {ins.assigned_notes}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Location: the map exists to locate THIS parcel */}
                                            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                                <div className="px-4 pt-3.5">
                                                    <SectionTitle
                                                        aside={targetPin && (
                                                            <span className="text-[11px] font-mono text-slate-400 truncate">PIN {parcel.property_index_number}</span>
                                                        )}
                                                    >
                                                        Location
                                                    </SectionTitle>
                                                </div>
                                                {targetPin ? (
                                                    <>
                                                        <div className="relative h-44 mx-4 rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
                                                            <MapContainer center={rosarioCenter} zoom={11} minZoom={11} maxBounds={[[13.65, 121.12], [13.92, 121.36]]} maxBoundsViscosity={1.0} zoomControl={false} scrollWheelZoom={false}>
                                                                <TileLayer
                                                                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                                                />
                                                                {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                                                {/* Neighbouring lots are only drawn once the map is
                                                                    on THIS parcel; at municipal zoom every parcel at
                                                                    once is unreadable. */}
                                                                {parcelMapData && activeParcelFeature && <GeoJSON key={activeParcelFeature.properties?.property_index_number || "parcels"} data={parcelMapData} style={getParcelStyle} />}
                                                                <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />
                                                            </MapContainer>
                                                            <MapSkeleton visible={mapLoading} label="Locating parcel…" tone="#f2f3f5" />
                                                            {parcelNotOnMap && (
                                                                <p className="absolute top-3 left-3 right-3 z-[400] bg-white/95 px-3 py-2 rounded-lg border border-amber-200 text-[12px] text-amber-800">
                                                                    This parcel's boundary is not on the map layer yet.
                                                                </p>
                                                            )}
                                                        </div>
                                                        <dl className="grid grid-cols-3 gap-4 px-4 py-3">
                                                            <InfoRow label="Lot" value={parcel.lot_number} />
                                                            <InfoRow label="Area" value={parcel.lot_area_sqm ? `${parcel.lot_area_sqm} sq.m` : null} />
                                                            <InfoRow label="Barangay" value={parcel.barangay || app.barangay} />
                                                        </dl>
                                                    </>
                                                ) : (
                                                    <p className="px-4 pb-4 text-[13px] text-slate-500 leading-relaxed">
                                                        No parcel on record. This inspection round was recorded without a parcel, so there is no lot to show on the map.
                                                    </p>
                                                )}
                                            </div>

                                            </div>

                                            {/* GPS Confirmation */}
                                            {(ins.confirmed_latitude || ins.confirmed_longitude) && (
                                                <div className="bg-white border border-slate-200 rounded-xl p-4">
                                                    <SectionTitle>GPS confirmation</SectionTitle>
                                                    <dl className="grid grid-cols-2 sm:grid-cols-4 gap-y-4 gap-x-6">
                                                        <InfoRow label="Latitude" value={ins.confirmed_latitude} mono />
                                                        <InfoRow label="Longitude" value={ins.confirmed_longitude} mono />
                                                        <InfoRow label="Accuracy" value={ins.gps_accuracy_m ? `${ins.gps_accuracy_m} m` : null} mono />
                                                        <InfoRow label="Confirmed" value={ins.gps_confirmed_at ? formatDate(ins.gps_confirmed_at) : null} />
                                                    </dl>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Photos Tab ── */}
                                    {activeTab === "photos" && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                                            {loadingPhotos ? (
                                                <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                                    <svg className="animate-spin w-6 h-6 mb-3 text-blue-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                    </svg>
                                                    <span className="text-xs font-medium">Loading photos…</span>
                                                </div>
                                            ) : inspectionPhotos && inspectionPhotos.length > 0 ? (
                                                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                                                    {inspectionPhotos.map((photo, idx) => {
                                                        // The authorized contract is `signed_url`. The server
                                                        // deliberately does NOT emit a raw path or a stored
                                                        // public URL; the image is still fetched from a
                                                        // short-lived signed URL.
                                                        const thumbUrl = photo.signed_url;
                                                        const broken = brokenPhotos[idx];

                                                        return (
                                                            <button
                                                                key={photo.id || idx}
                                                                type="button"
                                                                onClick={() => setLightboxIndex(idx)}
                                                                title={thumbUrl ? "Open full-size photo" : "This photo is unavailable"}
                                                                aria-label={thumbUrl ? `Open photo ${idx + 1} full size` : `Photo ${idx + 1} unavailable`}
                                                                className="relative aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
                                                            >
                                                                {thumbUrl && !broken ? (
                                                                    <img
                                                                        src={thumbUrl}
                                                                        alt={`Inspection Photo ${idx + 1}`}
                                                                        onError={() => markPhotoBroken(idx)}
                                                                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                    />
                                                                ) : (
                                                                    // A failed image reports itself honestly; it is never
                                                                    // replaced with a stand-in photo.
                                                                    <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400 p-2 text-center">
                                                                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                                                        </svg>
                                                                        <span className="text-[10px] font-semibold leading-tight">
                                                                            Photo unavailable
                                                                        </span>
                                                                    </span>
                                                                )}

                                                                {photo.captured_at && (
                                                                    <span className="absolute inset-x-0 bottom-0 px-2 py-1 text-[10px] text-white font-medium truncate bg-gradient-to-t from-slate-900/70 to-transparent opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                                                                        {new Date(photo.captured_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            ) : (
                                                <div className="py-8 text-center">
                                                    <p className="text-[14px] font-semibold text-slate-700">No photos yet</p>
                                                    <p className="text-[13px] text-slate-500 mt-1">Photos taken by the inspector in FieldSync will appear here.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Parcel Tab ── */}
                                    {activeTab === "parcel" && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-4">
                                            {parcel.id ? (
                                                <dl className="grid grid-cols-2 gap-y-4 gap-x-6">
                                                    <InfoRow label="Parcel Code" value={parcel.parcel_code} />
                                                    <InfoRow label="Property Index Number" value={parcel.property_index_number} mono />
                                                    <InfoRow label="Lot Number" value={parcel.lot_number} />
                                                    <InfoRow label="Lot Area" value={parcel.lot_area_sqm ? `${parcel.lot_area_sqm} sq.m` : null} mono />
                                                    <InfoRow label="Owner" value={parcel.owner_name} />
                                                    <InfoRow label="Barangay" value={parcel.barangay} />
                                                    <InfoRow label="Location" value={parcel.location_address} />
                                                    <InfoRow label="Land Use" value={parcel.land_use_class} />
                                                    <InfoRow label="TCT Number" value={parcel.tct_number} mono />
                                                    <InfoRow label="Tax Dec Number" value={parcel.tax_dec_number} mono />
                                                    <InfoRow label="ARP Number" value={parcel.arp_number} mono />
                                                    <InfoRow label="Survey Number" value={parcel.survey_number} mono />
                                                </dl>
                                            ) : (
                                                <div className="py-8 text-center">
                                                    <p className="text-[14px] font-semibold text-slate-700">No parcel linked</p>
                                                    <p className="text-[13px] text-slate-500 mt-1">This inspection round was recorded without a parcel.</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* ── Application Tab ── */}
                                    {activeTab === "application" && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-5">
                                            <dl className="grid grid-cols-2 gap-y-4 gap-x-6">
                                                <InfoRow label="Reference Number" value={app.reference_number} mono />
                                                <InfoRow label="Application Type" value={app.application_type} />
                                                <InfoRow label="Status" value={app.status} />
                                                <InfoRow label="Barangay" value={app.barangay} />
                                                <InfoRow label="Applicant" value={app.applicant_name} />
                                                <InfoRow label="Contact" value={app.contact_number ? `+63 ${app.contact_number}` : null} mono />
                                                <InfoRow label="Form Number" value={app.form_number} />
                                                <InfoRow label="Land Use Class" value={app.land_use_class} />
                                                <InfoRow label="Representative" value={app.representative_name} />
                                                <InfoRow label="Assessment Fee" value={app.assessment_fee ? `₱${parseFloat(app.assessment_fee).toLocaleString("en-PH", { minimumFractionDigits: 2 })}` : null} mono />
                                            </dl>

                                            {app.purpose && (
                                                <div>
                                                    <SectionTitle>Purpose</SectionTitle>
                                                    <p className="text-[13px] text-slate-700 leading-relaxed bg-slate-50 px-3.5 py-3 rounded-lg">
                                                        {app.purpose}
                                                    </p>
                                                </div>
                                            )}

                                            {ins.zoning_application_id && (
                                                <Link
                                                    href={`/applications/${ins.zoning_application_id}`}
                                                    className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-slate-200 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                >
                                                    Open application record
                                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                                                </Link>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* ── SUPPLEMENTAL ADMIN OPERATIONS CONTEXT ──
                                    Rendered AFTER the primary record and inside the SAME
                                    scroll region: beside it on wide screens, below it
                                    (with a separator) on narrow ones. Order is fixed:
                                    PO Review -> Delivery -> Round History ->
                                    Application Support -> Admin Support Actions. */}
                                <aside aria-label="Operations" className="min-w-0 border-t-2 border-slate-300 lg:border-t-0 p-5 lg:p-0 space-y-3">

                                    {/* ── PLANNING OFFICER REVIEW ──
                                        PHASE 2B2C, read-only. A DECISION FOR THIS INSPECTION
                                        is shown only where reviewed_site_inspection_id proves
                                        this exact round was judged; LATEST PARCEL REVIEW is
                                        context about the LOT and says so. Nothing here is an
                                        action. */}
                                    {review && (review.po_decision || review.parcel_review || review.round_decision_anomaly) && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                                            <SectionTitle>Planning Officer Review</SectionTitle>

                                            {review.po_decision ? (
                                                <div>
                                                    <p className="text-[12px] text-slate-500">Decision for this inspection</p>
                                                    <p className="text-[15px] font-semibold text-violet-800 mt-0.5">{review.po_decision}</p>
                                                    <p className="text-[12px] text-slate-500 mt-1">
                                                        {review.po_decision_reviewer && <>Reviewed by {review.po_decision_reviewer}</>}
                                                        {review.po_decision_reviewer && review.po_decision_date && " · "}
                                                        {review.po_decision_date}
                                                    </p>
                                                </div>
                                            ) : (
                                                <div>
                                                    <p className="text-[12px] text-slate-500">Latest Parcel Review</p>
                                                    <p className="text-[15px] font-semibold text-slate-900 mt-0.5">{review.parcel_review?.label}</p>
                                                    <p className="text-[13px] text-slate-600 mt-0.5 leading-relaxed">{review.parcel_review?.context}</p>
                                                    <p className="text-[12px] text-slate-500 mt-1.5">
                                                        {review.parcel_review?.reviewer && <>Reviewed by {review.parcel_review.reviewer}</>}
                                                        {review.parcel_review?.reviewer && review.parcel_review?.reviewed_at && " · "}
                                                        {review.parcel_review?.reviewed_at}
                                                    </p>
                                                </div>
                                            )}

                                            {review.round_decision_anomaly && (
                                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                                    <p className="text-[12px] font-semibold text-amber-900">Review linkage needs attention</p>
                                                    <p className="text-[12px] text-amber-800 mt-0.5 leading-relaxed">{review.round_decision_anomaly.message}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {review?.is_parcel_unknown && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                                            <SectionTitle>Planning Officer Review</SectionTitle>
                                            <p className="text-[13px] text-slate-500 leading-relaxed">
                                                Not available. This inspection has no recorded parcel, so there is no parcel whose
                                                Planning Officer review could be shown. No review has been inferred for it.
                                            </p>
                                        </div>
                                    )}

                                    {/* ── DELIVERY & FIELDSYNC ──
                                        PHASE 2B2D, READ ONLY. Every word comes from the
                                        canonical InspectionDeliveryStatus vocabulary.
                                        `no_delivery_record` stays NEUTRAL: most historical
                                        rounds were never pushed to FieldSync. No retry,
                                        re-deliver or assignment control is mounted here. */}
                                    {delivery && (
                                        <div className={`bg-white border rounded-xl p-3.5 ${delivery.is_failure ? "border-rose-200" : "border-slate-200"}`}>
                                            <SectionTitle
                                                aside={
                                                    <span
                                                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${
                                                            delivery.is_failure
                                                                ? "bg-rose-50 text-rose-700 border-rose-200"
                                                                : delivery.state === "delivered"
                                                                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                                                  : delivery.state === "pending_delivery"
                                                                    ? "bg-amber-50 text-amber-700 border-amber-200"
                                                                    : "bg-slate-100 text-slate-600 border-slate-200"
                                                        }`}
                                                    >
                                                        {delivery.label}
                                                    </span>
                                                }
                                            >
                                                Delivery &amp; FieldSync
                                            </SectionTitle>

                                            <p className="text-[13px] text-slate-600 leading-relaxed">{delivery.message}</p>

                                            <dl className="mt-3 grid grid-cols-2 gap-3 text-[12px]">
                                                <div><dt className="text-slate-500">Attempts</dt><dd className="font-semibold text-slate-800 tabular-nums">{delivery.attempt_count}</dd></div>
                                                {delivery.last_attempt_at && (
                                                    <div><dt className="text-slate-500">Last attempt</dt><dd className="font-semibold text-slate-800">{delivery.last_attempt_at}</dd></div>
                                                )}
                                                {delivery.delivered_at && (
                                                    <div><dt className="text-slate-500">Delivered</dt><dd className="font-semibold text-slate-800">{delivery.delivered_at}</dd></div>
                                                )}
                                            </dl>

                                            {delivery.is_failure && delivery.failure_category && (
                                                <p className="mt-3 text-[12px] text-rose-700 leading-relaxed bg-rose-50 rounded-lg px-3 py-2">
                                                    <span className="font-semibold capitalize">{delivery.failure_category.replace(/_/g, " ")}</span>
                                                    {delivery.failure_message ? ` — ${delivery.failure_message}` : ""}
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    {/* ── ROUND HISTORY ──
                                        PHASE 2B2D. The canonical (application, parcel) chain,
                                        so a round's siblings are always the SAME lot's visits.
                                        A parcel-unknown row has no chain and says so quietly. */}
                                    {roundHistory && (
                                        <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                                            <SectionTitle>Round History</SectionTitle>

                                            {!roundHistory.available ? (
                                                <p className="text-[13px] text-slate-500 leading-relaxed">
                                                    Round history unavailable. {roundHistory.unavailable_reason}
                                                </p>
                                            ) : roundHistory.rounds.length === 0 ? (
                                                <p className="text-[13px] text-slate-500 leading-relaxed">
                                                    This is the only inspection round recorded for this parcel.
                                                </p>
                                            ) : (
                                                <ul className="-mx-2 space-y-0.5">
                                                    {roundHistory.rounds.map((r) => (
                                                        <li key={r.inspection_id}>
                                                            <Link
                                                                href={`/site-inspections/${r.inspection_id}`}
                                                                className={`flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors ${
                                                                    r.is_current ? "bg-blue-50" : "hover:bg-slate-50"
                                                                }`}
                                                                aria-current={r.is_current ? "true" : undefined}
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="block text-[13px] font-semibold text-slate-900">
                                                                        {r.round_number != null
                                                                            ? `Round ${r.round_number}`
                                                                            : r.round_kind}
                                                                        <span className="font-normal text-slate-500">
                                                                            {" · "}
                                                                            {r.round_number != null
                                                                                ? r.round_kind
                                                                                : r.round_note}
                                                                        </span>
                                                                    </span>
                                                                    <span className="block text-[12px] text-slate-500">
                                                                        {r.display_status}
                                                                        {r.scheduled_date && ` · ${r.scheduled_date}`}
                                                                    </span>
                                                                </span>
                                                                <span className="flex flex-col items-end gap-0.5">
                                                                    {r.is_current && (
                                                                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700">
                                                                            Current
                                                                        </span>
                                                                    )}
                                                                    <span className="text-[11px] font-mono text-slate-400">
                                                                        INS-{r.inspection_id}
                                                                    </span>
                                                                </span>
                                                            </Link>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>
                                    )}

                                    {/* Scoped sync OUTCOME, set from the flash the controller
                                        returns, so the server stays the single source of truth
                                        for the wording. */}
                                    {syncOutcome && (
                                        <div
                                            role="status"
                                            aria-live="polite"
                                            className={`rounded-xl px-4 py-3 text-[13px] font-medium border flex items-start gap-2 ${
                                                syncOutcome.tone === "ok"
                                                    ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                                                    : syncOutcome.tone === "warn"
                                                      ? "bg-amber-50 text-amber-900 border-amber-200"
                                                      : syncOutcome.tone === "info"
                                                        ? "bg-white text-slate-700 border-slate-200"
                                                        : "bg-rose-50 text-rose-900 border-rose-200"
                                            }`}
                                        >
                                            <span className="flex-1">{syncOutcome.message}</span>
                                            <button
                                                type="button"
                                                onClick={() => setSyncOutcome(null)}
                                                aria-label="Dismiss sync result"
                                                className="opacity-60 hover:opacity-100 cursor-pointer"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                                                </svg>
                                            </button>
                                        </div>
                                    )}
                                    <section aria-label="Application Support" className="bg-white border border-slate-200 rounded-xl p-3.5">
                                        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Application Support</h2>
                                        {!applicationSupport?.ok ? <p role="alert" className="mt-2 text-[13px] text-amber-800">{applicationSupport?.message || "Application support could not be loaded."}</p> : applicationSupport.total === 0 ? <p className="mt-2 text-[13px] text-slate-500">No support reports for this application.</p> : <>
                                            <p className="mt-2 text-[14px] font-semibold text-slate-900">{applicationSupport.total} support request(s)</p>
                                            <dl className="mt-2.5 grid grid-cols-2 gap-3 text-[12px]">
                                                <div><dt className="text-slate-500">Latest category</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.support_category_label}</dd></div>
                                                <div><dt className="text-slate-500">Reported by</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.inspector?.label || "Unresolved inspector"}</dd></div>
                                                <div><dt className="text-slate-500">Status</dt><dd className="font-semibold text-slate-800">{({ submitted: "Submitted", in_review: "In review", resolved: "Resolved", wont_fix: "Won’t fix" })[applicationSupport.latest.status] || "Unknown"}</dd></div>
                                                <div><dt className="text-slate-500">Current Planning Officer</dt><dd className="font-semibold text-slate-800">{applicationSupport.latest.context?.owner?.name || "Not assigned"}</dd></div>
                                            </dl>
                                        </>}
                                        {applicationSupport?.ok && applicationSupport.total > 0 && <Link href={applicationSupport.url} className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-[13px] font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">View Application Support</Link>}
                                    </section>
                                    {/* PHASE 2A - ADMIN SUPPORT / OPERATIONS AREA.
                                        A SUPPORT action, not a business decision: it imports a
                                        FieldSync result that already exists for THIS ONE
                                        inspection round. It cannot approve, decline, request a
                                        reinspection, assign an inspector, schedule or create a
                                        round, or edit findings. */}
                                    <div className="bg-white border border-slate-200 rounded-xl p-3.5">
                                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                            Admin Support Actions
                                        </h3>
                                        <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">
                                            Imports the latest <span className="font-semibold text-slate-700">completed</span> FieldSync
                                            result for <span className="font-semibold text-slate-700">this inspection round only</span>{" "}
                                            (INS-{ins.id || "-"}). It changes only this round, and only with
                                            data FieldSync has already submitted. It does not approve,
                                            decline, request a reinspection, reassign an inspector,
                                            schedule a round, or edit findings.
                                        </p>
                                        <button
                                            type="button"
                                            disabled={syncing}
                                            onClick={() => setSyncConfirmOpen(true)}
                                            className="mt-3 w-full inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-lg border border-slate-300 bg-white text-slate-800 text-[13px] font-semibold hover:bg-slate-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                                        >
                                            <svg className="w-4 h-4 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                            </svg>
                                            <span>
                                                {syncing ? "Syncing from FieldSync…" : "Sync from FieldSync"}
                                            </span>
                                        </button>
                                    </div>
                                </aside>
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* ── Scoped sync confirmation ──
                    The shared Modal component, deliberately NOT styled as
                    destructive: this imports data FieldSync has already
                    submitted; it is not an approval and cannot refuse anything. */}
                <Modal show={syncConfirmOpen} onClose={() => setSyncConfirmOpen(false)} maxWidth="md">
                    <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-start">
                            <h3 className="text-base font-bold text-slate-900">
                                Sync from FieldSync?
                            </h3>
                            <button
                                type="button"
                                onClick={() => setSyncConfirmOpen(false)}
                                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
                                aria-label="Close"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="p-5 space-y-3">
                            <p className="text-xs font-semibold text-slate-800 leading-relaxed">
                                Import the latest completed FieldSync result for Inspection{" "}
                                {ins.id}?
                            </p>
                            {/* Plain helper text with an information icon: nothing
                                here is editable and nothing is sent. */}
                            <p className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-500">
                                <svg
                                    className="w-3.5 h-3.5 mt-px shrink-0 text-slate-400"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                    />
                                </svg>
                                <span>
                                    Only this inspection round can be updated. This action
                                    imports data already submitted from FieldSync. It does not
                                    approve, decline, request reinspection, assign an
                                    inspector, or make a Planning Officer decision.
                                </span>
                            </p>
                        </div>

                        <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/80">
                            <button
                                type="button"
                                onClick={() => setSyncConfirmOpen(false)}
                                disabled={syncing}
                                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all shadow-xs disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={runScopedSync}
                                disabled={syncing}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {syncing ? "Syncing…" : "Sync from FieldSync"}
                            </button>
                        </div>
                    </div>
                </Modal>

                {lightboxIndex !== null && (
                <PhotoLightbox
                    photos={inspectionPhotos.map((p, i) => ({
                        ...p,
                        inspectionId: ins.id,
                        alt: `Inspection Photo ${i + 1}`,
                    }))}
                    index={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                    onIndexChange={setLightboxIndex}
                />
            )}
        </>
    );
}
