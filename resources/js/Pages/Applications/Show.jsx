// resources/js/Pages/Applications/Show.jsx
import React, { useState, useEffect, useMemo } from "react";
import { Link, Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ParcelInspectionStatus from "@/Components/ParcelInspectionStatus";

// ── Status Badge Configuration ──
const STATUS_CONFIG = {
    Received: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200/70", dot: "bg-emerald-500" },
    "Technical Review": { bg: "bg-amber-50 text-amber-700 border-amber-200/70", dot: "bg-amber-500" },
    "Under Sangguniang Bayan": { bg: "bg-purple-50 text-purple-700 border-purple-200/70", dot: "bg-purple-500" },
    "For Release": { bg: "bg-sky-50 text-sky-700 border-sky-200/70", dot: "bg-sky-500" },
    Released: { bg: "bg-indigo-50 text-indigo-700 border-indigo-200/70", dot: "bg-indigo-600" },
    Denied: { bg: "bg-rose-50 text-rose-700 border-rose-200/70", dot: "bg-rose-500" },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: "bg-slate-100 text-slate-700 border-slate-200", dot: "bg-slate-400" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${cfg.bg}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} shrink-0`} />
            {status}
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

// ── Form Controls ──
function Label({ children, required, hasError }) {
    return (
        <label className={`flex items-center gap-1.5 text-xs font-semibold mb-1.5 transition-colors ${hasError ? "text-rose-600" : "text-slate-700"}`}>
            {children}
            {required && <span className="text-rose-500 font-bold text-xs leading-none">*</span>}
        </label>
    );
}

const inputBaseStyles = (hasError) => `
    w-full px-3.5 py-2 text-xs font-medium text-slate-800 transition-all duration-150 outline-none
    placeholder:text-slate-400 rounded-xl border
    ${hasError ? "border-rose-300 bg-rose-50/30 focus:border-rose-500 focus:ring-2 focus:ring-rose-500/10" : "border-slate-200 bg-white hover:border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-xs"}
`;

const Textarea = ({ className = "", hasError = false, ...props }) => (
    <textarea className={`${inputBaseStyles(hasError)} resize-none ${className}`} {...props} />
);

// ── Assign Inspector Drawer Modal ──
function AssignInspectorDrawer({ onClose, onSubmit, saving, inspectors = [] }) {
    const [inspectorId, setInspectorId] = useState("");
    const [scheduledDate, setScheduledDate] = useState("");
    const [deadlineDate, setDeadlineDate] = useState("");
    const [assignedNotes, setAssignedNotes] = useState("");

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
                    <div>
                        <span className="text-xs font-semibold text-amber-600">Field Task</span>
                        <h3 className="text-base font-bold text-slate-900">Assign Site Inspector</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <Label required>Select Inspector</Label>
                        <select
                            value={inspectorId}
                            onChange={(e) => setInspectorId(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer shadow-xs"
                        >
                            <option value="">-- Choose Inspector --</option>
                            {inspectors.map((inspector) => (
                                <option key={inspector.id} value={inspector.id}>
                                    {inspector.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label required>Scheduled Date</Label>
                            <input
                                type="date"
                                value={scheduledDate}
                                onChange={(e) => setScheduledDate(e.target.value)}
                                min={new Date().toISOString().split("T")[0]}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all shadow-xs"
                            />
                        </div>
                        <div>
                            <Label required>Deadline Date</Label>
                            <input
                                type="date"
                                value={deadlineDate}
                                onChange={(e) => setDeadlineDate(e.target.value)}
                                min={scheduledDate || new Date().toISOString().split("T")[0]}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all shadow-xs"
                            />
                        </div>
                    </div>

                    <div>
                        <Label>Inspection Focus & Notes</Label>
                        <textarea
                            rows={3}
                            value={assignedNotes}
                            onChange={(e) => setAssignedNotes(e.target.value)}
                            placeholder="Add specific instructions or focus areas for the field inspection..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none shadow-xs"
                        />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/80">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all shadow-xs">
                        Cancel
                    </button>
                    <button
                        onClick={() =>
                            onSubmit({
                                inspector_id: inspectorId,
                                scheduled_date: scheduledDate,
                                deadline_date: deadlineDate,
                                assigned_notes: assignedNotes,
                            })
                        }
                        disabled={saving || !inspectorId || !scheduledDate || !deadlineDate}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Assigning..." : "Confirm Assignment"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Update Status Drawer Modal ──
function UpdateStatusDrawer({ onClose, onSubmit, saving, currentStatus }) {
    const [newStatus, setNewStatus] = useState("");
    const [remarks, setRemarks] = useState("");
    const availableStatuses = ["Technical Review", "Under Sangguniang Bayan", "For Release", "Released", "Denied"];

    return (
        <div className="fixed inset-0 z-[900] flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-xs">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50/80 flex justify-between items-center">
                    <div>
                        <span className="text-xs font-semibold text-blue-600">Workflow Action</span>
                        <h3 className="text-base font-bold text-slate-900">Update Application Status</h3>
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-5 space-y-4">
                    <div>
                        <Label required>Select Target Status</Label>
                        <select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all cursor-pointer shadow-xs"
                        >
                            <option value="">-- Choose New Status --</option>
                            {availableStatuses
                                .filter((s) => s !== currentStatus)
                                .map((s) => (
                                    <option key={s} value={s}>
                                        {s}
                                    </option>
                                ))}
                        </select>
                    </div>

                    <div>
                        <Label>Status Transition Remarks (Optional)</Label>
                        <textarea
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Add administrative notes, justification, or reason for this status update..."
                            className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none shadow-xs"
                        />
                    </div>
                </div>

                <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2.5 bg-slate-50/80">
                    <button onClick={onClose} className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-all shadow-xs">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit({ new_status: newStatus, remarks })}
                        disabled={saving || !newStatus}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Updating..." : "Confirm Status Update"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Main Page Component ──
export default function Show({ auth, application: initialApp, app: alternateApp, inspectors = [], errors: serverErrors = {} }) {
    const app = initialApp || alternateApp || {};

    const uniqueParcels = useMemo(() => {
        if (!app.parcels) return [];
        const map = new Map();
        app.parcels.forEach((p) => map.set(p.id, p));
        return Array.from(map.values());
    }, [app.parcels]);

    const [parcelReviews, setParcelReviews] = useState({});
    const [liveStatuses, setLiveStatuses] = useState({});

    const handleLiveStatusUpdate = (parcelId, status) => {
        setLiveStatuses((prev) => {
            if (prev[parcelId] === status) return prev;
            return { ...prev, [parcelId]: status };
        });
    };

    useEffect(() => {
        if (uniqueParcels && Object.keys(parcelReviews).length === 0) {
            const initial = {};
            uniqueParcels.forEach((p) => {
                const tr = p.technical_reviews?.[0] || {};
                initial[p.id] = {
                    decision: tr.decision || "",
                    decision_reason: tr.decision_reason || "",
                    findings: tr.findings || "",
                    inspector_id: p.site_inspection?.inspector_id || "",
                    scheduled_date: p.site_inspection?.scheduled_date ? p.site_inspection.scheduled_date.split("T")[0] : "",
                    deadline_date: p.site_inspection?.deadline_date ? p.site_inspection.deadline_date.split("T")[0] : "",
                };
            });
            setParcelReviews(initial);
        }
    }, [uniqueParcels]);

    const handleParcelReviewChange = (parcelId, field, val) => {
        setParcelReviews((prev) => ({
            ...prev,
            [parcelId]: {
                ...prev[parcelId],
                [field]: val,
            },
        }));
    };

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [saving, setSaving] = useState(false);
    const [showAssignDrawer, setShowAssignDrawer] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [toast, setToast] = useState(null);
    const [errors, setErrors] = useState(serverErrors);

    const [form, setForm] = useState({
        inspector_id: app.inspector_id || "",
        scheduled_date: app.scheduled_date ? app.scheduled_date.split("T")[0] : "",
        assigned_notes: app.assigned_notes || "",
    });

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Geospatial States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [landUseMapData, setLandUseMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(0);
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

        fetch("/geojson/rosario_batangas_dummy_parcels.geojson")
            .then((res) => res.json())
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

    const handleAssignSubmit = (assignmentData) => {
        showToast("Processing inspector assignment...", "success");
        const finalForm = {
            ...form,
            inspector_id: assignmentData.inspector_id,
            scheduled_date: assignmentData.scheduled_date,
            assigned_notes: assignmentData.assigned_notes,
        };
        setForm(finalForm);
        setSaving(true);

        const payload = { ...finalForm, id: app.id };

        router.post("/technical-review/update-status", payload, {
            preserveScroll: true,
            onSuccess: () => {
                Swal.fire({
                    icon: "success",
                    title: "Inspector Assigned",
                    text: "Field inspection has been scheduled successfully.",
                    confirmButtonColor: "#2563eb",
                    customClass: { popup: "rounded-2xl" },
                });
                setShowAssignDrawer(false);
            },
            onError: (errs) => {
                setErrors(errs);
                showToast(Object.values(errs)[0] || "Submission failed.", "error");
            },
            onFinish: () => setSaving(false),
        });
    };

    const handleBatchSubmit = () => {
        let isValid = true;
        let errorMessage = "";

        for (let i = 0; i < uniqueParcels.length; i++) {
            const pId = uniqueParcels[i].id;
            const review = parcelReviews[pId];

            if (!review || !review.decision) {
                isValid = false;
                errorMessage = `Please select an evaluation decision for Parcel ${i + 1}.`;
                break;
            }

            if (review.decision === "Declined" && !review.decision_reason?.trim()) {
                isValid = false;
                errorMessage = `Reason for declination is required for Parcel ${i + 1}.`;
                break;
            }

            if (review.decision === "Needs Site Inspection" && (!review.inspector_id || !review.scheduled_date || !review.deadline_date)) {
                isValid = false;
                errorMessage = `Inspector, scheduled date, and deadline are required for Parcel ${i + 1}.`;
                break;
            }
        }

        if (!isValid) {
            showToast(errorMessage, "error");
            return;
        }

        setSaving(true);
        showToast("Processing batch review...", "success");

        const payload = {
            application_id: app.id,
            reviews: parcelReviews,
        };

        router.post("/technical-review/submit-batch", payload, {
            onSuccess: () => {
                Swal.fire({
                    icon: "success",
                    title: "Batch Review Submitted",
                    text: "All parcel evaluations have been recorded successfully.",
                    confirmButtonColor: "#2563eb",
                    customClass: { popup: "rounded-2xl" },
                });
            },
            onError: (errs) => {
                setErrors(errs);
                setSaving(false);
                showToast("Batch submission failed. Please verify the input values.", "error");
            },
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

    const formatFee = (fee) => "₱" + parseFloat(fee || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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

    const handleGeneralStatusSubmit = (updateData) => {
        setSaving(true);
        router.post(
            "/applications/update-status",
            {
                id: app.id,
                new_status: updateData.new_status,
                remarks: updateData.remarks,
            },
            {
                preserveScroll: true,
                onSuccess: () => {
                    Swal.fire({
                        icon: "success",
                        title: "Status Updated",
                        text: `Application moved to ${updateData.new_status}.`,
                        confirmButtonColor: "#2563eb",
                        customClass: { popup: "rounded-2xl" },
                    });
                    setShowStatusModal(false);
                },
                onError: (errs) => {
                    setErrors(errs);
                    showToast(Object.values(errs)[0] || "Failed to update status.", "error");
                },
                onFinish: () => setSaving(false),
            },
        );
    };

    const activeParcelData = uniqueParcels?.[activeParcelIndex] || uniqueParcels?.[0] || {};
    const siteInspection = activeParcelData?.site_inspection || null;
    const effectiveActiveStatus = liveStatuses[activeParcelData?.id]?.toLowerCase() || siteInspection?.status?.toLowerCase();
    
    const showDecisionButtons = !siteInspection || ["completed", "submitted"].includes(effectiveActiveStatus);
    const hasCompletedInspection = siteInspection && ["completed", "submitted"].includes(effectiveActiveStatus);

    const isBatchSubmitAllowed = uniqueParcels.every((parcel) => {
        const effectiveStatus = liveStatuses[parcel.id]?.toLowerCase() || parcel.site_inspection?.status?.toLowerCase();
        return !parcel.site_inspection || ["completed", "submitted"].includes(effectiveStatus);
    });

    return (
        <>
            <Head title={`Application: ${app.reference_number || "Detail"} | iMAPS`} />
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
                        activePage="applications" 
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
                                href="/applications" 
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 text-slate-700 hover:text-slate-900 text-xs font-semibold border border-slate-200/80 transition-all shadow-2xs active:scale-95 group cursor-pointer"
                                title="Return to All Records"
                            >
                                <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-700 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                                </svg>
                                <span>All Records</span>
                            </Link>
                            <span className="text-slate-300">/</span>
                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                                {app.reference_number || `APP-${app.id}`}
                            </span>
                            <span className="hidden sm:inline text-xs text-slate-500 font-medium">
                                · Brgy. {app.barangay}
                            </span>
                        </div>

                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowStatusModal(true)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-all active:scale-98"
                            >
                                <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                <span>Update Status</span>
                            </button>
                        </div>
                    </div>

                    {/* ── WORKSPACE CONTENT ── */}
                    <main className="flex-1 w-full h-full flex flex-col bg-white overflow-hidden relative">
                        {toast && (
                            <div className="absolute top-4 right-4 z-[999] pointer-events-none">
                                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl max-w-sm pointer-events-auto transition-all ${toast.type === "success" ? "bg-slate-900 text-white border-slate-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                                    <p className="font-semibold text-xs flex-1">{toast.msg}</p>
                                    <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="w-full h-full bg-white flex flex-col lg:flex-row flex-1 min-h-0">
                            {/* ── LEFT SIDE: MAP ── */}
                            <div className="hidden lg:flex flex-col lg:w-1/2 bg-slate-50 border-r border-slate-200 relative">
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

                                {/* Floating HUD */}
                                <div className="absolute top-4 left-4 right-4 z-10 pointer-events-none">
                                    {uniqueParcels?.map(
                                        (parcel, idx) =>
                                            idx === activeParcelIndex &&
                                            parcel.property_index_number && (
                                                <div key={idx} className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-slate-200/80 pointer-events-auto max-w-sm">
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-2.5">
                                                        <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md">
                                                            {parcel.parcel_code || `Parcel ${idx + 1}`} Overview
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
                                                            <p className="font-semibold text-slate-800">Brgy. {app.barangay || "—"}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                    )}
                                </div>
                            </div>

                            {/* ── RIGHT SIDE: EVALUATION & DETAILS ── */}
                            <div className="flex-1 flex flex-col relative overflow-hidden lg:w-1/2">
                                {/* Header Info */}
                                <div className="bg-white px-6 py-4 border-b border-slate-200/80 shrink-0 z-10 flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-mono text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200/60">
                                                {app.reference_number || `APP-${app.id}`}
                                            </span>
                                            <span className="text-xs font-medium text-slate-400">Brgy. {app.barangay}</span>
                                        </div>
                                        <h2 className="text-xl font-bold text-slate-900 tracking-tight">{app.applicant_name}</h2>
                                        <p className="text-xs text-slate-500 font-medium mt-0.5">{app.application_type}</p>
                                    </div>
                                    <div className="text-right">
                                        <StatusBadge status={app.status} />
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mt-2">Assessment Fee</p>
                                        <p className="font-mono text-sm font-bold text-slate-900">{formatFee(app.assessment_fee)}</p>
                                    </div>
                                </div>

                                <div className="flex-1 p-5 sm:p-7 overflow-y-auto relative">
                                    <div className="max-w-xl mx-auto space-y-5">
                                        {app.status === "Technical Review" ? (
                                            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                                                {/* Parcel Tabs */}
                                                <div className="bg-slate-50/80 border-b border-slate-200/80 px-3 pt-2 flex gap-1.5 overflow-x-auto">
                                                    {uniqueParcels?.map((parcel, idx) => {
                                                        const isActive = activeParcelIndex === idx;
                                                        const decision = parcelReviews[parcel.id]?.decision;

                                                        const getIndicatorColor = () => {
                                                            if (decision === "Approved") return "bg-emerald-500";
                                                            if (decision === "Needs Site Inspection") return "bg-amber-500";
                                                            if (decision === "Declined") return "bg-rose-500";
                                                            return "bg-slate-300";
                                                        };

                                                        return (
                                                            <button
                                                                key={parcel.id}
                                                                type="button"
                                                                onClick={() => setActiveParcelIndex(idx)}
                                                                className={`px-3.5 py-2 text-xs font-semibold flex items-center gap-2 rounded-t-xl transition-all border-t border-x ${
                                                                    isActive
                                                                        ? "bg-white text-blue-700 border-slate-200 shadow-xs"
                                                                        : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                                                                }`}
                                                            >
                                                                <span className={`w-2 h-2 rounded-full ${getIndicatorColor()}`} />
                                                                <span>Parcel {idx + 1}</span>
                                                                <span className="font-mono text-[10px] text-slate-400">({parcel.property_index_number?.slice(-4) || "---"})</span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>

                                                {activeParcelData && (
                                                    <div className="p-5 space-y-4" key={`parcel-${activeParcelData.id}`}>
                                                        <ParcelInspectionStatus
                                                            inspectionId={activeParcelData.site_inspection?.id}
                                                            onStatusFetched={(status) => handleLiveStatusUpdate(activeParcelData.id, status)}
                                                        />
                                                        
                                                        {showDecisionButtons ? (
                                                            <>
                                                                <div>
                                                                    <Label>Parcel Evaluation Decision</Label>
                                                                    <div className="grid grid-cols-3 gap-2.5 mt-1">
                                                                        {["Approved", "Needs Site Inspection", "Declined"].map((d) => {
                                                                            const currentDecision = parcelReviews[activeParcelData.id]?.decision;
                                                                            const isSelected = currentDecision === d;

                                                                            let displayLabel = d;
                                                                            if (d === "Needs Site Inspection" && hasCompletedInspection) {
                                                                                displayLabel = "Re-inspect Parcel";
                                                                            } else if (d === "Approved") {
                                                                                displayLabel = "Approve";
                                                                            } else if (d === "Declined") {
                                                                                displayLabel = "Decline";
                                                                            }

                                                                            return (
                                                                                <button
                                                                                    type="button"
                                                                                    key={d}
                                                                                    onClick={() => handleParcelReviewChange(activeParcelData.id, "decision", d)}
                                                                                    className={`py-2 px-3 rounded-xl text-xs font-semibold transition-all border text-center ${
                                                                                        isSelected
                                                                                            ? d === "Approved"
                                                                                                ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-xs ring-1 ring-emerald-500"
                                                                                                : d === "Declined"
                                                                                                ? "bg-rose-50 border-rose-500 text-rose-700 shadow-xs ring-1 ring-rose-500"
                                                                                                : "bg-amber-50 border-amber-500 text-amber-700 shadow-xs ring-1 ring-amber-500"
                                                                                            : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                                                    }`}
                                                                                >
                                                                                    {displayLabel}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>

                                                                <div className="space-y-3.5">
                                                                    {parcelReviews[activeParcelData.id]?.decision === "Declined" && (
                                                                        <div>
                                                                            <Label required>Reason for Declination</Label>
                                                                            <Textarea
                                                                                rows={2}
                                                                                value={parcelReviews[activeParcelData.id]?.decision_reason || ""}
                                                                                onChange={(e) => handleParcelReviewChange(activeParcelData.id, "decision_reason", e.target.value)}
                                                                                placeholder="Specify the regulatory basis for declining this specific parcel..."
                                                                                hasError={true}
                                                                            />
                                                                        </div>
                                                                    )}

                                                                    {parcelReviews[activeParcelData.id]?.decision === "Needs Site Inspection" && (
                                                                        <div className="p-4 rounded-2xl border border-amber-200 bg-amber-50/40 space-y-3">
                                                                            <h4 className="text-xs font-bold text-amber-800">Schedule Field Task</h4>
                                                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                                <div>
                                                                                    <Label required>Select Inspector</Label>
                                                                                    <select
                                                                                        value={parcelReviews[activeParcelData.id]?.inspector_id || ""}
                                                                                        onChange={(e) => handleParcelReviewChange(activeParcelData.id, "inspector_id", e.target.value)}
                                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
                                                                                    >
                                                                                        <option value="">-- Choose --</option>
                                                                                        {inspectors.map((i) => (
                                                                                            <option key={i.id} value={i.id}>
                                                                                                {i.name}
                                                                                            </option>
                                                                                        ))}
                                                                                    </select>
                                                                                </div>
                                                                                <div>
                                                                                    <Label required>Inspection Date</Label>
                                                                                    <input
                                                                                        type="date"
                                                                                        min={new Date().toISOString().split("T")[0]}
                                                                                        value={parcelReviews[activeParcelData.id]?.scheduled_date || ""}
                                                                                        onChange={(e) => handleParcelReviewChange(activeParcelData.id, "scheduled_date", e.target.value)}
                                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
                                                                                    />
                                                                                </div>
                                                                                <div>
                                                                                    <Label required>Deadline</Label>
                                                                                    <input
                                                                                        type="date"
                                                                                        min={parcelReviews[activeParcelData.id]?.scheduled_date || new Date().toISOString().split("T")[0]}
                                                                                        value={parcelReviews[activeParcelData.id]?.deadline_date || ""}
                                                                                        onChange={(e) => handleParcelReviewChange(activeParcelData.id, "deadline_date", e.target.value)}
                                                                                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
                                                                                    />
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div>
                                                                        <Label>Evaluation Findings / Internal Remarks</Label>
                                                                        <Textarea
                                                                            rows={2}
                                                                            value={parcelReviews[activeParcelData.id]?.findings || ""}
                                                                            onChange={(e) => handleParcelReviewChange(activeParcelData.id, "findings", e.target.value)}
                                                                            placeholder="Add any internal technical notes regarding this parcel..."
                                                                        />
                                                                    </div>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start gap-3">
                                                                <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center shrink-0 text-amber-700">
                                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                                    </svg>
                                                                </div>
                                                                <div>
                                                                    <h4 className="text-xs font-bold text-amber-800">Inspection In Progress</h4>
                                                                    <p className="text-xs text-amber-700 mt-0.5 leading-relaxed font-medium">
                                                                        Evaluation decisions are temporarily locked while the site inspector processes this parcel.
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {isBatchSubmitAllowed && (
                                                    <div className="bg-slate-50/80 p-4 border-t border-slate-200 flex justify-end gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={handleBatchSubmit}
                                                            disabled={saving}
                                                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-xs shadow-sm transition-all active:scale-98"
                                                        >
                                                            {saving ? "Submitting..." : "Submit Batch Review"}
                                                            {!saving && (
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="max-w-xl mx-auto space-y-4">
                                                {/* Status Pipeline Progress Tracker */}
                                                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row items-center gap-5">
                                                    <div className="w-full flex-1 flex items-center justify-between relative before:absolute before:inset-0 before:top-[12px] before:h-[2px] before:w-full before:bg-slate-100 z-0 px-2">
                                                        {["Received", "Technical Review", "Under SB", "For Release", "Released"].map((step, idx) => {
                                                            const stepKey = step === "Under SB" ? "Under Sangguniang Bayan" : step;
                                                            const isCurrent = app.status === stepKey;
                                                            const isDenied = app.status === "Denied";
                                                            const statusIndex = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released"].indexOf(app.status);
                                                            const isPassed = statusIndex > idx && !isDenied;

                                                            return (
                                                                <div key={step} className="relative z-10 flex flex-col items-center gap-1.5 text-center w-16">
                                                                    <div
                                                                        className={`flex items-center justify-center w-6 h-6 rounded-full border-[2px] border-white shadow-xs shrink-0 transition-colors duration-300
                                                                            ${isCurrent ? "bg-blue-600 ring-2 ring-blue-500/20" : isPassed ? "bg-emerald-500" : "bg-slate-200"}
                                                                        `}
                                                                    >
                                                                        {isPassed ? (
                                                                            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                            </svg>
                                                                        ) : isCurrent ? (
                                                                            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
                                                                        ) : null}
                                                                    </div>
                                                                    <span
                                                                        className={`text-[10px] font-semibold leading-tight w-full break-words
                                                                            ${isCurrent ? "text-blue-700" : isPassed ? "text-slate-700" : "text-slate-400"}
                                                                        `}
                                                                    >
                                                                        {step}
                                                                    </span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="shrink-0 md:pl-5 md:border-l border-slate-100 flex items-center justify-center w-full md:w-auto pt-3 md:pt-0 border-t md:border-t-0">
                                                        <button
                                                            onClick={() => setShowStatusModal(true)}
                                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition-all active:scale-98 w-full justify-center"
                                                        >
                                                            <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                                            </svg>
                                                            <span>Update Status</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Application Dossier Card */}
                                                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                                                    <h4 className="text-xs font-bold text-slate-700 mb-3.5">
                                                        Dossier Parameters
                                                    </h4>
                                                    <div className="grid grid-cols-2 gap-y-3.5 gap-x-5 text-xs">
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Form Number</p>
                                                            <p className="font-semibold text-slate-800">{app.form_number || "—"}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Land Use Class</p>
                                                            <p className="font-semibold text-slate-800">{app.land_use_class || "—"}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Primary Contact</p>
                                                            <p className="font-mono font-semibold text-slate-800">{app.contact_number ? `+63 ${app.contact_number}` : "—"}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] text-slate-400 font-medium mb-0.5">Representative</p>
                                                            <p className="font-semibold text-slate-800">{app.representative_name || "N/A"}</p>
                                                        </div>
                                                        <div className="col-span-2 pt-2 border-t border-slate-100">
                                                            <p className="text-[10px] text-slate-400 font-medium mb-1">Operational Purpose</p>
                                                            <p className="text-xs font-medium text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                                                                {app.purpose || "—"}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Involved Parcels List */}
                                                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">
                                                    <h4 className="text-xs font-bold text-slate-700 mb-3.5">
                                                        Attached Spatial Parcels ({uniqueParcels?.length || 0})
                                                    </h4>
                                                    <div className="space-y-2.5">
                                                        {uniqueParcels?.map((parcel, idx) => (
                                                            <div
                                                                key={parcel.id}
                                                                onClick={() => setActiveParcelIndex(idx)}
                                                                className={`p-3 border rounded-xl cursor-pointer transition-all flex justify-between items-center ${
                                                                    activeParcelIndex === idx
                                                                        ? "bg-blue-50/80 border-blue-300 ring-1 ring-blue-500/20 shadow-xs"
                                                                        : "bg-slate-50/70 border-slate-200 hover:border-slate-300 hover:bg-white"
                                                                }`}
                                                            >
                                                                <div>
                                                                    <p className="text-xs font-bold text-slate-900">
                                                                        Parcel {idx + 1}
                                                                        <span className="text-slate-500 font-mono text-xs ml-1.5">({parcel.property_index_number || "No PIN"})</span>
                                                                    </p>
                                                                    <p className="text-xs text-slate-500 mt-0.5">
                                                                        Lot: {parcel.lot_number || "—"} · Area: {parcel.lot_area_sqm || "—"} SQ.M
                                                                    </p>
                                                                </div>
                                                                <span
                                                                    className={`text-xs font-semibold px-2.5 py-1 rounded-lg border transition-all ${
                                                                        activeParcelIndex === idx 
                                                                            ? "bg-blue-600 text-white border-blue-600 shadow-xs" 
                                                                            : "bg-white text-slate-600 border-slate-200"
                                                                    }`}
                                                                >
                                                                    {activeParcelIndex === idx ? "Viewing on Map" : "View Map"}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {showAssignDrawer && <AssignInspectorDrawer onClose={() => setShowAssignDrawer(false)} onSubmit={handleAssignSubmit} saving={saving} inspectors={inspectors} />}
            {showStatusModal && <UpdateStatusDrawer onClose={() => setShowStatusModal(false)} onSubmit={handleGeneralStatusSubmit} saving={saving} currentStatus={app.status} />}
        </>
    );
}