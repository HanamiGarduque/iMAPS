// resources/js/Pages/Applications/Components/StepCategory.jsx
import React from "react";
import { Label, Input, Select, Textarea } from "./FormControls";

const ZONING_SUB_CLASSES = [
    {
        name: "Residential",
        items: [
            { code: "R1-Z", label: "Residential-1 Zone" },
            { code: "R2-Z", label: "Residential-2 Zone" },
            { code: "MR2-SZ", label: "Maximum R-2 Sub-Zone" },
            { code: "BR2-SZ", label: "Basic R-2 Sub-Zone" },
        ]
    },
    {
        name: "Commercial",
        items: [
            { code: "C1-Z", label: "Commercial-1 Zone" },
            { code: "C2-Z", label: "Commercial-2 Zone" },
            { code: "C/MP-Z", label: "Cemetery/ Memorial Park Zone" },
        ]
    },
    {
        name: "Industrial",
        items: [
            { code: "I1-Z", label: "Industrial-1 Zone" },
            { code: "I2-Z", label: "Industrial-2 Zone" },
            { code: "I3-Z", label: "Industrial-3 Zone" },
        ]
    },
    {
        name: "Agri-Industrial",
        items: [
            { code: "AgIndZ", label: "Agri-Industrial Zone" },
            { code: "AgIndZ-PTR", label: "Agri-Industrial Zone Poultry" },
            { code: "AgIndZ-PGR", label: "Agri-Industrial Zone Piggery" },
        ]
    },
    {
        name: "Institutional",
        items: [
            { code: "GI-Z", label: "General Institutional Zone" },
            { code: "UTS-Z", label: "Utility, Transportation, and Services" },
            { code: "CMRF", label: "Central Materials Recovery Facility" },
        ]
    },
    {
        name: "Recreational",
        items: [
            { code: "PR-Z", label: "Parks and Recreation Zone" },
            { code: "T-Z", label: "Tourism Zone" },
            { code: "ECT-Z", label: "Eco-Tourism Zone" },
        ]
    }
];

export default function StepCategory({
    form,
    set,
    handleTypeSelect,
    errors = {},
    APPLICATION_TYPES = [],
    AMENDMENT_TYPES = [],
    LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agri-Industrial", "Institutional", "Recreational"],
}) {
    const activeTypes = form.application_stream === "amendment" ? AMENDMENT_TYPES : APPLICATION_TYPES;
    
    // Safely parse selected types into an array for multi-select support
    const selectedApplicationTypes = (form.application_type || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const isRezoning = selectedApplicationTypes.includes("Petition for Rezoning");

    const handleStreamChange = (stream) => {
        set("application_stream")({ target: { value: stream } });
        set("application_type")({ target: { value: "" } }); 
        set("target_land_use_class")({ target: { value: "" } });
    };

    return (
        <div className="space-y-4">
            
            {/* 1. Track Selection UI */}
            <div>
                <Label required>System Processing Track</Label>
                <div className="flex flex-col sm:flex-row items-center bg-slate-100/80 p-1 rounded-xl w-full sm:w-fit gap-1 border border-slate-200 mt-1.5">
                    <button
                        type="button"
                        onClick={() => handleStreamChange("permit")}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            form.application_stream === "permit" 
                                ? "bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50" 
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                        }`}
                    >
                        Track A: Standard Clearance & Permits
                    </button>
                    <button
                        type="button"
                        onClick={() => handleStreamChange("amendment")}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                            form.application_stream === "amendment" 
                                ? "bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50" 
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                        }`}
                    >
                        Track B: Legislative Amendment Request
                    </button>
                </div>
            </div>

            {/* 2. Application Category Selection (Multi-select enabled) */}
            <div>
                <Label required hasError={!!errors.application_type}>Application Category</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1.5">
                    {activeTypes.map((type) => {
                        const isSelected = selectedApplicationTypes.includes(type.id);
                        return (
                            <div 
                                key={type.id}
                                onClick={() => handleTypeSelect(type.id)}
                                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-2.5 relative overflow-hidden group ${
                                    isSelected 
                                        ? "bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/10 shadow-xs" 
                                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected ? "bg-blue-600 text-white shadow-2xs" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                                }`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={type.icon} />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold leading-tight ${isSelected ? "text-blue-950" : "text-slate-800"}`}>
                                        {type.id}
                                    </p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                        {type.desc}
                                    </p>
                                </div>
                                {isSelected && (
                                    <div className="w-2 h-2 rounded-full bg-blue-600 absolute top-2.5 right-2.5" />
                                )}
                            </div>
                        );
                    })}
                </div>
                {errors.application_type && <p className="text-xs font-medium text-rose-500 mt-1">{errors.application_type}</p>}
            </div>

            {/* 3. Form Details & Target Zoning */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <Label required hasError={!!errors.form_number}>Application Form Number</Label>
                    <Input 
                        type="text" 
                        value={form.form_number || ""} 
                        onChange={set("form_number")} 
                        placeholder="e.g. U-000000" 
                        hasError={!!errors.form_number} 
                    />
                    {errors.form_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.form_number}</p>}
                </div>
            </div>

            <div>
                <Label required hasError={!!errors.purpose}>Operational Purpose & Intent</Label>
                <Textarea 
                    rows={2.5} 
                    value={form.purpose || ""} 
                    onChange={set("purpose")} 
                    placeholder="Specify the proposed land use, building activity, commercial operation, or facility purpose..." 
                    hasError={!!errors.purpose} 
                />
                {errors.purpose && <p className="text-xs font-medium text-rose-500 mt-1">{errors.purpose}</p>}
            </div>
        </div>
    );
}