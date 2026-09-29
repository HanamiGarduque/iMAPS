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
    zoningMismatch = false,
    goToProperty,
}) {
    const activeTypes = form.application_stream === "amendment" ? AMENDMENT_TYPES : APPLICATION_TYPES;
    const hasVerifiedLot = (form.parcels || []).some((p) => p.is_verified);

    // Safely parse selected types into an array for multi-select support
    const selectedApplicationTypes = (form.application_type || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

    const isRezoning = selectedApplicationTypes.includes("Petition for Rezoning");

    const handleStreamChange = (stream) => {
        if (stream === form.application_stream) return;
        set("application_stream")({ target: { value: stream } });
        set("application_type")({ target: { value: "" } });
        set("target_land_use_class")({ target: { value: "" } });
    };

    const numberField = (field, label, placeholder, step = "any") => (
        <div>
            <Label hasError={!!errors[field]}>{label}</Label>
            <Input type="number" min="0" step={step} value={form[field] || ""} onChange={set(field)} placeholder={placeholder} hasError={!!errors[field]} />
            {errors[field] && <p className="text-xs font-medium text-rose-500 mt-1">{errors[field]}</p>}
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Zoning result carried over from the Property step */}
            {hasVerifiedLot && (
                <div className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-2.5 text-xs ${zoningMismatch ? "border-amber-200 bg-amber-50/60" : "border-slate-200 bg-slate-50"}`}>
                    <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${zoningMismatch ? "bg-amber-500" : "bg-emerald-500"}`} aria-hidden="true" />
                    <div className="flex-1">
                        <p className="font-semibold text-slate-800">
                            {zoningMismatch ? "Zoning check: mismatch" : "Zoning check: consistent"}
                        </p>
                        <p className="text-[11px] text-slate-600 mt-0.5">
                            {zoningMismatch
                                ? "A lot's recorded use doesn't match the CLUP, so this application must be a legislative amendment (Track B)."
                                : "The lot's recorded use matches the CLUP. Standard clearances and permits (Track A) apply."}
                        </p>
                    </div>
                    {goToProperty && (
                        <button type="button" onClick={goToProperty} className="shrink-0 text-[11px] font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900 cursor-pointer">
                            View lots
                        </button>
                    )}
                </div>
            )}

            {/* 1. Track Selection */}
            <div>
                <Label required hasError={!!errors.application_stream}>System Processing Track</Label>
                <div className="flex flex-col sm:flex-row items-center bg-slate-100/80 p-1 rounded-xl w-full sm:w-fit gap-1 border border-slate-200 mt-1.5" role="radiogroup" aria-label="Processing track">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={form.application_stream === "permit"}
                        onClick={() => handleStreamChange("permit")}
                        disabled={zoningMismatch}
                        title={zoningMismatch ? "Not available: a lot's zoning doesn't match the CLUP" : undefined}
                        className={`flex-1 sm:flex-none px-4 py-2 rounded-lg text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                            form.application_stream === "permit"
                                ? "bg-white text-blue-700 shadow-xs ring-1 ring-slate-200/50"
                                : "text-slate-600 hover:text-slate-900 hover:bg-slate-200/50"
                        }`}
                    >
                        Track A: Standard Clearance & Permits
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={form.application_stream === "amendment"}
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
                {errors.application_stream && <p className="text-xs font-medium text-rose-500 mt-1">{errors.application_stream}</p>}
            </div>

            {/* 2. Form number */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <Label required hasError={!!errors.form_number}>Application Form Number</Label>
                    <div className={`flex items-stretch rounded-full border transition-all duration-150 overflow-hidden ${errors.form_number ? 'border-rose-300 ring-2 ring-rose-500/10 bg-rose-50/30' : 'border-slate-200 bg-white hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10 shadow-2xs'}`}>
                        <div className="flex items-center justify-center px-3.5 bg-slate-100/70 border-r border-slate-200 text-slate-500 font-semibold text-xs select-none">
                            U -
                        </div>
                        <input
                            type="text"
                            aria-label="Application form number"
                            className="flex-1 w-full px-3.5 py-2.5 text-xs font-mono font-medium text-slate-800 placeholder:text-slate-400 outline-none border-0 focus:ring-0 bg-transparent tracking-wider"
                            value={form.form_number ? form.form_number.replace(/^U-/, "") : ""}
                            onChange={(e) => {
                                const val = e.target.value.replace(/[^0-9]/g, "");
                                set("form_number")({ target: { value: val ? `U-${val}` : "" } });
                            }}
                            placeholder="000000"
                            maxLength={6}
                        />
                    </div>
                    {errors.form_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.form_number}</p>}
                </div>
            </div>

            {/* 3. Application Category (multi-select) */}
            <div>
                <Label required hasError={!!errors.application_type}>Application Category</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1.5">
                    {activeTypes.map((type) => {
                        const isSelected = selectedApplicationTypes.includes(type.id);
                        return (
                            <button
                                type="button"
                                key={type.id}
                                onClick={() => handleTypeSelect(type.id)}
                                aria-pressed={isSelected}
                                className={`p-3 rounded-2xl border-2 transition-all cursor-pointer flex items-start gap-2.5 relative overflow-hidden group text-left ${
                                    isSelected
                                        ? "bg-blue-50/60 border-blue-600 ring-2 ring-blue-500/10 shadow-xs"
                                        : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50"
                                }`}
                            >
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
                                    isSelected ? "bg-blue-600 text-white shadow-2xs" : "bg-slate-100 text-slate-500 group-hover:bg-slate-200"
                                }`}>
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={type.icon} />
                                    </svg>
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className={`text-xs font-bold leading-tight ${isSelected ? "text-blue-950" : "text-slate-800"}`}>{type.id}</p>
                                    <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">{type.desc}</p>
                                </div>
                                {isSelected && <div className="w-2 h-2 rounded-full bg-blue-600 absolute top-2.5 right-2.5" />}
                            </button>
                        );
                    })}
                </div>
                {errors.application_type && <p className="text-xs font-medium text-rose-500 mt-1">{errors.application_type}</p>}
            </div>

            {/* Target zoning (Track B only) */}
            {form.application_stream === "amendment" && (
                <div>
                    <Label required hasError={!!errors.target_land_use_class}>Target Zoning Classification</Label>
                    <Select value={form.target_land_use_class || ""} onChange={set("target_land_use_class")} hasError={!!errors.target_land_use_class}>
                        <option value="" disabled>Select the proposed zoning...</option>
                        {isRezoning
                            ? ZONING_SUB_CLASSES.map((group) => (
                                  <optgroup key={group.name} label={group.name}>
                                      {group.items.map((item) => (
                                          <option key={item.code} value={item.code}>{item.label} ({item.code})</option>
                                      ))}
                                  </optgroup>
                              ))
                            : LAND_USE_CLASSES.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                              ))}
                    </Select>
                    {errors.target_land_use_class && <p className="text-xs font-medium text-rose-500 mt-1">{errors.target_land_use_class}</p>}
                </div>
            )}

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

            {/* Project details (feed the fee computation) */}
            <div className="pt-4 border-t border-slate-100">
                <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-800">Project Details</h4>
                <p className="text-[11px] text-slate-500 mt-0.5 mb-3">Building coverage, development extent and cost. Project cost is used to compute the fee.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {numberField("building_area", "Building Area (sq.m)", "e.g. 120.5")}
                    {numberField("area_to_develop", "Area to be Developed (sq.m)", "e.g. 500.00")}
                    {numberField("number_of_saleable_lots", "Number of Saleable Lots", "e.g. 10", "1")}

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
                        <Label hasError={!!errors.project_cost}>Project Cost</Label>
                        <div className="relative rounded-md shadow-sm">
                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                <span className="text-slate-500 sm:text-sm">₱</span>
                            </div>
                            <input
                                type="text"
                                inputMode="decimal"
                                aria-label="Project cost in pesos"
                                value={form.project_cost ? form.project_cost.toString().split(".").map((p, i) => (i === 0 ? p.replace(/\B(?=(\d{3})+(?!\d))/g, ",") : p)).join(".") : ""}
                                onChange={(e) => {
                                    let val = e.target.value.replace(/[^0-9.]/g, "");
                                    const parts = val.split(".");
                                    if (parts.length > 2) val = parts[0] + "." + parts.slice(1).join("");
                                    set("project_cost")({ target: { value: val } });
                                }}
                                placeholder="0"
                                className={`block w-full rounded-full border-0 py-2.5 pl-8 text-right text-xs text-slate-900 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-blue-600 transition-all ${
                                    !form.project_cost || !form.project_cost.toString().includes(".") ? "pr-9" : "pr-3"
                                }`}
                            />
                            {(!form.project_cost || !form.project_cost.toString().includes(".")) && (
                                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                                    <span className="text-slate-400 text-xs">.00</span>
                                </div>
                            )}
                        </div>
                        {errors.project_cost && <p className="text-xs font-medium text-rose-500 mt-1">{errors.project_cost}</p>}
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
        </div>
    );
}
