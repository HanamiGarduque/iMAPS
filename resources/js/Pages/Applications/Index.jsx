import React, { useState, useEffect, useRef } from "react";
import { Head, router, usePage } from "@inertiajs/react";
import Header from "@/Components/Header";
import Sidebar from "@/Components/Sidebar";
// import AppLayout from '@/Layouts/AppLayout'

// ── Status badge config ──
const STATUS_CONFIG = {
    Received: { bg: "#f0fdf4", color: "#16a34a" },
    "Technical Review": { bg: "#fffbeb", color: "#d97706" },
    "Under Sangguniang Bayan": { bg: "#f5f3ff", color: "#7c3aed" },
    "For Release": { bg: "#eff6ff", color: "#2563eb" },
    Released: { bg: "#eef4ff", color: "#1a45ee" },
    Denied: { bg: "#fef2f2", color: "#dc2626" },
};

const STATUSES = ["Received", "Technical Review", "Under Sangguniang Bayan", "For Release", "Released", "Denied"];
const APP_TYPES = ["Locational Clearance", "Zoning Certification", "Development Permit", "Special Land Use Permit"];

function StatusBadge({ status }) {
    const cfg = STATUS_CONFIG[status] || { bg: "#f8fafc", color: "#64748b" };
    return (
        <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[6px] text-[10px] font-bold uppercase tracking-wider"
            style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.color}30` }}
        >
            <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: cfg.color }} />
            {status}
        </span>
    );
}

// ── Main Page ──
export default function Index({ applications, filters, auth }) {
    const [clock, setClock] = useState("");
    const [search, setSearch] = useState(filters.search || "");
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const userName = auth?.user?.name || "Julience";
    const userRole = auth?.user?.role || "Planning Officer";

    useEffect(() => {
        const tick = () => {
            const now = new Date();
            setClock(now.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) + " · " + now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" }));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => {
            if (search !== filters.search) {
                router.get("/applications", { ...filters, search, page: 1 }, { preserveState: true, replace: true });
            }
        }, 400);
        return () => clearTimeout(t);
    }, [search, filters]);

    const applyFilter = (newFilters) => router.get("/applications", { ...filters, ...newFilters, page: 1 }, { preserveState: true, replace: true });
    const clearFilters = () => {
        setSearch("");
        router.get("/applications", {}, { preserveState: true, replace: true });
    };

    const formatDate = (d) => (d ? new Date(d).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");
    const formatFee = (fee) => "₱" + parseFloat(fee || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 });
    const hasFilters = filters.search || filters.status || filters.application_type;

    const handleLogout = () => {
        if (confirm("Sign out from iMAPS?")) router.post("/logout");
    };

    return (
        <>
            <Head title="Applications | iMAPS" />
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800;900&family=DM+Mono:wght@400;500;700&display=swap');
                #dashboard-root, #dashboard-root :not(.font-mono) { font-family: 'Poppins', sans-serif !important; }
                #dashboard-root .font-mono, #dashboard-root .font-mono * { font-family: 'DM Mono', monospace !important; }
                
                ::-webkit-scrollbar { width: 6px; height: 6px; }
                ::-webkit-scrollbar-track { background: transparent; }
                ::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
                
                .form-enter { animation: formFadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
                @keyframes formFadeIn { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: translateY(0); } }
            `}</style>

            <div id="dashboard-root" className="bg-slate-50 font-sans text-slate-800 h-screen flex flex-col overflow-hidden">
                {/* ── NAVBAR ── */}
                <Header userName={userName} userRole={userRole} clock={clock} onLogout={handleLogout} />

                <div className="flex flex-1 h-full overflow-hidden relative">
                    {/* ── SIDEBAR ── */}
                    <Sidebar userName={userName} userRole={userRole} sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen} onLogout={handleLogout} activePage="applications" />

                    {/* ── WORKSPACE ── */}
                    <main className="flex-1 w-full h-full flex flex-col transition-all duration-500 ease-in-out bg-[#f8fafc]" style={{ paddingLeft: sidebarOpen ? "200px" : "0px" }}>
                        <div className="p-4 md:p-6 flex-1 flex flex-col h-full overflow-hidden max-w-[1400px] mx-auto w-full">
                            {/* Header Area */}
                            <div className="mb-4 flex-shrink-0 flex items-center justify-between gap-4 form-enter">
                                <div>
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">
                                        <span className="text-slate-800">Masterlist</span>
                                        <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                        </svg>
                                        <span className="text-slate-500">Registry</span>
                                    </div>
                                    <h2 className="text-2xl font-black text-slate-800 tracking-tight leading-none">Applications</h2>
                                </div>

                                {userRole === "Planning Officer" && (
                                    <a
                                        href="/applications/encode"
                                        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[10px] bg-slate-900 hover:bg-slate-800 text-white text-[12px] font-bold shadow-sm transition-all active:scale-95"
                                    >
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                                        </svg>
                                        Encode New Application
                                    </a>
                                )}
                            </div>

                            {/* Filters & Search */}
                            <div className="bg-white p-3.5 rounded-2xl border border-slate-200/80 shadow-[0_2px_10px_rgb(0,0,0,0.02)] mb-4 flex-shrink-0 form-enter flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
                                <div className="flex items-center gap-3 flex-wrap">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 bg-slate-50 px-2 py-1 rounded">Status</span>
                                        {["", ...STATUSES].map((s) => (
                                            <button
                                                key={s || "all"}
                                                onClick={() => applyFilter({ status: s, application_type: filters.application_type })}
                                                className={`text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border ${
                                                    (filters.status || "") === s
                                                        ? "bg-blue-50 border-blue-200 text-blue-700 shadow-sm"
                                                        : "bg-white border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                                                }`}
                                            >
                                                {s || "All"}
                                            </button>
                                        ))}
                                    </div>
                                    <div className="h-6 w-px bg-slate-200 hidden xl:block" />
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={filters.application_type || ""}
                                            onChange={(e) => applyFilter({ application_type: e.target.value, status: filters.status })}
                                            className="text-[11px] font-bold px-3 py-1.5 rounded-[8px] transition-all border border-slate-200 text-slate-600 bg-white hover:border-slate-300 outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 cursor-pointer appearance-none pr-8 relative"
                                        >
                                            <option value="">All App Types</option>
                                            {APP_TYPES.map((t) => (
                                                <option key={t} value={t}>
                                                    {t}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    {hasFilters && (
                                        <button onClick={clearFilters} className="text-[10px] font-bold uppercase tracking-widest text-red-500 hover:text-red-700 flex items-center gap-1 ml-2">
                                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                            </svg>{" "}
                                            Reset
                                        </button>
                                    )}
                                </div>

                                <div className="relative w-full lg:w-[280px]">
                                    <svg
                                        className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                    >
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <input
                                        type="text"
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        placeholder="Search tracking no, applicant..."
                                        className="w-full rounded-[10px] border border-slate-200 bg-slate-50 pl-9 pr-3 py-2 text-[12px] font-medium text-slate-800 transition-all focus:bg-white focus:outline-none focus:border-blue-500 focus:ring-[2px] focus:ring-blue-500/10 hover:border-slate-300"
                                    />
                                </div>
                            </div>

                            {/* Data Table Card */}
                            <div className="flex-1 bg-white rounded-2xl shadow-[0_2px_20px_rgb(0,0,0,0.04)] border border-slate-200/80 overflow-hidden flex flex-col form-enter min-h-0">
                                {applications.data.length === 0 ? (
                                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                                        <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center border border-slate-200 mb-4 shadow-sm">
                                            <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                                                />
                                            </svg>
                                        </div>
                                        <h3 className="text-lg font-black text-slate-800 tracking-tight">No Records Found</h3>
                                        <p className="text-[12px] font-medium text-slate-500 mt-1 max-w-sm">
                                            {hasFilters
                                                ? "We couldn't find any applications matching your current filter criteria."
                                                : "Your application registry is currently empty. Encode a new application to get started."}
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex-1 overflow-auto">
                                        <table className="w-full text-left border-collapse whitespace-nowrap">
                                            <thead className="sticky top-0 bg-slate-50/95 backdrop-blur-sm z-10 shadow-[0_1px_0_rgb(226,232,240)]">
                                                <tr>
                                                    {/* REMOVED the empty '' at the end of this array */}
                                                    {["Reference", "Applicant / Entity", "Application Type", "Location", "Date Filed", "Assessment", "Status"].map((h, i) => (
                                                        <th key={i} className="px-5 py-3.5 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                                            {h}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {applications.data.map((app) => {
                                                    return (
                                                        <tr key={app.id} onClick={() => router.get(`/applications/${app.id}`)} className="hover:bg-slate-50/60 transition-colors group cursor-pointer">
                                                            <td className="px-5 py-4">
                                                                <span className="font-mono text-[11px] font-black text-slate-600 bg-slate-100 px-2 py-1 rounded tracking-tight">
                                                                    {app.reference_number}
                                                                </span>
                                                            </td>
                                                            <td className="px-5 py-4">
                                                                <p className="text-[13px] font-bold text-slate-800 leading-tight">{app.applicant_name}</p>
                                                                {app.representative_name && <p className="text-[10px] font-medium text-slate-400 mt-0.5">via {app.representative_name}</p>}
                                                            </td>
                                                            <td className="px-5 py-4">
                                                                <p className="text-[12px] font-bold text-slate-700">{app.application_type}</p>
                                                                <p className="text-[10px] font-medium text-slate-400 mt-0.5">{app.land_use_class}</p>
                                                            </td>
                                                            <td className="px-5 py-4 text-[12px] font-medium text-slate-600">Brgy. {app.barangay}</td>
                                                            <td className="px-5 py-4 text-[11px] font-medium text-slate-500">{formatDate(app.created_at)}</td>
                                                            <td className="px-5 py-4 font-mono text-[12px] font-bold text-slate-700">{formatFee(app.assessment_fee)}</td>
                                                            <td className="px-5 py-4">
                                                                <StatusBadge status={app.status} />
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                )}

                                {/* Pagination Footer */}
                                {applications.last_page > 1 && (
                                    <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
                                        <p className="text-[11px] font-medium text-slate-500">
                                            Showing <span className="font-bold text-slate-700">{applications.from}</span> to <span className="font-bold text-slate-700">{applications.to}</span> of{" "}
                                            <span className="font-bold text-slate-700">{applications.total}</span> records
                                        </p>
                                        <div className="flex items-center gap-1.5">
                                            {applications.links.map((link, i) => (
                                                <button
                                                    key={i}
                                                    disabled={!link.url}
                                                    onClick={() => link.url && router.get(link.url, {}, { preserveState: true })}
                                                    className={`inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-[8px] text-[11px] font-bold transition-all border
                            ${link.active ? "bg-blue-600 border-blue-600 text-white shadow-sm" : ""}
                            ${!link.url ? "opacity-40 cursor-not-allowed border-slate-200 bg-white text-slate-400" : ""}
                            ${link.url && !link.active ? "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-100" : ""}
                        `}
                                                    dangerouslySetInnerHTML={{ __html: link.label }}
                                                />
                                            ))}
                                        </div>
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
