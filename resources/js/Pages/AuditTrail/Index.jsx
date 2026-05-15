import { useState, useEffect } from 'react'
import { Head, router } from '@inertiajs/react'

// ── Action chip config ──
const ACTION_CONFIG = {
    APPLICATION_CREATED: { bg: '#f0fdf4', color: '#16a34a', dotBg: '#16a34a', ringBg: '#dcfce7' },
    STATUS_UPDATE:       { bg: '#eff6ff', color: '#1a45ee', dotBg: '#1a45ee', ringBg: '#dbeafe' },
}

function ActionChip({ action }) {
    const cfg = ACTION_CONFIG[action] || { bg: '#f1f5f9', color: '#64748b' }
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
            style={{ background: cfg.bg, color: cfg.color }}>
            {action.replace(/_/g, ' ')}
        </span>
    )
}

function TimelineDot({ action }) {
    const cfg = ACTION_CONFIG[action] || { dotBg: '#94a3b8', ringBg: '#f1f5f9' }

    const icon = action === 'APPLICATION_CREATED' ? (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
    ) : action === 'STATUS_UPDATE' ? (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
    ) : (
        <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
    )

    return (
        <div className="absolute left-2 top-3.5 w-[18px] h-[18px] rounded-full border-2 border-white flex items-center justify-center z-10"
            style={{ background: cfg.dotBg, boxShadow: `0 0 0 2px ${cfg.ringBg}` }}>
            {icon}
        </div>
    )
}

// ── Sidebar ──
function Sidebar({ userName, userRole }) {
    const navItems = [
        { href: '/dashboard',    label: 'Dashboard',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/applications', label: 'Applications', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { href: '/analytics',    label: 'Analytics',    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { href: '/audit-log',    label: 'Audit Trail',  icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4', active: true },
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
                <a href="/logout"
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all">
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    Sign Out
                </a>
            </div>
        </aside>
    )
}

// ── Main Page ──
export default function Index({ logs, actions, stats, filters, auth }) {
    const [search, setSearch] = useState(filters.search || '')
    const [clock, setClock]   = useState('')

    const userName = auth?.user?.name || 'Staff'
    const userRole = auth?.user?.role || 'Planning Officer'

    // Live clock
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
                router.get('/audit-log', { ...filters, search, page: 1 }, { preserveState: true, replace: true })
            }
        }, 400)
        return () => clearTimeout(t)
    }, [search])

    const applyAction = (action) => {
        router.get('/audit-log', { ...filters, action, page: 1 }, { preserveState: true, replace: true })
    }

    const clearFilters = () => {
        setSearch('')
        router.get('/audit-log', {}, { preserveState: true, replace: true })
    }

    const hasFilters = filters.search || filters.action

    // Group logs by date
    const grouped = {}
    logs.data.forEach(log => {
        const date = log.performed_at?.slice(0, 10)
        if (!grouped[date]) grouped[date] = []
        grouped[date].push(log)
    })

    const formatDate = (dateStr) => {
        const d    = new Date(dateStr)
        const today = new Date().toISOString().slice(0, 10)
        const label = d.toLocaleDateString('en-PH', { month: 'long', day: '2-digit', year: 'numeric' })
        return { label, isToday: dateStr === today }
    }

    const formatTime = (dt) =>
        new Date(dt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

    return (
        <>
            <Head title="Audit Trail | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
                body { font-family: 'DM Sans', sans-serif; background: #f8fafc; }
                ::-webkit-scrollbar { width: 5px; }
                ::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 3px; }
                @keyframes fadeUp { from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);} }
                .fade-up { animation: fadeUp .3s ease both; }
                .timeline-line::before {
                    content: '';
                    position: absolute;
                    left: 10px; top: 0; bottom: 0;
                    width: 1px;
                    background: linear-gradient(to bottom, #e2e8f0 95%, transparent 100%);
                }
            `}</style>

            <div className="flex h-screen overflow-hidden">
                <Sidebar userName={userName} userRole={userRole} />

                <div className="flex-1 flex flex-col overflow-hidden">

                    {/* Top bar */}
                    <header className="h-14 bg-white border-b border-slate-100 flex items-center justify-between px-5 shrink-0 z-10">
                        <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-xs hidden sm:block">MPDO Rosario, Batangas</span>
                        </div>
                        <span className="text-xs text-slate-400 font-mono hidden md:block">{clock}</span>
                    </header>

                    {/* Main */}
                    <main className="flex-1 overflow-y-auto px-6 py-6">

                        {/* Header row */}
                        <div className="flex items-start justify-between mb-5 fade-up flex-wrap gap-4">
                            <div>
                                <h1 className="text-lg font-semibold text-slate-900">Audit Trail</h1>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    {logs.total} event{logs.total !== 1 ? 's' : ''}
                                    {hasFilters ? ' — filtered' : ' total'}
                                </p>
                            </div>

                            {/* Stats */}
                            <div className="flex items-center gap-3">
                                {stats.map(s => (
                                    <div key={s.action}
                                        className="text-center px-4 py-2 bg-white rounded-xl border border-slate-100"
                                        style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                                        <p className="text-lg font-bold text-slate-900 font-mono">{s.cnt}</p>
                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                                            {s.action.replace(/_/g, ' ')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Search + filters */}
                        <div className="fade-up mb-4">
                            <div className="relative mb-3">
                                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                    fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                                <input type="text" value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Search by reference number, applicant name, or performed by…"
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

                            {/* Action filter pills */}
                            <div className="flex flex-wrap gap-2 items-center">
                                <span className="text-[11px] text-slate-400 font-medium">Action:</span>
                                <button onClick={() => applyAction('')}
                                    className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-all ${(filters.action || '') === '' ? 'border-blue-600 text-blue-600 bg-blue-50 font-semibold' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                                    All
                                </button>
                                {actions.map(a => (
                                    <button key={a} onClick={() => applyAction(a)}
                                        className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border transition-all ${filters.action === a ? 'border-blue-600 text-blue-600 bg-blue-50 font-semibold' : 'border-slate-200 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50'}`}>
                                        {a.replace(/_/g, ' ')}
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

                        {/* Timeline */}
                        <div className="fade-up">
                            {logs.data.length === 0 ? (
                                <div className="bg-white rounded-2xl border border-slate-200 py-16 text-center"
                                    style={{ boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
                                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
                                        <svg className="w-6 h-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                        </svg>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 mb-1">No audit events found.</p>
                                    <p className="text-xs text-slate-400">Try adjusting your search or filters.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    {Object.entries(grouped).map(([date, dayLogs]) => {
                                        const { label, isToday } = formatDate(date)
                                        return (
                                            <div key={date}>
                                                {/* Date separator */}
                                                <div className="flex items-center gap-3 mb-4">
                                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap flex items-center gap-2">
                                                        {label}
                                                        {isToday && (
                                                            <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-semibold normal-case tracking-normal">
                                                                Today
                                                            </span>
                                                        )}
                                                    </span>
                                                    <div className="flex-1 h-px bg-slate-100" />
                                                    <span className="text-[11px] text-slate-300 font-medium whitespace-nowrap">
                                                        {dayLogs.length} event{dayLogs.length !== 1 ? 's' : ''}
                                                    </span>
                                                </div>

                                                {/* Timeline items */}
                                                <div className="relative timeline-line space-y-1 pl-1">
                                                    {dayLogs.map(log => (
                                                        <div key={log.id} className="relative pl-10 pb-1">
                                                            <TimelineDot action={log.action} />

                                                            {/* Card */}
                                                            <div className="bg-white border border-slate-100 rounded-xl px-4 py-3 transition-all hover:border-slate-200 hover:shadow-sm">
                                                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                                                    <div className="flex items-center gap-2 flex-wrap">
                                                                        <ActionChip action={log.action} />
                                                                        {log.reference_number && (
                                                                            <a href={`/applications?search=${log.reference_number}`}
                                                                                className="font-mono text-[11px] font-semibold text-blue-600 hover:text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full transition-colors">
                                                                                {log.reference_number}
                                                                            </a>
                                                                        )}
                                                                    </div>
                                                                    <span className="text-[11px] text-slate-400 font-mono shrink-0">
                                                                        {formatTime(log.performed_at)}
                                                                    </span>
                                                                </div>

                                                                {log.applicant_name && (
                                                                    <p className="text-[12px] font-semibold text-slate-700 mt-1.5">
                                                                        {log.applicant_name}
                                                                    </p>
                                                                )}

                                                                {log.note && (
                                                                    <p className="text-[12px] text-slate-500 mt-1 leading-snug">
                                                                        {log.note}
                                                                    </p>
                                                                )}

                                                                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-50">
                                                                    <svg className="w-3 h-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                                    </svg>
                                                                    <span className="text-[11px] text-slate-400">
                                                                        {log.performed_by_name || 'System'}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Pagination */}
                        {logs.last_page > 1 && (
                            <div className="flex items-center justify-between mt-6 fade-up">
                                <p className="text-xs text-slate-400">
                                    Showing {logs.from}–{logs.to} of {logs.total}
                                </p>
                                <div className="flex items-center gap-1.5">
                                    {logs.links.map((link, i) => (
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
        </>
    )
}