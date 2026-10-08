import React, { useState, useEffect, useMemo, useRef } from "react";
import { Head, router } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
import { confirmSignOut } from "@/utils/signOut";

const icon = (d) => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={d} />
    </svg>
);

const DOC_ICON = "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z";
const BELL_ICON = "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0";

// One blue/slate scheme for every type (matches User Management); only the icon and label differ.
const TYPE_CONFIG = {
    application_created: { label: "Application", icon: icon(DOC_ICON) },
    status_updated: {
        label: "Status Transition",
        icon: icon("M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"),
    },
    inspection_assigned: {
        label: "Field Inspection",
        icon: icon("M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5"),
    },
    inspection_completed: {
        label: "Inspection Synced",
        icon: icon("M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"),
    },
    forecast_generated: {
        label: "Spatial Analytics",
        icon: icon("M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"),
    },
    permit_generated: { label: "Permit Generated", icon: icon(DOC_ICON) },
    user_registered: {
        label: "User Security",
        icon: icon("M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"),
    },
    application_support: {
        label: "Support",
        icon: icon("M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"),
    },
    default: { label: "Notification", icon: icon(BELL_ICON) },
};

// History filters; keys match NotificationController::CATEGORIES.
const CATEGORIES = [
    { id: "all", label: "All activity" },
    { id: "applications", label: "Applications" },
    { id: "inspections", label: "Inspections" },
    { id: "permits", label: "Permits" },
    { id: "users", label: "User Security" },
    { id: "analytics", label: "Analytics" },
    { id: "support", label: "Support" },
];

const SWAL_CANCEL =
    "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold border border-slate-200 transition-colors cursor-pointer";
const swalClasses = (confirmColor) => ({
    popup: "rounded-2xl border border-slate-200 shadow-xl p-6 bg-white font-sans",
    title: "text-base font-bold text-slate-900",
    htmlContainer: "text-xs text-slate-500",
    actions: "flex items-center justify-center gap-3 mt-4",
    confirmButton: `inline-flex items-center justify-center px-4 py-2 rounded-lg ${confirmColor} text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer`,
    cancelButton: SWAL_CANCEL,
});

export default function Index({
    notifications = { data: [], links: [] },
    filters = {},
    categoryCounts = {},
    unreadCount = 0,
    auth = {},
}) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || "");
    const activeCategory = filters.category || "all";
    const totalCount = categoryCounts.all ?? 0;

    const userName = auth?.user?.name || "Planning Officer";
    const userRole = auth?.user?.role || "Administrator";

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

    const applyFilter = (next) => {
        router.get(
            "/notifications",
            { category: activeCategory === "all" ? undefined : activeCategory, search: search || undefined, ...next },
            { preserveState: true, replace: true }
        );
    };

    // Debounced search (300ms), same as User Management
    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== (filters.search || "")) applyFilter({ search: search || undefined });
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const handleLogout = confirmSignOut;

    // Opens the notification's target, marking it read first
    const handleNotificationClick = (item) => {
        const go = () => item.action_url && router.visit(item.action_url);
        if (!item.is_read) {
            router.post(`/notifications/${item.id}/read`, {}, { preserveScroll: true, onSuccess: go, onError: go });
        } else {
            go();
        }
    };

    const handleMarkAsRead = (id) => {
        router.post(`/notifications/${id}/read`, {}, { preserveScroll: true });
    };

    // Delete with a 5s undo window: the row hides at once, the request goes out when the window closes.
    const [pendingDelete, setPendingDelete] = useState(null); // { id, timer }
    const pendingRef = useRef(null);
    pendingRef.current = pendingDelete;

    const commitDelete = (pending) => {
        clearTimeout(pending.timer);
        router.delete(`/notifications/${pending.id}`, { preserveScroll: true, preserveState: true });
    };

    const handleDeleteSingle = (id) => {
        if (pendingRef.current) commitDelete(pendingRef.current); // one undo at a time
        const timer = setTimeout(() => {
            setPendingDelete(null);
            commitDelete({ id, timer });
        }, 5000);
        setPendingDelete({ id, timer });
    };

    const undoDelete = () => {
        clearTimeout(pendingDelete.timer);
        setPendingDelete(null);
    };

    // Live banner: the page polls the same endpoint as the bell and offers a refresh when new items arrive.
    const [newCount, setNewCount] = useState(0);
    useEffect(() => {
        setNewCount(0);
        const id = setInterval(() => {
            fetch("/api/notifications", { headers: { Accept: "application/json" } })
                .then((res) => (res.ok ? res.json() : null))
                .then((data) => data && setNewCount(Math.max(0, (data.unread_count || 0) - unreadCount)))
                .catch(() => {});
        }, 30000);
        return () => clearInterval(id);
    }, [unreadCount]);

    const showNew = () => {
        setNewCount(0);
        router.reload({ onSuccess: () => document.querySelector("[data-notification-feed]")?.scrollTo({ top: 0 }) });
    };

    const handleMarkAllRead = () => {
        Swal.fire({
            title: "Mark All as Read?",
            text: "Are you sure you want to mark all notifications as read?",
            icon: "question",
            showCancelButton: true,
            confirmButtonText: "Yes, mark all read",
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: swalClasses("bg-blue-600 hover:bg-blue-700"),
        }).then((result) => {
            if (result.isConfirmed) router.post("/notifications/mark-all-read", {}, { preserveScroll: true });
        });
    };

    // Default clears read items only; wiping unread ones too is the secondary (deny) choice.
    const readCount = Math.max(0, totalCount - unreadCount);
    const handleClear = () => {
        Swal.fire({
            title: readCount > 0 ? "Clear Read Notifications?" : "No Read Notifications",
            html: readCount > 0
                ? `${readCount} read notification${readCount === 1 ? "" : "s"} will be permanently removed. Unread ones are kept.`
                : `Everything here is still unread. You can clear all ${totalCount} notification${totalCount === 1 ? "" : "s"} instead.`,
            icon: "warning",
            showConfirmButton: readCount > 0,
            showDenyButton: true,
            showCancelButton: true,
            confirmButtonText: "Clear read",
            denyButtonText: `Clear all ${totalCount}`,
            cancelButtonText: "Cancel",
            buttonsStyling: false,
            customClass: {
                ...swalClasses("bg-blue-600 hover:bg-blue-700"),
                denyButton: "inline-flex items-center justify-center px-4 py-2 rounded-lg bg-white hover:bg-rose-50 text-rose-600 text-xs font-semibold border border-rose-200 transition-colors cursor-pointer",
            },
        }).then((result) => {
            if (result.isConfirmed) router.delete("/notifications/clear-read", { preserveScroll: true });
            if (result.isDenied) router.delete("/notifications/clear-all", { preserveScroll: true });
        });
    };

    const formatTime = (dateString) =>
        dateString ? new Date(dateString).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "";

    // One group per calendar day, so every row only needs its time.
    const groups = useMemo(() => {
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);

        const byDay = new Map();
        (notifications?.data || []).forEach((n) => {
            if (pendingDelete?.id === n.id) return;
            const d = new Date(n.created_at);
            const key = d.toDateString();
            if (!byDay.has(key)) {
                const label =
                    key === today.toDateString() ? "Today"
                    : key === yesterday.toDateString() ? "Yesterday"
                    : d.toLocaleDateString("en-US", {
                          weekday: "short", month: "short", day: "numeric",
                          ...(d.getFullYear() !== today.getFullYear() && { year: "numeric" }),
                      });
                byDay.set(key, { label, items: [] });
            }
            byDay.get(key).items.push(n);
        });
        return [...byDay.values()];
    }, [notifications?.data, pendingDelete]);

    const isEmpty = groups.length === 0;

    return (
        <>
            <Head title="Notification History | iMAPS" />

            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

                #notifications-page-root, .swal2-popup {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                }
                #notifications-page-root .font-mono {
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

                    <main className="flex-1 w-full h-full flex flex-col overflow-hidden bg-white">
                        <div className="flex-1 flex flex-col h-full min-h-0 w-full">
                            <h1 className="sr-only">Notification history</h1>

                            {/* ── TOOLBAR: category switch (left), search/actions (right) ── */}
                            <div className="px-6 py-3 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 shrink-0">
                                <nav className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 border border-slate-200/80 overflow-x-auto max-w-full" aria-label="Filter by category">
                                    {CATEGORIES.map((tab) => {
                                        const on = activeCategory === tab.id;
                                        const count = categoryCounts[tab.id] ?? 0;
                                        // Empty categories stay out of the way unless selected
                                        if (!on && tab.id !== "all" && count === 0) return null;
                                        return (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => applyFilter({ category: tab.id === "all" ? undefined : tab.id })}
                                                aria-pressed={on}
                                                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-xs whitespace-nowrap transition-all cursor-pointer ${on
                                                    ? "bg-white text-slate-900 font-semibold shadow-xs ring-1 ring-slate-200/80"
                                                    : "text-slate-500 hover:text-slate-800"
                                                    }`}
                                            >
                                                {tab.label}
                                                <span className={`min-w-5 px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums text-center ${on ? "bg-blue-600 text-white" : "bg-slate-200/80 text-slate-600"}`}>
                                                    {count}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </nav>

                                <div className="flex items-center gap-2.5 flex-wrap">
                                    <div className="relative w-48 sm:w-56">
                                        <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                                        </svg>
                                        <input
                                            type="text"
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search notifications..."
                                            aria-label="Search notifications"
                                            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-1 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs transition-all"
                                        />
                                        {search && (
                                            <button
                                                type="button"
                                                onClick={() => setSearch("")}
                                                aria-label="Clear search"
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>

                                    {totalCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleClear}
                                            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 text-slate-600 hover:text-rose-600 text-xs font-medium shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                                        >
                                            Clear read
                                        </button>
                                    )}
                                    {/* Triage lives in the bell; offered here only while something is unread */}
                                    {unreadCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={handleMarkAllRead}
                                            className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-lg border border-slate-200 bg-white hover:bg-blue-50 hover:border-blue-200 text-slate-600 hover:text-blue-700 text-xs font-medium shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                                        >
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                            </svg>
                                            Mark {unreadCount} read
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* ── FEED ── */}
                            {isEmpty ? (
                                <div className="p-12 text-center">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                                        {icon(BELL_ICON)}
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-800">
                                        {search || activeCategory !== "all" ? "No matching activity" : "No activity yet"}
                                    </h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                                        {search
                                            ? `No notifications match "${search}".`
                                            : activeCategory !== "all"
                                            ? "Nothing recorded in this category."
                                            : "Notifications you receive will be kept here."}
                                    </p>
                                    {(search || activeCategory !== "all") && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSearch("");
                                                router.get("/notifications", {}, { preserveState: true, replace: true });
                                            }}
                                            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                        >
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div data-notification-feed className="flex-1 min-h-0 overflow-y-auto bg-slate-50/70">
                                    {newCount > 0 && (
                                        <button
                                            type="button"
                                            onClick={showNew}
                                            className="sticky top-0 z-20 w-full flex items-center justify-center gap-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors cursor-pointer"
                                        >
                                            <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden="true" />
                                            {newCount} new notification{newCount === 1 ? "" : "s"}
                                            <span className="font-semibold underline underline-offset-2">Show</span>
                                        </button>
                                    )}
                                    {groups.map((group) => (
                                        <section key={group.label} className="bg-white">
                                            <h2 className="sticky top-0 z-10 flex items-center gap-2 bg-slate-50/95 backdrop-blur border-y border-slate-200/80 py-2 px-6 text-[10.5px] font-semibold text-slate-500 uppercase tracking-[0.08em]">
                                                {group.label}
                                                <span className="min-w-5 px-1.5 rounded-full bg-slate-200/80 text-slate-600 text-[10px] font-semibold tabular-nums text-center normal-case tracking-normal">
                                                    {group.items.length}
                                                </span>
                                            </h2>
                                            <ul className="divide-y divide-slate-100">
                                                {group.items.map((item) => {
                                                    const config = TYPE_CONFIG[item.type] || TYPE_CONFIG.default;
                                                    const isUnread = !item.is_read;
                                                    return (
                                                        <li
                                                            key={item.id}
                                                            className={`group flex items-center gap-3 h-10 px-6 text-xs transition-colors hover:bg-slate-50 ${isUnread ? "bg-blue-50/30" : ""}`}
                                                        >
                                                            {/* Unread dot keeps its slot so rows stay aligned */}
                                                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isUnread ? "bg-blue-600" : "bg-transparent"}`} aria-hidden="true" />

                                                            <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5 ${isUnread ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"}`}>
                                                                {config.icon}
                                                            </span>

                                                            <span className="hidden md:block w-32 shrink-0 truncate text-[11px] font-medium text-slate-400">
                                                                {config.label}
                                                            </span>

                                                            {/* Title + message on one line; opens the notification */}
                                                            <button
                                                                type="button"
                                                                onClick={() => handleNotificationClick(item)}
                                                                title={item.message}
                                                                className={`min-w-0 flex-1 truncate text-left ${item.action_url || isUnread ? "cursor-pointer" : "cursor-default"} focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/30 rounded`}
                                                            >
                                                                <span className={isUnread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}>
                                                                    {item.title}
                                                                </span>
                                                                {isUnread && <span className="sr-only"> (unread)</span>}
                                                                <span className="text-slate-400"> — {item.message}</span>
                                                            </button>

                                                            {/* Timestamp; hover/focus swaps in row actions */}
                                                            <div className="relative shrink-0 flex items-center justify-end w-24">
                                                                <time
                                                                    dateTime={item.created_at}
                                                                    className={`text-[11px] whitespace-nowrap ${isUnread ? "text-blue-600 font-semibold" : "text-slate-400"} tabular-nums group-hover:opacity-0 group-focus-within:opacity-0 transition-opacity`}
                                                                >
                                                                    {formatTime(item.created_at)}
                                                                </time>
                                                                <div className="absolute right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
                                                                    {isUnread && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleMarkAsRead(item.id)}
                                                                            title="Mark as read"
                                                                            aria-label={`Mark "${item.title}" as read`}
                                                                            className="p-1.5 rounded-md text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer"
                                                                        >
                                                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                                                                            </svg>
                                                                        </button>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDeleteSingle(item.id)}
                                                                        title="Delete"
                                                                        aria-label={`Delete "${item.title}"`}
                                                                        className="p-1.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                                                    >
                                                                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                                        </svg>
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </section>
                                    ))}
                                </div>
                            )}

                            {/* ── PAGINATION CONTROLS ── */}
                            {notifications?.links?.length > 3 && (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-6 py-3 border-t border-slate-200/80 shrink-0">
                                    <p className="text-xs text-slate-500">
                                        Showing <span className="font-semibold text-slate-800">{notifications.from || 1}</span> to{" "}
                                        <span className="font-semibold text-slate-800">{notifications.to || notifications.data.length}</span> of{" "}
                                        <span className="font-semibold text-slate-800">{notifications.total ?? totalCount}</span> notifications
                                    </p>
                                    <div className="flex items-center gap-1">
                                        {notifications.links.map((link, i) => (
                                            <button
                                                key={i}
                                                disabled={!link.url || link.active}
                                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${link.active
                                                    ? "bg-blue-600 border-blue-600 text-white font-semibold shadow-2xs"
                                                    : !link.url
                                                        ? "opacity-30 cursor-not-allowed border-slate-200 bg-white text-slate-400"
                                                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                                                    }`}
                                                dangerouslySetInnerHTML={{ __html: link.label }}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </main>
                </div>
            </div>

            {/* Undo toast for single deletes */}
            <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[1000]">
                {pendingDelete && (
                    <div id="notifications-page-toast" className="flex items-center gap-4 pl-4 pr-2 py-2 rounded-xl bg-slate-900 text-white text-xs shadow-xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        Notification deleted
                        <button
                            type="button"
                            onClick={undoDelete}
                            className="px-2.5 py-1 rounded-lg font-semibold text-blue-300 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                        >
                            Undo
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
