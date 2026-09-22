import React, { useMemo } from 'react';

export default function TrendsPanel({
    urbanGrowthData = null,
    selectedBgy = null,
    onClearBgy,
    onSelectBgy,
    onLocateApp,
    recent = [],
}) {
    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || '';

    // Active establishments from real Recent applications
    const activeEstablishments = useMemo(() => {
        let list = recent.filter(app => 
            app.status === 'Released' || app.status === 'For Release' || 
            app.status?.includes('Review') || app.status?.includes('Sangguniang')
        ).map(app => {
            const isCommInd = ['Commercial', 'Industrial', 'Agro-industrial'].includes(app.target_land_use_class);
            const badge = isCommInd ? app.target_land_use_class : app.application_type || 'Project';
            
            let color = '#2563eb';
            let bg = '#dbeafe';
            if (app.target_land_use_class === 'Commercial') { color = '#f59e0b'; bg = '#fef3c7'; }
            else if (app.target_land_use_class === 'Industrial') { color = '#ef4444'; bg = '#fee2e2'; }
            else if (app.target_land_use_class === 'Agro-industrial') { color = '#8b5cf6'; bg = '#f3e8ff'; }
            else if (app.target_land_use_class === 'Residential') { color = '#10b981'; bg = '#d1fae5'; }
            else if (app.target_land_use_class === 'Agricultural') { color = '#84cc16'; bg = '#ecfccb'; }

            return {
                id: app.id,
                name: app.applicant_name || app.reference_number,
                category: app.target_land_use_class,
                type: app.application_type,
                barangay: app.barangay || 'Poblacion',
                year: new Date(app.created_at).getFullYear(),
                description: app.purpose || `Approved ${app.target_land_use_class} permit`,
                badge: badge,
                color: color,
                bg: bg,
                appData: app,
            };
        });

        if (isBgy) {
            list = list.filter((e) => e.barangay.toLowerCase() === bgyName.toLowerCase());
        }
        return list;
    }, [recent, isBgy, bgyName]);

    const displayedEstablishments = activeEstablishments;

    const displayHotspots = useMemo(() => {
        return urbanGrowthData?.hotspots || [];
    }, [urbanGrowthData]);

    return (
        <div className="flex flex-col gap-3 p-3 select-none">
            {isBgy && (
                <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs flex items-center justify-between">
                    <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 block">
                            Barangay Focus Mode
                        </span>
                        <h3 className="text-sm font-black text-slate-900 mt-0.5">
                            Brgy. {bgyName}
                        </h3>
                    </div>
                    {onClearBgy && (
                        <button
                            type="button"
                            onClick={onClearBgy}
                            className="text-[10.5px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer border border-slate-200/80 shrink-0"
                            title="Return to Municipal Overview"
                        >
                            ✕ All Barangays
                        </button>
                    )}
                </div>
            )}

            {/* Development Corridors Ranked (From Backend) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Development Corridors (Live)
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        Click to Focus
                    </span>
                </div>

                <div className="space-y-1">
                    {displayHotspots.map((h) => {
                        const isSelected = isBgy && bgyName.toLowerCase() === (h.name || '').toLowerCase();
                        return (
                            <div
                                key={h.rank || h.name}
                                onClick={() => onSelectBgy && onSelectBgy(h.name)}
                                className={`flex items-center gap-2 p-1.5 px-2 rounded-xl border transition-all cursor-pointer group ${
                                    isSelected
                                        ? "bg-blue-50 border-blue-300 shadow-2xs"
                                        : "hover:bg-slate-50 border-slate-100 hover:border-blue-200"
                                }`}
                                title={`Click to center map on Brgy. ${h.name}`}
                            >
                                <span
                                    className={`text-[9px] font-black font-mono w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                                        h.rank === 1
                                            ? "bg-amber-100 text-amber-800"
                                            : h.rank === 2
                                            ? "bg-slate-200 text-slate-700"
                                            : h.rank === 3
                                            ? "bg-amber-50 text-amber-700"
                                            : "bg-slate-100 text-slate-500"
                                    }`}
                                >
                                    {h.rank}
                                </span>

                                <span className="text-[11.5px] font-bold text-slate-800 flex-1 truncate group-hover:text-blue-700">
                                    {h.name}
                                </span>

                                <span
                                    className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                                    style={{ color: h.color, background: h.bg }}
                                >
                                    {h.type}
                                </span>

                                <span className="text-[10px] text-slate-500 font-medium truncate max-w-[110px]" title={h.count}>
                                    {h.count}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Approved Projects (Recent Applications) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Recent Active Permits
                        </h4>
                    </div>
                </div>

                {/* Scrollable Establishment List */}
                <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
                    {displayedEstablishments.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs">
                            No active permits found.
                        </div>
                    ) : (
                        displayedEstablishments.map((est) => {
                            return (
                                <div
                                    key={est.id}
                                    className={`p-2.5 rounded-xl border transition-all bg-slate-50/70 border-slate-100 hover:border-slate-200`}
                                >
                                    <div className="flex items-start justify-between gap-1.5">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <span
                                                    className="text-[8.5px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider shrink-0"
                                                    style={{ backgroundColor: est.bg, color: est.color }}
                                                >
                                                    {est.badge}
                                                </span>
                                                <span className="text-[9.5px] font-mono font-bold text-slate-400">
                                                    {est.year}
                                                </span>
                                            </div>
                                            <h5 className="text-[11.5px] font-bold text-slate-900 mt-1 leading-snug">
                                                {est.name}
                                            </h5>
                                            <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">
                                                {est.description}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-2 pt-1.5 border-t border-slate-200/60 flex items-center justify-between text-[10px]">
                                        <span className="font-semibold text-slate-600 truncate max-w-[120px]">
                                            📍 Brgy. {est.barangay}
                                        </span>
                                        <div className="flex items-center gap-1">
                                            {onLocateApp && (
                                                <button
                                                    type="button"
                                                    onClick={() => onLocateApp(est.appData)}
                                                    className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                                    title="Center map on this application"
                                                >
                                                    📍 Locate
                                                </button>
                                            )}
                                            {onSelectBgy && !isBgy && (
                                                <button
                                                    type="button"
                                                    onClick={() => onSelectBgy(est.barangay)}
                                                    className="text-[9.5px] font-semibold text-slate-600 hover:text-slate-900 bg-slate-200/70 hover:bg-slate-300 px-1.5 py-0.5 rounded-lg transition-colors cursor-pointer"
                                                    title="Inspect this barangay"
                                                >
                                                    Brgy &rarr;
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
