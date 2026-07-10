// resources/js/Pages/Applications/Create.jsx
import React, { useState, useEffect, useRef } from 'react'
import { Link, Head, router, usePage } from '@inertiajs/react'
import Swal from 'sweetalert2'
import Sidebar from '@/Components/Sidebar'

const BARANGAYS = [
    'Alupay', 'Antipolo', 'Bagong Pook', 'Balibago', 'Barangay A (Poblacion)', 'Barangay B (Poblacion)', 'Barangay C (Poblacion)',
    'Barangay D (Poblacion)', 'Barangay E (Poblacion)', 'Bayawang', 'Baybayin', 'Bulihan', 'Cahigam', 'Calantas', 'Colongan', 'Itlugan',
    'Leviste (Tubahan)', 'Lumbangan', 'Maalas-as', 'Mabato', 'Mabunga', 'Macalamcam A', 'Macalamcam B', 'Malaya', 'Maligaya', 'Marilag', 'Masaya',
    'Matamis (Malinao)', 'Mavalor', 'Mayuro', 'Namuco', 'Namunga', 'Nasi', 'Natu', 'Palakpak', 'Pinagsibaan', 'Putingkahoy', 'Quilib', 'Salao', 'San Agustin',
    'San Carlos', 'San Ignacio', 'San Isidro', 'San Jose', 'San Roque', 'Santa Cruz', 'Timbugan', 'Tiquiwan', 'Tulos',
]

const APPLICATION_TYPES = [
    { id: 'Locational Clearance', icon: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7', desc: 'Standard building clearance.' },
    { id: 'Zoning Certification', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', desc: 'Land use compatibility.' },
    { id: 'Development Permit', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', desc: 'For major subdivisions.' }
]

const LAND_USE_CLASSES = ['Residential', 'Commercial', 'Industrial', 'Agro-Industrial', 'Special Use']

const STEPS = [
    { id: 1, title: 'Scope & Category', subtitle: 'Application parameters' },
    { id: 2, title: 'Entity Profile', subtitle: 'Applicant identity' },
    { id: 3, title: 'Geospatial Data', subtitle: 'Location specifics' },
    { id: 4, title: 'Summary Review', subtitle: 'Verify all details' },
    { id: 5, title: 'Final Assessment', subtitle: 'Official routing' }
]

// ── Premium Form Controls ──
function Label({ children, required, hasError }) {
    return (
        <label className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1 transition-colors ${hasError ? 'text-red-500' : 'text-slate-600'}`}>
            {children}
            {required && <span className="text-blue-500 font-black text-[13px] leading-none mt-0.5">*</span>}
        </label>
    )
}

const inputBaseStyles = (hasError) => `
    w-full rounded-[10px] border px-3 py-2.5 text-[13px] font-medium transition-all duration-200
    placeholder:text-slate-400 placeholder:font-normal outline-none
    ${hasError
        ? 'border-red-300 bg-red-50 focus:border-red-500 focus:ring-[2px] focus:ring-red-500/20'
        : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-[0_2px_10px_rgb(0,0,0,0.02)] focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10'}
`

const Input = ({ className = '', hasError = false, ...props }) => <input className={`${inputBaseStyles(hasError)} ${className}`} {...props} />
const Textarea = ({ className = '', hasError = false, ...props }) => <textarea className={`${inputBaseStyles(hasError)} resize-none ${className}`} {...props} />
const Select = ({ children, className = '', hasError = false, ...props }) => (
    <div className="relative group">
        <select className={`${inputBaseStyles(hasError)} appearance-none pr-10 cursor-pointer ${className}`} {...props}>{children}</select>
        <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-slate-400 group-hover:text-blue-500 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4m0 6l-4 4-4-4" /></svg>
        </div>
    </div>
)

export default function Create({ auth, errors: serverErrors = {} }) {
    const userName = auth?.user?.name || 'Julience'
    const userRole = auth?.user?.role || 'Planning Officer'
    const today = new Date().toISOString().split('T')[0]

    const [sidebarOpen, setSidebarOpen] = useState(true)
    const [clock, setClock] = useState('')
    const [currentStep, setCurrentStep] = useState(1)
    const [submitting, setSubmitting] = useState(false)
    const [flash, setFlash] = useState(null)
    const [errors, setErrors] = useState(serverErrors)
    const formRef = useRef(null)

    const [form, setForm] = useState({
        application_type: '', application_form_number: '', land_use_class: '', purpose: '',
        applicant_name: '', contact_number: '', email: '', representative_name: '',
        barangay: '', street_address: '', property_index_number: '', lot_number: '', assessment_fee: '', or_number: '', remarks: '',

        parcels: [
        { parcel_code: 'P-01', lot_number: '', tct_number: '', tax_dec_number: '', lot_area_sqm: '', coordinates: '' },
    ],
    })

    const addParcel = () => {
    setForm((prev) => ({
        ...prev,
        parcels: [
            ...prev.parcels,
            {
                parcel_code: `P-${String(prev.parcels.length + 1).padStart(2, '0')}`,
                lot_number: '',
                tct_number: '',
                tax_dec_number: '',
                lot_area_sqm: '',
                coordinates: '',
            },
        ],
    }));
};

const removeParcel = (index) => {
    setForm((prev) => ({
        ...prev,
        parcels: prev.parcels.filter((_, i) => i !== index),
    }));
};

const setParcelField = (index, field) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({
        ...prev,
        parcels: prev.parcels.map((p, i) => (i === index ? { ...p, [field]: value } : p)),
    }));

    const nestedField = `parcels.${index}.${field}`;
    if (errors[nestedField]) {
        setErrors((prev) => {
            const next = { ...prev };
            delete next[nestedField];
            return next;
        });
    }
};

const parcelFieldError = (index, field) => errors[`parcels.${index}.${field}`]
    ? <p className="text-[10px] font-bold text-red-500 mt-1">{errors[`parcels.${index}.${field}`]}</p>
    : null;

const totalAreaSqm = form.parcels.reduce((sum, p) => sum + (parseFloat(p.lot_area_sqm) || 0), 0);

    useEffect(() => {
        const tick = () => {
            const now = new Date()
            setClock(now.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) + ' · ' + now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }))
        }
        tick(); const id = setInterval(tick, 1000); return () => clearInterval(id)
    }, [])

    const handleLogout = () => {
        Swal.fire({
            title: 'Sign Out?', text: "Securely end this session?", icon: 'warning', showCancelButton: true,
            confirmButtonColor: '#1e40af', cancelButtonColor: '#ef4444', confirmButtonText: 'Yes',
            customClass: { popup: 'swal-small-modal', title: 'text-slate-800 font-black' }
        }).then((res) => { if (res.isConfirmed) router.post('/logout') })
    }

    const set = (field) => (e) => {
        setForm(f => ({ ...f, [field]: e.target.value }))
        if (errors[field]) setErrors(err => { const n = { ...err }; delete n[field]; return n })
    }

    const handleTypeSelect = (typeId) => {
        setForm(f => ({ ...f, application_type: typeId }))
        if (errors.application_type) setErrors(err => { const n = { ...err }; delete n.application_type; return n })
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

    const validateStep = (step) => {
        const newErrors = {}

        if (step === 1) {
            if (!form.application_type) newErrors.application_type = 'Required'
            if (!form.application_form_number?.trim()) newErrors.application_form_number = 'Required'
        }

        if (step === 2) {
            if (!form.applicant_name?.trim()) newErrors.applicant_name = 'Required'
            if (!form.contact_number?.trim()) newErrors.contact_number = 'Required'
            if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) newErrors.email = 'Enter a valid email'
        }

        if (step === 3) {
            if (!form.barangay?.trim()) newErrors.barangay = 'Required'
            if (!form.property_index_number?.trim()) newErrors.property_index_number = 'Required'

            if (!form.parcels.length) {
                newErrors.parcels = 'At least one parcel is required'
            } else {
                form.parcels.forEach((parcel, index) => {
                    if (!parcel.lot_number?.trim() && !parcel.tct_number?.trim() && !parcel.tax_dec_number?.trim()) {
                        newErrors[`parcels.${index}.lot_number`] = 'Add at least one parcel identifier'
                    }

                    if (!parcel.lot_area_sqm || Number(parcel.lot_area_sqm) <= 0) {
                        newErrors[`parcels.${index}.lot_area_sqm`] = 'Declared area is required'
                    }
                })
            }
        }

        setErrors(newErrors)
        return Object.keys(newErrors).length === 0
    }

    const handleNext = () => {
        if (validateStep(currentStep)) {
            setCurrentStep(p => p + 1)
            if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: 'smooth' })
        } else {
            setFlash({ type: 'error', msg: 'Please complete highlighted fields.' })
            setTimeout(() => setFlash(null), 3000)
        }
    }

    const handleBack = () => {
        if (currentStep > 1) setCurrentStep(p => p - 1)
        if (formRef.current) formRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!form.assessment_fee) {
            setErrors({ assessment_fee: "Assessment fee is required for routing." })
            return setFlash({ type: 'error', msg: 'Assessment fee is required.' })
        }

        setSubmitting(true); setErrors({})

        router.post('/applications/encode', form, {
            onSuccess: (page) => {
                const ref = page.props.flash?.reference_number || `IMP-${Math.floor(1000 + Math.random() * 9000)}`
                Swal.fire({
                    icon: 'success', title: 'Applicant Registered',
                    html: `<div class="bg-slate-50 p-4 rounded-xl border border-slate-200 mt-2">
                             <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Reference Number</span>
                             <strong class="text-2xl font-mono font-black text-blue-700 tracking-tight">${ref}</strong>
                           </div>`,
                    confirmButtonColor: '#2563eb', customClass: { popup: 'swal-small-modal rounded-3xl', title: 'font-black text-slate-800 text-xl' }
                })
                setCurrentStep(1)
                setForm({
                    ...form,
                    application_type: '',
                    application_form_number: '',
                    land_use_class: '',
                    purpose: '',
                    applicant_name: '',
                    contact_number: '',
                    email: '',
                    representative_name: '',
                    barangay: '',
                    street_address: '',
                    property_index_number: '',
                    assessment_fee: '',
                    or_number: '',
                    remarks: '',
                    parcels: [{ parcel_code: 'P-01', lot_number: '', tct_number: '', tax_dec_number: '', lot_area_sqm: '', coordinates: '' }],
                })
            },
            onError: (errs) => {
                console.log('Server validation errors:', errs)

                setErrors(errs);
                if (errs.application_type || errs.land_use_class || errs.purpose) {
                    setCurrentStep(1);
                } else if (errs.applicant_name || errs.contact_number || errs.email || errs.representative_name) {
                    setCurrentStep(2);
                } else if (errs.barangay || errs.street_address || errs.lot_number || errs.tct_number || errs.lot_area_sqm || errs.coordinates) {
                    setCurrentStep(3);
                } else {
                    setCurrentStep(5);
                }
                setFlash({ type: 'error', msg: 'Validation failed. Please check the highlighted fields.' })
            },
            onFinish: () => setSubmitting(false),
        })
    }

    const fieldError = (field) => {
        const errorMsg = Array.isArray(errors[field]) ? errors[field][0] : errors[field];
        return errorMsg ? <p className="absolute -bottom-4 left-1 text-[9px] text-red-500 font-bold whitespace-nowrap">{errorMsg}</p> : null;
    }

    return (
        <>
            <Head title="New Application | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }

                .swal-small-modal { width: 340px !important; padding: 1.5rem !important; border-radius: 20px !important; }
                
                .radio-card input:checked + div { border-color: #2563eb; background-color: #eff6ff; box-shadow: inset 0 0 0 1px #2563eb; }
                .radio-card input:checked + div .icon-box { background-color: #2563eb; color: white; }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">

                {/* ── NAVBAR ── */}
                <header className="h-14 bg-white border-b border-slate-200 shadow-sm flex items-center justify-between px-4 sm:px-6 shrink-0 z-[700] sticky top-0">
                    <div className="flex items-center gap-4 lg:gap-6">
                        <a href="#" className="flex items-center gap-2.5 group">
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

                    <div className="hidden lg:flex flex-1 max-w-md mx-6">
                        <div className="relative w-full">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <input type="text" placeholder="Search applications..." className="block w-full pl-8 pr-10 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none" />
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
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="applications"
                    />
                    {/* ── WORKSPACE ── */}
                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? '200px' : '0px' }}>
                        <div className="p-3 md:p-5 flex-1 flex flex-col h-full overflow-hidden">

                            {/* Header Area */}
                            <div className="max-w-[1000px] mx-auto w-full mb-3 flex-shrink-0 flex items-center justify-between gap-4">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        <span className="text-slate-800">Applications</span>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                        <span className="text-slate-500">Encode</span>
                                    </div>
                                    <h2 className="text-xl font-black text-slate-800 tracking-tight leading-none">New Record</h2>
                                </div>

                                {flash && (
                                    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border shadow-sm ${flash.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>
                                        {flash.type === 'success' ? <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg> : <svg className="w-4 h-4 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>}
                                        <p className="font-bold text-[11px] flex-1 leading-tight">{flash.msg}</p>
                                        <button onClick={() => setFlash(null)} className="text-slate-400 hover:text-slate-800"><svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg></button>
                                    </div>
                                )}
                            </div>

                            {/* UNIFIED CARD */}
                            <div className="max-w-[1000px] mx-auto w-full bg-white rounded-2xl shadow-[0_2px_20px_rgb(0,0,0,0.04)] border border-slate-200/80 overflow-hidden flex flex-col md:flex-row flex-1 min-h-0">

                                {/* LEFT: TIMELINE */}
                                <div className="w-full md:w-[220px] lg:w-[240px] bg-slate-50/50 border-r border-slate-100 p-5 flex flex-col shrink-0 overflow-y-auto">
                                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-8 mt-2 hidden md:block">
                                        {STEPS.map((step) => {
                                            const isCompleted = currentStep > step.id
                                            const isCurrent = currentStep === step.id
                                            return (
                                                <div key={step.id} className="relative pl-5 cursor-pointer group" onClick={() => isCompleted && setCurrentStep(step.id)}>
                                                    {isCompleted && <div className="absolute left-[-2px] top-0 bottom-[-32px] w-[2px] bg-blue-500 z-0"></div>}
                                                    <div className={`absolute left-[-13px] top-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 z-10 border-[1.5px]
                                                        ${isCompleted ? 'bg-blue-500 border-blue-500 text-white' :
                                                            isCurrent ? 'bg-white border-blue-600 text-blue-600 shadow-[0_0_0_3px_rgba(37,99,235,0.15)] scale-110' :
                                                                'bg-slate-50 border-slate-300 text-slate-400 group-hover:border-slate-400'}`}>
                                                        {isCompleted ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg> : <span className="text-[11px] font-black">{step.id}</span>}
                                                    </div>
                                                    <div>
                                                        <p className={`text-[12px] font-bold tracking-tight transition-colors leading-tight ${isCurrent ? 'text-blue-700' : isCompleted ? 'text-slate-800' : 'text-slate-400 group-hover:text-slate-600'}`}>{step.title}</p>
                                                        <p className={`text-[10px] font-medium mt-0.5 leading-tight ${isCurrent ? 'text-slate-600' : 'text-slate-400'}`}>{step.subtitle}</p>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* RIGHT: FORM AREA */}
                                <div ref={formRef} className="flex-1 p-5 flex flex-col relative bg-white overflow-y-auto">
                                    <form onSubmit={handleSubmit} className="flex-1 flex flex-col h-full w-full">

                                        {/* ── STEP 1: SCOPE ── */}
                                        {currentStep === 1 && (
                                            <div className="form-enter flex-1 flex flex-col">
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-3 pb-2 border-b border-slate-100 flex-shrink-0">Application Parameters</h3>
                                                <div className="flex-1 flex flex-col gap-y-4">
                                                    <div>
                                                        <Label required hasError={!!errors.application_type}>Application Category</Label>
                                                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 mt-1">
                                                            {APPLICATION_TYPES.map((type) => (
                                                                <label key={type.id} className="radio-card relative cursor-pointer group">
                                                                    <input type="radio" name="app_type" value={type.id} checked={form.application_type === type.id} onChange={() => handleTypeSelect(type.id)} className="peer sr-only" />
                                                                    <div className="p-2 rounded-[10px] border border-slate-200 bg-white transition-all duration-200 group-hover:border-blue-300 flex items-center gap-2">
                                                                        <div className="icon-box w-7 h-7 rounded-md bg-slate-50 flex items-center justify-center text-slate-400 shrink-0">
                                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d={type.icon} /></svg>
                                                                        </div>
                                                                        <div className="min-w-0 flex-1">
                                                                            <p className="text-[11px] font-bold text-slate-800 leading-tight truncate">{type.id}</p>
                                                                            <p className="text-[9px] font-medium text-slate-500 truncate mt-0.5">{type.desc}</p>
                                                                        </div>
                                                                    </div>
                                                                </label>
                                                            ))}
                                                        </div>
                                                        {fieldError('application_type')}
                                                    </div>

                                                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                        <div className="relative">
                                                            <Label required hasError={!!errors.application_form_number}>Application Form Number</Label>
                                                            <Input type="text" value={form.application_form_number} onChange={set('application_form_number')} placeholder="Enter form number" hasError={!!errors.application_form_number} />
                                                            {fieldError('application_form_number')}
                                                        </div>
                                                        <div className="relative">
                                                            <Label required hasError={!!errors.land_use_class}>Target Zoning Class</Label>
                                                            <Select value={form.land_use_class} onChange={set('land_use_class')} hasError={!!errors.land_use_class}>
                                                                <option value="" disabled>Select dominant use...</option>
                                                                {LAND_USE_CLASSES.map(c => <option key={c}>{c}</option>)}
                                                            </Select>
                                                            {fieldError('land_use_class')}
                                                        </div>
                                                    </div>

                                                    <div className="relative flex-1 flex flex-col">
                                                        <Label required hasError={!!errors.purpose}>Operational Purpose</Label>
                                                        <Textarea rows={2} value={form.purpose} onChange={set('purpose')} placeholder="Explicitly detail the intended use of the land or structure..." className="flex-1 min-h-[60px]" hasError={!!errors.purpose} />
                                                        {fieldError('purpose')}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── STEP 2: PROFILE ── */}
                                        {currentStep === 2 && (
                                            <div className="form-enter flex-1 flex flex-col">
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-3 pb-2 border-b border-slate-100 flex-shrink-0">Applicant Identity</h3>
                                                <div className="space-y-4 flex-1">
                                                    <div className="relative">
                                                        <Label required hasError={!!errors.applicant_name}>Registered Applicant / Corp</Label>
                                                        <Input type="text" value={form.applicant_name} onChange={set('applicant_name')} placeholder="Exact legal name" hasError={!!errors.applicant_name} />
                                                        {fieldError('applicant_name')}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-4">
                                                        <div className="relative">
                                                            <Label required hasError={!!errors.contact_number}>Primary Phone</Label>
                                                            <div className="relative">
                                                                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-mono text-[12px] font-bold pointer-events-none">+63</span>
                                                                <Input type="tel" value={form.contact_number} onChange={handleContactInput} maxLength={10} placeholder="9XXXXXXXXX" className="pl-10 font-mono" hasError={!!errors.contact_number} />
                                                            </div>
                                                            {fieldError('contact_number')}
                                                        </div>
                                                        <div className="relative">
                                                            <Label hasError={!!errors.email}>Email Address</Label>
                                                            <Input type="email" value={form.email} onChange={set('email')} placeholder="contact@domain.com" />
                                                        </div>
                                                    </div>
                                                    <div className="p-4 bg-slate-50/80 border border-slate-200/60 rounded-[10px] relative mt-1">
                                                        <Label>Authorized Representative</Label>
                                                        <Input type="text" value={form.representative_name} onChange={set('representative_name')} placeholder="Full name of representative" className="bg-white mt-1" />
                                                        <p className="text-[10px] text-slate-500 mt-1.5 font-medium">Leave blank if the applicant is filing this directly.</p>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── STEP 3: LOCATION (multi-parcel) ── */}
                                        {currentStep === 3 && (
                                            <div className="form-enter flex-1 flex flex-col">
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-3 pb-2 border-b border-slate-100 flex-shrink-0">Property Location</h3>
                                                <div className="flex-1 flex flex-col gap-4 overflow-y-auto pr-1">
                                                    <div className="rounded-[12px] border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
                                                        <div className="mb-4">
                                                            <Label required hasError={!!errors.barangay}>Jurisdiction / Barangay</Label>
                                                            <Select value={form.barangay} onChange={set('barangay')} hasError={!!errors.barangay}>
                                                                <option value="" disabled>Search jurisdiction...</option>
                                                                {BARANGAYS.map((b) => <option key={b}>{b}</option>)}
                                                            </Select>
                                                            {fieldError('barangay')}
                                                        </div>

                                                        <div>
                                                            <Label>Exact Site Address</Label>
                                                            <Input type="text" value={form.street_address} onChange={set('street_address')} placeholder="e.g. Purok 3, Sitio Bulod" />
                                                        </div>

                                                        <div className="relative">
                                                            <Label required hasError={!!errors.property_index_number}>Property Index Number</Label>
                                                            <Input type="text" value={form.property_index_number} onChange={set('property_index_number')} placeholder="Enter property index number" hasError={!!errors.property_index_number} />
                                                            {fieldError('property_index_number')}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3">
                                                        {form.parcels.map((parcel, index) => (
                                                            <div key={index} className="rounded-[12px] border border-slate-200 bg-white p-3.5 shadow-sm">
                                                                <div className="flex items-center justify-between mb-2.5">
                                                                    <span className="inline-flex items-center gap-1.5 text-[11px] font-black text-blue-700 bg-blue-50 border border-blue-100 px-2 py-0.5 rounded-md">
                                                                        {parcel.parcel_code}
                                                                    </span>
                                                                    {form.parcels.length > 1 && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => removeParcel(index)}
                                                                            className="text-[10px] font-bold text-red-500 hover:text-red-700 uppercase tracking-wider flex items-center gap-1"
                                                                        >
                                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                                                                            Remove
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-3">
                                                                    <div className="relative">
                                                                        <Label hasError={!!errors[`parcels.${index}.lot_number`]}>Lot Identifier</Label>
                                                                        <Input
                                                                            type="text"
                                                                            value={parcel.lot_number}
                                                                            onChange={setParcelField(index, 'lot_number')}
                                                                            placeholder="e.g. Lot 12 Blk 4"
                                                                            className="bg-white"
                                                                            hasError={!!errors[`parcels.${index}.lot_number`]}
                                                                        />
                                                                        {parcelFieldError(index, 'lot_number')}
                                                                    </div>
                                                                    <div className="relative">
                                                                        <Label hasError={!!errors[`parcels.${index}.tct_number`]}>TCT / Title No.</Label>
                                                                        <Input
                                                                            type="text"
                                                                            value={parcel.tct_number}
                                                                            onChange={setParcelField(index, 'tct_number')}
                                                                            placeholder="e.g. TCT-T-123456"
                                                                            className="font-mono uppercase bg-white"
                                                                            hasError={!!errors[`parcels.${index}.tct_number`]}
                                                                        />
                                                                        {parcelFieldError(index, 'tct_number')}
                                                                    </div>
                                                                    <div className="relative">
                                                                        <Label hasError={!!errors[`parcels.${index}.tax_dec_number`]}>Tax Declaration No.</Label>
                                                                        <Input
                                                                            type="text"
                                                                            value={parcel.tax_dec_number}
                                                                            onChange={setParcelField(index, 'tax_dec_number')}
                                                                            placeholder="e.g. TD-2026-001"
                                                                            className="font-mono uppercase bg-white"
                                                                            hasError={!!errors[`parcels.${index}.tax_dec_number`]}
                                                                        />
                                                                        {parcelFieldError(index, 'tax_dec_number')}
                                                                    </div>
                                                                    <div className="relative">
                                                                        <Label required hasError={!!errors[`parcels.${index}.lot_area_sqm`]}>Declared Floor Area</Label>
                                                                        <div className="relative">
                                                                            <Input
                                                                                type="number"
                                                                                value={parcel.lot_area_sqm}
                                                                                onChange={setParcelField(index, 'lot_area_sqm')}
                                                                                min="0"
                                                                                step="0.01"
                                                                                placeholder="e.g. 250.00"
                                                                                className="pr-10 font-mono bg-white"
                                                                                hasError={!!errors[`parcels.${index}.lot_area_sqm`]}
                                                                            />
                                                                            <span className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 font-bold text-[9px] pointer-events-none">SQM</span>
                                                                        </div>
                                                                        {parcelFieldError(index, 'lot_area_sqm')}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <button
                                                        type="button"
                                                        onClick={addParcel}
                                                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-[10px] border border-dashed border-slate-300 text-slate-500 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 font-bold text-[12px] transition-all flex-shrink-0"
                                                    >
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                                                        Add another parcel
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── STEP 4: DOSSIER REVIEW ── */}
                                        {currentStep === 4 && (
                                            <div className="form-enter flex-1 flex flex-col">
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-3 pb-2 border-b border-slate-100 flex-shrink-0">Review Summary</h3>
                                                <div className="flex-1 overflow-y-auto space-y-3 pr-2">

                                                    {/* Scope Review Card */}
                                                    <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3.5 relative group">
                                                        <button type="button" onClick={() => setCurrentStep(1)} className="absolute top-3 right-3 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                                                        <h4 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2.5">1. Scope & Category</h4>
                                                        <div className="grid grid-cols-2 gap-2.5">
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Application</p>
                                                                <p className="text-[12px] font-bold text-slate-800">{form.application_type || '—'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Zoning Class</p>
                                                                <p className="text-[12px] font-bold text-slate-800">{form.land_use_class || '—'}</p>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Purpose</p>
                                                                <p className="text-[11px] font-medium text-slate-700 break-words line-clamp-2">{form.purpose || '—'}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Profile Review Card */}
                                                    <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3.5 relative group">
                                                        <button type="button" onClick={() => setCurrentStep(2)} className="absolute top-3 right-3 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                                                        <h4 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2.5">2. Entity Profile</h4>
                                                        <div className="grid grid-cols-2 gap-2.5">
                                                            <div className="col-span-2">
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Principal Applicant</p>
                                                                <p className="text-[12px] font-bold text-slate-800">{form.applicant_name || '—'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Contact</p>
                                                                <p className="text-[11px] font-mono text-slate-800">{form.contact_number ? `+63 ${form.contact_number}` : '—'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Proxy/Rep</p>
                                                                <p className="text-[11px] font-medium text-slate-700">{form.representative_name || 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Location Review Card */}
                                                    <div className="bg-slate-50 border border-slate-200 rounded-[10px] p-3.5 relative group">
                                                        <button type="button" onClick={() => setCurrentStep(3)} className="absolute top-3 right-3 text-[10px] font-bold text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider flex items-center gap-1"><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>Edit</button>
                                                        <h4 className="text-[9px] font-bold uppercase tracking-[0.15em] text-slate-400 mb-2.5">3. Geospatial Data</h4>
                                                        <div className="grid grid-cols-2 gap-2.5">
                                                            <div className="col-span-2">
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Location</p>
                                                                <p className="text-[12px] font-bold text-slate-800">{form.barangay ? `Brgy. ${form.barangay}` : '—'} {form.street_address ? `(${form.street_address})` : ''}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Property Index</p>
                                                                <p className="text-[11px] font-mono text-slate-800 uppercase">{form.property_index_number || '—'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Tax Declaration Number</p>
                                                                <p className="text-[11px] font-mono text-slate-800 uppercase">{form.parcels[0]?.tax_dec_number || '—'}</p>
                                                            </div>
                                                            <div>
                                                                <p className="text-[9px] font-semibold text-slate-500 uppercase tracking-widest mb-0.5">Total Lot Area</p>
                                                                <p className="text-[11px] font-mono text-slate-800">{totalAreaSqm > 0 ? `${totalAreaSqm.toFixed(2)} sq.m.` : '—'}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── STEP 5: FINAL ASSESSMENT ── */}
                                        {currentStep === 5 && (
                                            <div className="form-enter flex-1 flex flex-col">
                                                <h3 className="text-lg font-black text-slate-800 tracking-tight mb-3 pb-2 border-b border-slate-100 flex-shrink-0">Final Assessment</h3>
                                                <div className="flex-1 flex flex-col justify-center max-w-md mx-auto w-full">
                                                    <div className="bg-blue-50 border-2 border-blue-100 rounded-[14px] p-5 shadow-sm">
                                                        <div className="text-center mb-4">
                                                            <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm border border-blue-100 text-blue-600">
                                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                                                            </div>
                                                            <h4 className="text-[12px] font-black uppercase tracking-[0.1em] text-blue-800">Official Routing</h4>
                                                            <p className="text-[11px] text-blue-600/80 font-medium mt-0.5">Please log the assessment fee before finalizing.</p>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <div className="relative">
                                                                <Label required hasError={!!errors.assessment_fee}>Calculated Fee</Label>
                                                                <div className="relative">
                                                                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 font-mono text-[14px] font-black pointer-events-none">₱</span>
                                                                    <Input type="number" value={form.assessment_fee} onChange={set('assessment_fee')} onBlur={handleFeeBlur} min="0" step="0.01" placeholder="0.00"
                                                                        className="pl-8 font-mono font-black text-[15px] text-blue-900 bg-white" hasError={!!errors.assessment_fee} />
                                                                </div>
                                                                {fieldError('assessment_fee')}
                                                            </div>
                                                            <div className="relative">
                                                                <Label>Official Receipt No.</Label>
                                                                <Input type="text" value={form.or_number} onChange={set('or_number')} placeholder="OR-XXXX" className="font-mono uppercase bg-white" />
                                                            </div>
                                                            <div className="relative">
                                                                <Label>Internal Remarks</Label>
                                                                <Textarea rows={2} value={form.remarks} onChange={set('remarks')} placeholder="Deficiencies, notes..." className="bg-white" />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* ── FOOTER ACTIONS ── */}
                                        <div className="mt-4 pt-4 flex justify-between items-center border-t border-slate-100 flex-shrink-0">
                                            <button type="button" onClick={handleBack} disabled={currentStep === 1 || submitting}
                                                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] font-bold text-[12px] transition-all
                                                    ${currentStep === 1 ? 'text-slate-300 opacity-50 cursor-not-allowed' : 'text-slate-600 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}>
                                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                                                Back
                                            </button>

                                            {currentStep < 5 ? (
                                                <button type="button" onClick={handleNext}
                                                    className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white font-bold text-[12px] shadow-sm transition-all active:scale-95">
                                                    Continue
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                                                </button>
                                            ) : (
                                                <button type="submit" disabled={submitting}
                                                    className="inline-flex items-center gap-1.5 px-6 py-2 rounded-[10px] bg-blue-600 hover:bg-blue-700 text-white font-black text-[13px] shadow-md shadow-blue-500/20 transition-all active:scale-95 disabled:opacity-70">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                                    {submitting ? 'Processing...' : 'Confirm & Save'}
                                                </button>
                                            )}
                                        </div>

                                    </form>
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        </>
    )
}