// resources/js/Pages/Applications/Show.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Status Badge Configuration ──
const STATUS_CONFIG = {
    Received: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200/50" },
    "Technical Review": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200/50" },
    "Under Sangguniang Bayan": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200/50" },
    "For Release": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200/50" },
    Released: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200/50" },
    Denied: { bg: "bg-red-50", text: "text-red-700", border: "border-red-200/50" },
};

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200/50" };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
            {status}
        </span>
    );
}

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();

    useEffect(() => {
        if (activeParcelFeature) {
            const layer = L.geoJSON(activeParcelFeature);
            map.flyToBounds(layer.getBounds(), { padding: [80, 80], maxZoom: 18, duration: 1.2 });
        } else if (brgyData) {
            const layer = L.geoJSON(brgyData);
            map.fitBounds(layer.getBounds(), { padding: [30, 30] });
        }
    }, [brgyData, activeParcelFeature, map]);

    return null;
}

// ── Premium Form Controls ──
function Label({ children, required, hasError }) {
    return (
        <label className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest mb-1.5 transition-colors ${hasError ? "text-red-500" : "text-slate-500"}`}>
            {children}
            {required && <span className="text-blue-500 font-black text-[14px] leading-none mt-0.5">*</span>}
        </label>
    );
}

const inputBaseStyles = (hasError) => `
    w-full px-3 py-2.5 text-[13px] font-medium transition-all duration-200 outline-none
    rounded-lg border border-slate-200 bg-white
    ${hasError ? "border-red-300 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20" : "focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"}
`;

const Textarea = ({ className = "", hasError = false, ...props }) => <textarea className={`${inputBaseStyles(hasError)} resize-none ${className}`} {...props} />;

// ── Assign Inspector Drawer (Modal Overlap) ──
function AssignInspectorDrawer({ onClose, onSubmit, saving, inspectors = [] }) {
    const [inspectorId, setInspectorId] = useState("");
    const [scheduledDate, setScheduledDate] = useState("");
    const [assignedNotes, setAssignedNotes] = useState("");

    return (
        <div className="absolute inset-0 z-[900] flex items-center justify-center p-4 form-enter" style={{ background: "rgba(15,23,42,.6)", backdropFilter: "blur(4px)" }}>
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Assign Site Inspector</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Select Personnel</label>
                        <select
                            value={inspectorId}
                            onChange={(e) => setInspectorId(e.target.value)}
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all cursor-pointer"
                        >
                            <option value="">-- Select an Inspector --</option>
                            {inspectors.map((inspector) => (
                                <option key={inspector.id} value={inspector.id}>
                                    {inspector.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Scheduled Date</label>
                        <input
                            type="date"
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={new Date().toISOString().split("T")[0]}
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Inspection Notes / Pointers</label>
                        <textarea
                            rows={3}
                            value={assignedNotes}
                            onChange={(e) => setAssignedNotes(e.target.value)}
                            placeholder="Add specific instructions or focus areas for the field inspection..."
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition-all">
                        Back
                    </button>
                    <button
                        onClick={() =>
                            onSubmit({
                                inspector_id: inspectorId,
                                scheduled_date: scheduledDate,
                                assigned_notes: assignedNotes,
                            })
                        }
                        disabled={saving || !inspectorId || !scheduledDate}
                        className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Assigning..." : "Confirm Assignment"}
                    </button>
                </div>
            </div>
        </div>
    );
}
// ── Update Status Drawer (Modal Overlap) ──
function UpdateStatusDrawer({ onClose, onSubmit, saving, currentStatus }) {
    const [newStatus, setNewStatus] = useState("");
    const [remarks, setRemarks] = useState("");

    // Status options for general transition updates
    const availableStatuses = ["Technical Review", "Under Sangguniang Bayan", "For Release", "Released", "Denied"];

    return (
        <div className="absolute inset-0 z-[900] flex items-center justify-center p-4 form-enter" style={{ background: "rgba(15,23,42,.6)", backdropFilter: "blur(4px)" }}>
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Update Status</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Select New Status</label>
                        <select
                            value={newStatus}
                            onChange={(e) => setNewStatus(e.target.value)}
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all cursor-pointer"
                        >
                            <option value="">-- Choose Status --</option>
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
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Remarks (Optional)</label>
                        <textarea
                            rows={3}
                            value={remarks}
                            onChange={(e) => setRemarks(e.target.value)}
                            placeholder="Add any internal notes or reasons for this status update..."
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition-all">
                        Cancel
                    </button>
                    <button
                        onClick={() => onSubmit({ new_status: newStatus, remarks })}
                        disabled={saving || !newStatus}
                        className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? "Updating..." : "Confirm Update"}
                    </button>
                </div>
            </div>
        </div>
    );
}
// ── Main Page Component ──
export default function Show({ auth, application: initialApp, app: alternateApp, inspectors = [], errors: serverErrors = {} }) {
    const app = initialApp || alternateApp || {};

    // ✅ HOOKS MOVED HERE: Now inside the React Component
    // 1. Add this state to track per-parcel reviews
    const [parcelReviews, setParcelReviews] = useState({});

    // 2. Initialize the state when the app data loads
    useEffect(() => {
        if (app.parcels && Object.keys(parcelReviews).length === 0) {
            const initial = {};
            app.parcels.forEach((p) => {
                initial[p.id] = {
                    decision: "",
                    findings: "",
                    decision_reason: "",
                };
            });
            setParcelReviews(initial);
        }
    }, [app]);

    // 3. Helper to update specific parcel state
    const handleParcelReviewChange = (parcelId, field, value) => {
        setParcelReviews((prev) => ({
            ...prev,
            [parcelId]: { ...prev[parcelId], [field]: value },
        }));
    };

    const userName = auth?.user?.name || "Julience";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [clock, setClock] = useState("");
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState(null);
    const [errors, setErrors] = useState(serverErrors);
    const [showAssignDrawer, setShowAssignDrawer] = useState(false);

    // Map States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [pinLookupMap, setPinLookupMap] = useState({});
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(0);
    const rosarioCenter = [13.845, 121.2063];

    // Technical Review Form States (Functions from TechnicalReviews/Index)
    const [form, setForm] = useState({
        application_id: app.id,
        decision: "",
        findings: app.findings || "",
        decision_reason: app.decision_reason || "",
        inspector_id: "",
        scheduled_date: "",
        assigned_notes: "",
    });

    const showToast = (msg, type = "success") => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    };

    const getGeometryCentroid = (geometry) => {
        if (!geometry?.type || !geometry.coordinates) return null;
        const averageRing = (ring) => {
            if (!Array.isArray(ring) || ring.length === 0) return null;
            const totals = ring.reduce(
                (acc, coordinate) => {
                    const [lng, lat] = coordinate;
                    return { lat: acc.lat + lat, lng: acc.lng + lng };
                },
                { lat: 0, lng: 0 },
            );
            return { lat: totals.lat / ring.length, lng: totals.lng / ring.length };
        };
        if (geometry.type === "Polygon") return averageRing(geometry.coordinates[0] || []);
        if (geometry.type === "MultiPolygon") return averageRing(geometry.coordinates?.[0]?.[0] || []);
        return null;
    };

    // Load GeoJSON and Populate Lookup Map
    useEffect(() => {
        fetch("/geojson/rosario_brgy_map.geojson")
            .then((res) => res.json())
            .then((data) => setBrgyMapData(data))
            .catch((err) => console.warn("Failed to load brgy map:", err));

        const loadParcelLookup = async () => {
            try {
                const response = await fetch("/geojson/rosario_batangas_dummy_parcels.geojson");
                if (!response.ok) throw new Error("Unable to load parcel lookup data");
                const payload = await response.json();
                setParcelMapData(payload);

                const lookupMap = {};
                (payload.features || []).forEach((feature) => {
                    const pin = feature?.properties?.property_index_number?.trim();
                    if (!pin) return;
                    lookupMap[pin] = feature;
                });
                setPinLookupMap(lookupMap);
            } catch (error) {
                console.warn("Parcel lookup geojson failed:", error);
            }
        };
        loadParcelLookup();
    }, []);

    // Monitor Parcel Index and Centering
    useEffect(() => {
        if (Object.keys(pinLookupMap).length > 0) {
            const parcels = app.parcels || [];
            const currentParcel = parcels[activeParcelIndex] || parcels[0] || app;
            const pin = currentParcel.property_index_number?.trim();
            if (pin && pinLookupMap[pin]) {
                setActiveParcelFeature(pinLookupMap[pin]);
            }
        }
    }, [pinLookupMap, activeParcelIndex, app]);

    // Handle Clock tick
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · " + now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const setField = (field) => (e) => {
        const val = e.target.type === "checkbox" ? e.target.checked : e.target.value;
        setForm((prev) => ({ ...prev, [field]: val }));
        if (errors[field]) {
            setErrors((err) => {
                const n = { ...err };
                delete n[field];
                return n;
            });
        }
    };

    const processSubmission = (submissionData) => {
        setSaving(true);
        const payload = {
            ...submissionData,
            id: app.id,
            status: submissionData.decision,
            new_status: submissionData.decision,
        };

        router.post("/applications/update-status", payload, {
            preserveScroll: true,
            onSuccess: () => {
                Swal.fire({
                    icon: "success",
                    title: "Review Submitted",
                    text: `Application review has been completed. Status is now ${payload.decision}.`,
                    confirmButtonColor: "#2563eb",
                    customClass: { popup: "rounded-2xl" },
                });
            },
            onError: (errs) => {
                setErrors(errs);
                showToast(Object.values(errs)[0] || "Submission failed.", "error");
            },
            onFinish: () => setSaving(false),
        });
    };

    const handleInitialSubmit = (e) => {
        e.preventDefault();
        if (!form.decision) return showToast("Please select a review decision.", "error");
        if (form.decision === "Declined" && !form.decision_reason?.trim()) {
            setErrors({ decision_reason: "Reason for declination is required." });
            return showToast("Reason is required for declination.", "error");
        }

        if (form.decision === "Needs Site Inspection") {
            setShowAssignDrawer(true);
        } else {
            processSubmission(form);
        }
    };

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
                    text: "The technical review is saved and inspection scheduled successfully.",
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
        // 1. Frontend Validation
        const parcels = app.parcels || [];
        let isValid = true;
        let errorMessage = "";

        for (let i = 0; i < parcels.length; i++) {
            const pId = parcels[i].id;
            const review = parcelReviews[pId];

            if (!review || !review.decision) {
                isValid = false;
                errorMessage = `Please make a decision for Parcel ${i + 1}.`;
                break;
            }

            if (review.decision === "Declined" && !review.decision_reason?.trim()) {
                isValid = false;
                errorMessage = `Reason for declination is required for Parcel ${i + 1}.`;
                break;
            }

            if (review.decision === "Needs Site Inspection" && (!review.inspector_id || !review.scheduled_date)) {
                isValid = false;
                errorMessage = `Inspector and scheduled date are required for Parcel ${i + 1}.`;
                break;
            }
        }

        if (!isValid) {
            showToast(errorMessage, "error");
            return; // Stop submission if validation fails
        }

       // 1. Set loading state immediately to disable the button
    setSaving(true); 
    showToast("Processing batch review...", "success");

    const payload = {
        application_id: app.id,
        reviews: parcelReviews,
    };

    router.post("/technical-review/submit-batch", payload, {
        preserveScroll: true,
        onSuccess: () => {
            // Once successful, the status will have updated in the backend,
            // and the UI will reflect the new status upon page refresh
            Swal.fire({
                icon: "success",
                title: "Batch Review Submitted",
                text: "All parcel evaluations have been processed successfully.",
                confirmButtonColor: "#2563eb",
            });
        },
        onError: (errs) => {
            setErrors(errs);
            // 2. Re-enable button on error so the user can fix the issue
            setSaving(false); 
            showToast("Batch submission failed. Please check the fields.", "error");
        },
    });
    };

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Securely end this session?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#1e40af",
            cancelButtonColor: "#ef4444",
            confirmButtonText: "Yes",
            customClass: { popup: "swal-small-modal", title: "text-slate-800 font-black" },
        }).then((res) => {
            if (res.isConfirmed) router.post("/logout");
        });
    };

    const formatFee = (fee) => "₱" + parseFloat(fee || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });

    const brgyStyle = {
        color: "#2563eb",
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.05,
        fillColor: "#3b82f6",
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties.property_index_number === feature.properties.property_index_number;
        return {
            color: isActive ? "#ef4444" : "#f97316",
            weight: isActive ? 3 : 1,
            opacity: 0.9,
            fillOpacity: isActive ? 0.6 : 0.3,
            fillColor: isActive ? "#ef4444" : "#fdba74",
        };
    };

    const activeParcelData = app.parcels?.[activeParcelIndex] || app.parcels?.[0] || {};
    // NEW STATES
    const [showStatusModal, setShowStatusModal] = useState(false);

    // NEW SUBMIT HANDLER
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
                        text: `Application moved to ${updateData.new_status}. SMS notification has been triggered.`,
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
    return (
        <>
            <Head title={`View Application: ${app.reference_number || "Detail"} | iMAPS`} />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }

                .swal-small-modal { width: 340px !important; padding: 1.5rem !important; border-radius: 20px !important; }
                .map-grid-bg { background-image: radial-gradient(#cbd5e1 1px, transparent 1px); background-size: 20px 20px; }

                .leaflet-container {
                    width: 100%;
                    height: 100%;
                    z-index: 0;
                }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <header className="h-14 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 sm:px-6 shrink-0 z-[700] sticky top-0">
                    <div className="flex items-center gap-4 lg:gap-6">
                        <Link href="/applications" className="flex items-center gap-2.5 group">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                </svg>
                            </div>
                            <span className="font-black text-lg tracking-tight text-slate-800">iMAPS</span>
                        </Link>
                        <div className="h-4 w-px bg-slate-200 hidden md:block" />
                        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">
                            <span className="flex h-1.5 w-1.5 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                            </span>
                            <span className="text-[9px] font-bold text-slate-600 tracking-widest uppercase">Rosario, Batangas</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center px-2 py-1 rounded-lg text-slate-500">
                            <span className="text-[11px] font-mono font-bold tracking-tight">{clock}</span>
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-2 pl-1 pr-2 py-1 cursor-pointer group hover:bg-slate-50 rounded-lg transition-colors" onClick={handleLogout}>
                            <div className="relative">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                    {userName?.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full" />
                            </div>
                            <div className="hidden sm:flex flex-col text-left justify-center">
                                <p className="text-[11px] font-bold text-slate-700 leading-tight group-hover:text-blue-700 transition-colors">{userName}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-0.5">{userRole}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 h-full overflow-hidden relative">
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />

                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-white" style={{ paddingLeft: sidebarOpen ? "200px" : "0px" }}>
                        <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                            {toast && (
                                <div className="fixed top-16 right-6 z-[999] pointer-events-none">
                                    <div
                                        className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-xl max-w-sm pointer-events-auto transition-all ${toast.type === "success" ? "bg-slate-900 text-white border-slate-800" : "bg-red-50 border-red-200 text-red-800"}`}
                                    >
                                        <p className="font-bold text-[12px] flex-1 leading-tight">{toast.msg}</p>
                                        <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div className="w-full h-full bg-white flex flex-col lg:flex-row flex-1 min-h-0 border-t border-slate-200">
                                {/* Left Side Map View (Create style) */}
                                <div className="hidden lg:flex flex-col lg:w-1/2 bg-slate-50 border-r border-slate-200 relative map-grid-bg">
                                    <div className="absolute inset-0 z-0">
                                        <MapContainer center={rosarioCenter} zoom={12} zoomControl={false} scrollWheelZoom={true}>
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                            {parcelMapData && <GeoJSON key={activeParcelFeature?.properties?.property_index_number || "parcels"} data={parcelMapData} style={getParcelStyle} />}
                                            <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />
                                        </MapContainer>
                                    </div>

                                    {/* Map overlay containing active parcel details */}
                                    <div className="absolute top-5 left-5 right-5 z-10 flex flex-col gap-3 pointer-events-none">
                                        {app.parcels?.map(
                                            (parcel, idx) =>
                                                idx === activeParcelIndex &&
                                                parcel.property_index_number && (
                                                    <div
                                                        key={idx}
                                                        className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.1)] pointer-events-auto transition-all animate-[formFadeIn_0.3s_ease-out] border border-slate-100 max-w-sm"
                                                    >
                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                                                            <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50/80 px-2 py-1 rounded-[6px] border border-blue-100/50">
                                                                {parcel.parcel_code || `P-${String(idx + 1).padStart(2, "0")}`} INFO
                                                            </span>
                                                            <span className="text-[10px] font-bold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-[6px] border border-slate-200/50 uppercase tracking-widest">
                                                                PIN: {parcel.property_index_number}
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Lot Number</p>
                                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">{parcel.lot_number || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Declared Area</p>
                                                                <p className="text-[13px] font-mono font-bold text-slate-800 leading-tight">
                                                                    {parcel.lot_area_sqm || "—"} <span className="text-[10px] font-bold text-slate-400 font-sans tracking-wide">SQ.M</span>
                                                                </p>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Jurisdiction</p>
                                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">Brgy. {app.barangay || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">TCT / Title No.</p>
                                                                <p className="text-[12px] font-mono font-medium text-slate-700 uppercase">{parcel.tct_number || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Tax Dec No.</p>
                                                                <p className="text-[12px] font-mono font-medium text-slate-700 uppercase">{parcel.tax_dec_number || "—"}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ),
                                        )}
                                    </div>
                                </div>

                                {/* Right Side Info & Evaluations Panel */}
                                <div className="flex-1 flex flex-col relative  overflow-hidden lg:w-1/2">
                                    {/* Application Top Summary Header (Sticky & Clean) */}
                                    <div className="bg-white px-6 py-5 border-b border-slate-200 shrink-0 z-10 shadow-sm flex items-start justify-between">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1.5">
                                                <span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                                                    {app.reference_number || "No Ref Number"}
                                                </span>
                                                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Brgy. {app.barangay}</span>
                                            </div>
                                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">{app.applicant_name}</h3>
                                            <p className="text-[13px] font-medium text-slate-500 mt-1">{app.application_type}</p>
                                        </div>
                                        <div className="text-right">
                                            <StatusBadge status={app.status} />
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Assessment Fee</p>
                                            <p className="font-mono font-black text-slate-700">{formatFee(app.assessment_fee)}</p>
                                        </div>
                                    </div>

                                    {/* Scrollable Content Area */}
                                    <div className="flex-1 p-3 overflow-y-auto relative">
                                        <div className="max-w-2xl mx-auto space-y-6">
                                            {/* 2. Conditional Section: Technical Review vs General Status */}
                                            {app.status === "Technical Review" ? (
                                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                                                    {/* Multi-Parcel Tabs */}
                                                    <div className="bg-slate-50/80 border-b border-slate-200 px-2 pt-2 flex gap-1 overflow-x-auto">
                                                        {app.parcels?.map((parcel, idx) => {
                                                            const isActive = activeParcelIndex === idx;
                                                            const decision = parcelReviews[parcel.id]?.decision;

                                                            // Visual indicator if a tab has a completed decision
                                                            const getIndicatorColor = () => {
                                                                if (decision === "Approved") return "bg-emerald-500";
                                                                if (decision === "Needs Site Inspection") return "bg-amber-500";
                                                                if (decision === "Declined") return "bg-red-500";
                                                                return "bg-slate-300";
                                                            };

                                                            return (
                                                                <button
                                                                    key={parcel.id}
                                                                    type="button"
                                                                    onClick={() => setActiveParcelIndex(idx)}
                                                                    className={`relative px-4 py-3 text-[12px] font-bold flex items-center gap-2 rounded-t-lg transition-all ${
                                                                        isActive
                                                                            ? "bg-white text-blue-700 border-t border-x border-slate-200 shadow-[0_4px_0_white_translate-y-[1px]]"
                                                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                                                                    }`}
                                                                    style={{ transform: isActive ? "translateY(1px)" : "none" }}
                                                                >
                                                                    <span className={`w-2 h-2 rounded-full ${getIndicatorColor()}`} />
                                                                    Parcel {idx + 1}{" "}
                                                                    <span className="font-mono text-[10px] font-medium text-slate-400 ml-1">({parcel.property_index_number?.slice(-4) || "---"})</span>
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    {/* Active Parcel Form Wrapper */}
                                                    {app.parcels?.[activeParcelIndex] && (
                                                        <div className="p-6 space-y-6 form-enter" key={`parcel-${app.parcels[activeParcelIndex].id}`}>
                                                            {/* Decision Route */}
                                                            <div>
                                                                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Parcel Evaluation Decision</h4>
                                                                <div className="grid grid-cols-3 gap-2">
                                                                    {["Approved", "Needs Site Inspection", "Declined"].map((d) => {
                                                                        const currentDecision = parcelReviews[app.parcels[activeParcelIndex].id]?.decision;
                                                                        const isSelected = currentDecision === d;
                                                                        return (
                                                                            <button
                                                                                type="button"
                                                                                key={d}
                                                                                onClick={() => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "decision", d)}
                                                                                className={`px-2 py-3 rounded-xl text-[11px] font-bold transition-all border text-center ${
                                                                                    isSelected
                                                                                        ? d === "Approved"
                                                                                            ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                                                                                            : d === "Declined"
                                                                                              ? "bg-red-50 border-red-500 text-red-700 shadow-sm"
                                                                                              : "bg-amber-50 border-amber-500 text-amber-700 shadow-sm"
                                                                                        : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                                                }`}
                                                                            >
                                                                                {d}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>

                                                            {/* Conditional Fields based on Decision */}
                                                            <div className="space-y-4">
                                                                {/* Reason for Declination */}
                                                                {parcelReviews[app.parcels[activeParcelIndex].id]?.decision === "Declined" && (
                                                                    <div className="form-enter">
                                                                        <Label required>Reason for Declination</Label>
                                                                        <Textarea
                                                                            rows={2}
                                                                            value={parcelReviews[app.parcels[activeParcelIndex].id]?.decision_reason || ""}
                                                                            onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "decision_reason", e.target.value)}
                                                                            placeholder="Specify the regulatory basis for declining this specific parcel..."
                                                                            className="border-red-200 bg-red-50/30 focus:border-red-500 focus:ring-red-500/20"
                                                                        />
                                                                    </div>
                                                                )}

                                                                {/* Inline Inspector Assignment */}
                                                                {parcelReviews[app.parcels[activeParcelIndex].id]?.decision === "Needs Site Inspection" && (
                                                                    <div className="form-enter p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3">
                                                                        <h4 className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-1">Schedule Field Task</h4>
                                                                        <div className="grid grid-cols-2 gap-3">
                                                                            <div>
                                                                                <Label required>Select Inspector</Label>
                                                                                <select
                                                                                    value={parcelReviews[app.parcels[activeParcelIndex].id]?.inspector_id || ""}
                                                                                    onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "inspector_id", e.target.value)}
                                                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
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
                                                                                    value={parcelReviews[app.parcels[activeParcelIndex].id]?.scheduled_date || ""}
                                                                                    onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "scheduled_date", e.target.value)}
                                                                                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* General Findings */}
                                                                <div>
                                                                    <Label>Evaluation Findings / Remarks</Label>
                                                                    <Textarea
                                                                        rows={2}
                                                                        value={parcelReviews[app.parcels[activeParcelIndex].id]?.findings || ""}
                                                                        onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "findings", e.target.value)}
                                                                        placeholder="Add any internal notes regarding this parcel..."
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Batch Submit Footer */}
                                                    <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                                                        <button
                                                            type="button"
                                                            onClick={handleBatchSubmit}
                                                            disabled={saving}
                                                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-[13px] shadow-sm transition-all active:scale-95"
                                                        >
                                                            {saving ? "Submitting..." : "Submit Batch Review"}
                                                            {!saving && (
                                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                </svg>
                                                            )}
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="max-w-2xl mx-auto space-y-6">
                                                    {/* 1. Horizontal Timeline & Action Header */}
                                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col md:flex-row items-center gap-6">
                                                        {/* Horizontal Timeline UI */}
                                                        <div className="w-full flex-1 flex items-center justify-between relative before:absolute before:inset-0 before:top-[14px] before:h-[2px] before:w-full before:bg-slate-100 z-0 px-2">
                                                            {["Received", "Technical Review", "Under SB", "For Release", "Released"].map((step, idx) => {
                                                                // Map "Under SB" back to the full status for logic checks
                                                                const stepKey = step === "Under SB" ? "Under Sangguniang Bayan" : step;
                                                                const isCurrent = app.status === stepKey;
                                                                const isDenied = app.status === "Denied";
                                                                const statusIndex = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released"].indexOf(app.status);
                                                                const isPassed = statusIndex > idx && !isDenied;

                                                                return (
                                                                    <div key={step} className="relative z-10 flex flex-col items-center gap-2 text-center w-16">
                                                                        {/* Status Marker */}
                                                                        <div
                                                                            className={`flex items-center justify-center w-7 h-7 rounded-full border-[3px] border-white shadow-sm shrink-0 transition-colors duration-300
                            ${isCurrent ? "bg-blue-600 shadow-[0_0_0_4px_rgba(37,99,235,0.1)]" : isPassed ? "bg-emerald-500" : "bg-slate-200"}
                        `}
                                                                        >
                                                                            {isPassed ? (
                                                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                                </svg>
                                                                            ) : isCurrent ? (
                                                                                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                                                                            ) : null}
                                                                        </div>
                                                                        {/* Label (Adjusted Font Weights) */}
                                                                        <span
                                                                            className={`text-[9px] uppercase tracking-widest leading-tight w-full break-words
                            ${isCurrent ? "text-blue-700 font-bold" : isPassed ? "text-slate-600 font-semibold" : "text-slate-400 font-medium"}
                        `}
                                                                        >
                                                                            {step}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {/* Update Status Action (Right Side) */}
                                                        <div className="shrink-0 md:pl-5 md:border-l border-slate-100 flex items-center justify-center w-full md:w-auto pt-4 md:pt-0 border-t md:border-t-0 mt-2 md:mt-0">
                                                            <button
                                                                onClick={() => setShowStatusModal(true)}
                                                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-[12px] font-semibold shadow-sm transition-all active:scale-95 w-full justify-center"
                                                            >
                                                                <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                                                    />
                                                                </svg>
                                                                Update Status
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* 2. Dossier / Application Parameters */}
                                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                                        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                                            <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path
                                                                    strokeLinecap="round"
                                                                    strokeLinejoin="round"
                                                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                                />
                                                            </svg>
                                                            Application Details
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Form Number</p>
                                                                <p className="text-[13px] font-medium text-slate-800">{app.form_number || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Land Use Class</p>
                                                                <p className="text-[13px] font-medium text-slate-800">{app.land_use_class || "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Primary Contact</p>
                                                                <p className="text-[13px] font-medium text-slate-800">{app.contact_number ? `+63 ${app.contact_number}` : "—"}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-0.5">Representative</p>
                                                                <p className="text-[13px] font-medium text-slate-800">{app.representative_name || "N/A"}</p>
                                                            </div>
                                                            <div className="col-span-2 pt-2 border-t border-slate-50">
                                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Operational Purpose</p>
                                                                <p className="text-[13px] font-medium text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                                                                    {app.purpose || "—"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* 3. Conditional Section: Technical Review vs General Parcels Overview */}
                                                    {app.status === "Technical Review" ? (
                                                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                                                            {/* Multi-Parcel Tabs */}
                                                            <div className="bg-slate-50/80 border-b border-slate-200 px-2 pt-2 flex gap-1 overflow-x-auto">
                                                                {app.parcels?.map((parcel, idx) => {
                                                                    const isActive = activeParcelIndex === idx;
                                                                    const decision = parcelReviews[parcel.id]?.decision;

                                                                    // Visual indicator if a tab has a completed decision
                                                                    const getIndicatorColor = () => {
                                                                        if (decision === "Approved") return "bg-emerald-500";
                                                                        if (decision === "Needs Site Inspection") return "bg-amber-500";
                                                                        if (decision === "Declined") return "bg-red-500";
                                                                        return "bg-slate-300";
                                                                    };

                                                                    return (
                                                                        <button
                                                                            key={parcel.id}
                                                                            type="button"
                                                                            onClick={() => setActiveParcelIndex(idx)}
                                                                            className={`relative px-4 py-3 text-[12px] font-semibold flex items-center gap-2 rounded-t-lg transition-all ${
                                                                                isActive
                                                                                    ? "bg-white text-blue-700 border-t border-x border-slate-200 shadow-[0_4px_0_white_translate-y-[1px]]"
                                                                                    : "text-slate-500 hover:text-slate-700 hover:bg-slate-100/50"
                                                                            }`}
                                                                            style={{ transform: isActive ? "translateY(1px)" : "none" }}
                                                                        >
                                                                            <span className={`w-2 h-2 rounded-full ${getIndicatorColor()}`} />
                                                                            Parcel {idx + 1}{" "}
                                                                            <span className="font-mono text-[10px] font-medium text-slate-400 ml-1">
                                                                                ({parcel.property_index_number?.slice(-4) || "---"})
                                                                            </span>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>

                                                            {/* Active Parcel Form Wrapper */}
                                                            {app.parcels?.[activeParcelIndex] && (
                                                                <div className="p-6 space-y-6 form-enter" key={`parcel-${app.parcels[activeParcelIndex].id}`}>
                                                                    {/* Decision Route */}
                                                                    <div>
                                                                        <h4 className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">Parcel Evaluation Decision</h4>
                                                                        <div className="grid grid-cols-3 gap-2">
                                                                            {["Approved", "Needs Site Inspection", "Declined"].map((d) => {
                                                                                const currentDecision = parcelReviews[app.parcels[activeParcelIndex].id]?.decision;
                                                                                const isSelected = currentDecision === d;
                                                                                return (
                                                                                    <button
                                                                                        type="button"
                                                                                        key={d}
                                                                                        onClick={() => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "decision", d)}
                                                                                        className={`px-2 py-3 rounded-xl text-[11px] font-semibold transition-all border text-center ${
                                                                                            isSelected
                                                                                                ? d === "Approved"
                                                                                                    ? "bg-emerald-50 border-emerald-500 text-emerald-700 shadow-sm"
                                                                                                    : d === "Declined"
                                                                                                      ? "bg-red-50 border-red-500 text-red-700 shadow-sm"
                                                                                                      : "bg-amber-50 border-amber-500 text-amber-700 shadow-sm"
                                                                                                : "bg-white border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                                                        }`}
                                                                                    >
                                                                                        {d}
                                                                                    </button>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>

                                                                    {/* Conditional Fields based on Decision */}
                                                                    <div className="space-y-4">
                                                                        {/* Reason for Declination */}
                                                                        {parcelReviews[app.parcels[activeParcelIndex].id]?.decision === "Declined" && (
                                                                            <div className="form-enter">
                                                                                <Label required>Reason for Declination</Label>
                                                                                <Textarea
                                                                                    rows={2}
                                                                                    value={parcelReviews[app.parcels[activeParcelIndex].id]?.decision_reason || ""}
                                                                                    onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "decision_reason", e.target.value)}
                                                                                    placeholder="Specify the regulatory basis for declining this specific parcel..."
                                                                                    className="border-red-200 bg-red-50/30 focus:border-red-500 focus:ring-red-500/20"
                                                                                />
                                                                            </div>
                                                                        )}

                                                                        {/* Inline Inspector Assignment */}
                                                                        {parcelReviews[app.parcels[activeParcelIndex].id]?.decision === "Needs Site Inspection" && (
                                                                            <div className="form-enter p-4 rounded-xl border border-amber-200 bg-amber-50/30 space-y-3">
                                                                                <h4 className="text-[10px] font-semibold uppercase tracking-widest text-amber-700 mb-1">Schedule Field Task</h4>
                                                                                <div className="grid grid-cols-2 gap-3">
                                                                                    <div>
                                                                                        <Label required>Select Inspector</Label>
                                                                                        <select
                                                                                            value={parcelReviews[app.parcels[activeParcelIndex].id]?.inspector_id || ""}
                                                                                            onChange={(e) =>
                                                                                                handleParcelReviewChange(app.parcels[activeParcelIndex].id, "inspector_id", e.target.value)
                                                                                            }
                                                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
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
                                                                                            value={parcelReviews[app.parcels[activeParcelIndex].id]?.scheduled_date || ""}
                                                                                            onChange={(e) =>
                                                                                                handleParcelReviewChange(app.parcels[activeParcelIndex].id, "scheduled_date", e.target.value)
                                                                                            }
                                                                                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[12px] font-medium text-slate-700 outline-none focus:border-blue-500 bg-white"
                                                                                        />
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        )}

                                                                        {/* General Findings */}
                                                                        <div>
                                                                            <Label>Evaluation Findings / Remarks</Label>
                                                                            <Textarea
                                                                                rows={2}
                                                                                value={parcelReviews[app.parcels[activeParcelIndex].id]?.findings || ""}
                                                                                onChange={(e) => handleParcelReviewChange(app.parcels[activeParcelIndex].id, "findings", e.target.value)}
                                                                                placeholder="Add any internal notes regarding this parcel..."
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Batch Submit Footer */}
                                                            <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                                                                <button
                                                                    type="button"
                                                                    onClick={handleBatchSubmit}
                                                                    disabled={saving}
                                                                    className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-[13px] shadow-sm transition-all active:scale-95"
                                                                >
                                                                    {saving ? "Submitting..." : "Submit Batch Review"}
                                                                    {!saving && (
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                                        </svg>
                                                                    )}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        /* Non-Technical Review State: Read-only Parcels List */
                                                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                                            <h4 className="text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                                                                <svg className="w-4 h-4 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                    <path
                                                                        strokeLinecap="round"
                                                                        strokeLinejoin="round"
                                                                        d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
                                                                    />
                                                                </svg>
                                                                Involved Parcels
                                                            </h4>
                                                            <div className="space-y-3">
                                                                {app.parcels?.map((parcel, idx) => (
                                                                    <div
                                                                        key={parcel.id}
                                                                        onClick={() => setActiveParcelIndex(idx)}
                                                                        className={`p-3 border rounded-lg cursor-pointer transition-all flex justify-between items-center ${
                                                                            activeParcelIndex === idx
                                                                                ? "bg-blue-50 border-blue-200 shadow-sm"
                                                                                : "bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-white"
                                                                        }`}
                                                                    >
                                                                        <div>
                                                                            <p className="text-[12px] font-semibold text-slate-800">
                                                                                Parcel {idx + 1}
                                                                                <span className="text-slate-400 font-mono text-[10px] ml-1">({parcel.property_index_number || "No PIN"})</span>
                                                                            </p>
                                                                            <p className="text-[10px] text-slate-500 mt-0.5">
                                                                                Lot: {parcel.lot_number || "—"} • Area: {parcel.lot_area_sqm || "—"} SQ.M
                                                                            </p>
                                                                        </div>
                                                                        <span
                                                                            className={`text-[10px] font-semibold px-2 py-1 rounded shadow-sm border ${
                                                                                activeParcelIndex === idx ? "bg-blue-600 text-white border-blue-700" : "bg-white text-slate-500 border-slate-200"
                                                                            }`}
                                                                        >
                                                                            {activeParcelIndex === idx ? "Viewing Map" : "View Map"}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
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

            {/* Site Inspector Assignment Overlap Drawer */}
            {showAssignDrawer && <AssignInspectorDrawer onClose={() => setShowAssignDrawer(false)} onSubmit={handleAssignSubmit} saving={saving} inspectors={inspectors} />}
            {/* NEW: General Status Update Drawer */}
            {showStatusModal && <UpdateStatusDrawer onClose={() => setShowStatusModal(false)} onSubmit={handleGeneralStatusSubmit} saving={saving} currentStatus={app.status} />}
        </>
    );
}
