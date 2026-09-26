// resources/js/Pages/Site Inspections/Show.jsx
import React, { useState, useEffect } from "react";
import { Link, Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
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
export default function Show({ auth, inspection }) {
    const ins = inspection || {};
    const app = ins.zoning_application || {};
    const inspector = ins.inspector || {};
    const parcel = ins.parcel || {};

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [activeTab, setActiveTab] = useState("inspection");

    // Geospatial States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [landUseMapData, setLandUseMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const rosarioCenter = [13.8450, 121.2063];

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
        const targetPin = parcel?.property_index_number?.trim();
        if (targetPin && pinLookupMap[targetPin]) {
            setActiveParcelFeature(pinLookupMap[targetPin]);
        } else {
            setActiveParcelFeature(null);
        }
    }, [pinLookupMap, parcel]);

    const [inspectionPhotos, setInspectionPhotos] = useState([]);
    const [loadingPhotos, setLoadingPhotos] = useState(false);

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
                            <Link 
                                href="/site-inspections" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200/80 transition-all shadow-2xs active:scale-95 group cursor-pointer"
                                title="Return to All Inspections"
                            >
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                                <span>All Inspections</span>
                            </Link>
                            <span className="text-slate-300">/</span>
                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                                INS-{ins.id || "—"}
                            </span>
                            {app.reference_number && (
                                <span className="hidden sm:inline text-xs text-slate-500 font-medium">
                                    · {app.reference_number}
                                </span>
                            )}
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
                                    <div className="flex-1 p-5 sm:p-7 overflow-y-auto relative">
                                        <div className="max-w-2xl mx-auto">

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
                                                            {inspectionPhotos.map((photo, idx) => (
                                                                <div key={photo.id || idx} className="relative aspect-square bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group">
                                                                    <img src={photo.photo_url} alt={`Inspection Photo ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                                                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                                                    {photo.captured_at && (
                                                                        <span className="absolute bottom-2 left-2 right-2 text-[9px] text-white font-medium truncate opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md">
                                                                            {new Date(photo.captured_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            ))}
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
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}