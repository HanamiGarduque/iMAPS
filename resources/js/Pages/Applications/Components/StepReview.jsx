// resources/js/Pages/Applications/Components/StepReview.jsx
import React, { useState } from "react";

function ReviewAccordion({ title, stepNum, summary, onEdit, children, defaultOpen = false }) {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <div className={`bg-white rounded-xl border transition-all duration-200 ${isOpen ? 'border-blue-200 shadow-md ring-1 ring-blue-500/10' : 'border-slate-200 shadow-sm hover:border-slate-300'}`}>
            <button 
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-3.5 sm:p-4 bg-slate-50/30 hover:bg-slate-50 transition-colors focus:outline-none rounded-xl"
            >
                <div className="flex items-center gap-3 text-left">
                    <div className={`flex items-center justify-center shrink-0 w-6 h-6 rounded-full text-[10px] font-bold transition-colors ${isOpen ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-200 text-slate-600'}`}>
                        {stepNum}
                    </div>
                    <div>
                        <h4 className={`text-xs font-bold uppercase tracking-wider transition-colors ${isOpen ? 'text-blue-900' : 'text-slate-700'}`}>
                            {title}
                        </h4>
                        {!isOpen && summary && (
                            <p className="text-[11px] text-slate-500 font-medium mt-0.5 truncate max-w-[200px] sm:max-w-sm">{summary}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0 pl-2">
                    {onEdit && (
                        <span 
                            onClick={(e) => {
                                e.stopPropagation();
                                onEdit();
                            }} 
                            className="text-[10px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md transition-colors"
                        >
                            Edit
                        </span>
                    )}
                    <div className={`p-1 rounded-full transition-colors ${isOpen ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                        <svg className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </button>
            <div className={`grid transition-all duration-300 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                <div className="overflow-hidden">
                    <div className="p-4 sm:p-5 border-t border-slate-100 bg-white">
                        {children}
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function StepReview({
    form,
    set,
    totalLotArea = 0,
    setCurrentStep,
    onPreviewRoutingSlip,
    errors = {},
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-slate-800">Review & Confirm</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Please review the details below. Expand any section to see full information.</p>
                </div>
                {onPreviewRoutingSlip && (
                    <button
                        type="button"
                        onClick={onPreviewRoutingSlip}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 hover:bg-blue-100 shadow-2xs transition-all active:scale-98 cursor-pointer shrink-0"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span className="hidden sm:inline">Preview Routing Slip</span>
                        <span className="sm:hidden">Preview</span>
                    </button>
                )}
            </div>

            <div className="space-y-2.5">
                {/* 1. Category & Purpose */}
                <ReviewAccordion 
                    stepNum="1" 
                    title="Category & Purpose" 
                    summary={form.application_type ? `${form.application_type} — ${form.purpose || 'No purpose specified'}` : "Not specified"}
                    onEdit={() => setCurrentStep(1)}
                    defaultOpen={false}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Category</p>
                            <p className="font-semibold text-slate-900">{form.application_type || "—"}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Form Number</p>
                            <p className="font-mono font-semibold text-slate-900">{form.form_number || "—"}</p>
                        </div>
                        <div className="sm:col-span-3">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Purpose</p>
                            <p className="font-medium text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">{form.purpose || "—"}</p>
                        </div>
                    </div>
                </ReviewAccordion>

                {/* 2. Applicant Information */}
                <ReviewAccordion 
                    stepNum="2" 
                    title="Applicant Information" 
                    summary={form.applicant_name ? `${form.applicant_name} ${form.contact_number ? `(+63 ${form.contact_number})` : ''}` : "Not specified"}
                    onEdit={() => setCurrentStep(2)}
                    defaultOpen={false}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6 text-xs">
                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Applicant Name</p>
                            <p className="font-semibold text-slate-900 text-sm">{form.applicant_name || "—"}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Contact & Email</p>
                            <p className="font-mono font-semibold text-slate-900">{form.contact_number ? `+63 ${form.contact_number}` : "—"}</p>
                            <p className="font-medium text-slate-500 mt-0.5">{form.email || "No email provided"}</p>
                        </div>

                        <div className="sm:col-span-2 h-px bg-slate-100 my-1"></div>

                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Representative</p>
                            <p className="font-medium text-slate-700">{form.representative_name || "Self / Direct"}</p>
                            {form.representative_name && (
                                <p className="text-slate-500 mt-0.5">{form.representative_contact ? `+63 ${form.representative_contact}` : "—"}{form.representative_address ? ` · ${form.representative_address}` : ""}</p>
                            )}
                        </div>

                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Corporation / Company</p>
                            <p className="font-medium text-slate-700">{form.corporation_name || "None"}</p>
                            {form.corporation_name && (
                                <p className="text-slate-500 mt-0.5">{form.corporation_contact ? `+63 ${form.corporation_contact}` : "—"}{form.corporation_address ? ` · ${form.corporation_address}` : ""}</p>
                            )}
                        </div>
                    </div>
                </ReviewAccordion>

                {/* 3. Property Location & Lots */}
                <ReviewAccordion 
                    stepNum="3" 
                    title="Property Location & Lots" 
                    summary={form.barangay ? `${form.parcels?.filter(p => p.property_index_number).length || 0} lot(s) in Brgy. ${form.barangay}` : "Not specified"}
                    onEdit={() => setCurrentStep(3)}
                    defaultOpen={false}
                >
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                        <div className="sm:col-span-2">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Barangay & Street</p>
                            <p className="font-semibold text-slate-900">{form.barangay ? (form.street_address ? `${form.street_address}, Brgy. ${form.barangay}` : `Brgy. ${form.barangay}`) : "—"}</p>
                        </div>
                        <div>
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-0.5">Total Land Area</p>
                            <p className="font-mono font-bold text-blue-700 text-sm">
                                {(form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).length > 0 && totalLotArea > 0 
                                    ? `${totalLotArea.toLocaleString()} sq.m` 
                                    : "—"}
                            </p>
                        </div>
                        
                        <div className="sm:col-span-3 mt-2">
                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">Registered Lots</p>
                            <div className="space-y-1.5 max-h-32 overflow-y-auto pr-2">
                                {(form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).length > 0 ? (
                                    (form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).map((parcel, idx) => (
                                        <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                                            <div className="flex flex-col">
                                                <span className="font-semibold text-slate-800">{parcel.parcel_code || `Lot ${idx + 1}`}</span>
                                                <span className="text-[10px] text-slate-500 font-mono">PIN: {parcel.property_index_number || "—"}</span>
                                            </div>
                                            <div className="text-right mt-1 sm:mt-0">
                                                <span className="font-mono font-medium text-slate-700">{parcel.lot_area_sqm ? `${Number(parcel.lot_area_sqm).toLocaleString()} m²` : "—"}</span>
                                                <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-0.5">{parcel.land_use_class || "Unclassified"}</p>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center p-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 text-slate-400 font-medium">
                                        No lots added yet.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </ReviewAccordion>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                {/* 4. Preferred Mode of Release */}
                <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">4. Release Mode <span className="text-rose-500">*</span></h4>
                    <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">Choose how the applicant prefers to receive the final decision document.</p>
                    
                    <div className="mt-auto">
                        <select
                            value={form.preferred_release_mode || ""}
                            onChange={set ? set("preferred_release_mode") : () => {}}
                            className={`w-full text-xs rounded-lg border px-3 py-2.5 outline-none transition-all font-medium ${
                                errors.preferred_release_mode 
                                    ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-500/20" 
                                    : "border-slate-300 text-slate-700 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                            }`}
                        >
                            <option value="">Select preferred mode...</option>
                            <option value="Pick-up">Pick-up at Office</option>
                            <option value="By mail - Applicant">By mail (Applicant)</option>
                            <option value="By mail - Authorized Representative">By mail (Authorized Representative)</option>
                        </select>
                        {errors.preferred_release_mode && (
                            <p className="text-[10px] font-bold text-rose-600 mt-1.5">{errors.preferred_release_mode}</p>
                        )}
                    </div>
                </div>

                {/* 5. Remarks */}
                <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col">
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">5. Remarks (Optional)</h4>
                    <p className="text-[11px] text-slate-500 mb-3 leading-relaxed">Add any internal notes or additional instructions about this application.</p>
                    
                    <div className="mt-auto">
                        <textarea
                            rows={2}
                            value={form.remarks || ""}
                            onChange={set ? set("remarks") : () => {}}
                            className={`w-full text-xs rounded-lg border px-3 py-2 outline-none transition-all resize-none ${
                                errors.remarks 
                                    ? "border-rose-300 bg-rose-50 text-rose-700 ring-2 ring-rose-500/20" 
                                    : "border-slate-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 bg-white"
                            }`}
                            placeholder="Enter remarks..."
                        />
                        {errors.remarks && (
                            <p className="text-[10px] font-bold text-rose-600 mt-1.5">{errors.remarks}</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
