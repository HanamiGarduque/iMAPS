import StatBar from '../StatBar'

export default function DiversityPanel({ donutLoaded }) {
    return (
        <div>
            <div className="p-4 panel-section border-t-0 mt-0">
                <div className="grid grid-cols-2 gap-3">
                    <div className="metric-card bg-slate-50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Diversity Score</p>
                        <div className="flex items-end gap-2 mt-2">
                            <p className="text-3xl font-bold text-slate-800 font-mono leading-none">0.78</p>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-full px-2 py-0.5 mb-1">High Mix</span>
                        </div>
                    </div>
                    <div className="metric-card bg-slate-50">
                        <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Clustering</p>
                        <div className="flex items-end gap-2 mt-2">
                            <p className="text-3xl font-bold text-slate-800 font-mono leading-none">0.42</p>
                            <span className="text-[9px] font-bold text-violet-700 bg-violet-100 border border-violet-200 rounded-full px-2 py-0.5 mb-1">Clustered</span>
                        </div>
                    </div>
                </div>

                <div className="mt-4 bg-gradient-to-br from-indigo-50 to-white rounded-xl p-4 border border-indigo-100 flex items-center justify-between shadow-sm">
                    <div>
                        <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Dominant Sector</p>
                        <p className="text-base font-bold text-slate-800 mt-1">Agro-industrial</p>
                        <p className="text-[11px] text-slate-500 mt-0.5 font-medium">Controls 65% of regional mix</p>
                    </div>
                    <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center border-2 border-white shadow-sm shrink-0">
                        <svg className="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                </div>
            </div>

            <div className="panel-section">
                <p className="rs-section-head">Composite Mix Analysis</p>
                <div className="px-4 pb-4 flex items-center gap-5">
                    <div className="relative w-[96px] h-[96px] shrink-0 drop-shadow-sm">
                        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                            <circle cx="44" cy="44" r="34" fill="none" stroke="#f1f5f9" strokeWidth="14" />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#8b5cf6" strokeWidth="14"
                                strokeDasharray={donutLoaded ? `${(65 / 100) * 213.6} ${213.6 - (65 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset="0"
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1)' }}
                            />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#22c55e" strokeWidth="14"
                                strokeDasharray={donutLoaded ? `${(25 / 100) * 213.6} ${213.6 - (25 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset={-((65 / 100) * 213.6)}
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.15s' }}
                            />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#f59e0b" strokeWidth="14"
                                strokeDasharray={donutLoaded ? `${(10 / 100) * 213.6} ${213.6 - (10 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset={-((90 / 100) * 213.6)}
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.3s' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-500 text-center leading-tight">Index<br />Ratio</span>
                        </div>
                    </div>
                    <div className="flex-1 space-y-3">
                        <StatBar label="Agro-ind." pct={65} color="#8b5cf6" bg="#f3e8ff" />
                        <StatBar label="Residential" pct={25} color="#22c55e" bg="#dcfce7" />
                        <StatBar label="Commercial" pct={10} color="#f59e0b" bg="#fef3c7" />
                    </div>
                </div>
            </div>
        </div>
    )
}
