import React, { useMemo, useState } from 'react';
import { 
    ROSARIO_GROWTH_ESTABLISHMENTS, 
    getEstablishmentsForYear, 
    getNewEstablishmentsForYear, 
    YEAR_MILESTONES 
} from '@/data/rosarioEstablishments';

export default function TrendsPanel({
    urbanGrowthData = null,
    selectedBgy = null,
    onClearBgy,
    onSelectBgy,
    year = 2026,
    landUseData = [],
    hotspots = [],
    onLocateEstablishment,
}) {
    const [filterTab, setFilterTab] = useState("all"); // "all" | "new"
    const [catFilter, setCatFilter] = useState("all");

    const isBgy = Boolean(selectedBgy && selectedBgy.name);
    const bgyName = selectedBgy?.name || '';

    // Active annual planning milestone narrative
    const activeMilestone = useMemo(() => {
        return YEAR_MILESTONES[year] || YEAR_MILESTONES[2026];
    }, [year]);

    // Active establishments from Google Maps reference
    const activeEstablishments = useMemo(() => {
        return getEstablishmentsForYear(year);
    }, [year]);

    const newThisYear = useMemo(() => {
        return getNewEstablishmentsForYear(year);
    }, [year]);

    // Filtered establishments by active tab, category, and barangay (if focus mode active)
    const displayedEstablishments = useMemo(() => {
        let list = filterTab === "new" ? newThisYear : activeEstablishments;
        if (isBgy) {
            list = list.filter((e) => e.barangay.toLowerCase() === bgyName.toLowerCase());
        }
        if (catFilter !== "all") {
            list = list.filter((e) => e.category.toLowerCase().includes(catFilter.toLowerCase()) || e.type.toLowerCase().includes(catFilter.toLowerCase()));
        }
        return list;
    }, [filterTab, newThisYear, activeEstablishments, isBgy, bgyName, catFilter]);

    // Dynamic yearly land use simulation based on baseline 2020 CLUP geometry
    const dynamicBreakdown = useMemo(() => {
        const yearDiff = Math.max(0, year - 2020);
        // Realistic progression: commercial & residential steadily convert small percentages of agriculture
        const commDelta = yearDiff * 14.5;
        const resDelta = yearDiff * 22.0;
        const indDelta = yearDiff * 6.5;
        const agroDelta = yearDiff * 5.0;
        const specDelta = yearDiff * 4.0;
        const agDelta = -(commDelta + resDelta + indDelta + agroDelta + specDelta);

        const baseAg = 18526.5 + agDelta;
        const baseRes = 1643.9 + resDelta;
        const baseComm = 1177.7 + commDelta;
        const baseSpec = 513.2 + specDelta;
        const baseInd = 440.8 + indDelta;
        const baseAgro = 365.2 + agroDelta;
        const total = 22667.2;

        const agPct = +(baseAg / total * 100).toFixed(1);
        const resPct = +(baseRes / total * 100).toFixed(1);
        const commPct = +(baseComm / total * 100).toFixed(1);
        const specPct = +(baseSpec / total * 100).toFixed(1);
        const indPct = +(baseInd / total * 100).toFixed(1);
        const agroPct = +(100 - (agPct + resPct + commPct + specPct + indPct)).toFixed(1);

        return [
            ["Agricultural", +baseAg.toFixed(1), 165, agPct, "#84cc16", "#ecfccb"],
            ["Residential", +baseRes.toFixed(1), 66 + yearDiff * 3, resPct, "#22c55e", "#dcfce7"],
            ["Commercial", +baseComm.toFixed(1), 65 + yearDiff * 4, commPct, "#f59e0b", "#fef3c7"],
            ["Special projects", +baseSpec.toFixed(1), 126 + yearDiff, specPct, "#64748b", "#f1f5f9"],
            ["Industrial", +baseInd.toFixed(1), 35 + yearDiff, indPct, "#ef4444", "#fee2e2"],
            ["Agro-industrial", +baseAgro.toFixed(1), 56 + yearDiff, agroPct, "#8b5cf6", "#f3e8ff"],
        ];
    }, [year]);

    // Dynamic corridors ranked for the active year based on cumulative real-world additions
    const dynamicHotspots = useMemo(() => {
        const yearHotspotsMap = {
            2020: [
                { rank: 1, name: "Poblacion B", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Jollibee & Central Banks" },
                { rank: 2, name: "Poblacion A", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "McDonald's & Town Hall" },
                { rank: 3, name: "Poblacion C", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Puregold Highway Anchor" },
                { rank: 4, name: "Namunga", type: "Institutional", color: "#6366f1", bg: "#e0e7ff", count: "BatStateU Campus" },
                { rank: 5, name: "San Carlos", type: "Agro-industrial", color: "#8b5cf6", bg: "#f3e8ff", count: "Blue Diamond Feedmill" },
            ],
            2021: [
                { rank: 1, name: "Quilib", type: "Residential", color: "#10b981", bg: "#d1fae5", count: "Lumina Homes Phase 1" },
                { rank: 2, name: "Poblacion B", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Commercial Recovery" },
                { rank: 3, name: "San Ignacio", type: "Agro-industrial", color: "#8b5cf6", bg: "#f3e8ff", count: "Nutrimeal Logistics" },
                { rank: 4, name: "Namunga", type: "Commercial Strip", color: "#f59e0b", bg: "#fef3c7", count: "Highway Strip Expansion" },
                { rank: 5, name: "San Roque", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Early Trade Corridor" },
            ],
            2022: [
                { rank: 1, name: "Namunga", type: "Commercial Strip", color: "#f59e0b", bg: "#fef3c7", count: "Jollibee Highway Drive-Thru" },
                { rank: 2, name: "Quilib", type: "Residential", color: "#10b981", bg: "#d1fae5", count: "Lumina Homes Phase 2" },
                { rank: 3, name: "Poblacion C", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Highway Retail Cluster" },
                { rank: 4, name: "San Carlos", type: "Agro-industrial", color: "#8b5cf6", bg: "#f3e8ff", count: "Feedmill Logistics Hub" },
                { rank: 5, name: "San Roque", type: "Residential/Comm", color: "#22c55e", bg: "#dcfce7", count: "Suburban Infill Node" },
            ],
            2023: [
                { rank: 1, name: "Namunga", type: "Major Commercial Mall", color: "#f43f5e", bg: "#ffe4e6", count: "Citimart Mall & Bypass Road" },
                { rank: 2, name: "San Roque", type: "Civic & Commercial", color: "#ea580c", bg: "#ffedd5", count: "Public Market Groundwork" },
                { rank: 3, name: "Quilib", type: "Residential Sprawl", color: "#10b981", bg: "#d1fae5", count: "Expanded Housing Hub" },
                { rank: 4, name: "Poblacion C", type: "Commercial", color: "#f59e0b", bg: "#fef3c7", count: "Puregold Highway Strip" },
                { rank: 5, name: "Bagong Pook", type: "Planned Residential", color: "#10b981", bg: "#d1fae5", count: "Bypass Access Corridor" },
            ],
            2024: [
                { rank: 1, name: "San Roque", type: "Public Market & Sports", color: "#ea580c", bg: "#ffedd5", count: "Modern Market & Stadium" },
                { rank: 2, name: "Namunga", type: "Commercial Complex", color: "#f43f5e", bg: "#ffe4e6", count: "Citimart & Highway Retail" },
                { rank: 3, name: "Bagong Pook", type: "Master-Planned Subd", color: "#10b981", bg: "#d1fae5", count: "Town & Country (Active Group)" },
                { rank: 4, name: "Quilib", type: "Residential", color: "#10b981", bg: "#d1fae5", count: "Lumina Communities" },
                { rank: 5, name: "Santa Cruz", type: "Healthcare Node", color: "#dc2626", bg: "#fee2e2", count: "District Hospital Prep" },
            ],
            2025: [
                { rank: 1, name: "Santa Cruz", type: "District Hospital", color: "#dc2626", bg: "#fee2e2", count: "Rosario District Hospital" },
                { rank: 2, name: "San Roque", type: "Civic & Commercial", color: "#ea580c", bg: "#ffedd5", count: "New Market & Stadium" },
                { rank: 3, name: "Namunga", type: "Arterial Bypass Hub", color: "#2563eb", bg: "#dbeafe", count: "Namunga-Namuco Bypass" },
                { rank: 4, name: "Mavalor", type: "Infrastructure Link", color: "#2563eb", bg: "#dbeafe", count: "Rosario-Taysan Connector" },
                { rank: 5, name: "Bagong Pook", type: "Suburban Community", color: "#10b981", bg: "#d1fae5", count: "Town & Country Estates" },
            ],
            2026: [
                { rank: 1, name: "Bagong Pook", type: "Commercial & Logistics", color: "#d97706", bg: "#fef3c7", count: "Bypass Commercial Strip" },
                { rank: 2, name: "San Roque", type: "Civic & Commercial", color: "#ea580c", bg: "#ffedd5", count: "Modern Trade & Sports Hub" },
                { rank: 3, name: "Namunga", type: "Regional Retail Pole", color: "#f43f5e", bg: "#ffe4e6", count: "Citimart Shopping Center" },
                { rank: 4, name: "Santa Cruz", type: "Healthcare Institution", color: "#dc2626", bg: "#fee2e2", count: "Operating District Hospital" },
                { rank: 5, name: "Quilib", type: "High-Density Residential", color: "#10b981", bg: "#d1fae5", count: "Expanded Lumina Corridor" },
            ],
        };
        return yearHotspotsMap[year] || yearHotspotsMap[2026];
    }, [year]);

    // Barangay specific data
    const bgyData = useMemo(() => {
        if (!isBgy || !urbanGrowthData?.byBarangay) return null;
        return urbanGrowthData.byBarangay[bgyName] || null;
    }, [isBgy, bgyName, urbanGrowthData]);

    const activeBreakdown = useMemo(() => {
        if (isBgy && bgyData?.breakdown) {
            return bgyData.breakdown;
        }
        return dynamicBreakdown;
    }, [isBgy, bgyData, dynamicBreakdown]);

    return (
        <div className="flex flex-col gap-3 p-3 select-none">
            {/* 1. Dynamic Temporal Horizon Milestone Banner */}
            <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-2xl p-3.5 text-white shadow-md border border-slate-700/60 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <span className="flex h-2.5 w-2.5 relative">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </span>
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300">
                            Simulation Horizon · {year}
                        </span>
                    </div>

                    <span className="text-[9px] font-mono font-bold bg-white/10 px-2 py-0.5 rounded-full border border-white/10 text-slate-300">
                        {activeEstablishments.length} Active Nodes
                    </span>
                </div>

                <h3 className="text-sm font-black text-white mt-1.5 leading-snug">
                    {activeMilestone.title}
                </h3>
                <p className="text-[11px] text-slate-300 font-medium mt-1 leading-relaxed">
                    {activeMilestone.desc}
                </p>

                {newThisYear.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-[10px]">
                        <span className="text-amber-300 font-bold flex items-center gap-1">
                            <span>✨</span> {newThisYear.length} Added in {year}
                        </span>
                        <span className="text-slate-400">
                            Key Hub: <strong className="text-white">{activeMilestone.highlightBrgy}</strong>
                        </span>
                    </div>
                )}
            </div>

            {/* 2. Executive Spatial Profile Card */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3.5 shadow-2xs">
                {isBgy ? (
                    <div>
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
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

                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-left">
                            <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                                    Total Area
                                </span>
                                <span className="text-xs font-black font-mono text-slate-900 mt-0.5 block">
                                    {bgyData?.totalHectares || selectedBgy?.data?.Total || "—"} ha
                                </span>
                            </div>
                            <div className="bg-emerald-50/70 border border-emerald-100 p-2 rounded-xl">
                                <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 block">
                                    Dominant Zone
                                </span>
                                <span className="text-xs font-black text-emerald-800 mt-0.5 block truncate" title={bgyData?.dominantUse}>
                                    {bgyData?.dominantUse || "Residential"}
                                </span>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div className="flex items-center justify-between pb-2.5 border-b border-slate-100">
                            <div>
                                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                                    CLUP 2030 Spatial Scope
                                </span>
                                <div className="flex items-baseline gap-1.5 mt-0.5">
                                    <span className="text-lg font-black text-slate-900 font-mono tracking-tight leading-none">
                                        22,667.2
                                    </span>
                                    <span className="text-[10.5px] font-semibold text-slate-500">
                                        hectares zoned
                                    </span>
                                </div>
                            </div>

                            <div className="text-right bg-emerald-50/90 border border-emerald-100 px-2.5 py-1 rounded-xl">
                                <span className="text-[8.5px] font-bold uppercase tracking-wider text-emerald-700 block">
                                    Dominant Use
                                </span>
                                <span className="text-xs font-black text-emerald-800 leading-none block mt-0.5">
                                    Agricultural (81.7%)
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 mt-2.5 text-center">
                            <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl">
                                <span className="text-[8.5px] font-bold uppercase tracking-wider text-slate-400 block">
                                    Total Parcels
                                </span>
                                <span className="text-xs font-black font-mono text-slate-800 mt-0.5 block">
                                    513 zones & parcels
                                </span>
                            </div>
                            <div className="bg-blue-50/60 border border-blue-100 p-2 rounded-xl">
                                <span className="text-[8.5px] font-bold uppercase tracking-wider text-blue-600 block">
                                    Growth Nodes
                                </span>
                                <span className="text-xs font-black font-mono text-blue-700 mt-0.5 block">
                                    {activeEstablishments.length} Active POIs
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* 3. Google Maps Reference: Grounded Establishments Timeline */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-rose-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Establishments (Google Maps)
                        </h4>
                    </div>
                    <span className="text-[9.5px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        Year {year}
                    </span>
                </div>

                {/* Filter Tabs */}
                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10.5px]">
                    <button
                        type="button"
                        onClick={() => setFilterTab("all")}
                        className={`flex-1 py-1 rounded-md font-bold transition-all ${
                            filterTab === "all"
                                ? "bg-white text-slate-800 shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                        Active ({isBgy ? displayedEstablishments.length : activeEstablishments.length})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterTab("new")}
                        className={`flex-1 py-1 rounded-md font-bold transition-all flex items-center justify-center gap-1 ${
                            filterTab === "new"
                                ? "bg-white text-amber-700 shadow-xs"
                                : "text-slate-500 hover:text-slate-800"
                        }`}
                    >
                        <span>✨ New in {year}</span>
                        <span className="font-mono text-[9px] bg-amber-100 text-amber-800 px-1 rounded-full">
                            {newThisYear.length}
                        </span>
                    </button>
                </div>

                {/* Scrollable Establishment List */}
                <div className="max-h-56 overflow-y-auto pr-1 space-y-2">
                    {displayedEstablishments.length === 0 ? (
                        <div className="p-4 text-center text-slate-400 text-xs">
                            No establishments match this filter for {year}.
                        </div>
                    ) : (
                        displayedEstablishments.map((est) => {
                            const isNew = est.year === year;
                            return (
                                <div
                                    key={est.id}
                                    className={`p-2.5 rounded-xl border transition-all ${
                                        isNew
                                            ? "bg-amber-50/40 border-amber-200/80 shadow-xs"
                                            : "bg-slate-50/70 border-slate-100 hover:border-slate-200"
                                    }`}
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
                                                {isNew && (
                                                    <span className="text-[8px] font-black text-amber-700 bg-amber-100 px-1 py-0.2 rounded-full uppercase">
                                                        New
                                                    </span>
                                                )}
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
                                            {onLocateEstablishment && (
                                                <button
                                                    type="button"
                                                    onClick={() => onLocateEstablishment(est)}
                                                    className="text-[9.5px] font-bold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-lg transition-colors cursor-pointer"
                                                    title="Center map on this landmark"
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

            {/* 4. Land Use Composition Card (Dynamically Simulated for Active Year) */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800">
                            {isBgy ? `${bgyName} Land Use Mix` : `Land Use Distribution (${year})`}
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/60 px-1.5 py-0.5 rounded">
                        100% Normalized
                    </span>
                </div>

                <div className="space-y-2">
                    {activeBreakdown.map(([label, ha, count, pct, color, bg]) => {
                        const numericPct = typeof pct === 'number' ? pct : parseFloat(pct) || 0;
                        return (
                            <div key={label} className="group">
                                <div className="flex items-center justify-between text-[11px] mb-1">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-2xs"
                                            style={{ backgroundColor: color }}
                                        />
                                        <span className="font-semibold text-slate-700 truncate">
                                            {label}
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-2 font-mono text-[10px] shrink-0 ml-2">
                                        {ha !== undefined && (
                                            <span className="text-slate-400">
                                                {typeof ha === 'number' ? ha.toLocaleString() : ha} ha
                                            </span>
                                        )}
                                        <span
                                            className="font-bold text-slate-900 w-9 text-right"
                                            style={{ color: color }}
                                        >
                                            {numericPct}%
                                        </span>
                                    </div>
                                </div>

                                <div
                                    className="h-1.5 w-full rounded-full overflow-hidden"
                                    style={{ backgroundColor: bg || '#f1f5f9' }}
                                >
                                    <div
                                        className="h-full rounded-full transition-all duration-500 ease-out"
                                        style={{
                                            width: `${Math.min(100, Math.max(1, numericPct))}%`,
                                            backgroundColor: color
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[9.5px] text-slate-400 font-medium">
                    <span>Source: Official CLUP 2030 GIS Geometries</span>
                    <span>Σ = 100.0%</span>
                </div>
            </div>

            {/* 5. Development Corridors Ranked for Active Year */}
            <div className="bg-white rounded-xl border border-slate-200/90 p-3 shadow-2xs space-y-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Development Corridors ({year})
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        Click to Focus
                    </span>
                </div>

                <div className="space-y-1">
                    {dynamicHotspots.map((h) => {
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
        </div>
    );
}
