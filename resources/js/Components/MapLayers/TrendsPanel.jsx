import StatBar from '../StatBar';

export default function TrendsPanel({ landUseData = [], hotspots = [], onSelectBgy }) {
    return (
        <div className="flex flex-col gap-3.5 p-3.5">
            {/* 1. Consolidated Spatial Projection Summary */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                            Zoning Overview
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight leading-none">
                                203
                            </span>
                            <span className="text-[10px] font-semibold text-slate-500">
                                mapped zones & parcels
                            </span>
                        </div>
                    </div>

                    <div className="text-right bg-emerald-50/80 border border-emerald-100 px-2.5 py-1.5 rounded-xl">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-emerald-600 block">
                            Dominant Use
                        </span>
                        <span className="text-xs font-black text-emerald-800 leading-none block mt-0.5">
                            Residential (40%)
                        </span>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-2 mt-3 text-center">
                    <div className="bg-slate-50 border border-slate-100 p-2 rounded-xl">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 block">Density Rate</span>
                        <span className="text-sm font-black font-mono text-slate-800 mt-0.5 block">4.2 / Barangay</span>
                    </div>
                    <div className="bg-blue-50/50 border border-blue-100 p-2 rounded-xl">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-blue-600 block">Growth Phase</span>
                        <span className="text-sm font-black font-mono text-blue-700 mt-0.5 block">Phase 2 (Active)</span>
                    </div>
                </div>
            </div>

            {/* 2. Dynamic Land Use Distribution */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Land Use Breakdown
                        </h4>
                    </div>
                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        Projected Mix
                    </span>
                </div>

                <div className="space-y-2.5">
                    {landUseData.map(([label, count, pct, color, bg]) => (
                        <StatBar key={label} label={label} count={count} pct={pct} color={color} bg={bg} />
                    ))}
                </div>
            </div>

            {/* 3. Growth Hotspots Leaderboard */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-amber-500" />
                        <h4 className="text-xs font-bold text-slate-800">
                            High-Growth Barangays
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        Click to Focus
                    </span>
                </div>

                <div className="space-y-1.5">
                    {hotspots.map((h) => (
                        <div
                            key={h.rank}
                            onClick={() => onSelectBgy && onSelectBgy(h.name)}
                            className="flex items-center gap-2 p-1.5 px-2 rounded-xl hover:bg-blue-50/60 border border-slate-100 hover:border-blue-200 transition-all cursor-pointer group active:scale-98"
                            title={`Click to center map on Brgy. ${h.name}`}
                        >
                            <span className={`text-[9px] font-black font-mono w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${h.rank === 1 ? 'bg-amber-100 text-amber-800' : h.rank === 2 ? 'bg-slate-200 text-slate-700' : h.rank === 3 ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {h.rank}
                            </span>
                            <span className="text-xs font-bold text-slate-800 flex-1 truncate group-hover:text-blue-700">
                                {h.name}
                            </span>
                            <span
                                className="text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap"
                                style={{ color: h.color, background: h.bg }}
                            >
                                {h.type}
                            </span>
                            <span className="text-xs font-black text-slate-800 font-mono shrink-0 w-6 text-right group-hover:text-blue-600">
                                {h.count}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
