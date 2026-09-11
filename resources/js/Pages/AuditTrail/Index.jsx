import React, { useState, useEffect } from "react";
import { Head, router, Link } from "@inertiajs/react";
import Swal from "sweetalert2";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";

export default function Index({
    logs = { data: [], links: [] },
    actions = [],
    stats = [],
    filters = {},
    auth = {},
}) {
    const [clock, setClock] = useState("");
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [search, setSearch] = useState(filters.search || "");
    const [expandedId, setExpandedId] = useState(null);

    const userName = auth?.user?.name || "Administrator";
    const userRole = auth?.user?.role || "Admin";

    // Live clock ticker
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

    // Debounced search (300ms)
    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== (filters.search || "")) {
                router.get(
                    "/audit-log",
                    { ...filters, search: search || undefined, page: 1 },
                    { preserveState: true, replace: true }
                );
            }
        }, 300);
        return () => clearTimeout(t);
    }, [search]);

    const applyAction = (action) => {
        router.get(
            "/audit-log",
            { ...filters, action: action || undefined, page: 1 },
            { preserveState: true, replace: true }
        );
    };

    const clearFilters = () => {
        setSearch("");
        router.get("/audit-log", {}, { preserveState: true, replace: true });
    };

    const toggleExpand = (id) => {
        setExpandedId((prev) => (prev === id ? null : id));
    };

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

    // Format action label cleanly (no raw snake_case)
    const formatActionLabel = (action) => {
        if (!action) return "Event";
        return action
            .replace(/_/g, " ")
            .toLowerCase()
            .replace(/\b\w/g, (char) => char.toUpperCase());
    };

    // Initials helper
    const getInitials = (name) => {
        if (!name) return "SY";
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    // Date/time formatting helpers
    const formatDate = (dateString) => {
        if (!dateString) return "—";
        try {
            return new Date(dateString).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
            });
        } catch {
            return dateString;
        }
    };

    const formatTime = (dateString) => {
        if (!dateString) return "";
        try {
            return new Date(dateString).toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
            });
        } catch {
            return "";
        }
    };

    const hasFilters = !!filters.search || !!filters.action;

    return (
        <>
            <Head title="Audit Trail & Monitoring | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');

                #audit-page-root {
                    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                }
                .font-mono {
                    font-family: 'JetBrains Mono', monospace !important;
                }

                ::-webkit-scrollbar {
                    width: 6px;
                    height: 6px;
                }
                ::-webkit-scrollbar-track {
                    background: transparent;
                }
                ::-webkit-scrollbar-thumb {
                    background: #cbd5e1;
                    border-radius: 9999px;
                }
                ::-webkit-scrollbar-thumb:hover {
                    background: #94a3b8;
                }
            `}</style>

            <div id="audit-page-root" className="bg-slate-100/60 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                <Header
                    userName={userName}
                    userRole={userRole}
                    clock={clock}
                    onLogout={handleLogout}
                    sidebarOpen={sidebarOpen}
                    setSidebarOpen={setSidebarOpen}
                    activePage="audit-log"
                />

                <div className="flex-1 overflow-hidden relative flex flex-col min-w-0">
                    <Sidebar
                        userName={userName}
                        userRole={userRole}
                        sidebarOpen={sidebarOpen}
                        setSidebarOpen={setSidebarOpen}
                        onLogout={handleLogout}
                        activePage="audit-log"
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
                                <div>
                                    <div className="flex items-center gap-2.5">
                                        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                                            Audit Trail
                                        </h1>
                                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Monitoring Active
                                        </span>
                                    </div>
                                    <p className="text-xs text-slate-500 mt-1">
                                        Continuous immutable event feed and compliance trace of municipal planning activities.
                                    </p>
                                </div>

                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-mono text-slate-600 bg-white border border-slate-200/90 px-3 py-1.5 rounded-lg shadow-2xs">
                                        {logs.total} {logs.total === 1 ? "Event Recorded" : "Events Recorded"}
                                    </span>
                                </div>
                            </div>

                            {/* ── ACTION TABS & CONTROLS BAR ── */}
                            <div className="border-b border-slate-200/80 pb-0.5 flex flex-col md:flex-row md:items-center justify-between gap-3 shrink-0">
                                <nav className="-mb-px flex space-x-6 sm:space-x-8 overflow-x-auto" aria-label="Audit Actions">
                                    {[
                                        { id: "", label: "All Events" },
                                        ...actions.map((act) => ({
                                            id: act,
                                            label: formatActionLabel(act),
                                        })),
                                    ].map((tab) => {
                                        const isSelected = (filters.action || "") === tab.id;
                                        return (
                                            <button
                                                key={tab.id || "all"}
                                                type="button"
                                                onClick={() => applyAction(tab.id)}
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

                                {/* Fast Search Bar */}
                                <div className="flex items-center gap-2.5 pb-2 md:pb-0">
                                    <div className="relative w-64 sm:w-72">
                                        <svg
                                            className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none"
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
                                            onChange={(e) => setSearch(e.target.value)}
                                            placeholder="Search reference, applicant, performer..."
                                            className="w-full rounded-lg border border-slate-200 bg-white pl-8 pr-7 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 shadow-2xs transition-all"
                                        />
                                        {search && (
                                            <button
                                                type="button"
                                                onClick={() => setSearch("")}
                                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                                            >
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* ── ENTERPRISE AUDIT MONITORING STREAM (BALANCED & CLEAN) ── */}
                            {logs.data.length === 0 ? (
                                <div className="bg-white rounded-xl border border-slate-200/90 p-12 text-center shadow-xs">
                                    <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
                                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-sm font-semibold text-slate-800">No audit records found</h3>
                                    <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                                        No log entries match your active query or action filter.
                                    </p>
                                    {hasFilters && (
                                        <button
                                            type="button"
                                            onClick={clearFilters}
                                            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-medium text-slate-700 shadow-2xs transition-colors cursor-pointer"
                                        >
                                            Clear Filters
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-hidden flex flex-col">
                                    <div className="overflow-y-auto divide-y divide-slate-100 max-h-[calc(100vh-270px)]">
                                        {logs.data.map((log) => {
                                            const isExpanded = expandedId === log.id;
                                            return (
                                                <div
                                                    key={log.id}
                                                    className="group transition-colors"
                                                >
                                                    {/* Primary Event Monitoring Row */}
                                                    <div
                                                        onClick={() => toggleExpand(log.id)}
                                                        className="p-4 sm:px-6 sm:py-4 hover:bg-slate-50/70 transition-colors flex items-start gap-4 sm:gap-6 cursor-pointer select-none"
                                                    >
                                                        {/* 1. Left: Chronological Timestamp with Timeline Node */}
                                                        <div className="flex items-start gap-3 shrink-0 pt-0.5 w-24 sm:w-28">
                                                            <div className="font-mono text-right w-full">
                                                                <div className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                                                                    {formatTime(log.performed_at) || "—"}
                                                                </div>
                                                                <div className="text-[10.5px] text-slate-400 font-medium whitespace-nowrap">
                                                                    {formatDate(log.performed_at)}
                                                                </div>
                                                            </div>

                                                            {/* Timeline Trace Node */}
                                                            <div className="pt-1.5 shrink-0 hidden sm:block">
                                                                <span className="block w-2 h-2 rounded-full bg-slate-300 group-hover:bg-blue-600 transition-colors ring-2 ring-white" />
                                                            </div>
                                                        </div>

                                                        {/* 2. Center: Event Core (Clean Action Badge, Reference Code, and Description) */}
                                                        <div className="min-w-0 flex-1 space-y-1.5">
                                                            {/* Line 1: Action Badge & Target Application Reference */}
                                                            <div className="flex items-center gap-2.5 flex-wrap">
                                                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                                                    {formatActionLabel(log.action)}
                                                                </span>

                                                                {log.reference_number && (
                                                                    <Link
                                                                        href={`/applications?search=${log.reference_number}`}
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="font-mono text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                                                                        title="Inspect Application"
                                                                    >
                                                                        {log.reference_number}
                                                                    </Link>
                                                                )}
                                                            </div>

                                                            {/* Line 2: Audit Description / Note */}
                                                            {log.note ? (
                                                                <p className="text-xs text-slate-600 leading-relaxed font-sans max-w-2xl">
                                                                    {log.note}
                                                                </p>
                                                            ) : (
                                                                <p className="text-xs text-slate-400 italic font-sans">
                                                                    Routine compliance event recorded with no additional remarks.
                                                                </p>
                                                            )}
                                                        </div>

                                                        {/* 3. Right: Actor / Performer & Applicant Details (Balanced Layout) */}
                                                        <div className="shrink-0 flex items-center gap-3.5 text-right pt-0.5">
                                                            <div className="hidden md:block text-right">
                                                                <div className="text-xs font-semibold text-slate-800">
                                                                    {log.performed_by_name || "System"}
                                                                </div>
                                                                <div className="text-[11px] text-slate-400 font-medium truncate max-w-[180px]">
                                                                    {log.applicant_name ? log.applicant_name : "System Process"}
                                                                </div>
                                                            </div>

                                                            {/* Performer Avatar Initials Circle */}
                                                            <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-semibold text-[11px] shrink-0 group-hover:border-slate-300 transition-colors">
                                                                {getInitials(log.performed_by_name || "System")}
                                                            </div>

                                                            {/* Expand Chevron Icon */}
                                                            <button
                                                                type="button"
                                                                className="p-1 text-slate-400 group-hover:text-slate-700 transition-colors cursor-pointer"
                                                                title={isExpanded ? "Collapse record" : "Expand record"}
                                                            >
                                                                <svg
                                                                    className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-180 text-blue-600" : ""}`}
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2"
                                                                >
                                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>

                                                    {/* Expanded Audit Payload Drawer */}
                                                    {isExpanded && (
                                                        <div className="px-5 sm:px-8 pb-4 pt-1 bg-slate-50/90 border-t border-slate-100 text-xs">
                                                            <div className="p-3.5 rounded-lg bg-white border border-slate-200/90 shadow-2xs space-y-2.5 font-mono">
                                                                <div className="flex items-center justify-between pb-2 border-b border-slate-100 text-[11px] text-slate-400">
                                                                    <span className="font-semibold text-slate-700 uppercase tracking-wider">Audit Record Payload</span>
                                                                    <span>RECORD_ID: EVT-{String(log.id).padStart(5, "0")}</span>
                                                                </div>
                                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-[11px]">
                                                                    <div>
                                                                        <span className="text-slate-400">Exact Timestamp: </span>
                                                                        <span className="text-slate-800 font-medium">{log.performed_at || "—"}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-slate-400">Action Type: </span>
                                                                        <span className="text-slate-800 font-medium">{log.action}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-slate-400">Performed By: </span>
                                                                        <span className="text-slate-800 font-medium">{log.performed_by_name || "System"}</span>
                                                                    </div>
                                                                    <div>
                                                                        <span className="text-slate-400">Target Reference: </span>
                                                                        {log.reference_number ? (
                                                                            <Link
                                                                                href={`/applications?search=${log.reference_number}`}
                                                                                className="text-blue-600 hover:underline font-semibold"
                                                                            >
                                                                                {log.reference_number}
                                                                            </Link>
                                                                        ) : (
                                                                            <span className="text-slate-500">None</span>
                                                                        )}
                                                                    </div>
                                                                    {log.applicant_name && (
                                                                        <div className="sm:col-span-2">
                                                                            <span className="text-slate-400">Applicant: </span>
                                                                            <span className="text-slate-800 font-medium">{log.applicant_name}</span>
                                                                        </div>
                                                                    )}
                                                                    <div className="sm:col-span-2">
                                                                        <span className="text-slate-400">Audit Description: </span>
                                                                        <span className="text-slate-800 font-sans text-xs">{log.note || "No details provided"}</span>
                                                                    </div>
                                                                </div>
                                                                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400">
                                                                    <span className="inline-flex items-center gap-1.5">
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                                                        Immutable Compliance Audit Record
                                                                    </span>
                                                                    {log.reference_number && (
                                                                        <Link
                                                                            href={`/applications?search=${log.reference_number}`}
                                                                            className="text-blue-600 hover:text-blue-700 font-semibold font-sans hover:underline inline-flex items-center gap-1"
                                                                        >
                                                                            Open Application →
                                                                        </Link>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* ── PAGINATION CONTROLS (MATCHING USER MANAGEMENT) ── */}
                            {logs?.last_page > 1 && (
                                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200/80 pb-4 shrink-0">
                                    <p className="text-xs text-slate-500">
                                        Showing <span className="font-semibold text-slate-800">{logs.from || 1}</span> to{" "}
                                        <span className="font-semibold text-slate-800">{logs.to || logs.data.length}</span> of{" "}
                                        <span className="font-semibold text-slate-800">{logs.total}</span> events
                                    </p>

                                    <div className="flex items-center gap-1">
                                        {logs.links.map((link, i) => (
                                            <button
                                                key={i}
                                                disabled={!link.url || link.active}
                                                onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                                                    link.active
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
        </>
    );
}