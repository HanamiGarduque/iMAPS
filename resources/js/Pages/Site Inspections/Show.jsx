// resources/js/Pages/Site Inspections/Show.jsx
import React, { useState, useEffect } from "react";
import { Link, Head, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import Modal from "@/Components/Modal";
import { resolveBackTarget, readRegistryQuery } from "@/Components/folderOrigin";
import PhotoLightbox from "@/Components/PhotoLightbox";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
            <p className="text-[10px] text-slate-400 font-medium mb-0.5">{label}</p>
            <p className={`font-semibold text-slate-800 text-xs ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
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
    // PARCEL's visit sequence via InspectionRoundNumbering.
    //
    // This page deliberately computes NOTHING about the round. It previously
    // re-derived "first round for the application" from a single row, which was
    // both a second definition and wrong for a multi-parcel application.
    //
    // `round_number` is null for a historical row whose parcel was never
    // recorded: no round is displayed, and the record says so instead.
    const roundNumber = ins.round_number ?? null;
    const roundLabel = ins.round_kind || "Inspection";
    const roundNote = ins.round_note || null;
    const isHistoricalRound = roundNumber === null && roundLabel === "Historical Inspection";

    // PHASE 2B2C: server-resolved Planning Officer review visibility for THIS
    // round. Read, never derived here - the browser cannot tell a decision that
    // reviewed_site_inspection_id proves from parcel-level context, and must
    // never imply one.
    const review = usePage().props?.poReview || null;

    // PHASE 2B2D: read-only operations context, all server-resolved.
    //   delivery         - canonical delivery condition + attempt evidence
    //   roundHistory     - THIS parcel's canonical chain, navigable
    //   diagnosticsSummary - GLOBAL diagnostics count, never attributed to a round
    //
    // `diagnosticsSummary` is DELIBERATELY NOT READ HERE.
    //
    // PHASE 2B2D shipped a global Technical Issue count on this page. It has
    // been removed: `diagnostic_reports` carries no application, inspection or
    // parcel identity, so a system-wide count has no application-specific
    // meaning on one lot's record, and no disclosure wording can make it
    // meaningful. Only Application Support - linked by a stored `field_job_id` -
    // may appear here, and only once the shared reporting schema exists.
    //
    // The server still sends the key. That is deliberate and is under separate
    // review: removing the payload is not a layout change, and the reader method
    // behind it is the primitive the reporting work needs. Until then it is an
    // unread payload, not a rendered claim.
    const { delivery = null, roundHistory = null } = usePage().props || {};

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");

    // Where this round was opened from, taken from the query string rather than
    // inferred from browser history, so a refresh or a pasted link behaves the
    // same as a click. A folder origin returns to THAT applicant folder; no origin
    // falls back to the registry root and invents nothing.
    const backTarget = resolveBackTarget({
        search: usePage().url || "",
        registryPath: "/site-inspections",
        rootLabel: "All Inspections",
        // Restore the registry filters and page, minus the origin markers.
        registryQuery: readRegistryQuery(usePage().url || ""),
    });
    const [activeTab, setActiveTab] = useState("inspection");

    // Geospatial States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [landUseMapData, setLandUseMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const rosarioCenter = [13.8450, 121.2063];

    useEffect(() => {
        fetch("/api/map/barangay_boundary")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(sanitizeGeoJSON(data)))
            .catch(() => {});

        fetch("/api/map/land_use_plan")
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
        const targetPin = parcel?.property_index_number?.trim();
        if (targetPin && pinLookupMap[targetPin]) {
            setActiveParcelFeature(pinLookupMap[targetPin]);
        } else {
            setActiveParcelFeature(null);
        }
    }, [pinLookupMap, parcel]);

    const [inspectionPhotos, setInspectionPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);
    const [syncing, setSyncing] = useState(false);

    // Scoped sync confirmation + outcome feedback.
    //
    // The confirmation is an in-app Modal, not window.confirm(). The native
    // dialog is browser chrome: it ignores the application design, cannot show
    // the supporting note about what this action does and does not do, and
    // cannot express a processing state.
    const [syncConfirmOpen, setSyncConfirmOpen] = useState(false);

    // Outcome banner state. `info` is the neutral tone: NO_REMOTE_RESULT and
    // NO_CHANGE mean "nothing was changed", which is not a success, so they are
    // deliberately not green.
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

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    /**
     * Issue the scoped sync and surface the outcome.
     *
     * Every completion path must leave the Admin with a visible answer:
     * a request that finishes silently reads as "still running" or "nothing
     * happened", which is exactly the confusion this replaces.
     *
     * The outcome is read from the flash the controller already sets, so the
     * server stays the single source of truth for the wording and this page
     * never invents a result. `onFinish` clears the busy state on success AND
     * on failure; `onError` covers a refusal or a network failure, where no
     * flash exists at all.
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
        opacity: 0.7,
        fillOpacity: 0.04,
        fillColor: "#3b82f6",
    };

    const landUseStyles = {
        Residential: { color: "#16a34a", fillColor: "#22c55e", fillOpacity: 0.25, weight: 1 },
        Commercial: { color: "#d97706", fillColor: "#f59e0b", fillOpacity: 0.25, weight: 1 },
        Agricultural: { color: "#65a30d", fillColor: "#84cc16", fillOpacity: 0.25, weight: 1 },
        Industrial: { color: "#dc2626", fillColor: "#ef4444", fillOpacity: 0.25, weight: 1 },
        "Agro-industrial": { color: "#7c3aed", fillColor: "#8b5cf6", fillOpacity: 0.25, weight: 1 },
        default: { color: "#475569", fillColor: "#64748b", fillOpacity: 0.15, weight: 1 },
    };

    const getLandUseStyle = (feature) => {
        const classification = feature.properties?.class || feature.properties?.LAND_USE || "default";
        return landUseStyles[classification] || landUseStyles.default;
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties?.property_index_number === feature.properties?.property_index_number;
        return {
            color: isActive ? "#ef4444" : "#2563eb",
            weight: isActive ? 2.5 : 1.5,
            opacity: 0.9,
            fillOpacity: isActive ? 0.5 : 0.2,
            fillColor: isActive ? "#ef4444" : "#3b82f6",
        };
    };

    return (
        <>
            <Head title={`Inspection: ${ins.id || "Detail"} | iMAPS`} />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
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

            <div id="dashboard-root" className="bg-slate-100/60 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
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
                    <div className="h-12 bg-white border-b border-slate-200/80 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-xs">
                        <div className="flex items-center gap-3">
                            {/* The back control returns to the applicant folder this
                                round was opened from, and says so. With no origin in
                                the URL it falls back to the registry root, because a
                                folder context that was never supplied must not be
                                invented. */}
                            <Link
                                href={backTarget.href}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200/80 transition-all shadow-2xs active:scale-95 group cursor-pointer"
                                title={
                                    backTarget.folder
                                        ? `Return to the ${backTarget.folder} folder`
                                        : "Return to All Inspections"
                                }
                            >
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                                <span className="max-w-[190px] truncate">{backTarget.label}</span>
                            </Link>
                            <span className="text-slate-300">/</span>
                            {/* Identity is the APPLICATION reference, which is what
                                an officer actually recognises. The round and its
                                kind provide the inspection context, and the
                                internal inspection id is kept only as a quiet
                                secondary reference for backend/debug workflows. */}
                            {app.reference_number ? (
                                <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                                    {app.reference_number}
                                </span>
                            ) : (
                                <span className="font-mono text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200/60 px-2 py-0.5 rounded-md">
                                    Application #{ins.zoning_application_id}
                                </span>
                            )}
                            {/* `whitespace-nowrap` is load-bearing, not cosmetic. This breadcrumb row is
                                a tight flex line and the label span had no wrap control, so at
                                narrower widths the browser consumed the space inside
                                "Historical Inspection" as a line-break opportunity and the
                                two words read as "HistoricalInspection". The string was
                                always correct - the space was being eaten by layout. The
                                card list was unaffected because it has room to wrap. */}
                            <span className="hidden sm:inline text-xs text-slate-600 font-semibold whitespace-nowrap">
                                {/* No fabricated "Round N" for a historical row:
                                    it is labelled and explained instead. */}
                                {roundNumber
                                    ? `Round ${roundNumber} · ${roundLabel}`
                                    : isHistoricalRound
                                      ? `${roundLabel} · ${roundNote || "Parcel not recorded"}`
                                      : roundLabel}
                            </span>
                            <span
                                className="hidden md:inline text-[10px] font-mono text-slate-400"
                                title="Internal inspection record id"
                            >
                                INS-{ins.id || "—"}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <StatusBadge status={ins.status} />
                        </div>
                    </div>

                    {/* ── WORKSPACE CONTENT ── */}
                    <main className="flex-1 w-full h-full flex flex-col bg-white overflow-hidden relative">
                        <div className="w-full h-full bg-white flex flex-col lg:flex-row flex-1 min-h-0">
                            {/* ── LEFT SIDE: MAP ── */}
                            <div className="hidden lg:flex flex-col lg:w-5/12 bg-slate-50 border-r border-slate-200 relative">
                                <div className="absolute inset-0 z-0">
                                    <MapContainer center={rosarioCenter} zoom={12} zoomControl={false} scrollWheelZoom={true}>
                                        <TileLayer
                                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                        />
                                        {landUseMapData && <GeoJSON data={landUseMapData} style={getLandUseStyle} />}
                                        {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                        {parcelMapData && <GeoJSON key={activeParcelFeature?.properties?.property_index_number || "parcels"} data={parcelMapData} style={getParcelStyle} />}
                                        <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />
                                    </MapContainer>
                                </div>

                                {/* Floating HUD — Inspected Parcel */}
                                {parcel.property_index_number && (
                                    <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
                                        <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200/80 pointer-events-auto max-w-sm">
                                            <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                                                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                                    Inspected Parcel
                                                </span>
                                                <span className="text-xs font-mono font-medium text-slate-600">
                                                    PIN: {parcel.property_index_number}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-medium">Lot Number</p>
                                                    <p className="font-semibold text-slate-800">{parcel.lot_number || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[10px] text-slate-400 font-medium">Declared Area</p>
                                                    <p className="font-mono font-semibold text-slate-800">
                                                        {parcel.lot_area_sqm || "0"} sq.m
                                                    </p>
                                                </div>
                                                <div className="col-span-2">
                                                    <p className="text-[10px] text-slate-400 font-medium">Barangay</p>
                                                    <p className="font-semibold text-slate-800">Brgy. {parcel.barangay || app.barangay || "—"}</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* ── RIGHT SIDE: INSPECTION DETAILS ── */}
                            <div className="flex-1 flex flex-col relative overflow-hidden lg:w-7/12">
                                {/* Header Info */}
                                <div className="bg-white px-6 py-4 border-b border-slate-200/80 shrink-0 z-10 flex items-start justify-between">
                                    <div>
                                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">{app.applicant_name || "—"}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{app.application_type || "—"}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-2">Inspector</p>
                                        <p className="text-sm font-bold text-slate-900">{inspector.name || "Unassigned"}</p>
                                    </div>
                                </div>


                                <div className="flex-1 flex flex-col overflow-hidden">
                                    {/* ── Chrome-style Tab Bar ── */}
                                    <div className="bg-slate-50/80 border-b border-slate-200/80 px-5 pt-2 flex gap-1 shrink-0">
                                        {[
                                            { key: "inspection", label: "Inspection Details", icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                                </svg>
                                            )},
                                            { key: "photos", label: "Inspection Photos", icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                </svg>
                                            )},
                                            { key: "parcel", label: "Inspected Parcel", icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                                </svg>
                                            )},
                                            { key: "application", label: "Application Dossier", icon: (
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                            )},
                                        ].map((tab) => {
                                            const isActive = activeTab === tab.key;
                                            return (
                                                <button
                                                    key={tab.key}
                                                    type="button"
                                                    onClick={() => setActiveTab(tab.key)}
                                                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-t-xl transition-all border-t border-x ${
                                                        isActive
                                                            ? "bg-white text-blue-700 border-slate-200 shadow-xs -mb-px z-10"
                                                            : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                                                    }`}
                                                >
                                                    <span className={isActive ? "text-blue-600" : "text-slate-400"}>{tab.icon}</span>
                                                    <span>{tab.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {/* ── Tab Content ── */}
                                    <div className="flex-1 min-h-0 overflow-y-auto relative">
                                        <div className="max-w-2xl mx-auto p-5 sm:p-7">

                                            {/* ── Inspection Details Tab ── */}
                                            {activeTab === "inspection" && (
                                                <div className="space-y-5">
                                                    <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 text-xs">
                                                        <InfoRow label="Status" value={formatStatus(ins.status)} />
                                                        <InfoRow label="Inspector" value={inspector.name} />
                                                        <InfoRow label="Scheduled Date" value={formatDate(ins.scheduled_date)} />
                                                        <InfoRow label="Deadline Date" value={formatDate(ins.deadline_date)} />
                                                        <InfoRow label="Completed At" value={formatDate(ins.completed_at)} />
                                                        <InfoRow label="Submitted At" value={formatDate(ins.submitted_at)} />
                                                        <InfoRow label="Assigned By" value={ins.assigned_by_name} />
                                                        <InfoRow label="Compliant" value={ins.is_compliant != null ? (ins.is_compliant ? "Yes" : "No") : null} />
                                                    </div>

                                                    {ins.assigned_notes && (
                                                        <div className="pt-3 border-t border-slate-100">
                                                            <p className="text-[10px] text-slate-400 font-medium mb-1">Assigned Notes</p>
                                                            <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                                {ins.assigned_notes}
                                                            </p>
                                                        </div>
                                                    )}

                                                    {/* Findings & Results */}
                                                    {(ins.findings || ins.recommendation || ins.remarks || ins.inspection_result || ins.observations || ins.discrepancies || ins.recommendations || ins.inspector_notes) && (
                                                        <div className="pt-4 border-t border-slate-200 space-y-3.5">
                                                            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                                                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                                                </svg>
                                                                Findings & Results
                                                            </h4>
                                                            {ins.inspection_result && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Inspection Result</p>
                                                                    <p className="text-xs font-semibold text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.inspection_result}</p>
                                                                </div>
                                                            )}
                                                            {ins.findings && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Findings</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.findings}</p>
                                                                </div>
                                                            )}
                                                            {ins.observations && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Observations</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.observations}</p>
                                                                </div>
                                                            )}
                                                            {ins.discrepancies && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Discrepancies</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-rose-50 p-3 rounded-xl border border-rose-100">{ins.discrepancies}</p>
                                                                </div>
                                                            )}
                                                            {ins.recommendation && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Recommendation</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.recommendation}</p>
                                                                </div>
                                                            )}
                                                            {ins.recommendations && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Recommendations</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.recommendations}</p>
                                                                </div>
                                                            )}
                                                            {ins.remarks && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Remarks</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.remarks}</p>
                                                                </div>
                                                            )}
                                                            {ins.inspector_notes && (
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium mb-1">Inspector Notes</p>
                                                                    <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">{ins.inspector_notes}</p>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {/* GPS Confirmation */}
                                                    {(ins.confirmed_latitude || ins.confirmed_longitude) && (
                                                        <div className="pt-4 border-t border-slate-200">
                                                            <h4 className="text-xs font-bold text-slate-700 flex items-center gap-2 mb-3.5">
                                                                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                </svg>
                                                                GPS Confirmation
                                                            </h4>
                                                            <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 text-xs">
                                                                <InfoRow label="Latitude" value={ins.confirmed_latitude} mono />
                                                                <InfoRow label="Longitude" value={ins.confirmed_longitude} mono />
                                                                <InfoRow label="GPS Accuracy" value={ins.gps_accuracy_m ? `${ins.gps_accuracy_m} m` : null} mono />
                                                                <InfoRow label="GPS Confirmed At" value={formatDate(ins.gps_confirmed_at)} />
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Inspection Photos Tab ── */}
                                            {activeTab === "photos" && (
                                                <div>
                                                    {loadingPhotos ? (
                                                        <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                                                            <svg className="animate-spin w-6 h-6 mb-3 text-blue-500" fill="none" viewBox="0 0 24 24">
                                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                            </svg>
                                                            <span className="text-xs font-medium">Loading photos from Supabase...</span>
                                                        </div>
                                                    ) : inspectionPhotos && inspectionPhotos.length > 0 ? (
                                                        <div className="grid grid-cols-4 gap-4">
                                                            {inspectionPhotos.map((photo, idx) => {
                                                                // The authorized contract is `signed_url`. The server
                                                                // deliberately does NOT emit a raw path or a stored
                                                                // public URL, so reading any other field here yields
                                                                // undefined and the browser falls back to rendering the
                                                                // alt text — which is exactly the broken thumbnail
                                                                // this replaces. Privacy is unchanged: the image is
                                                                // still fetched from a short-lived signed URL.
                                                                const thumbUrl = photo.signed_url;
                                                                const broken = brokenPhotos[idx];

                                                                return (
                                                                    <button
                                                                        key={photo.id || idx}
                                                                        type="button"
                                                                        onClick={() => setLightboxIndex(idx)}
                                                                        title={thumbUrl ? "Open full-size photo" : "This photo is unavailable"}
                                                                        aria-label={thumbUrl ? `Open photo ${idx + 1} full size` : `Photo ${idx + 1} unavailable`}
                                                                        className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 cursor-pointer"
                                                                    >
                                                                        {thumbUrl && !broken ? (
                                                                            <img
                                                                                src={thumbUrl}
                                                                                alt={`Inspection Photo ${idx + 1}`}
                                                                                onError={() => markPhotoBroken(idx)}
                                                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                                            />
                                                                        ) : (
                                                                            // A failed image reports itself honestly. It is never
                                                                            // replaced with a stand-in photo, and the alt
                                                                            // text is not left to stand in for the image.
                                                                            <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-slate-400 p-2 text-center">
                                                                                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                                                    <path
                                                                                        strokeLinecap="round"
                                                                                        strokeLinejoin="round"
                                                                                        d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                                                                                    />
                                                                                </svg>
                                                                                <span className="text-[10px] font-semibold leading-tight">
                                                                                    Photo unavailable
                                                                                </span>
                                                                            </span>
                                                                        )}

                                                                        {/* Make it obvious the thumbnail opens something. */}
                                                                        {thumbUrl && !broken && (
                                                                            <span className="absolute inset-0 flex items-center justify-center bg-slate-900/0 group-hover:bg-slate-900/40 transition-colors">
                                                                                <span className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity">
                                                                                    <svg className="w-4 h-4 text-slate-800" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                                        <path
                                                                                            strokeLinecap="round"
                                                                                            strokeLinejoin="round"
                                                                                            d="M3.75 3.75v16.5h16.5V3.75H3.75zM8.25 15.75L12 12l3.75 3.75M14.25 9.75h.008v.008H14.25V9.75z"
                                                                                        />
                                                                                    </svg>
                                                                                </span>
                                                                            </span>
                                                                        )}

                                                                        {photo.captured_at && (
                                                                            <span className="absolute bottom-2 left-2 right-2 text-[9px] text-white font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
                                                                                {new Date(photo.captured_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                            </span>
                                                                        )}
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-10">
                                                            <p className="text-xs text-slate-400 font-medium">No photos found for this inspection.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Inspected Parcel Tab ── */}
                                            {activeTab === "parcel" && (
                                                <div>
                                                    {parcel.id ? (
                                                        <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 text-xs">
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
                                                        </div>
                                                    ) : (
                                                        <div className="text-center py-10">
                                                            <p className="text-xs text-slate-400 font-medium">No parcel linked to this inspection.</p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* ── Application Dossier Tab ── */}
                                            {activeTab === "application" && (
                                                <div>
                                                    <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 text-xs">
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
                                                    </div>

                                                    {app.purpose && (
                                                        <div className="mt-4 pt-3 border-t border-slate-100">
                                                            <p className="text-[10px] text-slate-400 font-medium mb-1">Operational Purpose</p>
                                                            <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                                {app.purpose}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                        </div>

                                        {/* ── SUPPLEMENTAL ADMIN OPERATIONS CONTEXT ──
                                            Below the primary inspection record, inside the
                                            SAME scroll region.

                                            WHY BELOW, NOT ABOVE
                                            ---------------------
                                            These bands are Admin operations context. The
                                            field inspection record is the reason this page
                                            exists, so it is presented first and these
                                            follow it.

                                            An earlier revision stacked the bands ABOVE the
                                            tab content in a flex column whose ONLY scroll
                                            owner was the tab content itself. Every band is
                                            `shrink-0` and the column is `overflow-hidden`,
                                            so once the stack exceeded the column height the
                                            `flex-1` tab region collapsed to zero height and
                                            the primary record became unreachable and
                                            clipped. Nothing was ever lost from the DOM -
                                            it was pushed below an unscrollable edge.

                                            THE SCROLL CONTRACT
                                            ------------------
                                            This column now has exactly ONE scroll owner:
                                            the `flex-1 min-h-0 overflow-y-auto` region.
                                            The tab bar above it is `shrink-0`; the column
                                            is `overflow-hidden`. So a band can never be
                                            clipped - it either scrolls or it does not
                                            render. A supplemental band must NEVER be a
                                            sibling of a `flex-1` region again.

                                            APPLICATION SUPPORT
                                            ------------------
                                            It will join this group once the shared
                                            reporting schema exists. It is deliberately NOT
                                            here yet.

                                            The global "Diagnostics & Support" band that used
                                            to sit here was REMOVED: a system-wide Technical
                                            Issue count has no application-specific meaning on
                                            one lot's page, and no disclosure wording can
                                            make it meaningful. Only Application Support,
                                            linked by a stored field_job_id, belongs here. */}
                                        <div className="border-t-2 border-slate-300">
                                        {/* ── PLANNING OFFICER REVIEW ──
                                            PHASE 2B2C, read-only visibility.
                                            Deliberately a SEPARATE band above the field
                                            record, never merged into the Field Inspection
                                            Result: a Planning Officer decision and a field
                                            finding are different workflow stages, and
                                            merging them would imply an authority the Admin
                                            does not have.

                                            Two distinct things, never conflated:
                                            - a DECISION FOR THIS INSPECTION, shown only
                                              where reviewed_site_inspection_id proves this
                                              exact round was judged. It is NULL on every
                                              historical review, so today this renders
                                              nothing - which is honest, not a gap.
                                            - LATEST PARCEL REVIEW, which is context about
                                              the LOT rather than a verdict on this round,
                                              and says so.
                                            Nothing here is an action: there is no
                                            approve, decline, reinspect, assign or schedule
                                            control, because those remain the Planning
                                            Officer's. */}
                                        {review && (review.po_decision || review.parcel_review || review.round_decision_anomaly) && (
 <div className="bg-white border-b border-slate-200/80 px-6 py-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    Planning Officer Review
                                                </p>

                                                {review.po_decision ? (
                                                    <div className="mt-2">
                                                        <p className="text-[10px] font-medium text-slate-500">
                                                            Decision for this inspection
                                                        </p>
                                                        <p className="text-xs font-bold text-violet-800 mt-0.5">
                                                            {review.po_decision}
                                                        </p>
                                                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
                                                            {review.po_decision_reviewer && (
                                                                <p className="text-[11px] text-slate-600">
                                                                    <span className="text-slate-400 font-medium">Reviewed by:</span>{" "}
                                                                    {review.po_decision_reviewer}
                                                                </p>
                                                            )}
                                                            {review.po_decision_date && (
                                                                <p className="text-[11px] text-slate-600">
                                                                    <span className="text-slate-400 font-medium">Date:</span>{" "}
                                                                    {review.po_decision_date}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="mt-2">
                                                        <p className="text-[10px] font-medium text-slate-500">
                                                            Latest Parcel Review
                                                        </p>
                                                        <p className="text-xs font-bold text-slate-800 mt-0.5">
                                                            {review.parcel_review?.label}
                                                        </p>
                                                        <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                                            {review.parcel_review?.context}
                                                        </p>
                                                        <div className="flex flex-wrap gap-x-5 gap-y-1 mt-1.5">
                                                            {review.parcel_review?.reviewer && (
                                                                <p className="text-[11px] text-slate-600">
                                                                    <span className="text-slate-400 font-medium">Reviewed by:</span>{" "}
                                                                    {review.parcel_review.reviewer}
                                                                </p>
                                                            )}
                                                            {review.parcel_review?.reviewed_at && (
                                                                <p className="text-[11px] text-slate-600">
                                                                    <span className="text-slate-400 font-medium">Date:</span>{" "}
                                                                    {review.parcel_review.reviewed_at}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {review.round_decision_anomaly && (
                                                    <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                                                        <p className="text-[11px] font-semibold text-amber-900">
                                                            Review linkage needs attention
                                                        </p>
                                                        <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                                                            {review.round_decision_anomaly.message}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                        {review?.is_parcel_unknown && (
 <div className="bg-white border-b border-slate-200/80 px-6 py-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    Planning Officer Review
                                                </p>
                                                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                                                    Not available. This inspection has no recorded parcel, so
                                                    there is no parcel whose Planning Officer review could be
                                                    shown. No review has been inferred for it.
                                                </p>
                                            </div>
                                        )}

                                        {/* ── DELIVERY & FIELDSYNC ──
                                            PHASE 2B2D, READ ONLY.

                                            The Admin Support Action below can re-import a
                                            FieldSync result, but until now this page never
                                            said whether delivery was healthy - so the
                                            action and its justification lived in different
                                            places. This closes that.

                                            Every word here comes from the canonical
                                            InspectionDeliveryStatus vocabulary; no new
                                            status is introduced. `no_delivery_record`
                                            stays NEUTRAL: most historical rounds were
                                            never pushed to FieldSync, and calling that a
                                            failure would invent one.

                                            NO retry, no re-deliver, no assignment. The
                                            Planning Officer's delivery controls are
                                            deliberately NOT mounted here. */}
                                        {delivery && (
 <div className="bg-white border-b border-slate-200/80 px-6 py-3">
                                                <div className="flex items-center justify-between gap-3 flex-wrap">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Delivery &amp; FieldSync
                                                    </p>
                                                    <span
                                                        className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border ${
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
                                                </div>

                                                <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                                                    {delivery.message}
                                                </p>

                                                <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2">
                                                    <p className="text-[11px] text-slate-600">
                                                        <span className="text-slate-400 font-medium">Attempts:</span>{" "}
                                                        {delivery.attempt_count}
                                                    </p>
                                                    {delivery.last_attempt_at && (
                                                        <p className="text-[11px] text-slate-600">
                                                            <span className="text-slate-400 font-medium">Last attempt:</span>{" "}
                                                            {delivery.last_attempt_at}
                                                        </p>
                                                    )}
                                                    {delivery.delivered_at && (
                                                        <p className="text-[11px] text-slate-600">
                                                            <span className="text-slate-400 font-medium">Delivered:</span>{" "}
                                                            {delivery.delivered_at}
                                                        </p>
                                                    )}
                                                </div>

                                                {delivery.is_failure && delivery.failure_category && (
                                                    <p className="text-[11px] text-rose-700 mt-1.5 leading-relaxed">
                                                        <span className="font-semibold">
                                                            {delivery.failure_category.replace(/_/g, " ")}
                                                        </span>
                                                        {delivery.failure_message ? ` — ${delivery.failure_message}` : ""}
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {/* ── ROUND HISTORY ──
                                            PHASE 2B2D. The canonical (application, parcel)
                                            chain, so a round's siblings are always the
                                            SAME lot's visits - never another lot's.

                                            A parcel-unknown historical row has no chain
                                            at all, and says so quietly. Its other
                                            application rounds are not its siblings and
                                            are never presented as such. */}
                                        {roundHistory && (
 <div className="bg-white border-b border-slate-200/80 px-6 py-3">
                                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                    Round History
                                                </p>

                                                {!roundHistory.available ? (
                                                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                                                        Round history unavailable. {roundHistory.unavailable_reason}
                                                    </p>
                                                ) : roundHistory.rounds.length === 0 ? (
                                                    <p className="text-[11px] text-slate-500 mt-1.5 leading-relaxed">
                                                        This is the only inspection round recorded for this parcel.
                                                    </p>
                                                ) : (
                                                    <ul className="mt-2 space-y-1">
                                                        {roundHistory.rounds.map((r) => (
                                                            <li key={r.inspection_id}>
                                                                <Link
                                                                    href={`/site-inspections/${r.inspection_id}`}
                                                                    className={`flex items-center justify-between gap-3 rounded-lg border px-2.5 py-1.5 transition-colors ${
                                                                        r.is_current
                                                                            ? "border-blue-200 bg-blue-50/60"
                                                                            : "border-slate-200 bg-white hover:bg-slate-50"
                                                                    }`}
                                                                    aria-current={r.is_current ? "true" : undefined}
                                                                >
                                                                    <span className="min-w-0 flex items-center gap-2 flex-wrap">
                                                                        <span className="text-[11px] font-bold text-slate-800">
                                                                            {r.round_number != null
                                                                                ? `Round ${r.round_number}`
                                                                                : r.round_kind}
                                                                        </span>
                                                                        <span className="text-[10px] text-slate-500">
                                                                            {r.round_number != null
                                                                                ? r.round_kind
                                                                                : r.round_note}
                                                                        </span>
                                                                        <span className="text-[10px] font-medium text-slate-600">
                                                                            {r.display_status}
                                                                        </span>
                                                                        {r.scheduled_date && (
                                                                            <span className="text-[10px] text-slate-400">
                                                                                Sched {r.scheduled_date}
                                                                            </span>
                                                                        )}
                                                                    </span>
 <span className="flex items-center gap-2">
                                                                        {r.is_current && (
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider text-blue-700 bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded">
                                                                                Current
                                                                            </span>
                                                                        )}
                                                                        <span className="text-[10px] font-mono text-slate-400">
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

                                        {/* Scoped sync OUTCOME. Set from the flash the controller already returns,
                                            so the server stays the single source of truth for the
                                            wording. The previous implementation derived this from
                                            `usePage().props.flash` during render, which meant the
                                            banner could only ever appear as a side effect of a
                                            re-render and could not be tied to the request that
                                            caused it; a run that finished without a re-render left
                                            the Admin with no visible answer at all. */}
                                        {syncOutcome && (
                                            <div
                                                role="status"
                                                aria-live="polite"
 className={`px-6 py-2.5 text-xs font-medium border-b flex items-start gap-2 ${
                                                    syncOutcome.tone === "ok"
                                                        ? "bg-emerald-50 text-emerald-900 border-emerald-200"
                                                        : syncOutcome.tone === "warn"
                                                          ? "bg-amber-50 text-amber-900 border-amber-200"
                                                          : syncOutcome.tone === "info"
                                                            ? "bg-slate-50 text-slate-700 border-slate-200"
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
                                        <section aria-label="Application Support" className="border-b border-slate-200 bg-white px-6 py-4">
                                            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">Application Support</h2>
                                            {!applicationSupport?.ok ? <p role="alert" className="mt-2 text-sm text-amber-800">{applicationSupport?.message || "Application support could not be loaded."}</p> : applicationSupport.total === 0 ? <p className="mt-2 text-sm text-slate-500">No support reports for this application.</p> : <>
                                                <p className="mt-2 text-sm font-semibold">{applicationSupport.total} support request(s)</p>
                                                <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                                                    <div><dt className="text-slate-500">Latest category</dt><dd>{applicationSupport.latest.support_category_label}</dd></div>
                                                    <div><dt className="text-slate-500">Reported by</dt><dd>{applicationSupport.latest.inspector?.label || "Unresolved inspector"}</dd></div>
                                                    <div><dt className="text-slate-500">Status</dt><dd>{({ submitted: "Submitted", in_review: "In review", resolved: "Resolved", wont_fix: "Won’t fix" })[applicationSupport.latest.status] || "Unknown"}</dd></div>
                                                    <div><dt className="text-slate-500">Current Planning Officer</dt><dd>{applicationSupport.latest.context?.owner?.name || "Not assigned"}</dd></div>
                                                </dl>
                                            </>}
                                            {applicationSupport?.ok && applicationSupport.total > 0 && <Link href={applicationSupport.url} className="mt-3 inline-flex min-h-10 items-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-600">View Application Support</Link>}
                                        </section>
                                        {/* PHASE 2A - ADMIN SUPPORT / OPERATIONS AREA.
                                            This is a SUPPORT action, not a business decision:
                                            it imports a FieldSync result that already exists for
                                            THIS ONE inspection round. It is deliberately placed
                                            outside the Inspection Details tab so it cannot be
                                            mistaken for ordinary record content, and it is
                                            deliberately NOT labelled like a page refresh.
                                            It cannot approve, decline, request a reinspection,
                                            assign an inspector, schedule or create a round, or
                                            edit findings - those remain Planning Officer /
                                            FieldSync responsibilities. */}
 <div className="bg-slate-50/80 border-b border-slate-200/80 px-6 py-3">
                                            <div className="flex items-start justify-between gap-4 flex-wrap">
                                                <div className="min-w-0">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                                        Admin Support Actions
                                                    </p>
                                                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed max-w-2xl">
                                                        Imports the latest <span className="font-semibold">completed</span> FieldSync
                                                        result for <span className="font-semibold">this inspection round only</span>{" "}
                                                        (INS-{ins.id || "-"}). It changes only this round, and only with
                                                        data FieldSync has already submitted. It does not approve,
                                                        decline, request a reinspection, reassign an inspector,
                                                        schedule a round, or edit findings.
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={syncing}
                                                    onClick={() => setSyncConfirmOpen(true)}
                                                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-xs font-semibold hover:bg-amber-100 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                                                >
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                                                    </svg>
                                                    <span>
                                                        {syncing ? "Syncing from FieldSync…" : "Sync from FieldSync"}
                                                    </span>
                                                </button>
                                            </div>
                                        </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* ── Scoped sync confirmation ──
                    Uses the shared Modal component (the Headless UI Dialog
                    wrapper that ships with this app) with the same visual
                    language as the reassignment modal: white panel, slate
                    header, Cancel then a primary action on the right.

                    Deliberately NOT styled as destructive/red. This is a support
                    synchronisation action that imports data FieldSync has
                    already submitted; it is not an approval and cannot refuse
                    anything. */}
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
                            {/* Plain helper text with an information icon, not a
                                card or an input-looking panel: nothing here is
                                editable and nothing is sent. */}
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
