import React, { useState, useEffect, useRef } from 'react'
import { Head, router, usePage } from '@inertiajs/react'
// import AppLayout from '@/Layouts/AppLayout'

// ── Status badge config ──
const STATUS_CONFIG = {
    'Received': { bg: '#f0fdf4', color: '#16a34a' },
    'Technical Review': { bg: '#fffbeb', color: '#d97706' },
    'Under Sangguniang Bayan': { bg: '#f5f3ff', color: '#7c3aed' },
    'For Release': { bg: '#eff6ff', color: '#2563eb' },
    'Released': { bg: '#eef4ff', color: '#1a45ee' },
    'Denied': { bg: '#fef2f2', color: '#dc2626' },
}

const STATUSES = ['Received', 'Technical Review', 'Under Sangguniang Bayan', 'For Release', 'Released', 'Denied']
const APP_TYPES = ['Locational Clearance', 'Zoning Certification', 'Development Permit', 'Special Land Use Permit']

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: '#f8fafc', color: '#64748b' }
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}>
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cfg.color }} />
            {status}
        </span>
    )
}

// ── Leaflet Map (lazy loaded) ──
function DrawerMap({ lat, lng, applicantName, barangay }) {
    const mapRef = useRef(null)
    const mapInst = useRef(null)

    useEffect(() => {
        if (!lat || !lng || isNaN(lat) || isNaN(lng)) return

        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link')
            link.id = 'leaflet-css'
            link.rel = 'stylesheet'
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
            document.head.appendChild(link)
        }

        import('leaflet').then(({ default: L }) => {
            if (mapInst.current) {
                mapInst.current.remove()
                mapInst.current = null
            }

            const map = L.map(mapRef.current, {
                zoomControl: true,
                scrollWheelZoom: false,
            })

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors',
                maxZoom: 19,
            }).addTo(map)

            const pinIcon = L.divIcon({
                className: '',
                html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#2563eb;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 10px rgba(37,99,235,.4);"></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
                popupAnchor: [0, -30],
            })

            L.marker([lat, lng], { icon: pinIcon })
                .addTo(map)
                .bindPopup(`<div style="font-family:'Poppins',sans-serif"><strong style="font-size:12px;color:#1e293b">${applicantName}</strong><br><span style="font-size:10px;color:#64748b">Brgy. ${barangay}</span></div>`)
                .openPopup()

            map.setView([lat, lng], 16)
            setTimeout(() => map.invalidateSize(), 300)
            mapInst.current = map
        })

        return () => {
            if (mapInst.current) {
                mapInst.current.remove()
                mapInst.current = null
            }
        }
    }, [lat, lng])

    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
        return (
            <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-slate-50/80 rounded-[10px] border border-slate-200 border-dashed">
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">No Coordinates</p>
            </div>
        )
    }

    return <div ref={mapRef} className="rounded-[10px] overflow-hidden border border-slate-200 z-0" style={{ height: '100%', width: '100%' }} />
}

// ── Application Detail Drawer ──
function AppDrawer({ app, onClose, onStatusUpdated }) {
    const [newStatus, setNewStatus] = useState(app.status)
    const [remarks, setRemarks] = useState('')
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const saveStatus = () => {
        if (!newStatus) return showToast('Select a status first.', 'error')
        setSaving(true)
        router.post('/applications/update-status', {
            id: app.id,
            new_status: newStatus,
            remarks,
        }, {
            preserveScroll: true,
            onSuccess: () => {
                showToast(`Status updated to ${newStatus}`)
                onStatusUpdated?.()
                onClose()
            },
            onError: (errors) => {
                showToast(Object.values(errors)[0] || 'Update failed.', 'error')
            },
            onFinish: () => setSaving(false),
        })
    }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const formatFee = (fee) => '₱' + parseFloat(fee || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

    return (
        <>
            <div className="fixed inset-0 z-[800] flex items-center justify-center p-4 form-enter"
                style={{ background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)' }}
                onClick={(e) => e.target === e.currentTarget && onClose()}>

                <div className="bg-white rounded-[20px] shadow-2xl flex flex-col overflow-hidden w-full border border-slate-200"
                    style={{ maxWidth: 860, maxHeight: '85vh' }}>

                    {/* Header */}
                    <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 shrink-0 bg-slate-50/50">
                        {app ? (
                            <div>
                                <span className="inline-block font-mono text-[10px] font-black text-blue-700 bg-blue-100/50 border border-blue-200 px-2.5 py-1 rounded-md mb-2 tracking-tight">
                                    {app.reference_number}
                                </span>
                                <h2 className="text-xl font-black text-slate-800 leading-tight tracking-tight">
                                    {app.applicant_name}
                                </h2>
                                <p className="text-[11px] font-medium text-slate-500 mt-1 flex items-center gap-1.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                                    Filed {formatDate(app.date_of_application)}
                                    <span className="text-slate-300 mx-1">•</span>
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                    Brgy. {app.barangay}
                                </p>
                            </div>
                        ) : (
                            <p className="text-[13px] font-bold text-red-500">Failed to load application.</p>
                        )}
                        <button onClick={onClose} className="w-8 h-8 rounded-[8px] border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-100 hover:border-slate-300 transition-all shrink-0">
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-y-auto">
                        <div className="flex flex-col md:flex-row" style={{ minHeight: 340 }}>
                            {/* Map */}
                            <div className="w-full md:w-[45%] h-[200px] md:h-auto p-5 md:pr-0 shrink-0">
                                <DrawerMap lat={parseFloat(app.latitude)} lng={parseFloat(app.longitude)} applicantName={app.applicant_name} barangay={app.barangay} />
                            </div>

                            {/* Info grid */}
                            <div className="flex-1 flex flex-col gap-4 p-5 md:pl-5">
                                <div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Application Dossier</p>
                                    <div className="grid grid-cols-2 gap-2.5">
                                        {[
                                            ['Application Type', app.application_type],
                                            ['Land Use Class', app.land_use_class],
                                            ['Lot No.', app.lot_number || '—'],
                                            ['TCT / Title No.', app.tct_number || '—'],
                                            ['Area (sq.m)', app.area_sqm ? app.area_sqm + ' m²' : '—'],
                                            ['Contact No.', app.contact_number ? `+63 ${app.contact_number}` : '—'],
                                        ].map(([label, val]) => (
                                            <div key={label} className="bg-slate-50 border border-slate-100 rounded-[10px] px-3.5 py-2.5">
                                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{label}</p>
                                                <p className={`text-[12px] font-bold mt-0.5 ${label.includes('No.') || label.includes('Area') ? 'font-mono text-slate-700' : 'text-slate-800'}`}>{val}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="rounded-[12px] border-2 border-blue-100 bg-blue-50/50 px-4 py-3 flex items-center justify-between mt-auto">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-blue-800">Assessment Fee</p>
                                        <p className="text-[10px] text-blue-600/80 font-medium mt-0.5">Computed upon filing</p>
                                    </div>
                                    <span className="font-mono text-xl font-black text-blue-700 tracking-tight">
                                        {formatFee(app.assessment_fee)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Status Update */}
                        <div className="px-6 py-5 border-t border-slate-100 bg-slate-50/30">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Assessment Routing</p>
                            <div className="bg-white rounded-[12px] border border-slate-200 p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-3">
                                    <div>
                                        <label className="flex items-center justify-between mb-1">
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-600">Current Status</span>
                                            <StatusBadge status={app.status} />
                                        </label>
                                        <div className="relative group">
                                            <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                                                className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 appearance-none outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300 transition-all cursor-pointer">
                                                <option value="" disabled>Select new status...</option>
                                                {STATUSES.map(s => <option key={s}>{s}</option>)}
                                            </select>
                                            <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400">
                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-widest text-slate-600 mb-1">Internal Remarks</label>
                                    <textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="Add routing notes or deficiencies..."
                                        className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2 text-[13px] font-medium text-slate-800 resize-none outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300 transition-all" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-white">
                        <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 hover:border-slate-300 transition-all">
                            Cancel
                        </button>
                        <button onClick={saveStatus} disabled={saving || newStatus === app.status}
                            className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-black shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                            {saving ? 'Processing...' : 'Confirm Update'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Toast */}
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

function Sidebar({ userName, userRole }) {
    const { url } = usePage()

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', adminOnly: false, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/applications', label: 'Applications', adminOnly: false, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { href: '/analytics', label: 'Analytics', adminOnly: true, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { href: '/audit', label: 'Audit Trail', adminOnly: true, icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ].filter(item => !item.adminOnly || userRole === 'Admin')

    return (
        <aside className="w-[220px] bg-white border-r border-slate-100 flex flex-col shrink-0">
            <div className="px-4 py-4 border-b border-slate-100">
                <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                        </svg>
                    </div>
                    <span className="font-bold text-slate-900 text-sm">iMAPS</span>
                </div>
            </div>

            <nav className="flex-1 flex flex-col gap-1 p-3">
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest px-2 mb-1">Menu</p>
                {navItems.map(item => {
                    const isActive = url.startsWith(item.href)
                    return (
                        <Link key={item.href} href={item.href}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all ${isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                                }`}>
                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                            </svg>
                            {item.label}
                        </Link>
                    )
                })}
            </nav>

            <div className="border-t border-slate-100 p-3">
                <div className="flex items-center gap-2 px-2 py-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {userName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-slate-800 leading-none">{userName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{userRole}</p>
                    </div>
                </div>
                <button
                    onClick={() => { if (confirm('Sign out from iMAPS?')) router.post('/logout') }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                </button>
            </div>
        </aside>
    )
}

// ── Main Page ──
export default function Index({ applications, filters, auth }) {
    const [drawerApp, setDrawerApp] = useState(null)
    const [clock, setClock] = useState('')
    const [search, setSearch] = useState(filters.search || '')
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
            if (search !== filters.search) {
                router.get('/applications', { ...filters, search, page: 1 }, { preserveState: true, replace: true })
            }
        }, 400)
        return () => clearTimeout(t)
    }, [search, filters])

    const applyFilter = (newFilters) => router.get('/applications', { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true })
    const clearFilters = () => { setSearch(''); router.get('/applications', {}, { preserveState: true, replace: true }) }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const formatFee = (fee) => '₱' + parseFloat(fee || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })
    const hasFilters = filters.search || filters.status || filters.application_type

    const handleLogout = () => {
        if (confirm('Sign out from iMAPS?')) router.post('/logout')
    }

    return (
        <>
            <Head title="Applications | iMAPS" />
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

                {/* ── NAVBAR ── */}
                <header className="h-14 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 sm:px-6 shrink-0 z-[700] sticky top-0">
                    <div className="flex items-center gap-4 lg:gap-6">
                        <a href="/dashboard" className="flex items-center gap-2.5 group">
                            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center shadow-sm group-hover:shadow-md transition-all">
                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
                            </div>
                            <span className="font-black text-lg tracking-tight text-slate-800">iMAPS</span>
                        </a>
                        <div className="h-4 w-px bg-slate-200 hidden md:block" />
                        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-2.5 py-0.5">
                            <span className="flex h-1.5 w-1.5 relative"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" /><span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" /></span>
                            <span className="text-[9px] font-bold text-slate-600 tracking-widest uppercase">Rosario, Batangas</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="hidden sm:flex items-center px-2 py-1 rounded-lg text-slate-500">
                            <span className="text-[11px] font-mono font-bold tracking-tight">{clock}</span>
                        </div>
                        <div className="h-5 w-px bg-slate-200 hidden sm:block" />
                        <div className="flex items-center gap-2 pl-1 pr-2 py-1 cursor-pointer group hover:bg-slate-50 rounded-lg transition-colors" onClick={handleLogout}>
                            <div className="relative">
                                <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                                    {userName?.charAt(0).toUpperCase()}
                                </div>
                                <div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full" />
                            </div>
                            <div className="hidden sm:flex flex-col text-left justify-center">
                                <p className="text-[11px] font-bold text-slate-700 leading-tight group-hover:text-blue-700 transition-colors">{userName}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight mt-0.5">{userRole}</p>
                            </div>
                        </div>
                    </div>
                </header>

                <div className="flex flex-1 h-full overflow-hidden relative">

                    {/* ── SIDEBAR ── */}
                    <aside className={`absolute top-0 left-0 w-[200px] h-full bg-white z-[600] border-r border-slate-200 flex flex-col py-4 transition-transform duration-500 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="absolute top-1/2 -translate-y-1/2 -right-5 w-5 h-12 bg-white border-y border-r border-slate-200 text-slate-400 hover:text-blue-600 rounded-r-md flex items-center justify-center shadow-sm transition-colors focus:outline-none z-10">
                            <svg className={`w-3.5 h-3.5 transition-transform duration-500 ${!sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                        </button>

                        <div className="px-4 pb-4 pt-1 border-b border-slate-100 flex flex-col items-center">
                            <h1 className="text-2xl font-black text-blue-900 tracking-tighter leading-none">iMAPS</h1>
                            <span className="text-[9px] font-bold text-blue-700 tracking-[0.2em] uppercase mt-1">Rosario</span>
                        </div>

                        <nav className="flex-1 flex flex-col gap-1 py-3 overflow-y-auto">
                            {[
                                { href: '/dashboard', label: 'Dashboard', adminOnly: false, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
                                { href: '/applications', label: 'Applications', adminOnly: false, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                                { href: '/analytics', label: 'Analytics', adminOnly: true, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
                                { href: '/audit-log', label: 'Audit Trail', adminOnly: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                            ]
                                .filter(item => !item.adminOnly || userRole === 'Admin')
                                .map(item => {
                                    const isActive = window.location.pathname === item.href
                                    return (
                                        <a key={item.href} href={item.href}
                                            className={`flex items-center gap-2.5 px-4 py-2 font-medium text-[12px] rounded-r-lg mr-3 transition-all ${isActive
                                                    ? 'bg-blue-800 text-white font-semibold shadow-sm'
                                                    : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'
                                                }`}>
                                            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                            </svg>
                                            <span>{item.label}</span>
                                        </a>
                                    )
                                })}
                        </nav>

                        <div className="border-t border-slate-100 py-2 mt-1">
                            <button onClick={handleLogout} className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-500 hover:bg-slate-50 hover:text-blue-700 font-medium text-[12px] transition-all rounded-r-lg mr-3">
                                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </aside>

                    {/* ── WORKSPACE ── */}
                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? '200px' : '0px' }}>
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full">

                            {/* Header Area */}
                            <div className="mb-4 flex-shrink-0 flex items-center justify-between gap-4 form-enter">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        <span className="text-slate-800">Masterlist</span>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                        <span className="text-slate-500">Registry</span>
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Applications</h2>
                                </div>

                                {userRole === 'Planning Officer' && (
                                    <a href="/applications/encode" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                        Encode New Application
                                    </a>
                                )}
                            </div>

                            {/* Filters & Search */}
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgb(0,0,0,0.02)] mb-4 flex-shrink-0 form-enter flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">Status</span>
                                        {['', ...STATUSES].map(s => (
                                            <button key={s || 'all'} onClick={() => applyFilter({ status: s, application_type: filters.application_type })}
                                                className={`text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border ${(filters.status || '') === s ? 'bg-blue-50 border-blue-200 text-blue-700 shadow-sm' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
                                                    }`}>
                                                {s || 'All'}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="h-6 w-px bg-slate-200 hidden xl:block" />
                                    <div className="flex items-center gap-2">
                                        <select value={filters.application_type || ''} onChange={(e) => applyFilter({ application_type: e.target.value, status: filters.status })}
                                            className="text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border border-slate-200 text-slate-600 bg-white hover:border-slate-300 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 cursor-pointer appearance-none pr-8 relative">
                                            <option value="">All App Types</option>
                                            {APP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                        </select>
                                    </div>
                                    {hasFilters && (
                                        <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 flex items-center gap-1 ml-2">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg> Reset
                                        </button>
                                    )}
                                </div>

                                <div className="relative w-full lg:w-[280px]">
                                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tracking no, applicant..."
                                        className="w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-[12px] font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300" />
                                </div>
                            </div>

                            {/* Data Table Card */}
                            <div className="flex-1 bg-white rounded-2xl shadow-[0_2px_20px_rgb(0,0,0,0.04)] border border-slate-200/80 overflow-hidden flex flex-col form-enter min-h-0">
                                {applications.data.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200 mb-4 shadow-sm">
                                            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 tracking-tight">No Records Found</h3>
                                        <p className="text-[12px] font-medium text-slate-500 mt-1 max-w-sm">
                                            {hasFilters ? "We couldn't find any applications matching your current filter criteria." : "Your application registry is currently empty. Encode a new application to get started."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse whitespace-nowrap">
                                            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-[0_1px_0_rgb(226,232,240)]">
                                                <tr>
                                                    {['Reference', 'Applicant / Entity', 'Application Type', 'Location', 'Date Filed', 'Assessment', 'Status', ''].map((h, i) => (
                                                        <th key={i} className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {applications.data.map(app => (
                                                    <tr key={app.id} className="hover:bg-slate-50/60 transition-colors group">
                                                        <td className="px-5 py-4">
                                                            <span className="font-mono text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded tracking-tight">{app.reference_number}</span>
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <p className="text-[13px] font-bold text-slate-800 leading-tight">{app.applicant_name}</p>
                                                            {app.representative_name && <p className="text-[10px] font-medium text-slate-400 mt-0.5">via {app.representative_name}</p>}
                                                        </td>
                                                        <td className="px-5 py-4">
                                                            <p className="text-[12px] font-bold text-slate-700">{app.application_type}</p>
                                                            <p className="text-[10px] font-medium text-slate-400 mt-0.5">{app.land_use_class}</p>
                                                        </td>
                                                        <td className="px-5 py-4 text-[12px] font-medium text-slate-600">Brgy. {app.barangay}</td>
                                                        <td className="px-5 py-4 text-[11px] font-medium text-slate-500">{formatDate(app.date_of_application)}</td>
                                                        <td className="px-5 py-4 font-mono text-[12px] font-bold text-slate-700">{formatFee(app.assessment_fee)}</td>
                                                        <td className="px-5 py-4"><StatusBadge status={app.status} /></td>
                                                        <td className="px-5 py-4 text-right pr-6">
                                                            <button onClick={() => setDrawerApp(app)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-white border border-slate-200 text-[10px] font-bold text-blue-600 uppercase tracking-wider hover:border-blue-300 hover:bg-blue-50 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100">
                                                                Review <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Pagination Footer */}
                                {applications.last_page > 1 && (
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
            {drawerApp && <AppDrawer app={drawerApp} onClose={() => setDrawerApp(null)} onStatusUpdated={() => router.reload({ preserveScroll: true })} />}
        </>
    )
}