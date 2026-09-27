import React, { useState, useEffect } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

const TYPE_CONFIG = {
    application_created: {
        bg: "bg-blue-50 border-blue-200 text-blue-700",
        iconBg: "bg-blue-50 border border-blue-100 text-blue-600",
        label: "Application",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
        ),
    },
    status_updated: {
        bg: "bg-purple-50 border-purple-200 text-purple-700",
        iconBg: "bg-purple-50 border border-purple-100 text-purple-600",
        label: "Status Transition",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
            </svg>
        ),
    },
    inspection_assigned: {
        bg: "bg-amber-50 border-amber-200 text-amber-700",
        iconBg: "bg-amber-50 border border-amber-100 text-amber-600",
        label: "Field Inspection",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
        ),
    },
    inspection_completed: {
        bg: "bg-emerald-50 border-emerald-200 text-emerald-700",
        iconBg: "bg-emerald-50 border border-emerald-100 text-emerald-600",
        label: "Inspection Synced",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        ),
    },
    forecast_generated: {
        bg: "bg-indigo-50 border-indigo-200 text-indigo-700",
        iconBg: "bg-indigo-50 border border-indigo-100 text-indigo-600",
        label: "Spatial Analytics",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
        ),
    },
    user_registered: {
        bg: "bg-teal-50 border-teal-200 text-teal-700",
        iconBg: "bg-teal-50 border border-teal-100 text-teal-600",
        label: "User Security",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
        ),
    },
    default: {
        bg: "bg-slate-50 border-slate-200 text-slate-700",
        iconBg: "bg-slate-50 border border-slate-200 text-slate-600",
        label: "Notification",
        icon: (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
            </svg>
        ),
    },
};

export default function Index({
    notifications = { data: [], links: [] },
    filters = {},
    unreadCount = 0,
    totalCount = 0,
    auth = {},
}) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || "");
    const [activeTab, setActiveTab] = useState(filters.filter || "all");

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

    // Clock effect matching Settings page
    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(
                now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) +
                " · " +
                now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })
            );
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    // Logout handler matching Settings page
    const handleLogout = () => {
        Swal.fire({
            title: "Sign Out?",
            text: "Are you sure you want to log out of iMAPS?",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, sign out",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                sessionStorage.removeItem("hasShownWelcome");
                router.post("/logout");
            }
        });
    };

    // Filter Change Handler
    const handleFilterChange = (tab, searchQuery = search) => {
        setActiveTab(tab);
        router.get(
            "/notifications",
            { filter: tab, search: searchQuery },
            { preserveState: true, replace: true }
        );
    };

    // Mark single as read
    const handleMarkAsRead = (id) => {
        router.post(`/notifications/${id}/read`, {}, { preserveScroll: true });
    };

    // Mark all as read
    const handleMarkAllRead = () => {
        Swal.fire({
            title: "Mark All as Read?",
            text: "Are you sure you want to mark all notifications as read?",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes, mark all read",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                router.post("/notifications/mark-all-read", {}, { preserveScroll: true });
            }
        });
    };

    // Clear all notifications
    const handleClearAll = () => {
        Swal.fire({
            title: "Clear All Notifications?",
            text: "This action will permanently remove all notifications for your account.",
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Yes, clear all",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
                title: "text-base font-bold text-slate-900",
                htmlContainer: "text-xs text-slate-500",
                actions: "flex items-center justify-center gap-3 mt-4",
                confirmButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer",
                cancelButton:
                    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) {
                router.delete("/notifications/clear-all", { preserveScroll: true });
            }
        });
    };

    // Delete single notification
    const handleDeleteSingle = (id) => {
        router.delete(`/notifications/${id}`, { preserveScroll: true });
    };

    // Format relative timestamp
    const formatTime = (dateString) => {
        if (!dateString) return "";
        const date = new Date(dateString);
        const now = new Date();
        const seconds = Math.floor((now - date) / 1000);

        if (seconds < 60) return "Just now";
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;

        return date.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    };

    return (
        <>
            <Head title="Notifications | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
                
                #notifications-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 6px; }
                ::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
            `}</style>

            <div id="notifications-page-root" className="bg-slate-50/75 text-slate-800 h-screen flex flex-col overflow-hidden antialiased">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="notifications"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="notifications"
                    />

                    {sidebarOpen && (
                        <div
                            onClick={() => setSidebarOpen(false)}
                            className="absolute inset-0 bg-slate-900/20 backdrop-blur-xs z-[750] transition-opacity duration-200"
                        />
                    )}

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden">
                        <div className="p-6 sm:p-8 flex-1 flex flex-col h-full overflow-y-auto max-w-6xl mx-auto w-full gap-5">

                            {/* ── HEADER SECTION ── */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 shrink-0">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                        </svg>
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">Notifications</h1>
                                            {unreadCount > 0 && (
                                                <span className="bg-blue-50 border border-blue-200/80 text-blue-700 text-[11px] font-bold px-2.5 py-0.5 rounded-md">
                                                    {unreadCount} Unread
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2.5">
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllRead}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-blue-200/90 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                            <span>Mark All Read</span>
                                        </button>
                                    )}
                                    {totalCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleClearAll}
                                            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200/90 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-700 hover:text-rose-600 text-xs font-semibold shadow-2xs transition-all active:scale-98 cursor-pointer"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                            </svg>
                                            <span>Clear All</span>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── TAB NAVIGATION MATCHING SETTINGS ── */}
                            <div className="border-b border-slate-200/80 pb-0.5 shrink-0 flex items-center justify-between gap-4 flex-wrap">
                                <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto" aria-label="Notification Tabs">
                                    {[
                                        { id: "all", label: `All Notifications (${totalCount})` },
                                        { id: "unread", label: `Unread (${unreadCount})` },
                                    ].map((tab) => {
                                        const isSelected = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => handleFilterChange(tab.id)}
                                                className={`py-3 px-1 border-b-2 text-xs font-medium transition-all cursor-pointer flex items-center gap-2 whitespace-nowrap ${
                                                    isSelected
                                                        ? "border-blue-600 text-blue-600 font-semibold"
                                                        : "border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300"
                                                }`}
                                            >
                                                <span>{tab.label}</span>
                                            </button>
                                        );
                                    })}
                                </nav>

                                {/* Search Filter input */}
                                <div className="relative w-full sm:w-64 mb-1">
                                    <svg
                                        className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => {
                                            setSearch(e.target.value);
                                            handleFilterChange(activeTab, e.target.value);
                                        }}
                                        placeholder="Filter notifications..."
                                        className="w-full bg-white text-xs text-slate-800 placeholder-slate-400 pl-8 pr-3 py-1.5 rounded-lg border border-slate-200/90 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all outline-none shadow-2xs"
                                    />
                                </div>
                            </div>

                            {/* ── CARD CONTAINER MATCHING SETTINGS ── */}
                            <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-7 shadow-2xs space-y-6">
                                <div>
                                    <h2 className="text-base font-bold text-slate-900 tracking-tight">System Feed</h2>
                                    <p className="text-xs text-slate-500 font-medium mt-0.5">
                                        Audit logs, field inspection assignments, and spatial status changes recorded in iMAPS.
                                    </p>
                                </div>

                                {/* Notifications List */}
                                <div className="space-y-3">
                                    {notifications?.data?.length === 0 ? (
                                        <div className="rounded-xl border border-dashed border-slate-200 p-10 text-center space-y-2">
                                            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
                                                </svg>
                                            </div>
                                            <h3 className="text-xs font-bold text-slate-700">No notifications found</h3>
                                            <p className="text-[11px] text-slate-400 max-w-xs mx-auto">
                                                {activeTab === "unread"
                                                    ? "All notifications have been read."
                                                    : search
                                                    ? `No matches for "${search}".`
                                                    : "Your notification log is empty."}
                                            </p>
                                        </div>
                                    ) : (
                                        notifications.data.map((item) => {
                                            const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.default;
                                            const isUnread = !item.is_read;

                                            return (
                                                <div
                                                    key={item.id}
                                                    className={`group rounded-xl border p-4 transition-all flex items-start justify-between gap-4 ${
                                                        isUnread
                                                            ? "border-blue-200 bg-blue-50/30"
                                                            : "border-slate-200/80 bg-white hover:border-slate-300"
                                                    }`}
                                                >
                                                    <div className="flex items-start gap-3.5 min-w-0 flex-1">
                                                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${config.iconBg}`}>
                                                            {config.icon}
                                                        </div>

                                                        <div className="space-y-1 min-w-0 flex-1">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                {isUnread && (
                                                                    <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                                                )}
                                                                <h4 className={`text-xs font-bold ${isUnread ? "text-slate-900" : "text-slate-800"}`}>
                                                                    {item.title}
                                                                </h4>
                                                                <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${config.bg}`}>
                                                                    {config.label}
                                                                </span>
                                                                <span className="text-[11px] text-slate-400 font-medium">
                                                                    • {formatTime(item.created_at)}
                                                                </span>
                                                            </div>

                                                            <p className="text-xs text-slate-600 leading-relaxed font-normal">
                                                                {item.message}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-2 shrink-0 self-center">
                                                        {item.action_url && (
                                                            <Link
                                                                href={item.action_url}
                                                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-3 py-1.5 rounded-lg transition-all"
                                                            >
                                                                <span>View</span>
                                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                                                                </svg>
                                                            </Link>
                                                        )}

                                                        {isUnread && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleMarkAsRead(item.id)}
                                                                title="Mark as read"
                                                                className="w-7 h-7 flex items-center justify-center text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                                            >
                                                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                </svg>
                                                            </button>
                                                        )}

                                                        <button
                                                            type="button"
                                                            onClick={() => handleDeleteSingle(item.id)}
                                                            title="Delete notification"
                                                            className="w-7 h-7 flex items-center justify-center text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>

                                {/* Pagination */}
                                {notifications?.links?.length > 3 && (
                                    <div className="flex items-center justify-center gap-1.5 pt-4 border-t border-slate-100">
                                        {notifications.links.map((link, idx) => (
                                            <button
                                                key={idx}
                                                disabled={!link.url}
                                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                                                    link.active
                                                        ? "bg-blue-600 text-white shadow-2xs"
                                                        : link.url
                                                        ? "bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
                                                        : "bg-slate-100 text-slate-400 cursor-not-allowed opacity-50"
                                                }`}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>

                        </div>
                    </main>
                </div>
            </div>
        </>
    );
}
