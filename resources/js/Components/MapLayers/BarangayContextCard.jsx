import React from "react";

export default function BarangayContextCard({ activeLayer, barangayName, data, year, onClose }) {
    if (!barangayName) return null;

    // Fallback data if unmapped
    const stats = data || { total: 0, review: 0, released: 0, landUse: "Residential", diversity: 0.5 };

    const renderLayerContent = () => {
        switch (activeLayer) {
            case "status":
                return (
                    <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                        <div className="bg-slate-50 rounded-xl py-2.5 px-1 border border-slate-200">
                            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider block mb-0.5">Total Apps</span>
                            <span className="text-xl font-black text-slate-800 font-mono">{stats.total || 0}</span>
                        </div>
                        <div className="bg-amber-50 rounded-xl py-2.5 px-1 border border-amber-200">
                            <span className="text-[9px] font-bold text-amber-700 uppercase tracking-wider block mb-0.5">Review</span>
                            <span className="text-xl font-black text-amber-700 font-mono">{stats.review || 0}</span>
                        </div>
                        <div className="bg-emerald-50 rounded-xl py-2.5 px-1 border border-emerald-200">
                            <span className="text-[9px] font-bold text-emerald-700 uppercase tracking-wider block mb-0.5">Released</span>
                            <span className="text-xl font-black text-emerald-700 font-mono">{stats.released || 0}</span>
                        </div>
                    </div>
                );
            case "trends":
                return (
                    <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between p-2.5 bg-indigo-50 border border-indigo-100 rounded-xl">
                            <span className="text-xs font-bold text-indigo-800">Projected Land Use</span>
                            <span className="text-xs font-black text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded-md">{stats.landUse}</span>
                        </div>
                        <div className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-100 rounded-xl">
                            <span className="text-xs font-bold text-slate-600">Simulated Year</span>
                            <span className="text-xs font-mono font-bold text-slate-800">{year}</span>
                        </div>
                    </div>
                );
            case "diversity":
                const score = (stats.diversity * 100).toFixed(0);
                return (
                    <div className="mt-3">
                        <div className="flex items-end justify-between mb-1.5">
                            <span className="text-xs font-bold text-slate-600">Economic Mix Score</span>
                            <span className="text-lg font-black text-purple-700 font-mono">{score}%</span>
                        </div>
                        <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                            <div 
                                className="h-full bg-gradient-to-r from-purple-400 to-indigo-600 rounded-full transition-all duration-500" 
                                style={{ width: `${score}%` }} 
                            />
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 leading-tight">
                            {score > 70 ? "Highly diversified multi-use zone." : "Predominantly single-use zoning. Low economic variance."}
                        </p>
                    </div>
                );
            case "zoning":
                return (
                    <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-xl">
                        <div className="flex items-center gap-2 mb-2">
                            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.963 11.963 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                            </svg>
                            <span className="text-xs font-bold text-blue-900">CLUP 2030 Master Plan</span>
                        </div>
                        <p className="text-[10px] text-blue-800 leading-relaxed">
                            Refer to the official municipal zoning overlay on the map to view exact allowable land uses and density restrictions for this specific barangay.
                        </p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-3.5 mb-4 relative overflow-hidden transition-all">
            <button 
                onClick={onClose}
                className="absolute top-3 right-3 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 p-1 rounded-full transition-colors"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            <div className="pr-6 border-b border-slate-100 pb-2.5">
                <span className="text-[9px] font-bold uppercase tracking-widest text-blue-600 mb-0.5 block">Selected Target</span>
                <h3 className="text-sm font-black text-slate-800 tracking-tight">{barangayName}</h3>
            </div>
            
            {renderLayerContent()}
        </div>
    );
}