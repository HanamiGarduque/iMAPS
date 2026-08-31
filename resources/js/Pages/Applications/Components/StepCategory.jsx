// resources/js/Pages/Applications/Components/StepCategory.jsx
import React from "react";
import { Label, Input, Select, Textarea } from "./FormControls";

export default function StepCategory({
    form,
    set,
    handleTypeSelect,
    errors = {},
    APPLICATION_TYPES = [],
    LAND_USE_CLASSES = ["Residential", "Commercial", "Industrial", "Agricultural"],
}) {
    return (
        <div className="space-y-4">
            <div>
                <Label required hasError={!!errors.application_type}>Application Category</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-1.5">
                    {APPLICATION_TYPES.map((type) => {
                        const isSelected = form.application_type === type.id;
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                    <Label required hasError={!!errors.form_number}>Application Form Number</Label>
                    <Input 
                        type="text" 
                        value={form.form_number || ""} 
                        onChange={set("form_number")} 
                        placeholder="e.g. LC-2026-001" 
                        hasError={!!errors.form_number} 
                    />
                    {errors.form_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.form_number}</p>}
                </div>
                <div>
                    <Label required hasError={!!errors.land_use_class}>Target Zoning Classification</Label>
                    <Select 
                        value={form.land_use_class || ""} 
                        onChange={set("land_use_class")} 
                        hasError={!!errors.land_use_class}
                    >
                        <option value="" disabled>Select zoning class...</option>
                        {LAND_USE_CLASSES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </Select>
                    {errors.land_use_class && <p className="text-xs font-medium text-rose-500 mt-1">{errors.land_use_class}</p>}
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
