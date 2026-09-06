// resources/js/Pages/Applications/Create.jsx
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Link, Head, router } from "@inertiajs/react";
import axios from "axios";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Label, Input, Textarea, Select } from "./Components/FormControls";
import StepCategory from "./Components/StepCategory";
import StepApplicant from "./Components/StepApplicant";
import StepPropertyGIS from "./Components/StepPropertyGIS";
import StepReview from "./Components/StepReview";
import StepFee from "./Components/StepFee";

const APPLICATION_TYPES = [
    {
        id: "Locational Clearance",
        icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7",
        desc: "Standard municipal building & land clearance",
    },
    {
        id: "Zoning Certification",
        icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
        desc: "Land use classification & zoning compliance",
    },
    {
        id: "Development Permit",
        icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
        desc: "Subdivisions, estates & complex developments",
    },
    {
        id: "Special Land Use Permit",
        icon: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21",
        desc: "Special projects & institutional variances",
    },
];

const LAND_USE_CLASSES = ["Residential", "Commercial", "industrial", "Agri-Industrial", "institutional", "Recreational"];

const STEPS = [
    { id: 1, title: "Category", label: "Application Category" },
    { id: 2, title: "Applicant", label: "Applicant Details" },
    { id: 3, title: "Location", label: "Property & Map" },
    { id: 4, title: "Review", label: "Review & Confirm" },
    { id: 5, title: "Fee", label: "Assessment & Fees" },
];

const ROSARIO_BARANGAYS = [
    "Antipolo", "Bagong Pook", "Balibago", "Bayawang", "Baybayin", "Bulihan", "Cahigam", 
    "Calantas", "Colongan", "Itlugan", "Lumbangan", "Maalas-as", "Mabato", "Mabunga", "Macalamcam A", 
    "Macalamcam B", "Malaya", "Maligaya", "Marilag", "Masaya", "Matamis", "Mavalor", "Mayuro", 
    "Namuco", "Namunga", "Natu", "Nasi", "Palakpak", "Pinagsibaan", "Poblacion A", "Poblacion B", 
    "Poblacion C", "Poblacion D", "Poblacion E", "Putingkahoy", "Quilib", "Salao", "San Carlos", 
    "San Ignacio", "San Isidro", "San Jose", "San Roque", "Santa Cruz", "Timbugan"
];

const DRAFT_UUID_KEY = "imaps_current_draft_uuid";
const DRAFT_PAYLOAD_KEY = "imaps_local_backup_payload";
const APPLICANT_REGISTRY_KEY = "imaps_known_applicants_registry";

// ── Official Municipal Assessment Fee Calculation Engine ──
// Referenced from:
// 1. Zoning Clearance: ₱720.00 per hectare (1 hectare = 10,000 sq.m, min. ₱720.00)
// 2. Locational Clearance: HLURB Resolution No. 912, Series of 2013 (based on Bill of Materials / Project Cost)
// 3. Development Permit: ₱10.00 per square meter

function calculateMunicipalFee(appType, landUse, areaSqm, projectCost = 0) {
    const area = Math.max(0, Number(areaSqm) || 0);
    const cost = Math.max(0, Number(projectCost) || 0);
    let baseFee = 0;
    let formulaDesc = "";
    let rateDetail = "";
    let calculationSummary = "";

    if (appType === "Zoning Certification" || appType === "Zoning Clearance") {
        // ₱720.00 per hectare (1 ha = 10,000 sq.m)
        const hectares = area / 10000;
        baseFee = Math.max(720, Math.round(hectares * 720 * 100) / 100);
        formulaDesc = "₱720.00 per hectare (min. ₱720.00)";
        rateDetail = `${area.toLocaleString()} sq.m (${hectares.toFixed(4)} ha) @ ₱720.00 / hectare`;
        calculationSummary = hectares <= 1 
            ? "₱720.00 (Minimum Base 1 Hectare)" 
            : `${hectares.toFixed(2)} ha × ₱720.00/ha = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else if (appType === "Development Permit") {
        // ₱10.00 per square meter
        baseFee = Math.round(area * 10 * 100) / 100;
        formulaDesc = "₱10.00 per square meter";
        rateDetail = `${area.toLocaleString()} sq.m @ ₱10.00 / sq.m`;
        calculationSummary = `${area.toLocaleString()} sq.m × ₱10.00/sq.m = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    } else if (appType === "Locational Clearance") {
        // HLURB Resolution No. 912, Series of 2013 (Based on Bill of Materials / Declared Project Cost)
        if (landUse === "Residential") {
            if (cost <= 100000) {
                baseFee = 288.00;
                rateDetail = "HLURB Tier: Project Cost ≤ ₱100,000 (Flat ₱288.00)";
                calculationSummary = "Flat ₱288.00 (Cost ≤ ₱100k)";
            } else if (cost <= 200000) {
                baseFee = 576.00;
                rateDetail = "HLURB Tier: Project Cost > ₱100k to ₱200,000 (Flat ₱576.00)";
                calculationSummary = "Flat ₱576.00 (Cost ≤ ₱200k)";
            } else {
                const excess = cost - 200000;
                const excessFee = excess * 0.001; // 1/10 of 1%
                baseFee = 720.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱200k (₱720.00 + 0.1% excess)`;
                calculationSummary = `₱720.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = "HLURB 2013 Residential Rates (Bill of Materials)";
        } else if (landUse.toLowerCase() === "institutional") {
            if (cost <= 2000000) {
                baseFee = 2880.00;
                rateDetail = "HLURB Tier: Project Cost ≤ ₱2.0 Million (Flat ₱2,880.00)";
                calculationSummary = "Flat ₱2,880.00 (Cost ≤ ₱2M)";
            } else {
                const excess = cost - 2000000;
                const excessFee = excess * 0.001;
                baseFee = 2880.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱2.0M (₱2,880.00 + 0.1% excess)`;
                calculationSummary = `₱2,880.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = "HLURB 2013 Institutional Rates (Bill of Materials)";
        } else {
            // Commercial, Industrial, Agri-Industrial, Recreational
            if (cost < 100000) {
                baseFee = 1440.00;
                rateDetail = "HLURB Tier: Project Cost < ₱100,000 (Flat ₱1,440.00)";
                calculationSummary = "Flat ₱1,440.00 (Cost < ₱100k)";
            } else if (cost <= 500000) {
                baseFee = 2160.00;
                rateDetail = "HLURB Tier: Project Cost ₱100k to ₱500,000 (Flat ₱2,160.00)";
                calculationSummary = "Flat ₱2,160.00 (Cost ≤ ₱500k)";
            } else if (cost <= 1000000) {
                baseFee = 2880.00;
                rateDetail = "HLURB Tier: Project Cost > ₱500k to ₱1.0 Million (Flat ₱2,880.00)";
                calculationSummary = "Flat ₱2,880.00 (Cost ≤ ₱1M)";
            } else if (cost <= 2000000) {
                baseFee = 4320.00;
                rateDetail = "HLURB Tier: Project Cost > ₱1.0M to ₱2.0 Million (Flat ₱4,320.00)";
                calculationSummary = "Flat ₱4,320.00 (Cost ≤ ₱2M)";
            } else {
                const excess = cost - 2000000;
                const excessFee = excess * 0.001;
                baseFee = 7200.00 + excessFee;
                rateDetail = `HLURB Tier: Project Cost > ₱2.0M (₱7,200.00 + 0.1% excess)`;
                calculationSummary = `₱7,200.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
            }
            formulaDesc = `HLURB 2013 ${landUse || "Commercial/Industrial"} Rates (Bill of Materials)`;
        }
    } else {
        // Special Land Use Permit
        if (cost > 0) {
            const excess = Math.max(0, cost - 2000000);
            baseFee = 7200.00 + (excess * 0.001);
            rateDetail = `Special Rate: ₱7,200.00 + 0.1% of excess cost`;
            calculationSummary = `₱7,200.00 + (₱${excess.toLocaleString()} × 0.1%) = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        } else {
            baseFee = Math.max(2500, Math.round(area * 10 * 100) / 100);
            rateDetail = `${area.toLocaleString()} sq.m @ ₱10.00/sq.m (Min. ₱2,500.00)`;
            calculationSummary = `${area.toLocaleString()} sq.m × ₱10.00/sq.m = ₱${baseFee.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
        }
        formulaDesc = "Special Land Use Rates";
    }

    const total = Math.max(0, Math.round(baseFee * 100) / 100);

    return {
        baseFee,
        formulaDesc,
        rateDetail,
        calculationSummary,
        cost,
        area,
        total,
    };
}

// ── Title Case & Formatting Helper ──
function toTitleCase(str) {
    if (!str) return "";
    return str
        .toLowerCase()
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
}

// ── Applicant Registry Helpers ──
const INITIAL_KNOWN_APPLICANTS = [
    {
        first_name: "Julience",
        middle_name: "Rodriguez",
        last_name: "Castillo",
        suffix: "",
        applicant_name: "Julience Rodriguez Castillo",
        contact_number: "9494690596",
        email: "juliencecastillo@gmail.com",
        representative_name: "",
    },
    {
        first_name: "Maria",
        middle_name: "Clara",
        last_name: "Santos",
        suffix: "",
        applicant_name: "Maria Clara Santos",
        contact_number: "9175551234",
        email: "maria.santos@gmail.com",
        representative_name: "Atty. Juan Dela Cruz",
    },
    {
        first_name: "Juan",
        middle_name: "Protacio",
        last_name: "Rizal",
        suffix: "Jr.",
        applicant_name: "Juan Protacio Rizal Jr.",
        contact_number: "9182345678",
        email: "juan.rizal@domain.com",
        representative_name: "",
    },
];

function loadApplicantRegistry() {
    try {
        const raw = localStorage.getItem(APPLICANT_REGISTRY_KEY);
        if (!raw) {
            localStorage.setItem(APPLICANT_REGISTRY_KEY, JSON.stringify(INITIAL_KNOWN_APPLICANTS));
            return INITIAL_KNOWN_APPLICANTS;
        }
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : INITIAL_KNOWN_APPLICANTS;
    } catch (e) {
        return INITIAL_KNOWN_APPLICANTS;
    }
}

function saveApplicantToRegistry(applicant) {
    if (!applicant?.applicant_name || !applicant?.contact_number) return;
    try {
        const list = loadApplicantRegistry();
        const exists = list.some(
            (a) => a.contact_number === applicant.contact_number || a.applicant_name.toLowerCase() === applicant.applicant_name.toLowerCase()
        );
        if (!exists) {
            list.unshift(applicant);
            localStorage.setItem(APPLICANT_REGISTRY_KEY, JSON.stringify(list.slice(0, 50)));
        }
    } catch (e) {}
}

const emptyForm = () => ({
    application_type: "",
    form_number: "",
    land_use_class: "",
    purpose: "",
    first_name: "",
    middle_name: "",
    last_name: "",
    suffix: "",
    applicant_name: "",
    contact_number: "",
    email: "",
    representative_name: "",
    barangay: "",
    street_address: "",
    project_cost: "",
    assessment_fee: "",
    or_number: "",
    remarks: "",

    parcels: [
        {
            parcel_code: "P-01",
            location_address: "",
            barangay: "",
            owner_name: "",
            property_index_number: "",
            arp_number: "",
            property_tax_number: "",
            lot_number: "",
            tct_number: "",
            tax_dec_number: "",
            lot_area_sqm: "",
            coordinates: "",
        },
    ],
});

// ── Custom Map Bounds Controller ──
function MapController({ brgyData, activeParcelFeature }) {
    const map = useMap();

    useEffect(() => {
        try {
            map.invalidateSize();
            if (activeParcelFeature) {
                const layer = L.geoJSON(activeParcelFeature);
                const bounds = layer.getBounds();

                if (bounds.isValid()) {
                    map.flyToBounds(bounds, { padding: [60, 60], maxZoom: 18, duration: 1.2 });
                }
            } else if (brgyData) {
                const layer = L.geoJSON(brgyData);
                const bounds = layer.getBounds();

                if (bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [30, 30] });
                }
            }
        } catch (e) {
            console.error("MapController error:", e);
        }
    }, [brgyData, activeParcelFeature, map]);

    return null;
}


// ── Printable Official Application Routing & Acknowledgement Slip Modal ──
function RoutingSlipModal({ open, data, onClose, onPrint }) {
    if (!open || !data) return null;

    const trackingUrl = typeof window !== "undefined" 
        ? `${window.location.origin}/track?ref=${encodeURIComponent(data.reference_number || "")}`
        : `https://imaps.rosario-batangas.gov.ph/track?ref=${encodeURIComponent(data.reference_number || "")}`;

    const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&margin=0&data=${encodeURIComponent(trackingUrl)}`;

    return (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in">
            <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col my-auto max-h-[82vh]">
                
                {/* Header Controls (Non-Printable) */}
                <div className="flex items-center justify-between px-5 py-2.5 border-b border-slate-100 bg-slate-50 print:hidden shrink-0">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-xs font-bold text-slate-800">Application Routing Slip Generated</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onPrint}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                            </svg>
                            <span>Print Slip</span>
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Printable Document Area */}
                <div id="printable-routing-slip" className="p-4 sm:p-5 overflow-y-auto space-y-3 bg-white text-slate-900 font-sans">
                    
                    {/* Official Document Header */}
                    <div className="text-center border-b border-slate-900/80 pb-2">
                        <p className="text-[9px] font-semibold tracking-widest text-slate-500 uppercase">Republic of the Philippines · Province of Batangas</p>
                        <h2 className="text-sm sm:text-base font-extrabold uppercase tracking-tight text-slate-950 mt-0.5">Municipality of Rosario</h2>
                        <p className="text-[10px] font-bold tracking-wider uppercase text-blue-700">Municipal Planning and Development Office (MPDO)</p>
                        <div className="inline-block bg-slate-900 text-white text-[9px] font-bold uppercase tracking-widest px-2.5 py-0.5 rounded mt-1">
                            Official Zoning Application Routing Slip
                        </div>
                    </div>

                    {/* Reference No. & Public Tracking QR Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">
                        <div className="sm:col-span-8 flex flex-col justify-center space-y-1">
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Application Reference No.</span>
                            <h3 className="text-lg sm:text-xl font-mono font-extrabold text-blue-700 tracking-tight">{data.reference_number}</h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-slate-600">
                                <span>Date Filed: <strong className="text-slate-800 font-mono">{data.date_of_application || new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</strong></span>
                                <span>Encoded By: <strong className="text-slate-800">{data.encoded_by_name || "Planning Staff"}</strong></span>
                            </div>
                        </div>
                        <div className="sm:col-span-4 flex items-center justify-end gap-2.5 border-t sm:border-t-0 sm:border-l border-slate-200 pt-2 sm:pt-0 sm:pl-3">
                            <div className="text-right">
                                <p className="text-[10px] font-bold text-slate-700 uppercase">Public Tracking</p>
                                <p className="text-[9px] text-slate-400">Scan QR to track status</p>
                            </div>
                            <div className="bg-white p-1 rounded-lg border border-slate-200 shadow-2xs shrink-0 text-center">
                                <img src={qrCodeUrl} alt="QR Code Tracking" className="w-12 h-12 object-contain" />
                            </div>
                        </div>
                    </div>

                    {/* Applicant Profile & Clearance Scope */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Registered Applicant</p>
                            <p className="font-bold text-slate-900 text-xs sm:text-sm truncate">{data.applicant_name}</p>
                            <div className="flex items-center gap-3 text-[11px] text-slate-600">
                                <span className="font-mono">+63 {data.contact_number}</span>
                                {data.email && <span className="truncate">{data.email}</span>}
                            </div>
                            {data.representative_name && (
                                <p className="text-[10px] text-slate-500 pt-1 border-t border-slate-200 mt-1 truncate">
                                    Representative: <strong className="text-slate-700">{data.representative_name}</strong>
                                </p>
                            )}
                        </div>
                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-1">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Clearance Classification</p>
                            <p className="font-bold text-slate-900 text-xs sm:text-sm">{data.application_type}</p>
                            <div className="flex items-center gap-3 text-[11px] text-slate-600">
                                <span>Land Use: <strong className="text-slate-800">{data.land_use_class}</strong></span>
                                {data.project_cost && Number(data.project_cost) > 0 && (
                                    <span>Project Cost: <strong className="text-slate-800 font-mono">₱ {Number(data.project_cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</strong></span>
                                )}
                            </div>
                            <p className="text-[11px] text-slate-600 truncate">Purpose: <span className="font-medium text-slate-700">{data.purpose}</span></p>
                        </div>
                    </div>

                    {/* Location Summary & Assessment Fee Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-1.5">
                            <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location & Lots Summary</p>
                                <p className="font-semibold text-slate-800 text-[11px] truncate">{data.street_address ? `${data.street_address}, ` : ""}Brgy. {data.barangay}</p>
                            </div>
                            <div className="max-h-16 overflow-y-auto divide-y divide-slate-100 text-[11px]">
                                {(data.parcels || []).map((parcel, idx) => (
                                    <div key={idx} className="py-0.5 flex items-center justify-between">
                                        <span className="font-mono font-semibold text-slate-800 truncate">{parcel.parcel_code || `Lot ${idx + 1}`}: PIN {parcel.property_index_number || "—"}</span>
                                        <span className="text-slate-600 font-mono text-[10px] shrink-0">{parcel.lot_area_sqm ? `${Number(parcel.lot_area_sqm).toLocaleString()} m²` : ""}</span>
                                    </div>
                                ))}
                            </div>
                            <div className="pt-1 border-t border-slate-200 flex items-center justify-between text-[11px] font-bold text-blue-700">
                                <span>Total Land Area:</span>
                                <span className="font-mono">{Number(data.total_area || 0).toLocaleString()} sq.m</span>
                            </div>
                        </div>

                        <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 flex flex-col justify-between">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[9px] font-bold text-blue-800 uppercase tracking-wider">Assessed Clearance Fee</p>
                                    <p className="text-base sm:text-lg font-mono font-bold text-blue-900 mt-0.5">₱ {Number(data.assessment_fee || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                    <p className="text-[10px] text-blue-700">OR No: <strong className="font-mono">{data.or_number || "To be issued"}</strong></p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[9px] font-bold text-blue-800 uppercase tracking-wider">Pipeline Status</p>
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 mt-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                                        Received · Evaluation
                                    </span>
                                    <p className="text-[9px] text-slate-500 mt-0.5">Next: Site Inspection</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Official Notice */}
                    <p className="text-[9px] text-center text-slate-400 pt-1.5 border-t border-slate-100 leading-relaxed">
                        Present this routing slip to the MPDO Zoning Division for inspection tracking. Scan the QR code for 24/7 public tracking updates.
                    </p>
                </div>

                {/* Footer Buttons (Non-Printable) */}
                <div className="px-5 py-2.5 border-t border-slate-100 bg-slate-50 print:hidden flex items-center justify-between shrink-0">
                    <button
                        type="button"
                        onClick={onPrint}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
                        </svg>
                        <span>Print Routing Slip</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-semibold transition-all active:scale-95 cursor-pointer"
                    >
                        <span>Done & Return to Applications</span>
                    </button>
                </div>

            </div>
        </div>
    );
}

export default function Create({ auth, errors: serverErrors = {}, cloudDraftPayload = null, cloudDraftRef = null }) {
    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Planning Officer";

    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [clock, setClock] = useState("");
    const [currentStep, setCurrentStep] = useState(1);
    const [submitting, setSubmitting] = useState(false);
    const [flash, setFlash] = useState(null);
    const [errors, setErrors] = useState(serverErrors);
    const formRef = useRef(null);

    // Smart Features State
    const [feeMode, setFeeMode] = useState("auto"); // 'auto' | 'manual'
    const [applicantSuggestion, setApplicantSuggestion] = useState(null);
    const [showRoutingSlip, setShowRoutingSlip] = useState(false);
    const [routingSlipData, setRoutingSlipData] = useState(null);

    // Tracking identifier
    const [tempDraftId, setTempDraftId] = useState(() => {
        return cloudDraftRef || "TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase();
    });
    const [syncStatus, setSyncStatus] = useState("Saved locally");

    // Map States
    const [brgyMapData, setBrgyMapData] = useState(null);
    const [parcelMapData, setParcelMapData] = useState(null);
    const [activeParcelFeature, setActiveParcelFeature] = useState(null);
    const [activeParcelIndex, setActiveParcelIndex] = useState(null);
    const rosarioCenter = [13.8450, 121.2063];

    // Payload cleaner
    const cleanPayload = (data) => {
        if (!data) return null;
        let parsed = data;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (e) { return null; }
        }
        if (typeof parsed === 'object' && parsed !== null && "0" in parsed && "1" in parsed) {
            return null;
        }
        return parsed;
    };

    // Hydration
    const [form, setForm] = useState(() => {
        const baseForm = emptyForm();
        const validCloud = cleanPayload(cloudDraftPayload);
        if (validCloud) {
            return {
                ...baseForm,
                ...validCloud,
                parcels: Array.isArray(validCloud.parcels) && validCloud.parcels.length > 0 
                         ? validCloud.parcels 
                         : baseForm.parcels
            };
        }
        return baseForm;
    });

    // Valid parcels and total lot area computation (only when PIN is filled)
    const validParcels = useMemo(() => {
        return (form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim()));
    }, [form.parcels]);

    const validParcelsCount = validParcels.length;

    const totalLotArea = useMemo(() => {
        return validParcels.reduce((acc, p) => acc + (parseFloat(p.lot_area_sqm) || 0), 0);
    }, [validParcels]);

    // Smart Municipal Fee Calculation Engine
    const calculatedFeeBreakdown = useMemo(() => {
        return calculateMunicipalFee(
            form.application_type || "Locational Clearance",
            form.land_use_class || "Residential",
            totalLotArea,
            form.project_cost || 0
        );
    }, [form.application_type, form.land_use_class, totalLotArea, form.project_cost]);

    // Automatically sync calculated fee to form only when on Step 5 in 'auto' mode
    useEffect(() => {
        if (currentStep === 5 && feeMode === "auto" && calculatedFeeBreakdown) {
            setForm((prev) => ({
                ...prev,
                assessment_fee: calculatedFeeBreakdown.total > 0 ? calculatedFeeBreakdown.total.toFixed(2) : "0.00",
            }));
        }
    }, [currentStep, feeMode, calculatedFeeBreakdown]);

    // Zoning Compatibility Warning
    const zoningWarning = useMemo(() => {
        if (!form.land_use_class || !form.barangay) return null;
        const isHeavy = ["industrial", "agri-industrial"].includes((form.land_use_class || "").toLowerCase());
        const urbanPoblacion = ["Poblacion A", "Poblacion B", "Poblacion C", "Poblacion D", "Poblacion E", "San Carlos", "San Roque"];
        if (isHeavy && urbanPoblacion.includes(form.barangay)) {
            return `Zoning Notice: Proposed ${form.land_use_class} use in Brgy. ${form.barangay} is within a dense urban settlement and may require Sangguniang Bayan special clearance.`;
        }
        return null;
    }, [form.land_use_class, form.barangay]);

    // Applicant Auto-Complete Matcher
    const checkApplicantMatches = (val, field) => {
        if (!val || val.trim().length < 3) {
            setApplicantSuggestion(null);
            return;
        }
        const registry = loadApplicantRegistry();
        const query = val.toLowerCase().trim();
        const match = registry.find((a) => {
            if (field === "contact_number") return a.contact_number.includes(query);
            if (field === "email") return a.email?.toLowerCase().includes(query);
            return (
                a.applicant_name?.toLowerCase().includes(query) ||
                a.last_name?.toLowerCase().includes(query) ||
                a.first_name?.toLowerCase().includes(query)
            );
        });

        if (match && match.applicant_name !== form.applicant_name) {
            setApplicantSuggestion(match);
        } else {
            setApplicantSuggestion(null);
        }
    };

    const applyApplicantSuggestion = () => {
        if (!applicantSuggestion) return;
        setForm((prev) => ({
            ...prev,
            first_name: applicantSuggestion.first_name || "",
            middle_name: applicantSuggestion.middle_name || "",
            last_name: applicantSuggestion.last_name || "",
            suffix: applicantSuggestion.suffix || "",
            applicant_name: applicantSuggestion.applicant_name || "",
            contact_number: applicantSuggestion.contact_number || "",
            email: applicantSuggestion.email || "",
            representative_name: applicantSuggestion.representative_name || "",
        }));
        setApplicantSuggestion(null);
        setFlash({ type: "success", msg: `Auto-filled details for ${applicantSuggestion.applicant_name}.` });
        setTimeout(() => setFlash(null), 3000);
    };

    // Global Keyboard Navigation
    useEffect(() => {
        const handleKeyDown = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                e.preventDefault();
                if (currentStep === 5) {
                    handleSubmit(e);
                } else {
                    handleNext();
                }
                return;
            }

            if (e.altKey && e.key === "ArrowLeft") {
                e.preventDefault();
                handleBack();
                return;
            }

            if (e.key === "Enter" && e.target.tagName !== "TEXTAREA" && e.target.type !== "submit" && e.target.type !== "button" && !e.target.dataset.noAdvance) {
                if (currentStep < 5) {
                    e.preventDefault();
                    handleNext();
                }
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [currentStep, form]);

    useEffect(() => {
        const validCloud = cleanPayload(cloudDraftPayload);
        if (validCloud) {
            setForm((prev) => ({
                ...prev,
                ...validCloud,
                parcels: Array.isArray(validCloud.parcels) && validCloud.parcels.length > 0
                    ? validCloud.parcels
                    : prev.parcels,
            }));
            if (cloudDraftRef) {
                setTempDraftId(cloudDraftRef);
            }
        }
    }, [cloudDraftPayload, cloudDraftRef]);

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

    // Draft persistence handlers
    const persistDraftState = (uuid, payload) => {
        try {
            if (uuid) localStorage.setItem(DRAFT_UUID_KEY, uuid);
            if (payload) localStorage.setItem(DRAFT_PAYLOAD_KEY, JSON.stringify(payload));
        } catch (e) {}
    };

    const clearDraftStateRecord = () => {
        try {
            localStorage.removeItem(DRAFT_UUID_KEY);
            localStorage.removeItem(DRAFT_PAYLOAD_KEY);
        } catch (e) {}
    };

    // Auto-save sync effect
    useEffect(() => {
        const handler = setTimeout(() => {
            const hasData = form.application_type || form.form_number || form.applicant_name || form.barangay;
            if (!hasData) return;

            setSyncStatus("Saving modifications...");
            persistDraftState(tempDraftId, form);

            axios.post("/applications/drafts/save", {
                temp_id: tempDraftId,
                payload: form,
            })
            .then(() => {
                setSyncStatus("Auto-saved to drafts");
            })
            .catch(() => {
                setSyncStatus("Saved locally");
            });
        }, 1200);

        return () => clearTimeout(handler);
    }, [form, tempDraftId]);

    const handleManualSave = () => {
        setSyncStatus("Saving modifications...");
        persistDraftState(tempDraftId, form);
        axios
            .post("/applications/drafts/save", {
                temp_id: tempDraftId,
                payload: form,
            })
            .then(() => {
                setSyncStatus("Auto-saved to drafts");
                setFlash({ type: "success", msg: `Draft synchronized (${tempDraftId}).` });
                setTimeout(() => setFlash(null), 3000);
            })
            .catch(() => {
                setSyncStatus("Saved locally");
                setFlash({ type: "success", msg: "Draft stored to local storage." });
                setTimeout(() => setFlash(null), 3000);
            });
    };

    const handleRestart = () => {
        Swal.fire({
            title: "Reset Application Form?",
            text: "This will clear all entered application fields and draft data. You can start fresh from Step 1.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, Reset Form",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((res) => {
            if (res.isConfirmed) {
                clearDraftStateRecord();
                setTempDraftId("TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase());
                setForm(emptyForm());
                setCurrentStep(1);
                setActiveParcelFeature(null);
                setActiveParcelIndex(null);
                setSyncStatus("Saved locally");
            }
        });
    };

    // Parcel Management
    const addParcel = () => {
        const nextIndex = (form.parcels || []).length + 1;
        const newCode = `P-${String(nextIndex).padStart(2, "0")}`;
        setForm((prev) => ({
            ...prev,
            parcels: [
                ...(prev.parcels || []),
                {
                    parcel_code: newCode,
                    location_address: "",
                    barangay: "",
                    owner_name: "",
                    property_index_number: "",
                    arp_number: "",
                    survey_number: "",
                    property_tax_number: "",
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
        if ((form.parcels || []).length <= 1) return;
        setForm((prev) => {
            const nextParcels = prev.parcels.filter((_, i) => i !== index);
            return {
                ...prev,
                parcels: nextParcels.map((p, i) => ({
                    ...p,
                    parcel_code: `P-${String(i + 1).padStart(2, "0")}`,
                })),
            };
        });
        if (activeParcelIndex === index) {
            setActiveParcelFeature(null);
            setActiveParcelIndex(null);
        }
    };

    const setParcelField = (index, field) => (e) => {
        const val = e.target.value;
        setForm((prev) => ({
            ...prev,
            parcels: (prev.parcels || []).map((p, i) => (i === index ? { ...p, [field]: val } : p)),
        }));
        if (errors[`parcels.${index}.${field}`]) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[`parcels.${index}.${field}`];
                return next;
            });
        }
    };

    const [pinLoading, setPinLoading] = useState({});
    const [pinLookupMap, setPinLookupMap] = useState({});

    const getGeometryCentroid = (geometry) => {
        if (!geometry || !geometry.coordinates) return null;

        const averageRing = (ring) => {
            if (!ring || ring.length === 0) return null;
            const totals = ring.reduce(
                (acc, coord) => ({
                    lat: acc.lat + Number(coord[1]),
                    lng: acc.lng + Number(coord[0]),
                }),
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
            .catch(() => {});

        const loadParcelLookup = async () => {
            try {
                const response = await fetch("/geojson/rosario_batangas_dummy_parcels.geojson");
                if (!response.ok) return;
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
                        arp_number: feature.properties?.arp_number || feature.properties?.arp_no || "",
                        survey_number: feature.properties?.survey_number || feature.properties?.survey_no || "",
                        property_tax_number: feature.properties?.property_tax_number || "",
                        location_address: feature.properties?.location_address || "",
                        owner_name: feature.properties?.owner_name || "",
                        barangay: feature.properties?.barangay || "",
                        tct_number: feature.properties?.tct_number || "",
                        tax_dec_number: feature.properties?.tax_dec_number || "",
                        lot_number: feature.properties?.lot_number || "",
                        lot_area_sqm: feature.properties?.lot_area_sqm != null ? String(feature.properties.lot_area_sqm) : "",
                        coordinates: centroid ? `${centroid.lat.toFixed(6)},${centroid.lng.toFixed(6)}` : "",
                    };
                });

                setPinLookupMap(lookupMap);
            } catch (error) {}
        };

        loadParcelLookup();
    }, []);

    const lookupPin = async (pin) => {
        const normalizedPin = pin?.trim();
        if (!normalizedPin) throw new Error("Property Index Number is required");

        if (pinLookupMap[normalizedPin]) {
            return pinLookupMap[normalizedPin];
        }

        const res = await fetch(`/api/tax-map/lookup/${encodeURIComponent(normalizedPin)}`);
        if (!res.ok) {
            throw new Error("Unable to locate parcel geometry with the provided PIN.");
        }
        const payload = await res.json();
        return payload.data;
    };

    const handlePinLookup = async (index) => {
        const pin = form.parcels[index]?.property_index_number?.trim();

        const isDuplicate = (form.parcels || []).some((p, i) => i !== index && p.property_index_number?.trim() === pin);
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
                const newBarangay = index === 0 && data.barangay ? data.barangay : prev.barangay;
                const newLandUse = data.land_use_class || prev.land_use_class;

                return {
                    ...prev,
                    barangay: newBarangay,
                    land_use_class: newLandUse,
                    parcels: (prev.parcels || []).map((p, i) =>
                        i === index
                            ? {
                                  ...p,
                                  property_index_number: data.property_index_number || p.property_index_number,
                                  arp_number: data.arp_number || p.arp_number || "",
                                  survey_number: data.survey_number || p.survey_number || "",
                                  location_address: data.location_address || p.location_address || prev.street_address || "",
                                  barangay: data.barangay || p.barangay || "",
                                  owner_name: data.owner_name || p.owner_name || prev.applicant_name || "",
                                  property_tax_number: data.property_tax_number || p.property_tax_number || "",
                                  lot_number: data.lot_number || p.lot_number || "",
                                  tct_number: data.tct_number || p.tct_number || "",
                                  tax_dec_number: data.tax_dec_number || p.tax_dec_number || "",
                                  lot_area_sqm: data.lot_area_sqm ?? p.lot_area_sqm,
                                  land_use_class: data.land_use_class || p.land_use_class || "",
                                  is_verified: true,
                                  coordinates: data.coordinates || (data.latitude && data.longitude ? `${data.latitude},${data.longitude}` : p.coordinates),
                              }
                            : p,
                    ),
                };
            });

            setErrors((prev) => {
                const next = { ...prev };
                delete next[`parcels.${index}.property_index_number`];
                delete next.barangay;
                return next;
            });
            setFlash({ type: "success", msg: `PIN ${pin} verified against municipal approved land use records.` });
            setTimeout(() => setFlash(null), 3000);
        } catch (err) {
            setErrors((prev) => ({
                ...prev,
                [`parcels.${index}.property_index_number`]: err?.message || "PIN not found in approved records",
            }));
            setForm((prev) => ({
                ...prev,
                parcels: (prev.parcels || []).map((p, i) => i === index ? { ...p, is_verified: false } : p),
            }));
        } finally {
            setPinLoading((prev) => ({ ...prev, [index]: false }));
        }
    };

    // Direct GIS Map Click-to-Select Handler
    const handleSelectMapParcel = (pin, lot, area, brgy, feature) => {
        const targetIdx = activeParcelIndex !== null ? activeParcelIndex : 0;
        const pProps = feature?.properties || {};
        const landUse = pProps.land_use_class || pProps.zoning_class || pProps.land_use || "";
        const tdNo = pProps.tax_dec_number || pProps.td_no || "";
        const arpNo = pProps.arp_number || pProps.arp_no || "";
        const surveyNo = pProps.survey_number || pProps.survey_no || "";
        const tctNo = pProps.tct_number || "";
        const locationAddress = pProps.location_address || "";
        const ownerName = pProps.owner_name || "";
        
        if (feature) {
            setActiveParcelFeature(feature);
            setActiveParcelIndex(targetIdx);
        }

        setForm((prev) => {
            const newBarangay = targetIdx === 0 && brgy ? brgy : prev.barangay;
            const newLandUse = landUse || prev.land_use_class;
            return {
                ...prev,
                barangay: newBarangay,
                land_use_class: newLandUse,
                parcels: (prev.parcels || []).map((p, i) =>
                    i === targetIdx
                        ? {
                              ...p,
                              property_index_number: pin || p.property_index_number,
                              arp_number: arpNo || p.arp_number,
                              survey_number: surveyNo || p.survey_number,
                              location_address: locationAddress || p.location_address || prev.street_address || "",
                              lot_number: lot || p.lot_number,
                              lot_area_sqm: area != null ? String(area) : p.lot_area_sqm,
                              barangay: brgy || p.barangay,
                              owner_name: ownerName || p.owner_name || prev.applicant_name || "",
                              tax_dec_number: tdNo || p.tax_dec_number,
                              tct_number: tctNo || p.tct_number,
                              land_use_class: landUse || p.land_use_class,
                              is_verified: Boolean(pin),
                          }
                        : p
                ),
            };
        });

        setFlash({ type: "success", msg: `Selected lot PIN: ${pin || "Map Polygon"} · Verified with municipal land records` });
        setTimeout(() => setFlash(null), 3000);
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

    const set = (field) => (e) => {
        const val = e.target.value;
        setForm((f) => ({ ...f, [field]: val }));
        if (field === "email") {
            checkApplicantMatches(val, "email");
        }
        if (errors[field]) {
            setErrors((err) => {
                const n = { ...err };
                delete n[field];
                return n;
            });
        }
    };

    const handleNameChange = (field) => (e) => {
        const rawVal = e.target.value;
        const val = toTitleCase(rawVal);
        setForm((prev) => {
            const next = { ...prev, [field]: val };
            const parts = [
                next.first_name?.trim(),
                next.middle_name?.trim(),
                next.last_name?.trim(),
                next.suffix?.trim(),
            ].filter(Boolean);

            return {
                ...next,
                applicant_name: parts.join(" "),
            };
        });

        checkApplicantMatches(val, field);

        if (errors[field] || errors.applicant_name) {
            setErrors((prev) => {
                const next = { ...prev };
                delete next[field];
                delete next.applicant_name;
                return next;
            });
        }
    };

    const handleTypeSelect = (typeId) => {
        setForm((f) => ({ ...f, application_type: typeId }));
        if (errors.application_type) {
            setErrors((err) => {
                const n = { ...err };
                delete n.application_type;
                return n;
            });
        }
    };

    const handleContactInput = (e) => {
        let val = e.target.value.replace(/\D/g, "");
        if (val.startsWith("0")) val = val.slice(1);
        setForm((f) => ({ ...f, contact_number: val }));
        checkApplicantMatches(val, "contact_number");
    };

    const handleFeeBlur = (e) => {
        const v = parseFloat(e.target.value);
        if (!isNaN(v)) setForm((f) => ({ ...f, assessment_fee: v.toFixed(2) }));
    };

    const validateStep = (step) => {
        const newErrors = {};

        if (step === 1) {
            if (!form.application_type) newErrors.application_type = "Select an application category";
            if (!form.form_number?.trim()) newErrors.form_number = "Form number is required";
            if (!form.land_use_class) newErrors.land_use_class = "Target zoning class is required";
            if (!form.purpose?.trim()) newErrors.purpose = "Operational purpose is required";
        }

        if (step === 2) {
            if (!form.last_name?.trim()) newErrors.last_name = "Last name is required";
            if (!form.first_name?.trim()) newErrors.first_name = "First name is required";
            if (!form.applicant_name?.trim()) newErrors.applicant_name = "Applicant name is required";
            if (!form.contact_number?.trim()) newErrors.contact_number = "Phone number is required";
            if (!form.email?.trim()) {
                newErrors.email = "Email address is required";
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
                newErrors.email = "Enter a valid email format";
            }
        }

        if (step === 3) {
            if (!form.barangay?.trim()) newErrors.barangay = "Barangay is required";

            if (!form.parcels || form.parcels.length === 0) {
                newErrors.parcels = "At least one parcel is required";
            } else {
                const seenPins = new Set();
                form.parcels.forEach((parcel, index) => {
                    const pin = parcel.property_index_number?.trim();
                    if (!pin) {
                        newErrors[`parcels.${index}.property_index_number`] = "PIN is required";
                    } else if (seenPins.has(pin)) {
                        newErrors[`parcels.${index}.property_index_number`] = "Duplicate PIN";
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
                msg: `Please complete the required fields in Step ${currentStep}.`,
            });
            setTimeout(() => setFlash(null), 4000);
        }
    };

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep((p) => p - 1);
        if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });
    };

    const handleSubmit = (e) => {
        if (e && e.preventDefault) e.preventDefault();
        if (!form.assessment_fee || Number(form.assessment_fee) < 0) {
            setErrors({ assessment_fee: "Assessment fee is required." });
            return setFlash({
                type: "error",
                msg: "Please verify the assessment fee.",
            });
        }

        setSubmitting(true);
        router.post("/applications/encode", form, {
            onSuccess: (page) => {
                const ref = page.props.flash?.reference_number || `LC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(100 + Math.random() * 900)}`;

                // Save applicant to local registry cache
                saveApplicantToRegistry({
                    first_name: form.first_name,
                    middle_name: form.middle_name,
                    last_name: form.last_name,
                    suffix: form.suffix,
                    applicant_name: form.applicant_name,
                    contact_number: form.contact_number,
                    email: form.email,
                    representative_name: form.representative_name,
                });

                // Prepare routing slip data
                setRoutingSlipData({
                    reference_number: ref,
                    date_of_application: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
                    encoded_by_name: userName,
                    applicant_name: form.applicant_name,
                    contact_number: form.contact_number,
                    email: form.email,
                    representative_name: form.representative_name,
                    application_type: form.application_type,
                    land_use_class: form.land_use_class,
                    purpose: form.purpose,
                    barangay: form.barangay,
                    street_address: form.street_address,
                    parcels: form.parcels,
                    total_area: totalLotArea,
                    project_cost: form.project_cost,
                    assessment_fee: form.assessment_fee,
                    or_number: form.or_number,
                });
                setShowRoutingSlip(true);

                clearDraftStateRecord();
                setTempDraftId("TMP-" + Math.random().toString(36).substring(2, 11).toUpperCase());
                setSyncStatus("Saved locally");
            },
            onError: (errs) => {
                setErrors(errs);

                let targetStep = 5;
                const errKeys = Object.keys(errs);

                if (errKeys.some((k) => ["application_type", "form_number", "land_use_class", "purpose"].includes(k))) {
                    targetStep = 1;
                } else if (errKeys.some((k) => ["applicant_name", "contact_number", "email", "representative_name"].includes(k))) {
                    targetStep = 2;
                } else if (errKeys.some((k) => ["barangay"].includes(k) || k.startsWith("parcels"))) {
                    targetStep = 3;
                }

                setCurrentStep(targetStep);
                if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: "smooth" });

                setFlash({
                    type: "error",
                    msg: "Please resolve the highlighted validation issues.",
                });

                setTimeout(() => setFlash(null), 5000);
            },
            onFinish: () => setSubmitting(false),
        });
    };

    const brgyStyle = {
        color: "#2563eb",
        weight: 1.5,
        opacity: 0.7,
        fillOpacity: 0.04,
        fillColor: "#3b82f6",
    };

    const getParcelStyle = (feature) => {
        const isActive = activeParcelFeature && activeParcelFeature.properties?.property_index_number === feature.properties?.property_index_number;
        return {
            color: isActive ? "#ef4444" : "#2563eb",
            weight: isActive ? 3 : 1.5,
            opacity: 0.9,
            fillOpacity: isActive ? 0.5 : 0.2,
            fillColor: isActive ? "#ef4444" : "#3b82f6",
        };
    };

    const workflowProgress = useMemo(() => {
        let progress = 0;
        const step1Done = Boolean(form.application_type && form.form_number?.trim() && form.land_use_class && form.purpose?.trim());
        const step2Done = Boolean((form.last_name?.trim() && form.first_name?.trim() || form.applicant_name?.trim()) && form.contact_number?.trim() && form.email?.trim());
        const step3Done = Boolean(form.barangay && form.parcels?.some((p) => p.property_index_number?.trim()));
        const step4Done = currentStep >= 4;
        const step5Done = currentStep === 5 && Boolean(form.assessment_fee && Number(form.assessment_fee) >= 0);

        if (step1Done) progress += 20;
        if (step2Done) progress += 20;
        if (step3Done) progress += 20;
        if (step4Done) progress += 20;
        if (step5Done) progress += 20;

        return progress;
    }, [form, currentStep]);

    const stepProgress = Math.round((currentStep / 5) * 100);

    return (
        <>
            <Head title="Encode Application | iMAPS Rosario" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #encode-root {
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

                /* SweetAlert Modern iMAPS Theme Overrides */
                .swal2-container {
                    backdrop-filter: blur(4px) !important;
                    background-color: rgba(15, 23, 42, 0.4) !important;
                }
                .swal2-popup {
                    font-family: 'Plus Jakarta Sans', sans-serif !important;
                    border-radius: 1.5rem !important;
                    border: 1px solid #e2e8f0 !important;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15) !important;
                    padding: 1.75rem !important;
                }
                .swal2-icon.swal2-warning {
                    border-color: #f59e0b !important;
                    color: #f59e0b !important;
                    width: 3.5rem !important;
                    height: 3.5rem !important;
                    margin: 0.5rem auto 1rem !important;
                }
                .swal2-icon.swal2-success {
                    border-color: #10b981 !important;
                    color: #10b981 !important;
                    width: 3.5rem !important;
                    height: 3.5rem !important;
                    margin: 0.5rem auto 1rem !important;
                }
                .swal2-icon .swal2-icon-content {
                    font-size: 2.25rem !important;
                }
                .swal2-title {
                    font-size: 1.25rem !important;
                    font-weight: 700 !important;
                    color: #0f172a !important;
                    padding: 0 !important;
                    margin-bottom: 0.5rem !important;
                }
                .swal2-html-container {
                    font-size: 0.8125rem !important;
                    color: #64748b !important;
                    margin: 0 0 1.25rem !important;
                    line-height: 1.5 !important;
                }
                .swal2-actions {
                    gap: 0.75rem !important;
                    margin-top: 1rem !important;
                }

                /* Printable Routing Slip Optimizations */
                @media print {
                    body * {
                        visibility: hidden !important;
                    }
                    #printable-routing-slip, #printable-routing-slip * {
                        visibility: visible !important;
                    }
                    #printable-routing-slip {
                        position: fixed !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100vw !important;
                        height: auto !important;
                        max-height: 100% !important;
                        margin: 0 !important;
                        padding: 1.5rem !important;
                        background: #ffffff !important;
                        color: #0f172a !important;
                        border: none !important;
                        box-shadow: none !important;
                        z-index: 999999 !important;
                    }
                }
            `}</style>

            <div id="encode-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── TOP HEADER ── */}
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

                    {/* ── SLEEK CONTROL & STEPPER BAR ── */}
                    <div className="h-14 bg-white border-b border-slate-200/90 px-4 sm:px-6 flex items-center justify-between shrink-0 z-10 shadow-2xs gap-3">
                        {/* Left: Modern Return to Records Button & Title */}
                        <div className="flex items-center gap-3 shrink-0">
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
                            <span className="h-4 w-px bg-slate-200 hidden sm:block" />
                            <div className="flex items-center gap-2">
                                <h1 className="text-xs sm:text-sm font-bold text-slate-900 leading-none">New Application</h1>
                                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded-full">
                                    <span className={`w-1.5 h-1.5 rounded-full ${syncStatus === "Saving modifications..." ? "bg-amber-500 animate-ping" : syncStatus === "Auto-saved to drafts" ? "bg-emerald-500" : "bg-slate-400"}`} />
                                    <span className="hidden md:inline">{syncStatus}</span>
                                </span>
                            </div>
                        </div>

                        {/* Center: Modern Smart Stepper (No checks, sleek executive numbered design) */}
                        <div className="flex items-center bg-slate-100/90 p-1 rounded-2xl border border-slate-200/80 gap-1 overflow-x-auto max-w-full">
                            {STEPS.map((step) => {
                                const isCompleted = currentStep > step.id;
                                const isCurrent = currentStep === step.id;
                                return (
                                    <button
                                        key={step.id}
                                        type="button"
                                        onClick={() => isCompleted && setCurrentStep(step.id)}
                                        className={`group flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap select-none ${
                                            isCurrent
                                                ? "bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/80 cursor-default font-bold"
                                                : isCompleted
                                                ? "text-slate-700 hover:text-blue-700 hover:bg-white/70 cursor-pointer"
                                                : "text-slate-400 cursor-not-allowed opacity-70"
                                        }`}
                                    >
                                        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded-md transition-colors ${
                                            isCurrent
                                                ? "bg-blue-600 text-white shadow-2xs"
                                                : isCompleted
                                                ? "bg-blue-50 text-blue-700 border border-blue-200/60 group-hover:bg-blue-600 group-hover:text-white"
                                                : "bg-slate-200/70 text-slate-400"
                                        }`}>
                                            0{step.id}
                                        </span>
                                        <span className="tracking-tight">{step.title}</span>
                                        {isCompleted && (
                                            <span className="w-1.5 h-1.5 rounded-full bg-blue-600 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button 
                                type="button" 
                                onClick={handleRestart}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                                </svg>
                                <span className="hidden sm:inline">Reset</span>
                            </button>
                            <button 
                                type="button" 
                                onClick={handleManualSave}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 hover:bg-blue-100 shadow-2xs transition-all active:scale-98 cursor-pointer"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
                                </svg>
                                <span>Save Draft</span>
                            </button>
                        </div>
                    </div>

                    {/* ── WORKSPACE ── */}
                    <main className="flex-1 w-full h-full flex flex-col bg-slate-50 overflow-hidden relative">
                        {flash && (
                            <div className="absolute top-4 right-4 z-[999] pointer-events-none animate-in fade-in slide-in-from-top-2">
                                <div className={`flex items-center gap-2.5 px-4 py-3 rounded-2xl border shadow-xl max-w-sm pointer-events-auto transition-all ${flash.type === "success" ? "bg-slate-900 text-white border-slate-800" : "bg-rose-50 border-rose-200 text-rose-800"}`}>
                                    <p className="font-semibold text-xs flex-1">{flash.msg}</p>
                                    <button onClick={() => setFlash(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Background: Subtle Blurred Rosario GIS Map filling all whitespace across all steps */}
                        <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none select-none">
                            <div className="absolute inset-0 filter blur-[1.5px] opacity-40 scale-105">
                                <MapContainer 
                                    center={rosarioCenter} 
                                    zoom={12} 
                                    zoomControl={false} 
                                    scrollWheelZoom={false} 
                                    dragging={false} 
                                    doubleClickZoom={false} 
                                    touchZoom={false}
                                    attributionControl={false}
                                >
                                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                    {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                                </MapContainer>
                            </div>
                            {/* Soft frosted vignette overlay to keep text and inputs ultra-crisp */}
                            <div className="absolute inset-0 bg-gradient-to-b from-slate-100/40 via-slate-50/60 to-slate-100/75" />
                        </div>

                        {/* Foreground: Centered Master Elevated Floating Modal (NON-SCROLLABLE modal wrapper) */}
                        <div className="relative z-10 flex-1 w-full h-full flex items-center justify-center p-3 sm:p-5 lg:p-6 overflow-hidden">
                            <div className="w-full max-w-5xl h-[calc(100vh-8.5rem)] max-h-[580px] min-h-[380px] bg-white/95 backdrop-blur-md rounded-3xl border border-slate-200/90 shadow-2xl overflow-hidden flex flex-col lg:flex-row shadow-[0_20px_50px_rgba(0,0,0,0.12)]">
                                
                                {currentStep === 3 ? (
                                    /* ── STEP 3: GIS STUDIO (INSIDE FLOATING MODAL) ── */
                                    <StepPropertyGIS
                                        form={form}
                                        set={set}
                                        setParcelField={setParcelField}
                                        addParcel={addParcel}
                                        removeParcel={removeParcel}
                                        handlePinLookup={handlePinLookup}
                                        pinLoading={pinLoading}
                                        errors={errors}
                                        totalLotArea={totalLotArea}
                                        zoningWarning={zoningWarning}
                                        activeParcelIndex={activeParcelIndex}
                                        activeParcelFeature={activeParcelFeature}
                                        brgyMapData={brgyMapData}
                                        parcelMapData={parcelMapData}
                                        rosarioCenter={rosarioCenter}
                                        brgyStyle={brgyStyle}
                                        getParcelStyle={getParcelStyle}
                                        handleSelectMapParcel={handleSelectMapParcel}
                                        MapController={MapController}
                                        ROSARIO_BARANGAYS={ROSARIO_BARANGAYS}
                                        LAND_USE_CLASSES={LAND_USE_CLASSES}
                                        handleBack={handleBack}
                                        handleNext={handleNext}
                                        formRef={formRef}
                                        handleSubmit={handleSubmit}
                                    />
                                ) : (
                                    /* ── STEPS 1, 2, 4, 5: LEFT DOSSIER + RIGHT ACTIVE FORM ── */
                                    <>
                                        {/* Left: Step Guidance & Application Summary (Light Theme) */}
                                        <div className="w-full lg:w-76 xl:w-[310px] shrink-0 bg-slate-50/90 border-b lg:border-b-0 lg:border-r border-slate-200/90 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto">
                                            <div className="space-y-3.5">
                                                <div>
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider">
                                                        Step {currentStep} of 5 · Application Form
                                                    </span>
                                                    <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight mt-1.5">
                                                        {currentStep === 1 && "Application Category"}
                                                        {currentStep === 2 && "Applicant Information"}
                                                        {currentStep === 4 && "Review & Confirm"}
                                                        {currentStep === 5 && "Assessment & Fees"}
                                                    </h2>
                                                    <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                                                        {currentStep === 1 && "Choose the clearance type and specify the land use and purpose of the application."}
                                                        {currentStep === 2 && "Enter primary applicant contact details and representative information (if any)."}
                                                        {currentStep === 4 && "Review all recorded information before setting assessment fees and submitting."}
                                                        {currentStep === 5 && "Compute assessment fee using municipal zoning formula or enter custom fee."}
                                                    </p>
                                                </div>

                                                {/* Application Summary or Step 4 Review Checklist */}
                                                {currentStep === 4 ? (
                                                    /* ── STEP 4: REVIEW & SECTION COMPLETION CHECKLIST ── */
                                                    <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs space-y-2.5">
                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Ready for Review</span>
                                                            <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">3/3 Complete</span>
                                                        </div>

                                                        <div className="space-y-2 text-xs">
                                                            <div className="flex items-start gap-2 text-slate-700">
                                                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">1</span>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold text-slate-800 text-[11px]">Category & Purpose</p>
                                                                    <p className="text-[10px] text-slate-500 truncate">{form.application_type || "—"} · {form.land_use_class || "—"}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-2 text-slate-700">
                                                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">2</span>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold text-slate-800 text-[11px]">Applicant Details</p>
                                                                    <p className="text-[10px] text-slate-500 truncate">{form.applicant_name || "—"}</p>
                                                                </div>
                                                            </div>
                                                            <div className="flex items-start gap-2 text-slate-700">
                                                                <span className="w-4 h-4 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="font-semibold text-slate-800 text-[11px]">Property Location & Lots</p>
                                                                    <p className="text-[10px] text-slate-500 truncate">
                                                                        {form.barangay 
                                                                            ? `Brgy. ${form.barangay}${validParcelsCount > 0 && totalLotArea > 0 ? ` (${totalLotArea.toLocaleString()} m²)` : ""}` 
                                                                            : "—"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="pt-2 border-t border-slate-100 text-[10px] text-slate-500 leading-snug">
                                                            Review the details on the right. Click <strong className="text-blue-600 font-semibold">Edit</strong> on any section to make changes.
                                                        </div>
                                                    </div>
                                                ) : (
                                                    /* ── STEPS 1, 2, 5: APPLICATION SUMMARY CARD ── */
                                                    <div className="bg-white rounded-2xl p-3 sm:p-3.5 border border-slate-200/90 shadow-xs space-y-2">
                                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Application Summary</span>
                                                            <span className="text-[10px] font-mono font-bold text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded-md">{tempDraftId}</span>
                                                        </div>

                                                        <div className="space-y-1.5 text-xs">
                                                            <div>
                                                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Category</p>
                                                                <p className="font-bold text-slate-900 mt-0.5 truncate text-[11px]">{form.application_type || "Not selected yet"}</p>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100">
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Applicant</p>
                                                                    <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">{form.applicant_name || "—"}</p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Zoning Class</p>
                                                                    <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">{form.land_use_class || "—"}</p>
                                                                </div>
                                                            </div>
                                                            <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-100">
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Location</p>
                                                                    <p className="font-semibold text-slate-800 truncate mt-0.5 text-[11px]">
                                                                        {form.barangay ? (form.street_address ? `${form.street_address}, Brgy. ${form.barangay}` : `Brgy. ${form.barangay}`) : "—"}
                                                                    </p>
                                                                </div>
                                                                <div>
                                                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Property Lots</p>
                                                                    <p className="font-mono font-semibold text-slate-800 mt-0.5 text-[11px]">
                                                                        {validParcelsCount > 0 
                                                                            ? `${validParcelsCount} lot(s) (${totalLotArea.toLocaleString()} m²)` 
                                                                            : "—"}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            {currentStep === 5 && form.assessment_fee ? (
                                                                <div className="pt-1.5 border-t border-slate-100">
                                                                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">Assessment Fee</p>
                                                                    <p className="font-mono font-bold text-emerald-600 text-xs mt-0.5">₱ {Number(form.assessment_fee).toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                                                                </div>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Footer of Left Panel: 20% per Step Progress */}
                                            <div className="pt-3 border-t border-slate-200/90 mt-3 lg:mt-0 space-y-1.5">
                                                <div className="flex items-center justify-between text-xs">
                                                    <span className="font-bold text-slate-800 flex items-center gap-1.5 text-[11px]">
                                                        <span className={`w-2 h-2 rounded-full ${workflowProgress === 100 ? "bg-emerald-500" : "bg-blue-600 animate-pulse"}`} />
                                                        Workflow Progress
                                                    </span>
                                                    <span className="font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg text-[11px] shadow-2xs">
                                                        {workflowProgress}%
                                                    </span>
                                                </div>
                                                <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-blue-500 to-blue-600 rounded-full transition-all duration-500 ease-out"
                                                        style={{ width: `${workflowProgress}%` }}
                                                    />
                                                </div>
                                                <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                                    <span>{workflowProgress === 100 ? "Ready for submission" : `${workflowProgress}% completed (Step ${Math.min(5, Math.floor(workflowProgress / 20) + 1)} of 5)`}</span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* ── RIGHT PANEL: ACTIVE FORM SURFACE ── */}
                                        <div ref={formRef} className="flex-1 p-5 sm:p-6 lg:p-7 flex flex-col justify-between bg-white overflow-y-auto">
                                            <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-4">
                                                
                                                {/* ── STEP 1: SCOPE & PURPOSE ── */}
                                                {currentStep === 1 && (
                                                    <StepCategory
                                                        form={form}
                                                        set={set}
                                                        handleTypeSelect={handleTypeSelect}
                                                        errors={errors}
                                                        APPLICATION_TYPES={APPLICATION_TYPES}
                                                        LAND_USE_CLASSES={LAND_USE_CLASSES}
                                                    />
                                                )}

                                                {/* ── STEP 2: APPLICANT PROFILE ── */}
                                                {currentStep === 2 && (
                                                    <StepApplicant
                                                        form={form}
                                                        set={set}
                                                        handleNameChange={handleNameChange}
                                                        handleContactInput={handleContactInput}
                                                        applicantSuggestion={applicantSuggestion}
                                                        applyApplicantSuggestion={applyApplicantSuggestion}
                                                        setApplicantSuggestion={setApplicantSuggestion}
                                                        errors={errors}
                                                    />
                                                )}

                                                {/* ── STEP 4: REVIEW & CONFIRM ── */}
                                                {currentStep === 4 && (
                                                    <StepReview
                                                        form={form}
                                                        totalLotArea={totalLotArea}
                                                        setCurrentStep={setCurrentStep}
                                                        onPreviewRoutingSlip={() => {
                                                            setRoutingSlipData({
                                                                reference_number: `DRAFT-${form.form_number || tempDraftId}`,
                                                                date_of_application: new Date().toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }),
                                                                encoded_by_name: userName,
                                                                applicant_name: form.applicant_name || "Applicant Name Pending",
                                                                contact_number: form.contact_number || "—",
                                                                email: form.email || "—",
                                                                representative_name: form.representative_name || "",
                                                                application_type: form.application_type || "Locational Clearance",
                                                                land_use_class: form.land_use_class || "Residential",
                                                                purpose: form.purpose || "—",
                                                                barangay: form.barangay || "—",
                                                                street_address: form.street_address || "",
                                                                parcels: form.parcels || [],
                                                                total_area: totalLotArea,
                                                                project_cost: form.project_cost || "",
                                                                assessment_fee: form.assessment_fee || calculatedFeeBreakdown.total,
                                                                or_number: form.or_number || "",
                                                            });
                                                            setShowRoutingSlip(true);
                                                        }}
                                                    />
                                                )}

                                                {/* ── STEP 5: SMART MUNICIPAL FEE CALCULATION & SUBMIT ── */}
                                                {currentStep === 5 && (
                                                    <StepFee
                                                        form={form}
                                                        set={set}
                                                        feeMode={feeMode}
                                                        setFeeMode={setFeeMode}
                                                        calculatedFeeBreakdown={calculatedFeeBreakdown}
                                                        errors={errors}
                                                    />
                                                )}

                                                {/* ── STEP NAVIGATION CONTROLS ── */}
                                                <div className="pt-6 border-t border-slate-100 flex items-center justify-between gap-3 mt-auto">
                                                    {currentStep > 1 ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleBack}
                                                            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                                                        >
                                                            <span>Back</span>
                                                        </button>
                                                    ) : <div />}

                                                    {currentStep < 5 ? (
                                                        <button
                                                            type="button"
                                                            onClick={handleNext}
                                                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-98 cursor-pointer ml-auto"
                                                        >
                                                            <span>{currentStep === 1 ? "Continue to Applicant" : currentStep === 2 ? "Continue to Property Location" : "Proceed to Assessment & Fees"}</span>
                                                        </button>
                                                    ) : (
                                                        <button
                                                            type="submit"
                                                            disabled={submitting}
                                                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ml-auto"
                                                        >
                                                            {submitting ? (
                                                                <>
                                                                    <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin"></span>
                                                                    <span>Submitting...</span>
                                                                </>
                                                            ) : (
                                                                <span>Submit & Route to Technical Review</span>
                                                            )}
                                                        </button>
                                                    )}
                                                </div>
                                            </form>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* Printable Application Routing Slip Modal */}
            <RoutingSlipModal
                open={showRoutingSlip}
                data={routingSlipData}
                onClose={() => {
                    setShowRoutingSlip(false);
                    if (workflowProgress === 100) {
                        router.visit("/applications");
                    }
                }}
                onPrint={() => window.print()}
            />
        </>
    );
}