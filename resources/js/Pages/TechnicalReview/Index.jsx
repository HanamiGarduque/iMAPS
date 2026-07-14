import React, { useState, useEffect, useRef } from 'react'
import { Head, router } from '@inertiajs/react'
import Header from '@/Components/Header'
import Sidebar from '@/Components/Sidebar'

const APP_TYPES = ['Locational Clearance', 'Zoning Certification', 'Development Permit', 'Special Land Use Permit']
const REVIEW_DECISIONS = ['Approved', 'Declined', 'Needs Site Inspection']

// ── Status Badge ──
function StatusBadge({ status }) {
    return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider bg-[#fffbeb] text-[#d97706] border border-[#d97706]/30">
            <span className="w-1.5 h-1.5 rounded-full inline-block bg-[#d97706]" />
            {status}
        </span>
    )
}

// ── Assign Inspector Drawer ──
function AssignInspectorDrawer({ onClose, onSubmit, saving, inspectors = [] }) {
    const [inspectorId, setInspectorId] = useState('')
    const [scheduledDate, setScheduledDate] = useState('')
    const [assignedNotes, setAssignedNotes] = useState('') // Changed to match DB

    return (
        <div className="absolute inset-0 z-[900] flex items-center justify-center p-4 form-enter"
             style={{ background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white rounded-[16px] shadow-2xl w-full max-w-md border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="text-lg font-black text-slate-800 tracking-tight">Assign Site Inspector</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                
                <div className="p-6 space-y-4">
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Select Personnel</label>
                        <select 
                            value={inspectorId} 
                            onChange={(e) => setInspectorId(e.target.value)}
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all"
                        >
                            <option value="">-- Select an Inspector --</option>
                            {inspectors.map(inspector => (
                                <option key={inspector.id} value={inspector.id}>
                                    {inspector.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Scheduled Date</label>
                        <input 
                            type="date" 
                            value={scheduledDate}
                            onChange={(e) => setScheduledDate(e.target.value)}
                            min={new Date().toISOString().split('T')[0]} 
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all"
                        />
                    </div>

                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Inspection Notes / Pointers</label>
                        <textarea 
                            rows={3}
                            value={assignedNotes}
                            onChange={(e) => setAssignedNotes(e.target.value)}
                            placeholder="Add specific instructions, focus areas, or pointers for the site inspection..."
                            className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all resize-none"
                        />
                    </div>
                </div>

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
                    <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition-all">
                        Back
                    </button>
                    <button 
                        onClick={() => onSubmit({ 
                            inspector_id: inspectorId, 
                            scheduled_date: scheduledDate,
                            assigned_notes: assignedNotes // Updated to match DB payload
                        })} 
                        disabled={saving || !inspectorId || !scheduledDate}
                        className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-amber-600 hover:bg-amber-700 text-white text-[12px] font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {saving ? 'Assigning...' : 'Confirm Assignment'}
                    </button>
                </div>
            </div>
        </div>
    )
}

// ── Technical Review Action Drawer ──
function ReviewDrawer({ app, onClose, onReviewSubmitted, inspectors }) {
    const [form, setForm] = useState({
        application_id: app.id,
        decision: '',
        zoning_compliant: false,
        documents_complete: false,
        land_use_compliant: false,
        findings: '',
        decision_reason: '',
        inspector_id: '',
        scheduled_date: '',
        assigned_notes: '' // Updated to match DB payload
    })
    
    const [saving, setSaving] = useState(false)
    const [toast, setToast] = useState(null)
    const [showAssignDrawer, setShowAssignDrawer] = useState(false)
    
    const mapRef = useRef(null)
    const mapInst = useRef(null)

    useEffect(() => {
        if (!document.getElementById('leaflet-css')) {
            const link = document.createElement('link')
            link.id = 'leaflet-css'
            link.rel = 'stylesheet'
            link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
            document.head.appendChild(link)
        }

        import('leaflet').then(({ default: L }) => {
            if (!mapInst.current && mapRef.current) {
                mapInst.current = L.map(mapRef.current, {
                    zoomControl: true,
                    scrollWheelZoom: true,
                }).setView([app.latitude || 13.845, app.longitude || 121.206], 15)

                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19,
                }).addTo(mapInst.current)

                if (app.latitude && app.longitude) {
                    const pinIcon = L.divIcon({
                        className: '',
                        html: `<div style="width:28px;height:28px;border-radius:50% 50% 50% 0;background:#d97706;border:3px solid #fff;transform:rotate(-45deg);box-shadow:0 2px 10px rgba(217,119,6,.4);"></div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 28],
                    })
                    L.marker([app.latitude, app.longitude], { icon: pinIcon }).addTo(mapInst.current)
                }
                
                setTimeout(() => {
                    mapInst.current.invalidateSize()
                }, 150)
            }
        })

        return () => {
            if (mapInst.current) {
                mapInst.current.remove()
                mapInst.current = null
            }
        }
    }, [app])

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type })
        setTimeout(() => setToast(null), 3000)
    }

    const set = (field) => (e) => {
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(prev => ({ ...prev, [field]: val }))
    }

    const processSubmission = (submissionData) => {
        setSaving(true)
        
        // Forcefully inject the ID into the final payload right before sending
        const payload = {
            ...submissionData,
            id: app.id,
            status: submissionData.decision,
            new_status: submissionData.decision // 
        }

        router.post('/applications/update-status', payload, {
            preserveScroll: true,
            onSuccess: () => {
                showToast(`Review submitted: ${payload.decision}`)
                onReviewSubmitted?.()
                onClose()
            },
            onError: (errors) => {
                showToast(Object.values(errors)[0] || 'Submission failed.', 'error')
                setSaving(false)
            },
            onFinish: () => setSaving(false),
        })
    }

    const handleInitialSubmit = () => {
        if (!form.decision) return showToast('Please select a decision.', 'error')
        if (form.decision === 'Declined' && !form.decision_reason?.trim()) return showToast('Reason is required for declination.', 'error')

        if (form.decision === 'Needs Site Inspection') {
            setShowAssignDrawer(true)
        } else {
            processSubmission(form)
        }
    }

   const handleAssignSubmit = (assignmentData) => {
        // 1. Instantly trigger the toast notification to assure the user
        showToast('Processing assignment, please wait...', 'success');

        const finalForm = { 
            ...form, 
            inspector_id: assignmentData.inspector_id,
            scheduled_date: assignmentData.scheduled_date,
            assigned_notes: assignmentData.assigned_notes 
        }
        setForm(finalForm)
        
        // 2. This disables the button to prevent double-submission
        setSaving(true) 
        
        const payload = {
            ...finalForm,
            id: app.id
        }

        router.post('/technical-review/update-status', payload, { 
            preserveScroll: true,
            onSuccess: () => {
                showToast(`Review submitted and inspector assigned.`)
                onReviewSubmitted?.()
                onClose()
            },
            onError: (errors) => {
                showToast(Object.values(errors)[0] || 'Submission failed.', 'error')
                setSaving(false)
            },
            onFinish: () => setSaving(false),
        })
    }
    // Lookup action for PIN Map
    const handleLookup = () => {
        if (!app.property_index_number) {
            showToast('No PIN available to lookup.', 'error')
            return
        }

        if (mapInst.current && app.latitude && app.longitude) {
            mapInst.current.flyTo([app.latitude, app.longitude], 18, { animate: true, duration: 1.5 })
            showToast(`Locating parcel for PIN: ${app.property_index_number}`, 'success')
        } else {
            showToast(`Lookup triggered for PIN: ${app.property_index_number}`, 'success')
        }
    }

    return (
        <>
            <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 form-enter"
                style={{ background: 'rgba(15,23,42,.6)', backdropFilter: 'blur(4px)' }}
                onClick={(e) => e.target === e.currentTarget && onClose()}>

                <div className="bg-white rounded-[20px] shadow-2xl flex flex-col md:flex-row overflow-hidden w-full border border-slate-200 relative"
                    style={{ maxWidth: 1400, height: '85vh' }}>

                    {/* Left Side: Map Area */}
                    <div className="w-full md:w-1/2 flex flex-col border-r border-slate-200 bg-slate-50 relative">
                        <div className="p-4 border-b border-slate-200 bg-white shadow-sm z-10 flex items-center gap-3">
                            <div className="flex-1 flex items-center gap-2">
                                <div className="flex-1 flex items-center bg-slate-50 border border-slate-200 rounded-[10px] overflow-hidden focus-within:border-blue-500 focus-within:ring-[2px] focus-within:ring-blue-500/10 transition-all">
                                    <span className="pl-3 pr-2 py-2 text-[11px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 border-r border-slate-200">PIN</span>
                                    <input
                                        type="text"
                                        readOnly
                                        value={app.property_index_number || 'N/A'}
                                        className="w-full bg-transparent px-3 py-2 text-[12px] font-medium text-slate-800 outline-none"
                                    />
                                </div>
                                <button
                                    onClick={handleLookup}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white text-[12px] font-bold shadow-md transition-all active:scale-95 whitespace-nowrap"
                                >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                                    Lookup
                                </button>
                            </div>
                        </div>
                        <div className="flex-1 w-full bg-slate-200 z-0">
                            <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
                        </div>
                    </div>

                    {/* Right Side: Action Form Area */}
                    <div className="w-full md:w-1/2 flex flex-col bg-white h-full relative">
                        
                        {/* 1. THE HEADER (Locked at top) */}
                        <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex flex-col shrink-0">
                            <div className="flex justify-between items-start w-full">
                                <div>
                                    <span className="font-mono text-[11px] font-black text-blue-600 bg-blue-50 border border-blue-100 px-2 py-1 rounded tracking-tight mb-2 inline-block">
                                        {app.reference_number}
                                    </span>
                                    <h3 className="text-2xl font-black text-slate-800 tracking-tight leading-none">{app.applicant_name}</h3>
                                    <p className="text-[13px] font-medium text-slate-500 mt-1">
                                        {app.application_type} • Brgy. {app.barangay}
                                    </p>
                                </div>
                                <StatusBadge status={app.status} />
                            </div>

                            {/* Multi-Parcel Display - Kept safe in the header! */}
                            <div className="mt-4">
                                {app.parcels && app.parcels.length > 0 ? (
                                    <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                                            Associated Parcels ({app.parcels.length})
                                        </p>
                                        <div className="flex flex-wrap gap-2 max-h-[85px] overflow-y-auto">
                                            {app.parcels.map((parcel, idx) => (
                                                <div key={idx} className="bg-white border border-slate-200 rounded-[8px] px-3 py-2 shadow-sm flex items-center gap-2">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PIN:</span>
                                                    <span className="font-mono text-[11px] font-semibold text-slate-700">{parcel.property_index_number || 'N/A'}</span>
                                                    {parcel.lot_area_sqm && (
                                                        <span className="text-[10px] text-slate-400 border-l border-slate-200 pl-2 ml-1">
                                                            {parcel.lot_area_sqm} sqm
                                                        </span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-1.5 mt-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">PIN:</span>
                                        <span className="font-mono text-[12px] font-semibold text-slate-700">{app.property_index_number || 'N/A'}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* 2. THE FORM BODY (Scrollable middle section) */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            
                            {/* Compliance Checks */}
                            <div>
                                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Compliance Checks</h4>
                                <div className="space-y-3">
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" checked={form.documents_complete} onChange={set('documents_complete')} className="w-4 h-4 rounded-[4px] border-slate-300 text-blue-600 focus:ring-blue-500/20" />
                                        <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Documents Complete</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" checked={form.zoning_compliant} onChange={set('zoning_compliant')} className="w-4 h-4 rounded-[4px] border-slate-300 text-blue-600 focus:ring-blue-500/20" />
                                        <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Zoning Compliant</span>
                                    </label>
                                    <label className="flex items-center gap-3 cursor-pointer group">
                                        <input type="checkbox" checked={form.land_use_compliant} onChange={set('land_use_compliant')} className="w-4 h-4 rounded-[4px] border-slate-300 text-blue-600 focus:ring-blue-500/20" />
                                        <span className="text-[13px] font-medium text-slate-700 group-hover:text-slate-900 transition-colors">Land Use Compliant</span>
                                    </label>
                                </div>
                            </div>

                            {/* Findings */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Findings / Remarks</label>
                                <textarea 
                                    rows={3} 
                                    value={form.findings} 
                                    onChange={set('findings')} 
                                    placeholder="Enter review findings..." 
                                    className="w-full rounded-[10px] border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 transition-all resize-none" 
                                />
                            </div>

                            {/* Decision */}
                            <div>
                                <label className="block text-[11px] font-bold uppercase tracking-widest text-slate-600 mb-2">Review Decision <span className="text-red-500">*</span></label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['Approved', 'Needs Site Inspection', 'Declined'].map(d => (
                                        <button 
                                            key={d} 
                                            onClick={() => setForm(prev => ({ ...prev, decision: d }))} 
                                            className={`px-3 py-2.5 rounded-[10px] text-[12px] font-bold transition-all border ${
                                                form.decision === d 
                                                    ? (d === 'Approved' ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : d === 'Declined' ? 'bg-red-50 border-red-500 text-red-700' : 'bg-amber-50 border-amber-500 text-amber-700') 
                                                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                            }`}
                                        >
                                            {d}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Reason for Declining */}
                            {form.decision === 'Declined' && (
                                <div className="form-enter">
                                    <label className="block text-[11px] font-bold uppercase tracking-widest text-red-600 mb-2">Reason for Declination <span className="text-red-500">*</span></label>
                                    <textarea 
                                        rows={3} 
                                        value={form.decision_reason} 
                                        onChange={set('decision_reason')} 
                                        placeholder="Specify the reason for declining this application..." 
                                        className="w-full rounded-[10px] border border-red-200 bg-red-50/30 px-3 py-2.5 text-[13px] font-medium text-slate-800 outline-none focus:border-red-500 focus:ring-[2px] focus:ring-red-500/20 transition-all resize-none" 
                                    />
                                </div>
                            )}
                        </div>

                        {/* 3. THE FOOTER (Locked at bottom) */}
                        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex justify-end gap-3 bg-slate-50 mt-auto">
                            <button onClick={onClose} className="px-5 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-[12px] font-bold hover:bg-slate-50 transition-all">
                                Cancel
                            </button>
                            <button onClick={handleInitialSubmit} disabled={saving || !form.decision}
                                className={`inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] text-white text-[12px] font-black shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${form.decision === 'Needs Site Inspection' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-900 hover:bg-slate-800'}`}>
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    {form.decision === 'Needs Site Inspection' 
                                        ? <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /> 
                                        : <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    }
                                </svg>
                                {saving ? 'Processing...' : (form.decision === 'Needs Site Inspection' ? 'Proceed to Assignment' : 'Finalize Review')}
                            </button>
                        </div>
                        
                        {showAssignDrawer && (
                            <AssignInspectorDrawer 
                                onClose={() => setShowAssignDrawer(false)} 
                                onSubmit={handleAssignSubmit} 
                                saving={saving}
                                inspectors={inspectors}
                            />
                        )}
                    </div>  
                </div>
            </div>

            {toast && (
                <div className={`fixed bottom-6 right-6 z-[99999] flex items-center gap-2.5 px-4 py-3 rounded-[12px] text-[12px] font-bold shadow-xl form-enter border ${toast.type === 'success' ? 'bg-slate-900 text-white border-slate-800' : 'bg-red-50 text-red-800 border-red-200'}`}>
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
export default function Index({ applications, filters, auth, inspectors }) {
    const [drawerApp, setDrawerApp] = useState(null)
    const [clock, setClock] = useState('')
    const [search, setSearch] = useState(filters?.search || '')
    const [sidebarOpen, setSidebarOpen] = useState(true)

    const userName = auth?.user?.name || 'User'
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
                router.get('/technical-review', { ...filters, search, page: 1 }, { preserveState: true, replace: true })
            }
        }, 400)
        return () => clearTimeout(t)
    }, [search, filters])

    const applyFilter = (newFilters) => router.get('/technical-review', { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true })
    const clearFilters = () => { setSearch(''); router.get('/technical-review', {}, { preserveState: true, replace: true }) }

    const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'
    const hasFilters = filters?.search || filters?.application_type

    const handleLogout = () => {
        if (confirm('Sign out from iMAPS?')) router.post('/logout')
    }

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
                        activePage="technical-review"
                    />

                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? '200px' : '0px' }}>
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full gap-4">

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

                            <div className="flex-1 flex flex-col min-h-0 bg-white rounded-2xl shadow-[0_2px_20px_rgb(0,0,0,0.04)] border border-slate-200/80 overflow-hidden form-enter">
                                
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
                    inspectors={inspectors}
                />
            )}
        </>
    )
}