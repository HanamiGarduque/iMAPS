import StatBar from '../StatBar';

export default function DiversityPanel({ donutLoaded }) {
    return (
        <div className="flex flex-col gap-3.5 p-3.5">
            {/* 1. Land Use & Economic Mix Balance Card */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 block">
                            Land Use & Economic Mix
                        </span>
                        <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-2xl font-black text-slate-900 font-mono tracking-tight leading-none">
                                0.78
                            </span>
                            <span className="text-[9px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                                High Balance
                            </span>
                        </div>
                    </div>

                    <div className="text-right bg-purple-50/80 border border-purple-100 px-2.5 py-1.5 rounded-xl">
                        <span className="text-[8px] font-bold uppercase tracking-wider text-purple-600 block">
                            Zoning Mix
                        </span>
                        <span className="text-xs font-black text-purple-700 font-mono leading-none block mt-0.5">
                            Multi-Sector
                        </span>
                    </div>
                </div>

                {/* Qualitative Scale Indicator */}
                <div className="mt-3">
                    <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold uppercase mb-1">
                        <span>Single-Use (0.0)</span>
                        <span>Balanced (0.5)</span>
                        <span className="text-purple-600 font-bold">Well-Mixed (1.0)</span>
                    </div>
                    <div className="h-2 w-full bg-gradient-to-r from-slate-100 via-purple-200 to-purple-500 rounded-full relative">
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-white border-2 border-purple-600 rounded-full shadow"
                            style={{ left: '78%', transform: 'translate(-50%, -50%)' }}
                        />
                    </div>
                </div>
            </div>

            {/* 2. Dominant Economic Driver */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 p-4 text-white shadow-md ring-1 ring-white/15">
                <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-purple-500/10 rounded-full blur-xl pointer-events-none" />
                <div className="flex items-center justify-between">
                    <div>
                        <span className="text-[9px] font-bold uppercase tracking-widest text-indigo-300 block">
                            Primary Economic Sector
                        </span>
                        <p className="text-base font-black tracking-tight text-white mt-0.5">
                            Agro-Industrial
                        </p>
                        <p className="text-[10px] text-slate-300 mt-0.5">
                            65% of municipal economic & commercial activity
                        </p>
                    </div>
                    <div className="w-10 h-10 bg-white/10 backdrop-blur-sm rounded-xl flex items-center justify-center border border-white/20 shadow-inner shrink-0">
                        <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* 3. Composite Mix Composition with SVG Donut */}
            <div className="bg-white rounded-2xl border border-slate-200/80 p-3.5 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-blue-600" />
                        <h4 className="text-xs font-bold text-slate-800">
                            Sector Distribution
                        </h4>
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">
                        3 Main Sectors
                    </span>
                </div>

                <div className="flex items-center gap-3.5">
                    <div className="relative w-20 h-20 shrink-0 drop-shadow-sm">
                        <svg viewBox="0 0 88 88" className="w-full h-full -rotate-90">
                            <circle cx="44" cy="44" r="34" fill="none" stroke="#f1f5f9" strokeWidth="11" />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#8b5cf6" strokeWidth="11"
                                strokeDasharray={donutLoaded ? `${(65 / 100) * 213.6} ${213.6 - (65 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset="0"
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1)' }}
                            />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#22c55e" strokeWidth="11"
                                strokeDasharray={donutLoaded ? `${(25 / 100) * 213.6} ${213.6 - (25 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset={-((65 / 100) * 213.6)}
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.15s' }}
                            />
                            <circle
                                cx="44" cy="44" r="34" fill="none" stroke="#f59e0b" strokeWidth="11"
                                strokeDasharray={donutLoaded ? `${(10 / 100) * 213.6} ${213.6 - (10 / 100) * 213.6}` : "0 213.6"}
                                strokeDashoffset={-((90 / 100) * 213.6)}
                                style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.34,1.56,0.64,1) 0.3s' }}
                            />
                        </svg>
                        <div className="absolute inset-0 flex items-center justify-center flex-col">
                            <span className="text-[7px] font-bold uppercase tracking-wider text-slate-400">Mix Score</span>
                            <span className="text-xs font-black font-mono text-slate-800">0.78</span>
                        </div>
                    </div>
                    <div className="flex-1 space-y-2">
                        <StatBar label="Agro-Industrial" pct={65} color="#8b5cf6" bg="#f3e8ff" />
                        <StatBar label="Residential" pct={25} color="#22c55e" bg="#dcfce7" />
                        <StatBar label="Commercial" pct={10} color="#f59e0b" bg="#fef3c7" />
                    </div>
                </div>
            </div>
        </div>
    );
}
