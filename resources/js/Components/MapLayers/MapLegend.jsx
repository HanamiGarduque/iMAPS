import { useState, useEffect, useRef } from 'react';
import { DIVERSITY_TIERS } from '@/utils/diversityTheme';

export default function MapLegend({
    activeLayer,
    year = 2026,
    diversityTierFilter = "all",
    onSelectDiversityTier = () => {},
    meanScore = 0.62,
    tierCounts = null,
}) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [isPinned, setIsPinned] = useState(() => {
        const saved = localStorage.getItem("imaps_legend_pinned");
        return saved !== null ? saved === "true" : true; // Default pinned
    });
    const [timeLeft, setTimeLeft] = useState(15);
    const [isHovered, setIsHovered] = useState(false);
    const timerRef = useRef(null);

    const togglePin = () => {
        setIsPinned((prev) => {
            const next = !prev;
            localStorage.setItem("imaps_legend_pinned", String(next));
            return next;
        });
    };

    // Layer metadata & titles
    const layerMeta = {
        status: {
            title: "Application Density",
            subtitle: "Clearance Volume",
            icon: (
                <svg className="w-3.5 h-3.5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
            )
        },
        trends: {
            title: `Land Use Trends (${year})`,
            subtitle: "Urban Growth & Zones",
            icon: (
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
            )
        },
        diversity: {
            title: "Land Use & Economic Mix",
            subtitle: "Municipal Activity Balance",
            icon: (
                <svg className="w-3.5 h-3.5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
            )
        },
        zoning: {
            title: "CLUP 2030 Master Zoning",
            subtitle: "Official Classifications",
            icon: (
                <svg className="w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l5.447 2.724A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
            )
        },
    };

    // Reset timer when layer changes
    useEffect(() => {
        setIsExpanded(true);
        setTimeLeft(15);
    }, [activeLayer]);

    // Countdown Timer (Only when unpinned and not hovered)
    useEffect(() => {
        if (!isExpanded || isPinned || isHovered) {
            if (timerRef.current) clearInterval(timerRef.current);
            return;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    clearInterval(timerRef.current);
                    setIsExpanded(false);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isExpanded, isPinned, isHovered]);

    const handleExpand = () => {
        setIsExpanded(true);
        setTimeLeft(15);
    };

    const currentMeta = layerMeta[activeLayer] || layerMeta.status;

    // Diversity tier definitions with Viridis perceptually uniform sequential scale
    // (shared with the 2D map, 3D map, and DiversityPanel so the scale never drifts)
    const diversityTiers = DIVERSITY_TIERS.map((t) => ({
        ...t,
        count: tierCounts ? (tierCounts[t.id] ?? 0) : null,
    }));

    const handleTierClick = (tierId) => {
        if (diversityTierFilter === tierId) {
            onSelectDiversityTier("all");
        } else {
            onSelectDiversityTier(tierId);
        }
    };

    return (
        <div 
            className="absolute bottom-20 left-6 z-[550] pointer-events-auto transition-all duration-300 select-none"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
        >
            {/* 1. Minimized Google Maps Style Pill */}
            {!isExpanded && (
                <button
                    onClick={handleExpand}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/95 hover:bg-white text-slate-800 backdrop-blur-xl border border-slate-200/80 shadow-[0_4px_16px_rgba(0,0,0,0.12)] hover:shadow-lg transition-all group hover:scale-[1.02] cursor-pointer"
                    title="Click to view full map legend"
                >
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        {currentMeta.icon}
                    </div>
                    <span className="text-xs font-bold text-slate-800">
                        Legend
                    </span>
                    <span className="text-[10px] font-medium text-slate-400">·</span>
                    <span className="text-[11px] font-semibold text-slate-600 truncate max-w-[130px]">
                        {currentMeta.title}
                    </span>
                    <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
                    </svg>
                </button>
            )}

            {/* 2. Expanded Google Maps Style Standard Legend Card */}
            {isExpanded && (
                <div className="w-[275px] bg-white/95 backdrop-blur-2xl rounded-2xl shadow-[0_12px_32px_rgba(0,0,0,0.15)] border border-slate-200/80 flex flex-col overflow-hidden animate-in fade-in slide-in-from-bottom-3 duration-200">
                    
                    {/* Top 15-Second Countdown Progress Bar */}
                    {!isPinned && (
                        <div className="h-1 w-full bg-slate-100 overflow-hidden relative">
                            <div 
                                className={`h-full transition-all linear ${isHovered ? 'bg-amber-400' : 'bg-blue-600'}`}
                                style={{ 
                                    width: `${(timeLeft / 15) * 100}%`,
                                    transitionDuration: isHovered ? '0ms' : '1000ms'
                                }}
                            />
                        </div>
                    )}

                    {/* Legend Header */}
                    <div className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50/90 border-b border-slate-100">
                        <div className="flex items-center gap-2 min-w-0 pr-1">
                            <div className="w-6 h-6 rounded-lg bg-white shadow-xs border border-slate-200/60 flex items-center justify-center shrink-0">
                                {currentMeta.icon}
                            </div>
                            <div className="min-w-0">
                                <h4 className="text-xs font-bold text-slate-800 leading-tight truncate">
                                    {currentMeta.title}
                                </h4>
                                <div className="flex items-center gap-1 mt-0.5">
                                    <span className="text-[9px] text-slate-400 font-medium">
                                        {currentMeta.subtitle}
                                    </span>
                                    {!isPinned && (
                                        <span className="text-[8px] font-mono text-slate-400 bg-slate-200/70 px-1 rounded">
                                            {isHovered ? 'Paused' : `${timeLeft}s`}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Pin / Lock & Collapse Action Buttons */}
                        <div className="flex items-center gap-1 shrink-0">
                            <button
                                onClick={togglePin}
                                className={`p-1 rounded-md transition-colors cursor-pointer ${
                                    isPinned 
                                        ? 'bg-blue-100 text-blue-700' 
                                        : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
                                }`}
                                title={isPinned ? "Pinned (Auto-collapse disabled)" : "Pin legend to keep open"}
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                                </svg>
                            </button>
                            <button
                                onClick={() => setIsExpanded(false)}
                                className="p-1 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors cursor-pointer"
                                title="Minimize Legend"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>
                    </div>

                    {/* Standard Google Maps Styled Legend Content */}
                    <div className="p-3 space-y-2.5 text-xs text-slate-700">
                        
                        {/* 1. Status Layer (Google Maps Traffic-Style Gradient Ramp) */}
                        {activeLayer === 'status' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                                    <span>Density Scale</span>
                                    <span className="font-mono text-[9px] text-slate-400">Applications</span>
                                </div>

                                {/* Continuous Density Gradient Bar */}
                                <div className="h-2.5 w-full rounded-full shadow-inner bg-gradient-to-r from-[#dbeafe] via-[#3b82f6] to-[#1e3a8a] relative" />

                                {/* Step Labels */}
                                <div className="flex justify-between text-[9px] font-mono text-slate-500 font-bold px-0.5">
                                    <span>&lt; 4</span>
                                    <span>4-11</span>
                                    <span>12-17</span>
                                    <span>18-24</span>
                                    <span className="text-blue-950 font-black">25+</span>
                                </div>

                                {/* Status Descriptions */}
                                <div className="flex justify-between text-[8px] uppercase tracking-wider text-slate-400 font-bold px-0.5">
                                    <span>Minimal</span>
                                    <span>Moderate</span>
                                    <span className="text-blue-900 font-bold">Peak</span>
                                </div>

                                {/* Boundary Line Standard Symbols */}
                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-4 h-0.5 border-t-2 border-blue-900 border-dashed inline-block" />
                                        <span>Rosario Border</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-4 h-0.5 bg-blue-600 inline-block" />
                                        <span>Barangay</span>
                                    </div>
                                </div>

                                {/* Application Status Pin Color Key */}
                                <div className="pt-2 border-t border-slate-100 space-y-1.5">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                        <span>Status Pins</span>
                                        <span className="text-[8.5px] font-mono font-semibold text-blue-600 bg-blue-50 px-1 py-0.5 rounded">
                                            Interactive
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#10b981] ring-2 ring-emerald-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">Received</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] ring-2 ring-amber-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">Review</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] ring-2 ring-purple-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">SB Hearing</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#0ea5e9] ring-2 ring-sky-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">For Release</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#4f46e5] ring-2 ring-indigo-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">Released</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-full bg-[#f43f5e] ring-2 ring-rose-200 shrink-0" />
                                            <span className="text-[10.5px] font-semibold text-slate-700 truncate">Denied</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 2. Trends Layer (Categorical Google Maps POI-Style Swatches) */}
                        {activeLayer === 'trends' && (
                            <div className="space-y-2">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                    Land Use Zones
                                </span>

                                <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#84cc16] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Agricultural (81.7%)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Residential (7.3%)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Commercial (5.2%)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#64748b] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Special Proj (2.3%)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Industrial (1.9%)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded-full bg-[#8b5cf6] shrink-0 shadow-xs" />
                                        <span className="text-[11px] font-medium text-slate-700 truncate">Agro-Ind (1.6%)</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3.5 h-0.5 border-t-2 border-blue-800 border-dashed inline-block" />
                                        <span>Brgy Boundary</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-blue-500/20 border border-blue-600 inline-block" />
                                        <span>Selected Brgy</span>
                                    </div>
                                </div>

                                <div className="pt-2 border-t border-slate-100 space-y-1">
                                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase tracking-wider">
                                        <span>Growth POIs ({year})</span>
                                        <span className="text-[8.5px] font-mono font-semibold text-rose-600 bg-rose-50 px-1 py-0.2 rounded">
                                            Google Maps
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] text-slate-600">
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-md bg-[#f43f5e] shrink-0" />
                                            <span>Mall / Retail</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-md bg-[#10b981] shrink-0" />
                                            <span>Subdivision</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <span className="w-2.5 h-2.5 rounded-md bg-[#2563eb] shrink-0" />
                                            <span>Bypass Link</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* 3. Diversity Layer (High-Contrast 5-Color Spectrum & Interactive Filter Swatches) */}
                        {activeLayer === 'diversity' && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] text-slate-500 font-semibold">
                                    <div className="flex items-center gap-1">
                                        <span>Mix Spectrum</span>
                                        {diversityTierFilter !== "all" && (
                                            <span className="text-[8.5px] font-bold text-slate-700 bg-slate-100 px-1.5 py-0.2 rounded border border-slate-200">
                                                Active Filter
                                            </span>
                                        )}
                                    </div>
                                    <span className="font-mono text-slate-700 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                        {meanScore.toFixed(2)} Municipal Mean
                                    </span>
                                </div>

                                {/* Continuous Multi-Hue Spectrum Bar (Perceptually Uniform Viridis) */}
                                <div className="h-2.5 w-full rounded-full shadow-inner bg-gradient-to-r from-[#440154] via-[#3b528b] via-[#21918c] via-[#5ec962] to-[#fde725] relative">
                                    {/* Active Rosario Municipal Marker */}
                                    <div
                                        className="absolute -top-1 w-4 h-4 bg-white border-2 border-[#21918c] rounded-full shadow-md -translate-x-1/2 cursor-help"
                                        style={{ left: `${Math.min(100, Math.max(0, meanScore * 100))}%` }}
                                        title={`Rosario Municipal Score: ${meanScore.toFixed(2)}`}
                                    />
                                </div>

                                {/* Step Labels */}
                                <div className="flex justify-between text-[8.5px] font-mono font-bold px-0.5">
                                    <span className="text-[#440154]">&lt; 0.20</span>
                                    <span className="text-[#3b528b]">0.30</span>
                                    <span className="text-[#21918c]">0.50</span>
                                    <span className="text-[#5ec962]">0.65</span>
                                    <span className="text-[#a16207] font-black">&ge; 0.75</span>
                                </div>

                                <div className="flex justify-between text-[7.5px] uppercase tracking-wider text-slate-400 font-bold px-0.5">
                                    <span>Specialized Ag</span>
                                    <span>Balanced</span>
                                    <span className="text-slate-700 font-bold">Urban Mix</span>
                                </div>

                                {/* Interactive Swatches (Click to Filter on Map!) */}
                                <div className="pt-1.5 border-t border-slate-100 space-y-1">
                                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                        <span>Click Swatch to Filter</span>
                                        {diversityTierFilter !== "all" && (
                                            <button
                                                type="button"
                                                onClick={() => onSelectDiversityTier("all")}
                                                className="text-[9px] font-bold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                                            >
                                                Show All
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-1">
                                        {diversityTiers.map((tier) => {
                                            const isSelected = diversityTierFilter === tier.id;
                                            return (
                                                <button
                                                    key={tier.id}
                                                    type="button"
                                                    onClick={() => handleTierClick(tier.id)}
                                                    className={`w-full flex items-center justify-between px-2 py-1 rounded-lg text-left transition-all cursor-pointer ${
                                                        isSelected 
                                                            ? 'bg-slate-900 text-white font-bold shadow-xs ring-1 ring-slate-900' 
                                                            : 'hover:bg-slate-100 text-slate-700'
                                                    }`}
                                                    title={`Filter map to ${tier.label}`}
                                                >
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <span 
                                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs ring-1 ring-black/10" 
                                                            style={{ backgroundColor: tier.fill }} 
                                                        />
                                                        <span className="text-[10px] truncate">
                                                            {tier.label}
                                                        </span>
                                                    </div>
                                                    <span className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full ${
                                                        isSelected
                                                            ? 'bg-white/20 text-white font-bold'
                                                            : 'bg-slate-100 text-slate-500 font-semibold'
                                                    }`}>
                                                        {tier.count === null ? "—" : `${tier.count} bgys`}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-600">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-3.5 h-0.5 border-t-2 border-slate-600 border-dashed inline-block" />
                                        <span>Brgy Boundary</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-blue-500/10 border-2 border-blue-900 inline-block" />
                                        <span>Selected Brgy</span>
                                    </div>
                                </div>

                                <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-500">
                                    <span>Base Map:</span>
                                    <span className="font-semibold text-slate-700">Official CLUP 2030</span>
                                </div>
                            </div>
                        )}

                        {/* 4. CLUP Zoning Layer (Master Grid Swatches) */}
                        {activeLayer === 'zoning' && (
                            <div className="space-y-1.5">
                                <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[10px]">
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#22c55e] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Residential (R1-2)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#f59e0b] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Commercial (C1-2)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#ef4444] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Industrial (I1-3)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#8b5cf6] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Agro-Ind (AgIndZ)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#84cc16] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Agricultural (PDA)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#3b82f6] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Institutions (GI-Z)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#15803d] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Forest / Parks (FZ)</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <span className="w-2.5 h-2.5 rounded bg-[#64748b] shrink-0 shadow-xs" />
                                        <span className="text-slate-700 truncate font-medium">Roads & Utility</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
