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
    const [showCorp, setShowCorp] = React.useState(!!form.corporation_name || !!form.corporation_contact || !!form.corporation_address);
    const [showRep, setShowRep] = React.useState(!!form.representative_name || !!form.representative_contact || !!form.representative_address);

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
                    <div className="mt-3 flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Full Name</span>
                        <div className="h-px bg-slate-200 flex-1"></div>
                        <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1 rounded-full">{form.applicant_name}</span>
                    </div>
                )}
            </div>
            {errors.applicant_name && <p className="text-xs font-medium text-rose-500 mt-1">{errors.applicant_name}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <Label required hasError={!!errors.contact_number}>Contact Phone Number</Label>
                    <div className="relative">
                        <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 font-mono text-xs font-semibold pointer-events-none">+639</span>
                        <Input 
                            type="tel" 
                            value={form.contact_number ? form.contact_number.replace(/^9/, "") : ""} 
                            onChange={handleContactInput} 
                            maxLength={9} 
                            placeholder="XX XXX XXXX" 
                            className="pl-[4rem] font-mono" 
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

            <hr className="border-slate-100 my-5" />

            <div className="space-y-4">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowCorp(!showCorp)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${showCorp ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showCorp ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-[13px] font-semibold text-slate-700 select-none cursor-pointer" onClick={() => setShowCorp(!showCorp)}>
                        Applying on behalf of a Corporation / Company
                    </span>
                </div>

                {showCorp && (
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2">
                        <Label>Corporation / Company Name</Label>
                        <Input
                            type="text"
                            value={form.corporation_name || ""}
                            onChange={set("corporation_name")}
                            placeholder="Registered corporation / company name"
                            className="bg-white mt-1"
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                            <div>
                                <Label>Corporation Contact</Label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 font-mono text-xs font-semibold pointer-events-none">+639</span>
                                    <Input
                                        type="tel"
                                        value={form.corporation_contact ? form.corporation_contact.replace(/^9/, "") : ""}
                                        onChange={(e) => {
                                            let val = e.target.value.replace(/\D/g, "");
                                            if (val === "") {
                                                set("corporation_contact")({ target: { value: "" } });
                                                return;
                                            }
                                            if (val.startsWith("09")) val = val.slice(2);
                                            else if (val.startsWith("9")) val = val.slice(1);
                                            val = "9" + val;
                                            if (val.length > 10) val = val.slice(0, 10);
                                            set("corporation_contact")({ target: { value: val } });
                                        }}
                                        maxLength={9}
                                        placeholder="XX XXX XXXX"
                                        className="pl-[4rem] font-mono bg-white"
                                        hasError={!!errors.corporation_contact}
                                    />
                                    {errors.corporation_contact && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors.corporation_contact}</p>}
                                </div>
                            </div>
                            <div>
                                <Label>Corporation Address</Label>
                                <Input
                                    type="text"
                                    value={form.corporation_address || ""}
                                    onChange={set("corporation_address")}
                                    placeholder="Registered office address"
                                    className="bg-white"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="space-y-4 pb-2">
                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => setShowRep(!showRep)}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 ${showRep ? 'bg-blue-600' : 'bg-slate-200'}`}
                    >
                        <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${showRep ? 'translate-x-4' : 'translate-x-0'}`} />
                    </button>
                    <span className="text-[13px] font-semibold text-slate-700 select-none cursor-pointer" onClick={() => setShowRep(!showRep)}>
                        Filing through an Authorized Representative
                    </span>
                </div>

                {showRep && (
                    <div className="p-4 bg-slate-50/50 rounded-2xl border border-slate-100 animate-in fade-in slide-in-from-top-2">
                        <Label>Authorized Representative Name</Label>
                        <Input 
                            type="text" 
                            value={form.representative_name || ""} 
                            onChange={set("representative_name")} 
                            placeholder="Full legal name of representative / architect / attorney" 
                            className="bg-white mt-1" 
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
                            <div>
                                <Label>Representative Contact</Label>
                                <div className="relative">
                                    <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-slate-400 font-mono text-xs font-semibold pointer-events-none">+639</span>
                                    <Input
                                        type="tel"
                                        value={form.representative_contact ? form.representative_contact.replace(/^9/, "") : ""}
                                        onChange={(e) => {
                                            let val = e.target.value.replace(/\D/g, "");
                                            if (val === "") {
                                                set("representative_contact")({ target: { value: "" } });
                                                return;
                                            }
                                            if (val.startsWith("09")) val = val.slice(2);
                                            else if (val.startsWith("9")) val = val.slice(1);
                                            val = "9" + val;
                                            if (val.length > 10) val = val.slice(0, 10);
                                            set("representative_contact")({ target: { value: val } });
                                        }}
                                        maxLength={9}
                                        placeholder="XX XXX XXXX"
                                        className="pl-[4rem] font-mono bg-white"
                                        hasError={!!errors.representative_contact}
                                    />
                                    {errors.representative_contact && <p className="text-[10px] font-medium text-rose-500 mt-1">{errors.representative_contact}</p>}
                                </div>
                            </div>
                            <div>
                                <Label>Representative Address</Label>
                                <Input
                                    type="text"
                                    value={form.representative_address || ""}
                                    onChange={set("representative_address")}
                                    placeholder="Address of authorized representative"
                                    className="bg-white"
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>


        </div>
    );
}
