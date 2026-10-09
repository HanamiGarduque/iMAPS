import React, { useState, useEffect, useRef } from 'react';
import { Link, router, usePage } from '@inertiajs/react';
import { promptParcelApplication } from '@/utils/parcelHandoff.jsx';
import { getZoneInfo } from '@/utils/clupZones';

import { confirmSignOut } from '@/utils/signOut';

// ── Predictive Highlight Helper ──
const HighlightMatch = ({ text, query }) => {
    if (!query || !text) return <span>{text}</span>;
    // Escaped so a query like "T-(12" can't throw on an invalid pattern.
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    return (
        <span>
            {parts.map((part, i) => 
                part.toLowerCase() === query.toLowerCase() ? (
                    <span key={i} className="text-blue-700 bg-blue-100/50">{part}</span>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </span>
    );
};

// Ticks in its own component so the rest of the header doesn't re-render every second.
// Always Philippine Standard Time, whatever the viewer's machine is set to.
function MunicipalClock() {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);
    const opts = { timeZone: 'Asia/Manila' };
    const time = now.toLocaleTimeString('en-PH', { ...opts, hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const date = now.toLocaleDateString('en-PH', { ...opts, month: 'short', day: 'numeric', year: 'numeric' });
    // Built like the profile button: a 28px tile, then two lines (time over date) at the same
    // sizes as name-over-role, so the two read as a matched pair in the navbar.
    return (
        <div className="hidden xl:flex items-center gap-2.5 p-1 pr-2 rounded-xl select-none" title="Municipal time · Philippine Standard Time (UTC+8)">
            <div className="w-7 h-7 rounded-lg bg-slate-100 ring-1 ring-slate-200/80 grid place-items-center text-slate-500 shrink-0" aria-hidden="true">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="9" />
                    <polyline points="12 7 12 12 15.5 14" />
                </svg>
            </div>
            {/* Screen readers get the time once, not a new announcement every second. */}
            <span className="sr-only">{`Municipal time ${now.toLocaleTimeString('en-PH', { ...opts, hour: '2-digit', minute: '2-digit' })}, ${date}, Philippine Standard Time`}</span>
            <div className="flex flex-col text-left tabular-nums" aria-hidden="true">
                <span className="text-xs font-bold text-slate-800 leading-tight">{time}</span>
                <span className="text-[11px] text-slate-500 font-semibold leading-none mt-0.5">{date} <span className="text-slate-400">· PHT</span></span>
            </div>
        </div>
    );
}

export default function Header({ 
    userName = 'Staff Member', 
    userRole = 'Planning Officer', 
    clock = '', 
    onLogout, 
    sidebarOpen = false, 
    setSidebarOpen,
    onSelectLocation,
    onSelectParcel,
    showSearch = false,
    activePage,
}) {
    // Dynamic navigation badge determination (Zero redundancy, automatically syncs with route)
    //
    // The badge represents the MODULE, not the subsection. All Records,
    // Technical Review and Drafts are sibling sections of the REGISTRY
    // module, so every one of them resolves to the same parent badge; the page
    // H1 names the subsection. Technical Review is deliberately NOT badged as
    // its own top-level module.
    const page = usePage();
    const currentUrl = page?.url || (typeof window !== 'undefined' ? window.location.pathname : '');
    const currentComponent = page?.component || '';

    const getNavigationBadge = () => {
        if (activePage && typeof activePage === 'string' && activePage.trim()) {
            const raw = activePage.trim();
            const normalized = raw.toLowerCase();
            if (normalized === 'audit' || normalized === 'audit-log' || normalized === 'audittrail') return 'AUDIT TRAIL';
            // Applications subsections share the parent module badge.
            if (normalized === 'drafts' || normalized === 'tech-review' || normalized === 'technical-review') return 'REGISTRY';
            // The module is named Reports & Support; the route, the route names
            // and the notification deep links all still say `diagnostics`, which
            // is deliberate compatibility. Without this the context chip would
            // display the retired product name DIAGNOSTICS on every page of
            // this surface, including both report types and both details.
            if (normalized === 'diagnostics') return 'REPORTS & SUPPORT';
            // The module is labelled Inspections; `site-inspections` stays the
            // route/activePage key for compatibility.
            if (normalized === 'site-inspections' || normalized === 'site inspections') return 'INSPECTIONS';
            return raw.toUpperCase();
        }

        const cleanPath = (currentUrl || '').split('?')[0].split('#')[0];
        const segments = cleanPath.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
        const firstSegment = segments[0]?.toLowerCase() || '';

        switch (firstSegment) {
            case 'dashboard':
                return 'DASHBOARD';
            case 'maps':
                return 'MAPS';
            case 'applications':
            case 'drafts':
            case 'technical-review':
                return 'REGISTRY';
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
            case 'public-portal':
                return 'PUBLIC PORTAL';
            case 'profile':
                return 'PROFILE';
            case 'diagnostics':
                return 'REPORTS & SUPPORT';
            case 'site-inspections':
                return 'INSPECTIONS';
        }

        if (currentComponent) {
            const comp = currentComponent.toLowerCase();
            if (comp.startsWith('dashboard')) return 'DASHBOARD';
            if (comp.startsWith('maps')) return 'MAPS';
            if (comp.startsWith('applications') || comp.startsWith('drafts') || comp.startsWith('technicalreview')) return 'REGISTRY';
            if (comp.startsWith('analytics')) return 'ANALYTICS';
            if (comp.startsWith('audittrail') || comp.startsWith('audit')) return 'AUDIT TRAIL';
            if (comp.startsWith('settings')) return 'SETTINGS';
            if (comp.startsWith('users')) return 'USERS';
            if (comp.startsWith('publicportal')) return 'PUBLIC PORTAL';
            if (comp.startsWith('profile')) return 'PROFILE';
            // Both report pages resolve here, so the product name is correct
            // even where a caller supplies no `activePage` at all.
            if (comp.startsWith('diagnostics')) return 'REPORTS & SUPPORT';
        }

        if (firstSegment) {
            // Retired product name, never shown: `diagnostics` is a URL, not a
            // product label.
            if (firstSegment === 'diagnostics') return 'REPORTS & SUPPORT';
            return firstSegment.replace(/[-_]+/g, ' ').toUpperCase();
        }

        return 'DASHBOARD';
    };

    const navigationBadge = getNavigationBadge();

    // Loop 6: internal search is an Admin/Planning Officer capability only â€”
    // never shown to Site Inspectors (server middleware still enforces it).
    const shouldShowSearch = (showSearch || Boolean(onSelectLocation)) && userRole !== 'Site Inspector';
    const [searchQuery, setSearchQuery] = useState('');
    const [searchFocused, setSearchFocused] = useState(false);
    const [profileMenuOpen, setProfileMenuOpen] = useState(false);

    // Welcome after sign-in (once per session; logout clears the flag): the profile button shows
    // "Good evening, Hanami / Signed in as Admin" for a few seconds, then returns to name and role.
    const [greeting, setGreeting] = useState(null);
    useEffect(() => {
        if (!userName || sessionStorage.getItem('hasShownWelcome')) return;
        const hour = new Date().getHours();
        setGreeting(hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening');
        sessionStorage.setItem('hasShownWelcome', 'true');
        const t = setTimeout(() => setGreeting(null), 6000);
        return () => clearTimeout(t);
    }, [userName]);
    const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
    const [notifMenuOpen, setNotifMenuOpen] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const [recentNotifs, setRecentNotifs] = useState([]);

    const profileRef = useRef(null);
    const searchRef = useRef(null);
    const notifRef = useRef(null);

    const [suggestions, setSuggestions] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    // A TCT, Tax Dec or PIN match from the cadastral map, listed above the other results.
    const [parcelHit, setParcelHit] = useState(null);

    // Fetch Notifications for Header
    const fetchNotifications = () => {
        // Accept: JSON makes an expired session return 401 instead of
        // redirecting, so /api/notifications never becomes the post-login URL.
        fetch('/api/notifications', { headers: { Accept: 'application/json' } })
            .then((res) => res.ok ? res.json() : { unread_count: 0, recent: [] })
            .then((data) => {
                setUnreadCount(data.unread_count || 0);
                setRecentNotifs(data.recent || []);
            })
            .catch((err) => console.error("Error fetching notifications:", err));
    };

    useEffect(() => {
        fetchNotifications();
        const timer = setInterval(fetchNotifications, 30000);
        return () => clearInterval(timer);
    }, []);

    const handleMarkAllReadHeader = (e) => {
        if (e) e.stopPropagation();
        router.post('/notifications/mark-all-read', {}, {
            preserveScroll: true,
            onSuccess: () => fetchNotifications(),
        });
    };

    // â”€â”€ Predictive Search Effect â”€â”€
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSuggestions([]);
            setParcelHit(null);
            return;
        }

        const timer = setTimeout(() => {
            setIsSearching(true);
            // Parcel numbers always carry digits, so plain words skip the lookup.
            const code = searchQuery.replace(/[^A-Za-z0-9]/g, '');
            if (/\d/.test(code) && code.length >= 5) {
                fetch(`/api/parcels/verify?code=${encodeURIComponent(searchQuery.trim())}`, { headers: { Accept: 'application/json' } })
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => setParcelHit(data?.found ? data : null))
                    .catch(() => setParcelHit(null));
            } else {
                setParcelHit(null);
            }
            fetch(`/api/global-search?q=${encodeURIComponent(searchQuery)}`)
                .then(async (response) => {
                    if (!response.ok) {
                        throw new Error(`Server error: ${response.status}`);
                    }
                    return response.json();
                })
                .then((data) => {
                    setSuggestions(data);
                    setIsSearching(false);
                })
                .catch((error) => {
                    console.error("Search failed:", error);
                    setIsSearching(false);
                });
        }, 200);

        return () => clearTimeout(timer);
    }, [searchQuery]);

    const handleParcelClick = async () => {
        const hit = parcelHit;
        setSearchQuery('');
        setSearchFocused(false);
        setParcelHit(null);
        if (!hit) return;
        onSelectParcel?.(hit);
        await promptParcelApplication(hit);
    };

    const handleSuggestionClick = (item) => {
        setSearchQuery('');
        setSearchFocused(false);
        if (item.type === 'Barangay' && onSelectLocation) {
            onSelectLocation({ label: item.label });
        } else if (item.path) {
            router.visit(item.path);
        }
    };

    // Close dropdowns when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (profileRef.current && !profileRef.current.contains(e.target)) {
                setProfileMenuOpen(false);
            }
            if (searchRef.current && !searchRef.current.contains(e.target)) {
                setSearchFocused(false);
            }
            if (notifRef.current && !notifRef.current.contains(e.target)) {
                setNotifMenuOpen(false);
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
                if (notifMenuOpen) {
                    e.preventDefault();
                    e.stopPropagation();
                    setNotifMenuOpen(false);
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

            // Command/Ctrl + K for search focus
            if (shouldShowSearch && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                const searchInput = document.getElementById('global-header-search');
                if (searchInput) {
                    searchInput.focus();
                    setSearchFocused(true);
                }
            }

            // ? key for keyboard help modal
            if (e.key === '?' && !isInputActive) {
                e.preventDefault();
                setShortcutsModalOpen(prev => !prev);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [shortcutsModalOpen, profileMenuOpen, searchFocused]);

    // ── Session Keep-Alive Heartbeat Ping ──
    useEffect(() => {
        const pingInterval = setInterval(() => {
            fetch('/ping').catch(() => {});
        }, 5 * 60 * 1000); // Ping every 5 minutes

        return () => clearInterval(pingInterval);
    }, []);

    const handleSignOutClick = () => {
        setProfileMenuOpen(false);
        (onLogout || confirmSignOut)(page?.props?.auth?.user);
    };

    return (
        <header className="h-14 bg-white border-b border-slate-200/90 shadow-[0_1px_4px_rgba(0,0,0,0.03)] flex items-center justify-between px-3.5 sm:px-5 shrink-0 z-[700] relative select-none">
            {/* â”€â”€ LEFT SECTION: Interactive Brand Capsule Menu Trigger â”€â”€ */}
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

            {/* â”€â”€ CENTER SECTION: Interactive Spatial Command Search Bar â”€â”€ */}
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
                            placeholder="Search barangay, TCT, Tax Dec or PIN…"
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
                                    âŒ˜K
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Predictive Spatial Search Suggestions Dropdown */}
                    {searchFocused && searchQuery.trim() !== '' && (
                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200/90 p-2 z-[999] animate-in fade-in slide-in-from-top-2 duration-150">
                            <div className="px-2.5 py-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-100">
                                <span>Predictive Results</span>
                                <span className="text-[10px] font-normal text-slate-400">
                                    {isSearching ? 'Searching...' : 'Click to jump'}
                                </span>
                            </div>
                            <div className="py-1 space-y-0.5">
                                {parcelHit && (() => {
                                    const p = parcelHit.parcel;
                                    const zone = getZoneInfo(p.clup_zone_code || p.land_use_class);
                                    return (
                                        <button
                                            type="button"
                                            onClick={handleParcelClick}
                                            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left hover:bg-slate-50 border-b border-slate-100"
                                        >
                                            <span className="w-3.5 h-3.5 rounded-[2px] shrink-0 border border-black/20" style={{ backgroundColor: zone.fill }} aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-xs font-semibold text-slate-800 truncate">
                                                    {p.tct_number || p.tax_dec_number || p.property_index_number}
                                                    {p.lot_number ? ` · Lot ${p.lot_number}` : ''}
                                                </span>
                                                <span className="block text-[10.5px] text-slate-500 truncate">
                                                    {p.barangay} · {zone.code ? zone.label : 'Not mapped in CLUP'} · Start an application
                                                </span>
                                            </span>
                                            <span className="text-[10px] font-semibold text-[#0b2a5b] bg-[#eaf0f8] px-2 py-0.5 rounded shrink-0">Parcel</span>
                                        </button>
                                    );
                                })()}
                                {suggestions.length === 0 && !parcelHit && !isSearching ? (
                                    <div className="px-2.5 py-4 text-center text-xs text-slate-400">
                                        No results found for "{searchQuery}"
                                    </div>
                                ) : (
                                    suggestions.map((item, idx) => {
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
                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2"><path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" /></svg>
                                                        </div>
                                                        <div className="min-w-0">
                                                            <p className="text-xs font-bold text-slate-800 truncate">
                                                                <HighlightMatch text={item.label} query={searchQuery} />
                                                            </p>
                                                            <p className="text-[10.5px] text-slate-500 truncate">
                                                                <HighlightMatch text={item.fullName} query={searchQuery} />
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200/60 px-2 py-0.5 rounded-md shrink-0">Barangay</span>
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
                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-semibold text-slate-800 truncate">
                                                            <HighlightMatch text={item.label} query={searchQuery} />
                                                        </p>
                                                        <p className="text-[10.5px] text-slate-500 truncate">
                                                            <HighlightMatch text={item.fullName} query={searchQuery} />
                                                        </p>
                                                    </div>
                                                </div>
                                                <span className="text-[10px] font-mono font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md shrink-0">{item.type}</span>
                                            </Link>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <div className="flex-1" />
            )}

            {/* â”€â”€ RIGHT SECTION: PST Clock, Shortcuts, Notifications & Profile â”€â”€ */}
            <div className="flex items-center gap-1.5 sm:gap-2.5">
                {/* Philippine Standard Time Display */}
                {/* Municipal time, ticking every second (Philippine Standard Time) */}
                {clock && <MunicipalClock />}

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

                {/* Notification Bell Dropdown Container */}
                <div className="relative" ref={notifRef}>
                    <button 
                        type="button"
                        onClick={() => {
                            // On the history page the dropdown would repeat the page; jump to the top of the feed instead.
                            if (activePage === 'notifications') {
                                document.querySelector('[data-notification-feed]')?.scrollTo({ top: 0, behavior: 'smooth' });
                                return;
                            }
                            setNotifMenuOpen(!notifMenuOpen);
                        }}
                        aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
                        className={`relative w-8 h-8 flex items-center justify-center rounded-xl transition-colors focus:outline-none ${
                            notifMenuOpen ? 'bg-slate-100 text-blue-700 ring-1 ring-slate-200' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                        }`}
                        title="System Notifications"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                        </svg>
                        {unreadCount > 0 && (
                            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-blue-600 ring-2 ring-white text-white text-[9.5px] font-bold leading-4 text-center tabular-nums" aria-hidden="true">
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>

                    {/* Notifications Dropdown Panel */}
                    {notifMenuOpen && (
                        <div role="menu" aria-label="Notifications" className="absolute right-0 mt-2 w-80 sm:w-96 font-['Plus_Jakarta_Sans',sans-serif] bg-white rounded-xl shadow-[0_20px_40px_-12px_rgba(15,23,42,.22)] border border-slate-200/90 z-[999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                            {/* Header — same structure as the account menu's summary block */}
                            <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100">
                                <div className="flex items-center gap-2">
                                    <h3 className="text-[13px] font-semibold text-slate-900">Notifications</h3>
                                    {unreadCount > 0 && (
                                        <span className="inline-flex px-1.5 py-px rounded border border-blue-200/80 bg-blue-50 text-[10.5px] font-medium text-blue-700">
                                            {unreadCount} new
                                        </span>
                                    )}
                                </div>
                                {unreadCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={handleMarkAllReadHeader}
                                        className="text-[12px] font-medium text-blue-600 hover:text-blue-800 transition-colors cursor-pointer"
                                    >
                                        Mark all as read
                                    </button>
                                )}
                            </div>

                            <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
                                {recentNotifs.length === 0 ? (
                                    <div className="px-4 py-8 text-center">
                                        <div className="w-9 h-9 rounded-full bg-blue-50 text-blue-600 mx-auto flex items-center justify-center mb-2.5">
                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                        </div>
                                        <p className="text-[12.5px] font-semibold text-slate-800">You're all caught up</p>
                                        <p className="mt-0.5 text-[11.5px] text-slate-500">No unread notifications. Past activity is in your history.</p>
                                    </div>
                                ) : (
                                    recentNotifs.map((item) => (
                                        <button
                                            type="button"
                                            role="menuitem"
                                            key={item.id}
                                            onClick={() => {
                                                setNotifMenuOpen(false);
                                                if (!item.is_read) {
                                                    router.post(`/notifications/${item.id}/read`, {}, {
                                                        preserveScroll: true,
                                                        onSuccess: () => {
                                                            fetchNotifications();
                                                            if (item.action_url) router.visit(item.action_url);
                                                        },
                                                        onError: () => {
                                                            if (item.action_url) router.visit(item.action_url);
                                                        },
                                                    });
                                                } else if (item.action_url) {
                                                    router.visit(item.action_url);
                                                }
                                            }}
                                            className="w-full text-left px-2.5 py-2 rounded-lg transition-colors cursor-pointer flex items-start gap-2.5 hover:bg-slate-100"
                                        >
                                            {/* Unread dot; read items keep the same indent */}
                                            <span className={`mt-[5px] w-2 h-2 rounded-full shrink-0 ${!item.is_read ? 'bg-blue-600' : 'bg-transparent'}`} aria-hidden="true" />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-baseline justify-between gap-2">
                                                    <span className={`text-[12.5px] truncate ${!item.is_read ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>
                                                        {item.title}
                                                        {!item.is_read && <span className="sr-only"> (unread)</span>}
                                                    </span>
                                                    <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                                                        {item.created_at ? (() => {
                                                            const d = new Date(item.created_at);
                                                            return d.toDateString() === new Date().toDateString()
                                                                ? d.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' })
                                                                : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
                                                        })() : ''}
                                                    </span>
                                                </span>
                                                <span className="block text-[11.5px] text-slate-500 truncate mt-0.5">
                                                    {item.message}
                                                </span>
                                            </span>
                                        </button>
                                    ))
                                )}
                            </div>

                            {/* Footer item — styled like "Sign out" in the account menu */}
                            <div className="p-1.5 border-t border-slate-100">
                                <Link
                                    href="/notifications"
                                    role="menuitem"
                                    onClick={() => setNotifMenuOpen(false)}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                                >
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                    </svg>
                                    View notification history
                                </Link>
                            </div>
                        </div>
                    )}
                </div>

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
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center text-white font-bold text-xs shadow-xs">
                            {userName?.charAt(0).toUpperCase() || 'S'}
                        </div>
                        {/* Just after sign-in the button greets the user for a few seconds, then shows name and role. */}
                        <div key={greeting ? 'greeting' : 'identity'} className="hidden sm:flex flex-col text-left animate-in fade-in duration-500">
                            <span className="text-xs font-bold text-slate-800 leading-tight">
                                {greeting ? `${greeting}, ${(userName || '').trim().split(/\s+/)[0]}` : userName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-semibold leading-none mt-0.5">
                                {greeting ? `Signed in as ${userRole}` : userRole}
                            </span>
                        </div>
                        {greeting && <span className="sr-only" role="status">{`${greeting}, ${userName}. Signed in as ${userRole}.`}</span>}
                        <svg className={`w-3.5 h-3.5 text-slate-500 hidden sm:block transition-transform duration-200 ${profileMenuOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                        </svg>
                    </button>

                    {/* Profile Dropdown Menu */}
                    {profileMenuOpen && (
                        <div role="menu" aria-label="Account" className="absolute right-0 mt-2 w-64 font-['Plus_Jakarta_Sans',sans-serif] bg-white rounded-xl shadow-[0_20px_40px_-12px_rgba(15,23,42,.22)] border border-slate-200/90 z-[999] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                            {/* Account summary */}
                            <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-100">
                                <div className="w-10 h-10 rounded-lg bg-gradient-to-tr from-blue-700 to-indigo-600 grid place-items-center text-white font-bold text-sm shrink-0" aria-hidden="true">
                                    {(userName || 'S').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('')}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-900 truncate">{userName}</p>
                                    {page?.props?.auth?.user?.email && (
                                        <p className="text-[11.5px] text-slate-500 truncate">{page.props.auth.user.email}</p>
                                    )}
                                    <span className="mt-1 inline-flex px-1.5 py-px rounded border border-blue-200/80 bg-blue-50 text-[10.5px] font-medium text-blue-700">
                                        {userRole}
                                    </span>
                                </div>
                            </div>

                            {/* Upstream (origin/master) intentionally removed the
                                "Account & Settings" link from the profile dropdown.
                                Loop 6 keeps that removal: /settings stays backend-protected
                                with role:Admin and is reachable through the Admin-only
                                Sidebar entry, so no equivalent header guard is needed. */}
                            <div className="p-1.5">
                                <button
                                    type="button"
                                    role="menuitem"
                                    onClick={handleSignOutClick}
                                    className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] font-medium text-slate-700 hover:bg-red-50 hover:text-red-600 transition-colors cursor-pointer group"
                                >
                                    <svg className="w-4 h-4 text-slate-400 group-hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
                                    </svg>
                                    Sign out
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* â”€â”€ KEYBOARD SHORTCUTS & HELP MODAL â”€â”€ */}
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
                                    âŒ¨
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
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs">âŒ˜ / Ctrl</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs">K</kbd>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Tracking · Forecast · Diversity · CLUP overlay</span>
                                <div className="flex gap-1 font-mono font-bold text-[11px]">
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Application Tracking">1</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="LC Demand Forecast">2</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Diversity Index">3</kbd>
                                    <kbd className="px-2 py-0.5 bg-white border border-slate-200 rounded shadow-2xs" title="Toggle CLUP 2030 overlay">4</kbd>
                                </div>
                            </div>

                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                                <span className="text-slate-800 font-semibold">Toggle Analysis Panel</span>
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
