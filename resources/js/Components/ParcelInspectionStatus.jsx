// resources/js/Components/ParcelInspectionStatus.jsx
import React, { useState, useEffect } from "react";
import { fetchParcelInspection } from "@/utils/supabaseApi";

// ── Badge Configuration ──
const STATUS_CONFIG = {
    assigned: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200" },
    in_progress: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    submitted: { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200" },
    completed: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
};

const RESULT_CONFIG = {
    Compliant: { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200" },
    "For Review": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200" },
    "With Discrepancy": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200" },
    "Requires Reinspection": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200" },
};

function StatusBadge({ label, type = "status" }) {
    if (!label) return null;
    const cfg = type === "status" 
        ? STATUS_CONFIG[label?.toLowerCase()] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" }
        : RESULT_CONFIG[label] || { bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200" };

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-current" />
            {label}
        </span>
    );
}

function SectionLabel({ children }) {
    return <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{children}</p>;
}

export default function ParcelInspectionStatus({ inspectionId, onStatusFetched }) {
    const [inspection, setInspection] = useState(null);
    const [loading, setLoading] = useState(true);
    // NEW: State for tracking the currently viewed photo
    const [selectedPhoto, setSelectedPhoto] = useState(null);

    useEffect(() => {
        const getInspection = async () => {
            setLoading(true);
            const data = await fetchParcelInspection(inspectionId);
            setInspection(data);
            
            // Tell the parent component what the live Supabase status is!
            if (data && onStatusFetched) {
                onStatusFetched(data.status);
            }
            
            setLoading(false);
        };

        if (inspectionId) {
            getInspection();
        } else {
            setLoading(false);
        }
    }, [inspectionId]); // Keep dependencies as is
    
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-8 bg-slate-50 border border-slate-200 rounded-xl animate-pulse">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                <span className="text-[12px] font-bold uppercase tracking-widest text-slate-400">Syncing Field Data...</span>
            </div>
        );
    }

    if (!inspection) {
        return (
            <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                    <h4 className="text-[13px] font-bold text-slate-700">No Field Inspection Record</h4>
                    <p className="text-[12px] text-slate-500 mt-0.5">This parcel has not been assigned to a site inspector yet, or the data is unavailable.</p>
                </div>
            </div>
        );
    }

    const formatDate = (dateStr) => {
        if (!dateStr) return "—";
        return new Date(dateStr).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
    };

    const formatTime = (dateStr) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleTimeString("en-PH", { hour: '2-digit', minute: '2-digit' });
    };

    // Prepare text blocks dynamically to only render those with content
    const textBlocks = [
        { label: "Observations", value: inspection.observations },
        { label: "Findings", value: inspection.findings },
        { label: "Discrepancies", value: inspection.discrepancies },
        { label: "Recommendations", value: inspection.recommendations },
        { label: "Inspector Notes", value: inspection.inspector_notes },
        { label: "Remarks", value: inspection.remarks },
    ].filter(block => block.value);

    // Get the accurate photo count (prefer the array length if available)
    const actualPhotoCount = inspection.field_job_photos?.length || inspection.photo_count || 0;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
            {/* Header Section */}
            <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-[14px] font-black text-slate-800 tracking-tight flex items-center gap-2">
                        <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Site Inspection Report
                    </h3>
                    <div className="h-4 w-px bg-slate-300 hidden sm:block" />
                    <StatusBadge label={inspection.status} type="status" />
                    {inspection.inspection_result && <StatusBadge label={inspection.inspection_result} type="result" />}
                </div>
                
                {inspection.submitted_at && (
                    <div className="text-[11px] font-semibold text-slate-500 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-sm flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        Submitted: {formatDate(inspection.submitted_at)}
                    </div>
                )}
            </div>

            <div className="p-5 space-y-6">
                {/* Meta Details Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-y-4 gap-x-6">
                    <div>
                        <SectionLabel>Scheduled Date</SectionLabel>
                        <p className="text-[13px] font-semibold text-slate-800">{formatDate(inspection.scheduled_date)}</p>
                    </div>
                    <div>
                        <SectionLabel>Deadline</SectionLabel>
                        <p className="text-[13px] font-semibold text-slate-800">{formatDate(inspection.deadline_date)}</p>
                    </div>
                    <div>
                        <SectionLabel>Parcel PIN</SectionLabel>
                        <p className="text-[12px] font-mono font-medium text-slate-700 bg-slate-50 inline-block px-1.5 py-0.5 rounded border border-slate-200">
                            {inspection.supabase_parcels?.property_index_number || 'N/A'}
                        </p>
                    </div>
                    <div>
                        <SectionLabel>Compliance Status</SectionLabel>
                        {inspection.is_compliant !== null ? (
                            <span className={`inline-flex items-center gap-1 text-[12px] font-bold ${inspection.is_compliant ? 'text-emerald-600' : 'text-red-600'}`}>
                                {inspection.is_compliant ? 'Compliant' : 'Non-Compliant'}
                            </span>
                        ) : (
                            <span className="text-[13px] font-medium text-slate-400">Pending</span>
                        )}
                    </div>
                </div>

                {/* Progress & Media Metrics */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-slate-100">
                    <div className="flex-1 flex items-center gap-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Checklist Progress</p>
                            <p className="text-[13px] font-black text-slate-800">
                                {inspection.checklist_completed_count || 0} / {inspection.checklist_total_count || 0} <span className="font-medium text-slate-500 text-[11px]">Completed</span>
                            </p>
                        </div>
                    </div>

                    <div className="flex-1 flex items-center gap-3 bg-amber-50/50 p-3 rounded-lg border border-amber-100">
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                        </div>
                        <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Field Evidence</p>
                            <p className="text-[13px] font-black text-slate-800">
                                {actualPhotoCount} <span className="font-medium text-slate-500 text-[11px]">Photos Uploaded</span>
                            </p>
                        </div>
                    </div>
                </div>

                {/* Detailed Text Blocks */}
                {textBlocks.length > 0 && (
                    <div className="space-y-4 pt-4 border-t border-slate-100">
                        {textBlocks.map((block, idx) => (
                            <div key={idx}>
                                <SectionLabel>{block.label}</SectionLabel>
                                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 text-[13px] text-slate-600 leading-relaxed whitespace-pre-wrap">
                                    {block.value}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Field Photos Grid */}
                {inspection.field_job_photos && inspection.field_job_photos.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                        <SectionLabel>Attached Field Photos</SectionLabel>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-2">
                            {inspection.field_job_photos.map((photo) => (
                                <button 
                                    type="button"
                                    key={photo.id} 
                                    onClick={() => setSelectedPhoto(photo)}
                                    className="group relative block aspect-square rounded-xl overflow-hidden border border-slate-200 bg-slate-100 hover:border-blue-400 hover:shadow-md transition-all cursor-zoom-in text-left focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                                    title="Click to enlarge photo"
                                >
                                    <img 
                                        src={photo.photo_url} 
                                        alt={`Field evidence`}
                                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                                        loading="lazy"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                    
                                    {/* Capture Time Overlay on Hover */}
                                    {photo.captured_at && (
                                        <div className="absolute bottom-2 left-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                            <p className="text-[9px] font-bold text-white uppercase tracking-widest drop-shadow-md truncate">
                                                {formatDate(photo.captured_at)} • {formatTime(photo.captured_at)}
                                            </p>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* NEW: Lightbox Modal for Enlarged Photo */}
            {selectedPhoto && (
                <div 
                    className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-[formFadeIn_0.2s_ease-out]"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div 
                        className="relative max-w-4xl w-full flex flex-col bg-white rounded-2xl overflow-hidden shadow-2xl" 
                        onClick={(e) => e.stopPropagation()} // Prevent clicking inside from closing modal
                    >
                        {/* Modal Header */}
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 bg-slate-50 shrink-0">
                            <div>
                                <h3 className="text-[14px] font-black text-slate-800 tracking-tight flex items-center gap-2">
                                    <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                    </svg>
                                    Field Evidence
                                </h3>
                                {selectedPhoto.captured_at && (
                                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                                        Captured: {formatDate(selectedPhoto.captured_at)} at {formatTime(selectedPhoto.captured_at)}
                                    </p>
                                )}
                            </div>
                            <button 
                                onClick={() => setSelectedPhoto(null)} 
                                className="w-8 h-8 flex items-center justify-center bg-slate-200 hover:bg-slate-300 rounded-full text-slate-600 transition-colors"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        
                        {/* Enlarged Image Area */}
                        <div className="overflow-auto bg-slate-200 p-2 sm:p-4 flex items-center justify-center min-h-[50vh] max-h-[75vh]">
                            <img 
                                src={selectedPhoto.photo_url} 
                                alt="Field evidence enlarged" 
                                className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-sm" 
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}