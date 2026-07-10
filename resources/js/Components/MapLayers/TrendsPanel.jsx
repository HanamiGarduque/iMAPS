import StatBar from '../StatBar'

export default function TrendsPanel({ landUseData, hotspots }) {
    return (
        <div>
            <div className="p-4 panel-section border-t-0 mt-0">
                <div className="grid grid-cols-3 gap-2">
                    <div className="metric-card bg-slate-50 border-slate-200 text-center px-2 py-3">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wide">Total Zones</p>
                        <p className="text-lg font-bold text-slate-800 font-mono mt-1">203</p>
                    </div>
                    <div className="metric-card bg-violet-50 border-violet-200 text-center px-2 py-3">
                        <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wide">Dominant</p>
                        <p className="text-[11px] font-bold text-violet-800 mt-2 leading-tight">Residential</p>
                    </div>
                    <div className="metric-card bg-blue-50 border-blue-200 text-center px-2 py-3">
                        <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wide">Avg/Bgy</p>
                        <p className="text-lg font-bold text-blue-700 font-mono mt-1">4.2</p>
                    </div>
                </div>
            </div>

            <div className="panel-section">
                <p className="rs-section-head">Zoning Distribution</p>
                <div className="px-4 pb-4">
                    {landUseData.map(([label, count, pct, color, bg]) => (
                        <StatBar key={label} label={label} count={count} pct={pct} color={color} bg={bg} />
                    ))}
                </div>
            </div>

            <div className="panel-section pb-4">
                <p className="rs-section-head">Development Hotspots</p>
                <div className="px-4 space-y-2">
                    {hotspots.map((h) => (
                        <div key={h.rank} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-colors">
                            <span className="text-[11px] font-bold text-slate-400 font-mono w-4 shrink-0 text-center bg-slate-100 rounded py-0.5">{h.rank}</span>
                            <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{h.name}</span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: h.color, background: h.bg }}>
                                {h.type}
                            </span>
                            <span className="text-[12px] font-bold text-slate-700 font-mono shrink-0 w-6 text-right">{h.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
