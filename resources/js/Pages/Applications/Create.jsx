// resources/js/Pages/Applications/Create.jsx
import { useState } from 'react'
import { Head, router } from '@inertiajs/react'

const BARANGAYS = [
    'Alupay', 'Antipolo', 'Bagong Pook', 'Balibago',
    'Barangay A (Poblacion)', 'Barangay B (Poblacion)', 'Barangay C (Poblacion)',
    'Barangay D (Poblacion)', 'Barangay E (Poblacion)',
    'Bayawang', 'Baybayin', 'Bulihan', 'Cahigam', 'Calantas', 'Colongan', 'Itlugan',
    'Leviste (Tubahan)', 'Lumbangan', 'Maalas-as', 'Mabato', 'Mabunga',
    'Macalamcam A', 'Macalamcam B', 'Malaya', 'Maligaya', 'Marilag', 'Masaya',
    'Matamis (Malinao)', 'Mavalor', 'Mayuro', 'Namuco', 'Namunga', 'Nasi', 'Natu',
    'Palakpak', 'Pinagsibaan', 'Putingkahoy', 'Quilib', 'Salao', 'San Agustin',
    'San Carlos', 'San Ignacio', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz',
    'Timbugan', 'Tiquiwan', 'Tulos',
]

const APPLICATION_TYPES = [
    'Locational Clearance',
    'Zoning Certification',
    'Development Permit',
    'Special Land Use Permit',
]

const LAND_USE_CLASSES = [
    'Residential', 'Commercial', 'Industrial', 'Agro-Industrial', 'Special Use',
]

// ── Reusable field components ──
function Label({ children, required, hasError }) {
    return (
        <label className={`block text-[10px] font-semibold uppercase tracking-wider mb-1
            ${hasError ? 'text-red-500' : 'text-slate-500'}`}>
            {children}{required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
    )
}

function Input({ className = '', hasError = false, ...props }) {
    return (
        <input
            className={`w-full rounded-md border px-2.5 py-1.5 text-xs text-slate-800
                focus:outline-none focus:ring-2 transition-all
                ${hasError
                    ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100 focus:bg-white'
                } ${className}`}
            {...props}
        />
    )
}

function Select({ children, className = '', hasError = false, ...props }) {
    return (
        <select
            className={`w-full rounded-md border px-2.5 py-1.5 text-xs text-slate-800
                focus:outline-none focus:ring-2 transition-all appearance-none
                ${hasError
                    ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100 focus:bg-white'
                } ${className}`}
            {...props}
        >
            {children}
        </select>
    )
}

function Textarea({ className = '', hasError = false, ...props }) {
    return (
        <textarea
            className={`w-full rounded-md border px-2.5 py-1.5 text-xs text-slate-800
                focus:outline-none focus:ring-2 transition-all resize-none
                ${hasError
                    ? 'border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-100'
                    : 'border-slate-200 bg-slate-50 hover:border-slate-300 focus:border-blue-500 focus:ring-blue-100 focus:bg-white'
                } ${className}`}
            {...props}
        />
    )
}

function SectionHeading({ number, children }) {
    return (
        <p className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
            <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[9px] font-bold shrink-0">
                {number}
            </span>
            {children}
        </p>
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
                        className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13.5px] font-medium transition-all
                            ${item.active ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'}`}>
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
export default function Create({ auth, errors: serverErrors = {} }) {
    const userName = auth?.user?.name || 'Staff'
    const userRole = auth?.user?.role || 'Planning Officer'

    const today = new Date().toISOString().split('T')[0]

    const [form, setForm] = useState({
        date_of_application: today,
        application_type: '',
        land_use_class: '',
        purpose: '',
        applicant_name: '',
        contact_number: '',
        email: '',
        representative_name: '',
        barangay: '',
        street_address: '',
        lot_number: '',
        tct_number: '',
        area_sqm: '',
        coordinates: '',
        assessment_fee: '',
        or_number: '',
        remarks: '',
    })

    const [errors, setErrors] = useState(serverErrors)
    const [submitting, setSubmitting] = useState(false)
    const [flash, setFlash] = useState(null)   // { type, msg, ref }

    const set = (field) => (e) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(err => { const n = { ...err }; delete n[field]; return n })
    }

    const handleContactInput = (e) => {
        let val = e.target.value.replace(/\D/g, '')
        if (val.startsWith('0')) val = val.slice(1)
        setForm(f => ({ ...f, contact_number: val }))
    }

    const handleFeeBlur = (e) => {
        const v = parseFloat(e.target.value)
        if (!isNaN(v)) setForm(f => ({ ...f, assessment_fee: v.toFixed(2) }))
    }

    const resetForm = () => {
        if (!confirm('Clear all form fields?')) return
        setForm({
            date_of_application: today,
            application_type: '', land_use_class: '', purpose: '',
            applicant_name: '', contact_number: '', email: '', representative_name: '',
            barangay: '', street_address: '', lot_number: '', tct_number: '',
            area_sqm: '', coordinates: '', assessment_fee: '', or_number: '', remarks: '',
        })
        setErrors({})
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        setSubmitting(true)
        setErrors({})

        router.post('/applications/encode', form, {
            onSuccess: (page) => {
                const success = page.props.flash?.success
                const ref = page.props.flash?.reference_number
                setFlash({ type: 'success', msg: success || 'Application saved.', ref })
                setForm(f => ({
                    ...f,
                    application_type: '', land_use_class: '', purpose: '',
                    applicant_name: '', contact_number: '', email: '', representative_name: '',
                    barangay: '', street_address: '', lot_number: '', tct_number: '',
                    area_sqm: '', coordinates: '', assessment_fee: '', or_number: '', remarks: '',
                }))
            },
            onError: (errs) => {
                setErrors(errs)
                const msg = errs.auth || 'Please fix the errors below.'
                setFlash({ type: 'error', msg })
            },
            onFinish: () => setSubmitting(false),
        })
    }

    const fieldError = (field) => errors[field] ? (
        <p className="text-[10px] text-red-500 mt-1">{errors[field]}</p>
    ) : null

    return (
        <>
            <Head title="Encode Application | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                body { font-family: 'DM Sans', sans-serif; background: #f8fafc; }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
            `}</style>

            <div className="flex h-screen overflow-hidden">
                <Sidebar userName={userName} userRole={userRole} />

                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Top bar */}
                    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-5 shrink-0 z-10">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                            <a href="/applications" className="hover:text-blue-600 transition-colors">Applications</a>
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                            </svg>
                            <span className="text-slate-800 font-medium">Encode New Application</span>
                        </div>
                        <span className="text-xs text-slate-400">MPDO Rosario, Batangas</span>
                    </header>

                    <main className="flex-1 overflow-y-auto px-5 py-4">

                        {/* Flash banner */}
                        {flash && (
                            <div className={`mb-3 flex items-center gap-2 px-3 py-2 rounded-lg text-xs border
                                ${flash.type === 'success'
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                    : 'bg-red-50 border-red-200 text-red-700'}`}>
                                {flash.type === 'success'
                                    ? <svg className="w-3.5 h-3.5 text-emerald-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    : <svg className="w-3.5 h-3.5 text-red-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" /><path d="M12 8v4m0 4h.01" /></svg>
                                }
                                <span className="font-semibold">{flash.msg}</span>
                                {flash.ref && (
                                    <span className="ml-1 text-emerald-700">
                                        Ref: <span className="font-mono font-medium">{flash.ref}</span>
                                    </span>
                                )}
                                <button onClick={() => setFlash(null)} className="ml-auto text-slate-400 hover:text-slate-600">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                        )}

                        {/* Form card */}
                        <form onSubmit={handleSubmit}>
                            <div className="grid grid-cols-2 gap-0 bg-white rounded-xl border border-slate-200 overflow-hidden"
                                style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>

                                {/* ── LEFT COLUMN ── */}
                                <div className="p-5 space-y-5 border-r border-slate-100">

                                    {/* Section 1 — Application Details */}
                                    <div>
                                        <SectionHeading number="1">Application Details</SectionHeading>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label required hasError={!!errors.date_of_application}>Date Filed</Label>
                                                <Input type="date" value={form.date_of_application}
                                                    onChange={set('date_of_application')} max={today}
                                                    hasError={!!errors.date_of_application} />
                                                {fieldError('date_of_application')}
                                            </div>
                                            <div>
                                                <Label required hasError={!!errors.application_type}>Type</Label>
                                                <Select value={form.application_type} onChange={set('application_type')}
                                                    hasError={!!errors.application_type}>
                                                    <option value="">— Select —</option>
                                                    {APPLICATION_TYPES.map(t => <option key={t}>{t}</option>)}
                                                </Select>
                                                {fieldError('application_type')}
                                            </div>
                                            <div>
                                                <Label required hasError={!!errors.land_use_class}>Land-Use Class</Label>
                                                <Select value={form.land_use_class} onChange={set('land_use_class')}
                                                    hasError={!!errors.land_use_class}>
                                                    <option value="">— Select —</option>
                                                    {LAND_USE_CLASSES.map(c => <option key={c}>{c}</option>)}
                                                </Select>
                                                {fieldError('land_use_class')}
                                            </div>
                                            <div className="col-span-2">
                                                <Label required hasError={!!errors.purpose}>Purpose</Label>
                                                <Textarea rows={3} value={form.purpose} onChange={set('purpose')}
                                                    placeholder="Describe the purpose…"
                                                    hasError={!!errors.purpose} />
                                                {fieldError('purpose')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 2 — Applicant Information */}
                                    <div>
                                        <SectionHeading number="2">Applicant Information</SectionHeading>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="col-span-2">
                                                <Label required hasError={!!errors.applicant_name}>Full Name</Label>
                                                <Input type="text" value={form.applicant_name}
                                                    onChange={set('applicant_name')} maxLength={255}
                                                    placeholder="e.g. Juan dela Cruz"
                                                    hasError={!!errors.applicant_name} />
                                                {fieldError('applicant_name')}
                                            </div>
                                            <div>
                                                <Label required hasError={!!errors.contact_number}>Contact No.</Label>
                                                <div className="relative">
                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-xs pointer-events-none">+63</span>
                                                    <Input type="tel" value={form.contact_number}
                                                        onChange={handleContactInput} maxLength={10}
                                                        placeholder="9XXXXXXXXX" className="pl-9"
                                                        hasError={!!errors.contact_number} />
                                                </div>
                                                {fieldError('contact_number')}
                                            </div>
                                            <div>
                                                <Label hasError={!!errors.email}>Email</Label>
                                                <Input type="email" value={form.email} onChange={set('email')}
                                                    placeholder="optional"
                                                    hasError={!!errors.email} />
                                                {fieldError('email')}
                                            </div>
                                            <div className="col-span-2">
                                                <Label>Authorized Representative</Label>
                                                <Input type="text" value={form.representative_name}
                                                    onChange={set('representative_name')} maxLength={255}
                                                    placeholder="Leave blank if applicant is present" />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* ── RIGHT COLUMN ── */}
                                <div className="p-5 space-y-5">

                                    {/* Section 3 — Property & Location */}
                                    <div>
                                        <SectionHeading number="3">Property &amp; Location</SectionHeading>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div>
                                                <Label required hasError={!!errors.barangay}>Barangay</Label>
                                                <Select value={form.barangay} onChange={set('barangay')}
                                                    hasError={!!errors.barangay}>
                                                    <option value="">— Select —</option>
                                                    {BARANGAYS.map(b => <option key={b}>{b}</option>)}
                                                </Select>
                                                {fieldError('barangay')}
                                            </div>
                                            <div className="col-span-2">
                                                <Label>Street / Site Address</Label>
                                                <Input type="text" value={form.street_address}
                                                    onChange={set('street_address')}
                                                    placeholder="e.g. Purok 3, Sitio Bulod" />
                                            </div>
                                            <div>
                                                <Label>Lot No.</Label>
                                                <Input type="text" value={form.lot_number} onChange={set('lot_number')}
                                                    placeholder="e.g. Lot 12 Blk 4" />
                                            </div>
                                            <div>
                                                <Label>TCT / Tax Dec. No.</Label>
                                                <Input type="text" value={form.tct_number} onChange={set('tct_number')}
                                                    placeholder="e.g. TCT-T-123456" />
                                            </div>
                                            <div>
                                                <Label>Lot Area (sq.m.)</Label>
                                                <Input type="number" value={form.area_sqm} onChange={set('area_sqm')}
                                                    min="0" step="0.01" placeholder="e.g. 250.00" />
                                            </div>
                                            <div className="col-span-3">
                                                <Label hasError={!!errors.coordinates}>
                                                    GPS Coordinates <span className="text-slate-400 font-normal normal-case">(lat, lng)</span>
                                                </Label>
                                                <div className="relative">
                                                    <Input type="text" value={form.coordinates}
                                                        onChange={set('coordinates')}
                                                        placeholder="e.g. 13.8352, 121.2167"
                                                        className="pr-8" hasError={!!errors.coordinates} />
                                                    <span className="absolute inset-y-0 right-0 flex items-center px-2.5 text-slate-300">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                                        </svg>
                                                    </span>
                                                </div>
                                                {fieldError('coordinates')}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Section 4 — Fees & Remarks */}
                                    <div>
                                        <SectionHeading number="4">Fees &amp; Remarks</SectionHeading>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <Label required hasError={!!errors.assessment_fee}>Assessment Fee (₱)</Label>
                                                <div className="relative">
                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-slate-400 text-xs pointer-events-none">₱</span>
                                                    <Input type="number" value={form.assessment_fee}
                                                        onChange={set('assessment_fee')} onBlur={handleFeeBlur}
                                                        min="0" step="0.01" placeholder="0.00" className="pl-6"
                                                        hasError={!!errors.assessment_fee} />
                                                </div>
                                                {fieldError('assessment_fee')}
                                            </div>
                                            <div>
                                                <Label>Official Receipt No.</Label>
                                                <Input type="text" value={form.or_number} onChange={set('or_number')}
                                                    placeholder="e.g. OR-2025-00123" />
                                            </div>
                                            <div className="col-span-2">
                                                <Label>Remarks / Notes</Label>
                                                <Textarea rows={3} value={form.remarks} onChange={set('remarks')}
                                                    placeholder="Additional notes…" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Actions */}
                                    <div className="flex items-center justify-end gap-2 pt-1">
                                        <button type="button" onClick={resetForm}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-all">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                            </svg>
                                            Clear Form
                                        </button>
                                        <button type="submit" disabled={submitting}
                                            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                                            </svg>
                                            {submitting ? 'Saving…' : 'Save Application'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </form>
                    </main>
                </div>
            </div>
        </>
    )
}