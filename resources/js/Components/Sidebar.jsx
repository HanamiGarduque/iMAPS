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
    const page = usePage();
    const effectiveRole = page?.props?.auth?.user?.role || userRole;
    const isAdmin = effectiveRole === 'Admin';
    // Loop 6 / Loop 9 merge: Site Inspectors operate exclusively through
    // FieldSync — they must never see internal operational navigation
    // (frontend hygiene only; the server-side role middleware remains the
    // security boundary).
    //
    // NOTE: the Loop 9 side of this conflict also declared `isAdmin` from the
    // raw `userRole` prop. That is deliberately NOT taken: master already
    // derives `isAdmin` above from `effectiveRole` (the server-provided
    // Inertia prop), and declaring a second `isAdmin` in the same scope would
    // be a redeclaration error. `effectiveRole` is the stricter and more
    // correct source, and it is what the Admin-only `/diagnostics` entry below
    // must be gated on.
    const isSiteInspector = effectiveRole === 'Site Inspector';
    const currentPath = page?.url?.split('?')[0].split('#')[0] || (typeof window !== 'undefined' ? window.location.pathname : '');
    const menuRef = useRef(null);
    const [focusedIndex, setFocusedIndex] = useState(0);

    const navItems = [
        {
            href: '/overview',
            label: 'Overview',
            badge: null,
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
                </svg>
            ),
        },
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
            label: 'Registry',
            badge: null,
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
            ),
        },
        {
            href: '/site-inspections',
            label: 'Inspections',
            badge: null,
            // The list and detail routes admit Admin and Planning Officer; the
            // server scopes a Planning Officer to the rounds they assigned.
            // PRESENTATION ONLY, not the security boundary.
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
            ),
        },
        {
            // LOOP 9E/9F. Admin triage of FieldSync inspector-submitted
            // diagnostic reports. Read only.
            //
            // `adminOnly: true` is PRESENTATION ONLY, matching the comment on
            // the Site Inspections item: the security boundary is the server-side
            // `role:Admin` middleware on the route, not the visibility of this
            // entry. Both routes are GET-only, so a Planning Officer following a
            // direct link receives 403.
            //
            // This file is a known upstream-contested merge point, so the entry
            // is a single self-contained object appended after an existing one.
            href: '/diagnostics',
            label: 'Reports & Support',
            badge: null,
            // POST-LOOP-9 SMOKE FIX: a Planning Officer now has READ access to
            // diagnostic reports, because they are the role that resolves
            // day-to-day FieldSync issues inside MPDO and previously could not
            // even read the report they had to act on. The server enforces the
            // real boundary with `role:Admin,Planning Officer`; a Site Inspector
            // is still refused there and still receives no navigation at all.
            //
            // `adminOnly: false` is PRESENTATION ONLY, matching the rule used for
            // the other shared entries. It is not the security boundary.
            adminOnly: false,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
            ),
        },
        {
            href: '/reports',
            label: 'Data Reports',
            badge: null,
            adminOnly: true,
            icon: (
                <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
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
    ];

    // Master integration (Loop 9 merge): BOTH role rules are preserved.
    //   * master hides Admin-only items from non-Admins;
    //   * Loop 9 gives a Site Inspector no internal navigation at all, and
    //     renders the FieldSync guidance panel instead.
    // Dropping either regresses a Loop 6 authorization contract.
    const visibleItems = isSiteInspector
        ? []
        : navItems.filter(item => {
              if (item.adminOnly && !isAdmin) return false;
              return true;
          });

    const isActive = (href) => {
        if (activePage) {
            const normalized = activePage.toLowerCase();
            // Master integration (Loop 9 merge): master folds the retired /maps
            // page into the Dashboard active state, which matches the merged
            // route that redirects /maps -> dashboard. Loop 9 additionally
            // treated the Technical Review list as part of Applications, which
            // is preserved because that route still exists.
            if (href === '/dashboard' && (normalized === 'dashboard' || normalized === 'maps')) return true;
            if (href === '/applications' && (normalized === 'applications' || normalized === 'drafts' || normalized === 'technical-review')) return true;
            if (href === '/reports-and-forecasting' && (normalized === 'reports-and-forecasting' || normalized === 'analytics')) return true;
            if (href === '/settings' && normalized === 'settings') return true;
            if (href === '/users' && (normalized === 'users' || normalized === 'user-management' || normalized === 'audit' || normalized === 'audit-log')) return true;
            if (href === '/site-inspections' && (normalized === 'site-inspections' || normalized === 'site inspections')) return true;
            if (href === '/notifications' && normalized === 'notifications') return true;
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

            if (visibleItems.length === 0) return;

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

    // Group items for display only; keyboard focus still uses the flat visibleItems index.
    const ADMIN_SECTION = ['/users', '/settings'];
    const DESCRIPTIONS = {
        '/overview': 'Today at a glance',
        '/dashboard': 'GIS map & analytics',
        '/applications': 'Zoning clearances',
        '/site-inspections': 'Field schedules',
        '/diagnostics': 'FieldSync issues',
        '/reports': 'Exports & summaries',
        '/users': 'Staff & access',
        '/settings': 'Map data & system',
    };
    const sections = [
        { title: 'Workspace', entries: visibleItems.map((item, idx) => ({ item, idx })).filter(({ item }) => !ADMIN_SECTION.includes(item.href)) },
        { title: 'Administration', entries: visibleItems.map((item, idx) => ({ item, idx })).filter(({ item }) => ADMIN_SECTION.includes(item.href)) },
    ].filter((s) => s.entries.length > 0);

    return (
        <div
            ref={menuRef}
            className="absolute top-1.5 left-3.5 sm:left-5 z-[900] w-[min(420px,calc(100vw-1.75rem))] bg-white border border-blue-200/70 ring-4 ring-blue-500/5 shadow-[0_20px_40px_-14px_rgba(37,99,235,.28)] rounded-2xl p-3 select-none animate-in fade-in slide-in-from-top-2 duration-200 ease-out origin-top-left"
        >

            {/* Nav Items List / FieldSync guidance for Site Inspectors */}
            {isSiteInspector ? (
                <div className="px-2.5 py-3">
                    <div className="rounded-xl bg-amber-50 border border-amber-200/80 p-3">
                        <p className="text-xs font-bold text-amber-800 mb-1">
                            FieldSync Required
                        </p>
                        <p className="text-[11px] leading-relaxed text-amber-700">
                            Site Inspectors use FieldSync for site inspection activities.
                            Internal iMAPS web navigation is not available for this role.
                        </p>
                    </div>
                </div>
            ) : (
            <nav aria-label="Main navigation">
                {sections.map((section, sIdx) => (
                    <div key={section.title} className={sIdx > 0 ? 'mt-2 pt-2 border-t border-slate-100' : ''}>
                        <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                            {section.title}
                        </p>
                        <div className="grid grid-cols-2 gap-0.5" role="menu">
                            {section.entries.map(({ item, idx }) => {
                                const active = isActive(item.href);
                                const isKeyboardFocused = focusedIndex === idx;

                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        role="menuitem"
                                        aria-current={active ? 'page' : undefined}
                                        onClick={() => setSidebarOpen && setSidebarOpen(false)}
                                        className={`group flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-colors duration-150 ${
                                            active
                                                ? 'bg-blue-50'
                                                : isKeyboardFocused
                                                ? 'bg-slate-100'
                                                : 'hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 transition-colors ${
                                            active ? 'bg-blue-600 text-white shadow-[0_4px_10px_-4px_rgba(37,99,235,.6)]' : 'bg-slate-100/80 text-slate-500 group-hover:bg-white group-hover:text-slate-700 group-hover:ring-1 group-hover:ring-slate-200'
                                        }`}>
                                            {item.icon}
                                        </span>
                                        <span className="min-w-0">
                                            <span className={`flex items-center gap-1.5 text-[12.5px] font-medium leading-tight ${active ? 'text-blue-700 font-semibold' : 'text-slate-800'}`}>
                                                <span className="truncate">{item.label}</span>
                                                {item.badge && (
                                                    <span className="text-[9.5px] font-bold uppercase px-1.5 rounded bg-blue-600 text-white shrink-0">{item.badge}</span>
                                                )}
                                            </span>
                                            <span className="block mt-0.5 text-[11px] leading-tight text-slate-400 truncate">
                                                {DESCRIPTIONS[item.href]}
                                            </span>
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </nav>
            )}

            {/* Footer: office identity */}
            <div className="mt-2 pt-2.5 px-2.5 border-t border-slate-100 flex items-center justify-between gap-3 text-[10.5px] text-slate-400">
                <span className="truncate">MPDO · Rosario, Batangas</span>
                <span className="font-mono shrink-0">v1.0</span>
            </div>

        </div>
    );
}
