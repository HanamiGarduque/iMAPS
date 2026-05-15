import { useState, useEffect, useRef } from 'react'
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
    const cfg = STATUS_CONFIG[status] || { bg: '#f1f5f9', color: '#64748b' }
    return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold"
            style={{ background: cfg.bg, color: cfg.color }}>
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

        // Leaflet CSS
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
                html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#1a45ee;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 8px rgba(26,69,238,.4);"></div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 28],
                popupAnchor: [0, -30],
            })

            L.marker([lat, lng], { icon: pinIcon })
                .addTo(map)
                .bindPopup(`<strong>${applicantName}</strong><br>Brgy. ${barangay}`)
                .openPopup()

            map.setView([lat, lng], 16)

            // Wait for the container to be visible before invalidating
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
            <div className="h-full w-full flex flex-col items-center justify-center gap-2 bg-slate-50">
                <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <p className="text-xs text-slate-400">No coordinates recorded</p>
            </div>
        )
    }

    return <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
}

// ── Application Detail Drawer ──
function AppDrawer({ app, onClose, onStatusUpdated }) {
    const [newStatus, setNewStatus] = useState(app.status)
    const [remarks, setRemarks] = useState('')
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)

    // Remove the useEffect fetch entirely — app is already loaded

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

    const formatDate = (d) => d
        ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—'

    const formatFee = (fee) =>
        '₱' + parseFloat(fee || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

    return (
        <>
            {/* Overlay */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: 'rgba(15,23,42,.55)', backdropFilter: 'blur(3px)' }}
                onClick={(e) => e.target === e.currentTarget && onClose()}>

                <div className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden w-full"
                    style={{ maxWidth: 860, maxHeight: '85vh' }}>

                    {/* Header */}
                    <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 shrink-0">
                        {app ? (
                            <div>
                                <span className="inline-block font-mono text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-2.5 py-0.5 rounded-full mb-1.5">
                                    {app.reference_number}
                                </span>

                                <h2 className="text-[17px] font-semibold text-slate-900 leading-snug">
                                    {app.applicant_name}
                                </h2>

                                <p className="text-xs text-slate-400 mt-0.5">
                                    Filed {formatDate(app.date_of_application)} · Brgy. {app.barangay}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm text-red-500">
                                Failed to load application.
                            </p>
                        )}
                        <button onClick={onClose}
                            className="w-8 h-8 rounded-lg border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-800 hover:bg-slate-50 transition-colors shrink-0 ml-4 mt-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>


                    {/* Body */}
                    <div className="flex-1 overflow-y-auto">
                        <>
                            {/* Map + Info */}
                            <div className="flex" style={{ height: 320 }}>
                                {/* Map — fixed width, full height */}
                                <div style={{ width: '45%', height: '100%', flexShrink: 0 }}>
                                    <DrawerMap
                                        lat={parseFloat(app.latitude)}
                                        lng={parseFloat(app.longitude)}
                                        applicantName={app.applicant_name}
                                        barangay={app.barangay}
                                    />
                                </div>

                                {/* Info grid — scrollable */}
                                <div className="flex-1 flex flex-col gap-3 px-5 py-4 border-l border-slate-100 overflow-y-auto" style={{ height: '100%' }}>
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Details</p>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                ['Application Type', app.application_type],
                                                ['Land Use Class', app.land_use_class],
                                                ['Barangay', app.barangay],
                                                ['Lot No.', app.lot_number || '—'],
                                                ['TCT / OCT No.', app.tct_number || '—'],
                                                ['Area (sq.m)', app.area_sqm ? app.area_sqm + ' m²' : '—'],
                                                ['Contact', app.contact_number || '—'],
                                                ['Date Filed', formatDate(app.date_of_application)],
                                            ].map(([label, val]) => (
                                                <div key={label} className="bg-slate-50 rounded-xl px-3 py-2.5">
                                                    <p className="text-[10.5px] text-slate-400 font-medium">{label}</p>
                                                    <p className="text-[13px] text-slate-800 font-medium mt-0.5">{val}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-sky-50 px-4 py-3 flex items-center justify-between mt-auto">
                                        <div>
                                            <p className="text-[11px] text-slate-500 font-medium">Assessment Fee</p>
                                            <p className="text-[11px] text-slate-400 mt-0.5">Computed upon filing</p>
                                        </div>
                                        <span className="font-mono text-lg font-bold text-blue-600">
                                            {formatFee(app.assessment_fee)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Status Update */}
                            <div className="px-6 py-5 border-t border-slate-100 space-y-3">
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Update Status</p>
                                <div className="bg-slate-50 rounded-xl border border-slate-100 p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 font-medium">Current</span>
                                        <StatusBadge status={app.status} />
                                    </div>
                                    <select value={newStatus} onChange={e => setNewStatus(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors">
                                        <option value="">— Select new status —</option>
                                        {STATUSES.map(s => <option key={s}>{s}</option>)}
                                    </select>
                                    <div>
                                        <p className="text-[10.5px] text-slate-400 font-medium uppercase tracking-wider mb-1.5">Remarks (optional)</p>
                                        <textarea rows={3} value={remarks}
                                            onChange={e => setRemarks(e.target.value)}
                                            placeholder="Add notes about this status update…"
                                            className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-800 resize-y focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-colors" />
                                    </div>
                                </div>
                            </div>
                        </>
                    </div>

                    {/* Footer */}
                    <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-2.5">
                        <button onClick={onClose}
                            className="px-5 py-2.5 rounded-lg border border-slate-200 bg-white text-slate-500 text-sm font-medium hover:bg-slate-50 hover:text-slate-800 transition-colors">
                            Cancel
                        </button>
                        <button onClick={saveStatus} disabled={saving}
                            className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors shadow-sm disabled:opacity-60">
                            {saving ? 'Saving…' : 'Save Status Update'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <div className={`fixed bottom-6 right-6 z-[100] flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm font-medium shadow-lg ${toast.type === 'success' ? 'bg-slate-900 text-white' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                    {toast.type === 'success'
                        ? <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path d="M5 13l4 4L19 7" /></svg>
                        : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                    }
                    {toast.msg}
                </div>
            )}
        </>
    )
}

// ── Sidebar ──
function Sidebar({ userName, userRole }) {
    const navItems = [
        { href: '/dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', active: true },
        { href: '/analytics', label: 'Analytics', icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { href: '/audit-log', label: 'Audit Trail', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    ]

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
                {navItems.map(item => (
                    <a key={item.href} href={item.href}
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all ${item.active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
                        <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {item.label}
                    </a>
                ))}
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
                    onClick={() => {
                        if (confirm('Sign out from iMAPS?')) {
                            router.post('/logout')
                        }
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                >
                    <svg
                        className="w-4 h-4 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth="1.8"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                        />
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

    const userName = auth?.user?.name || 'Staff'
    const userRole = auth?.user?.role || 'Planning Officer'
    const isAdmin = userRole === 'Admin'

    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setClock(
                now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) +
                ' · ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
            )
        }
        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [])

    // Debounced search
    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== filters.search) {
                router.get('/applications', { ...filters, search, page: 1 }, { preserveState: true, replace: true })
            }
        }, 400)
        return () => clearTimeout(t)
    }, [search])

    const applyFilter = (newFilters) => {
        router.get('/applications', { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true })
    }

    const clearFilters = () => {
        setSearch('')
        router.get('/applications', {}, { preserveState: true, replace: true })
    }

    const formatDate = (d) => d
        ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—'

    const formatFee = (fee) =>
        '₱' + parseFloat(fee || 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })

    const hasFilters = filters.search || filters.status || filters.application_type

    return (
        <>
            <Head title="Applications | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                body { font-family: 'DM Sans', sans-serif; background: #f8fafc; }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
                @keyframes fadeUp { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
                .fade-up { animation: fadeUp .3s ease both; }
            `}</style>

            <div className="flex h-screen overflow-hidden">
                <Sidebar userName={userName} userRole={userRole} />

                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Top bar */}
                    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-5 shrink-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-300 text-sm hidden sm:block">MPDO Rosario, Batangas</span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono hidden md:block">{clock}</span>
                    </header>

                    {/* Main content */}
                    <main className="flex-1 overflow-y-auto px-6 py-6">

                        {/* Header row */}
                        <div className="flex items-center justify-between mb-5 fade-up">
                            <div>
                                <h1 className="text-lg font-semibold text-slate-900">Applications</h1>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {applications.total} record{applications.total !== 1 ? 's' : ''}
                                    {hasFilters ? ' — filtered' : ' total'}
                                </p>
                            </div>
                            <a href="/applications/encode"
                                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-sm transition-colors">
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                </svg>
                                Encode Application
                            </a>
                        </div>

                        {/* Search + filters */}
                        <div className="fade-up mb-4">
                            {/* Search */}
                            <div className="relative mb-3">
                                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search by name, reference number, or barangay…"
                                    className="w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 py-2.5 text-sm text-slate-800 transition-colors hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
                                />
                                {search && (
                                    <button onClick={() => setSearch('')}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-300 hover:text-slate-500 transition-colors">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                    </button>
                                )}
                            </div>

                            {/* Filter pills */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-[11px] text-slate-400 font-medium">Status:</span>
                                {['', ...STATUSES].map(s => (
                                    <button key={s || 'all'}
                                        onClick={() => applyFilter({ status: s, application_type: filters.application_type })}
                                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-all ${(filters.status || '') === s ? 'border-blue-600 text-blue-600 bg-blue-50 font-semibold' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                                        {s || 'All'}
                                    </button>
                                ))}

                                <span className="ml-2 text-[11px] text-slate-400 font-medium">Type:</span>
                                {['', ...APP_TYPES].map(t => (
                                    <button key={t || 'all'}
                                        onClick={() => applyFilter({ application_type: t, status: filters.status })}
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-all ${(filters.application_type || '') === t ? 'border-blue-600 text-blue-600 bg-blue-50 font-semibold' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                                        {t || 'All'}
                                    </button>
                                ))}

                                {hasFilters && (
                                    <button onClick={clearFilters}
                                        className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors flex items-center gap-1">
                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Table card */}
                        <div className="fade-up bg-white border border-slate-200 rounded-2xl overflow-hidden mb-5"
                            style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>

                            {applications.data.length === 0 ? (
                                <div className="py-16 flex flex-col items-center gap-3">
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700">
                                        {hasFilters ? 'No applications match your filters.' : 'No applications yet.'}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {hasFilters ? 'Try adjusting your search or filters.' : 'Encode your first zoning application to get started.'}
                                    </p>
                                    {!hasFilters && (
                                        <a href="/applications/encode"
                                            className="mt-1 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
                                            Encode Application
                                        </a>
                                    )}
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-100">
                                                {['Reference No.', 'Applicant', 'Type', 'Barangay', 'Date Filed', 'Fee', 'Status', ''].map(h => (
                                                    <th key={h} className="text-left text-[10.5px] font-semibold text-slate-400 uppercase tracking-wider px-4 py-3">{h}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {applications.data.map(app => (
                                                <tr key={app.id}
                                                    className="border-b border-slate-50 hover:bg-slate-50 transition-colors last:border-0">
                                                    <td className="px-4 py-3">
                                                        <span className="font-mono text-xs font-medium text-slate-700">{app.reference_number}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="font-medium text-slate-800 text-sm">{app.applicant_name}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <span className="inline-block px-2 py-1 rounded bg-slate-100 text-slate-600 text-[11px] font-medium">
                                                            {app.application_type}
                                                        </span>
                                                    </td>
                                                    <td className="px-4 py-3 text-slate-500 text-sm">{app.barangay}</td>
                                                    <td className="px-4 py-3 text-slate-500 text-xs">{formatDate(app.date_of_application)}</td>
                                                    <td className="px-4 py-3 text-slate-700 font-mono text-xs">{formatFee(app.assessment_fee)}</td>
                                                    <td className="px-4 py-3"><StatusBadge status={app.status} /></td>
                                                    <td className="px-4 py-3">
                                                        <button onClick={() => setDrawerApp(app)}
                                                            className="text-xs text-blue-600 hover:text-blue-700 font-medium transition-colors whitespace-nowrap">
                                                            View →
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>

                        {/* Pagination */}
                        {applications.last_page > 1 && (
                            <div className="flex items-center justify-between fade-up">
                                <p className="text-xs text-slate-400">
                                    Showing {applications.from}–{applications.to} of {applications.total}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    {applications.links.map((link, i) => (
                                        <button key={i}
                                            disabled={!link.url}
                                            onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                            className={`inline-flex items-center justify-center w-8 h-8 rounded-lg text-xs font-medium border transition-all
                                                ${link.active ? 'bg-blue-600 border-blue-600 text-white' : ''}
                                                ${!link.url ? 'opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400' : ''}
                                                ${link.url && !link.active ? 'border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50' : ''}
                                            `}
                                            dangerouslySetInnerHTML={{ __html: link.label }}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                    </main>
                </div>
            </div>

            {/* Drawer */}
            {drawerApp && (
                <AppDrawer
                    app={drawerApp}
                    onClose={() => setDrawerApp(null)}
                    onStatusUpdated={() => router.reload({ preserveScroll: true })}
                />
            )}
        </>
    )
}