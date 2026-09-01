import StatBar from '../StatBar';

// 1. Comprehensive Zoning Code to Classification & Color Map
const ZONE_MAP = {
    "FR-SZ": { label: "Forest Reserve Sub-Zone", fill: "#5bb93c", bg: "#dcfce7" },
    "THSP-SZ": { label: "Tombol Hill Special Protection Sub-Zone", fill: "#5bb93c", bg: "#dcfce7" },
    "FZ": { label: "Forest Zone", fill: "#5bb93c", bg: "#dcfce7" },
    "PTA-SZ-RA": { label: "Protection Agricultural Sub-Zone Rice Area", fill: "#94d180", bg: "#ecfccb" },
    "PDA-SZ": { label: "Production Agricultural Sub-Zone", fill: "#94d180", bg: "#ecfccb" },
    "WZ": { label: "Water Zone", fill: "#2dcacd", bg: "#cffafe" },
    "R1-Z": { label: "Residential-1 Zone", fill: "#fffc2b", bg: "#fefce8" },
    "R2-Z": { label: "Residential-2 Zone", fill: "#fffc2b", bg: "#fefce8" },
    "BR2-SZ": { label: "Basic R-2 Sub-Zone", fill: "#ffc92b", bg: "#fef9c3" },
    "MR2-SZ": { label: "Maximum R-2 Sub-Zone", fill: "#ffc92b", bg: "#fef9c3" },
    "C1-Z": { label: "Commercial-1 Zone", fill: "#eb3356", bg: "#ffe4e6" },
    "C2-Z": { label: "Commercial-2 Zone", fill: "#eb3356", bg: "#ffe4e6" },
    "AgIndZ-PGR": { label: "Agri-Industrial Zone Piggery", fill: "#ff7cae", bg: "#fce7f3" },
    "AgIndZ-PTR": { label: "Agri-Industrial Zone Poultry", fill: "#ff7cae", bg: "#fce7f3" },
    "AgIndZ": { label: "Agri-Industrial Zone", fill: "#ff7cae", bg: "#fce7f3" },
    "I1-Z": { label: "Industrial-1 Zone", fill: "#de29c0", bg: "#fce7f3" },
    "I2-Z": { label: "Industrial-2 Zone", fill: "#de29c0", bg: "#fce7f3" },
    "I3-Z": { label: "Industrial-3 Zone", fill: "#de29c0", bg: "#fce7f3" },
    "GI-Z": { label: "General Institutional Zone", fill: "#6146db", bg: "#e0e7ff" },
    "T-Z": { label: "Tourism Zone", fill: "#ffa97a", bg: "#ffedd5" },
    "ECT-Z": { label: "Eco-Tourism Zone", fill: "#ffa97a", bg: "#ffedd5" },
    "PR-Z": { label: "Parks and Recreation Zone", fill: "#36ff39", bg: "#dcfce7" },
    "C/MP-Z": { label: "Cemetery/ Memorial Park Zone", fill: "#36ff39", bg: "#dcfce7" },
    "5491-APDA-SZ": { label: "Buffer/Greenbelt Zone", fill: "#61631f", bg: "#fefce8" },
    "UTS-Z": { label: "Utility, Transportation, and Services Zone", fill: "#969696", bg: "#f1f5f9" },
    "CMRF": { label: "Central Materials Recovery Facility", fill: "#969696", bg: "#f1f5f9" },
    "ROAD": { label: "Road", fill: "#969696", bg: "#f1f5f9" },
    "PROPOSED ROAD": { label: "Proposed Road", fill: "#969696", bg: "#f1f5f9" },
};

// Helper resolver for DB codenames to full classifications
const getZoneInfo = (code) => {
    if (!code) return { label: "N/A", code: "", fill: "#94a3b8", bg: "#f1f5f9" };
    if (ZONE_MAP[code]) return { ...ZONE_MAP[code], code };
    return { label: code, code, fill: "#94a3b8", bg: "#f1f5f9" };
};

export default function DiversityPanel({ donutLoaded, overallDiversity, selectedBgy, onClose }) {
    const isBgy = Boolean(selectedBgy);
    
    const score = isBgy ? (selectedBgy.data.diversity || 0) : (overallDiversity?.score || 0);
    
    // Distribution metrics
    const rawDistribution = isBgy ? (selectedBgy.data.distribution || []) : (overallDiversity?.distribution || []);
    const topDistribution = rawDistribution.slice(0, 4);

    // FIX: Derive Primary & Secondary directly from rawDistribution[0] & [1] to eliminate backend field mismatch
    const rawPrimaryCode = rawDistribution[0]?.name || "N/A";
    const primaryZone = getZoneInfo(rawPrimaryCode);

    const rawSecondaryCode = rawDistribution[1]?.name || "N/A";
    const secondaryZone = getZoneInfo(rawSecondaryCode);

    // Derived Percentage Metrics
    const primaryPct = rawDistribution[0]?.value ?? 0;
    const secondaryPct = rawDistribution[1]?.value ?? 0;
    const sectorCount = rawDistribution.length;
    const nonPrimaryPct = (100 - primaryPct).toFixed(1);

    const getPlanningInsight = (s) => {
        if (s >= 0.7) return "High spatial heterogeneity: Well-distributed zone allocation reduces single-sector dependence and supports multi-functional land development.";
        if (s >= 0.4) return "Moderate diversification: A dominant land-use classification exists alongside expanding secondary zones.";
        return "Single-zone concentration: High vulnerability to sector-specific changes. Mixed-use zoning strategies recommended.";
    };

    const circumference = 213.6;
    let currentOffset = 0;

    return (
        <div className="flex flex-col gap-3.5 p-3.5 bg-slate-50/50 rounded-3xl max-w-sm">
            {/* Header */}
            <div className="bg-gradient-to-r from-purple-950 via-indigo-950 to-slate-900 p-4 rounded-2xl text-white shadow-md relative overflow-hidden">
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-[9px] font-bold tracking-widest text-purple-300 uppercase block">
                            Diversity Index
                        </span>
                        <h3 className="text-base font-black tracking-tight text-white mt-0.5">
                            Land Use & Economic Mix
                        </h3>
                    </div>
                    <div className="flex items-center gap-1.5">
                        {onClose && (
                            <button 
                                onClick={onClose}
                                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors text-white/80"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-[10px] text-slate-300 mt-1 leading-snug">
                    Balance of commercial, residential & industrial activities
                </p>
            </div>

            {/* 1. Primary Dominance vs Non-Primary Mix Cards */}
            <div className="grid grid-cols-2 gap-2">
                <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-sm">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">
                        Primary Dominance
                    </span>
                    <span className="text-lg font-black font-mono text-slate-800 mt-0.5 block">
                        {primaryPct.toFixed(1)}%
                    </span>
                </div>

                <div className="bg-white border border-slate-200/80 rounded-2xl p-3 shadow-sm">
                    <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">
                        Non-Primary Mix
                    </span>
                    <span className="text-lg font-black font-mono text-purple-700 mt-0.5 block">
                        {nonPrimaryPct}%
                    </span>
                </div>
            </div>

            {/* 2. Primary & Secondary Classification Card */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 p-4 text-white shadow-md">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
                
                {/* Primary Zone */}
                <div className="flex items-start justify-between pb-3 border-b border-white/10">
                    <div className="pr-2 min-w-0">
                        <div className="flex items-center gap-1.5">
                            <span className="text-[8px] font-bold uppercase tracking-widest text-indigo-300 block">
                                Primary Classification
                            </span>
                            {primaryZone.code && (
                                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white/10 text-indigo-200">
                                    {primaryZone.code}
                                </span>
                            )}
                        </div>
                        <p className="text-base font-black tracking-tight text-white mt-0.5 leading-tight truncate" title={primaryZone.label}>
                            {primaryZone.label}
                        </p>
                        <p className="text-[10px] text-slate-300 mt-1">
                            {primaryPct.toFixed(1)}% of total geographic land area
                        </p>
                    </div>
                </div>

                {/* Secondary Zone */}
                <div className="flex items-center justify-between pt-2.5">
                    <div className="pr-2 min-w-0">
                        <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400 block">
                            Secondary Classification
                        </span>
                        <p className="text-xs font-bold text-slate-200 mt-0.5 truncate" title={secondaryZone.label}>
                            {secondaryZone.label} {secondaryZone.code && <span className="font-mono text-[10px] text-slate-400">({secondaryZone.code})</span>}
                        </p>
                    </div>
                    <span className="text-xs font-mono font-bold text-indigo-300 shrink-0">
                        {secondaryPct.toFixed(1)}%
                    </span>
                </div>
            </div>

            {/* 3. CLUP Spatial Planning Takeaway Card */}
            <div className="bg-purple-50/80 border border-purple-100 rounded-2xl p-3.5 flex items-start gap-2.5">
                <div className="w-2 h-2 rounded-full bg-purple-600 mt-1 shrink-0" />
                <div>
                    <span className="text-[9px] font-bold uppercase tracking-wider text-purple-900 block">
                        CLUP Spatial Planning Takeaway
                    </span>
                    <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                        {getPlanningInsight(score)}
                    </p>
                </div>
            </div>

            {/* 4. Zoning Breakdown Donut & StatBars */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Zoning Breakdown
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        Top {topDistribution.length} of {sectorCount} Zones
                    </span>
                </div>

                <div className="flex items-center gap-3.5">
                    {/* Donut Chart */}
                    <div className="relative w-20 h-20 shrink-0 drop-shadow-sm">
                        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                            <circle cx="44" cy="44" r="34" fill="none" stroke="#f1f5f9" strokeWidth="11" />
                            {topDistribution.map((item, index) => {
                                const zone = getZoneInfo(item.name);
                                const dashArrayVal = (item.value / 100) * circumference;
                                const remainder = circumference - dashArrayVal;
                                const offset = -currentOffset;
                                currentOffset += dashArrayVal;

                                return (
                                    <circle
                                        key={item.name}
                                        cx="44" cy="44" r="34" fill="none" stroke={zone.fill} strokeWidth="11"
                                        strokeDasharray={donutLoaded ? `${dashArrayVal} ${remainder}` : `0 ${circumference}`}
                                        strokeDashoffset={offset}
                                        style={{ transition: `stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) ${index * 0.15}s` }}
                                    />
                                );
                            })}
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400">MIX</span>
                            <span className="text-xs font-black font-mono text-slate-800">{score.toFixed(2)}</span>
                        </div>
                    </div>

                    {/* Breakdown List */}
                    <div className="flex-1 space-y-2 min-w-0">
                        {topDistribution.length > 0 ? topDistribution.map((item) => {
                            const zone = getZoneInfo(item.name);
                            return (
                                <StatBar 
                                    key={item.name}
                                    label={`${zone.label} (${item.name})`} 
                                    pct={item.value} 
                                    color={zone.fill} 
                                    bg={zone.bg} 
                                />
                            );
                        }) : (
                            <span className="text-xs text-slate-400 font-medium">No zoning data available.</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}