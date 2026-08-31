// resources/js/Pages/Applications/Components/StepReview.jsx
import React from "react";

export default function StepReview({
    form,
    totalLotArea = 0,
    setCurrentStep,
    onPreviewRoutingSlip,
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">Please review all application details before proceeding to fee calculation.</p>
                {onPreviewRoutingSlip && (
                    <button
                        type="button"
                        onClick={onPreviewRoutingSlip}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 hover:bg-blue-100 shadow-2xs transition-all active:scale-98 cursor-pointer"
                    >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        <span>Preview Routing Slip</span>
                    </button>
                )}
            </div>

            {/* Scope Recap */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 relative shadow-2xs">
                <button 
                    type="button" 
                    onClick={() => setCurrentStep(1)} 
                    className="absolute top-3.5 right-3.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                    Edit
                </button>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">1. Application Category & Purpose</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Category</p>
                        <p className="font-semibold text-slate-900">{form.application_type || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Form Number</p>
                        <p className="font-mono font-semibold text-slate-900">{form.form_number || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Zoning Class</p>
                        <p className="font-semibold text-slate-900">{form.land_use_class || "—"}</p>
                    </div>
                    <div className="sm:col-span-3">
                        <p className="text-[10px] text-slate-400 font-medium">Purpose</p>
                        <p className="font-medium text-slate-700">{form.purpose || "—"}</p>
                    </div>
                </div>
            </div>

            {/* Profile Recap */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 relative shadow-2xs">
                <button 
                    type="button" 
                    onClick={() => setCurrentStep(2)} 
                    className="absolute top-3.5 right-3.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                    Edit
                </button>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">2. Applicant Information</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Applicant Name</p>
                        <p className="font-semibold text-slate-900">{form.applicant_name || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Phone</p>
                        <p className="font-mono font-semibold text-slate-900">{form.contact_number ? `+63 ${form.contact_number}` : "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Email</p>
                        <p className="font-medium text-slate-900">{form.email || "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Representative</p>
                        <p className="font-medium text-slate-700">{form.representative_name || "Self / Direct"}</p>
                    </div>
                </div>
            </div>

            {/* Spatial Recap */}
            <div className="bg-slate-50/80 rounded-2xl p-4 border border-slate-200 relative shadow-2xs">
                <button 
                    type="button" 
                    onClick={() => setCurrentStep(3)} 
                    className="absolute top-3.5 right-3.5 text-xs font-bold text-blue-600 hover:text-blue-800 cursor-pointer"
                >
                    Edit
                </button>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">3. Property Location & Lots</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Barangay & Street</p>
                        <p className="font-semibold text-slate-900">{form.barangay ? (form.street_address ? `${form.street_address}, Brgy. ${form.barangay}` : `Brgy. ${form.barangay}`) : "—"}</p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Property Lots</p>
                        <p className="font-mono font-semibold text-slate-900">
                            {(form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).length > 0 
                                ? `${(form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).length} lot(s)` 
                                : "—"}
                        </p>
                    </div>
                    <div>
                        <p className="text-[10px] text-slate-400 font-medium">Total Land Area</p>
                        <p className="font-mono font-bold text-blue-700">
                            {(form.parcels || []).filter((p) => Boolean(p.property_index_number?.trim())).length > 0 && totalLotArea > 0 
                                ? `${totalLotArea.toLocaleString()} sq.m` 
                                : "—"}
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
