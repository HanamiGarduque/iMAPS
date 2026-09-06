// resources/js/Pages/Applications/Components/StepPropertyGIS.jsx
import React, { useState, useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Label, Input, Select } from "./FormControls";

// ── Approved Municipal Zoning Categories ──
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
        id: "industrial",
        label: "industrial",
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
        id: "institutional",
        label: "institutional",
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
    ROSARIO_BARANGAYS = [],
    LAND_USE_CLASSES = ["Residential", "Commercial", "industrial", "Agri-Industrial", "institutional", "Recreational"],
    handleBack,
    handleNext,
    formRef,
    handleSubmit,
}) {
    const [isMapExpanded, setIsMapExpanded] = useState(false);

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
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
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
                                            handleSelectMapParcel(pin, lot, area, brgy, feature);
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
                    {/* Active Selected Lot HUD */}
                    <div className="pointer-events-auto">
                        {(form.parcels || []).map(
                            (parcel, idx) =>
                                idx === activeParcelIndex &&
                                parcel.property_index_number && (
                                    <div key={idx} className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-slate-200/90 max-w-xs sm:max-w-sm animate-in fade-in zoom-in-95">
                                        <div className="flex items-center justify-between border-b border-slate-100 pb-1.5 mb-1.5 gap-2">
                                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-md flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                                                {parcel.parcel_code} Cadastral Lot
                                            </span>
                                            <span className="text-[10px] font-mono font-bold text-slate-700 truncate">
                                                PIN: {parcel.property_index_number}
                                            </span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                                            <div>
                                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">ARP / Tax Dec. No.</p>
                                                <p className="font-semibold text-slate-800 truncate">{parcel.arp_number || parcel.tax_dec_number || parcel.lot_number || "ARP Verified"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Survey Number</p>
                                                <p className="font-semibold text-slate-800 truncate">{parcel.survey_number || "—"}</p>
                                            </div>
                                            <div>
                                                <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Declared Area</p>
                                                <p className="font-mono font-bold text-slate-900">
                                                    {parcel.lot_area_sqm ? `${Number(parcel.lot_area_sqm).toLocaleString()} sq.m` : "—"}
                                                </p>
                                            </div>
                                            <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-100">
                                                <span className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Zoning Class:</span>
                                                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                                                    {parcel.land_use_class || form.land_use_class || "Residential"}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                )
                        )}
                    </div>

                    {/* Expand / Maximize Map Toggle Button */}
                    <div className="pointer-events-auto flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setIsMapExpanded((prev) => !prev)}
                            className="inline-flex items-center gap-1.5 bg-white/95 hover:bg-white text-slate-700 hover:text-blue-700 px-3 py-1.5 rounded-xl shadow-lg border border-slate-200/90 text-xs font-bold transition-all active:scale-95 cursor-pointer backdrop-blur-xs"
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

                {/* Floating "Back to Form" action button when in maximized map mode */}
                {isMapExpanded && (
                    <div className="absolute bottom-4 right-4 z-10 animate-in fade-in slide-in-from-bottom-2">
                        <button
                            type="button"
                            onClick={() => setIsMapExpanded(false)}
                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xl transition-all active:scale-95 cursor-pointer"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Return to Property Form</span>
                        </button>
                    </div>
                )}

                {/* Bottom Map Legend */}
                <div className="absolute bottom-3 left-3 z-10 bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl shadow-md border border-slate-200/80 text-[11px] font-medium text-slate-600 flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40 border border-blue-600" /> Barangay
                    </span>
                    <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-sm bg-red-500/50 border border-red-600" /> Selected Lot
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(Click boundary on map to select)</span>
                </div>
            </div>

            {/* ── RIGHT: PROPERTY FORM PANEL (HIDDEN WHEN MAP MAXIMIZED) ── */}
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
                        {/* Step Header */}
                        <div className="flex items-start justify-between">
                            <div>
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 uppercase tracking-wider">
                                    Step 3 of 5 · PIN Verification & Zoning
                                </span>
                                <h3 className="text-xl font-bold text-slate-900 tracking-tight mt-1.5">Property Location & Land Classification</h3>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    Verify the Tax Declaration PIN against municipal land use records, then determine the approved zoning category.
                                </p>
                            </div>
                            {totalLotArea > 0 && (
                                <span className="font-mono text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2.5 py-1 rounded-xl shadow-2xs shrink-0">
                                    {totalLotArea.toLocaleString()} sq.m Total
                                </span>
                            )}
                        </div>

                        {/* Mobile Map Toggle Button (When on small screens) */}
                        <div className="lg:hidden">
                            <button
                                type="button"
                                onClick={() => setIsMapExpanded(true)}
                                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold shadow-2xs active:scale-98 cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                                <span>Open Interactive GIS Map</span>
                            </button>
                        </div>

                        {/* Location & Address Specification */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-6">
                                <Label required hasError={!!errors.barangay}>Barangay</Label>
                                <Select value={form.barangay || ""} onChange={set("barangay")} hasError={!!errors.barangay}>
                                    <option value="" disabled>Select barangay...</option>
                                    {ROSARIO_BARANGAYS.map((b) => (
                                        <option key={b} value={b}>Brgy. {b}</option>
                                    ))}
                                </Select>
                                {errors.barangay && <p className="text-xs font-medium text-rose-500 mt-1">{errors.barangay}</p>}
                            </div>
                            <div className="sm:col-span-6">
                                <Label>Street Address / Sitio / Purok</Label>
                                <Input 
                                    type="text" 
                                    value={form.street_address || ""} 
                                    onChange={set("street_address")} 
                                    placeholder="e.g. Purok 4, Rizal Street" 
                                />
                            </div>
                        </div>

                        {/* ── SECTION 1: TAX DECLARATION PIN VERIFICATION ── */}
                        <div className="space-y-3 pt-1">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                        <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                        1. Tax Declaration PIN Verification
                                    </h4>
                                    <p className="text-[11px] text-slate-500">Cross-reference applicant's PIN with the municipality's approved land use database.</p>
                                </div>
                            </div>

                            {(form.parcels || []).map((parcel, index) => (
                                <div key={index} className="rounded-2xl bg-slate-50/90 border border-slate-200 p-3.5 space-y-3 relative">
                                    <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-700">
                                            <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                                            {parcel.parcel_code || `Lot ${index + 1}`}
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
                                                onChange={setParcelField(index, "property_index_number")} 
                                                placeholder="e.g. 04010-01-0001" 
                                                className="flex-1 font-mono bg-white uppercase" 
                                                hasError={!!errors[`parcels.${index}.property_index_number`]} 
                                            />
                                            <button 
                                                type="button" 
                                                onClick={() => handlePinLookup(index)} 
                                                disabled={pinLoading[index] || !parcel.property_index_number?.trim()} 
                                                className={`inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all shadow-xs whitespace-nowrap cursor-pointer ${
                                                    pinLoading[index] || !parcel.property_index_number?.trim() 
                                                        ? "bg-slate-200 text-slate-400 cursor-not-allowed" 
                                                        : "bg-blue-600 hover:bg-blue-700 text-white active:scale-98"
                                                }`}
                                            >
                                                {pinLoading[index] ? (
                                                    <>
                                                        <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                                        <span>Verifying...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                                        </svg>
                                                        <span>Verify with Land Records</span>
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
                                        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-2.5 space-y-2 animate-in fade-in">
                                            <div className="flex items-center justify-between text-[11px] font-bold text-emerald-800">
                                                <span className="flex items-center gap-1">
                                                    <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                    </svg>
                                                    PIN Verified in Official Municipal Database
                                                </span>
                                                <span className="text-[10px] font-mono font-medium text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md">
                                                    {parcel.parcel_code}
                                                </span>
                                            </div>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs bg-white/90 p-2 rounded-lg border border-emerald-100">
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">ARP Number</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.arp_number || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Survey Number</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.survey_number || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Tax Dec. / TCT Ref</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.tax_dec_number || parcel.tct_number || "TD Recorded"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Registered Lot</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.lot_number || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Owner</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.owner_name || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Address</p>
                                                    <p className="font-semibold text-slate-800 truncate mt-0.5">{parcel.location_address || "—"}</p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Declared Area</p>
                                                    <p className="font-mono font-bold text-slate-900 mt-0.5">
                                                        {parcel.lot_area_sqm ? `${Number(parcel.lot_area_sqm).toLocaleString()} sq.m` : "—"}
                                                    </p>
                                                </div>
                                                <div>
                                                    <p className="text-[9px] text-slate-400 font-medium uppercase tracking-wider">Recorded Zoning</p>
                                                    <p className="font-bold text-blue-700 mt-0.5 truncate">{parcel.land_use_class || form.land_use_class || "Residential"}</p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="bg-slate-100/70 border border-dashed border-slate-300 rounded-xl p-2.5 text-[11px] text-slate-500 flex items-center gap-2">
                                            <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                                            </svg>
                                            <span>Enter the PIN printed on the applicant's Tax Declaration and click <b>Verify with Land Records</b>, or click the parcel on the GIS map.</span>
                                        </div>
                                    )}
                                </div>
                            ))}

                            <button 
                                type="button" 
                                onClick={addParcel} 
                                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl border border-dashed border-slate-300 hover:border-blue-400 hover:bg-blue-50/40 text-slate-600 hover:text-blue-700 font-semibold text-xs transition-all cursor-pointer"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg> 
                                <span>+ Add Another Property Lot</span>
                            </button>
                        </div>

                        {/* ── SECTION 2: LAND CLASSIFICATION DETERMINATION (4 CORE ZONING CATEGORIES) ── */}
                        <div className="space-y-3 pt-2 border-t border-slate-100">
                            <div>
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                                    2. Determine Land Classification
                                </h4>
                                <p className="text-[11px] text-slate-500">
                                    Confirm whether the property falls under one of the 4 approved municipal zoning categories:
                                </p>
                            </div>

                            {/* 4 Zoning Category Selection Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {ZONING_CATEGORIES.map((cat) => {
                                    const isSelected = (form.land_use_class || "").toLowerCase() === cat.id.toLowerCase();
                                    return (
                                        <button
                                            key={cat.id}
                                            type="button"
                                            onClick={() => handleSelectZoningCategory(cat.id)}
                                            className={`flex items-start gap-3 p-3 rounded-2xl border text-left transition-all cursor-pointer active:scale-98 ${
                                                isSelected 
                                                    ? `${cat.activeBorder} shadow-sm` 
                                                    : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/70"
                                            }`}
                                        >
                                            <div className={`p-2 rounded-xl shrink-0 ${isSelected ? "bg-white shadow-xs" : "bg-slate-100"}`}>
                                                {cat.icon}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                                    <span className="text-xs font-bold text-slate-900">{cat.label}</span>
                                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border ${cat.badge}`}>
                                                        {cat.code}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-slate-500 leading-snug">{cat.desc}</p>
                                                {isSelected && (
                                                    <div className="mt-1.5 flex items-center gap-1 text-[10px] font-bold text-blue-700">
                                                        <svg className="w-3 h-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                        </svg>
                                                        <span>Selected Classification</span>
                                                    </div>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>

                            {/* Zoning Compatibility Status Banner */}
                            {form.land_use_class ? (
                                <div className="p-3 bg-blue-50/70 border border-blue-200 text-blue-900 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in">
                                    <svg className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    <div>
                                        <p className="font-bold text-blue-900">
                                            Determined Zoning: <span className="underline decoration-blue-400">{form.land_use_class}</span>
                                        </p>
                                        <p className="text-[11px] text-blue-700 mt-0.5 leading-tight">
                                            Property is cross-referenced and classified under the approved <b>{form.land_use_class}</b> zoning category for Rosario, Batangas.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-2.5 bg-amber-50/80 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
                                    <svg className="w-4 h-4 text-amber-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                                    </svg>
                                    <span>Please select one of the 4 zoning classifications above to proceed.</span>
                                </div>
                            )}

                            {/* Zoning Variance Notice Banner if any */}
                            {zoningWarning && (
                                <div className="p-3 bg-amber-50/90 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-start gap-2.5 animate-in fade-in">
                                    <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                    </svg>
                                    <p className="leading-snug font-medium">{zoningWarning}</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Bottom Navigation */}
                    <div className="pt-4 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                        <button
                            type="button"
                            onClick={handleBack}
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                        >
                            <span>Back</span>
                        </button>
                        <button
                            type="button"
                            onClick={handleNext}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-98 cursor-pointer ml-auto"
                        >
                            <span>Continue to Review</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
