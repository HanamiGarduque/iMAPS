// resources/js/Pages/Applications/Components/StepApplicant.jsx
import React from "react";
import { Label, Input } from "./FormControls";

export default function StepApplicant({
    form,
    set,
    handleNameChange,
    handleContactInput,
    applicantSuggestion,
    applyApplicantSuggestion,
    setApplicantSuggestion,
    errors = {},
}) {
    return (
        <div className="space-y-4">
            {/* Applicant Autocomplete Suggestion Banner */}
            {applicantSuggestion && (
                <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-2xl flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-1 shadow-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                            </svg>
                        </span>
                        <div className="text-xs min-w-0">
                            <p className="font-bold text-blue-950 truncate">
                                Found existing taxpayer record: <span className="underline">{applicantSuggestion.applicant_name}</span>
                            </p>
                            <p className="text-[11px] text-blue-700 font-mono truncate">
                                +63 {applicantSuggestion.contact_number} {applicantSuggestion.email ? `· ${applicantSuggestion.email}` : ""}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <button
                            type="button"
                            onClick={applyApplicantSuggestion}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-2xs transition-all active:scale-95 cursor-pointer"
                        >
                            Auto-fill
                        </button>
                        <button
                            type="button"
                            onClick={() => setApplicantSuggestion(null)}
                            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>
            )}

            {/* Applicant Legal Name: Last, First, Middle, Extension */}
            <div>
                <Label required hasError={!!errors.last_name || !!errors.first_name || !!errors.applicant_name}>
                    Registered Applicant Name
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mt-1.5">
                    <div className="sm:col-span-4">
                        <Label required hasError={!!errors.last_name}>Last Name</Label>
                        <Input 
                            type="text" 
                            value={form.last_name || ""} 
                            onChange={handleNameChange("last_name")} 
                            placeholder="e.g. Reyes" 
                            hasError={!!errors.last_name} 
                        />
                        {errors.last_name && <p className="text-xs font-medium text-rose-500 mt-1">{errors.last_name}</p>}
                    </div>
                    <div className="sm:col-span-4">
                        <Label required hasError={!!errors.first_name}>First Name</Label>
                        <Input 
                            type="text" 
                            value={form.first_name || ""} 
                            onChange={handleNameChange("first_name")} 
                            placeholder="e.g. Juan" 
                            hasError={!!errors.first_name} 
                        />
                        {errors.first_name && <p className="text-xs font-medium text-rose-500 mt-1">{errors.first_name}</p>}
                    </div>
                    <div className="sm:col-span-2">
                        <Label>Middle Name</Label>
                        <Input 
                            type="text" 
                            value={form.middle_name || ""} 
                            onChange={handleNameChange("middle_name")} 
                            placeholder="Santos" 
                        />
                    </div>
                    <div className="sm:col-span-2">
                        <Label>Extension</Label>
                        <Input 
                            type="text" 
                            value={form.suffix || ""} 
                            onChange={handleNameChange("suffix")} 
                            placeholder="Jr., III" 
                        />
                    </div>
                </div>
                {form.applicant_name && (
                    <div className="mt-2 text-xs text-slate-600 bg-slate-50/90 border border-slate-200/80 px-3 py-1.5 rounded-xl flex items-center gap-2">
                        <span className="text-[11px] text-slate-500 font-normal">Full Name:</span>
                        <span className="text-slate-800 font-medium tracking-normal">{form.applicant_name}</span>
                    </div>
                )}
            </div>
            {errors.applicant_name && <p className="text-xs font-medium text-rose-500 mt-1">{errors.applicant_name}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label required hasError={!!errors.contact_number}>Contact Phone Number</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 font-mono text-xs font-semibold pointer-events-none">+63</span>
                        <Input 
                            type="tel" 
                            value={form.contact_number || ""} 
                            onChange={handleContactInput} 
                            maxLength={10} 
                            placeholder="9XXXXXXXXX" 
                            className="pl-12 font-mono" 
                            hasError={!!errors.contact_number} 
                        />
                    </div>
                    {errors.contact_number && <p className="text-xs font-medium text-rose-500 mt-1">{errors.contact_number}</p>}
                </div>
                <div>
                    <Label required hasError={!!errors.email}>Email Address</Label>
                    <Input 
                        type="email" 
                        value={form.email || ""} 
                        onChange={set("email")} 
                        placeholder="applicant@domain.com" 
                        hasError={!!errors.email} 
                    />
                    {errors.email && <p className="text-xs font-medium text-rose-500 mt-1">{errors.email}</p>}
                </div>
            </div>

            <div className="p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200">
                <Label>Authorized Representative (Optional)</Label>
                <Input 
                    type="text" 
                    value={form.representative_name || ""} 
                    onChange={set("representative_name")} 
                    placeholder="Full legal name of representative / architect / attorney" 
                    className="bg-white mt-1" 
                />
                <p className="text-xs text-slate-400 mt-1">Leave blank if the applicant is filing directly without an authorized representative.</p>
            </div>
        </div>
    );
}
