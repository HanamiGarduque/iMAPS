// resources/js/Pages/Applications/TechnicalReview.jsx
import React, { useState, useEffect, useRef } from 'react'
import { Head, router } from '@inertiajs/react'
import Header from '@/Components/Header'
import Sidebar from '@/Components/Sidebar'

const APP_TYPES = ['Locational Clearance', 'Zoning Certification', 'Development Permit', 'Special Land Use Permit']
const REVIEW_DECISIONS = ['Approved', 'Needs Site Inspection', 'Declined']

// ── Status Badge ──
function StatusBadge({ status }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider bg-[#fffbeb] text-[#d97706] border border-[#d97706]/30">
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-[#d97706]" />
            {status}
        </span>
    )
}

// ── Top Half Map Component (Plots multiple points) ──
function TechReviewMap({ applications }) {
    const mapRef = useRef(null)
    const mapInst = useRef(null)
    const markersRef = useRef([])

    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link')
            link.id = 'leaflet-css'
            link.rel = 'stylesheet'
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
            document.head.appendChild(link)
        }

        import('leaflet').then(({ default: L }) => {
            if (!mapInst.current) {
                mapInst.current = L.map(mapRef.current, {
                    zoomControl: true,
                    scrollWheelZoom: true,
                }).setView([13.845, 121.206], 13) // Rosario approx center

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19,
                }).addTo(mapInst.current)
            }

            const map = mapInst.current

            // Clear existing markers
            markersRef.current.forEach(marker => map.removeLayer(marker))
            markersRef.current = []

            const bounds = L.latLngBounds()
            let hasValidCoords = false

            const pinIcon = L.divIcon({
                className: '',
                html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#d97706;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 10px rgba(217,119,6,.4);"></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
                popupAnchor: [0, -30],
            })

            applications.forEach(app => {
                const lat = parseFloat(app.latitude)
                const lng = parseFloat(app.longitude)

                if (lat && lng && !isNaN(lat) && !isNaN(lng)) {
                    hasValidCoords = true
                    const marker = L.marker([lat, lng], { icon: pinIcon }).addTo(map)
                    
                    marker.bindPopup(`
                        <div style="font-family:'Poppins',sans-serif">
                            <span style="font-size:9px;font-weight:800;color:#d97706;letter-spacing:1px;text-transform:uppercase">${app.reference_number}</span><br>
                            <strong style="font-size:12px;color:#1e293b">${app.applicant_name}</strong><br>
                            <span style="font-size:10px;color:#64748b">Brgy. ${app.barangay}</span>
                        </div>
                    `)
                    
                    bounds.extend([lat, lng])
                    markersRef.current.push(marker)
                }
            })

            if (hasValidCoords) {
                // Add a slight delay to ensure container is fully sized before fitting bounds
                setTimeout(() => {
                    map.invalidateSize()
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 17 })
                }, 100)
            }
        })
    }, [applications])

    return (
        <div className="relative w-full h-full rounded-[14px] overflow-hidden border border-slate-200 z-0 bg-slate-100">
            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
            
            {/* Map Overlay Stats */}
            <div className="absolute top-4 right-4 z-[400] bg-white/90 backdrop-blur border border-slate-200 shadow-sm rounded-xl px-4 py-2 pointer-events-none">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Pending Reviews</p>
                <p className="text-xl font-black text-slate-800 tracking-tight leading-none mt-1">{applications.length}</p>
            </div>
        </div>
    )
}

// ── Technical Review Action Drawer ──
function ReviewDrawer({ app, onClose, onReviewSubmitted }) {
    const [form, setForm] = useState({
        zoning_application_id: app.id,
        decision: '',
        zoning_compliant: false,
        documents_complete: false,
        land_use_compliant: false,
        findings: '',
        decision_reason: '',
    })
    
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const set = (field) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(prev => ({ ...prev, [field]: val }))
    }

    const submitReview = () => {
        if (!form.decision) return showToast('Please select a decision.', 'error')
        if (form.decision === 'Declined' && !form.decision_reason?.trim()) return showToast('Reason is required for declination.', 'error')

        setSaving(true)
        router.post('/applications/submit-technical-review', form, {
            preserveScroll: true,
            onSuccess: () => {
                showToast(`Review submitted: ${form.decision}`)
                onReviewSubmitted?.()
                onClose()
            },
            onError: (errors) => {
                showToast(Object.values(errors)[0] || 'Submission failed.', 'error')
            },
            onFinish: () => setSaving(false),
        })
    }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

    return (
        <>
            <div className="fixed inset-0 z-[800] flex items-center justify-center p-4 form-enter"
                style={{ background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)' }}
                onClick={(e) => e.target === e.currentTarget && onClose()}>

                <div className="bg-white rounded-[20px] shadow-2xl flex flex-col overflow-hidden w-full border border-slate-200"
                    style={{ maxWidth: 700, maxHeight: '90vh' }}>

                    {/* Header Info */}
                    <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                        <div>
                            <span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded tracking-tight mb-2 inline-block">
                                {app.reference_number}
                            </span>
                            <h3 className="text-xl font-black text-slate-800 tracking-tight leading-none">{app.applicant_name}</h3>
                            <p className="text-[12px] font-medium text-slate-500 mt-1">{app.application_type} • Brgy. {app.barangay}</p>
                        </div>
                        <StatusBadge status={app.status} />
                    </div>

                    {/* Body Form */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        
                        {/* Compliance Checklist */}
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Pre-Review Checklist</p>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                {[
                                    { key: 'documents_complete', label: 'Documents Complete' },
                                    { key: 'zoning_compliant', label: 'Zoning Compliant' },
                                    { key: 'land_use_compliant', label: 'Land Use Compliant' },
                                ].map((item) => (
                                    <label key={item.key} className={`flex items-center gap-2.5 p-3 rounded-[10px] border cursor-pointer transition-all ${form[item.key] ? 'border-blue-500 bg-blue-50/30' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                                        <input type="checkbox" checked={form[item.key]} onChange={set(item.key)} className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500" />
                                        <span className={`text-[12px] font-bold ${form[item.key] ? 'text-blue-800' : 'text-slate-600'}`}>{item.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="h-px bg-slate-100 w-full" />

                        {/* Official Decision */}
                        <div className="space-y-4">
                            <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Technical Decision</p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                                    {REVIEW_DECISIONS.map(decision => {
                                        let activeClass = 'border-slate-200 text-slate-600 bg-white hover:bg-slate-50'
                                        if (form.decision === decision) {
                                            if (decision === 'Approved') activeClass = 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-[0_0_0_1px_rgba(16,185,129,1)]'
                                            if (decision === 'Needs Site Inspection') activeClass = 'border-amber-500 bg-amber-50 text-amber-800 shadow-[0_0_0_1px_rgba(245,158,11,1)]'
                                            if (decision === 'Declined') activeClass = 'border-red-500 bg-red-50 text-red-800 shadow-[0_0_0_1px_rgba(239,68,68,1)]'
                                        }

                                        return (
                                            <label key={decision} className={`relative flex items-center justify-center p-3 rounded-[10px] border cursor-pointer transition-all ${activeClass}`}>
                                                <input type="radio" name="decision" value={decision} checked={form.decision === decision} onChange={set('decision')} className="sr-only" />
                                                <span className="text-[12px] font-bold text-center leading-tight">{decision}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>

                            {form.decision === 'Declined' && (
                                <div className="form-enter">
                                    <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">
                                        Reason for Declination <span className="text-red-500 text-[14px] leading-none">*</span>
                                    </label>
                                    <textarea rows={2} value={form.decision_reason} onChange={set('decision_reason')} placeholder="Must provide a clear reason for denial..."
                                        className="w-full rounded-[10px] border border-red-300 bg-red-50/30 px-3 py-2 text-[13px] font-medium text-slate-800 resize-none outline-none focus:border-red-500 focus:ring-[2px] focus:ring-red-500/20 transition-all" />
                                </div>
                            )}

                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">General Findings / Notes</label>
                                <textarea rows={2} value={form.findings} onChange={set('findings')} placeholder="Any additional notes from the evaluation..."
                                    className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 resize-none outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300 transition-all" />
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-slate-50">
                        <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition-all">
                            Cancel
                        </button>
                        <button onClick={submitReview} disabled={saving || !form.decision}
                            className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            {saving ? 'Saving...' : 'Finalize Review'}
                        </button>
                    </div>
                </div>
            </div>

            {toast && (
                <div className={`fixed bottom-6 right-6 z-[900] flex items-center gap-2.5 px-4 py-3 rounded-[12px] text-[12px] font-bold shadow-xl form-enter border ${toast.type === 'success' ? 'bg-slate-900 text-white border-slate-800' : 'bg-red-50 text-red-800 border-red-200'}`}>
                    {toast.type === 'success'
                        ? <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                    }
                    {toast.msg}
                </div>
            )}
        </>
    )
}

// ── Main Page ──
export default function TechnicalReview({ applications, filters, auth }) {
    const [drawerApp, setDrawerApp] = useState(null)
    const [clock, setClock] = useState('')
    const [search, setSearch] = useState(filters?.search || '')
    const [sidebarOpen, setSidebarOpen] = useState(true)

    const userName = auth?.user?.name || 'Julience'
    const userRole = auth?.user?.role || 'Planning Officer'

    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setClock(now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }))
        }
        tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
    }, [])

    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== filters?.search) {
                // Ensure we pass a status to the backend to filter correctly if needed
                router.get('/applications/technical-review', { ...filters, search, page: 1 }, { preserveState: true, replace: true })
            }
        }, 400)
        return () => clearTimeout(t)
    }, [search, filters])

    const applyFilter = (newFilters) => router.get('/applications/technical-review', { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true })
    const clearFilters = () => { setSearch(''); router.get('/applications/technical-review', {}, { preserveState: true, replace: true }) }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const hasFilters = filters?.search || filters?.application_type

    const handleLogout = () => {
        if (confirm('Sign out from iMAPS?')) router.post('/logout')
    }

    // Default data shape handling in case the backend paginator is structured differently
    const appData = applications?.data || []

    return (
        <>
            <Head title="Technical Review | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} />

                <div className="flex flex-1 h-full overflow-hidden relative">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="technical-review" // Assuming you might have a different active state for this page
                    />

                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? '200px' : '0px' }}>
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full gap-4">

                            {/* Header Area */}
                            <div className="flex-shrink-0 flex items-center justify-between form-enter">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        <span className="text-slate-800">Evaluations</span>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                        <span className="text-amber-600">Pending</span>
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Technical Review</h2>
                                </div>
                            </div>

                            {/* UPPER HALF: Map Context */}
                            <div className="h-[35vh] min-h-[250px] w-full flex-shrink-0 form-enter shadow-sm">
                                <TechReviewMap applications={appData} />
                            </div>

                            {/* LOWER HALF: Filters & Table */}
                            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-[0_2px_20px_rgb(0,0,0,0.04)] border border-slate-200/80 overflow-hidden form-enter">
                                
                                {/* Inner Filters */}
                                <div className="p-3.5 border-b border-slate-100 flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between bg-slate-50/50">
                                    <div className="flex items-center gap-3 flex-wrap">
                                        <div className="flex items-center gap-2">
                                            <select value={filters?.application_type || ''} onChange={(e) => applyFilter({ application_type: e.target.value })}
                                                className="text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border border-slate-200 text-slate-600 bg-white hover:border-slate-300 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 cursor-pointer appearance-none pr-8 relative">
                                                <option value="">All App Types</option>
                                                {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                        {hasFilters && (
                                            <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 flex items-center gap-1 ml-1">
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Clear
                                            </button>
                                        )}
                                    </div>

                                    <div className="relative w-full lg:w-[280px]">
                                        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                        <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search applicant, reference..."
                                            className="w-full rounded-[10px] border border-slate-200 bg-white pl-9 pr-3 py-2 text-[12px] font-medium text-slate-800 transition-all focus:outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300 shadow-sm" />
                                    </div>
                                </div>

                                {/* Table */}
                                {appData.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white">
                                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200 mb-4 shadow-sm">
                                            <svg className="w-8 h-8 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 tracking-tight">No Pending Reviews</h3>
                                        <p className="text-[12px] font-medium text-slate-500 mt-1 max-w-sm">
                                            {hasFilters ? "No applications in technical review match your filters." : "All caught up! There are currently no applications waiting for technical review."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse whitespace-nowrap">
                                            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-[0_1px_0_rgb(226,232,240)]">
                                                <tr>
                                                    {['Reference', 'Applicant', 'Type', 'Location', 'Filed', 'Action'].map((h, i) => (
                                                        <th key={i} className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {appData.map(app => (
                                                    <tr key={app.id} className="hover:bg-slate-50/60 transition-colors group">
                                                        <td className="px-5 py-4">
                                                            <span className="font-mono text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded tracking-tight">{app.reference_number}</span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{app.applicant_name}</p>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <p className="text-[12px] font-bold text-slate-700">{app.application_type}</p>
                                                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">{app.land_use_class}</p>
                                                        </td>
                                                        <td className="px-5 py-4 text-[12px] font-medium text-slate-600">Brgy. {app.barangay}</td>
                                                        <td className="px-5 py-4 text-[11px] font-medium text-slate-500">{formatDate(app.created_at)}</td>
                                                        <td className="px-5 py-4">
                                                            <button 
                                                                onClick={() => setDrawerApp(app)}
                                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all text-[11px] font-bold shadow-sm"
                                                            >
                                                                Evaluate
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Pagination */}
                                {applications?.last_page > 1 && (
                                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
                                        <p className="text-[11px] font-medium text-slate-500">
                                            Showing <span className="font-bold text-slate-700">{applications.from}</span> to <span className="font-bold text-slate-700">{applications.to}</span> of <span className="font-bold text-slate-700">{applications.total}</span> records
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            {applications.links.map((link, i) => (
                                                <button key={i} disabled={!link.url} onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                    className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-[8px] text-[11px] font-bold transition-all border
                                                        ${link.active ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : ''}
                                                        ${!link.url ? 'opacity-40 cursor-not-allowed border-slate-200 bg-white text-slate-400' : ''}
                                                        ${link.url && !link.active ? 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100' : ''}
                                                    `}
                                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </main>
                </div>
            </div>

            {/* Drawer */}
            {drawerApp && (
                <ReviewDrawer
                    app={drawerApp}
                    onClose={() => setDrawerApp(null)}
                    onReviewSubmitted={() => router.reload({ preserveScroll: true })}
                />
            )}
        </>
    )
}