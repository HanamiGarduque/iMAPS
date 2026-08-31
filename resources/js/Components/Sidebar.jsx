import React, { useEffect, useRef, useState } from 'react';
import { Link, router, usePage } from '@inertiajs/react';

export default function Sidebar({
    userName = 'Staff Member',
    userRole = 'Planning Officer',
    sidebarOpen = false,
    setSidebarOpen,
    onLogout,
    activePage,
}) {
    const isAdmin = userRole === 'Admin';
    const page = usePage();
    const currentPath = page?.url?.split('?')[0].split('#')[0] || (typeof window !== 'undefined' ? window.location.pathname : '');
    const menuRef = useRef(null);
    const [focusedIndex, setFocusedIndex] = useState(0);

    const navItems = [
        {
            href: '/dashboard',
            label: 'Dashboard',
            badge: null,
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
                    <line x1="9" y1="3" x2="9" y2="18" />
                    <line x1="15" y1="6" x2="15" y2="21" />
                </svg>
            ),
        },
        {
            href: '/applications',
            label: 'Applications',
            badge: null,
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
            ),
        },
        {
            href: '/analytics',
            label: 'Analytics',
            badge: 'BI',
            adminOnly: true,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
            ),
        },
        {
            href: '/audit-log',
            label: 'Audit Trail',
            badge: null,
            adminOnly: true,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
        },
        {
            href: '/settings',
            label: 'Settings',
            badge: null,
            adminOnly: true,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
            ),
        },
        {
            href: '/users',
            label: 'User Management',
            badge: null,
            adminOnly: true,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
            ),
        },
    ];

    const visibleItems = navItems.filter(item => !item.adminOnly || isAdmin);

    const isActive = (href) => {
        if (activePage) {
            const normalized = activePage.toLowerCase();
            if (href === '/dashboard' && normalized === 'dashboard') return true;
            if (href === '/applications' && (normalized === 'applications' || normalized === 'drafts')) return true;
            if (href === '/analytics' && normalized === 'analytics') return true;
            if (href === '/audit-log' && (normalized === 'audit' || normalized === 'audit-log')) return true;
            if (href === '/settings' && normalized === 'settings') return true;
            if (href === '/users' && (normalized === 'users' || normalized === 'user-management')) return true;
        }
        if (currentPath === href) return true;
        if (href !== '/dashboard' && href !== '/' && currentPath.startsWith(href)) return true;
        return false;
    };

    // Close menu when clicking outside or pressing Escape, and support Arrow navigation
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (sidebarOpen && menuRef.current && !menuRef.current.contains(e.target)) {
                // Ignore if clicked on the header brand button
                const brandBtn = document.getElementById('imaps-brand-trigger');
                if (brandBtn && brandBtn.contains(e.target)) return;
                if (setSidebarOpen) setSidebarOpen(false);
            }
        };

        const handleKeyDown = (e) => {
            if (!sidebarOpen) return;

            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopPropagation();
                if (setSidebarOpen) setSidebarOpen(false);
                return;
            }

            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setFocusedIndex((prev) => (prev + 1) % visibleItems.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setFocusedIndex((prev) => (prev - 1 + visibleItems.length) % visibleItems.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const selected = visibleItems[focusedIndex];
                if (selected) {
                    if (setSidebarOpen) setSidebarOpen(false);
                    router.visit(selected.href);
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [sidebarOpen, setSidebarOpen, focusedIndex, visibleItems]);

    // Reset focusedIndex to active item on open
    useEffect(() => {
        if (sidebarOpen) {
            const activeIdx = visibleItems.findIndex(item => isActive(item.href));
            if (activeIdx >= 0) setFocusedIndex(activeIdx);
        }
    }, [sidebarOpen]);

    if (!sidebarOpen) return null;

    return (
        <div
            ref={menuRef}
            className="absolute top-2 left-3.5 z-[900] w-[260px] bg-white border border-slate-200/90 shadow-2xl rounded-2xl p-1.5 select-none animate-in fade-in zoom-in-95 duration-150 origin-top-left"
        >
            {/* Menu Header */}
            <div className="px-2.5 py-1.5 flex items-center justify-between border-b border-slate-100 mb-1">
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider font-['Plus_Jakarta_Sans',sans-serif]">
                    Navigation
                </span>
            </div>

            {/* Nav Items List */}
            <div className="space-y-0.5" role="menu">
                {visibleItems.map((item, idx) => {
                    const active = isActive(item.href);
                    const isKeyboardFocused = focusedIndex === idx;

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setSidebarOpen && setSidebarOpen(false)}
                            className={`group flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-all duration-150 ${
                                active
                                    ? 'bg-blue-50 text-blue-700 font-bold border border-blue-200/80 shadow-2xs'
                                    : isKeyboardFocused
                                    ? 'bg-slate-100 text-slate-900 font-semibold ring-1 ring-slate-300'
                                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50 font-semibold'
                            }`}
                        >
                            <div className="flex items-center gap-2.5 min-w-0">
                                <div className={`transition-colors ${active ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-700'}`}>
                                    {item.icon}
                                </div>
                                <span className="truncate text-[13px]">
                                    {item.label}
                                </span>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                                {item.badge && (
                                    <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-blue-600 text-white shadow-2xs">
                                        {item.badge}
                                    </span>
                                )}
                            </div>
                        </Link>
                    );
                })}
            </div>

            {/* Micro Footer */}
            <div className="mt-1 pt-2 border-t border-slate-100 px-2.5 flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Rosario Municipal GIS</span>
                </div>
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200/60">
                    v1.0
                </span>
            </div>
        </div>
    );
}