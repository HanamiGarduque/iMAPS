// resources/js/Pages/Applications/Create.jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, Head, router, usePage } from "@inertiajs/react";
import Swal from "sweetalert2";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";


const APPLICATION_TYPES = [
    {
        id: "Locational Clearance",
        icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
        desc: "Standard building clearance.",
    },
    {
        id: "Zoning Certification",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        desc: "Land use compatibility.",
    },
    {
        id: "Development Permit",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
        desc: "For major subdivisions.",
    },
];

const LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agro-Industrial", "Special Use"];

const STEPS = [
    { id: 1, title: "Scope" },
    { id: 2, title: "Profile" },
    { id: 3, title: "Location" },
    { id: 4, title: "Review" },
    { id: 5, title: "Assess" },
];

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();

    useEffect(() => {
        if (activeParcelFeature) {
            const layer = L.geoJSON(activeParcelFeature);
            const bounds = layer.getBounds();
            
            // Check if bounds are valid before flying
            if (bounds.isValid()) {
                map.flyToBounds(bounds, { padding: [80, 80], maxZoom: 18, duration: 1.2 });
            } else {
                console.warn("Invalid geometry for the selected parcel.");
            }
        } else if (brgyData) {
            const layer = L.geoJSON(brgyData);
            const bounds = layer.getBounds();
            
            if (bounds.isValid()) {
                map.fitBounds(bounds, { padding: [30, 30] });
            }
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

const inputBaseStyles = (hasError, readOnly) => `
    w-full px-3 py-2.5 text-[13px] font-medium transition-all duration-200 outline-none
    placeholder:text-slate-300 placeholder:font-normal
    ${
        readOnly
            ? "bg-transparent text-slate-600 border-b border-slate-200 rounded-none px-1"
            : hasError
              ? "rounded-lg border border-red-300 bg-red-50 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : "rounded-lg border border-slate-200 bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
    }
`;

const Input = ({ className = "", hasError = false, readOnly = false, ...props }) => <input className={`${inputBaseStyles(hasError, readOnly)} ${className}`} readOnly={readOnly} {...props} />;
const Textarea = ({ className = "", hasError = false, ...props }) => <textarea className={`${inputBaseStyles(hasError, false)} resize-none ${className}`} {...props} />;
const Select = ({ children, className = "", hasError = false, ...props }) => (
    <div className="relative group">
        <select className={`${inputBaseStyles(hasError, false)} appearance-none pr-10 cursor-pointer ${className}`} {...props}>
            {children}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
            </svg>
        </div>
    </div>
);

export default function Create({ auth, errors: serverErrors = {} }) {
    const userName = auth?.user?.name || "Julience";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [clock, setClock] = useState("");
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [flash, setFlash] = useState(null);
    const [errors, setErrors] = useState(serverErrors);
    const formRef = useRef(null);

    // Map States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(null); 
    const rosarioCenter = [13.8450, 121.2063];

    const [form, setForm] = useState({
        application_type: "",
        form_number: "",
        land_use_class: "",
        purpose: "",
        applicant_name: "",
        contact_number: "",
        email: "",
        representative_name: "",
        barangay: "",
        assessment_fee: "",
        or_number: "",
        remarks: "",

        parcels: [
            {
                parcel_code: "P-01",
                property_index_number: "",
                property_tax_number: "",
                lot_number: "",
                tct_number: "",
                tax_dec_number: "",
                lot_area_sqm: "",
                coordinates: "",
            },
        ],
    });

    const addParcel = () => {
        setForm((prev) => ({
            ...prev,
            parcels: [
                ...prev.parcels,
                {
                    parcel_code: `P-${String(prev.parcels.length + 1).padStart(2, "0")}`,
                    property_index_number: "",
                    property_tax_number: "",
                    barangay: "",
                    lot_number: "",
                    tct_number: "",
                    tax_dec_number: "",
                    lot_area_sqm: "",
                    coordinates: "",
                },
            ],
        }));
    };

    const removeParcel = (index) => {
        setForm((prev) => ({
            ...prev,
            parcels: prev.parcels.filter((_, i) => i !== index),
        }));
        if (activeParcelIndex === index) setActiveParcelIndex(null);
    };

    const setParcelField = (index, field) => (e) => {
        const value = e.target.value;
        setForm((prev) => ({
            ...prev,
            parcels: prev.parcels.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
        }));

        const nestedField = `parcels.${index}.${field}`;
        if (errors[nestedField]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[nestedField];
                return next;
            });
        }
    };

    const parcelFieldError = (index, field) => (errors[`parcels.${index}.${field}`] ? <p className="text-[10px] font-bold text-red-500 mt-1">{errors[`parcels.${index}.${field}`]}</p> : null);

    const totalAreaSqm = form.parcels.reduce((sum, p) => sum + (parseFloat(p.lot_area_sqm) || 0), 0);

    const [pinLookupMap, setPinLookupMap] = useState({});
    const [pinLoading, setPinLoading] = useState({});

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
            return {
                lat: totals.lat / ring.length,
                lng: totals.lng / ring.length,
            };
        };

        if (geometry.type === "Polygon") {
            return averageRing(geometry.coordinates[0] || []);
        }

        if (geometry.type === "MultiPolygon") {
            return averageRing(geometry.coordinates?.[0]?.[0] || []);
        }

        return null;
    };

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
                    const centroid = getGeometryCentroid(feature.geometry);
                    lookupMap[pin] = {
                        feature: feature, 
                        property_index_number: pin,
                        property_tax_number: feature.properties?.property_tax_number || "",
                        barangay: feature.properties?.barangay || "",
                        tct_number: feature.properties?.tct_number || "",
                        tax_dec_number: feature.properties?.tax_dec_number || "",
                        lot_number: feature.properties?.lot_number || "",
                        lot_area_sqm: feature.properties?.lot_area_sqm != null ? String(feature.properties.lot_area_sqm) : "",
                        coordinates: centroid ? `${centroid.lat.toFixed(6)},${centroid.lng.toFixed(6)}` : "",
                    };
                });

                setPinLookupMap(lookupMap);
            } catch (error) {
                console.warn("Parcel lookup geojson failed:", error);
            }
        };

        loadParcelLookup();
    }, []);

    // ── FIXED LOOKUP FUNCTION ──
    const lookupPin = async (pin) => {
        const normalizedPin = pin?.trim();
        if (!normalizedPin) throw new Error("Property Index Number is required");

        if (pinLookupMap[normalizedPin]) {
            return pinLookupMap[normalizedPin];
        }

        const res = await fetch(`/api/tax-map/lookup/${encodeURIComponent(normalizedPin)}`);
        
        // Handle non-JSON or non-200 responses safely
        if (!res.ok) {
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                const payload = await res.json();
                throw new Error(payload.message || "PIN not found");
            } else {
                throw new Error("Unable to locate parcel. Please check your network or PIN input.");
            }
        }
        
        const payload = await res.json();
        return payload.data;
    };

    const handlePinLookup = async (index) => {
    const pin = form.parcels[index]?.property_index_number?.trim();
    
    const isDuplicate = form.parcels.some((p, i) => i !== index && p.property_index_number?.trim() === pin);
    if (isDuplicate) {
        setErrors((prev) => ({
            ...prev,
            [`parcels.${index}.property_index_number`]: "This PIN is already attached to another parcel.",
        }));
        setFlash({ type: "error", msg: "Duplicate PIN detected." });
        setTimeout(() => setFlash(null), 4000);
        return;
    }

    setPinLoading((prev) => ({ ...prev, [index]: true }));

    try {
        const data = await lookupPin(pin);
        
        if (data.feature) {
            setActiveParcelFeature(data.feature);
            setActiveParcelIndex(index); 
        }

        setForm((prev) => {
            // If this is the first (primary) parcel being looked up, set the application-level barangay
            const newBarangay = (index === 0 && data.barangay) ? data.barangay : prev.barangay;

            return {
                ...prev,
                barangay: newBarangay, // <-- FIX: Set the root form.barangay here
                parcels: prev.parcels.map((p, i) =>
                    i === index
                        ? {
                              ...p,
                              property_index_number: data.property_index_number || p.property_index_number,
                              barangay: data.barangay || p.barangay || "",
                              property_tax_number: data.property_tax_number || p.property_tax_number || "",
                              lot_number: data.lot_number || p.lot_number || "",                              
                              tct_number: data.tct_number || p.tct_number || "",
                              tax_dec_number: data.tax_dec_number || p.tax_dec_number || "",
                              lot_area_sqm: data.lot_area_sqm ?? p.lot_area_sqm,
                              coordinates: data.coordinates || (data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : p.coordinates),
                          }
                        : p,
                ),
            };
        });

        setErrors((prev) => {
            const next = { ...prev };
            delete next[`parcels.${index}.property_index_number`];
            // Clear the hidden barangay error if it exists
            delete next.barangay; 
            return next;
        });
    } catch (err) {
        const message = err?.message || "Lookup failed";
        setErrors((prev) => ({
            ...prev,
            [`parcels.${index}.property_index_number`]: message,
        }));
    } finally {
        setPinLoading((prev) => ({ ...prev, [index]: false }));
    }
};

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                }) +
                    " · " +
                    now.toLocaleTimeString("en-PH", {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Securely end this session?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonColor: "#1e40af",
            cancelButtonColor: "#ef4444",
            confirmButtonText: "Yes",
            customClass: {
                popup: "swal-small-modal",
                title: "text-slate-800 font-black",
            },
        }).then((res) => {
            if (res.isConfirmed) router.post("/logout");
        });
    };

    const set = (field) => (e) => {
        setForm((f) => ({ ...f, [field]: e.target.value }));
        if (errors[field])
            setErrors((err) => {
                const n = { ...err };
                delete n[field];
                return n;
            });
    };

    const handleTypeSelect = (typeId) => {
        setForm((f) => ({ ...f, application_type: typeId }));
        if (errors.application_type)
            setErrors((err) => {
                const n = { ...err };
                delete n.application_type;
                return n;
            });
    };

    const handleContactInput = (e) => {
        let val = e.target.value.replace(/\D/g, "");
        if (val.startsWith("0")) val = val.slice(1);
        setForm((f) => ({ ...f, contact_number: val }));
    };

    const handleFeeBlur = (e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) setForm((f) => ({ ...f, assessment_fee: v.toFixed(2) }));
    };

    const validateStep = (step) => {
        const newErrors = {};

        if (step === 1) {
            if (!form.application_type) newErrors.application_type = "Required";
            if (!form.form_number?.trim()) newErrors.form_number = "Required";
            if (!form.land_use_class) newErrors.land_use_class = "Required";
            if (!form.purpose?.trim()) newErrors.purpose = "Required";
        }

        if (step === 2) {
            if (!form.applicant_name?.trim()) newErrors.applicant_name = "Required";
            if (!form.contact_number?.trim()) newErrors.contact_number = "Required";
            if (!form.email?.trim()) {
                newErrors.email = "Required";
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
                newErrors.email = "Enter a valid email";
            }
        }

        if (step === 3) {
            if (!form.barangay?.trim()) newErrors.barangay = "Required";

            if (!form.parcels.length) {
                newErrors.parcels = "At least one parcel is required";
            } else {
                const seenPins = new Set();
                form.parcels.forEach((parcel, index) => {
                    const pin = parcel.property_index_number?.trim();
                    if (!pin) {
                        newErrors[`parcels.${index}.property_index_number`] = "Required";
                    } else if (seenPins.has(pin)) {
                        newErrors[`parcels.${index}.property_index_number`] = "Duplicate PIN not allowed";
                    } else {
                        seenPins.add(pin);
                    }
                });
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep((p) => p + 1);
            if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
        } else {
            setFlash({
                type: "error",
                msg: `Please resolve the highlighted errors in the ${STEPS[currentStep - 1].title} section before proceeding.`,
            });
            setTimeout(() => setFlash(null), 4000);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep((p) => p - 1);
        if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.assessment_fee) {
            setErrors({
                assessment_fee: "Assessment fee is required for routing.",
            });
            return setFlash({
                type: "error",
                msg: "Assessment fee is required.",
            });
        }

        setSubmitting(true);
        setErrors({});

        router.post("/applications/encode", form, {
            onSuccess: (page) => {
                const ref = page.props.flash?.reference_number || `IMP-${Math.floor(1000 + Math.random() * 9000)}`;
                Swal.fire({
                    icon: "success",
                    title: "Applicant Registered",
                    html: `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                             <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Reference Number</span>
                             <strong class="text-2xl font-mono font-black text-blue-700 tracking-tight">${ref}</strong>
                           </div>`,
                    confirmButtonColor: "#2563eb",
                    customClass: {
                        popup: "swal-small-modal rounded-3xl",
                        title: "font-black text-slate-800 text-xl",
                    },
                });
                setCurrentStep(1);
                setActiveParcelFeature(null);
                setActiveParcelIndex(null);
                setForm({
                    ...form,
                    application_type: "",
                    form_number: "",
                    land_use_class: "",
                    purpose: "",
                    applicant_name: "",
                    contact_number: "",
                    email: "",
                    representative_name: "",
                    barangay: "",
                    assessment_fee: "",
                    or_number: "",
                    remarks: "",
                    parcels: [
                        {
                            parcel_code: "P-01",
                            property_index_number: "",
                            property_tax_number: "",
                            lot_number: "",
                            tct_number: "",
                            tax_dec_number: "",
                            lot_area_sqm: "",
                            coordinates: "",
                        },
                    ],
                });
            },
            onError: (errs) => {
                setErrors(errs);
                
                let targetStep = 5;
                let stepNames = [];
                const errKeys = Object.keys(errs);
                
                if (errKeys.some(k => ['application_type', 'form_number', 'land_use_class', 'purpose'].includes(k))) {
                    targetStep = Math.min(targetStep, 1);
                    if (!stepNames.includes("Scope")) stepNames.push("Scope");
                }
                if (errKeys.some(k => ['applicant_name', 'contact_number', 'email', 'representative_name'].includes(k))) {
                    targetStep = Math.min(targetStep, 2);
                    if (!stepNames.includes("Profile")) stepNames.push("Profile");
                }
                if (errKeys.some(k => ['barangay'].includes(k) || k.startsWith("parcels"))) {
                    targetStep = Math.min(targetStep, 3);
                    if (!stepNames.includes("Location")) stepNames.push("Location");
                }
                if (errKeys.some(k => ['assessment_fee', 'or_number', 'remarks'].includes(k))) {
                    if (!stepNames.includes("Assess")) stepNames.push("Assess");
                }

                setCurrentStep(targetStep);
                if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });

                const firstErrorKey = errKeys[0];
                const firstErrorMessage = Array.isArray(errs[firstErrorKey]) ? errs[firstErrorKey][0] : errs[firstErrorKey];
                const stepsString = stepNames.length > 1 ? stepNames.join(' & ') : (stepNames[0] || "Application");

                setFlash({
                    type: "error",
                    msg: `Validation failed in ${stepsString}. Issue: ${firstErrorMessage}`,
                });

                setTimeout(() => setFlash(null), 5000);
            },
            onFinish: () => setSubmitting(false),
        });
    };

    const fieldError = (field) => {
        const errorMsg = Array.isArray(errors[field]) ? errors[field][0] : errors[field];
        return errorMsg ? <p className="absolute -bottom-4 left-1 text-[10px] text-red-500 font-bold whitespace-nowrap">{errorMsg}</p> : null;
    };

    const brgyStyle = {
        color: "#2563eb",
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.05,
        fillColor: "#3b82f6"
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties.property_index_number === feature.properties.property_index_number;
        return {
            color: isActive ? "#ef4444" : "#f97316", 
            weight: isActive ? 3 : 1,
            opacity: 0.9,
            fillOpacity: isActive ? 0.6 : 0.3,
            fillColor: isActive ? "#ef4444" : "#fdba74"
        };
    };

    return (
        <>
            <Head title="New Application | iMAPS" />
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
                
                .radio-card input:checked + div { border-color: #2563eb; background-color: #eff6ff; box-shadow: inset 0 0 0 1px #2563eb; }
                .radio-card input:checked + div .icon-box { background-color: #2563eb; color: white; }
                
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
                        <a href="#" className="flex items-center gap-2.5 group">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                            </div>
                            <span className="font-black text-lg tracking-tight text-slate-800">iMAPS</span>
                        </a>
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
                            {flash && (
                                <div className="fixed top-16 right-6 z-[999] pointer-events-none">
                                    <div className={`flex items-center gap-2 px-4 py-3 rounded-lg border shadow-xl max-w-sm pointer-events-auto transition-all ${flash.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-red-50 border-red-200 text-red-800"}`}>
                                        <p className="font-bold text-[12px] flex-1 leading-tight">{flash.msg}</p>
                                        <button onClick={() => setFlash(null)} className="text-slate-400 hover:text-slate-800"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                                    </div>
                                </div>
                            )}

                            <div className="w-full h-full bg-white flex flex-col lg:flex-row flex-1 min-h-0 border-t border-slate-200">
                                <div className="hidden lg:flex flex-col lg:w-1/2 bg-slate-50 border-r border-slate-200 relative map-grid-bg">
                                    <div className="absolute inset-0 z-0">
                                        <MapContainer center={rosarioCenter} zoom={12} zoomControl={false} scrollWheelZoom={true}>
                                            <TileLayer
                                                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                                                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                            />
                                            {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                            {parcelMapData && <GeoJSON key={activeParcelFeature?.properties.property_index_number || 'parcels'} data={parcelMapData} style={getParcelStyle} />}
                                            <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />
                                        </MapContainer>
                                    </div>

                                    <div className="absolute top-5 left-5 right-5 z-10 flex flex-col gap-3 pointer-events-none">
                                        {form.parcels.map((parcel, idx) => (
                                            idx === activeParcelIndex && parcel.property_index_number && parcel.lot_number && (
                                                <div key={idx} className="bg-white/95 backdrop-blur-sm p-4 rounded-2xl shadow-[0_10px_40px_rgb(0,0,0,0.1)] pointer-events-auto transition-all animate-[formFadeIn_0.3s_ease-out] border border-slate-100 max-w-sm">
                                                    <div className="flex items-center justify-between border-b border-slate-100 pb-2 mb-3">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-blue-700 bg-blue-50/80 px-2 py-1 rounded-[6px] border border-blue-100/50">
                                                            {parcel.parcel_code} INFO
                                                        </span>
                                                        <span className="text-[10px] font-bold text-slate-500 bg-slate-100/80 px-2.5 py-1 rounded-[6px] border border-slate-200/50 uppercase tracking-widest">
                                                            PIN: {parcel.property_index_number}
                                                        </span>
                                                    </div>
                                                    
                                                    <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                                        <div>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Lot Number</p>
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{parcel.lot_number}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Declared Area</p>
                                                            <p className="text-[13px] font-mono font-bold text-slate-800 leading-tight">{parcel.lot_area_sqm} <span className="text-[10px] font-bold text-slate-400 font-sans tracking-wide">SQ.M</span></p>
                                                        </div>
                                                        <div className="col-span-2">
                                                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-0.5 flex items-center gap-1">Barangay</p>
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{parcel.barangay}</p>
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
                                            )
                                        ))}
                                    </div>
                                </div>

                                <div className="flex-1 flex flex-col relative bg-white overflow-hidden lg:w-1/2">
                                    <div className="bg-white px-6 pt-6 pb-2 shrink-0 relative z-10">
                                        <div className="flex items-center justify-between w-full relative">
                                            {STEPS.map((step, index) => {
                                                const isCompleted = currentStep > step.id;
                                                const isCurrent = currentStep === step.id;
                                                return (
                                                    <div key={step.id} className="flex-1 flex items-center relative group" onClick={() => isCompleted && setCurrentStep(step.id)}>
                                                        {index !== STEPS.length - 1 && (
                                                            <div className={`absolute top-1/2 left-[50%] right-[-50%] h-[2px] -translate-y-1/2 z-0 transition-colors duration-300 ${isCompleted ? "bg-blue-200" : "bg-slate-100"}`} />
                                                        )}
                                                        <div className={`relative z-10 flex flex-col items-center justify-center w-full gap-2 ${isCompleted ? "cursor-pointer" : ""}`}>
                                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${isCompleted ? "bg-blue-500 text-white" : isCurrent ? "bg-blue-600 text-white shadow-[0_0_0_4px_rgba(37,99,235,0.15)] scale-110" : "bg-slate-100 text-slate-400"}`}>
                                                                {isCompleted ? (
                                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                                ) : (
                                                                    <span className="text-[11px] font-black">{step.id}</span>
                                                                )}
                                                            </div>
                                                            <div className="text-center absolute top-9 w-max">
                                                                <p className={`text-[10px] font-bold tracking-widest uppercase leading-none ${isCurrent ? "text-blue-700" : isCompleted ? "text-slate-800" : "text-slate-400"}`}>
                                                                    {step.title}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    <div ref={formRef} className="flex-1 p-6 md:p-8 flex flex-col relative overflow-y-auto mt-2">
                                        <form onSubmit={handleSubmit} className="flex-1 flex flex-col h-full w-full max-w-xl mx-auto">
                                          
                                            {/* ── STEP 1: SCOPE ── */}
                                            {currentStep === 1 && (
                                                <div className="form-enter flex-1 flex flex-col">
                                                    <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex-shrink-0">Application Parameters</h3>
                                                    <div className="flex-1 flex flex-col gap-y-6">
                                                        <div>
                                                            <Label required hasError={!!errors.application_type}>Application Category</Label>
                                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1">
                                                                {APPLICATION_TYPES.map((type) => (
                                                                    <label key={type.id} className="radio-card relative cursor-pointer group">
                                                                        <input type="radio" name="app_type" value={type.id} checked={form.application_type === type.id} onChange={() => handleTypeSelect(type.id)} className="peer sr-only" />
                                                                        <div className="p-2.5 rounded-xl bg-slate-50 transition-all duration-200 group-hover:bg-slate-100 flex items-center gap-3 border border-transparent">
                                                                            <div className="icon-box w-8 h-8 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-400 shrink-0 transition-colors">
                                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d={type.icon} /></svg>
                                                                            </div>
                                                                            <div className="min-w-0 flex-1">
                                                                                <p className="text-[12px] font-semibold text-slate-800 leading-tight truncate">{type.id}</p>
                                                                                <p className="text-[10px] font-medium text-slate-500 truncate mt-0.5">{type.desc}</p>
                                                                            </div>
                                                                        </div>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                            {fieldError("application_type")}
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                                            <div className="relative flex flex-col">
                                                                <Label required hasError={!!errors.form_number}>Application Form No.</Label>
                                                                <Input type="text" value={form.form_number} onChange={set("form_number")} placeholder="Enter form number" hasError={!!errors.form_number} />
                                                                {fieldError("form_number")}
                                                            </div>
                                                            <div className="relative flex flex-col">
                                                                <Label required hasError={!!errors.land_use_class}>Target Zoning Class</Label>
                                                                <Select value={form.land_use_class} onChange={set("land_use_class")} hasError={!!errors.land_use_class}>
                                                                    <option value="" disabled>Select dominant use...</option>
                                                                    {LAND_USE_CLASSES.map((c) => (<option key={c}>{c}</option>))}
                                                                </Select>
                                                                {fieldError("land_use_class")}
                                                            </div>
                                                        </div>

                                                        <div className="relative flex-1 flex flex-col">
                                                            <Label required hasError={!!errors.purpose}>Operational Purpose</Label>
                                                            <Textarea rows={3} value={form.purpose} onChange={set("purpose")} placeholder="Explicitly detail the intended use of the land or structure..." className="flex-1 min-h-[100px]" hasError={!!errors.purpose} />
                                                            {fieldError("purpose")}
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── STEP 2: PROFILE ── */}
                                            {currentStep === 2 && (
                                                <div className="form-enter flex-1 flex flex-col">
                                                    <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex-shrink-0">Applicant Identity</h3>
                                                    <div className="space-y-6 flex-1">
                                                        <div className="relative">
                                                            <Label required hasError={!!errors.applicant_name}>Registered Applicant / Corp</Label>
                                                            <Input type="text" value={form.applicant_name} onChange={set("applicant_name")} placeholder="Exact legal name" hasError={!!errors.applicant_name} />
                                                            {fieldError("applicant_name")}
                                                        </div>
                                                        <div className="grid grid-cols-2 gap-5">
                                                            <div className="relative">
                                                                <Label required hasError={!!errors.contact_number}>Primary Phone</Label>
                                                                <div className="relative">
                                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-mono text-[13px] font-bold pointer-events-none">+63</span>
                                                                    <Input type="tel" value={form.contact_number} onChange={handleContactInput} maxLength={10} placeholder="9XXXXXXXXX" className="pl-11 font-mono" hasError={!!errors.contact_number} />
                                                                </div>
                                                                {fieldError("contact_number")}
                                                            </div>
                                                            <div className="relative">
                                                                <Label required hasError={!!errors.email}>Email Address</Label>
                                                                <Input type="email" value={form.email} onChange={set("email")} placeholder="contact@domain.com" hasError={!!errors.email} />
                                                                {fieldError("email")}
                                                            </div>
                                                        </div>
                                                        <div className="p-4 bg-slate-50 rounded-xl relative mt-2">
                                                            <Label>Authorized Representative</Label>
                                                            <Input type="text" value={form.representative_name} onChange={set("representative_name")} placeholder="Full name of representative" className="bg-white mt-1" />
                                                            <p className="text-[11px] text-slate-500 mt-2 font-medium">Leave blank if the applicant is filing this directly.</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── STEP 3: LOCATION (multi-parcel) ── */}
                                            {currentStep === 3 && (
                                                <div className="form-enter flex-1 flex flex-col">
                                                    <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex-shrink-0">Property Location</h3>
                                                    <div className="flex-1 flex flex-col gap-6 overflow-y-auto pr-1">
                                                        
                                                    

                                                        <div className="space-y-4">
                                                            {form.parcels.map((parcel, index) => (
                                                                <div key={index} className="rounded-xl bg-slate-50 p-4 relative">
                                                                    <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60">
                                                                        <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-700 uppercase tracking-widest">
                                                                            {parcel.parcel_code || `PARCEL ${index + 1}`}
                                                                        </span>
                                                                        {form.parcels.length > 1 && (
                                                                            <button type="button" onClick={() => removeParcel(index)} className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-wider flex items-center gap-1">
                                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Remove
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    <div className="grid grid-cols-1 gap-x-4 gap-y-4">
                                                                        <div className="relative">
                                                                            <Label required hasError={!!errors[`parcels.${index}.property_index_number`]}>Property Index Number</Label>
                                                                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                                                                                <Input type="text" value={parcel.property_index_number} onChange={setParcelField(index, "property_index_number")} placeholder="Enter property index number" className="flex-1 bg-white" hasError={!!errors[`parcels.${index}.property_index_number`]} />
                                                                                <button type="button" onClick={() => handlePinLookup(index)} disabled={pinLoading[index] || !parcel.property_index_number?.trim()} className={`inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-[12px] font-bold transition-all whitespace-nowrap ${pinLoading[index] || !parcel.property_index_number?.trim() ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-blue-600 text-white hover:bg-blue-700"}`}>
                                                                                    {pinLoading[index] ? "Searching..." : "Lookup Map"}
                                                                                </button>
                                                                            </div>
                                                                            {parcelFieldError(index, "property_index_number")}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>

                                                        <button type="button" onClick={addParcel} className="inline-flex items-center justify-center gap-1.5 px-4 py-3 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 font-bold text-[13px] transition-all flex-shrink-0 mt-2">
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg> Attach Additional Parcel
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── STEP 4: DOSSIER REVIEW ── */}
                                            {currentStep === 4 && (
                                                <div className="form-enter flex-1 flex flex-col">
                                                    <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex-shrink-0">Review Summary</h3>
                                                    <div className="flex-1 overflow-y-auto space-y-4 pr-2">
                                                        <div className="bg-slate-50 rounded-xl p-4 relative group">
                                                            <button type="button" onClick={() => setCurrentStep(1)} className="absolute top-4 right-4 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Edit</button>
                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 pb-2 border-b border-slate-200/50">1. Scope & Category</h4>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Application</p><p className="text-[13px] font-bold text-slate-800">{form.application_type || "—"}</p></div>
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Zoning Class</p><p className="text-[13px] font-bold text-slate-800">{form.land_use_class || "—"}</p></div>
                                                                <div className="col-span-2"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Purpose</p><p className="text-[12px] font-medium text-slate-700 bg-white p-3 rounded-lg border border-slate-100">{form.purpose || "—"}</p></div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-slate-50 rounded-xl p-4 relative group">
                                                            <button type="button" onClick={() => setCurrentStep(2)} className="absolute top-4 right-4 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Edit</button>
                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 pb-2 border-b border-slate-200/50">2. Entity Profile</h4>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div className="col-span-2"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Principal Applicant</p><p className="text-[13px] font-bold text-slate-800">{form.applicant_name || "—"}</p></div>
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Contact</p><p className="text-[12px] font-mono text-slate-800">{form.contact_number ? `+63 ${form.contact_number}` : "—"}</p></div>
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Proxy/Rep</p><p className="text-[12px] font-medium text-slate-700">{form.representative_name || "N/A"}</p></div>
                                                            </div>
                                                        </div>

                                                        <div className="bg-slate-50 rounded-xl p-4 relative group">
                                                            <button type="button" onClick={() => setCurrentStep(3)} className="absolute top-4 right-4 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg> Edit</button>
                                                            <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-4 pb-2 border-b border-slate-200/50">3. Geospatial Data</h4>
                                                            <div className="grid grid-cols-2 gap-4">
                                                                <div className="col-span-2"><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Location</p><p className="text-[13px] font-bold text-slate-800">{form.barangay ? `Brgy. ${form.barangay}` : "—"} </p></div>
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Primary Property Index</p><p className="text-[12px] font-mono text-slate-800 uppercase">{form.parcels[0]?.property_index_number || "—"}</p></div>
                                                                <div><p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-1">Total Lot Area</p><p className="text-[12px] font-mono text-slate-800">{totalAreaSqm > 0 ? `${totalAreaSqm.toFixed(2)} sq.m.` : "—"}</p></div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── STEP 5: FINAL ASSESSMENT ── */}
                                            {currentStep === 5 && (
                                                <div className="form-enter flex-1 flex flex-col">
                                                    <h3 className="text-lg font-black text-slate-800 tracking-tight mb-4 flex-shrink-0">Final Assessment</h3>
                                                    <div className="flex-1 flex flex-col justify-center w-full">
                                                        <div className="bg-blue-50/50 rounded-[16px] p-6">
                                                            <div className="text-center mb-6">
                                                                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3 text-blue-600">
                                                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                                </div>
                                                                <h4 className="text-[13px] font-black uppercase tracking-[0.1em] text-blue-800">Official Routing</h4>
                                                                <p className="text-[12px] text-blue-600/80 font-medium mt-1">Please log the assessment fee before finalizing.</p>
                                                            </div>

                                                            <div className="space-y-5">
                                                                <div className="relative">
                                                                    <Label required hasError={!!errors.assessment_fee}>Calculated Fee</Label>
                                                                    <div className="relative">
                                                                        <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 font-mono text-[16px] font-black pointer-events-none">₱</span>
                                                                        <Input type="number" value={form.assessment_fee} onChange={set("assessment_fee")} onBlur={handleFeeBlur} min="0" step="0.01" placeholder="0.00" className="pl-9 font-mono font-black text-[16px] text-blue-900 bg-white py-3" hasError={!!errors.assessment_fee} />
                                                                    </div>
                                                                    {fieldError("assessment_fee")}
                                                                </div>
                                                                <div className="relative">
                                                                    <Label>Official Receipt No.</Label>
                                                                    <Input type="text" value={form.or_number} onChange={set("or_number")} placeholder="OR-XXXX" className="font-mono uppercase bg-white py-3" />
                                                                </div>
                                                                <div className="relative">
                                                                    <Label>Internal Remarks</Label>
                                                                    <Textarea rows={2} value={form.remarks} onChange={set("remarks")} placeholder="Deficiencies, notes..." className="bg-white" />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}

                                            {/* ── FOOTER ACTIONS ── */}
                                            <div className="mt-6 pt-5 flex justify-between items-center border-t border-slate-100 flex-shrink-0 bg-white">
                                                <button type="button" onClick={handleBack} disabled={currentStep === 1 || submitting} className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg font-bold text-[13px] transition-all ${currentStep === 1 ? "text-slate-300 opacity-50 cursor-not-allowed" : "text-slate-600 bg-slate-100 hover:bg-slate-200"}`}>
                                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg> Back
                                                </button>

                                                {currentStep < 5 ? (
                                                    <button type="button" onClick={handleNext} className="inline-flex items-center gap-1.5 px-7 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-[13px] transition-all active:scale-95">
                                                        Continue
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                    </button>
                                                ) : (
                                                    <button type="submit" disabled={submitting} className="inline-flex items-center gap-1.5 px-8 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-black text-[14px] transition-all active:scale-95 disabled:opacity-70">
                                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                        {submitting ? "Processing..." : "Confirm & Save"}
                                                    </button>
                                                )}
                                            </div>
                                        </form>
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