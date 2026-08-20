import { Link } from '@inertiajs/react'

export default function Sidebar({
    userName,
    userRole = 'Planning Officer',
    sidebarOpen,
    setSidebarOpen,
    onLogout,
    activePage,
}) {
    const isAdmin = userRole === 'Admin'
    const currentPath = typeof window !== 'undefined' ? window.location.pathname : ''

    const navItems = [
        { href: '/dashboard', label: 'Dashboard', adminOnly: false, icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
        { href: '/applications', label: 'Applications', adminOnly: false, icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { href: '/analytics', label: 'Analytics', adminOnly: true, icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
        { href: '/audit-log', label: 'Audit Trail', adminOnly: true, icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
        // Added the Settings Route here
        { href: '/settings', label: 'Settings', adminOnly: true, icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z' },
    ].filter(item => !item.adminOnly || isAdmin)

    const isActive = (href) => {
        if (activePage) {
            const normalized = activePage.toLowerCase()
            if (href === '/dashboard' && normalized === 'dashboard') return true
            if (href === '/applications' && normalized === 'applications') return true
            if (href === '/analytics' && normalized === 'analytics') return true
            if (href === '/audit-log' && normalized === 'audit') return true
            // Added the active state check for Settings
            if (href === '/settings' && normalized === 'settings') return true
        }
        return currentPath === href
    }

    return (
        <aside
            className={`absolute top-0 left-0 w-[200px] h-full bg-white z-[9999] border-r border-slate-200 flex flex-col py-4 transition-transform duration-500 ease-in-out ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
        >
            <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="absolute top-1/2 -translate-y-1/2 -right-5 w-5 h-12 bg-white border-y border-r border-slate-200 text-slate-400 hover:text-blue-600 rounded-r-md flex items-center justify-center shadow-sm transition-colors focus:outline-none z-10"
            >
                <svg
                    className={`w-3.5 h-3.5 transition-transform duration-500 ${!sidebarOpen ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth="2.5"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
            </button>

            <div className="px-4 pb-4 pt-1 border-b border-slate-100 flex flex-col items-center">
                <h1 className="text-2xl font-black text-blue-900 tracking-tighter leading-none">iMAPS</h1>
                <span className="text-[9px] font-bold text-blue-700 tracking-[0.2em] uppercase mt-1">Rosario</span>
            </div>

            <nav className="flex-1 flex flex-col gap-1 py-3 overflow-y-auto">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 px-4 py-2 font-medium text-[12px] rounded-r-lg mr-3 transition-all ${isActive(item.href)
                            ? 'bg-blue-800 text-white font-semibold shadow-sm'
                            : 'text-slate-700 hover:bg-blue-50 hover:text-blue-800'
                        }`}
                    >
                        <svg className="w-4 h-4 shrink-0 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        <span className="pointer-events-none">{item.label}</span>
                    </Link>
                ))}
            </nav>

            <div className="border-t border-slate-100 py-2 mt-1">
                <div className="flex items-center gap-2 px-4 py-2 mb-1">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                        {userName?.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-[11px] font-semibold text-slate-800 leading-none">{userName}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5">{userRole}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onLogout}
                    className="w-full flex items-center gap-2.5 px-4 py-2 text-slate-500 hover:bg-slate-50 hover:text-blue-700 font-medium text-[12px] transition-all rounded-r-lg mr-3"
                >
                    <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                    </svg>
                    <span>Sign Out</span>
                </button>
            </div>
        </aside>
    )
}