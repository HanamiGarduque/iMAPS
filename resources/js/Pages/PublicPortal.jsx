import { useState, useRef } from 'react'
import { Head } from '@inertiajs/react'
import { createClient } from '@supabase/supabase-js'

// ── Status config ──
const STATUS_CONFIG = {
    'Received':                { bg: '#f0fdf4', color: '#15803d', border: '#bbf7d0' },
    'Technical Review':        { bg: '#fffbeb', color: '#b45309', border: '#fde68a' },
    'Under Sangguniang Bayan': { bg: '#f5f3ff', color: '#6d28d9', border: '#ddd6fe' },
    'For Release':             { bg: '#eff6ff', color: '#1d4ed8', border: '#bfdbfe' },
    'Released':                { bg: '#eef4ff', color: '#1a45ee', border: '#bcd4ff' },
    'Denied':                  { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
}

const PIPELINE_STEPS = [
    { key: 'Received',                label: 'Received',     num: '1' },
    { key: 'Technical Review',        label: 'Tech. Review', num: '2' },
    { key: 'Under Sangguniang Bayan', label: 'SB Review',    num: '3' },
    { key: 'For Release',             label: 'For Release',  num: '4' },
    { key: 'Released',                label: 'Released',     num: '5' },
]

const PIPELINE_ORDER = {
    'Received': 0, 'Technical Review': 1,
    'Under Sangguniang Bayan': 2, 'For Release': 3, 'Released': 4,
}

const SERVICES = [
    {
        title: 'Locational Clearance',
        desc:  'Required clearance confirming your project location is suitable for the intended use.',
        time:  '3 weeks – 1 month',
        icon:  'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z',
    },
    {
        title: 'Zoning Certification',
        desc:  'Verify if your proposed use complies with the zoning ordinance of the municipality.',
        time:  '3–5 working days',
        icon:  'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z',
    },
    {
        title: 'Development Permit',
        desc:  'Permit for construction, alteration, or development projects within the municipality.',
        time:  'Varies by project',
        icon:  'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4',
    },
    {
        title: 'Compliance Certificate',
        desc:  'Certification that your existing structure complies with zoning regulations.',
        time:  '5–7 working days',
        icon:  'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
]

const PROCESS_STEPS = [
    { n: '01', title: 'Submit Requirements',      desc: 'Submit your complete application with all required documents at the MPDO window.' },
    { n: '02', title: 'Technical Review',         desc: 'Our staff reviews your application for zoning compliance and may schedule a site inspection.' },
    { n: '03', title: 'Sangguniang Bayan Review', desc: 'For locational clearances, your application is reviewed by the municipal council.' },
    { n: '04', title: 'Get Notified',             desc: 'Receive SMS updates on your application status throughout the process.' },
    { n: '05', title: 'Claim Your Document',      desc: 'Pick up your approved certificate at Window 2 with your original ID.' },
]

// ── Status Badge ──
function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
    return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-bold"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}` }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />
            {status}
        </span>
    )
}

// ── Progress Pipeline ──
function Pipeline({ status }) {
    const isDenied   = status === 'Denied'
    const currentIdx = PIPELINE_ORDER[status] ?? 0

    const getState = (stepKey, i) => {
        if (isDenied) return stepKey === 'Received' ? 'done' : 'idle'
        if (i < currentIdx)  return 'done'
        if (i === currentIdx) return 'active'
        return 'idle'
    }

    return (
        <div className="px-6 py-6 border-b border-slate-100">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-widest mb-5">Progress</p>
            <div className="flex items-start relative">
                {PIPELINE_STEPS.map((step, i) => {
                    const state = getState(step.key, i)
                    return (
                        <div key={step.key} className="flex-1 flex flex-col items-center relative">
                            {i < PIPELINE_STEPS.length - 1 && (
                                <div className="absolute top-4 left-1/2 w-full h-0.5 z-0"
                                    style={{ background: state === 'done' ? '#1a45ee' : '#e2e8f0' }} />
                            )}
                            <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold relative z-10 transition-all"
                                style={{
                                    background: state === 'done' ? '#1a45ee' : state === 'active' ? '#fff' : '#f1f5f9',
                                    color:      state === 'done' ? '#fff'    : state === 'active' ? '#1a45ee' : '#94a3b8',
                                    border:     state === 'active' ? '2px solid #1a45ee' : state === 'done' ? '2px solid #1a45ee' : '2px solid #e2e8f0',
                                    boxShadow:  state === 'active' ? '0 0 0 4px rgba(26,69,238,.12)' : 'none',
                                }}>
                                {state === 'done'
                                    ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                                    : step.num
                                }
                            </div>
                            <p className="text-[10px] font-semibold text-center mt-2 max-w-[72px] leading-tight"
                                style={{ color: state === 'done' ? '#1a45ee' : state === 'active' ? '#1e293b' : '#94a3b8', fontWeight: state === 'active' ? 700 : 600 }}>
                                {step.label}
                            </p>
                        </div>
                    )
                })}
            </div>
        </div>
    )
}

// ── Result Card ──
function ResultCard({ result }) {
    const isDenied = result.status === 'Denied'

    const formatDate = (d) => d
        ? new Date(d).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
        : '—'

    return (
        <div className="max-w-xl mx-auto mt-6">
            <div className="bg-white rounded-2xl overflow-hidden"
                style={{ boxShadow: '0 20px 60px rgba(17,28,85,.18)' }}>

                {/* Header */}
                <div className="px-6 py-5 flex items-start justify-between gap-4">
                    <div>
                        <p className="text-[11px] font-mono text-slate-400 tracking-widest mb-1">
                            {result.reference_number}
                        </p>
                        <h3 className="font-bold text-slate-900 text-lg leading-tight">
                            {result.masked_applicant_name}
                        </h3>
                    </div>
                    <StatusBadge status={result.status} />
                </div>

                {/* Pipeline or Denied */}
                {!isDenied ? (
                    <Pipeline status={result.status} />
                ) : (
                    <div className="px-6 py-4 bg-red-50 border-y border-red-100 flex items-center gap-3">
                        <svg className="w-5 h-5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                                d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-sm text-red-700 font-medium">
                            This application has been denied. Please visit the MPDO office for more information.
                        </p>
                    </div>
                )}

                {/* Date received */}
                <div className="px-6 py-4 flex items-center gap-3 border-t border-slate-100">
                    <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div>
                        <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">Date received</p>
                        <p className="text-sm font-medium text-slate-800 mt-0.5">{formatDate(result.created_at)}</p>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center gap-2">
                    <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
                            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-slate-400">
                        Visit the MPDO window at the Municipal Hall or call (000) 123-4567.
                    </p>
                </div>
            </div>
        </div>
    )
}

// ── Main Page ──
export default function PublicPortal({ supabaseUrl, supabaseKey }) {
    const [ref, setRef]       = useState('')
    const [result, setResult] = useState(null)
    const [error, setError]   = useState(null)
    const [loading, setLoading] = useState(false)
    const [isLive, setIsLive] = useState(false)
    const channelRef          = useRef(null)
    const supabase            = useRef(createClient(supabaseUrl, supabaseKey)).current

    const handleSearch = async (e) => {
        e.preventDefault()
        const refInput = ref.trim().toUpperCase()
        if (!refInput) return

        setLoading(true)
        setError(null)
        setResult(null)
        setIsLive(false)

        // Unsubscribe from any previous subscription
        channelRef.current?.unsubscribe()

        // 1. Initial fetch — get latest status row
        const { data, error: fetchError } = await supabase
            .from('application_status_tracks')
            .select('*')
            .eq('reference_number', refInput)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

        setLoading(false)

        if (fetchError || !data) {
            setError('No application found with that reference number. Please double-check and try again.')
            return
        }

        setResult(data)

        // 2. Subscribe to live inserts
        channelRef.current = supabase
            .channel(`status:${refInput}`)
            .on('postgres_changes', {
                event:  'INSERT',
                schema: 'public',
                table:  'application_status_tracks',
                filter: `reference_number=eq.${refInput}`,
            }, (payload) => {
                setResult(payload.new)
                setIsLive(true)
            })
            .subscribe()
    }

    return (
        <>
            <Head title="iMAPS Rosario | Application Tracking Portal" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                * { box-sizing: border-box; }
                html { scroll-behavior: smooth; }
                body { font-family: 'DM Sans', sans-serif; background: #fff; color: #1e293b; margin: 0; }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
                @keyframes fadeUp { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
                @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
                .fade-up { animation: fadeUp .5s ease both; }
                .fade-in { animation: fadeIn .4s ease both; }
            `}</style>

            {/* ── Navbar ── */}
            <nav className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-100">
                <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                            </svg>
                        </div>
                        <div>
                            <span className="font-bold text-slate-900 text-sm tracking-tight">iMAPS</span>
                            <span className="text-slate-300 mx-1.5 text-xs">·</span>
                            <span className="text-slate-400 text-xs">Rosario</span>
                        </div>
                    </div>

                    <div className="hidden md:flex items-center gap-6">
                        {[['#track','Track Application'],['#services','Services'],['#process','Process'],['#contact','Contact']].map(([href, label]) => (
                            <a key={href} href={href}
                                className="text-[13.5px] font-medium text-slate-500 hover:text-blue-600 transition-colors no-underline">
                                {label}
                            </a>
                        ))}
                    </div>

                    <a href="/login"
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:border-blue-300 hover:text-blue-700 hover:bg-blue-50 transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        Staff Login
                    </a>
                </div>
            </nav>

            {/* ── Hero + Tracker ── */}
            <section id="track" className="py-20 px-4 relative overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #111c55 0%, #1333db 50%, #1a45ee 100%)' }}>
                <div className="absolute inset-0 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,.12) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
                <div className="absolute inset-0 pointer-events-none"
                    style={{ backgroundImage: 'radial-gradient(circle at 70% 30%, rgba(255,255,255,.06) 0%, transparent 60%), radial-gradient(circle at 20% 80%, rgba(255,255,255,.04) 0%, transparent 40%)' }} />

                <div className="max-w-6xl mx-auto relative z-10">

                    {/* Hero text */}
                    <div className="text-center mb-12 fade-up">
                        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-white/80 text-xs font-medium mb-4 border border-white/15"
                            style={{ background: 'rgba(255,255,255,.1)' }}>
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                            Municipal Permit Tracking System
                        </span>
                        <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4">
                            Track Your Application<br className="hidden sm:block" /> Status
                        </h1>
                        <p className="text-white/60 text-base max-w-lg mx-auto">
                            Enter your reference number to check the status of your zoning certificate,
                            locational clearance, or development permit application.
                        </p>
                    </div>

                    {/* Search card */}
                    <div className="max-w-xl mx-auto fade-up">
                        <div className="bg-white rounded-2xl p-9"
                            style={{ boxShadow: '0 20px 60px rgba(17,28,85,.18), 0 4px 16px rgba(17,28,85,.08)' }}>
                            <form onSubmit={handleSearch}>
                                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-widest mb-2">
                                    Reference Number
                                </label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={ref}
                                        onChange={e => setRef(e.target.value.toUpperCase())}
                                        placeholder="e.g. ZA-LC-2026-00042"
                                        autoComplete="off"
                                        spellCheck="false"
                                        className="flex-1 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm text-slate-800 tracking-wide uppercase focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
                                    />
                                    <button type="submit" disabled={loading}
                                        className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-semibold text-sm transition-colors whitespace-nowrap flex items-center gap-2">
                                        {loading
                                            ? <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                              </svg>
                                            : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                              </svg>
                                        }
                                        {loading ? 'Searching...' : 'Track'}
                                    </button>
                                </div>
                                <p className="mt-3 text-xs text-slate-400">
                                    Don't have a reference number?{' '}
                                    <a href="#contact" className="text-blue-600 font-medium hover:underline">Contact us</a>
                                </p>
                            </form>
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="max-w-xl mx-auto mt-4 fade-in">
                            <div className="flex items-start gap-3 px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                                <svg className="w-5 h-5 mt-0.5 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span>{error}</span>
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && <ResultCard result={result} />}

                    {/* Live indicator */}
                    {result && isLive && (
                        <div className="max-w-2xl mx-auto mt-2 fade-in flex items-center justify-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            <span className="text-xs text-white/70">Status updated live</span>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Services ── */}
            <section id="services" className="py-20 px-4 bg-slate-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">What We Offer</p>
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Our Services</h2>
                        <p className="mt-3 text-slate-500 text-sm max-w-lg mx-auto">
                            The Municipal Planning and Development Office offers various permits and clearances for your building and development needs.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                        {SERVICES.map(svc => (
                            <div key={svc.title}
                                className="bg-white border border-slate-200 rounded-2xl p-7 transition-all hover:-translate-y-0.5 hover:border-blue-200"
                                style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}
                                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 8px 32px rgba(26,69,238,.1)'}
                                onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,.04)'}>
                                <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={svc.icon} />
                                    </svg>
                                </div>
                                <h3 className="font-semibold text-slate-900 text-sm mb-2">{svc.title}</h3>
                                <p className="text-xs text-slate-500 mb-4 leading-relaxed">{svc.desc}</p>
                                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                    {svc.time}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="h-px max-w-4xl mx-auto" style={{ background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)' }} />

            {/* ── Process ── */}
            <section id="process" className="py-20 px-4">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-12">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">How It Works</p>
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Application Process</h2>
                        <p className="mt-3 text-slate-500 text-sm max-w-lg mx-auto">
                            Follow these simple steps to apply for your permit or clearance.
                        </p>
                    </div>
                    <div className="max-w-2xl mx-auto flex flex-col gap-6">
                        {PROCESS_STEPS.map((step, i) => (
                            <div key={step.n}>
                                <div className="flex gap-5 items-start">
                                    <div className="w-10 h-10 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center font-extrabold text-[13px] shrink-0">
                                        {step.n}
                                    </div>
                                    <div className="pt-1">
                                        <h3 className="font-semibold text-slate-900 text-sm mb-1">{step.title}</h3>
                                        <p className="text-xs text-slate-500 leading-relaxed">{step.desc}</p>
                                    </div>
                                </div>
                                {i < PROCESS_STEPS.length - 1 && (
                                    <div className="ml-5 w-px h-5 bg-slate-200 mt-3" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            <div className="h-px max-w-4xl mx-auto" style={{ background: 'linear-gradient(90deg, transparent, #e2e8f0, transparent)' }} />

            {/* ── Contact ── */}
            <section id="contact" className="py-20 px-4 bg-slate-50">
                <div className="max-w-6xl mx-auto">
                    <div className="text-center mb-10">
                        <p className="text-xs font-semibold text-blue-600 uppercase tracking-widest mb-2">Get In Touch</p>
                        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Contact Us</h2>
                    </div>
                    <div className="max-w-2xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-5">
                        {[
                            { label: 'Address',      value: 'Municipal Hall, Rosario, Batangas', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' },
                            { label: 'Phone',        value: '(000) 123-4567',                    icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' },
                            { label: 'Office Hours', value: 'Mon–Fri\n8:00 AM – 5:00 PM',       icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                        ].map(item => (
                            <div key={item.label} className="bg-white border border-slate-200 rounded-2xl p-6 text-center"
                                style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                                <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-3">
                                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                                        <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                                    </svg>
                                </div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{item.label}</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{item.value}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── Footer ── */}
            <footer className="py-12 px-4" style={{ background: '#0d1529' }}>
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-10 mb-10">
                        <div>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center">
                                    <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                                    </svg>
                                </div>
                                <span className="font-bold text-white text-sm">iMAPS · Rosario</span>
                            </div>
                            <p className="text-xs text-slate-500 leading-relaxed">
                                Integrated Municipal Application Processing System for efficient permit and clearance applications.
                            </p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Quick Links</p>
                            <ul className="space-y-2">
                                {[['#track','Track Application'],['#services','Services'],['#process','Application Process'],['#contact','Contact Us']].map(([href, label]) => (
                                    <li key={href}>
                                        <a href={href} className="text-xs text-slate-500 hover:text-white transition-colors">{label}</a>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Office Hours</p>
                            <p className="text-xs text-slate-500">Monday – Friday</p>
                            <p className="text-xs text-slate-400 mt-1">8:00 AM – 5:00 PM</p>
                            <p className="text-xs text-slate-500 mt-1">No noon break</p>
                            <p className="text-xs text-slate-500 mt-3">mpdo@rosario.gov.ph</p>
                        </div>
                    </div>
                    <div className="border-t pt-6 flex flex-col sm:flex-row items-center justify-between gap-3"
                        style={{ borderColor: 'rgba(255,255,255,.05)' }}>
                        <p className="text-xs text-slate-600">© {new Date().getFullYear()} Municipality of Rosario. All rights reserved.</p>
                        <div className="flex gap-4">
                            <a href="#" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Privacy Policy</a>
                            <a href="#" className="text-xs text-slate-600 hover:text-slate-400 transition-colors">Terms of Service</a>
                        </div>
                    </div>
                </div>
            </footer>
        </>
    )
}