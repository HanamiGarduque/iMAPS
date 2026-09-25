// resources/js/Pages/Applications/Components/StepPropertyGIS.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import ParcelInspectionScheduler from "./ParcelInspectionScheduler";
import "leaflet/dist/leaflet.css";
import { Label, Input, Select } from "./FormControls";

// ── Approved Municipal Zoning Categories ──
const ZONING_SUB_CLASSES = [
    {
        name: "Residential",
        items: [
            { code: "R1-Z", label: "Residential-1 Zone" },
            { code: "R2-Z", label: "Residential-2 Zone" },
            { code: "MR2-SZ", label: "Maximum R-2 Sub-Zone" },
            { code: "BR2-SZ", label: "Basic R-2 Sub-Zone" },
        ],
    },
    {
        name: "Commercial",
        items: [
            { code: "C1-Z", label: "Commercial-1 Zone" },
            { code: "C2-Z", label: "Commercial-2 Zone" },
            { code: "C/MP-Z", label: "Cemetery/ Memorial Park Zone" },
        ],
    },
    {
        name: "Industrial",
        items: [
            { code: "I1-Z", label: "Industrial-1 Zone" },
            { code: "I2-Z", label: "Industrial-2 Zone" },
            { code: "I3-Z", label: "Industrial-3 Zone" },
        ],
    },
    {
        name: "Agri-Industrial",
        items: [
            { code: "AgIndZ", label: "Agri-Industrial Zone" },
            { code: "AgIndZ-PTR", label: "Agri-Industrial Zone Poultry" },
            { code: "AgIndZ-PGR", label: "Agri-Industrial Zone Piggery" },
        ],
    },
    {
        name: "Institutional",
        items: [
            { code: "GI-Z", label: "General Institutional Zone" },
            { code: "UTS-Z", label: "Utility, Transportation, and Services" },
            { code: "CMRF", label: "Central Materials Recovery Facility" },
        ],
    },
    {
        name: "Recreational",
        items: [
            { code: "PR-Z", label: "Parks and Recreation Zone" },
            { code: "T-Z", label: "Tourism Zone" },
            { code: "ECT-Z", label: "Eco-Tourism Zone" },
        ],
    },
];

const ZONING_CATEGORIES = [
    {
        id: "Residential",
        label: "Residential",
        code: "R-1 / R-2 / R-3",
        badge: "bg-blue-50 text-blue-700 border-blue-200",
        activeBorder: "border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20",
        icon: (
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
            </svg>
        ),
        desc: "Housing, residential subdivisions, estates & living zones.",
    },
    {
        id: "Commercial",
        label: "Commercial",
        code: "C-1 / C-2 / C-3",
        badge: "bg-amber-50 text-amber-700 border-amber-200",
        activeBorder: "border-amber-600 bg-amber-50/50 ring-2 ring-amber-500/20",
        icon: (
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.25A2.25 2.25 0 010 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0118 7.5v11.25A2.25 2.25 0 0115.75 21H13.5zM3.75 9h10.5m-10.5 4.5h10.5" />
            </svg>
        ),
        desc: "Retail, trade, financial institutions, markets & commercial centers.",
    },
    {
        id: "Industrial",
        label: "Industrial",
        code: "I-1 / I-2 / Agro-Ind",
        badge: "bg-purple-50 text-purple-700 border-purple-200",
        activeBorder: "border-purple-600 bg-purple-50/50 ring-2 ring-purple-500/20",
        icon: (
            <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
        ),
        desc: "Manufacturing, warehousing, fabrication & processing plants.",
    },
    {
        id: "Agri-Industrial",
        label: "Agri-Industrial",
        code: "Agri-Ind",
        badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
        activeBorder: "border-emerald-600 bg-emerald-50/50 ring-2 ring-emerald-500/20",
        icon: (
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
        ),
        desc: "Farming, cultivation, agro-production & rural green buffer zones.",
    },
    {
        id: "Institutional",
        label: "Institutional",
        code: "Institutional",
        badge: "bg-sky-50 text-sky-700 border-sky-200",
        activeBorder: "border-sky-600 bg-sky-50/50 ring-2 ring-sky-500/20",
        icon: (
            <svg className="w-5 h-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
            </svg>
        ),
        desc: "Government, civic, educational, health and public service facilities.",
    },
    {
        id: "Recreational",
        label: "Recreational",
        code: "Parks / Leisure",
        badge: "bg-lime-50 text-lime-700 border-lime-200",
        activeBorder: "border-lime-600 bg-lime-50/50 ring-2 ring-lime-500/20",
        icon: (
            <svg className="w-5 h-5 text-lime-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-13.5v9m-4.5-4.5h9" />
            </svg>
        ),
        desc: "Parks, sports, open-space and community leisure facilities.",
    },
];

// Resize map observer helper
function MapResizeTrigger({ isExpanded }) {
    const map = useMap();
    useEffect(() => {
        map.invalidateSize();
        const t1 = setTimeout(() => map.invalidateSize(), 50);
        const t2 = setTimeout(() => map.invalidateSize(), 200);
        const t3 = setTimeout(() => map.invalidateSize(), 400);
        return () => {
            clearTimeout(t1);
            clearTimeout(t2);
            clearTimeout(t3);
        };
    }, [isExpanded, map]);
    return null;
}

export default function StepPropertyGIS({
    form,
    set,
    setForm,
    setParcelField,
    addParcel,
    removeParcel,
    handlePinLookup,
    pinLoading = {},
    errors = {},
    totalLotArea = 0,
    zoningWarning = null,
    activeParcelIndex = 0,
    activeParcelFeature = null,
    brgyMapData = null,
    parcelMapData = null,
    rosarioCenter = [13.8475, 121.2058],
    brgyStyle,
    getParcelStyle,
    handleSelectMapParcel,
    MapController,
    inspectors = [],
    LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agri-Industrial", "Institutional", "Recreational"],
    handleBack,
    handleNext,
    formRef,
    handleSubmit,
}) {
    const [isMapExpanded, setIsMapExpanded] = useState(false);
    const [activeTab, setActiveTab] = useState("verification");
    const shouldShowTargetZoning = form.application_stream === "amendment";

    // ── Map Notification State ──
    const isVerifying = Object.values(pinLoading || {}).some(Boolean);
    const [mapMessage, setMapMessage] = useState(null);
    const prevVerifyingRef = React.useRef(false);

    useEffect(() => {
        if (isVerifying) {
            setMapMessage({ type: "loading", text: "Verifying PIN in Municipal Database..." });
            prevVerifyingRef.current = true;
        } else if (prevVerifyingRef.current) {
            setMapMessage({ type: "success", text: "Verification Check Complete" });
            const timer = setTimeout(() => setMapMessage(null), 3500);
            prevVerifyingRef.current = false;
            return () => clearTimeout(timer);
        }
    }, [isVerifying]);
    const selectedApplicationTypes = (form.application_type || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
    const isRezoningApplication = selectedApplicationTypes.includes("Petition for Rezoning");
    const isAmendmentStream = form.application_stream === "amendment";
    
    // Progression Status
    const isVerificationDone = form.parcels?.length > 0 && form.parcels.every(p => p.is_verified);
    
    // Check if any parcel has a mismatch to lock progression globally
    const isProgressionLocked = (form.parcels || []).some(p => {
        const cadastral = p.cadastral_zone?.trim().toLowerCase();
        const clup = p.land_use_class?.trim().toLowerCase();
        return p.is_verified && cadastral && clup && cadastral !== clup;
    }) && !isAmendmentStream;

    const isEvaluationDone = isVerificationDone && !isProgressionLocked;
    const isDetailsDone = !!(form.project_nature && form.project_tenure);

    const handleSelectZoningCategory = (catId) => {
        // Update main form land use class
        const e = { target: { value: catId } };
        set("land_use_class")(e);

        // Also update parcels if active
        if (form.parcels && form.parcels.length > 0) {
            const targetIdx = activeParcelIndex !== null ? activeParcelIndex : 0;
            setParcelField(targetIdx, "land_use_class")({ target: { value: catId } });
        }
    };

    // ── Phase 2: Evaluation Engine (Cadastral vs CLUP Cross-Reference) ──
    const handleSwitchStream = (newType, parcelIndex) => {
        // Grab ONLY the parcel that triggered the amendment
        const triggeringParcel = form.parcels[parcelIndex];
        
        // Reset the parcel code to P-01 since it will be the only one left
        triggeringParcel.parcel_code = "P-01";

        setForm((prev) => ({
            ...prev,
            application_stream: "amendment",
            application_type: newType,
            // Override the array to retain ONLY the problematic parcel
            parcels: [triggeringParcel], 
        }));
    };

    return (
        <div className="relative w-full h-full flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* ── LEFT: INTERACTIVE ROSARIO GIS MAP ── */}
            <div 
                className={`transition-all duration-300 ease-in-out bg-slate-100 relative overflow-hidden flex flex-col ${
                    isMapExpanded 
                        ? "w-full h-full flex-1" 
                        : "hidden lg:flex lg:w-1/2 w-full h-full border-r border-slate-200"
                }`}
            >
                <div className="absolute inset-0 z-0">
                    <MapContainer center={rosarioCenter} zoom={12} zoomControl={false} scrollWheelZoom={true}>
                        <TileLayer
                            attribution="&copy; Google Maps"
                            url="https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}"
                            zIndex={1}
                        />
                        
                        <TileLayer
                            url="/tiles/clup_tiles/{z}/{x}/{y}.png"
                            maxZoom={22}
                            maxNativeZoom={19}
                            opacity={0.4}
                            zIndex={10}
                            errorTileUrl="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
                        />

                        {brgyMapData && <GeoJSON data={brgyMapData} style={brgyStyle} />}
                        {parcelMapData && (
                            <GeoJSON 
                                key={activeParcelFeature?.properties?.property_index_number || "parcels"} 
                                data={parcelMapData} 
                                style={getParcelStyle}
                                onEachFeature={(feature, layer) => {
                                    layer.on({
                                        click: () => {
                                            const p = feature?.properties || {};
                                            const pin = p.property_index_number || p.pin || p.PIN;
                                            const lot = p.lot_number || p.lot_no;
                                            const area = p.lot_area_sqm || p.area;
                                            const brgy = p.barangay;
                                            setTimeout(() => {
                                                handleSelectMapParcel(pin, lot, area, brgy, feature);
                                            }, 10);
                                        },
                                    });
                                }}
                            />
                        )}
                        {MapController && <MapController brgyData={brgyMapData} activeParcelFeature={activeParcelFeature} />}
                        <MapResizeTrigger isExpanded={isMapExpanded} />
                    </MapContainer> 
                </div>

                {/* Top Controls: Expand / Maximize Map Toggle & Cadastral Verification HUD */}
                <div className="absolute top-3 left-3 right-3 z-10 flex items-start justify-between gap-2 pointer-events-none">
                    <div className="pointer-events-auto">
                        {(form.parcels || []).map(
                            (parcel, idx) =>
                                idx === activeParcelIndex &&
                                parcel.property_index_number && (
                                    <div key={idx} className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200/90 max-w-xs sm:max-w-sm animate-in fade-in zoom-in-95">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5 gap-2">
                                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                                {parcel.parcel_code} Assessor Lot
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-slate-700 truncate">
                                                PIN: {parcel.property_index_number}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                            <div>
                                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">ARP / Tax Dec.</p>
                                                <p className="font-semibold text-slate-800 truncate">{parcel.arp_number || parcel.tax_dec_number || parcel.lot_number || "ARP Verified"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Survey Number</p>
                                                <p className="font-semibold text-slate-800 truncate">{parcel.survey_number || "—"}</p>
                                            </div>
                                            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-100">
                                                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Land Use Classification:</span>
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                                    {parcel.cadastral_zone }
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                        )}
                    </div>

                    <div className="pointer-events-auto flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsMapExpanded((prev) => !prev)}
                            className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-full shadow-lg border border-slate-200/90 text-xs font-bold transition-all active:scale-95 cursor-pointer backdrop-blur-xs"
                            title={isMapExpanded ? "Restore split view" : "Maximize map for detailed digitizing"}
                        >
                            {isMapExpanded ? (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                                    </svg>
                                    <span>Split View</span>
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                                    </svg>
                                    <span>Maximize Map</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {isMapExpanded && (
                    <div className="absolute bottom-4 right-4 z-10 animate-in fade-in slide-in-from-bottom-2">
                        <button
                            type="button"
                            onClick={() => setIsMapExpanded(false)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xl transition-all active:scale-95 cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Return to Property Form</span>
                        </button>
                    </div>
                )}

                <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl shadow-md border border-slate-200/80 text-[11px] font-medium text-slate-600 flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40 border border-blue-600" /> Barangay
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-500/50 border border-red-600" /> Selected Lot
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(Click boundary on map to select)</span>
                </div>

                {/* ── MAP NOTIFICATION OVERLAY ── */}
                {mapMessage && (
                    <div className="absolute inset-0 z-50 bg-slate-900/10 backdrop-blur-[2px] flex items-center justify-center animate-in fade-in duration-300 pointer-events-none">
                        <div className="bg-white/95 backdrop-blur-md px-5 py-3 rounded-full shadow-2xl border border-slate-200 flex items-center gap-3 transform transition-all pointer-events-auto">
                            {mapMessage.type === "loading" ? (
                                <span className="w-5 h-5 border-2 border-slate-200 border-t-blue-600 rounded-full animate-spin shrink-0" />
                            ) : (
                                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                                </div>
                            )}
                            <p className="text-sm font-bold text-slate-700">{mapMessage.text}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── RIGHT: PROPERTY FORM PANEL ── */}
            <div 
                ref={formRef} 
                className={`${
                    isMapExpanded 
                        ? "hidden" 
                        : "flex-1 lg:w-1/2 w-full flex flex-col p-5 sm:p-7 overflow-y-auto bg-white justify-between"
                }`}
            >
                <form onSubmit={handleSubmit} className="flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        <div className="flex items-start justify-between pb-3 border-b border-slate-200/80">
                            <div>
                                <div className="flex items-center gap-2 mb-2">
                                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                        Step 3 of 5 - Property Location
                                    </span>
                                </div>
                                <h3 className="text-lg font-bold text-slate-900 tracking-tight">Property Map & Zoning</h3>
                                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                                    Locate the property on the map or enter the PIN to verify location and zoning.
                                </p>
                            </div>
                            {totalLotArea > 0 && (
                                <span className="font-mono text-xs font-bold text-slate-700 bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-md shadow-2xs shrink-0 flex flex-col items-end">
                                    <span className="text-[9px] uppercase text-slate-400">Total Area</span>
                                    <span>{totalLotArea.toLocaleString()} m&sup2;</span>
                                </span>
                            )}
                        </div>

                        {/* Internal Tabs (Slider) */}
                        <div className="relative mb-5 mt-2">
                            <div className="flex bg-slate-100/80 p-1.5 rounded-full border border-slate-200/50 shadow-inner relative z-10">
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("verification")}
                                    className={`flex-1 flex items-center justify-center py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                        activeTab === "verification" 
                                            ? "bg-white text-blue-700 shadow-sm border border-slate-200/60" 
                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                    }`}
                                >
                                    PIN Verification
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("evaluation")}
                                    className={`flex-1 flex items-center justify-center py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                        activeTab === "evaluation" 
                                            ? "bg-white text-emerald-700 shadow-sm border border-slate-200/60" 
                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                    }`}
                                >
                                    Parcel Evaluation
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setActiveTab("details")}
                                    disabled={isProgressionLocked}
                                    className={`flex-1 flex items-center justify-center py-2 px-3 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                        activeTab === "details" 
                                            ? "bg-white text-slate-700 shadow-sm border border-slate-200/60" 
                                            : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                                    } ${isProgressionLocked ? "opacity-50 cursor-not-allowed" : ""}`}
                                >
                                    Project Details
                                </button>
                            </div>
                            
                            {/* Visual Progression Bar */}
                            <div className="h-1.5 w-[96%] mx-auto bg-slate-100 rounded-full overflow-hidden mt-3 border border-slate-200/60 shadow-inner">
                                <div 
                                    className="h-full bg-blue-500 transition-all duration-700 ease-out"
                                    style={{ width: isDetailsDone ? '100%' : (isEvaluationDone ? '66%' : (isVerificationDone ? '33%' : '0%')) }}
                                />
                            </div>
                        </div>

                        {activeTab === "verification" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div className="lg:hidden">
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded(true)}
                                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold shadow-2xs active:scale-98 cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <span>Open Interactive GIS Map</span>
                            </button>
                        </div>

                        {form.barangay ? (
                            <div className="flex items-center gap-2 mb-3">
                                <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Property Location:</span>
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold border border-emerald-200">
                                    Brgy. {form.barangay}
                                </span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-medium bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/50 w-max">
                                <span>Select a lot on the map or verify PIN to auto-detect Barangay.</span>
                            </div>
                        )}

                        {/* ── SECTION 1: TAX DECLARATION PIN VERIFICATION ── */}
                        <div className="space-y-3 pt-1">
                            {(form.parcels || []).map((parcel, index) => (
                                <div key={index} className="rounded-2xl bg-white border border-slate-200 shadow-sm p-5 space-y-4 relative">
                                    <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                                        <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-widest">
                                            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                            {parcel.parcel_code || `Property Lot ${index + 1}`}
                                        </span>
                                        {form.parcels && form.parcels.length > 1 && (
                                            <button 
                                                type="button" 
                                                onClick={() => removeParcel(index)} 
                                                className="text-xs font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1 cursor-pointer"
                                            >
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                </svg> 
                                                <span>Remove Lot</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* PIN Input & Verification Button */}
                                    <div>
                                        <Label required hasError={!!errors[`parcels.${index}.property_index_number`]}>
                                            Property Identification Number (PIN) from Tax Declaration
                                        </Label>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-1">
                                            <Input 
                                                type="text" 
                                                value={parcel.property_index_number || ""} 
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    if (!val.trim()) {
                                                        setForm(prev => ({
                                                            ...prev,
                                                            parcels: prev.parcels.map((p, i) => i === index ? {
                                                                ...p,
                                                                property_index_number: "",
                                                                is_verified: false,
                                                                owner_name: "",
                                                                cadastral_zone: "",
                                                                land_use_class: "",
                                                                parcel_code: "",
                                                                lot_number: "",
                                                                survey_number: "",
                                                                arp_number: ""
                                                            } : p)
                                                        }));
                                                        if (typeof handleSelectMapParcel === 'function') {
                                                            handleSelectMapParcel(null, index);
                                                        }
                                                    } else {
                                                        setParcelField(index, "property_index_number")(e);
                                                    }
                                                }}
                                                placeholder="e.g. 04-01-021-XXX-XX-XXX" 
                                                className="flex-1 font-mono bg-white uppercase" 
                                                hasError={!!errors[`parcels.${index}.property_index_number`]} 
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => handlePinLookup(index)} 
                                                disabled={pinLoading[index] || !parcel.property_index_number?.trim() || parcel.is_verified} 
                                                className={`inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-xs font-semibold transition-all shadow-xs whitespace-nowrap ${
                                                    parcel.is_verified 
                                                        ? "bg-slate-200 text-slate-500 cursor-default"
                                                        : pinLoading[index] || !parcel.property_index_number?.trim() 
                                                            ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                                                            : "bg-slate-800 hover:bg-slate-900 text-white active:scale-98 cursor-pointer"
                                                }`}
                                            >
                                                {pinLoading[index] ? (
                                                    <>
                                                        <span className="w-3.5 h-3.5 border-2 border-slate-400/40 border-t-slate-600 rounded-full animate-spin" />
                                                        <span>Verifying...</span>
                                                    </>
                                                ) : parcel.is_verified ? (
                                                    <>
                                                        <span>Verified</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span>Verify</span>
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                        {errors[`parcels.${index}.property_index_number`] && (
                                            <p className="text-xs font-medium text-rose-500 mt-1">{errors[`parcels.${index}.property_index_number`]}</p>
                                        )}
                                    </div>

                                    {/* Cross-Referenced Database Details */}
                                    {parcel.is_verified || parcel.lot_number ? (
                                        <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                                            <div className="flex items-center justify-between pb-3 border-b border-slate-200/80 mb-3">
                                                <span className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold text-emerald-700">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                                    Property Found in Records
                                                </span>
                                                <span className="text-[10px] font-mono font-bold text-slate-500 bg-white border border-slate-200 px-2 py-0.5 rounded shadow-2xs">
                                                    {parcel.parcel_code}
                                                </span>
                                            </div>
                                            
                                            <div className="space-y-4 text-xs">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Registered Owner</span>
                                                    <span className="font-bold text-slate-800">{parcel.owner_name || "—"}</span>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Assessor Record</span>
                                                        <span className="font-semibold text-slate-800 truncate">{parcel.cadastral_zone || "—"}</span>
                                                    </div>
                                                    <div className="flex flex-col gap-1 text-right">
                                                        <span className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Mapped Land Use</span>
                                                        <span className="font-bold text-slate-800 truncate">{parcel.land_use_class || "—"}</span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center justify-between pt-3 border-t border-slate-200/80 text-[10px] font-mono">
                                                    <span className="text-slate-400">ARP: <span className="font-semibold text-slate-700">{parcel.arp_number || "—"}</span></span>
                                                    <span className="text-slate-400">SURVEY: <span className="font-semibold text-slate-700">{parcel.survey_number || "—"}</span></span>
                                                    <span className="text-slate-400">LOT: <span className="font-semibold text-slate-700">{parcel.lot_number || "—"}</span></span>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-50/50 border border-slate-100 rounded-xl p-3 text-[11px] text-slate-500 flex items-start gap-2.5">
                                            <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" /></svg>
                                            </div>
                                            <p className="leading-relaxed">Enter the PIN printed on the applicant's Tax Declaration and click <b>Verify</b>, or select a parcel polygon on the GIS map.</p>
                                        </div>
                                    )}
                                </div>
                            ))}

                            <button 
                                type="button" 
                                onClick={addParcel} 
                                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full border-2 border-dashed border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 text-slate-500 hover:text-blue-700 font-bold text-xs transition-all cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                                </svg> 
                                <span>Add Another Parcel</span>
                            </button>
                        </div>
                            </div>
                        )}

                        {activeTab === "evaluation" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                {shouldShowTargetZoning && (
                                    <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 mb-2 shadow-sm">
                                        <div className="flex items-center gap-2 border-b border-blue-100 pb-2 mb-1">
                                            <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-800">Legislative Amendment Target</h4>
                                                <p className="text-[10px] text-blue-600/80">Select the proposed zoning class for this amendment request.</p>
                                            </div>
                                        </div>
                                        <div>
                                            <Label required hasError={!!errors.target_land_use_class}>Target Zoning Classification</Label>
                                            <Select 
                                                value={form.target_land_use_class || ""} 
                                                onChange={set("target_land_use_class")} 
                                                hasError={!!errors.target_land_use_class}
                                                className="bg-white mt-1"
                                            >
                                                <option value="" disabled>Select target zoning...</option>
                                                {isRezoningApplication ? (
                                                    ZONING_SUB_CLASSES.map((group) => (
                                                        <optgroup key={group.name} label={group.name} className="font-bold text-slate-900 bg-slate-50">
                                                            {group.items.map((item) => (
                                                                <option key={item.code} value={item.code} className="font-medium text-slate-700 bg-white">
                                                                    {item.label} ({item.code})
                                                                </option>
                                                            ))}
                                                        </optgroup>
                                                    ))
                                                ) : (
                                                    LAND_USE_CLASSES.map((c) => (
                                                        <option key={c} value={c} className="font-medium text-slate-700">{c}</option>
                                                    ))
                                                )}
                                            </Select>
                                            {errors.target_land_use_class && <p className="text-xs font-medium text-rose-500 mt-1">{errors.target_land_use_class}</p>}
                                        </div>
                                    </div>
                                )}

                                {(form.parcels || []).map((parcel, index) => (
                                    <div key={index} className="space-y-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">Parcel {index + 1}</span>
                                            {parcel.property_index_number && <span className="font-mono text-[10px] text-slate-500 font-bold">{parcel.property_index_number}</span>}
                                        </div>
                                        
                                        {/* ── PER-PARCEL MISMATCH INTERCEPT BANNER ── */}
                                        {(() => {
                                            if (!parcel.is_verified || !parcel.land_use_class || !parcel.cadastral_zone) return null;
                                            const cadastral = parcel.cadastral_zone.trim().toLowerCase();
                                            const clup = parcel.land_use_class.trim().toLowerCase();
                                            
                                            if (cadastral === clup) return null;

                                            let parcelIntercept = null;
                                            if (isAmendmentStream) {
                                                parcelIntercept = {
                                                    color: "blue",
                                                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />,
                                                    title: "Legislative Track Activated",
                                                    message: "A legislative amendment track is activated for this lot. This file will bypass standard clearance checks."
                                                };
                                            } else if (cadastral.includes("agri") || cadastral.includes("agricultural") || cadastral.includes("agind")) {
                                                parcelIntercept = {
                                                    color: "rose",
                                                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
                                                    title: "Zoning Mismatch Detected",
                                                    message: `The Assessor record classifies this lot as "${parcel.cadastral_zone}", but the spatial Land Use Plan designates it as "${parcel.land_use_class}".`,
                                                    action: { label: "Switch to Reclassification Stream", type: "Petition for Reclassification" }
                                                };
                                            } else {
                                                parcelIntercept = {
                                                    color: "amber",
                                                    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />,
                                                    title: "System Intercept: Zoning Map Amendment Required",
                                                    message: `The Assessor record classifies this lot as "${parcel.cadastral_zone}", but the spatial Land Use Plan designates it as "${parcel.land_use_class}".`,
                                                    action: { label: "Switch to Rezoning Stream", type: "Petition for Rezoning" }
                                                };
                                            }

                                            return (
                                                <div className={`mt-0 p-2.5 rounded-lg border flex items-start gap-2 animate-in fade-in shadow-2xs bg-white ${
                                                    parcelIntercept.color === 'blue' ? 'border-l-2 border-l-blue-500 border-y-slate-200 border-r-slate-200' :
                                                    parcelIntercept.color === 'rose' ? 'border-l-2 border-l-rose-500 border-y-slate-200 border-r-slate-200' :
                                                    'border-l-2 border-l-amber-500 border-y-slate-200 border-r-slate-200'
                                                }`}>
                                                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                                                        parcelIntercept.color === 'blue' ? 'bg-blue-50 text-blue-600' :
                                                        parcelIntercept.color === 'rose' ? 'bg-rose-50 text-rose-600' :
                                                        'bg-amber-50 text-amber-600'
                                                    }`}>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">{parcelIntercept.icon}</svg>
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h4 className="text-[11px] font-bold text-slate-800">{parcelIntercept.title}</h4>
                                                        <p className="text-[10px] mt-0.5 leading-tight text-slate-500">{parcelIntercept.message}</p>
                                                        
                                                        {parcelIntercept.action && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleSwitchStream(parcelIntercept.action.type, index)}
                                                                className={`mt-1.5 inline-flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-all shadow-xs cursor-pointer bg-slate-800 hover:bg-slate-900 text-white`}
                                                            >
                                                                <span>{parcelIntercept.action.label}</span>
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" /></svg>
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        <ParcelInspectionScheduler
                                            index={index}
                                            parcel={parcel}
                                            setParcelField={setParcelField}
                                            inspectors={inspectors}
                                            errors={errors}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {activeTab === "details" && (
                            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                                <div>
                                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                                        <svg className="w-4 h-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" /></svg>
                                        Project Area & Layout Specifics
                                    </h4>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Specify building coverage, development extent, and right-over-land data.</p>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div>
                                    <Label>Building Area (sq.m)</Label>
                                    <Input
                                        type="number"
                                        value={form.building_area || ""}
                                        onChange={set("building_area")}
                                        placeholder="e.g. 120.5"
                                    />
                                </div>
                                <div>
                                    <Label>Area to be Developed (sq.m)</Label>
                                    <Input
                                        type="number"
                                        value={form.area_to_develop || ""}
                                        onChange={set("area_to_develop")}
                                        placeholder="e.g. 500.00"
                                    />
                                </div>
                                <div>
                                    <Label>Number of Saleable Lots</Label>
                                    <Input
                                        type="number"
                                        value={form.number_of_saleable_lots || ""}
                                        onChange={set("number_of_saleable_lots")}
                                        placeholder="e.g. 10"
                                    />
                                </div>

                                <div className="sm:col-span-2">
                                    <Label>Project Type / Business Name (Optional)</Label>
                                    <Input
                                        type="text"
                                        value={form.project_type_business_name || ""}
                                        onChange={set("project_type_business_name")}
                                        placeholder="e.g. Residential Subdivision / Juan's Hardware"
                                    />
                                </div>

                                <div>
                                    <Label>Project Cost (₱)</Label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={form.project_cost || ""}
                                        onChange={set("project_cost")}
                                        placeholder="e.g. 1000000.00"
                                    />
                                </div>

                                <div>
                                    <Label>Right over Land</Label>
                                    <Select value={form.right_over_land || ""} onChange={set("right_over_land")}>
                                        <option value="">Select</option>
                                        <option value="Owner">Owner</option>
                                        <option value="Lessee">Lessee</option>
                                        <option value="Others">Others</option>
                                    </Select>
                                </div>

                                <div>
                                    <Label>Project Tenure</Label>
                                    <Select value={form.project_tenure || ""} onChange={set("project_tenure")}>
                                        <option value="">Select</option>
                                        <option value="Permanent">Permanent</option>
                                        <option value="Temporary">Temporary</option>
                                    </Select>
                                </div>
                            </div>
                        </div>
                        )}
                    </div>

                    {/* Bottom Navigation */}
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (activeTab === "details") {
                                    setActiveTab("evaluation");
                                } else if (activeTab === "evaluation") {
                                    setActiveTab("verification");
                                } else {
                                    handleBack();
                                }
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                        >
                            <span>Back</span>
                        </button>
                            <button
                            type="button"
                            onClick={() => {
                                if (activeTab === "verification") {
                                    setActiveTab("evaluation");
                                } else if (activeTab === "evaluation") {
                                    setActiveTab("details");
                                } else {
                                    handleNext();
                                }
                            }}
                            disabled={(activeTab === "evaluation" || activeTab === "details") ? isProgressionLocked : false}
                            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-white text-xs font-semibold shadow-sm transition-all ml-auto ${
                                ((activeTab === "evaluation" || activeTab === "details") && isProgressionLocked)
                                    ? "bg-slate-300 cursor-not-allowed opacity-70" 
                                    : "bg-blue-600 hover:bg-blue-700 active:scale-98 cursor-pointer"
                            }`}
                        >
                            <span>{activeTab === "verification" ? "Continue to Evaluation" : activeTab === "evaluation" ? "Continue to Details" : "Next"}</span>
                            {(activeTab === "verification" || activeTab === "evaluation") && (
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
