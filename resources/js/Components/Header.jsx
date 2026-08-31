import React, { useState, useEffect, useRef } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import Swal from 'sweetalert2';

export default function Header({ 
    userName = 'Staff Member', 
    userRole = 'Planning Officer', 
    clock = '', 
    onLogout, 
    sidebarOpen = false, 
    setSidebarOpen,
    onSelectLocation,
    showSearch = false,
    activePage,
}) {
    // Dynamic navigation badge determination (Zero redundancy, automatically syncs with route)
    const page = usePage();
    const currentUrl = page?.url || (typeof window !== 'undefined' ? window.location.pathname : '');
    const currentComponent = page?.component || '';

    const getNavigationBadge = () => {
        // 1. Explicit prop override if provided
        if (activePage && typeof activePage === 'string' && activePage.trim()) {
            const raw = activePage.trim();
            const normalized = raw.toLowerCase();
            if (normalized === 'audit' || normalized === 'audit-log' || normalized === 'audittrail') return 'AUDIT TRAIL';
            if (normalized === 'tech-review' || normalized === 'technical-review') return 'TECHNICAL REVIEW';
            if (normalized === 'drafts') return 'APPLICATIONS';
            return raw.toUpperCase();
        }

        // 2. Parse URL path
        const cleanPath = (currentUrl || '').split('?')[0].split('#')[0];
        const segments = cleanPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        const firstSegment = segments[0]?.toLowerCase() || '';

        switch (firstSegment) {
            case 'dashboard':
                return 'DASHBOARD';
            case 'applications':
            case 'drafts':
                return 'APPLICATIONS';
            case 'analytics':
                return 'ANALYTICS';
            case 'audit-log':
            case 'audit-trail':
            case 'audit':
                return 'AUDIT TRAIL';
            case 'settings':
                return 'SETTINGS';
            case 'users':
                return 'USERS';
            case 'technical-review':
                return 'TECHNICAL REVIEW';
            case 'public-portal':
                return 'PUBLIC PORTAL';
            case 'profile':
                return 'PROFILE';
        }

        // 3. Fallback check on Inertia component name
        if (currentComponent) {
            const comp = currentComponent.toLowerCase();
            if (comp.startsWith('dashboard')) return 'DASHBOARD';
            if (comp.startsWith('applications') || comp.startsWith('drafts')) return 'APPLICATIONS';
            if (comp.startsWith('analytics')) return 'ANALYTICS';
            if (comp.startsWith('audittrail') || comp.startsWith('audit')) return 'AUDIT TRAIL';
            if (comp.startsWith('settings')) return 'SETTINGS';
            if (comp.startsWith('users')) return 'USERS';
            if (comp.startsWith('technicalreview')) return 'TECHNICAL REVIEW';
            if (comp.startsWith('publicportal')) return 'PUBLIC PORTAL';
            if (comp.startsWith('profile')) return 'PROFILE';
        }

        // 4. Dynamic fallback for future routes
        if (firstSegment) {
            return firstSegment.replace(/[-_]+/g, ' ').toUpperCase();
        }

        return 'DASHBOARD';
    };

    const navigationBadge = getNavigationBadge();

    const shouldShowSearch = showSearch || Boolean(onSelectLocation);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const profileRef = useRef(null);
    const searchRef = useRef(null);

    const handleSuggestionClick = (item) => {
        setSearchQuery('');
        setSearchFocused(false);
        if (item.type === 'Barangay' && onSelectLocation) {
            onSelectLocation(item.label);
        }
    };

    // Rosario Barangays and Application Quick Jumps
    const rosarioLocations = [
        { label: 'Poblacion', fullName: 'Poblacion Urban Center', type: 'Barangay', path: '/dashboard?bgy=Poblacion' },
        { label: 'San Roque', fullName: 'San Roque Commercial Corridor', type: 'Barangay', path: '/dashboard?bgy=San%20Roque' },
        { label: 'Quilib', fullName: 'Quilib Industrial Hub', type: 'Barangay', path: '/dashboard?bgy=Quilib' },
        { label: 'San Carlos', fullName: 'San Carlos Agro-Industrial Area', type: 'Barangay', path: '/dashboard?bgy=San%20Carlos' },
        { label: 'Pinagsibaan', fullName: 'Pinagsibaan Agri-Residential', type: 'Barangay', path: '/dashboard?bgy=Pinagsibaan' },
        { label: 'Alupay', fullName: 'Alupay Rural Zone', type: 'Barangay', path: '/dashboard?bgy=Alupay' },
        { label: 'Bayawang', fullName: 'Bayawang Eco-Agricultural Area', type: 'Barangay', path: '/dashboard?bgy=Bayawang' },
        { label: 'Calitcalit', fullName: 'Calitcalit Agricultural Zone', type: 'Barangay', path: '/dashboard?bgy=Calitcalit' },
        { label: 'Namuco', fullName: 'Namuco Residential Sector', type: 'Barangay', path: '/dashboard?bgy=Namuco' },
        { label: 'Timbugan', fullName: 'Timbugan Agricultural Zone', type: 'Barangay', path: '/dashboard?bgy=Timbugan' },
        { label: 'Locational Clearance', fullName: 'Zoning & Locational Clearance', type: 'Applications', path: '/applications' },
        { label: 'Building Permit Endorsement', fullName: 'Building Permit Clearance', type: 'Applications', path: '/applications' },
        { label: 'Zoning Certification', fullName: 'Land Classification Certificate', type: 'Applications', path: '/applications' },
    ];

    const filteredSuggestions = searchQuery.trim() === '' 
        ? rosarioLocations.slice(0, 5)
        : rosarioLocations.filter(item => 
            item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.fullName.toLowerCase().includes(searchQuery.toLowerCase())
          ).slice(0, 6);

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileMenuOpen(false);
            }
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setSearchFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Global keyboard shortcuts with event isolation
    useEffect(() => {
        const handleKeyDown = (e) => {
            const isInputActive = ['INPUT', 'TEXTAREA'].includes(e.target.tagName);

            // Esc key isolation: close topmost overlay first
            if (e.key === 'Escape') {
                if (shortcutsModalOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    setShortcutsModalOpen(false);
                    return;
                }
                if (profileMenuOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    setProfileMenuOpen(false);
                    return;
                }
                if (searchFocused) {
                    e.preventDefault();
                    e.stopPropagation();
                    setSearchFocused(false);
                    const searchInput = document.getElementById('global-header-search');
                    if (searchInput) searchInput.blur();
                    return;
                }
            }

            // Command/Ctrl + K for search focus (only on Dashboard / when search is visible)
            if (shouldShowSearch && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('global-header-search');
                if (searchInput) {
                    searchInput.focus();
                    setSearchFocused(true);
                }
            }

            // ? key for keyboard help modal (guarded against text inputs)
            if (e.key === '?' && !isInputActive) {
                e.preventDefault();
                setShortcutsModalOpen(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcutsModalOpen, profileMenuOpen, searchFocused]);

    const handleSignOutClick = () => {
        setProfileMenuOpen(false);
        if (onLogout) {
            onLogout();
            return;
        }

        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-3xl border border-slate-200 shadow-2xl p-6 sm:p-8 bg-white font-sans",
                title: "text-lg font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-5",
                confirmButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all active:scale-95 cursor-pointer",
                cancelButton: "inline-flex items-center justify-center px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-all active:scale-95 cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    return (
        <header className="h-14 bg-white border-b border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex items-center justify-between px-3.5 sm:px-5 shrink-0 z-[700] relative select-none">
            {/* ── LEFT SECTION: Interactive Brand Capsule Menu Trigger ── */}
            <div className="flex items-center h-full">
                <button
                    id="imaps-brand-trigger"
                    type="button"
                    onClick={() => setSidebarOpen && setSidebarOpen(!sidebarOpen)}
                    className={`flex items-center gap-2.5 px-3 py-1.5 -ml-1 rounded-2xl border transition-all duration-200 focus:outline-none group ${
                        sidebarOpen 
                            ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-500/10 shadow-xs' 
                            : 'bg-white hover:bg-slate-50 border-slate-200/90 hover:border-slate-300 shadow-2xs'
                    }`}
                    title={sidebarOpen ? "Close Navigation Menu" : "Open Navigation Menu"}
                >
                    {/* Custom 3D Topo Map Emblem */}
                    <div className="w-7 h-7 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform duration-200">
                        <svg className="w-7 h-7" viewBox="0 0 32 32" fill="none">
                            <defs>
                                <linearGradient id="header-map-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#2563eb" />
                                    <stop offset="100%" stopColor="#4f46e5" />
                                </linearGradient>
                                <linearGradient id="header-pin-grad" x1="12" y1="10" x2="20" y2="18" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#38bdf8" />
                                    <stop offset="100%" stopColor="#2563eb" />
                                </linearGradient>
                            </defs>
                            <path 
                                d="M4 8L11.5 5L20.5 8L28 5V24L20.5 27L11.5 24L4 27V8Z" 
                                fill="url(#header-map-grad)" 
                                fillOpacity="0.14" 
                                stroke="url(#header-map-grad)" 
                                strokeWidth="2.2" 
                                strokeLinejoin="round"
                            />
                            <path d="M11.5 5V24" stroke="url(#header-map-grad)" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="2.5 2.5"/>
                            <path d="M20.5 8V27" stroke="url(#header-map-grad)" strokeWidth="1.8" strokeLinecap="round"/>
                            <circle cx="16" cy="14.5" r="3.2" fill="url(#header-pin-grad)" stroke="#ffffff" strokeWidth="1.5" />
                            <circle cx="16" cy="14.5" r="6" stroke="#38bdf8" strokeWidth="1" strokeOpacity="0.4" strokeDasharray="2 2" className="animate-spin duration-1000 origin-center"/>
                        </svg>
                    </div>

                    {/* Wordmark */}
                    <span className="font-['Plus_Jakarta_Sans',sans-serif] font-black text-[20px] tracking-[-0.04em] text-slate-900 leading-none">
                        <span className="text-blue-600 font-black">i</span>MAPS
                    </span>
                    
                    {/* Dynamic Navigation Beacon */}
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-lg shadow-2xs">
                        <span className="relative flex h-1.5 w-1.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-600" />
                        </span>
                        <span className="text-[10.5px] font-extrabold text-blue-800 uppercase tracking-wider leading-none">
                            {navigationBadge}
                        </span>
                    </div>

                    {/* Differentiated Portal Menu Switcher Glyph */}
                    <div className={`flex items-center gap-1 px-1.5 py-1 rounded-lg transition-all duration-200 ${
                        sidebarOpen 
                            ? 'bg-blue-600 text-white shadow-xs' 
                            : 'bg-slate-100 text-slate-700 group-hover:bg-blue-100 group-hover:text-blue-700'
                    }`}>
                        {/* 4-Quadrant Portal Grid Icon */}
                        <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="currentColor">
                            <rect x="2" y="2" width="4.5" height="4.5" rx="1.2" />
                            <rect x="9.5" y="2" width="4.5" height="4.5" rx="1.2" />
                            <rect x="2" y="9.5" width="4.5" height="4.5" rx="1.2" />
                            <rect x="9.5" y="9.5" width="4.5" height="4.5" rx="1.2" />
                        </svg>
                        {/* Directional Caret */}
                        <svg className={`w-3 h-3 transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </div>
                </button>
            </div>

            {/* ── CENTER SECTION: Interactive Spatial Command Search Bar (Only visible in Dashboard) ── */}
            {shouldShowSearch ? (
                <div className="hidden md:flex items-center flex-1 max-w-xs lg:max-w-md mx-4 relative" ref={searchRef}>
                    <div className="relative w-full group">
                        <svg 
                            className="w-4 h-4 text-slate-400 group-focus-within:text-blue-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none transition-colors" 
                            fill="none" 
                            viewBox="0 0 24 24" 
                            stroke="currentColor" 
                            strokeWidth="2"
                        >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                        </svg>
                        
                        <input
                            id="global-header-search"
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            onFocus={() => setSearchFocused(true)}
                            placeholder="Search barangay, parcel, zoning..."
                            className="w-full bg-slate-100/80 hover:bg-slate-100 focus:bg-white text-xs text-slate-800 placeholder-slate-400 pl-9 pr-14 py-1.5 rounded-xl border border-slate-200/80 focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all outline-none shadow-2xs"
                        />

                        {searchQuery ? (
                            <button
                                type="button"
                                onClick={() => {
                                    setSearchQuery('');
                                    setSearchFocused(false);
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-full"
                            >
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        ) : (
                            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none">
                                <span className="text-[10px] font-mono font-semibold text-slate-400 bg-white border border-slate-200/80 rounded px-1.5 py-0.5 shadow-2xs">
                                    ⌘K
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Spatial Search Suggestions Dropdown */}
                    {searchFocused && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-2 z-[999] animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                <span>Spatial Quick Jump</span>
                                <span className="text-[10px] font-normal text-slate-400">Click to fly on map</span>
                            </div>
                            <div className="py-1 space-y-0.5">
                                {filteredSuggestions.map((item, idx) => {
                                    if (item.type === 'Barangay' && onSelectLocation) {
                                        return (
                                            <button
                                                key={idx}
                                                type="button"
                                                onClick={() => handleSuggestionClick(item)}
                                                className="w-full flex items-center justify-between px-2.5 py-2 rounded-xl text-left hover:bg-blue-50/80 transition-colors group"
                                            >
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                    <div className="w-6 h-6 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                                                        </svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-slate-800 group-hover:text-blue-700 truncate">
                                                            {item.label}
                                                        </p>
                                                        <p className="text-[10.5px] text-slate-500 truncate">
                                                            {item.fullName}
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md">
                                                    Barangay
                                                </span>
                                            </button>
                                        );
                                    }

                                    return (
                                        <Link
                                            key={idx}
                                            href={item.path}
                                            onClick={() => handleSuggestionClick(item)}
                                            className="flex items-center justify-between px-2.5 py-2 rounded-xl text-xs hover:bg-slate-50 transition-colors group"
                                        >
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="w-6 h-6 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                                    </svg>
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold text-slate-800 group-hover:text-blue-700 truncate">
                                                        {item.label}
                                                    </p>
                                                    <p className="text-[10.5px] text-slate-500 truncate">
                                                        {item.fullName}
                                                    </p>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                                                {item.type}
                                            </span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1" />
            )}

            {/* ── RIGHT SECTION: PST Clock, Shortcuts, Notifications & Profile ── */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* Philippine Standard Time Display */}
                {clock && (
                    <div className="hidden xl:flex items-center gap-1.5 text-slate-700 bg-slate-50 border border-slate-200/90 px-2.5 py-1 rounded-xl shadow-2xs">
                        <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <circle cx="12" cy="12" r="9" />
                            <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="text-[11px] font-mono font-bold tracking-tight text-slate-700">
                            {clock}
                        </span>
                    </div>
                )}

                {/* Keyboard Shortcuts Trigger */}
                <button
                    type="button"
                    onClick={() => setShortcutsModalOpen(true)}
                    className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none"
                    title="Keyboard Shortcuts & Map Help (?)"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" />
                    </svg>
                </button>

                {/* Notification Bell with Badge */}
                <button 
                    type="button"
                    className="relative w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors focus:outline-none"
                    title="System Notifications"
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                    </svg>
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-600 rounded-full ring-2 ring-white" />
                </button>

                <div className="h-5 w-px bg-slate-200/80 hidden sm:block" />

                {/* Officer Profile Dropdown */}
                <div className="relative" ref={profileRef}>
                    <button
                        type="button"
                        onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                        className={`flex items-center gap-2.5 p-1 rounded-xl transition-all focus:outline-none ${
                            profileMenuOpen ? 'bg-slate-100 ring-1 ring-slate-200' : 'hover:bg-slate-100/80'
                        }`}
                    >
                        {/* Avatar */}
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                            {userName?.charAt(0).toUpperCase() || 'S'}
                        </div>
                        <div className="hidden sm:flex flex-col text-left">
                            <span className="text-xs font-bold text-slate-800 leading-tight">
                                {userName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-semibold leading-none mt-0.5">
                                {userRole}
                            </span>
                        </div>
                        <svg className={`w-3.5 h-3.5 text-slate-500 hidden sm:block transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {/* Profile Dropdown Menu */}
                    {profileMenuOpen && (
                        <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-200/80 p-1.5 z-[999] animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-3 py-2.5 border-b border-slate-100 bg-slate-50/50 rounded-xl mb-1">
                                <p className="text-xs font-bold text-slate-900 truncate">{userName}</p>
                                <p className="text-[11px] text-slate-500 font-medium truncate mt-0.5">{userRole}</p>
                                <div className="mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    <span>Authenticated Officer</span>
                                </div>
                            </div>

                            <div className="space-y-0.5">
                                <Link 
                                    href="/settings"
                                    onClick={() => setProfileMenuOpen(false)}
                                    className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    </svg>
                                    <span>Account & Settings</span>
                                </Link>

                                <button
                                    onClick={handleSignOutClick}
                                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                    <svg className="w-4 h-4 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                                    </svg>
                                    <span>Sign Out</span>
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── KEYBOARD SHORTCUTS & HELP MODAL ── */}
            {shortcutsModalOpen && (
                <div 
                    className="fixed inset-0 z-[9999] bg-slate-950/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
                    onClick={() => setShortcutsModalOpen(false)}
                >
                    <div 
                        className="bg-white rounded-3xl p-5 max-w-md w-full shadow-2xl border border-slate-200/90 space-y-4"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-sm border border-blue-200/60">
                                    ⌨
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-slate-900">Spatial Keyboard Shortcuts</h3>
                                    <p className="text-[11px] text-slate-500 font-medium">Power-user spatial navigation controls</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShortcutsModalOpen(false)}
                                className="w-7 h-7 rounded-lg text-slate-400 hover:bg-slate-100 flex items-center justify-center"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>

                        <div className="space-y-2 text-xs">
                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Quick Command Search</span>
                                <div className="flex gap-1 font-mono font-bold text-[11px]">
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs">⌘ / Ctrl</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs">K</kbd>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Switch Map Layers</span>
                                <div className="flex gap-1 font-mono font-bold text-[11px]">
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Applications">1</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Zoning">2</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Land Use">3</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Risk">4</kbd>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Toggle Intelligence Drawer</span>
                                <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs font-mono font-bold text-[11px]">I</kbd>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Toggle Fullscreen Map</span>
                                <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs font-mono font-bold text-[11px]">F</kbd>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Clear Selected Barangay</span>
                                <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs font-mono font-bold text-[11px]">Esc</kbd>
                            </div>
                        </div>

                        <button
                            onClick={() => setShortcutsModalOpen(false)}
                            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                        >
                            Close
                        </button>
                    </div>
                </div>
            )}
        </header>
    );
}
