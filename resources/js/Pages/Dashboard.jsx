import { useState, useEffect, useRef } from 'react'
import { Head, router } from '@inertiajs/react'

// ── Stat Bar Component ──
function StatBar({ label, pct, color, bg, count }) {
    const [width, setWidth] = useState(0)
    useEffect(() => {
        const t = setTimeout(() => setWidth(pct), 300)
        return () => clearTimeout(t)
    }, [pct])
    return (
        <div className="mb-2.5">
            <div className="flex justify-between items-center">
                <span className="text-[11px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ background: color }} />
                    {label}
                </span>
                <div className="flex items-center gap-2">
                    {count !== undefined && <span className="text-[10px] font-mono text-slate-500">{count}</span>}
                    <span className="text-[10px] font-bold font-mono" style={{ color }}>{pct}%</span>
                </div>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden mt-1" style={{ background: bg || '#e8f0fe' }}>
                <div
                    className="h-full rounded-full"
                    style={{
                        width: width + '%',
                        background: color,
                        transition: 'width 1s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                />
            </div>
        </div>
    )
}

// ── Status Panel ──
function StatusPanel({ total, thisMonth, statusMap }) {
    const review   = statusMap['Technical Review'] ?? 0
    const released = statusMap['Released'] ?? 0
    const pending  = statusMap['Received'] ?? 0

    const safeTotal = total || 1
    const processingPct = Math.round(((safeTotal - review - released) / safeTotal) * 100)
    const reviewPct     = Math.round((review / safeTotal) * 100)
    const releasedPct   = Math.round((released / safeTotal) * 100)

    return (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5">
            <div className="mb-5 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-800 leading-tight">Map Overview</h1>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Zoning Applications Summary</p>
                </div>
                <div className="h-10 w-10 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 shadow-sm border border-blue-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                {[
                    { label: 'Total',      value: total,     cls: 'bg-white border-slate-100',         textCls: 'text-slate-800' },
                    { label: 'This Month', value: thisMonth, cls: 'bg-blue-50/70 border-blue-100',     textCls: 'text-blue-700' },
                    { label: 'Review',     value: review,    cls: 'bg-amber-50/70 border-amber-100',   textCls: 'text-amber-600' },
                    { label: 'Released',   value: released,  cls: 'bg-emerald-50/70 border-emerald-100', textCls: 'text-emerald-600' },
                ].map(({ label, value, cls, textCls }) => (
                    <div key={label} className={`border rounded-xl p-3 shadow-sm ${cls}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${textCls}`}>{label}</p>
                        <p className={`text-2xl font-bold font-mono ${textCls}`}>{value}</p>
                    </div>
                ))}
            </div>

            <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Status Distribution</p>
                <StatBar label="Processing"   pct={processingPct} color="#3366f8" />
                <StatBar label="Under Review" pct={reviewPct}     color="#f59e0b" />
                <StatBar label="Released"     pct={releasedPct}   color="#10b981" />
            </div>
        </div>
    )
}

// ── Trends Panel ──
function TrendsPanel() {
    const landUse = [
        { label: 'Residential',      count: 82, pct: 40, color: '#3366f8', bg: '#eef4ff' },
        { label: 'Agricultural',     count: 44, pct: 22, color: '#10b981', bg: '#ecfdf5' },
        { label: 'Commercial',       count: 34, pct: 17, color: '#f59e0b', bg: '#fffbeb' },
        { label: 'Industrial',       count: 22, pct: 11, color: '#ef4444', bg: '#fef2f2' },
        { label: 'Agro-industrial',  count: 14, pct: 7,  color: '#8b5cf6', bg: '#f5f3ff' },
        { label: 'Special projects', count: 7,  pct: 3,  color: '#64748b', bg: '#f8fafc' },
    ]
    const hotspots = [
        { rank: 1, name: 'Barangay 1',   type: 'Residential',  color: '#3366f8', bg: '#eef4ff', count: 31 },
        { rank: 2, name: 'Calantas',     type: 'Agricultural', color: '#10b981', bg: '#ecfdf5', count: 27 },
        { rank: 3, name: 'Barangay 5',   type: 'Commercial',   color: '#f59e0b', bg: '#fffbeb', count: 23 },
        { rank: 4, name: 'Barangay 12',  type: 'Industrial',   color: '#ef4444', bg: '#fef2f2', count: 18 },
        { rank: 5, name: 'Brgy. Mabini', type: 'Residential',  color: '#3366f8', bg: '#eef4ff', count: 16 },
    ]
    const [year, setYear] = useState(2026)

    return (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-800 leading-tight">Time Trends</h1>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Application volume over time</p>
                </div>
                <div className="h-10 w-10 bg-violet-50 rounded-full flex items-center justify-center text-violet-600 shadow-sm border border-violet-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                    </svg>
                </div>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
                <div className="bg-slate-50 rounded-xl p-2.5 text-center border border-slate-100">
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Total</p>
                    <p className="text-xl font-bold text-slate-800 font-mono mt-0.5">203</p>
                </div>
                <div className="bg-violet-50 rounded-xl p-2.5 text-center border border-violet-100">
                    <p className="text-[9px] font-bold text-violet-600 uppercase tracking-wider">Dominant</p>
                    <p className="text-[11px] font-bold text-violet-800 mt-0.5 leading-tight">Residential</p>
                </div>
                <div className="bg-blue-50 rounded-xl p-2.5 text-center border border-blue-100">
                    <p className="text-[9px] font-bold text-blue-600 uppercase tracking-wider">Avg/Bgy</p>
                    <p className="text-xl font-bold text-blue-700 font-mono mt-0.5">4.2</p>
                </div>
            </div>

            {/* Year Slider */}
            <div className="border-t border-slate-100 pt-4 mb-4">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Year Filter</p>
                    <span className="text-[11px] font-bold text-blue-700 font-mono bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                        2020 – {year === 2026 ? '2026' : year}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-400 font-mono">2020</span>
                    <input type="range" min="2020" max="2026" value={year}
                        onChange={e => setYear(Number(e.target.value))}
                        className="flex-1 accent-blue-600 h-1 cursor-pointer" />
                    <span className="text-[10px] text-slate-400 font-mono">2026</span>
                </div>
            </div>

            <div className="mb-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Land Use Classification</p>
                {landUse.map(row => (
                    <StatBar key={row.label} label={row.label} pct={row.pct} color={row.color} bg={row.bg} count={row.count} />
                ))}
            </div>

            <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Top 5 Hotspot Barangays</p>
                {hotspots.map(h => (
                    <div key={h.rank} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
                        <span className="text-[11px] font-bold text-slate-400 font-mono w-4">{h.rank}</span>
                        <span className="text-[12px] font-semibold text-slate-700 flex-1 truncate">{h.name}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{ color: h.color, background: h.bg }}>{h.type}</span>
                        <span className="text-[12px] font-bold text-slate-700 font-mono">{h.count}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}

// ── Diversity Panel ──
function DiversityPanel() {
    const clusters = [
        { name: 'Calantas',   pct: 88, color: '#8b5cf6' },
        { name: 'Barangay 1', pct: 72, color: '#3366f8' },
        { name: 'Barangay 5', pct: 61, color: '#10b981' },
    ]
    return (
        <div className="bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/50 p-5">
            <div className="mb-4 flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-bold text-slate-800 leading-tight">Diversity Index</h1>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">Land use mix analysis</p>
                </div>
                <div className="h-10 w-10 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-600 shadow-sm border border-emerald-100">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                    </svg>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Diversity Score</p>
                    <div className="flex items-end gap-2">
                        <p className="text-2xl font-bold text-slate-800 font-mono">0.78</p>
                        <span className="text-[10px] font-bold text-red-500 bg-red-50 border border-red-100 rounded-full px-2 py-0.5 mb-0.5">High spec.</span>
                    </div>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Clustering</p>
                    <div className="flex items-end gap-2">
                        <p className="text-2xl font-bold text-slate-800 font-mono">0.78</p>
                        <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-100 rounded-full px-2 py-0.5 mb-0.5">Clustered</span>
                    </div>
                </div>
            </div>

            <div className="border-t border-slate-100 pt-4">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Cluster Comparison</p>
                {clusters.map(c => (
                    <StatBar key={c.name} label={c.name} pct={c.pct} color={c.color} />
                ))}
            </div>
        </div>
    )
}

// ── Leaflet Map ──
function LeafletMap({ bgyStats }) {
    const mapRef = useRef(null)
    const mapInstanceRef = useRef(null)

    useEffect(() => {
        if (mapInstanceRef.current) return

        // Dynamically import Leaflet (avoids SSR issues)
        import('leaflet').then(L => {
            import('leaflet/dist/leaflet.css')

            const map = L.default.map(mapRef.current, {
                center: [13.8352, 121.2167],
                zoom: 13,
                zoomControl: false,
                scrollWheelZoom: true,
            })

            L.default.control.zoom({ position: 'bottomright' }).addTo(map)
            L.default.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map)

            mapInstanceRef.current = map
        })

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove()
                mapInstanceRef.current = null
            }
        }
    }, [])

    return <div ref={mapRef} className="absolute inset-0 z-0" />
}

// ── Main Dashboard ──
export default function Dashboard({ userName, userRole, total, thisMonth, statusMap, bgyStats }) {
    const [activeLayer, setActiveLayer] = useState('status')
    const [layerPopupOpen, setLayerPopupOpen] = useState(false)
    const [clock, setClock] = useState('')

    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setClock(
                now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
                ' · ' +
                now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
            )
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    const layers = [
        { key: 'status',    label: 'Application Status' },
        { key: 'trends',    label: 'Time Trends' },
        { key: 'diversity', label: 'Diversity Index' },
    ]

    return (
        <>
            <Head title="Dashboard | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                body { font-family: 'Poppins', sans-serif; }
                ::-webkit-scrollbar { width: 6px; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
            `}</style>

            <div className="bg-slate-50 h-screen flex flex-col overflow-hidden">

                {/* ── Header ── */}
                <header className="h-16 bg-white/80 backdrop-blur-xl border-b border-slate-200/80 shadow-sm flex items-center justify-between px-4 sm:px-6 shrink-0 z-20 sticky top-0">
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2.5 group">
                            <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl flex items-center justify-center shadow-md">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                </svg>
                            </div>
                            <span className="font-black text-xl tracking-tight text-slate-800">iMAPS</span>
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden md:block" />
                        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3 py-1">
                            <span className="flex h-2 w-2 relative">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
                            </span>
                            <span className="text-xs font-semibold text-slate-600 tracking-wide uppercase">Rosario, Batangas</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-[13px] font-mono font-medium text-slate-600 hidden sm:block">{clock}</span>
                        <div className="h-6 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-3 px-2 py-1 rounded-xl hover:bg-white hover:shadow-sm border border-transparent hover:border-slate-200 transition-all cursor-pointer">
                            <div className="relative">
                                <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-sm shadow-sm">
                                    {userName?.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-white rounded-full" />
                            </div>
                            <div className="hidden sm:flex flex-col">
                                <p className="text-[13px] font-bold text-slate-700 leading-tight">{userName}</p>
                                <p className="text-[11px] text-slate-500 font-medium leading-tight mt-0.5">{userRole}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 overflow-hidden relative">

                    {/* ── Sidebar ── */}
                    <aside className="absolute top-10 left-0 w-[210px] bg-white z-[1000] rounded-r-3xl shadow-xl flex flex-col py-5">
                        <div className="px-5 pb-4 pt-1 border-b border-slate-100 flex flex-col items-center">
                            <h1 className="text-3xl font-black text-blue-900 tracking-tighter leading-none">iMAPS</h1>
                            <span className="text-[10px] font-bold text-blue-700 tracking-[0.2em] uppercase mt-1">Rosario</span>
                        </div>
                        <nav className="flex-1 flex flex-col gap-1 py-4">
                            {[
                                { href: '/dashboard',    label: 'Dashboard',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6', active: true },
                                { href: '/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                                { href: '/analytics',    label: 'Analytics',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                            ].map(item => (
                                <a key={item.href} href={item.href}
                                    className={`flex items-center gap-3 px-5 py-2.5 font-medium text-sm rounded-r-xl mr-4 transition-all ${item.active ? 'bg-blue-800 text-white font-semibold shadow-sm' : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'}`}>
                                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                    </svg>
                                    <span>{item.label}</span>
                                </a>
                            ))}
                        </nav>
                        <div className="border-t border-slate-100 py-3 mt-2">
                            <a href="/logout"
                                className="flex items-center gap-3 px-5 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-700 font-medium text-sm transition-all rounded-r-xl mr-4">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                                </svg>
                                <span>Sign Out</span>
                            </a>
                        </div>
                    </aside>

                    {/* ── Map ── */}
                    <main className="flex-1 relative flex flex-col min-w-0 bg-slate-200">
                        <LeafletMap bgyStats={bgyStats} />

                        {/* ── Right Stats Panel ── */}
                        <div className="absolute top-6 right-6 z-[500] w-[340px] max-h-[calc(100vh-6rem)] overflow-y-auto">
                            {activeLayer === 'status'    && <StatusPanel total={total} thisMonth={thisMonth} statusMap={statusMap} />}
                            {activeLayer === 'trends'    && <TrendsPanel />}
                            {activeLayer === 'diversity' && <DiversityPanel />}
                        </div>

                        {/* ── Layer Toggle ── */}
                        <div className="absolute bottom-8 left-6 z-[500] flex flex-col items-start gap-3">
                            {layerPopupOpen && (
                                <div className="bg-white rounded-xl shadow-xl border border-slate-200 w-[200px] overflow-hidden">
                                    <div className="bg-blue-800 py-3 px-4 text-center">
                                        <span className="text-[13px] font-semibold text-white tracking-wide">View Layer</span>
                                    </div>
                                    <div className="p-2 space-y-0.5">
                                        {layers.map(l => (
                                            <button key={l.key}
                                                onClick={() => { setActiveLayer(l.key); setLayerPopupOpen(false) }}
                                                className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-left transition-all ${activeLayer === l.key ? 'bg-slate-50' : 'hover:bg-slate-50'}`}>
                                                <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all ${activeLayer === l.key ? 'border-blue-500' : 'border-slate-300'}`}>
                                                    {activeLayer === l.key && <div className="w-2 h-2 bg-blue-500 rounded-full" />}
                                                </div>
                                                <span className="text-[12px] font-medium text-slate-700">{l.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <button onClick={() => setLayerPopupOpen(p => !p)}
                                className="w-12 h-12 bg-blue-800 hover:bg-blue-900 text-white rounded-lg shadow-lg flex items-center justify-center transition-all focus:outline-none">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10M10 18h4" />
                                </svg>
                            </button>
                        </div>
                    </main>
                </div>
            </div>
        </>
    )
}